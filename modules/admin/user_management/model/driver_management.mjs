import { ObjectId } from 'mongodb';
import * as Constants from '../../../../config/global_constant.mjs';
import Tables from '../../../../config/database_tables.mjs';
import { isPost, sanitizeData, getUtcDate, configDatatable, moveUploadedFile, appendFileExistData, getUniqueId, generateMD5Hash, getDatabaseSlug, arrayToObject, newDate } from '../../../../utils/index.mjs';
import { saveSystemLogs, sendMailToUsers } from '../../../../services/index.mjs';
import BREADCRUMBS from '../../../../breadcrumbs.mjs';

class UserManagement {
    constructor(db) {
        this.db = db;
        this.usersCollection = db.collection(Tables.USERS);
    }

    /**
     * Function to get list of drivers
     *
     * @param req As Request Data
     * @param res As Response Data
     * @param next As Callback argument to the middleware function
     *
     * @return render/json
     */
    async listDriver(req, res, next) {
        try {
            let userType = (req.query.user_type) ? req.query.user_type : '';

            if (isPost(req)) {
                let limit = (req.body.length) ? parseInt(req.body.length) : Constants.ADMIN_LISTING_LIMIT;
                let skip = (req.body.start) ? parseInt(req.body.start) : Constants.DEFAULT_SKIP;

                /** Configure Datatable conditions*/
                const dataTableConfig = await configDatatable(req, res, null);
                
                let commonConditions = {
                    user_role_id: Constants.DRIVER,
                    is_deleted: Constants.NOT_DELETED,
                };

                if (userType) {
                    switch (userType) {
                        case "available_drivers":
                            commonConditions.is_available = Constants.AVAILABLE;
                            commonConditions.active = Constants.ACTIVE;
                            break;
                        case "assign_drivers":
                            commonConditions.active = Constants.ACTIVE;
                            commonConditions.is_available = Constants.AVAILABLE;
                            commonConditions.order_status = { $ne: Constants.ORDER_DRIVER_FREE };
                            break;
                        case "free_drivers":
                            commonConditions.active = Constants.ACTIVE;
                            commonConditions.is_available = Constants.AVAILABLE;
                            commonConditions.order_status = Constants.ORDER_DRIVER_FREE;
                            break;
                        case String(Constants.ACTIVE):
                            commonConditions.active = Constants.ACTIVE;
                            break;
                        case String(Constants.DEACTIVE):
                            commonConditions.active = Constants.DEACTIVE;
                            break;
                    }
                }

                dataTableConfig.conditions = Object.assign(commonConditions, dataTableConfig.conditions);

                let dbRes = await this.usersCollection.aggregate([
                    { $match: dataTableConfig.conditions },
                    {$facet : {
                        list : [
                            {$sort: dataTableConfig.sort_conditions },
                            {$skip: skip },
                            {$limit: limit },
                            {$project: {
                                _id: 1, full_name: 1, email: 1, modified: 1, active: 1, driver_id: 1, mobile_number: 1
                            }}
                        ],
                        count: [
                            {$count: "count"},
                        ],
                    }}
                ]).toArray();

                /** Send response **/
                res.send({
                    status: Constants.STATUS_SUCCESS,
                    draw: dataTableConfig.result_draw,
                    data			:   dbRes?.[0]?.list ||[],
                    recordsTotal	:	dbRes?.[0]?.count?.[0]?.count || 0,
                    recordsFiltered	:  	dbRes?.[0]?.count?.[0]?.count || 0,
                }); 
            } else {
                /** render driver listing page **/
                req.breadcrumbs(BREADCRUMBS['admin/user_management/list_driver']);
                res.render('driver/list_driver', { user_type: userType });
            }
        } catch (error) {
            next(error);
        }
    }

