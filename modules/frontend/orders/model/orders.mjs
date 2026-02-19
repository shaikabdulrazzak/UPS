import { ObjectId } from 'mongodb';
import clone from 'clone';
import { parallel as asyncParallel } from 'async';
import BREADCRUMBS from "../../../../breadcrumbs.mjs";
import * as Constants from "../../../../config/global_constant.mjs";
import Tables from "../../../../config/database_tables.mjs";
import { newDate, arrayToObject,isPost, getDropdownList, configDatatable, cleanRegex, arrangeUserAddress,subtractMinute,getUtcDate} from "../../../../utils/index.mjs";

import RestaurantPortalModel from '../../api/model/restaurant_portal.mjs';

export default class Orders {
    constructor(db) {
        this.db = db;
        this.restaurantPortalAPI = new RestaurantPortalModel(db);
    }

	/**
	 * Function to get list of new orders
	 *
	 * @param req As Request Data
	 * @param res As Response Data
	 *
	 * @return render/json
	 */
	async getOrders (req, res, next){
		try {
			let orderStatus			=	(req.params.order_status) ? req.params.order_status : '';
			let restaurantId		=	(req.session.user.restaurant_id) ? new ObjectId(req.session.user.restaurant_id) : '';
			let restaurantBranches	=	(req.session.user.branches) ? new ObjectId(req.session.user.branches) : '';

			if(!Constants.RESTAURANT_ORDER_STATUS_TYPES[orderStatus] && orderStatus !="all_orders"){
				req.flash(Constants.STATUS_ERROR,res.__("system.invalid_access"));
				return res.redirect(Constants.WEBSITE_URL+"dashboard");
			}

			if(isPost(req)){
				let fromDate  		= 	(req.body.fromDate) ? req.body.fromDate : "";
				let toDate 	  		= 	(req.body.toDate)   ? req.body.toDate 	: "";
				let mobileNumber	= 	(req.body.mobile)   ? req.body.mobile 	: "";
				let limit			= 	(req.body.length)	? parseInt(req.body.length)	: Constants.ADMIN_LISTING_LIMIT;
				let skip			= 	(req.body.start) 	? parseInt(req.body.start)	: Constants.DEFAULT_SKIP;
				const collection	= 	this.db.collection(Tables.ORDERS);

				/** Configure Datatable conditions*/
				let dataTableConfig = await configDatatable(req,res,null);
					
				let commonConditions	=	{
					restaurant_id	:  restaurantId,
					is_confirm		:  true,
					order_status	:	{$nin: [Constants.ORDER_PAYMENT_PENDING, Constants.ORDER_PAYMENT_FAILED]},
				};
				
				if(orderStatus != "all_orders") commonConditions.restaurant_status = orderStatus;
				if(orderStatus == Constants.ORDER_REJECTED) commonConditions.restaurant_status = {$in: [ Constants.ORDER_REJECTED, Constants.ORDER_REJECTED_BY_ADMIN ]};

				/** Conditions for order date */
				if (fromDate != "" && toDate != "") {
					dataTableConfig.conditions["order_date"] = {
						$gte 	: newDate(fromDate),
						$lte 	: newDate(toDate),
					};
				}

				if(mobileNumber){
					const users = this.db.collection(Tables.USERS);
					let conditions = clone(Constants.CUSTOMER_COMMON_CONDITIONS);

					try {
						conditions['mobile_number'] = new RegExp(cleanRegex(mobileNumber));
					}catch(error){
						conditions['mobile_number'] = mobileNumber;
					}

					/** get user ids by mobile number */
					let userIds = await users.distinct('_id',conditions);

					dataTableConfig.conditions["customer_id"] = {$in :userIds};
				}

				if(restaurantBranches) dataTableConfig.conditions["branch_id"] = restaurantBranches;

				dataTableConfig.conditions = Object.assign(commonConditions, dataTableConfig.conditions);

				asyncParallel({
					records : (callback)=>{
						collection.find(dataTableConfig.conditions,{_id : 1, unique_order_id : 1,order_date : 1, restaurant_status : 1, customer_id : 1, net_amount:1, captain_id:1, branch_id : 1, delivery_type : 1,source : 1,source_payment:1,source_payment_name:1,payment_method:1,aghzeya_bill_no:1,full_name:1,mobile_number:1,
						}).sort(dataTableConfig.sort_conditions).limit(limit).skip(skip).toArray().then(result=>{
							if(!result?.length) return callback(null, result);

							/** Push branch id, delivery by id, customer id and order id in array */
							let branchIds 		= [];
							let userIds 		= [];
							let paymentMethods	= [];
							let deliveryByIds	= [];
							result.map(record=>{
								if(record.branch_id) branchIds.push(record.branch_id);
								if(record.delivery_type) deliveryByIds.push(record.delivery_type);
								if(record.customer_id) userIds.push(record.customer_id);
								if(record.payment_method) paymentMethods.push(record.payment_method);
							});

							/** Get branch, user, payment and delivery details */
							asyncParallel({
								branch_detail : (childCallback)=>{
									const restaurant_branches = this.db.collection(Tables.RESTAURANT_BRANCHES);
									restaurant_branches.find({_id : {$in : arrayToObject(branchIds)}},{projection : {_id: 1,name: 1}}).toArray().then(branchResult=>{
										if(!branchResult?.length) return childCallback(null,{});

										let branchList = {};
										branchResult.map(branch=>{
											branchList[branch._id] = branch?.name?.[Constants.DEFAULT_LANGUAGE_CODE] || "";
										});
										childCallback(null,branchList);
									}).catch(err=>{
										childCallback(err,{});
									});
								},
								user_detail : (childCallback)=>{
									const users = this.db.collection(Tables.USERS);
									users.find({
										_id : {$in : arrayToObject(userIds)}
									},{projection : {_id: 1,full_name: 1,mobile_number:1}}).toArray().then(userResult=>{
										if(!userResult?.length) return childCallback(null,{});
										
										let userList = {};
										userResult.map(user=>{
											userList[user._id] = { 'name' : user?.full_name || "", 'mobile' :  user?.mobile_number || ""};
										});

										childCallback(null,userList);
									}).catch(err=>{
										childCallback(err,{});
									});
								},
								payment_detail : (childCallback)=>{
									const payment_methods = this.db.collection(Tables.PAYMENT_METHODS);
									payment_methods.find({
										slug : {$in : paymentMethods}
									},{projection : {slug: 1,title: 1}}).toArray().then(paymentResult=>{
										if(!paymentResult?.length) return childCallback(null,{});
										
										let paymentList = {};
										paymentResult.map(payment=>{
											paymentList[payment.slug] = payment?.title?.[Constants.DEFAULT_LANGUAGE_CODE] || "";
										});

										childCallback(null,paymentList);
									}).catch(err=>{
										childCallback(err,{});
									});
								}
							},(childErr, childResponse)=>{
								if(childErr) return callback(childErr, result);
							
								result.map(record=>{
									record.branch_name   	= childResponse?.branch_detail?.[record.branch_id] || "";
									record.delivery_by 		= Constants.DELIVERY_BY?.[record.delivery_type] || "";									
									record.customer_name 	= childResponse?.user_detail?.[record.customer_id]?.name || "";
									record.customer_mobile 	= childResponse?.user_detail?.[record.customer_id]?.mobile || "";
									record.payment_type  	= childResponse?.payment_detail?.[record.payment_method] || "";
									
									if(record.source && record.source == Constants.SOURCE_CALL_CENTER){
										record.payment_type = Constants.AGHZEYA_PAYMENT_METHODS?.[record.payment_method] || "";
									}else if(record.source && record.source != Constants.SOURCE_CALL_CENTER){
										record.payment_type = record.source_payment_name?.[Constants.DEFAULT_LANGUAGE_CODE] || "";
									}
								});

								callback(null,result);
							});
						}).catch(err=>{
							callback(err, []);
						});
					},
					total_filter_records : (callback)=>{
						/** Get filtered records counting in orders **/
						collection.countDocuments(dataTableConfig.conditions).then(filterContResult=>{
							callback(null, filterContResult);
						}).catch(err=>{
							callback(err, 0);
						});
					},
				},(err, response)=>{
					if(err) return next(err);

					/** Send response **/
					res.send({
						status				: (!err) ? Constants.STATUS_SUCCESS : Constants.STATUS_ERROR,
						draw				: dataTableConfig.result_draw,
						data				: response?.records || [],
						recordsFiltered		: response?.total_filter_records || 0,
						recordsTotal		: response?.total_filter_records || 0
					});
				});
			}else{
				/** get dropdown list for given role users **/
				let dropDrownResponse = await getDropdownList(req,res,next, {
					collections : [{
						collection	: 	Tables.RESTAURANT_BRANCHES,
						columns		:	["_id",["name",Constants.DEFAULT_LANGUAGE_CODE]] ,
						conditions	:	{restaurant_id : restaurantId},
						selected	:	[restaurantBranches]
					}]
				});

				/** Render list page */
				req.breadcrumbs(BREADCRUMBS['orders/list']);
				res.render('list',{
					from_date 		: req?.query?.from_date || "",
					to_date 		: req?.query?.to_date || "",
					dynamic_variable: res.__("orders."+orderStatus),
					order_status	: orderStatus,
					branch_list		: dropDrownResponse?.final_html_data?.[0] || "",
					restaurantBranches: restaurantBranches,
					print_order_id	: req?.query?.print_order || ""
				});
			}
		} catch (error) {
			return next(error);
		}
	};//End getOrders()

