import { ObjectId } from 'mongodb';
import * as Constants from '../../../../config/global_constant.mjs';
import Tables from '../../../../config/database_tables.mjs';
import { sanitizeData, getUtcDate, generateMD5Hash, appendFileExistData, getRandomOTP, currentTimeStamp, newDate, parseValidation, isMobileApi, applyValidationInterCallFunction } from '../../../../utils/index.mjs';
import { sendSMS, sendMail } from '../../../../services/index.mjs';
import { loginValidation, forgotPasswordValidation, resetPasswordValidation } from '../validations/registrationValidations.mjs';

class Registration {
    constructor(db) {
        this.db = db;
        this.usersCollection = db.collection(Tables.USERS);
        this.restaurantsCollection = db.collection(Tables.RESTAURANTS);
        this.userLoginsCollection = db.collection(Tables.USER_LOGINS);
    }

    /**
     * Function to get user data
     *
     * @param req As Request Data
     * @param res As Response Data
     * @param options As object of data
     *
     * @return json
     **/
    async getUserData(req, res, next, options) {
        try {
            let conditions = (options.conditions) ? options.conditions : {};
            let fields = (options.fields) ? options.fields : {};

            if (!conditions) {
                /** Send error response **/
                return {
                    status: Constants.STATUS_ERROR,
                    message: res.__("system.something_going_wrong_please_try_again")
                };
            }

            /** Get user details **/
            const result = await this.usersCollection.findOne(conditions, { projection: fields });

            /** Send success response **/
            if (!result) return { status: Constants.STATUS_SUCCESS, result: false };

            /** If user role id customer**/
            if (result.user_role_id == Constants.CUSTOMER && !result.package_status) {
                result.package_status = Constants.PACKAGE_NOT_PURCHASED;
            }

            /** Send success response **/
            if (!result.profile_image) return { status: Constants.STATUS_SUCCESS, result: result };

            /** Append image with full path **/
            const fileResponse = await appendFileExistData({
                "file_url": Constants.USERS_URL,
                "file_path": Constants.USERS_FILE_PATH,
                "result": [result],
                "database_field": "profile_image"
            });

            /** Send success response **/
            return {
                status: Constants.STATUS_SUCCESS,
                result: fileResponse?.result?.[0] || {},
            };
        } catch (error) {
            next(error);
        }
    } // end getUserData()

