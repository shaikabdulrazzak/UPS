import { ObjectId } from 'mongodb';
import clone from 'clone';
import { parallel as asyncParallel, each as asyncEach, eachOfSeries} from 'async';
import * as Constants from "../../../../config/global_constant.mjs";
import Tables from '../../../../config/database_tables.mjs';
import * as services from "../../../../services/index.mjs";
import * as Helper from "../../../../utils/index.mjs";

import adminOrdersModule from '../../../admin/orders/model/orders.mjs';
import adminPlaceOrderModule from '../../../admin/place_order/model/place_order.mjs';
import assignmentModule from '../../api/model/assignment.mjs';

export default class OrderCron {
    constructor(db) {
        this.db = db;

        this.adminOrdersModel = new adminOrdersModule(db);
        this.adminPlaceOrderModel = new adminPlaceOrderModule(db);
        this.assignmentModel = new assignmentModule(db);
    }

	/**
	 * Function to order scheduled (frequency time: every 1mins )
	 *
	 * @param req 	As	 Request Data
	 * @param res 	As	Response Data
	 * @param next	As 	Callback argument to the middleware function
	 *
	 * @return render null
	 */
	async orderScheduled (req, res,next){
		/** Send response to client and work in backgHelper.round */
		res.render('blank',{layout:false});

		let orderProcessTime = Helper.newDate(Helper.subtractMinute(Constants.ORDER_PROCESS_TIME_IN_MINUTES));
        let tmpOrderDate	 = Helper.newDate(Helper.subtractMinute(Constants.PREVIOUS_MAX_DAY_TO_UPDATE_ORDER_STATUS_SCHEDULED_TO_SUBMITTED*Constants.HOURS_IN_A_DAY*Constants.MINUTES_IN_A_HOUR),Constants.CURRENTDATE_START_DATE_FORMAT);
		let orderIdsObj = {};

		const orders = this.db.collection(Tables.ORDERS);
		asyncParallel({
			order_list : (callback)=>{
				/** Set order conditions */
				let orderConditions = {
					order_date		: {$gte: Helper.newDate(tmpOrderDate)},
					order_status 	: {$nin : [
						Constants.ORDER_DELIVERED,
						Constants.ORDER_CANCELLED,
						Constants.ORDER_REJECTED,
						Constants.ORDER_REJECTED_BY_ADMIN,
						Constants.ORDER_PAYMENT_PENDING,
						Constants.ORDER_PAYMENT_FAILED
					]},
					scheduled_date	: {$lte: Helper.newDate()},
					is_schedule		: true,
					$and			:	[
						{scheduled_to_submit_time: {$exists : false }},
						{$or :	[
							{is_completed: {$exists  :false }},
							{is_completed: {$ne 	 :true }},
						]},
						{$or :	[
							{scheduled_process_time: {$exists : false }},
							{scheduled_process_time: {$lte 	 : orderProcessTime }},
						]}
					]
				};

				/** Get orders list */
				orders.find(orderConditions).toArray().then(result=>{
					let allOrderIds = [];
					result.map(records=>{
						allOrderIds.push(records._id);
					});

					orders.updateMany({_id:{$in: allOrderIds}},{$set:{scheduled_process_time: Helper.getUtcDate() }}).then(()=>{
						callback(null, result);
					}).catch(err=>{
						callback(err);
					});
				}).catch(err=>{
					callback(err);
				});
			},
			user_details : (callback)=>{
				/** Get user details */
				const users = this.db.collection(Tables.USERS);
				users.findOne({user_role_id : Constants.SYSTEM_ADMIN_ROLE_ID },{projection:{_id:1}}).then(result=>{
					callback(null, result);
				}).catch(err=>{
					callback(err);
				});
			},
		},(asyncErr,asyncResponse)=>{
			if(asyncErr){
				return console.error("async parallel Error at orderCron in orderScheduled",asyncErr);
			}

			let orderList  	= 	asyncResponse?.order_list || [];
			let adminId     =	asyncResponse?.user_details?._id || "";
			if(orderList?.length > 0 && adminId){
				eachOfSeries(orderList,(records, key, eachCallback)=>{
					if(orderIdsObj[String(records._id)]) return eachCallback(null);

					orderIdsObj[String(records._id)] = true;

					/** Update order details */
					orders.updateOne({
						_id: records._id
					},
					{
						$set:{
							scheduled_to_submit_time: Helper.getUtcDate()
						},
						$unset:{
							scheduled_process_time: 1
						}
					}).then(()=>{

						let tmpDbStatus	= 	records.order_status;
						let isConfirm 	= 	records.is_confirm;
						let orderStatus =	Constants.ORDER_SUBMITTED;
						if(!isConfirm) orderStatus = Constants.ORDER_PENDING;

						this.adminPlaceOrderModel.callAfterPlaceOrder(req,res,next,{
							order_id 			:	records._id,
							is_aghzeya 			: 	records.aghzeya,
							admin_id 			: 	adminId,
							customer_id 		: 	records.customer_id,
							current_status 		: 	tmpDbStatus,
							is_schedule 		: 	false,
							is_confirm 			: 	isConfirm,
							restaurant_id 		: 	records.restaurant_id,
							unique_order_id		: 	records.unique_order_id,
							device_id			: 	records.device_id,
							not_update_status	: 	(tmpDbStatus != Constants.ORDER_SCHEDULED) ? true :false,
							simphony			: 	records.simphony || false,
						}).then(()=>{
							eachCallback(null);
						}).catch(err=>{
							return eachCallback(err);
						});
					}).catch(err=>{
						return eachCallback(err);
					});
				},eachErr=>{
					if(eachErr){
						console.error("async series Error at orderCron in orderScheduled",eachErr);
					}
				});
			}
		});
	};//End orderScheduled()

	/**
	 * Function to order canceled (frequency time: every 28mins )
	 *
	 * @param req 	As	 Request Data
	 * @param res 	As	Response Data
	 * @param next	As 	Callback argument to the middleware function
	 *
	 * @return render null
	 */
	async orderCanceled (req, res,next){
		/** Send response to client and work in backgHelper.round */
		res.render('blank',{layout:false});

		const orders = this.db.collection(Tables.ORDERS);
		asyncParallel({
			order_list : (callback)=>{
				let tmpOrderDate	= Helper.newDate(Helper.subtractMinute(15*Constants.HOURS_IN_A_DAY*Constants.MINUTES_IN_A_HOUR),Constants.CURRENTDATE_START_DATE_FORMAT);

				/** Set order conditions */
				let orderConditions = {
					order_date 		: {
						$gte: Helper.newDate(tmpOrderDate),
						$lte: Helper.newDate(Helper.subtractMinute(Constants.MAX_MINUTE_FOR_ORDER_CANCELED/Constants.MINUTES_IN_A_HOUR))
					},
					order_status	: Constants.ORDER_PENDING,
					is_confirm		: false,
				};

				/** Get orders list */
				orders.find(orderConditions,{projection: {customer_id:1,restaurant_id:1,device_id:1}}).toArray().then(result=>{
					callback(null, result);
				}).catch(err=>{
					callback(err);
				});
			},
			user_details : (callback)=>{
				/** Get user details */
				const users = this.db.collection(Tables.USERS);
				users.findOne({user_role_id : Constants.SYSTEM_ADMIN_ROLE_ID },{projection:{_id:1}}).then(result=>{
					callback(null, result);
				}).catch(err=>{
					callback(err);
				});
			},
		},(asyncErr,asyncResponse)=>{
			if(asyncErr){
				console.error("first async parallel Error at orderCron in orderCanceled",asyncErr);
			}

			let orderList  	= 	asyncResponse?.order_list || [];
			let adminId     =	asyncResponse?.user_details?._id || "";
			if(orderList?.length > 0 && adminId){
				asyncEach(orderList,(records,eachCallback)=>{
                    /** Update order details */
					orders.updateOne({
						_id : new ObjectId(records._id),
					},
					{$set: {
						cancelled_by	 	: adminId,
						order_status	 	: Constants.ORDER_CANCELLED,
						rejection_reason 	: Constants.ORDER_CANCELED_REASON,
						modified 			: Helper.getUtcDate(),
					}}).then(()=>{

						Helper.saveOrderStatusLogs(req,res,next,{
							updated_by		:	adminId,
							user_id			:	records.customer_id,
							restaurant_id	:	records.restaurant_id,
							device_id		:	records.device_id,
							status 			:	Constants.ORDER_CANCELLED,
							order_status	:	Constants.ORDER_PENDING,
							order_id 		:	records._id,
						});

						/** Send cancelled request to aghzeya api  */
						this.adminOrdersModel.markAghzeyaOrderToCancelled(req,res,next,{
							order_id	 : 	records._id,
							restaurant_id: 	records.restaurant_id,
						});

						eachCallback(null);
					}).catch(err=>{
						return eachCallback(err);
					});
				},(asyncEachErr)=>{
					if(asyncEachErr){
						console.error("async each Error at orderCron in orderCanceled",asyncEachErr);
					}
				});
			}
		});
	};//End orderCanceled()

