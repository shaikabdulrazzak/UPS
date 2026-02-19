import { ObjectId } from 'mongodb';
import clone from 'clone';
import { parallel as asyncParallel} from 'async';
import * as Constants from "../../../../config/global_constant.mjs";
import Tables from '../../../../config/database_tables.mjs';
import { sanitizeData, getUtcDate, refundAmount, cleanRegex, getMasterList, convertDataToMultiLanguage, newDate, addDaysToDate, round, getDifferenceBetweenTwoDatesInMinute,currencyFormat,applyValidationInterCallFunction} from "../../../../utils/index.mjs";
import { sendMailToUsers} from "../../../../services/index.mjs";
import { contactUsValidation } from '../validations/home.mjs';

import orderModel from './order.mjs';

export default class Home {
	constructor(db) {
		this.db = db;
		
		this.orderAPI = new orderModel(db);
	}

	/**
	 * Function to get cms details
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	**/
	async getCmsDetails (req,res,next){
		return new Promise(async resolve=>{
			try{
				/** Sanitize Data **/
				req.body 	    =	sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
				let slug        = 	req?.body?.slug || "";
				let languageId	= 	req?.body?.language_id || Constants.DEFAULT_LANGUAGE_MONGO_ID;
	
				/** Send error response **/
				if(!slug) return resolve({status : Constants.STATUS_ERROR, message : res.__("system.missing_parameters")});
	
				/**Set condition  */
				let conditions = {slug : slug };
				conditions[`pages_descriptions.${languageId}.language_id`] = languageId;
	
				/** Set fields */
				let projectionFields = { _id: 0};
				projectionFields[`pages_descriptions.${languageId}.body`] = 1;
				projectionFields[`pages_descriptions.${languageId}.name`] = 1;
	
				/**Get details from pages */
				const pages	= this.db.collection(Tables.PAGES);
				let pageResult = await pages.findOne(conditions,{projection : projectionFields});
	
				/** Send error response */
				if(!pageResult) return resolve({status: Constants.STATUS_ERROR, message: res.__("admin.system.invalid_access")});

				pageResult 		=	pageResult?.pages_descriptions?.[languageId] || {};
				pageResult.body = 	pageResult?.body?.replace(new RegExp('WEBSITE_IMG_URL/','g'),Constants.WEBSITE_IMG_URL) ||"";

				/** Send success response **/
				resolve({status: Constants.STATUS_SUCCESS,result: pageResult});
			}catch(err){
				return next(err);
			}
        }).catch(next);
	};// end getCmsDetails()

	/**
	 * Function is used to to site settings
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	*/
	async getSystemSettings (req,res,next){
		return new Promise(async resolve=>{
			try{
				/** Sanitize Data **/
				req.body 	    =	sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
				let keysArray	= 	req?.body?.settings || [];

				/**Check For keysArray */
				if(!keysArray) return resolve({status : Constants.STATUS_ERROR, message : res.__("system.missing_parameters")});
				
				let settingsData	= {};
				if(keysArray.length > 0){
					keysArray.forEach(key =>{
						settingsData[key] = res?.locals?.settings?.[key] || '';
					});
				}

				/**Send success Response */
				resolve({status : Constants.STATUS_SUCCESS, result: settingsData, file_path : Constants.SETTING_FILE_URL});
			}catch(err){
				return next(err);
			}
		}).catch(next);
	};// End getSystemSettings

	/**
	 * Function to get faq details
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	**/
	async getFaqList (req,res,next){
		return new Promise(async resolve=>{
			try{
				/**Set condition for faqs */
				let conditions = {is_active : Constants.ACTIVE};

				let categoryId 		= req?.body?.category_id ? new ObjectId(req.body.category_id) : "";
				let subCategoryId 	= req?.body?.sub_category_id ? new ObjectId(req.body.sub_category_id) : "";

				if(categoryId) conditions.category_id 			= categoryId;
				if(subCategoryId) conditions.sub_category_id 	= subCategoryId;

				/**For get faq details */
				const faqs = this.db.collection(Tables.FAQS);
				let faqResult = await faqs.aggregate([
					{$match : conditions},
					{$lookup:{
						"from"			: Tables.MASTERS,
						"localField" 	: "category_id",
						"foreignField"	: "_id",
						"as" 			: "category_details"
					}},
					{$lookup:{
						"from"			: Tables.MASTERS,
						"localField" 	: "sub_category_id",
						"foreignField"  : "_id",
						"as" 			: "sub_category_details"
					}},
					{$project:{
						_id:1,question:1,answer:1,created:1,
						category_name: {$arrayElemAt : ["$category_details.name",0]},
						sub_category_name: {$arrayElemAt : ["$sub_category_details.name",0]}
					}}
				]).sort({_id:Constants.SORT_DESC}).toArray();

				/**Send success response */
				resolve({status	: Constants.STATUS_SUCCESS,result: faqResult});
			}catch(err){
				return next(err);
			}
		}).catch(next);
	}// end getFaqList()

	/**
	 * Function to get all packages
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	**/
	async getAllPackages (req,res,next){
		return new Promise(async resolve=>{
			try{
				/**Set condition for get all packages */
				let conditions = {
					valid_from : { $lte : getUtcDate()},
					valid_to   : { $gte : getUtcDate()}
				};

				/**For get all packages */
				const packages = this.db.collection(Tables.PACKAGES);
				let packagesResult = await packages.find(conditions,{projection: { _id: 1,amount:1,title:1,days:1,number_of_orders:1,days:1,tags:1,name:1}}).toArray();

				/** Send error response */
				if(!packagesResult) return resolve({status: Constants.STATUS_ERROR, message: res.__("admin.system.no_record_found")});

				/**Send success response */
				resolve({
					status	: Constants.STATUS_SUCCESS,
					result	: packagesResult,
					enable_infinity_package	: res?.locals?.settings?.["App.enable_infinity_package"] ||''
				});
			}catch(err){
				return next(err);
			}
		}).catch(next);
	}// end getAllPackages()

