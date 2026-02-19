import { ObjectId } from 'mongodb';
import axios from 'axios';
import https from 'https';
import * as Constants from "../../../../config/global_constant.mjs";
import Tables from '../../../../config/database_tables.mjs';
import {isPost, sanitizeData, getUtcDate, configDatatable, getRestaurantDropdowns,getRestaurantId,getRandomString,generateMD5Hash,arrayToObject,newDate,subtractMinute} from "../../../../utils/index.mjs";
import {sendMail} from "../../../../services/index.mjs";
import BREADCRUMBS from '../../../../breadcrumbs.mjs';
import aghzeyaModal from '../../../../modules/frontend/aghzeya/model/aghzeya.mjs';

export default class Restaurant {
    constructor(db) {
        this.db = db;
        this.aghzeyaModule = new aghzeyaModal(db);
    }

    /**
	 * Function to get menu list
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 *
	 * @return render/json
	 */
	async restaurantListing (req,res,next){
		let slug 	 = req.params.slug 	? req.params.slug : "";
		let type 	 = req.params.type 	? req.params.type : "";
		let id 	 	 = req.params.id 	? req.params.id   : "";
		let branchId = (req.query && req.query.branch) ?  req.query.branch : "";

        let restaurantList = await getRestaurantDropdowns(req,res,next,{slug : slug});

        req.breadcrumbs(BREADCRUMBS['admin/restaurants/list']);
        res.render('list',{
            restaurantList : restaurantList,
            slug 		   : slug,
            type           : type,
            id 	           : id,
            branch_id      : branchId
        });
	};//End restaurantListing()