    /**
     * Function for add/edit driver
     *
     * @param req As Request Data
     * @param res As Response Data
     * @param next As Callback argument to the middleware function
     *
     * @return render/json
     */
    async addEditDriver(req, res, next) {
        try {
            let authId = (req.session.user && req.session.user._id) ? req.session.user._id : "";
            let driverId = (req.params.id) ? new ObjectId(req.params.id) : new ObjectId();
            let isEditable = (req.params.id) ? true : false;

            if (isPost(req)) {
                /** Sanitize Data **/
                req.body            =   sanitizeData(req.body, Constants.NOT_ALLOWED_TAGS_XSS);
                let password        =   req?.body?.password  || "";
                let uniqueDriverId  =   req?.body?.driver_id || "";
                let image           =   "";

                if(req.files && req.files.image){
                    /**Function for upload image */
                    const imageRes = await moveUploadedFile(req, res, {'image': req.files.image, 'filePath': Constants.USERS_FILE_PATH});

                    /** Send error response **/
                    if (imageRes.status == Constants.STATUS_ERROR) {
                        return res.send({status: Constants.STATUS_ERROR, message: [{ 'param': 'image', 'msg': imageRes.message }] });
                    }

                    image = imageRes.fileName;
                }

                let firstName     =   req?.body?.first_name || "";
                let lastName      =   req?.body?.last_name || "";
                let email         =   req?.body?.email || "";
                let mobileNumber  =   req?.body?.mobile_number || "";
                let fullName      =   firstName + ' ' + lastName;

                /**Check email, mobile number is unique*/
                const existingUser = await this.usersCollection.findOne({
                    _id: { $ne: driverId },
                    is_deleted: Constants.NOT_DELETED,
                    $or: [
                        { email: { $regex: "^" + email + "$", $options: "i" } },
                        { mobile_number: mobileNumber },
                    ]
                }, { projection: { _id: 1, email: 1, mobile_number: 1, user_role_id: 1 } });

                if (existingUser) {
                    if (existingUser.user_role_id == Constants.DRIVER) {
                        /** Send error response **/
                        return res.send({
                            status: Constants.STATUS_ERROR,
                            exists: true,
                            exist_id: existingUser._id
                        });
                    }else{
                        let errMessage = [];
                        let resultMail = (existingUser.email) ? existingUser.email.toLowerCase() : "";
                        let resultMobile = existingUser.mobile_number;
                        let enteredMail = email.toLowerCase();

                        /** Push error message in array if email or mobile already exists*/
                        if (resultMail == enteredMail) {
                            errMessage.push({ 'param': 'email', 'msg': res.__("admin.user_management.user_name_is_already_exist") });
                        }
                        if (resultMobile == mobileNumber) {
                            errMessage.push({ 'param': 'mobile_number', 'msg': res.__("admin.user_management.mobile_number_is_already_exist") });
                        }

                        /** Send error response **/
                        return res.send({ status: Constants.STATUS_ERROR, message: errMessage });
                    }
                }

                /** Generate new password hash */
                let newPassword = "";
                if(password) newPassword = generateMD5Hash(password);

                /** Generate slug */
                let slug = "";
                if(!isEditable){
                    let slugRes = await getDatabaseSlug({ title: fullName, table_name: Tables.USERS, slug_field: "slug" });
                    slug = slugRes?.title || "";
                }

                /** Set update data */
                let updateData = {
                    $set: {
                        first_name: firstName,
                        last_name: lastName,
                        full_name: fullName,
                        email: email,
                        mobile_number: mobileNumber,
                        modified: getUtcDate()
                    },
                    $setOnInsert: {
                        user_role_id: Constants.DRIVER,
                        slug: slug,
                        driver_id: uniqueDriverId,
                        phone_country_code: Constants.DEFAULT_COUNTRY_CODE,
                        user_type: Constants.USER_TYPE_OTHER,
                        order_status: Constants.ORDER_DRIVER_FREE,
                        active: Constants.ACTIVE,
                        is_verified: Constants.VERIFIED,
                        is_email_verified: Constants.VERIFIED,
                        is_mobile_verified: Constants.VERIFIED,
                        is_deleted: Constants.NOT_DELETED,
                        created_by: new ObjectId(authId),
                        created: getUtcDate(),
                    }
                };

                if (newPassword) updateData["$set"]['password'] = newPassword;
                if (image) updateData['$set'].image = image;

                /** Save user data **/
                await this.usersCollection.updateOne({ _id: driverId }, updateData, { upsert: true });

                /** Send success response **/
                let message = (isEditable) ? res.__("admin.user_management.driver_updated_successfully") : res.__("admin.user_management.driver_has_been_added_successfully");
                req.flash(Constants.STATUS_SUCCESS, message);
                res.send({
                    status: Constants.STATUS_SUCCESS,
                    redirect_url: Constants.WEBSITE_ADMIN_URL + "user_management/list_driver",
                });

                /*************** Send mail  ***************/
                if (!isEditable) {
                    sendMailToUsers(req, res, {
                        event_type: Constants.NOTIFICATION_DRIVER_REGISTER,
                        driver_fullname: fullName,
                        driver_email: email,
                        driver_password: password,
                    });
                }
                /*************** Send mail  ***************/

                /** Save system logs */
                saveSystemLogs(req, res, {
                    user_id: authId,
                    parent_id: driverId,
                    activity_module: Constants.SYSTEM_LOG_MODULE_DRIVER_MANAGEMENT,
                    activity_type: Constants.ACTIVITY_TYPE_ADD_EDIT,
                    additional_details: {}
                });
            } else {
                let response = {};
                if (isEditable) {
                    response = await this.getDriverDetails(req, res, next);
                    if (response.status != Constants.STATUS_SUCCESS) {
                        /** Send error response **/
                        req.flash(Constants.STATUS_ERROR, response.message);
                        return res.redirect(Constants.WEBSITE_ADMIN_URL + "user_management/list_driver");
                    }
                }

                /** generate driver id in add driver page */
                let driverId = "";
                if(!isEditable){
                    let idResponse = await getUniqueId(req, res, next, { type: "user_driver_id" });
                    driverId = idResponse?.result || "";
                }

                /** Render add / edit page  **/
                req.breadcrumbs(BREADCRUMBS[`admin/user_management/${isEditable ? 'edit_driver' :'add_driver' }`]);
                res.render('driver/add_driver', {
                    result: response.result,
                    is_editable: isEditable,
                    driver_id: driverId
                });
            }
        } catch (error) {
            next(error);
        }
    }

