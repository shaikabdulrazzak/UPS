import {hash as bcrypt} from "bcrypt";
import { ObjectId } from 'mongodb';
import axios from 'axios';
import https from 'https';
import {parallel as asyncParallel, eachOfSeries} from 'async';
import * as Constants from "../../../../config/global_constant.mjs";
import Tables from '../../../../config/database_tables.mjs';
import {isPost, sanitizeData, getUtcDate, newDate, getDifferenceBetweenTwoDatesInMinute, getCityList, getAreaList,getBlockList, getWalletBalance, checkNumberValid, addMinute, saveOrderStatusLogs} from "../../../../utils/index.mjs";
import { savePaymentGatewayLogs, sendMail} from "../../../../services/index.mjs";
import cartModal from '../../../frontend/api/model/user_carts.mjs';
import orderModal from '../../../frontend/api/model/order.mjs';
import offerModal from '../../../frontend/api/model/offer.mjs';
import restaurantModal from '../../../frontend/api/model/restaurant.mjs';
import customerAddressModal from '../../../frontend/api/model/customer_address.mjs';
import aghzeyaModal from '../../../frontend/aghzeya/model/aghzeya.mjs';

export default class AdminPlaceOrder {

    constructor(db) {
        this.db     =   db;
        this.userDB = db.collection(Tables.USERS);
        this.orderDB = db.collection(Tables.ORDERS);
        this.orderItemDB = db.collection(Tables.ORDER_ITEMS);
        this.userCartDB = db.collection(Tables.USER_CARTS);
        this.customerAddressesDB = db.collection(Tables.CUSTOMER_ADDRESSES);
        this.restaurantDB = db.collection(Tables.RESTAURANTS);
        this.aghzeyaRestaurantSourcesDB = db.collection(Tables.AGHZEYA_RESTAURANT_SOURCES);
        this.aghzeyaRestaurantPaymentMethodDB = db.collection(Tables.AGHZEYA_RESTAURANT_PAYMENT_METHODS);
        this.restaurantPaymentSettingDB = db.collection(Tables.RESTAURANT_PAYMENT_SETTINGS);

        this.cartAPI   			=   new cartModal(db);
        this.orderAPI  			=   new orderModal(db);
        this.offerAPI  			=   new offerModal(db);
        this.restaurantAPI  	=   new restaurantModal(db);
        this.customerAddressAPI =   new customerAddressModal(db);
        this.aghzeyaAPI 		=   new aghzeyaModal(db);
    }

	/**
	 * Function to get restaurant list
	 *
	 * @param req As Request Data
	 * @param res As Response Data
	 *
	 * @return render/json
	 */
	async selectArea (req, res,next){
		let addressId	=	req?.query?.address_id || "";
		let userId		=	req?.params?.id && new ObjectId(req.params.id)	|| "";
		let skip		=	req?.params?.skip || 0;
		let loadMore	=	req?.body?.load_more && true || false;

		if(!req?.body) req.body = {}
		req.body.skip	=	skip;
		asyncParallel({
			restaurant_list: (callback) => {
				this.getRestaurantList(req,res,next).then(restResponse=>{
					if(restResponse.status != Constants.STATUS_SUCCESS) return callback(restResponse);
					callback(null,restResponse);
				}).catch(next);
			},
			delete_unavailable_cart :(callback)=>{
				/** Get order details **/

				this.userDB.updateOne({_id: userId },{$unset : { unavailable_data:1}}).then(()=>{
					callback(null);
				}).catch(next);
			},
		}, (asyncErr, asyncResponse) => {
			if (asyncErr) return next(asyncErr);
			let restaurantList	=	(asyncResponse.restaurant_list) ? asyncResponse.restaurant_list : {};

			/** Render restaurant list  */
			res.render('restaurant_list',{
				layout : false,
				skip	: skip,
				user_id	: userId,
				data	: restaurantList,
				load_more: loadMore,
				address_id : addressId
			});
		});
	};//End selectArea()

	/**
	 * Function to get restaurants list
	 *
	 * @param req As Request Data
	 * @param res As Response Data
	 *
	 * @return render/json
	 */
	async getRestaurantList (req, res,next){
		return new Promise(resolve => {
			this.restaurantAPI.getRestaurantListWithoutArea(req,res,next).then(restResponse=>{
				resolve(restResponse);
			}).catch(next);
		}).catch(next);
	};//End getRestaurantList

	/**
	 * Function to check selection is vaild or not
	 *
	 * @param req As Request Data
	 * @param res As Response Data
	 *
	 * @return render/json
	 */
	async checkSelectionValid (req, res,next){
		return new Promise(async(resolve) => {
			let branchId		=	(req.body.branch_id) 		? new ObjectId(req.body.branch_id) 		:"";
			let userId			=	(req.body.user_id) 			? new ObjectId(req.body.user_id)		:"";
			let restaurantId	=	(req.body.restaurant_id)	? new ObjectId(req.body.restaurant_id) 	:"";
			let addressId		=	(req.body.address_id) 		? new ObjectId(req.body.address_id) 	:"";
			let deliveryBy		=	(req.body.delivery_by) 		? req.body.delivery_by 				:"";
			let scheduledTime	=	(req.body.scheduled_time)	? req.body.scheduled_time 			:"";
			let isScheduled		=	(req.body.is_scheduled) 	? parseInt(req.body.is_scheduled) 	:0;

			/** Send error response */
			if(deliveryBy == Constants.DELIVERY_BY_CRAVEZ){
				if(!addressId) return resolve({ status: Constants.STATUS_ERROR, message: res.__("admin.place_order.please_select_address") });
			}else {
				if(!branchId) return resolve({ status: Constants.STATUS_ERROR, message: res.__("admin.place_order.please_select_branch") });
			}

			let areaId = "";
			if(deliveryBy == Constants.DELIVERY_BY_CRAVEZ){
				req.params.id = addressId
				let deliveryAdressDetail = await this.getAddressDetails(req, res, next);

				/** Send error response */
				if(deliveryAdressDetail.status != Constants.STATUS_SUCCESS) return resolve(deliveryAdressDetail);

				areaId = (deliveryAdressDetail && deliveryAdressDetail.result) ? deliveryAdressDetail.result.area_id : "";
			}

			asyncParallel({
				get_branch: (parentCallback) => {
					if(deliveryBy == Constants.DELIVERY_BY_PICK_UP) return parentCallback(null,null);

					this.restaurantAPI.getRestaurantList(req,res,next).then(restResponse=>{
						parentCallback(null,restResponse);
					}).catch(next);
				},
				pickup_branch: (parentCallback) => {
					if(deliveryBy != Constants.DELIVERY_BY_PICK_UP && !isScheduled) return parentCallback(null,null);

					this.restaurantAPI.getBranchAreaDetails(req,res,next).then(restResponse=>{
						parentCallback(null,restResponse);
					}).catch(next);
				}
			}, (asyncParentErr, asyncParentRes) => {
				if (asyncParentErr) return next(asyncParentErr);

				let finalBranchDetails  = {};
				if(deliveryBy == Constants.DELIVERY_BY_CRAVEZ){
					let branchDetails	=	(asyncParentRes.get_branch && asyncParentRes.get_branch.result) ? asyncParentRes.get_branch.result[0] :{};
					branchId			=	(branchDetails && branchDetails.branch_id) ? branchDetails.branch_id : "";
					finalBranchDetails 	=	branchDetails;

					if(!branchId) return resolve({ status: Constants.STATUS_ERROR, message: res.__('admin.place_order.restaurant_not_available'), asyncParentRes: asyncParentRes });

					if((!isScheduled && !branchDetails.is_open) || !branchDetails.branch_status) return resolve({ status: Constants.STATUS_ERROR, message: res.__('admin.place_order.branch_not_available'), branchDetails: branchDetails });

					req.body.branch_id = branchId;
					if(isScheduled){
						let deliveryTime	=	(branchDetails.delivery_time) 		? 	branchDetails.delivery_time		:0;
						let preparationTime	=	(branchDetails.preparation_time) 	?	branchDetails.preparation_time	:0;
						let tmpExpectTime 	=	preparationTime+deliveryTime;
						let diffMins 		=	getDifferenceBetweenTwoDatesInMinute(newDate(),newDate(scheduledTime))-tmpExpectTime;

						if(diffMins <=0){
							return resolve({status: Constants.STATUS_ERROR, message:res.__('admin.place_order.not_allow_scheduled'), deliveryTime: deliveryTime, preparationTime: preparationTime, diffMins: diffMins, branchDetails: branchDetails });
						}
					}
				}else{
					let branchDetails	=	(asyncParentRes.pickup_branch && asyncParentRes.pickup_branch.result) ? asyncParentRes.pickup_branch.result :{};
					let preparationTime	=	(branchDetails.preparation_time) 	?	branchDetails.preparation_time	:0;
					finalBranchDetails	=	branchDetails;

					if(branchDetails.area_id) areaId = branchDetails.branchDetails;
					if(isScheduled){
						if(preparationTime){
							let diffMins =	getDifferenceBetweenTwoDatesInMinute(getUtcDate(),getUtcDate(scheduledTime))-preparationTime;
							if(diffMins <=0){
								return resolve({status: Constants.STATUS_ERROR, message:res.__('admin.place_order.not_allow_scheduled'), preparationTime: preparationTime, diffMins: diffMins, branchDetails: branchDetails });
							}
						}
					}
				}

				asyncParallel({
					check_schedule_order: (callback) => {
						if(!isScheduled) return callback(null,null);

						req.body.area_id = areaId;
						this.cartAPI.checkScheduledOrderEligible(req, res,next).then(timeResponse => {
							callback(null,timeResponse);
						}).catch(next);
					},
					valid_branch: (callback) => {
						if (deliveryBy == Constants.DELIVERY_BY_CRAVEZ) return callback(null, {});

						this.cartAPI.checkPickUpStore(req, res, next).then(pickupResponse => {
							callback(null, pickupResponse);
						}).catch(next);
					},
					valid_address: (callback) => {
						if (deliveryBy != Constants.DELIVERY_BY_CRAVEZ) return callback(null, {});

						req.body.branch_id 	=	branchId;
						req.body.area_id 	= 	areaId;
						this.cartAPI.checkDeliveryAddress(req, res, next).then(addressResponse => {
							callback(null, addressResponse);
						}).catch(next);
					},
					remove_cart : (callback) => {
						/** Set cart conditions */
						let cartConditions = {
							customer_id	 :	new ObjectId(userId),
							$or:	[
								{ restaurant_id	:	{$ne : new ObjectId(restaurantId)}},
								{ branch_id	 	:	{$ne : new ObjectId(branchId)}},
							],
						};

						if(deliveryBy == Constants.DELIVERY_BY_CRAVEZ ){
							cartConditions["$or"].push({ area_id: {$ne: areaId }});
						}

						/** Delete other restaurant modified order items */
						this.userCartDB.deleteMany(cartConditions).then(()=>{
							callback(null);
						}).catch(next);
					},
				}, (asyncErr, asyncResponse) => {
					if (asyncErr) return next(asyncErr);

					/** Send error response */
					if(asyncResponse.valid_branch.status && asyncResponse.valid_branch.status != Constants.STATUS_SUCCESS && asyncResponse.valid_branch.message){
						return resolve({ status: Constants.STATUS_ERROR, message: asyncResponse.valid_branch.message });
					}
					if(asyncResponse.valid_address.status && asyncResponse.valid_branch.status != Constants.STATUS_SUCCESS && asyncResponse.valid_address.message){
						return resolve({ status: Constants.STATUS_ERROR, message: asyncResponse.valid_address.message });
					}

					if(isScheduled){
						let orderScheduleResponse	= (asyncResponse.check_schedule_order) ? asyncResponse.check_schedule_order :{};

						if(orderScheduleResponse && orderScheduleResponse.status != Constants.STATUS_SUCCESS) return resolve(orderScheduleResponse);

						if(!orderScheduleResponse.branch_available){
							return resolve({status: Constants.STATUS_ERROR, message: res.__('admin.place_order.not_available_at_this_time')});
						}
					}

					let validBranch 		=	(asyncResponse.valid_branch)		? 	asyncResponse.valid_branch.branch_available	:{};
					let validAddress		= 	(asyncResponse.valid_address) 		?	asyncResponse.valid_address	:{};

					if(deliveryBy == Constants.DELIVERY_BY_CRAVEZ && !validAddress.is_delivery) {
						return resolve({ status: Constants.STATUS_ERROR, message: validAddress.message });
					}

					if(deliveryBy != Constants.DELIVERY_BY_CRAVEZ && !validBranch) {
						return resolve({ status: Constants.STATUS_ERROR, message: res.__('admin.place_order.branch_not_available') });
					}

					/** send success response */
					resolve({
						status			: Constants.STATUS_SUCCESS,
						area_id			: areaId,
						branch_id 		: branchId,
						branch_details	: finalBranchDetails,
					});
				});
			});
		}).catch(next);
	}// end checkSelectionValid()

	/**
	 * Function to get item with category
	 *
	 * @param req As Request Data
	 * @param res As Response Data
	 *
	 * @return render/json
	 */
	async getCategoryListWithItem  (req, res,next){
		let userId			=	(req.body.user_id) 			? req.body.user_id 			:"";
		let deliveryBy		=	(req.body.delivery_by) 		? req.body.delivery_by 		:"";
		let addressId		=	(req.body.address_id) 		? req.body.address_id 		:"";
		let scheduledTime	=	(req.body.scheduled_time)	? req.body.scheduled_time 	:"";
		let isScheduled		=	(req.body.is_scheduled) 	? req.body.is_scheduled		:0;
		let restaurantId	=	(req.body.restaurant_id)	? req.body.restaurant_id 	:"";

		/** Check selection is vaild or not  */
		this.checkSelectionValid(req,res,next).then(selectionRes=>{
			if(selectionRes.status != Constants.STATUS_SUCCESS) return res.send(selectionRes);

			let areaId		=	(selectionRes.area_id)	?	selectionRes.area_id 	:"";
			let branchId	=	(selectionRes.branch_id)? 	selectionRes.branch_id	:"";
			asyncParallel({
				category_list: (callback) => {
					if(areaId) req.body.area_id = areaId;

					/** Get Item list with category */
					this.restaurantAPI.getCategoryListWithItem(req,res,next).then(itemResponse=>{
						if(itemResponse.status != Constants.STATUS_SUCCESS) return callback(itemResponse);
						callback(null,itemResponse);
					}).catch(next);
				},
			}, (asyncErr, asyncResponse) => {
				if (asyncErr) return next(asyncErr);

				/** Render category and item list */
				res.render('category_item_list',{
					layout 			: false,
					item_list 		: asyncResponse.category_list,
					branch_details 	: selectionRes.branch_details,
					user_id			: userId,
					area_id			: areaId,
					restaurant_id 	: restaurantId,
					branch_id 		: branchId,
					scheduled_time	: scheduledTime,
					is_scheduled	: String(isScheduled),
					address_id		: addressId,
					delivery_by		: deliveryBy
				});
			});
		}).catch(next);
	};//End getCategoryListWithItem()

	/**
	 * Function to get item list
	 *
	 * @param req As Request Data
	 * @param res As Response Data
	 *
	 * @return render/json
	 */
	async getItemList (req, res,next){
		return new Promise(resolve => {
			this.restaurantAPI.getItemList(req,res,next).then(itemResponse=>{
				resolve(itemResponse);
			}).catch(next);
		}).catch(next);
	};//End getItemList