	/**
	 * Function for view order detail
	 *
	 * @param req As Request Data
	 * @param res As Response Data
	 *
	 * @return render
	 */
	async viewOrderDetails (req, res, next){
		/** Get order details **/
		this.getOrderDetails(req, res, next).then((response)=>{
			if(response.status != Constants.STATUS_SUCCESS){
				/** Send error response **/
				req.flash(Constants.STATUS_ERROR,response.message);
				return res.redirect(Constants.WEBSITE_URL+"orders");
			}

			/** Render view page*/
			req.breadcrumbs(BREADCRUMBS['orders/view']);
			res.render('view',{
				result 		 	: response.result,
				orderDetails 	: response.orderDetails,
			});
		}).catch(next);
	};//End viewOrderDetails()

	/**
	 * Function to get order detail
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next 	As Callback argument to the middleware function
	 *
	 * @return json
	 */
	async getOrderDetails (req, res, next){
		return new Promise(resolve=>{
			let orderId = new ObjectId(req.params.id);

			asyncParallel({
				result :(callback)=>{
					/** Get detail of Order **/
					const orders = this.db.collection(Tables.ORDERS);
					orders.findOne({
						_id : new ObjectId(orderId)
					},{projection: {
						_id:1,unique_order_id:1,order_date:1,restaurant_name:1,restaurant_status:1,delivery_type:1,customer_id:1,branch_id:1,created:1,net_amount:1,is_modified:1,is_completed:1,captain_id:1,amount_debited_by_wallet: 1,source : 1,source_payment:1,source_payment_name:1,payment_method:1,aghzeya_bill_no:1, request_note: 1,rejection_reason: 1
					}}).then(orderResult=>{
						if(!orderResult) return callback(null,null);
						
						let branchId	=	orderResult?.branch_id || '';
						let deliveryType=	orderResult?.delivery_type || '';
						let customerId	=	orderResult?.customer_id || '';
						let captainId	=	orderResult?.captain_id || '';
						orderResult.delivery_detail = (Constants.DELIVERY_BY?.[deliveryType])? {title: Constants.DELIVERY_BY[deliveryType]} :{};
						
						asyncParallel({
							customer_detail :(orderCallback)=>{
								if(!customerId) return orderCallback(null,null);

								/** Get users details */
								const users = this.db.collection(Tables.USERS);
								users.findOne({
									_id : new ObjectId(customerId)
								},{projection: {
									_id:1,full_name:1,mobile_number:1
								}}).then(customerResult=>{
									orderCallback(null, customerResult || {});
								}).catch(err=>{
									orderCallback(err, {});
								});
							},
							captain_detail :(orderCallback)=>{
								if(!captainId) return orderCallback(null,null);
								
								/** Get detail of captain**/
								const users = this.db.collection(Tables.USERS);
								users.findOne({
									_id : new ObjectId(captainId)
								},{projection: {
									_id:1,full_name:1,mobile_number:1, vehicle_id:1
								}}).then(captainResult=>{
									if(!captainResult) return orderCallback(null,null);

									let vehicleId = captainResult.vehicle_id;

									/** Get detail of captain vehicle**/
									const driver_vehicles = this.db.collection(Tables.DRIVER_VEHICLES);
									driver_vehicles.findOne({
										_id : new ObjectId(vehicleId)
									},{projection: {
										_id:1,plate_number:1,vehicle_type:1
									}}).then(vehcileResult=>{
										if(!vehcileResult) return orderCallback(null,captainResult);

										/** Insert captain detail in a object **/
										orderCallback(null,  {
											full_name 	  : captainResult.full_name,
											mobile_number : captainResult.mobile_number,
											vehicle_type  : vehcileResult.vehicle_type,
											vehicle_number: vehcileResult.plate_number
										});
									}).catch(err=>{
										orderCallback(err, captainResult);
									});
								}).catch(err=>{
									orderCallback(err, {});
								});
							},
							branch_detail :(orderCallback)=>{
								if(!branchId) return orderCallback(null,null);

								const restaurant_branches = this.db.collection(Tables.RESTAURANT_BRANCHES);
								restaurant_branches.findOne({
									_id : new ObjectId(branchId)
								},{projection: {
									_id:1,name:1
								}}).then(branchResult=>{
									orderCallback(null, branchResult || {});
								}).catch(err=>{
									orderCallback(err, {});
								});
							}
						},(childOrderErr, childOrderResponse)=>{
							if(childOrderErr) return callback(childOrderErr,{});

							orderResult.customer_detail 	= childOrderResponse?.customer_detail || {};
							orderResult.branch_detail 		= childOrderResponse?.branch_detail || {};
							orderResult.captain_detail      = childOrderResponse?.captain_detail || {};

							callback(null,orderResult);
						});
					}).catch(err=>{
						callback(err, null);
					});
				},
				order_detail :(callback)=>{
					/** Get detail of Orders **/
					const order_details = this.db.collection(Tables.ORDER_DETAILS);
					order_details.findOne({
						order_id : new ObjectId(orderId),
					},{projection : {
						_id:1,order_id:1,net_amount:1,total_amount:1,discount_price:1,payment_method:1,preparation_time:1,delivery_duration:1,restaurant_address:1,customer_address:1,customer_address_id:1,customer_latitude:1,customer_longitude:1,restaurant_latitude:1,restaurant_longitude:1,branch_discount:1,branch_discount_type:1,additional_tax:1,delivery_fee:1, branch_extra_charge: 1, customer_address_detail:1
					}}).then(detailResult=>{
						if(!detailResult) return callback(null,null);

						asyncParallel({
							payment_type :(childCallback)=>{
								let paymentSlug	=	detailResult?.payment_method || '';
								
								const payment_methods = this.db.collection(Tables.PAYMENT_METHODS);
								payment_methods.findOne({slug: paymentSlug },{projection: {_id:1,title:1 }}).then(slugResult=>{
									childCallback(null, slugResult || {});
								}).catch(err=>{
									childCallback(err, {});
								});
							},
						},(childErr, childResponse)=>{
							if(childErr) return callback(childErr,null);
							
							detailResult.payment_title 	  = childResponse?.payment_type?.title || "";
							detailResult.address_detail   = detailResult?.customer_address_detail || {};
							callback(null,detailResult);

						});
					}).catch(err=>{
						callback(err, null);
					});
				},
			},(err, response)=>{
				if(err) return next(err);

				/** Send response */
				resolve({
					status			: (!response?.result || !response?.order_detail) ? Constants.STATUS_ERROR :Constants.STATUS_SUCCESS,
					result			: response?.result || {},
					orderDetails	: response?.order_detail || {},
				});
			});
		}).catch(next);
	};// End getOrderDetails()

