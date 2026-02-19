import { ObjectId } from 'mongodb';
import { parallel as asyncParallel } from 'async';
import * as Constants from '../../../../config/global_constant.mjs';
import Tables from '../../../../config/database_tables.mjs';
import { isPost, sanitizeData, getUtcDate, configDatatable, generateMD5Hash, newDate, subtractDate, getDatabaseSlug, getCityList, getAreaList, getBlockList, getDropdownList, getConditionsBasedOnCallCenterRole, getWalletBalance, updateWalletBalance, round, cleanRegex } from '../../../../utils/index.mjs';
import { saveSystemLogs, saveReclaimLogs, insertNotifications } from '../../../../services/index.mjs';
import BREADCRUMBS from '../../../../breadcrumbs.mjs';
import customerAddressModal from '../../../../modules/frontend/api/model/customer_address.mjs';

class UserManagement {
    constructor(db) {
        this.db = db;
        this.customerAddressAPI = new customerAddressModal(db);
        this.usersCollection = db.collection(Tables.USERS);
        this.vehiclesCollection = db.collection(Tables.VEHICLES);
        this.ordersCollection = db.collection(Tables.ORDERS);
        this.addressesCollection = db.collection(Tables.CUSTOMER_ADDRESSES);
        this.walletTransactionsCollection = db.collection(Tables.WALLET_TRANSACTIONS);
        this.packagePurchasesCollection = db.collection(Tables.PACKAGE_PURCHASES);
        this.paymentRefundLogsCollection = db.collection(Tables.PAYMENT_REFUND_LOGS);
        this.customerAccountsCollection = db.collection(Tables.USER_ACCOUNTS_LOGS);
        this.userWalletLogsCollection = db.collection(Tables.USER_WALLET_LOGS);
    }

    /**
     * Function to get list of customers
     *
     * @param req As Request Data
     * @param res As Response Data
     * @param next As Callback argument to the middleware function
     *
     * @return render/json
     */
    async listCustomer(req, res, next) {
        try {
            let status		= req?.query?.active || '';
            let newUsers	= req?.query?.new_users ||false;
            let blacklisted	= req?.query?.blacklisted || '';
            let corporateId	= req?.query?.corporate_id || '';
            let customerId	= req?.query?.customer_id || '';

            if (isPost(req)) {
                let limit			= 	(req.body.length)	? parseInt(req.body.length)	: Constants.ADMIN_LISTING_LIMIT;
                let skip			= 	(req.body.start) 	? parseInt(req.body.start)	: Constants.DEFAULT_SKIP;
                let mobileNumber	= 	req?.body?.mobile_number || "";

                /** Configure Datatable conditions*/
                const dataTableConfig = await configDatatable(req, res, null);

                let commonConditions = {
					user_role_id : Constants.CUSTOMER,
					is_deleted 	 : Constants.NOT_DELETED
				};

				if(status) 		commonConditions['active']		  =	parseInt(status);
				if(blacklisted) commonConditions['is_black_list'] =	true;
				if(newUsers) 	commonConditions['created']	= {$lte: newDate(),$gte: subtractDate(Constants.RECENT_CUSTOMER_DAYS*Constants.HOURS_IN_A_DAY)};
				if(corporateId) commonConditions = {...{corporate_id : new ObjectId(corporateId)}, ...commonConditions };

				if(mobileNumber){
					try{
						mobileNumber = cleanRegex(mobileNumber);
						dataTableConfig.conditions["$or"] = [
							{ 'mobile_number' 	:	new RegExp(mobileNumber, "i") },
							{ 'cust_tele2'		: 	new RegExp(mobileNumber, "i") }
						];
					}catch(e){
						dataTableConfig.conditions["$or"] = [
							{ 'mobile_number':	mobileNumber },
							{ 'cust_tele2'	 : 	mobileNumber }
						];
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
                                _id: 1, full_name: 1, email: 1, modified: 1, active: 1, mobile_number: 1, is_black_list: 1
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
                    data: dbRes?.[0]?.list || [],
                    recordsTotal: dbRes?.[0]?.count?.[0]?.count || 0,
                    recordsFiltered: dbRes?.[0]?.count?.[0]?.count || 0
                });
            } else {
                /** render customer listing page **/
                req.breadcrumbs(BREADCRUMBS['admin/user_management/list_customer']);
                res.render('list_customer',{
                    status 		 : status,
                    blacklisted  : blacklisted,
                    new_users  	 : newUsers,
                    corporate_id : corporateId,
                    customer_id	 : customerId
                });
            }
        } catch (error) {
            next(error);
        }
    }