	/**
	 * Function to get resturant item detail
	 *
	 * @param req As Request Data
	 * @param res As Response Data
	 *
	 * @return render/json
	 */
	async getResturantItemDetails (req, res,next){
		req.session.deal_form = {};
		let areaId			=	(req.body.area_id) 			? 	new ObjectId(req.body.area_id) 	:"";
		let itemId			=	(req.body.item_id) 			? 	new ObjectId(req.body.item_id) 	:"";
		let customerId		=	(req.body.user_id) 			?	req.body.user_id 			:"";
		let restaurantId	=	(req.body.restaurant_id) 	? 	req.body.restaurant_id 		:"";
		let branchId		=	(req.body.branch_id) 		? 	req.body.branch_id 			:"";
		let scheduledTime	=	(req.body.scheduled_time) 	? 	req.body.scheduled_time 	:"";
		let isScheduled		=	(req.body.is_scheduled) 	? 	req.body.is_scheduled 		:"";
		let addressId		=	(req.body.address_id) 		? 	req.body.address_id 		:"";
		let deliveryBy		=	(req.body.delivery_by) 		?	req.body.delivery_by 		:"";

		asyncParallel({
			get_item_details :(childCallback)=>{
				/** Get item details */
				this.restaurantAPI.getItemDetails(req,res,next).then(response=>{
					if(response.status != Constants.STATUS_SUCCESS) return childCallback(response.message);
					childCallback(null,response);
				}).catch(next);
			},
			remove_cart : (callback) => {
				/** Set cart conditions */
				let cartConditions = {
					customer_id	 :	new ObjectId(customerId),
					$or 	:	[
						{ restaurant_id	:	{$ne : new ObjectId(restaurantId)}},
						{ branch_id	 	:	{$ne : new ObjectId(branchId)}},
					],
				};

				/** Delete other restaurant modified order items */
				this.userCartDB.deleteMany(cartConditions).then(()=>{
					callback(null);
				}).catch(next);
			},
		},(addCartErr, addCartAsyncResponse)=>{
			if(addCartErr) return next(addCartErr);

			let itemDetailResponse	= (addCartAsyncResponse.get_item_details) ? addCartAsyncResponse.get_item_details :{};
			let cartId				= (itemDetailResponse.item_details.cart_id)? itemDetailResponse.item_details.cart_id :"";
			asyncParallel({
				cart_data :(secondChildcallback)=>{
					if(cartId == "") return secondChildcallback(null,null);

					/** Get detail of User Cart **/
					userCarts.findOne({_id: cartId},(cartErr, cartResult)=>{
						secondChildcallback(cartErr,cartResult);
					});
				},
			},(cartErr, cartResponse)=>{
				if(cartErr) return next(cartErr);
				let cartData		=	(cartResponse.cart_data) ? cartResponse.cart_data :{};
				let cartUnitId	 	=	"";
				let cartDoughId		=	"";
				let cartSelectorId	=	"";
				let cartExtraItem 	=	{};
				let unitLists		=	{};
				let unitData		=	[];
				let doughData 		=	[];
				let selectorData 	=	[];
				let extraData 		=	[];
				let extraGroupData 	=	[];
				let extraItemIds 	=	[];
				let itemType		=	(cartData.item_type) 	? cartData.item_type : {};
				if(itemType == Constants.HALF_AND_HALF_ITEM){
					cartUnitId	 	=	(cartData.unit_id) 		? cartData.unit_id : "";
					cartDoughId		=	(cartData.dough_id) 	? cartData.dough_id : "";
					unitLists		=	(cartData.unit_lists) 	? cartData.unit_lists : {};
					if(unitLists.length > 0){
						unitLists.map((records,key)=>{
							selectorData[key] = records.selector_id;
							extraData = records.extra_items;
							if(extraData.length > 0){
								extraData.map((eRecords,eKey)=>{
									extraItemIds = 	eRecords.extra_item_ids;
									if(extraItemIds.length > 0){
										extraItemIds.map((cExtraRecords,cExtraKey)=>{
											if(!extraGroupData[key]) extraGroupData[key] = [];
											extraGroupData[key].push(cExtraRecords.extra_group_item_id);
										});
									}
								});
							}
						});
					}
				}else if(itemType == Constants.DEAL_ITEM){
					unitLists		=	(cartData.unit_lists) 	? cartData.unit_lists : {};
					cartExtraItem 	=	(cartData.extra_items) 	? cartData.extra_items : {};
					deviceUniqueId 	= 	(cartData.device_id)	? cartData.device_id	:""	;
					cartId		 	= 	(cartData._id)	? cartData._id	:""	;
					if(unitLists.length > 0){
						unitLists.map((records,key)=>{
							unitId 			= records.unit_id;
							itemUnitId 		= records.item_unit_id;
							doughId 		= records.dough_id;
							selectorId 		= records.selector_id;
							extraData 		= records.extra_items;
							let dealItemspush		=	{
								"cart_id"			: cartId,
								"user_id"			: "",
								"unit_id"			: unitId,
								"selector_id"		: selectorId,
								"item_unit_id"		: itemUnitId,
								"dough_id"			: doughId,
								"extra_items"		: extraData,
							};
							sessionKey	=	key+1;
							if(dealItemspush){
								if(!req.session.deal_form)  req.session.deal_form = {};
								req.session.deal_form[deviceUniqueId+"_"+orderId+"_"+sessionKey] = dealItemspush;
							}
							unitData[key] 		= 	unitId;
							doughData[key] 		= 	doughId;
							selectorData[key] 	=	selectorId;
							if(extraData.length > 0){
								extraData.map((eRecords,eKey)=>{
									extraItemIds = 	eRecords.extra_item_ids;
									if(extraItemIds.length > 0){
										extraItemIds.map((cExtraRecords,cExtraKey)=>{
											if(!extraGroupData[key]) extraGroupData[key] = [];
											extraGroupData[key].push(cExtraRecords.extra_group_item_id);
										});
									}
								});
							}
						});
					}
				}else{
					cartUnitId	 	=	(cartData.unit_id) 		? cartData.unit_id : "";
					cartDoughId		=	(cartData.dough_id) 	? cartData.dough_id : "";
					cartExtraItem 	=	(cartData.extra_items) 	? cartData.extra_items : {};
					cartSelectorId	=	(cartData.selector_id) 	? cartData.selector_id : "";
				}
				let doughItem = {};
				let selector = {};
				let itemUnitList	=	itemDetailResponse.item_unit_list;
				itemDetailResponse.dough_list		=	{};
				itemDetailResponse.selector_list 	=   {};
				if(itemUnitList.length >0){
					let unitId	=	"";
					itemUnitList.map(records=>{
						let tmpDoughItem =[];
						unitId		=	records.unit_id;
						if(records.dough_list && records.dough_list.length >0 && unitId != ""){
							records.dough_list.map(data=>{
								let tmpSelectItem=[];
								doughId		=	data._id;
								if(doughId){
									tmpDoughItem.push({
										id	:	data._id,
										price	: data.price,
										unit_name: data.unit_name,
										item_unit_id: data.item_unit_id,
									});
									/** For Selector Array*/
									if(data.selector_list && data.selector_list.length >0){
										data.selector_list.map(selectData=>{
											if(selectData._id){
												tmpSelectItem.push({
													id			:	selectData._id,
													price		: 	selectData.price,
													unit_name	: 	selectData.unit_name,
													item_unit_id: 	selectData.item_unit_id,
													sorting		:	selectData.sorting
												});
											}
										});
										let tmpSelectItemLength	=	tmpSelectItem.length;
										if(tmpSelectItemLength >0){
											selector[doughId] = tmpSelectItem;
										}
									}
								}
							});
							let tmpDoughItemLength	=	tmpDoughItem.length;
							if(tmpDoughItemLength >0){
								doughItem[unitId] 	= tmpDoughItem;
							}
							itemDetailResponse.dough_list 		=	doughItem;
							itemDetailResponse.selector_list 	=   selector;
						}
					});
				}

				/** Render item details page */
				let itemDetails	=	(itemDetailResponse) ? itemDetailResponse : {};
				res.render('item_details',{
					layout			:	false,
					item_detail		:	itemDetails,
					unit_id			:	cartUnitId,
					dough_id		:	cartDoughId,
					selector_id		:	cartSelectorId,
					extra_items		:	cartExtraItem,
					unit_lists		:	unitLists,
					unit_data		:	unitData,
					dough_data 		:	doughData,
					extra_group_data:	extraGroupData,
					selector_data 	:	selectorData,
					restaurant_id	:	restaurantId,
					branch_id		:	branchId,
					item_id			:	itemId,
					customer_id		:	customerId,
					area_id			:	areaId,
					scheduled_time	: 	scheduledTime,
					is_scheduled	: 	isScheduled,
					address_id		: 	addressId,
					delivery_by		: 	deliveryBy,
				});
			});
		});
	};// end getResturantItemDetails()

	/**
	 * Function for get choice items details for backend
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 * @param next 	As Callback argument to the middleware function
	 *
	 * @return render/json
	 */
	async getChoiceItem (req, res,next){
		if(isPost(req)){
			/** Sanitize Data **/
			req.body	=	sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
			this.restaurantAPI.getItemChoiceList(req,res,next).then(response=>{
				/** Send response */
				res.send({
					status		:	(response.status) 	? 	response.status	:"",
					data		: 	(response.result)	?	response.result	:[],
					itemDetails	: 	response.itemDetails || {},
				});
			}).catch(next);
		}
	};// end getChoiceItem()

	/**
	 * Function to item add in cart from item deatail section
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 *
	 * @return render/json
	*/
	async updateNewItemsInCart  (req, res,next){
		if(isPost(req)){
			/** Sanitize Data **/
			req.body	  	=	sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
			let itemType	= 	(req.body.item_type)	? req.body.item_type	:"";

			/**HALF AND HALF**/
			if(itemType == Constants.HALF_AND_HALF_ITEM){
				let unitLists	= (req.body.unit_lists)	? req.body.unit_lists	:[];
				let errors=	[];
				let itemUnitCount		= (req.body.item_unit_count)	? req.body.item_unit_count	:0;
				let itemDoughCount		= (req.body.item_dough_count)	? req.body.item_dough_count	:0;
				if(itemUnitCount > 0){
					let unitId		=	(req.body.unit_id) ? req.body.unit_id : "";
					if(unitId == ""){
						errors.push({param: "unit_id", msg: res.__("admin.order.please_select_unit_id")});
					}
				}
				if(itemDoughCount > 0){
					let doughId		=	(req.body.dough_id) ? req.body.dough_id : "";
					if(doughId == ""){
						errors.push({param: "dough_id", msg: res.__("admin.order.please_select_dough_id")});
					}
				}

				let unitExtraIds = [];
				if(unitLists.length >0){
					unitLists.map((unitRecords,unitKeys)=>{
						let extraIds = [];
						let selectorId		= (unitRecords.selector_id)	? unitRecords.selector_id	:"";
						let extraItems		= (unitRecords.extra_items)	? unitRecords.extra_items	:[];
						if(extraItems.length >0){
							extraItems.map(records=>{
								let tmpExtraItem =[];
								let maxRecord	=	records.max_quantity;
								let minRecord	=	records.min_quantity;
								let groupId		=	records.group_id;
								if(records.extra_item_ids && records.extra_item_ids.length >0){
									records.extra_item_ids.map(data=>{
										if(data.extra_group_item_id){
											tmpExtraItem.push({
												extra_item_id 		: data.extra_item_id,
												extra_group_item_id : data.extra_group_item_id,
											});
										}
									});
								}
								let tmpLength	=	tmpExtraItem.length;
								unitKeys	=	unitKeys+1;
								if(minRecord > 0 && maxRecord > 0){
									if(minRecord > tmpLength){
										errors.push({param: "unit_lists_"+unitKeys+"_extra_items_"+groupId, msg: res.__("admin.order.please_select_extra_items_min")});
									}
									if(tmpLength > maxRecord){
										errors.push({param: "unit_lists_"+unitKeys+"_extra_items_"+groupId, msg: res.__("admin.order.please_select_extra_items_max")});
									}
								}else if(minRecord == 0 && maxRecord > 0){
									if(tmpLength > maxRecord){
										errors.push({param: "unit_lists_"+unitKeys+"_extra_items_"+groupId, msg: res.__("admin.order.please_select_extra_items_max")});
									}
								}
								if(tmpLength >0){
									extraIds.push({
										group_id 		: groupId,
										extra_item_ids 	: tmpExtraItem,
									});
								}
							});
						}
						if(extraIds.length >0){
							unitExtraIds.push({
								selector_id		:	selectorId,
								extra_items		: 	extraIds,
							});
						}
					});
				}
				/** Send error response **/
				if(errors.length > 0) return res.send({status: Constants.STATUS_ERROR, message: errors});
				let orderId 		= (req.body.order_id) 		? req.body.order_id 	: "";
				let userId 			= (req.body.user_id) 		? req.body.user_id 		: "";
				let deviceId 		= (req.body.device_id) 		? req.body.device_id 	: "";

				req.body.user_id		=	userId;
				req.body.unit_lists		= (unitExtraIds) ? unitExtraIds: "";
				this.cartAPI.updateCart(req,res,next).then(response=>{
					if(response.status != Constants.STATUS_SUCCESS) return next(response.message);
					res.send(response);
				}).catch(next);
			/**DEAL ITEM CONDITION**/
			}else if(itemType == Constants.DEAL_ITEM){
				let errors=	[];
				let extraIds = [];
				let totalDealComponents = (req.body.total_deal_components) 		? req.body.total_deal_components 	: "";
				dealFormSession	=	(req.session.deal_form) ? req.session.deal_form :{};
				sessionLength	=	Object.keys(dealFormSession).length;
				if(sessionLength > 0 && sessionLength==totalDealComponents){
					let dealExtraItems		= (req.body.deal_extra_items)	? req.body.deal_extra_items	:[];
					if(dealExtraItems.length >0){
						dealExtraItems.map(records=>{
							let tmpExtraItem =[];
							let maxRecord	=	records.max_quantity;
							let minRecord	=	records.min_quantity;
							let groupId		=	records.group_id;

							if(records.extra_item_ids && records.extra_item_ids.length >0){
								records.extra_item_ids.map(data=>{
									if(data.extra_group_item_id){
										tmpExtraItem.push({
											extra_item_id 		: data.extra_item_id,
											extra_group_item_id : data.extra_group_item_id,
										});
									}
								});
							}
							let tmpLength	=	tmpExtraItem.length;
							if(minRecord > 0 && maxRecord > 0){
								if(minRecord > tmpLength){
									errors.push({param: "deal_extra_items_"+groupId, msg: res.__("admin.order.please_select_extra_items_min")});
								}
								if(tmpLength > maxRecord){
									errors.push({param: "deal_extra_items_"+groupId, msg: res.__("admin.order.please_select_extra_items_max")});
								}
							}else if(minRecord == 0 && maxRecord > 0){
								if(tmpLength > maxRecord){
									errors.push({param: "deal_extra_items_"+groupId, msg: res.__("admin.order.please_select_extra_items_max")});
								}
							}
							if(tmpLength >0){
								extraIds.push({
									group_id 		: records.group_id,
									extra_item_ids 	: tmpExtraItem,
								});
							}
						});
					}
				}else{
					errors.push({param: "choose_pizza", msg: res.__("admin.order.please_select_pizza_value")});
				}
				/** Send error response **/
				if(errors.length > 0) return res.send({status: Constants.STATUS_ERROR, message: errors});
				let orderId 		= (req.body.order_id) 		? req.body.order_id 	: "";
				let userId 			= (req.body.user_id) 		? req.body.user_id 		: "";
				let deviceId 		= (req.body.device_id) 		? req.body.device_id 	: "";
				if(userId){
					req.body.device_id	=	userId;
				}else{
					req.body.device_id	=	deviceId;
				}
				let unitExtraIds	=	[];
				if(Object.keys(dealFormSession).length >0){
					Object.keys(dealFormSession).map(dealRecords=>{
						unitExtraIds.push(dealFormSession[dealRecords]);
					});
				}
				if(errors.length > 0) return res.send({status: Constants.STATUS_ERROR, message: errors});
				if(req.body.unit_id) 		delete req.body.unit_id;
				if(req.body.extra_items) 	delete req.body.extra_items;
				if(req.body.selector_id) 	delete req.body.selector_id;
				if(req.body.item_unit_id) 	delete req.body.item_unit_id;
				if(req.body.dough_id) 		delete req.body.dough_id;
				if(req.body.deal_extra_items) 		delete req.body.deal_extra_items;
				req.body.unit_lists		= (unitExtraIds) ? unitExtraIds: "";
				req.body.extra_items	= (extraIds) ? extraIds: "";
				this.cartAPI.updateCart(req,res,next).then(response=>{
					if(response.status != Constants.STATUS_SUCCESS) return next(response.message);
					req.session.deal_form = {};
					res.send(response);
				}).catch(next);
			}else{
				let errors=	[];
				let itemUnitCount		= (req.body.item_unit_count)	? req.body.item_unit_count	:0;
				let itemDoughCount		= (req.body.item_dough_count)	? req.body.item_dough_count	:0;
				if(itemUnitCount > 0){
					let unitId		=	(req.body.unit_id) ? req.body.unit_id : "";
					if(unitId == ""){
						errors.push({param: "unit_id", msg: res.__("admin.order.please_select_unit_id")});
					}
				}
				if(itemDoughCount > 0){
					let doughId		=	(req.body.dough_id) ? req.body.dough_id : "";
					if(doughId == ""){
						errors.push({param: "dough_id", msg: res.__("admin.order.please_select_dough_id")});
					}
				}
				let extraItems		= (req.body.extra_items)	? req.body.extra_items	:[];

				let extraIds = [];
				if(extraItems.length >0){
					extraItems.map(records=>{
						let tmpExtraItem =[];
						let maxRecord	=	records.max_quantity;
						let minRecord	=	records.min_quantity;
						let groupId		=	records.group_id;
						let simphony	=	records.simphony ? parseInt(records.simphony) :Constants.DEACTIVE;
						let totalQty 	= 	0;

						if(records.extra_item_ids && records.extra_item_ids.length >0){
							records.extra_item_ids.map(data=>{
								if(data.extra_group_item_id){
									let qty = simphony && data.qty > 0 ? parseInt(data.qty) :1;

									if(simphony) totalQty += qty;

									tmpExtraItem.push({
										extra_item_id 		: data.extra_item_id,
										extra_group_item_id : data.extra_group_item_id,
										qty 				: qty,
									});
								}
							});
						}

						let tmpLength	=	simphony ? totalQty :tmpExtraItem.length;
						if(minRecord > 0 && maxRecord > 0){
							if(minRecord > tmpLength){
								errors.push({param: "extra_items_"+groupId, msg: res.__("admin.order.please_select_extra_items_min")});
							}
							if(tmpLength > maxRecord){
								errors.push({param: "extra_items_"+groupId, msg: res.__("admin.order.please_select_extra_items_max")});
							}
						}else if(minRecord == 0 && maxRecord > 0){
							if(tmpLength > maxRecord){
								errors.push({param: "extra_items_"+groupId, msg: res.__("admin.order.please_select_extra_items_max")});
							}
						}

						if(tmpLength >0){
							extraIds.push({
								simphony 		: simphony,
								group_id 		: records.group_id,
								extra_item_ids 	: tmpExtraItem,
							});
						}
					});
				}
				/** Send error response **/
				if(errors.length > 0) return res.send({status: Constants.STATUS_ERROR, message: errors});
				req.body.extra_items	= (extraIds) ? extraIds: [];

				this.cartAPI.updateCart(req,res,next).then(response=>{
					res.send(response);
				}).catch(next);
			}
		}
	};//updateNewItemsInCart()

	/**
	 * Function to item add in cart from item deatail section
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 *
	 * @return render/json
	*/
	async updateDealItems  (req, res,next){
		if(isPost(req)){
			/** Sanitize Data **/
			req.body	  		= sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
			let itemType		= (req.body.item_type)	? req.body.item_type	:"";
			if(itemType == Constants.DEAL_ITEM){
				let extraItems		= (req.body.extra_items)	? req.body.extra_items	:[];
				let errors=	[];
				let itemUnitCount		= (req.body.item_unit_count)	? req.body.item_unit_count	:0;
				let itemDoughCount		= (req.body.item_dough_count)	? req.body.item_dough_count	:0;
				let itemSelectorCount	= (req.body.item_selector_count)	? req.body.item_selector_count	:0;
				if(itemUnitCount > 0){
					let unitId		=	(req.body.unit_id) ? req.body.unit_id : "";
					if(unitId == ""){
						errors.push({param: "unit_id", msg: res.__("admin.order.please_select_unit_id")});
					}
				}
				if(itemDoughCount > 0){
					let doughId		=	(req.body.dough_id) ? req.body.dough_id : "";
					if(doughId == ""){
						errors.push({param: "dough_id", msg: res.__("admin.order.please_select_dough_id")});
					}
				}
				if(itemSelectorCount > 0){
					let selectorId		=	(req.body.selector_id) ? req.body.selector_id : "";
					if(selectorId == ""){
						errors.push({param: "selector_id", msg: res.__("admin.order.please_select_selector_id")});
					}
				}
				let extraIds = [];
				if(extraItems.length >0){
					extraItems.map(records=>{
						let tmpExtraItem =[];
						let maxRecord	=	records.max_quantity;
						let minRecord	=	records.min_quantity;
						let groupId		=	records.group_id;

						if(records.extra_item_ids && records.extra_item_ids.length >0){
							records.extra_item_ids.map(data=>{
								if(data.extra_group_item_id){
									tmpExtraItem.push({
										extra_item_id 		: data.extra_item_id,
										extra_group_item_id : data.extra_group_item_id,
									});
								}
							});
						}
						let tmpLength	=	tmpExtraItem.length;
						if(minRecord > 0 && maxRecord > 0){
							if(minRecord > tmpLength){
								errors.push({param: "extra_items_"+groupId, msg: res.__("admin.order.please_select_extra_items_min")});
							}
							if(tmpLength > maxRecord){
								errors.push({param: "extra_items_"+groupId, msg: res.__("admin.order.please_select_extra_items_max")});
							}
						}else if(minRecord == 0 && maxRecord > 0){
							if(tmpLength > maxRecord){
								errors.push({param: "extra_items_"+groupId, msg: res.__("admin.order.please_select_extra_items_max")});
							}
						}
						if(tmpLength >0){
							extraIds.push({
								group_id 		: records.group_id,
								extra_item_ids 	: tmpExtraItem,
							});
						}
					});
				}
				/** Send error response **/
				if(errors.length > 0) return res.send({status: Constants.STATUS_ERROR, message: errors});
				let orderId 		= (req.body.order_id) 		? req.body.order_id 	: "";
				let userId 			= (req.body.user_id) 		? req.body.user_id 		: "";
				let deviceId 		= (req.body.device_id) 		? req.body.device_id 	: "";

				deviceUniqueId		=	userId;
				req.body.user_id	=	userId;
				if(req.body.item_id) 			delete req.body.item_id;
				if(req.body.order_id) 			delete req.body.order_id;
				if(req.body.restaurant_id) 		delete req.body.restaurant_id;
				if(req.body.branch_id) 			delete req.body.branch_id;
				if(req.body.area_id) 			delete req.body.area_id;
				if(req.body.device_id) 			delete req.body.device_id;
				if(req.body.item_type) 			delete req.body.item_type;
				if(req.body.deal_extra_items) 	delete req.body.deal_extra_items;
				if(req.body.qty)	  			delete req.body.qty;
				req.body.extra_items	= (extraIds) ? extraIds: "";
				dealForm				= (req.body.deal_form) 	? req.body.deal_form 	: 0;
				if(req.body){
					if(!req.session.deal_form)  req.session.deal_form = {};
					req.session.deal_form[deviceUniqueId+"_"+dealForm] = req.body;
					res.send({status: Constants.STATUS_SUCCESS,data:req.session.deal_form});
				}
			}
		}
	};//updateDealItems()