	/**
	 * Function to get list of items
	 *
	 * @param req As Request Data
	 * @param res As Response Data
	 *
	 * @return render/json
	 */
	async listItems (req, res, next){
		try{
			let orderId			=	(req.params.order_id) ? new ObjectId(req.params.order_id) : '';
			let limit			= 	(req.body.length)	? parseInt(req.body.length)	: Constants.ADMIN_LISTING_LIMIT;
			let skip			= 	(req.body.start) 	? parseInt(req.body.start)	: Constants.DEFAULT_SKIP;
			const collection	= 	this.db.collection(Tables.ORDER_ITEMS);

			/** Send error response */
			if(!orderId) return res.send({status: Constants.STATUS_ERROR,message: res.__("system.something_going_wrong_please_try_again")});
			
			/** Configure Datatable conditions*/
			let dataTableConfig = await configDatatable(req,res,null);
			
			let commonConditions	=	{order_id: orderId};
			dataTableConfig.conditions = Object.assign(commonConditions, dataTableConfig.conditions);
			
			asyncParallel({
				records : (callback)=>{
					collection.aggregate([
						{$match : dataTableConfig.conditions},
						{$lookup: {	/** Get item details **/
							from 		:	Tables.ITEMS,
							localField  :	"item_id",
							foreignField:	"_id",
							as 		  	:	"item_details"
						}},
						{$project : {
							_id : 1,item_id:1, item_name : 1,qty : 1, price : 1,net_amount:1,sub_total: 1,discounted_price:1,item_type:1,unit_lists:1,dough_id:1,unit_id:1,selector_id:1,extra_items:1,note: 1
						}},
						{$sort  : dataTableConfig.sort_conditions},
						{$skip 	: skip},
						{$limit : limit}
					]).toArray().then(result=>{
						if(result.length <=0) return callback(null,result);

						let unitIds			=	[];
						let doughIds		=	[];
						let selectorIds		=	[];
						result.map(data=>{
							if(data.unit_id) unitIds.push(data.unit_id);
							if(data.dough_id) doughIds.push(data.dough_id);
							if(data.item_type == Constants.HALF_AND_HALF_ITEM || data.item_type == Constants.DEAL_ITEM ){
								if(data.unit_lists.length > 0){
									data.unit_lists.map(list=>{
										if(list.unit_id) unitIds.push(list.unit_id);
										if(list.dough_id) doughIds.push(list.dough_id);
										if(list.selector_id) selectorIds.push(list.selector_id);
									});
								}
							}
						});

						if(unitIds.length <=0) return callback(null,result);

						asyncParallel({
							unit_records : (childCallback)=>{
								if(unitIds.length <=0) return childCallback(null,{});

								const item_units_masters = this.db.collection(Tables.ITEM_UNITS_MASTERS);
								item_units_masters.find({_id : {$in : arrayToObject(unitIds)}},{projection : {_id: 1,name: 1}}).toArray().then(itemResult=>{
									if(itemResult.length <=0) return childCallback(null,{});

									let itemList = {};
									itemResult.map(items=>{
										itemList[items._id] = items?.name?.[Constants.DEFAULT_LANGUAGE_CODE] || "";
									});
									childCallback(null,itemList);
								}).catch(err=>{
									childCallback(err, {});
								});
							},
							dough_records : (childCallback)=>{
								if(doughIds.length <=0) return childCallback(null,{});

								const item_dough_units = this.db.collection(Tables.ITEM_DOUGH_UNITS);
								item_dough_units.aggregate([
									{$match: 	{
										_id		: {$in : arrayToObject(doughIds)}
									}},
									{$lookup: 	{
										from			: Tables.ITEM_UNITS_MASTERS,
										localField		: "item_unit_id",
										foreignField	: "_id",
										as				: "unit_details",
									}},
									{$project	: 	{
										unit_name: {$arrayElemAt:["$unit_details.name", 0] },
									}},
								]).toArray().then(doughResult=>{
									if(doughResult.length <=0) return childCallback(null,{});
									
									let doughList = {};
									doughResult.map(doughs=>{
										doughList[doughs._id] = doughs?.unit_name?.[Constants.DEFAULT_LANGUAGE_CODE] || "";
									});
									childCallback(null,doughList);
								}).catch(err=>{
									childCallback(err, {});
								});
							},
							selector_records : (childCallback)=>{
								if(selectorIds.length <=0) return childCallback(null,{});

								const item_selector_units = this.db.collection(Tables.ITEM_SELECTOR_UNITS);
								item_selector_units.aggregate([
									{$match: 	{
										_id		: {$in : arrayToObject(selectorIds)}
									}},
									{$lookup: 	{
										from			: Tables.ITEM_UNITS_MASTERS,
										localField		: "item_unit_id",
										foreignField	: "_id",
										as				: "unit_details",
									}},
									{$project	: 	{
										unit_name: {$arrayElemAt:["$unit_details.name", 0] },
									}},
								]).toArray().then(selectorResult=>{
									if(selectorResult.length <=0) return childCallback(null,{});

									let selectorList = {};
									selectorResult.map(selectors=>{
										selectorList[selectors._id] = selectors?.unit_name?.[Constants.DEFAULT_LANGUAGE_CODE] || "";
									});
									childCallback(null,selectorList);
								}).catch(err=>{
									childCallback(err, {});
								});
							},
						},(childErr, childResponse)=>{
							if(childErr) return callback(childErr,null);

							let doughData		=	childResponse?.dough_records || {};
							let unitData		=	childResponse?.unit_records || {};
							let selectorData	=	childResponse?.selector_records || {};
							result.map(record=>{
								let tmpUnitId 	= 	record.unit_id;
								let tmpDoughId	=	record.dough_id;

								if(tmpUnitId) record.unit_name = unitData?.[tmpUnitId] || "";								
								if(tmpDoughId) record.dough_name= doughData?.[tmpDoughId] || "";

								if(record.item_type == Constants.HALF_AND_HALF_ITEM || record.item_type == Constants.DEAL_ITEM){
									record.unit_lists.map(data=>{
										if(data.unit_id) 	tmpUnitId	=	data.unit_id;
										if(data.dough_id) 	tmpDoughId 	=	data.dough_id;

										let tmpSelectorId =	data.selector_id;

										if(tmpUnitId) data.unit_name = unitData?.[tmpUnitId] || "";
										if(tmpDoughId) data.dough_name = doughData?.[tmpDoughId] || "";
										if(tmpSelectorId) data.selector_name = selectorData?.[tmpSelectorId] || "";
									});
								}
							});
							callback(null,result);
						});
					}).catch(err=>{
						callback(err, null);
					});
				},
				total_records : (callback)=>{
					/** Get total number of records in items collection **/
					collection.countDocuments(commonConditions).then(countResult=>{
						callback(null, countResult);
					}).catch(err=>{
						callback(err, 0);
					});
				},
				total_filter_records : (callback)=>{
					/** Get filtered records counting in items **/
					collection.countDocuments(dataTableConfig.conditions).then(filterContResult=>{
						callback(null, filterContResult);
					}).catch(err=>{
						callback(err, 0);
					});
				},
			},(err, response)=>{
				/** Send response **/
				res.send({
					status			: (!err) ? Constants.STATUS_SUCCESS : Constants.STATUS_ERROR,
					draw			: dataTableConfig.result_draw,
					data			: response?.records || [],
					recordsFiltered	: response?.total_filter_records || 0,
					recordsTotal	: response?.total_records || 0
				});
			});
		}catch(err){
			return next(err);
		}
	};//End listItems()

