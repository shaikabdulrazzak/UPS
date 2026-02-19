import { ObjectId } from 'mongodb';
import clone from 'clone';
import { parallel as asyncParallel, each as asyncEach} from 'async';
import * as Constants from "../../../../config/global_constant.mjs";
import Tables from '../../../../config/database_tables.mjs';
import { sanitizeData, getUtcDate, newDate, set24HourFormat, applyValidationInterCallFunction, generateMD5Hash, getRandomOTP, checkDriverNearByLocation,saveOrderStatusLogs, arrayToObject} from "../../../../utils/index.mjs";
import { sendMailToUsers, sendSMS, sendMail} from "../../../../services/index.mjs";
import { updateProfileValidation, changePasswordValidation, driverEditProfileValidation, customerEditProfileValidation, sendOtpToMobileValidation, updateMobileNumberValidation, sendOtpToEmailValidation, updateEmailAddressValidation } from '../validations/myAccountValidations.mjs';

import registrationModel from './registration.mjs';
import assignmentModel from './assignment.mjs';
import driverExcuseModel from './driver_excuse.mjs';
import driverBreaksModel from './driver_breaks.mjs';

export default class MyAccount {
    constructor(db) {
        this.db = db;
		
        this.registrationAPI = new registrationModel(db);
        this.assignmentAPI = new assignmentModel(db);
        this.driverExcuseAPI = new driverExcuseModel(db);
        this.driverBreaksAPI = new driverBreaksModel(db);
    }

	/**
	 * Function to update profile
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	 **/
	async updateProfile (req,res,next){
		try {
			/** Sanitize Data **/
			req.body   = sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
			let userId = req?.body?.user_id || "";

			/** Send error response **/
			if(!userId) return {status: Constants.STATUS_ERROR, message: res.__("system.missing_parameters")};

			/** Apply validation */
			let validationResponse = await applyValidationInterCallFunction(req, res, next, updateProfileValidation);
			if(validationResponse.status != Constants.STATUS_SUCCESS) return validationResponse;

			/** set data in object **/
			let dataToBeUpdated = {
				name : {
					ar : req?.body?.name_in_english || "",
					en : req?.body?.name_in_arabic || ""
				},
				restaurant_description 	: req?.body?.restaurant_description || "",
				restaurant_address     	: req?.body?.restaurant_address || "",
				mobile_number         	: req?.body?.mobile_number || "",
				contact_person_name		: req?.body?.contact_person_name || "",
				account_manager_name	: req?.body?.account_manager_name || "",
				email          			: req?.body?.email_address || "",
				modified 				: getUtcDate()
			};

			/** Update user details */
			const users = this.db.collection(Tables.USERS);
			await users.updateOne({_id : new ObjectId(userId)},{$set: dataToBeUpdated});

			/**Update name in session for web users */
			if(req?.session?.user) req.session.user.name = dataToBeUpdated.name;

			/** Send success response **/
			return {
				status	: Constants.STATUS_SUCCESS,
				message : res.__("user.profile_has_been_changed_successfully"),
			};
		} catch (error) {
			next(error);
		}	
	};// end updateProfile()

	/**
	 * Function to get dashbaord data
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	 **/
	async dashboard (req,res,next){
		try {
			/** Sanitize Data */
			req.body 	=	sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
			let userId	= req?.body?.user_id || "";

			/** Send error response **/
			if(!userId) return {status : Constants.STATUS_ERROR, message : res.__("system.missing_parameters")};

			/** Get user details **/
			let userResponse = await this.registrationAPI.getUserData(req,res,next,{
				conditions	: {
					_id			: new ObjectId(userId),
					user_type	: Constants.USER_TYPE_RESTAURANT,
					is_deleted	: Constants.NOT_DELETED,
					active		: Constants.ACTIVE
				},
				fields	: {mobile_otp:0,email_otp:0,is_deleted:0,created:0,device_details:0,modified:0,mobile_otp_expiry_time:0,email_otp_expiry_time:0,password:0}
			});
			
			/**Send response */
			let resultData	= userResponse?.result || "";
			if(userResponse.status != Constants.STATUS_SUCCESS || !resultData){
				return {status: Constants.STATUS_ERROR, message: res.__("system.invalid_access"),logout :true};
			}

			/**Send success response */
			return {status: Constants.STATUS_SUCCESS, result: resultData};			
		} catch (error) {
			return next(error);
		}
	}// end dashboard()

	/**
	 * Function to get user details
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	 **/
	async getUserDetails (req,res,next){
		try {
			/** Sanitize Data **/
			req.body 	= sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
			let userId	= req?.body?.user_id || "";

			/** Send error response **/
			if(!userId) return {status : Constants.STATUS_ERROR, message : res.__("system.missing_parameters")};

			/** Get user details **/
			let userResponse = await this.registrationAPI.getUserData(req,res,next,{
				conditions	:	{
					_id				: new ObjectId(userId),
					user_type		: Constants.USER_TYPE_RESTAURANT,
					is_deleted		: Constants.NOT_DELETED,
					active			: Constants.ACTIVE,
				},
				fields	: {_id :1,name:1,restaurant_address:1,email:1,mobile_number:1,contact_person_name:1,account_manager_name:1,restaurant_description:1},
			});

			/** Send error response **/
			if(userResponse.status != Constants.STATUS_SUCCESS || !userResponse?.result){
				return {status: Constants.STATUS_ERROR, message: res.__("system.invalid_access")};
			}

			/** Send success response **/
			return {
				status	: Constants.STATUS_SUCCESS,
				result	: userResponse?.result || {},
			};
		} catch (error) {
			next(error);
		}
	}// end getUserDetails()