    /**
     * Function for add/edit customer
     *
     * @param req As Request Data
     * @param res As Response Data
     * @param next As Callback argument to the middleware function
     *
     * @return render/json
     */
    async addEditCustomer(req, res, next) {
        try {
            let authId = (req.session.user && req.session.user._id) ? req.session.user._id : "";
            let customerId = (req.params.id) ? new ObjectId(req.params.id) : new ObjectId();
            let isEditable = (req.params.id) ? true : false;

            if (isPost(req)) {
                /** Sanitize Data **/
                req.body = sanitizeData(req.body, Constants.NOT_ALLOWED_TAGS_XSS);
                let firstName       =   req?.body?.first_name || "";
                let lastName        =   req?.body?.last_name || "";
                let mobileNumber    =   req?.body?.mobile_number || "";
                let placeOrder      =   req?.body?.place_order || "";
                let custTele2       =   req?.body?.cust_tele2 || "";
                let fullName        =   firstName + ' ' + lastName;
                let password		=	(res.locals.settings['Site.default_password']) ? res.locals.settings['Site.default_password'] :'';

                /**Check mobile number is unique*/
                const existingUser = await this.usersCollection.findOne({
                    _id: { $ne: customerId },
                    is_deleted: Constants.NOT_DELETED,
                    mobile_number: mobileNumber
                }, { projection: { _id: 1, mobile_number: 1, user_role_id: 1 } });

                if(existingUser) {
                    if (existingUser.user_role_id == Constants.CUSTOMER) {
                        /** Send error response **/
                        return res.send({
                            status: Constants.STATUS_ERROR,
                            exists: true,
                            exist_id: existingUser._id
                        });
                    } else {
                        /** Send error response **/
                        return res.send({
                            status: Constants.STATUS_ERROR,
                            message: [{ 'param': 'mobile_number', 'msg': res.__("admin.user_management.mobile_number_is_already_exist") }]
                        });
                    }
                }

                /** Generate slug */
                let slug = "";
                if(!isEditable){
                    let slugRes = await getDatabaseSlug({ title: fullName, table_name: Tables.USERS, slug_field: "slug" });
                    slug = slugRes?.title || "";
                }

                /** Generate new password hash */
                let newPassword = "";
                if(password) newPassword = generateMD5Hash(password);

                /** Check user enter new mumber or old number */
                let isOldNumber = false;
                if(!isEditable) {
                    isOldNumber = await this.usersCollection.findOne({
                        _id : customerId,
                        mobile_number : mobileNumber,
                        cust_tele2 : custTele2
                    }, { projection: { _id: 1} });
                }

                let updateData	=	{
					$set : {
						first_name 		: 	firstName,
						last_name 		: 	lastName,
						full_name		: 	fullName,
						mobile_number	: 	mobileNumber,
						cust_tele2  	: 	custTele2,
						active 			:   Constants.ACTIVE,
						modified   		:	getUtcDate()
					},
					$setOnInsert : {
						user_role_id		: Constants.CUSTOMER,
						slug 				: slug,
						phone_country_code 	: Constants.DEFAULT_COUNTRY_CODE,
						user_type			: Constants.USER_TYPE_OTHER,
						is_verified 		: Constants.VERIFIED,
						is_email_verified	: Constants.VERIFIED,
						is_mobile_verified	: Constants.VERIFIED,
						is_deleted 			: Constants.NOT_DELETED,
						created_by			: new ObjectId(authId),
						created 			: getUtcDate(),
					}
				};

				if(newPassword) updateData["$set"]['password'] = newPassword;

                /** Save / update user data **/
                await this.usersCollection.updateOne({ _id: customerId }, updateData, { upsert: true });

                /** Send success response **/
                let message = (isEditable) ? res.__("admin.user_management.customer_updated_successfully") :res.__("admin.user_management.customer_has_been_added_successfully");
                req.flash(Constants.STATUS_SUCCESS, message);
                let redirectUrl= Constants.WEBSITE_ADMIN_URL+"user_management/list_customer"+(placeOrder && "?customer_id="+customerId || "");
                res.send({
                    status		: Constants.STATUS_SUCCESS,
                    redirect_url: redirectUrl
                });

                /** update mobile number in orders */
                if(!isOldNumber && isEditable) {
                    this.updateMobileNumberInOrders(req, res, next, { user_id: customerId });
                }

                /** Save system logs */
                saveSystemLogs(req, res, {
                    user_id: authId,
                    parent_id: customerId,
                    activity_module: Constants.SYSTEM_LOG_MODULE_CUSTOMER_MANAGEMENT,
                    activity_type: Constants.ACTIVITY_TYPE_ADD_EDIT,
                    additional_details: {}
                });
            } else {
                let response = {};
                if (isEditable) {
                    response = await this.getCustomerDetails(req, res, next);
                    if (response.status != Constants.STATUS_SUCCESS) {
                        /** Send error response **/
                        req.flash(Constants.STATUS_ERROR, response.message);
                        return res.redirect(Constants.WEBSITE_ADMIN_URL + "user_management/list_customer");
                    }
                }

                /** Render add / edit page  **/
                req.breadcrumbs(BREADCRUMBS['admin/user_management/'+(isEditable && 'edit_customer' || 'add_customer')]);
                res.render('add_customer', {
                    result: response?.result || {},
                    is_editable: isEditable
                });
            }
        } catch (error) {
            next(error);
        }
    }

    /**
     * Function to get customer detail
     *
     * @param req As Request Data
     * @param res As Response Data
     * @param next As Callback argument to the middleware function
     *
     * @return json
     */
    async getCustomerDetails(req, res, next) {
        try {
            let customerId = req.params.id || req.params.user_id || "";

            /** Get customer details **/
            const result = await this.usersCollection.aggregate([
				{$match:{
                    _id: new ObjectId(customerId)
                }},
				{$lookup: {
					'from'        : Tables.USERS,
					'localField'  : "referral_details.referred_by",
					'foreignField': "_id",
					'as'          : "user_detail",
				}},
				{$addFields:{
					referral_name:{ $arrayElemAt: ["$user_detail.full_name", 0] }
				}},
				{$project: {
					user_detail: 0,
				}},
			]). toArray();

            /** Send error response */
            if (!result.length) {
                return {
                    status: Constants.STATUS_ERROR,
                    message: res.__("admin.system.invalid_access")
                };
            }

            return {
                result: result?.[0] || {},
                status: Constants.STATUS_SUCCESS
            };
        } catch (error) {
            next(error);
        }
    }