	/**
	 * Function for update order status
	 *
	 * @param req 	As 	Request Data
     * @param res 	As 	Response Data
     * @param next 	As 	Callback argument to the middleware function
	 *
	 * @return render
	 */
	async updateOrderStatus (req,res,next){
		let isPostData 			= isPost(req);
		let orderId				= req.params.id || '';
		let orderStatus			= req.params.order_status || '';
		
		if(!req.body) req.body = {};		
		req.body.order_id 		= orderId;
		req.body.order_status 	= orderStatus;
		req.body.user_id 		= req.session.user._id;
		req.body.user_role_id   = req.session.user?.user_role_id || '';
		req.body.restaurant_id  = req.session.user?.restaurant_id || '';
		req.body.user_type 	    = req.session.user?.user_type || '';

		/** Update order status **/
		this.restaurantPortalAPI.updateOrderStatus(req,res,next).then(response=> {
			if(response.status == Constants.STATUS_ERROR){
				req.flash(Constants.STATUS_ERROR,response.message);
				return res.redirect(Constants.WEBSITE_URL+"dashboard");
			}
			/** Send success response **/
			req.flash(Constants.STATUS_SUCCESS,response.message);
			let redirectUrl = 	Constants.WEBSITE_URL+"orders/"+orderStatus;
			
			if(orderStatus == Constants.ORDER_PREPARING || orderStatus == Constants.ORDER_READY_TO_PICK_UP){
				redirectUrl += "?print_order="+orderId;
			}
			
			if(isPostData){
				return res.send({
					status	 : Constants.STATUS_SUCCESS,
					order_id : (orderStatus == Constants.ORDER_PREPARING || orderStatus == Constants.ORDER_READY_TO_PICK_UP) ? orderId :"",
				});
			}else{
				return res.redirect(redirectUrl);
			}
		}).catch(next);
	};//End updateOrderStatus()