	/**
	 * Function to add user favourite item
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	**/
	async addUserFavouriteItem (req,res,next){
		return new Promise(async resolve=>{
			try{
				/** Sanitize Data **/
				req.body 	    =	sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
				let itemId  	= 	(req.body.item_id) 			? 	new ObjectId(req.body.item_id) 		:"";
				let userId  	= 	(req.body.user_id) 			? 	new ObjectId(req.body.user_id) 		:"";
				let branchId	=	(req.body.branch_id) 		?	new ObjectId(req.body.branch_id) 	:"";
				let areaId		=	(req.body.area_id) 			?	new ObjectId(req.body.area_id) 		:"";
				let restaurantId=	(req.body.restaurant_id) 	?	new ObjectId(req.body.restaurant_id):"";

				/** Send error response **/
				if(!itemId || !userId || !restaurantId || !branchId || !areaId) return resolve({status : Constants.STATUS_ERROR, message : res.__("system.missing_parameters")});

				/** For get item details */
				const items = this.db.collection(Tables.ITEMS);
				let itemResult = await items.findOne({
					_id 		: 	itemId,
					is_active 	:	Constants.ACTIVE,
				},{projection: { _id: 1}});

				/** Send error response */
				if(!itemResult) return resolve({status: Constants.STATUS_ERROR, message: res.__("system.invalid_access")});

				/** For get user favourites details */
				const user_favourites = this.db.collection(Tables.USER_FAVOURITES);
				let findUserFavouriteResult = await user_favourites.findOne({ 
					item_id : itemId, 
					user_id: userId
				},{projection: { item_id: 1,user_id: 1}});

				/** Send error response */
				if(findUserFavouriteResult) return resolve({status : Constants.STATUS_ERROR, message : res.__("admin.home.this_item_is_already_favourite")});

				/** Save user favourites details */
				await user_favourites.updateOne({
					item_id: itemId,
					user_id: userId,
				},
				{
					$set: {
						modified: getUtcDate()
					},
					$setOnInsert: {
						area_id 	  : areaId,
						branch_id 	  : branchId,
						restaurant_id : restaurantId,
						created 	  : getUtcDate()
					}
				},{upsert: true});

				/**Send success response */
				resolve({status: Constants.STATUS_SUCCESS, message: res.__("admin.home.user_favourite_item_has_been_added_successfully") });
			}catch(err){
				return next(err);
			}
		}).catch(next);
	}// end addUserFavouriteItem()

	/**
	 * Function to delete user favourite item
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	**/
	async deleteFavouriteItem (req,res,next){
		return new Promise(async resolve=>{
			try{
				/** Sanitize Data **/
				req.body 	=	sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
				let itemId	=	(req.body.item_id) 	?	new ObjectId(req.body.item_id) :"";
				let userId  = 	(req.body.user_id)	? 	new ObjectId(req.body.user_id) :"";

				/** Send error response **/
				if(!itemId || !userId) return resolve({status : Constants.STATUS_ERROR, message : res.__("system.missing_parameters")});

				/** delete user favourites item */
				const user_favourites = this.db.collection(Tables.USER_FAVOURITES);
				await user_favourites.deleteOne({
					item_id : itemId,
					user_id : userId
				});

				/**Send success response */
				resolve({status	: Constants.STATUS_SUCCESS,message : res.__("admin.home.user_favourite_item_has_been_deleted_successfully")});
			}catch(err){
				return next(err);
			}
		}).catch(next);
	}// end deleteFavouriteItem()

