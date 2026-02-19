import { ObjectId } from 'mongodb';
import axios from 'axios';
import https from 'https';
import clone from 'clone';
import {parallel as asyncParallel, each as asyncEach, eachOfSeries} from 'async';
import jsonxml from 'jsontoxml';
import XLSX from 'xlsx';

import * as Constants from "../../../../config/global_constant.mjs";
import Tables from '../../../../config/database_tables.mjs';
import { getUtcDate, newDate, subtractDate, subtractMinute, saveOrderStatusLogs, getUniqueId, generateTicket, addMinute, getDatabaseSlug, setBranchAreaFields, setBranchAreaAttributes, arrayToObject} from "../../../../utils/index.mjs";

export default class Aghzeya{

	constructor(db) {
		this.db     =   db;
		this.userDB = db.collection(Tables.USERS);
		this.customerAddressesDB = db.collection(Tables.CUSTOMER_ADDRESSES);
		this.customerRestaurantComplaintDB = db.collection(Tables.CUSTOMER_RESTAURANT_COMPLAINTS);

		this.areaDB = db.collection(Tables.AREAS);
		this.paymentMethodDB = db.collection(Tables.PAYMENT_METHODS);
		this.attributesDB = db.collection(Tables.ATTRIBUTES);
		this.areaBlockDB = db.collection(Tables.AREA_BLOCKS);
		this.cancelReasonDB = db.collection(Tables.CANCEL_REASONS);

		this.orderDB = db.collection(Tables.ORDERS);
		this.orderDetailDB = db.collection(Tables.ORDER_DETAILS);
		this.orderItemDB = db.collection(Tables.ORDER_ITEMS);

		this.restaurantDB = db.collection(Tables.RESTAURANTS);
		this.restaurantMenuDB = db.collection(Tables.RESTAURANT_MENUS);
		this.restaurantCuisineDB = db.collection(Tables.RESTAURANT_CUISINES);
		this.restaurantCategoryDB = db.collection(Tables.RESTAURANT_CATEGORIES);
		this.restaurantMenuBranchDB = db.collection(Tables.RESTAURANT_MENU_BRANCHES);

		this.restaurantBranchDB = db.collection(Tables.RESTAURANT_BRANCHES);
		this.restaurantBranchAreaDB = db.collection(Tables.RESTAURANT_BRANCH_AREAS);
		this.restaurantBranchAreaSettingDB = db.collection(Tables.RESTAURANT_BRANCH_AREA_SETTINGS);
		this.restaurantBranchPaymentMethodDB = db.collection(Tables.RESTAURANT_BRANCH_PAYMENT_METHODS);
		this.restaurantBranchAttributeDB = db.collection(Tables.RESTAURANT_BRANCH_ATTRIBUTES);
		this.restaurantBranchCalendarDB = db.collection(Tables.RESTAURANT_BRANCH_CALENDARS);

		this.aghzeyaRestaurantSourcesDB = db.collection(Tables.AGHZEYA_RESTAURANT_SOURCES);
		this.aghzeyaRestaurantPaymentMethodDB = db.collection(Tables.AGHZEYA_RESTAURANT_PAYMENT_METHODS);
		this.aghzeyaRestaurantCancelReasonDB = db.collection(Tables.AGHZEYA_RESTAURANT_CANCEL_REASONS);
		this.aghzeyaAreaDB = db.collection(Tables.AGHZEYA_AREAS);
		this.aghzeyaGroupListDB = db.collection(Tables.AGHZEYA_GROUP_LIST);

		this.itemsDB = db.collection(Tables.ITEMS);
		this.itemLinkingDB = db.collection(Tables.ITEM_LINKINGS);
		this.itemExtraMaterDB = db.collection(Tables.ITEM_EXTRA_MASTERS);
		this.itemAvailabilityDB = db.collection(Tables.ITEM_AVAILABILITY);
		this.itemGroupExtraDB = db.collection(Tables.ITEM_GROUP_EXTRAS);
		this.itemChoiceGroupDB = db.collection(Tables.ITEM_CHOICES_GROUPS);

		this.kfgRequestResponseDB = db.collection(Tables.KFG_REQUEST_RESPONSE);

		this.SOAP_PASSCODE 				=	Constants.AGHZEYA_PASSCODE;
		this.ORDER_API_DATE_FORMAT		= 	"yyyy-mm-dd'T'HH:MM:ss";
		this.ORDER_ALREADY_EXISTS_CODE	= 	-1800;
		this.AGHZEYA_SUCCESS_CODE		= 	200;

		this.AGHZEYA_PAYMENT_TYPE	= 	{
			[Constants.CASH_PAYMENT]	:	1,
			[Constants.KNET]			:	2,
			[Constants.CREDIT_PAYMENT]	:	3,
			[Constants.SHEEEL_CARD]		:	5,
		};

		this.AGHZEYA_UPAYMENT_TYPE	=	6;
		this.AGHZEYA_API_SOURCE		= 	1; // 1 for call center, 2 for Talabat, 3 for Deliveroo
		this.AGHZEYA_ORDER_NEW		= 	1;

		this.AGHZEYA_ORDER_STATUS = 	{
			[1] : {label: "New", status: Constants.ORDER_PREPARING },
			[2] : {label: "Prepared", status: Constants.ORDER_READY_TO_PICK_UP },
			[3] : {label: "Delivered", status: Constants.ORDER_ON_THE_WAY },
			[Constants.AGHZEYA_ORDER_STATUS_RETURNED] : {label: "Returned", status: "" },
			[5] : {label: "Order Cancelled", status: Constants.ORDER_CANCELLED }
		};

		this.DIKSON_RESTAURANT  			= 	"1";
		this.FATAYER_RESTAURANT 			= 	"2";
		this.MOALEM_RESTAURANT  			= 	"3";
		this.BON_RESTAURANT 	 			= 	"4";
		this.NAZ_RESTAURANT 	 			=	"5";
		this.AGHZEYA_CANCEL_REASON_ID		=	"10";
		this.DEFAULT_GROUP_MIN_QUANTITY		=	0;
		this.DEFAULT_GROUP_MAX_QUANTITY		=	99;

		this.DHUB_ORDER_STATUS		= 	{
			['order-assigned']		:	{label: "Assigned", status: Constants.ORDER_DRIVER_ASSIGNED },
			['order-unassigned']	:	{label: "Unassigned", status: Constants.ORDER_DRIVER_UNASSIGNED },
			['order-accepted']		:	{label: "Accepted", status: Constants.ORDER_DRIVER_API_ACCEPTED },
			['order-canceled']		:	{label: "Captain-Order-Cancelled", status: Constants.ORDER_DRIVER_CANCELLED},
			['order-failed']		:	{label: "Captain-Order-Faild", status: Constants.ORDER_DRIVER_FAILDED },
			['pickup-started']		:	{label: "Way to restaurant", status: Constants.ORDER_DRIVER_ACCEPTED },
			['pickup-reached']		:	{label: "Arrived At Restaurant", status: Constants.ORDER_DRIVER_ARRIVED_AT_RESTAURANT },
			['pickup-successful']	:	{label: "Item Picked Up", status: Constants.ORDER_DRIVER_PICKUP_SUCCESSFUL },
			['delivery-started']	:	{label: "Out for Delivery", status: Constants.ORDER_DRIVER_WAY_TO_CUSTOMER },
			['delivery-reached']	:	{label: "Arrived At Customer Location", status: Constants.ORDER_DRIVER_ARRIVED_AT_CUSTOMER_LOCATION },
			['delivery-successful'] :	{label: "Delivered", status: Constants.ORDER_DELIVERED}
		};
	}

	/**
	 * This function to get restaurant list
	 *
	 * @param req		As 	Request Data
	 * @param res		As	Response Data
	 * @param next		As 	Callback argument to the middleware function
	 * @param options	As	object of passed data
	 *
	 * @return json
	**/
	async getRestaurantList (req,res,next,options){
		return new Promise(resolve=>{
			let restaurantId= (options && options.restaurant_id)? options.restaurant_id :"";
			let notSimphony	= (options && options.not_simphony)	? options.not_simphony  :0;

			/** Set restaurant conditions */
			let conditions ={aghzeya_restaurant_id : {$exists: true}};
			if(notSimphony) conditions.simphony = {$ne: true};

			if(restaurantId) conditions.aghzeya_restaurant_id = {$in: [String(restaurantId), parseInt(restaurantId) ]};

			/** Get restaurant list */
			this.restaurantDB.find(conditions,{projection:{_id:1,aghzeya_restaurant_id:1,slug:1,is_exclude_item_details_form_sync:1,is_exclude_payment_method_sync:1,simphony:1}}).toArray().then(result=>{

				let restaurantIds = [];
				result.map(records=>{
					restaurantIds.push(records._id)
				});

				resolve({
					result 			: 	result,
					restaurant_ids 	: 	restaurantIds,
					restaurant_id 	: 	(result[0]) ?	result[0]._id 	:"",
					restaurant_slug	:	(result[0])	? 	result[0].slug	:"",
					restaurant_details:	(result[0])	? 	result[0]		:{},
					exclude_item_details_form_sync:	(result[0] && result[0].is_exclude_item_details_form_sync) ? result[0].is_exclude_item_details_form_sync :false,
					is_exclude_payment_method_sync:	(result[0] && result[0].is_exclude_payment_method_sync) ? result[0].is_exclude_payment_method_sync :false,
				});
			}).catch(next);
		}).catch(next);
	};//End getRestaurantList()

	/**
	 * This function to get all restaurant data
	 *
	 * @param req		As 	Request Data
	 * @param res		As	Response Data
	 * @param next		As 	Callback argument to the middleware function
	 * @param options	As	object of passed data
	 *
	 * @return json
	**/
	async getAllRestaurantData (req,res,next,options){
		return new Promise(resolve=>{
			let onlyPaymentSource	=	(options && options.only_payment_source) 	?	options.only_payment_source 	:false;

			this.getRestaurantList(req,res,next,options).then(response=>{
				let restaurantList = (response.result) ? response.result :[];

				/** Send error response */
				if(restaurantList.length ==0) return resolve({status: Constants.STATUS_ERROR, resuarant_list: restaurantList });

				eachOfSeries(restaurantList, (record, index,seriesCallback) => {
					let restObjId 	=	record._id;
					let restId 		= 	record.aghzeya_restaurant_id;
					let simphony 	= 	record.simphony || false;

					asyncParallel({
						get_payment_method : (callback)=>{
							/** Get payment method list */
							axios({
								method: 'GET',
								url: `${Constants.WEBSITE_URL}aghzeya_api/get_payment_method/${restId}`,
								headers: {
									'Content-Type': 'application/json',
								},
								httpsAgent: new https.Agent({ rejectUnauthorized: false }) // equivalent to strictSSL: false
							}).then(() => {
								callback(null);
							}).catch(()=>{
								callback(null);
							});
						},
						get_sources : (callback)=>{
							/** Get sources list */
							axios({
								method: 'GET',
								url: `${Constants.WEBSITE_URL}aghzeya_api/get_sources/${restId}`,
								headers: {
									'Content-Type': 'application/json',
								},
								httpsAgent: new https.Agent({ rejectUnauthorized: false }) // equivalent to strictSSL: false
							}).then(() => {
								callback(null);
							}).catch(()=>{
								callback(null);
							});
						},
						get_category : (callback)=>{
							if(onlyPaymentSource || simphony) return callback(null);

							/** Get category list */
							axios({
								method: 'GET',
								url: `${Constants.WEBSITE_URL}aghzeya_api/get_category/${restId}`,
								headers: {
									'Content-Type': 'application/json',
								},
								httpsAgent: new https.Agent({ rejectUnauthorized: false }) // equivalent to strictSSL: false
							}).then(() => {
								callback(null);
							}).catch(()=>{
								callback(null);
							});
						},
						get_extra_group : (callback)=>{
							if(onlyPaymentSource || simphony) return callback(null);

							/** Get group list */
							axios({
								method: 'GET',
								url: `${Constants.WEBSITE_URL}aghzeya_api/get_extra_group/${restId}`,
								headers: {
									'Content-Type': 'application/json',
								},
								httpsAgent: new https.Agent({ rejectUnauthorized: false }) // equivalent to strictSSL: false
							}).then(() => {
								callback(null);
							}).catch(()=>{
								callback(null);
							});
						},
						get_location : (callback)=>{
							if(onlyPaymentSource || !simphony) return callback(null);

							/** Get location list */
							axios({
								method: 'GET',
								url: `${process.env.SIMPHONY_SERVER_URL}simphony-api/fetch-restaurant-data/${restObjId}`,
								headers: {
									'Content-Type': 'application/json',
								},
								httpsAgent: new https.Agent({ rejectUnauthorized: false }) // equivalent to strictSSL: false
							}).then(() => {
								callback(null);
							}).catch(()=>{
								callback(null);
							});
						},
					},()=> {
						asyncParallel({
							get_branch : (childCallback)=>{
								if(onlyPaymentSource || simphony) return childCallback(null);

								/** Get branch list */
								axios({
									method: 'GET',
									url: `${Constants.WEBSITE_URL}aghzeya_api/get_branchs/${restId}`,
									headers: {
										'Content-Type': 'application/json',
									},
									httpsAgent: new https.Agent({ rejectUnauthorized: false }) // equivalent to strictSSL: false
								}).then(() => {
									childCallback(null);
								}).catch(()=>{
									childCallback(null);
								});
							},
						},()=> {

							asyncParallel({
								get_area : (subCallback)=>{
									if(onlyPaymentSource || simphony) return subCallback(null);

									/** Get area list */
									axios({
										method: 'GET',
										url: `${Constants.WEBSITE_URL}aghzeya_api/get_restaurant_area/${restId}`,
										headers: {
											'Content-Type': 'application/json',
										},
										httpsAgent: new https.Agent({ rejectUnauthorized: false }) // equivalent to strictSSL: false
									}).then(() => {
										subCallback(null);
									}).catch(()=>{
										subCallback(null);
									});
								},
								get_item : (subCallback)=>{
									if(onlyPaymentSource || simphony) return subCallback(null);

									/** Get item list */
									axios({
										method: 'GET',
										url: `${Constants.WEBSITE_URL}aghzeya_api/get_items/${restId}`,
										headers: {
											'Content-Type': 'application/json',
										},
										httpsAgent: new https.Agent({ rejectUnauthorized: false }) // equivalent to strictSSL: false
									}).then(() => {
										subCallback(null);
									}).catch(()=>{
										subCallback(null);
									});
								},
							},()=> {

								asyncParallel({
									get_extra_mapping : (subChildCallback)=>{
										if(onlyPaymentSource || simphony) return subChildCallback(null);

										/** Get extra item */
										axios({
											method: 'GET',
											url: `${Constants.WEBSITE_URL}aghzeya_api/get_extra_mapping/${restId}`,
											headers: {
												'Content-Type': 'application/json',
											},
											httpsAgent: new https.Agent({ rejectUnauthorized: false }) // equivalent to strictSSL: false
										}).then(() => {
											subChildCallback(null);
										}).catch(()=>{
											subChildCallback(null);
										});
									},
								},()=> {

									/** Set update Data */
									let fieldKey		=	(onlyPaymentSource) ? "payment_sync_process_time"	:"sync_process_time";
									let restUpdateData	=	{$set: {modified: getUtcDate() }, $unset: { } };
									restUpdateData["$unset"][fieldKey] = 1;

									/** Update restaurant data */
									this.restaurantDB.updateOne({_id: restObjId },restUpdateData).then(()=>{
										seriesCallback(null);
									}).catch(next);
								});
							});
						});
					});
				},(asyncEachErr)=>{
					/** Send success response */
					resolve({
						status			:	Constants.STATUS_SUCCESS,
						error			:	asyncEachErr,
						resuarantList	:	restaurantList,
					});
				});
			}).catch(next);
		}).catch(next);
	};//End getAllRestaurantData()

	/**
	 * This function to get restaurant category
	 *
	 * @param req	As 	Request Data
	 * @param res	As	Response Data
	 * @param next	As 	Callback argument to the middleware function
	 * @param client As	SOAP module instance
	 *
	 * @return json
	**/
	async getCategory (req,res,next,client){
		return new Promise(resolve=>{
			let aghzeyaRestId	= req.params.restaurant_id;

			/** Call service */
			let apiResuest = {passcode: this.SOAP_PASSCODE, resturant_id: aghzeyaRestId};
			client["of_get_rest_category"](apiResuest,(err, response)=>{
				if (err) return next(err);

				let categoryList = (response && response.of_get_rest_categoryResult && response.of_get_rest_categoryResult.lstr_rest_category && response.of_get_rest_categoryResult.lstr_rest_category.str_rest_category) ? response.of_get_rest_categoryResult.lstr_rest_category.str_rest_category :"";

				/** Save api request response */
				this.saveApiRequestResponse(req,res,next,{
					method_name :	"of_get_rest_category",
					response	: 	response,
					request		:	apiResuest,
				}).then(()=>{});

				/** Send success response */
				if(!categoryList || categoryList.length == 0){
					return resolve({status: Constants.STATUS_SUCCESS, message: "No category found"});
				}

				asyncParallel({
					restaurant_details : (callback)=>{
						/** Get restaurant details */
						this.getRestaurantList(req,res,next,{restaurant_id:aghzeyaRestId}).then(response=>{
							callback(null, response);
						}).catch(next);
					},
					admin_id : (callback)=>{
						/** Get admin details */
						this.userDB.findOne({user_role_id: Constants.SYSTEM_ADMIN_ROLE_ID},{projection:{_id:1}}).then(result=>{
							let adminId = (result) ? result._id	:"";
							callback(null, adminId);
						}).catch(next);
					},
				},(asyncErr, asyncResponse)=> {
					if(asyncErr) return next(asyncErr);

					let adminId 	= (asyncResponse.admin_id) 	? asyncResponse.admin_id 	:"";
					let restDetails=(asyncResponse.restaurant_details)?asyncResponse.restaurant_details:{};
					let restaurantId  = (restDetails.restaurant_id)   ? restDetails.restaurant_id 	:"";
					let restaurantSlug= (restDetails.restaurant_slug) ? restDetails.restaurant_slug :"";

					/** Send error response */
					if(!restaurantId || !restaurantSlug){
						return resolve({status: Constants.STATUS_ERROR,message : "Something went wrong, Please try again.", restaurantId: restaurantId, restaurantSlug: restaurantSlug });
					}

					/** Get restaurant cuisines details */
					this.restaurantCuisineDB.findOne({restaurant_id: restaurantId},{projection:{cuisine_id:1}}).then(cuisineResult=>{

						/** Send error response */
						if(!cuisineResult){
							return resolve({status: Constants.STATUS_ERROR,message : "Something went wrong, Please try again.", cuisineResult: cuisineResult });
						}

						let cuisineId = cuisineResult.cuisine_id;
						let deleteAbleId = new ObjectId();

						/** Update categories details */
						this.restaurantCategoryDB.updateMany({
							restaurant_id	:	restaurantId,
						},
						{$set : {
							to_be_deleted	: deleteAbleId
						}}).then(()=>{

							eachOfSeries(categoryList, (records, index,eachCallback) => {

								asyncParallel({
									unique_id : (childCallback)=>{
										/** get category unique id **/
										getUniqueId(req,res,next,{type:"categories"}).then(uniqueIdResponse=>{
											childCallback(null,uniqueIdResponse.result);
										}).catch(next);
									},
								},(_, childResponse)=> {

									let catUniqueId=(childResponse.unique_id) ? childResponse.unique_id:"";

									/** Save details **/
									this.restaurantCategoryDB.updateOne({
										restaurant_id 		: 	restaurantId,
										aghzeya_category_id :	String(records.catid),
									},
									{
										$set : {
											aghzeya_restaurant_id : aghzeyaRestId,
											order : (records.show_in_pos)?parseInt(records.show_in_pos) :0,
											name	: 	{ en: records.cat_e_name, ar: records.cat_a_name},
											tags	: 	[records.cat_e_name, records.cat_a_name],
											modified:	getUtcDate(),
											aghzeya_parnet_id: records.parnet_id,
										},
										$setOnInsert: {
											is_active		: Constants.ACTIVE,
											channel_id		: Constants.CHANNEL_SOAP,
											category_id		: catUniqueId,
											cuisine_id		: cuisineId,
											restaurant_slug	: restaurantSlug,
											created			: getUtcDate(),
											added_by		: adminId,
											aghzeya			: true,
										},
										$unset: {
											to_be_deleted: 1,
										}
									},{upsert: true}).then(()=>{
										eachCallback(null);
									}).catch(next);
								});
							},(asyncEachErr)=>{
								if(asyncEachErr) return next(asyncEachErr);

								/** Delete categories details */
								this.restaurantCategoryDB.deleteMany({
									restaurant_id	:	restaurantId,
									to_be_deleted	:	deleteAbleId
								}).then(()=>{
									resolve({status: Constants.STATUS_SUCCESS });
								}).catch(next);
							});
						}).catch(next);
					}).catch(next);
				});
			});
		}).catch(next);
	};//End getCategory()

	/**
	 * This function to get resuarant payment method
	 *
	 * @param req	As 	Request Data
	 * @param res	As	Response Data
	 * @param next	As 	Callback argument to the middleware function
	 * @param client As	SOAP module instance
	 *
	 * @return json
	**/
	async getPaymentMethods (req,res,next,client){
		return new Promise(resolve=>{
			let aghzeyaRestId	= req.params.restaurant_id;

			/** Call service */
			let apiResuest = {passcode: this.SOAP_PASSCODE, resturant_id: aghzeyaRestId};
			client["of_get_payment_methods"](apiResuest,(err, response)=>{
				if (err) return next(err);

				let paymentList = (response && response.of_get_payment_methodsResult && response.of_get_payment_methodsResult.lstr_payment_methods && response.of_get_payment_methodsResult.lstr_payment_methods.str_payment_methods) ? response.of_get_payment_methodsResult.lstr_payment_methods.str_payment_methods :"";

				/** Save api request response */
				this.saveApiRequestResponse(req,res,next,{
					method_name :	"of_get_payment_methods",
					response	: 	response,
					request		:	apiResuest,
				}).then(()=>{});

				/** Send success response */
				if(!paymentList || paymentList.length == 0){
					return resolve({status: Constants.STATUS_SUCCESS, message: "No payment mothod found"});
				}

				asyncParallel({
					restaurant_details : (callback)=>{
						/** Get restaurant details */
						this.getRestaurantList(req,res,next,{restaurant_id:aghzeyaRestId}).then(response=>{
							callback(null, response);
						}).catch(next);
					},
					admin_id : (callback)=>{
						/** Get admin details */
						this.userDB.findOne({user_role_id: Constants.SYSTEM_ADMIN_ROLE_ID},{projection:{_id:1}}).then(result=>{
							let adminId = (result) ? result._id	:"";
							callback(null, adminId);
						}).catch(next);
					},
				},(asyncErr, asyncResponse)=> {
					if(asyncErr) return next(asyncErr);

					let adminId 	= (asyncResponse.admin_id) 	? asyncResponse.admin_id 	:"";
					let restDetails=(asyncResponse.restaurant_details)?asyncResponse.restaurant_details:{};
					let restaurantId  = (restDetails.restaurant_id)   ? restDetails.restaurant_id 	:"";
					let restaurantSlug= (restDetails.restaurant_slug) ? restDetails.restaurant_slug :"";
					let excludePaymentSync= (restDetails.is_exclude_payment_method_sync) ? restDetails.is_exclude_payment_method_sync :false;

					/** Send error response */
					if(!restaurantId || !restaurantSlug){
						return resolve({status: Constants.STATUS_ERROR,message : "Something went wrong, Please try again.", restaurantId: restaurantId, restaurantSlug: restaurantSlug });
					}

					if(excludePaymentSync) return resolve({status: Constants.STATUS_SUCCESS });

					let deleteAbleId = new ObjectId();

					/** Update payment method details */
					this.aghzeyaRestaurantPaymentMethodDB.updateMany({
						restaurant_id	:	restaurantId,
					},
					{$set : {
						to_be_deleted	: deleteAbleId
					}}).then(()=>{

						eachOfSeries(paymentList, (records, index,eachcallback) => {
							let aghzeyaPaymentId 	= 	String(records.id);
							let cravezPaymentMethod	=	Constants.CREDIT_PAYMENT;

							Object.keys(this.AGHZEYA_PAYMENT_TYPE).map(key=>{
								if(this.AGHZEYA_PAYMENT_TYPE[key] == aghzeyaPaymentId && key != Constants.SHEEEL_CARD){
									cravezPaymentMethod = key;
								}
							});

							/** Save details **/
							this.aghzeyaRestaurantPaymentMethodDB.updateOne({
								restaurant_id 		: 	restaurantId,
								aghzeya_payment_id	:	aghzeyaPaymentId,
							},
							{
								$set : {
									name	: 	{ en: records.e_name, ar: records.a_name},
									modified:	getUtcDate(),
									cravez_payment_method:	cravezPaymentMethod,
								},
								$setOnInsert: {
									aghzeya_restaurant_id : aghzeyaRestId,
									channel_id		: Constants.CHANNEL_SOAP,
									restaurant_slug	: restaurantSlug,
									created			: getUtcDate(),
									added_by		: adminId,
									aghzeya			: true,
								},
								$unset: {
									to_be_deleted: 1,
								}
							},{upsert: true}).then(()=>{
								eachcallback(null);
							}).catch(next);
						},(asyncEachErr)=>{
							if(asyncEachErr) return next(asyncEachErr);

							/** Delete payment methods details */
							this.aghzeyaRestaurantPaymentMethodDB.deleteMany({
								restaurant_id	:	restaurantId,
								to_be_deleted	:	deleteAbleId
							}).then(()=>{
								resolve({status: Constants.STATUS_SUCCESS });
							}).catch(next);
						});
					}).catch(next);
				});
			});
		}).catch(next);
	};//End getPaymentMethods()