    /**
     * Function for login user
     *
     * @param req As Request Data
     * @param res As Response Data
     * @param next As Callback argument to the middleware function
     *
     * @return json
     **/
    async login(req, res, next) {
        try {
            /** Sanitize Data **/
            req.body = sanitizeData(req.body, Constants.NOT_ALLOWED_TAGS_XSS);

            /** Apply validation */
            let validationResponse = await applyValidationInterCallFunction(req, res, next, loginValidation);
            if(validationResponse.status != Constants.STATUS_SUCCESS) return validationResponse;

            let userName = (req.body.user_name) ? req.body.user_name : "";
            let password = (req.body.password) ? req.body.password : "";
            let passwordHash = generateMD5Hash(password);

            /** Set conditions **/
            let conditions = {
                user_type: Constants.USER_TYPE_RESTAURANT,
                is_deleted: Constants.NOT_DELETED,
                password: passwordHash,
                "$or": [
                    { "email": { $regex: '^' + userName + '$', $options: 'i' } }, //check user name with case insensitive
                    { 'mobile_number': userName }
                ],
            };

            /** Set options data for get user details **/
            let userOptions = {
                conditions: conditions,
                fields: { mobile_otp: 0, email_otp: 0, is_deleted: 0, created: 0, device_details: 0, modified: 0 }
            };

            /** Get user details **/
            let userResponse = await this.getUserData(req, res, next, userOptions);

            /** Send error/success response **/
            if (userResponse?.status != Constants.STATUS_SUCCESS || !userResponse.result) {
                return {
                    status: Constants.STATUS_ERROR,
                    message: [{ "param": "password", "msg": res.__("user.email_password_entered_incorrect") }]
                };
            }

            let resultData = userResponse?.result || {};

            /** Response if user deactivated by admin*/
            if (resultData.active != Constants.ACTIVE) {
                return {
                    status: Constants.STATUS_ERROR,
                    message: res.__("user.account_temporarily_disabled")
                };
            }

            if (resultData.is_verified == Constants.VERIFIED) {
                /**remove password from login */
                delete resultData.password;

                if(resultData?.restaurant_id){
                    /** Get restaurants details **/
                    const restaurantResult = await this.restaurantsCollection.findOne({
                        _id: new ObjectId(resultData.restaurant_id),
                        is_deleted: Constants.NOT_DELETED,
                    }, { projection: { slug: 1 } });
                    
                    resultData.restaurant_slug = restaurantResult?.slug || "";                    
                }

                /** Save user login Logs **/
                this.saveLoginLogs(req, res, resultData).then(() => { });

                /** Send success response **/
                return {
                    status: Constants.STATUS_SUCCESS,
                    result: resultData,
                    image_path: Constants.USERS_URL
                };
            } else {
                /** Get otp number **/
                let mobileOTP   = await getRandomOTP();
                let emailOTP    = await getRandomOTP();
                let mobileNumber= resultData?.mobile_number || "";
                let countryCode = resultData?.country_code || Constants.DEFAULT_COUNTRY_CODE;

                mobileNumber = countryCode + mobileNumber;
                let timeStamp = currentTimeStamp();
                let validateString = generateMD5Hash(timeStamp + mobileNumber);

                /** Update otp in users **/
                await this.usersCollection.updateOne({
                    _id: new ObjectId(resultData._id)
                }, {
                    $set: {
                        email_otp: emailOTP,
                        mobile_otp: mobileOTP,
                        validate_string: validateString,
                        modified: getUtcDate(),
                    }
                });

                /**************** Send otp for verify *******************/
                let msgBody = (res.locals.settings['SMS.resend_otp']) ? res.locals.settings['SMS.resend_otp'] : '';
                msgBody = msgBody.replace(RegExp('{OTP}', 'g'), mobileOTP);

                /**Send sms **/
                sendSMS(req, res, {
                    mobile_number: mobileNumber,
                    user_id: resultData._id,
                    sms_template: msgBody
                }).then(() => { });

                /**Send email */
                let email    = resultData?.email || "";
                let fullName = resultData?.full_name || "";
                if (email) {
                    sendMail(req, res, {
                        to: email,
                        action: "send_otp",
                        rep_array: [fullName, emailOTP]
                    });
                }
                /**************** Send otp for verify *******************/

                /** Send success response **/
                let returnResponse = {
                    status: Constants.STATUS_SUCCESS,
                    message: res.__('user.user_not_verified_login_mesage', mobileNumber)
                };

                if (isMobileApi(req, res)) {
                    returnResponse.result = {
                        is_verified: Constants.NOT_VERIFIED,
                        user_id: resultData._id,
                        mobile_otp: mobileOTP,
                        email_otp: emailOTP,
                    };
                } else {
                    returnResponse.validate_string = validateString;
                    returnResponse.is_verified = Constants.NOT_VERIFIED;
                }

                /** Response if user not verified*/
                return returnResponse;
            }
        } catch (error) {
            next(error);
        }
    } //End login()

    /**
     * Function to save user login activity
     *
     * @param req As Request Data
     * @param res As Response Data
     * @param options As object of data
     *
     * @return json
     **/
    async saveLoginLogs(req, res, options) {
        try {
            let userId = (options._id) ? options._id : "";
            let deviceType = (req.body.device_type) ? req.body.device_type : "";
            let deviceToken = (req.body.device_token) ? req.body.device_token : "";

            /** Send error response **/
            if (!userId) {
                return {
                    status: Constants.STATUS_ERROR,
                    options: options,
                    message: res.__("system.something_going_wrong_please_try_again")
                };
            }

            // Execute operations in parallel using Promise.all
            await Promise.all([
                // Update user device details
                (async () => {
                    /** Manage update data **/
                    let userUpdatedData = {
                        $set: {
                            last_login: getUtcDate(),
                            modified: getUtcDate(),
                        }
                    };

                    if (deviceType && deviceToken) {
                        userUpdatedData["$set"]["device_details"] = [{
                            device_type: deviceType.toLowerCase(),
                            device_token: deviceToken,
                        }];
                    }

                    /** Save user device details **/
                    await this.usersCollection.updateOne({ _id: new ObjectId(userId) }, userUpdatedData);
                })(),

                // Save user login details
                (async () => {
                    /** Save user login details **/
                    await this.userLoginsCollection.insertOne({
                        user_id: new ObjectId(userId),
                        device_type: deviceType,
                        device_token: deviceToken,
                        date: getUtcDate(newDate("", Constants.DATABASE_DATE_FORMAT + " " + Constants.START_DATE_TIME_FORMAT)),
                        logout_time: "",
                        created: getUtcDate(),
                    });
                })()
            ]);

            /** Send success response **/
            return { status: Constants.STATUS_SUCCESS, options: options };
        } catch (error) {
            /** Send error response **/
            return {
                status: Constants.STATUS_ERROR,
                options: options,
                message: res.__("system.something_going_wrong_please_try_again")
            };
        }
    } // End saveLoginLogs()