	/**
	 * Function to update user password for restaurnt users/customers/drivers
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	 **/
	async changePassword (req, res,next){
		try {
			/** Sanitize Data **/
			req.body 		= sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
			let userId		= req?.body?.user_id || "";
			let userType	= req?.body?.user_type || "";
			let password	= req?.body?.password || "";
			let oldPassword	= req?.body?.old_password || "";

			/** Send error response **/
			if(!userId || !userType) return {status : Constants.STATUS_ERROR, message : res.__("system.missing_parameters")};

			/** Apply validation */
			let validationResponse = await applyValidationInterCallFunction(req, res, next, changePasswordValidation);
			if(validationResponse.status != Constants.STATUS_SUCCESS) return validationResponse;
	

			/** Set options for get user details **/
			let userConditions 	= 	{};
			if(userType == Constants.USER_TYPE_DRIVER){
				userConditions = clone(Constants.DRIVER_COMMON_CONDITIONS);
			}else if(userType == Constants.USER_TYPE_CUSTOMER){
				userConditions = clone(Constants.CUSTOMER_COMMON_CONDITIONS);
			}else{
				userConditions = clone(Constants.FRONT_USER_COMMON_CONDITIONS);
			}
			userConditions = {_id: new ObjectId(userId),...userConditions};

			/**get user data and create password hash */
			let userResponse= await this.registrationAPI.getUserData(req,res,next,{
				conditions:	userConditions,
				fields	  :	{_id :1,password:1, restaurant_id: 1, user_role_id: 1}
			});

			/** Send error response if user not found **/
			if(userResponse.status != Constants.STATUS_SUCCESS || !userResponse?.result) return {
				status: Constants.STATUS_ERROR, 
				message	: res.__("system.invalid_access")
			};

			let resultData	    =   userResponse?.result || {};
			let userPassword 	=	resultData?.password || "";
			let oldPasswordHash	=   generateMD5Hash(oldPassword);
			let newPasswordHash	=   generateMD5Hash(password);
			
			/**Compare password */
			if(oldPasswordHash != userPassword){
				return {
					status	:	Constants.STATUS_ERROR,
					message	:	[{'param':'old_password','msg':res.__("user.sorry_current_password_you_have_provided_is_wrong_take_a_bit_of_time_think_and_try_again")}],
				};
			}

			/**Update password in database */
			const users = this.db.collection(Tables.USERS);
			await users.updateOne({
				_id : new ObjectId(userId)
			},
			{$set: {
				password : newPasswordHash,
				modified : getUtcDate()
			}});

			/*************** Send notification to admin   ***************/
			if(resultData.restaurant_id && (userType != Constants.USER_TYPE_DRIVER && userType != Constants.USER_TYPE_CUSTOMER)){
				sendMailToUsers(req,res,{
					event_type 		: Constants.NOTIFICATION_FOR_RESTAURANT_UPDATED_PASSWORD,
					restaurant_id	: resultData?.restaurant_id || "",
					user_role_id    : resultData?.user_role_id || "",
					user_id         : resultData?._id || ""
				});
			}

			/** Send success response **/
			return {
				status	: Constants.STATUS_SUCCESS,
				message : res.__("user.success_your_password_has_been_changed_successfully"),
			};
		} catch (error) {
			next(error);
		}
	}//End changePassword()

	/**
	 * Function to update driver profile
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	 */
	async driverEditProfile (req,res,next){
		try {
			/** Sanitize Data */
			req.body 	=	sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
			let userId 	=	(req.body.user_id)	?	req.body.user_id	:"";

			/** Send error response **/
			if(!userId) return {status : Constants.STATUS_ERROR, message	: res.__("system.missing_parameters")};

			/** Apply validation */
			let validationResponse = await applyValidationInterCallFunction(req, res, next, driverEditProfileValidation);
			if(validationResponse.status != Constants.STATUS_SUCCESS) return validationResponse;

			let firstName			= 	req?.body?.first_name;
			let lastName			= 	req?.body?.last_name;
			let fullName			= 	firstName+' '+ lastName;

			/** Update user details **/
			const users = this.db.collection(Tables.USERS);
			await users.updateOne({
				_id : new ObjectId(userId)
			},
			{$set : {
				first_name 			: firstName,
				last_name 			: lastName,
				full_name			: fullName,
				modified 			: getUtcDate(),
			}});

			
			/** Get user details **/
			let userResponse = await this.registrationAPI.getUserData(req,res,next,{
				conditions	:	{
					_id				: new ObjectId(userId),
					is_deleted		: Constants.NOT_DELETED,
					active			: Constants.ACTIVE,
				},
				fields	: {otp:0,email_otp:0,is_deleted:0,created:0,device_details:0,modified:0,password:0},
			});

			/** Send error response if user not found **/
			if(userResponse.status != Constants.STATUS_SUCCESS || !userResponse?.result) return {
				status: Constants.STATUS_ERROR, 
				message	: res.__("system.invalid_access")
			};

			/** Send success response **/
			return {
				status	: Constants.STATUS_SUCCESS,
				result	: userResponse?.result,
				message	: res.__("user.profile_has_been_changed_successfully")
			};
		} catch (error) {
			next(error);
		}
	};//End driverEditProfile()