	/**
	 * This function to get restaurant sources method
	 *
	 * @param req	As 	Request Data
	 * @param res	As	Response Data
	 * @param next	As 	Callback argument to the middleware function
	 * @param client As	SOAP module instance
	 *
	 * @return json
	**/
	async getSources (req,res,next,client){
		return new Promise(resolve=>{
			let aghzeyaRestId	= req.params.restaurant_id;

			/** Call service */
			let apiResuest = {passcode: this.SOAP_PASSCODE, resturant_id: aghzeyaRestId};
			client["of_get_sources"](apiResuest,(err, response)=>{
				if (err) return next(err);

				let sourceList = (response && response.of_get_sourcesResult && response.of_get_sourcesResult.lstr_sources && response.of_get_sourcesResult.lstr_sources.str_sources) ? response.of_get_sourcesResult.lstr_sources.str_sources :[];

				/** Save api request response */
				this.saveApiRequestResponse(req,res,next,{
					method_name :	"of_get_sources",
					response	: 	response,
					request		:	apiResuest,
				}).then(()=>{});

				/** Send success response */
				if(!sourceList || sourceList.length == 0){
					return resolve({status: Constants.STATUS_SUCCESS, message: "No sources found"});
				}

				asyncParallel({
					restaurant_details : (callback)=>{
						/** Get restaurant details */
						this.getRestaurantList(req,res,next,{restaurant_id:aghzeyaRestId}).then(response=>{
							callback(null, response);
						}).catch(next);
					},
					admin_id : (callback)=>{
						/** Get admin details */
						this.userDB.findOne({user_role_id: Constants.SYSTEM_ADMIN_ROLE_ID},{projection:{_id:1}}).then(result=>{
							let adminId = (result) ? result._id	:"";
							callback(null, adminId);
						}).catch(next);
					},
				},(asyncErr, asyncResponse)=> {
					if(asyncErr) return next(asyncErr);

					let restDetails		=	(asyncResponse.restaurant_details)?asyncResponse.restaurant_details:{};
					let restaurantId  	= 	(restDetails.restaurant_id)   	?	restDetails.restaurant_id 	:"";
					let restaurantSlug	= 	(restDetails.restaurant_slug)	? 	restDetails.restaurant_slug :"";
					let adminId 		=	(asyncResponse.admin_id) 		? 	asyncResponse.admin_id 		:"";

					/** Send error response */
					if(!restaurantId || !restaurantSlug){
						return resolve({status: Constants.STATUS_ERROR,message : "Something went wrong, Please try again.", restaurantId: restaurantId, restaurantSlug: restaurantSlug });
					}

					let deleteAbleId = new ObjectId();

					/** Update sources details */
					this.aghzeyaRestaurantSourcesDB.updateMany({
						restaurant_id	:	restaurantId,
					},
					{$set : {
						to_be_deleted	: deleteAbleId
					}}).then(()=>{

						eachOfSeries(sourceList, (records, index,eachcallback) => {
							let sourceId 	= 	String(records.id);
							let sourceName 	= 	(records.e_name) ? records.e_name :records.a_name;

							/** Get slug **/
							getDatabaseSlug({
								title 		: sourceName,
								table_name 	: "aghzeya_sources",
								slug_field 	: "slug"
							}).then(slugResponse=>{
								let slug = (slugResponse && slugResponse.title) ? slugResponse.title :"";

								this.aghzeyaRestaurantSourcesDB.updateOne({
									restaurant_id 		: 	restaurantId,
									aghzeya_source_id 	: 	sourceId
								},
								{
									$set : {
										name 	 : {en : records.e_name,ar : records.a_name},
										modified : getUtcDate()
									},
									$setOnInsert: {
										slug	: slug,
										aghzeya_restaurant_id : aghzeyaRestId,
										channel_id		: Constants.CHANNEL_SOAP,
										restaurant_slug	: restaurantSlug,
										created			: getUtcDate(),
										added_by		: adminId,
										aghzeya			: true,
									},
									$unset: {
										to_be_deleted: 1,
									}
								},{upsert :true}).then(()=>{
									eachcallback(null);
								}).catch(next);
							}).catch(next);
						},(asyncEachErr)=>{
							if(asyncEachErr) return next(asyncEachErr);

							/** Delete sources details */
							this.aghzeyaRestaurantSourcesDB.deleteMany({
								restaurant_id	:	restaurantId,
								to_be_deleted	:	deleteAbleId
							}).then(()=>{
								resolve({status: Constants.STATUS_SUCCESS });
							}).catch(next);
						});
					}).catch(next);
				});
			});
		}).catch(next);
	};//End getSources()

	/**
	 * This function to get restaurant branch
	 *
	 * @param req	As 	Request Data
	 * @param res	As	Response Data
	 * @param next	As 	Callback argument to the middleware function
	 * @param client As	SOAP module instance
	 *
	 * @return json
	**/
	async getBranch (req,res,next,client){
		return new Promise(resolve=>{
			let aghzeyaRestId	= req.params.restaurant_id;

			/** Call service */
			let apiResuest = {passcode: this.SOAP_PASSCODE, resturant_id: aghzeyaRestId};
			client["of_get_branches"](apiResuest,(err, response)=>{
				if (err) return next(err);

				let branchList = (response && response.of_get_branchesResult && response.of_get_branchesResult.lstr_branches && response.of_get_branchesResult.lstr_branches.str_branches) ? response.of_get_branchesResult.lstr_branches.str_branches :"";

				/** Save api request response */
				this.saveApiRequestResponse(req,res,next,{
					method_name :	"of_get_branches",
					response	: 	response,
					request		:	apiResuest,
				}).then(()=>{});

				/** Send success response */
				if(!branchList || branchList.length == 0){
					return resolve({status: Constants.STATUS_SUCCESS, message: "No branch found"});
				}

				asyncParallel({
					rest_details : (callback)=>{
						/** Get restaurant details */
						this.getRestaurantList(req,res,next,{restaurant_id:aghzeyaRestId}).then(response=>{
							callback(null, response);
						}).catch(next);
					},
					admin_id : (callback)=>{
						/** Get admin details */
						this.userDB.findOne({user_role_id: Constants.SYSTEM_ADMIN_ROLE_ID},{projection:{_id:1}}).then(result=>{
							let adminId = (result) ? result._id	:"";
							callback(null, adminId);
						}).catch(next);
					},
					cravez_payment_methods : (callback)=>{
						/** Get payment methods list */
						this.aghzeyaRestaurantPaymentMethodDB.distinct("cravez_payment_method",{
							aghzeya_restaurant_id : aghzeyaRestId,
							$and: [
								{cravez_payment_method: {$exists: true}},
								{cravez_payment_method: {$nin: ["",null]}},
							]
						}).then(result=>{
							callback(null, result);
						}).catch(next);
					},
					attributes_list : (parellelCallback)=>{
						/** Get attributes list */
						this.attributesDB.find({type: "branch_attributes"},{projection : {attribute_id: 1,default_value: 1}}).toArray().then(result=>{
							parellelCallback(null,result);
						}).catch(next);
					},
				},(asyncErr, asyncResponse)=> {
					if(asyncErr) return next(asyncErr);

					let adminId 	   = (asyncResponse.admin_id) 		? asyncResponse.admin_id 	  :"";
					let attributesList = (asyncResponse.attributes_list)? asyncResponse.attributes_list:[];
					let restDetails    = (asyncResponse.rest_details)	? asyncResponse.rest_details  :{};
					let restaurantId   = (restDetails.restaurant_id) 	? restDetails.restaurant_id   :"";
					let restaurantSlug = (restDetails.restaurant_slug)  ? restDetails.restaurant_slug :"";
					let cravezPaymentMethods = (asyncResponse.cravez_payment_methods)? asyncResponse.cravez_payment_methods:[];

					/** Send error response */
					if(!restaurantId || !restaurantSlug || attributesList.length ==0 || cravezPaymentMethods.length ==0 ){
						return resolve({status: Constants.STATUS_ERROR,message : "Something went wrong, Please try again.", asyncResponse: asyncResponse });
					}

					/** Get payment methods list */
					this.paymentMethodDB.distinct("slug",{slug: {$in: cravezPaymentMethods }}).then(paymentMethods=>{

						if(paymentMethods.length ==0 ){
							return resolve({status: Constants.STATUS_ERROR,message : "Something went wrong, Please try again.", paymentMethods: paymentMethods, cravezPaymentMethods: cravezPaymentMethods });
						}


						/** Get branchs list */
						this.restaurantBranchDB.distinct("_id",{restaurant_id:restaurantId}).then(branchIds=>{

							asyncParallel({
								menu_id : (subCallback)=>{
									/** Get restaurant menu details */
									this.restaurantMenuDB.findOne({restaurant_id: restaurantId },{projection:{_id:1}}).then(result=>{
										let menuId = (result) ? result._id	:"";
										if(menuId) return subCallback(null, menuId);

										getUniqueId(req,res,next,{type:"restaurant_menus"}).then(uniqueResponse=>{
											let uniqueId = (uniqueResponse.result) ? uniqueResponse.result :"";

											/** Save menu details **/
											this.restaurantMenuDB.updateOne({
												restaurant_id : restaurantId,
											},
											{
												$set : {
													aghzeya_restaurant_id : aghzeyaRestId,
													name		: 	{ en:"Default Menu", ar: "القائمة الافتراضية"},
													modified	:	getUtcDate(),
													is_default	: 	true,
													image		: 	"",
													end_date	: 	"",
													end_time	: 	"",
													start_date	: 	"",
													start_time	: 	"",
												},
												$setOnInsert: {
													is_active		: 	Constants.ACTIVE,
													channel_id		: 	Constants.CHANNEL_SOAP,
													menu_type		: 	Constants.GLOBAL_MENU,
													menu_id			: 	uniqueId,
													restaurant_slug	: 	restaurantSlug,
													created			: 	getUtcDate(),
													added_by		: 	adminId,
													aghzeya			:	true,
												}
											},{upsert: true}).then(updateRes=>{
												let menuId = (updateRes &&  updateRes.upsertedId && updateRes.upsertedId._id) ? updateRes.upsertedId._id:"";
												subCallback(null, menuId);
											}).catch(next);
										}).catch(next);
									}).catch(next);
								},
							},(asyncSubErr, asyncSubResponse)=> {
								if(asyncSubErr) return next(asyncSubErr);

								/** Send error response */
								if(!asyncSubResponse.menu_id){
									return resolve({status: Constants.STATUS_ERROR,message : "Something went wrong, Please try again.", menu_id: asyncSubResponse.menu_id });
								}

								let deleteAbleId = new ObjectId();

								/** Update branchs related details */
								asyncParallel({
									update_branch : (childCallback)=>{
										if(branchIds.length ==0) return childCallback(null);

										/** Update branchs details */
										this.restaurantBranchDB.updateMany({
											_id: {$in: branchIds}
										},
										{$set: {
											to_be_deleted: deleteAbleId
										}}).then(()=>{
											childCallback(null);
										}).catch(next);
									},
									update_branch_payment : (childCallback)=>{
										if(branchIds.length ==0) return childCallback(null);

										/** Update branch payment method details */
										this.restaurantBranchPaymentMethodDB.updateMany({
											branch_id: {$in: branchIds},
										},
										{$set : {
											to_be_deleted : deleteAbleId
										}}).then(()=>{
											childCallback(null);
										}).catch(next);
									},
									update_branch_menu : (childCallback)=>{
										if(branchIds.length ==0) return childCallback(null);

										/** Update branch menu details */
										this.restaurantMenuBranchDB.updateMany({
											branch_id: {$in: branchIds},
										},
										{$set : {
											to_be_deleted : deleteAbleId
										}}).then(()=>{
											childCallback(null);
										}).catch(next);
									},
									update_branch_calendars : (childCallback)=>{
										if(branchIds.length ==0) return childCallback(null);

										/** Update branch calendars details */
										this.restaurantBranchCalendarDB.updateMany({
											branch_id: {$in: branchIds},
										},
										{$set : {
											to_be_deleted : deleteAbleId
										}}).then(()=>{
											childCallback(null);
										}).catch(next);
									},
									update_branch_attributes : (childCallback)=>{
										if(branchIds.length ==0) return childCallback(null);

										/** Update branch attributes details */
										this.restaurantBranchAttributeDB.updateMany({
											branch_id: {$in: branchIds},
										},
										{$set : {
											to_be_deleted : deleteAbleId
										}}).then(()=>{
											childCallback(null);
										}).catch(next);
									},
								},(asyncChildErr)=> {
									if(asyncChildErr) return next(asyncChildErr);

									let menuId = asyncSubResponse.menu_id;
									eachOfSeries(branchList, (records, index,eachcallback) => {
										let aghzeyaBranchId = String(records.branch_id);

										asyncParallel({
											unique_id : (childCallback)=>{
												/** get branch unqiue id **/
												getUniqueId(req,res,next,{type:"restaurant_branches"}).then(uniqueResponse=>{
													childCallback(null,uniqueResponse.result);
												}).catch(next);
											},
											branch_details : (childCallback)=>{
												/** get branch id **/
												this.restaurantBranchDB.findOne({
													restaurant_id 		: 	restaurantId,
													aghzeya_branch_id	:	aghzeyaBranchId
												}, { projection: {_id: 1, is_exclude_branch_details_sync: 1, is_exclude_phone_number_sync:1}}).then(result=>{
													childCallback(null, result);
												}).catch(next);
											},
										},(childErr, childResponse)=>{
											if(childErr) return eachcallback(childErr);

											let oldBraDetails = (childResponse.branch_details) ? childResponse.branch_details :{};
											let branchId = 	(oldBraDetails._id) ? oldBraDetails._id :new ObjectId();
											let excludeBranchDetails = (oldBraDetails.is_exclude_branch_details_sync) ? oldBraDetails.is_exclude_branch_details_sync :0;
											let uniqueId 	= 	(childResponse.unique_id) ? childResponse.unique_id :"";
											let openFrom 	= 	(records.open_from)	? 	records.open_from 	:0;
											let openTo 		= 	(records.open_to)	?	records.open_to 	:0;
											let isOpened 	= 	(records.opened)? parseInt(records.opened) 	:0;
											let w247 	 	= 	(records.w247)	? parseInt(records.w247)	:0;
											let formHours	= 	0;
											let formMin	 	= 	0;
											let toHours  	= 	23;
											let toMin  	 	=	59;
											let activeStatus=	(isOpened)	? Constants.ACTIVE :Constants.DEACTIVE;

											if(!w247 && openFrom != openTo){
												formHours= (openFrom)?parseFloat(newDate(getUtcDate(openFrom),"HH")):0;
												formMin	= (openFrom)? parseFloat(newDate(getUtcDate(openFrom),"MM")):0;
												toHours	= (openTo) ? 	parseFloat(newDate(getUtcDate(openTo),"HH")):0;
												toMin	= (openTo) ? 	parseFloat(newDate(getUtcDate(openTo),"MM")):0;

												if(!formHours && !toHours && formMin<=1 && toMin<=1){
													formHours	= 	0;
													formMin	 	= 	0;
													toHours  	= 	23;
													toMin  	 	=	59;
												}
											}

											let updateData = {
												name: {
													en: (records.branch_e_name) ? records.branch_e_name : records.branch_a_name,
													ar: (records.branch_a_name) ? records.branch_a_name : ""
												},
												modified: getUtcDate(),
												exclude_status_when_update: excludeBranchDetails,
											};

											if (!excludeBranchDetails){
												updateData.city_id			= 	"";
												updateData.area_id 			= 	"";
												updateData.block 			= 	"";
												updateData.street 			= 	"";
												updateData.build_no 		= 	"";
												updateData.description 		= 	"";
												updateData.longitude 		= 	0;
												updateData.latitude 		= 	0;
												updateData.long_lat 		= 	[0, 0];
												updateData.address 			= 	(records.address) ? records.address : "Unknown Address";
												updateData.is_active 		=	activeStatus;
												updateData.aghzeya_w247 	= 	records.w247;
												updateData.aghzeya_count 	= 	records.count;
												updateData.aghzeya_opened 	= 	records.opened;
												updateData.aghzeya_open_from= 	records.open_from;
												updateData.aghzeya_open_to 	=	records.open_to;
												updateData.aghzeya_avg_prep_mins= records.avg_prep_mins;
											}

											/** Save details **/
											this.restaurantBranchDB.updateOne({
												_id : 	branchId,
											},
											{
												$set : updateData,
												$setOnInsert: {
													restaurant_id 		: 	restaurantId,
													aghzeya_branch_id	:	aghzeyaBranchId,
													aghzeya_restaurant_id : aghzeyaRestId,
													created 		:	getUtcDate(),
													branch_status	: 	Constants.OPEN,
													aghzeya			: 	true,
													restaurant_id	: 	restaurantId,
													restaurant_slug	: 	restaurantSlug,
													added_by		: 	adminId,
													channel_id		:	Constants.CHANNEL_SOAP,
													branch_number	: 	uniqueId,
													delivery_vehicle_type: 	[Constants.VEHICLE_TYPE_CAR, Constants.VEHICLE_TYPE_BIKE],
												},
												$unset: {
													to_be_deleted	: 	1
												}
											},{upsert: true}).then(updateRes => {

												branchId = (updateRes &&  updateRes.upsertedId && updateRes.upsertedId._id) ? updateRes.upsertedId._id	:branchId;

												asyncParallel({
													branch_payments : (childSubCallback)=>{
														this.restaurantBranchPaymentMethodDB.updateOne({
															restaurant_id : restaurantId,
															branch_id 	  :	branchId,
														},
														{
															$set : {
																payment_methods : paymentMethods,
																modified	: 	getUtcDate(),
																aghzeya		:	true,
																aghzeya_restaurant_id : aghzeyaRestId,
															},
															$setOnInsert: {
																created 	: 	getUtcDate(),
																added_by	: 	adminId,
																channel_id	:	Constants.CHANNEL_SOAP,
															},
															$unset: {
																to_be_deleted: 	1
															}
														},{upsert: true}).then(()=>{
															childSubCallback(null);
														}).catch(next);
													},
													branch_menu : (childSubCallback)=>{
														this.restaurantMenuBranchDB.updateOne({
															menu_id 	  : menuId,
															restaurant_id : restaurantId,
															branch_id 	  :	branchId,
														},
														{
															$set : {
																modified	: 	getUtcDate(),
																aghzeya		:	true,
																aghzeya_restaurant_id : aghzeyaRestId,
															},
															$setOnInsert: {
																created 	: 	getUtcDate(),
																added_by	: 	adminId,
																channel_id	:	Constants.CHANNEL_SOAP,
															},
															$unset: {
																to_be_deleted: 	1
															}
														},{upsert: true}).then(()=>{
															childSubCallback(null);
														}).catch(next);
													},
													branch_calendars : (childCallback)=>{
														this.restaurantBranchCalendarDB.updateOne({
															restaurant_id : restaurantId,
															branch_id 	  :	branchId,
														},
														{
															$set : {
																status 		: 	Constants.OPEN,
																type		:	Constants.DEFAULT_WEEK,
																from_hour 	:	formHours,
																from_minute	:	formMin,
																to_hour		:	toHours,
																to_minute 	:	toMin,
																aghzeya		:	true,
																aghzeya_restaurant_id : aghzeyaRestId,
																modified	:	getUtcDate(),
															},
															$setOnInsert : {
																parent_id 		: 	"",
																added_by 		: 	adminId,
																channel_id		:	Constants.CHANNEL_SOAP,
																created 		: 	getUtcDate()
															},
															$unset: {
																to_be_deleted	: 	1
															}
														},{upsert: true}).then(()=>{
															childCallback(null);
														}).catch(next);
													},
													branch_attributes : (childCallback)=>{
														asyncEach(attributesList,(attributeData,attributeCallback)=>{
															let defaultValue 	=	attributeData.default_value;
															let attributeId 	= 	attributeData.attribute_id;

															asyncParallel({
																update_area : (subChildCallback)=>{
																	let branchAreaFields = setBranchAreaAttributes(attributeId, defaultValue);
																	if(!branchAreaFields) return subChildCallback(null);

																	this.restaurantBranchDB.updateOne({
																		_id : branchId,
																	},
																	{
																		$set : branchAreaFields,

																	}).then(()=>{
																		subChildCallback(null);
																	}).catch(next);
																},
																save_area_settings : (subChildCallback)=>{
																	this.restaurantBranchAttributeDB.updateOne({
																		branch_id	: branchId,
																		attribute_id: attributeId,
																	},
																	{
																		$set : {
																			modified: getUtcDate(),
																			aghzeya_restaurant_id : aghzeyaRestId,
																		},
																		$setOnInsert: {
																			value			: defaultValue,
																			restaurant_id	: restaurantId,
																			added_by		: adminId,
																			channel_id		: Constants.CHANNEL_SOAP,
																			created			: getUtcDate(),
																			aghzeya			: true
																		},
																		$unset: {
																			to_be_deleted	: 	1
																		}
																	},{upsert: true}).then(()=>{
																		subChildCallback(null);
																	}).catch(next);
																}
															},(asyncChildErr)=>{
																attributeCallback(asyncChildErr);
															});
														},asyncAreaErr=>{
															childCallback(asyncAreaErr);
														});
													},
												},(childSubErr)=>{
													eachcallback(childSubErr);
												});
											}).catch(next);
										});
									},(asyncEachErr)=>{
										if(asyncEachErr) return next(asyncEachErr);

										/** Delete branch related details */
										asyncParallel({
											update_branch : (childCallback)=>{
												if(branchIds.length ==0) return childCallback(null);

												/** Delete branchs details */
												this.restaurantBranchDB.deleteMany({
													_id				: 	{$in: branchIds},
													to_be_deleted	:	deleteAbleId
												}).then(()=>{
													childCallback(null);
												}).catch(next);
											},
											update_branch_payment : (childCallback)=>{
												if(branchIds.length ==0) return childCallback(null);

												/** Delete branchs payment method details */
												this.restaurantBranchPaymentMethodDB.deleteMany({
													branch_id		: 	{$in: branchIds},
													to_be_deleted	:	deleteAbleId
												}).then(()=>{
													childCallback(null);
												}).catch(next);
											},
											update_branch_menu : (childCallback)=>{
												if(branchIds.length ==0) return childCallback(null);

												/** Delete branchs menu details */
												this.restaurantMenuBranchDB.deleteMany({
													branch_id		: 	{$in: branchIds},
													to_be_deleted	:	deleteAbleId
												}).then(()=>{
													childCallback(null);
												}).catch(next);
											},
											update_branch_calendars : (childCallback)=>{
												if(branchIds.length ==0) return childCallback(null);

												/** Delete branchs calendars details */
												this.restaurantBranchCalendarDB.deleteMany({
													branch_id		: 	{$in: branchIds},
													to_be_deleted	:	deleteAbleId
												}).then(()=>{
													childCallback(null);
												}).catch(next);
											},
											update_branch_attributes : (childCallback)=>{
												if(branchIds.length ==0) return childCallback(null);

												/** Delete branchs attributes details */
												this.restaurantBranchAttributeDB.deleteMany({
													branch_id		: 	{$in: branchIds},
													to_be_deleted	:	deleteAbleId
												}).then(()=>{
													childCallback(null);
												}).catch(next);
											},
										},(asyncChildErr)=>{
											if(asyncChildErr) return next(asyncChildErr);

											resolve({status: Constants.STATUS_SUCCESS });
										});
									});
								});
							});
						}).catch(next);
					}).catch(next);
				});
			});
		}).catch(next);
	};//End getBranch()