    /**
     * Function to logout
     *
     * @param req As Request Data
     * @param res As Response Data
     * @param next As Callback argument to the middleware function
     *
     * @return json
     **/
    async logOut(req, res, next) {
        try {
            /** Sanitize Data **/
            req.body = sanitizeData(req.body, Constants.NOT_ALLOWED_TAGS_XSS);
            let userId = (req.body.user_id) ? req.body.user_id : "";
            let deviceType = (req.body.device_type) ? req.body.device_type : "";
            let deviceToken = (req.body.device_token) ? req.body.device_token : "";

            /** Send error response **/
            if (!userId) {
                return { status: Constants.STATUS_ERROR, message: res.__("system.missing_parameters") };
            }

            // Execute operations in parallel using Promise.all
            await Promise.all([
                // Update device details
                (async () => {
                    if (!(deviceType && deviceToken)) return;

                    /** Update user details **/
                    await this.usersCollection.updateOne({
                        _id: new ObjectId(userId),
                        "device_details.device_type": deviceType,
                        "device_details.device_token": deviceToken,
                    }, {
                        $pull: {
                            device_details: {
                                device_type: deviceType,
                                device_token: deviceToken
                            }
                        },
                        $set: {
                            is_online: Constants.OFFLINE,
                            is_available: Constants.NOT_AVAILABLE,
                            modified: getUtcDate()
                        }
                    });
                })(),

                // Update logout time
                (async () => {
                    /** Save user login details **/
                    await this.userLoginsCollection.updateOne({
                        user_id: new ObjectId(userId),
                        device_type: deviceType,
                        device_token: deviceToken,
                    }, {
                        $set: {
                            logout_time: getUtcDate()
                        }
                    });
                })()
            ]);

            /** Send success response **/
            return {
                status: Constants.STATUS_SUCCESS,
                message: res.__("user.you_have_logged_out_successfully")
            };
        } catch (error) {
            return {
                status: Constants.STATUS_ERROR,
                message: error
            };
        }
    } //End logOut()