	/**
	 * Function to get pending restaurant branch list
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 *
	 * @return render/json
	*/
	async pendingBranchList (req,res,next){
		if(isPost(req)){
			let limit		 = (req.body.length) 	?	parseInt(req.body.length)	:Constants.ADMIN_LISTING_LIMIT;
			let skip		 = (req.body.start)  	? 	parseInt(req.body.start)  	:Constants.DEFAULT_SKIP;
			const collection = this.db.collection(Tables.TMP_RESTAURANT_BRANCHES);

			/** Configure Datatable conditions*/
			let dataTableConfig = configDatatable(req,res,null);

            dataTableConfig.conditions = Object.assign(dataTableConfig.conditions,{submit_for_approval: true});

            // Get list or count of pending restaurant branches list
            let dbRes = await collection.aggregate([
                { $match: dataTableConfig.conditions },
                {$facet : {
                    list : [
                        {$sort: dataTableConfig.sort_conditions },
                        {$skip: skip },
                        {$limit: limit },
                        {$lookup:	{
                            "from" 			: 	Tables.RESTAURANTS,
                            "localField" 	:	"restaurant_id",
                            "foreignField"	: 	"_id",
                            "as" 			: 	"restaurant_detail"
                        }},
                        {$project :	{
                            _id:1,name:1,branch_number:1,status:1,address:1,restaurant_slug:1,branch_id:1,
                            restaurant_name: {$arrayElemAt : ["$restaurant_detail.default_name",0]},
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
			let searchStatus = (req.query && req.query.status) ? req.query.status : "";

            /** Get restaurant list dropdown **/
            let restaurantList = await getRestaurantDropdowns(req,res,next,{slug : req?.query?.restaurant || ""});

            /** render restaurant pending branch listing page **/
            req.breadcrumbs(BREADCRUMBS['admin/restaurant_pending_branches/list']);
            res.render('pending_branch_list',{
                restaurant_list : restaurantList,
                search_status 	: searchStatus,
            });
		}
	};//End pendingBranchList()

	/**
	 * Function to send new login credentials to user
	 *
	 * @param req As Request Data
	 * @param res As Response Data
	 *
	 * @return null
	 */
	async sendLoginCredentials (req, res,next){
        try{
            let restaurantSlug	= (req.params.slug) ? req.params.slug : "";

            let restaurantId = await getRestaurantId(req,res,next,{slug : restaurantSlug});

            const users	=	this.db.collection(Tables.USERS);
            let userResult = await users.findOne({
                restaurant_id : new ObjectId(restaurantId),
                user_role_id:Constants.RESTAURANT,
                user_type:Constants.USER_TYPE_RESTAURANT
            },{projection:{email:1,full_name:1,_id:1}});

            /** Send error response if user not found **/
            if(!userResult || !restaurantId){
                req.flash(Constants.STATUS_ERROR,res.__("admin.system.invalid_access"));
                return res.redirect(Constants.WEBSITE_ADMIN_URL+"restaurants/"+restaurantSlug+'/branches');
            }

            let randomResponse = await getRandomString(req,res,{srting_length: Constants.PASSWORD_MIN_LENGTH});

            /** Send error response  **/
            if(randomResponse.status != Constants.STATUS_SUCCESS){
                req.flash(Constants.STATUS_ERROR,res.__("admin.system.something_going_wrong_please_try_again"));
                return res.redirect(Constants.WEBSITE_ADMIN_URL+"restaurants/"+restaurantSlug+'/branches');
            }

            let password 	= randomResponse?.result ||"";
            let newPassword = generateMD5Hash(password);

            /** Update password **/
            await users.updateOne({
                _id : new ObjectId(userResult._id)
            },
            {$set : {
                password : newPassword,
                modified : getUtcDate()
            }});

            /** Send email **/
            if(userResult.email && userResult.full_name) sendMail(req,res,{
                to 			: userResult.email,
                action 		: "send_login_credentials",
                rep_array 	: [userResult.full_name,userResult.email,password,Constants.WEBSITE_URL]
            });

            req.flash(Constants.STATUS_SUCCESS,res.__("admin.pending_branches.login_credentials_send_successfully"));
            res.redirect(Constants.WEBSITE_ADMIN_URL+"restaurants/"+restaurantSlug+'/branches');
        }catch(err){
            next(err);
        }
	};//End sendLoginCredentials()

	/**
	* Function for add permission
	*
	* @param req 	As Request Data
	* @param res 	As Response Data
	* @param next 	As Callback argument to the middleware function
	*
	* @return null
	*/
	async addPermission (req, res, next){
		try{
			let restaurantSlug	= (req.params.slug) ? req.params.slug : "";
			let restaurantId	=	await getRestaurantId(req,res,next,{slug : restaurantSlug});

			const users    = this.db.collection(Tables.USERS);
            if(isPost(req)){
                /** Sanitize Data **/
                req.body 				= 	sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
                let branchPermission	=	(req.body.branch_manager)	?	req.body.branch_manager.split(",")	:[];
                let employeePermission 	=	(req.body.branch_employee)	?	req.body.branch_employee.split(",")	:[];

                /** Update user permission **/
                await users.updateOne({
                    restaurant_id : new ObjectId(restaurantId)
                },
                {$set : {
                    branch_permission   :	arrayToObject(branchPermission),
                    employee_permission :	arrayToObject(employeePermission),
                }});

                /** Send success response **/
                let message = res.__("admin.restaurants.permission_has_been_updated_successfully");
                req.flash(Constants.STATUS_SUCCESS,message);
                res.send({status: Constants.STATUS_SUCCESS, message: message});
            }else{
                let userResult = await users.findOne({restaurant_id : new ObjectId(restaurantId)},{projection:{branch_permission:1,employee_permission:1}});

                /** Send error response if user not found **/
                if(!userResult || !restaurantId){
                    return res.status(400).send({status: Constants.STATUS_ERROR,message: res.__("admin.system.invalid_access")});
                }

                res.render('add_permission',{
                    layout			:	false,
                    restaurant_slug	:	restaurantSlug,
                    result			:	userResult
                });
            }
        }catch(err){
            next(err);
        }
	};//End addPermission()

	/**
	* Function to sync with api
	*
	* @param req 	As Request Data
	* @param res 	As Response Data
	* @param next 	As Callback argument to the middleware function
	*
	* @return null
	*/
	async asyncWithApi (req, res, next){
        try{
            let restaurantSlug		=	req?.params?.slug || "";
            let onlyPaymentSource	= 	req?.params?.only_payment_source || false;

            /** Set conditions */
            let fieldKey	=	(onlyPaymentSource) ? "payment_sync_process_time"	:"sync_process_time";
            let restCondi 	=	{slug: restaurantSlug};

            /** Set update data */
            let updateObj = {};
            updateObj[fieldKey] = getUtcDate();

            /** Get restaurant details  */
            const restaurants = this.db.collection(Tables.RESTAURANTS);
            let result = await restaurants.findOneAndUpdate(restCondi,{$set: updateObj});

            /** Send error response */
            if(!result || !result?.aghzeya_restaurant_id){
                req.flash(Constants.STATUS_ERROR,res.__("admin.system.invalid_access"));
                return res.redirect(Constants.WEBSITE_ADMIN_URL+"restaurants/"+restaurantSlug+'/branches');
            }

            /** Send error response */
            if(result[fieldKey] && result[fieldKey] > newDate(subtractMinute(2)) ){
                req.flash(Constants.STATUS_ERROR,res.__("admin.restaurants.sync_process_already_running") );
                return res.redirect(Constants.WEBSITE_ADMIN_URL+"restaurants/"+restaurantSlug+'/branches');
            }

            req.flash(Constants.STATUS_SUCCESS,res.__("admin.restaurants.restaurant_synced_with_api"));
            res.redirect(Constants.WEBSITE_ADMIN_URL+"restaurants/"+restaurantSlug+'/branches');

			/** sync with api */
            this.aghzeyaModule.getAllRestaurantData(req,res,next,{
                restaurant_id: result.aghzeya_restaurant_id,
                only_payment_source: onlyPaymentSource
            });
        }catch(err){
            next(err);
        }
	};//End asyncWithApi()

	/**
	* Function for payment settings
	*
	* @param req 	As Request Data
	* @param res 	As Response Data
	* @param next 	As Callback argument to the middleware function
	*
	* @return null
	*/
	async paymentSettings (req, res, next){
		try{
            let restaurantSlug					= (req.params.slug)	? req.params.slug : "";
            let restaurantId					= await getRestaurantId(req, res, next, { slug: restaurantSlug });
            const restaurant_payment_settings	= this.db.collection(Tables.RESTAURANT_PAYMENT_SETTINGS);

            if (isPost(req)) {
                /** Sanitize Data **/
                req.body = sanitizeData(req.body, Constants.NOT_ALLOWED_TAGS_XSS);

                await restaurant_payment_settings.updateOne({
                    restaurant_id: new ObjectId(restaurantId)
                }, {
                    $set: {
                        uInterface_base_url			: req.body.uInterface_base_url,
                        uInterface_api_key			: req.body.uInterface_api_key,
                        uInterface_username			: req.body.uInterface_username,
                        uInterface_password			: req.body.uInterface_password,
                        uInterface_authorization_key: req.body.uInterface_authorization_key,
                        uInterface_merchant_id		: req.body.uInterface_merchant_id,
                        default_credential 			: false,
                        uInterface_test_mode		: (req.body.uInterface_test_mode != undefined) ? parseInt(1) : parseInt(0),
                        uInterface_whitelabled		: (req.body.uInterface_whitelabled != undefined) ? parseInt(1) : parseInt(0),
                        modified					: getUtcDate(),
                    },
                    $setOnInsert: {
                        restaurant_slug	: restaurantSlug,
                        created			: getUtcDate()
                    }
                }, { upsert: true });

                /** Send success response **/
                let message = res.__("admin.restaurants.payment_settings_has_been_updated_successfully");
                req.flash(Constants.STATUS_SUCCESS, message);
                res.send({
                    status: Constants.STATUS_SUCCESS,
                    message: message
                });
            } else {
                if(!restaurantId){
                    return res.status(400).send({status: Constants.STATUS_ERROR,message: res.__("admin.system.invalid_access")});
                }

                let result = await restaurant_payment_settings.findOne({ restaurant_id: new ObjectId(restaurantId) }, { projection: { uInterface_base_url: 1, uInterface_api_key: 1, uInterface_username: 1, uInterface_password: 1, uInterface_authorization_key: 1, uInterface_merchant_id: 1, uInterface_test_mode: 1, uInterface_whitelabled:1 } });

                res.render('payment_settings', {
                    layout			: false,
                    restaurant_slug	: restaurantSlug,
                    result			: result || {}
                });
            }
        }catch(err){
            next(err);
        }
	};//End paymentSettings()

	/**
	* Function to sync with dhub api
	*
	* @param req 	As Request Data
	* @param res 	As Response Data
	* @param next 	As Callback argument to the middleware function
	*
	* @return null
	*/
	async asyncWithDhubApi (req, res, next){
		try{
			let restSlug = req.params.slug;

			/** Get restaurant details  */
			const restaurants = this.db.collection(Tables.RESTAURANTS);
            let result = await restaurants.findOneAndUpdate({slug: restSlug},{$set: {dhub_sync_process_time: getUtcDate()}});

            /** Send error response */
            if(!result){
                req.flash(Constants.STATUS_ERROR,res.__("admin.system.invalid_access"));
                return res.redirect(Constants.WEBSITE_ADMIN_URL+"restaurants/"+restSlug+'/branches');
            }

            /** Send error response */
            if(result.dhub_sync_process_time > newDate(subtractMinute(2)) ){
                req.flash(Constants.STATUS_ERROR,res.__("admin.restaurants.sync_process_already_running") );
                return res.redirect(Constants.WEBSITE_ADMIN_URL+"restaurants/"+restSlug+'/branches');
            }

            req.flash(Constants.STATUS_SUCCESS,res.__("admin.restaurants.restaurant_synced_with_api"));
            res.redirect(Constants.WEBSITE_ADMIN_URL+"restaurants/"+restSlug+'/branches');

            /** sync with api */
            axios({
                method: 'GET',
                url: `${process.env.SIMPHONY_SERVER_URL}dhub-api/sync-restaurant-data/${result._id}`,
                httpsAgent: new https.Agent({ rejectUnauthorized: false })
            }).then(()=>{}).catch(next);
        }catch(err){
            next(err);
        }
	};//End asyncWithDhubApi()
}