	/**
	 * This function to get resuarant item
	 *
	 * @param req	As 	Request Data
	 * @param res	As	Response Data
	 * @param next	As 	Callback argument to the middleware function
	 * @param client As	SOAP module instance
	 *
	 * @return json
	**/
	async getItems (req,res,next,client){
		return new Promise(resolve=>{
			let aghzeyaRestaurantId	= req.params.restaurant_id;

			/** Call service */
			let apiResuest = {passcode:this.SOAP_PASSCODE,resturant_id:aghzeyaRestaurantId,cat:0};
			client["of_get_items"](apiResuest,(err, response)=>{

				/** Save api request response */
				this.saveApiRequestResponse(req,res,next,{
                    method_name :	"of_get_items",
                    response	: 	client.lastResponse,
					request		:	client.lastRequest,
                    request_error:	String(err),
				}).then(()=>{});

				if(err) return next(err);

				let itemList = (response && response.of_get_itemsResult && response.of_get_itemsResult.lstr_items && response.of_get_itemsResult.lstr_items.str_items) ? response.of_get_itemsResult.lstr_items.str_items :"";

				/** Send success response */
				if(!itemList || itemList.length == 0){
					return resolve({status: Constants.STATUS_SUCCESS, message: "No Items found"});
				}

                asyncParallel({
                    rest_details : (callback)=>{
						/** Get restaurant details */
						this.getRestaurantList(req,res,next,{restaurant_id:aghzeyaRestaurantId}).then(response=>{
							callback(null, response);
						}).catch(next);
					},
					admin_id : (callback)=>{
						/** Get admin details */
						this.userDB.findOne({user_role_id: Constants.SYSTEM_ADMIN_ROLE_ID},{projection:{_id:1}}).then(result=>{
							let adminId = (result) ? result._id	:"";
							callback(null, adminId);
						}).catch(next);
					},
					branch_list :(callback)=>{
						/** Get branch list */
						this.restaurantBranchDB.find({aghzeya_restaurant_id : aghzeyaRestaurantId},{projection:{_id:1,aghzeya_branch_id:1}}).toArray().then(result=>{
							if(result.length ==0) return callback(null,null);

							let recordList = {};
							result.map(record=>{
								recordList[record.aghzeya_branch_id] = record._id;
							});
							callback(null,recordList);
						}).catch(next);
					},
					category_list :(callback)=>{
						/** Get category list */
						this.restaurantCategoryDB.find({aghzeya_restaurant_id : aghzeyaRestaurantId},{projection:{_id:1,aghzeya_category_id:1}}).toArray().then(result=>{
							if(null || result.length ==0) return callback(null,null);

							let recordList = {};
							result.map(record=>{
								recordList[record.aghzeya_category_id] = record._id;
							});
							callback(null,recordList);
						}).catch(next);
					},
				},(asyncErr, asyncResponse)=> {
					if(asyncErr) return next(asyncErr);

					let adminId 		= (asyncResponse.admin_id) 		? asyncResponse.admin_id 	 :"";
					let restDetails 	= (asyncResponse.rest_details)	? asyncResponse.rest_details :{};
					let branchList		= (asyncResponse.branch_list)	? asyncResponse.branch_list	 :{};
					let categoryList	= (asyncResponse.category_list)	? asyncResponse.category_list:{};
					let restaurantId 	= (restDetails.restaurant_id) 	? restDetails.restaurant_id  :"";
					let restaurantSlug 	= (restDetails.restaurant_slug) ? restDetails.restaurant_slug:"";
					let excludeItemDetailsFormSync = (restDetails.exclude_item_details_form_sync) ? restDetails.exclude_item_details_form_sync:false;

					/** Send error response */
					if(!restaurantId || !restaurantSlug || !asyncResponse.branch_list || !asyncResponse.category_list){
						return resolve({status: Constants.STATUS_ERROR,message : "Something went wrong, Please try again.", asyncResponse: asyncResponse });
					}

					let deleteAbleId = new ObjectId();

					/** Get item list */
					this.itemsDB.distinct("_id",{restaurant_id: restaurantId}).then(itemIds=>{

						/** Update item related details */
						asyncParallel({
							update_items : (childCallback)=>{
								if(itemIds.length ==0) return childCallback(null);

								/** Update item details */
								this.itemsDB.updateMany({
									_id: {$in: itemIds},
								},
								{$set : {
									to_be_deleted: deleteAbleId
								}}).then(()=>{
									childCallback(null);
								}).catch(next);
							},
							update_item_linkings : (childCallback)=>{
								if(itemIds.length ==0) return childCallback(null);

								/** Update item linking details */
								this.itemLinkingDB.updateMany({
									item_id: {$in: itemIds},
								},
								{$set : {
									to_be_deleted : deleteAbleId
								}}).then(()=>{
									childCallback(null);
								}).catch(next);
							},
							update_item_availability : (childCallback)=>{
								if(itemIds.length ==0) return childCallback(null);

								/** Update item availability details */
								this.itemAvailabilityDB.updateMany({
									item_id: {$in: itemIds},
								},
								{$set : {
									to_be_deleted : deleteAbleId
								}}).then(()=>{
									childCallback(null);
								}).catch(next);
							},
						},(asyncChildErr)=> {
							if(asyncChildErr) return next(asyncChildErr);

							eachOfSeries(itemList, (records, index,eachcallback) => {
								let aghzeyaItemId = String(records.id);

								asyncParallel({
									unique_id : (childCallback)=>{
										/** get item unqiue id **/
										getUniqueId(req,res,next,{type:"item"}).then(uniqueIdResponse=>{
											childCallback(null,uniqueIdResponse.result);
										}).catch(next);
									},
									item_details : (childCallback)=>{
										/** Get item details */
										this.itemsDB.findOne({
											restaurant_id 	: restaurantId,
											aghzeya_item_id : aghzeyaItemId,
										},{}).then(itemResult=>{
											childCallback(null,itemResult);
										}).catch(next);
									}
								},(childErr, childResponse)=> {
									if(childErr) return eachcallback(childErr);

									let uniqueId 		=	(childResponse.unique_id)		?	childResponse.unique_id 	:"";
									let oldItemDetails	= 	(childResponse.item_details) 	? 	childResponse.item_details 	:{};
									let itemObjId		= 	(oldItemDetails._id) 			? 	oldItemDetails._id 			:new ObjectId();
									let aghzeyaBranches = 	[];
									let branchIds 		= 	[];

									/** Manage branch ids  */
									if(records.brs && records.brs.str_item_branches && records.brs.str_item_branches.length > 0){
										records.brs.str_item_branches.map(data=>{
											let tmpBranchId = String(data.branch_id);

											aghzeyaBranches.push(tmpBranchId);

											if(branchList[tmpBranchId]){
												branchIds.push(branchList[tmpBranchId]);
											}
										});
									}

									/** Manage category ids  */
									let categoryIds		= [];
									let aghzeyaCatId	= (records.cat2) ? records.cat2 : records.cat3;
									if(aghzeyaCatId && categoryList[aghzeyaCatId]){
										categoryIds.push(new ObjectId(categoryList[aghzeyaCatId]));
									}

									/** Set item update data */
									let itemUpdateData = {
										aghzeya_category_id	: aghzeyaCatId,
										aghzeya_branch_ids	: aghzeyaBranches,
										aghzeya_notes		: (records.notes && records.notes.string) ? records.notes.string.join(", ") :"",
										branch_ids			: branchIds,
										name 				: {
											en : records.e_name,
											ar : records.a_name,
										},
										menu_ids 	 		: [],
										category_ids 		: categoryIds,
										cuisine_id 			: "",
										non_sellable 		: 0,
										price_on_selection 	: 0,
										discount_value 		: 0,
										discount_percentage : 0,
										item_price			: round(records.price),
										modified			: getUtcDate(),
										availability_status	: Constants.AVAILABLE,
										exclude_status_when_update: excludeItemDetailsFormSync,
									};

									if(!excludeItemDetailsFormSync){
										itemUpdateData.image 		=	"";
										itemUpdateData.grid_image	= 	"";
										itemUpdateData.detail_image = 	"";
										itemUpdateData.description	=	{en: records.e_name, ar: records.a_name};

										itemUpdateData.image_before_sync 		=	(oldItemDetails.image) 			?	oldItemDetails.image 		:"";
										itemUpdateData.grid_image_before_sync	= 	(oldItemDetails.grid_image) 	? 	oldItemDetails.grid_image 	:"";
										itemUpdateData.detail_image_before_sync = 	(oldItemDetails.detail_image) 	? 	oldItemDetails.detail_image :"";
										itemUpdateData.description_before_sync	= 	(oldItemDetails.description) 	? 	oldItemDetails.description 	:"";
									}

									/** Save details **/
									this.itemsDB.updateOne({
										_id	: itemObjId,
									},
									{
										$set : itemUpdateData,
										$setOnInsert: {
											is_active	: Constants.ACTIVE,
											channel_id	: Constants.CHANNEL_SOAP,
											item_id		: uniqueId,
											created		: getUtcDate(),
											added_by	: adminId,
											aghzeya		: true,
											restaurant_slug	: restaurantSlug,
											restaurant_id 	: restaurantId,
											aghzeya_item_id : aghzeyaItemId,
											aghzeya_restaurant_id: aghzeyaRestaurantId,
										},
										$unset: {
											to_be_deleted: 1,
										},
									},{upsert: true}).then(()=>{

										asyncParallel({
											item_linkings : (parallelCallback)=>{
												/** Save branch item mapping details  */
												this.itemLinkingDB.updateOne({
													item_id	: itemObjId,
												},
												{
													$set : {
														menu_ids			: [],
														branch_ids			: branchIds,
														category_ids		: categoryIds,
														aghzeya_item_id 	: aghzeyaItemId,
														aghzeya_branch_ids	: aghzeyaBranches,
														aghzeya_category_ids: [aghzeyaCatId],
														aghzeya				: true,
														type	: Constants.ITEM_NOT_LISTED_TO_SELECTED_BRANCH_LIST,
														customize_attributes: {
															name: {en: records.e_name, ar: records.a_name},
															price_on_selection	: 0
														},
													},
													$setOnInsert : {
														restaurant_id	: restaurantId,
														created	 		: getUtcDate()
													},
													$unset: {
														to_be_deleted: 1,
													},
												},{upsert :true}).then(()=>{
													parallelCallback(null);
												}).catch(next);
											},
											item_availability : (parallelCallback)=>{
												/** Save item availability  */
												this.itemAvailabilityDB.updateOne({
													item_id	: itemObjId,
												},
												{
													$set : {
														aghzeya_item_id : 	aghzeyaItemId,
														from_time 		: 	0,
														to_time			: 	23.59,
														comment			: 	"",
														modified   		: 	getUtcDate(),
														aghzeya			:	true,
													},
													$setOnInsert : {
														restaurant_id	: 	restaurantId,
														created	 		:	getUtcDate()
													},
													$unset: {
														to_be_deleted: 1,
													},
												},{upsert :true}).then(()=>{
													parallelCallback(null);
												}).catch(next);
											}
										},(parallelErr)=> {
											eachcallback(parallelErr);
										});
									}).catch(next);
								});
							},(asyncEachErr)=>{
								if(asyncEachErr) return next(asyncEachErr);

								/** Update branch areas */
								asyncParallel({
									update_items : (childCallback)=>{
										if(itemIds.length ==0) return childCallback(null);

										/** Delete item details */
										this.itemsDB.deleteMany({
											_id				: 	{$in: itemIds},
											to_be_deleted	:	deleteAbleId
										}).then(()=>{
											childCallback(null);
										}).catch(next);
									},
									update_item_linkings : (childCallback)=>{
										if(itemIds.length ==0) return childCallback(null);

										/** Delete item linking details */
										this.itemLinkingDB.deleteMany({
											item_id			: 	{$in: itemIds},
											to_be_deleted	:	deleteAbleId
										}).then(()=>{
											childCallback(null);
										}).catch(next);
									},
									update_item_availability : (childCallback)=>{
										if(itemIds.length ==0) return childCallback(null);

										/** Delete item availability details */
										this.itemAvailabilityDB.deleteMany({
											item_id			: 	{$in: itemIds},
											to_be_deleted	:	deleteAbleId
										}).then(()=>{
											childCallback(null);
										}).catch(next);
									},
								},(asyncChildErr)=>{
									if(asyncChildErr) return next(asyncChildErr);

									resolve({status: Constants.STATUS_SUCCESS });
								});
							});
						});
					}).catch(next);
				});
			});
		}).catch(next);
	};//End getItems()

	/**
	 * This function to get resuarant branch area
	 *
	 * @param req	As 	Request Data
	 * @param res	As	Response Data
	 * @param next	As 	Callback argument to the middleware function
	 * @param client As	SOAP module instance
	 *
	 * @return json
	**/
	async getAreas (req,res,next,client){
		return new Promise(resolve=>{
            let aghzeyaRestaurantId	= req.params.restaurant_id;

			/** Call service */
			let apiResuest = {passcode: this.SOAP_PASSCODE, resturant_id: aghzeyaRestaurantId};
			client["of_get_areas"](apiResuest,(err, response)=>{
				if (err) return next(err);

				let areaList = (response && response.of_get_areasResult && response.of_get_areasResult.lstr_areas && response.of_get_areasResult.lstr_areas.str_areas) ? response.of_get_areasResult.lstr_areas.str_areas :"";

				/** Save api request response */
				this.saveApiRequestResponse(req,res,next,{
					method_name :	"of_get_areas",
					response	: 	response,
					request		:	apiResuest,
				}).then(()=>{});

				/** Send success response */
				if(!areaList || areaList.length == 0){
					return resolve({status: Constants.STATUS_SUCCESS, message: "No area found"});
				}

				asyncParallel({
					rest_details : (callback)=>{
						/** Get restaurant details */
						this.getRestaurantList(req,res,next,{restaurant_id:aghzeyaRestaurantId}).then(response=>{
							callback(null, response);
						}).catch(next);
					},
					admin_id : (callback)=>{
						/** Get admin details */
						this.userDB.findOne({user_role_id: Constants.SYSTEM_ADMIN_ROLE_ID},{projection:{_id:1}}).then(result=>{
							let adminId = (result) ? result._id	:"";
							callback(null, adminId);
						}).catch(next);
					},
					branch_list :(callback)=>{
						/** Get branch list */
						this.restaurantBranchDB.find({aghzeya_restaurant_id: aghzeyaRestaurantId }).toArray().then(result=>{
							if(result.length ==0) return callback(null, null);

							let recordList = {};
							result.map(record=>{
								recordList[record.aghzeya_branch_id] = record;
							});
							callback(null,recordList);
						}).catch(next);
					},
					aghzeya_area_list :(callback)=>{
						/** Get aghzeya area list */
						this.aghzeyaAreaDB.find({
							aghzeya_restaurant_id: {$in: [String(aghzeyaRestaurantId), parseInt(aghzeyaRestaurantId)]}
						},{projection:{}}).toArray().then(result=>{
							if(result.length ==0) return callback(null, null);

							let recordList = {};
							result.map(record=>{
								recordList[record.aghzeya_area_id] = record;
							});
							callback(null,recordList);
						}).catch(next);
					},
					attribute_list : (parentCallback)=>{
						/** Get attribute list */
						this.attributesDB.find({type: "branch_area" },{projection: {attribute_id: 1,default_value: 1}}).toArray().then(result=>{
							parentCallback(null, result);
						}).catch(next);
					},
				},(asyncErr, asyncResponse)=> {
					if(asyncErr) return next(asyncErr);

					let adminId 		= 	(asyncResponse.admin_id) 	   		?	asyncResponse.admin_id 			:"";
					let restDetails 	= 	(asyncResponse.rest_details) 		? 	asyncResponse.rest_details 		:{};
					let branchList 		= 	(asyncResponse.branch_list)			? 	asyncResponse.branch_list		:{};
					let attributeList 	= 	(asyncResponse.attribute_list)		? 	asyncResponse.attribute_list	:[];
					let aghzeyaAreaList	=	(asyncResponse.aghzeya_area_list)	? 	asyncResponse.aghzeya_area_list :{};
					let restaurantId	= 	(restDetails.restaurant_id)  		? 	restDetails.restaurant_id 		:"";
					let restaurantSlug 	= 	(restDetails.restaurant_slug)		? 	restDetails.restaurant_slug		:"";

					/** Send error response */
					if(!restaurantId || !restaurantSlug || Object.keys(aghzeyaAreaList).length == 0  || Object.keys(branchList).length == 0 ||  attributeList.length ==0){
						return resolve({status: Constants.STATUS_ERROR,message : "Something went wrong, Please try again.", asyncResponse: asyncResponse });
					}

					let deleteAbleId = new ObjectId();

					/** Update branch areas */
					this.restaurantBranchAreaDB.updateMany({
						restaurant_id 	: restaurantId,
					},
					{$set : {
						to_be_deleted	: deleteAbleId
					}}).then(()=>{

						eachOfSeries(areaList, (records, index, seriesCallback) =>{
							let aghzeyaAreaId 	= 	records.id;
							let aghzeyaBranchId =	records.br;

							if(!aghzeyaAreaId || !aghzeyaAreaList[aghzeyaAreaId] || !aghzeyaAreaList[aghzeyaAreaId].area_id){
								console.log(" Area details missing");
								console.log("aghzeyaAreaId "+aghzeyaAreaId);
								console.log(aghzeyaAreaList[aghzeyaAreaId]);
								console.log("\n");
								return seriesCallback(null);
							}

							if(!aghzeyaBranchId || !branchList[aghzeyaBranchId]){
								console.log("Branch details missing");
								console.log("aghzeyaBranchId "+aghzeyaBranchId);
								console.log(branchList[aghzeyaBranchId]);
								console.log("\n");
								return seriesCallback(null);
							}

							let areaDetails 	=	aghzeyaAreaList[aghzeyaAreaId];
							let branchDetails 	=	branchList[aghzeyaBranchId];
							let branchId		=	branchDetails._id;
							let areaId			=	areaDetails.area_id;
							let preparationTime	=	(branchDetails.aghzeya_avg_prep_mins) ? parseFloat(branchDetails.aghzeya_avg_prep_mins) :0;
							let deliveryFees	=	(records.fees) ? parseFloat(records.fees) :0;
							let deliveryDuration=	(records.avg_deliv_mins) ? parseFloat(records.avg_deliv_mins) :0;
							let minmumCharge	=	(records.minmum_charge)  ? parseFloat(records.minmum_charge) :0;

							/** Update branch covered area details */
							this.restaurantBranchAreaDB.updateOne({
								area_id 		:	areaId,
								branch_id 		: 	branchId,
								restaurant_id	: 	restaurantId,
							},
							{
								$set : {
									modified 		:	getUtcDate(),
									aghzeya_area_id	: 	aghzeyaAreaId,
								},
								$setOnInsert: {
									open		:	Constants.OPEN,
									added_by	: 	adminId,
									channel_id	: 	Constants.CHANNEL_SOAP,
									created		: 	getUtcDate(),
									aghzeya		: 	true,
									restaurant_slug			: 	restaurantSlug,
									aghzeya_branch_id		: 	aghzeyaBranchId,
									aghzeya_restaurant_id 	:	aghzeyaRestaurantId,
									delivery_by 			:	Constants.DELIVERY_BY_RESTAURANT,
								},
								$unset : {
									to_be_deleted: 1,
								},
							},{upsert: true}).then(()=>{

								asyncEach(attributeList,(attributeData,attributeCallback)=>{
									let tmpAttrId 		= 	attributeData.attribute_id;
									let tmpAttrValue	=	attributeData.default_value;

									if(tmpAttrId == Constants.ACCEPT_PICKUP_ORDER){
										tmpAttrValue = Constants.ACCEPT;
									}

									if(tmpAttrId == Constants.ACCEPT_SCHEDULING_ATTRIBUTE_ID){
										tmpAttrValue = Constants.ACCEPT;
									}

									if(tmpAttrId == Constants.MINIMUM_ORDER_LIMIT_ATTRIBUTE_ID){
										tmpAttrValue = minmumCharge;
									}

									if(tmpAttrId == Constants.DELIVERY_ATTRIBUTE_ID){
										tmpAttrValue = Constants.DELIVERY_BY_RESTAURANT;
									}

									if(tmpAttrId == Constants.DELIVERY_FEES_ATTRIBUTE_ID){
										tmpAttrValue = deliveryFees;
									}

									if(tmpAttrId == Constants.PREPARATION_TIME_ATTRIBUTE_ID){
										tmpAttrValue = preparationTime;
									}

									if(tmpAttrId == Constants.DELIVERY_DURATION_ATTRIBUTE_ID){
										tmpAttrValue = deliveryDuration;
									}

									asyncParallel({
										update_area : (childCallback)=>{
											let branchAreaFields = setBranchAreaFields(tmpAttrId, tmpAttrValue);
											if(!branchAreaFields) return childCallback(null);

											if(tmpAttrId == Constants.DELIVERY_ATTRIBUTE_ID || tmpAttrId == Constants.DELIVERY_DURATION_ATTRIBUTE_ID || tmpAttrId== Constants.DRIVER_SELECTION_TYPE_ATTRIBUTE_ID){
												return childCallback(null);
											}

											/** Update area details */
											this.restaurantBranchAreaDB.updateOne({
												area_id 		:	areaId,
												branch_id 		: 	branchId,
												restaurant_id	: 	restaurantId,
											},{$set: branchAreaFields }).then(()=>{
												childCallback(null);
											}).catch(next);
										},
										save_area_settings : (childCallback)=>{
											/** Set update data */
											let areaSetUpdateData = {
												$set : {
													modified 		: 	getUtcDate(),
													not_in_sync 	:   true,
													attribute_value : 	tmpAttrValue
												},
												$setOnInsert : {
													aghzeya		: true,
													added_by	: adminId,
													channel_id	: Constants.CHANNEL_SOAP,
													created		: getUtcDate()
												}
											};

											if(tmpAttrId == Constants.DELIVERY_ATTRIBUTE_ID || tmpAttrId == Constants.DELIVERY_DURATION_ATTRIBUTE_ID || tmpAttrId == Constants.DRIVER_SELECTION_TYPE_ATTRIBUTE_ID){
												areaSetUpdateData["$setOnInsert"].attribute_value = tmpAttrValue;
												delete areaSetUpdateData["$set"].attribute_value;
											}

											/** Update area settings details */
											this.restaurantBranchAreaSettingDB.updateOne({
												branch_id 		: 	branchId,
												area_id 		:	areaId,
												attribute_id  	:	tmpAttrId,
												restaurant_id	: 	restaurantId,
											},areaSetUpdateData,{upsert: true}).then(()=>{
												childCallback(null);
											}).catch(next);
										}
									},(asyncChildErr)=>{
										attributeCallback(asyncChildErr);
									});
								},asyncAreaErr=>{
									seriesCallback(asyncAreaErr);
								});
							}).catch(next);
						},(asyncEachErr)=>{
							if(asyncEachErr) return next(asyncEachErr);

							asyncParallel({
								remove_old_area : (childCallback)=>{
									this.restaurantBranchAreaDB.find({
										restaurant_id 	: 	restaurantId,
										to_be_deleted	:	deleteAbleId
									},{projection: {branch_id: 1, area_id: 1}}).toArray().then(result=>{
										if(result.length <=0) return childCallback(null);

										asyncEach(result,(data,childEachcallback)=>{
											asyncParallel({
												remove_area : (subCallback)=>{
													this.restaurantBranchAreaDB.deleteMany({
														branch_id 	: 	data.branch_id,
														area_id		:	data.area_id,
													}).then(()=>{
														subCallback(null);
													}).catch(next);
												},
												remove_area_settings : (subCallback)=>{
													this.restaurantBranchAreaSettingDB.deleteMany({
														branch_id 	: 	data.branch_id,
														area_id		:	data.area_id,
													}).then(()=>{
														subCallback(null);
													}).catch(next);
												},
											},(subErr)=>{
												childEachcallback(subErr);
											});
										},(asyncChildEachErr)=>{
											childCallback(asyncChildEachErr);
										});
									}).catch(next);
								},
							},(parentErr)=>{
								if(parentErr) return next(parentErr);

								resolve({status: Constants.STATUS_SUCCESS });
							});
						});
					}).catch(next);
				});
			});
		}).catch(next);
	};//End getAreas()