	/**
	 * Function to get user favourite item list
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	**/
	async getFavouriteItemList (req,res,next){
		return new Promise(async resolve=>{
			try{
				/** Sanitize Data **/
				req.body 	=	sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
				let userId	=	(req.body.user_id) ? new ObjectId(req.body.user_id) :"";

				/** Send error response **/
				if(!userId) return resolve({status: Constants.STATUS_ERROR, message: res.__("system.missing_parameters")});

				/** For get user favourite item details */
				const user_favourites = this.db.collection(Tables.USER_FAVOURITES);
				let userFavouriteItemResult = await user_favourites.aggregate([
					{$match : {user_id : userId}},
					{$lookup:{
						"from"			: Tables.ITEMS,
						"localField" 	: "item_id",
						"foreignField"	: "_id",
						"as" 			: "item_details"
					}},
					{$lookup:{
						"from"			: Tables.RESTAURANT_BRANCHES,
						"localField" 	: "branch_id",
						"foreignField"	: "_id",
						"as" 			: "branch_details"
					}},
					{$lookup:	{
						from     : Tables.RESTAURANT_BRANCH_AREAS,
						let      : {restaurantId : "$restaurant_id", branchId : "$branch_id", areaId : "$area_id"},
						pipeline : [
							{$match : {
								$expr: {
									$and : [
										{$eq: ["$restaurant_id", "$$restaurantId"]},
										{$eq: ["$branch_id", "$$branchId"]},
										{$eq: ["$area_id", "$$areaId" ]},
									]
								}
							}},
							{$project : {
								delivery_fees: 1, delivery_time: 1, open: 1, delivery_by: 1, trends : 1, area_id: 1, accept_pickup_orders: 1, accept_scheduling_orders: 1
							}},
						],
						as	:	"area_details"
					}},
					{$match : {
						"area_details._id" 		:	{$exists :true},
						"branch_details._id"	:	{$exists :true},
					}},
					{$project:{
						_id: 0, restaurant_id: 1, branch_id: 1, area_id: 1, item_id: 1,
						is_open				: 	{$arrayElemAt: ["$branch_details.is_open",0]},
						delivery_by			: 	{$arrayElemAt: ["$area_details.delivery_by",0]},
						delivery_time		: 	{$arrayElemAt: ["$area_details.delivery_time",0]},
						delivery_fees		: 	{$arrayElemAt: ["$area_details.delivery_fees",0]},
						minimum_order_amount: 	{$arrayElemAt: ["$area_details.minimum_order_amount",0]},
						item_name			:	{$arrayElemAt: ["$item_details.name",0]},
						item_image			:	{$arrayElemAt: ["$item_details.image",0]},
						item_price			:	{$arrayElemAt: ["$item_details.item_price",0]},
						price_on_selection	:	{$arrayElemAt: ["$item_details.price_on_selection",0]},
					}}
				]).toArray();

				/**Send success response */
				if(userFavouriteItemResult.length <=0) return resolve({
					status				: 	Constants.STATUS_SUCCESS,
					result				:	userFavouriteItemResult,
					restaurant_image_url:	Constants.RESTAURANT_FILE_URL,
					item_image_url		:	Constants.ITEMS_FILE_URL,
				});

				/** Push restaurant id in a array */
				let restaurantIds = [];
				userFavouriteItemResult.forEach(records=>{
					restaurantIds.push(records.restaurant_id);
				});

				/** For get restaurant details */
				const restaurants = this.db.collection(Tables.RESTAURANTS);
				let restaurantResult = await restaurants.find({_id: {$in:restaurantIds},is_deleted:Constants.NOT_DELETED },{projection: { _id: 1,name:1,image:1}}).toArray();

				/** Push item details according to the restaurant id */
				restaurantResult.forEach(restaurantRecords=>{
					userFavouriteItemResult.forEach(favRecords=>{
						if(restaurantRecords._id.toString() == favRecords.restaurant_id.toString()){
							
							/** Push item details */
							if(!restaurantRecords.items) restaurantRecords.items = [];
							restaurantRecords.items.push({
								item_id			 	:	favRecords.item_id,
								item_name 			:	favRecords.item_name,
								item_image 			:	favRecords.item_image,
								item_price 			: 	favRecords.item_price,
								price_on_selection 	:	favRecords.price_on_selection,
							});

							/** Push restaurant details */
							restaurantRecords.branch_id				=	favRecords.branch_id;
							restaurantRecords.area_id			 	=	favRecords.area_id;
							restaurantRecords.delivery_by           =	favRecords.delivery_by;
							restaurantRecords.delivery_time         =	favRecords.delivery_time;
							restaurantRecords.delivery_fees         =	favRecords.delivery_fees;
							restaurantRecords.minimum_order_amount  =	favRecords.minimum_order_amount;
							restaurantRecords.is_open 				=	favRecords?.is_open || Constants.CLOSE;
						}
					});
				});

				/**Send success response */
				resolve({
					status				: 	Constants.STATUS_SUCCESS,
					result				:	restaurantResult,
					restaurant_image_url:	Constants.RESTAURANT_FILE_URL,
					item_image_url		:	Constants.ITEMS_FILE_URL,
				});
			}catch(err){
				return next(err);
			}
		}).catch(next);
	}// end getFavouriteItemList()

	/**
	 * Function to get slider images
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	**/
	async getSliderImages (req,res,next){
		return new Promise(async resolve=>{
			try{
				let type 		= 	(req.body.type) ? req.body.type : "";
				let currentDay 	= 	parseInt(newDate().getDay());
				let currentTime = 	parseFloat(newDate("",Constants.TIME_FORMAT));
				let userId		= 	(req.body.user_id)		? 	new ObjectId(req.body.user_id) 		:"";
				let version		=	(req.body.version)		?	parseFloat(req.body.version)	:"";
				let languageId	=	(req.body.language_id)	? req.body.language_id :Constants.DEFAULT_LANGUAGE_MONGO_ID;

				/** Send error response **/
				if(!type) return resolve({status: Constants.STATUS_ERROR, message: res.__("system.missing_parameters")});

				/**For check type */
				if(type != Constants.SPLASH_SCREEN) return resolve({status : Constants.STATUS_ERROR, message : res.__("admin.system.invalid_access")});

				const sliders = this.db.collection(Tables.SLIDERS);
				asyncParallel({
					get_default : (callback)=>{
						sliders.find({
							status	: Constants.ACTIVE,
							type	: type,
							$or 	: [
								{is_default : true},
								{is_default : {$exists: false}},
							]
						},{projection: { _id:1,description:1,image:1}}).toArray().then(defaultResult=>{
							callback(null,defaultResult);
						}).catch(err=>{
							callback(err,null);
						});
					},
					get_match : (callback)=>{
						sliders.find({
							status	: 	Constants.ACTIVE,
							type	:	type,
							'$and'	:	[
								{"time_details.day"   : {$eq : currentDay }},
								{$or: [
									{$and : [
										{"time_details.start_time" : {$gte : currentTime }},
										{"time_details.end_time"   : {$lte : currentTime }}
									]},
									{$and : [
										{"time_details.end_time"   : {$gte : currentTime }},
										{"time_details.start_time" : {$lte : currentTime }}
									]}
								]},
							]
						},{projection:{ _id:1,description:1,image:1}}).toArray().then(result=>{
							callback(null,result);
						}).catch(err=>{
							callback(err,null);
						});
					},
					user_details : (callback)=>{
						if(!userId) return callback(null,null);

						/** Set customer conditions **/
						let userConditions = {...{_id: userId},...Constants.CUSTOMER_COMMON_CONDITIONS};

						/** Get user details **/
						const users	= this.db.collection(Tables.USERS);
						users.findOneAndUpdate(userConditions,
						{$set : {
							language_id: languageId
						}},{projection :{_id: 1, package_id: 1}}).then(userResult=>{
							callback(null,userResult);
						}).catch(err=>{
							callback(err,null);
						});
					},
					voc_order_id : (callback)=>{
						if(!userId) return callback(null,null);

						const orders = this.db.collection(Tables.ORDERS);
						orders.find({
							customer_id : new ObjectId(userId),
							delay_voc_status: Constants.PENDING,
						},{projection : {_id:1}}).sort({voc_sent_time : Constants.SORT_DESC}).limit(1).toArray().then(result=>{
							callback(null,result?.[0]?._id || "");
						}).catch(err=>{
							callback(err,null);
						});
					},
				},(asyncErr,asyncResponse)=>{
					if(asyncErr) return next(asyncErr);

					let defaultMatch =	asyncResponse?.get_default || [];
					let exactMatch	 =	asyncResponse?.get_match   || [];
					let userDetails  =  asyncResponse?.user_details;
					let appVersion 	 =  res?.locals?.settings?.["App.version"] ? parseFloat(res?.locals?.settings?.["App.version"]) :'';
					let forceArMessage= res?.locals?.settings?.["App.force_update_ar_message"]  || '';
					let forceEngMessage=  res?.locals?.settings?.["App.force_update_eng_message"]  || '';

					/** Send success response **/
					resolve({
						status 				: Constants.STATUS_SUCCESS,
						slider_image_url 	: Constants.SLIDER_URL,
						result 				: (exactMatch.length > 0) ? exactMatch :defaultMatch,
						is_user_deleted 	: (userId && !userDetails._id) ? true : false,
						infinity_service 	: (userDetails && userDetails.package_id) ? true : false,
						force_update 		: (version !== appVersion) ? true : false,
						voc_order_id 		: asyncResponse?.voc_order_id,
						force_update_message: {ar: forceArMessage, en: forceEngMessage}
					});
				});
			}catch(err){
				return next(err);
			}
		}).catch(next);
	}// end getSliderImages()