    /**
     * Function for recover forgot password
     *
     * @param req As Request Data
     * @param res As Response Data
     * @param next As Callback argument to the middleware function
     *
     * @return render/json
     **/
    async forgotPassword(req, res, next) {
        try {
            /** Sanitize Data **/
            req.body = sanitizeData(req.body, Constants.NOT_ALLOWED_TAGS_XSS);
            let selectedType = (req.body.email_phone) ? req.body.email_phone : "";

            /** Apply validation */
            let validationResponse = await applyValidationInterCallFunction(req, res, next, forgotPasswordValidation);
            if(validationResponse.status != Constants.STATUS_SUCCESS) return validationResponse;

            let mobileNumber = (req.body.mobile_number) ? req.body.mobile_number : "";
            let userEmail = (req.body.email) ? req.body.email : "";
            let isMobile = (selectedType == Constants.MOBILE_NUMBER) ? true : false;

            /** Set options for get user details **/
            let options = {
                conditions: {
                    user_type: Constants.USER_TYPE_RESTAURANT,
                    is_deleted: Constants.NOT_DELETED
                },
                fields: {
                    _id: 1, full_name: 1, mobile_number: 1, country_code: 1, is_verified: 1, active: 1, email: 1
                }
            };

            /**Condition  for mobile or email*/
            if (isMobile) {
                options.conditions.mobile_number = mobileNumber;
            } else {
                options.conditions.email = { $regex: '^' + userEmail + '$', $options: 'i' };
            }

            /** Get user details **/
            let response = await this.getUserData(req, res, next, options);
            
            /** Send error response **/
            let inputParam = (isMobile) ? "mobile_number" : "email";
            if (response.status != Constants.STATUS_SUCCESS || !response.result) {
                return { status: Constants.STATUS_ERROR, message: [{ param: inputParam, msg: res.__("user.email_not_registered") }] };
            }

            let result = response.result;
            let activeStatus = (result.active) ? result.active : "";
            let verifiedStatus = (result.is_verified) ? result.is_verified : "";
            let countryCode = (result.country_code) ? result.country_code : Constants.DEFAULT_COUNTRY_CODE;
            let email = (result.email) ? result.email : "";
            let fullName = (result.full_name) ? result.full_name : "";

            if (isMobile) mobileNumber = countryCode + mobileNumber;
            let timeStamp = currentTimeStamp();
            let forgotValidateString = generateMD5Hash(timeStamp + mobileNumber);

            /** Send error response **/
            if (activeStatus != Constants.ACTIVE) {
                return { status: Constants.STATUS_ERROR, message: [{ param: inputParam, msg: res.__("user.account_temporarily_disabled") }] };
            }

            /** Send error response **/
            if (verifiedStatus != Constants.VERIFIED) {
                return { status: Constants.STATUS_ERROR, message: [{ param: inputParam, msg: res.__("user.account_is_not_verified") }] };
            }

            /** Get Otp **/
            let mobileOTP = await getRandomOTP();
            let dataToBeSaved = {
                modified: getUtcDate(),
                forgot_validate_string: forgotValidateString,
            };
            if(isMobile) dataTaBeSavedSaved.mobile_otp = mobileOTP;
            else dataToBeSaved.email_otp = mobileOTP;


            /** Update otp number **/
            await this.usersCollection.updateOne({ _id: new ObjectId(result._id) }, { $set: dataToBeSaved });

            if (isMobile) {
                /*********** Send sms for forgot password ***************/
                let msgBody = (res.locals.settings['SMS.forgot_password']) ? res.locals.settings['SMS.forgot_password'] : "";
                msgBody = msgBody.replace(RegExp('{OTP}', 'g'), mobileOTP);

                /** Send sms **/
                sendSMS(req, res, {
                    mobile_number: mobileNumber,
                    user_id: result._id,
                    sms_template: msgBody
                }).then(() => { });
                /*********** Send sms for forgot password ***************/
            } else if (email) {
                /*********** Send email for forgot password ***************/
                sendMail(req, res, {
                    to: email,
                    action: "forgot_password",
                    rep_array: [fullName, mobileOTP]
                });
                /*********** Send email for forgot password ***************/
            }

            /** Send success response **/
            let falshVariabale = (isMobile) ? mobileNumber : email;
            let returnResponse = {
                status: Constants.STATUS_SUCCESS,
                otp_type: (isMobile) ? "mobile_otp" : "email_otp",
                message: res.__("user.otp_sent_successfully_on_mobile", falshVariabale)
            };

            if (isMobileApi(req, res)) {
                returnResponse.mobile_otp = mobileOTP;
                returnResponse.user_id = result._id;
            } else {
                returnResponse.forgot_validate_string = forgotValidateString;
            }
            /** Send success response **/
            return returnResponse;
        } catch (error) {
            next(error);
        }
    } // end forgotPassword()