	/**
	 * This function to aghzeya place order
	 *
	 * @param req	As 	Request Data
	 * @param res	As	Response Data
	 * @param next	As 	Callback argument to the middleware function
	 * @param client As	SOAP module instance
	 *
	 * @return json
	**/
	async aghzeyaPlaceOrder (req,res,next,client){
		return new Promise(resolve=>{
			let orderId			= 	(req.params.order_id) 			? 	new ObjectId(req.params.order_id)			:"";
			let isModified		=	(req.params.is_modified)		?	parseInt(req.params.is_modified)		:false;
			let isCron			=	(req.query.is_cron)				?	parseInt(req.query.is_cron)				:false;
			let submittedBy		= 	(req.query.submitted_by) 		? 	new ObjectId(req.query.submitted_by)		:"";
			let statusUpdatedBy	= 	(req.body.status_updated_by) 	? 	new ObjectId(req.body.status_updated_by)	:"";
			let firstTimeCall	=	(req.body.first_time_call)		?	parseInt(req.body.first_time_call)		:false;

			/** Send error response */
			if(!orderId) return resolve({status: Constants.STATUS_ERROR, message:	res.__("system.missing_parameters") });

			let clientTimeOut	=	(firstTimeCall) ? 10000 :30000;
			let logId			=	new ObjectId();
			let apiMethodName 	=	(isModified) ? "of_update_order" :"of_place_new_order";
			let logsExtraPerms 	=	{
				order_id		:	orderId,
				is_cron			:	isCron,
				start_call_time	:	getUtcDate(),
				api_url 		: 	Constants.AGHZEYA_API_URL,
				first_time_call : 	firstTimeCall,
				time_out 		: 	clientTimeOut,
			};

			/** Save aghzeya request response */
			this.saveApiRequestResponse(req,res,next,{
				log_id			: 	logId,
				method_name 	: 	apiMethodName,
				response		: 	{},
				request			: 	{},
				request_error	:	null,
				extra_perms 	:	logsExtraPerms
			}).then(()=>{

				asyncParallel({
					order_details : (callback)=>{
						/** Get order details */
						this.orderDB.findOne({_id: orderId}).then(result=>{
							callback(null,result);
						}).catch(next);
					},
					order_sub_details : (callback)=>{
						/** Get order sub details */
						this.orderDetailDB.aggregate([
							{$match : {order_id: orderId}},
						]).toArray().then(result=>{
							let orderDetailResult = (result && result[0]) ? result[0] : null;
							callback(null, orderDetailResult);
						}).catch(next);
					},
					order_item_list : (callback)=>{
						/** Get order item list */
						this.orderItemDB.find({order_id: orderId}).sort({cart_created: Constants.SORT_ASC}).toArray().then(result=>{
							if(result.length <= 0) return callback(null, null);

							let itemIdArray 		= 	[];
							let extraItemIdArray 	=	[];
							result.map(records=>{
								if(records.item_id) itemIdArray.push(records.item_id);

								if(records.extra_items && records.extra_items.length >0){
									records.extra_items.map(exDat=>{
										extraItemIdArray.push(exDat.extra_item_id);
									});
								}
							});

							asyncParallel({
								item_list : (subCallback)=>{
									/** Get item details */
									this.itemsDB.find({_id: {$in : itemIdArray}}).toArray().then(itemResult=>{

										let itemObj = {};
										itemResult.map(data=>{
											itemObj[data._id] = data;
										});
										subCallback(itemErr,itemObj);
									}).catch(next);
								},
								extra_item_list : (subCallback)=>{
									if(extraItemIdArray.length <=0) return subCallback(null,{});

									this.itemExtraMaterDB.find({_id: {$in: extraItemIdArray}}).sort({order: Constants.SORT_ASC}).toArray().then(exItemResult=>{
										let exItemObj = {};
										if(exItemResult){
											exItemResult.map(data=>{
												exItemObj[data._id] = data;
											});
										}
										subCallback(null,exItemObj);
									}).catch(next);
								},
							},(parallelErr, parallelResponse)=>{
								if(parallelErr) return callback(parallelErr);

								let itemList 		=	parallelResponse.item_list;
								let extraItemList 	= 	parallelResponse.extra_item_list;
								result.map(records=>{
									if(records.item_id){
										records.item_details = (itemList[records.item_id]) ? itemList[records.item_id] :{};
									}

									if(records.extra_items && records.extra_items.length >0 && Object.keys(extraItemList).length >0){
										let sortedExItems = [];
										Object.keys(extraItemList).map(tmpId=>{
											records.extra_items.map(exDat=>{
												let tmpExItemId 	= 	exDat.extra_item_id;
												if(String(tmpExItemId) == String(tmpId)){
													exDat.item_details	=	(extraItemList[tmpExItemId])	?	extraItemList[tmpExItemId] 	:{};

													sortedExItems.push(exDat);
												}
											});
										});
										records.extra_items = sortedExItems;
									}
								});

								callback(null,result);
							});
						}).catch(next);
					}
				},(parallelErr,asyncReponse)=>{
					if(parallelErr) return next(parallelErr);

					let orderDetails		= 	asyncReponse.order_details;
					let orderSubDetails	 	=	asyncReponse.order_sub_details;
					let orderItemList	 	=	asyncReponse.order_item_list;

					/** Save aghzeya request response */
					logsExtraPerms.found_od_details 	= (orderDetails) 	? 	true	:false;
					logsExtraPerms.found_odSub_details	= (orderSubDetails) ? 	true 	:false;
					logsExtraPerms.found_odItem_details = (orderItemList) 	?	true 	:false;
					this.saveApiRequestResponse(req,res,next,{
						log_id			: 	logId,
						method_name 	: 	apiMethodName,
						response		: 	{},
						request			: 	{},
						request_error	:	null,
						extra_perms 	:	logsExtraPerms
					}).then(()=>{ });

					/** Send error response */
					if(!orderDetails || !orderSubDetails || !orderItemList){
						return resolve({
							status 		: 	Constants.STATUS_ERROR,
							message		: 	res.__("system.something_going_wrong_please_try_again"),
							asyncReponse:	asyncReponse
						});
					}

					let areaId 				=	orderDetails.area_id;
					let branchId 			= 	orderDetails.branch_id;
					let customerId 			= 	orderDetails.customer_id;
					let restaurantId 		= 	orderDetails.restaurant_id;
					let upsAgentId		 	= 	orderDetails.modified_by ? orderDetails.modified_by : orderDetails.placed_by;
					let orderAgentId		= 	orderDetails.modified_by ? orderDetails.modified_by : orderDetails.placed_by;
					let customerAddressId 	=	orderSubDetails.customer_address_id;
					let orderAreaId 		=	orderSubDetails.address_area_id;
					let deliveredAreaId 	=	orderSubDetails.delivery_area_id;
					let netAmount 			= 	orderDetails.net_amount;
					let offerDiscount 		=	orderSubDetails.discount_price;
					let addDetails 			= 	(orderSubDetails.customer_address_detail) ? orderSubDetails.customer_address_detail :{};
					let addBlockId 			= 	(addDetails.block_id) ? addDetails.block_id :"";
					if(!orderAreaId) orderAreaId = deliveredAreaId;
					if(!orderAreaId && !deliveredAreaId) orderAreaId = areaId;

					/** Manage discount percentage  */
					let discountPercentage = 0;
					if(offerDiscount && netAmount){
						discountPercentage = round(((offerDiscount/netAmount)*100),CURRENCY_ROUND_PRECISION);
					}

					asyncParallel({
						block_details : (childCallback)=>{
							if(!addBlockId) return childCallback(null, {});

							/** Get block details */
							this.areaBlockDB.findOne({_id: addBlockId },{projection : {cravez_block_id:1,block_id:1,name:1}}).then(blockResult=>{
								if(blockResult){
									addDetails.block_id 		=	blockResult.block_id;
									addDetails.block_name 		= 	blockResult.name;
									addDetails.cravez_block_id 	= 	blockResult.cravez_block_id;
								}
								childCallback(null, blockResult);
							}).catch(next);
						},
						user_details : (childCallback)=>{
							if(!customerId) return childCallback(null, {});

							/** Get user details **/
							this.userDB.findOne({_id: customerId}).then(userResult=>{
								childCallback(null, userResult);
							}).catch(next);
						},
						agent_details : (childCallback)=>{
							if(!upsAgentId) return childCallback(null, {});

							/** Get user details **/
							this.userDB.findOne({_id: new ObjectId(upsAgentId)},{projection : {_id:1,agent_id:1,full_name:1,user_role_id:1,user_type:1}}).then(userResult=>{
								childCallback(null, userResult);
							}).catch(next);
						},
						restaurant_details : (childCallback)=>{
							/** Get restaurants details **/
							this.restaurantDB.findOne({_id: restaurantId}).then(restaurantResult=>{
								childCallback(null, restaurantResult);
							}).catch(next);
						},
						branch_details : (childCallback)=>{
							/** Get restaurants branch details **/
							this.restaurantBranchDB.findOne({_id: branchId}).then(branchResult=>{
								childCallback(null, branchResult);
							}).catch(next);
						},
						order_area_details : (childCallback)=>{
							if(!orderAreaId) return childCallback(null, {});

							/** Get restaurant branch area details **/
							this.aghzeyaAreaDB.aggregate([
								{$match : {
									area_id 		: 	orderAreaId,
									restaurant_id 	:	restaurantId
								}},
								{$addFields: {
									area_name	:	"$name.en",
								}},
							]).toArray().then(addResult=>{
								addResult = (addResult && addResult[0]) ? addResult[0] :{};
								childCallback(null, addResult);
							}).catch(next);
						},
						admin_details : (callback)=>{
							/** Get admin details */
							this.userDB.findOne({user_role_id: Constants.SYSTEM_ADMIN_ROLE_ID}).then(result=>{
								callback(null, result);
							}).catch(next);
						}
					},(childErr, childReponse)=>{
						if(childErr) return next(childErr);

						let agentDetails	=	(childReponse.agent_details)	? 	childReponse.agent_details	:{};
						let adminDetails	=	(childReponse.admin_details) 	? 	childReponse.admin_details	:{};
						let adminId 		=	(agentDetails._id)				?	agentDetails._id			:adminDetails._id;
						let adminName		=	(agentDetails.full_name)	 	?	agentDetails.full_name		:adminDetails.full_name;
						let adminUserRoleId	=	(agentDetails.user_role_id)	 	?	agentDetails.user_role_id	:adminDetails.user_role_id;
						let adminUserType 	=	(agentDetails.user_type)	 	?	agentDetails.user_type		:adminDetails.user_type;
						let userDetails 	= 	childReponse.user_details;
						let orderAreaDetails= 	childReponse.order_area_details;
						let restDetails		= 	childReponse.restaurant_details;
						let branchDetails	= 	childReponse.branch_details;
						let aghzeyaBranchId	= 	branchDetails.aghzeya_branch_id;
						let aghzeyaRestId 	=	String(restDetails.aghzeya_restaurant_id);
						let aghzeyaAreaId 	=	(orderAreaDetails.aghzeya_area_id) ? orderAreaDetails.aghzeya_area_id :0;
						let isBlackListUser	= 	userDetails.is_black_list;
						let orderDate		=	newDate(orderDetails.order_date,this.ORDER_API_DATE_FORMAT);
						let currentStatus	= 	orderDetails.order_status;
						let deliveryType	= 	orderDetails.delivery_type;
						let sheelCard		= 	orderDetails.sheel_card;
						let aghzeyaSource	= 	orderDetails.source;
						let sourcePayment	= 	orderDetails.source_payment;
						let paymentGatewayType= orderDetails.payment_gateway_type;
						let paymentMethod 	= 	orderSubDetails.payment_method;
						let uniqueOrderId	=	orderDetails.unique_order_id;
						let deliveryFee 	= 	(orderSubDetails.delivery_fee)?orderSubDetails.delivery_fee :0;
						let isSchedule		=	(orderDetails.is_schedule)	?	orderDetails.is_schedule:false;
						let orderMode  		=	(deliveryType == Constants.DELIVERY_BY_PICK_UP) ? 1 :0;
						let paymentType 	=	(this.AGHZEYA_PAYMENT_TYPE[paymentMethod])  ? this.AGHZEYA_PAYMENT_TYPE[paymentMethod] :this.AGHZEYA_PAYMENT_TYPE[Constants.CREDIT_PAYMENT];
						let tmpBlockName	=	(addDetails.block_name)		?	addDetails.block_name 		:{};
						let street			=	(addDetails.street)			?	addDetails.street 			:0;
						let buildingNumber	=	(addDetails.building_number)?	addDetails.building_number 	:0;
						let flatNumber		=	(addDetails.flat_number)	?	addDetails.flat_number 		:0;
						let floorNumber		=	(addDetails.floor_number)	?	addDetails.floor_number 	:0;
						let sector			=	(addDetails.cravez_block_id)?	addDetails.cravez_block_id 	:(tmpBlockName.en ? tmpBlockName.en :"");
						let aghzeyaAddRestId=	(addDetails.restaurants_details) ? addDetails.restaurants_details :{};
						let aghzeyaUserRestId=	(userDetails.restaurants_details) ? userDetails.restaurants_details :{};
						let aghzeyaUserId	=	(aghzeyaUserRestId[aghzeyaRestId]) ? aghzeyaUserRestId[aghzeyaRestId] :0;
						let aghzeyaAddId	=	(aghzeyaAddRestId[aghzeyaRestId]) ? aghzeyaAddRestId[aghzeyaRestId] :0;
						let additionalDir	=	(addDetails.additional_directions) ? addDetails.additional_directions :"";
						let arabicBlockName =	(!sector && addDetails.block_name && addDetails.block_name.ar) ? addDetails.block_name.ar:"";
						let beside			=	(additionalDir) ? additionalDir : "";
						let tmpOrderNotes	=	orderDetails.request_note ? orderDetails.request_note:"";
						let orderNotes		=	(sheelCard) ? "Sheel Card Number:"+sheelCard+"-"+tmpOrderNotes : tmpOrderNotes;
						if(arabicBlockName) orderNotes += (orderNotes) ? "-"+arabicBlockName : arabicBlockName;
						let jadda			=	(addDetails.jadda) ? addDetails.jadda :0;
						let gfcPushRetry	= 	(orderDetails.gfc_push_retry)	?	orderDetails.gfc_push_retry :0;
						let gfcModifiedPushRetry= 	(orderDetails.gfc_modified_push_retry)	?	orderDetails.gfc_modified_push_retry :0;
						orderDate			=	(isSchedule) ? newDate(orderDetails.scheduled_date,this.ORDER_API_DATE_FORMAT) :orderDate;
						let referenceNumber = 	(orderSubDetails.reference_number)	?	orderSubDetails.reference_number :"";

						if(orderDetails.order_source == Constants.CALL_CENTER && (paymentMethod == Constants.KNET || paymentMethod == Constants.CREDIT_PAYMENT)){
							paymentType = this.AGHZEYA_UPAYMENT_TYPE;
						}

						if(paymentGatewayType == Constants.UINTERFACE_PAYMENT_GATEWAY && (paymentMethod == Constants.KNET || paymentMethod == Constants.CREDIT_PAYMENT)){
							paymentType = this.AGHZEYA_UPAYMENT_TYPE;
						}

						let orderItems = [];
						orderItemList.map(records=>{
							let itemName 	=	(records.item_name) 		? records.item_name[Constants.DEFAULT_LANGUAGE_CODE] :"";
							let itemDetails =	(records.item_details) 		? records.item_details 		:"";
							let aghzeyaNotes=	(itemDetails.aghzeya_notes) ? itemDetails.aghzeya_notes :"";
							let itemNotes 	=	(records.note)				? records.note : "";
							itemNotes		=	(itemNotes.length > 100)	? itemNotes.substr(0,100) 	: itemNotes;

							orderItems.push({
								"tem:str_order_items" :[
									{name:'tem:item_id', 	text: itemDetails.aghzeya_item_id},
									// {name:'tem:item_name', 	text: jsonxml.cdata(itemName)},
									//{name:'tem:item_name', 	text: itemName},
									{name:'tem:qty', 		text: records.qty},
									{name:'tem:unit_price', text: records.item_main_price},
									{name:'tem:item_notes', text: jsonxml.cdata(itemNotes)},
								]
							});

							/** Push extra items */
							if(records.extra_items && records.extra_items.length >0){
								records.extra_items.map(exDat=>{
									let exItemDetails	= 	exDat.item_details;
									let exItemPrice		=	(exDat.price) ? exDat.price :0;

									orderItems.push({
										"tem:str_order_items" :[
											{name:'tem:item_id', 	text: exItemDetails.aghzeya_extra_item_id },
											{name:'tem:qty', 		text: records.qty},
											{name:'tem:unit_price', text: exItemPrice},
											{name:'tem:item_notes', text: ""},
										]
									});
								});
							}
						});

						/** Set order details for api request */
						let apiOrderDetails = jsonxml([
							{name:'tem:order_general_id', text: uniqueOrderId },
							{name:'tem:order_date', text: orderDate},
							{name:'tem:discount', text: discountPercentage},
							{name:'tem:customer_id', text: aghzeyaUserId},
							{name:'tem:cust_name', 	text: userDetails.full_name },
							{name:'tem:cust_tele1', text: userDetails.mobile_number },
							{name:'tem:cust_tele2', text: (userDetails.cust_tele2)? userDetails.cust_tele2 :0},
							{name:'tem:cust_tele3', text: (userDetails.cust_tele3)? userDetails.cust_tele3 :0},
							{name:'tem:address_id', text: aghzeyaAddId },
							{name:'tem:area_code', 	text: aghzeyaAreaId },
							{name:'tem:gada', 		text: jadda },
							{name:'tem:street', 	text: street },
							{name:'tem:sector', 	text: (sector) ? sector : 0},
							{name:'tem:home_no', 	text: buildingNumber},
							{name:'tem:flat', 		text: flatNumber},
							{name:'tem:floor', 		text: floorNumber },
							{name:'tem:beside', 	text: jsonxml.cdata(beside)},
							{name:'tem:order_notes',text: jsonxml.cdata(orderNotes)},
							{name:'tem:cust_notes', text: ""},
							{name:'tem:order_tot_amount', text: netAmount},
							{name:'tem:lstr_order_items', children: orderItems },
							{name:'tem:order_type', text: orderMode},
							{name:'tem:payment_method', text: (sourcePayment) ? sourcePayment : paymentType},
							{name:'tem:branch', text: aghzeyaBranchId},
							{name:'tem:address_notes', text: jsonxml.cdata(additionalDir) },
							{name:'tem:reserved', text: 0},
							{name:'tem:reserv_hours', text: 0},
							{name:'tem:hd_fees', text: deliveryFee},
							{name:'tem:cust_black_list', text: (isBlackListUser) ? 1 :0 },
							{name:'tem:adress_black_list', text: 0 },
							{name:'tem:source', text: aghzeyaSource},
							{name:'tem:source_ref_no', text: referenceNumber},
							{name:'tem:add_user', text: adminName},
						]);

						let apiResuest=	'<tem:'+apiMethodName+'><tem:passcode>'+this.SOAP_PASSCODE+'</tem:passcode><tem:resturant_id>'+aghzeyaRestId+'</tem:resturant_id><tem:l_str_order>'+apiOrderDetails+'</tem:l_str_order></tem:'+apiMethodName+'>';

						/** Save aghzeya request response */
						logsExtraPerms.before_call_time 		=	getUtcDate();
						logsExtraPerms.unique_order_id			=	uniqueOrderId;
						logsExtraPerms.gfc_push_retry			=	gfcPushRetry;
						logsExtraPerms.gfc_modified_push_retry	= 	gfcModifiedPushRetry;
						logsExtraPerms.order_details			= 	orderDetails;
						logsExtraPerms.order_sub_details		= 	orderSubDetails;
						this.saveApiRequestResponse(req,res,next,{
							log_id			: 	logId,
							method_name 	: 	apiMethodName,
							response		: 	{},
							request			: 	apiResuest,
							request_error	:	null,
							extra_perms 	:	logsExtraPerms
						}).then(()=>{

							let resMsg = "Time Out";
							try{
								/** Request api for order place */
								client[apiMethodName]({_xml: apiResuest},(apiErr, apiResponse)=>{
									let responseKey= (isModified)? "of_update_orderResult" :"of_place_new_orderResult";
									let apiRequestRes = (apiResponse && apiResponse[responseKey]) ? apiResponse[responseKey] :{};
										resMsg		=	(apiRequestRes.error_text) ? apiRequestRes.error_text :resMsg;
									let resCode		=	(apiRequestRes.error_code) ? apiRequestRes.error_code :"";
									let resAddId	=	(apiRequestRes.address_id) ? parseInt(apiRequestRes.address_id) :"";
									let resCusId	=	(apiRequestRes.customer_id)? parseInt(apiRequestRes.customer_id) :"";
									let billNo		=	(apiRequestRes.bilno)? apiRequestRes.bilno :"";
									let transactionNo=(apiRequestRes.transaction_no)? apiRequestRes.transaction_no :"";
									let isPlaced	=	(!apiErr && (resCode == this.AGHZEYA_SUCCESS_CODE || resCode == this.ORDER_ALREADY_EXISTS_CODE)) ? true :false;

									if(isPlaced && !isModified && parseInt(billNo) <= 0){
										isPlaced = 	false;
										resMsg	 =	res.__("order.get_bill_no_zero");
									}

									/** Save aghzeya request response */
									logsExtraPerms.after_call_time = getUtcDate();
									this.saveApiRequestResponse(req,res,next,{
										log_id			: 	logId,
										method_name 	: 	apiMethodName,
										response		: 	client.lastResponse,
										request			: 	client.lastRequest,
										request_error	:	apiErr,
										extra_perms 	:	logsExtraPerms
									}).then(()=>{});

									asyncParallel({
										save_customer_id : (callback)=>{
											if(!isPlaced || !resCusId) return callback(null);

											let updateData = {modified:	getUtcDate()};
											updateData["restaurants_details."+aghzeyaRestId] = String(resCusId);

											/** Update user details */
											this.userDB.updateOne({_id: customerId},{$set: updateData}).then(()=>{
												callback(null);
											}).catch(next);
										},
										save_bill_number : (callback)=>{
											let orderUpdateData = {$set: { modified: getUtcDate(), aghzeya_branch_id: aghzeyaBranchId}};

											if(isPlaced){
												if(billNo && parseFloat(billNo) > 0 ) orderUpdateData["$set"].aghzeya_bill_no = billNo;

												if(resCusId) 	  	orderUpdateData["$set"].aghzeya_customer_id		= 	String(resCusId);
												if(transactionNo) 	orderUpdateData["$set"].aghzeya_transaction_no	=	transactionNo;

												orderUpdateData["$unset"]= {is_completed: 1};
											}

											/** Update order details */
											this.orderDB.updateOne({_id: new ObjectId(orderId)}, orderUpdateData).then(()=>{
												callback(null);
											}).catch(next);
										},
										save_address_id : (callback)=>{
											if(!isPlaced || !resAddId || !customerAddressId) return callback(null);

											let updateData = {modified:	getUtcDate()};
											updateData["restaurants_details."+aghzeyaRestId] = String(resAddId);

											/** Update customer addresses details */
											this.customerAddressesDB.updateOne({_id: customerAddressId},{$set: updateData}).then(()=>{
												callback(null);
											}).catch(next);
										},
										reject_order : (callback)=>{
											if(isPlaced) return callback(null);

											/** Reject order when api return error in response */
											this.rejectOrder(req,res,next,{
												order_id 			: 	orderId,
												branch_id 			: 	branchId,
												user_type 			: 	adminUserType,
												updated_by 			: 	adminId,
												customer_id 		: 	customerId,
												user_role_id 		: 	adminUserRoleId,
												restaurant_id 		: 	restaurantId,
												current_status 		: 	currentStatus,
												rejection_reason 	: 	resMsg,
												updated_user_name	: 	adminName,
												unique_order_id		:	uniqueOrderId,
												is_modified 		: 	isModified,
												gfc_push_retry 		: 	gfcPushRetry,
												gfc_modified_push_retry: gfcModifiedPushRetry,
												submitted_user_id	:	orderAgentId,
											}).then(()=>{
												callback(null);
											}).catch(next);
										},
									},()=>{
										/** Send response */
										resolve({
											status 		:	(isPlaced) 	? Constants.STATUS_SUCCESS :Constants.STATUS_ERROR,
											message 	:	(!isPlaced) ? res.__("order.order_not_place_msg",resMsg) :"",
											apiResponse :	apiResponse,
											apiResuest 	:	client.lastRequest,
										});
									});
								},{
									timeout		: 	clientTimeOut,
									postProcess	:	function(_xml) {
									let xmlres = _xml.replace('<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"  xmlns:tm="http://microsoft.com/wsdl/mime/textMatching/" xmlns:tns="http://tempurl.org"><soapenv:Body>', '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tem="http://tempurl.org"><soapenv:Header/><soapenv:Body>');

									xmlres = xmlres.replace('<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"  xmlns:tm="http://microsoft.com/wsdl/mime/textMatching/" xmlns:tns="http://tempurl.org"><soap:Body>', '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tem="http://tempurl.org"><soapenv:Header/><soapenv:Body>');

									xmlres = xmlres.replace('</soap:Body></soap:Envelope>', '</soapenv:Body></soapenv:Envelope>');

									return xmlres;
								}});
							}catch(e){

								/** Send response */
								resolve({
									status 		:	Constants.STATUS_ERROR,
									message 	:	res.__("order.order_not_place_msg",resMsg),
									apiResuest 	:	apiResuest,
									apiResponse :	{},
								});

								/** Save aghzeya request response */
								logsExtraPerms.in_catch	 	= 	true;
								logsExtraPerms.catch_time 	=	getUtcDate();
								this.saveApiRequestResponse(req,res,next,{
									log_id			: 	logId,
									method_name 	: 	apiMethodName,
									response		: 	{},
									request			: 	apiResuest,
									request_error	:	e,
									extra_perms 	:	logsExtraPerms,
								}).then(()=>{ }).catch(next);

								this.rejectOrder(req,res,next,{
									order_id 			: 	orderId,
									branch_id 			: 	branchId,
									user_type 			: 	adminUserType,
									updated_by 			: 	adminId,
									customer_id 		: 	customerId,
									user_role_id 		: 	adminUserRoleId,
									restaurant_id 		: 	restaurantId,
									current_status 		: 	currentStatus,
									rejection_reason 	: 	resMsg,
									updated_user_name	: 	adminName,
									unique_order_id		:	uniqueOrderId,
									is_modified 		: 	isModified,
									gfc_push_retry 		: 	gfcPushRetry,
									gfc_modified_push_retry: gfcModifiedPushRetry,
									submitted_user_id	:	orderAgentId,
								}).then(()=>{ }).catch(next);
							}
						});
					});
				});
			});
		}).catch(next);
	};//End aghzeyaPlaceOrder()