	/**
	 * Function to update customer profile
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	 */
	async customerEditProfile (req,res,next){
		try {
			/** Sanitize Data */
			req.body 	=	sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
			let userId	= 	(req.body.user_id) ?	req.body.user_id :"";

			/** Send error response **/
			if(!userId) return {status : Constants.STATUS_ERROR, message	: res.__("system.missing_parameters")};

			/** Apply validation */
			let validationResponse = await applyValidationInterCallFunction(req, res, next, customerEditProfileValidation);
			if(validationResponse.status != Constants.STATUS_SUCCESS) return validationResponse;

			let firstName = req?.body?.first_name || "";
			let lastName = 	req?.body?.last_name || "";
			let fullName = 	firstName+' '+ lastName;

			/** Update user details **/
			const users = this.db.collection(Tables.USERS);
			await users.updateOne({
				_id : new ObjectId(userId)
			},
			{$set : {
				first_name 	: firstName,
				last_name 	: lastName,
				full_name	: fullName,
				gender 		: req?.body?.gender || "",
				date_of_birth : getUtcDate(req?.body?.date_of_birth+" "+Constants.START_DATE_TIME_FORMAT),
				modified   	: getUtcDate()
			}});			

			/** Get user details **/
			let userResponse = await this.registrationAPI.getUserData(req,res,next,{
				conditions	:	{
					_id				: new ObjectId(userId),
					is_deleted		: Constants.NOT_DELETED,
					active			: Constants.ACTIVE,
				},
				fields	: {otp:0,email_otp:0,is_deleted:0,created:0,device_details:0,modified:0,password:0},
			});
			
			/** Send error response if user not found **/
			if(userResponse.status != Constants.STATUS_SUCCESS || !userResponse?.result) return {
				status: Constants.STATUS_ERROR, 
				message	: res.__("system.invalid_access")
			};

			/** Send success response **/
			return {
				status	: Constants.STATUS_SUCCESS,
				result	: userResponse?.result,
				message	: res.__("user.profile_has_been_changed_successfully")
			};
		} catch (error) {
			next(error);
		}
	};//End customerEditProfile()

	/**
	 * Function to get customer and driver details
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	 **/
	async getDriverCustomerDetails (req,res,next){
		try {
			/** Sanitize Data **/
			req.body 	= sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
			let userId	= req?.body?.user_id || "";

			/** Send error response **/
			if(!userId) return {status : Constants.STATUS_ERROR, message : res.__("system.missing_parameters")};

			/** Get user details **/
			let userResponse = await this.registrationAPI.getUserData(req,res,next,{
				conditions	:	{
					_id				: new ObjectId(userId),
					is_deleted		: Constants.NOT_DELETED,
					active			: Constants.ACTIVE,
				},
				fields	: {otp:0,email_otp:0,is_deleted:0,created:0,device_details:0,modified:0,password:0,package_id:0,package_valid_till:0,remaining_package_orders:0},
			});
			
			/** Send error response if user not found **/
			if(userResponse.status != Constants.STATUS_SUCCESS || !userResponse?.result) return {
				status: Constants.STATUS_ERROR, 
				message	: res.__("system.invalid_access")
			};

				/** Send success response **/
			return {
				status	: Constants.STATUS_SUCCESS,
				result	: userResponse?.result,
			};
		} catch (error) {
			next(error);
		}
	};// end getDriverCustomerDetails()

	/**
	 * Function to send otp to mobile number
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	 */
	async sendOtpToMobile (req,res,next){
		try {
			/** Sanitize Data */
			req.body 	=	sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
			let userId	= 	req?.body?.user_id || "";
			let userType= 	req?.body?.user_type || "";
			let mobileNumber = req?.body?.mobile_number || "";

			/** Send error response **/
			if(!userId || (userType && userType != Constants.USER_TYPE_CUSTOMER && userType != Constants.USER_TYPE_DRIVER )){
				return {status: Constants.STATUS_ERROR, message: res.__("system.missing_parameters")};
			}

			/** Apply validation */
			let validationResponse = await applyValidationInterCallFunction(req, res, next, sendOtpToMobileValidation);
			if(validationResponse.status != Constants.STATUS_SUCCESS) return validationResponse;

			/** Set condition **/
			let userConditions = {};
			if(!userType || userType == Constants.USER_TYPE_CUSTOMER){
				userConditions = 	clone(Constants.CUSTOMER_COMMON_CONDITIONS);
			}else{
				userConditions = 	clone(Constants.DRIVER_COMMON_CONDITIONS);
			}
			userConditions = {_id: new ObjectId(userId), ...userConditions};

			const users = this.db.collection(Tables.USERS);
			let userResult = await users.findOne({
				mobile_number : mobileNumber,
				is_deleted : Constants.NOT_DELETED,
			},{projection: {_id:1,mobile_number:1}});

			/** Send error response if mobile number already exists */
			if(userResult) return {status: Constants.STATUS_ERROR,message: res.__("user.your_mobile_number_is_already_exist")};
			
			/** Find user details **/
			let findResult = await users.findOne(userConditions,{projection: {_id:1,mobile_number:1}});

			/** Send error response if user not found **/
			if(!findResult) return {status: Constants.STATUS_ERROR,message: res.__("system.invalid_access")};

			let mobileOtp = await getRandomOTP();

			/** Update mobile otp  **/
			await users.updateOne(userConditions,
			{$set: {
				otp 	 : mobileOtp,
				modified : getUtcDate()
			}});
			
			let countryCode	 = Constants.DEFAULT_COUNTRY_CODE;
			mobileNumber = countryCode+mobileNumber;

			/**************** Send otp for verify *******************/
			let msgBody	= (res.locals.settings['SMS.update_mobile_number_edit_profile']) ? res.locals.settings['SMS.update_mobile_number_edit_profile'] : '';
			msgBody		= msgBody.replace(RegExp('{OTP}','g'),mobileOtp);

			/**Send sms **/
			sendSMS(req,res,{user_id: userId, mobile_number: mobileNumber, sms_template: msgBody});

			/** Send success response */
			return {
				status	: Constants.STATUS_SUCCESS,
				otp     : mobileOtp,	
				message	: res.__("user.please_verify_your_mobile_number_otp_has_been_sent"),
			};
		} catch (error) {
			next(error);
		}
	};//End sendOtpToMobile()