    /**
	* Function to update customer mobile number in orders
	*
	* @param req	As Request Data
	* @param res	As Response Data
	* @param next 	As Callback argument to the middleware function
	*
	* @return json
	*/
	async updateMobileNumberInOrders(req,res,next,options={}) {
		try{
            if(!options?.user_id) return {status : Constants.STATUS_ERROR};

            let customerId = new ObjectId(options.user_id);

            /** get user data */
			const result = await this.usersCollection.findOne({_id : customerId},{projection : {mobile_number : 1,cust_tele2 : 1}});

            /** update mobile number in orders */
            await this.ordersCollection.updateMany({
                customer_id : customerId
            },
            {$set :{
                mobile_number : result?.mobile_number || "",
                cust_tele2	  : result?.cust_tele2 || ""
            }});

            return {status : Constants.STATUS_SUCCESS};
		}catch(error){
			next(error);
		}
	}//End updateMobileNumberInOrders()

    /**
     * Function for delete customer
     *
     * @param req As Request Data
     * @param res As Response Data
     * @param next As Callback argument to the middleware function
     *
     * @return null
     */
    async deleteCustomer(req, res, next) {
        try {
            // Delete customer
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

            // Save system logs
            saveSystemLogs(req, res, {
                user_id: req.session.user._id,
                parent_id: req.params.id,
                activity_module: Constants.SYSTEM_LOG_MODULE_CUSTOMER_MANAGEMENT,
                activity_type: Constants.ACTIVITY_TYPE_DELETE,
                additional_details: {}
            });

            // Send success response
            req.flash(Constants.STATUS_SUCCESS, res.__("admin.user_management.customer_deleted_successfully"));
            res.redirect(Constants.WEBSITE_ADMIN_URL + "user_management/list_customer");
        } catch (error) {
            next(error);
        }
    }

    /**
	 * Function for assign category to customer
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 * @param next 	As Callback argument to the middleware function
	 *
	 * @return null
	 */
	async assignCategoryToCustomer(req,res,next){
		try{
			let userId	= (req.params.id) ? new ObjectId(req.params.id) 	: "";

            if(isPost(req)){
                /** Sanitize Data **/
                req.body = sanitizeData(req.body, Constants.NOT_ALLOWED_TAGS_XSS);
                let category = req?.body?.category || "";

                /** Update details **/
                await this.usersCollection.updateOne({
                    _id : userId
                },{
                    $set : {
                        client_type : category,
                        modified    : getUtcDate()
                    }
                });

                /*send success response */
				res.send({status : Constants.STATUS_SUCCESS, message:  res.__("admin.user_management.category_has_been_assigned_successfully")});
            }else{
                let userResponse = await this.getCustomerDetails(req, res, next);

                /** Send response */
                if(userResponse.status != Constants.STATUS_SUCCESS) return res.status(400).send(userResponse);

                /** Render assign category page */
                res.render('assign_category',{
                    layout		  : false,
                    user_id		  : userId,
                    client_type   : userResponse?.result?.client_type || ""
                });
            }
        }catch(error){
            next(error);
        }
	};//End assignCategoryToCustomer()

	/**
	 * Function for update black list status
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 * @param next 	As Callback argument to the middleware function
	 *
	 * @return null
	 */
	async updateBlackListStatus(req, res, next){
		try{
			let isBlackList	= (req.params.status == Constants.BLACKLISTED) ? false : true;

            /** Update black list status **/
            await this.usersCollection.updateOne({
                _id : new ObjectId(req.params.id)
            },
            {$set : {
                is_black_list : isBlackList,
                modified	  : getUtcDate()
            }});

            let message = (isBlackList == true) ? res.__("admin.user_management.user_has_been_added_in_blacklist_successfully") : res.__("admin.user_management.user_has_been_removed_from_blacklist_successfully");

            /** Send success response **/
            req.flash(Constants.STATUS_SUCCESS,message);
            res.redirect(Constants.WEBSITE_ADMIN_URL+"user_management/list_customer");
        }catch(error){
            next(error);
        }
	};//End updateBlackListStatus()

    /**
	 * Function for update active/ deactive status
	 *
	 * @param req As Request Data
	 * @param res As Response Data
	 *
	 * @return null
	 */
	async updateCustomerStatus(req, res, next){
		try{
			let userId = (req.params.id) ? new ObjectId(req.params.id) : "";
			let status = (req.params.status==Constants.ACTIVE) ? Constants.DEACTIVE : Constants.ACTIVE;
			let action = (req.params.status==Constants.ACTIVE) ? Constants.RECLAIM_LOGS_DEACTIVE_ACTION : Constants.RECLAIM_LOGS_ACTIVE_ACTION;

			const user = await this.usersCollection.findOne({ _id: userId },{projection : {mobile_number:1}});

			let mobileNo	=	user?.mobile_number;
			const count = await this.usersCollection.countDocuments({ _id : {$ne : userId}, mobile_number: mobileNo, active:Constants.ACTIVE,is_deleted:Constants.NOT_DELETED});

			if (count > 0 && status == Constants.ACTIVE){
				/** Send success response **/
				req.flash(Constants.STATUS_ERROR,res.__("admin.user_management.cant_deactive"));
				res.redirect(Constants.WEBSITE_ADMIN_URL+'user_management/list_customer');
			}else{
				await this.usersCollection.updateOne({
                    _id : userId,
                },
                {$set : {
                    active	 : status,
                    modified : getUtcDate()
                }});

                /** Save system logs */
                saveSystemLogs(req, res, {
                    user_id				: req.session.user._id,
                    parent_id			: userId,
                    activity_module		: Constants.SYSTEM_LOG_MODULE_CUSTOMER_MANAGEMENT,
                    activity_type		: Constants.ACTIVITY_TYPE_STATUS_UPDATE,
                    additional_details	: {}
                }).then(()=>{ });

                /** Save reclaim logs */
                saveReclaimLogs(req, res, {
                    action_taken_by		: req.session.user._id,
                    user_id				: userId,
                    action				: action,
                    channel				: req.session.user.channel_id,
                }).then(()=>{ });

                /** Send success response **/
                req.flash(Constants.STATUS_SUCCESS,res.__("admin.user_management.customer_status_updated_successfully"));
                res.redirect(Constants.WEBSITE_ADMIN_URL+'user_management/list_customer');
            }
        }catch(error){
            next(error);
        }
	};// end updateCustomerStatus()