	/**
	 * Function to update order delivery preparation time
	 *
	 * @param req 	As	 Request Data
	 * @param res 	As	Response Data
	 * @param next	As 	Callback argument to the middleware function
	 *
	 * @return render null
	 */
	async updateOrderDeliveryPreparationTime (req, res,next){
		/** Send response to client and work in backgHelper.round */
		res.render('blank',{layout:false});

		/** Set order conditions */
		let orderProcessTime= Helper.newDate(Helper.subtractMinute(1));
		let tmpOrderDate	= Helper.newDate(Helper.subtractMinute(Constants.PREVIOUS_MAX_DAY_TO_UPDATE_REMAINING_PREPARATION_TIME_IN_ORDERS*Constants.HOURS_IN_A_DAY*Constants.MINUTES_IN_A_HOUR),Constants.CURRENTDATE_START_DATE_FORMAT);
		let orderConditions = {
			order_date	:	{$gte: Helper.newDate(tmpOrderDate)},
			order_assignment_start_time: {$lte: Helper.newDate(Helper.addMinute(2))},
			$and : [
				{is_completed: {$exists: false}},
				{is_completed: {$ne: true}},
				{$or :	[
					{prepare_time_proceed : {$exists: false}},
					{prepare_time_proceed : {$lte: orderProcessTime}}
				]}
			],
		};

		/** Get orders list */
		const orders = this.db.collection(Tables.ORDERS);
		orders.distinct("_id",orderConditions).then(orderIds=>{
			if(orderIds?.length <=0) return;

			if(orderIds && orderIds.length > 0){
				const users 		=	this.db.collection(Tables.USERS);
				const order_details = 	this.db.collection(Tables.ORDER_DETAILS);

				asyncParallel({
					update_order_details : (callback)=>{
						/** Update flag in orders table */
						orders.updateMany({_id: {$in: orderIds} },{ $set: {prepare_time_proceed  : Helper.getUtcDate() }}).then(()=>{
							callback(null);
						}).catch(err=>{
							callback(err);
						});
					},
					order_log_list : (callback)=>{
						/** Get order log list */
						const order_status_logs = this.db.collection(Tables.ORDER_STATUS_LOGS);
						order_status_logs.find({
							order_id : {$in : orderIds},
							status	 : {$in: [Constants.ORDER_PREPARING, Constants.ORDER_READY_TO_PICK_UP]}
						},{projection: {created:1,order_id:1}}).sort({_id: Constants.SORT_DESC}).toArray().then(result=>{
							if(result.length <=0) return callback(null,null);

							let finalLogList = {};
							result.map(records=>{
								finalLogList[records.order_id] = records;
							});

							callback(null,finalLogList);
						}).catch(err=>{
							callback(err);
						});
					},
					order_details : (callback)=>{
						/** Set order details  */
						let orderDetailsConditions ={
							order_id : {$in : orderIds},
							$or 	 : [
								{$or:[
									{remaining_preparation_time: {$exists: false}},
									{remaining_delivery_duration: {$exists: false}},
								]},
								{remaining_preparation_time: {$gt: 0}},
								{remaining_delivery_duration: {$gt: 0}},
							],
						};

						/** Get order details */
						order_details.find(orderDetailsConditions,{projection: {_id:1,order_id:1,delivery_duration:1,preparation_time:1}}).toArray().then(result=>{
							if(result.length <=0) return callback(null,null);

							let finalList = {};
							result.map(records=>{
								finalList[records.order_id] = records;
							});
							callback(null,finalList);
						}).catch(err=>{
							callback(err);
						});
					},
				},(asyncErr,asyncResponse)=>{
					if(asyncErr){
						console.error("First parallel error at orderCron in updateOrderDeliveryPreparationTime",asyncErr);
					}

					if(asyncResponse?.order_log_list && asyncResponse?.order_details){
						let logList 	=  	asyncResponse?.order_log_list;
						let orderList 	=  	asyncResponse?.order_details;
						let updatedList =	[];

						Object.keys(logList).map(orderId=>{
							if(orderList[orderId]){
								let orderDetails	=	orderList[orderId];
								let logCreated 		=	logList[orderId].created;
								let deliveryTime 	= 	(orderDetails.delivery_duration) ? orderDetails.delivery_duration    :0;
								let preparationTime	= 	(orderDetails.preparation_time)? orderDetails.preparation_time :0;
								let deliveryDate	=	Helper.addDaysToDate((deliveryTime/Constants.MINUTES_IN_A_HOUR),logCreated);
								let preparationDate	=	Helper.addDaysToDate((preparationTime/Constants.MINUTES_IN_A_HOUR),logCreated);

								let remainingDeliveryMinute 	= 	Helper.getDifferenceBetweenTwoDatesInMinute(Helper.newDate(),deliveryDate);
								let remainingPreparationMinute 	=	Helper.getDifferenceBetweenTwoDatesInMinute(Helper.newDate(),preparationDate);

								updatedList.push({
									order_id : orderId,
									preparation_minute 	: (remainingPreparationMinute >0) ? Helper.round(remainingPreparationMinute,0): 0,
									delivery_minute 	: (remainingDeliveryMinute >0) ? Helper.round(remainingDeliveryMinute,0): 0,
								});
							}
						});

						if(updatedList.length > 0){
							eachOfSeries(updatedList,(records, seriesKey, callback)=>{
								let orderMainId 		= 	new ObjectId(records.order_id);
								let odDeliveryTime 		=	records.delivery_minute;
								let odPreparationTime 	=	records.preparation_minute;

								asyncParallel({
									update_order_details : (parallelCallback)=>{
										/** Update order details */
										order_details.updateOne({
											order_id: orderMainId
										},
										{$set: {
											modified : Helper.getUtcDate(),
											remaining_preparation_time	: odPreparationTime,
											remaining_delivery_duration : odDeliveryTime
										}}).then(()=>{
											parallelCallback(null);
										}).catch(err=>{
											parallelCallback(err);
										});
									},
									update_order : (parallelCallback)=>{
										/** Update order main details */
										orders.updateOne({
											_id: orderMainId
										},
										{
											$set: {
												remaining_delivery_duration: odDeliveryTime,
												remaining_preparation_time: odPreparationTime
											},
											$unset: {
												prepare_time_proceed : 1
											}
										}).then(()=>{
											parallelCallback(null);
										}).catch(err=>{
											parallelCallback(err);
										});
									},
									update_driver : (parallelCallback)=>{

										/** Set user conditions */
										let driverConditions = 	clone(Constants.DRIVER_COMMON_CONDITIONS);
										driverConditions["orders.order_id"]	=	orderMainId;

										/** Get assign order driver list */
										users.find(driverConditions,{projection: {_id:1, orders:1 }}).toArray().then(userResult=>{
											if(userResult.length == 0) return parallelCallback(null);

											eachOfSeries(userResult,(userData, seriesIndex, subCallback)=>{

												let totalDeliveryTime 	 =	odDeliveryTime;
												let totalpreparationTime =	odPreparationTime;
												userData.orders.map(tmpData=>{
													if(String(tmpData.order_id) != String(orderMainId)){
														if(tmpData.free_in) 		  	totalDeliveryTime 	 += tmpData.free_in;
														if(tmpData.preparation_time)	totalpreparationTime += tmpData.preparation_time;
													}
												});

												/** Update users order detail accordingly */
												users.updateOne({
													_id		: 	userData._id,
													orders	:	{$elemMatch: { order_id: orderMainId } }
												},
												{$set :{
													free_in			   			: 	parseInt(totalDeliveryTime),
													order_prepare_remaining_time: 	parseInt(totalpreparationTime),
													"orders.$.free_in" 			: 	parseInt(odDeliveryTime),
													"orders.$.preparation_time" :	parseInt(odPreparationTime)
												}}).then(()=>{
													subCallback(null);
												}).catch(err=>{
													subCallback(err);
												});
											},(asyncChildErr)=>{
												parallelCallback(asyncChildErr);
											});
										}).catch(err=>{
											parallelCallback(err);
										});
									},
								},(asyncErr)=>{
									callback(asyncErr);
								});
							},(asyncErr)=>{
								/** Unset prepare_time_proceed flag */
								orders.updateMany({_id: {$in: orderIds} },{$unset: {prepare_time_proceed  : 1 }}).then(()=>{ });

								if(asyncErr){
									console.error("Async error at orderCron in updateOrderDeliveryPreparationTime",asyncErr);
								}
							});
						}else{
							/** Unset prepare_time_proceed flag */
							orders.updateMany({_id: {$in: orderIds} },{$unset: {prepare_time_proceed  : 1 }}).then(()=>{ });
						}
					}else{
						/** Unset prepare_time_proceed flag */
						orders.updateMany({_id: {$in: orderIds} },{$unset: {prepare_time_proceed  : 1 }}).then(()=>{ });
					}
				});
			}
		}).catch(err=>{
			console.error("Error at orderCron in updateOrderDeliveryPreparationTime in distinct query",err);
		});
	};//End updateOrderDeliveryPreparationTime()

	/**
	 * Function to assign captain  (frequency time: every minutes )
	 *
	 * @param req 	As	 Request Data
	 * @param res 	As	Response Data
	 * @param next	As 	Callback argument to the middleware function
	 *
	 * @return render null
	 */
	async assignCaptain (req,res,next){
		let orderProcessTime = Helper.newDate(Helper.subtractMinute(Constants.ORDER_PROCESS_TIME_IN_MINUTES));
		let enableAutoAssimentProcess =  (res.locals.settings['Order_Assignment.assignment_process']) ? parseInt(res.locals.settings['Order_Assignment.assignment_process']) :0;

		/** Stop auto assigned process when admin disable  */
		if(!enableAutoAssimentProcess) return res.render('blank',{layout:false});

        /** Send response to client and work in backgHelper.round */
        res.render('blank',{layout:false});

		/** Set order conditions */
		let tmpOrderDate= Helper.newDate(Helper.subtractMinute(Constants.PREVIOUS_MAX_DAY_TO_ASSIGN_ORDER_TO_DRIVER*Constants.HOURS_IN_A_DAY*Constants.MINUTES_IN_A_HOUR),Constants.CURRENTDATE_START_DATE_FORMAT);
		let orderConditions = {
			order_date 		: 	{$gte: Helper.newDate(tmpOrderDate)},
			is_confirm 		: 	true,
			captain_id 		: 	"",
			delivery_type 	: 	Constants.DELIVERY_BY_CRAVEZ,
			assigned_captain: 	{$exists: false},
			order_assignment_start_time: {$lte: Helper.newDate()},
			$and 			:	[
				{is_completed: {$exists  :false }},
				{is_completed: {$ne 	 :true }},
				{$or :[
					{order_status: {$in: [Constants.ORDER_PREPARING,Constants.ORDER_READY_TO_PICK_UP]}},
				]}
			],
			$or 			:	[
				{order_assignment_process_time: {$exists : false }},
				{order_assignment_process_time: {$lte 	 : orderProcessTime }},
			],
		};

		/** Get order list */
		const orders = this.db.collection(Tables.ORDERS);
		orders.aggregate([
			{$match :  orderConditions},
			{$lookup:	{
				"from" 			: 	Tables.ORDER_DETAILS,
				"localField" 	:	"_id",
				"foreignField" 	: 	"order_id",
				"as" 			: 	"order_detail"
			}},
			{$project	:	{ _id:1, order_preparing_time: 1, order_ready_to_pick_up_time:1, remaining_preparation_time: {$arrayElemAt: ["$order_detail.remaining_preparation_time",0]} }},
			{$match 	:  	{
				remaining_preparation_time: {$exists: true},
			}},
			{$addFields:{
				sort_time: {$ifNull: [ "$order_preparing_time", "$order_ready_to_pick_up_time" ] }
			}},
			{$sort:{ sort_time: Constants.SORT_ASC}},
		]).toArray().then(result=>{

			if(result && result.length >0){
				eachOfSeries(result,(records, key, seriesCallback)=>{
					this.assignmentModel.assignCaptainByOrderId(req,res,next,{order_id: records._id }).then(response=>{
						if(response.status!= Constants.STATUS_SUCCESS){
							console.error("Map error in assignCaptain, Time- "+Helper.newDate());
							console.error(response);
						}
						seriesCallback(null);
					}).catch(next);
				},()=>{ });
			}
		}).catch(err=>{
			console.error("Error in assignCaptain",err);
		});
	};//End assignCaptain()