	/**
	 * Function to reject order request
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 *
	 * @return render/json
	*/
	async rejectOrderRequest (req,res,next){
		if(isPost(req)){
			req.body.user_id 		= req.session.user?._id || '';
			req.body.user_role_id   = req.session.user?.user_role_id || '';
			req.body.user_type      = req.session.user?.user_type || '';

			/** Reject order request **/
			this.restaurantPortalAPI.rejectOrderRequest(req,res,next).then(response=> {
				/** Send error response **/
				if(response.status == Constants.STATUS_ERROR) return res.send(response);

				/** Send success response */
				req.flash(Constants.STATUS_SUCCESS,response.message);
				return res.send({
					status	     : Constants.STATUS_SUCCESS,
					redirect_url : Constants.WEBSITE_URL+"orders/"+response.order_status,
				});
			}).catch(next);
		}
	};//End rejectOrderRequest()

	/**
	 * Function to assign captain to order
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 *
	 * @return render/json
	*/
	async assignCaptain (req,res,next){
		if(isPost(req)){
			req.body.user_id 	  = req.session.user?._id || '';
			req.body.user_role_id = req.session.user?.user_role_id || '';
			req.body.user_type    = req.session.user?.user_type || '';
			req.body.order_id     = req.body.order_captain_id;

			/** Assign captain **/
			this.restaurantPortalAPI.assignCaptain(req,res,next).then(response=> {

				/** Send error response **/
				if(response.status == Constants.STATUS_ERROR) return res.send(response);

				/** Send success response */
				req.flash(Constants.STATUS_SUCCESS,response.message);
				return res.send({
					status	     : Constants.STATUS_SUCCESS,
					redirect_url : Constants.WEBSITE_URL+"orders/"+response.order_status,
				});
			}).catch(next);
		}
	};//End assignCaptain()