	/**
	 * Function to update customer mobile number
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	 */
	async updateCustomerMobileNumber (req,res,next){
		try {
			/** Sanitize Data */
			req.body 	=	sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
			let userId	= 	req?.body?.user_id || "";
			let userType= 	req?.body?.user_type || "";
			let mobileNumber = 	req?.body?.mobile_number || "";
			let otp 		 = 	req?.body?.otp || "";

			/** Send error response **/
			if(!userId  || (userType && userType != Constants.USER_TYPE_CUSTOMER && userType != Constants.USER_TYPE_DRIVER) ){
				return {status : Constants.STATUS_ERROR, message: res.__("system.missing_parameters")};
			}

			/** Apply validation */
			let validationResponse = await applyValidationInterCallFunction(req, res, next, updateMobileNumberValidation);
			if(validationResponse.status != Constants.STATUS_SUCCESS) return validationResponse;


			/** Set condition  **/
			let userConditions = {};
			if(!userType || userType == Constants.USER_TYPE_CUSTOMER){
				userConditions = 	clone(Constants.CUSTOMER_COMMON_CONDITIONS);
			}else{
				userConditions = 	clone(Constants.DRIVER_COMMON_CONDITIONS);
			}
			userConditions = {_id: new ObjectId(userId), ...userConditions};

			/** Update user details **/
			const users = this.db.collection(Tables.USERS);
			let findResult = await users.findOne(userConditions,{projection: {otp:1}});

			/** Send error response */
			if(!findResult) return {status: Constants.STATUS_ERROR,	message	: res.__("system.something_going_wrong_please_try_again")};

			/** Send error response */
			if(findResult.otp != otp) return {status: Constants.STATUS_ERROR, message : res.__("user.please_enter_valid_otp")};

			/** Update mobile otp  **/
			await users.updateOne(userConditions,
				{$set: {
					mobile_number : mobileNumber,
					modified      : getUtcDate()
				},
				$unset: { otp : 1 }
			});

			/** Send success response */
			return {
				status	: Constants.STATUS_SUCCESS,
				message	: res.__("user.mobile_number_has_been_updated_successfully"),
			};
		} catch (error) {
			next(error);
		}
	};//End updateCustomerMobileNumber()

	/**
	 * Function to send otp to email
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	 */
	async sendOtpToEmail (req,res,next){
		try {
			/** Sanitize Data */
			req.body 	=	sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
			let userId	= 	req?.body?.user_id || "";
			let userType= 	req?.body?.user_type || "";
			let emailAddress = req?.body?.email || "";

			/** Send error response **/
			if(!userId  || (userType && userType != Constants.USER_TYPE_CUSTOMER && userType != Constants.USER_TYPE_DRIVER) ){
				return {status : Constants.STATUS_ERROR, message	: res.__("system.missing_parameters")};
			}

			/** Apply validation */
			let validationResponse = await applyValidationInterCallFunction(req, res, next, sendOtpToEmailValidation);
			if(validationResponse.status != Constants.STATUS_SUCCESS) return validationResponse;

			/** Set condition for customer **/
			let userConditions = {};
			if(!userType || userType == Constants.USER_TYPE_CUSTOMER){
				userConditions = 	clone(Constants.CUSTOMER_COMMON_CONDITIONS);
			}else{
				userConditions = 	clone(Constants.DRIVER_COMMON_CONDITIONS);
			}
			userConditions = {_id: new ObjectId(userId), ...userConditions};

			/**Find user details  **/
			const users = this.db.collection(Tables.USERS);
			let userResult = await users.findOne({
				email 	   : {$regex: "^" + emailAddress + "$", $options: "i"},
				is_deleted : Constants.NOT_DELETED,
			},{projection: {_id:1,email:1}});

			/** Send error response if email already exists */
			if(userResult) return {status	: Constants.STATUS_ERROR,message: res.__("user.your_email_id_is_already_exist")};

			/**Find user details  **/
			let findResult = await users.findOne(userConditions,{projection: {full_name:1}});

			/** Send error if user is not customer */
			if(!findResult) return {status: Constants.STATUS_ERROR,message: res.__("system.invalid_access")};;

			let emailOtp = await getRandomOTP();
			
			/** Update email otp **/
			await users.updateOne(userConditions,
			{$set: {
				otp 	  : emailOtp,
				modified  : getUtcDate()
			}});

			/**Send email */
			let fullName =	(findResult.full_name) ? findResult.full_name	:"";
			if(emailAddress) sendMail(req,res,{
				to 			: emailAddress,
				action 		: "send_otp",
				rep_array 	: [fullName,emailOtp]
			});

			/** Send success response */
			return {
				status	: Constants.STATUS_SUCCESS,
				message	: res.__("user.please_verify_your_email_otp_has_been_sent"),
				otp     : emailOtp
			};				
		} catch (error) {
			next(error);
		}
	};//End sendOtpToEmail()