	/**
	 * Function to get city list
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	**/
	async getCityList (req,res,next){
		return new Promise(async resolve=>{
			try{
				/** For get city list */
				const cities = this.db.collection(Tables.CITIES);
				let cityResult = await cities.find({},{projection: { _id:1,name:1}}).toArray();

				/**Send success response */
				resolve({status	: Constants.STATUS_SUCCESS, result: cityResult});
			}catch(err){
				return next(err);
			}
		}).catch(next);
	}// end getCityList()

	/**
	 * Function to get area list
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	**/
	async getAreaList (req,res,next){
		return new Promise(async resolve=>{
			try{
				let cityId = req?.body?.city_id || "";

				/** Send error response **/
				if(!cityId) return resolve({status : Constants.STATUS_ERROR, message : res.__("system.missing_parameters")});

				/** For get area list */
				const areas = this.db.collection(Tables.AREAS);
				let areaResult = await areas.find({city_id: new ObjectId(cityId), is_active: Constants.ACTIVE},{projection: { _id:1,name:1}}).toArray();

				/**Send success response */
				resolve({status	: Constants.STATUS_SUCCESS,result: areaResult});
			}catch(err){
				return next(err);
			}
		}).catch(next);
	}// end getAreaList()

	/**
	 * Function to get block list
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	**/
	async getBlockList (req,res,next){
		return new Promise(async resolve=>{
			try{
				let areaId = req?.body?.area_id || "";

				/** Send error response **/
				if(!areaId) return resolve({status : Constants.STATUS_ERROR, message : res.__("system.missing_parameters")});

				/** For get block list */
				const area_blocks = this.db.collection(Tables.AREA_BLOCKS);
				let blockResult = await area_blocks.find({area_id: new ObjectId(areaId), is_active: Constants.ACTIVE},{projection: { _id:1,name:1}}).toArray();

				/**Send success response */
				resolve({status: Constants.STATUS_SUCCESS,result: blockResult});
			}catch(err){
				return next(err);
			}
		}).catch(next);
	}// end getBlockList()

	/**
	 * Function to get cuisines list
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	**/
	async getCuisinesList (req,res,next){
		return new Promise(async resolve=>{
			try{
				req.body 		=	sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
				let cuisineName	= 	req?.body?.name || "";

				/** Set conditions */
				let cuisineConditions = { is_active: Constants.ACTIVE};
				if(cuisineName){
					let searchValue = cleanRegex(cuisineName);
					cuisineConditions["$or"] = [
						{"name.en" : { $regex: new RegExp('^' + searchValue, 'i') } },
						{"name.ar" : { $regex: new RegExp('^' + searchValue, 'i') } },
					];
				}

				/** Get cuisinelist  */
				const cuisines = this.db.collection(Tables.CUISINES);
				cuisines.aggregate([
					{$match  : cuisineConditions},
					{$project: {_id:1, name: 1, order:1 }},
					{$group : {
						_id 		: null,
						max_order 	: {$max : "$order"},
						data		: {$push :{
							_id 	: "$_id",
							name 	: "$name",
							order 	: "$order"
						}},
					}},
					{$unwind : "$data"},
					{$project :{
						_id : "$data._id", name: "$data.name", order: {$ifNull: ["$data.order", {$add: [ "$max_order", 1]}] }
					}},
					{$sort : {"order": Constants.SORT_ASC, "name.en": Constants.SORT_ASC} }
				]).toArray();

				/** Send success */
				resolve({status: Constants.STATUS_SUCCESS, result: cuisineResult});
			}catch(err){
				return next(err);
			}
		}).catch(next);
	}// end getCuisinesList()

	/**
	 * Function to get area Id
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	**/
	async getAreaId (req,res,next){
		return new Promise(async resolve=>{
			try{
				/** Sanitize Data **/
				req.body = sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
				let name = req?.body?.name || "";

				/** Send error response **/
				if(!name) return resolve({status: Constants.STATUS_ERROR, message: res.__("system.missing_parameters")});

				/**Set condition  */
				let conditions = {
					"$or": [
						{ "name.en" : {$regex : new RegExp(name, "i")} },
						{ "name.ar" : {$regex : new RegExp(name, "i")} }
					]
				};

				/**Get details from pages */
				const areas	= this.db.collection(Tables.AREAS);
				let areaResult = await areas.findOne(conditions,{projection : {_id: 1, name:1}});

				/** Send error response */
				if(!areaResult) return resolve({status: Constants.STATUS_ERROR, message: res.__("system.no_record_found")});

				/** Send success response **/
				resolve({status	: Constants.STATUS_SUCCESS,result: areaResult});
			}catch(err){
				return next(err);
			}
		}).catch(next);
	};// end getAreaId()