	/**
	 * Function to print order
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 *
	 * @return render/json
	*/
	async printOrder (req,res,next){
		let orderId 		= (req.params.order_id) ? req.params.order_id : '';
		let printOrderId= (req.query.print_order) 	?	req.query.print_order 	:'';
		let isPrintOrder= (orderId == printOrderId)	?	true :false;

		/** send error response */
		if(!orderId) return res.send({ status: Constants.STATUS_ERROR,message: res.__("system.invalid_access")});

		asyncParallel({
			result :(callback)=>{
				/** Get detail of Order **/
				const orders = this.db.collection(Tables.ORDERS);
				orders.findOne({
					_id : new ObjectId(orderId)
				},{projection: {
					_id:1,unique_order_id:1,customer_id:1,branch_id:1,created:1,net_amount:1,request_note:1,payment_method:1, amount_debited_by_wallet: 1,delivery_fee:1,delivery_type:1, order_date: 1, restaurant_id:1,source : 1,source_payment:1,source_payment_name:1
				}}).then(orderResult=>{
					if(!orderResult) return callback(null,null);
					
					let paymentSlug	=	orderResult?.payment_method || '';
					let branchId	=	orderResult?.branch_id || '';
					let customerId	=	orderResult?.customer_id || '';
					let deliveryType=	orderResult?.delivery_type || '';
					let restaurantId=	orderResult?.restaurant_id || '';

					orderResult.delivery_type_title = (Constants.DELIVERY_BY[deliveryType])? Constants.DELIVERY_BY[deliveryType] :"";

					asyncParallel({
						payment_type :(orderCallback)=>{
							if(!paymentSlug) return orderCallback(null,{});
							
							const payment_methods = this.db.collection(Tables.PAYMENT_METHODS);
							payment_methods.findOne({slug : paymentSlug },{projection: {_id:1,title:1}}).then(slugResult=>{
								orderCallback(null, slugResult);
							}).catch(err=>{
								orderCallback(err, null);
							});
						},
						customer_detail :(orderCallback)=>{
							if(!customerId) return orderCallback(null,{});

							const users = this.db.collection(Tables.USERS);
							users.findOne({_id : new ObjectId(customerId)},{projection: {_id:1,full_name:1,mobile_number:1}}).then(customerResult=>{
								orderCallback(null, customerResult);
							}).catch(err=>{
								orderCallback(err, null);
							});
						},
						branch_detail :(orderCallback)=>{
							if(!branchId) return orderCallback(null,{});

							const restaurant_branches = this.db.collection(Tables.RESTAURANT_BRANCHES);
							restaurant_branches.findOne({_id : new ObjectId(branchId) },{projection: {_id:1,name:1}}).then(branchResult=>{
								orderCallback(null, branchResult);
							}).catch(err=>{
								orderCallback(err, null);
							});
						},
						restaurant_detail :(orderCallback)=>{
							if(!restaurantId) return orderCallback(null,{});

							/** Get restaurant details */
							const restaurants = this.db.collection(Tables.RESTAURANTS);
							restaurants.findOne({_id: restaurantId },{projection: { thermal_layout_format:1, image:1}}).then(restResult=>{
								orderCallback(null, restResult);
							}).catch(err=>{
								orderCallback(err, null);
							});
						},
					},(childOrderErr, childOrderResponse)=>{
						if(childOrderErr) return callback(childOrderErr,null);

						let restDetail = childOrderResponse?.restaurant_detail || {};
						orderResult.customer_detail 	= childOrderResponse?.customer_detail || {};
						orderResult.branch_detail 		= childOrderResponse?.branch_detail || {};
						orderResult.payment_title 	  	= childOrderResponse?.payment_type || {};
						orderResult.thermal_layout_format = restDetail?.thermal_layout_format || '';
						orderResult.logo_image 		= restDetail?.image || '';
						callback(null,orderResult);
					});
				}).catch(err=>{
					callback(err, null);
				});
			},
			order_detail :(callback)=>{
				/** Get detail of Orders **/
				const order_details = this.db.collection(Tables.ORDER_DETAILS);
				order_details.findOne({
					order_id : new ObjectId(orderId),
				},{projection : {
					_id:1,customer_address:1,total_amount:1,additional_tax:1,discount_price:1,branch_extra_charge:1, customer_address_id: 1, delivery_area_id: 1, delivery_duration: 1,customer_address_detail:1
				}}).then(detailResult=>{
					if(!detailResult) return callback(null,null);

					detailResult.customer_address = (detailResult.customer_address_detail) ? arrangeUserAddress(req,res,next,detailResult.customer_address_detail) :"";

					if(!detailResult.delivery_area_id) return callback(null, detailResult);

					asyncParallel({
						area_details :(childCallback)=>{
							const areas = this.db.collection(Tables.AREAS);
							areas.findOne({_id:detailResult.delivery_area_id},{projection:{name:1}}).then(areaResult=>{
								detailResult.delivery_area_name = (areaResult && areaResult.name)?areaResult.name :"";
								childCallback(null,areaResult);
							}).catch(err=>{
								childCallback(err, null);
							});
						},
					},(childOrderErr)=>{
						callback(childOrderErr, detailResult);
					});
				}).catch(err=>{
					callback(err, null);
				});
			},
			item_detail :(callback)=>{
				const order_items =	this.db.collection(Tables.ORDER_ITEMS);
				order_items.find({order_id : new ObjectId(orderId) },{_id : 1, item_name : 1,qty : 1, price : 1, discounted_price : 1,net_amount:1,sub_total:1,item_type:1,unit_lists:1,dough_id:1,unit_id:1,selector_id:1,extra_items:1,note:1}).toArray().then(result=>{
					if(!result) return callback(null,null);
					
					let unitIds			=	[];
					let doughIds		=	[];
					let selectorIds		=	[];
					result.map(data=>{
						if(data.unit_id) unitIds.push(data.unit_id);
						if(data.dough_id) doughIds.push(data.dough_id);

						if(data.item_type == Constants.HALF_AND_HALF_ITEM || data.item_type == Constants.DEAL_ITEM ){
							if(data.unit_id) unitIds.push(data.unit_id);
							if(data.dough_id) doughIds.push(data.dough_id);
							if(data.unit_lists.length > 0){
								data.unit_lists.map(list=>{
									if(list.unit_id) unitIds.push(list.unit_id);
									if(list.dough_id) doughIds.push(list.dough_id);
									if(list.selector_id) selectorIds.push(list.selector_id);
								});
							}
						}
					});
					if(unitIds.length <=0) return callback(null,result);
					
					asyncParallel({
						unit_records : (childCallback)=>{
							if(unitIds.length <=0) return childCallback(null,{});

							const item_units_masters = this.db.collection(Tables.ITEM_UNITS_MASTERS);
							item_units_masters.find({_id : {$in : arrayToObject(unitIds)}},{projection : {_id: 1,name: 1}}).toArray().then(itemResult=>{
								if(!itemResult) return childCallback(null,{});

								let itemList = {};
								itemResult.map(items=>{
									itemList[items._id] = items.name;
								});
								childCallback(null,itemList);
							}).catch(err=>{
								childCallback(err, null);
							});
						},
						dough_records : (childCallback)=>{
							if(doughIds.length <=0) return childCallback(null,{});

							const item_dough_units = this.db.collection(Tables.ITEM_DOUGH_UNITS);
							item_dough_units.aggregate([
								{$match: 	{
									_id		: {$in : arrayToObject(doughIds)}
								}},
								{$lookup: 	{
									from			: Tables.ITEM_UNITS_MASTERS,
									localField		: "item_unit_id",
									foreignField	: "_id",
									as				: "unit_details",
								}},
								{$project	: 	{
									unit_name: {$arrayElemAt:["$unit_details.name", 0] },
								}},
							]).toArray().then(doughResult=>{
								if(!doughResult) return childCallback(null,{});

								let doughList = {};
								doughResult.map(doughs=>{
									doughList[doughs._id] = doughs.unit_name;
								});
								childCallback(null,doughList);
							}).catch(err=>{
								childCallback(err, null);
							});
						},
						selector_records : (childCallback)=>{
							if(selectorIds.length <=0) return childCallback(null,{});

							const item_selector_units = this.db.collection(Tables.ITEM_SELECTOR_UNITS);
							item_selector_units.aggregate([
								{$match: 	{
									_id		: {$in : arrayToObject(selectorIds)}
								}},
								{$lookup: 	{
									from			: Tables.ITEM_UNITS_MASTERS,
									localField		: "item_unit_id",
									foreignField	: "_id",
									as				: "unit_details",
								}},
								{$project	: 	{
									unit_name: {$arrayElemAt:["$unit_details.name", 0] },
								}},
							]).toArray().then(selectorResult=>{
								if(!selectorResult) return childCallback(null,{});

								let selectorList = {};
								selectorResult.map(selectors=>{
									selectorList[selectors._id] = selectors.unit_name;
								});
								childCallback(null,selectorList);
							}).catch(err=>{
								childCallback(err, null);
							});
						},
					},(childErr, childResponse)=>{
						if(childErr) return callback(childErr, null);

						let doughData		=	childResponse?.dough_records || {};
						let unitData		=	childResponse?.unit_records || {};
						let selectorData	=	childResponse?.selector_records || {};

						result.map(record=>{
							let tmpUnitId 	= 	record.unit_id;
							let tmpDoughId	=	record.dough_id;

							if(tmpUnitId)  record.unit_name = unitData?.[tmpUnitId] || {};
							if(tmpDoughId) record.dough_name= doughData?.[tmpDoughId] || {};

							if(record.item_type==Constants.HALF_AND_HALF_ITEM || record.item_type== Constants.DEAL_ITEM){
								record.unit_lists.map(data=>{
									if(data.unit_id) 	tmpUnitId	=	data.unit_id;
									if(data.dough_id) 	tmpDoughId 	=	data.dough_id;

									let tmpSelectorId =	data.selector_id;


									data.unit_name     = unitData?.[tmpUnitId] || {};
									data.dough_name    = doughData?.[tmpDoughId] || {};
									data.selector_name = selectorData?.[tmpSelectorId] || {};
								});
							}
						});
						callback(null,result);
					});
				}).catch(err=>{
					callback(err, null);
				});
			},
		},(err, response)=>{
			if(err) return next(err);

			let result		=	response?.result || {};
			let itemDetail	=	response?.item_detail || [];
			let amount		=	0;
			if(itemDetail.length > 0){
				itemDetail.map((records)=>{
					amount	=	amount + records.net_amount;
				});
			}

			let renderPage = result?.thermal_layout_format == Constants.A4_LAYOUT ? "print_a4" :"print";
			res.render(renderPage,{
				result			: result,
				order_detail	: response?.order_detail || {},
				item_detail		: itemDetail,
				total			: amount,
				order_amount	: response?.order_detail?.total_amount || 0,
				is_print_order	: isPrintOrder,
				layout			: false
			});
		});
	};//End printOrder()
	