    /**
	* Function for add address
	*
	* @param req 	As Request Data
	* @param res 	As Response Data
	* @param next 	As Callback argument to the middleware function
	*
	* @return null
	*/
	async addEditCustomerAddress(req, res, next){
		try{
			let addressId		=	(req.params.id) ? new ObjectId(req.params.id) :"";
			let isEditable		= 	(req.params.id) ? true :false;
			let mainCustomerId	=	req.params.user_id || "";

            if(isPost(req)){
                /** Add id when edit guest **/
                if(addressId) req.body.id = addressId;

                req.body.user_id = 	mainCustomerId;
                this.customerAddressAPI.addEditAddress(req, res,next).then(response=>{
                    if(response.status != Constants.STATUS_SUCCESS) return res.send(response);

                    /** Send success response **/
                    res.send({
                        status 		: Constants.STATUS_SUCCESS,
                        message 	: response.message,
                        redirect_url: Constants.WEBSITE_ADMIN_URL+"user_management/list_customer"
                    });
                }).catch(next);
            }else{
                let response = {};
                let cityId	 = '';
                let areaId	 = '';
                let blockId	 = '';
                asyncParallel({
                    address_details : (callback)=>{
                        if(!isEditable) return callback(null,{});

                        req.body = {address_id: addressId, user_id: mainCustomerId};
                        this.customerAddressAPI.getAddressDetails(req, res,next).then(addressResponse=>{
                            response	= addressResponse;
                            cityId		= (response.result) ? response.result.city_id : '';
                            areaId		= (response.result) ? response.result.area_id : '';
                            blockId		= (response.result) ? response.result.block_id : '';
                            callback(null,response);
                        });
                    },
                    user_details : (callback)=>{
                        if(isEditable) return callback(null,{});

                        this.getCustomerDetails(req, res, next).then(customerResponse=>{
                            callback(null,customerResponse?.result || {});
                        }).catch(next);
                    },
                }, async(_,parallelResponse)=>{
                    if(response.status != Constants.STATUS_SUCCESS && isEditable){
                        /** Send error response **/
                        return res.status(400).send({
                            status  : Constants.STATUS_ERROR,
                            message : res.__("system.something_going_wrong_please_try_again")
                        });
                    }

                    let cityList  = await getCityList(req,res,next,{city_id : cityId});
                    let areaList  = await getAreaList(req,res,next,{city_id : cityId,area_id:areaId});
                    let blockList = await getBlockList(req,res,next,{area_id:areaId,block_id : blockId});

                    /** render add/edit address page **/
                    res.render('add_edit_address',{
                        layout			:	false,
                        is_editable		:	isEditable,
                        city_list 		:	cityList,
                        area_list 		:	areaList,
                        block_list 		:	blockList,
                        user_id			:	mainCustomerId,
                        result		    :   response?.result || {},
                        customer_details:	parallelResponse?.user_details || {}
                    });
                });
            }
        }catch(error){
            next(error);
        }
	};//End addEditCustomerAddress()

    /**
	 * Function to load map to show in address
	 *
	 * @param req As Request Data
	 * @param res As Response Data
	 *
	 * @return null
	 */
	async loadMap(req, res, next) {
		res.render('load_map',{
			layout : false
		})
	};//End loadMap()

    /**
	 * Function for get area list
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 * @param next 	As Callback argument to the middleware function
	 *
	 * @return render/json
	 */
	async getAreaList(req,res,next){
		let cityId	= (req.body.city_id) ? req.body.city_id :"";

		/** Send error response */
		if(!cityId) return res.send({ status: Constants.STATUS_ERROR, message: res.__("system.something_going_wrong_please_try_again") });

		/** Get area list */
		let response = await getAreaList(req,res,next,req.body);

		/** Send response  */
		res.send({status: Constants.STATUS_SUCCESS, result: response});
	};//End getAreaList()

	/**
	 * Function for get block list
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 * @param next 	As Callback argument to the middleware function
	 *
	 * @return render/json
	 */
	async getBlockList(req,res,next){
		let areaId	= (req.body.area_id) ? req.body.area_id :"";

		/** Send error response */
		if(!areaId) return res.send({status: Constants.STATUS_ERROR, message: res.__("system.something_going_wrong_please_try_again") });

		/** Get area list */
		let response = await getBlockList(req,res,next,req.body);

		/** Send response  */
		res.send({status: Constants.STATUS_SUCCESS, result: response});
	};//End getBlockList()

    /**
	 * Function for view address details
	 *
	 * @param req As Request Data
	 * @param res As Response Data
	 *
	 * @return render
	 */
	async viewAddressDetails(req, res, next){
        try{
            /** Set address details */
            req.body = {address_id: req.params.id, user_id: req.params.user_id};
            let addressResponse = await this.customerAddressAPI.getAddressDetails(req, res, next);

            if(addressResponse.status != Constants.STATUS_SUCCESS) return res.status(400).send(addressResponse);

            /** Render address list page */
            res.render('view_customer_address',{
                layout: false,
                result: addressResponse?.result || {},
            });
        }catch(error){
            next(error);
        }
	};//End viewAddressDetails()