	/**
	 * Function to get master list
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	**/
	async getMasterList (req,res,next){
		return new Promise(async resolve=>{
			try{
				/** Sanitize Data **/
				req.body = sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
				let options = {...req.body};
				let type 	= options?.type || "";

				/** Send error response **/
				if(!type) return resolve({status : Constants.STATUS_ERROR, message : res.__("system.missing_parameters")});

				options.type = [type];

				let masterReponse = await getMasterList(req,res,next,options);
				if(masterReponse.status == Constants.STATUS_ERROR) return resolve(masterReponse);

				let masterData = (masterReponse.result[type]) ? masterReponse.result[type] : [];

				masterData = convertDataToMultiLanguage(req,res,{ result : masterData, description_field: "master_descriptions", field: "name" });

				/** Send success response **/
				resolve({status	: Constants.STATUS_SUCCESS,result: masterData});				
			}catch(err){
				return next(err);
			}
		}).catch(next);
	};// end getMasterList()

	/**
	 * Function to purchase package
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	**/
	async purchasePackage (req,res,next){
		return new Promise(async resolve=>{
			try{
				/** Sanitize Data **/
				req.body 			= sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
				let userId 			= req?.body?.user_id ? new ObjectId(req.body.user_id) :"";
				let friendId		= req?.body?.friend_user_id ? new ObjectId(req.body.friend_user_id) :"";
				let packageId 		= req?.body?.package_id ? new ObjectId(req.body.package_id) :"";
				let paymentResponse = req?.body?.payment_response ? req.body.payment_response :"";
				let paymentMethod 	= req?.body?.payment_method ? req.body.payment_method :"";
				let transactionId	= (paymentResponse && paymentResponse.InvoiceTransactions && paymentResponse.InvoiceTransactions[0]) ? paymentResponse.InvoiceTransactions[0].TransactionId : '';

				/** Send error response **/
				if(!packageId || !userId || !paymentResponse || !paymentMethod) return resolve({status : Constants.STATUS_ERROR, message : res.__("system.missing_parameters"),missing_fields:["package_id","payment_response","payment_method","user_id"]});

				const packages	=	this.db.collection(Tables.PACKAGES);
				const users		=	this.db.collection(Tables.USERS);
				let packageResult = await packages.findOne({ _id : packageId},{projection : { amount : 1, days:1, number_of_orders:1}});

				/** Send error response */
				if(!packageResult) return resolve({status: Constants.STATUS_ERROR, message: res.__("system.invalid_access")});

				let amount				=	packageResult?.amount || 0;
				let noOfOrders			=	packageResult?.number_of_orders || "";
				let days				=	packageResult?.days || 0;
				let packageValidTill	=	newDate(addDaysToDate(days*Constants.HOURS_IN_A_DAY),Constants.DATABASE_DATE_FORMAT+' '+Constants.END_DATE_TIME_FORMAT);

				let paymentOptions = {
					user_id 		: userId,
					payment_response: paymentResponse,
					payment_method	: paymentMethod,
					payment_status	: Constants.PAYMENT_SUCCESS,
					currency		: Constants.CURRENCY_SYMBOL,
					amount 			: amount,
					payment_event	: Constants.PACKAGE_PURCHASE_PAYMENT_EVENT,
				};

				let paymentRes = await this.orderAPI.saveUserPaymentDetails(req,res,next,paymentOptions);
				if(paymentRes.status == Constants.STATUS_ERROR) return next(paymentRes);

				let invoiceNumber	=	paymentResponse.invoice_number;
				let paymentId		=	new ObjectId(paymentResponse.payment_id);

				asyncParallel({
					package_purchase : (callback)=>{
						if(friendId) return callback(null,null);
						
						/** To save purchased package detail */
						this.packagePurchased(req,res,next,{
							user_id 		 : userId,
							amount 			 : amount,
							number_of_orders : noOfOrders,
							valid_till 		 : getUtcDate(packageValidTill),
							package_id 		 : packageId,
							payment_id		 : paymentId
						}).then(packageReponse=>{
							if(packageReponse.status == Constants.STATUS_ERROR) return callback(packageReponse);
							callback(null,null);
						}).catch(next);
					},
					save_package : (callback)=>{
						if(!friendId) return callback(null,null);

						/** To save package request detail if purchased for friend */
						const package_requests	=	this.db.collection(Tables.PACKAGE_REQUESTS);
						package_requests.insertOne({
							user_id		:	friendId, // for whom package has been purchased
							friend_id	:	userId,  // purchaser of package
							package_id	:	packageId,
							amount		:	amount,
							valid_till	:	getUtcDate(packageValidTill),
							number_of_orders : noOfOrders,
							status		:	Constants.PACKAGE_REQUEST_PENDING,
							payment_id	: paymentId,
							created		: 	getUtcDate(),
							modified	: 	getUtcDate()
						}).then(insertResult=>{
							callback(null,insertResult);
						}).catch(next);
					},
					update_user: (callback)=>{
						if(friendId) return callback(null,null);
												
						/** To update user package details */
						users.updateOne({
							_id	: userId,
						},
						{$set: {
							package_id 	: packageId,
							remaining_package_orders : noOfOrders,
							package_valid_till : getUtcDate(packageValidTill),
							remaining_package_days : days,
							package_status: Constants.PACKAGE_RUNNING
						}}).then(updateResult=>{
							callback(null,updateResult);
						}).catch(next);
					},
					user_data: (callback)=>{
						/** To find user details */
						users.findOne({_id : userId},{projection: {_id:1,full_name:1,email:1}}).then(result=>{
							callback(null,result);
						}).catch(next);
					}
				},(asyncErr,asyncResponse)=>{
					if(asyncErr) return next(asyncErr);

					let savePackageResult =	asyncResponse?.save_package || {};
					let packageRequestId  = savePackageResult?.insertedId || "";
					let userDetail		  =	asyncResponse?.user_data || '';
					packageValidTill 	  = packageValidTill ? newDate(packageValidTill,Constants.DATE_FORMAT_EMAIL) : '';
					noOfOrders			  =	noOfOrders	?	noOfOrders : Constants.PACKAGE_UMLIMITED;

					if(userDetail){
						let fullName	=	userDetail.full_name;
						let email		=	userDetail.email;
						let repArray	=	[fullName,currencyFormat(amount),transactionId,invoiceNumber,packageValidTill,noOfOrders];
						/*************** Send Mail  ***************/
						sendMailToUsers(req,res,{
							event_type 			: Constants.PACKAGE_PURCHASE_MAIL,
							email				: email,
							rep_array			: repArray
						});
					}

					/** Send success response **/
					resolve({status	: Constants.STATUS_SUCCESS, message : res.__("home.package_purchased_successfully")});

					/** To notify friend about the package */
					if(friendId){
						/*************** Send Mail  ***************/
						sendMailToUsers(req,res,{
							event_type 			: Constants.NOTIFICATION_PURCHASE_PACKAGE,
							amount				: currencyFormat(amount),
							transfer_to     	: friendId,
							package_id			: packageId,
							package_request_id  : packageRequestId,
						});
					}
				});
			}catch(err){
				return next(err);
			}
		}).catch(next);
	}; // end purchasePackage()