	/**
	 * Function to  place order
	 *
	 * @param params As Parameters
	 * @param options	As	object of passed data
	 *
	 * @return json
	 */
	async rejectOrder (req, res, next,options){
		return new Promise(resolve=>{
            let orderId             =   options.order_id;
            let branchId            =   options.branch_id;
            let userType            =   options.user_type;
            let updatedBy           =   options.updated_by;
            let customerId          =   options.customer_id;
            let userRoleId          =   options.user_role_id;
            let restaurantId        =   options.restaurant_id;
            let currentStatus       =   options.current_status;
            let rejectionReason     =   options.rejection_reason;
            let uniqueOrderId     	=   options.unique_order_id;
			let gfcPushRetry     	=   options.gfc_push_retry;
			let gfcModifiedPushRetry=   options.gfc_modified_push_retry;
			let isModified			=   options.is_modified;
			let submittedUserId		=   (options.submitted_user_id) ? options.submitted_user_id :"";

			if(String(submittedUserId) == String(updatedBy)) submittedUserId = "";

			/** Set update data */
			let orderUpdateData = {
				$set : {
					order_status	: 	Constants.ORDER_REJECTED_BY_ADMIN,
					modified 		: 	getUtcDate(),
					rejection_reason: 	rejectionReason
				}
			};

			if(isModified){
				orderUpdateData["$inc"] = {gfc_modified_push_retry: 1 };
			}else{
				orderUpdateData["$inc"] = {gfc_push_retry: 1 };
			}

            /** Update order details */
			this.orderDB.updateOne({_id: new ObjectId(orderId) }, orderUpdateData).then(()=>{

				resolve({status : Constants.STATUS_SUCCESS});

				/** Save order status logs */
				saveOrderStatusLogs(req,res,next,{
					updated_by 		: 	updatedBy,
					submitted_by 	: 	submittedUserId,
					user_role_id 	: 	userRoleId,
					status 			:	Constants.ORDER_REJECTED_BY_ADMIN,
					order_status	:	currentStatus,
					restaurant_id	:	restaurantId,
					order_id 		:	orderId,
					branch_id		:	branchId,
					user_id			:	customerId,
					user_type		:	userType,
					is_admin        :   true,
					not_refund      :   true,
					extra_perms     :   (isModified) ? {is_modified: isModified} :false,
				}).then(()=>{ }).catch(next);

				if((gfcPushRetry == (Constants.MAX_GFC_PUSH_LIMIT-1)) || (gfcModifiedPushRetry == (Constants.MAX_GFC_PUSH_LIMIT-1))){
					let tmpType = (isModified) ? Constants.AUTOMATED_TICKET_AGHZEYA_ORDER_FOR_NOT_UPDATED :Constants.AUTOMATED_TICKET_FOR_NOT_PLACE_AGHZEYA_ORDER

					/** Generate ticket when order not place */
					generateTicket(req,res,next,{
						order_id 		: 	orderId,
						type 			:	tmpType,
						message_params 	:	[uniqueOrderId, rejectionReason],
					}).then(()=>{}).catch(next);
				}
			}).catch(next);
		}).catch(next);
	};//End rejectOrder()