    /**
	 * Function for view customer
	 *
	 * @param req As Request Data
	 * @param res As Response Data
	 *
	 * @return render
	 */
	async viewCustomerDetails(req, res, next){
        try{
            let userResponse = await this.getCustomerDetails(req, res, next);

            /** Send error response when user not found */
            if(userResponse.status != Constants.STATUS_SUCCESS){
                req.flash(Constants.STATUS_ERROR, res.__("admin.system.invalid_access"));
                return res.redirect(Constants.WEBSITE_ADMIN_URL+"user_management/list_customer");
            }


            /** Render view page */
            req.breadcrumbs(BREADCRUMBS['admin/user_management/view_customer']);
            res.render('view_customer',{
                type    : req.params.type || "",
                user_id : req.params.id,
                result  : userResponse?.result || {}
            });
        }catch(error){
            next(error);
        }
	};//End viewCustomerDetials()

    /**
	 * Function for get customer order list
	 *
	 * @param req As Request Data
	 * @param res As Response Data
	 *
	 * @return render
	 */
	async getCustomerOrderList(req, res, next){
        try{
            let userId		= (req.params.id)	? req.params.id : '';
            if(isPost(req)){
                let fromDate  	= 	(req.body.fromDate) ? req.body.fromDate : "";
                let toDate 	  	= 	(req.body.toDate)   ? req.body.toDate 	: "";
                let limit		=   (req.body.length)   ? parseInt(req.body.length)	: Constants.ADMIN_LISTING_LIMIT;
                let skip		=   (req.body.start)	? parseInt(req.body.start)	: Constants.DEFAULT_SKIP;
                let authRoleId	=	(req.session.user.user_role_id)	? req.session.user.user_role_id :Constants.CUSTOMER;
                let teamHead	= 	req.session.user.team_head	? req.session.user.team_head 	:false;

                /** Configure Datatable conditions*/
                const dataTableConfig = await configDatatable(req, res, null);

                let commonConditions = {};
                if(authRoleId == Constants.CALL_CENTER_TEAM && !teamHead){
                    /** Get call center conditions */
                    let callCenterConditions = await getConditionsBasedOnCallCenterRole(req,res,next);

                    if(callCenterConditions?.conditions?.length >0){
                        callCenterConditions.conditions.push({delivery_type : Constants.DELIVERY_BY_PICK_UP});
                        commonConditions["$or"] = callCenterConditions.conditions;
                    }else{
                        /** Send response **/
                        return res.send({
                            status			: Constants.STATUS_SUCCESS,
                            draw			: dataTableConfig.result_draw,
                            data			: [],
                            recordsFiltered	: 0,
                            recordsTotal	: 0,
                        });
                    }
                }
                dataTableConfig.conditions['customer_id'] = new ObjectId(userId);

                /** Conditions for order date */
                if (fromDate != "" && toDate != "") {
                    dataTableConfig.conditions["order_date"] = {
                        $gte 	: newDate(fromDate),
                        $lte 	: newDate(toDate),
                    };
                }
                dataTableConfig.conditions = Object.assign(dataTableConfig.conditions,commonConditions);

                let dbRes = await this.ordersCollection.aggregate([
                    {$match: dataTableConfig.conditions },
                    {$facet : {
                        list : [
                            {$sort: dataTableConfig.sort_conditions },
                            {$skip: skip },
                            {$limit: limit },
                            {$lookup: {	/** Get order details **/
                                from 		:	Tables.ORDER_DETAILS,
                                localField  :	"_id",
                                foreignField:	"order_id",
                                as 		  	:	'order_details'
                            }},
                            {$project : {
                                _id:1,customer_id:1,restaurant_id:1,is_confirm:1,invoice_number:1,unique_order_id:1,order_date:1,last_status_updated_on:1,restaurant_name:1,order_price:1,order_status:1,net_amount:1,is_modified:1,delivery_type:1,payment_method:1, customer_latitude: {$arrayElemAt: ["$order_details.customer_latitude",0]}, customer_longitude: {$arrayElemAt: ["$order_details.customer_longitude",0]}, delivery_duration: {$arrayElemAt: ["$order_details.delivery_duration",0]},amount_debited_by_wallet:1,source:1,source_payment_name:1,
                            }},
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
                    recordsFiltered	:  	dbRes?.[0]?.count?.[0]?.count || 0
                });
            }else{
                let dropDownResponse = await getDropdownList(req,res, next,{
                    collections :[{
                        collection : Tables.RESTAURANTS,
                        columns    : ["_id",["name",Constants.DEFAULT_LANGUAGE_CODE]],
                        conditions : {
                            status		: Constants.ACTIVE,
                            is_deleted	: Constants.NOT_DELETED
                        },
                    }],
                });

                /** Send error response when dropdown list not found */
                if(dropDownResponse.status != Constants.STATUS_SUCCESS) return res.status(400).send(dropDownResponse);

                /** Render order list page */
                res.render('customer_order_list',{
                    layout			: false,
                    user_id			: userId,
                    from_date 		: req?.query?.from_date || "",
                    to_date 		: req?.query?.to_date || "",
                    restaurant_list	: dropDownResponse?.final_html_data?.[0] || "",
                });
            }
        }catch(error){
            next(error);
        }
	};//End getCustomerOrderList()

    /**
	 * Function for get customer address list
	 *
	 * @param req As Request Data
	 * @param res As Response Data
	 *
	 * @return render
	 */
	async getCustomerAddressList(req, res, next){
        try{
            let userId	=	(req.params.id) ? req.params.id : '';
            if(isPost(req)){
                let limit			= 	(req.body.length)	? parseInt(req.body.length)	: Constants.ADMIN_LISTING_LIMIT;
                let skip			= 	(req.body.start) 	? parseInt(req.body.start)	: Constants.DEFAULT_SKIP;

                /** Configure Datatable conditions*/
                const dataTableConfig = await configDatatable(req, res, null);

                /** Common conditions */
                let commonConditions = {user_id: new ObjectId(userId)};

                dataTableConfig.conditions = Object.assign(dataTableConfig.conditions,commonConditions);

                let dbRes = await this.addressesCollection.aggregate([
                    {$match: dataTableConfig.conditions },
                    {$facet : {
                        list : [
                            {$sort: dataTableConfig.sort_conditions },
                            {$skip: skip },
                            {$limit: limit },
                            {$lookup: {	/** Get order details **/
                                from 		:	Tables.CITIES,
                                localField  :	"city_id",
                                foreignField:	"_id",
                                as 		  	:	'city_details'
                            }},
                            {$lookup: {	/** Get order details **/
                                from 		:	Tables.AREAS,
                                localField  :	"area_id",
                                foreignField:	"_id",
                                as 		  	:	'area_details'
                            }},
                            {$lookup: {	/** Get order details **/
                                from 		:	Tables.AREA_BLOCKS,
                                localField  :	"block_id",
                                foreignField:	"_id",
                                as 		  	:	'block_details'
                            }},
                            {$project : {
                                city_id : 1,area_id : 1, block_id : 1, street : 1, address_type:1,
                                city_name : {$arrayElemAt: ["$city_details.name", 0]},
                                area_name : {$arrayElemAt: ["$area_details.name", 0]},
                                block_name : {$arrayElemAt: ["$block_details.name", 0]},
                            }},
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
                    recordsFiltered	:  	dbRes?.[0]?.count?.[0]?.count || 0
                });
            }else{
                /** Render address list page */
                res.render('customer_address_list',{
                    layout  : false,
                    user_id : userId,
                });
            }
        }catch(error){
            next(error);
        }
	};//End getCustomerAddressList()

    /**
	 * Function for get packages list
	 *
	 * @param req As Request Data
	 * @param res As Response Data
	 *
	 * @return render
	 */
	async getPackagesList(req, res, next){
        try{
            let userId	=	(req.params.id) ? req.params.id : '';
            if(isPost(req)){
                let limit			= 	(req.body.length)	? parseInt(req.body.length)	: Constants.ADMIN_LISTING_LIMIT;
                let skip			= 	(req.body.start) 	? parseInt(req.body.start)	: Constants.DEFAULT_SKIP;

                /** Configure Datatable conditions*/
                const dataTableConfig = await configDatatable(req, res, null);

                /** Common conditions */
                let commonConditions = {user_id: new ObjectId(userId)};

                dataTableConfig.conditions = Object.assign(dataTableConfig.conditions,commonConditions);

                let dbRes = await this.packagePurchasesCollection.aggregate([
                    {$match: dataTableConfig.conditions },
                    {$facet : {
                        list : [
                            {$sort: dataTableConfig.sort_conditions },
                            {$skip: skip },
                            {$limit: limit },
                            {$lookup: {	/** Get order details **/
                                from 		:	Tables.PACKAGES,
                                localField  :	"package_id",
                                foreignField:	"_id",
                                as 		  	:	'package_details'
                            }},
                            {$lookup: {	/** Get order details **/
                                from 		:	Tables.USERS,
                                localField  :	"friend_id",
                                foreignField:	"_id",
                                as 		  	:	'user_details'
                            }},
                            {$project : {
                                _id:1,amount:1,valid_till:1,number_of_orders:1,friend_id:1,package_name: {$arrayElemAt : ["$package_details.title",0]},friend_name: {$arrayElemAt : ["$user_details.full_name",0]},
                            }},
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
            }else{
                /** Render package list page */
                res.render('package_purchased',{
                    layout  : false,
                    user_id : userId,
                });
            }
        }catch(error){
            next(error);
        }
	};//End getPackagesList()

    /**
	 * Function for get refund list
	 *
	 * @param req As Request Data
	 * @param res As Response Data
	 *
	 * @return render
	 */
	async getRefundList(req, res, next){
        try{
            let userId	=	(req.params.id) ? req.params.id : '';
            if(isPost(req)){
                let limit			= 	(req.body.length)	? parseInt(req.body.length)	: Constants.ADMIN_LISTING_LIMIT;
                let skip			= 	(req.body.start) 	? parseInt(req.body.start)	: Constants.DEFAULT_SKIP;
                let walletType		= 	(req.body.wallet_type) ? req.body.wallet_type	: "";

                /** Configure Datatable conditions*/
                const dataTableConfig = await configDatatable(req, res, null);

                /** Common conditions */
                let commonConditions = {user_id: new ObjectId(userId),payment_type: Constants.ORDER_REFUND_PAYMENT};

                if(walletType){
                    if(walletType == Constants.REFUND_AMOUNT){
                        dataTableConfig.conditions["$or"] = [
                            {wallet_type : {$exists: false}},
                            {wallet_type : walletType},
                        ];
                    }else{
                        dataTableConfig.conditions.wallet_type = walletType;
                    }
                }

                dataTableConfig.conditions = Object.assign(dataTableConfig.conditions,commonConditions);

                let dbRes = await this.paymentRefundLogsCollection.aggregate([
                    {$match: dataTableConfig.conditions },
                    {$facet : {
                        list : [
                            {$sort: dataTableConfig.sort_conditions },
                            {$skip: skip },
                            {$limit: limit},
                            {$project: {
                                order_id:1,unique_order_id : 1, total_amount : 1,payment_detail : 1, status : 1, created : 1, refunded_on:1, wallet_type: 1,
                            }},
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
            }else{
                /** Render refund list page */
                res.render('refund_list',{
                    layout  : false,
                    user_id : userId,
                });
            }
        }catch(error){
            next(error);
        }
	};//End getRefundList()

    /**
	 * Function for get customer account list
	 *
	 * @param req As Request Data
	 * @param res As Response Data
	 *
	 * @return render
	 */
	async getCustomerAccountList(req, res, next){
		try{
			let userId	=	(req.params.id) ? req.params.id : '';
            if(isPost(req)){
                let limit			= 	(req.body.length)	? parseInt(req.body.length)	: Constants.ADMIN_LISTING_LIMIT;
                let skip			= 	(req.body.start) 	? parseInt(req.body.start)	: Constants.DEFAULT_SKIP;


                /** Configure Datatable conditions*/
                const dataTableConfig = await configDatatable(req, res, null);

                /** Common conditions */
                let commonConditions = {
					user_id : new ObjectId(userId),
					$and 	: [{
                        action: {$in :[
                            Constants.RECLAIM_LOGS_ACTIVE_ACTION,
                            Constants.RECLAIM_LOGS_DEACTIVE_ACTION,
                            Constants.RECLAIM_LOGS_RECLAIM_ACTION,
                            Constants.RECLAIM_LOGS_REGISTRATION
                        ]}
                    }]
                };

                dataTableConfig.conditions = Object.assign(dataTableConfig.conditions,commonConditions);

                let dbRes = await this.customerAccountsCollection.aggregate([
                    {$match: dataTableConfig.conditions },
                    {$facet : {
                        list : [
                            {$sort: dataTableConfig.sort_conditions },
                            {$skip: skip },
                            {$limit: limit},
                            {$lookup : {
								from 		 : Tables.USERS,
								localField 	 : "action_taken_by",
								foreignField : "_id",
								as 			 : "user_details"
							}},
							{$project : {
                                _id:1,action:1,channel:1,created:1,action_taken_by: {$arrayElemAt : ["$user_details.full_name",0]}
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
                    recordsFiltered	:  	dbRes?.[0]?.count?.[0]?.count || 0
                });
            }else{
               /** Render account list page */
                res.render('customer_account_list',{
                    layout  : false,
                    user_id : userId,
                });
            }
        }catch(error){
            next(error);
        }
	};//End getCustomerAccountList()

    /**
	 * Function for view customer wallet details
	 *
	 * @param req As Request Data
	 * @param res As Response Data
	 *
	 * @return render
	 */
	async customerWalletDetails(req, res, next){
        try{
            let userId	=	(req.params.id) ? req.params.id : '';

            /** Get customer details */
            let userResponse = await this.getCustomerDetails(req, res, next);

            /** Send error response when user not found */
            if(userResponse.status != Constants.STATUS_SUCCESS) return res.status(400).send(userResponse);

            /** Get wallet balance */
            let walletResponse = await getWalletBalance(req, res, next,{user_id:userId});

            /** Render details page */
            res.render('customer_wallet_details',{
                layout		: false,
                result		: walletResponse,
                customer_id : req.params.id,
                customer_detail : userResponse?.result || {},
            });
        }catch(error){
            next(error);
        }
	};//End customerWalletDetails()

    /**
	 * Function for add amount in wallet
	 *
	 * @param req As Request Data
	 * @param res As Response Data
	 *
	 * @return render/json
	 */
    async addWalletAmount(req, res, next){
        try{
            let authId		= (req.session.user && req.session.user._id)? new ObjectId(req.session.user._id) :"";
            let customerId	= new ObjectId(req.params.id);

            if(isPost(req)){
                /** Sanitize Data **/
                req.body    =   sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
                let amount  =   parseFloat(req?.body?.amount || 0);

                /** Set amount options */
                let creditOptions = {
                    user_id 		 : customerId,
                    amount 			 : round(amount),
                    wallet_type  	 : req.body.wallet_type,
                    transaction_type : Constants.CREDIT,
                    extra_parameters : { added_by : authId, date_time : getUtcDate()},
                };

                /** Add amount in wallet */
                const creditResponse = await updateWalletBalance(req,res,next,{
                    user_id 		 : customerId,
                    amount 			 : round(amount),
                    wallet_type  	 : req.body.wallet_type,
                    transaction_type : Constants.CREDIT,
                    extra_parameters : { added_by : authId, date_time : getUtcDate()},
                });

                /** Send response */
                let message = creditResponse.message;
                if(creditResponse.status == Constants.STATUS_SUCCESS) message = res.__("admin.user_management.amount_has_been_added_successfully")
                req.flash(creditResponse.status,message);
                res.send({
                    status		: Constants.STATUS_SUCCESS,
                    redirect_url: Constants.WEBSITE_ADMIN_URL+"user_management/view_customer/"+customerId,
                });

                /*************** Send notification  ***************/
                     let notificationMessageParams = [Constants.WALLET_TYPE[req.body.wallet_type],round(amount)];
                    insertNotifications(req,res,{
                        notification_data : {
                            notification_type 	: Constants.NOTIFICATION_ADD_WALLET_AMOUNT,
                            message_params 		: notificationMessageParams,
                            parent_table_id 	: customerId,
                            user_ids 			: [customerId],
                            role_id 			: Constants.CUSTOMER,
                            extra_parameters 	: {user_ids: [customerId]}
                        }
                    });
                /*************** Send notification  ***************/
            }else{
                /** Render add wallet amount page */
                res.render('add_wallet_amount',{
                    customer_id : customerId,
                    layout		: false
                });
            }
        }catch(error){
            next(error);
        }
	};//End addWalletAmount()

    /**
	 * Function for get customer wallet transaction/ reward points list
	 *
	 * @param req As Request Data
	 * @param res As Response Data
	 *
	 * @return render
	 */
	async getCustomerWalletTransactionAndRewardPointsList(req, res, next){
        try{
            let userId		= (req.params.id)   ? req.params.id 	: '';
            let walletType  = (req.params.type) ? req.params.type   : "";

            if(isPost(req)){
                let limit   =   (req.body.length)	? parseInt(req.body.length)	: Constants.ADMIN_LISTING_LIMIT;
                let skip    =   (req.body.start) 	? parseInt(req.body.start)	: Constants.DEFAULT_SKIP;

                /** Configure Datatable conditions*/
                const dataTableConfig = await configDatatable(req, res, null);

                /** Common conditions */
                let commonConditions = {
                    user_id : new ObjectId(userId),
                    $and :[
                        {wallet_type : {$ne : Constants.POINTS_AMOUNT}},
                    ]
                };

                /** Set condition if type is points amount **/
				if(walletType) commonConditions["$and"] = [{wallet_type : walletType}];

                dataTableConfig.conditions = Object.assign(dataTableConfig.conditions,commonConditions);

                let dbRes = await this.userWalletLogsCollection.aggregate([
                    {$match: dataTableConfig.conditions },
                    {$facet : {
                        list : [
                            {$sort: dataTableConfig.sort_conditions },
                            {$skip: skip },
                            {$limit: limit},
                            {$project: {
                                _id : 1,transaction_id : 1,transaction_type : 1,wallet_type : 1,amount : 1,remaining_amount:1,created:1
                            }},
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
            }else{
                /** Render customer wallet transaction / reward points list page */
                res.render('customer_wallet_transaction_and_reward_points_list',{
                    layout  	: false,
                    user_id 	: userId,
                    wallet_type : walletType
                });
            }
        }catch(error){
            next(error);
        }
	};//End getCustomerWalletTransactionAndRewardPointsList()

    /**
	 * Function for get customer verification list
	 *
	 * @param req As Request Data
	 * @param res As Response Data
	 *
	 * @return render
	 */
	async getCustomerVerificationList(req, res, next){
        try{
            let userId	=	(req.params.id) ? req.params.id :'';

            if(isPost(req)){
                let limit			= 	(req.body.length)	? parseInt(req.body.length)	: Constants.ADMIN_LISTING_LIMIT;
                let skip			= 	(req.body.start) 	? parseInt(req.body.start)	: Constants.DEFAULT_SKIP;
                const collection	= 	this.customerAccountsCollection;

                /** Configure Datatable conditions*/
                const dataTableConfig = await configDatatable(req,res,null);

                /** Common conditions */
                let commonConditions = {
                    user_id : new ObjectId(userId),
                    $and	: [{ action  : {$in :[
                        Constants.RECLAIM_LOGS_VERIFY_MOBILE_ACTION,
                        Constants.RECLAIM_LOGS_VERIFY_EMAIL_ACTION
                    ]}}]
                };

                dataTableConfig.conditions = Object.assign(dataTableConfig.conditions,commonConditions);

                let dbRes = await this.customerAccountsCollection.aggregate([
                    {$match: dataTableConfig.conditions },
                    {$facet : {
                        list : [
                            {$sort: dataTableConfig.sort_conditions },
                            {$skip: skip },
                            {$limit: limit},
                            {$lookup : {
                                from 		 : Tables.USERS,
                                localField 	 : "verified_by",
                                foreignField : "_id",
                                as 			 : "verified_by_details"
                            }},
                            {$project : {
                                _id:1,action:1,channel:1,created:1,retry_count:1,function:1,status:1,sender :1,reset_tries: 1,verification_type : 1, otp:1,expiry_date : 1,verified_by_name: {$arrayElemAt : ["$verified_by_details.full_name",0]},
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
                    recordsFiltered	:  	dbRes?.[0]?.count?.[0]?.count || 0
                });
            }else{
                /** Render verification list page */
                res.render('customer_verification_list',{
                    layout  : false,
                    user_id : userId,
                });
            }
        }catch(error){
            next(error);
        }
	};//End getCustomerVerificationList()

    /**
	 * Function for pay outstanding
	 *
	 * @param req As Request Data
	 * @param res As Response Data
	 *
	 * @return null
	 */
	async payOutstanding(req, res, next){
        try{
            let userId 			= 	new ObjectId(req.params.id);
            let redirectFlag 	=	(req.query.view_redirect) ? req.query.view_redirect :"";
            let redirectUrl 	=	(redirectFlag) ? "user_management/view_customer/"+userId : "user_management/list_customer";

            /** Pay  user outstanding */
            let PayRes = await payUserOrderOutstanding(req, res, next,{user_id: userId });

            /** Send response **/
			let msg = (PayRes.status == Constants.STATUS_SUCCESS) ?  res.__("admin.user_management.outstainding_amount_paid_successfully") :PayRes.message;
			req.flash(PayRes.status, msg );
			res.redirect(Constants.WEBSITE_ADMIN_URL+redirectUrl);
        }catch(error){
            next(error);
        }
	};//End payOutstanding()

}
export default UserManagement;