	/**
	 * Function to update customer email
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	 */
	async updateCustomerEmail (req,res,next){
		try {
			/** Sanitize Data */
			req.body 	=	sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
			let userId	= 	req?.body?.user_id || "";
			let userType= 	req?.body?.user_type || "";
			let emailAddress = req?.body?.email || "";
			let otp = req?.body?.otp || "";

			/** Send error response **/
			if(!userId  || (userType && userType != Constants.USER_TYPE_CUSTOMER && userType != Constants.USER_TYPE_DRIVER) ){
				return {status : Constants.STATUS_ERROR, message : res.__("system.missing_parameters")};
			}

			/** Apply validation */
			let validationResponse = await applyValidationInterCallFunction(req, res, next, updateEmailAddressValidation);
			if(validationResponse.status != Constants.STATUS_SUCCESS) return validationResponse;

			/** Set condition  **/
			let userConditions = {};
			if(!userType || userType == Constants.USER_TYPE_CUSTOMER){
				userConditions = 	clone(Constants.CUSTOMER_COMMON_CONDITIONS);
			}else{
				userConditions = 	clone(Constants.DRIVER_COMMON_CONDITIONS);
			}
			userConditions = {_id: new ObjectId(userId), ...userConditions};

			/** Update user details **/
			const users = this.db.collection(Tables.USERS);
			let findResult = await users.findOne(userConditions,{projection: {otp:1}});

			/** Send error response */
			if(!findResult) return {status	: Constants.STATUS_ERROR,	message	: res.__("system.something_going_wrong_please_try_again")};

			/** Send error response */
			if(findResult.otp != otp) return {status : Constants.STATUS_ERROR,message: res.__("user.please_enter_valid_otp")};

			/** Update mobile otp  **/
			await users.updateOne(userConditions,
				{ $set: {
					is_email_verified	: Constants.VERIFIED,
					email 	  			: emailAddress,
					modified  			: getUtcDate()
				},
				$unset: { otp : 1 }
			});

			/** Send success response */
			return {
				status	: Constants.STATUS_SUCCESS,
				message	: res.__("user.email_has_been_updated_successfully")
			};
		} catch (error) {
			next(error);
		}
	};//End updateCustomerEmail()

	/**
	 * Function to update driver location
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	**/
	async updateDriverLocation (req,res,next){
		try {
			/** Sanitize Data **/
            req.body 		= 	sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
			let userId   	= 	(req.body.user_id)   	? 	new ObjectId(req.body.user_id)     	:"";
			let latitude 	= 	(req.body.latitude)  	? 	parseFloat(req.body.latitude)  	:"";
            let longitude 	= 	(req.body.longitude) 	? 	parseFloat(req.body.longitude) 	:"";
            let address 	=	(req.body.address) 		?	req.body.address 					:"";

			/** Send error response **/
			if(!userId || !latitude || !longitude){
				return {status: Constants.STATUS_ERROR, message: res.__("system.missing_parameters")};
			}

			/** Set driver conditions **/
			let userConditions = clone(Constants.DRIVER_COMMON_CONDITIONS);
			userConditions = {_id: userId, ...userConditions};

			/** Find user details **/
			const users	= this.db.collection(Tables.USERS);
            let userResult = await users.findOne(userConditions,{projection: {_id:1,longitude:1,latitude:1,orders:1,user_role_id:1}});

			/** Send error response **/
			if(!userResult) return {status: Constants.STATUS_ERROR, message: res.__("admin.system.invalid_access")};

			let userLatitude  	=	userResult.latitude;
			let userLongitude	= 	userResult.longitude;
			let userOrders 		= 	userResult.orders;
			let userRoleId 		= 	userResult.user_role_id;
			let distanceInMeters = 0;

			/** Get driver distance in meters **/
			if(userLatitude && userLongitude){
				let distance = await this.assignmentAPI.getGeoLocations(req,res,next,{
					to_lat 	  : latitude,
					to_long   : longitude,
					from_lat  : userLatitude,
					from_long : userLongitude
				});

				distanceInMeters = distance?.distance || 0;
			}

			asyncParallel({
				user_location_logs : (callback)=>{
					/** Save user location logs **/
					const user_locations_logs  = this.db.collection(Tables.USER_LOCATIONS_LOGS);
					user_locations_logs.insertOne({
						user_id     : userId,
						latitude    : latitude,
						longitude   : longitude,
						long_lat    : [longitude, latitude],
						distance_from_last_location : distanceInMeters,
						address		:	address,
						created     : getUtcDate()
					}).then(()=>{
						callback(null);
					}).catch(next);
				},
				save_user_details : (callback)=>{
					/** Save longitude, latitude in users collection **/
					users.updateOne({
						_id : userId
					},
					{$set : {
						longitude		:	longitude,
						latitude		:	latitude,
						long_lat 		: 	[longitude, latitude],
						location_address:	address
					}}).then(()=>{
						callback(null);
					}).catch(next);
				},
				update_order_status : (callback)=>{
					callback(null);

					if(userOrders && userOrders.length >0){
						let nearByMeter = (res.locals.settings['Site.near_by_distance_from_restaurant_or_drop_location']) ? res.locals.settings['Site.near_by_distance_from_restaurant_or_drop_location'] :0;

						const order_details	= this.db.collection(Tables.ORDER_DETAILS);
						asyncEach(userOrders, (records, eachCallback)=> {
							let orderId 	= records.order_id;
							let orderStatus = records.status;

							if(orderStatus != Constants.ORDER_DRIVER_ACCEPTED && orderStatus != Constants.ORDER_DRIVER_WAY_TO_CUSTOMER) return eachCallback(null);

							/** Get order details */
							order_details.findOne({ 
								order_id: orderId 
							},{projection: {
								_id:1,customer_latitude:1,customer_longitude:1,restaurant_latitude:1,restaurant_longitude:1
							}}).then(orderResult=>{
								if(!orderResult) return eachCallback(null);

								let updatedStatus	= "";
								let originLatitude	= 0;
								let originLongitude = 0;
								if(orderStatus == Constants.ORDER_DRIVER_ACCEPTED){
									originLatitude	= orderResult.restaurant_latitude;
									originLongitude = orderResult.restaurant_longitude;
									updatedStatus 	= Constants.ORDER_DRIVER_ARRIVED_AT_RESTAURANT;
								}else{
									originLatitude	= orderResult.customer_latitude;
									originLongitude = orderResult.customer_longitude;
									updatedStatus 	= Constants.ORDER_DRIVER_ARRIVED_AT_CUSTOMER_LOCATION;
								}

								if(!originLatitude || !originLongitude) return eachCallback(null);

								checkDriverNearByLocation(req,res,next,{
									point_lat_long : 	{
										latitude 	: 	latitude,
										longitude 	:	longitude,
									},
									center_point_lat_long : 	{
										latitude 	: 	originLatitude,
										longitude 	:	originLongitude,
									},
									radius_in_meter	:	parseFloat(nearByMeter),
								}).then(locationResponse=>{

									if(locationResponse.status == Constants.STATUS_SUCCESS && locationResponse.is_nearby){
										/** Save order logs */
										saveOrderStatusLogs(req,res,next,{
											order_id 		: 	orderId,
											user_id			:	userId,
											updated_by 		: 	userId,
											user_role_id	:	userRoleId,
											user_type		:	Constants.DRIVER,
											status 			:	updatedStatus,
											order_status 	:	orderStatus,
										}).then(()=>{
											eachCallback(null);
										}).catch(next);
									}else{
										eachCallback(null);
									}
								});
							});
						},(asyncEachErr)=> {
							if(asyncEachErr){
								console.error('error at updateDriverLocation ',asyncEachErr);
							}
						});
					}
				}
			},(asyncChildErr)=>{
				if(asyncChildErr) return next(asyncChildErr);

				/**Send success response */
				return {status: Constants.STATUS_SUCCESS, message: res.__("my_account.location_has_been_updated_successfully") };
			});
		} catch (error) {
			next(error);
		}
	};// end updateDriverLocation()