	/**
	 * This read data from file
	 *
	 * @param req	As 	Request Data
	 * @param res	As	Response Data
	 * @param next	As 	Callback argument to the middleware function
	 * @param options	As	object of passed data
	 *
	 * @return json
	**/
	async getDataFromExcel (req,res,next,options){
		return new Promise(resolve=>{
			let fileName 	= 	options.file_name;
			let fileCoulmn	=	(options.column) ? options.column : 10;

			try{
				/** Read excel file */
				let finalArray  	= [];
				var workbook 		= XLSX.readFile(fileName);
				var firstSheetName	= workbook.SheetNames[0];

				/* Get worksheet */
				var worksheet 		= workbook.Sheets[firstSheetName];
				let totalRowsData 	= worksheet['!ref'].split(":");
				let totalRows 		= totalRowsData[1].replace(/[^0-9]+/g, "");
				if(totalRows == ""){
					totalRows = 0;
				}else{
					totalRows=parseInt(totalRows);
				}

				if(worksheet && worksheet instanceof Object && Object.keys(worksheet).length>0){
					let totalColumns 	= parseInt(fileCoulmn);
					let totalRows 		= 0;
					/* Remove Extra columns from object */
					if(worksheet['!margins']){
						delete worksheet['!margins'];
					}
					if(worksheet['!ref']){
						/* Calculate total rows */
						let totalRowsData 	= worksheet['!ref'].split(":");
						totalRows			= (totalRowsData[1]) ? totalRowsData[1] : 0;
						totalRows			= totalRows.replace(/[^0-9]+/g, "");
						if(totalRows == ""){
							totalRows = 0;
						}else{
							totalRows=parseInt(totalRows);
						}
						delete worksheet['!ref'];
					}

					/* Column Names */
					/* This array is valid for less then 156 columns */
					let columnSeries= [
						"A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P","Q","R","S","T","U","V","W","X","Y","Z",
						"AA","AB","AC","AD","AE","AF","AG","AH","AI","AJ","AK","AL","AM","AN","AO","AP","AQ","AR","AS","AT","AU","AV","AW","AX","AY","AZ",
						"BA","BB","BC","BD","BE","BF","BG","BH","BI","BJ","BK","BL","BM","BN","BO","BP","BQ","BR","BS","BT","BU","BV","BW","BX","BY","BZ",
						"CA","CB","CC","CD","CE","CF","CG","CH","CI","CJ","CK","CL","CM","CN","CO","CP","CQ","CR","CS","CT","CU","CV","CW","CX","CY","CZ",
						"DA","DB","CD","DD","DE","DF","DG","DH","DI","DJ","DK","DL","DM","DN","DO","DP","DQ","DR","DS","DT","DU","DV","DW","DX","DY","DZ",
						"EA","EB","CE","DE","EE","EF","EG","EH","EI","EJ","EK","EL","EM","EN","EO","EP","EQ","ER","ES","ET","EU","EV","EW","EX","EY","EZ"
					];

					/* Arrange array according to requirement */
					for(let i=1;i<=totalRows;i++){
						if(!finalArray[i-1]){
							finalArray[i-1] = [];
						}
						for(let j=0;j<totalColumns;j++){
							let cellValue = (columnSeries[j] && worksheet[columnSeries[j]+i] && typeof worksheet[columnSeries[j]+i].v !== typeof undefined) ? worksheet[columnSeries[j]+i]["v"] :"";

							if(cellValue && cellValue.constructor == String){
								cellValue = cellValue.replace(/[`]/g,"");
								cellValue = cellValue.replace(/[']/g,"");
							}
							finalArray[i-1][j] = cellValue;
						}
					}
				}
				/* Delete first element (heading)*/
				finalArray.shift();
				resolve({status : Constants.STATUS_SUCCESS,result : finalArray});
			}catch(e){
				console.error(e);
				resolve({
					status: Constants.STATUS_ERROR,
					message: res.__("system.something_going_wrong_please_try_again")
				});
			}
		}).catch(next);
	};//End getDataFromExcel();

	/**
	 * This import area
	 *
	 * @param req	As 	Request Data
	 * @param res	As	Response Data
	 * @param next	As 	Callback argument to the middleware function
	 *
	 * @return json
	**/
	async importAreas (req, res, next){
		return new Promise(resolve=>{
			// let newFile	= "1_DIKSON.xlsx";
			// let newFile	= "Copy of 2_FATAYER.xlsx";
			// let newFile	= "Copy of 3_MOALEM.xlsx";
			// let newFile	= "Copy of 4_BON.xlsx";
			let newFile	= "Copy of 5_NAZ.xlsx";

			// Format of 1_DIKSON, Copy of 2_FATAYER, Copy of 4_BON, Copy of 5_NAZ
			// 0 => "id", 1 => "arabic_name", 2 => "english_name", 3 =>	"", 4 => "id", 5 =>	"name"

			// Format of Copy of 3_MOALEM
			// 0 => "id", 1 => "arabic_name", 2 => "", 3 =>	"id", 4 => "name", 5 =>	"name"

			// const this.DIKSON_RESTAURANT  	= 	1;
			// const this.FATAYER_RESTAURANT 	= 	2;
			// const this.MOALEM_RESTAURANT  	= 	3;
			// const this.BON_RESTAURANT 	 	= 	4;
			// const this.NAZ_RESTAURANT 	 	=	5;

			let aghzeyaRestaurantId	= this.NAZ_RESTAURANT;

			/** Get data array from*/
			this.getDataFromExcel(req,res,next,{file_name: Constants.IMPORT_SECTION_FILE_PATH+newFile,column: 6}).then(response=>{
				if(response.status != Constants.STATUS_SUCCESS) return res.send({status: Constants.STATUS_ERROR,essage: response.message});
				let dataArray = response.result;

				/** Send response */
				if(!dataArray || dataArray.length == 0){
					return resolve({status: Constants.STATUS_SUCCESS, area_list: dataArray });
				}

				asyncParallel({
					rest_details : (callback)=>{
						/** Get restaurant details */
						this.getRestaurantList(req,res,next,{restaurant_id: aghzeyaRestaurantId}).then(response=>{
							callback(null, response);
						}).catch(next);
					},
					area_list :(callback)=>{
						/** Get area list */
						this.areaDB.find({},{projection:{_id:1, area_id: 1,production_area_id:1}}).toArray().then(result=>{
							if(result.length ==0) return callback(null, null);

							let recordList = {};
							result.map(record=>{
								recordList[String(record._id)] = record._id;
							});
							callback(null,recordList);
						}).catch(next);
					},
				},(asyncErr, asyncResponse)=> {
					if(asyncErr) return next(asyncErr);

					let restDetails		=	(asyncResponse.rest_details) ? asyncResponse.rest_details:{};
					let arealist		=	(asyncResponse.area_list)	 ? asyncResponse.area_list	 :"";
					let restaurantId  	= 	(restDetails.restaurant_id)  ? restDetails.restaurant_id :"";
					let restaurantSlug	=	(restDetails.restaurant_slug)? restDetails.restaurant_slug:"";

					/** Send error response */
					if(!restaurantId || !restaurantSlug || !arealist){
						return resolve({status: Constants.STATUS_ERROR,message : "Something went wrong, Please try again.", asyncResponse: asyncResponse });
					}

					/** Arrange data in object in save*/
					let dataToBeSaved	= [];
					dataArray.map((rows,index)=>{

						/** push data object in an array to save*/
						dataToBeSaved.push({
							aghzeya_area_id	: String(rows[0]),
							cravez_area_id	: String(rows[3]).trim(),
							system_area_id	: String(rows[2]).trim(),
							update_data 	: {
								name	: 	(rows[4]) ? rows[4] :{},
								// name			: 	{
								// 	en : (rows[2]) ? rows[2] :rows[1],
								// 	// en : rows[1],
								// 	ar : rows[1]
								// },
								modified		: 	getUtcDate(),
								cravez_area_id	:	String(rows[3]).trim(),
							},
							insert_data : {
								aghzeya			: 	true,
								created			:	getUtcDate(),
								restaurant_slug	: 	restaurantSlug,
								aghzeya_restaurant_id:	aghzeyaRestaurantId,
							}
						});
					});

					// return resolve({status: Constants.STATUS_SUCCESS, area_list: dataToBeSaved, dataArray:dataArray });

					/** Send response */
					resolve({status: Constants.STATUS_SUCCESS, dataToBeSaved: dataToBeSaved, dataArray:dataArray });

                    let deleteAbleId = new ObjectId();

					/** Updated area table */
					this.aghzeyaAreaDB.updateMany({restaurant_id: restaurantId, },{$set: { to_be_deleted : deleteAbleId }}).then(()=>{

						eachOfSeries(dataToBeSaved, (tempRecord, index,callback) => {
							let cravezAreaId	=	tempRecord.cravez_area_id;
							let systemAreaId	=	tempRecord.system_area_id;
							let aghzeyaAreaId	=	tempRecord.aghzeya_area_id;
							let areaId			=	(arealist[systemAreaId]) ? arealist[systemAreaId] :"";
							let lineNumber 		=	index+1;

							if(!aghzeyaAreaId || !systemAreaId){
								console.log("Missing details lineNumber "+lineNumber);
								console.log("systemAreaId "+systemAreaId);
								console.log("aghzeyaAreaId "+aghzeyaAreaId);
								return callback(null);
							}

							if(!areaId){
								console.log("Line No."+lineNumber+" is skipped because no area found with given cravez area id."+systemAreaId);
								return callback(null);
							}

							tempRecord.update_data.area_id = areaId;

							/** Insert record in database */
							this.aghzeyaAreaDB.updateOne({
								restaurant_id 	: 	restaurantId,
								aghzeya_area_id : 	tempRecord.aghzeya_area_id,
							},
							{
								$set			: tempRecord.update_data,
								$setOnInsert	: tempRecord.insert_data,
								$unset			: {to_be_deleted : 1},
							},{upsert: true}).then(()=>{
								callback(null);
							}).catch(next);
						},(asyncErr)=>{
							if(asyncErr) console.log(asyncErr);

							/** Delete records */
							this.aghzeyaAreaDB.deleteMany({restaurant_id: restaurantId, to_be_deleted: deleteAbleId }).then(()=>{ }).catch(next);
						});
					}).catch(next);
				});
			});
		}).catch(next);
	};//End importAreas()

	/**
	 * Function to save api request response
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 * @param options	As	object of passed data
	 *
	 * @return json
	**/
	async saveApiRequestResponse (req,res,next,options){
		return new Promise(resolve=>{
			let request			= 	(options.request) 		? 	options.request     	:{};
			let response		= 	(options.response) 		? 	options.response    	:{};
			let methodName		= 	(options.method_name) 	?	options.method_name 	:"";
			let requestError	=	(options.request_error) ? 	options.request_error	:null;
			let logId			=	(options.log_id) 		? 	new ObjectId(options.log_id):new ObjectId();

			/** Send error message */
			if(!methodName || !request || !response) return resolve({status: Constants.STATUS_ERROR, message: res.__("system.missing_parameters")});

			/** Set insertable data */
			let insertAbleData = {
				request			: 	request,
				response		: 	response,
				method_name 	: 	methodName,
				request_error	: 	String(requestError),
				modified		:	getUtcDate(),
			};

			if(options.extra_perms) insertAbleData.extra_perms 	= options.extra_perms;

			/** Save kfg request response details */
			this.kfgRequestResponseDB.updateOne({
				_id : 	logId,
			},
			{
				$set : insertAbleData,
				$setOnInsert: {
					created:	getUtcDate()
				},
			},{upsert: true}).then(() => {
				resolve({status	: Constants.STATUS_SUCCESS});
			}).catch(next);
		}).catch(next);
	};// end saveApiRequestResponse()

	/**
	 * This function to aghzeya cancel order
	 *
	 * @param req	As 	Request Data
	 * @param res	As	Response Data
	 * @param next	As 	Callback argument to the middleware function
	 * @param client As	SOAP module instance
	 *
	 * @return json
	**/
	async aghzeyaCancelOrder (req,res,next,client){
		return new Promise(resolve=>{
			let orderId				=	(req.params.order_id)		?	new ObjectId(req.params.order_id)		:"";
			let cancelledBy			=	(req.body.cancelled_by)		?	req.body.cancelled_by				:"";
			let cancelledReasonId	=	(req.body.cancelled_reason)	?	new ObjectId(req.body.cancelled_reason)	:"";
			let isCron				=	(req.body.is_cron)			?	JSON.parse(req.body.is_cron)		:false;
			let notUpdateRetryCount	=	(req.body.not_update_retry_count)?	JSON.parse(req.body.not_update_retry_count)	:false;

			/** Send error response */
			if(!orderId) return resolve({status: Constants.STATUS_ERROR, message:	res.__("system.missing_parameters") });

			/** Set Perms*/
			let exPerms = {
				is_cron			:	isCron,
				order_id		:	orderId,
				start_call_time	:	getUtcDate(),
			};

			/** Save aghzeya request response */
			let logId 			=	new ObjectId();
			let apiMethodName	=	"of_cancel_order";
			this.saveApiRequestResponse(req,res,next,{
				log_id		:	logId,
				method_name : 	apiMethodName,
				response	: 	{},
				request		: 	{},
				extra_perms	:	exPerms
			}).then(()=>{

				/** Get order details */
				asyncParallel({
					order_details :(callback)=>{
						/** Get order details  */
						this.orderDB.aggregate([
							{$match	: {
								_id: orderId,
								$or: [
									{$and: [
										{is_completed: {$exists: false}},
										{is_completed: {$ne: true}}
									]},
									{admin_status: Constants.ORDER_DELIVERED}
								]
							}},
							{$lookup: {
								"from" 			: 	Tables.RESTAURANTS,
								"localField" 	:	"restaurant_id",
								"foreignField"	: 	"_id",
								"as" 			: 	"rest_details"
							}},
							{$lookup: {
								from     : Tables.AGHZEYA_RESTAURANT_CANCEL_REASONS,
								let      : {cancelReasonId : "$cancel_reason_id", restaurantId : "$restaurant_id",},
								pipeline : [
									{$match : {
										$expr: {
											$and : [
												{$eq: ["$restaurant_id", "$$restaurantId"]},
												{$or: [
													{$eq: ["$cancel_reason_id", "$$cancelReasonId"]},
													{$eq: ["$cancel_reason_id", cancelledReasonId ]},
												]},
											]
										}
									}},
								],
								as	:	"reason_details"
							}},
							{$addFields: {
								rest_details		: {$arrayElemAt : ["$rest_details",0]},
								aghzeya_reason_id	: {$arrayElemAt : ["$reason_details.aghzeya_reason_id",0]},
							}},
						]).toArray().then(result=>{
							result = (result && result[0]) ? result[0] :null;
							callback(null, result);
						}).catch(next);
					},
					user_details :(callback)=>{
						if(cancelledBy) return callback(null,{full_name: cancelledBy});

						/** Get cancelled user details  */
						this.userDB.findOne({user_role_id : Constants.SYSTEM_ADMIN_ROLE_ID },{projection:{full_name:1}}).then(result=>{
							callback(null, result);
						}).catch(next);
					},
				},(asyncErr, asyncRes)=>{
					if(asyncErr) return next(asyncErr);

					/** Send error response */
					if(!asyncRes.order_details || !asyncRes.user_details){
						return resolve({ status: Constants.STATUS_ERROR, message: res.__("system.something_going_wrong_please_try_again") });
					}

					let orderDetails 	=	asyncRes.order_details;
					let userDetails 	=	asyncRes.user_details;
					let restDetails		=	(orderDetails.rest_details) 		? 	orderDetails.rest_details  		:{};
					let aghzeyaReasonId	=	(orderDetails.aghzeya_reason_id)	?	orderDetails.aghzeya_reason_id 	:this.AGHZEYA_CANCEL_REASON_ID;
					let cancelBy		=	userDetails.full_name;
					let cancelDate		=	newDate("",this.ORDER_API_DATE_FORMAT);
					let aghzeyaRestId	=	restDetails.aghzeya_restaurant_id;
					let uniqueOrderId	=	orderDetails.unique_order_id;
					let gfcCancelRetry	=	(orderDetails.gfc_cancel_retry) ? orderDetails.gfc_cancel_retry :0;

					/** Set order details for cancel api request */
					let apiOrderDetails = jsonxml([
						{name:'tem:order_general_id', text: uniqueOrderId},
						{name:'tem:cancel_user', text: cancelBy},
						{name:'tem:cancel_date', text: cancelDate},
						{name:'tem:cancel_reason_code', text: aghzeyaReasonId}
					]);

					/** Set request*/
					let apiResuest=	'<tem:of_cancel_order><tem:passcode>'+this.SOAP_PASSCODE+'</tem:passcode><tem:resturant_id>'+aghzeyaRestId+'</tem:resturant_id><tem:l_str_order>'+apiOrderDetails+'</tem:l_str_order></tem:of_cancel_order>'

					/** Save aghzeya request response */
					exPerms.before_time 	= 	getUtcDate();
					exPerms.unique_order_id = 	uniqueOrderId;
					this.saveApiRequestResponse(req,res,next,{
						log_id 			: 	logId,
						method_name 	: 	apiMethodName,
						response		: 	{},
						request			: 	apiResuest,
						request_error	:	"",
						extra_perms 	:	exPerms
					}).then(()=>{

						let responseMsg		= 	res.__("admin.gfc.order_cancellation_failed_due_to_gfc_delay");
						let tikcetMsg		= 	res.__("orders.gfc_delay");
						try{
							/** Cancel order request */
							client[apiMethodName]({_xml: apiResuest},(apiErr, apiResponse)=>{
								let apiResult 		=	(apiResponse && apiResponse.of_cancel_orderResult) ? apiResponse.of_cancel_orderResult :{};
								let responseCode 	=	(apiResult.error_code)	?	apiResult.error_code 	:100;
								tikcetMsg			= 	(apiResult.error_text)	? 	apiResult.error_text	:tikcetMsg;
								responseMsg			= 	(apiResult.error_text)	? 	apiResult.error_text	:responseMsg;
								let isCanceled		=	(["-2100","200","300"].indexOf(String(responseCode)) >= 0 ) ? true :false;

								/** Save aghzeya request response */
								exPerms.after_time = getUtcDate();
								this.saveApiRequestResponse(req,res,next,{
									log_id 			: 	logId,
									method_name 	: 	apiMethodName,
									response		: 	client.lastResponse,
									request			: 	client.lastRequest,
									request_error	:	String(apiErr),
									extra_perms 	:	exPerms
								}).then(()=>{});

								asyncParallel({
									rest_details : (subCallback)=>{
										if(isCanceled) return subCallback(null);
										subCallback(null);

										/** Update cancel push try */
										this.updateCancelRetryCount(req,res,next,{
											order_id 		: 	orderId,
											cancel_retry	: 	gfcCancelRetry,
											unique_order_id : 	uniqueOrderId,
											cancel_reason_id: 	cancelledReasonId,
											reject_reason	: 	tikcetMsg,
											not_update_retry_count: notUpdateRetryCount,
										}).then(()=>{});
									},
								},()=> {

									resolve({
										status 	 :	(isCanceled) 	? 	Constants.STATUS_SUCCESS 	:Constants.STATUS_ERROR,
										message	 :	(!isCanceled) 	?	responseMsg 	:"",
										err 	 :	apiErr,
										response : 	client.lastResponse,
										request	 : 	client.lastRequest,
										responseCode: 	responseCode,
									});
								});
							},{
								timeout		: 	30000,  // 30 sec
								postProcess	:	function(_xml) {
									let xmlres = _xml.replace('<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"  xmlns:tm="http://microsoft.com/wsdl/mime/textMatching/" xmlns:tns="http://tempurl.org"><soapenv:Body>', '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tem="http://tempurl.org"><soapenv:Header/><soapenv:Body>');

									xmlres = xmlres.replace('<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"  xmlns:tm="http://microsoft.com/wsdl/mime/textMatching/" xmlns:tns="http://tempurl.org"><soap:Body>', '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tem="http://tempurl.org"><soapenv:Header/><soapenv:Body>');

									xmlres = xmlres.replace('</soap:Body></soap:Envelope>', '</soapenv:Body></soapenv:Envelope>');

									return xmlres;
								}
							});
						}catch(e){
							/** Send response */
							resolve({
								status 	 :	Constants.STATUS_ERROR,
								message	 :	responseMsg,
								err 	 :	e,
								response : 	{},
								request	 : 	apiResuest,
							});

							/** Update cancel push try */
							this.updateCancelRetryCount(req,res,next,{
								order_id 		: 	orderId,
								cancel_retry	: 	gfcCancelRetry,
								unique_order_id : 	uniqueOrderId,
								cancel_reason_id: 	cancelledReasonId,
								reject_reason	: 	tikcetMsg,
								not_update_retry_count:	notUpdateRetryCount,
							}).then(()=>{});

							/** Save aghzeya request response */
							exPerms.catch_time = getUtcDate();
							this.saveApiRequestResponse(req,res,next,{
								log_id 			: 	logId,
								method_name 	: 	apiMethodName,
								response		: 	{},
								request			: 	apiResuest,
								request_error	:	e,
								extra_perms 	:	exPerms
							}).then(()=>{ });
						}
					});
				});
			});
		}).catch(next);
	};//End aghzeyaCancelOrder()

	/**
	 * This function to update cancel push try
	 *
	 * @param req	As 	Request Data
	 * @param res	As	Response Data
	 * @param next	As 	Callback argument to the middleware function
	 * @param options	As	object of passed data
	 *
	 * @return json
	**/
	async updateCancelRetryCount (req,res,next,options){
		return new Promise(resolve=>{
			let orderId			= 	(options.order_id) 			? 	new ObjectId(options.order_id)	:"";
			let reasonId		= 	(options.cancel_reason_id) 	? 	options.cancel_reason_id	:"";
			let cancelRetry		=	(options.cancel_retry) 		?	options.cancel_retry		:0;
			let uniqueOrderId	=	(options.unique_order_id) 	?	options.unique_order_id		:"";
			let rejectReason	=	(options.reject_reason) 	?	options.reject_reason		:"";
			let notUpdateRetryCount= (options.not_update_retry_count)?	options.not_update_retry_count:"";

			/** Send error response */
			if(!orderId) return resolve({status: Constants.STATUS_ERROR, message:	res.__("system.missing_parameters") });

			/** Set Update data */
			let updateData = {$set: {
				tmp_cancel_reason_id: reasonId,
				modified: getUtcDate(),
			}};

			if(!notUpdateRetryCount){
				updateData["$inc"] = {gfc_cancel_retry: 1};
			}

			/** Update Order details */
			this.orderDB.updateOne({_id: orderId },updateData).then(()=>{

				resolve({status: Constants.STATUS_SUCCESS, });

				if(cancelRetry == (Constants.MAX_GFC_PUSH_LIMIT-1) && !notUpdateRetryCount){
					/** Generate ticket when order not place */
					generateTicket(req,res,next,{
						order_id 		: 	orderId,
						type 			:	Constants.AUTOMATED_TICKET_FOR_AGHZEYA_ORDER_NOT_CANCELLED,
						message_params 	:	[uniqueOrderId, rejectReason],
					}).then(()=>{});
				}
			}).catch(next);
		}).catch(next);
	};//End updateCancelRetryCount()

	/**
	 * This function to get order status
	 *
	 * @param req	As 	Request Data
	 * @param res	As	Response Data
	 * @param next	As 	Callback argument to the middleware function
	 * @param client As	SOAP module instance
	 *
	 * @return json
	**/
	async getAghzeyaOrderStatus (req,res,next,client){
		return new Promise(resolve=>{
			this.getRestaurantList(req,res,next,{not_simphony: true}).then(response=>{
				let restaurantList 		=	(response.result) ? response.result :[];
				let statusProcessTime	=	newDate(subtractMinute(15));

				/** Send error response */
				if(restaurantList.length == 0) return resolve({status: Constants.STATUS_ERROR, restaurant_list: restaurantList });

				let restaurantIds = [];
				let restaurantObj = {};
				restaurantList.map(records=>{
					restaurantIds.push(records._id);

					restaurantObj[records._id] = records.aghzeya_restaurant_id;
				});

				let tmpOrderDate	=	newDate(subtractDate(2*Constants.HOURS_IN_A_DAY));
				asyncParallel({
					order_list: (callback)=>{
						/** Set conditions */
						let conditions = {
							order_date		: {$gte: getUtcDate(tmpOrderDate)},
							restaurant_id 	: {$in: restaurantIds},
							is_confirm	 	: true,
							order_status 	: {$nin: [Constants.ORDER_SCHEDULED, Constants.ORDER_PAYMENT_PENDING, Constants.ORDER_PAYMENT_FAILED]},
							aghzeya_bill_no : {$exists: true},
							$and : [
								{$or : [
									{is_completed: false},
									{is_completed: {$exists: false}},
								]},
								{$or : [
									{get_order_status_process: {$exists: false}},
									{get_order_status_process: {$lte: statusProcessTime}},
								]},
							]
						};

						/** Get order list */
						this.orderDB.find(conditions).toArray().then(result=>{
							if(result.length ==0) return callback(null, result);

							let allOrderIds = [];
							result.map(records=>{
								allOrderIds.push(records._id);
							});

							/** Update order details */
							this.orderDB.updateMany({
								_id: {$in: allOrderIds}
							},
							{$set:{
								get_order_status_process: getUtcDate()
							}}).then(()=>{
								callback(null, result);
							}).catch(next);
						}).catch(next);
					},
					admin_details : (callback)=>{
						/** Get admin details */
						let tmpId = clone(Constants.GFC_USER);
						this.userDB.findOne({_id: new ObjectId(tmpId)}).then(result=>{
							callback(null, result);
						}).catch(next);
					},
				},(asyncErr, asyncResponse)=> {
					if(asyncErr){
						console.error("on getAghzeyaOrderStatus");
						console.error(asyncErr);
						return resolve({status: Constants.STATUS_ERROR, message: asyncErr });
					}

					let orderList		= 	asyncResponse.order_list;
					let adminDetails	=	(asyncResponse.admin_details) ? asyncResponse.admin_details:{};
					let adminId 		=	adminDetails._id;
					let adminUserRoleId	=	adminDetails.user_role_id;
					let adminUserType 	=	adminDetails.user_type;

					/** Send success response */
					if(orderList.length ==0)  return resolve({status: Constants.STATUS_SUCCESS, orders:orderList });

					/** Send success response */
					resolve({status: Constants.STATUS_SUCCESS, orders: orderList });

					eachOfSeries(orderList, (record, index,seriesCallback) => {
						let orderId				= 	record._id;
						let restId				= 	record.restaurant_id;
						let branchId			= 	record.branch_id;
						let customerId			= 	record.customer_id;
						let adminStatus			= 	record.admin_status;
						let restStatus			= 	record.restaurant_status;
						let uniqueOrderId		= 	record.unique_order_id;
						let aghzeyaRestId		=	(restaurantObj[restId]) ? restaurantObj[restId] :"";
						let aghzeyaStatusDetails= 	(record.aghzeya_status_details) ? 	record.aghzeya_status_details	:"";

						if(!aghzeyaRestId) return seriesCallback(null);

						let logId 		=	new ObjectId();
						let apiResuest 	=	{ passcode: this.SOAP_PASSCODE, resturant_id: aghzeyaRestId, gen_order_id: uniqueOrderId };

						/** Save aghzeya request response */
						this.saveApiRequestResponse(req,res,next,{
							log_id 			: 	logId,
							method_name 	: 	"of_get_order_status",
							request			: 	apiResuest,
							response		: 	{},
							request_error	:	null,
							extra_perms 	:	{
								before_call		: 	true,
								order_id 		:	orderId,
								unique_order_id : 	uniqueOrderId,
								is_completed 	: 	(record.is_completed) ?	record.is_completed :false
							}
						}).then(()=>{

							try{
								/** Request to get order status */
								client["of_get_order_status"](apiResuest,(apiErr,apiResponse)=>{

									/** Save aghzeya request response */
									this.saveApiRequestResponse(req,res,next,{
										log_id 			: 	logId,
										method_name 	: 	"of_get_order_status",
										response		: 	client.lastResponse,
										request			: 	client.lastRequest,
										request_error	:	apiErr,
										extra_perms 	:	{
											after_call		: 	true,
											order_id 		:	orderId,
											unique_order_id : 	uniqueOrderId,
											is_completed 	: 	(record.is_completed) ?	record.is_completed :false
										}
									}).then(()=>{});

									if(apiErr) return seriesCallback(null);

									let statusDetails = (apiResponse && apiResponse.of_get_order_statusResult) ? apiResponse.of_get_order_statusResult :"";

									if(!statusDetails){
										/** Update order details  */
										this.orderDB.updateOne({_id:orderId},{$unset:{get_order_status_process:1}}).then(()=>{}).catch(next);

										return seriesCallback(null);
									}

									let apiStatus	 =	statusDetails.status;
									let systemStatus =	(this.AGHZEYA_ORDER_STATUS[apiStatus]) ? this.AGHZEYA_ORDER_STATUS[apiStatus].status :"";
									let statusLevel  =	(systemStatus && Constants.UPDATE_ORDER_STATUS[systemStatus]) ? Constants.UPDATE_ORDER_STATUS[systemStatus].level :"";
									let oldStatusLevel= (Constants.UPDATE_ORDER_STATUS[adminStatus]) ? Constants.UPDATE_ORDER_STATUS[adminStatus].level :"";

									let isOldStatus = false;
									if(!systemStatus || restStatus == systemStatus || !statusLevel || oldStatusLevel >= statusLevel){
										isOldStatus = true;
									}

									asyncParallel({
										update_order : (parallelCallback)=>{
											if(aghzeyaStatusDetails && aghzeyaStatusDetails[apiStatus]){
												return parallelCallback(null);
											}

											let orderUpdateData = {
												aghzeya_order_status: 	apiStatus,
											};
											orderUpdateData["aghzeya_status_details."+apiStatus] = getUtcDate();

											/** Update order status */
											this.orderDB.updateOne({_id: orderId },{$set: orderUpdateData}).then(()=>{
												parallelCallback(null);
											}).catch(next);
										},
										update_order_details : (parallelCallback)=>{
											if(!isOldStatus) return parallelCallback(null);

											/** Update order status */
											this.orderDB.updateOne({_id:orderId},{$unset:{get_order_status_process:1}}).then(()=>{
												parallelCallback(null);
											}).catch(next);
										},
									},()=> {
										if(isOldStatus || systemStatus == Constants.ORDER_READY_TO_PICK_UP){
											return seriesCallback(null);
										}

										/** Set update data */
										let dataToBeUpdated = {
											order_status 		 : 	systemStatus,
											aghzeya_order_status : 	apiStatus,
											modified 			 : 	getUtcDate()
										};

										if(statusDetails.driver_name){
											dataToBeUpdated.aghzeya_captain_number 	=  "";
											dataToBeUpdated.aghzeya_captain_name 	=  statusDetails.driver_name;
										}

										if(statusDetails.driver_id){
											dataToBeUpdated.aghzeya_driver_id =  statusDetails.driver_id;
										}

										if(statusDetails.cancel_user && systemStatus == Constants.ORDER_CANCELLED){
											dataToBeUpdated.aghzeya_cancel_user =  statusDetails.cancel_user;
										}

										/** Get order details */
										this.orderDB.findOne({
											_id				: orderId,
											is_confirm	 	: true,
											restaurant_id	: {$in: restaurantIds},
											$or 			: [
												{is_completed: false},
												{is_completed: {$exists: false}},
											],
										},{projection:{_id:1, admin_status: 1, restaurant_status: 1, delivery_type:1}}).then(findResult=>{

											if(findResult){
												let tmpRestStatus	= 	findResult.restaurant_status;
												let tmpAdminStatus	= 	findResult.admin_status;
												let oldStatusLevel	= 	(Constants.UPDATE_ORDER_STATUS[tmpAdminStatus]) ? Constants.UPDATE_ORDER_STATUS[tmpAdminStatus].level :"";

												if(tmpRestStatus == systemStatus || oldStatusLevel >= statusLevel){
													return seriesCallback(null);
												}

												/** Skip out of delivery status  when delivery type pickup */
												if(findResult.delivery_type == Constants.DELIVERY_BY_PICK_UP && systemStatus == Constants.ORDER_ON_THE_WAY){
													return seriesCallback(null);
												}

												/** Skip out of delivery status  when delivery type cravez */
												if(findResult.delivery_type == Constants.DELIVERY_BY_CRAVEZ && systemStatus == Constants.ORDER_ON_THE_WAY){
													return seriesCallback(null);
												}

												/** Update order status */
												this.orderDB.updateOne({
													_id: orderId
												},
												{
													$set: dataToBeUpdated,
													$unset: {get_order_status_process: 1}
												}).then(()=>{

													/** Save order logs */
													saveOrderStatusLogs(req,res,next,{
														updated_by 		: 	adminId,
														user_role_id 	: 	adminUserRoleId,
														status 			:	systemStatus,
														order_status	:	restStatus,
														restaurant_id	:	restId,
														order_id 		:	orderId,
														branch_id		:	branchId,
														user_id			:	customerId,
														user_type		:	adminUserType,
													}).then(()=>{
														seriesCallback(null);
													}).catch(next);
												}).catch(next);
											}else{
												seriesCallback(null);
											}
										}).catch(next);
									});
								});
							}catch(e){
								seriesCallback(null);

								/** Save aghzeya request response */
								this.saveApiRequestResponse(req,res,next,{
									log_id 			: 	logId,
									method_name 	: 	"of_get_order_status",
									request			: 	apiResuest,
									response		: 	{},
									request_error	:	e,
									extra_perms 	:	{
										in_catch		:	true,
										order_id 		:	orderId,
										unique_order_id : 	uniqueOrderId,
										is_completed 	: 	(record.is_completed) ?	record.is_completed :false
									}
								}).then(()=>{ }).catch(next);
							}
						});
					},(asyncEachErr)=>{
						if(asyncEachErr) console.log(asyncEachErr);
					});
				});
			});
		});
	};//End getAghzeyaOrderStatus()

	/**
	 * This function to get restaurant cancellation reason
	 *
	 * @param req	As 	Request Data
	 * @param res	As	Response Data
	 * @param next	As 	Callback argument to the middleware function
	 * @param client As	SOAP module instance
	 *
	 * @return json
	**/
	async getCancellationReasons (req,res,next,client){
		return new Promise(resolve=>{
			let aghzeyaRestId	= req.params.restaurant_id;

			/** Call service */
			let apiResuest = {passcode: this.SOAP_PASSCODE, resturant_id: aghzeyaRestId};
			client["of_get_cancel_resons"](apiResuest,(err, response)=>{
				if (err) return next(err);

				let reasonList = (response && response.of_get_cancel_resonsResult && response.of_get_cancel_resonsResult.lstr_cancel_reasons && response.of_get_cancel_resonsResult.lstr_cancel_reasons.str_cancel_reasons) ? response.of_get_cancel_resonsResult.lstr_cancel_reasons.str_cancel_reasons :"";

				/** Save api request response */
				this.saveApiRequestResponse(req,res,next,{
					method_name :	"of_get_cancel_resons",
					response	: 	response,
					request		:	apiResuest,
				}).then(()=>{});

				/** Send success response */
				if(!reasonList || reasonList.length == 0){
					return resolve({status: Constants.STATUS_SUCCESS, message: "No cancel ressons found"});
				}

				asyncParallel({
					restaurant_details : (callback)=>{
						/** Get restaurant details */
						this.getRestaurantList(req,res,next,{restaurant_id:aghzeyaRestId}).then(response=>{
							callback(null, response);
						}).catch(next);
					},
					admin_id : (callback)=>{
						/** Get admin details */
						this.userDB.findOne({user_role_id: Constants.SYSTEM_ADMIN_ROLE_ID},{projection:{_id:1}}).then(result=>{
							let adminId = (result) ? result._id	:"";
							callback(null, adminId);
						}).catch(next);
					},
				},(asyncErr, asyncResponse)=> {
					if(asyncErr) return next(asyncErr);

					let adminId 	= (asyncResponse.admin_id) 	? asyncResponse.admin_id 	:"";
					let restDetails=(asyncResponse.restaurant_details)?asyncResponse.restaurant_details:{};
					let restaurantId  = (restDetails.restaurant_id)   ? restDetails.restaurant_id 	:"";
					let restaurantSlug= (restDetails.restaurant_slug) ? restDetails.restaurant_slug :"";

					/** Send error response */
					if(!restaurantId || !restaurantSlug){
						return resolve({status: Constants.STATUS_ERROR,message : "Something went wrong, Please try again.", restaurantId: restaurantId, restaurantSlug: restaurantSlug });
					}

                    let deleteAbleId = new ObjectId();

					/** Update cancel reason details */
					this.aghzeyaRestaurantCancelReasonDB.updateMany({
						restaurant_id	:	restaurantId,
					},
					{$set : {
						to_be_deleted	: deleteAbleId
					}}).then(()=>{

						eachOfSeries(reasonList, (records, index,eachcallback) => {
							let aghzeyaCancelReasonId 	= 	String(records.id);

							/** Save details **/
							this.aghzeyaRestaurantCancelReasonDB.updateOne({
								restaurant_id 		: 	restaurantId,
								aghzeya_reason_id	:	aghzeyaCancelReasonId,
							},
							{
								$set : {
									name	: 	{ en: records.e_name, ar: records.a_name},
									modified:	getUtcDate(),
								},
								$setOnInsert: {
									aghzeya_restaurant_id : aghzeyaRestId,
									channel_id		: Constants.CHANNEL_SOAP,
									restaurant_slug	: restaurantSlug,
									created			: getUtcDate(),
									added_by		: adminId,
									aghzeya			: true,
								},
								$unset: {
									to_be_deleted: 1,
								}
							},{upsert: true}).then(()=>{
								eachcallback(null);
							}).catch(next);
						},(asyncEachErr)=>{
							if(asyncEachErr) return next(asyncEachErr);

							/** Delete Cancel Reasons details */
							this.aghzeyaRestaurantCancelReasonDB.deleteMany({
								restaurant_id	:	restaurantId,
								to_be_deleted	:	deleteAbleId
							}).then(()=>{
								resolve({status: Constants.STATUS_SUCCESS });
							}).catch(next);
						}).catch(next);
					}).catch(next);
				});
			});
		}).catch(next);
	};//End getCancellationReasons()

	/**
	 * This import cravez cancel reason to map with aghzeya reasons
	 *
	 * @param req	As 	Request Data
	 * @param res	As	Response Data
	 * @param next	As 	Callback argument to the middleware function
	 *
	 * @return json
	**/
	async mapCancelResonswithCravez (req, res, next){
		return new Promise(resolve=>{
			let newFile	= "aghzeya_cancel_reasons.xlsx";

			/** Get data array from*/
			this.getDataFromExcel(req, res, next, {file_name : Constants.IMPORT_SECTION_FILE_PATH+newFile,column : 6}).then(response=>{
				if(response.status != Constants.STATUS_SUCCESS) return res.send({status: Constants.STATUS_ERROR,essage: response.message});
				let dataArray = response.result;

				/** Arrange data in object in save*/
				let dataToBeSaved	= [];
				dataArray.map((rows,index)=>{

					/** push data object in an array to save*/
					dataToBeSaved.push({
						aghzeya_reason_id	: String(rows[2]),
						cravez_reason_id	: String(rows[0]).trim(),
					});
				});

				/** Send response */
				resolve({status : Constants.STATUS_SUCCESS,dataToBeSaved : dataToBeSaved});

				eachOfSeries(dataToBeSaved, (tempRecord, index,callback) => {
					let lineNumber = index+1;

					this.cancelReasonDB.findOne({_id : new ObjectId(tempRecord.cravez_reason_id)},{projection:{_id:1}},(findErr,result)=>{
						if(findErr) return callback(findErr);

						if(result){
							/** Insert record in database */
							this.aghzeyaRestaurantCancelReasonDB.updateMany({
								aghzeya_reason_id : tempRecord.aghzeya_reason_id
							},
							{
								$set : {cancel_reason_id : new ObjectId(result._id)},
							},{upsert : true}).then(()=>{
								callback(null);
							}).catch(next);
						}else {
							console.log("Line No."+lineNumber+" is skipped because no reason found with given cravez reason id."+tempRecord.aghzeya_reason_id);
							callback(null);
						}
					});
				},(asyncErr)=>{
					if(asyncErr) console.log(asyncErr);
				});
			});
		}).catch(next);
	};//End mapCancelResonswithCravez()

	/**
	 * This function to print order
	 *
	 * @param req	As 	Request Data
	 * @param res	As	Response Data
	 * @param next	As 	Callback argument to the middleware function
	 * @param client As	SOAP module instance
	 *
	 * @return json
	**/
	async printAghzeyaOrder (req,res,next,client){
		return new Promise(resolve=>{
			let restaurantId	= new ObjectId(req.params.restaurant_id);
			let orderId			= new ObjectId(req.params.order_id);

			asyncParallel({
				order_details: (callback)=>{
					this.orderDB.findOne({_id: orderId},{projection : {unique_order_id : 1}}).then(result=>{
						callback(null,result);
					}).catch(next);
				},
				rest_details: (callback)=>{
					this.restaurantDB.findOne({_id: restaurantId,aghzeya : true},{projection : {aghzeya_restaurant_id : 1}}).then(result=>{
						callback(null,result);
					}).catch(next);
				}
			},(asyncErr,asyncResponse)=>{
				if(asyncErr) return next(asyncErr);
				if(!asyncResponse.order_details || !asyncResponse.rest_details) return resolve({status: Constants.STATUS_ERROR, message: res.__("system.invalid_access")});

				/** Call service */
				let apiResuest = {
					passcode	 : this.SOAP_PASSCODE,
					resturant_id : asyncResponse.rest_details.aghzeya_restaurant_id,
					gen_order_id : asyncResponse.order_details.unique_order_id
				};
				client["of_print_order"](apiResuest,(err, response)=>{
					if (err) return next(err);

					let responseStatus	= (response && response.of_print_orderResult&& response.of_print_orderResult.print_status_code) ? response.of_print_orderResult.print_status_code : "";
					let responseMsg 	= (response && response.of_print_orderResult&& response.of_print_orderResult.print_status) ? response.of_print_orderResult.print_status : res.__("system.something_going_wrong_please_try_again");

					/** Save api request response */
					this.saveApiRequestResponse(req,res,next,{
						method_name :	"of_print_order",
						response	: 	response,
						request		:	apiResuest,
					}).then(()=>{});

					if(!responseStatus || responseStatus != 200) return resolve({status: Constants.STATUS_ERROR, message: responseMsg});

					this.orderDB.updateOne({
						_id : new ObjectId(orderId)
					},
					{$set : {
						modified : getUtcDate(),
					}}).then(()=>{
						resolve({status: Constants.STATUS_SUCCESS, message: responseMsg});
					}).catch(next);
				});
			});
		}).catch(next);
	};//End printAghzeyaOrder()

	/**
	 * This function to get aghzeya group list
	 *
	 * @param req	As 	Request Data
	 * @param res	As	Response Data
	 * @param next	As 	Callback argument to the middleware function
	 * @param client As	SOAP module instance
	 *
	 * @return json
	**/
	async getAghzeyaGroup (req,res,next,client){
		return new Promise(resolve=>{
			let aghzeyaRestId	= req.params.restaurant_id;

			/** Call service */
			let apiResuest = {passcode: this.SOAP_PASSCODE, resturant_id: aghzeyaRestId};
			client["of_get_extra_groups"](apiResuest,(err, response)=>{
				if (err) return next(err);

				let groupList = (response && response.of_get_extra_groupsResult && response.of_get_extra_groupsResult.lstr_extra_groups && response.of_get_extra_groupsResult.lstr_extra_groups.str_extra_groups) ? response.of_get_extra_groupsResult.lstr_extra_groups.str_extra_groups :"";

				/** Save api request response */
				this.saveApiRequestResponse(req,res,next,{
					method_name :	"of_get_extra_groups",
					response	: 	response,
					request		:	apiResuest,
				}).then(()=>{});

				/** Send success response */
				if(!groupList || groupList.length == 0){
					return resolve({status: Constants.STATUS_SUCCESS, message: "No group found"});
				}

				asyncParallel({
					rest_details : (callback)=>{
						/** Get restaurant details */
						this.getRestaurantList(req,res,next,{restaurant_id:aghzeyaRestId}).then(response=>{
							callback(null, response);
						}).catch(next);
					},
					admin_id : (callback)=>{
						/** Get admin details */
						this.userDB.findOne({user_role_id: Constants.SYSTEM_ADMIN_ROLE_ID},{projection:{_id:1}}).then(result=>{
							let adminId = (result) ? result._id	:"";
							callback(null, adminId);
						}).catch(next);
					},
				},(asyncErr, asyncResponse)=> {
					if(asyncErr) return next(asyncErr);

					let adminId 		=	(asyncResponse.admin_id) 		? 	asyncResponse.admin_id 		:"";
					let restDetails		=	(asyncResponse.rest_details)	?	asyncResponse.rest_details	:{};
					let restaurantId  	= 	(restDetails.restaurant_id)   	? 	restDetails.restaurant_id 	:"";
					let restaurantSlug	= 	(restDetails.restaurant_slug)	? 	restDetails.restaurant_slug :"";

					/** Send error response */
					if(!restaurantId || !restaurantSlug){
						return resolve({status: Constants.STATUS_ERROR,message : "Something went wrong, Please try again.", restaurantId: restaurantId, restaurantSlug: restaurantSlug });
					}

                    let deleteAbleId = new ObjectId();

					/** Update group details */
					this.aghzeyaGroupListDB.updateMany({
						restaurant_id	:	restaurantId,
					},
					{$set : {
						to_be_deleted	: deleteAbleId
					}}).then(()=>{

						eachOfSeries(groupList, (records, index,eachcallback) => {

							/** Save details **/
							this.aghzeyaGroupListDB.updateOne({
								restaurant_id 		: 	restaurantId,
								aghzeya_group_id	:	String(records.id),
							},
							{
								$set : {
									order 			: 	parseInt(index+1),
									name			: 	{ en: records.e_name, ar: records.a_name},
									modified		:	getUtcDate(),
									aghzeya_count 	:	records.count,
									min_quantity 	: 	this.DEFAULT_GROUP_MIN_QUANTITY,
									max_quantity 	: 	this.DEFAULT_GROUP_MAX_QUANTITY,
									aghzeya_restaurant_id : aghzeyaRestId,
								},
								$setOnInsert: {
									channel_id		: Constants.CHANNEL_SOAP,
									restaurant_slug	: restaurantSlug,
									created			: getUtcDate(),
									added_by		: adminId,
									aghzeya			: true,
								},
								$unset: {
									to_be_deleted: 1,
								}
							},{upsert: true},(updateErr) => {
								eachcallback(updateErr);
							}).catch(next);
						},(asyncEachErr)=>{
							if(asyncEachErr) return next(asyncEachErr);

							/** Delete group details */
							this.aghzeyaGroupListDB.deleteMany({
								restaurant_id	:	restaurantId,
								to_be_deleted	:	deleteAbleId
							}).then(()=>{
								resolve({status: Constants.STATUS_SUCCESS });
							}).catch(next);
						});
					}).catch(next);
				});
			});
		}).catch(next);
	};//End getAghzeyaGroup()

	/**
	 * This function to get aghzeya group list
	 *
	 * @param req	As 	Request Data
	 * @param res	As	Response Data
	 * @param next	As 	Callback argument to the middleware function
	 * @param client As	SOAP module instance
	 *
	 * @return json
	**/
	async getAghzeyaExtraItem (req,res,next,client){
		return new Promise(resolve=>{
			let aghzeyaRestId	=	req.params.restaurant_id;

			let apiResuest = {passcode: this.SOAP_PASSCODE, resturant_id: aghzeyaRestId};
			client["of_main_extra_mapping"](apiResuest,(err, response)=>{

				let extraItemList = (response && response.of_main_extra_mappingResult && response.of_main_extra_mappingResult.lstr_item_addons && response.of_main_extra_mappingResult.lstr_item_addons.str_item_addons) ? response.of_main_extra_mappingResult.lstr_item_addons.str_item_addons :"";

				/** Save api request response */
				this.saveApiRequestResponse(req,res,next,{
					method_name		:	"of_main_extra_mapping",
					response		: 	client.lastResponse,
					request			: 	client.lastRequest,
					request_error	: 	err
				}).then(()=>{});

				/** Send success response */
				if(!extraItemList || extraItemList.length == 0){
					return resolve({status: Constants.STATUS_SUCCESS, message: "No extra item found for resturant id- "+aghzeyaRestId});
				}

				asyncParallel({
					rest_details : (callback)=>{
						/** Get restaurant details */
						this.getRestaurantList(req,res,next,{restaurant_id:aghzeyaRestId}).then(response=>{
							callback(null, response);
						}).catch(next);
					},
					admin_id : (callback)=>{
						/** Get admin details */
						this.userDB.findOne({user_role_id: Constants.SYSTEM_ADMIN_ROLE_ID},{projection:{_id:1}}).then(result=>{
							let adminId = (result) ? result._id	:"";
							callback(null, adminId);
						}).catch(next);
					},
				},(asyncErr, asyncResponse)=> {
					if(asyncErr) return next(asyncErr);

					let adminId 		=	(asyncResponse.admin_id) 		? 	asyncResponse.admin_id 		:"";
					let restDetails		=	(asyncResponse.rest_details)	?	asyncResponse.rest_details	:{};
					let restaurantId  	= 	(restDetails.restaurant_id)   	? 	restDetails.restaurant_id 	:"";
					let restaurantSlug	= 	(restDetails.restaurant_slug)	? 	restDetails.restaurant_slug :"";

					/** Send error response */
					if(!restaurantId || !restaurantSlug){
						return resolve({status: Constants.STATUS_ERROR,message: "Something went wrong, Please try again.", restaurantId: restaurantId, restaurantSlug: restaurantSlug });
					}

                    let deleteAbleId = new ObjectId();

					asyncParallel({
						item_list : (childCallback)=>{
							/** Get item list */
							this.itemsDB.find({restaurant_id: restaurantId,},{projection:{_id:1,aghzeya_item_id:1,name:1}}).toArray().then(result=>{
								if(result.length ==0) return childCallback(null, null);

								let tmpList ={};
								result.map(records=>{
									tmpList[records.aghzeya_item_id] = records;
								});
								childCallback(null, tmpList);
							}).catch(next);
						},
						group_list : (childCallback)=>{
							/** Get aghzeya group list */
							this.aghzeyaGroupListDB.find({restaurant_id: restaurantId}).toArray().then(result=>{
								if(result.length ==0) return childCallback(null, null);

								let tmpList ={};
								result.map(records=>{
									tmpList[records.aghzeya_group_id] = records;
								});
								childCallback(null, tmpList);
							}).catch(next);
						},
						group_mark_as_delete : (childCallback)=>{
							/** Update delete flag in item groups */
							this.itemChoiceGroupDB.updateMany({
								restaurant_id	:	restaurantId,
							},
							{$set : {
								to_be_deleted	: deleteAbleId
							}}).then(()=>{
								childCallback(null);
							}).catch(next);
						},
						exitem_mark_as_delete : (childCallback)=>{
							/** Update delete flag in item extra items */
							this.itemExtraMaterDB.updateMany({
								restaurant_id	:	restaurantId,
							},
							{$set : {
								to_be_deleted	: deleteAbleId
							}}).then(()=>{
								childCallback(null);
							}).catch(next);
						},
						mapping_mark_as_delete : (childCallback)=>{
							/** Update delete flag in item mapping group with extra item */
							this.itemGroupExtraDB.updateMany({
								restaurant_id	:	restaurantId,
							},
							{$set : {
								to_be_deleted	: deleteAbleId
							}}).then(()=>{
								childCallback(null);
							}).catch(next);
						},
					},(asyncChildErr, asyncChildRes )=> {
						if(asyncChildErr) return next(asyncChildErr);

						/** Send error response */
						if(!asyncChildRes.item_list || !asyncChildRes.group_list){
							return resolve({status: Constants.STATUS_ERROR, message: "Something went wrong, Please try again.", asyncChildRes: asyncChildRes });
						}

						let finalExItemList		=	{};
						let finalGroupList		=	{};
						let aghzeyaItemList		= 	asyncChildRes.item_list;
						let aghzeyaGroupList 	=	asyncChildRes.group_list;
						eachOfSeries(extraItemList, (records, index, parentCallback) => {
							let aghzeyaGroupId 	=	String(records.group_id);
							let mainItemId 		=	String(records.main_item_id);

							if(!aghzeyaItemList[mainItemId] || !aghzeyaGroupList[aghzeyaGroupId]){
								if(!aghzeyaItemList[mainItemId]) console.log("Item details not found in group save. Item id "+mainItemId);
								if(!aghzeyaGroupList[aghzeyaGroupId]) console.log("Group details not found. Group item id "+aghzeyaGroupId);
								return parentCallback(null);
							}

							let systemItemId	=	aghzeyaItemList[mainItemId]._id;
							let groupDetails	=	aghzeyaGroupList[aghzeyaGroupId];

							/** Set conditions */
							let groupCondi = {
								restaurant_id 		:  	restaurantId,
								item_id 			:  	systemItemId,
								aghzeya_group_id 	:  	aghzeyaGroupId,
							};

							/** Set conditions */
							let groupUpdateData = {
								$set: {
									name 			:	groupDetails.name,
									min_quantity 	: 	groupDetails.min_quantity,
									max_quantity 	: 	groupDetails.max_quantity,
									order 		 	: 	groupDetails.order,
									modified 		: 	getUtcDate(),
								},
								$setOnInsert:	{
									aghzeya		 	: 	true,
									added_by   		:	adminId,
									channel_id		:	Constants.CHANNEL_SOAP,
									aghzeya_item_id :  	mainItemId,
									restaurant_slug : 	restaurantSlug,
									created   		:	getUtcDate(),
								},
								$unset: {
									to_be_deleted: true
								}
							};

							/** Get group details */
							this.itemChoiceGroupDB.findOne(groupCondi,{projection: {_id:1}}).then(groupResult => {

								let choiceId = (groupResult) ? groupResult._id :"";
								if(choiceId){
									if(!finalGroupList[mainItemId]) finalGroupList[mainItemId] = {};
									finalGroupList[mainItemId][aghzeyaGroupId] = choiceId;

									/** Update group details */
									this.itemChoiceGroupDB.updateOne(groupCondi,groupUpdateData).then(()=>{
										parentCallback(null,choiceId)
									}).catch(next);
								}else{
									/** Update group details */
									this.itemChoiceGroupDB.updateOne(groupCondi,groupUpdateData,{upsert: true }).then(choiceResult=>{
										let choiceId = (choiceResult &&  choiceResult.upsertedId && choiceResult.upsertedId._id) ? choiceResult.upsertedId._id:"";

										if(!finalGroupList[mainItemId]) finalGroupList[mainItemId] = {};
										finalGroupList[mainItemId][aghzeyaGroupId] = choiceId;

										parentCallback(null,choiceId);
									}).catch(next);
								}
							}).catch(next);
						},(asyncEachErr)=>{
							if(asyncEachErr) return next(asyncEachErr);

							eachOfSeries(extraItemList, (records, index, childCallback) => {
								let aghzeyaExItemId	=	String(records.extra_item_id);
								let mainItemId 		=	String(records.main_item_id);

								if(!aghzeyaItemList[mainItemId] || !aghzeyaItemList[aghzeyaExItemId]){
									if(!aghzeyaItemList[mainItemId]) console.log("Item details not found in extra item save. Item id "+mainItemId);
									if(!aghzeyaItemList[aghzeyaExItemId]) console.log("Extra Item details not found. Extra item id "+aghzeyaExItemId);
									return childCallback(null);
								}

								let systemItemId	=	aghzeyaItemList[mainItemId]._id;
								let exItemDetails	=	aghzeyaItemList[aghzeyaExItemId];

								/** Set update data */
								let exUpdateData = {
									$set: {
										name 		:	exItemDetails.name,
										extra_fees	: 	0,
										is_active	: 	Constants.ACTIVE,
										item_unit_id: 	"",
										modified	: 	getUtcDate(),
									},
									$setOnInsert:	{
										aghzeya		 	: 	true,
										added_by   		:	adminId,
										aghzeya_item_id :  	mainItemId,
										channel_id		:	Constants.CHANNEL_SOAP,
										restaurant_slug : 	restaurantSlug,
										created   		:	getUtcDate(),
									},
									$unset: {
										to_be_deleted: true
									}
								};

								/** Set conditions  */
								let exConditions = {
									restaurant_id 			:  	restaurantId,
									item_id 				:  	systemItemId,
									aghzeya_extra_item_id 	:  	aghzeyaExItemId,
								};

								/** Get group details */
								this.itemExtraMaterDB.findOne(exConditions,{projection: {_id:1}}).then(exItemResult => {

									let tmpExItemId = (exItemResult) ? exItemResult._id :"";
									if(tmpExItemId){
										if(!finalExItemList[mainItemId]) finalExItemList[mainItemId] = {};
										finalExItemList[mainItemId][aghzeyaExItemId] = tmpExItemId;

										/** Update extra item details */
										this.itemExtraMaterDB.updateOne(exConditions,exUpdateData).then(()=>{
											childCallback(null,tmpExItemId)
										}).catch(next);
									}else{
										/** Update extra item details */
										this.itemExtraMaterDB.updateOne(exConditions,exUpdateData,{upsert: true }).then(exItemResult=>{
											let tmpExItemId = (exItemResult &&  exItemResult.upsertedId && exItemResult.upsertedId._id) ? exItemResult.upsertedId._id:"";

											if(!finalExItemList[mainItemId]) finalExItemList[mainItemId] = {};
											finalExItemList[mainItemId][aghzeyaExItemId] = tmpExItemId;
											childCallback(exItemErr,tmpExItemId);
										}).catch(next);
									}
								}).catch(next);
							},(asyncEachErr)=>{
								if(asyncEachErr) return next(asyncEachErr);

								eachOfSeries(extraItemList, (records, index, subCallback) => {
									let aghzeyaGroupId 	=	String(records.group_id);
									let aghzeyaExItemId	=	String(records.extra_item_id);
									let mainItemId 		=	String(records.main_item_id);
									let extraFees		=	parseFloat(records.extra_fees);
									let systemItemId	=	(aghzeyaItemList[mainItemId]) 		?	aghzeyaItemList[mainItemId]._id 	:"";
									let systemGroupId	=	(finalGroupList[mainItemId] && finalGroupList[mainItemId][aghzeyaGroupId]) 	?	finalGroupList[mainItemId][aghzeyaGroupId] 	:"";
									let systemExItemId	=	(finalExItemList[mainItemId] && finalExItemList[mainItemId][aghzeyaExItemId]) 	?	finalExItemList[mainItemId][aghzeyaExItemId] 	:"";

									if(!systemItemId || !systemExItemId || !systemGroupId){
										if(!systemItemId) 	console.log("Item details not found in extra item mapping. Item id "+mainItemId);
										if(!systemExItemId) console.log("Item details not found in extra item mapping. Extra item id "+aghzeyaExItemId);
										if(!systemGroupId)	console.log("Item details not found in extra item mapping. Group id "+aghzeyaGroupId);
										return subCallback(null);
									}

									/** Update extra item and group mapping details */
									this.itemGroupExtraDB.updateOne({
										restaurant_id 	:  	restaurantId,
										item_id 		:  	systemItemId,
										group_id 		:  	systemGroupId,
										item_extra_id	:  	systemExItemId,
									},{
										$set: {
											order		: 	parseInt(index+1),
											extra_fees	: 	extraFees,
											modified	: 	getUtcDate(),
										},
										$setOnInsert:	{
											aghzeya		 	: 	true,
											added_by   		:	adminId,
											aghzeya_group_id:  	aghzeyaGroupId,
											aghzeya_extra_item_id: aghzeyaExItemId,
											aghzeya_item_id :  	mainItemId,
											channel_id		:	Constants.CHANNEL_SOAP,
											restaurant_slug : 	restaurantSlug,
											created   		:	getUtcDate(),
										},
										$unset: {
											to_be_deleted: true
										}
									},{upsert: true }).then(()=>{
										subCallback(null);
									}).catch(next);
								},(asyncEachErr)=>{
									if(asyncEachErr) return next(asyncEachErr);

									asyncParallel({
										group_delete : (childCallback)=>{
											/** Delete in item groups */
											this.itemChoiceGroupDB.deleteMany({
												restaurant_id	:	restaurantId,
												to_be_deleted	:	deleteAbleId
											}).then(()=>{
												childCallback(null);
											}).catch(next);
										},
										exitem_delete : (childCallback)=>{
											/** Delete in item extras */
											this.itemExtraMaterDB.deleteMany({
												restaurant_id	:	restaurantId,
												to_be_deleted	:	deleteAbleId
											}).then(()=>{
												childCallback(null);
											}).catch(next);
										},
										mapping_delete : (childCallback)=>{
											/** Update delete flag in item mapping group with extra item */
											this.itemGroupExtraDB.deleteMany({
												restaurant_id	:	restaurantId,
												to_be_deleted	:	deleteAbleId
											}).then(()=>{
												childCallback(null);
											}).catch(next);
										},
									},(asyncChildErr )=> {
										if(asyncChildErr) return next(asyncChildErr);

										/** Send success response */
										resolve({
											status			:	Constants.STATUS_SUCCESS,
											error			:	asyncEachErr,
											extraItemList	:	extraItemList,
										});
									});
								});
							});
						});
					});
				});
			});
		}).catch(next);
	};//End getAghzeyaExtraItem()

	/**
	 * This function to push complain to GFC
	 *
	 * @param req	As 	Request Data
	 * @param res	As	Response Data
	 * @param next	As 	Callback argument to the middleware function
	 * @param client As	SOAP module instance
	 *
	 * @return json
	**/
	async pushComplaintToGFC (req,res,next,client){
		return new Promise(resolve=>{
			let orderId			=	new ObjectId(req.params.order_id);
			let vocDate			=	(req.body.voc_date) 		? 	req.body.voc_date 		:"";
			let vocType			=	(req.body.voc_type) 		? 	req.body.voc_type 		:"";
			let submittedBy		=	(req.body.submitted_by) 	? 	req.body.submitted_by 	:"";
			let vocResponses	=	(req.body.voc_responses)	?	req.body.voc_responses 	:[]

			/** Get order details */
			asyncParallel({
				order_details :(callback)=>{
					/** Get order details  */
					this.orderDB.aggregate([
						{$match	: { _id: orderId }},
						{$lookup: {
							"from" 			: 	Tables.RESTAURANTS,
							"localField" 	:	"restaurant_id",
							"foreignField"	: 	"_id",
							"as" 			: 	"rest_details"
						}},
						{$lookup: {
							"from" 			: 	Tables.USERS,
							"localField" 	:	"customer_id",
							"foreignField"	: 	"_id",
							"as" 			: 	"customer_details"
						}},
						{$addFields: {
							rest_details		: {$arrayElemAt : ["$rest_details",0]},
							customer_details	: {$arrayElemAt : ["$customer_details",0]},
						}},
					]).toArray().then(result=>{
						result = (result && result[0]) ? result[0] :null;
						callback(null, result);
					}).catch(next);
				},
				submitted_user_detail :(callback)=>{
					let conditions = {user_role_id: Constants.SYSTEM_ADMIN_ROLE_ID};
					if(submittedBy){
						conditions = {_id: new ObjectId(submittedBy) };
					}

					this.userDB.findOne(conditions,{projection: { agent_id:1,full_name:1}}).then(userResult=>{
						callback(null, userResult);
					}).catch(next);
				},
			},(asyncErr, asyncRes)=>{
				if(asyncErr) return next(asyncErr);

				let orderDetails 	=	asyncRes.order_details;
				let userDetails		=	asyncRes.submitted_user_detail;

				/** Send error response */
				if(!orderDetails || !vocResponses || vocResponses.length == 0){
					return resolve({ status: Constants.STATUS_ERROR, message: res.__("system.something_going_wrong_please_try_again") });
				}

				vocDate					=	newDate(vocDate,this.ORDER_API_DATE_FORMAT);
				let agentName			=	(userDetails && userDetails.full_name) ? userDetails.full_name 		:"";
				let answerGivenBy		=	(userDetails && userDetails._id)? 	userDetails._id					:"";
				let restDetails			=	(orderDetails.rest_details) 	? 	orderDetails.rest_details  		:{};
				let customerDetails		=	(orderDetails.customer_details)	? 	orderDetails.customer_details	:{};
				let uniqueOrderId		=	(orderDetails.unique_order_id) 	? 	orderDetails.unique_order_id  	:"";
				let restaurantId		=	(orderDetails.restaurant_id) 	? 	orderDetails.restaurant_id  	:"";
				let branchId			=	(orderDetails.branch_id) 		? 	orderDetails.branch_id  		:"";
				let billNo				=	(orderDetails.aghzeya_bill_no) 	? 	orderDetails.aghzeya_bill_no  	:"";
				let customerId			=	(customerDetails._id) 			?	customerDetails._id 			:"";
				let aghzeyaRestId		=	restDetails.aghzeya_restaurant_id;
				let aghzeyaBranchId		=	orderDetails.aghzeya_branch_id;
				let customerRestId		=	(customerDetails.restaurants_details && customerDetails.restaurants_details[aghzeyaRestId]) ? customerDetails.restaurants_details[aghzeyaRestId] : "";
				let vocTypeTitle		=	(Constants.VOC_TYPE_FOR_CAPTAIN[vocType]) ? Constants.VOC_TYPE_FOR_CAPTAIN[vocType]	:(Constants.VOC_TYPE_FOR_CLIENT[vocType] ? Constants.VOC_TYPE_FOR_CLIENT[vocType] :"");

				let messageList		=	[];
				let vocAnswersArray	=	[];
				let firstAnswer		=	"";
				vocResponses.map(records=>{
					let vocId		=	(records._id) 		? 	records._id			:"";
					let vocQuestion	=	(records.question) 	? 	records.question	:"";
					let vocAnswer	=	(records.answer) 	? 	records.answer		:"";

					messageList.push({
						_id  	:	new ObjectId(),
						voc_id	: 	vocId,
						type 	: 	vocType,
						question: 	vocQuestion,
						answer 	: 	vocAnswer,
					});

					if(vocAnswer){
						if(!firstAnswer){
							firstAnswer = vocAnswer;
						}else{
							vocAnswersArray.push(vocAnswer);
						}
					}
				});

				/** Set request*/
				let apiRequest	=	'<tem:passcode>'+this.SOAP_PASSCODE+'</tem:passcode><tem:resturant_id>'+aghzeyaRestId+'</tem:resturant_id><tem:c><tem:id>0</tem:id><tem:vdate>'+vocDate+'</tem:vdate><tem:customer_id>'+customerRestId+'</tem:customer_id><tem:order_no>'+billNo+'</tem:order_no><tem:comp_desc>'+jsonxml.cdata(vocTypeTitle+' - '+firstAnswer)+'</tem:comp_desc><tem:notes>'+jsonxml.cdata(vocAnswersArray.join(' - '))+'</tem:notes><tem:add_user>'+agentName+'</tem:add_user><tem:add_date>'+vocDate+'</tem:add_date><tem:p_code>'+aghzeyaBranchId+'</tem:p_code></tem:c>';

				let saveOptions = {
					order_id		: 	orderId,
					restaurant_id	: 	restaurantId,
					branch_id		: 	branchId,
					agent_id		: 	answerGivenBy,
					customer_id		: 	customerId,
					aghzeya_customer_id: customerRestId,
					unique_order_id	: 	uniqueOrderId,
					voc_type		: 	vocType,
					modified		: 	getUtcDate(),
					created			: 	getUtcDate(),
					message_list 	:	messageList,
				};

				/** Save aghzeya request response */
				let logId 		= 	new ObjectId();
				let beforeCall 	=	getUtcDate();
				this.saveApiRequestResponse(req,res,next,{
					log_id 			: 	logId,
					method_name 	: 	"of_insert_update_complaint",
					response		: 	{},
					request			: 	apiRequest,
					request_error	:	"",
					extra_perms 	:	{
						before_call		:	beforeCall,
						order_id 		:	orderId,
						unique_order_id : 	uniqueOrderId
					}
				}).then(()=>{

					try{
						/** push complain to GFC */
						client["of_insert_update_complaint"]({_xml: apiRequest},(apiErr, apiResponse)=>{
							let apiResult 		= 	(apiResponse && apiResponse.of_insert_update_complaintResult) ? apiResponse.of_insert_update_complaintResult :{};
							let responseCode 	=	(apiResult.error_code)	?	apiResult.error_code 	:100;
							let responseMsg		= 	(apiResult.error_text)	? 	apiResult.error_text	:res.__("admin.gfc.failed_complaint_pushed_to_gfc");
							let IsSuccess		=	(["200","300","201"].indexOf(String(responseCode)) != -1) ? true :false;

							/** Save aghzeya request response */
							this.saveApiRequestResponse(req,res,next,{
								log_id 			: 	logId,
								method_name 	: 	"of_insert_update_complaint",
								response		: 	client.lastResponse,
								request			: 	client.lastRequest,
								request_error	:	String(apiErr),
								extra_perms 	:	{
									before_call		:	beforeCall,
									after_call		:	getUtcDate(),
									order_id 		:	orderId,
									unique_order_id : 	uniqueOrderId
								}
							}).then(()=>{});

							/** Send response */
							resolve({
								status 	 :	(IsSuccess) ? Constants.STATUS_SUCCESS :Constants.STATUS_ERROR,
								message	 :	(!IsSuccess)? responseMsg 	 :"",
								err 	 :	apiErr,
								response : 	client.lastResponse,
								request	 : 	client.lastRequest,
							});

							saveOptions.gfc_push_status =  IsSuccess;
							this.saveRestaurantComplaints(req,res,next, saveOptions).then(() => { });
						},{
							timeout		: 	30000,  // 30 sec
							postProcess	:	function(_xml) {
								let xmlres = _xml.replace('<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"  xmlns:tm="http://microsoft.com/wsdl/mime/textMatching/" xmlns:tns="http://tempurl.org"><soapenv:Body>', '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tem="http://tempurl.org"><soapenv:Header/><soapenv:Body>');

								xmlres = xmlres.replace('<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"  xmlns:tm="http://microsoft.com/wsdl/mime/textMatching/" xmlns:tns="http://tempurl.org"><soap:Body>', '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tem="http://tempurl.org"><soapenv:Header/><soapenv:Body>');

								xmlres = xmlres.replace('</soap:Body></soap:Envelope>', '</soapenv:Body></soapenv:Envelope>');

								return xmlres;
							}
						});
					}catch(e){
						/** Send error response */
						resolve({
							status 	 :	Constants.STATUS_ERROR,
							message	 :	res.__("admin.gfc.failed_complaint_pushed_to_gfc"),
							err 	 :	e,
							request	 : 	apiRequest,
						});

						/** Save response */
						saveOptions.gfc_push_status =  false;
						this.saveRestaurantComplaints(req,res,next, saveOptions).then(() => { });

						/** Save aghzeya request response */
						this.saveApiRequestResponse(req,res,next,{
							log_id 			: 	logId,
							method_name 	: 	"of_insert_update_complaint",
							response		: 	{},
							request			: 	apiRequest,
							request_error	:	e,
							extra_perms 	:	{
								before_call		:	beforeCall,
								in_catch		:	getUtcDate(),
								order_id 		:	orderId,
								unique_order_id : 	uniqueOrderId
							}
						}).then(()=>{});
					}
				});
			});
		}).catch(next);
	};//End pushComplaintToGFC()

	/**
	 * This function to push complain to GFC
	 *
	 * @param req	As 	Request Data
	 * @param res	As	Response Data
	 * @param next	As 	Callback argument to the middleware function
	 * @param options	As	object of passed data
	 *
	 * @return json
	**/
	async saveRestaurantComplaints (req,res,next,options){
		return new Promise(resolve=>{
			/** Get cancelled user details  */
			this.customerRestaurantComplaintDB.insertOne(options).then(()=>{
				resolve({status: Constants.STATUS_SUCCESS});
			}).catch(next);
		}).catch(next);
	};// end saveRestaurantComplaints

	/**
	 * Function to fetch order status by simphony
	 *
	 * @param req 	As	Request Data
	 * @param res 	As	Response Data
	 * @param next	As 	Callback argument to the middleware function
	 *
	 * @return render null
	 */
	async fetchSimphonyOrderStatus(req, res,next){
		res.render('blank',{layout:false});

		let processTime 	= 	newDate(subtractMinute(Constants.ORDER_PROCESS_TIME_IN_MINUTES));
		let numberOfDays 	=	req.params.days && req.params.days >0 ? parseInt(req.params.days) :2;
		let startDate 		=	newDate(newDate(subtractDate(numberOfDays * Constants.HOURS_IN_A_DAY),Constants.CURRENTDATE_START_DATE_FORMAT));
		let endDate 		=	newDate(newDate("", Constants.CURRENTDATE_END_DATE_FORMAT));

		asyncParallel({
			order_list : (callback)=>{
				this.orderDB.aggregate([
					{$match: {
						order_date		:	{$gte: startDate, $lt: endDate },
						is_completed	:	{$ne: true},
						simphonyCheckRef:	{$exists: true},
						simphonyLocRef	:	{$exists: true},
						simphonyRvcRef	:	{$exists: true},
						order_status	: 	{$ne: Constants.ORDER_CHECK_CLOSED},
						auto_check_closed_process_time:	{$exists: false},
						$and: [{$or:[
							{order_auto_close_time: {$exists: false }},
							{order_auto_close_time: {$lte: newDate(subtractMinute(10))}},
							{order_auto_close_time: {$gte: newDate(addMinute(10)) }},
						]}],
						$or :	[
							{simphony_fetch_status_process_time: {$exists: false }},
							{simphony_fetch_status_process_time: {$lte: processTime }},
						]
					}},
					{$lookup:	{
						from     : Tables.ORDER_STATUS_LOGS,
						let      : {obId : "$_id"},
						pipeline : [
							{$match : {
								$expr: {
									$and : [
										{$eq: ["$order_id", "$$obId"]},
										{$eq: ["$status",Constants.ORDER_CHECK_CLOSED]},
									]
								}
							}},
							{$project : { _id: 1 }},
						],
						as:	"status_list"
					}},
					{$match :  {'status_list._id': {$exists: false}}},
					{$group : {
						_id: {
							simphonyLocRef : "$simphonyLocRef",
							simphonyRvcRef : "$simphonyRvcRef",
						},
						order_ids:	{$push: "$_id"},
						order_list:	{$push: {
							order_id 		:	"$_id",
							unique_order_id	:	"$unique_order_id",
							order_status	:	"$order_status",
							simphonyCheckRef:	"$simphonyCheckRef",
						}},
					}}
				]).toArray().then(result=>{
					callback(null, result);
				}).catch(next);
			},
			access_token : (callback)=>{
				/** Get simphony access token */

				this.userDB.findOne({user_role_id : Constants.CRAVEZ }).then(result=>{
					let tmpToken = result && result.simphony && result.simphony.accessToken ? result.simphony.accessToken :"";
					callback(null, tmpToken);
				}).catch(next);
			},
			admin_details : (callback)=>{
				/** Get user details */
				this.userDB.findOne({user_role_id : Constants.SYSTEM_ADMIN_ROLE_ID },{projection:{_id:1}}).then(result=>{
					callback(null, result);
				}).catch(next);
			},
		},(asyncErr, asyncRes)=> {

			if(asyncRes.order_list && asyncRes.order_list.length && asyncRes.access_token && asyncRes.admin_details){
				let accessToken 	= 	asyncRes.access_token;
				let adminDetails	=	asyncRes.admin_details;
				let adminId 		=	adminDetails._id;
				let adminUserRoleId	=	adminDetails.user_role_id;
				let adminUserType 	=	adminDetails.user_type;

				let tmpOrderIds =	[];
				asyncRes.order_list.map(data => {
					if(data.order_ids && data.order_ids.length) tmpOrderIds = tmpOrderIds.concat(data.order_ids);
				});

				/** Update process time flag */
				this.orderDB.updateMany({_id:{$in: arrayToObject(tmpOrderIds)}},{$set:{simphony_fetch_status_process_time: getUtcDate()}}).then(()=>{

					eachOfSeries(asyncRes.order_list, (records, index,seriesCallback) => {
						let locRef		=	records._id && records._id.simphonyLocRef ? records._id.simphonyLocRef :"";
						let rvcRef		=	records._id && records._id.simphonyRvcRef ? records._id.simphonyRvcRef :"";
						let orderIds	=	records.order_ids ? records.order_ids :[];
						let orderList	=	records.order_list ? records.order_list :[];
						let orderObj 	=	{};

						if(!locRef || !rvcRef) return seriesCallback(null);

						/** Convert into object */
						orderList.map(odData=>{
							orderObj[odData.simphonyCheckRef] = odData;
						});

						/** Save api request response */
						let checkDate 		=	newDate(subtractDate(6),this.ORDER_API_DATE_FORMAT);
						let logId			=	new ObjectId();
						let apiMethodName 	=	'of_get_order_status';
						let logsExtraPerms 	=	{before_call_time: getUtcDate(), order_list: orderList};

						/** Save simphony API logs */
						this.saveApiRequestResponse(req,res,next,{
							log_id			: 	logId,
							method_name 	: 	apiMethodName,
							response		: 	{},
							request			: 	{},
							request_error	:	null,
							extra_perms 	:	logsExtraPerms
						}).then(()=>{

							let url 	=	`${process.env.SIMPHONY_STS_GEN2_API_BASE_URL}checks?sinceTime=${checkDate}&includeClosed=true`;
							let headers =	{
								'Simphony-OrgShortName': process.env.SIMPHONY_ENTERPRISE_SHORT_NAME,
								'Simphony-LocRef'	:	locRef,
								'Simphony-RvcRef'	:	rvcRef,
								'Accept'			:	'application/json',
								'Authorization'		:	`Bearer ${accessToken}`
							};

							try{
								/** Call api */
								axios({
									method	: 	'GET',
									url		:	url,
									headers	: 	headers,
									httpsAgent: new https.Agent({ rejectUnauthorized: false }) // equivalent to strictSSL: false
								}).then(response=> {
									let resBody 	= 	response && response.body ? response.body :"";
									let resJSONBody = 	resBody ? JSON.parse(resBody) :{};
									let apiOdList 	=	resJSONBody && resJSONBody.items ? resJSONBody.items :[];

									/** Save simphony API logs */
									logsExtraPerms.url 				=	url;
									logsExtraPerms.after_call_time 	=	getUtcDate()
									this.saveApiRequestResponse(req,res,next,{
										log_id 			: 	logId,
										method_name 	: 	apiMethodName,
										request			: 	headers,
										response		: 	JSON.stringify(apiOdList),
										request_error	:	null,
										extra_perms 	:	logsExtraPerms
									}).then(()=>{});

									if(!apiOdList.length){
										/** Unset process time flag */
										this.orderDB.updateMany({_id:{$in: arrayToObject(orderIds)}},{$unset:{simphony_fetch_status_process_time: 1 }}).then(()=>{}).catch(next);

										return seriesCallback(null);
									}

									eachOfSeries(apiOdList, (apiOdData, apiIndex,seriesAPICallback)=>{
										let apiCheckRef =	apiOdData.header && apiOdData.header.checkRef 	?	apiOdData.header.checkRef 	:"";
										let tmpStatus 	=	(apiOdData.header && apiOdData.header.status 	?	apiOdData.header.status 	:"").toLowerCase();
										let apiSubtotal =	apiOdData.totals && apiOdData.totals.subtotal	?	apiOdData.totals.subtotal 	:"";
										let mainOrderId =	orderObj[apiCheckRef] ? orderObj[apiCheckRef].order_id :"";
										let lstStatus 	=	orderObj[apiCheckRef] ? orderObj[apiCheckRef].order_status :"";
										let isOpened 	=	tmpStatus != 'closed' ? true :false;

										/** unset process flag */
										if(isOpened && mainOrderId) this.orderDB.updateOne({_id: new ObjectId(mainOrderId)},{$unset: {simphony_fetch_status_process_time: 1}}).then(()=>{}).catch(next);

										if(isOpened || !mainOrderId) return seriesAPICallback(null);

										let apiOdStatus = 	apiSubtotal > 0 ? Constants.ORDER_CHECK_CLOSED :Constants.ORDER_CANCELLED;

										/** check if already mark as delivered but cancel at POS */
										if(lstStatus == Constants.ORDER_CHECK_CLOSED && apiOdStatus == Constants.ORDER_CHECK_CLOSED){
											this.orderDB.updateOne({_id: new ObjectId(mainOrderId)},{$unset: {simphony_fetch_status_process_time: 1}}).then(()=>{}).catch(next);

											return seriesAPICallback(null);
										}

										/** Get order details */
										this.orderDB.findOne({_id: new ObjectId(mainOrderId), is_completed: {$ne: true}, auto_check_closed_process_time: {$exists: false}}).then(odResult=>{
											if(null || !odResult){
												this.orderDB.updateOne({_id: new ObjectId(mainOrderId)},{$unset: {simphony_fetch_status_process_time: 1}}).then(()=>{}).catch(next);

												return seriesAPICallback(null);
											}

											let restStatus	= 	odResult.restaurant_status;
											let restId		= 	odResult.restaurant_id;
											let branchId	= 	odResult.branch_id;
											let customerId	= 	odResult.customer_id;

											/** Set updated data  */
											let dataToBeUpdated = {
												$set : {
													order_status: 	apiOdStatus,
													modified 	: 	getUtcDate()
												},
												$unset:	{
													simphony_fetch_status_process_time: 1
												}
											};

											if(apiOdStatus == Constants.ORDER_CHECK_CLOSED) dataToBeUpdated["$set"].status_remark = 'The order was closed in POS end.';

											if(apiOdStatus == Constants.ORDER_CANCELLED){
												dataToBeUpdated["$set"].rejection_reason = 'Ticket closed at POS end.';
												dataToBeUpdated["$unset"].status_remark = 1;
											}

											/** Update order status */
											this.orderDB.updateOne({_id: new ObjectId(mainOrderId) },dataToBeUpdated).then(()=>{

												/** Save order logs */
												saveOrderStatusLogs(req,res,next,{
													updated_by 		: 	adminId,
													user_role_id 	: 	adminUserRoleId,
													status 			:	apiOdStatus,
													order_status	:	restStatus,
													restaurant_id	:	restId,
													order_id 		:	mainOrderId,
													branch_id		:	branchId,
													user_id			:	customerId,
													user_type		:	adminUserType,
												}).then(()=>{
													seriesAPICallback(null);
												}).catch(next);
											}).catch(next);
										}).catch(next);
									},(asyncSeriesChildErr)=>{
										seriesCallback(asyncSeriesChildErr);
									});
								}).catch(error=>{

									/** Save simphony API logs */
									logsExtraPerms.url 					=	url;
									logsExtraPerms.after_call_time 		=	getUtcDate()
									logsExtraPerms.request_catch_time 	=	getUtcDate()
									this.saveApiRequestResponse(req,res,next,{
										log_id 			: 	logId,
										method_name 	: 	apiMethodName,
										request			: 	headers,
										response		: 	{},
										request_error	:	error,
										extra_perms 	:	logsExtraPerms
									}).then(()=>{});

									seriesCallback(null);
								});
							}catch(error){
								console.log("Error at fetch order status by simphony api ",error);

								/** Save api request response */
								logsExtraPerms.in_catch	= 	true;
								logsExtraPerms.catch_time 	=	getUtcDate();
								SIMPHONY.saveApiRequestResponse(req,res,next,{
									log_id			: 	logId,
									method_name 	: 	apiMethodName,
									response		: 	{},
									request			: 	headers,
									request_error	:	error,
									extra_perms 	:	logsExtraPerms,
								}).then(()=>{ }).catch(next);

								return seriesCallback(null);
							}
						}).catch(next);
					},(asyncEachErr)=>{
						if(asyncEachErr) console.log("Error on fetchSimphonyOrderStatus ",asyncEachErr);
					});
				}).catch(next);
			}
		});
	}; //End fetchSimphonyOrderStatus

	/**
	 * Function to fetch order status by dhub
	 *
	 * @param req 	As	Request Data
	 * @param res 	As	Response Data
	 * @param next	As 	Callback argument to the middleware function
	 *
	 * @return render null
	 */
	async fetchDhubOrderStatus(req, res,next){
		res.render('blank',{layout:false});

		let processTime 	= 	newDate(subtractMinute(Constants.ORDER_PROCESS_TIME_IN_MINUTES));
		let numberOfDays 	=	req.params.days && req.params.days >0 ? parseInt(req.params.days) :2;
		let startDate 		=	newDate(newDate(subtractDate(numberOfDays * Constants.HOURS_IN_A_DAY),Constants.CURRENTDATE_START_DATE_FORMAT));
		let endDate 		=	newDate(newDate("", Constants.CURRENTDATE_END_DATE_FORMAT));

		asyncParallel({
			order_list : (callback)=>{
				this.orderDB.aggregate([
					{$match: {
						order_date		:	{$gte: startDate, $lt: endDate },
						is_completed	:	{$ne: true},
						dhub_order_id	:	{$exists: true},
						$or :	[
							{dhub_fetch_status_process_time: {$exists: false }},
							{dhub_fetch_status_process_time: {$lte: processTime }},
						]
					}}
				]).toArray().then(result=>{
					callback(null, result);
				}).catch(next);
			},
			access_token : (callback)=>{
				/** Get dhub access token */
				this.userDB.findOne({user_role_id : Constants.CRAVEZ }).then(result=>{
					let tmpToken = result && result.dhub && result.dhub.accessToken ? result.dhub.accessToken :"";
					callback(null, tmpToken);
				}).catch(next);
			},
			admin_details : (callback)=>{
				/** Get system user details */
				this.userDB.findOne({user_role_id : Constants.SYSTEM_ADMIN_ROLE_ID },{projection:{_id:1}}).then(result=>{
					callback(null, result);
				}).catch(next);
			},
		},(_, asyncRes)=> {

			if(asyncRes.order_list && asyncRes.order_list.length && asyncRes.access_token && asyncRes.admin_details){

				let accessToken 	= 	asyncRes.access_token;
				let adminDetails	=	asyncRes.admin_details;
				let adminId 		=	adminDetails._id;
				let adminUserRoleId	=	adminDetails.user_role_id;
				let adminUserType 	=	adminDetails.user_type;

				eachOfSeries(asyncRes.order_list, (records, index,seriesCallback) => {
					let odId 			= 	records._id;
					let dhubOdId 		=	records.dhub_order_id;
					let restId			= 	records.restaurant_id;
					let branchId		= 	records.branch_id;
					let customerId		= 	records.customer_id;
					let adminStatus		= 	records.delivery_status ? records.delivery_status :records.admin_status;

					/** Update process time flag */
					this.orderDB.updateOne({_id: odId },{$set:{dhub_fetch_status_process_time: getUtcDate()}}).then(()=>{

						/** Set logs object */
						let reqUrl 	=	`${process.env.DHUB_API_BASE_URL}Order/GetStatus/${dhubOdId}`;
						let logBody = {
							log_id			: 	new ObjectId(),
							method_name 	: 	'of_get_order_status',
							request			: 	{},
							response		: 	{},
							request_error	:	null,
							extra_perms 	:	{order_id: odId, before_call_time: getUtcDate(), dhub_order_id: dhubOdId, token: accessToken, url: reqUrl}
						};

						/** Save api request logs */
						this.saveApiRequestResponse(req,res,next,logBody).then(()=>{

							try{
								/** Call api */
								axios({
									method	: 	'GET',
									url		:	reqUrl,
									headers	: 	{Authorization: `Bearer ${accessToken}`},
									httpsAgent: new https.Agent({ rejectUnauthorized: false }) // equivalent to strictSSL: false
								}).then(resBody=> {

									if(resBody && resBody.constructor == String) resBody = JSON.parse(resBody);
									let resOdId 		=	resBody && resBody.data && resBody.data.orderId  ? String(resBody.data.orderId) :"";
									let resStatusCd 	=	resBody && resBody.data && resBody.data.orderStatusCode ? String(resBody.data.orderStatusCode) :"";
									let driverDetails	=	resBody && resBody.data && resBody.data.data 	 ? resBody.data.data :{};
									let systemStatus 	=	(this.DHUB_ORDER_STATUS[resStatusCd]) ? this.DHUB_ORDER_STATUS[resStatusCd].status :"";

									/** Save simphony API logs */
									logBody.response 						=	resBody;
									logBody.extra_perms.after_call_time 	=	getUtcDate()
									this.saveApiRequestResponse(req,res,next,logBody).then(()=>{});

									if(!resOdId || !this.DHUB_ORDER_STATUS[resStatusCd]){
										/** Unset process time flag */
										this.orderDB.updateOne({_id: odId},{$unset:{dhub_fetch_status_process_time: 1 }}).then(()=>{}).catch(next);

										return seriesCallback(null);
									}

									let isUpdateLogs = true;
									if(!systemStatus || adminStatus == systemStatus){
										isUpdateLogs = false;
									}

									let odUpdateData = {
										$set: {
											modified 		 :	getUtcDate(),
											dhub_order_status: 	resStatusCd,
										},
										$unset: {
											dhub_fetch_status_process_time :1,
										}
									};

									if(isUpdateLogs){
										odUpdateData['$set'].order_status = systemStatus;

										odUpdateData['$push'] = {dhub_status_list: {statusCode: resStatusCd, date: getUtcDate() } }
									}

									if(driverDetails && driverDetails.driverId){
										if(driverDetails.driverName)	odUpdateData['$set'].captain_name 	= 	driverDetails.driverName;
										if(driverDetails.driverPhone) 	odUpdateData['$set'].captain_number =	driverDetails.driverPhone;

										odUpdateData['$set'].dhub_captain_details = driverDetails;
									}else{
										odUpdateData['$unset'].captain_name			= 1;
										odUpdateData['$unset'].captain_number 		= 1;
										odUpdateData['$unset'].dhub_captain_details = 1;
									}

									/** Update order details */
									this.orderDB.updateOne({_id: odId },odUpdateData).then(()=>{

										if(!isUpdateLogs) return seriesCallback(null);

										/** Save order logs */
										saveOrderStatusLogs(req,res,next,{
											updated_by 		: 	adminId,
											user_role_id 	: 	adminUserRoleId,
											status 			:	systemStatus,
											order_status	:	adminStatus,
											restaurant_id	:	restId,
											order_id 		:	odId,
											branch_id		:	branchId,
											user_id			:	customerId,
											user_type		:	adminUserType,
											extra_perms		:	driverDetails
										}).then(()=>{
											seriesCallback(null);
										}).catch(next);
									}).catch(next);
								}).catch(() => {
									seriesCallback(null);
								});;
							}catch(error){
								console.log("Error at fetch order status by dhud api ",error);

								/** Save api request response */
								logBody.request_error			= 	error;
								logBody.extra_perms.in_catch	= 	true;
								logBody.extra_perms.catch_time 	=	getUtcDate();
								this.saveApiRequestResponse(req,res,next,{
									log_id			: 	logId,
									method_name 	: 	apiMethodName,
									response		: 	{},
									request			: 	headers,
									request_error	:	error,
									extra_perms 	:	logsExtraParams,
								}).then(()=>{ }).catch(next);

								return seriesCallback(null);
							}
						}).catch(next);
					}).catch(next);
				},(asyncEachErr)=>{
					if(asyncEachErr) console.log("Error on fetchDhubOrderStatus ",asyncEachErr);
				});
			}
		});
	}; //End fetchDhubOrderStatus
}