	/**
	 * Function to mark delivered to open order (frequency time: every day - 03 am )
	 * 	This function only last pervious day orders mark to delivered
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return render
	 */
	async autoCloseOrders (req, res,next){
		/** Send response to client and work in backgHelper.round */
		res.render('blank',{layout:false});

		let minutes		=	req.params.minutes 		? 	parseInt(req.params.minutes) 	:"";
		let autoClose	=	req.params.auto_close 	?	parseInt(req.params.auto_close)	:"";

		let dateObj 	=	new Date();
		dateObj.setDate(dateObj.getDate() - 1);
		let startDate 	=	Helper.newDate(dateObj,Constants.CURRENTDATE_START_DATE_FORMAT);
		let endDate 	=	Helper.newDate(dateObj,Constants.CURRENTDATE_END_DATE_FORMAT);

		/** Over ride to date */
		if(!autoClose && minutes && minutes > 0){
			startDate 	=	Helper.newDate("",Constants.CURRENTDATE_START_DATE_FORMAT);
			endDate 	=  	Helper.newDate(Helper.subtractDate(minutes / Constants.MINUTES_IN_A_HOUR));
		}

		const orders  	=	this.db.collection(Tables.ORDERS);
		const users 	=	this.db.collection(Tables.USERS);
		asyncParallel({
			orders_list: (callback) => {
				/** Set order conditions */
				let odConditions = {
					order_date	: 	{$gte : Helper.newDate(startDate), $lte : Helper.newDate(endDate) },
					order_status: 	{$nin : [
						Constants.ORDER_DELIVERED,
						Constants.ORDER_REJECTED,
						Constants.ORDER_PAYMENT_PENDING,
						Constants.ORDER_SCHEDULED,
						Constants.ORDER_PAYMENT_FAILED
					]},
					is_completed: 	{$exists: false}
				};

				if(autoClose && autoClose>0){
					odConditions.order_date['$lte'] = Helper.newDate(Helper.newDate("",Constants.CURRENTDATE_END_DATE_FORMAT));
					odConditions.order_auto_close_time = {$lte: Helper.newDate()};
				}

				/** Get order list  */
				orders.find(odConditions).toArray().then(result=>{
					callback(null, result);
				}).catch(err=>{
					callback(err);
				});
			},
			admin_details: (callback) => {
				/** Get admin details */
				users.findOne({user_role_id: Constants.SYSTEM_ADMIN_ROLE_ID}).then(result=>{
					callback(null, result);
				}).catch(err=>{
					callback(err);
				});
			}
		}, (asyncErr, asyncResponse) => {
			if(asyncErr){
				console.error("Error at parallel in autoCloseOrders");
				return console.error(asyncErr);
			}

			let orderList 		=	asyncResponse?.orders_list || [];
			let adminDetails	= 	asyncResponse?.admin_details ||{};
			let adminId 		=	adminDetails?._id || "";
			let adminUserRoleId	=	adminDetails?.user_role_id || "";
			let adminUserType 	=	adminDetails?.user_type || "";

			if(orderList && orderList.length >0){
				eachOfSeries(orderList, (records, key, seriesCallback) =>{
					let orderId 		=	records._id;
					let customerId 		= 	records.customer_id;
					let branchId 		= 	records.branch_id;
					let orderStatus 	=	records.order_status;
					let restaurantId 	=	records.restaurant_id;

					/** Set update data */
					let dataToBeUpdated = {
						is_confirm		: 	true,
						order_status 	: 	Constants.ORDER_DELIVERED,
						modified		: 	Helper.getUtcDate(),
						auto_closed		:	Helper.getUtcDate(),
					};

					/** Update order status */
					orders.updateOne({_id: orderId},{$set: dataToBeUpdated}).then(()=>{

						/** Save order logs */
						Helper.saveOrderStatusLogs(req,res,next,{
							updated_by 		: 	adminId,
							user_role_id 	: 	adminUserRoleId,
							status 			:	Constants.ORDER_DELIVERED,
							order_status	:	orderStatus,
							restaurant_id	:	restaurantId,
							order_id 		:	orderId,
							branch_id		:	branchId,
							user_id			:	customerId,
							user_type		:	adminUserType,
						}).then(()=>{
							seriesCallback(null);
						}).catch(err=>{
							seriesCallback(err);
						});
					}).catch(err=>{
						seriesCallback(err);
					});
				}, (seriesErr) => {
					if(seriesErr){
						console.error("Error at series in autoCloseOrders",seriesErr);
					}
				});
			}
		});
	};//End autoCloseOrders()