	/**
	 * Function to validate phone number
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	 */
	async validateMobileNumber (req,res,next){
		return new Promise(async resolve=>{
			try{
				/** Sanitize Data */
				req.body 			= sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
				let mobileNumber 	= req?.body?.mobile_number || "";

				/** Send error response */
				if(!mobileNumber) return resolve({status : Constants.STATUS_ERROR, message	: res.__("system.missing_parameters"),missing_fields:["mobile_number"]});

				let conditions				= clone(Constants.CUSTOMER_COMMON_CONDITIONS);
				conditions["mobile_number"] = mobileNumber;
				conditions["is_guest"] 		= {$exists : false };

			/** Get user details **/
				const users = this.db.collection(Tables.USERS);
				let result = await users.findOne(conditions,{projection: {_id:1}});

				/** Send error response */
				if(!result) return resolve({status : Constants.STATUS_ERROR,message : res.__("home.mobile_number_not_exist")});

				/** Send success response **/
				resolve({
					status 	: Constants.STATUS_SUCCESS,
					user_id	: result?._id || '',
					message	: res.__("home.your_mobile_number_verified"),
				});
			}catch(err){
				return next(err);
			}
		}).catch(next);
	};//End validateMobileNumber()

	/**
	 * Function to get pending request list
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	**/
	async getpendingPackageRequestList (req,res,next){
		return new Promise(async resolve=>{
			try{
				/** Sanitize Data */
				req.body 			= sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
				let userId 			= req?.body?.user_id ? new ObjectId(req.body.user_id)	:"";

				/** Send error response */
				if(!userId) return resolve({status : Constants.STATUS_ERROR, message	: res.__("system.missing_parameters"),missing_fields:["user_id"]});

				/**For get package requests details */
				const package_requests = this.db.collection(Tables.PACKAGE_REQUESTS);
				let packageResult = await package_requests.aggregate([
					{$match : {
						user_id: userId,
						status : Constants.PACKAGE_REQUEST_PENDING
					}},
					{$lookup:{
						"from"			: Tables.PACKAGES,
						"localField" 	: "package_id",
						"foreignField"	: "_id",
						"as" 			: "package_details"
					}},
					{$lookup:{
						"from"			: Tables.USERS,
						"localField" 	: "friend_id",
						"foreignField"	: "_id",
						"as" 			: "user_details"
					}},
					{$project:{
						_id: 1,amount:1,created:1,
						package_name: {$arrayElemAt : ["$package_details.title",0]},
						number_of_orders: {$arrayElemAt : ["$package_details.number_of_orders",0]},
						friend_name: {$arrayElemAt : ["$user_details.full_name",0]},
						friend_number: {$arrayElemAt : ["$user_details.mobile_number",0]}
					}}
				]).toArray();

				if(packageResult.length > 0){
					packageResult.map(records=>{
						records.number_of_orders = records?.number_of_orders || Constants.PACKAGE_UMLIMITED;
					});
				}

				/**Send success response */
				resolve({status	: Constants.STATUS_SUCCESS,result: packageResult});
			}catch(err){
				return next(err);
			}
		}).catch(next);
	};// end getpendingPackageRequestList()

