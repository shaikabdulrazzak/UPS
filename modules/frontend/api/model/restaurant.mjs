import { ObjectId } from 'mongodb';
import clone from 'clone';
import {parallel as asyncParallel, each as asyncEach} from 'async';

import * as Constants from "../../../../config/global_constant.mjs";
import Tables from '../../../../config/database_tables.mjs';
import { sanitizeData, getUtcDate, newDate, subtractDate, cleanRegex, round, arrayToObject} from "../../../../utils/index.mjs";
import cartModal from './user_carts.mjs';

export default class Restaurant{

	constructor(db) {
		this.db     =   db;
		this.cartAPI =  new cartModal(db);
	}

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
		return new Promise(resolve=>{
			/** Sanitize Data **/
            req.body 		=	sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
            let areaName	= 	(req.body.area_name) ? req.body.area_name :"";

			asyncParallel({
				area_list : (callback)=>{
					/** Set conditions */
					let areaConditions = { is_active: Constants.ACTIVE};
					if(areaName){
						let searchValue = cleanRegex(areaName);
						areaConditions["$or"] = [
							{"name.en" : { $regex: new RegExp('^' + searchValue, 'i') } },
							{"name.ar" : { $regex: new RegExp('^' + searchValue, 'i') } },
						];
					}

					/** Get area list  */
					const areas = this.db.collection(Tables.AREAS);
					areas.aggregate([
						{$match: areaConditions},
						{$sort : {"name.en" : Constants.SORT_ASC }},
						{$group: {
							_id 		:	"$city_id",
							area_list	:	{$push 	: {
								_id		: 	"$_id",
								name 	:	"$name",
							}},
						}},
					]).toArray().then(areaResult=>{
						callback(null, areaResult);
					}).catch(next);
				},
				city_list : (callback)=>{
					/** Get city list **/
					const cities	= this.db.collection(Tables.CITIES);
					cities.find({},{projection: {name: 1}}).toArray().then(cityResult=>{
						if(cityResult.length <=0) return callback(null,{});

						let cityData = {};
						cityResult.map(records=>{  cityData[records._id] = records; });
						callback(null, cityData);
					}).catch(next);
				},
			},(asyncErr, asyncResponse)=>{
				if(asyncErr) return next(asyncErr);

				let cityList 	=	asyncResponse.city_list;
				let areaList	= 	asyncResponse.area_list;

				/** Add city name */
				areaList.map(records=>{
					records.city_name = (cityList[records._id])  ? cityList[records._id].name :"";
				});

				/** Send success response */
				resolve({status: Constants.STATUS_SUCCESS, result: areaList});
			});
		}).catch(next);
	};// end getAreaList()

	/**
	 * Function to get item list
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	**/
	async getItemList (req,res,next){
		return new Promise(resolve=>{
			/** Sanitize Data **/
            req.body 		=	sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
            let areaId		= 	(req.body.area_id) 		? 	new ObjectId(req.body.area_id) 	:"";
            let userId		= 	(req.body.user_id) 		? 	new ObjectId(req.body.user_id) 	:"";
			let itemName	= 	(req.body.item_name)	?	req.body.item_name			:"";
			let skip		= 	(req.body.skip)			?	parseInt(req.body.skip)		:0;
			let limit		= 	(req.body.limit)		?	parseInt(req.body.limit)	:0;
			let tmpLimit	=	(res.locals.settings['Site.front_record_limit']) ? parseInt(res.locals.settings['Site.front_record_limit']) :Constants.FRONT_LISTING_LIMIT;
			limit			=	(!limit)  ? tmpLimit :limit;

			/** Send error response **/
			if(!areaId) return resolve({status:Constants.STATUS_ERROR, message:res.__("system.missing_parameters")});

			let openingTime 	= 	(res.locals.settings["App.opening_time"]) ? res.locals.settings["App.opening_time"] : "";
			let closingTime		= 	(res.locals.settings["App.closing_time"]) ? res.locals.settings["App.closing_time"] : "";
			let weatherMessage 	=	(res.locals.settings["App.weather_message"]) ? res.locals.settings["App.weather_message"] : "";
			let weatherMessageInArabic 		=	(res.locals.settings["App.weather_message_in_arabic"]) ? res.locals.settings["App.weather_message_in_arabic"] : "";
			let unlimitedDeliveriesMessage 	=	(res.locals.settings["App.unlimited_free_deliveries"]) ? res.locals.settings["App.unlimited_free_deliveries"] : "";
			let unlimitedDeliveriesMessageInArabic 	=	(res.locals.settings["App.unlimited_free_deliveries_in_arabic"]) ? res.locals.settings["App.unlimited_free_deliveries_in_arabic"] : "";

			/** Set success response */
			let successResponse = {
				status			: 	Constants.STATUS_SUCCESS,
				result			: 	[],
				total_item		: 	0,
				weather_message	:{
					en : weatherMessage,
					ar : weatherMessageInArabic
				},
				open_time		: 	openingTime,
				close_time		: 	closingTime,
				item_image_url	:	Constants.ITEMS_FILE_URL,
				unlimited_free_deliveries_message :{
					en: unlimitedDeliveriesMessage,
					ar: unlimitedDeliveriesMessageInArabic,
				}
			};

			asyncParallel({
				restaurant_list : (callback)=>{
					/** Set restaurant conditions **/
					let restaurantConditions = {
						is_deleted	:	Constants.NOT_DELETED,
						status		:	Constants.ACTIVE,
					};

					/** Get restaurant list **/
					const restaurants	= this.db.collection(Tables.RESTAURANTS);
					restaurants.find(restaurantConditions,{projection: {name: 1 }}).toArray().then(restaurantResult=>{
						callback(null,restaurantResult);
					}).catch(next);
				},
				branch_list : (callback)=>{
					let branchConditions ={
						is_active :	Constants.ACTIVE,
					};

					/** Get restaurant branch list **/
					const restaurant_branches 	= this.db.collection(Tables.RESTAURANT_BRANCHES);
					restaurant_branches.distinct("_id", branchConditions).then(branchResult=>{
						callback(null, branchResult);
					}).catch(next);
				},
				availability_item_list : (callback)=>{
					let currentTime = parseFloat(newDate("",Constants.TIME_FORMAT));

					/** Set availability item conditions **/
					let availabilityConditions = {
						from_time	:	{$lte: currentTime},
						to_time		:	{$gte: currentTime},
					};

					/** Get availability item list **/
					const item_availability	= this.db.collection(Tables.ITEM_AVAILABILITY);
					item_availability.distinct( "item_id", availabilityConditions).then(availabilityResult=>{
						callback(null,availabilityResult);
					}).catch(next);
				},
			},(asyncErr, asyncResponse)=>{
				if(asyncErr) return next(asyncErr);

				let branchList 				=	asyncResponse.branch_list;
				let restaurantList 			=	asyncResponse.restaurant_list;
				let availabilityItemIds		=	asyncResponse.availability_item_list;
				let restaurantIds			=	[];
				let restaurantDetailsList	=	{};

				/** Send success response */
				if(restaurantList.length <=0 || branchList.length <=0 || availabilityItemIds.length <=0){
					return resolve(successResponse);
				}

				/** Get restaurant id list  */
				restaurantList.map(records=>{
					restaurantIds.push(records._id);
					restaurantDetailsList[records._id] =  records;
				});

				/** Set area conditions  */
				let areaConditions = {
					area_id			:	areaId,
					branch_id		:	{$in : branchList},
					restaurant_id	:	{$in : restaurantIds},
				};

				/** Get area wise branches list */
				const restaurant_branch_areas = this.db.collection(Tables.RESTAURANT_BRANCH_AREAS);
				restaurant_branch_areas.aggregate([
					{$match : areaConditions},
					{$group: {
						_id 		: "$restaurant_id",
						branch_id 	: {$first: "$branch_id"},
					}}
				]).toArray().then(areaResult=>{

					/** Send success response */
					if(areaResult.length <=0) return resolve(successResponse);

					let branchIdWithRestaurant	= {};
					let branchIdsList 			= [];
					let finalRestaurantIds 		= [];
					areaResult.map(records=>{
						branchIdsList.push(records.branch_id);
						finalRestaurantIds.push(records._id);

						branchIdWithRestaurant[records._id] = records.branch_id;
					});

					/** Set linking item conditions **/
					let linkItemConditions = {
						$or : [
							{
								type : Constants.ITEM_NOT_LISTED_TO_SELECTED_BRANCH_LIST,
								branch_ids: { $nin: branchIdsList }
							},
							{
								type: Constants.ITEM_LISTED_TO_SELECTED_BRANCH_LIST,
								$or : [
									{branch_ids	: { $size: 0} },
									{branch_ids : { $in: branchIdsList } }
								]
							}
						]
					};

					/** Get item linking list **/
					const item_linkings	= this.db.collection(Tables.ITEM_LINKINGS);
					item_linkings.distinct("item_id", linkItemConditions).then(itemIds=>{

						/** Send success response */
						if(itemIds.length <=0) return resolve(successResponse);

						/** Set item conditions **/
						let itemConditions = {
							$and :[
								{ _id	:	{$in : itemIds} },
								{ _id	:	{$in : availabilityItemIds} }
							],
							restaurant_id	:	{$in : finalRestaurantIds},
							menu_active		:	true,
							is_active		:	Constants.ACTIVE,
							non_sellable	:	{$ne : Constants.NON_SELLABLE},
							"category_ids.0": 	{$exists: true}
						};

						if(itemName){
							itemName = cleanRegex(itemName);
							itemConditions["$or"] = [
								{"name.en" : new RegExp(itemName, "i")},
								{"name.ar" : new RegExp(itemName, "i")},
								{"description.en" : new RegExp(itemName, "i")},
								{"description.ar" : new RegExp(itemName, "i")},
							];

							if(itemName.split(" ").length >1){
								itemName.split(" ").map(key=>{
									itemConditions["$or"].push({"name.en": new RegExp(key, "i")})
									itemConditions["$or"].push({"name.ar": new RegExp(key, "i")})
									itemConditions["$or"].push({"description.en": new RegExp(key, "i")})
									itemConditions["$or"].push({"description.ar": new RegExp(key, "i")})
								});
							}
						}

						const items = this.db.collection(Tables.ITEMS);
						asyncParallel({
							item_list : (callback)=>{
								/** Get item list */
								items.find(itemConditions,{projection: {
									_id: 1, name: 1, description: 1, price_on_selection: 1, category_ids: 1, item_price:1, image:1, restaurant_id:1, discount_percentage: 1, discount_value: 1,grid_image :1,detail_image:1
								}}).sort({order: Constants.SORT_ASC}).skip(skip).limit(limit).toArray().then(itemResult=>{
									if(itemResult.length <=0) return  callback(null,itemResult);

									itemResult.map(records=>{
										let tmpRestaurantId = records.restaurant_id;

										records.area_id 		=	areaId;
										records.branch_id 		= 	(branchIdWithRestaurant[tmpRestaurantId]) ? branchIdWithRestaurant[tmpRestaurantId] :"";
										records.restaurant_name = 	(restaurantDetailsList[tmpRestaurantId]) ? restaurantDetailsList[tmpRestaurantId].name :{};
									});

									callback(null,itemResult);
								}).catch(next);
							},
							item_count : (callback)=>{
								/** Get item total items */
								items.countDocuments(itemConditions).then(contResult=>{
									callback(null,contResult);
								}).catch(next);
							},
							favourite_list : (favouriteCallback)=>{
								if(!userId) return favouriteCallback(null, {});

								/** Set conditions */
								let favouriteConditions = {
									user_id:  userId,
									$and :[
										{ item_id	:	{$in : itemIds} },
										{ item_id	:	{$in : availabilityItemIds} }
									]
								};

								/** Get favourite item list **/
								const user_favourites	= this.db.collection(Tables.USER_FAVOURITES);
								user_favourites.distinct("item_id",favouriteConditions).then(favouriteResult=>{
									if(favouriteResult.length <= 0) return favouriteCallback(null, {});

									let favouriteList = {};
									favouriteResult.map(tempItemId=>{
										favouriteList[String(tempItemId)] = true;
									});

									favouriteCallback(null, favouriteList);
								}).catch(next);
							},
						},(asyncChildErr, asyncChildResponse)=>{
							if(asyncChildErr) return next(asyncChildErr);

							let itemList 		=	asyncChildResponse.item_list;
							let favouriteList 	= 	asyncChildResponse.favourite_list;

							if(itemList.length >0){
								itemList.map(records=>{
									if(records.item_price){
										let tmpPrice 		=	records.item_price;
										let percentage		=	records.discount_percentage;
										let discountValue	=	records.discount_value;

										if(discountValue){
											let tmpDiscount= (tmpPrice>=discountValue) ? discountValue :tmpPrice;

											records.strikethrough_price = tmpPrice;
											records.item_price = round(tmpPrice-tmpDiscount);
										}else if(percentage){
											let tmpDiscount = 	(tmpPrice*percentage)/100;

											records.strikethrough_price= tmpPrice;
											records.item_price = round(tmpPrice-tmpDiscount);
										}
									}

									/** Add favourite status  */
									records.is_favourite =	(favouriteList[records._id]) ? Constants.FAVOURITE :Constants.UNFAVOURITE;
								});
							}

							/** Send response */
							successResponse.total_item 	=	asyncChildResponse.item_count;
							successResponse.result 		= 	itemList;
							resolve(successResponse);
						});
					}).catch(next);
				}).catch(next);
			});
        }).catch(next);
	};// end getItemList()

	/**
	 * Function to get restaurant list
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	**/
	async getRestaurantList (req,res,next){
		return new Promise(resolve=>{
			/** Sanitize Data **/
			req.body 			=	sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
			let restaurantId	= 	(req.body.restaurant_id) 	? 	req.body.restaurant_id 			:"";
			let areaId			= 	(req.body.area_id) 			? 	req.body.area_id 				:"";
			let restaurantName	= 	(req.body.restaurant_name) 	?	req.body.restaurant_name		:"";
			let categoryTags	= 	(req.body.category_tags) 	?	req.body.category_tags			:[];
			let sortBy			=	(req.body.sort_by) 			?	req.body.sort_by				:"";
			let latitude		=	(req.body.latitude) 		?	parseFloat(req.body.latitude)	:"";
			let longitude		=	(req.body.longitude) 		?	parseFloat(req.body.longitude)	:"";
			let cuisineId		=	(req.body.cuisine_id) 		?	req.body.cuisine_id				:[];
			let acceptPickup	=	(req.body.accept_pickup)	?JSON.parse(req.body.accept_pickup)	:false;
			let branchOpen		=	(req.body.is_open) 			?	JSON.parse(req.body.is_open)	:false;
			let hasOffer		=	(req.body.has_discount)		?JSON.parse(req.body.has_discount)	:false;
			let payOnline		=	(req.body.pay_online)		?JSON.parse(req.body.pay_online)	:false;
			let acceptPreOrder	=	(req.body.accept_pre_order) ?JSON.parse(req.body.accept_pre_order) :false;
			let deliveryByCravez=	(req.body.delivery_by_cravez)?	JSON.parse(req.body.delivery_by_cravez)	:false;
			let skip		= 	(req.body.skip)			?	parseInt(req.body.skip)		:0;
			let limit		= 	(req.body.limit)		?	parseInt(req.body.limit)	:0;
			let tmpLimit	=	(res.locals.settings['Site.front_record_limit']) ? parseInt(res.locals.settings['Site.front_record_limit']) :Constants.FRONT_LISTING_LIMIT;
			limit			=	(!limit)  ? tmpLimit :limit;
			let userId		= 	(req.body.user_id) 	? 	new ObjectId(req.body.user_id) 	:"";
			let deviceId	= 	(req.body.device_id)?	req.body.device_id			:"";

			/** Send error response **/
			if(!areaId) return resolve({status:Constants.STATUS_ERROR, message:res.__("system.missing_parameters")});

			const users	= this.db.collection(Tables.USERS);
			asyncParallel({
				restaurant_list : (callback)=>{
					/** Set restaurant conditions **/
					let restaurantConditions = { };
					if(restaurantId) restaurantConditions['_id']	=	new ObjectId(restaurantId);
					restaurantConditions['is_deleted']	=	Constants.NOT_DELETED;
					restaurantConditions['status']		=	Constants.ACTIVE;

					/** Add restaurant name conditions */
					if(restaurantName){
						let searchValue = cleanRegex(restaurantName.trim());
						restaurantConditions["$or"] = [
							{"name.en" : new RegExp(searchValue, "i") },
							{"name.ar" : new RegExp(searchValue, "i") }
						];
					}

					/** Get restaurant list **/
					const restaurants	= this.db.collection(Tables.RESTAURANTS);
					restaurants.find(restaurantConditions,{projection: {image: 1, name: 1, landing_image:1,detail_image:1 }}).toArray().then(restaurantResult=>{
						callback(null,restaurantResult);
					}).catch(next);
				},
				category_restaurant_list : (callback)=>{
					if(categoryTags.constructor != Array)  categoryTags = [categoryTags];
					if(categoryTags.length <= 0) return callback(null,null) ;

					/** Set restaurant conditions **/
					let categoryConditions = { };
					if(restaurantId) categoryConditions['restaurant_id'] = new ObjectId(restaurantId);
					categoryConditions['is_active']	=	Constants.ACTIVE;
					categoryConditions['$or']		=	[];

					/** Add category tags conditions */
					categoryTags.map(tags=>{
						let searchTags = cleanRegex(tags);

						categoryConditions["$or"].push({
							tags : {$in : new RegExp(searchTags, "i")}
						});
					});

					/** Get restaurant list **/
					const restaurant_categories	= this.db.collection(Tables.RESTAURANT_CATEGORIES);
					restaurant_categories.distinct( "restaurant_id", categoryConditions).then(catResult=>{
						callback(null, catResult);
					}).catch(next);
				},
				cuisine_restaurant_list : (callback)=>{
					if(cuisineId.constructor != Array)  cuisineId = [cuisineId];
					if(cuisineId.length <= 0) return callback(null,null);

					/** Convert into object id */
					cuisineId = arrayToObject(cuisineId);

					/** Set cuisine conditions **/
					let cuisineConditions = { };
					if(restaurantId) cuisineConditions['restaurant_id'] = new ObjectId(restaurantId);
					cuisineConditions['cuisine_id']	=	{$in : cuisineId};

					/** Get branch list **/
					const restaurant_cuisines	= this.db.collection(Tables.RESTAURANT_CUISINES);
					restaurant_cuisines.distinct("restaurant_id", cuisineConditions).then(cuisineResult=>{
						callback(null, cuisineResult);
					}).catch(next);
				},
				delivery_methods_list : (callback)=>{
					/** Get delivery method list **/
					const delivery_methods	= this.db.collection(Tables.DELIVERY_METHODS);
					delivery_methods.find({},{projection: {slug: 1, title: 1 }}).toArray().then(methodResult=>{

						let methodList = {};
						methodResult.map(records=>{
							methodList[records.slug] = records.title;
						});
						callback(null, methodList);
					}).catch(next);
				},
				payonline_branch_list : (callback)=>{
					if(!payOnline) return callback(null,null);

					let onlineConditions = { };
					if(restaurantId) onlineConditions['restaurant_id'] = new ObjectId(restaurantId);
					onlineConditions["$or"] = [
						{payment_methods : {$nin : [Constants.CASH_PAYMENT] }},
						{
							payment_methods : {$in : [Constants.CASH_PAYMENT] },
							$where: "async payment_methods.length > 1"
						},
					];

					/** Get branch list **/
					const restaurant_branch_payment_methods	= this.db.collection(Tables.RESTAURANT_BRANCH_PAYMENT_METHODS);
					restaurant_branch_payment_methods.distinct("branch_id", onlineConditions).then(branchResult=>{
						callback(null, branchResult);
					}).catch(next);
				},
				user_details : (callback)=>{
					if(!userId) return callback(null,null);

					/** Set customer conditions **/
					let userConditions = {...{_id:new ObjectId(userId)}, ...Constants.CUSTOMER_COMMON_CONDITIONS};

					/** Get user details **/
					users.findOne(userConditions,{projection:{_id: 1, package_id: 1, corporate_id: 1}}).then(userResult=>{
						callback(null,userResult);
					}).catch(next);
				},
				new_user_count : (callback)=>{
					if(!userId) return callback(null,null);

					/** Set user conditions */
					let userConditions = {...{
						_id		:	new ObjectId(userId),
						is_guest:	{$exists: false},
						created	:	{$gte: newDate(subtractDate(Constants.NEW_USER_DAYS*Constants.HOURS_IN_A_DAY))},
					}, ...Constants.CUSTOMER_COMMON_CONDITIONS};

					/** Check user type **/
					users.countDocuments(userConditions).then(userResult => {
						callback(null,userResult);
					}).catch(next);
				},
			},(asyncErr, asyncResponse)=>{
				if(asyncErr) return next(asyncErr);
				let weatherMessage 				= (res.locals.settings["App.weather_message"]) ? res.locals.settings["App.weather_message"] : "";
				let weatherMessageInArabic 		= (res.locals.settings["App.weather_message_in_arabic"]) ? res.locals.settings["App.weather_message_in_arabic"] : "";
				let unlimitedDeliveriesMessage 	= (res.locals.settings["App.unlimited_free_deliveries"]) ? res.locals.settings["App.unlimited_free_deliveries"] : "";
				let unlimitedDeliveriesMessageInArabic 	= (res.locals.settings["App.unlimited_free_deliveries_in_arabic"]) ? res.locals.settings["App.unlimited_free_deliveries_in_arabic"] : "";
				let userDetails = 	(asyncResponse.user_details) ? asyncResponse.user_details :{};
				let newUserCount=	asyncResponse.new_user_count;
				let corporateId	=  	(userDetails.corporate_id) ? userDetails.corporate_id:"";
				let userType 	=	(deviceId && !userId) ? Constants.APPLICABLE_FOR_GUEST :((newUserCount >0) ?  Constants.APPLICABLE_FOR_NEW_USERS : Constants.APPLICABLE_FOR_REGISTERED_MEMBER);

				/** Set success response */
				let successResponse = {
					status	: 	Constants.STATUS_SUCCESS,
					result	:	[],
					restaurant_image_url	:	Constants.RESTAURANT_FILE_URL,
					cuisinePrioritiesList 	: 	[],
					voc_order_id 			: 	asyncResponse.voc_order_id,
					weather_message :{
						en: weatherMessage,
						ar: weatherMessageInArabic,
					},
					unlimited_free_deliveries_message :{
						en: unlimitedDeliveriesMessage,
						ar: unlimitedDeliveriesMessageInArabic,
					},
					is_user_deleted : (userId && !userDetails._id)? true	:false,
					infinity_service: (userDetails.package_id) 	?	true 	:false,
				};

				/** Send success response */
				if(asyncResponse.restaurant_list.length <=0) return resolve(successResponse);

				let restaurantList 			=	asyncResponse.restaurant_list;
				let cuisineRestaurantList 	=	asyncResponse.cuisine_restaurant_list;
				let categoryRestaurantIds 	=	asyncResponse.category_restaurant_list;
				let deliveryMethodList 		=	asyncResponse.delivery_methods_list;
				let payonlineBranchList 	=	asyncResponse.payonline_branch_list;
				let restaurantIds			=	[];
				let restaurantDetailsList	=	{};

				/** Get restaurant id list  */
				restaurantList.map(records=>{
					restaurantIds.push(records._id);
					restaurantDetailsList[records._id] =  records;
				});

				/** Set branch conditions **/
				let branchConditions = {
					restaurant_id	:	{$in : restaurantIds},
					is_active		:	Constants.ACTIVE,
				};

				/** Add category wise restaurant id **/
				if(categoryRestaurantIds){
					branchConditions["$and"] = [{
						restaurant_id : {$in: categoryRestaurantIds}
					}];
				}

				/** Add cuisine wise restaurant id **/
				if(cuisineRestaurantList){
					if(!branchConditions["$and"]) branchConditions["$and"] = [];
					branchConditions["$and"].push({
						restaurant_id : {$in: cuisineRestaurantList}
					});
				}

				/** Add payonline branch id conditions **/
				if(payOnline){
					if(!branchConditions["$and"]) branchConditions["$and"] = [];
					branchConditions["$and"].push({
						_id : {$in: payonlineBranchList}
					});
				}

				/** Add sort conditions */
				let currentHours 	= 	parseFloat(newDate("",Constants.AREA_PROFILE_TIME_FORMAT));
				let sortConditions 	= 	{is_open: Constants.SORT_DESC};
				let sortingProfile 	=	(currentHours < Constants.MORNING_PROFILE_MAX_TIME) ? "morning_profile" : "evening_profile";
				sortConditions[sortingProfile] 	= Constants.SORT_ASC;
				sortConditions["rating"] 		= Constants.SORT_DESC;

				if(sortBy == "rating")  	sortConditions  = {is_open: Constants.SORT_DESC, rating: Constants.SORT_DESC};
				if(sortBy == "feature") 	sortConditions  = {is_open: Constants.SORT_DESC,is_feature: Constants.SORT_DESC};
				if(sortBy == "delivery_time")sortConditions = {is_open: Constants.SORT_DESC,delivery_time: Constants.SORT_ASC};
				if(sortBy == "delivery_fees") sortConditions={is_open: Constants.SORT_DESC,delivery_fees: Constants.SORT_ASC};
				if(sortBy == "minimum_order_limit"){
					sortConditions = {is_open: Constants.SORT_DESC, minimum_order_limit: Constants.SORT_ASC};
				}

				let aggregatePipLine = [];
				if(sortBy == "nearest" && latitude && longitude){
					sortConditions.distance = Constants.SORT_ASC;

					aggregatePipLine.push({$geoNear : {
						near	: {
							type			: 	"Point",
							coordinates		:	[ longitude , latitude ]
						},
						distanceMultiplier	: 	1 / Constants.ONE_MILE_IN_METER,	//  return distance in miles
						distanceField		: 	"distance",				//  return  total distance
						spherical			: 	true,					//	Required if using a 2dsphere index. use to check coordinate in circle
						query				: 	branchConditions,
					}});
				}

				/** Add area wise conditions */
				let areaWiseConditions = {};
				if(acceptPickup) 	 areaWiseConditions.accept_pickup_orders 	= Constants.ACCEPT;
				if(acceptPreOrder) 	 areaWiseConditions.accept_scheduling_orders= Constants.ACCEPT;
				if(hasOffer) 		areaWiseConditions.has_offers 				= Constants.ACTIVE;
				if(deliveryByCravez) areaWiseConditions.delivery_by_cravez 		= true;
				if(branchOpen) 		areaWiseConditions.is_open 					= Constants.OPEN;

				/** Change sort conditions after search term */
				if(restaurantName || categoryTags.length >0){
					sortConditions 	= {is_open: Constants.SORT_DESC};
					sortConditions[sortingProfile]	= Constants.SORT_ASC;
					sortConditions["rating"] 		= Constants.SORT_DESC;
				}

				aggregatePipLine.push(
					{$match: branchConditions},
					{$lookup:	{
						from     : Tables.RESTAURANT_BRANCH_AREAS,
						let      : {restaurantId : "$restaurant_id", branchId : "$_id"},
						pipeline : [
							{$match : {
								$expr: {
									$and : [
										{$eq: ["$restaurant_id", "$$restaurantId"]},
										{$eq: ["$branch_id", "$$branchId"]},
										{$eq: ["$area_id",new ObjectId(areaId)]},
									]
								}
							}},
							{$project : {
								delivery_fees: 1, delivery_time: 1, open: 1, delivery_by: 1, trends : 1, area_id: 1,morning_profile : 1,evening_profile: 1, accept_pickup_orders: 1, accept_scheduling_orders: 1, minimum_order_limit:1, has_offers: 1, preparation_time: 1,
							}},
						],
						as	:	"area_details"
					}},
					{$match : {
						"area_details.area_id" : new ObjectId(areaId)
					}},
					{$addFields :{
						area_id				: 	{$arrayElemAt: ["$area_details.area_id",0]},
						trends				: 	{$arrayElemAt: ["$area_details.trends",0]},
						morning_profile		: 	{$arrayElemAt: ["$area_details.morning_profile",0]},
						evening_profile		: 	{$arrayElemAt: ["$area_details.evening_profile",0]},
						has_offers			: 	{$arrayElemAt: ["$area_details.has_offers",0]},
						delivery_by			: 	{$arrayElemAt: ["$area_details.delivery_by",0]},
						delivery_time		: 	{$arrayElemAt: ["$area_details.delivery_time",0]},
						preparation_time	: 	{$arrayElemAt: ["$area_details.preparation_time",0]},
						delivery_fees		: 	{$arrayElemAt: ["$area_details.delivery_fees",0]},
						accept_pickup_orders: 	{$arrayElemAt: ["$area_details.accept_pickup_orders",0]},
						minimum_order_limit	: 	{$arrayElemAt: ["$area_details.minimum_order_limit",0]},
						accept_scheduling_orders:{$arrayElemAt: ["$area_details.accept_scheduling_orders",0]},
						delivery_by_cravez	: 	{$cond: [
													{$and: [
														{$eq: [{$arrayElemAt: ["$area_details.delivery_by",0]}, Constants.DELIVERY_BY_CRAVEZ] },
													]},
													true, false
												]},
						delivery_by_restaurant:	{$cond: [
													{$and: [
														{$eq: [{$arrayElemAt: ["$area_details.delivery_by",0]}, Constants.DELIVERY_BY_RESTAURANT] },
													]},
													true, false
												]},
						is_open : {$cond: [
							{$and: [
								{$eq: [{$arrayElemAt: ["$area_details.open",0]}, Constants.OPEN ] },
							]},
							{$cond: [
								{$and: [
									{$eq: ["$branch_status", Constants.OPEN] },
								]},
								{$cond: [
									{$and: [
										{$eq: ["$is_open", Constants.OPEN] },
									]},
									Constants.OPEN, Constants.CLOSE
								]}, Constants.CLOSE,
							]}, Constants.CLOSE
						]}
					}},
					{$match : areaWiseConditions},
					{$sort  : sortConditions},
					{$group : {
						_id 			: 	"$restaurant_id",
						branch_id		:	{$first: "$_id"},
						rating			:	{$first: "$rating"},
						area_id			:	{$first: "$area_id"},
						restaurant_id	:	{$first: "$restaurant_id"},
						address			:	{$first: "$address"},
						name			:	{$first: "$name"},
						is_feature		:	{$first: "$is_feature"},
						minimum_order_limit:{$first: "$minimum_order_limit"},
						trends			:	{$first: "$trends"},
						has_offers		:	{$first: "$has_offers"},
						delivery_by		:	{$first: "$delivery_by"},
						delivery_time	:	{$first: "$delivery_time"},
						preparation_time:	{$first: "$preparation_time"},
						delivery_fees	:	{$first: "$delivery_fees"},
						slogan_in_english:	{$first: "$slogan_in_english"},
						slogan_in_arabic:	{$first: "$slogan_in_arabic"},
						is_open			:	{$first: "$is_open"},
						morning_profile	:	{$first: "$morning_profile"},
						evening_profile	:	{$first: "$evening_profile"},
						accept_pickup_orders	:	{$first: "$accept_pickup_orders"},
						accept_scheduling_orders:	{$first: "$accept_scheduling_orders"},
						delivery_by_cravez		:	{$first: "$delivery_by_cravez"},
						branch_status			:	{$first: "$branch_status"},
						close_time				:	{$first: "$close_time"},
					}},
				);

				const restaurant_branches = this.db.collection(Tables.RESTAURANT_BRANCHES);
				asyncParallel({
					branch_list : (parallelCallback)=>{
						/** Manage aggregate pipline */
						let findAggregatePipLine = clone(aggregatePipLine);
						findAggregatePipLine.push(
							{$sort  : sortConditions},
							{$skip 	: skip},
							{$limit : limit},
						);
						/** Get restaurant branch list **/
						restaurant_branches.aggregate(findAggregatePipLine).toArray().then(branchResult=>{
							parallelCallback(null,branchResult);
						}).catch(next);
					},
					branch_count : (parallelCallback)=>{
						/** Manage aggregate pipline */
						let countAggregatePipLine = clone(aggregatePipLine);
						countAggregatePipLine.push({$count : "count"});

						/** Get restaurant branch count **/
						restaurant_branches.aggregate(countAggregatePipLine).toArray().then(branchCount=>{
							branchCount  = (branchCount && branchCount[0]) ? branchCount[0].count :0;
							parallelCallback(null,branchCount);
						}).catch(next);
					},
				},(parentParallelErr, parentParallelResponse)=>{
					if(parentParallelErr)  return next(parentParallelErr);

					let branchResult	= 	parentParallelResponse.branch_list;
					let branchCount  	=	parentParallelResponse.branch_count;

					successResponse.result 			 		=	branchResult;
					successResponse.total_restaurant 		= 	branchCount;
					successResponse.cuisinePrioritiesList 	=	[];

					/** Send success response */
					if(branchResult.length <=0) return resolve(successResponse);

					let branchIds = [];
					/** Add additional details **/
					branchResult.map(records=>{
						records.branch_offer_count = 0;

						branchIds.push(records.branch_id);
						/** Add restaurant details  **/
						if(restaurantDetailsList[records.restaurant_id]){
							records.restaurant_name  =	restaurantDetailsList[records.restaurant_id].name;
							records.restaurant_image = 	restaurantDetailsList[records.restaurant_id].image;
							records.image = 	restaurantDetailsList[records.restaurant_id].image;
							records.grid_image= restaurantDetailsList[records.restaurant_id].landing_image;
							records.detail_image=restaurantDetailsList[records.restaurant_id].detail_image;
						}
						if(records.delivery_by && deliveryMethodList[records.delivery_by]) records.delivery_by = deliveryMethodList[records.delivery_by];
					});

					/** Convert into object id */
					branchIds = arrayToObject(branchIds);

					asyncParallel({
						payment_method_list: (parallelCallback)=>{
							/** Get branch selected payment method list */
							const restaurant_branch_payment_methods = this.db.collection(Tables.RESTAURANT_BRANCH_PAYMENT_METHODS);
							restaurant_branch_payment_methods.aggregate([
								{$match: {
									branch_id: 	{ $in: branchIds },
								}},
								{$addFields:{
									payment_methods : {$ifNull: [ "$payment_methods", [] ] }
								}},
								{$lookup: {
									from: Tables.PAYMENT_METHODS,
									let: {methods: '$payment_methods' },
									pipeline: [
										{$match: {
											$expr: {
												$in: ['$slug', '$$methods']
											}
										}},
										{$project: { _id :0, slug : 1,title : 1}}
									],
									as:'payment_methods'
								}},
								{$project : {
									payment_methods : 1
								}}
							]).toArray().then(paymentResult=>{
								parallelCallback(null, paymentResult);
							}).catch(next);
						},
						phone_number_list: (parallelCallback)=>{
							/** Get branch selected phone numbers list */
							const restaurant_branch_phone_numbers = this.db.collection(Tables.RESTAURANT_BRANCH_PHONE_NUMBERS);
							restaurant_branch_phone_numbers.find({branch_id: { $in : branchIds },attribute_id : {$in: [Constants.BRANCH_MANAGER_ATTRIBUTE_ID,Constants.BRANCH_HOT_LINE_NUMBER_ATTRIBUTE_ID]}},{projection : {value : 1,attribute_id:1,branch_id:1}}).toArray().then(phoneResult=>{
								parallelCallback(null, phoneResult);
							}).catch(next);
						},
						cuisine_priorities_list : (parallelCallback)=>{
							/** Get cuisine priorities list **/
							const restaurant_branch_cuisines = this.db.collection(Tables.RESTAURANT_BRANCH_CUISINES);
							restaurant_branch_cuisines.aggregate([
								{ $match : { branch_id	: 	{$in : branchIds}}},
								{ $sort	 : { order	 	:	Constants.SORT_ASC }},
								{$lookup : {
									from			: Tables.CUISINES,
									localField		: "cuisine_id",
									foreignField	: "_id",
									as				: "cuisines",
								}},
								{$group: {
									"_id" : "$branch_id",
									"data":	{$push: {
										_id				:	"$_id",
										cuisine_id 		: 	"$cuisine_id",
										cuisine_name 	:	{$arrayElemAt: ["$cuisines.name", 0] },
									}}
								}},
								{$addFields :{
									"data": { "$slice": [ "$data", Constants.CUISINE_PRIORITIES_LIMIT ]},
								}}
							]).toArray().then(cuisineResult=>{
								parallelCallback(null, cuisineResult);
							}).catch(next);
						},
						attributes_details: (parallelCallback)=>{
							/** Check branch attributes details */
							const restaurant_branch_attributes = this.db.collection(Tables.RESTAURANT_BRANCH_ATTRIBUTES);
							restaurant_branch_attributes.find({
								branch_id		: {$in: branchIds},
								attribute_id	: {$in: [
									Constants.BRANCH_OFFERS_DOUBLE_CASHBACK_ATTRIBUTE_ID,
									Constants.BRANCH_OFFERS_CASHBACK_ATTRIBUTE_ID,
								]},
							},{projection: {attribute_id:1, value: 1,branch_id:1}}).toArray().then(attributeResult=>{

								let attributeList =  {};
								attributeResult.map(records=>{
									if(!attributeList[records.branch_id]){
										attributeList[records.branch_id] = {};
									}

									attributeList[records.branch_id][records.attribute_id] = records.value;
								});
								parallelCallback(null,attributeList);
							}).catch(next);
						},
						branch_offer: (parallelCallback)=>{
							if(!userId && !deviceId) return parallelCallback(null);

							let offerFromDate = newDate(newDate("",Constants.CURRENTDATE_START_DATE_FORMAT));
							let offerToDate   = newDate(newDate("",Constants.CURRENTDATE_END_DATE_FORMAT));

							/** Set lookup conditions */
							let lookupConditions = {
								$and : [
									{$eq: ["$offer_id", "$$offerId"]},
								]
							};

							if(userId){
								lookupConditions["$and"].push({$eq: ["$user_id", userId ]});
							}else{
								lookupConditions["$and"].push({$eq: ["$device_id", deviceId ]});
							}

							const offers = this.db.collection(Tables.OFFERS);
							asyncEach(branchResult, (records, eachCallback)=> {
								let tmpBranchId 	= 	records.branch_id;
								let tmpRestaurantId =	records.restaurant_id;

								/** Add offer conditions */
								let offerConditions = {
									display_offer	:  	true,
									is_active		:	Constants.ACTIVE,
									status			:	Constants.OFFER_PUBLISHED,
									$and			:	[
										{$or : [
											{"applicable_for.0" : {$exists: false}},
											{applicable_for	   : {$in: [userType]}}
										]},
										{$or : [
											{"restaurant_ids.0" : {$exists: false}},
											{restaurant_ids	 	: {$in: [tmpRestaurantId]}}
										]},
										{$or : [
											{"branch_ids.0" : {$exists: false}},
											{branch_ids	 	: {$in: [tmpBranchId]}}
										]},
										{$or : [
											{$and : [
												{ valid_from : {$gte : newDate(offerFromDate)} },
												{ valid_to   : {$lte : newDate(offerToDate)} }
											]},
											{$and : [
												{ valid_to 	 : {$gte : newDate(offerFromDate)} },
												{ valid_from : {$lte : newDate(offerToDate)} }
											]}
										]}
									]
								};

								if(userId){
									offerConditions["$and"].push({$or: [
										{"user_ids.0": {$exists: false}},
										{user_ids	 : {$in: [userId]} }
									]});
								}

								if(corporateId){
									offerConditions["$and"].push({$or: [
										{"corporate_ids.0" : {$exists: false}},
										{corporate_ids	   : {$in: [corporateId]}}
									]});
								}else{
									offerConditions.offer_type = {$ne: Constants.CORPORATE_OFFER};
								}

								/** Get branch offer count */
								offers.aggregate([
									{$match : offerConditions},
									{$lookup:	{
										from     : Tables.OFFER_LOGS,
										let      : {offerId : "$_id"},
										pipeline : [
											{$match : {
												$expr: lookupConditions
											}},
											{$project : {_id: 1}},
										],
										as:	"offer_unique_redeem_details"
									}},
									{$lookup : {
										from 		 : Tables.OFFER_LOGS,
										localField 	 : "_id",
										foreignField : "offer_id",
										as 			 : "offer_redeem_details"
									}},
									{$addFields :{
										unique_redeem_count : {$size: "$offer_unique_redeem_details"},
										total_redeem_count  : {$size: "$offer_redeem_details"},
									}},
									{$match : {
										$expr: {
											$and : [
												{$or:[
													{$eq: ["$total_unique_redeem", ""]},
													{$gt: ["$total_unique_redeem","$unique_redeem_count"]},
												]},
												{$or:[
													{$eq: ["$total_redeem", ""]},
													{$gt: ["$total_redeem", "$total_redeem_count"]},
												]},
											]
										}
									}},
									{$count: "count"}
								]).toArray().then(offerResult=>{
									let tmpOfferCount = (offerResult && offerResult[0]) ? offerResult[0].count :0;

									/** Add branch offer count  */
									records.branch_offer_count = tmpOfferCount;

									eachCallback(null);
								}).catch(next);
							},()=> {
								parallelCallback(null);
							});
						},
					},(asyncParallelErr, asyncParallelResponse)=>{
						if(asyncParallelErr) return next(asyncParallelErr);

						let cuisinePrioritiesList 	= 	(asyncParallelResponse.cuisine_priorities_list) ? asyncParallelResponse.cuisine_priorities_list : [];
						let branchAttributesList 	= 	(asyncParallelResponse.attributes_details) ? asyncParallelResponse.attributes_details :{};
						let paymentMethodList   	=	asyncParallelResponse.payment_method_list;
						let phoneNumberList   		=	asyncParallelResponse.phone_number_list;

						/** Add additional details **/
						branchResult.map(branchData=>{
							/** Add additional details **/
							if(cuisinePrioritiesList.length >0){
								cuisinePrioritiesList.map(cuisineData=>{
									if(String(branchData.branch_id) == String(cuisineData._id)){
										branchData.cuisine_priorities = cuisineData.data;
									}
								});
							}
							/** Add payment details **/
							if(paymentMethodList.length >0){
								paymentMethodList.map(payment=>{
									if(String(branchData.branch_id) == String(payment._id)){
										branchData.payment_methods = payment.payment_methods;
									}
								});
							}
							/** Add phone number details **/
							if(phoneNumberList.length >0){
								phoneNumberList.map(phone=>{
									if(!branchData.phones) branchData.phones = {};
									if(String(branchData.branch_id) == String(phone.branch_id)){
										if(!branchData.phones[phone.attribute_id]) branchData.phones[phone.attribute_id] ="";
										if(branchData.phones[phone.attribute_id]) branchData.phones[phone.attribute_id] +=", ";
										branchData.phones[phone.attribute_id]	+=	phone.value;
									}
								});
							}

							/** Add attributes details **/
							let isCashback 			= 	0;
							let isDoubleCashback 	=	0;
							if(branchAttributesList[branchData.branch_id]){
								if(branchAttributesList[branchData.branch_id][Constants.BRANCH_OFFERS_DOUBLE_CASHBACK_ATTRIBUTE_ID]){
									isDoubleCashback = parseInt(branchAttributesList[branchData.branch_id][Constants.BRANCH_OFFERS_DOUBLE_CASHBACK_ATTRIBUTE_ID]);
								}
								if(branchAttributesList[branchData.branch_id][Constants.BRANCH_OFFERS_CASHBACK_ATTRIBUTE_ID]){
									isCashback =  parseInt(branchAttributesList[branchData.branch_id][Constants.BRANCH_OFFERS_CASHBACK_ATTRIBUTE_ID]);
								}
							}
							branchData.is_cashback 			=	 isCashback;
							branchData.is_double_cashback 	=	 isDoubleCashback
						});

						/** Send success response **/
						successResponse.result 					= 	branchResult;
						successResponse.cuisinePrioritiesList 	=	cuisinePrioritiesList;
						resolve(successResponse);
					});
				});
			});
		}).catch(next);
	};// end getRestaurantList()

	/**
	 * Function to get category list
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	**/
	async getCategoryListWithItem (req,res,next){
		return new Promise(resolve=>{
			/** Sanitize Data **/
            req.body 		=	sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
            let deliveryBy	=	(req.body.delivery_by) 	? 	req.body.delivery_by 		 	 :"";
            let areaId		=	(req.body.area_id) 		? 	new ObjectId(req.body.area_id) 		 :"";
            let branchId	=	(req.body.branch_id) 	? 	new ObjectId(req.body.branch_id) 	 :"";
            let restaurantId= 	(req.body.restaurant_id)?	new ObjectId(req.body.restaurant_id) :"";
			let userId		= 	(req.body.user_id) 		?	new ObjectId(req.body.user_id) 		 :"";
			let deviceId	= (req.body.device_id) 		? req.body.device_id 		 		 :"";
			let openingTime = 	(res.locals.settings["App.opening_time"]) ? res.locals.settings["App.opening_time"] : "";
			let closingTime = 	(res.locals.settings["App.closing_time"]) ? res.locals.settings["App.closing_time"] : "";

			/** Send error response **/
			if(!restaurantId || !branchId) return resolve({status: Constants.STATUS_ERROR, message: res.__("system.missing_parameters")});

			let currentTime =	parseFloat(newDate("",Constants.TIME_FORMAT));
			let currentDay 	=	parseInt(newDate("","d"));
			const item_linkings	= this.db.collection(Tables.ITEM_LINKINGS);
			const items			= this.db.collection(Tables.ITEMS);
			const users			= this.db.collection(Tables.USERS);
			asyncParallel({
				restaurant_details : (callback)=>{
					/** Set restaurant conditions **/
					let restaurantConditions = {
						_id			:	restaurantId,
						is_deleted	:	Constants.NOT_DELETED,
						status		:	Constants.ACTIVE,
					};

					/** Get restaurant details **/
					const restaurants	= this.db.collection(Tables.RESTAURANTS);
					restaurants.findOne(restaurantConditions,{projection: {image: 1, name: 1, landing_image:1,detail_image:1 }}).then(restaurantResult=>{
						callback(null,restaurantResult);
					}).catch(next);
				},
				area_details : (callback)=>{
					if(deliveryBy != Constants.DELIVERY_BY_CRAVEZ) return callback(null,null);
					/** Set area conditions **/
					let areaConditions = {
						// open			:	Constants.OPEN,
						restaurant_id	:	restaurantId,
						branch_id		:	branchId,
						area_id			:	areaId,
					};

					/** Get branch area details **/
					const restaurant_branch_areas	= this.db.collection(Tables.RESTAURANT_BRANCH_AREAS);
					restaurant_branch_areas.findOne(areaConditions,{projection: {_id:0,minimum_order_limit: 1, has_offers: 1, delivery_by: 1, delivery_time: 1, delivery_fees: 1, accept_pickup_orders: 1, accept_scheduling_orders: 1, preparation_time:1}}).then(areaResult=>{
						callback(null, areaResult);
					}).catch(next);
				},
				linking_item_list : (callback)=>{
					/** Set linking item conditions **/
					let linkItemConditions = {
						// restaurant_id	:	restaurantId,
						$or : [
							{
								type : Constants.ITEM_NOT_LISTED_TO_SELECTED_BRANCH_LIST,
								branch_ids: { $nin: [ branchId] }
							},
							{
								type: Constants.ITEM_LISTED_TO_SELECTED_BRANCH_LIST,
								$or : [
									{branch_ids	: { $size: 0} },
									{branch_ids : { $in: [ branchId ] } }
								]
							}
						]
					};

					/** Get item linking list **/
					item_linkings.find(linkItemConditions,{projection: {customize_attributes: 1, item_id: 1}}).toArray().then(linkingResult=>{
						if(linkingResult.length <=0)  return callback(null,null);

						let itemIdsList 	  = [];
						let customizeItemList = {};
						linkingResult.map(records=>{
							if(records.customize_attributes) customizeItemList[records.item_id] = records.customize_attributes;

							itemIdsList.push(records.item_id);
						});

						callback(null, { customize_item_list: customizeItemList, item_ids: itemIdsList});
					}).catch(next);
				},
				category_list : (callback)=>{
					/** Set category conditions **/
					let categoryConditions = {
						restaurant_id	:	restaurantId,
						is_active		:	Constants.ACTIVE,
					};

					/** Get category list **/
					const restaurant_categories	= this.db.collection(Tables.RESTAURANT_CATEGORIES);
					restaurant_categories.find(categoryConditions,{projection: {_id: 1, name: 1}}).sort({order: Constants.SORT_ASC}).toArray().then(categoryResult=>{
						callback(null,categoryResult);
					}).catch(next);
				},
				availability_item_list : (callback)=>{
					/** Set availability item conditions **/
					let availabilityConditions = {
						$or: [
							{$and : [
								{from_time : {$gte : currentTime }},
								{to_time   : {$lte : currentTime }}
							]},
							{$and : [
								{to_time	: {$gte : currentTime }},
								{from_time 	: {$lte : currentTime }}
							]}
						],
					};

					/** Get availability item list **/
					const item_availability	= this.db.collection(Tables.ITEM_AVAILABILITY);
					item_availability.distinct( "item_id", availabilityConditions).then(availabilityResult=>{
						callback(null,availabilityResult);
					}).catch(next);
				},
				branch_details : (callback)=>{
					/** Set branch conditions **/
					let branchConditions = {
						_id				:	branchId,
						is_active		:	Constants.ACTIVE,
						restaurant_id	:	restaurantId,
					};

					/** Get branch details **/
					const restaurant_branches	= this.db.collection(Tables.RESTAURANT_BRANCHES);
					restaurant_branches.findOne(branchConditions,{projection: {slogan_in_english: 1, slogan_in_arabic: 1, open_time: 1, close_time: 1,address:1,name:1}}).then(branchResult=>{
						callback(null, branchResult);
					}).catch(next);
				},
				favourite_list : (favouriteCallback)=>{
					if(!userId) return favouriteCallback(null, {});

					/** Get favourite item list **/
					const user_favourites	= this.db.collection(Tables.USER_FAVOURITES);
					user_favourites.distinct( "item_id",{user_id:  userId}).then(favouriteResult=>{
						if(favouriteResult.length <= 0) return favouriteCallback(null, {});

						let favouriteList = {};
						favouriteResult.map(tempItemId=>{
							favouriteList[String(tempItemId)] = true;
						});

						favouriteCallback(null, favouriteList);
					}).catch(next);
				},
				cuisine_priorities_list : (callback)=>{
					/** Get cuisine priorities list **/
					const restaurant_branch_cuisines	= this.db.collection(Tables.RESTAURANT_BRANCH_CUISINES);
					restaurant_branch_cuisines.aggregate([
						{$match 	: 	{
							branch_id 		: 	branchId,
							restaurant_id 	:	restaurantId
						}},
						{$sort	 	: 	{order	: Constants.SORT_ASC }},
						{$limit		:	Constants.CUISINE_PRIORITIES_LIMIT},
						{$lookup	: 	{
							from			: Tables.CUISINES,
							localField		: "cuisine_id",
							foreignField	: "_id",
							as				: "cuisines",
						}},
						{$project	: { _id: 1, cuisine_id: 1, cuisine_name: { $arrayElemAt: ["$cuisines.name", 0] }}},
					]).toArray().then(cuisineResult=>{
						callback(null, cuisineResult);
					}).catch(next);
				},
				active_menu_details : (callback)=>{
					/** Get linked branch menu  list **/
					const restaurant_menu_branches	= this.db.collection(Tables.RESTAURANT_MENU_BRANCHES);
					restaurant_menu_branches.distinct( "menu_id", {
						branch_id : branchId
					}).then(linkingMenuIds=>{
						if(linkingMenuIds.length <=0)  return callback(null,{link_menu : false, menu_id: null});

						let menuConditions = {
							_id			 :  {$in: linkingMenuIds},
							restaurant_id:  restaurantId,
							$or : [
								{is_default: true},
								{$and: [
									{$or: [
										{$and : [
											{start_date : {$gte : currentDay }},
											{end_date   : {$lte : currentDay }}
										]},
										{$and : [
											{end_date 	: {$gte : currentDay }},
											{start_date : {$lte : currentDay }}
										]}
									]},
									{$or: [
										{$and : [
											{start_time : {$gte : currentTime }},
											{end_time   : {$lte : currentTime }}
										]},
										{$and : [
											{end_time 	: {$gte : currentTime }},
											{start_time : {$lte : currentTime }}
										]}
									]},
								]}
							]
						};

						/** Get menu details */
						const restaurant_menus	= this.db.collection(Tables.RESTAURANT_MENUS);
						restaurant_menus.findOne(menuConditions,{projection: {_id: 1,start_date: 1}, sort: {start_date: Constants.SORT_ASC}}).then(menuResult=>{
							let branchMenuId = (menuResult) ? menuResult._id : "";
							callback(null,{link_menu : true, menu_id: branchMenuId});
						}).catch(next);
					}).catch(next);
				},
				cart_count : (callback)=>{
					if(!userId && !deviceId) return callback(null,0);

					/** Get cart count */
					this.cartAPI.getCartCount(req,res,next).then(cartResponse=>{
						if(cartResponse.status != Constants.STATUS_SUCCESS) return callback(cartResponse);
						callback(null,cartResponse.count);
					}).catch(next);
				},
				recommended_item_list : (callback)=>{
					/** Get recommended item **/
					const item_recommended = this.db.collection(Tables.ITEM_RECOMMENDED);
					item_recommended.find({},{projection: {recommended: 1}}).toArray().then(recommendedResult=>{
						if(!recommendedResult || recommendedResult.length <= 0)  return callback(null,[]);

						/** Push recommended item id in a array **/
						let recommended = [];
						recommendedResult.map(records=>{
							if(records.recommended){
								records.recommended.map(tmpRecommendedId=>{
									recommended.push(tmpRecommendedId);
								});
							}
						});

						/** Set linking item conditions **/
						let linkItemConditions = {
							item_id: {$in: recommended},
							$or: [
								{
									type : Constants.ITEM_NOT_LISTED_TO_SELECTED_BRANCH_LIST,
									branch_ids: { $nin: [ branchId] }
								},
								{
									type: Constants.ITEM_LISTED_TO_SELECTED_BRANCH_LIST,
									$or : [
										{branch_ids: { $size: 0} },
										{branch_ids: { $in: [ branchId ] } }
									]
								}
							]
						};

						/** Get item ids from item linkings **/
						item_linkings.distinct("item_id", linkItemConditions).then(itemIds=>{
							if(itemIds.length <=0)  return callback(null,[]);

							/** Get item details **/
							items.find({
								_id			:	{$in : itemIds},
								is_active	:	Constants.ACTIVE,
								restaurant_id:	restaurantId,
							},{projection: {_id: 1, name: 1, description: 1, price_on_selection: 1, item_price: 1, image: 1, category_ids: 1}}).toArray().then(itemResult=>{
								callback(null, itemResult);
							}).catch(next);
						}).catch(next);
					}).catch(next);
				},
				upselling_item_list : (callback)=>{
					/** Get upselling item **/
					const item_upsellings = this.db.collection(Tables.ITEM_UPSELLINGS);
					item_upsellings.find({},{projection: {upselling: 1}}).toArray().then(upsellingResult=>{
						if(!upsellingResult || upsellingResult.length <= 0)  return callback(null,[]);

						/** Push upselling item id in a array **/
						let upselling = [];
						upsellingResult.map(records=>{
							if(records.upselling){
								records.upselling.map(tmpUpsellingId=>{
									upselling.push(tmpUpsellingId);
								});
							}
						});

						/** Set linking item conditions **/
						let linkItemConditions = {
							item_id	: {$in : upselling},
							$or : [
								{
									type : Constants.ITEM_NOT_LISTED_TO_SELECTED_BRANCH_LIST,
									branch_ids: { $nin: [ branchId] }
								},
								{
									type: Constants.ITEM_LISTED_TO_SELECTED_BRANCH_LIST,
									$or : [
										{branch_ids	: { $size: 0} },
										{branch_ids : { $in: [ branchId ] } }
									]
								}
							]
						};

						/** Get item ids from item linkings **/
						item_linkings.distinct("item_id",linkItemConditions).then(itemIds=>{
							if(itemIds.length <=0)  return callback(null,[]);

							/** Get item details **/
							items.find({
								_id				:	{$in : itemIds},
								is_active		:	Constants.ACTIVE,
								restaurant_id	:	restaurantId,
							},{projection: {_id: 1, name: 1, description: 1, price_on_selection: 1, item_price: 1, image: 1,category_ids:1}}).toArray().then(itemResult=>{
								callback(null, itemResult);
							}).catch(next);
						}).catch(next);
					}).catch(next);
				},
				attributes_details: (callback)=>{
					/** Check branch attributes details */
					const restaurant_branch_attributes = this.db.collection(Tables.RESTAURANT_BRANCH_ATTRIBUTES);
					restaurant_branch_attributes.find({
						branch_id		: branchId,
						restaurant_id 	: restaurantId,
						attribute_id	: {$in: [
							Constants.BRANCH_OFFERS_DOUBLE_CASHBACK_ATTRIBUTE_ID,
							Constants.BRANCH_OFFERS_CASHBACK_ATTRIBUTE_ID,
						]},
					},{projection: {attribute_id:1, value: 1}}).toArray().then(attributeResult=>{
						let attributeList =  {};
						attributeResult.map(attributeData=>{
							attributeList[attributeData.attribute_id] = attributeData.value;
						});
						callback(null,attributeList);
					}).catch(next);
				},
				payment_method_list: (callback)=>{
					/** Get branch selected payment method list */
					const restaurant_branch_payment_methods = this.db.collection(Tables.RESTAURANT_BRANCH_PAYMENT_METHODS);
					restaurant_branch_payment_methods.aggregate([
						{$match		: {
							branch_id		: 	branchId,
							restaurant_id	:	restaurantId
						}},
						{$addFields:{
							payment_methods : {$ifNull: [ "$payment_methods", [] ] }
						}},
						{$lookup: {
							from: Tables.PAYMENT_METHODS,
							let: {methods: '$payment_methods' },
							pipeline: [
								{$match: {
									$expr: {
										$in: ['$slug', '$$methods']
									}
								}},
								{$project: { _id :0, slug : 1,title : 1}}
							],
							as:'payment_methods'
						}},
						{$project : {
							payment_methods : 1
						}}
					]).toArray().then(result=>{
						let tmpPaymentMethod = (result && result[0]) ? result[0].payment_methods :[];
						callback(null, tmpPaymentMethod);
					}).catch(next);
				},
				new_user_count : (callback)=>{
					if(!userId) return callback(null,null);

					/** Set user conditions */
					let userConditions = {...{
						_id		:	userId,
						is_guest:	{$exists: false},
						created	:	{$gte: newDate(subtractDate(Constants.NEW_USER_DAYS*Constants.HOURS_IN_A_DAY))},
					}, ...Constants.CUSTOMER_COMMON_CONDITIONS};

					/** Check user type **/
					users.findOne(userConditions,{projection:{_id: 1}}).then(userResult=>{
						callback(null,((userResult) ? 1 : 0));
					}).catch(next);
				},
				corporate_details : (callback)=>{
					if(!userId) return callback(null,null);

					/** Set user conditions */
					let userConditions = {...{
						_id			:	userId,
						corporate_id:	{$exists: true},
					}, ...Constants.CUSTOMER_COMMON_CONDITIONS};

					/** Check user corporate **/
					users.findOne(userConditions,{projection:{corporate_id: 1}}).then(userResult=>{
						callback(null,userResult);
					}).catch(next);
				},
				phone_number_list: (parallelCallback)=>{
					/** Get branch selected phone numbers list */
					const restaurant_branch_phone_numbers = this.db.collection(Tables.RESTAURANT_BRANCH_PHONE_NUMBERS);
					restaurant_branch_phone_numbers.find({branch_id	: branchId,restaurant_id:restaurantId,attribute_id : {$in  : [Constants.BRANCH_MANAGER_ATTRIBUTE_ID,Constants.BRANCH_HOT_LINE_NUMBER_ATTRIBUTE_ID]}},{projection : {value : 1,attribute_id:1,branch_id:1}}).toArray().then(phoneResult=>{
						parallelCallback(null, phoneResult);
					}).catch(next);
				},
			},(asyncErr, asyncResponse)=>{
				if(asyncErr) return next(asyncErr);

				/** Send error response */
				if(!asyncResponse.restaurant_details  ||  !asyncResponse.branch_details){
					return resolve({status: Constants.STATUS_ERROR, message: res.__("system.invalid_access") });
				}

				let favouriteList 		= 	asyncResponse.favourite_list;
				let branchDetails 		= 	asyncResponse.branch_details;
				let areaDetails 		= 	(asyncResponse.area_details) ? asyncResponse.area_details : {};
				let restaurantDetails 	=	asyncResponse.restaurant_details;
				let availabilityItemIds	=	asyncResponse.availability_item_list;
				let categoryList 		=	asyncResponse.category_list;
				let cuisinePrioritiesList=	asyncResponse.cuisine_priorities_list;
				let activeMenuDetails 	=	asyncResponse.active_menu_details;
				let activeMenuId		=	activeMenuDetails.menu_id;
				let isBranchLinkMenu	=	activeMenuDetails.link_menu;
				let cartCount 			=	asyncResponse.cart_count;
				let recommendedItemList =	asyncResponse.recommended_item_list;
				let upsellingItemList   =	asyncResponse.upselling_item_list;
				let paymentMethodList   =	asyncResponse.payment_method_list;
				let phoneNumberList   	=	asyncResponse.phone_number_list;
				let branchAttributesDetails=asyncResponse.attributes_details;
				let corporateDetails=(asyncResponse.corporate_details)? asyncResponse.corporate_details:{};
				let corporateId		=  	(corporateDetails.corporate_id) ?corporateDetails.corporate_id :"";
				let newUserCount	=	asyncResponse.new_user_count;
				let userType 		=	(deviceId && !userId) ? Constants.APPLICABLE_FOR_GUEST :((newUserCount >0) ?  Constants.APPLICABLE_FOR_NEW_USERS : Constants.APPLICABLE_FOR_REGISTERED_MEMBER);

				/** Add cuisine priorities details in branch details **/
				branchDetails.cuisine_priorities 	= 	cuisinePrioritiesList;
				branchDetails.payment_methods 		=	paymentMethodList;
				branchDetails						=	Object.assign(branchDetails, areaDetails, {restaurant_name: restaurantDetails.name, image: restaurantDetails.image });

				/** Add phone number details **/
				let phoneNumbers		=	{};
				if(phoneNumberList.length >0){
					phoneNumberList.map(phone=>{
						if(String(branchId) == String(phone.branch_id)){
							if(!phoneNumbers[phone.attribute_id]) phoneNumbers[phone.attribute_id] ="";
							if(phoneNumbers[phone.attribute_id]) phoneNumbers[phone.attribute_id] +=", ";
							phoneNumbers[phone.attribute_id]	+=	phone.value;
						}
					});
				}
				branchDetails.phones =	phoneNumbers;

				/** Add branch area attribute */
				let tmpDeliveryBy							=	areaDetails.delivery_by;
				restaurantDetails.has_offers 				=	areaDetails.has_offers;
				restaurantDetails.delivery_by 				=	tmpDeliveryBy;
				restaurantDetails.delivery_time 			=	areaDetails.delivery_time;
				restaurantDetails.preparation_time 			=	areaDetails.preparation_time;
				restaurantDetails.delivery_fees 			=	areaDetails.delivery_fees;
				restaurantDetails.minimum_order_limit 		=  	areaDetails.minimum_order_limit;
				restaurantDetails.accept_pickup_orders 		=	areaDetails.accept_pickup_orders;
				restaurantDetails.accept_scheduling_orders 	=	areaDetails.accept_scheduling_orders;
				restaurantDetails.delivery_by_cravez = (tmpDeliveryBy == Constants.DELIVERY_BY_CRAVEZ) ? true :false;

				let isCashback 			= 	0;
				let isDoubleCashback 	=	0;
				if(branchAttributesDetails){
					if(branchAttributesDetails[Constants.BRANCH_OFFERS_DOUBLE_CASHBACK_ATTRIBUTE_ID]){
						isDoubleCashback = parseInt(branchAttributesDetails[Constants.BRANCH_OFFERS_DOUBLE_CASHBACK_ATTRIBUTE_ID]);
					}
					if(branchAttributesDetails[Constants.BRANCH_OFFERS_CASHBACK_ATTRIBUTE_ID]){
						isCashback =  parseInt(branchAttributesDetails[Constants.BRANCH_OFFERS_CASHBACK_ATTRIBUTE_ID]);
					}
				}
				restaurantDetails.is_cashback 			=	isCashback;
				restaurantDetails.is_double_cashback	=	isDoubleCashback
				restaurantDetails.branch_offer_count  	=	0;

				/** Add landing image */
				// restaurantDetails.image =  (restaurantDetails && restaurantDetails.landing_image) ? restaurantDetails.landing_image : restaurantDetails.image;

				/** Send success response */
				if(!asyncResponse.linking_item_list || !categoryList || categoryList.length <=0){
					return resolve({
						status 				:	Constants.STATUS_SUCCESS,
						result 				: 	[],
						restaurant_details 	: 	restaurantDetails,
						restaurant_image_url:	Constants.RESTAURANT_FILE_URL,
						open_time			: 	openingTime,
						close_time			: 	closingTime,
						cart_count          :   cartCount,
						recommended_items   :   recommendedItemList,
						upselling_items 	:   upsellingItemList
					});
				}

				let customizeItemList	=	asyncResponse.linking_item_list.customize_item_list;
				let itemIds				=	asyncResponse.linking_item_list.item_ids;

				/** Set item conditions **/
				let itemConditions = {
					restaurant_id:	restaurantId,
					$and :[
						{ _id	:	{$in : itemIds} },
						{ _id	:	{$in : availabilityItemIds} }
					],
					// menu_active		:	true,
					is_active		:	Constants.ACTIVE,
					non_sellable	:	{$ne : Constants.NON_SELLABLE},
					"category_ids.0": 	{$exists: true}
				};

				if(isBranchLinkMenu){
					itemConditions["$or"] = [
						{"menu_ids.0": {$exists: false}},
						{"menu_ids": {$in: [activeMenuId]}}
					];
				}else{
					itemConditions["menu_ids"] = activeMenuId;
				}

				asyncParallel({
					item_list : (parallelCallback)=>{
						/** Get item list */
						const items = this.db.collection(Tables.ITEMS);
						items.find(itemConditions,{projection: {
							_id: 1, name: 1, description: 1, price_on_selection: 1, category_ids: 1, item_price:1, image: 1, discount_percentage: 1, discount_value: 1,grid_image:1,detail_image:1, aghzeya_item_id: 1
						}}).sort({order: Constants.SORT_ASC}).toArray().then(itemResult=>{
							parallelCallback(null, itemResult);
						}).catch(next);
					},
				},(asyncChildErr, asyncChildResponse)=>{
					if(asyncChildErr) return next(asyncChildErr);

					let itemResult = asyncChildResponse.item_list;

					/** Send success response */
					if(itemResult.length <=0) return resolve({
						status 				:	Constants.STATUS_SUCCESS,
						result 				: 	itemResult,
						restaurant_details 	: 	restaurantDetails,
						restaurant_image_url:	Constants.RESTAURANT_FILE_URL,
						open_time			: 	openingTime,
						close_time			: 	closingTime,
						cart_count          :   cartCount,
						recommended_items   :   recommendedItemList,
						upselling_items 	:   upsellingItemList,
					});

					let finalCategoryList = {};
					categoryList.map(categoryData=>{
						itemResult.map(itemData=>{
							let isVaild	= (itemData.category_ids.length <= 0) ? true :false;

							if(itemData.item_price){
								let tmpPrice 		=	itemData.item_price;
								let percentage		=	itemData.discount_percentage;
								let discountValue	=	itemData.discount_value;

								if(discountValue){
									let tmpDiscount= (tmpPrice>=discountValue) ? discountValue :tmpPrice;

									itemData.strikethrough_price = tmpPrice;
									itemData.item_price = round(tmpPrice-tmpDiscount);
								}else if(percentage){
									let tmpDiscount = 	(tmpPrice*percentage)/100;

									itemData.strikethrough_price= tmpPrice;
									itemData.item_price = round(tmpPrice-tmpDiscount);
								}
							}

							if(itemData.category_ids.length > 0){
								itemData.category_ids.map(tempCateId=>{
									if(String(tempCateId) == String(categoryData._id)) isVaild = true;
								});
							}

							/** Add favourite status  */
							itemData.is_favourite =	(favouriteList[itemData._id]) ? Constants.FAVOURITE :Constants.UNFAVOURITE;

							if(isVaild){
								if(!finalCategoryList[categoryData._id])  finalCategoryList[categoryData._id] = clone(categoryData);

								let tempItemDetails = clone(itemData);
								if(customizeItemList[itemData._id]){
									tempItemDetails = Object.assign(tempItemDetails, customizeItemList[itemData._id]);
								}

								if(!finalCategoryList[categoryData._id].item_list) finalCategoryList[categoryData._id].item_list = [];

								finalCategoryList[categoryData._id].item_list.push(tempItemDetails);
							}
						});
					});

					/**Send success response */
					resolve({
						status 				: 	Constants.STATUS_SUCCESS,
						result 				: 	Object.values(finalCategoryList),
						open_time			: 	openingTime,
						close_time			: 	closingTime,
						restaurant_details 	: 	restaurantDetails,
						branch_details	 	: 	branchDetails,
						restaurant_image_url:	Constants.RESTAURANT_FILE_URL,
						item_image_url		:	Constants.ITEMS_FILE_URL,
						cart_count          :   cartCount,
						recommended_items   :   recommendedItemList,
						upselling_items 	:   upsellingItemList
					});
				});
			});
        }).catch(next);
	};// end getCategoryListWithItem()

	/**
	 * Function to get item details
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	**/
	async getItemDetails (req,res,next){
		return new Promise(resolve=>{
			/** Sanitize Data **/
			req.body 		=	sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
			let categoryId	= 	(req.body.category_id) 		?	new ObjectId(req.body.category_id) 		:"";
            let branchId	= 	(req.body.branch_id) 		?	new ObjectId(req.body.branch_id) 		:"";
            let itemId		= 	(req.body.item_id) 			?	new ObjectId(req.body.item_id) 			:"";
			let restaurantId= 	(req.body.restaurant_id) 	?	new ObjectId(req.body.restaurant_id) 	:"";
			let userId		= 	(req.body.user_id) 			?	new ObjectId(req.body.user_id) 			:"";
			let areaId		=	(req.body.area_id) 			? 	new ObjectId(req.body.area_id) 			:"";
			let cartId		=	(req.body.cart_id) 			? 	new ObjectId(req.body.cart_id) 			:"";
			let deviceId	= 	(req.body.device_id)	 	?	req.body.device_id					:"";
			let deliveryBy	=	(req.body.delivery_by) 		? 	req.body.delivery_by 		 		:"";

			/** Send error response **/
			if(!restaurantId || !itemId) return resolve({status: Constants.STATUS_ERROR, message: res.__("system.missing_parameters")});

			/** Set item conditions **/
			let itemConditions = {
				_id				:	itemId,
				is_active		:	Constants.ACTIVE,
				restaurant_id	:	restaurantId,
			};

			/** Add category conditions */
			if(categoryId){
				itemConditions["$or"] = [
					{"category_ids.0" :{$exists: false}},
					{"category_ids"   :{$in: [categoryId] }}
				];
			}
			const items	 = this.db.collection(Tables.ITEMS);
			const item_linkings	= this.db.collection(Tables.ITEM_LINKINGS);

			/** Get item details */
			items.findOne(itemConditions,{projection: {_id: 1, name: 1, description: 1, item_type : 1, price_on_selection: 1, item_price: 1, no_of_components: 1, image: 1, no_of_duplicate: 1, discount_percentage: 1, discount_value: 1, grid_image:1,detail_image:1 }}).then(itemResult=>{

				/** Send error response **/
				if(!itemResult) return resolve({status: Constants.STATUS_ERROR, message: res.__("system.invalid_access") });

				if(itemResult.item_price){
					let tmpPrice 		=	itemResult.item_price;
					let percentage		=	itemResult.discount_percentage;
					let discountValue	=	itemResult.discount_value;

					if(discountValue){
						let tmpDiscount= (tmpPrice>=discountValue) ? discountValue :tmpPrice;

						itemResult.strikethrough_price = tmpPrice;
						itemResult.item_price = round(tmpPrice-tmpDiscount);
					}else if(percentage){
						let tmpDiscount = 	(tmpPrice*percentage)/100;

						itemResult.strikethrough_price= tmpPrice;
						itemResult.item_price = round(tmpPrice-tmpDiscount);
					}
				}

				let itemType = itemResult.item_type;
				asyncParallel({
					item_unit_list : (callback)=>{
						/** Get item unit list **/
						const item_units =	this.db.collection(Tables.ITEM_UNITS);
						item_units.aggregate([
							{$match :{
								item_id : itemId,
								status	: Constants.ACTIVE,
							}},
							{$sort : {sorting: Constants.SORT_ASC}},
							{$lookup: {
								from 			: 	Tables.ITEM_UNITS_MASTERS,
								localField 		:	"item_unit_id",
								foreignField 	: 	"_id",
								as	 			: 	"unit_detail"
							}},
							{$project : {
								_id: 1, unit_id: "$item_unit_id", price: 1, discount_type: 1, discount_value: 1, unit_name: {$arrayElemAt: ["$unit_detail.name",0]},
							}}
						]).toArray().then(unitResult=>{
							callback(null, unitResult);
						}).catch(next);
					},
					item_dough_list : (callback)=>{
						if(itemType != Constants.PIZZA_VGROUP && itemType != Constants.DEAL_ITEM && itemType != Constants.HALF_AND_HALF_ITEM) return callback(null,[]);

						/** Get dough list **/
						const item_dough_units = this.db.collection(Tables.ITEM_DOUGH_UNITS);
						item_dough_units.aggregate([
							{$match :{
								item_id : itemId,
								status	: Constants.ACTIVE,
							}},
							{$sort : {sorting: Constants.SORT_ASC}},
							{$lookup: {
								from 			: 	Tables.ITEM_UNITS_MASTERS,
								localField 		:	"item_unit_id",
								foreignField 	: 	"_id",
								as	 			: 	"unit_detail"
							}},
							{$project : {
								_id: 1, price: 1, item_unit_id: 1, parents: 1,
								unit_name: {$arrayElemAt: ["$unit_detail.name",0]},
							}}
						]).toArray().then(unitResult=>{
							callback(null, unitResult);
						}).catch(next);
					},
					item_selector_list : (callback)=>{
						if(itemType != Constants.DEAL_ITEM && itemType != Constants.HALF_AND_HALF_ITEM) return callback(null,[]);

						/** Get selector list **/
						const item_selector_units = this.db.collection(Tables.ITEM_SELECTOR_UNITS);
						item_selector_units.aggregate([
							{$match :{
								item_id : itemId,
								status	: Constants.ACTIVE,
							}},
							{$sort : {sorting: Constants.SORT_ASC}},
							{$lookup: {
								from 			: 	Tables.ITEM_UNITS_MASTERS,
								localField 		:	"item_unit_id",
								foreignField 	: 	"_id",
								as	 			: 	"unit_detail"
							}},
							{$project : {
								_id: 1, price: 1, item_unit_id: 1, parents: 1, dough_type_parents :1, sorting : 1,
								unit_name: {$arrayElemAt: ["$unit_detail.name",0]},
							}}
						]).toArray().then(unitResult=>{
							callback(null, unitResult);
						});
					},
					item_choice_of_list : (callback)=>{
						/** Set choice conditions  */
						let choiceConditions = {item_id : itemId };

						if(itemType == Constants.DEAL_ITEM){
							choiceConditions.unit_id = {$exists: true};
						}

						/** Get choice count */
						const item_group_extras	 = this.db.collection(Tables.ITEM_GROUP_EXTRAS);
						item_group_extras.countDocuments(choiceConditions).then(contResult=>{
							callback(null,contResult);
						}).catch(next);
					},
					favourite_details : (favouriteCallback)=>{
						if(!userId) return favouriteCallback(null,null);

						/** Get favourite item list **/
						const user_favourites	= this.db.collection(Tables.USER_FAVOURITES);
						user_favourites.countDocuments({
							item_id	:	itemId,
							user_id	:	userId,
						}).then(favouriteResult=>{
							favouriteCallback(null, favouriteResult);
						}).catch(next);
					},
					cart_details : (cartCallback)=>{
						if(!cartId) return cartCallback(null,null);

						/** Set cart conditions */
						let cartConditions = {
							_id				:	cartId,
							item_id			:	itemId,
							restaurant_id	:	restaurantId,
							$or : [
								{max_modified_time : {$exists: false}},
								{max_modified_time : {$gte: newDate()}},
							]
						};

						if(userId){
							cartConditions.customer_id 	= 	userId;
						}else{
							cartConditions.device_id	=	deviceId;
						}

						/** Get user cart details **/
						const user_carts = this.db.collection(Tables.USER_CARTS);
						user_carts.findOne(cartConditions,{projection:{_id:1,qty:1,dough_id:1,item_unit_id:1,unit_id:1,selector_id:1,unit_lists:1,extra_items:1,note:1}}).then(cartResult=>{
							cartCallback(null, cartResult);
						}).catch(next);
					},
					area_details : (callback)=>{
						if(deliveryBy != Constants.DELIVERY_BY_CRAVEZ) return callback(null,null);

						/** Set area conditions **/
						let areaConditions = {
							area_id			:	areaId,
							branch_id		:	branchId,
							restaurant_id	:	restaurantId,
						};

						/** Get branch area details **/
						const restaurant_branch_areas	= this.db.collection(Tables.RESTAURANT_BRANCH_AREAS);
						restaurant_branch_areas.findOne(areaConditions,{projection: {minimum_order_limit: 1, has_offers:1}}).then(areaResult=>{
							callback(null, areaResult);
						}).catch(next);
					},
					recommended_item_list : (callback)=>{
						/** Get recommended item **/
						const item_recommended = this.db.collection(Tables.ITEM_RECOMMENDED);
						item_recommended.findOne({item_id : itemId},{projection: {recommended: 1}}).then(itemRecommendedResult=>{
							if(!itemRecommendedResult)  return callback(null,[]);

							let recommonded = itemRecommendedResult.recommended ? itemRecommendedResult.recommended : [];

							/** Set linking item conditions **/
							let linkItemConditions = {
								item_id	: {$in : recommonded},
								$or : [
									{
										type : Constants.ITEM_NOT_LISTED_TO_SELECTED_BRANCH_LIST,
										branch_ids: { $nin: [ branchId] }
									},
									{
										type: Constants.ITEM_LISTED_TO_SELECTED_BRANCH_LIST,
										$or : [
											{branch_ids	: { $size: 0} },
											{branch_ids : { $in: [ branchId ] } }
										]
									}
								]
							};

							/** Get item ids from item linkings **/
							item_linkings.distinct( "item_id", linkItemConditions).then(itemIds=>{
								if(itemIds.length <=0)  return callback(null,[]);

								/** Set item conditions **/
								let itemCommonConditions = {
									_id				:	{$in : itemIds},
									is_active		:	Constants.ACTIVE,
									restaurant_id	:	restaurantId,
								};

								/** Get item details **/
								items.find(itemCommonConditions,{projection: {_id: 1, name: 1, description: 1,price_on_selection: 1, item_price: 1, image: 1,category_ids:1}}).toArray().then(itemDetailsResult=>{
									callback(null, itemDetailsResult);
								}).catch(next);
							}).catch(next);
						}).catch(next);
					},
					upselling_item_list : (callback)=>{
						/** Get upselling item **/
						const item_upsellings = this.db.collection(Tables.ITEM_UPSELLINGS);
						item_upsellings.findOne({item_id : itemId},{projection: {upselling: 1}}).then(itemUpsellingResult=>{
							if(!itemUpsellingResult)  return callback(null,[]);

							let upselling = itemUpsellingResult.upselling ? itemUpsellingResult.upselling : [];

							/** Set linking item conditions **/
							let linkItemConditions = {
								item_id	: {$in : upselling},
								$or : [
									{
										type : Constants.ITEM_NOT_LISTED_TO_SELECTED_BRANCH_LIST,
										branch_ids: { $nin: [ branchId] }
									},
									{
										type: Constants.ITEM_LISTED_TO_SELECTED_BRANCH_LIST,
										$or : [
											{branch_ids	: { $size: 0} },
											{branch_ids : { $in: [ branchId ] } }
										]
									}
								]
							};

							/** Get item ids from item linkings **/
							item_linkings.distinct( "item_id", linkItemConditions).then(itemIds=>{
								if(itemIds.length <=0)  return callback(null,[]);

								/** Set item conditions **/
								let itemCommonConditions = {
									_id				:	{$in : itemIds},
									is_active		:	Constants.ACTIVE,
									restaurant_id	:	restaurantId,
								};

								/** Get item details **/
								items.find(itemCommonConditions,{projection: {_id: 1, name: 1, description: 1,price_on_selection: 1, item_price: 1, image: 1,category_ids:1}}).toArray().then(itemDetailsResult=>{
									callback(null, itemDetailsResult);
								}).catch(next);
							});
						}).catch(next);
					},
					deal_item_choice : (callback)=>{
						if(itemType != Constants.DEAL_ITEM) return callback(null,false);

						/** Check deal item have any extra item **/
						const item_group_extras	 = this.db.collection(Tables.ITEM_GROUP_EXTRAS);
						item_group_extras.countDocuments({
							item_id : 	itemId,
							$or		:	[
								{unit_id : {$exists: false} },
								{unit_id : ""},
							]
						}).then(contResult=>{
							let haveExtras = (contResult && contResult> 0) ? true :false;
							callback(null,haveExtras);
						}).catch(next);
					},
					cart_amount_details : (callback)=>{
						if(!userId && !deviceId) return callback(null,{})

						/** Get cart total */
						let cartOptions = {
							user_id 		: userId,
							device_id 		: deviceId,
							cart_total_only : true,
						};

						this.cartAPI.getUserCartList(req,res,next,cartOptions).then(cartResponse=>{
							if(cartResponse.status != Constants.STATUS_SUCCESS) return callback(cartResponse);
							callback(null,cartResponse);
						}).catch(next);
					},
					cart_count : (callback)=>{
						if(!userId && !deviceId) return callback(null,0)

						/** Get cart count */
						this.cartAPI.getCartCount(req,res,next).then(cartResponse=>{
							if(cartResponse.status != Constants.STATUS_SUCCESS) return callback(cartResponse);
							callback(null,cartResponse.count);
						}).catch(next);
					},
					attributes_details: (callback)=>{
						/** Check branch attributes details */
						const restaurant_branch_attributes = this.db.collection(Tables.RESTAURANT_BRANCH_ATTRIBUTES);
						restaurant_branch_attributes.find({
							branch_id		: branchId,
							restaurant_id 	: restaurantId,
							attribute_id	: {$in: [
								Constants.BRANCH_OFFERS_DOUBLE_CASHBACK_ATTRIBUTE_ID,
								Constants.BRANCH_OFFERS_CASHBACK_ATTRIBUTE_ID,
							]},
						},{projection:{attribute_id:1,value:1}}).toArray().then(attributeResult=>{

							let attributeList =  {};
							attributeResult.map(attributeData=>{
								attributeList[attributeData.attribute_id] = attributeData.value;
							});
							callback(null,attributeList);
						}).catch(next);
					},
				},(asyncErr, asyncResponse)=>{
					if(asyncErr) return next(asyncErr);

					let cartCount 			=	(asyncResponse.cart_count) ? asyncResponse.cart_count :0;
					let cartAmountDetails 	=	(asyncResponse.cart_amount_details) ? asyncResponse.cart_amount_details :{};
					let branchAttributesDetails= asyncResponse.attributes_details;

					/** Add favourite status  */
					itemResult.is_favourite =	(asyncResponse.favourite_details) ? Constants.FAVOURITE :Constants.UNFAVOURITE;

					/** Add cart details */
					itemResult.cart_details= (asyncResponse.cart_details) ?asyncResponse.cart_details :{};
					itemResult.cart_id 	= (asyncResponse.cart_details) ?asyncResponse.cart_details._id :"";
					itemResult.cart_qty	= (asyncResponse.cart_details) ?asyncResponse.cart_details.qty :"";

					let areaDetails 		= 	(asyncResponse.area_details) ? asyncResponse.area_details : {};
					let itemUnitList	 	= 	asyncResponse.item_unit_list;
					let itemDoughList 		= 	asyncResponse.item_dough_list;
					let itemSelectorList 	=	asyncResponse.item_selector_list;
					let recommendedItemList =	asyncResponse.recommended_item_list;
					let upsellingItemList 	=	asyncResponse.upselling_item_list;
					if(itemUnitList.length >0){
						itemUnitList.map(records=>{
							let firstUnitId 	=	records._id;
							let unitPrice		=	records.price;
							let discountType	=	records.discount_type;
							let discountValue	=	(records.discount_value) ?  parseFloat(records.discount_value) :0;

							if(unitPrice){
								let tmpPrice =	unitPrice;

								if(discountValue && discountType){
									if(discountType == Constants.DISCOUNT_BY_VALUE){
										let tmpDiscount= (tmpPrice>=discountValue) ? discountValue :tmpPrice;

										records.strikethrough_price = tmpPrice;
										records.price = round(tmpPrice-tmpDiscount);
									}else{
										let tmpDiscount = 	(tmpPrice*discountValue)/100;

										records.strikethrough_price= tmpPrice;
										records.price = round(tmpPrice-tmpDiscount);
									}
								}
							}

							if(itemDoughList.length >0){
								itemDoughList.map(doughData=>{
									let tempDoughId 	=	doughData._id;
									let doughParentMatch= 	false;

									if(doughData.parents.length >0){
										doughData.parents.map(doughParentId=>{
											if(String(doughParentId) == String(firstUnitId)) doughParentMatch = true;
										});
									}

									if(doughParentMatch){
										if(!records.dough_list) records.dough_list = [];

										let selectorList = [];
										if(itemSelectorList.length >0){
											itemSelectorList.map(selectorData=>{
												let selectorParentMatch	= 	false;
												let selectorDoughMatch	= 	false;

												if(selectorData.parents.length >0){
													selectorData.parents.map(selectorParentId=>{
														if(String(selectorParentId) == String(firstUnitId)) selectorParentMatch = true;
													});
												}
												if(selectorData.dough_type_parents.length >0){
													selectorData.dough_type_parents.map(selectorDoughId=>{
														if(String(selectorDoughId) == String(tempDoughId)) selectorDoughMatch = true;
													});
												}

												if(selectorParentMatch && selectorDoughMatch){
													selectorList.push({
														_id 		:	selectorData._id,
														price 		:	selectorData.price,
														unit_name 	: 	selectorData.unit_name,
														item_unit_id: 	selectorData.item_unit_id,
														sorting		: 	selectorData.sorting,
													});
												}
											});
										}

										records.dough_list.push({
											_id 		:	tempDoughId,
											price 		:	doughData.price,
											unit_name 	: 	doughData.unit_name,
											item_unit_id: 	doughData.item_unit_id,
											selector_list: 	selectorList,
										});
									}
								});
							}
						});
					}
					let openingTime = (res.locals.settings["App.opening_time"]) ? res.locals.settings["App.opening_time"] : "";
					let closingTime = (res.locals.settings["App.closing_time"]) ? res.locals.settings["App.closing_time"] : "";

					let restaurantDetails = {
						minimum_order_limit :  	(areaDetails && areaDetails.minimum_order_limit) ? areaDetails.minimum_order_limit :"",
						has_offers 			:	(areaDetails && areaDetails.minimum_order_limit) ? areaDetails.minimum_order_limit :"",
					};
					let isCashback 			= 	0;
					let isDoubleCashback 	=	0;
					if(branchAttributesDetails){
						if(branchAttributesDetails[Constants.BRANCH_OFFERS_DOUBLE_CASHBACK_ATTRIBUTE_ID]){
							isDoubleCashback = parseInt(branchAttributesDetails[Constants.BRANCH_OFFERS_DOUBLE_CASHBACK_ATTRIBUTE_ID]);
						}
						if(branchAttributesDetails[Constants.BRANCH_OFFERS_CASHBACK_ATTRIBUTE_ID]){
							isCashback =  parseInt(branchAttributesDetails[Constants.BRANCH_OFFERS_CASHBACK_ATTRIBUTE_ID]);
						}
					}
					restaurantDetails.is_cashback 			=	 isCashback;
					restaurantDetails.is_double_cashback 	=	 isDoubleCashback

					/** Send success response */
					return resolve({
						status 			:	Constants.STATUS_SUCCESS,
						item_details 	: 	itemResult,
						item_unit_list 	: 	itemUnitList,
						item_image_url	:	Constants.ITEMS_FILE_URL,
						item_choice 	: 	(asyncResponse.item_choice_of_list) ? true :false,
						restaurant_details: restaurantDetails,
						open_time	: openingTime,
						close_time	: closingTime,
						recommended_item_list : recommendedItemList,
						upselling_item_list   : upsellingItemList,
						deal_item_choice   	: (asyncResponse.deal_item_choice) ? asyncResponse.deal_item_choice :false,
						total_amount 	: (cartAmountDetails.grand_total) ? cartAmountDetails.grand_total :0,
						total_discount 	: (cartAmountDetails.total_discount) ? cartAmountDetails.total_discount :0,
						cart_count 		: cartCount,
					});
				});
			}).catch(next);
        }).catch(next);
	};// end getItemDetails()

	/**
	 * Function to get item choice list
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	**/
	async getItemChoiceList (req,res,next){
		return new Promise(resolve=>{
			/** Sanitize Data **/
			req.body 		=	sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
			let itemId		= 	(req.body.item_id) 			?	new ObjectId(req.body.item_id) 			:"";
            let unitId		= 	(req.body.unit_id) 			?	new ObjectId(req.body.unit_id) 			:"";
            let doughTypeId	= 	(req.body.dough_type_id)	?	new ObjectId(req.body.dough_type_id) 	:"";
            let selectorId	= 	(req.body.selector_id)		?	new ObjectId(req.body.selector_id) 		:"";
            let branchId	= 	(req.body.branch_id) 		?	new ObjectId(req.body.branch_id) 		:"";
            let restaurantId= 	(req.body.restaurant_id) 	?	new ObjectId(req.body.restaurant_id)	:"";

			/** Send error response **/
			if(!itemId || !restaurantId) return resolve({status: Constants.STATUS_ERROR, message: res.__("system.missing_parameters")});

			/** Set item conditions **/
			let itemConditions = {
				_id				:	itemId,
				is_active		:	Constants.ACTIVE,
				restaurant_id	:	restaurantId,
			};

			/** Get item details */
			const items	 = this.db.collection(Tables.ITEMS);
			items.aggregate([
				{$match:	itemConditions},
				{$lookup: {
					from 		: 	Tables.RESTAURANTS,
					localField 	:	"restaurant_id",
					foreignField: 	"_id",
					as 			: 	"restaurant_detail"
				}},
				{$project :{
					_id : 1, item_type: 1, simphony: {$arrayElemAt: ["$restaurant_detail.simphony",0]},
				}},
				{$sort : {group_order : Constants.SORT_ASC }},
			]).toArray().then(itemData=>{

				/** Send error response */
				if(!itemData.length) return resolve({status: Constants.STATUS_ERROR, message: res.__("system.invalid_access"), itemData});

				let itemResult	=	itemData[0];
				let itemType 	= 	itemResult.item_type;

				/** Set group conditions */
				let groupConditions = {
					item_id : 	itemId,
					$or 	:	[
						{$or:	[
							{unit_id : {$exists: false} },
							{unit_id : ""},
						]}
					]
				};

				/** Set unit wise conditions */
				if(unitId){
					let tempConditions = {unit_id : unitId };

					if(doughTypeId) tempConditions.dough_type_id	=	doughTypeId;
					if(selectorId) 	tempConditions.selector_id		= 	selectorId;

					groupConditions["$or"].push(tempConditions);

					if(itemType == Constants.DEAL_ITEM) groupConditions["$or"] =  [{$and:[tempConditions]}];
				}

				/** Get item group list */
				const item_group_extras = 	this.db.collection(Tables.ITEM_GROUP_EXTRAS);
				item_group_extras.aggregate([
					{$match:	groupConditions},
					{$lookup:	{
						from     : Tables.ITEM_EXTRA_MASTERS,
						let      : {itemExtraId : "$item_extra_id"},
						pipeline : [
							{$match : {
								$expr: {
									$and : [
										{$eq: ["$_id", "$$itemExtraId"]},
										{$eq: ["$is_active", Constants.ACTIVE]},
									]
								}
							}},
							{$lookup: {
								from 		: 	Tables.ITEM_UNITS_MASTERS,
								localField 	:	"extra_item_unit_id",
								foreignField: 	"_id",
								as 			: 	"extra_unit_detail"
							}},
							{$project: {
								name: 1, extra_fees: 1, order: 1, extra_item_unit_id: 1,
								extra_unit_name: {$arrayElemAt: ["$extra_unit_detail.name",0]}
							}},
						],
						as:	"extra_item_detail"
					}},
					{$match: {
						"extra_item_detail._id" : {$exists: true}
					}},
					{$addFields : {
						extra_item_order: {$arrayElemAt: ["$extra_item_detail.order",0]},
					}},
					{$sort : {extra_item_order : Constants.SORT_ASC }},
					{$group: {
						_id 			: "$group_id",
						extra_item_list : {$push : {
							_id				: "$_id",
							item_unit_id	: "$item_unit_id",
							extra_item_id	: {$arrayElemAt: ["$extra_item_detail._id",0]},
							extra_item_name	: {$arrayElemAt: ["$extra_item_detail.name",0]},
							extra_unit_name	: {$arrayElemAt: ["$extra_item_detail.extra_unit_name",0]},
							extra_item_unit_id:{$arrayElemAt: ["$extra_item_detail.extra_item_unit_id",0]},
							extra_fees		: {$ifNull: [ "$extra_fees", {$arrayElemAt: ["$extra_item_detail.extra_fees",0]} ] },
							// extra_item_order: "$extra_item_order",

							aghzeya_item_id	: "$aghzeya_item_id",
							aghzeya_group_id	: "$aghzeya_group_id",
							aghzeya_extra_item_id	: "$aghzeya_extra_item_id",
						}},
					}},
					{$lookup: {
						from 		: 	Tables.ITEM_CHOICES_GROUPS,
						localField 	:	"_id",
						foreignField: 	"_id",
						as 			: 	"group_detail"
					}},
					{$project :{
						_id : 1, extra_item_list: 1,
						group_name	 : {$arrayElemAt: ["$group_detail.name",0]},
						max_quantity : {$arrayElemAt: ["$group_detail.max_quantity",0]},
						min_quantity : {$arrayElemAt: ["$group_detail.min_quantity",0]},
						group_order	 : {$arrayElemAt: ["$group_detail.order",0]},
					}},
					{$sort : {group_order : Constants.SORT_ASC }},
				]).toArray().then(extraItemResult=>{

					/** Send error response */
					// if(extraItemResult.length <=0) return resolve({status: Constants.STATUS_ERROR, message: res.__("system.invalid_access")});

					/** Send success response */
					resolve({status: Constants.STATUS_SUCCESS, result: extraItemResult, itemDetails: itemResult });
				}).catch(next);
			});
        }).catch(next);
	};// end getItemChoiceList()

	/**
	 * Function to get branch payment method
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	**/
	async getPaymentMethods (req,res,next){
		return new Promise(resolve=>{
			/** Sanitize Data **/
            req.body 			= 	sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
            let branchId		= 	(req.body.branch_id) 		? 	new ObjectId(req.body.branch_id) 	:"";
            let restaurantId	=	(req.body.restaurant_id)	?	new ObjectId(req.body.restaurant_id):"";

			/** Send error response **/
			if(!restaurantId || !branchId){
				return resolve({status: Constants.STATUS_ERROR, message: res.__("system.missing_parameters") });
			}

			/** Get branch selected payment method list */
			const restaurant_branch_payment_methods = this.db.collection(Tables.RESTAURANT_BRANCH_PAYMENT_METHODS);
			restaurant_branch_payment_methods.aggregate([
				{$match		: {
					branch_id		: 	branchId,
					restaurant_id	:	restaurantId
				}},
				{$addFields:{
					payment_methods : {$ifNull: [ "$payment_methods", [] ] }
				}},
				{$lookup: {
					from: Tables.PAYMENT_METHODS,
					let: {methods: '$payment_methods' },
					pipeline: [
						{$match: {
							$expr: {
								$in: ['$slug', '$$methods']
							}
						}},
						{$project: { _id :0, slug : 1,title : 1}}
					],
					as:'payment_methods'
				}},
				{$project : {
					payment_methods : 1
				}}
			]).toArray().then(result=>{

				/** Send success response */
				resolve({
					status			: Constants.STATUS_SUCCESS,
					payment_methods	: (result && result[0]) ? result[0].payment_methods :[]
				});
			}).catch(next);
		}).catch(next);
	};// end getPaymentMethods()

	/**
	 * Function to get restaurant list without area
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	**/
	async getRestaurantListWithoutArea (req,res,next){
		return new Promise(resolve=>{
			/** Sanitize Data **/
			req.body 			=	sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
			let restaurantName	=	(req.body.restaurant_name) 	?	req.body.restaurant_name	:"";
			let skip			= 	(req.body.skip)				?	parseInt(req.body.skip)		:0;
			let limit			= 	(req.body.limit)			?	parseInt(req.body.limit)	:Constants.FRONT_LISTING_LIMIT;

			/** Set restaurant conditions **/
			let conditions = {
				is_deleted	:	Constants.NOT_DELETED,
				status		:	Constants.ACTIVE,
			};

			/** Add restaurant name conditions */
			if(restaurantName){
				let searchValue = cleanRegex(restaurantName.trim());
				conditions["$or"] = [
					{"name.en" : new RegExp(searchValue, "i") },
					{"name.ar" : new RegExp(searchValue, "i") }
				];
			}

			const restaurants	= this.db.collection(Tables.RESTAURANTS);
			asyncParallel({
				rest_list : (callback)=>{
					/** Get restaurant list **/
					restaurants.aggregate([
						{$match: conditions},
						{$sort : {"name.en" : Constants.SORT_ASC }},
						{$lookup:	{
							from     : Tables.RESTAURANT_BRANCHES,
							let      : {restaurantId : "$_id"},
							pipeline : [
								{$match : {
									$expr: {
										$and : [
											{$eq: ["$restaurant_id", "$$restaurantId"]},
											{$eq: ["$is_active", Constants.ACTIVE ]},
										]
									}
								}},
							],
							as:	"branch_list"
						}},
						{$match: {
							"branch_list.0" : {$exists: true}
						}},
						{$skip	: skip},
						{$limit	: limit},
						{$project: {
							_id:1,name:1,image:1,landing_image:1,detail_image:1,
						}},
					]).toArray().then(restResult=>{
						callback(null, restResult);
					}).catch(next);
				},
				rest_count : (callback)=>{
					/** Get restaurant count **/
					restaurants.aggregate([
						{$match: conditions},
						{$sort : {"name.en" : Constants.SORT_ASC }},
						{$lookup:	{
							from     : Tables.RESTAURANT_BRANCHES,
							let      : {restaurantId : "$_id"},
							pipeline : [
								{$match : {
									$expr: {
										$and : [
											{$eq: ["$restaurant_id", "$$restaurantId"]},
											{$eq: ["$is_active", Constants.ACTIVE ]},
										]
									}
								}},
							],
							as:	"branch_list"
						}},
						{$match: {
							"branch_list.0" : {$exists: true}
						}},
						{$count: "count"},
					]).toArray().then(restCount=>{
						restCount  = (restCount && restCount[0]) ? restCount[0].count :0;
						callback(null, restCount);
					}).catch(next);
				},
			},(asyncErr, asyncResponse)=>{
				if(asyncErr) return next(asyncErr);

				/** Send success response */
				resolve({
					status					: 	Constants.STATUS_SUCCESS,
					result					:	asyncResponse.rest_list,
					total_restaurant		:	asyncResponse.rest_count,
					restaurant_image_url	:	Constants.RESTAURANT_FILE_URL,
				});
			});
		}).catch(next);
	};// end getRestaurantListWithoutArea()

	/**
	 * Function to get branch list
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	**/
	async getBranchList (req,res,next){
		return new Promise(resolve=>{
			/** Sanitize Data **/
            req.body 			= 	sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
            let restaurantId	=	(req.body.restaurant_id)	?	new ObjectId(req.body.restaurant_id):"";

			/** Send error response **/
			if(!restaurantId ){
				return resolve({status: Constants.STATUS_ERROR, message: res.__("system.missing_parameters") });
			}

			let sortConditions = {};
			sortConditions["name." + Constants.DEFAULT_LANGUAGE_CODE] = Constants.SORT_ASC;
			const restaurant_branches = this.db.collection(Tables.RESTAURANT_BRANCHES);
			/** Get restaurant all branch list */
			restaurant_branches.find({
				is_active: Constants.ACTIVE,
				restaurant_id: restaurantId,
				is_open: Constants.OPEN,
				branch_status: Constants.OPEN
			}, { projection: { _id: 1, name: 1, address: 1, area_id:1 } }).sort(sortConditions).toArray().then(branchResult => {

				/** Send success response */
				resolve({
					status	: Constants.STATUS_SUCCESS,
					result	: branchResult
				});
			}).catch(next);
		}).catch(next);
	};// end getBranchList()

	/**
	 * Function to add Temp Orders
	 *
	 * @param req 	As 	Request Data
	 * @param res 	As 	Response Data
	 * @param next	As	Callback argument to the middleware function
	 *
	 * @return render/json
	 */
	async addTempOrders(req, res, next) {
		return new Promise(async resolve => {
			/** Sanitize Data **/
			req.body = sanitizeData(req.body, Constants.NOT_ALLOWED_TAGS_XSS_WITHOUT_IFRAME);
			let tempOrderId		=	(req.body.temp_order_id) ? new ObjectId(req.body.temp_order_id) : new ObjectId();
			let isScheduled 	= (req.body.is_scheduled) ? (req.body.is_scheduled) : "";
			let scheduledTime 	= (req.body.scheduled_time) ? req.body.scheduled_time : "";
			let deliveryBy 		= (req.body.delivery_by) ? (req.body.delivery_by) : "";
			let userId			=	(req.body.user_id) ? req.body.user_id : '';
			let restaurantId	=	(req.body.restaurant_id) ? req.body.restaurant_id : '';
			let areaId			=	(req.body.area_id) ? req.body.area_id : '';
			let branchId		=	(req.body.branch_id) ? new ObjectId(req.body.branch_id) : '';
			let addressId		=	(req.body.address_id) ? new ObjectId(req.body.address_id) : '';
			/** Send error response */
			if (!userId) {
				return resolve({ status: Constants.STATUS_ERROR, message: res.__("system.missing_parameters") });
			}

			/** Save temp_orders data **/
			const temp_orders = this.db.collection(Tables.TEMP_ORDERS);
			temp_orders.updateOne({
				_id: tempOrderId
			},
			{
				$set: {
					is_scheduled	: isScheduled,
					scheduled_time	: getUtcDate(scheduledTime),
					delivery_by		: deliveryBy,
					user_id			: new ObjectId(userId),
					area_id			: new ObjectId(areaId),
					branch_id		: branchId,
					restaurant_id	: new ObjectId(restaurantId),
					address_id		: addressId,
					modified: getUtcDate(),
				},
				$setOnInsert: {
					created: getUtcDate(),
				}
			}, { upsert: true }).then(()=> {

				/** Send success response **/
				resolve({
					status			: Constants.STATUS_SUCCESS,
					temp_order_id	: tempOrderId
				});
			}).catch(next);
		});
	};//End addTempOrders()

	/**
	 * Function to get branch area details
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	**/
	async getBranchAreaDetails (req,res,next){
		return new Promise(resolve=>{
			/** Sanitize Data **/
            req.body 		= 	sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
            let branchId	=	(req.body.branch_id)	?	new ObjectId(req.body.branch_id)	:"";

			/** Send error response **/
			if(!branchId ) return resolve({status: Constants.STATUS_ERROR, message: res.__("system.missing_parameters") });

			asyncParallel({
				branch_details : (callback)=>{
					/** Get branch details */
					const restaurant_branches = this.db.collection(Tables.RESTAURANT_BRANCHES);
					restaurant_branches.aggregate([
						{$match: {_id: branchId}},
						{$lookup:	{
							from     : Tables.RESTAURANT_BRANCH_AREAS,
							let      : {restaurantId: "$restaurant_id", branchId : "$_id", areaId : "$area_id" },
							pipeline : [
								{$match : {
									$expr: {
										$and : [
											{$eq: ["$restaurant_id", "$$restaurantId"]},
											{$eq: ["$branch_id", "$$branchId"]},
											{$eq: ["$area_id", "$$areaId"]},
										]
									}
								}},
							],
							as	:	"area_details"
						}},
						{$lookup:	{
							from     : Tables.RESTAURANTS,
							let      : {restaurantId: "$restaurant_id", },
							pipeline : [
								{$match : {
									$expr: {
										$and : [
											{$eq: ["$_id", "$$restaurantId"]},
										]
									}
								}},
							],
							as	:	"rest_details"
						}},
						{$project :{
							slogan_in_english: 1, slogan_in_arabic: 1, open_time: 1, close_time: 1,address:1,_id:1,branch_id: "$_id",name:1,
							restaurant_name			: 	{$arrayElemAt: ["$rest_details.name",0]},
							image					: 	{$arrayElemAt: ["$rest_details.image",0]},
							landing_image			: 	{$arrayElemAt: ["$rest_details.landing_image",0]},
							detail_image			: 	{$arrayElemAt: ["$rest_details.detail_image",0]},
							area_id					: 	{$arrayElemAt: ["$area_details.area_id",0]},
							preparation_time		: 	{$arrayElemAt: ["$area_details.preparation_time",0]},
							delivery_time			: 	{$arrayElemAt: ["$area_details.delivery_time",0]},
							has_offers				: 	{$arrayElemAt: ["$area_details.has_offers",0]},
							delivery_by				: 	{$arrayElemAt: ["$area_details.delivery_by",0]},
							delivery_fees			: 	{$arrayElemAt: ["$area_details.delivery_fees",0]},
							minimum_order_limit		: 	{$arrayElemAt: ["$area_details.minimum_order_limit",0]},
							accept_pickup_orders	: 	{$arrayElemAt: ["$area_details.accept_pickup_orders",0]},
							accept_scheduling_orders: 	{$arrayElemAt: ["$area_details.accept_scheduling_orders",0]},
							delivery_by_cravez		: 	{$arrayElemAt: ["$area_details.delivery_by_cravez",0]},
						}},
					]).toArray().then(braResult=>{
						braResult = (braResult && braResult[0]) ? braResult[0] :"";
						callback(null, braResult);
					}).catch(next);
				},
				payment_method_list: (callback)=>{
					/** Get branch selected payment method list */
					const restaurant_branch_payment_methods = this.db.collection(Tables.RESTAURANT_BRANCH_PAYMENT_METHODS);
					restaurant_branch_payment_methods.aggregate([
						{$match: {
							branch_id: 	branchId,
						}},
						{$addFields:{
							payment_methods : {$ifNull: [ "$payment_methods", [] ] }
						}},
						{$lookup: {
							from: Tables.PAYMENT_METHODS,
							let: {methods: '$payment_methods' },
							pipeline: [
								{$match: {
									$expr: {
										$in: ['$slug', '$$methods']
									}
								}},
								{$project: { _id :0, slug : 1,title : 1}}
							],
							as:'payment_methods'
						}},
						{$project : {
							payment_methods : 1
						}}
					]).toArray().then(result=>{
						let tmpPaymentMethod = (result && result[0]) ? result[0].payment_methods :[];
						callback(null, tmpPaymentMethod);
					}).catch(next);
				},
				phone_number_list: (parallelCallback)=>{
					/** Get branch selected phone numbers list */
					const restaurant_branch_phone_numbers = this.db.collection(Tables.RESTAURANT_BRANCH_PHONE_NUMBERS);
					restaurant_branch_phone_numbers.find({branch_id: branchId ,attribute_id : {$in  : [Constants.BRANCH_MANAGER_ATTRIBUTE_ID,Constants.BRANCH_HOT_LINE_NUMBER_ATTRIBUTE_ID]}},{projection : {value : 1,attribute_id:1,branch_id:1}}).toArray().then(phoneResult=>{
						parallelCallback(null, phoneResult);
					}).catch(next);
				},
			},(asyncErr, asyncResponse)=>{
				if(asyncErr) return next(asyncErr);

				/** Send success response */
				let braResult 			= 	asyncResponse.branch_details;
				let paymentMethodList 	=	asyncResponse.payment_method_list;
				let phoneNumberList 	=	asyncResponse.phone_number_list;
				let phoneNumbers		=	{};
				/** Add phone number details **/
				if(phoneNumberList.length >0){
					phoneNumberList.map(phone=>{
						if(String(branchId) == String(phone.branch_id)){
							if(!phoneNumbers[phone.attribute_id]) phoneNumbers[phone.attribute_id] ="";
							if(phoneNumbers[phone.attribute_id]) phoneNumbers[phone.attribute_id] +=", ";
							phoneNumbers[phone.attribute_id]	+=	phone.value;
						}
					});
				}

				resolve({
					status	: 	Constants.STATUS_SUCCESS,
					result	:	{
						name 					:	(braResult) ? 	braResult.name						:"",
						restaurant_name 		:	(braResult) ? 	braResult.restaurant_name			:"",
						address 				:	(braResult) ? 	braResult.address					:"",
						area_id 				:	(braResult)	? 	braResult.area_id 					:"",
						open_time 				:	(braResult) ? 	braResult.open_time					:"",
						close_time 				:	(braResult) ? 	braResult.close_time				:"",
						has_offers 				:	(braResult) ? 	braResult.has_offers				:"",
						delivery_by 			:	(braResult) ? 	braResult.delivery_by				:"",
						image 					:	(braResult) ? 	braResult.image						:"",
						detail_image 			:	(braResult) ? 	braResult.detail_image				:"",
						landing_image 			:	(braResult) ? 	braResult.landing_image				:"",
						restaurant_image 		:	(braResult) ? 	braResult.image						:"",
						delivery_fees 			:	(braResult) ? 	braResult.delivery_fees				:"",
						delivery_time 			:	(braResult) ?	braResult.delivery_time 			:"",
						preparation_time 		:	(braResult) ? 	braResult.preparation_time			:"",
						slogan_in_english 		:	(braResult) ? 	braResult.slogan_in_english			:"",
						slogan_in_arabic 		:	(braResult) ? 	braResult.slogan_in_arabic			:"",
						preparation_time 		:	(braResult) ? 	braResult.preparation_time			:"",
						minimum_order_limit 	:	(braResult) ? 	braResult.minimum_order_limit		:"",
						accept_pickup_orders 	:	(braResult) ? 	braResult.accept_pickup_orders		:"",
						accept_scheduling_orders:	(braResult) ? 	braResult.accept_scheduling_orders	:"",
						delivery_by_cravez 		:	(braResult) ? 	braResult.delivery_by_cravez		:"",
						payment_methods 		:	(paymentMethodList) ? paymentMethodList				:[],
						phones			 		:	(phoneNumbers) ? phoneNumbers						:{},
					}
				});
			});
		}).catch(next);
	};// end getBranchAreaDetails()
}