	/**
	 * Function to update order rules status
	 *  Frequency : every 1 minutes
	 *
	 * @param req 	As	 Request Data
	 * @param res 	As	Response Data
	 * @param next	As 	Callback argument to the middleware function
	 *
	 * @return render null
	 */
	async updateOrderRulesStatus (req, res,next){
		/** Send response to client and work in backgHelper.round */
		res.render('blank',{layout:false});

		let orderTypeArray = [
			// {
			// 	from 	: 	ORDER_PENDING,
			// 	to 	 	: 	ORDER_CONFIRMED,
			// 	effected_status : "is_delayed_acceptance",
			// 	minutes 	: DELAYED_ACCEPTANCE_MINUTE
			// },
			{
				from 	: 	Constants.ORDER_PENDING,
				to 	 	: 	Constants.ORDER_PREPARING,
				effected_status : "is_delayed_acceptance",
				minutes :	Constants.DELAYED_ACCEPTANCE_MINUTE
			},
			{
				from 	: 	Constants.ORDER_PREPARING,
				to 	 	: 	Constants.ORDER_READY_TO_PICK_UP,
				effected_status : "is_delayed_preperation"
			},
			{
				from 	: 	Constants.ORDER_READY_TO_PICK_UP,
				to 	 	: 	Constants.ORDER_ON_THE_WAY,
				effected_status : "is_delayed_pickup_by_captain",
				is_assign_caption : true,
				minutes : Constants.DELAYED_PICKUP_BY_CAPTAIN_MINUTE,
			},
			{
				from 	: 	Constants.ORDER_ON_THE_WAY,
				to 	 	: 	Constants.ORDER_DELIVERED,
				is_assign_caption : true,
				effected_status : "is_delayed_delivery"
			},
			{
				from 	: 	Constants.ORDER_DRIVER_ARRIVED_AT_CUSTOMER_LOCATION,
				to 	 	: 	Constants.ORDER_DELIVERED,
				effected_status : "is_delayed_picked_up_by_customer",
				minutes : Constants.DELAYED_PICKEDUP_BY_CUSTOMER_MINUTE,
			},
			{
				from 	: 	Constants.ORDER_READY_TO_PICK_UP,
				to 	 	: 	Constants.ORDER_ON_THE_WAY,
				effected_status : "is_delayed_pickup",
				minutes : Constants.DELAYED_PICKEDUP_BY_CRAVEZ_OR_RESTAURANT_MINUTE,
			},
		];

		let ruleProcessTime	=	Helper.newDate(Helper.newDate(Constants.ORDER_RULE_PROCESS_TIME_IN_MINUTES));
		let tmpOrderDate	=	Helper.newDate(Helper.subtractDate(Constants.HOURS_IN_A_DAY),Constants.CURRENTDATE_START_DATE_FORMAT);

		const orders = this.db.collection(Tables.ORDERS);
		asyncParallel({
			order_list : (callback)=>{
				/** Set order conditions */
				let orderConditions = {
					order_date	: {$gte: Helper.newDate(tmpOrderDate)},
					is_completed: {$exists: false},
					$or 		:	[
						{rule_process_time: {$exists : false }},
						{rule_process_time: {$lte 	 : ruleProcessTime }},
					],
				};

				/** Get orders list */
				orders.find(orderConditions,{projection: {delivery_type: 1, captain_id:1, captain_name:1, delivery_status:1,is_delayed_acceptance:1,is_delayed_preperation:1,is_delayed_pickup_by_captain:1,is_delayed_delivery:1,is_delayed_picked_up_by_customer:1,is_delayed_pickup:1,is_confirm:1}}).toArray().then(orderResult=>{
					if(orderResult.length <=0) return callback(null,null);

					let orderIds 	=	[];
					let orderObject =	{};
					orderResult.map(records=>{
						orderIds.push(records._id);
						orderObject[records._id] = records;
					});

					callback(null,{
						order_ids 	: 	orderIds,
						order_list 	:	orderObject,
					});
				}).catch(err=>{
					callback(err);
				});
			},
			pickup_delayed_voc_list : (callback)=>{
				let deliveryVocOptions ={
					type 		: Constants.VOC_TYPE_FOR_CAPTAIN_DELAYED_PICK_UP_TIME,
					user_type 	: Constants.VOC_FOR_CAPTAIN,
				};

				/**Get voc question list **/
				Helper.getUserVocQuestionList(req,res, next,deliveryVocOptions).then(vocResponse=> {
					if(vocResponse.status != Constants.STATUS_SUCCESS) return callback(vocResponse);
					callback(null,vocResponse.questions);
				}).catch(next);
			},
			delivery_delayed_voc_list : (callback)=>{
				let deliveryVocOptions ={
					type 		: Constants.VOC_TYPE_FOR_CAPTAIN_DELAY_IN_ORDER_DELIVERY,
					user_type 	: Constants.VOC_FOR_CAPTAIN,
				};

				/**Get voc question list **/
				Helper.getUserVocQuestionList(req,res, next,deliveryVocOptions).then(vocResponse=> {
					if(vocResponse.status != Constants.STATUS_SUCCESS) return callback(vocResponse);
					callback(null,vocResponse.questions);
				}).catch(next);
			},
		},async (asyncErr, asyncResponse)=>{
			if(asyncErr){
				console.error("Async parallel error on updateOrderRulesStatus",asyncErr);
			}

			if(asyncResponse?.order_list && asyncResponse?.order_ids?.length){
				let orderIds 				= 	asyncResponse?.order_list?.order_ids;
				let orderObject 			= 	asyncResponse?.order_list?.order_list;
				let deliveryDelayedVocList 	= 	asyncResponse?.delivery_delayed_voc_list;
				let pickupDelayedVocList 	=	asyncResponse?.pickup_delayed_voc_list;

				await orders.updateMany({_id:{$in: orderIds}},{$set:{rule_process_time: Helper.getUtcDate() }});

				const order_details 	= 	this.db.collection(Tables.ORDER_DETAILS);
				const voc_responses 	= 	this.db.collection(Tables.VOC_RESPONSES);
				const order_status_logs = 	this.db.collection(Tables.ORDER_STATUS_LOGS);
				eachOfSeries(orderTypeArray,(records, firstKey, eachCallback)=>{
					let formStatus 		=	records.from;
					let toStatus 		= 	records.to;
					let effectedStatus 	= 	records.effected_status;
					let minutes 		= 	records.minutes;
					let isAssignCaption	= 	records.is_assign_caption;

					/** Set log conditions */
					let logConditions = {
						order_id : 	{$in : orderIds},
						status 	 : 	formStatus,
					};

					/** Get order logs details */
					order_status_logs.find(logConditions).toArray().then(logResult=>{
						if(logResult.length <= 0) return eachCallback(null);

						eachOfSeries(logResult,(logData, secondKey, eachSubCallback)=>{
							let orderId 		= 	logData.order_id;
							let created 		= 	logData.created;
							let tmpDeliveryType =	(orderObject[orderId].delivery_type) ? orderObject[orderId].delivery_type :"";

							if(effectedStatus == "is_delayed_acceptance" && !orderObject[orderId].is_confirm) return eachSubCallback(null);

							if(effectedStatus == "is_delayed_pickup_by_captain" && tmpDeliveryType != Constants.DELIVERY_BY_CRAVEZ)  return eachSubCallback(null);

							if(effectedStatus == "is_delayed_pickup" && tmpDeliveryType != Constants.DELIVERY_BY_RESTAURANT)  return eachSubCallback(null);

							/** Check caption is assign or not */
							if(isAssignCaption){
								let tmpCaptionId 	= (orderObject[orderId].captain_id) ? orderObject[orderId].captain_id :"";
								let tmpCaptionName 	= (orderObject[orderId].captain_name) ? orderObject[orderId].captain_name :"";

								if(tmpDeliveryType == Constants.DELIVERY_BY_CRAVEZ && !tmpCaptionId){
									return eachSubCallback(null);
								}else if(tmpDeliveryType == Constants.DELIVERY_BY_RESTAURANT && !tmpCaptionName){
									return eachSubCallback(null);
								}
							}

							asyncParallel({
								order_details : (parellelCallback)=>{
									if(effectedStatus != "is_delayed_preperation" && effectedStatus != "is_delayed_delivery" && effectedStatus != "is_delayed_pickup_by_captain") return parellelCallback(null);

									/** Get order details */
									order_details.findOne({ order_id:  orderId},{projection: {delivery_duration: 1, preparation_time: 1,customer_longitude:1,customer_latitude:1,restaurant_latitude:1,restaurant_longitude:1,customer_id:1,device_id:1}}).then(detailsResult=>{
										parellelCallback(null,detailsResult);
									}).catch(err=>{
										parellelCallback(err);
									});
								},
							},(parallelErr, parallelResponse)=>{
								if(parallelErr) return eachSubCallback(parallelErr);

								let orderSubDetails = (parallelResponse.order_details) ? parallelResponse.order_details :{};

								let customerLatitude    = (orderSubDetails.customer_latitude)    ? orderSubDetails.customer_latitude 	:"";
								let customerLongitude   = (orderSubDetails.customer_longitude)   ? orderSubDetails.customer_longitude 	:"";
								let restaurantLongitude = (orderSubDetails.restaurant_longitude) ? orderSubDetails.restaurant_longitude :"";
								let restaurantLatitude  = (orderSubDetails.restaurant_latitude)  ? orderSubDetails.restaurant_latitude  :"";
								let deviceId = (orderSubDetails.device_id) ?orderSubDetails.device_id 	:"";
								let userId  = (orderSubDetails.customer_id)? orderSubDetails.customer_id :"";
								let deliveryDuration  = (orderSubDetails.delivery_duration)? orderSubDetails.delivery_duration :0;
								let preparationTime  = (orderSubDetails.preparation_time)? orderSubDetails.preparation_time :0;

								let deliveryBy    = (orderObject[orderId]) ? orderObject[orderId].delivery_type  :"";
								let deliveryStatus= (orderObject[orderId]) ? orderObject[orderId].delivery_status :"";

								if(effectedStatus == "is_delayed_preperation" && preparationTime){
									minutes = preparationTime;
								}else if(effectedStatus == "is_delayed_delivery" && deliveryDuration){
									minutes = deliveryDuration;
								}

								if(minutes<=0) return eachSubCallback(null);

								let hours	  = minutes/Constants.MINUTES_IN_A_HOUR;
								let checkDate =	Helper.newDate(Helper.addDaysToDate(hours,created));

								/** Check status time is more than current time like delivery time 2.30 or current time is 2.00 */
								if(checkDate > Helper.newDate()) return eachSubCallback(null);

								/** Set conditions */
								let orderOnTimeConditions ={
									order_id			:  orderId,
									status				:  toStatus,
									status_changed_from	:  formStatus,
									created				:   {
										$gt : Helper.newDate(created),
										$lt : Helper.newDate(checkDate)
									},
								};

								if(effectedStatus == "is_delayed_delivery"){
									orderOnTimeConditions.status = {$in : [toStatus, Constants.ORDER_DRIVER_ARRIVED_AT_CUSTOMER_LOCATION ]};
								}
								if(effectedStatus == "is_delayed_acceptance"){
									orderOnTimeConditions.status_changed_from = {$in: [formStatus, Constants.ORDER_SCHEDULED]};
								}

								// if(effectedStatus == "is_delayed_acceptance"){
								// 	delete orderOnTimeConditions.status;
								// 	delete orderOnTimeConditions.status_changed_from;

								// 	orderOnTimeConditions["$or"] = [
								// 		{
								// 			status 				: Constants.ORDER_PREPARING,
								// 			status_changed_from : formStatus,
								// 		},
								// 		{
								// 			status 				: toStatus,
								// 			status_changed_from : Constants.ORDER_NOT_CONFIRMED,
								// 		}
								// 	];
								// }

								asyncParallel({
									get_distance_between_locations : (childCallback)=>{
										return childCallback(null,null);

										// if(effectedStatus != "is_delayed_pickup_by_captain" && effectedStatus != "is_delayed_delivery") return childCallback(null,null);

										// /** Get driver distance in meters **/
										// this.assignmentModel.getDistanceBetweenLocations(req,res,next,{
										// 	locations 		 : [{ latitude  : customerLatitude, longitude : customerLongitude}],
										// 	pickup_latitude  : restaurantLatitude,
										// 	pickup_longitude : restaurantLongitude,
										// }).then((locationResponse)=>{
										// 	childCallback(null,locationResponse);
										// }).catch(next);
									},
									order_status_logs : (childCallback)=>{
										/** Check order status update on time */
										order_status_logs.findOne(orderOnTimeConditions,{projection: {_id: 1}}).then(orderOnTimeResult=>{
											childCallback(null,orderOnTimeResult);
										}).catch(err=>{
											childCallback(err);
										});
									}
								},(childAsyncErr,childAsyncResponse)=>{
									if(childAsyncErr) return eachSubCallback(childAsyncErr);

									let getDistanceBetweenLocations = (childAsyncResponse.get_distance_between_locations) ? childAsyncResponse.get_distance_between_locations :{};

									// if(getDistanceBetweenLocations && getDistanceBetweenLocations.status == Constants.STATUS_ERROR){
									// 	console.error("\n Get distance error in updateOrderRulesStatus");
									// 	console.error(getDistanceBetweenLocations.message);
									// }

									let locations 	 	   = (getDistanceBetweenLocations.locations && getDistanceBetweenLocations.locations[0]) ? getDistanceBetweenLocations.locations[0] : {};
									let distanceInMeters   = (locations.distance_in_meters) ? parseInt(locations.distance_in_meters) :0;
									let orderOnTimeResult  = childAsyncResponse.order_status_logs;

									/** Set update data */
									let updateOrderData = {
										$set :{
											modified : Helper.getUtcDate()
										},
										$unset : {
											rule_process_time : 1
										},
									};

									let orderDelayFlag	=	(orderOnTimeResult) ? false :true;
									updateOrderData["$set"][effectedStatus] = 	orderDelayFlag;

									if(orderDelayFlag){
										updateOrderData["$set"].is_delayed = orderDelayFlag;
									}

									if(effectedStatus == "is_delayed_pickup_by_captain" || effectedStatus == "is_delayed_delivery"){
										updateOrderData["$set"].is_delayed = orderDelayFlag;
									}

									/** Update order details */
									orders.updateOne({_id: orderId},updateOrderData).then(()=>{

										if(orderDelayFlag){
											/** Set options */
											let ticketOptions = {
												order_id : orderId
											};
											if(effectedStatus == "is_delayed_preperation"){
												ticketOptions.type = Constants.AUTOMATED_TICKET_FOR_DELAYED_PREPRATION;
											}else if(effectedStatus == "is_delayed_pickup_by_captain" && deliveryBy == Constants.DELIVERY_BY_CRAVEZ){
												ticketOptions.type = Constants.AUTOMATED_TICKET_FOR_DELAYED_PICKUP_ORDER;
											}else if(effectedStatus == "is_delayed_pickup" && deliveryBy == Constants.DELIVERY_BY_RESTAURANT){
												ticketOptions.type = Constants.AUTOMATED_TICKET_FOR_FOLLOW_UP_RESTAURANT;
											}else if(effectedStatus == "is_delayed_delivery" && deliveryBy == Constants.DELIVERY_BY_CRAVEZ){
												ticketOptions.type = Constants.AUTOMATED_TICKET_FOR_DELAYED_DELIVER_ORDER;
											}else if(effectedStatus == "is_delayed_delivery" && deliveryBy == Constants.DELIVERY_BY_RESTAURANT){
												ticketOptions.type = Constants.AUTOMATED_TICKET_FOR_FOLLOW_UP_WITH_RESTAURANT_AND_CUSTOMER;
											}

											asyncParallel({
												save_voc_response : (childParallelCallback)=>{
													return childParallelCallback(null,null);

													if(effectedStatus != "is_delayed_pickup_by_captain" && effectedStatus != "is_delayed_delivery"){
														return childParallelCallback(null,null);
													}

													let vocType = (effectedStatus == "is_delayed_pickup_by_captain") ? Constants.VOC_TYPE_FOR_CAPTAIN_DELAYED_PICK_UP_TIME : Constants.VOC_TYPE_FOR_CAPTAIN_DELAY_IN_ORDER_DELIVERY;

													/** Check voc already exists or not */
													voc_responses.findOne({
														order_id:  orderId,
														type	:  vocType
													},{projection: {_id: 1}}).then(vocResult=>{
														if(vocResult) return childParallelCallback(null,null);

														let vocQuestions = [];
														if(effectedStatus == "is_delayed_pickup_by_captain"){
															vocQuestions = clone(pickupDelayedVocList);
														}else{
															vocQuestions = clone(deliveryDelayedVocList);
														}

														/** Push answer in question list **/
														vocQuestions.map(questionRecords=>{
															questionRecords.question_id = questionRecords._id;

															if(questionRecords.type == Constants.INPUT_VOC_QUESTION_TYPE){
																questionRecords.answer = String(distanceInMeters);
															}

															let deliveryStatusTitle = (Constants.DELIVERY_ORDER_STATUS[deliveryStatus] && Constants.DELIVERY_ORDER_STATUS[deliveryStatus].status_name) ? Constants.DELIVERY_ORDER_STATUS[deliveryStatus].status_name : "";

															questionRecords.options.map(optionRecords=>{
																if(optionRecords.option.toLowerCase() == deliveryStatusTitle.toLowerCase()){
																	questionRecords.answer 	  = deliveryStatusTitle;
																	questionRecords.answer_id = optionRecords.option_id;
																}
															});
														});

														/** Set options for save voc response **/
														let vocOptions = {
															user_type     : Constants.VOC_FOR_CAPTAIN,
															type 		  : vocType,
															user_id 	  : userId,
															order_id 	  : orderId,
															device_id 	  : deviceId,
															question_list : vocQuestions
														};
														/** Save voc response details**/
														Helper.saveVocResponses(req,res, next,vocOptions).then(saveVocResponse=> {
															childParallelCallback(null,saveVocResponse);
														}).catch(next);
													}).catch(err=>{
														childParallelCallback(err);
													});
												},
												generate_ticket : (childParallelCallback)=>{
													return childParallelCallback(null,null);

													if(Object.keys(ticketOptions).length ==1)  return childParallelCallback(null,null);

													/** Genrate ticket */
													Helper.generateTicket(req,res,next,ticketOptions).then(ticketResponse=>{
														childParallelCallback(null,ticketResponse);
													}).catch(next);
												}
											},(childParallelErr,childParallelResponse)=>{
												if(childParallelErr) return eachSubCallback(childParallelErr);

												let saveVoc         = childParallelResponse.save_voc_response;
												let generateTicket  = childParallelResponse.generate_ticket;

												if(saveVoc && saveVoc.status == Constants.STATUS_ERROR){
													console.error("\n Automatic voc error in updateOrderRulesStatus",saveVoc);
												}

												if(generateTicket && generateTicket.status == Constants.STATUS_ERROR){
													console.error("\n Automatic ticket error in updateOrderRulesStatus",generateTicket);
												}

												eachSubCallback(null);
											});
										}else{
											eachSubCallback(null);
										}
									}).catch(err=>{
										eachSubCallback(err);
									});
								});
							});
						},(asyncSubEachErr)=>{
							eachCallback(asyncSubEachErr);
						});
					}).catch(err=>{
						eachCallback(err);
					});
				},(asyncEachErr)=>{
					/** unset tmp order rule process time */
					orders.updateMany({_id: {$in:orderIds}},{$unset: {rule_process_time: 1}}).then(()=>{ });

					if(asyncEachErr){
						console.error("Async each error on updateOrderRulesStatus",asyncEachErr);
					}
				});
			}
		});

	};//End updateOrderRulesStatus()

