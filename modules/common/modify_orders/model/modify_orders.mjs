import {hash as bcrypt} from "bcrypt";
import { ObjectId } from 'mongodb';
import axios from 'axios';
import https from 'https';
import {parallel as asyncParallel, eachOfSeries} from 'async';
import * as Constants from "../../../../config/global_constant.mjs";
import Tables from '../../../../config/database_tables.mjs';
import {isPost, sanitizeData, getUtcDate, newDate, currencyFormat,checkNumberValid, addMinute, round, callRefundAmount, isAdmin} from "../../../../utils/index.mjs";
import { savePaymentGatewayLogs, sendMail, sendMailToUsers} from "../../../../services/index.mjs";
import cartModal from '../../../frontend/api/model/user_carts.mjs';
import orderModal from '../../../frontend/api/model/order.mjs';
import offerModal from '../../../frontend/api/model/offer.mjs';
import restaurantModal from '../../../frontend/api/model/restaurant.mjs';
import placeOrderModule from '../../../admin/place_order/model/place_order.mjs';

export default class ModifyOrders {

	constructor(db) {
        this.db     =   db;
        this.userDB = db.collection(Tables.USERS);
        this.orderDB = db.collection(Tables.ORDERS);
		this.orderDetailsDB = db.collection(Tables.ORDER_DETAILS);
        this.orderItemDB = db.collection(Tables.ORDER_ITEMS);
        this.userCartDB = db.collection(Tables.USER_CARTS);   
		this.restaurantPaymentSettingDB = db.collection(Tables.RESTAURANT_PAYMENT_SETTINGS);    
        
        this.cartAPI   			=   new cartModal(db);
        this.orderAPI  			=   new orderModal(db);
        this.offerAPI  			=   new offerModal(db);
        this.restaurantAPI  	=   new restaurantModal(db);
        this.placeOrderModel      =	new placeOrderModule(db);
    }

	/**
	 * Function for get order details
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 * @param next 	As Callback argument to the middleware function
	 * @param orderId 	As Order ID
	 *
	 * @return render/json
	 */
	async getOrderDetails(req, res,next,orderId){
		try{
			/** Get detail of Order **/
			let orderResult = await this.orderDB.aggregate([
				{$match	: { _id: new ObjectId(orderId) }},
				{$lookup: {
					"from" 			: 	Tables.RESTAURANTS,
					"localField" 	:	"restaurant_id",
					"foreignField"	: 	"_id",
					"as" 			: 	"rest_details"
				}},
				{$addFields: {
					aghzeya_restaurant_id:{$arrayElemAt:["$rest_details.aghzeya_restaurant_id",0]}
				}}
			]).toArray();

			/** Send response with order details */
			let tmpOrderDetails = orderResult?.[0] || null;	
			return {status: tmpOrderDetails && Constants.STATUS_SUCCESS || Constants.STATUS_ERROR, result: tmpOrderDetails};
		}catch(err){
			return next(err);
		}		
	}