	/**
	 * Function to update online offline status
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	 **/
	async updateOnlineOfflineStatus (req,res,next){
		try {
			/** Sanitize Data **/
			req.body 	= sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
			let userId	= (req.body.user_id) ? ObjectId(req.body.user_id) :"";
            let status	= (req.body.status)  ? req.body.status  		  :"";

			/** Send error response **/
			if(!userId || !status) return {status : Constants.STATUS_ERROR, message : res.__("system.missing_parameters")};

			/** Set driver conditions **/
			let userConditions = clone(Constants.DRIVER_COMMON_CONDITIONS);
			userConditions._id = new ObjectId(userId);

			/** Find if user is not driver */
			const users	= 	this.db.collection(Tables.USERS);
			let userResult = await users.findOne(userConditions,{projection: { _id:1}});

			/** Send error response **/
			if(!userResult) return {status : Constants.STATUS_ERROR, message : res.__("admin.system.invalid_access")};

			/** Update user online offline status */
			await users.updateOne({ _id : userId},{$set : {is_online : parseInt(status)}});

			/** Set options for save online offline logs **/
			let options = {
				user_id : userId,
				status  : status
			};
			/** Save user online offline logs **/
			await this.saveOnlineOfflineLogs(req,res,next,options);

			/**Send success response */
			return {status: Constants.STATUS_SUCCESS, message: res.__("my_account.status_has_been_updated_successfully") };
		} catch (error) {
			next(error);
		}
	};// end updateOnlineOfflineStatus()

	/**
	 * Function to save online offline logs
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	 **/
	async saveOnlineOfflineLogs (req,res,next,options){
		try {
			let userId	= (options.user_id) ? options.user_id :"";
			let status	= (options.status)  ? options.status : "";

			/** Send error response **/
			if(!userId || !status) return {status : Constants.STATUS_ERROR, message : res.__("system.missing_parameters")};

            /** Find user online logs details **/
			const user_online_logs = this.db.collection(Tables.USER_ONLINE_LOGS);
			let result = await user_online_logs.find({user_id : new ObjectId(userId)}).sort({_id : Constants.SORT_DESC}).limit(1).toArray();

			let lastLogDetails	= (result && result[0]) ? result[0] : null;
			let logId 			= (lastLogDetails && lastLogDetails._id) ? lastLogDetails._id : "";
			let updateRecordId	= new ObjectId();

			/** Update offline time if user is already online but api get same status again */
			if(status == Constants.ONLINE && lastLogDetails && lastLogDetails.offline_time == ""){
				await user_online_logs.updateOne({_id : new ObjectId(logId)},{$set: {offline_time : getUtcDate()}});
			}				

			let dataToBeUpdated = {};
			if(status == Constants.OFFLINE && lastLogDetails && lastLogDetails.offline_time == "" && logId){
				updateRecordId = logId;
				dataToBeUpdated.offline_time = getUtcDate();
			}

			if(status == Constants.ONLINE){
				dataToBeUpdated = {
					user_id		: new ObjectId(userId),
					online_time	: getUtcDate(),
					offline_time: ""
				};
			}

			if(Object.keys(dataToBeUpdated).length > 1){
				/** Update user online logs **/
				await user_online_logs.updateOne({
					_id : new ObjectId(updateRecordId)
				},{$set: dataToBeUpdated},{upsert : true});
			}

			/** Return success response */
			return {status : Constants.STATUS_SUCCESS};
		} catch (error) {
			next(error);
		}
	};// end saveOnlineOfflineLogs()