	/**
	 * Function to update order assignment logs
	 *
	 * @param req 	As	 Request Data
	 * @param res 	As	Response Data
	 * @param next	As 	Callback argument to the middleware function
	 *
	 * @return render null
	 */
	async updateOrderAssignmentLogs (req, res,next){
		/** Send response to client and work in backgHelper.round */
		res.render('blank',{layout:false});

		const order_assignment_logs = this.db.collection(Tables.ORDER_ASSIGNMENT_LOGS);
		asyncParallel({
			assignment_list : (callback)=>{
				let assignmentProcessTime = Helper.newDate(Helper.subtractMinute(Constants.ASSIGNMENT_CRON_PROCESS_MINUTE));

				/** Get order assignment logs list */
				order_assignment_logs.aggregate([
					{$match :{
						current_status	: 	Constants.ORDER_DRIVER_ASSIGNED,
						cancelled_at 	:	{$lte: Helper.newDate() },
						$or				:	[
							{process_time : {$exists: false}},
							{process_time : {$lte: assignmentProcessTime}}
						]
					}},
					{$lookup:	{
                        "from" 			: 	Tables.ORDERS,
                        "localField" 	:	"order_id",
                        "foreignField" 	: 	"_id",
                        "as" 			: 	"order_details"
                    }},
					{$project : {
						_id:1, order_id:1, captain_id: 1, unique_order_id: {$arrayElemAt: ["$order_details.unique_order_id",0]}
					}},
				]).toArray().then(result=>{
					callback(null, result);
				}).catch(err=>{
					callback(err);
				});
			},
			user_details : (callback)=>{
				/** Get user details */
				const users = this.db.collection(Tables.USERS);
				users.findOne({user_role_id : Constants.SYSTEM_ADMIN_ROLE_ID },{projection:{_id:1,user_role_id:1}}).then(result=>{
					callback(null, result);
				}).catch(err=>{
					callback(err);
				});
			},
		},(asyncErr,asyncResponse)=>{
			if(asyncErr){
				console.error("Async parallel error in updateOrderAssignmentLogs",asyncErr);
			}

			let assignmentList  = 	asyncResponse?.assignment_list || [];
			let userDetails 	=	asyncResponse?.user_details || {};
			let adminId 		=	userDetails?._id || "";
			let adminRoleId 	=	userDetails?.user_role_id || "";

			if(assignmentList?.length >0){
				let assignmentIds = [];
				assignmentList.map(records=>{
					assignmentIds.push(records._id);
				});

				/** Update order assignment logs details */
				order_assignment_logs.updateMany({
					_id:{$in: assignmentIds}
				},
				{$set:{
					process_time: Helper.getUtcDate()
				}}).then(()=>{

					eachOfSeries(assignmentList,(records, parentkey, callback)=>{
						let orderId 	 	=	records.order_id;
						let captainId 	 	= 	records.captain_id;
						let uniqueOrderId 	= 	records.unique_order_id;

						/** Update order assignment logs details  */
						order_assignment_logs.updateOne({
							_id	: new ObjectId(records._id),
						},
						{
							$set: {
								current_status 	: 	Constants.ORDER_DRIVER_PASSED,
								modified 		:	Helper.getUtcDate(),
							},
							$unset : {
								process_time : 1
							}
						}).then(()=>{
							callback(null);

							/** Save order status logs */
							Helper.saveOrderStatusLogs(req,res,next,{
								order_id 		:	orderId,
								updated_by		:	adminId,
								user_id			:	captainId,
								status 			:	Constants.ORDER_DRIVER_PASSED,
								order_status	:	Constants.ORDER_DRIVER_ASSIGNED,
							}).then(()=>{
								callback(null);

								services.insertNotifications(req,res,{
									notification_data : {
										notification_type : Constants.NOTIFICATION_TO_DRIVER_ORDER_ASSIGNMENT_REQUEST_PASSED,
										message_params 	  : [uniqueOrderId],
										parent_table_id   : orderId,
										user_id 		  : adminId,
										user_role_id 	  : adminRoleId,
										user_ids 		  : [captainId],
										role_id 		  : Constants.DRIVER,
										extra_parameters  :	{
											driver_id 	:	captainId,
											order_id	: 	orderId,
										}
									}
								});
							});
						}).catch(err=>{
							callback(err);
						});
					},(asyncEachErr)=>{
						if(asyncEachErr){
							console.error("Each error in updateOrderAssignmentLogs",asyncEachErr);
						}
					});
				}).catch(err=>{
					console.error("Error in updateOrderAssignmentLogs",err);
				});
			}
		});
	};//End updateOrderAssignmentLogs()

	/**
	 * Function to send notifications to users for order remind
	 *
	 * @param req 	As	 Request Data
	 * @param res 	As	Response Data
	 * @param next	As 	Callback argument to the middleware function
	 *
	 * @return render null
	 */
	async sendOrderRemindNotification (req,res,next){
		/** Send response to client and work in backgHelper.round */
		res.render('blank',{layout:false});

        let days        = 	parseInt(res?.locals?.settings?.['Site.order_remind_notification_days'] || 0);
        let hoursInADay = 	days*Constants.HOURS_IN_A_DAY;
        let remindDate	=	Helper.newDate(Helper.subtractDate(hoursInADay));

        /** Get customers list from orders**/
		const orders = this.db.collection(Tables.ORDERS);
		orders.distinct("customer_id",{created: {$gt: remindDate}}).then(customerIds=>{

			if(customerIds?.length){
				/** Set customer conditions **/
				let userConditions 		= 	clone(Constants.CUSTOMER_COMMON_CONDITIONS);
				userConditions._id 		= 	{$nin : customerIds};
				userConditions["$or"] 	=	[
					{order_remind_time : {$exists : false}},
					{order_remind_time : {$lt: remindDate }}
				];

				/** Get customer list**/
				const users = this.db.collection(Tables.USERS);
				users.find(userConditions,{projection:{_id:1,user_role_id:1}}).toArray().then(userResult=>{

					if(userResult?.length > 0){

						/** Insert user id in a array**/
						let userIds = [];
						userResult.forEach(records=>{
							userIds.push(records._id);
						});

						/** Save order remind time in users collection **/
						users.updateMany({
							_id: {$in: userIds}
						},
						{$set:{
							order_remind_time: Helper.getUtcDate()
						}}).then(()=>{

							/*************** Send Mail  ***************/
								services.sendMailToUsers(req,res,{
									event_type 	:	Constants.NOTIFICATION_SEND_TO_USERS_ORDER_REMIND,
									user_list	: 	userResult,
									days		: 	days
								});
							/*************** Send Mail  ***************/
						}).catch(err=>{
							console.error("Error in sendOrderRemindNotification users update",err);
						});
					}
				}).catch(err=>{
					console.error("Error in sendOrderRemindNotification users find",err);
				});
			}
        }).catch(err=>{
			console.error("Error in sendOrderRemindNotification orders find",err);
		});
	};//End sendOrderRemindNotification()