	/**
	 * Function for modify order for backend
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 * @param next 	As Callback argument to the middleware function
	 *
	 * @return render/json
	 */
	async addNewItems (req, res,next){
		try{
			let orderId	= (req.params.order_id) ? new ObjectId(req.params.order_id) : '';

			/** Get detail of Order **/
			let orderRes = await this.getOrderDetails(req,res,next,orderId);
			
			/** If order not found then return error **/
			if(orderRes.status != Constants.STATUS_SUCCESS){
				return res.status(400).send({ status: Constants.STATUS_ERROR, message: res.__("system.something_going_wrong_please_try_again") });
			}

			let orderResult 		=	orderRes?.result || {};
			let restaurantId		=	orderResult?.restaurant_id ||  '';
			let branchId			=	orderResult?.branch_id ||  '';
			let areaId				=	orderResult?.area_id ||  '';
			let userId				=	orderResult?.customer_id ||  '';
			let deviceId			=	orderResult?.device_id ||  '';
			
			if(!req?.body) req.body = {};
			req.body.branch_id		=	branchId;
			req.body.restaurant_id	=	restaurantId;
			req.body.area_id		=	areaId;
			req.body.user_id		=	userId;
			req.body.device_id		=	deviceId;
			req.body.modify_order	=	true;

			/** Get item details */
			this.restaurantAPI.getCategoryListWithItem(req,res,next).then(response=>{
				if(response.status != Constants.STATUS_SUCCESS) return res.status(400).send(response);

				/** Render add new item page */
				res.render('add_new_item',{
					layout			:	false,
					item_list		:	response,
					order_id		:	orderId,
					restaurant_id	:	restaurantId,
					branch_id		:	branchId,
					area_id			:	areaId,
				});
			}).catch(next);
		}catch(error){
			return next(error);
		}
	};

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
		try{
			req.session.deal_form = {};
			let orderId		=	(req.params.order_id) 		?	new ObjectId(req.params.order_id) 	:'';
			let itemId		=	(req.params.item_id) 		? 	new ObjectId(req.params.item_id) 	:'';
			let cartId		=	(req.params.cart_id) 		? 	new ObjectId(req.params.cart_id) 	:'';
			let extraParam	=	(req.params.extra_param) 	? 	req.params.extra_param 			    :'';

			/** Get detail of Order **/
			let orderRes = await this.getOrderDetails(req,res,next,orderId);
			
			/** If order not found then return error **/
			if(orderRes.status != Constants.STATUS_SUCCESS){
				return res.status(400).send({ status: Constants.STATUS_ERROR, message: res.__("system.something_going_wrong_please_try_again") });
			}

			/** Get order  item details **/
			let orderItems = await this.orderItemDB.findOne({order_id: orderId, item_id: itemId});

			let orderResult		=	orderRes?.result || {};
			let customerId		=	(orderResult.customer_id) 		? orderResult.customer_id 	: '';
			let deviceId		=	(orderResult.device_id) 		? orderResult.device_id 	: '';
			let restaurantId	=	(orderResult.restaurant_id) 	? orderResult.restaurant_id : '';
			let areaId			=	(orderResult.area_id) 			? orderResult.area_id 		: '';
			let branchId		=	(orderResult.branch_id) 		? orderResult.branch_id 	: '';
			let orderDeviceId	=	String(orderId)+String(customerId  || deviceId);
			asyncParallel({
				update_cart :(childCallback)=>{
					if(extraParam != 'addtocart') return childCallback(null,null);
					
					let itemNote		=	orderItems?.note || '';
					let itemId			=	orderItems?.item_id || '';
					let itemUnitId		=	orderItems?.item_unit_id || '';
					let qty				=	orderItems?.qty || 1;
					let unitId			=	orderItems?.unit_id || '';
					let doughId			=	orderItems?.dough_id || '';
					let selectorId		=	orderItems?.selector_id || '';
					let itemType		=	orderItems?.item_type || '';
					let price			=	orderItems?.price || 0;
					let subTotal		=	orderItems?.sub_total || 0;
					let discountedPrice	=	orderItems?.discounted_price || 0;
					let netAmount		=	orderItems?.net_amount || 0;
					
					let extraItems =  orderItems?.extra_items || [];
					let extraIds   =  [];
					if(extraItems?.length >0){
						extraItems.map(extraRecord=>{
							let tmpExtraItem =[];
							let groupId	=	extraRecord?.group_id;
							if(extraRecord?.extra_item_id){
								tmpExtraItem.push({
									extra_item_id 		: extraRecord.extra_item_id,
									extra_group_item_id : extraRecord.extra_item_group_id,
									qty 				: extraRecord?.qty >0 ? extraRecord?.qty :1,
								});
							}

							if(tmpExtraItem.length >0){
								extraIds.push({
									group_id 		:	groupId,
									simphony 		:	orderResult.simphony ? orderResult.simphony :false,
									extra_item_ids 	: 	tmpExtraItem,
								});
							}
						});
					}					
					
					/** Set body for update cart */
					req.body = {
						is_admin		:	true,
						order_id		:	orderId,
						device_id		:	orderDeviceId,
						note			:	itemNote,
						cart_id			:	cartId,
						restaurant_id	:	restaurantId,
						branch_id		:	branchId,
						area_id			:	areaId,
						qty				:	qty,
						item_id			:	itemId,
						item_type		:	itemType,
						item_unit_id 	: itemUnitId,
						unit_id 		: unitId,
						dough_id 		: doughId,
						selector_id 	: selectorId,
						price 			: price,
						sub_total 		: subTotal,
						net_amount 		: netAmount,
						extra_items 	: extraIds,
						discounted_price: discountedPrice,
					};
					this.cartAPI.updateCart(req,res,next).then(response=>{
						if(response.status != Constants.STATUS_SUCCESS) return childCallback(response);
						childCallback(null);
					}).catch(next);						
				},
				get_item_details :(childCallback)=>{

					if(!req.body) req.body = {};
					req.body.cart_id		=	cartId;
					req.body.item_id		=	itemId;
					req.body.branch_id		=	branchId;
					req.body.restaurant_id	=	restaurantId;
					req.body.area_id		=	areaId;
					req.body.device_id		=	orderDeviceId;

					/** Get item details */
					this.restaurantAPI.getItemDetails(req,res,next).then(response=>{
						if(response.status != Constants.STATUS_SUCCESS) return childCallback(response);
						childCallback(null,response);
					}).catch(next);
				}
			},(addCartErr, addCartAsyncResponse)=>{
				if(addCartErr) return next(addCartErr);

				let itemDetailResponse	= (addCartAsyncResponse.get_item_details) ? addCartAsyncResponse.get_item_details :{};
				let cartId				= (itemDetailResponse.item_details.cart_id)? itemDetailResponse.item_details.cart_id :'';
				asyncParallel({
					cart_data :(secondChildcallback)=>{
						if(cartId == '') return secondChildcallback(null,null);

						/** Get detail of User Cart **/
						this.userCartDB.findOne({_id : cartId }).then(cartResult=>{
							secondChildcallback(null,cartResult);
						}).catch(next);
					},
				},(cartErr, cartResponse)=>{
					if(cartErr) return next(cartErr);

					let cartData		=	cartResponse?.cart_data || {};
					let cartUnitId	 	=	cartData?.unit_id || '';
					let cartDoughId		=	cartData?.dough_id || '';
					let cartSelectorId	=	cartData?.selector_id || '';
					let cartExtraItem 	=	cartData?.extra_items || [];
					let unitLists		=	{};
					let unitData		=	[];
					let doughData 		=	[];
					let selectorData 	=	[];
					let extraGroupData 	=	[];
					
					let doughItem = {};
					let selector = {};
					let itemUnitList	=	itemDetailResponse.item_unit_list;
					itemDetailResponse.dough_list		=	{};
					itemDetailResponse.selector_list 	=   {};
					if(itemUnitList.length >0){
						let unitId	=	'';
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

					/** Render change quantity page */
					res.render('change_quantity',{
						layout			:	false,
						item_detail		:	itemDetailResponse,
						unit_id			:	cartUnitId,
						dough_id		:	cartDoughId,
						selector_id		:	cartSelectorId,
						extra_items		:	cartExtraItem,
						unit_lists		:	unitLists,
						unit_data		:	unitData,
						dough_data 		:	doughData,
						extra_group_data:	extraGroupData,
						selector_data 	:	selectorData,
						order_id		:	orderId,
						restaurant_id	:	restaurantId,
						branch_id		:	branchId,
						area_id			:	areaId,
						item_id			:	itemId,
						customer_id		:	customerId,
						device_id		:	deviceId,
					});
				});
			});
		}catch(err){
			return next(err);
		}
	};

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
		try{
			if(isPost(req)){
				/** Sanitize Data **/
				req.body	  		= sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
				let orderId 		= req?.body?.order_id || '';
				let itemId 			= req?.body?.item_id || '';
				let unitId 			= req?.body?.unit_id || '';
				let selectorId 		= req?.body?.selector_id || '';
				let doughTypeId		= req?.body?.dough_type_id || '';

				/** Get detail of Order **/
				let orderRes = await this.getOrderDetails(req,res,next,orderId);
				
				/** If order not found then return error **/
				if(orderRes.status != Constants.STATUS_SUCCESS){
					return res.status(400).send({ status: Constants.STATUS_ERROR, message: res.__("system.something_going_wrong_please_try_again") });
				}

				/** Set body for get item choice list */
				if(!req.body) req.body = {};
				req.body.item_id		=	itemId;
				req.body.branch_id		=	orderRes?.result?.branch_id || '';
				req.body.restaurant_id	=	orderRes?.result?.restaurant_id || '';
				req.body.unit_id		=	unitId;
				req.body.selector_id	=	selectorId;
				req.body.dough_type_id	=	doughTypeId;

				this.restaurantAPI.getItemChoiceList(req,res,next).then(response=>{
					
					/** Send response **/
					res.send({
						status		: response?.status || Constants.STATUS_ERROR,
						data		: response?.result || [],
						itemDetails	: response?.itemDetails || {},
					});
				}).catch(next);
			}else{
				return res.status(400).send({ status: Constants.STATUS_ERROR, message: res.__("system.something_going_wrong_please_try_again") });
			}
		}catch(err){
			return next(err);
		}
	};

	/**
	 * Function to get cart list
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 *
	 * @return render/json
	*/
	async myCart (req, res,next){
		try{
			let orderId	=	(req.params.order_id) ? new ObjectId(req.params.order_id) : '';
			
			/** Get detail of Order **/
			let orderRes = await this.getOrderDetails(req,res,next,orderId);
				
			/** If order not found then return error **/
			if(orderRes.status != Constants.STATUS_SUCCESS){
				return res.status(400).send({ status: Constants.STATUS_ERROR, message: res.__("system.something_going_wrong_please_try_again") });
			}

			let orderResult	=	orderRes?.result || {};
			let userId		=	orderResult?.customer_id || '';
			let deviceId	=	orderResult?.device_id || '';
			
			if(!req.body) req.body = {};
			req.body.branch_id		=	orderResult?.branch_id || '';
			req.body.restaurant_id	=	orderResult?.restaurant_id || '';
			req.body.area_id		=	orderResult?.area_id || '';
			req.body.device_id		=	String(orderId)+String(userId || deviceId);
			req.body.customer_id	=	"";
			req.body.user_id		=	"";

			/** Get cart details */
			this.cartAPI.getCartList(req,res,next).then(response=>{
				if(response.status != Constants.STATUS_SUCCESS) return res.status(400).send(response);

				/** Render my cart page */
				res.render('my_cart',{
					layout		:	false,
					cart_list	:	response,
					order_id	:	orderId,
					user_id		:	userId
				});
			}).catch(next);
		}catch(err){
			return next(err);
		}
	};

	/**
	 * Function to item add in cart from item deatail section
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 *
	 * @return render/json
	*/
	async updateNewItemsInCart (req,res,next){
		try{
			if(isPost(req)){
				/** Sanitize Data **/
				req.body	  	= 	sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
				let extraItems	= 	(req.body.extra_items)	?	req.body.extra_items	:[];
				let errors		=	[];

				let extraIds = [];
				if(extraItems.length >0){
					extraItems.map(records=>{
						let tmpExtraItem =[];
						let maxRecord	=	records.max_quantity && parseInt(records.max_quantity) ||0;
						let minRecord	=	records.min_quantity && parseInt(records.min_quantity) ||0;
						let simphony	=	records.simphony ? parseInt(records.simphony) :Constants.DEACTIVE;
						let groupId		=	records.group_id;
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
						if(minRecord && minRecord > tmpLength) errors.push({param: "extra_items_"+groupId, msg: res.__("admin.order.please_select_extra_items_min")});
						if(maxRecord && tmpLength > maxRecord) errors.push({param: "extra_items_"+groupId, msg: res.__("admin.order.please_select_extra_items_max")});

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

				let orderId 	= req?.body?.order_id || '';
				let userId 		= req?.body?.user_id || '';
				let deviceId 	= req?.body?.device_id || '';
				
				if(!req.body) req.body = {};
				req.body.user_id		=	'';
				req.body.device_id		=	String(orderId)+String(userId || deviceId);				
				req.body.extra_items	= 	extraIds;
				req.body.modify_order	=	true;
				req.body.add_by_admin	=	(!req?.body?.cart_id) ? true :'';

				/** Update cart items */
				this.cartAPI.updateCart(req,res,next).then(response=>{
					res.send(response);
				}).catch(next);
			}else{
				return res.status(400).send({ status: Constants.STATUS_ERROR, message: res.__("system.something_going_wrong_please_try_again") });
			}
		}catch(err){
			return next(err);
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
	async updateDealItems (req,res,next){
		try{
			if(isPost(req)){
				/** Sanitize Data **/
				req.body	  		= sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
				let itemType		= (req?.body?.item_type)	? req.body.item_type	:"";
				if(itemType == Constants.DEAL_ITEM){
					let extraItems		= (req?.body?.extra_items)	? req.body.extra_items	:[];
					let errors=	[];
					let itemUnitCount		= (req?.body?.item_unit_count)	? req.body.item_unit_count	:0;
					let itemDoughCount		= (req?.body?.item_dough_count)	? req.body.item_dough_count	:0;
					let itemSelectorCount	= (req?.body?.item_selector_count)	? req.body.item_selector_count	:0;
					if(itemUnitCount > 0){
						let unitId		=	(req?.body?.unit_id) ? req?.body?.unit_id : '';
						if(unitId == ""){
							errors.push({param: "unit_id", msg: res.__("admin.order.please_select_unit_id")});
						}
					}
					if(itemDoughCount > 0){
						let doughId		=	(req?.body?.dough_id) ? req?.body?.dough_id : '';
						if(doughId == ""){
							errors.push({param: "dough_id", msg: res.__("admin.order.please_select_dough_id")});
						}
					}
					if(itemSelectorCount > 0){
						let selectorId		=	(req?.body?.selector_id) ? req?.body?.selector_id : '';
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
					let orderId 		= (req?.body?.order_id) 		? req?.body?.order_id 	: "";
					let userId 			= (req?.body?.user_id) 		? req?.body?.user_id 		: "";
					let deviceId 		= (req?.body?.device_id) 		? req?.body?.device_id 	: "";
					if(userId){
						deviceUniqueId		=	orderId+userId;
						req.body.device_id	=	orderId+userId;
					}else{
						deviceUniqueId		=	orderId+deviceId;
						req.body.device_id	=	orderId+deviceId;
					}
					req.body.user_id		=	'';
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
					let dealForm			= (req?.body?.deal_form) 	? req?.body?.deal_form 	: 0;

					/** Set deal form in session */
					if(req.body){
						if(!req.session.deal_form)  req.session.deal_form = {};
						req.session.deal_form[deviceUniqueId+"_"+orderId+"_"+dealForm] = req.body;
						res.send({status: Constants.STATUS_SUCCESS,data:req.session.deal_form});
					}
				}
			}else{
				return res.status(400).send({ status: Constants.STATUS_ERROR, message: res.__("system.something_going_wrong_please_try_again") });
			}
		}catch(err){
			return next(err);
		}
	};//updateDealItems()

	/**
	 * Function to delete items from cart
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 *
	 * @return render/json
	*/
	async deleteItemCart (req,res,next){		
		try{
			if(isPost(req)){
				/** Sanitize Data **/
				req.body	= 	sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
				let orderId	= 	req?.body?.order_id || '';
				let cartId	= 	req?.body?.cart_id || '';

				/** Get detail of Order **/
				let orderRes = await this.getOrderDetails(req,res,next,orderId);
					
				/** If order not found then return error **/
				if(orderRes.status != Constants.STATUS_SUCCESS){
					return res.status(400).send({ status: Constants.STATUS_ERROR, message: res.__("system.something_going_wrong_please_try_again") });
				}				
					
				let userId	 =	orderRes?.result?.customer_id || '';
				let deviceId =	orderRes?.result?.device_id || '';
				
				if(!req.body) req.body = {};
				req.body.user_id	=	"";
				req.body.device_id	=	String(orderId)+String(userId || deviceId);

				if(cartId){
					req.body.cart_id = cartId;
				}else{
					req.body.restaurant_id	=	orderRes?.result?.restaurant_id || '';
				}

				this.cartAPI.removeCartItems(req,res,next).then(response=>{
					if(response.status != Constants.STATUS_SUCCESS) return res.status(400).send(response);

					/** Send response **/
					res.send({
						status  : Constants.STATUS_SUCCESS,
						message : response.message
					});
				}).catch(next);
			}else{
				return res.status(400).send({ status: Constants.STATUS_ERROR, message: res.__("system.something_going_wrong_please_try_again") });
			}
		}catch(err){
			return next(err);
		}
	}//deleteItemCart()

	/**
	 * Function to add items cart on click on modify order first time
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 *
	 * @return render/json
	*/
	async addItemsCart (req,res,next){
		try{
			let orderId		=	(req.params.order_id) ? new ObjectId(req.params.order_id) : '';

			/** Get detail of Order **/
			let orderRes = await this.getOrderDetails(req,res,next,orderId);
					
			/** If order not found then return error **/
			if(orderRes.status != Constants.STATUS_SUCCESS){
				return res.send({ status: Constants.STATUS_ERROR, message: res.__("system.something_going_wrong_please_try_again") });
			}

			asyncParallel({
				order_details :(callback)=>{
					/** Get detail of Order **/
					this.orderDetailsDB.findOne({order_id : orderId },{projection: {offer_id:1}}).then(orderResult=>{
						callback(null,orderResult);
					}).catch(next);
				},
				order_items :(callback)=>{
					/** Get order details **/
					this.orderItemDB.find({order_id: orderId }).sort({cart_created: Constants.SORT_ASC}).toArray().then(orderItemsResult=>{
						callback(null,orderItemsResult);
					}).catch(next);
				},
				delete_cart :(callback)=>{
					/** Get order details **/
					this.userCartDB.deleteMany({order_id: orderId}).then(deleteResult=>{
						callback(null,deleteResult);
					}).catch(next);
				},
			},(asyncErr, asyncResponse)=>{
				if(asyncErr) return next(asyncErr);

				let orderResult		=	orderRes?.result || {};
				let orderSubDetails	=	asyncResponse?.order_details || {};
				let orderItems		=	asyncResponse?.order_items || [];
				let customerId		=	orderResult?.customer_id || '';
				let deviceId		=	orderResult?.device_id || '';
				let restaurantId	=	orderResult?.restaurant_id || '';
				let areaId			=	orderResult?.area_id || '';
				let branchId		=	orderResult?.branch_id || '';
				let offerId			=	orderSubDetails?.offer_id || '';
				let orderDeviceId 	=	orderId+(customerId || deviceId);
				let itemCartObj 	=	{};

				if(!req.body) req.body = {};
				req.body.device_id	=	orderDeviceId;

				/** Get cart count */
				this.cartAPI.getCartCount(req,res,next).then(responseCount=>{
					if(responseCount.status != Constants.STATUS_SUCCESS) return res.send(responseCount);

					/** If order items not found then return error **/
					if(!orderItems.length){
						return res.send({
							status: Constants.STATUS_ERROR,
							message: res.__('admin.order.item_not_available')
						});
					}

					eachOfSeries(orderItems,(records, firstKey, asyncEachCallback)=>{
						let itemId				=	(records.item_id)  			? records.item_id :'';
						let itemNote			=	(records.note)  			? records.note :'';
						let itemUnitId			=	(records.item_unit_id)  	? records.item_unit_id :'';
						let qty					=	(records.qty)  	  			? records.qty :'';
						let unitId				=	(records.unit_id)  			? records.unit_id :'';
						let doughId				=	(records.dough_id)  		? records.dough_id :'';
						let itemType			=	(records.item_type)  		? records.item_type :'';
						let price				=	(records.price)  			? records.price :'';
						let subTotal			=	(records.sub_total)  		? records.sub_total :'';
						let discountedPrice		=	(records.discounted_price)  ? records.discounted_price :'';
						let netAmount			=	(records.net_amount) 		? records.net_amount :'';
						let cartId 				=	(records.cart_id) 			? records.cart_id 	:'';
						
						let selectorId			=	(records.selector_id)  		? records.selector_id :'';
						let extraItems			=	(records.extra_items) 		? records.extra_items :'';
						let extraIds = [];
						if(extraItems.length >0){
							extraItems.map(extraRecord=>{
								let tmpExtraItem =[];
								let groupId		=	extraRecord.group_id;
								if(extraRecord.extra_item_id){
									tmpExtraItem.push({
										extra_item_id 		: extraRecord.extra_item_id,
										extra_group_item_id : extraRecord.extra_item_group_id,
										qty 				: extraRecord.qty > 0 ? extraRecord.qty  :1,
									});
								}
								if(tmpExtraItem.length >0){
									extraIds.push({
										group_id 		:	groupId,
										simphony 		:	orderResult.simphony ? ACTIVE :false,
										extra_item_ids 	: 	tmpExtraItem,
									});
								}
							});
						}

						/** Set request body */
						if(!req.body) req.body = {};
						req.body =	{
							"device_id"			: orderDeviceId,
							"cart_id"			: cartId,
							"order_id"			: orderId,
							"offer_id"			: offerId,
							"note"				: itemNote,
							"item_unit_id"		: itemUnitId,
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
							"extra_items"		: extraIds,
							"modify_order"		: true
						};

						/** Update cart */
						this.cartAPI.updateCart(req,res,next).then(response=>{
							if(response.status != Constants.STATUS_SUCCESS) return asyncEachCallback(response.message);

							itemCartObj[records._id] = {cart_id: response.cart_id, item_id: itemId, order_item_id : records._id};
							asyncEachCallback(null);
						}).catch(next);
					},(asyncEachErr)=>{
						if(asyncEachErr) return res.send({status:Constants.STATUS_ERROR, message:asyncEachErr});

						/** Send response **/
						res.send({status:Constants.STATUS_SUCCESS, item_list:Object.values(itemCartObj)});
					});
				}).catch(next);
			});
		}catch(err){
			return next(err);
		}
	}//addItemsCart()

	/**
	 * Function to apply offer promo code
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 *
	 * @return render/json
	*/
	async applyCoupon (req,res,next){
		try{
			if(isPost(req)){
				/** Sanitize Data **/
				req.body			= sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
				let offerCode 		= (req.body.offer_code) 	? req.body.offer_code 		: "";
				let branchId 		= (req.body.branch_id) 		? req.body.branch_id		: "";
				let restaurantId 	= (req.body.restaurant_id) 	? req.body.restaurant_id	: "";
				let userId 			= (req.body.user_id) 		? req.body.user_id 			: "";
				let orderId			= (req.body.order_id) 		? req.body.order_id 		: "";

				/** Get detail of Order **/
				let orderRes = await this.getOrderDetails(req,res,next,orderId);
				
				/** If order not found then return error **/
				if(orderRes.status != Constants.STATUS_SUCCESS){
					return res.send({ status: Constants.STATUS_ERROR, message: res.__("system.something_going_wrong_please_try_again") });
				}
				
				/** Set request body */
				if(!req.body) req.body = {};
				req.body.user_id		=	userId;
				req.body.main_device_id	=	orderRes?.result?.device_id || '';
				req.body.order_id		=	orderId;
				req.body.branch_id		=	branchId;
				req.body.restaurant_id	=	restaurantId;
				req.body.offer_code		=	offerCode;

				/** Check offer */
				this.offerAPI.checkOffer(req,res,next).then(response=>{
					res.send(response);
				}).catch(next);
			}else{
				return res.send({status: Constants.STATUS_ERROR, message: res.__("system.something_going_wrong_please_try_again") });
			}
		}catch(err){
			return next(err);
		}
	};//applyCoupon()

	/**
	 * Function to item add in cart from item deatail section
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 *
	 * @return render/json
	*/
	async placeOrders (req,res,next){
		try{
			let authId		= 	req?.session?.user?._id || "";
			let roleId		= 	req?.session?.user?.user_role_id || "";
			if(isPost(req)){
				/** Sanitize Data **/
				req.body		=	sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
				let orderId 	= 	req?.body?.order_id || "";
				let deviceId 	= 	req?.body?.device_id || "";

				/** Get detail of Order **/
				let orderRes = await this.getOrderDetails(req,res,next,orderId);
				
				/** If order not found then return error **/
				if(orderRes.status != Constants.STATUS_SUCCESS){
					return res.send({ status: Constants.STATUS_ERROR, message: res.__("system.something_going_wrong_please_try_again") });
				}				

				let orderResult			=	orderRes?.result || {};
				let orderDeviceId		=	orderResult?.device_id || "";
				let preOrderStatus		=	orderResult?.order_status || "";
				let orderCustomerId		=	orderResult?.customer_id || "";
				let orderRestaurantId	=	orderResult?.restaurant_id || "";
				let isGuest				=	orderResult?.is_guest || false;
				let orderTotalAmount	=	orderResult?.paid_amount || orderResult?.order_price || 0;
				let uniqueOrderId		=	orderResult?.unique_order_id || "";
				let totalPaidAmount 	= 	orderResult?.paid_amount || orderResult?.order_price || 0;
				let paymentMethod		=	orderResult?.payment_method || "";
				let aghzeyaRestaurantId	=	orderResult?.aghzeya_restaurant_id || "";
				let aghzeyaSource		=	orderResult?.source || "";
				let aghzeyaBillNo		=	orderResult?.aghzeya_bill_no || "";
				let orderIsConfirm		=	orderResult?.is_confirm || "";
				let orderIsSchedule		=	orderResult?.is_schedule || "";
				let scheduledToSubmitTime=	orderResult?.scheduled_to_submit_time || "";
				let simphonyCheckRef	=	orderResult?.simphonyCheckRef || "";
				let isOrderModified 	=	aghzeyaBillNo || simphonyCheckRef ? true :false;
				
				/** Set user condition */
				let userCondition		=	{};
				if(orderCustomerId){
					userCondition._id =	new ObjectId(orderCustomerId);
				}else{
					userCondition.device_id	=	orderDeviceId;
				}

				/** Get user details */
				let userResult = await this.userDB.findOne(userCondition,{projection:{full_name:1,phone_country_code:1,mobile_number:1,email:1,cust_tele2:1}});

				/** Send error response */
				if(!userResult){
					return res.send({
						status: Constants.STATUS_ERROR, message: res.__("system.something_going_wrong_please_try_again")
					});
				}

				let mobileNumber	=	userResult?.mobile_number || "";
				let secondaryNumber	=	userResult?.cust_tele2 || "";

				let validNumRes = await checkNumberValid(req,res,next,{
					mobile_number :mobileNumber,
					cust_tele2 :secondaryNumber,
					source:aghzeyaSource,
					payment_method:paymentMethod
				});
				
				if(validNumRes.status != Constants.STATUS_SUCCESS){
					return res.send({ 
						status: Constants.STATUS_ERROR, 
						message: res.__("admin.place_order.you_cant_make_payment"), 
						mobile_number :mobileNumber, 
						cust_tele2 :secondaryNumber, 
						response : validNumRes 
					});
				}

				if(!req.body) req.body = {};
				mobileNumber			=	validNumRes?.mobile_number || "";
				req.body.customer_id	=	orderCustomerId;
				req.body.main_device_id	=	orderDeviceId;
				req.body.order_id		=	orderId;
				req.body.modified_by	=	authId;
				req.body.device_id		=	deviceId;
				if(roleId == Constants.CRAVEZ){
					req.body.is_admin			=	true;
					req.body.is_admin_modifier	=	true;
				}

				/** Place modifier order */
				this.orderAPI.placeModifierOrder(req,res,next).then(response=>{
					if(response.status != Constants.STATUS_SUCCESS){
						/** Send error response  */
						req.flash(Constants.STATUS_ERROR,response.message);
						return res.send(response);
					}

					let grandTotal = response.grand_total;
					if(paymentMethod == Constants.CASH_PAYMENT || paymentMethod == Constants.CARD_PAYMENT  || orderTotalAmount == grandTotal){
						if(preOrderStatus == Constants.ORDER_PAYMENT_PENDING || preOrderStatus == Constants.ORDER_PAYMENT_FAILED){
							/** Send response */
							req.flash(response.status,response.message);
							return res.send(response);
						}else{
							/** Place order to aghzeya server */
							this.placeOrderModel.callAfterPlaceOrder(req,res,next,{
								order_id 			:	orderId,
								is_aghzeya 			: 	(aghzeyaRestaurantId) ? true :false,
								admin_id 			: 	authId,
								customer_id 		: 	orderCustomerId,
								is_schedule 		: 	(orderIsSchedule && !scheduledToSubmitTime) ? orderIsSchedule :false,
								is_confirm 			: 	orderIsConfirm,
								restaurant_id 		: 	orderRestaurantId,
								unique_order_id		: 	uniqueOrderId,
								device_id			: 	deviceId,
								is_modify			: 	isOrderModified,
								not_update_status	: 	true,
								first_time_call		: 	true,
								simphony			: 	orderResult?.simphony || false,
							}).then((placeRes) =>{
								let tmpMessage = (placeRes.status != Constants.STATUS_SUCCESS) ? placeRes.message :response.message;

								req.flash(placeRes.status,tmpMessage);
								return res.send(response);
							}).catch(next);
						}
					}else{
						if(!aghzeyaSource || (aghzeyaSource == Constants.SOURCE_CALL_CENTER && (paymentMethod == Constants.KNET || paymentMethod == Constants.CREDIT_PAYMENT || paymentMethod == Constants.WALLET_PAYMENT))){
							/*Refund Amount Condition */
							if(orderTotalAmount> grandTotal && preOrderStatus != Constants.ORDER_PAYMENT_PENDING && preOrderStatus != Constants.ORDER_PAYMENT_FAILED){
								let totalRefundAmount	=	(orderTotalAmount - grandTotal);

								/** Place order to aghzeya server */
								this.placeOrderModel.callAfterPlaceOrder(req,res,next,{
									order_id 			:	orderId,
									is_aghzeya 			: 	(aghzeyaRestaurantId) ? true :false,
									admin_id 			: 	authId,
									customer_id 		: 	orderCustomerId,
									is_schedule 		: 	(orderIsSchedule && !scheduledToSubmitTime) ? orderIsSchedule :false,
									is_confirm 			: 	orderIsConfirm,
									restaurant_id 		: 	orderRestaurantId,
									unique_order_id		: 	uniqueOrderId,
									device_id			: 	orderDeviceId,
									is_modify			: 	isOrderModified,
									not_update_status	: 	true,
									simphony			: 	orderResult?.simphony || false,
								}).then((placeRes) =>{
									let tmpMessage = (placeRes.status != Constants.STATUS_SUCCESS) ? placeRes.message :response.message;

									/** Send response */
									req.flash(placeRes.status,tmpMessage);
									res.send(response);

									/** For refund   */
									callRefundAmount(req,res,next,{
										order_id				: 	orderId,
										user_id 				: 	orderCustomerId,
										device_id 				: 	orderDeviceId,
										is_guest				:	isGuest,
										total_refund			:	totalRefundAmount,
										total_amount			:	totalPaidAmount,
										unique_order_id			:	uniqueOrderId,
										refund_activity_type	:	Constants.REFUND_MODIFY_ORDER,
									}).then(()=>{ }).catch(next);
								});
							}else if(orderTotalAmount < grandTotal || preOrderStatus == Constants.ORDER_PAYMENT_PENDING || preOrderStatus == Constants.ORDER_PAYMENT_FAILED){
								if(preOrderStatus == Constants.ORDER_PAYMENT_PENDING || preOrderStatus == Constants.ORDER_PAYMENT_FAILED){
									totalPaidAmount		=	grandTotal;
								}else{
									totalPaidAmount		=	round((grandTotal - orderTotalAmount),Constants.ROUND_PRECISION);
								}
								let linkExpiryMinute	=	res?.locals?.settings?.["Payment.payment_link_expiry_time"] || 0;
								let paymentExpireTime 	=	addMinute(linkExpiryMinute);

								/** Update order details */
								this.orderDB.updateOne({
									_id: new ObjectId(orderId)
								},{$set: {
									'outstanding_amount'		: 	totalPaidAmount,
									'order_unpaid_amount'		: 	totalPaidAmount,
									'outstanding_payment' 		: 	Constants.UNPAID,
									'payment_received'			: 	false,
									'is_online_payment_received': 	false,
									'payment_link_expire_time' 	:	getUtcDate(paymentExpireTime)
								}}).then(()=>{

									let itemList =	[{
										"ItemName": 'Order #'+uniqueOrderId,
										"Quantity": 1,
										"UnitPrice": totalPaidAmount
									}];

									this.restaurantPaymentSettingDB.findOne({ 
										restaurant_id: new ObjectId(orderRestaurantId) 
									}, {projection: { 
										uInterface_base_url: 1, uInterface_api_key: 1, uInterface_username: 1, uInterface_password: 1, uInterface_authorization_key: 1, uInterface_merchant_id: 1, uInterface_test_mode: 1, uInterface_whitelabled: 1, default_credential: 1 
									}}).then( settingsResult => {

										let upaymentSettings = settingsResult || {};
										let getwayPriority = res?.locals?.settings?.["Payment.payment_geteway_priority"] || Constants.MYFATOORAH_PAYMENT_GATEWAY;

										let myfatoorahBaseURL	= 	res?.locals?.settings?.["Payment.myfatoorah_base_url"] || "";
										let myfatoorahToken		=	res?.locals?.settings?.["Payment.myfatoorah_token"] || "";
										let uInterfaceApiKey	=	res?.locals?.settings?.["Payment.uInterface_api_key"] || "";
										let uInterfaceMerchantId=	res?.locals?.settings?.["Payment.uInterface_merchant_id"] || "";
										let uInterfaceUsername	=	res?.locals?.settings?.["Payment.uInterface_username"] || "";
										let uInterfacePassword	=	res?.locals?.settings?.["Payment.uInterface_password"] || "";
										let uInterfaceTestMode	=	res?.locals?.settings?.["Payment.uInterface_test_mode"] || 0;
										let uInterfaceBaseUrl	=	res?.locals?.settings?.["Payment.uInterface_base_url"] || "";
										let uInterfaceWhitelabled=	res?.locals?.settings?.["Payment.uInterface_whitelabled"] || 0;
										let uInterfaceAuthorizationKey=	res?.locals?.settings?.["Payment.uInterface_authorization_key"] || "";

										asyncParallel({
											pay_online: (callback) =>{
												if (upaymentSettings && !upaymentSettings.default_credential) {
													uInterfaceApiKey 			= upaymentSettings.uInterface_api_key;
													uInterfaceMerchantId 		= upaymentSettings.uInterface_merchant_id;
													uInterfaceUsername 			= upaymentSettings.uInterface_username;
													uInterfacePassword 			= upaymentSettings.uInterface_password;
													uInterfaceTestMode 			= upaymentSettings.uInterface_test_mode;
													uInterfaceBaseUrl 			= upaymentSettings.uInterface_base_url;
													uInterfaceWhitelabled 		= upaymentSettings.uInterface_whitelabled;
													uInterfaceAuthorizationKey 	= upaymentSettings.uInterface_authorization_key;
												}

												/** Myfatoorah payment gateway */
												if(getwayPriority == Constants.MYFATOORAH_PAYMENT_GATEWAY){
													let body	=	{
														"CustomerName"		: 	userResult.full_name,
														"NotificationOption": 	userResult.email ? "ALL" : "SMS",
														"MobileCountryCode"	:	userResult.phone_country_code,
														"CustomerMobile"	: 	mobileNumber,
														"InvoiceValue"		: 	totalPaidAmount,
														"DisplayCurrencyIso":	Constants.PAYMENT_GATEWAY_CURRENCY_CODE,
														"CallBackUrl"		: 	Constants.WEBSITE_RESTAURANT_URL+"modify_orders/modify_success/"+orderId,
														"ErrorUrl"			: 	Constants.WEBSITE_ADMIN_URL+"place_order/payment_failure/"+orderId+'/'+orderCustomerId+'/'+orderRestaurantId,
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
													if(userResult.email) body['CustomerEmail'] = userResult.email;

													let requestOptions= {
														method	: 	'POST',
														url		: 	myfatoorahBaseURL+'/v2/SendPayment',
														headers	:	{
															Accept			: 	'application/json',
															'Content-Type'	:	'application/json',
															Authorization	: 	myfatoorahToken,
														},
														body: body,
														json: true
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
														event		: 	"modify_order",
														extra_perms	: 	tmpExtraPerms,
													}).then(()=>{

														/** Reqest payment getway */
														axios(requestOptions).then(axiosRes => {
															let body = axiosRes?.data || null;

															/** Save Payment gateway logs */
															savePaymentGatewayLogs(req,res,next,{
																log_id	 	:	tmpLogId,
																order_id 	:	orderId,
																request	 	: 	requestOptions,
																response	: 	body,
																type		: 	getwayPriority,
																event		: 	"modify_order",
																extra_perms	: 	{
																	...tmpExtraPerms,
																	...{after_response_time: getUtcDate()}
																}
															}).then(()=>{});

															if(!body || body.constructor != Object) return callback(null,{status: Constants.STATUS_ERROR, message: body});
															if(!body.IsSuccess) return callback(null,{status: Constants.STATUS_ERROR, message: body.message});

															callback(null,{status: Constants.STATUS_SUCCESS, result: body});
														}).catch(error=>{

															/** Save Payment gateway logs */
															savePaymentGatewayLogs(req,res,next,{
																log_id	 	:	tmpLogId,
																order_id 	:	orderId,
																request	 	: 	requestOptions,
																response	: 	String(error),
																type		: 	getwayPriority,
																event		: 	"modify_order",
																extra_perms	: 	{
																	...tmpExtraPerms,
																	...{catch_response_time: getUtcDate()}
																}
															}).then(()=>{});
					
															return callback(null,{status: Constants.STATUS_ERROR, message: error});
														});
													}).catch(next);
												}else{
													let tmpPaymentMethod =	(paymentMethod == Constants.CREDIT_PAYMENT)	? Constants.PAYMENT_GATEWAY_CREDIT_CARD :Constants.PAYMENT_GATEWAY_KNET;

													bcrypt(uInterfaceApiKey, 10).then(interfaceApiKey=>{
														let successUrl 	=	Constants.WEBSITE_RESTAURANT_URL+"modify_orders/ui_modify_success/"+orderId;
														let errorUrl	= 	Constants.WEBSITE_ADMIN_URL+"place_order/ui_payment_failure/"+orderId+'/'+orderCustomerId+'/'+orderRestaurantId;
														let webHookUrl	= 	Constants.WEBSITE_RESTAURANT_URL+"modify_orders/ui_modify_response/"+orderId;
														uInterfaceTestMode=	parseInt(uInterfaceTestMode);

														if(uInterfaceTestMode){
															webHookUrl		=	Constants.WEBSITE_URL + "payment/success";
															interfaceApiKey = 	uInterfaceApiKey;
														}else{
															successUrl	=	Constants.WEBSITE_URL + "payment/success";
															errorUrl 	= 	Constants.WEBSITE_URL + "payment/failure";
														}

														let body =	{
															"merchant_id"    :   uInterfaceMerchantId,
															"username"       :   uInterfaceUsername,
															"password"       :   uInterfacePassword,
															"api_key"        :   interfaceApiKey,
															"order_id"       :   uniqueOrderId,
															"total_price"    :   totalPaidAmount,
															"CurrencyCode"   :   Constants.PAYMENT_GATEWAY_CURRENCY_CODE,
															"CstFName"       :   userResult.full_name,
															"CstEmail"       :   userResult.email,
															"CstMobile"      :   mobileNumber,
															"success_url"    :   successUrl,
															"error_url"    	 :   errorUrl,
															"test_mode"      :   parseInt(uInterfaceTestMode),
															"whitelabled"    :   (uInterfaceWhitelabled > 0) ? true : false,
															"payment_gateway":   tmpPaymentMethod,
															"ProductName"    :   JSON.stringify([itemList[0].ItemName]),
															"ProductQty"     :   JSON.stringify([itemList[0].Quantity]),
															"ProductPrice"   :   JSON.stringify([itemList[0].UnitPrice]),
															"reference"      :   uniqueOrderId,
															"notifyURL"      :   webHookUrl
														};

														let requestOptions= {
															method	: 	'POST',
															url		: 	uInterfaceBaseUrl,
															headers	:	{
																Accept			: 	'application/json',
																Authorization	:	uInterfaceAuthorizationKey,
																'Content-Type'	: 	'application/json'
															},
															body: body,
															json: true
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
															event		: 	"modify_order",
															extra_perms	: 	tmpExtraPerms,
														}).then(()=>{

															/** Request to payment gateway  */
															axios(requestOptions).then(axiosRes => {
																let body = axiosRes?.data || null;

																/** Save Payment gateway logs */
																savePaymentGatewayLogs(req,res,next,{
																	log_id	 	:	tmpLogId,
																	order_id 	:	orderId,
																	request	 	: 	requestOptions,
																	response	: 	body,
																	type		: 	getwayPriority,
																	event		: 	"modify_order",
																	extra_perms	: 	{
																		...tmpExtraPerms,
																		...{after_response_time: getUtcDate()}
																	}
																});

																if(!body || body.constructor != Object) return callback(null,{status: Constants.STATUS_ERROR, message: body});

																if(body.status !=Constants.STATUS_SUCCESS) return callback(null,{status: Constants.STATUS_ERROR, message: body.error_msg });

																callback(null,{status: Constants.STATUS_SUCCESS, result: body});
															}).catch(error=>{

																/** Save Payment gateway logs */
																savePaymentGatewayLogs(req,res,next,{
																	log_id	 	:	tmpLogId,
																	order_id 	:	orderId,
																	request	 	: 	requestOptions,
																	response	: 	String(error),
																	type		: 	getwayPriority,
																	event		: 	"modify_order",
																	extra_perms	: 	{
																		...tmpExtraPerms,
																		...{catch_response_time: getUtcDate()}
																	}
																}).then(()=>{});
					
																return callback(null,{status: Constants.STATUS_ERROR, message: error});
															});
														}).catch(next);
													}).catch(next);
												}
											}
										}, (asyncErr, asyncResponse) => {
											if (asyncErr) return next(asyncErr);

											/** Send error response */
											if(asyncResponse.pay_online.status != Constants.STATUS_SUCCESS){
												let tmpMessage = (isAdmin(req,res)) ?  res.__('order.some_issue_payment_please_resend_link') :  res.__('order.some_issue_payment_please_try_again')

												response.message = tmpMessage
												req.flash(Constants.STATUS_ERROR, tmpMessage);
												return res.send(response);
											}

											/** Update order details */
											let payOnlineDetails = asyncResponse.pay_online.result;
											this.orderDB.updateOne({_id: new ObjectId(orderId)},{$set: { modify_invoice_response: payOnlineDetails }}).then(()=>{

												/** Send response */
												req.flash(Constants.STATUS_SUCCESS,response.message);
												res.send(response);

												if(getwayPriority == Constants.UINTERFACE_PAYMENT_GATEWAY && res?.locals?.settings?.["Payment.payment_link_receiver_email"]){
													if(payOnlineDetails.sms || payOnlineDetails.paymentURL){
														/*************** Send Payment Link Mail  ***************/
															let paymentContent = (payOnlineDetails.paymentURL) ? payOnlineDetails.paymentURL :payOnlineDetails.sms;
															sendMail(req,res,{
																to 			: 	res?.locals?.settings?.["Payment.payment_link_receiver_email"],
																action 		: 	"uinterface_order_payment_link",
																rep_array	:	[uniqueOrderId, paymentContent]
															});
														/*************** Send Payment Link Mail  ***************/
													}
												}
											}).catch(next);
										});
									});
								}).catch(next);
							}else{
								req.flash(response.status,response.message);
								return res.send(response);
							}
						}else{
							if(preOrderStatus == Constants.ORDER_PAYMENT_PENDING || preOrderStatus == Constants.ORDER_PAYMENT_FAILED){
								/** Send response */
								req.flash(response.status,response.message);
								return res.send(response);
							}else{
								/** Place order to aghzeya server */
								this.placeOrderModel.callAfterPlaceOrder(req,res,next,{
									order_id 			:	orderId,
									is_aghzeya 			: 	(aghzeyaRestaurantId) ? true :false,
									admin_id 			: 	authId,
									customer_id 		: 	orderCustomerId,
									is_schedule 		: 	(orderIsSchedule && !scheduledToSubmitTime) ? orderIsSchedule :false,
									is_confirm 			: 	orderIsConfirm,
									restaurant_id 		: 	orderRestaurantId,
									unique_order_id		: 	uniqueOrderId,
									device_id			: 	deviceId,
									is_modify			: 	isOrderModified,
									not_update_status	: 	true,
									simphony			: 	orderResult?.simphony || false,
								}).then((placeRes) =>{
									let tmpMessage = (placeRes.status != Constants.STATUS_SUCCESS) ? placeRes.message :response.message;
									req.flash(placeRes.status,tmpMessage);
									return res.send(response);
								}).catch(next);
							}
						}
					}
				}).catch(next);				
			}
		}catch(error){
			return next(error);
		}
	};//placeOrders

	/**
	 * Function to get success on payment of modify order
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 *
	 * @return render/json
	*/
	async modifyOrderSuccess (req, res,next){
		try{
			let orderId		=	req?.params?.order_id ?	new ObjectId(req?.params?.order_id) :"";
			let paymentId	=	req?.query?.paymentId || "";
			let roleId		= 	req?.session?.user?.user_role_id || "";
	
			/** Save Payment gateway logs */
			savePaymentGatewayLogs(req,res,next,{
				order_id 	:	orderId,
				request	 	: 	{},
				response	: 	req?.query || {},
				type		: 	Constants.MYFATOORAH_PAYMENT_GATEWAY,
				event		: 	"modify_order_success_response",
			}).then(()=>{});
	
			/** Get detail of Order **/
			let orderResponse = await this.getOrderDetails(req,res,next,orderId);
			
			/** Get admin details */
			let adminResult = await this.userDB.findOne({user_role_id : Constants.SYSTEM_ADMIN_ROLE_ID },{projection:{_id: 1}});
			
			/** If order not found or admin not found then return error */
			if(orderResponse.status != Constants.STATUS_SUCCESS || !adminResult){
				req.flash(Constants.STATUS_ERROR, res.__("system.invalid_access"));
				return res.redirect(Constants.WEBSITE_URL + "payment/failure");
			}
	
			let adminId 		= 	adminResult?._id || "";
			let	orderResult		=	orderResponse.result || {};
			let restaurantId	=	orderResult?.restaurant_id || "";
			let branchId		=	orderResult?.branch_id || "";
			let areaId			=	orderResult?.area_id || "";
			let userId			=	orderResult?.customer_id || "";
			let deviceId		=	orderResult?.device_id || "";
			let uniqueOrderId	=	orderResult?.unique_order_id || "";
			let aghzeyaRestId	=	orderResult?.aghzeya_restaurant_id || "";
			let aghzeyaBillNo	=	orderResult?.aghzeya_bill_no || "";
			let simphonyCheckRef=	orderResult?.simphonyCheckRef || "";
			let isOrderModified =	aghzeyaBillNo || simphonyCheckRef ? true :false;
	
			/** Send success response  */
			if(orderResult?.is_online_payment_received) return res.redirect(Constants.WEBSITE_URL + "payment/success");
	
			/** Check payment status */
			let baseURL	= 	res?.locals?.settings?.["Payment.myfatoorah_base_url"] || "";
			let token	=	res?.locals?.settings?.["Payment.myfatoorah_token"]    || "";
	
			axios({
				method	:	'POST',
				url		: 	baseURL+'/v2/GetPaymentStatus',
				headers	:	{
					Accept			: 	'application/json',
					Authorization	: 	token,
					'Content-Type'	:	'application/json'
				},
				body:{
					"Key"		: 	paymentId,
					"KeyType"	:	"paymentId",
				},
				json: true
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
					event		: 	"modify_order_success_response",
				}).then(()=>{});
	
				if(!body?.IsSuccess) return next(body?.message || "");
	
				let transactionData	=	body?.Data?.InvoiceTransactions?.[0] || {};
				let invoiceData		=	body?.Data || {};
				let amount			=	transactionData?.PaidCurrencyValue || 0;
				let paymentResponse	=	{
					InvoiceStatus		:	invoiceData?.InvoiceStatus || "",
					InvoiceValue		:	invoiceData?.InvoiceValue || 0,
					CreatedDate			:	invoiceData?.CreatedDate || "",
					InvoiceTransactions	:	transactionData,
					Comments			:	body?.Message || "",
					InvoiceReference	:	invoiceData?.InvoiceReference || "",
					CustomerName		:	invoiceData?.CustomerName || "",
					ExpiryDate			:	invoiceData?.ExpiryDate || "",
					InvoiceDisplayValue	:	invoiceData?.InvoiceDisplayValue || "",
					CustomerMobile		:	invoiceData?.CustomerMobile || "",
					InvoiceId			:	invoiceData?.InvoiceId || "",
					InvoiceItems		: 	invoiceData?.InvoiceItems || []
				};
	
				if(!req?.body) req.body = {};
				if(userId){
					req.body.user_id		=	userId;
				}else{
					req.body.device_id		=	deviceId;
				}
				req.body.user_id			=	userId;
				req.body.order_id			=	orderId;
				req.body.payment_type		=	transactionData?.PaymentGateway || "";
				req.body.payment_status		=	Constants.PAYMENT_SUCCESS;
				req.body.payment_response	=	paymentResponse;
				req.body.payment_currency	=	transactionData?.PaidCurrency || "";
				req.body.amount				=	invoiceData?.InvoiceValue || 0;
				req.body.restaurant_id		=	restaurantId;
				req.body.branch_id			=	branchId;
				req.body.area_id			=	areaId;
				if(roleId == Constants.CRAVEZ){
					req.body.is_admin		=	true;
				}
				/** Get cart details */
				this.orderAPI.payOutstandingAmountForOrder(req,res,next).then(response=>{
					if(response.status != Constants.STATUS_SUCCESS) return next(response.message);
	
					/** Send success response */
					req.flash(Constants.STATUS_SUCCESS, response.message);
					res.redirect(Constants.WEBSITE_URL + "payment/success");
	
					/** Place order to aghzeya server */
					this.placeOrderModel.callAfterPlaceOrder(req,res,next,{
						order_id 			:	orderId,
						is_aghzeya 			: 	(aghzeyaRestId) ? true :false,
						admin_id 			: 	adminId,
						customer_id 		: 	userId,
						updated_status 		: 	response.updated_status,
						current_status 		: 	Constants.ORDER_PAYMENT_PENDING,
						is_schedule 		: 	(orderResult?.is_schedule && !orderResult?.scheduled_to_submit_time) ? orderResult?.is_schedule :false,
						is_confirm 			: 	orderResult.is_confirm,
						restaurant_id 		: 	restaurantId,
						unique_order_id		: 	uniqueOrderId,
						device_id			: 	deviceId,
						is_modify			: 	isOrderModified,
						simphony			: 	orderResult.simphony || false,
					}).then(() =>{ });
	
					/** Send mail to user */
					sendMailToUsers(req,res,{
						event_type 			: Constants.NOTIFICATION_TO_RESTAURANT_ON_PAYMENT_OF_MODIFIED_ORDER,
						order_id			: orderId,
						unique_order_id		: uniqueOrderId,
						amount				: currencyFormat(amount),
						restaurant_id		: restaurantId,
					});
				}).catch(next);
			}).catch((error) => { return next(error) });	
		}catch(error){
			console.log("Modify order success error", error);

			req.flash(Constants.STATUS_ERROR, res.__("system.something_going_wrong_please_try_again"));
			return res.redirect(Constants.WEBSITE_URL + "payment/failure");
		}
	};// end modifyOrderSuccess

	/**
	 * Function to get success on payment of modify order
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 *
	 * @return render/json
	*/
	async uiModifySuccess (req, res,next,options){
		return new Promise(async resolve=>{
			try{
				let orderId			=	(options.order_id) 			? 	new ObjectId(options.order_id) 		:"";
				let paymentResponse	=	(options.payment_response) 	?	options.payment_response	 	:{};
				let transactionId	=	(paymentResponse.TranID) 	?	paymentResponse.TranID 			:"";

				/** Get detail of Order **/
				let orderResponse = await this.getOrderDetails(req,res,next,orderId);
				
				/** Get admin details */
				let adminResult = await this.userDB.findOne({user_role_id : Constants.SYSTEM_ADMIN_ROLE_ID },{projection:{_id: 1}});
				
				/** If order not found or admin not found then return error */
				if(orderResponse.status != Constants.STATUS_SUCCESS || !adminResult){
					return resolve({
						status: Constants.STATUS_ERROR,
						message: res.__("system.invalid_access"),
					});
				}

				let adminId 			=	adminResult?._id || "";
				let	orderResult			=	orderResponse.result || {};
				let restaurantId		=	orderResult?.restaurant_id || "";
				let branchId			=	orderResult?.branch_id || "";
				let areaId				=	orderResult?.area_id || "";
				let userId				=	orderResult?.customer_id || "";
				let deviceId			=	orderResult?.device_id || "";
				let uniqueOrderId		=	orderResult?.unique_order_id || "";
				let paymentMethod		=	orderResult?.payment_method || "";
				let orderUnpaidAmount	=	orderResult?.order_unpaid_amount || 0;
				let aghzeyaRestId		=	orderResult?.aghzeya_restaurant_id || "";
				let invoiceNumber		=	orderResult?.invoice_number || "";
				let userMobNumber		=	orderResult?.mobile_number || "";
				let aghzeyaBillNo		=	orderResult?.aghzeya_bill_no || "";
				let simphonyCheckRef	=	orderResult?.simphonyCheckRef || "";
				let isOrderModified 	=	aghzeyaBillNo || simphonyCheckRef ? true :false;

				/** Send error response **/
				if(orderResult?.payment_link_expire_time < newDate()){
					return resolve({status: Constants.STATUS_ERROR, message: res.__("payments.payment_link_expired") });
				}

				let notSavedLogs = false;
				asyncParallel({
					save_logs : (childCallback)=>{
						if(orderResult?.payment_id && orderResult?.payment_received){
							return childCallback(null);
						}

						/** Save payment details */
						notSavedLogs = true;
						this.orderAPI.saveUserPaymentDetails(req,res,next,{
							user_id 		: 	userId,
							device_id 		: 	deviceId,
							order_ids 		:	[orderId],
							payment_method 	:	paymentMethod,
							payment_status 	:	Constants.PAYMENT_SUCCESS,
							payment_response:	paymentResponse,
							currency 		:	Constants.PAYMENT_GATEWAY_CURRENCY_CODE,
							amount 			:	orderUnpaidAmount,
							transaction_id 	:	transactionId,
							gateway_type 	:	Constants.UINTERFACE_PAYMENT_GATEWAY,
							not_save_status	: 	(orderResult?.modified_payment_status_update_manually) ? true :false,
						}).then(()=>{
							childCallback(null);
						}).catch(next);
					},
				},()=>{

					/** Send success response  */
					if(orderResult?.is_online_payment_received){
						return resolve({
							status: Constants.STATUS_SUCCESS,
							invoice_number: invoiceNumber,
							mobile_number: userMobNumber,
						});
					}

					/** Set req body */
					req.body = {
						not_saved_logs		: 	notSavedLogs,
						is_admin			: 	true,
						user_id 			:	userId,
						device_id 			:	(!userId) ? deviceId :"",
						order_id 			:	orderId,
						payment_type 		:	paymentMethod,
						payment_status 		:	Constants.PAYMENT_SUCCESS,
						payment_response 	: 	paymentResponse,
						payment_currency 	: 	Constants.PAYMENT_GATEWAY_CURRENCY_CODE,
						amount 				: 	orderUnpaidAmount,
						restaurant_id 		: 	restaurantId,
						branch_id 			: 	branchId,
						area_id 			:	areaId,
						transaction_id 		:	transactionId,
						gateway_type		: 	Constants.UINTERFACE_PAYMENT_GATEWAY,
					};

					/** Get cart details */
					this.orderAPI.payOutstandingAmountForOrder(req,res,next).then(response=>{
						if(response?.status != Constants.STATUS_SUCCESS){
							response.invoice_number = invoiceNumber;
							response.mobile_number	= userMobNumber;
							return resolve(response);
						}

						/** Send success response */
						resolve({status: Constants.STATUS_SUCCESS, invoice_number: invoiceNumber, mobile_number: userMobNumber });

						/** Place order to aghzeya server */
						this.placeOrderModel.callAfterPlaceOrder(req,res,next,{
							order_id 			:	orderId,
							is_aghzeya 			: 	(aghzeyaRestId) ? true :false,
							admin_id 			: 	adminId,
							customer_id 		: 	userId,
							updated_status 		: 	response.updated_status,
							current_status 		: 	Constants.ORDER_PAYMENT_PENDING,
							is_schedule 		: 	(orderResult?.is_schedule && !orderResult?.scheduled_to_submit_time) ? orderResult?.is_schedule :false,
							is_confirm 			: 	orderResult?.is_confirm,
							restaurant_id 		: 	restaurantId,
							unique_order_id		: 	uniqueOrderId,
							device_id			: 	deviceId,
							is_modify			: 	isOrderModified,
							simphony			: 	orderResult?.simphony || false,
						}).then(() =>{ });

						/** Send mail to user */
						sendMailToUsers(req,res,{
							event_type 		:	Constants.NOTIFICATION_TO_RESTAURANT_ON_PAYMENT_OF_MODIFIED_ORDER,
							order_id		: 	orderId,
							unique_order_id	: 	uniqueOrderId,
							amount			: 	currencyFormat(orderUnpaidAmount),
							restaurant_id	: 	restaurantId,
						});
					}).catch(next);
				});
			}catch(error){
				console.log("Modify order uiModifySuccess error", error);

				return resolve({
					status: Constants.STATUS_ERROR,
					message: res.__("system.something_going_wrong_please_try_again"),					
				});
			}
		}).catch(next);
	};// end uiModifySuccess

	/**
	 * Function to save payment response
	 *
	 * @param req As Request Data
	 * @param res As Response Data
	 *
	 * @return render/json
	 */
	async saveUiPaymentResponse (req, res, next, options){
		return new Promise(resolve=>{
			let orderId	=	(req.params.order_id) ? new ObjectId(req.params.order_id) :"";

			if(!options || !options.Result){
				return resolve({status: Constants.STATUS_ERROR, message: res.__("admin.system.something_going_wrong_please_try_again") });
			}

			/** Set options */
			let tmpOptions	=	{
				order_id		: orderId,
				payment_response: options,
			};

			if(options.Result && options.Result.toLowerCase() == "captured"){
				/** Save success response */
				this.uiModifySuccess(req,res,next,tmpOptions).then(response=>{
					resolve({
						status			:	response?.status || "",
						message			: 	response?.message || "",
						invoice_number	: 	response?.invoice_number || "",
						mobile_number	: 	response?.mobile_number || "",
						transaction_id	: 	options?.TranID || "",
					});
				}).catch(next);
			}else{
				/** Save failure response */
				this.placeOrderModel.uiPaymentFailure(req,res,next,tmpOptions).then(response=>{
					resolve({
						status			:	response?.status || "",
						message			: 	response?.message || "",
						invoice_number	: 	response?.invoice_number || "",
						mobile_number	: 	response?.mobile_number || "",
						transaction_id	: 	options?.TranID || "",
					});
				}).catch(next);
			}
		}).catch(next);
	};//End saveUiPaymentResponse

	/**
	 * Function to update cart quantity
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 * @param next 	As Callback argument to the middleware function
	 *
	 * @return render/json
	 */
	async updateCartQty (req,res,next){
		try{
			if(isPost(req)){
				this.cartAPI.updateCartQty(req, res,next).then(response=>{
					res.send(response);
				}).catch(next);
			}else{
				return res.send({status: Constants.STATUS_ERROR, message: res.__("system.something_going_wrong_please_try_again") });
			}
		}catch(err){
			return next(err);
		}
	};//End updateCartQty()

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
		try{
			let cartId 			= req?.params?.cart_id ? new ObjectId(req.params.cart_id) : "";
			let userId			= req?.body?.user_id || "";
			let restaurantId 	= req?.body?.restaurant_id || "";
			let addressId 		= req?.body?.address_id || "";
			let isScheduled 	= req?.body?.is_scheduled || "";
			let scheduledTime 	= req?.body?.scheduled_time || "";
			let areaId 			= req?.body?.area_id || "";
			let deliveryBy 		= req?.body?.delivery_by || "";
			let branchId		= req?.body?.branch_id || "";
			let isSubmit		= req?.body?.is_submit || "";

			if (isPost(req) && isSubmit == 'true') {
				this.userCartDB.updateOne({
					_id: new ObjectId(cartId)
				},
				{
					$set: {
						note: req?.body?.note || "",
						modified: getUtcDate()
					}
				}).then(() => {
					/** Send success response */
					res.send({
						status:  Constants.STATUS_SUCCESS,
						message: res.__("admin.place_order.item_note_has_been_changed_successfully"),
					});
				}).catch(next);
			}else{
				this.userCartDB.findOne({_id: cartId,}, { projection: { _id: 1,note:1 } }).then(cartResult => {
					
					/** Send error response */
					if(!cartResult){
						return res.status(400).send({
							status: Constants.STATUS_ERROR,
							message: res.__("system.something_going_wrong_please_try_again"),
						});
					}

					/** Render edit note page */
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
						result: cartResult,
					});
				});
			}
		}catch(err){
			return next(err);
		}
	};//End editItemNote()
}