	/**
	 * Function to apply offer promo code
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 *
	 * @return render/json
	*/
	async applyCoupon  (req, res,next){
		if(isPost(req)){
			/** Sanitize Data **/
			req.body			= sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
			let offerCode 		= (req.body.offer_code) 	? req.body.offer_code 		: "";
			let branchId 		= (req.body.branch_id) 		? req.body.branch_id		: "";
			let restaurantId 	= (req.body.restaurant_id) 	? req.body.restaurant_id	: "";
			let userId 			= (req.body.user_id) 		? req.body.user_id 			: "";
			req.body.user_id		=	userId;
			req.body.branch_id		=	branchId;
			req.body.restaurant_id	=	restaurantId;
			req.body.offer_code		=	offerCode;
			this.offerAPI.checkOffer(req,res,next).then(response=>{
				res.send(response);
			}).catch(next);
		}
	};//applyCoupon()

	/**
	 * Function to delete items from cart
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 *
	 * @return render/json
	*/
	async deleteItemCart  (req, res,next){
		if(isPost(req)){
			/** Sanitize Data **/
			req.body = 	sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
			this.cartAPI.removeCartItems(req,res,next).then(response=>{
				res.send({
					status  : Constants.STATUS_SUCCESS,
					message : response.message
				});
			}).catch(next);
		}
	}//deleteItemCart()

	/**
	 * Function to get cart list
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 *
	 * @return render/json
	*/
	async myCart (req, res,next){
		let userId			=	(req.body.user_id) 			?	req.body.user_id 		:"";
		let restaurantId	=	(req.body.restaurant_id) 	? 	req.body.restaurant_id 	:"";
		let areaId			=	(req.body.area_id) 			? 	req.body.area_id 		:"";
		let scheduledTime	=	(req.body.scheduled_time) 	? 	req.body.scheduled_time :"";
		let isScheduled		=	(req.body.is_scheduled)		? 	req.body.is_scheduled 	:"";
		let addressId		=	(req.body.address_id) 		? 	req.body.address_id 	:"";
		let deliveryBy		=	(req.body.delivery_by) 		?	req.body.delivery_by 	:"";

		asyncParallel({
			get_cart_list :(callback)=>{
				this.cartAPI.getCartList(req,res,next).then(response=>{
					if(response.status != Constants.STATUS_SUCCESS) return callback(response.message);
					callback(null,response);
				}).catch(next);
			},
			unavailable_items_list :(callback)=>{
				this.cartAPI.getUnavailableItemList(req,res,next).then(response=>{
					if(response.status != Constants.STATUS_SUCCESS) return callback(response.message);
					callback(null,response);
				}).catch(next);
			},
		},(asyncErr, asyncResponse)=>{
			if(asyncErr) return next(asyncErr);
			let getCartList				=	(asyncResponse.get_cart_list) ? asyncResponse.get_cart_list : [];
			let unavailableItemsList	=	(asyncResponse.unavailable_items_list) ? asyncResponse.unavailable_items_list : [];
			res.render('my_cart',{
				layout					:	false,
				cart_list				:	getCartList,
				unavailable_items_list	:	unavailableItemsList,
				restaurant_id			: 	restaurantId,
				user_id					: 	userId,
				scheduled_time			: 	scheduledTime,
				is_scheduled			: 	isScheduled,
				address_id				: 	addressId,
				delivery_by				: 	deliveryBy,
				area_id					:	areaId
			});
		});
	};// end myCart()

	/**
	 * Function for change quntity order for backend
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 * @param next 	As Callback argument to the middleware function
	 *
	 * @return render/json
	 */
	async changeQuantity (req, res,next){
		req.session.deal_form = {};
		let itemId			=	(req.params.item_id) 		? 	new ObjectId(req.params.item_id) 	:"";
		let extraParam		=	(req.params.extra_param) 	? 	req.params.extra_param 			:"";
		let orderResult		=	(asyncResponse.order_data) 	? 	asyncResponse.order_data 		:{};
		let customerId		=	(orderResult.customer_id) 	? 	orderResult.customer_id 		:"";
		let deviceId		=	(orderResult.device_id) 	? 	orderResult.device_id 			:"";
		let restaurantId	=	(orderResult.restaurant_id) ? 	orderResult.restaurant_id 		:"";
		let areaId			=	(orderResult.area_id) 		? 	orderResult.area_id 			:"";
		let branchId		=	(orderResult.branch_id) 	? 	orderResult.branch_id 			:"";
		let cartId			=	(orderResult.cart_id) 		? 	orderResult.cart_id 			:"";
		let orderItems		=	(asyncResponse.order_items) ?	asyncResponse.order_items 		:{};

		asyncParallel({
			update_cart :(childCallback)=>{
				if(extraParam != 'addtocart') return childCallback(null,null);
				if(orderItems){
					let itemId				=	(orderItems.item_id)  			? orderItems.item_id :"";
					let itemUnitId			=	(orderItems.item_unit_id)  		? orderItems.item_unit_id :"";
					let qty					=	(orderItems.qty)  	  			? orderItems.qty :"";
					let unitId				=	(orderItems.unit_id)  			? orderItems.unit_id :"";
					let doughId				=	(orderItems.dough_id)  			? orderItems.dough_id :"";
					let selectorId			=	(orderItems.selector_id)  		? orderItems.selector_id :"";
					let itemType			=	(orderItems.item_type)  		? orderItems.item_type :"";
					let price				=	(orderItems.price)  			? orderItems.price :"";
					let subTotal			=	(orderItems.sub_total)  		? orderItems.sub_total :"";
					let discountedPrice		=	(orderItems.discounted_price)  	? orderItems.discounted_price :"";
					let netAmount			=	(orderItems.net_amount) 		? orderItems.net_amount :"";
					/**Half And Half Type Item Add In Cart**/
					if(itemType == Constants.HALF_AND_HALF_ITEM){
						let unitLists	= (orderItems.unit_lists)	? orderItems.unit_lists	:[];
						let unitExtraIds = [];
						if(unitLists.length >0){
							unitLists.map(unitRecords=>{
								let selectorId		= (unitRecords.selector_id)	? unitRecords.selector_id	:"";
								let extraItems		= (unitRecords.extra_items)	? unitRecords.extra_items	:[];
								let extraIds = [];
								if(extraItems.length >0){
									extraItems.map(extraRecord=>{
										let tmpExtraItem 	=	[];
										let groupId			=	extraRecord.group_id;
										let extraItemIds			=	extraRecord.extra_item_ids;
										if(extraItemIds.length > 0 ){
											extraItemIds.map(extraIdRecord=>{
												tmpExtraItem.push({
													extra_item_id 		: extraIdRecord.extra_item_id,
													extra_group_item_id : extraIdRecord.extra_group_item_id,
												});
											});
										}
										if(tmpExtraItem.length >0){
											extraIds.push({
												group_id 		:	groupId,
												extra_item_ids 	: 	tmpExtraItem,
											});
										}
									});
								}
								if(extraIds.length >0){
									unitExtraIds.push({
										selector_id		:	selectorId,
										extra_items		: 	extraIds,
									});
								}
							});
						}
						let orderItemspush		=	{
							"is_admin"			: true,
							"item_unit_id"		: itemUnitId,
							"device_id"			: deviceId,
							"cart_id"			: cartId,
							"restaurant_id"		: restaurantId,
							"branch_id"			: branchId,
							"area_id"			: areaId,
							"qty"				: qty,
							"item_id"			: itemId,
							"unit_id"			: unitId,
							"dough_id"			: doughId,
							"item_type"			: itemType,
							"price"         	: price,
							"sub_total"    		: subTotal,
							"discounted_price"	: discountedPrice,
							"net_amount"    	: netAmount,
							"unit_lists"		: unitExtraIds
						};
						req.body				=	orderItemspush;
						this.cartAPI.updateCart(req,res,next).then(response=>{
							if(response.status != Constants.STATUS_SUCCESS) return childCallback(response.message);
							childCallback(null);
						}).catch(next);
					/**Deal Type Item Add In Cart**/
					}else if(itemType == Constants.DEAL_ITEM){
						let dealUnitLists	= (orderItems.unit_lists)	? orderItems.unit_lists	:[];
						let extraItems	= (orderItems.extra_items)	? orderItems.extra_items	:[];
						let extraIds = [];
						if(extraItems.length >0){
							extraItems.map(extraRecord=>{
								let tmpExtraItem =[];
								let groupId		=	extraRecord.group_id;
								if(extraRecord.extra_item_id){
									tmpExtraItem.push({
										extra_item_id 		: extraRecord.extra_item_id,
										extra_group_item_id : extraRecord.extra_item_group_id,
									});
								}
								if(tmpExtraItem.length >0){
									extraIds.push({
										group_id 		:	groupId,
										extra_item_ids 	: 	tmpExtraItem,
									});
								}
							});
						}
						let dealUnitExtraIds = [];
						if(dealUnitLists.length >0){
							dealUnitLists.map(dealUnitRecords=>{
								let unitId			= (dealUnitRecords.unit_id)	? dealUnitRecords.unit_id	:"";
								let itemUnitId		= (dealUnitRecords.item_unit_id) ? dealUnitRecords.item_unit_id	:"";
								let doughId			= (dealUnitRecords.dough_id)	? dealUnitRecords.dough_id	:"";
								let selectorId		= (dealUnitRecords.selector_id)	? dealUnitRecords.selector_id	:"";
								let dealExtraItems		= (dealUnitRecords.extra_items)	? dealUnitRecords.extra_items :[];
								let dealExtraIds = [];
								if(dealExtraItems.length >0){
									dealExtraItems.map(extraRecord=>{
										let tmpExtraItem 	=	[];
										let groupId			=	extraRecord.group_id;
										let dealExtraItemIds			=	extraRecord.extra_item_ids;
										if(dealExtraItemIds.length > 0 ){
											dealExtraItemIds.map(extraIdRecord=>{
												tmpExtraItem.push({
													extra_item_id 		: extraIdRecord.extra_item_id,
													extra_group_item_id : extraIdRecord.extra_group_item_id,
												});
											});
										}
										if(tmpExtraItem.length >0){
											dealExtraIds.push({
												group_id 		:	groupId,
												extra_item_ids 	: 	tmpExtraItem,
											});
										}
									});
								}
								if(dealExtraIds.length >0){
									dealUnitExtraIds.push({
										unit_id			:	unitId,
										item_unit_id	:	itemUnitId,
										dough_id		:	doughId,
										selector_id		:	selectorId,
										extra_items		: 	dealExtraIds,
									});
								}
							});
							let dealItemspush		=	{
								"is_admin"			: true,
								"device_id"			: deviceId,
								"cart_id"			: cartId,
								"item_id"			: itemId,
								"restaurant_id"		: restaurantId,
								"branch_id"			: branchId,
								"area_id"			: areaId,
								"qty"				: qty,
								"item_type"			: itemType,
								"unit_lists"		: dealUnitExtraIds,
								"extra_items"		: extraIds,
							};
							req.body				=	dealItemspush;
							this.cartAPI.updateCart(req,res,next).then(response=>{
								if(response.status != Constants.STATUS_SUCCESS) return childCallback(response.message);
								childCallback(null);
							}).catch(next);
						}
					}else{
						let extraItems			=	(orderItems.extra_items) 		? orderItems.extra_items :"";
						let extraIds = [];
						if(extraItems.length >0){
							extraItems.map(extraRecord=>{
								let tmpExtraItem =[];
								let groupId		=	extraRecord.group_id;
								if(extraRecord.extra_item_id){
									tmpExtraItem.push({
										extra_item_id 		: extraRecord.extra_item_id,
										extra_group_item_id : extraRecord.extra_item_group_id,
									});
								}

								if(tmpExtraItem.length >0){
									extraIds.push({
										group_id 		:	groupId,
										extra_item_ids 	: 	tmpExtraItem,
									});
								}
							});
						}
						let orderItemspush	=	{
							"is_admin"			: true,
							"item_unit_id"		: itemUnitId,
							"device_id"			: deviceId,
							"cart_id"			: cartId,
							"restaurant_id"		: restaurantId,
							"branch_id"			: branchId,
							"area_id"			: areaId,
							"qty"				: qty,
							"item_id"			: itemId,
							"unit_id"			: unitId,
							"dough_id"			: doughId,
							"selector_id"		: selectorId,
							"item_type"			: itemType,
							"price"         	: price,
							"sub_total"    		: subTotal,
							"discounted_price"	: discountedPrice,
							"net_amount"    	: netAmount,
							"extra_items"		: extraIds
						};
						req.body				=	orderItemspush;
						this.cartAPI.updateCart(req,res,next).then(response=>{
							if(response.status != Constants.STATUS_SUCCESS) return childCallback(response.message);
							childCallback(null);
						}).catch(next);
					}
				}
			},
			get_item_details :(childCallback)=>{
				req.body.item_id		=	itemId;
				req.body.branch_id		=	branchId;
				req.body.restaurant_id	=	restaurantId;
				req.body.area_id		=	areaId;
				/** Get item details */
				this.restaurantAPI.getItemDetails(req,res,next).then(response=>{
					if(response.status != Constants.STATUS_SUCCESS) return childCallback(response.message);
					childCallback(null,response);
				}).catch(next);
			}
		},(addCartErr, addCartAsyncResponse)=>{
			if(addCartErr) return next(addCartErr);
			let itemDetailResponse	= (addCartAsyncResponse.get_item_details) ? addCartAsyncResponse.get_item_details :{};
			let cartId				= (itemDetailResponse.item_details.cart_id)? itemDetailResponse.item_details.cart_id :"";
			asyncParallel({
				cart_data :(secondChildcallback)=>{
					if(cartId == "") return secondChildcallback(null,null);

					/** Get detail of User Cart **/
					this.userCartDB.findOne({_id : cartId }).then(cartResult=>{
						secondChildcallback(null,cartResult);
					}).catch(next);
				},
			},(cartErr, cartResponse)=>{
				if(cartErr) return next(cartErr);
				let cartData		=	(cartResponse.cart_data) ? cartResponse.cart_data :{};
				let cartUnitId	 	=	"";
				let cartDoughId		=	"";
				let cartSelectorId	=	"";
				let cartExtraItem 	=	{};
				let unitLists		=	{};
				let unitData		=	[];
				let doughData 		=	[];
				let selectorData 	=	[];
				let extraData 		=	[];
				let extraGroupData 	=	[];
				let extraItemIds 	=	[];
				let itemType		=	(cartData.item_type) 	? cartData.item_type : {};
				if(itemType == Constants.HALF_AND_HALF_ITEM){
					cartUnitId	 	=	(cartData.unit_id) 		? cartData.unit_id : "";
					cartDoughId		=	(cartData.dough_id) 	? cartData.dough_id : "";
					unitLists		=	(cartData.unit_lists) 	? cartData.unit_lists : {};
					if(unitLists.length > 0){
						unitLists.map((records,key)=>{
							selectorData[key] = records.selector_id;
							extraData = records.extra_items;
							if(extraData.length > 0){
								extraData.map((eRecords,eKey)=>{
									extraItemIds = 	eRecords.extra_item_ids;
									if(extraItemIds.length > 0){
										extraItemIds.map((cExtraRecords,cExtraKey)=>{
											if(!extraGroupData[key]) extraGroupData[key] = [];
											extraGroupData[key].push(cExtraRecords.extra_group_item_id);
										});
									}
								});
							}
						});
					}
				}else if(itemType == Constants.DEAL_ITEM){
					unitLists		=	(cartData.unit_lists) 	? cartData.unit_lists : {};
					cartExtraItem 	=	(cartData.extra_items) 	? cartData.extra_items : {};
					deviceUniqueId 	= 	(cartData.device_id)	? cartData.device_id	:""	;
					cartId		 	= 	(cartData._id)	? cartData._id	:""	;
					if(unitLists.length > 0){
						unitLists.map((records,key)=>{
							unitId 			= records.unit_id;
							itemUnitId 		= records.item_unit_id;
							doughId 		= records.dough_id;
							selectorId 		= records.selector_id;
							extraData 		= records.extra_items;
							let dealItemspush		=	{
								"cart_id"			: cartId,
								"user_id"			: "",
								"unit_id"			: unitId,
								"selector_id"		: selectorId,
								"item_unit_id"		: itemUnitId,
								"dough_id"			: doughId,
								"extra_items"		: extraData,
							};
							sessionKey	=	key+1;
							if(dealItemspush){
								if(!req.session.deal_form)  req.session.deal_form = {};
								req.session.deal_form[deviceUniqueId+"_"+sessionKey] = dealItemspush;
							}
							unitData[key] 		= 	unitId;
							doughData[key] 		= 	doughId;
							selectorData[key] 	=	selectorId;
							if(extraData.length > 0){
								extraData.map((eRecords,eKey)=>{
									extraItemIds = 	eRecords.extra_item_ids;
									if(extraItemIds.length > 0){
										extraItemIds.map((cExtraRecords,cExtraKey)=>{
											if(!extraGroupData[key]) extraGroupData[key] = [];
											extraGroupData[key].push(cExtraRecords.extra_group_item_id);
										});
									}
								});
							}
						});
					}
				}else{
					cartUnitId	 	=	(cartData.unit_id) 		? cartData.unit_id : "";
					cartDoughId		=	(cartData.dough_id) 	? cartData.dough_id : "";
					cartExtraItem 	=	(cartData.extra_items) 	? cartData.extra_items : {};
					cartSelectorId	=	(cartData.selector_id) 	? cartData.selector_id : "";
				}
				let doughItem = {};
				let selector = {};
				let itemUnitList	=	itemDetailResponse.item_unit_list;
				itemDetailResponse.dough_list		=	{};
				itemDetailResponse.selector_list 	=   {};
				if(itemUnitList.length >0){
					let unitId	=	"";
					itemUnitList.map(records=>{
						let tmpDoughItem =[];
						unitId		=	records.unit_id;
						if(records.dough_list && records.dough_list.length >0 && unitId != ""){
							records.dough_list.map(data=>{
								let tmpSelectItem=[];
								doughId		=	data._id;
								if(doughId){
									tmpDoughItem.push({
										id	:	data._id,
										price	: data.price,
										unit_name: data.unit_name,
										item_unit_id: data.item_unit_id,
									});
									/** For Selector Array*/
									if(data.selector_list && data.selector_list.length >0){
										data.selector_list.map(selectData=>{
											if(selectData._id){
												tmpSelectItem.push({
													id			:	selectData._id,
													price		: 	selectData.price,
													unit_name	: 	selectData.unit_name,
													item_unit_id: 	selectData.item_unit_id,
													sorting		:	selectData.sorting
												});
											}
										});
										let tmpSelectItemLength	=	tmpSelectItem.length;
										if(tmpSelectItemLength >0){
											selector[doughId] = tmpSelectItem;
										}
									}
								}
							});
							let tmpDoughItemLength	=	tmpDoughItem.length;
							if(tmpDoughItemLength >0){
								doughItem[unitId] 	= tmpDoughItem;
							}
							itemDetailResponse.dough_list 		=	doughItem;
							itemDetailResponse.selector_list 	=   selector;
						}
					});
				}
				let itemDetails	=	(itemDetailResponse) ? itemDetailResponse : {};
				res.render('change_quantity',{
					layout			:	false,
					item_detail		:	itemDetails,
					unit_id			:	cartUnitId,
					dough_id		:	cartDoughId,
					selector_id		:	cartSelectorId,
					extra_items		:	cartExtraItem,
					unit_lists		:	unitLists,
					unit_data		:	unitData,
					dough_data 		:	doughData,
					extra_group_data:	extraGroupData,
					selector_data 	:	selectorData,
					restaurant_id	:	restaurantId,
					branch_id		:	branchId,
					area_id			:	areaId,
					item_id			:	itemId,
					customer_id		:	customerId,
				});
			});
		});
	};// end changeQuantity()