	/**
	 * Function to update order modify detail if order payment is not paid
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 *
	 * @return render
	 */
	async updateModifyOrder (req, res,next){
		/** Send response to client and work in backgHelper.round */
		res.render('blank',{layout:false});

		try{
			const orders = this.db.collection(Tables.ORDERS);
			let currentDate		=	Helper.newDate();
			let tmpOrderDate	=	Helper.newDate(Helper.subtractDate(2*Constants.HOURS_IN_A_DAY));

			let result = await orders.find({
				order_date					: {$gte: Helper.getUtcDate(tmpOrderDate)},
				payment_link_expire_time 	: {$lte: Helper.getUtcDate(currentDate)},
				outstanding_payment	: Constants.UNPAID,
			},{}).toArray();

			let orderIds	=	[];
			if(result.length > 0){
				result.map(data=>{
					let lastmodified	=	new ObjectId(data.last_modified_order_id);
					const order_modify_logs	=	this.db.collection(Tables.ORDER_MODIFY_LOGS);

					order_modify_logs.find({order_id : data._id},{projection:{}}).sort({created: Constants.SORT_DESC}).skip(1).limit(1).toArray().then(modifyResult=>{


						if(modifyResult.length > 0){
							asyncEach(modifyResult, (records, childCallback)=> {
								let orderId		=	records.order_id || "";
								let orderPrice	=	records.order_price || 0;
								let netAmount	=	records.net_amount || 0;
								let deliveryFee	=	records.delivery_fee || 0;
								let amountDebitedByWallet	=	records.amount_debited_by_wallet || 0;
								let knetCharges		=	records.knet_charges || 0;
								let totalKnetAmount	=	records.total_knet_amount || 0;
								let packageId		=	records.package_id || 0;
								let packageDeliveryFees	=	records.package_delivery_fees || 0;
								let isInfinityUser	=	records.is_infinity_user || 0;
								let totalAmount		=	records.total_amount || 0;
								let discountPrice	=	records.discount_price || 0;
								let  offerId 		=	records.offer_id || 0;
								let  offerCode 		=	records.offer_code || 0;
								let  offerType 		=	records.offer_type || 0;
								let  additionalTax 	=	records.additional_tax || 0;
								let  additionalTaxPercentage 	=	records.additional_tax_percentage || 0;
								let  offerDiscount 		=	records.offer_discount || 0;
								let  offerDeliveryFees 	=	records.offer_delivery_fees || 0;
								let  corporateDiscount 	=	records.corporate_discount || 0;
								let  corporateDeliveryFees 	=	records.corporate_delivery_fees || 0;
								let  branchExtraChargeType 	=	records.branch_extra_charge_type || 0;
								let  branchExtraCharge 	=	records.branch_extra_charge || 0;
								let  branchDiscountType =	records.branch_discount_type || 0;
								let  branchDiscount 	=	records.branch_discount || 0;
								let  orderStatus 		=	records.order_status || "";
								let  adminStatus 		=	records.admin_status || "";
								let  restStatus 		=	records.restaurant_status || "";
								let  customerStatus 	=	records.customer_status || "";

								const order_items	=	this.db.collection(Tables.ORDER_ITEMS);
								order_items.deleteMany({order_id: orderId}).then(()=>{

									asyncParallel({
										delete_log : (parallelCallback)=>{
											const order_modify_logs	=	this.db.collection(Tables.ORDER_MODIFY_LOGS);
											order_modify_logs.deleteMany({_id: lastmodified}).then(()=>{
												parallelCallback(null);
											}).catch(err=>{
												parallelCallback(err);
											});
										},
										delete_log_item : (parallelCallback)=>{
											const order_modify_item_logs =	this.db.collection(Tables.ORDER_MODIFY_ITEM_LOGS);
											order_modify_item_logs.deleteMany({modify_log_id: lastmodified}).then(()=>{
												parallelCallback(null);
											}).catch(err=>{
												parallelCallback(err);
											});
										},
										update_logs : (parallelCallback) => {
											const order_modify_item_logs	=	this.db.collection(Tables.ORDER_MODIFY_ITEM_LOGS);
											order_modify_item_logs.find({modify_log_id : new ObjectId(records._id)},{projection: {modify_log_id : 0,_id:0}}).toArray().then(itemResult=>{


												if(itemResult.length == 0) return parallelCallback(null);

												const order_items  = this.db.collection(Tables.ORDER_ITEMS);
												asyncEach(itemResult, (itemData, childSubCallback)=> {

													order_items.insertOne(itemData).then(()=>{
														childSubCallback(null);
													}).catch(err=>{
														childSubCallback(err);
													});
												},(asyncChildSunErr)=>{
													parallelCallback(asyncChildSunErr);
												});
											});
										},
										update_order : (parallelCallback) => {
											let dataToUpdate	=	{
												order_price	: orderPrice,
												net_amount	: netAmount,
												delivery_fee: deliveryFee,
												amount_debited_by_wallet : amountDebitedByWallet,
												order_status : orderStatus,
												restaurant_status : restStatus,
												admin_status : adminStatus,
												customer_status : customerStatus
											};
											if(knetCharges && totalKnetAmount){
												dataToUpdate['knet_charges']	=	knetCharges;
												dataToUpdate['total_knet_amount']	=	totalKnetAmount;
											}
											if(packageId && packageDeliveryFees){
												dataToUpdate['package_id']	=	packageId;
												dataToUpdate['package_delivery_fees']	=	packageDeliveryFees;
											}
											if(isInfinityUser) dataToUpdate['is_infinity_user']	=	isInfinityUser;
											orders.updateOne({_id : orderId},{
												$set : dataToUpdate,
												$unset : {
													outstanding_amount : 1,
													outstanding_payment :1,
													payment_link_expire_time : 1
												}
											}).then(()=>{
												parallelCallback(null);
											}).catch(err=>{
												parallelCallback(err);
											});
										},
										update_order_detail : (parallelCallback) => {
											let dataToUpdate	=	{
												total_amount	: totalAmount,
												net_amount		: netAmount,
												discount_price	: discountPrice,
												delivery_fee 	: deliveryFee
											};
											if(additionalTax && additionalTaxPercentage){
												dataToUpdate['additional_tax']	=	additionalTax;
												dataToUpdate['additional_tax_percentage']	=	additionalTaxPercentage;
											}
											if(offerId && offerCode && offerType && offerDiscount && offerDeliveryFees){
												dataToUpdate['offer_id']	=	offerId;
												dataToUpdate['offer_code']	=	offerCode;
												dataToUpdate['offer_type']	=	offerType;
												dataToUpdate['offer_discount']	=	offerDiscount;
												dataToUpdate[' offer_delivery_fees']	=	offerDeliveryFees;
											}
											if(corporateDiscount && corporateDeliveryFees){
												dataToUpdate['corporate_discount']	=	corporateDiscount;
												dataToUpdate['corporate_delivery_fees']	=	corporateDeliveryFees;
											}
											if(branchExtraChargeType && branchExtraCharge){
												dataToUpdate['branch_extra_charge']	=	branchExtraCharge;
												dataToUpdate['branch_extra_charge_type']	=	branchExtraChargeType;
											}
											if(branchDiscount && branchDiscountType){
												dataToUpdate['branch_discount']	=	branchDiscount;
												dataToUpdate['branch_discount_type']	=	branchDiscountType;
											}
											const order_details	=	this.db.collection(Tables.ORDER_DETAILS);
											order_details.updateOne({order_id : orderId},{$set : dataToUpdate}).then(()=>{
												parallelCallback(null);
											}).catch(err=>{
												parallelCallback(err);
											});
										},
									},(asyncParentErr)=>{
										childCallback(asyncParentErr);
									});
								}).catch(err=>{
									childCallback(err);
								});
							},(asyncChildErr)=>{
								if(asyncChildErr) console.error("Each error in updateModifyOrder",asyncChildErr);
							});
						}
					}).catch(err=>{
						console.error("Error in updateModifyOrder order_modify_logs find",err);
					});
				});
			}
		}catch(err){
			console.error("Catch error in updateModifyOrder",err);
		}

	};//End updateModifyOrder()

	/**
	 * Function to update payment status if payment expire and payment still not paid
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 *
	 * @return render
	 */
	async updateExpirePaymentOrderStatus (req, res,next){
		/** Send response to client and work in backgHelper.round */
		res.render('blank',{layout:false});

		const orders = this.db.collection(Tables.ORDERS);
		asyncParallel({
			order_list : (callback)=>{
				let dateObj 	=	new Date();
				dateObj.setDate(dateObj.getDate() - 1);
				let startDate 	=	Helper.newDate(dateObj,Constants.CURRENTDATE_START_DATE_FORMAT);

				/** Set order conditions */
				let orderConditions = {
					order_date 	 : {$gte: Helper.newDate(startDate)},
					admin_status : Constants.ORDER_PAYMENT_PENDING,
					payment_link_expire_time 	: {$lte: Helper.newDate()},
				};

				/** Get orders list */
				orders.find(orderConditions,{projection: {_id:1,customer_id:1,restaurant_id:1,device_id:1}}).toArray().then(result=>{
					callback(null, result);
				}).catch(err=>{
					callback(err);
				});
			},
			user_details : (callback)=>{
				/** Get user details */
				const users = this.db.collection(Tables.USERS);
				users.findOne({user_role_id : Constants.SYSTEM_ADMIN_ROLE_ID },{projection:{_id:1}}).then(result=>{
					callback(null, result);
				}).catch(err=>{
					callback(err);
				});
			},
		},(asyncErr,asyncResponse)=>{
			if(asyncErr){
				console.error("async parallel Error in update Expire Payment Order Status",asyncErr);
			}
			let orderList  	= 	asyncResponse?.order_list || [];
			let userDetails =	asyncResponse?.user_details || {};
			let adminId 	=	userDetails?._id || "";
			if(orderList && orderList.length > 0 && adminId){
				asyncEach(orderList,(records,eachCallback)=>{
					/** Update order details */
					orders.updateOne({
						_id : ObjectId(records._id),
					},
					{$set: {
						order_status	 	: 	Constants.ORDER_PAYMENT_FAILED,
						modified 			: 	Helper.getUtcDate(),
					}}).then(()=>{
						/** Save order status logs */
						Helper.saveOrderStatusLogs(req,res,next,{
							updated_by		:	adminId,
							user_id			:	records.customer_id,
							restaurant_id	:	records.restaurant_id,
							device_id		:	records.device_id,
							status 			:	Constants.ORDER_PAYMENT_FAILED,
							order_status	:	Constants.ORDER_PAYMENT_PENDING,
							order_id 		:	records._id,
						}).then(()=>{});
						eachCallback(null);
					}).catch(err=>{
						eachCallback(err);
					});
				},(asyncEachErr)=>{
					if(asyncEachErr){
						console.error("async each Error in updateExpirePaymentOrderStatus",asyncEachErr);
					}
				});
			}
		});
	};//End updateExpirePaymentOrderStatus()