	/**
	 * Function to accept/reject pending package
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	**/
	async acceptRejectPackage (req,res,next){
		return new Promise(async resolve=>{
			try{
				/** Sanitize Data */
				req.body 			= sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
				let requestId 		= req?.body?.request_id ? new ObjectId(req.body.request_id)	:"";
				let userId 			= req?.body?.user_id ? new ObjectId(req.body.user_id)	:"";
				let status 			= req?.body?.status ? req.body.status		:"";

				/** Send error response */
				if(!requestId || !userId || !status) return resolve({status : Constants.STATUS_ERROR, message: res.__("system.missing_parameters"),missing_fields:["request_id","status","user_id"]});

				if(!Constants.PACKAGE_REQUEST_STATUS_OBJECT[status]) return resolve({status : Constants.STATUS_ERROR, message	: res.__("system.invalid_access")});

				const package_requests = this.db.collection(Tables.PACKAGE_REQUESTS);
				let packageResult = await package_requests.findOneAndUpdate({
					_id 		: 	requestId,
					user_id		:	userId
				},
				{
					$set : {
						status 		: status,
						modified 	: getUtcDate(),
					},
					$unset: {
						payment_id : 1
					}
				},{projection :{_id:1,number_of_orders: 1,valid_till:1,package_id:1,friend_id:1,amount:1,payment_id:1}});

				/** Send error response */
				if(!packageResult) return resolve({status: Constants.STATUS_ERROR, message : res.__("system.invalid_access")});

				let currentDate			= newDate("",Constants.DATABASE_DATE_FORMAT);
				let packageId			= packageResult?.package_id || "";
				let noOfOrders			= packageResult?.number_of_orders || "";
				let packageValidTill	= packageResult?.valid_till ? newDate(packageResult.valid_till,Constants.DATABASE_DATE_FORMAT) : '';
				let friendId			= packageResult?.friend_id || '';
				let amount				= packageResult?.amount || 0;
				let paymentId			= packageResult?.payment_id || '';
				let remainingDays		= packageValidTill ? (getDifferenceBetweenTwoDatesInMinute(currentDate,packageValidTill))/(Constants.MINUTES_IN_A_HOUR*Constants.HOURS_IN_A_DAY) : 0;
				let packageValidTillTIME= packageResult?.valid_till ? getUtcDate(newDate(packageResult.valid_till,Constants.DATABASE_DATE_FORMAT+' '+Constants.END_DATE_TIME_FORMAT)) : '';
				
				asyncParallel({
					update_user : (callback)=>{
						if(status != Constants.PACKAGE_REQUEST_ACCEPTED) return callback(null,null);

						/**For get faq details */
						const users = this.db.collection(Tables.USERS);
						users.findOneAndUpdate({
							_id	: userId,
						},
						{
							$set: {
								package_id : packageId,
								remaining_package_orders : noOfOrders,
								package_valid_till : packageValidTillTIME,
								remaining_package_days : round(remainingDays,0),
								package_status: Constants.PACKAGE_RUNNING
							},
						},{$projection : {full_name:1,email:1}}).then(userResult=>{
							callback(null,userResult);
						}).catch(next);
					},
					package_purchase : (callback)=>{
						if(status != Constants.PACKAGE_REQUEST_ACCEPTED) return callback(null,null);

						this.packagePurchased(req,res,next,{
							user_id 		 : userId,
							friend_id		 : friendId,
							amount 			 : amount,
							number_of_orders : noOfOrders,
							valid_till 		 : packageValidTillTIME,
							package_id 		 : packageId,
							payment_id		 : paymentId
						}).then(packageReponse=>{
							if(packageReponse.status == Constants.STATUS_ERROR) return callback(packageReponse);
							callback(null,null);
						}).catch(next);
					},
					payment_transaction : (callback)=>{
						if(status != Constants.PACKAGE_REQUEST_REJECTED || !paymentId) return callback(null,null);

						const payment_transactions	=	this.db.collection(Tables.PAYMENT_TRANSACTIONS);
						payment_transactions.findOne({
							_id : paymentId
						},{projection : {transaction_id:1,payment_response:1}}).then(payResult=>{

							let transactionId	=	payResult?.transaction_id || '';
							let paymentResponse	=	payResult?.payment_response ? JSON.parse(payResult.payment_response) : {};
							let paymentGateway	=	paymentResponse?.InvoiceTransactions && paymentResponse?.InvoiceTransactions[0] ? paymentResponse?.InvoiceTransactions[0]?.PaymentGateway : '';

							refundAmount(req,res,next,{
								user_id 		 : userId,
								amount 			 : amount,
								package_id		 : packageId,
								payment_type	 : Constants.PACKAGE_REFUND_PAYMENT,
								refund_activity_type :Constants.REFUND_PACKAGE_REJECT,
								refund_detail	 : [{
									transaction_id	 : transactionId,
									type	:	paymentGateway,
									amount 	:   amount,
								}]
							}).then(refundResponse=>{
								if(refundResponse.status == Constants.STATUS_ERROR) return callback(refundResponse);
								callback(null,null);
							}).catch(next);
						});
					},
				},(asyncErr,asyncResponse)=>{
					if(asyncErr) return next(asyncErr);

					let userDetail	=	asyncResponse?.update_user || {};
					let fullName	=	userDetail?.full_name || '';
					let email		=	userDetail?.email || '';
					packageValidTill=	packageValidTill ? newDate(packageValidTill,Constants.DATE_FORMAT_EMAIL) : '';

					/*************** Send Mail  ***************/
					if(status == Constants.PACKAGE_REQUEST_ACCEPTED){
						sendMailToUsers(req,res,{
							event_type 	: Constants.PACKAGE_ACCEPT_MAIL,
							email		: email,
							rep_array	: [fullName,packageValidTill]
						});
					}

					/*************** Send Mail  ***************/
					sendMailToUsers(req,res,{
						event_type 	: Constants.NOTIFICATION_PURCHASE_PACKAGE_STATUS,
						package_id	: packageId,
						status		: status,
						user_id     : friendId
					});
					/*************** Send Mail  ***************/
					
					/**Send success response */
					let message	=	(status == Constants.PACKAGE_REQUEST_ACCEPTED) ? res.__("home.request_accepted_successfully") : res.__("home.request_rejected_successfully");
					resolve({status	: Constants.STATUS_SUCCESS, message: message});
				});
			}catch(err){
				return next(err);
			}
		}).catch(next);
	}// end acceptRejectPackage()