	/**
	 * Function to checkout
	 *
	 * @param req As Request Data
	 * @param res As Response Data
	 *
	 * @return render/json
	 */
	async checkout (req, res,next){
		if(isPost(req)){
			let userId			=	(req.body.user_id) 		? req.body.user_id			:"";
			let areaId			=	(req.body.area_id) 		? req.body.area_id 			:"";
			let addressId		=	(req.body.address_id) 	? req.body.address_id 		:"";
			let restaurantId	=	(req.body.restaurant_id)? req.body.restaurant_id	:"";
			let isOpen			=	(req.body.isOpen)		? req.body.isOpen	:"";

			asyncParallel({
				address_detail :(callback)=>{
					this.customerAddressAPI.getAddressList(req, res, next).then(response => {
						if(response.status != Constants.STATUS_SUCCESS) return callback(response.message);
						callback(null,response);
					}).catch(next);
				},
				branch_detail :(callback)=>{
					this.restaurantAPI.getBranchList(req,res,next).then(response=>{
						if(response.status != Constants.STATUS_SUCCESS) return callback(response.message);
						callback(null,response);
					}).catch(next);
				},
			},(asyncErr, asyncResponse)=>{
				if(asyncErr) return next(asyncErr);

				let branchDetail	=	(asyncResponse.branch_detail) ? asyncResponse.branch_detail : [];
				let addressDetail	=	(asyncResponse.address_detail) ? asyncResponse.address_detail : [];

				res.render('checkout',{
					layout 			:	false,
					user_id			: 	userId,
					address_id		:	addressId,
					area_id 		: 	areaId,
					restaurant_id 	: 	restaurantId,
					branch_detail	:	branchDetail.result,
					address_detail  : 	addressDetail.result,
				});
			});
		};
	};//End checkout()

	/**
	* Function for customer address
	*
	* @param req 	As Request Data
	* @param res 	As Response Data
	* @param next 	As Callback argument to the middleware function
	*
	* @return null
	*/
	async CustomerAddress  (req, res,next){
		let addressId		=	(req.params.id) ? new ObjectId(req.params.id) :"";
		let isEditable		= 	(req.params.id) ? true :false;
		let mainCustomerId	=	(req.body.user_id) ? req.body.user_id : "";
		let restaurantId	=	(req.body.restaurant_id) ? req.body.restaurant_id : "";
		let userAreaId			=	(req.body.area_id) ? req.body.area_id : "";
		let branchId		=	(req.body.branch_id) ? req.body.branch_id : "";
		if(isPost(req)){
			let response = {};
			let cityId	 = "";
			let areaId	 = "";
			let blockId	 = "";
			asyncParallel({
				address_details : (callback)=>{
					if(!isEditable) return callback(null,{});
					this.getAddressDetails(req, res,next).then(addressResponse=>{
						response	= addressResponse;
						cityId		= (response.result) ? response.result.city_id : "";
						areaId		= (response.result) ? response.result.area_id : "";
						blockId		= (response.result) ? response.result.block_id : "";
						callback(null,response);
					}).catch(next);
				},
				user_details : (callback)=>{
					if(isEditable) return callback(null,{});

					this.userDB.findOne({_id : new ObjectId(mainCustomerId)},{projection:{first_name:1,last_name:1,mobile_number:1}}).then(result=>{
						callback(null,result);
					}).catch(next);
				},
			}, async(parallelErr,parallelResponse)=>{
				if(response.status != Constants.STATUS_SUCCESS && isEditable){
					/** Send error response **/
					return res.status(400).send({status  : Constants.STATUS_ERROR, message : res.__("system.something_going_wrong_please_try_again") });
				}

				let cityList = await getCityList(req,res,next,{city_id : cityId});
				let areaList = await getAreaList(req,res,next,{city_id : cityId,area_id:areaId});
				let blockList = await getBlockList(req,res,next,{area_id:areaId,block_id : blockId});

				/** render add edit address page **/
				res.render('add_edit_address',{
					layout			:	false,
					is_editable		:	isEditable,
					city_list 		:	cityList,
					area_list 		:	areaList,
					block_list 		:	blockList,
					user_id			:	mainCustomerId,
					restaurant_id	:	restaurantId,
					branch_id		:	branchId,
					area_id			:	userAreaId,
					result		    :   response.result,
					customer_details:	parallelResponse.user_details
				});
			});
		}
	};//End CustomerAddress()

	/**
	* Function to submit address form
	*
	* @param req 	As Request Data
	* @param res 	As Response Data
	* @param next 	As Callback argument to the middleware function
	*
	* @return null
	*/
	async submitAddress  (req, res,next){
		let addressId		=	(req.params.id) ? new ObjectId(req.params.id) :"";
		let mainCustomerId	=	(req.params.user_id) ? req.params.user_id : "";

		if(isPost(req)){
			req.body.user_id 		= 	mainCustomerId;
			req.body.id 			= 	addressId;
			this.customerAddressAPI.addEditAddress(req, res,next).then(response=>{
				if(response.status != Constants.STATUS_SUCCESS) return res.send(response);
				/** Send success response **/
				res.send({
					status 		  	: Constants.STATUS_SUCCESS,
					message 		: response.message,
					address_id		: response.address_id,
					redirect_url  	: Constants.WEBSITE_ADMIN_URL+"place_order/checkout"
				});
			}).catch(next);
		}
	};//End submitAddress()

	/**
	 * Function to get address detail
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next 	As Callback argument to the middleware function
	 *
	 * @return json
	 */
	async getAddressDetails  (req, res,next){
		return new Promise(resolve=>{
			let addressId = new ObjectId(req.params.id);

			/** Get customer details **/
			this.customerAddressesDB.findOne({ _id: addressId }).then(result=>{

				/** Send error response */
				if(!result) return resolve({status : Constants.STATUS_ERROR, message	: res.__("admin.system.invalid_access") });

				resolve({
					result : result,
					status : Constants.STATUS_SUCCESS
				});
			}).catch(next);
		}).catch(next);
	};// End getAddressDetails()