	/**
	 * Function to push rejected order to gfc
	 *  Frequency : every 1 minutes
	 *
	 * @param req 	As	 Request Data
	 * @param res 	As	Response Data
	 * @param next	As 	Callback argument to the middleware function
	 *
	 * @return render null
	 */
	async pushRejectedOrderToGfc (req, res,next){
		/** Send response to client and work in backgHelper.round */
		res.render('blank',{layout:false});

		let ruleProcessTime = 	Helper.newDate(Helper.subtractMinute(Constants.ORDER_RULE_PROCESS_TIME_IN_MINUTES));
		let todayStartDate 	=	Helper.newDate(Helper.newDate("",Constants.CURRENTDATE_START_DATE_FORMAT));
		let startDate 		= 	Helper.newDate(Helper.newDate(Helper.subtractMinuteFromDate(todayStartDate, 4*Constants.MINUTES_IN_A_HOUR)));

		const orders =	this.db.collection(Tables.ORDERS);
		asyncParallel({
			order_detail : (callback)=>{
				orders.find({
					order_date	: 	{$gte: Helper.getUtcDate(startDate) },
					admin_status: 	Constants.ORDER_REJECTED_BY_ADMIN,
					aghzeya		: 	true,
					$and		:	[
						{$or 	:	[
							{gfc_push_retry: {$lt: Constants.MAX_GFC_PUSH_LIMIT }},
							{gfc_modified_push_retry: {$lt: Constants.MAX_GFC_PUSH_LIMIT }},
						]},
						{$or :	[
							{push_gfc_process_time: {$exists : false }},
							{push_gfc_process_time: {$lte 	 : ruleProcessTime }},
						]}
					]
				}).toArray().then(result=>{
					callback(null,result);
				}).catch(err=>{
					callback(err);
				});
			},
			user_details : (callback)=>{
				/** Get user details */
				const users = this.db.collection(Tables.USERS);
				users.findOne({user_role_id : Constants.SYSTEM_ADMIN_ROLE_ID },{projection:{_id:1}}).then(result=>{
					callback(null, result);
				}).catch(err=>{
					callback(err);
				});
			},
		},(asyncErr,asyncResponse)=>{
			if (asyncErr) {
				console.error("async parallel Error in pushRejectedOrderToGfc",asyncErr);
			}

			let orderDetails	=	asyncResponse?.order_detail || [];
			let adminDetails	=	asyncResponse?.user_details || {};
			let orderIds		=	[];
			if(orderDetails && orderDetails.length > 0 && adminDetails?._id){
				orderDetails.map(data => {
					orderIds.push(data._id);
				});

				orders.updateMany({_id:{$in: Helper.arrayToObject(orderIds)}},{$set:{push_gfc_process_time: Helper.getUtcDate()}}).then(()=>{

					eachOfSeries(orderDetails,(records, key, childCallback)=>{
						let orderId				=	new ObjectId(records._id);
						let isModified			=	records?.is_modified ||false;
						let billNo				=	records?.aghzeya_bill_no || "";
						let simphonyCheckRef	=	records?.simphonyCheckRef || "";
						let orderDate			=	records?.order_date;
						let isOrderModified 	=	billNo || simphonyCheckRef ? true :false;

						/** Set order update data */
						let updateData = {$set: {modified: Helper.getUtcDate() } };

						if(!isModified || !isOrderModified){
							updateData["$set"].order_date 			= Helper.getUtcDate();
							updateData["$set"].previous_order_date 	= orderDate;

							updateData["$push"] = {
								resend_order_date_logs: {
									is_cron 	:	true,
									resend_on 	:	Helper.getUtcDate(),
									order_date	: 	orderDate,
								}
							};

							if(records.is_schedule){
								updateData["$set"].scheduled_date 			= Helper.getUtcDate();
								updateData["$set"].scheduled_to_submit_cron = Helper.getUtcDate();
							}
						}

						/** Update order details */
						orders.updateOne({_id: orderId},updateData).then(()=>{

							this.adminPlaceOrderModel.callAfterPlaceOrder(req,res,next,{
								order_id 		:	orderId,
								is_aghzeya 		: 	records.aghzeya,
								admin_id 		: 	adminDetails._id,
								customer_id 	: 	records.customer_id,
								current_status 	: 	records.order_status,
								is_schedule 	: 	false,
								is_auto_cron 	: 	true,
								order_place_by 	: 	records.modified_by ? records.modified_by : records.placed_by,
								is_confirm 		: 	records.is_confirm,
								restaurant_id 	: 	records.restaurant_id,
								unique_order_id	: 	records.unique_order_id,
								device_id		: 	records.device_id,
								is_modify		: 	isOrderModified,
								simphony		: 	records.simphony || false,
							}).then(()=>{

								/** Update order details */
								orders.updateOne({_id: orderId},{
									$set :{
										modified : Helper.getUtcDate()
									},
									$unset : {
										push_gfc_process_time : 1
									},
								}).then(()=>{
									childCallback(null);
								}).catch(err=>{
									childCallback(err);
								});
							}).catch(err=>{
								childCallback(err);
							});
						}).catch(err=>{
							childCallback(err);
						});
					},asyncEachErr=>{
						if(asyncEachErr){
							console.error("Error On Crons pushRejectedOrderToGfc \n");
							console.error(asyncEachErr);
						}
					});
				}).catch(err=>{
					console.error("Error in pushRejectedOrderToGfc updateMany",err);
				});
			}
		});
	};//End pushRejectedOrderToGfc()

	/**
	 * Function to push cancle order to gfc
	 *  Frequency : every 1 minutes
	 *
	 * @param req 	As	 Request Data
	 * @param res 	As	Response Data
	 * @param next	As 	Callback argument to the middleware function
	 *
	 * @return render null
	 */
	async pushCancleOrderToGfc (req, res,next){
		/** Send response to client and work in backgHelper.round */
		res.render('blank',{layout:false});

		let maxDayForCancelOrder=	30;
		let ruleProcessTime 	= 	Helper.newDate(Helper.subtractMinuteFromDate(Constants.ORDER_RULE_PROCESS_TIME_IN_MINUTES));
		let startDate 			= 	Helper.newDate(Helper.newDate(Helper.subtractMinuteFromDate(maxDayForCancelOrder*Constants.HOURS_IN_A_DAY*Constants.MINUTES_IN_A_HOUR),Constants.CURRENTDATE_START_DATE_FORMAT));
		const orders 			=	this.db.collection(Tables.ORDERS);
		asyncParallel({
			order_list : (callback)=>{
				/** Get order list */
				orders.find({
					order_date	: 	{$gte: Helper.getUtcDate(startDate) },
					admin_status: 	{$ne: Constants.ORDER_CANCELLED},
					aghzeya		: 	true,
					$and		:	[
						{gfc_cancel_retry : {$lt: Constants.MAX_GFC_PUSH_LIMIT }},
						{$or: [
							{$and: [
								{is_completed: {$exists: false}},
								{is_completed: {$ne: true}}
							]},
							{admin_status: Constants.ORDER_DELIVERED}
						]},
						{$or :	[
							{push_cancel_gfc_process_time: {$exists : false }},
							{push_cancel_gfc_process_time: {$lte 	: ruleProcessTime }},
						]}
					]
				}).toArray().then(result=>{
					callback(null, result);
				}).catch(err=>{
					callback(err);
				});
			},
			user_details : (callback)=>{
				/** Get user details */
				const users = this.db.collection(Tables.USERS);
				users.findOne({user_role_id : Constants.SYSTEM_ADMIN_ROLE_ID },{projection:{_id:1}}).then(result=>{
					callback(null, result);
				}).catch(err=>{
					callback(err);
				});
			},
		},(asyncErr,asyncResponse)=>{
			if (asyncErr) {
				console.error("async parallel Error in pushCancleOrderToGfc",asyncErr);
			}

			let adminDetails	=	asyncResponse?.user_details || {};
			let orderList		=	asyncResponse?.order_list || [];
			if(orderList && orderList.length > 0 && adminDetails?._id){
				let orderIds =	[];
				orderList.map(data => {
					orderIds.push(data._id);
				});

				/** Update order details */
				orders.updateMany({_id:{$in: Helper.arrayToObject(orderIds)}},{$set:{push_cancel_gfc_process_time:Helper.getUtcDate()}}).then(()=>{

					eachOfSeries(orderList,(records, key, childCallback)=>{

						asyncParallel({
							cancel_transfer_branch : (subCallback)=>{
								if(!records.cancel_transfer_branch_id) return subCallback(null);

								/** Transfer and cancel order */
								this.adminOrdersModel.updateBranchForOrderTransfer(req,res,next,{
									order_id			:	records._id,
									transfer_branch_id	: 	records.cancel_transfer_branch_id,
									updated_by   		: 	adminDetails._id,
									updated_by_role_id  :	adminDetails.user_role_id,
									updated_by_user_name  :	adminDetails.full_name,
								}).then(()=>{
									subCallback(null);
								}).catch(next);
							},
							direct_cancel_order : (subCallback)=>{
								if(records.cancel_transfer_branch_id) return subCallback(null);

								/** Transfer cancel order */
								this.adminOrdersModel.pushOrderToGfcAsCanceled(req,res,next,{
									order_details: records,
									user_details: adminDetails,
									is_cron: true
								}).then(()=>{
									subCallback(null);
								}).catch(next);
							},
						},()=>{
							childCallback(null);

							/** Update order details */
							orders.updateOne({
								_id: records._id
							},
							{
								$set :{
									modified: Helper.getUtcDate()
								},
								$unset : {
									push_cancel_gfc_process_time : 1
								},
							}).then(()=>{}).catch(()=>{});
						});
					},asyncEachErr=>{
						if(asyncEachErr){
							console.error("async each Error in pushCancleOrderToGfc",asyncEachErr);
						}
					});
				}).catch(err=>{
					console.error("Error in pushCancleOrderToGfc updateMany",err);
				});
			}
		});
	};//End pushCancleOrderToGfc()

	/**
	 * Function to send pn to customer for order delayed voc
	 *
	 * @param req 		As Request Data
	 * @param res 		As Response Data
	 * @param options 	As Object Data
	 *
	 * @return render
	 */
	async sendAutomaticOrdersVocPN (req, res,next){
		try{
			/** Send response to client and work in backgHelper.round */
			res.render('blank',{layout:false});

			const orders  =  this.db.collection(Tables.ORDERS);
			let bufferTime=  parseInt(res?.locals?.settings?.['Site.delay_voc_pn_buffer'] || 0);

			let dateObj 	=	new Date();
			dateObj.setDate(dateObj.getDate() - 1);
			let startDate 	=	Helper.newDate(dateObj,Constants.CURRENTDATE_START_DATE_FORMAT);

			/** Get order list */
			let result = await orders.aggregate([
				{$match :{
					order_date 	        : {$gte: Helper.newDate(startDate)},
					delay_voc_status 	: {$exists : false},
					is_delayed			: true,
					admin_status 		: {$nin : [Constants.ORDER_DELIVERED,Constants.ORDER_CANCELLED,Constants.ORDER_REJECTED,Constants.ORDER_REJECTED_BY_ADMIN]},
					delivery_type 		: {$in :[Constants.DELIVERY_BY_CRAVEZ,Constants.DELIVERY_BY_RESTAURANT]}
				}},
				{$lookup:	{
					"from" 			: 	Tables.ORDER_DETAILS,
					"localField" 	:	"_id",
					"foreignField" 	: 	"order_id",
					"as" 			: 	"order_detials"
				}},
				{$project : {
					_id: 1,unique_order_id :1,customer_id :1, order_date : 1,restaurant_name:1,
					delivery_duration: {$arrayElemAt: ["$order_detials.delivery_duration",0]},
				}},
			]).toArray();

			if(result && result.length > 0){
				/** Update driver wise orders*/
				asyncEach(result, (records, eachCallback)=> {
					let orderDate			= records.order_date;
					let deliveryDuration	= (records.delivery_duration) ? parseInt(records.delivery_duration) : 0;
					let totalAllowedTime	= (deliveryDuration+bufferTime)/Constants.MINUTES_IN_A_HOUR;
					let finalDate			= Helper.addDaysToDate(totalAllowedTime,orderDate);

					if(finalDate <= Helper.newDate()){
						orders.updateOne({
							_id : new ObjectId(records._id),
						},
						{$set : {
							delay_voc_status: Constants.PENDING,
							voc_sent_time	: Helper.getUtcDate(),
						}}).then(()=>{
							eachCallback(null);

							/** Notification to customer for order delay voc */
								services.insertNotifications(req,res,{
									notification_data : {
										notification_type 	: 	Constants.NOTIFICATION_ORDER_DELAY_VOC_PN,
										message_params 		: 	[records?.restaurant_name?.[Constants.DEFAULT_LANGUAGE_CODE] || ""],
										parent_table_id 	: 	records._id,
										user_ids 			: 	[records.customer_id],
										role_id 			: 	Constants.CUSTOMER,
										extra_parameters 	:	{
											user_id : new ObjectId(records.customer_id)
										}
									}
								});
							/*************** Send approval request to admin  ***************/
						}).catch((err)=>{
							eachCallback(err);
						});
					}else{
						eachCallback(null);
					}
				},(childEachErr)=>{
					if(childEachErr){
						console.error("Error in sendAutomaticOrdersVocPN");
						return console.error(childEachErr);
					}
				});
			}
		} catch (error) {
			console.error("Error in sendAutomaticOrdersVocPN",error);
		}
	};//End sendAutomaticOrdersVocPN()