	/**
	 * Function to get captain excuses, breaks, in-out shifts
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	 **/
	async captainDashboard (req,res,next){
		return new Promise(resolve=>{
			let userId  	=	(req.body.user_id) 		?	new ObjectId(req.body.user_id)	:"";
			let deviceToken =	(req.body.device_token)	?	req.body.device_token 		:"";

			if(!userId) return resolve({status : Constants.STATUS_ERROR, message : res.__("system.missing_parameters")});
			
			const users 	= 	this.db.collection(Tables.USERS);
			let startDate 	=	newDate(newDate("",Constants.CURRENTDATE_START_DATE_FORMAT));
			let endDate 	=	newDate(newDate("",Constants.CURRENTDATE_END_DATE_FORMAT));
			asyncParallel({
				excuse_list : (callback)=>{
					/** Get excuses list */
					this.driverExcuseAPI.getDriverExcuses(req,res,next).then(response=>{
						if(response.status != Constants.STATUS_SUCCESS) callback(response);

						callback(null,response.result);
					}).catch(next);
				},
				break_list : (callback)=>{
					/** Get breaks list */
					this.driverBreaksAPI.getBreaks(req,res,next).then(response=>{
						if(response.status != Constants.STATUS_SUCCESS) callback(response);

						callback(null,response.result);
					}).catch(next);
				},
				inout_list : (callback)=>{
					/** Get inout list */
					this.driverBreaksModel.getInOutShifts(req,res,next).then(response=>{
						if(response.status != Constants.STATUS_SUCCESS) callback(response);

						callback(null,response.result);
					}).catch(next);
				},
				shift_details : (callback)=>{
					/** Get shift id and area id */
					const driver_availabilities	= this.db.collection(Tables.DRIVER_AVAILABILITIES);
					driver_availabilities.find({
						user_id : 	userId,
						date 	: 	{$gte: startDate, $lte: endDate},
						shift_id:	{$ne : ""},
						$or : [
							{leave_type	: {$exists : false}},
							{leave_type : {$exists : true}, leave_status: {$ne: Constants.APPROVED} }
						],
					},{projection:{_id:1,shift_id:1,area_id:1,date:1,}}).toArray().then(driverAvailabilityResult=>{
						if(driverAvailabilityResult.length ==0) return callback(null, []);

						let shiftIds = [];
						let areaIds  = [];
						driverAvailabilityResult.map(record => {
							if(record.shift_id) shiftIds.push(record.shift_id);
							if(record.area_id) areaIds.push(record.area_id);
						});

						asyncParallel({
							area_details : (childCallback)=>{
								if(areaIds.length == 0) return childCallback(null,null);

								/** Get area details */
								const areas	= this.db.collection(Tables.AREAS);
								areas.find({ _id : {$in : arrayToObject(areaIds)}},{projection:{_id:1,name:1}}).toArray().then(areaResult=>{
									let tmpAreaObj = {};
									if(areaResult){
										areaResult.map(records=>{
											tmpAreaObj[records._id] = records.name;
										});
									}
									childCallback(null,tmpAreaObj);
								}).catch(next);
							},
							shift_list : (childCallback)=>{
								if(shiftIds.length == 0) return childCallback(null,null);

								/** Get shift details */
								const shifts = 	this.db.collection(Tables.SHIFTS);
								shifts.find({_id: {$in : arrayToObject(shiftIds)}},{projection:{_id:1,shift_name:1,start_time:1,end_time:1}}).sort({start_time: Constants.SORT_ASC}).toArray().then(shiftResult=>{
									childCallback(null,shiftResult);
								}).catch(next);
							},
						},(childAsyncErr,childAsyncResponse)=>{
							if(childAsyncErr) return  callback(childAsyncErr,childAsyncResponse);

							let tmpAreaList		=	childAsyncResponse.area_details;
							let tmpShiftList	= 	childAsyncResponse.shift_list;
							let finalShiftList 	= 	[];
							if(tmpShiftList){
								tmpShiftList.map(shiftData=>{
									driverAvailabilityResult.map(record=>{
										let tmpShiftId 	=	record.shift_id;
										let tmpAreaId 	= 	record.area_id;

										if(String(shiftData._id) == String(tmpShiftId)){
											let tmpObj 	= {
												date 		:	record.date,
												start_time 	:	(shiftData.start_time)  ? set24HourFormat(shiftData.start_time) :"",
												end_time 	:	(shiftData.end_time) 	? set24HourFormat(shiftData.end_time) :"",
											};

											if(tmpAreaId) tmpObj['area'] = tmpAreaList[tmpAreaId] ? tmpAreaList[tmpAreaId] : "";
											finalShiftList.push(tmpObj);
										}
									});
								});
							}
							callback(childAsyncErr, { shift_list: finalShiftList });
						});
					}).catch(next);
				},
				vehicle_details : (callback)=>{
					/** Get vehicle id */
					users.findOne({ _id : userId},{projection:{_id:1,vehicle_id:1,image:1,driver_id:1,device_details:1}}).then(userResult=>{
						if(!userResult) return callback(null,null);

						let vehicleId = new ObjectId(userResult.vehicle_id);

						asyncParallel({
							vehicle_details : (childParallelCallback)=>{
								/** Get vehicle details*/
								const driver_vehicles = this.db.collection(Tables.DRIVER_VEHICLES);
								driver_vehicles.findOne({ _id : vehicleId},{projection:{_id:1,vehicle_type:1,plate_number:1}}).then(vehicleResult=>{
									childParallelCallback(null,vehicleResult);
								}).catch(next);
							},
						},(childParallelErr,childParallelResponse)=>{
							childParallelResponse.driver_details = userResult;
							callback(childParallelErr,childParallelResponse);
						});
					}).catch(next);
				},
				update_user_permission : (callback)=>{
					if(!req.body.permission_array)	 return callback(null);
					
					/** Update user details */
					const user_location_permissions = this.db.collection(Tables.USER_LOCATION_PERMISSIONS);
					user_location_permissions.insertOne({
						user_id 		:	userId, 
						permission_array: 	req.body.permission_array, 
						device_type		: 	req.body.device_type, 
						device_token	: 	deviceToken, 
						created			: 	getUtcDate() 
					}).then(()=>{
						callback(null);
					}).catch(next);
				}
			},(asyncErr, asyncResponse)=>{
				if(asyncErr) return resolve(asyncErr);

				let shiftResult    	=  asyncResponse.shift_details 	? asyncResponse.shift_details 	  : {};
				let vehicleResult 	=  asyncResponse.vehicle_details ? asyncResponse.vehicle_details   : {};
				let driverVehicleDetails= vehicleResult.vehicle_details? vehicleResult.vehicle_details: {};
				let driverDetails	=  vehicleResult.driver_details?	vehicleResult.driver_details  : {};
				let deviceDetails	=  driverDetails.device_details?	driverDetails.device_details  : [];
				let shiftDetails	=  shiftResult.shift_list || [];
				let captainDetails	=  {};

				if(driverVehicleDetails.vehicle_type){
					captainDetails.vehicle_type	= Constants.VEHICLE_TYPE[driverVehicleDetails.vehicle_type];
				}
				if(driverVehicleDetails.plate_number){
					captainDetails.vehicle_number = driverVehicleDetails.plate_number;
				}
				captainDetails.driver_id= (driverDetails.driver_id) ? driverDetails.driver_id 	:"";
				captainDetails.image  	= (driverDetails.image) 	? driverDetails.image 		:"";

				/** Check user same device or not */
				let isSameDevice = false;
				if(deviceDetails.length >0){
					deviceDetails.map(data=>{
						if(data.device_token && data.device_token == deviceToken){
							isSameDevice = true;
						}
					});
				}

				/** Send success response */
				resolve({
					status 			: Constants.STATUS_SUCCESS,
					excuse 			: (asyncResponse.excuse_list)? asyncResponse.excuse_list:{},
					break 			: (asyncResponse.break_list) ? asyncResponse.break_list :{},
					inout_shift		: (asyncResponse.inout_list) ? asyncResponse.inout_list :{},
					shift_details  	: shiftDetails,
					captain_details : captainDetails,
					image_path		: Constants.USERS_URL,
					is_user_logout	: (!isSameDevice) ? true :false,
				});
			});
		});
	};// end captainDashboard()