	/**
	 * Function for get area list
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 * @param next 	As Callback argument to the middleware function
	 *
	 * @return render/json
	 */
	async getAreaList  (req, res,next){
		let cityId	= (req.body.city_id) ? req.body.city_id :"";

		/** Send error response */
		if(!cityId) return res.send({ status: Constants.STATUS_ERROR, message: res.__("system.something_going_wrong_please_try_again") });

		/** Get area list */
		let response = await getAreaList(req,res,next,req.body);

		/** Send response  */
		res.send({
			status : (response.status != Constants.STATUS_ERROR) ? Constants.STATUS_SUCCESS :Constants.STATUS_ERROR,
			result : response,
		});
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
	async getBlockList  (req, res,next){
		let areaId	= (req.body.area_id) ? req.body.area_id :"";

		/** Send error response */
		if(!areaId) return res.send({ status: Constants.STATUS_ERROR, message: res.__("system.something_going_wrong_please_try_again") });

		/** Get area list */
		let response = await getBlockList(req,res,next,req.body);

		/** Send response  */
		res.send({
			status : (response.status != Constants.STATUS_ERROR) ? Constants.STATUS_SUCCESS :Constants.STATUS_ERROR,
			result : response,
		});
	};//End getBlockList()

	/**
	 * Function to update cart quantity
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 * @param next 	As Callback argument to the middleware function
	 *
	 * @return render/json
	 */
	async updateCartQty  (req, res,next){
		if(isPost(req)){
			this.cartAPI.updateCartQty(req, res,next).then(response=>{
				if(response.status != Constants.STATUS_SUCCESS) return res.send(response);
				/** Send success response **/
				res.send({status: Constants.STATUS_SUCCESS });
			}).catch(next);
		}
	};//End updateCartQty()

	/**
	 * Function to get payment methods
	 *
	 * @param req As Request Data
	 * @param res As Response Data
	 *
	 * @return render/json
	 */
	async getPaymentMethods  (req, res,next){
		if(isPost(req)){
			let userId			=	(req.body.user_id) 			?	req.body.user_id 				:"";
			let restaurantId	=	(req.body.restaurant_id) 	? 	req.body.restaurant_id 			:"";
			let branchId		=	(req.body.branch_id) 		? 	req.body.branch_id 				:"";
			let addressId		=	(req.body.address_id) 		? 	req.body.address_id 			:"";
			let areaId			=	(req.body.area_id) 			? 	req.body.area_id 				:"";
			let deliveryBy		=	(req.body.delivery_by) 		? 	req.body.delivery_by 			:"";
			let isScheduled		=	(req.body.is_scheduled) 	? 	parseInt(req.body.is_scheduled) :0;
			let scheduledTime	=	(req.body.scheduled_time)	? 	req.body.scheduled_time			:"";
			let isAghzeya		=	false;

			if(deliveryBy == Constants.DELIVERY_BY_CRAVEZ){
				if(!req.body.address_id) return res.send({ status: Constants.STATUS_ERROR, message: res.__("admin.place_order.please_select_address") });
			}else{
				if(!req.body.branch_id) return res.send({ status: Constants.STATUS_ERROR, message: res.__("admin.place_order.please_select_branch") });
			}

			let deliveryAreaId	=	"";
			if(deliveryBy == Constants.DELIVERY_BY_CRAVEZ){
				req.params.id	=	addressId
				let deliveryAdressDetail	=	await this.getAddressDetails(req, res,next);
				deliveryAreaId	=	(deliveryAdressDetail && deliveryAdressDetail.result) ? deliveryAdressDetail.result.area_id : "";
			}

			asyncParallel({
				valid_branch : (callback)=>{
					if(deliveryBy == Constants.DELIVERY_BY_CRAVEZ) return callback(null,{});

					this.cartAPI.checkOrderPickUpStore(req, res,next).then(pickupResponse=>{
						callback(null,pickupResponse);
					}).catch(next);
				},
				valid_address : (callback)=>{
					if(deliveryBy != Constants.DELIVERY_BY_CRAVEZ) return callback(null,{});
					req.body.area_id	=	deliveryAreaId;
					this.cartAPI.checkDeliveryAddress(req, res,next).then(addressResponse=>{
						callback(null,addressResponse);
					}).catch(next);
				},
				get_cart : (callback) => {
					req.body.is_place_order	=	true;
					if(deliveryBy != Constants.DELIVERY_BY_CRAVEZ){
						if(!req.body.pickup_branch_list) req.body.pickup_branch_list = {};
						req.body.pickup_branch_list[restaurantId] = branchId;
					}
					this.cartAPI.getCartList(req,res,next).then(response=>{
						if(response.status != Constants.STATUS_SUCCESS) return callback(response);
						callback(null,response);
					}).catch(next);
				},
				get_wallet_balance : (callback) => {
					getWalletBalance(req,res,next,{user_id: userId}).then(walletResponse=>{
						callback(null,walletResponse);
					}).catch(next);
				},
				aghzeya_restaurant :(callback)=>{
					if(!restaurantId) return callback(null,{});

					/** Get restaurant list */
					this.restaurantDB.findOne({_id: new ObjectId(restaurantId)},{projection:{aghzeya : true,aghzeya_restaurant_id : 1}}).then(result=>{
						if(!result || !result.aghzeya || !result.aghzeya_restaurant_id) return callback(null,{});
						isAghzeya = true;

						asyncParallel({
							source_list : (childCallback)=>{
								/** Get source list restaurant wise */
								this.aghzeyaRestaurantSourcesDB.aggregate([
									{$match : {
										restaurant_id:	new ObjectId(restaurantId),
									}},
									{$project : {
										id 		: 	"$aghzeya_source_id",
										e_name	:	"$name.en",
										a_name	:	"$name.ar",
										has_deliv:	"$has_deliv",
									}}
								]).toArray().then(sourceResult=>{
									childCallback(null, sourceResult);
								}).catch(next);
							},
							payment_methods : (childCallback)=>{
								/** Get paymernt method list restaurant wise */
								this.aghzeyaRestaurantPaymentMethodDB.aggregate([
									{$match : {
										restaurant_id:	new ObjectId(restaurantId),
									}},
									{$project : {
										id 		: 	"$aghzeya_payment_id",
										e_name	:	"$name.en",
										a_name	:	"$name.ar",
									}}
								]).toArray().then(methodResult=>{
									childCallback(null, methodResult);
								}).catch(next);
							},
						},(childErr,childResponse)=>{
							callback(childErr,{source_list: childResponse.source_list,source_payment_methods: childResponse.payment_methods});
						});
					}).catch(next);
				},
			}, async (parallelErr,parallelResponse)=>{
				if(parallelErr) return next(parallelErr);

				if(parallelResponse.valid_branch.status && parallelResponse.valid_branch.message) return res.send({ status: Constants.STATUS_ERROR, message: parallelResponse.valid_branch.message});
				if(parallelResponse.valid_address.status && parallelResponse.valid_address.message) return res.send({ status: Constants.STATUS_ERROR, message: parallelResponse.valid_address.message});

				let validBranch		=	(parallelResponse.valid_branch) 		?	parallelResponse.valid_branch.branch_available 	:{};
				let validItemBranch	=	(parallelResponse.valid_branch) 		? 	parallelResponse.valid_branch.item_available	:{};
				let validAddress 	=	(parallelResponse.valid_address) 		? 	parallelResponse.valid_address 		:{};
				let cartData		=	(parallelResponse.get_cart) 			? 	parallelResponse.get_cart 			:{};
				let walletData		=	(parallelResponse.get_wallet_balance) 	? 	parallelResponse.get_wallet_balance :{};

				if(deliveryBy == Constants.DELIVERY_BY_CRAVEZ && !validAddress.is_delivery){
					return res.send({ status: Constants.STATUS_ERROR, message: validAddress.message});
				}

				if(deliveryBy != Constants.DELIVERY_BY_CRAVEZ && !validBranch){
					let tmpMsg = (!validItemBranch) ? res.__('admin.place_order.item_not_available_at_this_time') :res.__('admin.place_order.not_available_at_this_time');
					if(isScheduled){
						tmpMsg = (!validItemBranch) ? res.__('admin.place_order.item_not_available_your_scheduled_time') :res.__('admin.place_order.not_available_at_scheduled_time');
					}
					return  res.send({ status: Constants.STATUS_ERROR, message: tmpMsg, validBranch: validBranch});
				}

				if(deliveryBy == Constants.DELIVERY_BY_CRAVEZ){
					req.body.scheduled_time	=	(isScheduled) ? newDate(req.body.scheduled_time) :newDate();
					let timeResponse		=	await this.cartAPI.checkOrderSchedule(req, res,next);

					if(timeResponse.status != Constants.STATUS_SUCCESS) return res.send({status: Constants.STATUS_ERROR, message: timeResponse.message});
					if(!timeResponse.branch_available){
						let tmpMsg = (!timeResponse.items_availability) ? res.__('admin.place_order.item_not_available_at_this_time') :res.__('admin.place_order.not_available_at_this_time');
						if(isScheduled){
							tmpMsg = (!timeResponse.items_availability) ? res.__('admin.place_order.item_not_available_your_scheduled_time') :res.__('admin.place_order.not_available_at_scheduled_time');
						}
						return  res.send({ status: Constants.STATUS_ERROR, message: tmpMsg, timeResponse: timeResponse});
					}
				}

				/** Get restaurant payment methods  */
				this.restaurantAPI.getPaymentMethods(req,res,next).then(restResponse=>{
					if(restResponse.status != Constants.STATUS_SUCCESS) return res.send(restResponse);

					/** render payment page **/
					res.render('payment',{
						layout			:	false,
						restaurant_id	:	restaurantId,
						branch_id		:	branchId,
						user_id			:	userId,
						address_id		:	addressId,
						delivery_by		: 	deliveryBy,
						result		    :   restResponse.payment_methods,
						cart_data		:	cartData,
						wallet_data		: 	walletData,
						is_scheduled	:	isScheduled,
						scheduled_time	:	scheduledTime,
						aghzeya_data	:	parallelResponse.aghzeya_restaurant,
						is_aghzeya		:	isAghzeya,
						area_id			:	areaId
					});
				}).catch(next);
			});
		};
	};//End getPaymentMethods

	/**
	 * Function to place order
	 *
	 * @param req As Request Data
	 * @param res As Response Data
	 *
	 * @return render/json
	 */
	async placeOrder (req, res,next){
		if(isPost(req)){
			let userId			=	(req.body.user_id) 				? 	req.body.user_id 			:"";
			let addressId		=	(req.body.address_id) 			? 	req.body.address_id 		:"";
			let restaurantId	=	(req.body.restaurant_id) 		? 	req.body.restaurant_id 		:"";
			let isWalletBalance	=	(req.body.is_wallet_balance)	?	req.body.is_wallet_balance	:"";
			let sourceMethod	=	(req.body.source_payment)		?	req.body.source_payment		:"";
			let paymentMethod	=	(req.body.payment_method)		?	req.body.payment_method		:"";
			let referenceNumber	=	(req.body.reference_number)		?	req.body.reference_number	:"";
			let agentId			= 	(req.session.user._id) 			?	req.session.user._id 		:"";
			let completePaymentByWallet= (req.body.complete_payment_by_wallet)? parseInt(req.body.complete_payment_by_wallet)	:"";
			req.body.agent_id	= 	agentId;
            if(completePaymentByWallet && !paymentMethod){
				paymentMethod           = Constants.WALLET_PAYMENT;
				req.body.payment_method = Constants.WALLET_PAYMENT;
			}

			if(sourceMethod){
				req.body.source_payment 		= sourceMethod.split(",")[0];
				req.body.source_payment_name	= sourceMethod.split(",")[1];
			}
			/** Send error response */
			if(!isWalletBalance && req.body.source && req.body.source == Constants.SOURCE_CALL_CENTER){
				if(!paymentMethod) return res.send({ status: Constants.STATUS_ERROR, message: res.__("admin.place_order.please_select_payment_method") });
			}else if(!isWalletBalance && req.body.source && req.body.source != Constants.SOURCE_CALL_CENTER){
				if(!req.body.source_payment) return res.send({ status: Constants.STATUS_ERROR, message: res.__("admin.place_order.please_select_payment_method") });
			}else if(!paymentMethod){
				return res.send({ status: Constants.STATUS_ERROR, message: res.__("admin.place_order.please_select_payment_method") });
			}

			if(paymentMethod == Constants.SHEEEL_CARD || req.body.source_payment_name == "Sheeel Card"){
				if(!req.body.sheel_card) return res.send({ status: Constants.STATUS_ERROR, message: res.__("admin.place_order.please_enter_card_number") });
			}

			if(!referenceNumber && req.body.source && req.body.source != Constants.SOURCE_CALL_CENTER){
				return res.send({ status: Constants.STATUS_ERROR, message: res.__("admin.place_order.please_enter_reference_number") });
			}

			let restaurantList	=	{};
			restaurantList['branch_id']				=	req.body.branch_id;
			restaurantList['transfer_branch_id']	=	req.body.transfer_branch_id;
			restaurantList['transfer_branch']		=	(req.body.transfer_branch_id) ? true : false;
			restaurantList['restaurant_id']			=	req.body.restaurant_id;
			restaurantList['address_id']			=	req.body.address_id;
			restaurantList['area_id']				=	req.body.area_id;
			restaurantList['delivery_by']			=	req.body.delivery_by;
			restaurantList['note']					=	req.body.note;
			restaurantList['is_schedule']			=	req.body.is_scheduled;
			restaurantList['scheduled_time']		=	req.body.scheduled_time;

			if(paymentMethod != Constants.CASH_PAYMENT){
				req.body.is_admin	=	true;
			}

			asyncParallel({
				user_data: (callback) => {
					this.userDB.findOne({_id : new ObjectId(userId)},{projection:{full_name:1,phone_country_code:1,mobile_number:1,email:1,cust_tele2:1}}).then(result=>{
						callback(null,result);
					}).catch(next);
				},
				address_detail: (callback) => {
					if(!addressId) return callback(null,{});

					this.customerAddressesDB.findOne({_id : new ObjectId(addressId)}).then(result=>{
						callback(null, result);
					}).catch(next);
				},
				get_cart : (callback) => {
					if(req.body.delivery_by == Constants.DELIVERY_BY_CRAVEZ) req.body.is_place_order	=	true;
					this.cartAPI.getCartList(req,res,next).then(response=>{
						if(response.status != Constants.STATUS_SUCCESS) return callback(response);
						callback(null,response);
					}).catch(next);
				},
				get_wallet_balance : (callback) => {
					if(!isWalletBalance) return callback(null,null);
					getWalletBalance(req,res,next,{user_id: userId}).then(walletResponse=>{
						callback(null,walletResponse);
					}).catch(next);
				},
				rest_details: (callback) => {
					/** Get restaurant details */
					this.restaurantDB.findOne({_id: new ObjectId(restaurantId)},{projection:{aghzeya_restaurant_id:1}}).then(result=>{
						callback(null,result);
					}).catch(next);
				},
				source_payment_name: (callback) => {
					if(!req.body.source || req.body.source == Constants.SOURCE_CALL_CENTER) return callback(null,"");

					/** Get payment method name details */
					this.aghzeyaRestaurantPaymentMethodDB.findOne({aghzeya_payment_id: String(req.body.source_payment)},{projection:{name:1}}).then(result=>{
						let sourceMethodName = (result && result.name) ? result.name :"";
						callback(null,sourceMethodName);
					}).catch(next);
				},
				aghzeya_source_name: (callback) => {
					if(!req.body.source) return callback(null,"");

					/** Get aghzeya sources details */
					this.aghzeyaRestaurantSourcesDB.findOne({aghzeya_source_id: String(req.body.source)},{projection:{name:1}}).then(result=>{
						let sourceName = (result && result.name) ? result.name : "";
						callback(null,sourceName);
					}).catch(next);
				},
				upayment_settings: (callback) => {
					/** Get restaurant_payment_settings */
					this.restaurantPaymentSettingDB.findOne({ restaurant_id: new ObjectId(restaurantId) }, { projection: { uInterface_base_url: 1, uInterface_api_key: 1, uInterface_username: 1, uInterface_password: 1, uInterface_authorization_key: 1, uInterface_merchant_id: 1, uInterface_test_mode: 1, uInterface_whitelabled: 1, default_credential:1 } }).then(result=>{
						callback(null, result);
					}).catch(next);
				},
				delete_unavailable_cart :(callback)=>{
					/** delete unavailable item details **/
					this.userDB.updateOne({_id: new ObjectId(userId) },{$unset: { unavailable_data:1}}).then(()=>{
						callback(null);
					}).catch(next);
				},
			}, async (asyncErr, asyncResponse) => {
				if (asyncErr) return next(asyncErr);

				let userData		=	(asyncResponse.user_data) 		? 	asyncResponse.user_data 	:{};
				let mobileNumber	=	(userData.mobile_number) 		? 	userData.mobile_number 		:"";
				let secondaryNumber	=	(userData.cust_tele2) 			? 	userData.cust_tele2 		:"";
				let cartData		=	(asyncResponse.get_cart) 		? 	asyncResponse.get_cart 		:{};
				let restDetails		=	(asyncResponse.rest_details) 	? 	asyncResponse.rest_details 	:{};
				let addressDetail	=	(asyncResponse.address_detail)	?	asyncResponse.address_detail:{};
				let simphony		=	(cartData.result && cartData.result[0] && cartData.result[0].simphony)  ? cartData.result[0].simphony  :0;
				let itemData		=	(cartData.result && cartData.result[0] && cartData.result[0].item_list) ? cartData.result[0].item_list :[];
				let deliveryFees	=	(cartData.result && cartData.result[0] && cartData.result[0].delivery_fees) ? cartData.result[0].delivery_fees : 0;
				let minOrderLimit	=	(cartData.result && cartData.result[0] && cartData.result[0].minimum_order_limit) ? cartData.result[0].minimum_order_limit : 0;
				let walletData		=	(asyncResponse.get_wallet_balance) ? asyncResponse.get_wallet_balance : {};
				let totalAmount		=	(walletData && walletData.total_amount) ? walletData.total_amount : 0;
				let grandTotal		=	(cartData.grand_total) ? cartData.grand_total : 0;
				let aghzeyaRestId	=	(restDetails.aghzeya_restaurant_id)? restDetails.aghzeya_restaurant_id:"";
				let outstandingOrderAmount = (cartData.outstanding_order_amount) ? cartData.outstanding_order_amount :0;
				let totalOrderAmount 	   = grandTotal;
				let upaymentSettings	   = (asyncResponse.upayment_settings) 	? 	asyncResponse.upayment_settings 	:"";

				if(outstandingOrderAmount >0){
					totalOrderAmount += outstandingOrderAmount;
				}

				if(((grandTotal-deliveryFees) < minOrderLimit) && req.body.delivery_by !=  Constants.DELIVERY_BY_PICK_UP){
					return res.send({ status: Constants.STATUS_ERROR, message: res.__("admin.place_order.please_maintain_order_limit") });
				}

				let validNumRes = await checkNumberValid(req,res,next,{mobile_number :mobileNumber, cust_tele2 :secondaryNumber,source:req.body.source,payment_method:paymentMethod});

				if(validNumRes.status != Constants.STATUS_SUCCESS) return res.send({ status: Constants.STATUS_ERROR, message: res.__("admin.place_order.you_cant_make_payment"), mobile_number :mobileNumber, cust_tele2 :secondaryNumber, response: validNumRes });

				mobileNumber	=	validNumRes.mobile_number;
				let itemList	=	[];
				if(totalAmount){
					req.body.wallet_amount	=	totalAmount;
					if(totalAmount > totalOrderAmount){
						req.body.payment_method	=	Constants.WALLET_PAYMENT;
						totalOrderAmount		=	totalAmount - totalOrderAmount;
					}else{
						totalOrderAmount	=	totalOrderAmount - totalAmount;
					}
				}
				if(outstandingOrderAmount >0){
					req.body.outstanding_order_amount =	outstandingOrderAmount;
				}

				if(addressDetail){
					restaurantList['latitude']	=	addressDetail.latitude;
					restaurantList['longitude']	=	addressDetail.longitude;
					restaurantList['address']	=	addressDetail.venue;
					if(addressDetail.area_id){
						restaurantList['area_id'] 	= 	addressDetail.area_id;
					}
				}

				req.body.order_restaurant_list	=	[restaurantList];
				if(req.body.source && req.body.source != Constants.SOURCE_CALL_CENTER){
					req.body.payment_method			= req.body.source_payment_name;
					let englishSourceName			= asyncResponse.aghzeya_source_name.en+"-"+asyncResponse.source_payment_name.en;
					let arabicSourceName			= asyncResponse.aghzeya_source_name.ar+"-"+asyncResponse.source_payment_name.ar;
					req.body.source_payment_name	= {ar : arabicSourceName, en : englishSourceName};
					req.body.source_name			= asyncResponse.aghzeya_source_name;
				}
				/** send flag if order from aghzeya */
				if(aghzeyaRestId){
					req.body.is_aghzeya = true
				}

				/** Place order */
				req.body.order_source = (req.body.source && Constants.ORDER_SOURCE_TYPE[req.body.source]) ? Constants.ORDER_SOURCE_TYPE[req.body.source] : Constants.CALL_CENTER;
				this.orderAPI.placeOrder(req,res,next).then(restResponse=>{
					if(restResponse.status != Constants.STATUS_SUCCESS) return res.send({ status: Constants.STATUS_ERROR, message: (restResponse.message) ? restResponse.message :restResponse.message[0].msg });

					let runningOrders	= 	(restResponse.running_orders && restResponse.running_orders[0]) ? restResponse.running_orders[0] :{};
					let orderId			=	(runningOrders._id) 			? 	runningOrders._id 				:"";
					let orderNumber		=	(runningOrders.unique_order_id)	?	runningOrders.unique_order_id 	:"";
					let tmpIsSchedule	=	(runningOrders.is_schedule)		?	runningOrders.is_schedule 		:"";
					let tmpIsConfirm	=	(runningOrders.is_confirm)		?	runningOrders.is_confirm 		:"";
					let tmpOrderStatus	=	(runningOrders.order_status)	?	runningOrders.order_status 		:"";
					itemList.push({
						"ItemName": 'Order #'+orderNumber,
						"Quantity": 1,
						"UnitPrice": totalOrderAmount
					});

					let isOnlinePayment		=	false;
					let linkExpiryMinute	=	(res.locals.settings["Payment.payment_link_expiry_time"]) ?	parseInt(res.locals.settings["Payment.payment_link_expiry_time"]) :0;
					let paymentExpireTime 	=	addMinute(linkExpiryMinute);
					let getwayPriority 		= 	(res.locals.settings["Payment.payment_geteway_priority"])?	res.locals.settings["Payment.payment_geteway_priority"]  :Constants.MYFATOORAH_PAYMENT_GATEWAY;
					asyncParallel({
						pay_online: (paymentCallback) => {
							if(Constants.OFFLINE_PAYMENT_METHODS.indexOf(req.body.payment_method) != -1 || (req.body.source && req.body.source != Constants.SOURCE_CALL_CENTER)) return paymentCallback(null,null);

							isOnlinePayment			=	true;
							let myfatoorahBaseURL	= 	(res.locals.settings["Payment.myfatoorah_base_url"])	?	res.locals.settings["Payment.myfatoorah_base_url"]	:"";
							let myfatoorahToken		=	(res.locals.settings["Payment.myfatoorah_token"]) 		? 	res.locals.settings["Payment.myfatoorah_token"] 	:"";
							let uInterfaceApiKey	=	(res.locals.settings["Payment.uInterface_api_key"])		? 	res.locals.settings["Payment.uInterface_api_key"]	:"";
							let uInterfaceMerchantId=	(res.locals.settings["Payment.uInterface_merchant_id"])	? 	res.locals.settings["Payment.uInterface_merchant_id"]:"";
							let uInterfaceUsername	=	(res.locals.settings["Payment.uInterface_username"]) 	? 	res.locals.settings["Payment.uInterface_username"] 	:"";
							let uInterfacePassword	=	(res.locals.settings["Payment.uInterface_password"]) 	? 	res.locals.settings["Payment.uInterface_password"] 	:"";
							let uInterfaceTestMode	=	(res.locals.settings["Payment.uInterface_test_mode"]) 	? 	res.locals.settings["Payment.uInterface_test_mode"] :0;
							let uInterfaceBaseUrl	=	(res.locals.settings["Payment.uInterface_base_url"]) 	? 	res.locals.settings["Payment.uInterface_base_url"] 	:"";
							let uInterfaceWhitelabled=	(res.locals.settings["Payment.uInterface_whitelabled"]) ? 	res.locals.settings["Payment.uInterface_whitelabled"]:0;
							let uInterfaceAuthorizationKey=	(res.locals.settings["Payment.uInterface_authorization_key"]) ?	res.locals.settings["Payment.uInterface_authorization_key"] 	:"";

							if (upaymentSettings && !upaymentSettings.default_credential){
								uInterfaceApiKey 			= upaymentSettings.uInterface_api_key;
								uInterfaceMerchantId 		= upaymentSettings.uInterface_merchant_id;
								uInterfaceUsername 			= upaymentSettings.uInterface_username;
								uInterfacePassword 			= upaymentSettings.uInterface_password;
								uInterfaceTestMode 			= upaymentSettings.uInterface_test_mode;
								uInterfaceBaseUrl 			= upaymentSettings.uInterface_base_url;
								uInterfaceWhitelabled 		= upaymentSettings.uInterface_whitelabled;
								uInterfaceAuthorizationKey 	= upaymentSettings.uInterface_authorization_key;
							}

							if(getwayPriority == Constants.MYFATOORAH_PAYMENT_GATEWAY){
								let body	=	{
									"CustomerName"		: 	userData.full_name,
									"NotificationOption": 	userData.email ? "ALL" : "SMS",
									"MobileCountryCode"	:	userData.phone_country_code,
									"CustomerMobile"	: 	mobileNumber,
									"InvoiceValue"		: 	totalOrderAmount,
									"DisplayCurrencyIso":	Constants.PAYMENT_GATEWAY_CURRENCY_CODE,
									"CallBackUrl"		: 	Constants.WEBSITE_ADMIN_URL+"place_order/payment_success/"+orderId+'/'+userId+'/'+restaurantId,
									"ErrorUrl"			: 	Constants.WEBSITE_ADMIN_URL+"place_order/payment_failure/"+orderId+'/'+userId+'/'+restaurantId,
									"Language"			:	Constants.ENGLISH_LANGUAGE_CODE,
									"CustomerReference" :	"ref 1",
									"CustomerCivilId"	:	12345678,
									"UserDefinedField"	: 	"Custom field",
									"ExpiryDate"		:	paymentExpireTime,
									"CustomerAddress" 	:	{
										"Block":"", "Street":"", "HouseBuildingNo":"", "Address":"", "AddressInstructions":""
									},
									"InvoiceItems": itemList
								};
								if(userData.email) body['CustomerEmail'] =	userData.email;

								const requestOptions = {
									method: 'POST',
									url: `${myfatoorahBaseURL}/v2/SendPayment`,
									headers: {
										Accept: 'application/json',
										'Content-Type': 'application/json',
										Authorization: myfatoorahToken,
									},
									data: body
								};

								/** Save Payment gateway logs */
								let tmpLogId 		= 	new ObjectId();
								let tmpExtraPerms 	=	{before_request_time: getUtcDate()};
								savePaymentGatewayLogs(req,res,next,{
									log_id	 	:	tmpLogId,
									order_id 	:	orderId,
									request	 	: 	requestOptions,
									response	: 	{},
									type		: 	getwayPriority,
									event		: 	"place_order",
									extra_perms	: 	tmpExtraPerms,
								}).then(()=>{

									/** Reqest payment getway */
									axios(requestOptions).then(axiosRes => {
										let body = axiosRes?.data || null;

										/** Save Payment gateway logs */
										tmpExtraPerms.after_response_time = getUtcDate();
										savePaymentGatewayLogs(req,res,next,{
											log_id	 	:	tmpLogId,
											order_id 	:	orderId,
											request	 	: 	requestOptions,
											response	: 	body,
											type		: 	getwayPriority,
											event		: 	"place_order",
											extra_perms	: 	tmpExtraPerms,
										});

										if(!body || body.constructor != Object) return paymentCallback(null,{status: Constants.STATUS_ERROR, message: body});
										if(!body.IsSuccess) return paymentCallback(null,{status: Constants.STATUS_ERROR, message: body.message});

										paymentCallback(null,{status: Constants.STATUS_SUCCESS, result: body});
									}).catch(error=>{

										/** Save Payment gateway logs */
										tmpExtraPerms.catch_response_time = getUtcDate();
										savePaymentGatewayLogs(req,res,next,{
											log_id	 	:	tmpLogId,
											order_id 	:	orderId,
											request	 	: 	requestOptions,
											response	: 	String(error),
											type		: 	getwayPriority,
											event		: 	"place_order",
											extra_perms	: 	tmpExtraPerms,
										});

										return paymentCallback(null,{status: Constants.STATUS_ERROR, message: error});
									});
								}).catch(next);
							}else{
								let tmpPaymentMethod =	(paymentMethod == Constants.CREDIT_PAYMENT)	? Constants.PAYMENT_GATEWAY_CREDIT_CARD :Constants.PAYMENT_GATEWAY_KNET;

								bcrypt(uInterfaceApiKey, 10).then(interfaceApiKey=>{
									let successUrl 	=	Constants.WEBSITE_ADMIN_URL+"place_order/ui_payment_success/"+orderId+'/'+userId+'/'+restaurantId;
									let errorUrl	= 	Constants.WEBSITE_ADMIN_URL+"place_order/ui_payment_failure/"+orderId+'/'+userId+'/'+restaurantId;
									let webHookUrl	= 	Constants.WEBSITE_ADMIN_URL+"place_order/ui_payment_response/"+orderId+'/'+userId+'/'+restaurantId;
									uInterfaceTestMode=	parseInt(uInterfaceTestMode);

									if(uInterfaceTestMode){
										webHookUrl		=	Constants.WEBSITE_URL + "payment/success";
										interfaceApiKey = 	uInterfaceApiKey;
									}else{
										successUrl	=	Constants.WEBSITE_URL + "payment/success";
										errorUrl 	= 	Constants.WEBSITE_URL + "payment/failure";
									}

									let data =	{
										"merchant_id"    :   uInterfaceMerchantId,
										"username"       :   uInterfaceUsername,
										"password"       :   uInterfacePassword,
										"api_key"        :   interfaceApiKey,
										"order_id"       :   orderNumber,
										"total_price"    :   totalOrderAmount,
										"CurrencyCode"   :   Constants.PAYMENT_GATEWAY_CURRENCY_CODE,
										"CstFName"       :   userData.full_name,
										"CstEmail"       :   userData.email,
										"CstMobile"      :   mobileNumber,
										"success_url"    :   successUrl,
										"error_url"    	 :   errorUrl,
										"test_mode"      :   parseInt(uInterfaceTestMode),
										"whitelabled"    :   (uInterfaceWhitelabled > 0) ? true : false,
										"payment_gateway":   tmpPaymentMethod,
										"ProductName"    :   JSON.stringify([itemList[0].ItemName]),
										"ProductQty"     :   JSON.stringify([itemList[0].Quantity]),
										"ProductPrice"   :   JSON.stringify([itemList[0].UnitPrice]),
										"reference"      :   orderNumber,
										"notifyURL"      :   webHookUrl
									};

									let requestOptions = {
										method: 'post',
										maxBodyLength: Infinity,
										url: uInterfaceBaseUrl,
										headers: {
											'Authorization': `Bearer ${uInterfaceAuthorizationKey}`,
											'Accept': 'application/json',
											'Content-Type': 'application/json'
										},
										data: data
									};

									/** Save Payment gateway logs */
									let tmpLogId 		= 	new ObjectId();
									let tmpExtraPerms 	=	{before_request_time: getUtcDate()};
									savePaymentGatewayLogs(req,res,next,{
										log_id	 	:	tmpLogId,
										order_id 	:	orderId,
										request	 	: 	requestOptions,
										response	: 	{},
										type		: 	getwayPriority,
										event		: 	"place_order",
										extra_perms	: 	tmpExtraPerms,
									}).then(()=>{

										/** Request to payment gateway  */
										axios(requestOptions).then(axiosRes => {
											let body = axiosRes?.data || null;

											/** Save Payment gateway logs */
											tmpExtraPerms.after_response_time = getUtcDate();
											savePaymentGatewayLogs(req,res,next,{
												log_id	 	:	tmpLogId,
												order_id 	:	orderId,
												request	 	: 	requestOptions,
												response	: 	body,
												type		: 	getwayPriority,
												event		: 	"place_order",
												extra_perms	: 	tmpExtraPerms,
											});

											if(!body || body.constructor != Object) return paymentCallback(null,{status: Constants.STATUS_ERROR, message: body});

											if(body.status !=Constants.STATUS_SUCCESS) return paymentCallback(null,{status: Constants.STATUS_ERROR, message: body.error_msg });

											paymentCallback(null,{status: Constants.STATUS_SUCCESS, result: body});
										}).catch(error=>{

											/** Save Payment gateway logs */
											tmpExtraPerms.catch_response_time = getUtcDate();
											savePaymentGatewayLogs(req,res,next,{
												log_id	 	:	tmpLogId,
												order_id 	:	orderId,
												request	 	: 	requestOptions,
												response	: 	String(error),
												type		: 	getwayPriority,
												event		: 	"place_order",
												extra_perms	: 	tmpExtraPerms,
											});

											return paymentCallback(null,{status: Constants.STATUS_ERROR, message: error});
										});
									}).catch(next);
								}).catch(next);
							}
						}
					},async (asyncErr, asyncResponse) => {
						if (asyncErr) return next(asyncErr);

						if(asyncResponse.pay_online && asyncResponse.pay_online.status != Constants.STATUS_SUCCESS){
							this.orderDB.updateOne({_id: orderId },{
								$set : {
									order_unpaid_amount 		:	totalOrderAmount,
									payment_received 			: 	false,
									is_online_payment_received 	: 	false,
									payment_gateway_type	 	: 	(getwayPriority == Constants.MYFATOORAH_PAYMENT_GATEWAY) ? getwayPriority :Constants.UINTERFACE_PAYMENT_GATEWAY,
									payment_link_expire_time	: 	getUtcDate(paymentExpireTime),
								}
							}).then(()=>{}).catch(next);;

							/** render payment page **/
							req.flash(Constants.STATUS_ERROR,res.__('order.some_issue_payment_please_resend_link'));
							return res.send({status: Constants.STATUS_SUCCESS, order_id: orderId });
						}

						let msgStatus 	=	Constants.STATUS_SUCCESS;
						let resMsg 		= 	res.__('order.order_has_been_placed_successfully');
						if(asyncResponse.pay_online && asyncResponse.pay_online.status == Constants.STATUS_SUCCESS){
							let payOnlineDetails = asyncResponse.pay_online.result;

							/** Update order details */
							this.orderDB.updateOne({_id: orderId },{
								$set : {
									invoice_response 	: payOnlineDetails,
									order_unpaid_amount : totalOrderAmount,
									payment_received 	: false,
									is_online_payment_received 	: 	false,
									payment_gateway_type	 	: 	(getwayPriority == Constants.MYFATOORAH_PAYMENT_GATEWAY) ? getwayPriority :Constants.UINTERFACE_PAYMENT_GATEWAY,
									payment_link_expire_time	: 	getUtcDate(paymentExpireTime)
								}
							}).then(()=>{}).catch(next);

							if(getwayPriority == Constants.UINTERFACE_PAYMENT_GATEWAY && res.locals.settings["Payment.payment_link_receiver_email"]){
								if(payOnlineDetails.sms || payOnlineDetails.paymentURL){
									/*************** Send Payment Link Mail  ***************/
										let paymentContent = (payOnlineDetails.paymentURL) ? payOnlineDetails.paymentURL :payOnlineDetails.sms;
										sendMail(req,res,{
											to 			: 	res.locals.settings["Payment.payment_link_receiver_email"],
											action 		: 	"uinterface_order_payment_link",
											rep_array	:	[orderNumber, paymentContent]
										});
									/*************** Send Payment Link Mail  ***************/
								}
							}
						}else if(!tmpIsSchedule && !isOnlinePayment){

							/** Update status after place order */
							let tmpResponse = await this.callAfterPlaceOrder(req,res,next,{
								order_id 		:	orderId,
								simphony 		: 	simphony,
								is_aghzeya 		: 	(aghzeyaRestId) ? true :false,
								admin_id 		: 	agentId,
								customer_id 	: 	userId,
								current_status 	: 	tmpOrderStatus,
								is_schedule 	: 	tmpIsSchedule,
								is_confirm 		: 	tmpIsConfirm,
								restaurant_id 	: 	restaurantId,
								unique_order_id	: 	orderNumber,
								first_time_call	: 	true,
							});

							msgStatus 	=	tmpResponse.status;
							resMsg 		=	(tmpResponse.status != Constants.STATUS_SUCCESS) ? (tmpResponse.resMsg ? tmpResponse.resMsg :tmpResponse.message) :resMsg;
						}

						/** render payment page **/
						req.flash(msgStatus, resMsg);
						res.send({
							status : Constants.STATUS_SUCCESS,
							order_id : orderId
						});
					});
				}).catch(next);
			});
		};
	};//End placeOrder

	/**
	 * Function to get success on payment
	 *
	 * @param req As Request Data
	 * @param res As Response Data
	 *
	 * @return render/json
	 */
	async paymentSuccess (req, res,next){
		let userId		=	(req.params.user_id) 		? 	new ObjectId(req.params.user_id) 		:"";
		let orderId		=	(req.params.order_id) 		? 	new ObjectId(req.params.order_id) 		:"";
		let restaurantId=	(req.params.restaurant_id) 	? 	new ObjectId(req.params.restaurant_id)	:"";
		let paymentId	=	(req.query.paymentId)		?	req.query.paymentId					:"";

		asyncParallel({
			order_details: (callback) => {
				/** Get order details */
				this.orderDB.findOne({
					_id	: 	orderId,
					$or	:	[
						{is_completed: {$ne 	 :true }},
						{is_completed: {$exists  :false }},
					]
				}).then(result=>{
					callback(null, result);
				}).catch(next);
			},
			rest_details: (callback) => {
				/** Get restaurant details */
				this.restaurantDB.findOne({_id: restaurantId },{projection:{aghzeya_restaurant_id:1}}).then(result=>{
					callback(null,result);
				}).catch(next);
			},
			admin_id: (callback) => {
				/** Get admin details */
				this.userDB.findOne({user_role_id : Constants.SYSTEM_ADMIN_ROLE_ID },{projection:{_id: 1}}).then(result=>{
					let adminId = (result) ? result._id :"";
					callback(null,adminId);
				}).catch(next);
			},
		}, (asyncErr, asyncResponse) => {
			if (asyncErr) return next(asyncErr);

			/** Send error response **/
			if(!asyncResponse.order_details || !asyncResponse.rest_details){
				/** Save Payment gateway logs */
				savePaymentGatewayLogs(req,res,next,{
					order_id 	:	orderId,
					request	 	: 	{},
					response	: 	req.query,
					type		: 	Constants.MYFATOORAH_PAYMENT_GATEWAY,
					event		: 	"place_order_success_response",
				});

				req.flash(Constants.STATUS_ERROR, res.__("system.invalid_access"));
				return res.redirect(Constants.WEBSITE_URL + "payment/failure");
			}

			let orderResult 	=	asyncResponse.order_details;
			let restDetails 	=	asyncResponse.rest_details;
			let aghzeyaRestId	=	(restDetails.aghzeya_restaurant_id)	?	restDetails.aghzeya_restaurant_id	:"";
			let isSchedule		=	orderResult.is_schedule;
			let isConfirm		=	orderResult.is_confirm;
			let adminId 		=	asyncResponse.admin_id;

			/** Send success response  */
			if(orderResult.is_online_payment_received) return res.redirect(Constants.WEBSITE_URL + "payment/success");

			/** Check payment status */
			let baseURL	= 	(res.locals.settings["Payment.myfatoorah_base_url"])? res.locals.settings["Payment.myfatoorah_base_url"]	:"";
			let token	= 	(res.locals.settings["Payment.myfatoorah_token"]) 	? res.locals.settings["Payment.myfatoorah_token"] 		:"";
			axios({
				method: 'POST',
				url: `${baseURL}/v2/GetPaymentStatus`,
				headers: {
					Accept: 'application/json',
					Authorization: token,
					'Content-Type': 'application/json'
				},
				data: {
					Key: paymentId,
					KeyType: 'paymentId'
				}
			}).then(axiosRes => {
				let body = axiosRes?.data || null;

				/** Save Payment gateway logs */
				savePaymentGatewayLogs(req,res,next,{
					order_id 	:	orderId,
					request	 	: 	{
						"Key"	 : paymentId,
						"KeyType": "paymentId",
					},
					response	: 	{
						response_one : req.query,
						response_two : body,
					},
					type		: 	Constants.MYFATOORAH_PAYMENT_GATEWAY,
					event		: 	"place_order_success_response",
				});

				if(!body.IsSuccess) return next(body.message);

				/** Update order details */
				this.orderDB.updateOne({_id: orderId},{$set: {'is_online_payment_received': true, modified : getUtcDate() }}).then(()=>{

					let transactionData	=	body.Data.InvoiceTransactions[0];
					let invoiceData		=	body.Data;
					let paymentResponse	=	{
						InvoiceStatus		:	invoiceData.InvoiceStatus,
						InvoiceValue		:	invoiceData.InvoiceValue,
						CreatedDate			:	invoiceData.CreatedDate,
						InvoiceTransactions	:	transactionData,
						Comments			:	body.Message,
						InvoiceReference	:	invoiceData.InvoiceReference,
						CustomerName		:	invoiceData.CustomerName,
						ExpiryDate			:	invoiceData.ExpiryDate,
						InvoiceDisplayValue	:	invoiceData.InvoiceDisplayValue,
						CustomerMobile		:	invoiceData.CustomerMobile,
						InvoiceId			:	invoiceData.InvoiceId,
						InvoiceItems		: 	invoiceData.InvoiceItems
					};

					req.body.user_id		=	userId;
					req.body.order_ids		=	[orderId];
					req.body.payment_method	=	transactionData.PaymentGateway;
					req.body.payment_status	=	Constants.PAYMENT_SUCCESS;
					req.body.payment_response=	paymentResponse;
					req.body.currency		=	transactionData.PaidCurrency;
					req.body.amount			=	invoiceData.InvoiceValue;
					req.body.payment_event	=	Constants.ORDER_PAYMENT;
					req.body.is_schedule	=	isSchedule;
					this.orderAPI.saveUserPaymentDetails(req,res,next,req.body).then(response=>{
						if(response.status != Constants.STATUS_SUCCESS) {
							/** Send error response */
							req.flash(Constants.STATUS_ERROR, response.message);
							return res.redirect(Constants.WEBSITE_URL + "payment/failure");
						}

						/** Send success response  */
						res.redirect(Constants.WEBSITE_URL + "payment/success");

						/** Place order to aghzeya server */
						this.callAfterPlaceOrder(req,res,next,{
							order_id 			:	orderId,
							is_aghzeya 			: 	(aghzeyaRestId) ? true :false,
							admin_id 			: 	adminId,
							customer_id 		: 	userId,
							current_status 		: 	Constants.ORDER_PAYMENT_PENDING,
							is_schedule 		: 	isSchedule,
							is_confirm 			: 	isConfirm,
							restaurant_id 		: 	restaurantId,
							unique_order_id		: 	orderResult.unique_order_id,
							device_id			: 	orderResult.device_id,
							simphony			: 	orderResult.simphony,
						}).then(() =>{ });

						/** Pay outstanding amount **/
						this.orderAPI.payUserOrderOutstanding(req,res,next,{user_id: userId}).then(()=>{});
					}).catch(next);
				}).catch(next);
			}).catch((error) => {
				return next(error);
			});
		});
	};//End paymentSuccess

	/**
	 * Function to save payment failure details
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	**/
	async paymentFailure  (req, res,next){
		let userId		=	(req.params.user_id) 		? 	new ObjectId(req.params.user_id) 		:"";
		let orderId		=	(req.params.order_id) 		? 	new ObjectId(req.params.order_id) 		:"";
		let restaurantId=	(req.params.restaurant_id) 	? 	new ObjectId(req.params.restaurant_id)	:"";
		let paymentId	=	(req.query.paymentId)		?	req.query.paymentId					:"";

		asyncParallel({
			order_details: (callback) => {
				/** Get order details */
				this.orderDB.findOne({
					_id	: orderId,
					$or	: [
						{is_completed: {$ne 	 :true }},
						{is_completed: {$exists  :false }},
					]
				},{projection:{unique_order_id:1,is_schedule:1,is_confirm:1,device_id:1,is_online_payment_received:1}}).then(result=>{
					callback(null,result);
				}).catch(next);
			},
			admin_id: (callback) => {
				/** Get admin details */
				this.userDB.findOne({user_role_id : Constants.SYSTEM_ADMIN_ROLE_ID },{projection:{_id: 1}}).then(result=>{
					let adminId = (result) ? result._id :"";
					callback(null,adminId);
				}).catch(next);
			},
		}, (asyncErr, asyncResponse) => {
			if(asyncErr) return next(asyncErr);

			/** Send error response **/
			if(!asyncResponse.order_details){
				/** Save Payment gateway logs */
				savePaymentGatewayLogs(req,res,next,{
					order_id 	:	orderId,
					request	 	: 	{},
					response	: 	req.query,
					type		: 	Constants.MYFATOORAH_PAYMENT_GATEWAY,
					event		: 	"order_error_response",
				});

				req.flash(Constants.STATUS_ERROR, res.__("system.invalid_access"));
				return res.redirect(Constants.WEBSITE_URL + "payment/failure");
			}

			let orderResult =	asyncResponse.order_details;
			let adminId 	=	asyncResponse.admin_id;

			/** Send success response  */
			if(orderResult.is_online_payment_received) return res.redirect(Constants.WEBSITE_URL + "payment/success");

			/** Check payment status  */
			let baseURL	=	(res.locals.settings["Payment.myfatoorah_base_url"]) 	?	res.locals.settings["Payment.myfatoorah_base_url"] 	:"";
			let token	= 	(res.locals.settings["Payment.myfatoorah_token"]) 		? 	res.locals.settings["Payment.myfatoorah_token"]		:"";
			axios({
				method: 'POST',
				url: `${baseURL}/v2/GetPaymentStatus`,
				headers: {
					Accept: 'application/json',
					Authorization: token,
					'Content-Type': 'application/json'
				},
				data: {
					Key: paymentId,
					KeyType: 'paymentId'
				}
			}).then(axiosRes => {
				let body = axiosRes?.data || null;

				/** Save Payment gateway logs */
				savePaymentGatewayLogs(req,res,next,{
					order_id 	:	orderId,
					request	 	: 	{
						"Key"	 : paymentId,
						"KeyType": "paymentId",
					},
					response	: 	{
						response_one : req.query,
						response_two : body,
					},
					type		: 	Constants.MYFATOORAH_PAYMENT_GATEWAY,
					event		: 	"order_error_response",
				});

				if(!body.IsSuccess) return next(body.message);

				let invoiceData		=	(body.Data) ? body.Data : [];
				let transactionData	=	(invoiceData && invoiceData.InvoiceTransactions && invoiceData.InvoiceTransactions[0]) ? invoiceData.InvoiceTransactions[0] : {};

				let paymentResponse	=	{
					InvoiceStatus		:	invoiceData.InvoiceStatus,
					InvoiceValue		:	invoiceData.InvoiceValue,
					CreatedDate			:	invoiceData.CreatedDate,
					InvoiceTransactions	:	transactionData,
					Comments			:	body.Message,
					InvoiceReference	:	invoiceData.InvoiceReference,
					CustomerName		:	invoiceData.CustomerName,
					ExpiryDate			:	invoiceData.ExpiryDate,
					InvoiceDisplayValue	:	invoiceData.InvoiceDisplayValue,
					CustomerMobile		:	invoiceData.CustomerMobile,
					InvoiceId			:	invoiceData.InvoiceId,
					InvoiceItems		: 	invoiceData.InvoiceItems
				};

				req.body.user_id		=	userId;
				req.body.order_ids		=	[orderId];
				req.body.payment_method	=	(transactionData.PaymentGateway) ? transactionData.PaymentGateway 	:"";
				req.body.payment_status	=	Constants.PAYMENT_FAILED;
				req.body.payment_response=	paymentResponse;
				req.body.currency		=	(transactionData.PaidCurrency) 	?	transactionData.PaidCurrency 	:0;
				req.body.amount			=	(invoiceData.InvoiceValue)		? 	invoiceData.InvoiceValue 		:0;
				req.body.payment_event	=	Constants.ORDER_PAYMENT;
				this.orderAPI.saveUserPaymentDetails(req,res,next,req.body).then(response=>{
					if(response.status != Constants.STATUS_SUCCESS) {
						/** Send error response */
						req.flash(Constants.STATUS_ERROR, response.message);
						return res.redirect(Constants.WEBSITE_URL + "payment/failure");
					}

					/** Send response */
					res.redirect(Constants.WEBSITE_URL + "payment/failure");

					/** Save order status logs */
					saveOrderStatusLogs(req,res,next,{
						order_id 		: 	orderId,
						restaurant_id	:	restaurantId,
						user_id			:	userId,
						updated_by 		: 	adminId,
						user_role_id	:	Constants.CUSTOMER,
						user_type		:	Constants.USER_TYPE_CUSTOMER,
						status 			:	Constants.ORDER_Constants.PAYMENT_FAILED,
						order_status 	:	Constants.ORDER_PAYMENT_PENDING,
						changed_by_admin:	true
					}).then(()=>{});
				}).catch(next);
			}).catch((error) => { return next(error) });
		});
    };// end paymentFailure()

    /**
	 * Function to show success failure page
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	**/
	async success_failure  (req, res,next){
		let action	=	(req.params.action == Constants.STATUS_SUCCESS) ? 'success' : 'failure';
		res.render(action,{
			//~ layout : false
		});
	};// end success_failure()

	/**
	 * Function to save success response on payment
	 *
	 * @param req As Request Data
	 * @param res As Response Data
	 *
	 * @return render/json
	 */
	async uiPaymentSuccess (req, res,next, options){
		return new Promise(resolve=>{
			let userId			=	(options.user_id)	 		? 	new ObjectId(options.user_id) 		:"";
			let orderId			=	(options.order_id) 			? 	new ObjectId(options.order_id) 		:"";
			let restaurantId	=	(options.restaurant_id)		?	new ObjectId(options.restaurant_id) :"";
			let paymentResponse	=	(options.payment_response) 	?	options.payment_response	 	:{};
			let transactionId	=	(paymentResponse.TranID) 	?	paymentResponse.TranID 			:"";

			asyncParallel({
				order_details: (callback) => {
					/** Get order details */
					this.orderDB.findOne({
						_id	: 	orderId,
						$or	:	[
							{is_completed: {$ne 	 :true }},
							{is_completed: {$exists  :false }},
						]
					}).then(result=>{
						callback(null, result);
					}).catch(next);
				},
				rest_details: (callback) => {
					/** Get restaurant details */
					this.restaurantDB.findOne({_id: restaurantId },{projection:{aghzeya_restaurant_id:1}}).then(result=>{
						callback(null,result);
					}).catch(next);
				},
				admin_id: (callback) => {
					/** Get admin details */
					this.userDB.findOne({user_role_id : Constants.SYSTEM_ADMIN_ROLE_ID },{projection:{_id: 1}}).then(result=>{
						let adminId = (result) ? result._id :"";
						callback(null,adminId);
					}).catch(next);
				},
			}, (asyncErr, asyncResponse) => {
				if(asyncErr) return next(asyncErr);

				/** Send error response **/
				if(!asyncResponse.order_details || !asyncResponse.rest_details){
					return resolve({status: Constants.STATUS_ERROR, message: res.__("system.invalid_access"), asyncResponse: asyncResponse });
				}

				let orderResult 		=	asyncResponse.order_details;
				let restDetails 		=	asyncResponse.rest_details;
				let aghzeyaRestId		=	(restDetails.aghzeya_restaurant_id)	? restDetails.aghzeya_restaurant_id	:"";
				let isSchedule			=	orderResult.is_schedule;
				let isConfirm			=	orderResult.is_confirm;
				let paymentMethod		=	orderResult.payment_method;
				let orderUnpaidAmount	=	orderResult.order_unpaid_amount;
				let invoiceNumber		=	orderResult.invoice_number;
				let userMobNumber		=	orderResult.mobile_number;
				let orderDate			=	orderResult.order_date;
				let isScheduled			=	(orderResult.is_schedule) ? orderResult.is_schedule : "";
				let adminId 			=	asyncResponse.admin_id;

				/** Send error response **/
				if(orderResult.payment_link_expire_time < newDate()){
					return resolve({status: Constants.STATUS_ERROR, message: res.__("payments.payment_link_expired") });
				}

				asyncParallel({
					save_payment_details: (childCallback) => {
						if(orderResult.payment_id && orderResult.payment_received){
							return childCallback(null);
						}

						/** Save payment transaction logs */
						this.orderAPI.saveUserPaymentDetails(req,res,next,{
							user_id 		:	userId,
							updated_by		: 	userId,
							order_ids 		: 	[orderId],
							payment_method 	: 	paymentMethod,
							payment_status 	: 	Constants.PAYMENT_SUCCESS,
							payment_response: 	paymentResponse,
							transaction_id	: 	transactionId,
							currency		: 	Constants.PAYMENT_GATEWAY_CURRENCY_CODE,
							amount 			: 	orderUnpaidAmount,
							payment_event	: 	Constants.ORDER_PAYMENT,
							gateway_type	: 	Constants.UINTERFACE_PAYMENT_GATEWAY,
							not_save_status	: 	(orderResult.payment_status_update_manually) ? true :false,
						}).then(()=>{
							childCallback(null);
						}).catch(next);
					},
				}, () => {
					/** Send success response  */
					if(orderResult.is_online_payment_received) return resolve({status: Constants.STATUS_SUCCESS, invoice_number: invoiceNumber, mobile_number: userMobNumber });

					/** Set update order details */
					let updateData	=	{
						is_online_payment_received	: true,
						modified : getUtcDate()
					};

					if(!isScheduled){
						updateData['order_date'] 			= 	getUtcDate();
						updateData['previous_order_date'] 	=	orderDate;
					}

					/** Update order details */
					this.orderDB.updateOne({_id: orderId},{$set: updateData}).then(()=>{

						/** Send response */
						resolve({status: Constants.STATUS_SUCCESS, invoice_number: invoiceNumber, mobile_number: userMobNumber });

						/** Place order to aghzeya server */
						this.callAfterPlaceOrder(req,res,next,{
							order_id 			:	orderId,
							is_aghzeya 			: 	(aghzeyaRestId) ? true :false,
							admin_id 			: 	adminId,
							customer_id 		: 	userId,
							current_status 		: 	Constants.ORDER_PAYMENT_PENDING,
							is_schedule 		: 	isSchedule,
							is_confirm 			: 	isConfirm,
							restaurant_id 		: 	restaurantId,
							unique_order_id		: 	orderResult.unique_order_id,
							device_id			: 	orderResult.device_id,
							simphony			: 	orderResult.simphony || false,
						}).then(() =>{ });

						/** Pay outstanding amount **/
						this.orderAPI.payUserOrderOutstanding(req,res,next,{user_id: userId}).then(()=>{});
					}).catch(next);
				});
			});
		}).catch(next);
	};//End uiPaymentSuccess

	/**
	 * Function to save payment failure details
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	**/
	async uiPaymentFailure  (req, res,next,options){
		return new Promise(resolve=>{
			let userId			=	(options.user_id)	 		? 	new ObjectId(options.user_id) 		:"";
			let orderId			=	(options.order_id) 			? 	new ObjectId(options.order_id) 		:"";
			let restaurantId	=	(options.restaurant_id)		?	new ObjectId(options.restaurant_id) :"";
			let paymentResponse	=	(options.payment_response) 	?	options.payment_response	 	:{};
			let transactionId	=	(paymentResponse.TranID) 	?	paymentResponse.TranID 			:"";

			asyncParallel({
				order_details: (callback) => {
					/** Get order details */
					this.orderDB.findOne({
						_id	: 	orderId,
						$or	:	[
							{is_completed: {$ne 	 :true }},
							{is_completed: {$exists  :false }},
						]
					}).then(result=>{
						callback(null,result);
					}).catch(next);
				},
				admin_id: (callback) => {
					/** Get admin details */
					this.userDB.findOne({user_role_id : Constants.SYSTEM_ADMIN_ROLE_ID },{projection:{_id: 1}},(err, result)=>{
						let adminId = (result) ? result._id :"";
						callback(err,adminId);
					}).catch(next);
				},
			}, (asyncErr, asyncResponse) => {
				if (asyncErr) return next(asyncErr);

				/** Send error response **/
				if(!asyncResponse.order_details){
					return resolve({status: Constants.STATUS_ERROR, message: res.__("system.invalid_access"), asyncResponse: asyncResponse });
				}

				let orderDetails		=	asyncResponse.order_details;
				let paymentMethod		=	orderDetails.payment_method;
				let invoiceNumber		=	orderDetails.invoice_number;
				let userMobNumber		=	orderDetails.mobile_number;
				let orderPrice			=	orderDetails.order_price;
				let orderUnpaidAmount	=	(orderDetails.order_unpaid_amount) ? orderDetails.order_unpaid_amount :orderPrice;
				let adminId				=	asyncResponse.admin_id;

				/** Send error response **/
				if(orderDetails.payment_link_expire_time < newDate()){
					return resolve({status: Constants.STATUS_ERROR, message: res.__("payments.payment_link_expired") });
				}

				asyncParallel({
					save_payment_details: (childCallback) => {
						if(orderDetails.payment_id){
							return childCallback(null);
						}

						/** Save payment transaction logs */
						this.orderAPI.saveUserPaymentDetails(req,res,next,{
							user_id 		:	userId,
							updated_by		: 	userId,
							order_ids 		: 	[orderId],
							payment_method 	: 	paymentMethod,
							payment_status 	: 	Constants.PAYMENT_FAILED,
							payment_response: 	paymentResponse,
							transaction_id	: 	transactionId,
							currency		: 	Constants.PAYMENT_GATEWAY_CURRENCY_CODE,
							amount 			: 	orderUnpaidAmount,
							payment_event	: 	Constants.ORDER_PAYMENT,
							gateway_type	: 	Constants.UINTERFACE_PAYMENT_GATEWAY,
							not_save_status	: 	(orderDetails.payment_status_update_manually) ? true :false,
						}).then(response=>{
							childCallback(null);
						}).catch(next);
					},
				}, () => {

					/** Send success response  */
					if(orderDetails.is_online_payment_received) return resolve({status: Constants.STATUS_SUCCESS, invoice_number: invoiceNumber, mobile_number: userMobNumber });

					/** Send response */
					resolve({status: Constants.STATUS_SUCCESS, invoice_number: invoiceNumber, mobile_number: userMobNumber });

					/** Save order status logs */
					saveOrderStatusLogs(req,res,next,{
						order_id 		: 	orderId,
						restaurant_id	:	restaurantId,
						user_id			:	userId,
						updated_by 		: 	adminId,
						user_role_id	:	Constants.CUSTOMER,
						user_type		:	Constants.USER_TYPE_CUSTOMER,
						status 			:	Constants.ORDER_Constants.PAYMENT_FAILED,
						order_status 	:	Constants.ORDER_PAYMENT_PENDING,
						changed_by_admin:	true
					}).then(()=>{});
				});
			});
		}).catch(next);
    };// end uiPaymentFailure()

	/**
	 * Function to save payment response
	 *
	 * @param req As Request Data
	 * @param res As Response Data
	 *
	 * @return render/json
	 */
	async saveUiPaymentResponse  (req, res,next,options){
		return new Promise(resolve=>{
			let orderId			=	(req.params.order_id) 		? 	new ObjectId(req.params.order_id) 		:"";
			let userId			=	(req.params.user_id)	 	? 	new ObjectId(req.params.user_id) 		:"";
			let restaurantId	=	(req.params.restaurant_id)	?	new ObjectId(req.params.restaurant_id) 	:"";

			if(!options || (!options.Result && !options.result)){
				return resolve({status: Constants.STATUS_ERROR, message: res.__("admin.system.something_going_wrong_please_try_again") });
			}

			/** Set options */
			let tmpOptions	=	{
				user_id			: userId,
				order_id		: orderId,
				restaurant_id	: restaurantId,
				payment_response: options,
			};

			if(options.Result == "CAPTURED" || options.result == 'CAPTURED'){
				/** Save success response */
				this.uiPaymentSuccess(req,res,next,tmpOptions).then(response=>{
					resolve({
						status			:	response.status,
						message			: 	response.message,
						invoice_number	: 	response.invoice_number,
						mobile_number	: 	response.mobile_number,
						transaction_id	: 	options.TranID,
					});
				}).catch(next);
			}else{
				/** Save failure response */
				this.uiPaymentFailure(req,res,next,tmpOptions).then(response=>{
					resolve({
						status			:	response.status,
						message			: 	response.message,
						invoice_number	: 	response.invoice_number,
						mobile_number	: 	response.mobile_number,
						transaction_id	: 	options.TranID,
					});
				}).catch(next);
			}
		}).catch(next);
	};//End saveUiPaymentResponse

	/**
	 * Function to edit cart item note
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 * @param next 	As Callback argument to the middleware function
	 *
	 * @return null
	 */
	async editItemNote (req, res, next){
		let cartId 			= (req.params.cart_id) ? new ObjectId(req.params.cart_id) : "";
		let userId			= (req.body.user_id) ? req.body.user_id : "";
		let restaurantId 	= (req.body.restaurant_id) ? req.body.restaurant_id : "";
		let addressId 		= (req.body.address_id) ? req.body.address_id : "";
		let isScheduled 	= (req.body.is_scheduled) ? req.body.is_scheduled : "";
		let scheduledTime 	= (req.body.scheduled_time) ? req.body.scheduled_time : "";
		let areaId 			= (req.body.area_id) ? req.body.area_id : "";
		let deliveryBy 		= (req.body.delivery_by) ? req.body.delivery_by : "";
		let branchId		=	(req.body.branch_id) 		? req.body.branch_id 		:"";
		let isSubmit		=	(req.body.is_submit) 		? req.body.is_submit 		:"";

		if (isPost(req) && isSubmit == 'true') {
			this.userCartDB.updateOne({
				_id: new ObjectId(cartId)
			},
			{
				$set: {
					note: req.body.note,
					modified: getUtcDate()
				}
			}).then(()=>{

				/*send success response */
				res.send({ status: Constants.STATUS_SUCCESS, message: res.__("admin.place_order.item_note_has_been_changed_successfully")});
			}).catch(next);
		}else{
			this.userCartDB.findOne({_id: cartId,}, { projection: { _id: 1,note:1 } }).then(result=>{

				res.render('edit_note', {
					layout: false,
					cart_id: cartId,
					restaurant_id: restaurantId,
					user_id: userId,
					scheduled_time: scheduledTime,
					is_scheduled: isScheduled,
					address_id: addressId,
					branch_id: branchId,
					delivery_by: deliveryBy,
					area_id: areaId,
					result: (result) ? result :{},
				});
			}).catch(next);
		}
	};//End editItemNote()

	/**
	 * Function to update order status after api response
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 * @param next 	As Callback argument to the middleware function
	 *
	 * @return null
	 */
	async callAfterPlaceOrder  (req, res,next, options){
		return new Promise(resolve=>{
			let orderId			=	(options.order_id) 			?	options.order_id 			:"";
			let isAghzeya		=	(options.is_aghzeya)		?	options.is_aghzeya	 		:false;
			let adminId			=	(options.admin_id) 			?	options.admin_id 			:"";
			let customerId		=	(options.customer_id) 		?	options.customer_id 		:"";
			let currentStatus	=	(options.current_status)	?	options.current_status 		:"";
			let isSchedule		=	(options.is_schedule)		?	options.is_schedule 		:"";
			let isConfirm		=	(options.is_confirm)		?	options.is_confirm 			:"";
			let restaurantId	=	(options.restaurant_id)		?	options.restaurant_id 		:"";
			let deviceId		=	(options.device_id)			?	options.device_id 			:"";
			let uniqueOrderId	=	(options.unique_order_id)	?	options.unique_order_id 	:"";
			let notUpdateStatus	=	(options.not_update_status)	?	options.not_update_status 	:false;
			let isModify		=	(options.is_modify)			?	options.is_modify 			:false;
			let tmpUpdatedStatus=	(options.updated_status)	?	options.updated_status 		:false;
			let isAutoCron		=	(options.is_auto_cron)		?	options.is_auto_cron 		:false;
			let lastSubmittedBy	=	(options.submitted_by)		?	new ObjectId(options.submitted_by):"";
			let orderPlaceBy	=	(options.order_place_by)	?	new ObjectId(options.order_place_by):"";
			let firstTimeCall	=	(options.first_time_call)	?	options.first_time_call		:false;
			let simphony		=	(options.simphony)			?	options.simphony			:0;

			/** Send error response  */
			if(!orderId) return resolve({status: Constants.STATUS_ERROR, message: res.__("system.missing_parameters") });

			this.orderDB.aggregate([
				{$match : {
					_id: new ObjectId(orderId),
				}},
				{$lookup: {	/** Get modified user details **/
					from 		:	Tables.USERS,
					localField  :	"modified_by",
					foreignField:	"_id",
					as 		  	:	"modified_agent_details"
				}},
				{$lookup: {	/** Get placed user details **/
					from 		:	Tables.USERS,
					localField  :	"placed_by",
					foreignField:	"_id",
					as 		  	:	"placed_agent_details"
				}},
				{$addFields : {
					modified_agent_details: {$arrayElemAt: ["$modified_agent_details",0]},
					placed_agent_details: {$arrayElemAt: ["$placed_agent_details",0]}
				}}
			]).toArray().then(orderList=>{
				if(!orderList?.length)  return resolve({status: Constants.STATUS_ERROR, message: res.__("system.something_going_wrong_please_try_again") });

				let internalURL 	= 	"";
				let orderData 		=	orderList[0];
				let updatedStatus 	=	(tmpUpdatedStatus) ? tmpUpdatedStatus :((isSchedule) ? Constants.ORDER_SCHEDULED : ((isConfirm)	?	Constants.ORDER_SUBMITTED :Constants.ORDER_PENDING));
				asyncParallel({
					push_to_api: (subCallback)=>{
						if(!isAghzeya || isSchedule) return subCallback(null, null);

						let tmpData = {status_updated_by: adminId};
						let tmpUrl 	= Constants.WEBSITE_URL+'aghzeya_api/aghzeya_place_order/'+orderId+((isModify) ? "/1" :"");

						if(simphony) tmpUrl = process.env.SIMPHONY_SERVER_URL+'simphony-api/place-order/'+orderId+((isModify) ? "/1" :"");

						if(lastSubmittedBy) {
							isAutoCron 	= 	false;
							tmpUrl 		+=	"?submitted_by="+lastSubmittedBy;
						}
						if(isAutoCron) tmpUrl +="?is_cron=1";
						if(firstTimeCall) tmpData.first_time_call = 1;

						internalURL = tmpUrl;

						try{
							/** To push order to aghzeya api */
							axios({
								method: 'GET',
								url: tmpUrl,
								headers: {
									'Content-Type': 'application/json'
								},
								params: tmpData, // if tmpData is intended to be query parameters
								httpsAgent: new https.Agent({ rejectUnauthorized: false }) // equivalent to strictSSL: false
							}).then(axiosRes => {
								subCallback(null, axiosRes?.data || null);
							}).catch((error) => {
								let msg = res.__("order.order_not_place_msg",String(error));
								return subCallback(null,{status: Constants.STATUS_ERROR, errorObj: error,resMsg: msg, message: msg  });
							});
						}catch(error){
							let msg = res.__("order.order_not_place_msg",String(error));
							return subCallback(null,{status: Constants.STATUS_ERROR, errorObj: error,resMsg: msg, message: msg  });
						}
					},
				},(asyncSubErr, asyncSubRes)=>{
					if(asyncSubErr) return next(asyncSubErr);

					/** Send error response */
					if(asyncSubRes.push_to_api && asyncSubRes.push_to_api.status != Constants.STATUS_SUCCESS){

						if(asyncSubRes.push_to_api.errorObj){
							let odUniqueId 		= 	orderData?.unique_order_id || "";
							let agenetDetails 	=	orderData?.modified_agent_details?._id && orderData.modified_agent_details || orderData?.placed_agent_details?._id && orderData.placed_agent_details ||{};

							/** Reject order when api return error in response */
							aghzeyaAPI.rejectOrder(req,res,next,{
								order_id 			: 	orderId,
								branch_id 			: 	orderData?.branch_id 		|| "",
								user_type 			: 	agenetDetails?.user_type 	|| "",
								updated_by 			: 	agenetDetails?._id 			|| "",
								user_role_id		: 	agenetDetails?.user_role_id || "",
								updated_user_name	: 	agenetDetails?.full_name 	|| "",
								customer_id 		: 	orderData?.customer_id 		|| "",
								restaurant_id 		: 	orderData?.restaurant_id 	|| "",
								current_status 		: 	orderData?.order_status 	|| "",
								rejection_reason 	: 	String(asyncSubRes.push_to_api.errorObj),
								unique_order_id		:	odUniqueId,
								is_modified 		: 	isModify,
								gfc_push_retry 		: 	orderData?.gfc_push_retry || 0,
								gfc_modified_push_retry: orderData?.gfc_modified_push_retry || 0,
								submitted_user_id	:	 agenetDetails?._id || "",
							}).then(()=>{});

							aghzeyaAPI.saveApiRequestResponse(req,res,next,{
								method_name 	: 	(isModify) ? "of_update_order" :"of_place_new_order",
								response		: 	{},
								request			: 	{},
								request_error	:	asyncSubRes.push_to_api.errorObj,
								extra_perms 	:	{
									order_id	:	orderId,
									unique_order_id:odUniqueId,
									is_cron		:	isAutoCron,
									url			:	internalURL,
									resMsg		:	String(asyncSubRes.push_to_api.errorObj),
									in_catch	: 	true
								}
							});
						}

						return resolve(asyncSubRes.push_to_api);
					}

					asyncParallel({
						push_to_dhub: (subCallback)=>{
							if(isSchedule || isModify) return subCallback(null, null);

							/** To push order to dhub api */
							axios({
								method: 'GET',
								url: `${process.env.SIMPHONY_SERVER_URL}dhub-api/create-delivery-job/${orderId}`,
								headers: {
									'Content-Type': 'application/json'
								},
								httpsAgent: new https.Agent({ rejectUnauthorized: false }) // equivalent to strictSSL: false
							}).then(axiosRes => {
								subCallback(null, axiosRes?.data || null);
							}).catch((error) => {
								subCallback(error);
							});
						},
					},()=>{

						/** Send success response */
						if(notUpdateStatus) return resolve({status: Constants.STATUS_SUCCESS });

						saveOrderStatusLogs(req,res,next,{
							send_notification_call_center : (isConfirm) ? true :false,
							order_id 		: 	orderId,
							restaurant_id	:	restaurantId,
							user_id			:	customerId,
							updated_by 		: 	adminId,
							user_role_id	:	(customerId) ? Constants.CUSTOMER			:"",
							user_type		:	(customerId) ? Constants.USER_TYPE_CUSTOMER	:"",
							device_id 		: 	deviceId,
							status 			:	updatedStatus,
							order_status 	:	currentStatus,
							unique_order_id	:	uniqueOrderId,
							submitted_by	:	orderPlaceBy,
						}).then(()=>{
							/** Send success response */
							resolve({status: Constants.STATUS_SUCCESS });
						}).catch(next);
					});
				});
			}).catch(next);
		}).catch(next);
	};//End callAfterPlaceOrder()

	/**
	 * Function to get previous order list
	 *
	 * @param req As Request Data
	 * @param res As Response Data
	 *
	 * @return render/json
	 */
	async getPreviousOrderList  (req, res,next){
		let userId			=	(req.body.user_id) 			? new ObjectId(req.body.user_id) 		:"";
		let restaurantId	=	(req.body.restaurant_id)	? new ObjectId(req.body.restaurant_id) 	:"";
		let deliveryBy		=	(req.body.delivery_by) 		? req.body.delivery_by 				:"";
		let addressId		=	(req.body.address_id) 		? new ObjectId(req.body.address_id) 	:"";
		let scheduledTime	=	(req.body.scheduled_time)	? req.body.scheduled_time 			:"";
		let isScheduled		=	(req.body.is_scheduled) 	? parseInt(req.body.is_scheduled) 	: 0;
		let limit			= 	(req.body.length)			? parseInt(req.body.length)			:Constants.ADMIN_LISTING_LIMIT;
		let skip			= 	(req.body.start)			? parseInt(req.body.start)			:Constants.DEFAULT_SKIP;

		/** Check selection is vaild or not  */
		this.checkSelectionValid(req,res,next).then(selectionRes=>{
			if(selectionRes.status != Constants.STATUS_SUCCESS) return res.send(selectionRes);

			let areaId			=	(selectionRes.area_id)			?	selectionRes.area_id 		:"";
			let branchId		=	(selectionRes.branch_id)		? 	selectionRes.branch_id		:"";
			let branchDetails	=	(selectionRes.branch_details)	? 	selectionRes.branch_details	:{};
			asyncParallel({
				order_list:(callback)=>{
					/** Get list of Orders **/
					this.orderDB.aggregate([
						{$match : {
							customer_id		:	new ObjectId(userId),
							restaurant_id	:	new ObjectId(restaurantId),
						}},
						{$sort : {order_date: SORT_DESC}},
						{$skip 	: skip},
						{$limit : limit},
						{$lookup: {	/** Get order details **/
							from 		:	Tables.ORDER_DETAILS,
							localField  :	"_id",
							foreignField:	"order_id",
							as 		  	:	"order_details"
						}},
						{$lookup: {	/** Get order details **/
							from 		:	Tables.ORDER_ITEMS,
							localField  :	"_id",
							foreignField:	"order_id",
							as 		  	:	"order_items"
						}},
						{$project : {_id:1,customer_id:1,restaurant_id:1,is_confirm:1,invoice_number:1,unique_order_id:1,order_date:1,last_status_updated_on:1,restaurant_name:1,order_price:1,order_status:1,net_amount:1,is_modified:1,delivery_type:1,payment_method:1, customer_latitude: {$arrayElemAt: ["$order_details.customer_latitude",0]}, customer_longitude: {$arrayElemAt: ["$order_details.customer_longitude",0]}, delivery_duration: {$arrayElemAt: ["$order_details.delivery_duration",0]},amount_debited_by_wallet:1,order_items:1
						}},
					]).toArray().then(result=>{
						callback(null, result);
					}).catch(next);
				},
				user_detail: (callback) => {
					/** Get customer details */
					this.userDB.findOne({_id : new ObjectId(userId) },{projection:{_id: 1,full_name:1}}).then(result=>{
						callback(null,result);
					}).catch(next);
				},
			},(err, response)=>{
				if(err) return next(err);

				if(!response.user_detail){
					/** Send error response **/
					return res.send({status: Constants.STATUS_ERROR, message : res.__("system.something_going_wrong_please_try_again"), response: response });
				}

				/** Send response **/
				res.render('reorder_list',{
					layout			: 	false,
					user_id			: 	userId,
					area_id			: 	areaId,
					branch_id		: 	branchId,
					address_id		: 	addressId,
					result			: 	response.order_list,
					user_detail		: 	response.user_detail,
					restaurant_id	: 	restaurantId,
					scheduled_time	: 	scheduledTime,
					is_scheduled	: 	isScheduled,
					delivery_by		:	deliveryBy,
					branch_details	:	branchDetails,
				});
			});
		}).catch(next);
	}//End getPreviousOrderList()

	/**
	 * Function to add items cart on click on modify order first time
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 *
	 * @return render/json
	*/
	async reorderItemsCart  (req, res,next){
		let orderId			=	(req.params.order_id) 		? 	new ObjectId(req.params.order_id) 	:"";
		let userId			=	(req.body.user_id) 			? 	new ObjectId(req.body.user_id) 		:"";
		let branchId		=	(req.body.branch_id) 		? 	new ObjectId(req.body.branch_id) 	:"";
		let areaId			=	(req.body.area_id) 			? 	new ObjectId(req.body.area_id) 		:"";
		let restaurantId	=	(req.body.restaurant_id)	? 	new ObjectId(req.body.restaurant_id):"";
		let deliveryBy		=	(req.body.delivery_by) 		? 	req.body.delivery_by 			:"";
		let addressId		=	(req.body.address_id) 		? 	req.body.address_id 			:"";
		let scheduledTime	=	(req.body.scheduled_time)	? 	req.body.scheduled_time 		:"";
		let isScheduled		=	(req.body.is_scheduled) 	?	req.body.is_scheduled		 	: 0;
		let currentTime 	=	parseFloat(newDate("",Constants.TIME_FORMAT));
		let branchDetails 	=	{};

		asyncParallel({
			order_data :(callback)=>{
				/** Get detail of User orders **/
				this.orderDB.findOne({_id: orderId}).then(result=>{
					callback(null, result);
				}).catch(next);
			},
			order_items :(callback)=>{
				/** Get order details **/
				this.orderItemDB.aggregate([
					{$match : {order_id: orderId}},
					{$sort : {cart_created: Constants.SORT_ASC}},
					{$lookup:	{
						from     : Tables.ITEM_AVAILABILITY,
						let      : {itemId : "$item_id"},
						pipeline : [
							{$match : {
								$expr: {
									$and : [
										{$eq: ["$item_id", "$$itemId"]},
									]
								},
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
							}},
							{$project : { _id: 1 }},
						],
						as	:	"availability_details"
					}},
					{$lookup:	{
						from     : Tables.ITEM_LINKINGS,
						let      : {itemId : "$item_id"},
						pipeline : [
							{$match : {
								$expr: {
									$and : [
										{$eq: ["$item_id", "$$itemId"]},
									]
								},
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
								],
							}},
							{$project : { _id: 1 }},
						],
						as	:	"linking_details"
					}},
					{$addFields:{
						is_links 		:	{$size: "$linking_details"},
						is_availability : 	{$size: "$availability_details"},
					}}
				]).toArray().then(result=>{
					callback(null, result);
				}).catch(next);
			},
			delete_cart :(callback)=>{
				/** Get order details **/
				this.userCartDB.deleteMany({customer_id: userId}).then(()=>{
					callback(null);
				}).catch(next);
			},
			delete_unavailable_cart :(callback)=>{
				/** Get order details **/
				this.userDB.updateOne({_id: userId },{$unset : { unavailable_data:1}}).then(()=>{
					callback(null);
				}).catch(next);
			},
			category_list: (callback) => {
				this.restaurantAPI.getCategoryListWithItem(req,res,next).then(itemResponse=>{
					if(itemResponse.status == Constants.STATUS_SUCCESS && deliveryBy == Constants.DELIVERY_BY_CRAVEZ){
						branchDetails = itemResponse.branch_details;
					}
					if(itemResponse.status != Constants.STATUS_SUCCESS) return callback(itemResponse);
					callback(null,itemResponse);
				}).catch(next);
			},
			branch_details: (callback) => {
				if(deliveryBy != Constants.DELIVERY_BY_PICK_UP) return callback(null,null);

				/** Get details when select pickup */
				this.restaurantAPI.getBranchAreaDetails(req,res,next).then(restResponse=>{
					if(restResponse.status != Constants.STATUS_SUCCESS) return callback(restResponse);

					branchDetails = restResponse.result;
					callback(null,restResponse);
				}).catch(next);
			},
		},(asyncErr, asyncResponse)=>{
			if(asyncErr) return next(asyncErr);

			/** Send error response */
			if(!asyncResponse.order_items || asyncResponse.order_items.length ==0 || !asyncResponse.order_data){
				return res.send({status: Constants.STATUS_ERROR, message: res.__("system.something_going_wrong_please_try_again") });
			}

			let isSimphony = asyncResponse.order_data.simphony ? asyncResponse.order_data.simphony :false;

			eachOfSeries(asyncResponse.order_items,(records, firstKey, asyncEachCallback)=>{
				let itemId			=	(records.item_id)  			? 	records.item_id 	 	:"";
				let itemNote		=	(records.note)  			? 	records.note 		 	:"";
				let itemUnitId		=	(records.item_unit_id)  	? 	records.item_unit_id 	:"";
				let qty				=	(records.qty)  	  			? 	records.qty 			:"";
				let unitId			=	(records.unit_id)  			? 	records.unit_id 		:"";
				let itemType		=	(records.item_type)  		? 	records.item_type 		:"";
				let isLinks			=	(records.is_links) 			? 	records.is_links 		:"";
				let isAvailability	=	(records.is_availability) 	? 	records.is_availability :"";
				let extraItems		=	(records.extra_items) 		?	records.extra_items 	:[];
				let extraIds 		= 	[];

				if(extraItems.length >0){
					extraItems.map(extraRecord=>{
						let tmpExtraItem =[];
						let groupId		=	extraRecord.group_id;
						if(extraRecord.extra_item_id){
							let tmpObj = {
								extra_item_id 		: extraRecord.extra_item_id,
								extra_group_item_id : extraRecord.extra_item_group_id,
							}

							if(isSimphony){
								tmpObj.simphony	=	ACTIVE;
								tmpObj.qty		=	extraRecord.qty > 0 ? extraRecord.qty :1;
							}

							tmpExtraItem.push(tmpObj);
						}
						if(tmpExtraItem.length >0){
							extraIds.push({
								group_id 		:	groupId,
								extra_item_ids 	: 	tmpExtraItem,
							});
						}
					});
				}

				/** Manage request body  */
				req.body = {
					"item_unit_id"	: itemUnitId,
					"note"			: itemNote,
					"user_id"		: userId,
					"restaurant_id"	: restaurantId,
					"branch_id"		: branchId,
					"area_id"		: areaId,
					"qty"			: qty,
					"item_id"		: itemId,
					"unit_id"		: unitId,
					"item_type"		: itemType,
					"extra_items"	: extraIds,
					"is_links"		: isLinks,
					"is_availability": isAvailability,
				};

				if(isLinks > 0 && isAvailability > 0){
					this.cartAPI.updateCart(req,res,next).then(response=>{
						if(response.status != Constants.STATUS_SUCCESS) return asyncEachCallback(response.message);
						asyncEachCallback(null);
					}).catch(next);
				}else{
					this.cartAPI.addUnavailableItem(req,res,next).then(response=>{
						if(response.status != Constants.STATUS_SUCCESS) return asyncEachCallback(response.message);
						asyncEachCallback(null);
					}).catch(next);
				}
			},(asyncEachErr)=>{
				if(asyncEachErr){
					return res.send({status:Constants.STATUS_ERROR, message:asyncEachErr, asyncEachErr: asyncEachErr });
				}

				/** Render category and item list */
				res.render('category_item_list',{
					layout 			: false,
					branch_details	: branchDetails,
					item_list 		: asyncResponse.category_list,
					user_id			: userId,
					area_id			: areaId,
					restaurant_id 	: restaurantId,
					branch_id 		: branchId,
					scheduled_time	: scheduledTime,
					is_scheduled	: isScheduled,
					address_id		: addressId,
					delivery_by		: deliveryBy
				});
			});
		});
	}//reorderItemsCart()
}