    /**
     * Function for reset password
     *
     * @param req As Request Data
     * @param res As Response Data
     * @param next As Callback argument to the middleware function
     *
     * @return json
     **/
    async resetPassword(req, res, next) {
        try {
            /** Sanitize Data **/
            req.body = sanitizeData(req.body, Constants.NOT_ALLOWED_TAGS_XSS);
            let userId = (req.body.user_id) ? req.body.user_id : "";
            let validateString = (req.body.forgot_validate_string) ? req.body.forgot_validate_string : "";

            /** Send error response */
            if (!userId && !validateString) {
                return { status: Constants.STATUS_ERROR, message: res.__("system.missing_parameters") };
            }

            /** Apply validation */
            let validationResponse = await applyValidationInterCallFunction(req, res, next, resetPasswordValidation);
            if(validationResponse.status != Constants.STATUS_SUCCESS) return validationResponse;

            /** Set user consitions **/
            let conditions = { ...Constants.FRONT_USER_COMMON_CONDITIONS };

            if (validateString) {
                conditions.forgot_validate_string = validateString;
            } else {
                conditions._id = new ObjectId(userId);
            }

            /** Set options for get user details **/
            let options = {
                conditions: conditions,
                fields: { _id: 1 }
            };

            /** Get user details **/
            const response = await this.getUserData(req, res, next, options);
            if (response.status != Constants.STATUS_SUCCESS || !response.result) {
                return {
                    status: Constants.STATUS_ERROR,
                    message: res.__("system.something_going_wrong_please_try_again"),
                };
            }

            let result = response.result;
            let resultId = (result._id) ? result._id : "";
            let password = (req.body.password) ? req.body.password : "";
            let newPassword = generateMD5Hash(password);

            /** Update user password **/
            await this.usersCollection.updateOne({
                _id: new ObjectId(resultId)
            }, {
                $set: {
                    password: newPassword,
                    modified: getUtcDate()
                },
                $unset: {
                    mobile_otp: 1,
                    email_otp: 1,
                    forgot_validate_string: 1
                }
            });

            /** Send success response **/
            return {
                status: Constants.STATUS_SUCCESS,
                message: res.__("user.your_password_has_been_reset_successfully"),
            };
        } catch (error) {
            next(error);
        }
    } //End resetPassword()

    /**
     * Function for resend otp
     *
     * @param req As Request Data
     * @param res As Response Data
     * @param next As Callback argument to the middleware function
     *
     * @return json
     **/
    async resendOtp(req, res, next) {
        try {
            /** Sanitize Data **/
            req.body = sanitizeData(req.body, Constants.NOT_ALLOWED_TAGS_XSS);
            let userId = (req.body.user_id) ? req.body.user_id : "";
            let page = (req.body.page) ? req.body.page : "";
            let otpType = (req.body.type) ? req.body.type : "";
            let validateString = (req.body.validate_string) ? req.body.validate_string : "";

            if (!otpType || (!userId && !validateString)) {
                return { status: Constants.STATUS_ERROR, message: res.__("system.missing_parameters") };
            }

            /** Set user conditions **/
            let userConditions = { ...Constants.FRONT_USER_COMMON_CONDITIONS };

            if (page == "forgot_password") {
                userConditions.forgot_validate_string = validateString;
            } else if (validateString) {
                userConditions.validate_string = validateString;
            } else {
                userConditions._id = new ObjectId(userId);
            }

            /** Set options for get user details **/
            let options = {
                conditions: userConditions,
                fields: { _id: 1, mobile_number: 1, country_code: 1, email: 1, full_name: 1 }
            };

            /** Get user details **/
            let response = await this.getUserData(req, res, next, options);
            if (response.status != Constants.STATUS_SUCCESS || !response.result) {
                return {
                    status: Constants.STATUS_ERROR,
                    message: res.__("system.something_going_wrong_please_try_again"),
                };
            }

            let result = response.result;
            let otp = await getRandomOTP();

            /** Update otp number **/
            let dataToBeUpdated = {
                modified: getUtcDate()
            };

            /** Save otp in users collection**/
            if (otpType == "mobile_otp") {
                dataToBeUpdated.mobile_otp = otp;
            } else {
                dataToBeUpdated.email_otp = otp;
            }

            await this.usersCollection.updateOne({ _id: new ObjectId(result._id) }, { $set: dataToBeUpdated });

            let mobileNumber = (result.mobile_number) ? result.mobile_number : "";
            let email = (result.email) ? result.email : "";

            /******************* Send OTP To User  **********************/
            if (otpType == "mobile_otp") {
                let countryCode = (result.country_code) ? result.country_code : Constants.DEFAULT_COUNTRY_CODE;
                mobileNumber = countryCode + mobileNumber;
                let msgBody = (res.locals.settings['SMS.resend_otp']) ? res.locals.settings['SMS.resend_otp'] : '';
                msgBody = msgBody.replace(RegExp('{OTP}', 'g'), otp);

                /**Send sms **/
                sendSMS(req, res, {
                    mobile_number: mobileNumber,
                    user_id: result._id,
                    sms_template: msgBody
                }).then(smsResponse => { });
            }

            if (otpType == "email_otp" && email) {
                /**Send Mail */
                let fullName = (result.full_name) ? result.full_name : "";
                sendMail(req, res, {
                    to: email,
                    action: "send_otp",
                    rep_array: [fullName, otp]
                });
            }
            /*************** Send OTP To User ***************/

            /** Send success response **/
            let otpSentTo = (otpType == "email_otp") ? email : mobileNumber;
            let returnResponse = {
                status: Constants.STATUS_SUCCESS,
                message: res.__("user.otp_sent_successfully_on_mobile", otpSentTo)
            };

            if (isMobileApi(req, res)) {
                returnResponse[otpType] = otp;
                returnResponse.user_id = result._id;
            }
            return returnResponse;
        } catch (error) {
            next(error);
        }
    } //End resendOtp()