	/**
	 * Function to get not accepted order id
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 *
	 * @return render/json
	*/
	async getNotConfirmOrderId (req,res,next){
		try{
			let restaurantId 	=	(req.session.user.restaurant_id)? req.session.user.restaurant_id 	:"";
			let branchId		=	(req.session.user.branches) 	? new ObjectId(req.session.user.branches) :'';
			let orderProcessTime=	newDate(subtractMinute(Constants.ORDER_AUTO_CONFIRM_PROCESS_TIME_IN_MINUTES));
	
			/** Set order conditions */
			let orderConditions = {
				restaurant_id		: new ObjectId(restaurantId),
				is_confirm			: true,
				restaurant_status	: Constants.ORDER_PENDING,
				$or 				:	[
					{is_confirm_process: {$exists : false }},
					{is_confirm_process: {$lte 	 : orderProcessTime }},
				]
			};
			if(branchId) orderConditions.branch_id = branchId;
	
			/** Get order details **/
			const orders = this.db.collection(Tables.ORDERS);
			orders.findOneAndUpdate(orderConditions,
			{$set : {
				is_confirm_process	: getUtcDate(),
			}},{projection :{_id:1},sort:{_id: Constants.SORT_DESC }}).then(result=>{
				if(!result) return next(null,null);
	
				/** Send success response */
				res.send({
					status		: 	Constants.STATUS_SUCCESS,
					order_id	:	result?._id || ""
				});
			}).catch(next);
		}catch(err){
			next(err);
		}
	};//End getNotConfirmOrderId() 
}