	/**
	 * Function to manage package purchased
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	**/
	async packagePurchased (req,res,next,options){
		return new Promise(async resolve=>{
			try{
				let userId		=	options?.user_id ? new ObjectId(options.user_id) : '';
				let friendId	=	options?.friend_id ? new ObjectId(options.friend_id) : '';
				let packageId	=	options?.package_id ? new ObjectId(options.package_id) : '';
				let paymentId	=	options?.payment_id ? new ObjectId(options.payment_id) : '';
				let amount		=	options?.amount ? options.amount : 0;
				let validTill	=	options?.valid_till ? options.valid_till : '';
				let noOfOrders	=	options?.number_of_orders ? options.number_of_orders : '';

				/** Send error response **/
				if(!packageId || !userId || !amount || !validTill) return resolve({status : Constants.STATUS_ERROR, message : res.__("system.missing_parameters"),missing_fields:["package_id","valid_till","amount","user_id"]});

				let insertData	=	{
					user_id		:	userId,
					package_id	:	packageId,
					payment_id	:	paymentId,
					amount		:	parseFloat(amount),
					valid_till	:	validTill,
					number_of_orders : noOfOrders,
					created		: 	getUtcDate(),
					modified	: 	getUtcDate(),
				};
				if(friendId) insertData['friend_id'] = friendId;

				const package_purchases = this.db.collection(Tables.PACKAGE_PURCHASES);
				await package_purchases.insertOne(insertData);
				
				resolve({status: Constants.STATUS_SUCCESS});
			}catch(err){
				return next(err);
			}
		}).catch(next);
	} // End packagePurchased

	/**
	 * Function to save User Contact Details
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	 **/
	async contactUs (req, res,next){
		return new Promise(async resolve=>{
			try{
				/** Sanitize Data **/
				req.body 	= sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
				let userId 	= req?.body?.user_id ? new ObjectId(req.body.user_id)	:"";

				/** Apply validation */
				let validationResponse = await applyValidationInterCallFunction(req, res, next, contactUsValidation);
				if(validationResponse.status != Constants.STATUS_SUCCESS) return resolve(validationResponse);

				let email = '';
				if(userId){
					/**For get user details */
					const users	= this.db.collection(Tables.USERS);
					let userResult = await users.findOne({ _id : userId},{projection : {email:1}});
					
					email = userResult?.email || '';
				}	

				/** Set insert data in a object */
				let insertAbleData = {
					name 		: req.body.name,
					phone 		: req.body.mobile_number,
					message 	: req.body.message,
					email       : email,
					modified 	: getUtcDate(),
					created 	: getUtcDate(),
				};

				if(userId) insertAbleData.user_id = userId;

				/** Insert contacts details */
				const contacts = this.db.collection(Tables.CONTACTS);
				await contacts.insertOne(insertAbleData);

				/** Send success response **/
				resolve({
					status	: Constants.STATUS_SUCCESS,
					message : res.__("contact_us.contact_has_been_saved_successfully"),
				});

				/*************** Send Mail To Admin  ***************/
					sendMailToUsers(req,res,{
						event_type 	: Constants.USER_CONTACT_US_EVENTS,
						name		: req.body.name,
						email 		: email,
						phone 		: req.body.mobile_number,
						message 	: req.body.message,
					});
				/*************** Send Mail To Admin ***************/
			}catch(err){
				return next(err);
			}
		}).catch(next);
	};//End contactUs()

	/**
	 * Function to get area Id form lat long
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	**/
	async getAreaIdByLatLong (req,res,next){
		return new Promise(async resolve=>{
			try{
				/** Sanitize Data **/
				req.body 		= 	sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
				let location	= 	(req.body.location) ? 	req.body.location	:"";

				/** Send error response **/
				if(!location || !location?.results?.length <=0){
					return resolve({status: Constants.STATUS_ERROR, message: res.__("system.missing_parameters")});
				}

				/** Get area name  */
				let areaName = "";
				location.results.map(records=>{
					if(records?.address_components?.length){
						records.address_components.map(data=>{
							if(!areaName && data?.types?.length >0 && data.types.indexOf("locality") != -1){
								areaName = data.long_name;
							}
						});
					}
				});

				/** Send error response **/
				if(!areaName){
					return resolve({status: Constants.STATUS_ERROR, message: res.__("home.not_able_to_get_area_details"), location: location });
				}

				/**Set condition  */
				let conditions = {
					is_active : Constants.ACTIVE,
					"$or": [
						{ "name.en" : {$regex : '^'+areaName+'$', '$options' : 'i'} },
						{ "name.ar" : {$regex : '^'+areaName+'$', '$options' : 'i'} }
					]
				};

				/** Get area details  */
				const areas	= this.db.collection(Tables.AREAS);
				let areaResult = await areas.findOne(conditions,{projection : {_id: 1, name:1}});

				/** Send error response */
				if(!areaResult) return resolve({status: Constants.STATUS_ERROR, message: res.__("home.not_able_to_get_area_details") });

				/** Send success response */
				resolve({
					status		: 	Constants.STATUS_SUCCESS,
					area_id		: 	areaResult?._id || '',
					area_name	:	areaResult?.name || ''
				});
			}catch(err){
				return next(err);
			}
        }).catch(next);
	};// end getAreaIdByLatLong()
	
	/**
	 * Function to update user language id
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	**/
	async changeLangauge (req,res,next){
		return new Promise(async resolve=>{
			try{
				/** Sanitize Data **/
				req.body 	    =	sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
				let userId		= 	req?.body?.user_id 	? new ObjectId(req.body.user_id) :"";
				let languageId	= 	req?.body?.language_id || "";

				/** Send error response **/
				if(!userId || !languageId){
					return resolve({status: Constants.STATUS_ERROR, message : res.__("system.missing_parameters")});
				}

				/** Update user language details */
				const users = this.db.collection(Tables.USERS);
				await users.updateOne({
					_id : userId,
				},
				{$set: {
					preference_language : languageId,
					modified			: getUtcDate()
				}});

				/** Send success response **/
				resolve({status	: Constants.STATUS_SUCCESS});
			}catch(err){
				return next(err);
			}
        }).catch(next);
	};// end changeLangauge()
}