    /**
     * Function for verify OTP
     *
     * @param req As Request Data
     * @param res As Response Data
     * @param next As Callback argument to the middleware function
     *
     * @return json
     **/
    async verifyOTP(req, res, next) {
        try {
            /** Sanitize Data **/
            req.body = sanitizeData(req.body, Constants.NOT_ALLOWED_TAGS_XSS);
            let userId = (req.body.user_id) ? req.body.user_id : "";
            let mobileOTP = (req.body.otp) ? req.body.otp : "";
            let otpType = (req.body.otp_type) ? req.body.otp_type : "";
            let page = (req.body.page) ? req.body.page : "";
            let validateString = (req.body.validate_string) ? req.body.validate_string : "";

            if (!userId && (!validateString || !page || page != "forgot_password" || !otpType)) {
                /** Send error response **/
                return { status: Constants.STATUS_ERROR, message: res.__("system.missing_parameters") };
            }

            /** Check validation */
            req.checkBody({
                "otp": {
                    notEmpty: true,
                    errorMessage: res.__("user.please_enter_otp"),
                }
            });

            /** parse Validation array  */
            let errors = parseValidation(req.validationErrors(), req);

            /** Send error response **/
            if (errors) return { status: Constants.STATUS_ERROR, message: errors };

            /** Set user conditions **/
            let userConditions = { ...Constants.FRONT_USER_COMMON_CONDITIONS };

            if (page == "forgot_password") {
                userConditions.forgot_validate_string = validateString;
            } else {
                userConditions._id = new ObjectId(userId);
            }

            /** Set requested data for get user details **/
            let userResuestedData = {
                conditions: userConditions,
                fields: { _id: 1, mobile_otp: 1, email_otp: 1 }
            };

            /** Get user details **/
            const userResponse = await this.getUserData(req, res, next, userResuestedData);
            if (userResponse.status != Constants.STATUS_SUCCESS) return next(userResponse.message);

            let resultData = (userResponse.result) ? userResponse.result : {};

            /** Send error response **/
            if (!resultData) {
                return { status: Constants.STATUS_ERROR, message: res.__("system.something_going_wrong_please_try_again") };
            }

            let dataBaseOTP = (otpType == "mobile_otp") ? resultData.mobile_otp : resultData.email_otp;

            /** Check entered otp is matched or not **/
            if (mobileOTP != dataBaseOTP) {
                return { status: Constants.STATUS_ERROR, message: [{ param: "otp", msg: res.__("user.incorrect_otp_message") }] };
            }

            /**Fields to remove from table */
            let fieldsToUnset = { mobile_otp: 1 };
            if (otpType == "email_otp") fieldsToUnset = { email_otp: 1 };

            /** Update user details **/
            let resultId = (resultData._id) ? resultData._id : "";
            await this.usersCollection.updateOne({
                _id: new ObjectId(resultId)
            }, {
                $set: {
                    modified: getUtcDate()
                },
                $unset: fieldsToUnset
            });

            let returnResponse = {
                status: Constants.STATUS_SUCCESS
            };

            if (!isMobileApi(req, res)) {
                returnResponse.forgot_validate_string = validateString;
            }
            /** Send success response **/
            return returnResponse;
        } catch (error) {
            next(error);
        }
    } //End verifyOTP()
}

export default Registration; 