	/**
	 * Function to push order to dhub api
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return render
	 */
	async pushOrderToDhub (req, res,next){
		/** Send response to client and work in backgHelper.round */
		res.render('blank',{layout:false});

		let ruleProcessTime = 	Helper.newDate(Helper.subtractMinute(15));
		let todayStartDate	=	Helper.newDate(Helper.newDate("",Constants.CURRENTDATE_START_DATE_FORMAT));
		let startDate 		= 	Helper.newDate(Helper.newDate(Helper.subtractMinuteFromDate(todayStartDate, 4*Constants.MINUTES_IN_A_HOUR)));

		const orders  =	this.db.collection(Tables.ORDERS);
		asyncParallel({
			order_list : (callback)=>{
				/** Get order list */
				orders.aggregate([
					{$match : {
						order_date		: 	{$gte: startDate},
						is_completed	: 	{$ne: true},
						dhub_order_id	: 	{$exists : false },
						order_status 	: 	{$nin: [Constants.ORDER_DELIVERED,Constants.ORDER_CANCELLED,Constants.ORDER_REJECTED,Constants.ORDER_REJECTED_BY_ADMIN,Constants.ORDER_PAYMENT_PENDING,Constants.ORDER_PAYMENT_FAILED]},
						delivery_type 	:	{$in: [Constants.DELIVERY_BY_RESTAURANT, Constants.DELIVERY_BY_CRAVEZ]},
						$or 			:	[
							{dhub_push_retry: {$exists: false } },
							{dhub_push_retry: {$lte: Constants.MAX_GFC_PUSH_LIMIT } },
						],
						$and: [
							{$or: [
								{dhub_process_time: {$exists : false }},
								{dhub_process_time: {$lte 	 : ruleProcessTime }},
							]},
							{$or: [
								{aghzeya: {$ne: true }},
								{
									aghzeya: true,
									aghzeya_bill_no: {$exists: true},
								},
							]},
						]
					}},
					{$lookup: {
						"from" 			: 	Tables.RESTAURANT_BRANCHES,
						"localField" 	:	"branch_id",
						"foreignField"	: 	"_id",
						"as" 			: 	"branchDetails"
					}},
					{$match : {
						"branchDetails.dhub_branch_id" : {$exists: true, $nin: [null, ""]}
					}},
					{$project: {_id: 1}},
				]).toArray().then(result=>{
					callback(null, result);
				}).catch(err=>{
					callback(err);
				});
			},
		},(asyncErr,asyncRes)=>{
			if (asyncErr) console.error("Error in pushOrderToDhub ",asyncErr);

			if(asyncRes.order_list && asyncRes.order_list.length > 0){
				let odList 		=	asyncRes.order_list;
				let orderIds 	=	[];
				odList.map(data => {
					orderIds.push(data._id);
				});

				/** Update order details */
				orders.updateMany({_id:{$in: Helper.arrayToObject(orderIds)}},{$set:{dhub_process_time: Helper.getUtcDate()}}).then(()=>{

					eachOfSeries(odList,(records, key, childCallback)=>{
						let odId = records._id;

						/** To push order to dhub api */
						this.adminOrdersModel.pushOrderAtDhub(req,res,next,odId).then(()=>{

							/** Update order details */
							orders.updateOne({_id: odId},{$unset:{dhub_process_time: 1}}).then(()=>{
								childCallback(null);
							}).catch(()=>{
								childCallback(null);
							});
						}).catch(next);
					},()=>{ });
				}).catch(err=>{
					console.error("Error in pushOrderToDhub updateMany",err);
				});
			}
		});
	};//End pushOrderToDhub()

	/**
	 * Function to push cancle order to dhub
	 *  Frequency : every 1 minutes
	 *
	 * @param req 	As	 Request Data
	 * @param res 	As	Response Data
	 * @param next	As 	Callback argument to the middleware function
	 *
	 * @return render null
	 */
	async pushCancelOrderToDhub (req, res,next){
		try {
			/** Send response to client and work in backgHelper.round */
			res.render('blank',{layout:false});

			let ruleProcessTime 	= 	Helper.newDate(Helper.subtractMinute(ORDER_RULE_PROCESS_TIME_IN_MINUTES));
			let todayStartDate		=	Helper.newDate(Helper.newDate("",CURRENTDATE_START_DATE_FORMAT));
			let startDate 			= 	Helper.newDate(Helper.newDate(Helper.subtractMinuteFromDate(todayStartDate, 4*MINUTES_IN_A_HOUR)));

			/** Get order list */
			const orders =	this.db.collection(Tables.ORDERS);
			orders.find({
				order_date				: 	{$gte: Helper.getUtcDate(startDate)},
				dhub_order_id			: 	{$exists: true},
				dhub_order_cancel_time	: 	{$exists: false},
				dhub_cancel_retry 		:	{$lt: Constants.MAX_GFC_PUSH_LIMIT},
				$or :	[
					{cancel_dhub_process_time: {$exists : false }},
					{cancel_dhub_process_time: {$lte: ruleProcessTime }},
				]
			}).toArray().then(orderList=>{
				if(orderList && orderList.length > 0){
					let orderIds =	[];
					orderList.map(data => {
						orderIds.push(data._id);
					});

					/** Update order details */
					orders.updateMany({_id:{$in:Helper.arrayToObject(orderIds)}},{$set:{cancel_dhub_process_time: Helper.getUtcDate()}}).then(()=>{

						eachOfSeries(orderList,(records, key, eachCallback)=>{
							let odId = records._id;

							/** send cancel request to dhub */
							this.adminOrdersModel.pushOrderToDhubAsCanceled(req,res,next,odId).then(()=>{

								/** Update order details */
								orders.updateOne({_id: odId},{$unset:{cancel_dhub_process_time: 1}}).then(()=>{
									eachCallback(null);
								}).catch(()=>{
									eachCallback(null);
								});
							}).catch(next);
						},()=>{ });
					}).catch(err=>{
						console.error("Error in pushCancelOrderToDhub updateMany",err);
					});
				}
			}).catch(err=>{
				console.error("Error in pushCancelOrderToDhub find",err);
			});
		} catch (error) {
			console.error("Error in pushCancelOrderToDhub",error);
		}
	};//End pushCancelOrderToDhub()

	/**
	 * Function to update preparing order status
	 *
	 * @param req 		As Request Data
	 * @param res 		As Response Data
	 * @param options 	As Object Data
	 *
	 * @return render
	 */
	async updateOrderStatusPreparingToReadyToPick (req,res,next){
		try {
			/** Send response to client and work in backgHelper.round */
			res.render('blank',{layout:false});

			let currentDate	=	Helper.newDate(Helper.newDate("",Constants.CURRENTDATE_START_DATE_FORMAT));
			/**Get order detail */
			const orders =	this.db.collection(Tables.ORDERS);
			asyncParallel({
				order_list : (callback)=>{
					orders.find({
						order_date	 : 	{$gte: currentDate},
						admin_status :	Constants.ORDER_PREPARING,
						is_completed :	{$ne: true}
					},{projection:{_id:1,created:1,customer_id:1,restaurant_id:1,device_id:1}}).toArray().then(result=>{
						callback(null,result);
					}).catch(err=>{
						callback(err);
					});
				},
				admin_details : (callback)=>{
					/** Get user details */
					const users = this.db.collection(Tables.USERS);
					users.findOne({user_role_id : Constants.SYSTEM_ADMIN_ROLE_ID },{projection:{_id:1}}).then(result=>{
						callback(null, result);
					}).catch(err=>{
						callback(err);
					});
				},
			},(asyncErr,asyncRes)=>{
				if(asyncErr){
					console.error("Error in parallel at updateOrderStatusPreparingToReadyToPick",asyncErr);
				}

				let orderList 	 	=	asyncRes?.order_list || [];
				let adminDetails	= 	asyncRes?.admin_details || {};
				let adminId 		=	adminDetails?._id || null;

				if(orderList && orderList.length > 0 && adminId){
					const order_details 	= 	this.db.collection(Tables.ORDER_DETAILS);
					const order_status_logs	=	this.db.collection(Tables.ORDER_STATUS_LOGS);

					asyncEach(orderList,(record,eachCallback)=>{
						let orderId 		=	record._id;
						let deviceId 		= 	record.device_id;
						let customerId 		= 	record.customer_id;
						let restaurantId 	= 	record.restaurant_id;

						asyncParallel({
							sub_details : (callback)=>{
								/** Get order sub details */
								order_details.findOne({ order_id: orderId},{projection: { preparation_time: 1}}).then(detailsResult=>{
									callback(null,detailsResult);
								}).catch(err=>{
									callback(err);
								});
							},
							log_details : (callback)=>{
								/** Get order log list */
								order_status_logs.findOne({
									order_id : orderId,
									status	 : Constants.ORDER_PREPARING
								},{projection: { created: 1}}).then(logResult=>{
									callback(null,logResult);
								}).catch(err=>{
									callback(err);
								});
							}
						},(asyncErr,asyncRes)=>{
							if(asyncErr){
								console.error("Async parallel error on updateOrderStatusPreparingToReadyToPick",asyncErr);
								return eachCallback(null);
							}

							if(!asyncRes?.sub_details || !asyncRes?.log_details) return eachCallback(null);

							let preparationTime	= 	asyncRes?.sub_details?.preparation_time || 0;
							let logDate			=	asyncRes?.log_details?.created;
							logDate				=	Helper.newDate(Helper.newDate(Helper.addDaysToDate(preparationTime/Constants.MINUTES_IN_A_HOUR, logDate)));

							if(logDate <= Helper.newDate()){
								Helper.saveOrderStatusLogs(req,res,next,{
									order_id 		:	orderId,
									updated_by		:	adminId,
									device_id		:	deviceId,
									user_id			:	customerId,
									restaurant_id	:	restaurantId,
									status 			:	Constants.ORDER_READY_TO_PICK_UP,
									order_status	:	Constants.ORDER_PREPARING,
								}).then(()=>{
									eachCallback(null);
								});
							}else{
								eachCallback(null);
							}
						});
					},(eachErr)=>{
						if(eachErr){
							console.error("Error in each of series at updateOrderStatusPreparingToReadyToPick",eachErr);
						}
					});
				}
			});
		} catch (error) {
			console.error("Error in updateOrderStatusPreparingToReadyToPick",error);
		}
	}//End updateOrderStatusPreparingToReadyToPick();
}