    /**
     * Function for delete driver
     *
     * @param req As Request Data
     * @param res As Response Data
     * @param next As Callback argument to the middleware function
     *
     * @return null
     */
    async deleteDriver(req, res, next) {
        try {
            /** Delete driver */
            await this.usersCollection.updateOne({
                _id: new ObjectId(req.params.id),
            }, {
                $set: {
                    is_deleted: Constants.DELETED,
                    deleted_at: getUtcDate(),
                    modified: getUtcDate(),
                    deleted_by: new ObjectId(req.session.user._id)
                }
            });

            /** Send success response **/
            req.flash(Constants.STATUS_SUCCESS, res.__("admin.user_management.driver_deleted_successfully"));
            res.redirect(Constants.WEBSITE_ADMIN_URL + "user_management/list_driver");

            /** Save system logs */
            saveSystemLogs(req, res, {
                user_id: req.session.user._id,
                parent_id: req.params.id,
                activity_module: Constants.SYSTEM_LOG_MODULE_DRIVER_MANAGEMENT,
                activity_type: Constants.ACTIVITY_TYPE_DELETE,
                additional_details: {}
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Function for view driver
     *
     * @param req As Request Data
     * @param res As Response Data
     * @param next As Callback argument to the middleware function
     *
     * @return render
     */
    async viewDriverDetails(req, res, next) {
        try {
            if(req.params.id && !ObjectId.isValid(req.params.id)){
                req.flash(Constants.STATUS_ERROR, res.__("admin.system.invalid_access"));
                return res.redirect(Constants.WEBSITE_ADMIN_URL + "user_management/list_driver");
            }
            
            /** Get Driver details **/
            const response = await this.getDriverDetails(req, res, next);
            if (response.status != Constants.STATUS_SUCCESS) {
                /** Send error response **/
                req.flash(Constants.STATUS_ERROR, response.message);
                return res.redirect(Constants.WEBSITE_ADMIN_URL + "user_management/list_driver");
            }

            /** Render view page*/
            req.breadcrumbs(BREADCRUMBS["admin/user_management/view_driver"]);
            res.render('driver/view_driver', {
                result: response.result,
                driver_id: req.params.id,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Function to get driver detail
     *
     * @param req As Request Data
     * @param res As Response Data
     * @param next As Callback argument to the middleware function
     *
     * @return json
     */
    async getDriverDetails(req, res, next) {
        try {
            let userId = new ObjectId(req.params.id);

            /** Get driver details **/
            const result = await this.usersCollection.findOne({ _id: userId });

            /** Send error response */
            if (!result) {
                return {
                    status: Constants.STATUS_ERROR,
                    message: res.__("admin.system.invalid_access")
                };
            }

            /** Set options for append image full path **/
            let options = {
                "file_url": Constants.USERS_URL,
                "file_path": Constants.USERS_FILE_PATH,
                "result": [result],
                "database_field": "image"
            };

            /** Append image with full path **/
            const fileResponse = await appendFileExistData(options);

            return {
                result: fileResponse?.result?.[0] || {},
                status: Constants.STATUS_SUCCESS
            };
        } catch (error) {
            next(error);
        }
    }

    /**
     * Function for update driver status
     *
     * @param req As Request Data
     * @param res As Response Data
     * @param next As Callback argument to the middleware function
     *
     * @return null
     */
    async updateDriverStatus(req, res, next) {
        try {
            let driverId = (req.params.id) ? req.params.id : "";
            let status = (req.params.status) ? req.params.status : "";

            if (!driverId || !status) {
                req.flash(Constants.STATUS_ERROR, res.__("admin.system.invalid_access"));
                return res.redirect(Constants.WEBSITE_ADMIN_URL + "user_management/list_driver");
            }

            /** Update driver status **/
            await this.usersCollection.updateOne({
                _id: new ObjectId(driverId)
            }, {
                $set: {
                    active: parseInt(status),
                    modified: getUtcDate()
                }
            });

            /** Send success response **/
            req.flash(Constants.STATUS_SUCCESS, res.__("admin.user_management.status_updated_successfully"));
            res.redirect(Constants.WEBSITE_ADMIN_URL + "user_management/list_driver");

            /** Save system logs */
            saveSystemLogs(req, res, {
                user_id: req.session.user._id,
                parent_id: driverId,
                activity_module: Constants.SYSTEM_LOG_MODULE_DRIVER_MANAGEMENT,
                activity_type: Constants.ACTIVITY_TYPE_STATUS_CHANGE,
                additional_details: { status: status }
            });
        } catch (error) {
            next(error);
        }
    }

    /**
	 * Function to get list of driver travel logs
	 *
	 * @param req As Request Data
	 * @param res As Response Data
	 *
	 * @return render/json
	 */
	async driverLocationList (req, res, next){
		try {
			let userId = (req.params.id) ? new ObjectId(req.params.id) : '';
			let dateForm = (req.body.date_from) ? req.body.date_from : "";
			let dateTo = (req.body.date_to) ? req.body.date_to : "";
			
            /** Send error response when user id is not found */
			if (!userId) {
				req.flash(Constants.STATUS_ERROR, res.__("admin.system.invalid_access"));
				return res.redirect(Constants.WEBSITE_ADMIN_URL + "user_management/list_driver");
			}
			
			let commonConditions = {user_id: userId};			
			if (dateForm && dateTo) commonConditions["created"] = {$gte: newDate(dateForm),$lte: newDate(dateTo)};
            
			const user_locations_logs = this.db.collection(Tables.USER_LOCATIONS_LOGS);
			const [locList, latestLocation] = await Promise.all([
				// Get all location records
				user_locations_logs.find(commonConditions, {
					_id: 1, 
					user_id: 1, 
					latitude: 1, 
					longitude: 1, 
					long_lat: 1, 
					distance_from_last_location: 1, 
					created: 1, 
					address: 1
				}).sort({ created: Constants.SORT_DESC }).toArray(),
				
				// Get latest location
				user_locations_logs.findOne({
					user_id: userId
				}, {
					projection: {
						_id: 1, 
						user_id: 1, 
						latitude: 1, 
						longitude: 1, 
						long_lat: 1, 
						created: 1, 
						address: 1
					}, 
					sort: { created: Constants.SORT_DESC }
				})
			]);
			
			/** Send response **/
			res.render('driver/driver_location_list', {
				layout: false,
				result: locList || [],
				latest_location: latestLocation || {}
			});
			
		} catch (error) {
			// Handle any errors that occur during execution
			console.error('Error in driverLocationList:', error);
			req.flash(Constants.STATUS_ERROR, res.__("admin.system.something_going_wrong_please_try_again"));
			return res.redirect(Constants.WEBSITE_ADMIN_URL + "user_management/list_driver");
		}
	}; // End driverLocationList()

    /**
     * Function for update multiple driver details
     *
     * @param req 	As Request Data
     * @param res 	As Response Data
     * @param next 	As Callback argument to the middleware function
     *
     * @return void
     */
    async updateMultipleDriverDetails(req, res, next) {
        try {
            let status = (req.body.status) ? req.body.status : 0;
            let driverIds = (req.body.driver_ids) ? req.body.driver_ids.split(",") : [];

            /** Send error response **/
            if (!driverIds.length  || !status) {
                return res.send({ 
                    status: Constants.STATUS_ERROR, 
                    message: res.__("admin.system.something_going_wrong_please_try_again") 
                });
            }
            /** Set update data */
            let updateData = { modified: getUtcDate() };

            let activityType = "";
            if (status == Constants.DRIVER_ACTIVE || status == Constants.DRIVER_DEACTIVE) {
                updateData.active = (status == Constants.DRIVER_ACTIVE) ? Constants.ACTIVE : Constants.DEACTIVE;
                activityType = Constants.ACTIVITY_TYPE_STATUS_UPDATE;
            }
            if (status == Constants.DRIVER_DELETE) {
                updateData.is_deleted = Constants.DELETED;
                updateData.deleted_at = getUtcDate();
                updateData.deleted_by = new ObjectId(req.session.user._id);
                activityType = Constants.ACTIVITY_TYPE_DELETE;
            }

            /** Update driver details */
            await this.usersCollection.updateMany({ _id: { $in: arrayToObject(driverIds) } }, { $set: updateData });

            /** Send success response */
            res.send({
                status: Constants.STATUS_SUCCESS,
                message: res.__("admin.user_management.action_performed_message"),
            });

            /** Save system logs for each driver */
			driverIds.forEach(tmpDriverId => {
				let additionalDetails = {};
				if(activityType == Constants.ACTIVITY_TYPE_STATUS_UPDATE){
					additionalDetails.status = (status == Constants.DRIVER_ACTIVE) ?	Constants.ACTIVE 	:Constants.DEACTIVE;
				}

				saveSystemLogs(req, res, {
					user_id				: req.session.user._id,
					parent_id			: tmpDriverId,
					activity_module		: Constants.SYSTEM_LOG_MODULE_DRIVER_MANAGEMENT,
					activity_type		: activityType,
					additional_details	: additionalDetails
				}).then(()=>{ });                
            });
        } catch (error) {
            console.error('Error in updateMultipleDriverDetails:', error);
            return res.send({ 
                status: Constants.STATUS_ERROR, 
                message: res.__("admin.system.something_going_wrong_please_try_again") 
            });
        }
    } // End updateMultipleDriverDetails()
}
export default UserManagement; 