	/**
	 * Function to get user location
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	 **/
	async getUserLocation (req,res,next){
		try {
			/** Sanitize Data **/
			req.body 	= sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
			let userId	= (req.body.auth_id) ? req.body.auth_id :"";

			/** Send error response **/
			if(!userId) return {status : Constants.STATUS_ERROR, message : res.__("system.missing_parameters")};

			/** Get user details **/
			let response = await this.registration.getUserData(req,res,next,{
				conditions	:	{
					_id				: new ObjectId(userId),
					is_deleted		: Constants.NOT_DELETED,
				},
				fields	: {_id :1,full_name:1,latitude:1,longitude:1,vehicle_type:1},
			});
			if(response.status != Constants.STATUS_SUCCESS) return response;

			/** Send success response **/
			return {
				status	: Constants.STATUS_SUCCESS,
				result	: response.result || {},
			};
		} catch (error) {
			next(error);
		}
	};// end getUserLocation()

	/**
	 * Function to get referral details
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	 **/
	async getReferralDetails (req,res,next){
		try {
			/** Sanitize Data **/
			req.body 	= sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
			let userId	= (req.body.user_id) ? new ObjectId(req.body.user_id) :"";

			/** Send error response **/
			if(!userId) return {status : Constants.STATUS_ERROR, message : res.__("system.missing_parameters")};

			let userConditions = clone(Constants.CUSTOMER_COMMON_CONDITIONS);
			userConditions = {_id: userId, ...userConditions};

			/** Get referral details */
			const users = this.db.collection(Tables.USERS);
			let result = await users.findOne(userConditions,{projection:{referral_details:1}});

			/** Send error response */
			if(!result) return {status:Constants.STATUS_ERROR,message:res.__("system.invalid_access")};

			/** Send success response */
			let referralDetails = result?.referral_details || {};
			return {
				status			: Constants.STATUS_SUCCESS,
				referral_code   : referralDetails?.referral_code || "",
				referral_amount	: res?.locals?.settings?.['Rewards_and_referrals.referral_amount'] || 0,
				enable_referral_amount  : res?.locals?.settings?.['Rewards_and_referrals.enable_referral_amount'] || 0,
			};
		} catch (error) {
			next(error);
		}
	};// end getReferralDetails()
}
