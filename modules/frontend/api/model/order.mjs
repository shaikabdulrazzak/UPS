import { ObjectId } from 'mongodb';
import clone from 'clone';
import {parallel as asyncParallel, each as asyncEach, eachOfSeries as eachOfSeries} from 'async';
import * as Constants from "../../../../config/global_constant.mjs";
import Tables from '../../../../config/database_tables.mjs';
import { sanitizeData, getUtcDate, newDate, round, subtractMinute, getDifferenceBetweenTwoDatesInMinute, updateWalletBalance, getUniqueId, arrayToObject, addDaysToDate, subtractDate, getDateRange, arrangeUserAddress,currencyFormat, calculateOrderPayout, getCustomerAddress, saveOrderStatusLogs, addMinute } from "../../../../utils/index.mjs";
import { insertNotifications, sendMailToUsers, pushNotification} from "../../../../services/index.mjs";
import cartModals from './user_carts.mjs';
import assignmentModals from './assignment.mjs';
import registrationModals from './registration.mjs';


class Order {
    constructor(db) {
        this.db             =   db;
        this.cartAPI      	=   new cartModals(db);
        this.assignmentAPI  =   new assignmentModals(db);
        this.registrationAPI=   new registrationModals(db);
    }

	/**
	 * Function for order list
	 *
	 * @param req As Request Data
	 * @param res As Response Data
	 * @param next	As 	Callback argument to the middleware function
	 *
	 * @return render/json
	 */
	async getOrdersList(req, res,next){
		return new Promise(resolve=>{
			req.body			=	sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS_WITHOUT_IFRAME);
			let defaultLimit	= (res.locals.settings['Site.front_record_limit']) ? parseInt(res.locals.settings['Site.front_record_limit']) :Constants.FRONT_LISTING_LIMIT;
			let	skip 			= (req.body.skip)		? parseInt(req.body.skip)		:Constants.DEFAULT_SKIP;
			let	limit 			= (req.body.limit)		? parseInt(req.body.limit)		:defaultLimit;
			let userId			= (req.body.user_id)	? new ObjectId(req.body.user_id)	:"";
			let deviceId		= (req.body.device_id)	? req.body.device_id			:"";
			let userType		= (req.body.user_type)	? req.body.user_type			:"";
			let status			= (req.body.status)		? req.body.status				:"";
			let branchId    	= (req.body.branch_id)	? new ObjectId(req.body.branch_id)	:"";
			let restaurantId    = (req.body.restaurant_id)? new ObjectId(req.body.restaurant_id)  :"";
			var startDate 		= (req.body.from_date)	? newDate(req.body.from_date,Constants.DATABASE_DATE_FORMAT) 	:"";
			var endDate			= (req.body.to_date)	? newDate(req.body.to_date,Constants.DATABASE_DATE_FORMAT) 	:startDate;
			let fromDate  		= startDate 			? newDate(startDate+" "+Constants.START_DATE_TIME_FORMAT)		:"";
			let toDate 	  		= endDate 				? newDate(endDate+" "+Constants.END_DATE_TIME_FORMAT)			:"";
			let orderNumber		= (req.body.order_number)? req.body.order_number		:"";
			let languageId	 	= (req.body.language_id)?  req.body.language_id	:Constants.DEFAULT_LANGUAGE_MONGO_ID;
			let languageCode	= (languageId == Constants.ARABIC_LANGUAGE_MONGO_ID) ? 	Constants.ARABIC_LANGUAGE_CODE	:Constants.ENGLISH_LANGUAGE_CODE;

			/** Send error response **/
			if(!userType) return resolve({status: Constants.STATUS_ERROR, message: res.__("system.missing_parameters"),missing_fields:["user_type"]});

			if(userType != Constants.USER_TYPE_CUSTOMER && userType != Constants.USER_TYPE_DRIVER && userType != Constants.USER_TYPE_RESTAURANT) return resolve({status : Constants.STATUS_ERROR, message : res.__("system.invalid_access")});

			if(userType == Constants.USER_TYPE_DRIVER && (!userId || !status)) return resolve({status: Constants.STATUS_ERROR, message: res.__("system.missing_parameters"),missing_fields:["user_id","status"]});

			if(userType == Constants.USER_TYPE_CUSTOMER && (!userId && !deviceId)) return resolve({status: Constants.STATUS_ERROR, message: res.__("system.missing_parameters"),missing_fields:["user_id","device_id"]});

			if(userType == Constants.USER_TYPE_RESTAURANT && (!restaurantId || !status)) return resolve({status: Constants.STATUS_ERROR, message: res.__("system.missing_parameters"),missing_fields:["restaurant_id","status"]});

			let condition	=	{};
			if(userType == Constants.USER_TYPE_CUSTOMER){
				if(userId){
					condition.customer_id = new ObjectId(userId);
				}else{
					condition.device_id = deviceId;
				}
			}else if(userType == Constants.USER_TYPE_RESTAURANT){
				condition.restaurant_id     = restaurantId;
				condition.restaurant_status = status;
				condition.is_confirm	    = true;

				if(branchId) condition.branch_id = branchId;
				if(orderNumber) condition.unique_order_id = {$regex: new RegExp(orderNumber, "i")} ;
			}else{
				if(status){
					if(status == "pick_order"){
						condition['delivery_status'] = {$in : Constants.DRIVER_PICKUP_ORDER_STATUS};
					}else if(status == "delivered_order"){
						condition['delivery_status'] = {$in : Constants.DRIVER_DELIVERED_ORDER_STATUS};
					}else{
						condition['delivery_status'] = status;
					}
					if(status == Constants.ORDER_DELIVERED && fromDate && toDate) condition["order_date"] = {$gte: fromDate,$lte:toDate};
				}
				condition['captain_id']  = new ObjectId(userId);
			}

			const orders = this.db.collection(Tables.ORDERS);
			asyncParallel({
				orders_list: (callback)=>{
					/** Get orders list  **/
					orders.find(condition,{projection:{id : 1, unique_order_id : 1,order_date : 1, restaurant_status : 1, customer_id : 1, net_amount:1, captain_id:1, branch_id : 1, delivery_type: 1, restaurant_name : 1,payment_method : 1, restaurant_id :1, delivery_status:1,driver_status:1,customer_status:1,order_price:1,delivery_fee:1, is_modified: 1,picked_from:1,pickup_captain_id:1,pickup_lat:1,pickup_long:1,problem_type:1,problem_subtype:1, is_confirm:1, rejection_reason:1, delay_voc_status: 1, outstanding_amount:1,outstanding_payment:1,amount_debited_by_wallet:1,source : 1,source_payment:1,source_payment_name:1,aghzeya_bill_no:1,order_estimate_time:1}}).sort({created: Constants.SORT_DESC}).skip(skip).limit(defaultLimit).toArray().then(result=>{
						if(result.length <= 0) return callback(null, result);

						/** Push branch id, delivery by id, restaurant id, customer id and order id in array */
						let orderIds 		= [];
						let branchIds 		= [];
						let userIds 		= [];
						let paymentMethods	= [];
						let deliveryByIds	= [];
						let restaurantIds	= [];
						let pickupCaptainIds= [];

						result.map(record=>{
							if(record._id) orderIds.push(record._id);
							if(record.branch_id) branchIds.push(record.branch_id);
							if(record.delivery_type) deliveryByIds.push(record.delivery_type);
							if(record.customer_id) userIds.push(record.customer_id);
							if(record.payment_method) paymentMethods.push(record.payment_method);
							if(record.restaurant_id) restaurantIds.push(record.restaurant_id);
							if(record.pickup_captain_id) pickupCaptainIds.push(record.pickup_captain_id);
						});

						asyncParallel({
							restaurant_detail : (childCallback)=>{
								const restaurants = this.db.collection(Tables.RESTAURANTS);
								restaurants.find({_id : {$in : arrayToObject(restaurantIds)}},{projection : {_id: 1,image: 1}}).toArray().then(restaurantResult=>{

									let restaurantList = {};
									restaurantResult.map(data=>{
										restaurantList[data._id] = data.image;
									});
									childCallback(null,restaurantList);
								}).catch(next);
							},
							order_detail : (childCallback)=>{
								const order_details = this.db.collection(Tables.ORDER_DETAILS);
								order_details.find({order_id : {$in : arrayToObject(orderIds)}},{projection : {_id: 1,restaurant_address: 1, customer_address_id : 1,order_id:1, remaining_preparation_time : 1, preparation_time : 1,restaurant_latitude:1,restaurant_longitude:1,customer_latitude:1,customer_longitude:1,discount_price:1,delivery_duration:1,delivery_in:1,customer_address_detail:1}}).toArray().then(orderResult=>{
									if(orderResult.length < 0) return childCallback(null,{});

									let orderList = {};
									orderResult.map(order=>{
										order.customer_address  = (order.customer_address_detail) ? arrangeUserAddress(req,res,next,order.customer_address_detail)  :"";

										orderList[order.order_id] = order;
									});

									childCallback(null,orderList);
								}).catch(next);
							},
							branch_detail : (childCallback)=>{
								const restaurant_branches = this.db.collection(Tables.RESTAURANT_BRANCHES);
								restaurant_branches.find({_id : {$in : arrayToObject(branchIds)}},{projection : {_id: 1,name: 1}}).toArray().then(branchResult=>{

									let branchList = {};
									branchResult.map(branch=>{
										branchList[branch._id] = branch.name;
									});
									childCallback(null,branchList);
								}).catch(next);
							},
							user_detail : (childCallback)=>{
								const users = this.db.collection(Tables.USERS);
								users.find({_id : {$in : arrayToObject(userIds)}},{projection : {_id: 1,full_name: 1,mobile_number:1,revert_orders:1}}).toArray().then(userResult=>{

									let userList = {};
									userResult.map(user=>{
										userList[user._id] = {'name': user.full_name, 'mobile': user.mobile_number, revert_orders: user.revert_orders};
									});
									childCallback(null,userList);
								}).catch(next);
							},
							delivery_detail : (childCallback)=>{
								const delivery_methods = this.db.collection(Tables.DELIVERY_METHODS);
								delivery_methods.find({slug : {$in : deliveryByIds}},{projection : {slug: 1,title: 1}}).toArray().then(deliveryResult=>{

									let deliveryList = {};
									deliveryResult.map(delivery=>{
										deliveryList[delivery.slug] = { 'name' : delivery.title};
									});
									childCallback(null,deliveryList);
								}).catch(next);
							},
							payment_detail : (childCallback)=>{
								const payment_methods = this.db.collection(Tables.PAYMENT_METHODS);
								payment_methods.find({slug : {$in : paymentMethods}},{projection : {slug: 1,title: 1}}).toArray().then(paymentResult=>{

									let paymentList = {};
									paymentResult.map(payment=>{
										if(userType == Constants.USER_TYPE_RESTAURANT || userType == Constants.USER_TYPE_DRIVER){
											paymentList[payment.slug] = payment.title;
										}else{
											paymentList[payment.slug]=payment.title[DEFAULT_LANGUAGE_CODE];
										}
									});
									childCallback(null,paymentList);
								}).catch(next);
							},
							pickup_captain_detail : (childCallback)=>{
								const users = this.db.collection(Tables.USERS);
								users.find({_id : {$in : arrayToObject(pickupCaptainIds)}},{projection : {_id: 1,full_name: 1,mobile_number:1}}).toArray().then(pickupCaptainResult=>{

									let pickupCaptainList = {};
									pickupCaptainResult.map(pickupCaptain=>{
										pickupCaptainList[pickupCaptain._id] = {'name': pickupCaptain.full_name, 'mobile': pickupCaptain.mobile_number};
									});
									childCallback(null,pickupCaptainList);
								}).catch(next);
							},
							delivered_date_time_details : (childCallback)=>{
								/** Get order delivered time */
								const order_status_logs	= this.db.collection(Tables.ORDER_STATUS_LOGS);
								order_status_logs.find({
									order_id 	: 	{$in : orderIds},
									status 		:	Constants.ORDER_DELIVERED
								},{projection:{order_id:1,created:1}}).toArray().then(deliveredTimeResult=>{

									let deliveredTimeList = {};
									deliveredTimeResult.map(deliveredTime=>{
										deliveredTimeList[deliveredTime.order_id] = (deliveredTime) ? deliveredTime.created : "";
									});
									childCallback(null,deliveredTimeList);
								}).catch(next);
							},
							branch_phones : (childCallback)=>{
								const restaurant_branch_phone_numbers = this.db.collection(Tables.RESTAURANT_BRANCH_PHONE_NUMBERS);
								restaurant_branch_phone_numbers.find({
									branch_id 	 : {$in : arrayToObject(branchIds)},
									attribute_id : Constants.BRANCH_CUSTOMER_SERVICE_NUMBER_ATTRIBUTE_ID
								},{projection : {_id:0,branch_id:1,country_code:1,contact_name:1,value:1}}).toArray().then(phoneResult=>{

									let branchPhoneList = {};
									phoneResult.map(data=>{
										branchPhoneList[data.branch_id] = data;
									});
									childCallback(null,branchPhoneList);
								}).catch(next);
							},
						},(childErr, childResponse)=>{
							if(childErr) return callback(childErr);

							let branchPhoneList = (childResponse.branch_phones) ? childResponse.branch_phones :{};
							let orderDetailsObj = (childResponse.order_detail) ? childResponse.order_detail :{};
							result.map(record=>{
								let tmpOrderId 	   = record._id;
								let estimateTime   = record.order_estimate_time;
								let tmpDetailsObj  = (orderDetailsObj[tmpOrderId]) ? orderDetailsObj[tmpOrderId] :{};
								let rePreparationTime= (orderDetailsObj.remaining_preparation_time)? orderDetailsObj.remaining_preparation_time :0;

								if(userType == Constants.USER_TYPE_DRIVER && estimateTime){
									let tmpTime = getDifferenceBetweenTwoDatesInMinute(newDate(),estimateTime);

									rePreparationTime = (tmpTime >0) ? parseInt(tmpTime) :0;
								}

								record.branch_phone_details = (branchPhoneList[record.branch_id]) ? branchPhoneList[record.branch_id] :{};

								record.restaurant_image   = (childResponse.restaurant_detail[record.restaurant_id]) ? childResponse.restaurant_detail[record.restaurant_id] : "";

								record.preparation_time   			=	(orderDetailsObj.preparation_time)? orderDetailsObj.preparation_time :0;
								record.remaining_preparation_time   = 	rePreparationTime;

								record.restaurant_latitude   = (tmpDetailsObj.restaurant_latitude) ? tmpDetailsObj.restaurant_latitude : "";
								record.restaurant_longitude = (tmpDetailsObj.restaurant_longitude) ? tmpDetailsObj.restaurant_longitude : "";

								record.customer_latitude   = (tmpDetailsObj.customer_latitude) ? tmpDetailsObj.customer_latitude : "";
								record.customer_longitude   = (tmpDetailsObj.customer_longitude) ? tmpDetailsObj.customer_longitude : "";

								record.discount_price   = (tmpDetailsObj.discount_price) ? tmpDetailsObj.discount_price :0;

								record.restaurant_address   = (tmpDetailsObj.restaurant_address) ? tmpDetailsObj.restaurant_address : "";

								record.customer_address   = (tmpDetailsObj.customer_address) ? tmpDetailsObj.customer_address : "";

								record.delivery_duration   = (tmpDetailsObj.delivery_duration) ? tmpDetailsObj.delivery_duration : "";
								record.delivery_in  	   = (tmpDetailsObj.delivery_in) ? tmpDetailsObj.delivery_in : "";

								record.branch_name   = (childResponse.branch_detail[record.branch_id]) ? childResponse.branch_detail[record.branch_id] : "";

								record.delivery_by   = (childResponse.delivery_detail[record.delivery_type] && childResponse.delivery_detail[record.delivery_type].name) ? childResponse.delivery_detail[record.delivery_type].name : "";

								record.customer_name = (childResponse.user_detail[record.customer_id] && childResponse.user_detail[record.customer_id].name) ? childResponse.user_detail[record.customer_id].name : "";
								record.customer_mobile = (childResponse.user_detail[record.customer_id] && childResponse.user_detail[record.customer_id].mobile) ? childResponse.user_detail[record.customer_id].mobile : "";
								record.payment_type  = (childResponse.payment_detail[record.payment_method]) ? childResponse.payment_detail[record.payment_method] : "";
								record.prepared_in   = (tmpDetailsObj.preparation_time && record.order_date) ? addDaysToDate((tmpDetailsObj.preparation_time / MINUTES_IN_A_HOUR),record.order_date) : "";

								record.pickup_captain_name = (childResponse.pickup_captain_detail[record.pickup_captain_id] && childResponse.pickup_captain_detail[record.pickup_captain_id].name) ? childResponse.pickup_captain_detail[record.pickup_captain_id].name : "";
								record.pickup_captain_mobile = (childResponse.pickup_captain_detail[record.pickup_captain_id] && childResponse.pickup_captain_detail[record.pickup_captain_id].mobile) ? childResponse.pickup_captain_detail[record.pickup_captain_id].mobile : "";
								record.problem_type 	= (record.problem_type)    ? ORDER_CANCELED_REASON_TYPE[record.problem_type]    : "";

								/** Add order delivered date time in records*/
								if(childResponse.delivered_date_time_details[record._id]) record.delivered_date_time= childResponse.delivered_date_time_details[record._id];

								if(record.customer_id && childResponse.user_detail[record.customer_id]){
									let tmpUserDetails	=	childResponse.user_detail[record.customer_id];
									let orderStatus		=	record.order_status;
									let paymentMethod	=	record.payment_method;
									let totalOutStanding=	0;

									if(tmpUserDetails.revert_orders && tmpUserDetails.revert_orders.length >0 && paymentMethod == Constants.CASH_PAYMENT && !ORDER_FINISH_ACTIONS[orderStatus]){
										tmpUserDetails.revert_orders.map(data=>{
											if(data.outstanding_amount){
												totalOutStanding +=	data.outstanding_amount;
											}
										});
									}

									if(totalOutStanding >0) {
										record.outstanding_order_amount = round(totalOutStanding, Constants.CURRENCY_ROUND_PRECISION);
									}
								}

								if(record.source && record.source == Constants.SOURCE_CALL_CENTER){
									let tmpPaymentMethod = (record.payment_method && Constants.AGHZEYA_PAYMENT_METHODS[record.payment_method]) ? Constants.AGHZEYA_PAYMENT_METHODS[record.payment_method] : "";
									let tmpArPaymentMethod = (record.payment_method && Constants.AGHZEYA_ARABIC_PAYMENT_METHODS[record.payment_method]) ? Constants.AGHZEYA_ARABIC_PAYMENT_METHODS[record.payment_method] :tmpPaymentMethod;

									record.payment_type = {en: tmpPaymentMethod, ar: tmpArPaymentMethod};
								}else if(record.source && record.source != Constants.SOURCE_CALL_CENTER){
									record.payment_type = (record.source_payment_name) ? record.source_payment_name :{};
								}
							});

							callback(null,result);
						});
					}).catch(next);
				},
				records_total: (callback)=>{
					if(skip != Constants.DEFAULT_SKIP) return callback(null,0);

					/** Get total number of records in orders collection **/
					orders.countDocuments(condition).then(countResult=>{
						callback(null, countResult);
					}).catch(next);
				},
				amount_details: (callback)=>{
					if(status != Constants.ORDER_DELIVERED || userType != Constants.USER_TYPE_DRIVER) return callback(null);
					orders.aggregate([
						{ $match : condition },
						{ $group : {
							_id  : null,
							total_cash_orders : {$sum : {
								$cond: [
									{$and: [
										{ $eq : ["$payment_method",Constants.CASH_PAYMENT] },
									]},
									"$order_price",
									0
								]}
							},
							total_amount : { $sum: "$order_price" }
						}}
					]).toArray().then(result=>{
						callback(null,result);
					}).catch(next);
				},
				get_orders_count : (callback)=>{
					if(userType != Constants.USER_TYPE_DRIVER || (status != "pick_order" && status != "delivered_order")){
						return callback(null,null);
					}

					/** Get orders count **/
					this.getOrdersCount(req,res,next).then((countResponse)=>{
						if(countResponse.status != Constants.STATUS_SUCCESS) return callback(null,countResponse.message);
						callback(null,countResponse);
					}).catch(next);
				},
				get_restaurant_orders_count : (callback)=>{
					if(userType != Constants.USER_TYPE_RESTAURANT) return callback(null,null);

					/** Get restaurant orders count **/
					this.getRestaurantOrdersCount(req,res,next).then((countResponse)=>{
						if(countResponse.status != Constants.STATUS_SUCCESS) return callback(null,countResponse.message);
						callback(null,countResponse);
					}).catch(next);
				},
				voc_order_id : (callback)=>{
					if(!userId || userType != Constants.USER_TYPE_CUSTOMER) return callback(null,null);

					orders.find({
						delay_voc_status: Constants.PENDING,
						customer_id : userId
					},{projection : {_id:1}}).sort({voc_sent_time : Constants.SORT_DESC}).limit(1).toArray().then(result=>{
						let vocOrderId = (result[0] && result[0]._id) ? result[0]._id : "";
						callback(null,vocOrderId);
					}).catch(next);
				}
			},(err, response)=>{
				if(err) return next(err);

				let ordersCountList = response.get_orders_count ? response.get_orders_count :"";
				let restaurantOrdersCountList = response.get_restaurant_orders_count ? response.get_restaurant_orders_count :"";

				/** Set temp object */
				let responseObj = {
					status			: Constants.STATUS_SUCCESS,
					limit			: limit,
					result			: (response && response.orders_list) ? response.orders_list :[],
					records_total	: (response.records_total) ? response.records_total :0,
					voc_order_id	: (response.voc_order_id) ? response.voc_order_id :"",
					total_amount	: (response.amount_details && response.amount_details[0] && response.amount_details[0].total_amount) ? round(response.amount_details[0].total_amount,ROUND_PRECISION) :0,
					total_cash_collected: (response.amount_details && response.amount_details[0] && response.amount_details[0].total_cash_orders) ? round(response.amount_details[0].total_cash_orders,ROUND_PRECISION) :0,
					restaurant_image_path   : Constants.RESTAURANT_FILE_URL
				};

				if(ordersCountList){
					responseObj.accept_order_count   =  ordersCountList.accept_order_count;
					responseObj.pick_order_count     =	ordersCountList.pick_order_count;
					responseObj.delivery_order_count =	ordersCountList.delivery_order_count
				}

				if(restaurantOrdersCountList){
					responseObj.pending_count   		=  	restaurantOrdersCountList.pending_count;
					responseObj.preparing_count     	=	restaurantOrdersCountList.preparing_count;
					responseObj.on_the_way_count 		=	restaurantOrdersCountList.on_the_way_count
					responseObj.delivered_count		 	=	restaurantOrdersCountList.delivered_count
					responseObj.ready_to_pick_up_count 	= 	restaurantOrdersCountList.ready_to_pick_up_count
				}

				/** Send response **/
				resolve(responseObj);
			});
		}).catch(next);
	};//End getOrdersList()

	/**
	 * Function to get driver orders delivered graph
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	 **/
	async getDeliveredGraph (req,res,next,options){
		return new Promise(resolve=>{
			/** Sanitize Data **/
			req.body 		= sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
			options			= !options ? clone(req.body) : options;
			let userId		= (options.user_id) 	? 	options.user_id 	:"";

			var endDate		= (req.body.to_date) 	? newDate(req.body.to_date,Constants.DATABASE_DATE_FORMAT) 		: newDate("",Constants.DATABASE_DATE_FORMAT);
			var startDate	= (req.body.from_date) 	? newDate(req.body.from_date,Constants.DATABASE_DATE_FORMAT)	: newDate(subtractDate(Constants.HOURS_IN_A_DAY*(Constants.DAYS_IN_A_WEEK)),Constants.DATABASE_DATE_FORMAT);
			let fromDate  	= newDate(startDate+" "+Constants.START_DATE_TIME_FORMAT);
			let toDate 	  	= newDate(endDate+" "+Constants.END_DATE_TIME_FORMAT);

			/** Send error response **/
			if(!userId) return resolve({status : Constants.STATUS_ERROR, message : res.__("system.missing_parameters"),missing_fields : ["user_id"]});

			let commonCondition	=	{
				delivery_status	: Constants.ORDER_DELIVERED,
				order_date		: { $gte: fromDate, $lte: toDate},
				captain_id		: new ObjectId(userId)
			};
			const orders	=	this.db.collection(Tables.ORDERS);
			orders.aggregate([
				{ $match : commonCondition },
				{ $group : {
					_id  : {$dateToString: {format: Constants.GRAPH_DATE_FORMAT, date: "$order_date", timezone: Constants.DEFAULT_TIME_ZONE} },
					count: {$sum: 1 },
					order_date: {$first: "$order_date" },
				}},
				{$sort: {order_date : Constants.SORT_DESC} },
			]).toArray().then(result=>{

				/** Get date range between two dates */
				let datesArray	=	{};
				let graphData 	=	[];
				let orderCount	=	0;
				let orderAmount	=	0;
				let dates  		= 	getDateRange(new Date(fromDate),new Date(toDate));

				if(result.length > 0){
					result.map((data)=>{
						orderCount	+=	data.total_cash_orders;
						orderAmount	+=	data.total_cash_collected;
						datesArray[data._id] = data.count;
					});
				}

				/** Add count according to date */
				dates.map((record)=>{
					let dateToCheck = 	newDate(record,Constants.DATABASE_DATE_FORMAT);
					let count  		=	(datesArray[dateToCheck]) ? datesArray[dateToCheck] :0;
					graphData.push({'date' : dateToCheck,'count' : count});
				});

				/** Send success response */
				resolve({
					status : Constants.STATUS_SUCCESS,
					result : graphData
				});
			}).catch(next);
		}).catch(next);
	};// end getDeliveredGraph()

	/**
	 * Function to place order
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	**/
	async placeOrder(req,res,next){
		return new Promise(resolve=>{
			/** Sanitize Data **/
			req.body 			=	sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
            let userId			= 	(req.body.user_id)			?	new ObjectId(req.body.user_id)		:"";
            let deviceId		= 	(req.body.device_id)		?	req.body.device_id				:"";
            let orderPrice		=	(req.body.order_price)		?	parseFloat(req.body.order_price):0;
            let orderRestaurantList= (req.body.order_restaurant_list)? req.body.order_restaurant_list:[];
			let isWallet 		=	(req.body.is_wallet)		?	JSON.parse(req.body.is_wallet)	:false;
			let isUsedPoints 	=	(req.body.is_used_points)	?	JSON.parse(req.body.is_used_points):false;
            let paymentMethod 	=	(req.body.payment_method) 	?	req.body.payment_method			:"";
            let paymentResponse	= 	(req.body.payment_response)	?	req.body.payment_response		:"";
			let paymentCurrency	= 	(req.body.currency)			?	req.body.currency				:"";
			let deviceType 		= 	(req.body.device_type)		? 	req.body.device_type 			:"";
			let sheelCard 		= 	(req.body.sheel_card)		? 	req.body.sheel_card 			:"";
			let sourcePaymentName= 	(req.body.source_payment_name)? req.body.source_payment_name 	:"";
			let sourcePayment 	= 	(req.body.source_payment)	? 	req.body.source_payment 		:"";
            let aghzeyaSource	=	(req.body.source) 			?	req.body.source					:"";
            let aghzeyaSourceName=	(req.body.source_name) 		?	req.body.source_name			:"";
			let referenceNumber =	(req.body.reference_number) ?	req.body.reference_number		:"";
			let deviceToken 	= 	(req.body.device_token)		?	req.body.device_token			:"";
			let walletDebitAmount=	(req.body.wallet_amount)	?	parseFloat(req.body.wallet_amount):0;
			let isAdmin		 	=	(req.body.is_admin)			?	true 	:false;
            let isAghzeya		=	(req.body.is_aghzeya) 		?	true 	:false;
			let agentId		 	=	(req.body.agent_id)			?	new ObjectId(req.body.agent_id)		: userId;
			let outstandingOrderAmount=(req.body.outstanding_order_amount)? parseFloat(req.body.outstanding_order_amount) :0;
			let orderSource 	= 	(req.body.order_source) 	? 	req.body.order_source 		: "";

			let missingParameters	=  	false;
            let branchTransfer		=  	false;
			let missingObject	 	=  	{};
			let pickupBranchList 	=  	{};
			let scheduledBranchList	=  	{};
			let uniqueOrderId		=	"";

			let tmpOrderRestaurantList = {};
			if(orderRestaurantList.length >0){
				orderRestaurantList.map(records=>{
					let restaurantId    = records.restaurant_id;
					let branchId    	= records.branch_id;
					let areaId    		= records.area_id;
					let addressId    	= records.address_id;
					let deliveryBy     	= records.delivery_by;
                    let isSchedule     	= (records.is_schedule)?JSON.parse(records.is_schedule)	 :false;

					if(isSchedule && restaurantId && branchId){
						if(!scheduledBranchList[restaurantId]) scheduledBranchList[restaurantId] ={};
						if(!scheduledBranchList[restaurantId][branchId]) scheduledBranchList[restaurantId][branchId] ={};

						scheduledBranchList[restaurantId][branchId] = branchId;
					}

					if(deliveryBy != Constants.DELIVERY_BY_PICK_UP){
						if(!branchId || (userId && !addressId)){
							missingParameters = true;

							if(!branchId) missingObject.branch_id = true;
							if(userId && !addressId) missingObject.address_id = true;
						}
					}else{
						if(!pickupBranchList[restaurantId]) pickupBranchList[restaurantId] ={};
						pickupBranchList[restaurantId] = branchId;
					}

					if (!restaurantId || (!areaId && deliveryBy != Constants.DELIVERY_BY_PICK_UP)) {
						missingParameters = true;

						if(!restaurantId) missingObject.restaurant_id = true;
						if(!areaId) missingObject.area_id = true;
					}else{
						if(!tmpOrderRestaurantList[restaurantId]) tmpOrderRestaurantList[restaurantId] ={};
						if(!tmpOrderRestaurantList[restaurantId][branchId]) tmpOrderRestaurantList[restaurantId][branchId] ={};

						tmpOrderRestaurantList[restaurantId][branchId] = records;
					}
				});
			}

			/** Payment missing parameter */
			if(!isAdmin && paymentMethod != Constants.CASH_PAYMENT && paymentMethod != Constants.WALLET_PAYMENT){
				if(!paymentResponse || !paymentCurrency || !orderPrice){
					missingParameters = true;

					if(!paymentResponse) missingObject.payment_response = true;
					if(!paymentCurrency) missingObject.currency = true;
					if(!orderPrice) missingObject.order_price = true;
				}
			}

			/** Send error response **/
			if((!userId && !deviceId) || missingParameters || !paymentMethod || orderRestaurantList.length <=0){
				if(!userId && !deviceId) 				missingObject.user_device = true;
				if(orderRestaurantList.length <=0) 		missingObject.restaurant_list = true;
				if(!paymentMethod) 						missingObject.payment_method = true;

				return resolve({status: Constants.STATUS_ERROR, message:res.__("system.missing_parameters"), missing_object : missingObject});
			}

			let errors 			 	= 	[];
			let branchIds 			= 	[];
			let guestAddressList 	= 	{};
			let tmpGuestMobileNum	=	"";
			let validFloatRegx 		= 	/^[0-9]+([.][0-9]+)?$/;
			Object.keys(tmpOrderRestaurantList).map(tmpRestaurantId=>{
				Object.keys(tmpOrderRestaurantList[tmpRestaurantId]).map(tmpBranchId=>{
					branchIds.push(tmpBranchId);
					let records		  = tmpOrderRestaurantList[tmpRestaurantId][tmpBranchId];
					let isSchedule	  = (records.is_schedule)	 ? JSON.parse(records.is_schedule)	:false;
					let scheduledTime = (records.scheduled_time) ? records.scheduled_time			:"";
					let mobileNumber  = (records.mobile_number)  ? records.mobile_number			:"";
					let latitude	  = (records.latitude)  	? 	records.latitude				:"";
					let longitude	  = (records.longitude)  	? 	records.longitude				:"";
					let deliveryBy	  = (records.delivery_by)  	? 	records.delivery_by				:"";

					if(isSchedule && !scheduledTime){
						errors.push({'param':'scheduled_time','msg':res.__("orders.select_scheduled_time")});
					}

					if(!userId && deliveryBy !=Constants.DELIVERY_BY_PICK_UP){
						if(mobileNumber) tmpGuestMobileNum = mobileNumber;

						if(!latitude){
							errors.push({'param':'latitude','msg':res.__("customer_address.please_enter_latitude")});
						}else if(!validFloatRegx.test(latitude)){
							errors.push({'param':'latitude','msg':res.__("customer_address.please_enter_valid_latitude")});
						}

						if(!longitude){
							errors.push({'param':'longitude','msg':res.__("customer_address.please_enter_longitude")});
						}else if(!validFloatRegx.test(longitude)){
							errors.push({'param':'longitude','msg':res.__("customer_address.please_enter_valid_longitude")});
						}

						if(!records.city_id){
							errors.push({'param':'city_id','msg':res.__("customer_address.please_select_city")});
						}

						if(!records.area_id){
							errors.push({'param':'area_id','msg':res.__("customer_address.please_select_area")});
						}

						if(!records.block_id){
							errors.push({'param':'block_id','msg':res.__("customer_address.please_select_block")});
						}

						if(!records.street){
							errors.push({'param':'street','msg':res.__("customer_address.please_enter_street")});
						}

						if(errors.length <=0){
							if(!guestAddressList[mobileNumber]) guestAddressList[mobileNumber] ={};

							guestAddressList[mobileNumber] = records;
						}
					}
				});
			});

			/** Send error response */
			if(errors && errors.length >0) return resolve({status: Constants.STATUS_ERROR, message: errors});

			let firstGuestId = "";
			asyncParallel({
				get_branch_transfer: (parentCallback)=>{
					const restaurant_branch_transfers	=	this.db.collection(Tables.RESTAURANT_BRANCH_TRANSFERS);
					restaurant_branch_transfers.find({transfer_from : {$in : arrayToObject(branchIds)},date_from : {$lte : newDate()},date_to : {$gte : newDate()}},{projection:{transfer_from:1,transfer_to:1,date_from:1,date_to:1}}).toArray().then(transferResult=>{

						let transferObject	=	{};
						if(transferResult.length > 0){
							transferResult.map(record=>{
								transferObject[record.transfer_from]	=	record;
							});
						}
						parentCallback(null,transferObject);
					});
				},
				unique_order_id: (parentCallback)=>{
					return parentCallback(null, String(new ObjectId()));
				},
				order_list: (parentCallback)=>{
					/** Get cart list */
					let cartOptions 					=	clone(req.body);
					cartOptions.is_place_order 			=	true;
					cartOptions.pickup_branch_list 		=	pickupBranchList;
					cartOptions.scheduled_branch_list 	=	scheduledBranchList;
					cartOptions.restaurant_order_details=	tmpOrderRestaurantList;
					this.cartAPI.getUserCartList(req,res,next,cartOptions).then(response=>{
						parentCallback(null,response);
					}).catch(next);
				},
				guest_details: (parentCallback)=>{
					if(userId || Object.keys(guestAddressList).length <= 0) return parentCallback(null);

					let guestAddressIds 		=	{};
					const users 				= 	this.db.collection(Tables.USERS);
					const customer_addresses	=	this.db.collection(Tables.CUSTOMER_ADDRESSES);
					asyncEach(guestAddressList, (records, asyncEachCallback)=> {
						let firstName 	=	(records.first_name) 	?	records.first_name		:"";
						let lastName 	=	(records.last_name) 	?	records.last_name		:"";
						let mobileNumber=	(records.mobile_number) ?	records.mobile_number	:"";
						let latitude	=	(records.latitude)  ?	parseFloat(records.latitude):0;
						let longitude	=	(records.longitude) ?	parseFloat(records.longitude):0;

						/** Check user details */
						users.findOne({
							is_deleted 	 : 	Constants.NOT_DELETED,
							mobile_number:  mobileNumber
						},{projection: {_id:1}}).then(guestResult=>{

							let guestId	 = (guestResult) 	? 	guestResult._id	:"";
							firstGuestId = (!firstGuestId)	?	guestId			:firstGuestId;

							asyncParallel({
								guest_details: (childCallback)=>{
									if(guestId) return childCallback(null);

									/** Set user update data */
									let userUpdatedData = {
										first_name 			: firstName,
										last_name 			: lastName,
										full_name			: firstName+' '+ lastName,
										user_role_id		: CUSTOMER,
										phone_country_code 	: Constants.DEFAULT_COUNTRY_CODE,
										mobile_number 		: mobileNumber,
										user_type			: Constants.USER_TYPE_OTHER,
										is_guest			: true,
										is_customer			: true,
										active 				: Constants.ACTIVE,
										is_deleted 			: Constants.NOT_DELETED,
										created 			: getUtcDate(),
										modified   			: getUtcDate()
									};

									if(deviceType && deviceToken){
										userUpdatedData.device_details = [{
											device_type 	: deviceType.toLowerCase(),
											device_token	: deviceToken,
										}];
									}

									/** Save guest data */
									users.insertOne(userUpdatedData).then(userResult=>{
										guestId = (userResult && userResult.insertedId) ?userResult.insertedId :"";

										if(deviceType && deviceToken) firstGuestId = guestId;
										childCallback(null,guestId);
									}).catch(next);
								},
							},async (childErr)=>{
								if(childErr) return asyncEachCallback(childErr);

								/** Set conditions **/
								let conditions = {
									_id			: userId,
									user_type	: Constants.USER_TYPE_OTHER,
									is_deleted	: Constants.NOT_DELETED,
									active		: Constants.ACTIVE
								};

								/** Set options data for get user details **/
								let userOptions = {
									conditions: conditions,
									fields: { otp: 0, email_otp: 0, is_deleted: 0, created: 0, modified: 0, password: 0 }
								};

								/** Get user details **/
								let userResponse = await this.registrationAPI.getUserData(req, res, next, userOptions);

								if (userResponse.status != Constants.STATUS_SUCCESS) return asyncEachCallback(userResponse.message);
								let resultData = (userResponse.result) ? userResponse.result : "";

								/** Save address data **/
								customer_addresses.insertOne({
									first_name		: 	resultData.first_name,
									last_name		: 	resultData.last_name,
									mobile_number	: 	resultData.mobile_number,
									latitude		:	latitude,
									longitude		:	longitude,
									long_lat		:	[latitude,longitude],
									area_id			:	new ObjectId(records.area_id),
									block_id		:	new ObjectId(records.block_id),
									city_id			:	new ObjectId(records.city_id),
									street			:	records.street,
									venue			:	records.venue,
									device_id		: 	deviceId,
									user_id			: 	guestId,
									created 		: 	getUtcDate(),
									modified   		: 	getUtcDate(),
									additional_directions:	records.additional_directions,
								}).then(addressResult=>{
									let guestAddressId = (addressResult && addressResult.insertedId) ?addressResult.insertedId :"";

									if(!guestAddressIds[mobileNumber]) guestAddressIds[mobileNumber] ={};
									guestAddressIds[mobileNumber] = {
										guest_id 	: 	guestId,
										address_id 	:	guestAddressId,
									};
									asyncEachCallback(null);
								}).catch(next);
							});
						}).catch(next);
					},(asyncEachErr)=> {
						parentCallback(asyncEachErr,guestAddressIds);
					});
				},
				guest_total_orders : (callback)=>{
					if(userId) return callback(null,0);

					/** Get order count  */
					const orders = 	this.db.collection(Tables.ORDERS);
					orders.countDocuments({device_id: deviceId}).then(orderCount=>{
						callback(null,orderCount);
					}).catch(next);
				},
				user_details: (callback)=>{
					if(!userId) return callback(null,null);

					/** Get user details  */
					const users = this.db.collection(Tables.USERS);
					users.findOne({_id: userId },{projection:{mobile_number:1, revert_orders:1}}).then(userDetails=>{
						callback(null,userDetails);
					}).catch(next);
				},
				today_order_count: (callback)=>{
					/** Get order count  */
					let currentDate = newDate(newDate("",Constants.CURRENTDATE_START_DATE_FORMAT));

					const unique_order_ids = this.db.collection(Tables.UNIQUE_ORDER_IDS);
					unique_order_ids.findOneAndUpdate({
						order_date: {$gte: currentDate},
					},
					{
						$inc : {
							order_count: 1
						},
						$setOnInsert: {
							order_date : currentDate,
						}
					},{upsert:true, projection :{order_count: 1}}).then(orderCount=>{
						orderCount = orderCount?.order_count+1 || 1;
						callback(null,orderCount);
					}).catch(next);
				},
			},(parentErr,parentResponse)=>{
				if(parentErr) return next(parentErr);

				/** Send error response */
				if(parentResponse.order_list.status != Constants.STATUS_SUCCESS) return resolve(parentResponse.order_list);

				let getBranchTransfer 	= 	(parentResponse.get_branch_transfer) ? parentResponse.get_branch_transfer : {};
				let allOrderUniqueId 	= 	parentResponse.unique_order_id;
				let orderList  			=	parentResponse.order_list.result;
				let grandTotal 			=	parentResponse.order_list.grand_total;
				let guestList 			=	parentResponse.guest_details;
				let userDetails 		=	parentResponse.user_details;
				let guestTotalOrders 	=	parentResponse.guest_total_orders;
				let todayOrderCount 	=	(parentResponse.today_order_count) ? parentResponse.today_order_count :1;
				let userMobileNumber 	=	(userDetails && userDetails.mobile_number) ? userDetails.mobile_number :"";
				let userRevertOrders 	=	(userDetails && userDetails.revert_orders) ? userDetails.revert_orders :[];

				/** Send error response **/
				if(orderList.length <=0) return resolve({status: Constants.STATUS_ERROR, message: res.__("system.something_going_wrong_please_try_again"), parentResponse: parentResponse });

				/** Check all branch or item available or not */
				let missingDetails		=   false;
				let branchAvailable 	= 	true;
				let itemAvailable		=	true;

				orderList.map(records=>{
					let restaurantId 	= 	records.restaurant_id;
					let branchId 	 	=	records.branch_id;
					if(!records.branch_available)  	branchAvailable = false;
					if(records.branch_open != Constants.OPEN) branchAvailable = false;

					if(!tmpOrderRestaurantList[restaurantId] || !tmpOrderRestaurantList[restaurantId][branchId]){
						missingDetails = true;
					}
					if(tmpOrderRestaurantList[restaurantId] && tmpOrderRestaurantList[restaurantId][branchId] && tmpOrderRestaurantList[restaurantId][branchId].transfer_branch_id){
						branchAvailable = true;
					}else if(getBranchTransfer[branchId]){
						branchAvailable = true;
					}

					records.item_list.map(itemData=>{
						if(!itemData.item_available)  itemAvailable = false;
					});
				});

				/** Send error response **/
				if(missingDetails){
					return resolve({status: Constants.STATUS_ERROR, message: res.__("system.missing_parameters"), missing_details: true});
				}

				/** Send error response **/
				if(!branchAvailable || !itemAvailable){
					let message = (!branchAvailable) ? res.__("order.branch_not_available") : res.__("order.item_not_available");
					return resolve({status: Constants.STATUS_ERROR, message: message, orderList: orderList});
				}

				asyncParallel({
					invoice_number : (invoiceCallback)=>{
						/** get invoice unqiue number **/
						getUniqueId(req,res,next,{
							type 			:	"order_invoice_number",
							platform 		: 	deviceType,
							client_number	: 	(userMobileNumber) ? userMobileNumber :tmpGuestMobileNum,
						}).then(uniqueIdResponse=>{
							invoiceCallback(null,uniqueIdResponse.result);
						}).catch(next);
					},
				},(invoiceErr,invoiceResponse)=>{
					if(invoiceErr) return next(invoiceErr);

					let invoiceNumber 		= 	invoiceResponse.invoice_number;
					let pointsPerAmount 	=	(res.locals.settings["Points_system.points_per_amount"]) ?	parseFloat(res.locals.settings["Points_system.points_per_amount"])	:0;

					const orders 		= 	this.db.collection(Tables.ORDERS);
					const users 		= 	this.db.collection(Tables.USERS);
					const order_details = 	this.db.collection(Tables.ORDER_DETAILS);
					const order_items	= 	this.db.collection(Tables.ORDER_ITEMS);
					const tmp_offer_logs= 	this.db.collection(Tables.TMP_OFFER_LOGS);
					const offer_logs	= 	this.db.collection(Tables.OFFER_LOGS);
					const user_carts 	= 	this.db.collection(Tables.USER_CARTS);

					let remainingAmount 	= 	0;
					let paymentOrderIds 	=	[];
					let paymentCartIds 		=	[];
					let orderIdsArray		=	[];
					let orderPaid 			=	true;
					eachOfSeries(orderList, (records,index, eachCallback)=> {
						let restaurantId 	= 	records.restaurant_id;
						let branchId 	 	=	records.branch_id;
						let areaId 	 	 	=	records.area_id;
						let itemList 	 	=	records.item_list;
						let totalAmount 	=	records.total_amount;
						let restConceptId 	= 	records.concept_id;
						let simphony 		= 	records.simphony && Constants.ACTIVE ||0;
						let packageId 	 	=	(records.package_id)		 ? new ObjectId(records.package_id):"";
						let restaurantName	=	(records.restaurant_name) 	 ? records.restaurant_name 	  :"";
						let isDoubleCashback=	(records.is_double_cashback) ? records.is_double_cashback :"";
						let orderId			=	new ObjectId();
						let orderNetAmount	=	0;
						let orderAutoCloseTime=	records.auto_close_order_time ? addDate(records.auto_close_order_time/MINUTES_IN_A_HOUR) :"";

						itemList.map(itemData=>{
							orderNetAmount += itemData.sub_price;
						});

						let tmpOrderDetails = 	tmpOrderRestaurantList[restaurantId][branchId];
						let branchTransfer	=	getBranchTransfer[branchId];
						let previousBranchId	=	"";

						if(tmpOrderDetails.transfer_branch_id){
							previousBranchId	=	branchId;
							branchId	=	new ObjectId(tmpOrderDetails.transfer_branch_id);
						}else if(branchTransfer){
							previousBranchId	=	branchId;
							branchId	=	new ObjectId(branchTransfer.transfer_to);
						}
						let note			= 	(tmpOrderDetails.note) ? tmpOrderDetails.note :"";
						let addressId 		=	(tmpOrderDetails.address_id)?new ObjectId(tmpOrderDetails.address_id) :"";
						let deliveryAreaId 	= (tmpOrderDetails.area_id)?new ObjectId(tmpOrderDetails.area_id) :"";
						let address 		=	(tmpOrderDetails.address) ? tmpOrderDetails.address	:"";
						let latitude 		=	(tmpOrderDetails.latitude) ? parseFloat(tmpOrderDetails.latitude)	:0;
						let longitude 		=	(tmpOrderDetails.longitude) ? parseFloat(tmpOrderDetails.longitude)	:0;
						let isSchedule	  	= 	(tmpOrderDetails.is_schedule) ? JSON.parse(tmpOrderDetails.is_schedule)	:false;
						let scheduledTime 	=	(tmpOrderDetails.scheduled_time) ? tmpOrderDetails.scheduled_time	:"";
						let selectedScdTime =	(tmpOrderDetails.scheduled_time) ? clone(tmpOrderDetails.scheduled_time) :"";
						let mobileNumber  	=	(tmpOrderDetails.mobile_number)  ? tmpOrderDetails.mobile_number 	:"";
						let guestId			=	"";
						let guestAddressId	=	"";

						if(guestList && guestList[mobileNumber]){
							guestId		   = guestList[mobileNumber].guest_id;
							guestAddressId = guestList[mobileNumber].address_id;
						}

						let finalWalletDebitAmount = 0;
						asyncParallel({
							unique_order_id: (parentCallback)=>{
								/** Set unqiue id options */
								let orderUnqiueOptions = {
									type 		: "orders",
									order_count : todayOrderCount+index,
								};

								/** get order unqiue id **/
								getUniqueId(req,res,next,orderUnqiueOptions).then(uniqueIdResponse=>{
									parentCallback(null,uniqueIdResponse.result);
								}).catch(next);
							},
							transaction_id : (parentCallback)=>{
								return parentCallback(null, String(new ObjectId()));
							},
							update_wallet: (parentCallback)=>{
								if(!walletDebitAmount || walletDebitAmount<= 0 || !userId || totalAmount<= 0){
									remainingAmount += totalAmount;
									return parentCallback(null);
								}

								let tmpDebitAmount =  0;
								if(walletDebitAmount >= totalAmount){
									walletDebitAmount = walletDebitAmount-totalAmount;
									tmpDebitAmount 	  = totalAmount;
								}else{
									tmpDebitAmount 	  = walletDebitAmount;
									walletDebitAmount = 0;
								}

								/** Set wallet options */
								finalWalletDebitAmount = tmpDebitAmount;
								let walletOptions = {
									user_id      	: userId,
									amount       	: tmpDebitAmount,
									transaction_type: DEBIT,
									order_id		: allOrderUniqueId,
									is_used_points	: isUsedPoints,
									is_double_cashback: isDoubleCashback,
									extra_parameters:{
										order_id 		: orderId,
										branch_id 		: branchId,
										restaurant_id 	: restaurantId,
										order_place 	: true,
									}
								};

								/** Update wallet  */
								updateWalletBalance(req,res,next,walletOptions).then(walletResponse=>{
									if(walletResponse.status != Constants.STATUS_SUCCESS) return parentCallback(walletResponse);

									remainingAmount += (walletResponse.remaining_amount) ? walletResponse.remaining_amount :0;

									parentCallback(null,walletResponse.transaction_id);
								}).catch(next);
							},
							allow_cashback: (parentCallback)=>{
								if(isWallet || paymentMethod == Constants.WALLET_PAYMENT || totalAmount <= 0) return parentCallback(null,null);

								/** Check branch accept cashback payment */
								const restaurant_branch_attributes = this.db.collection(Tables.RESTAURANT_BRANCH_ATTRIBUTES);
								restaurant_branch_attributes.findOne({
									attribute_id : 	Constants.BRANCH_OFFERS_CASHBACK_ATTRIBUTE_ID,
									branch_id	 :	branchId,
									restaurant_id:	restaurantId,
								},{projection:{value:1}}).then(attributeResult=>{
									let pointsAllow = (attributeResult && attributeResult.value && parseInt(attributeResult.value) == Constants.ACCEPT) ? true :false;

									parentCallback(null,pointsAllow);
								}).catch(next);
							},
						},(parentParallelErr,parentParallelResponse)=>{
							if(parentParallelErr) return eachCallback(parentParallelErr);

							let allowCashback   =   parentParallelResponse.allow_cashback;
							uniqueOrderId       =   parentParallelResponse.unique_order_id;
							let transactionId   =   parentParallelResponse.transaction_id;
							let isBigOrder 	    =   (orderNetAmount >= Constants.BIG_ORDER_AMOUNT) ? true :false;
							let orderStatus     =   (isSchedule) ?  Constants.ORDER_SCHEDULED :Constants.ORDER_SUBMITTED;
							let deliveryTime	=	(records.delivery_time) 	? 	records.delivery_time		:0;
							let preparationTime	=	(records.preparation_time) 	?	records.preparation_time	:0;
							let deliveryType	=	records.delivery_by;
							let branchAreaId	=	(records.branch_area_id) 	? 	records.branch_area_id : "";
							let tmpScheduledDate= 	"";

							/** Manage schedule date */
							if(isSchedule){
								tmpScheduledDate 	=	getUtcDate(scheduledTime);
								let tmpExpectTime 	=	preparationTime+(deliveryType != Constants.DELIVERY_BY_PICK_UP ? deliveryTime :0);
								let diffMins 		=	getDifferenceBetweenTwoDatesInMinute(getUtcDate(),tmpScheduledDate)-tmpExpectTime;

								if(diffMins > 0){
									tmpScheduledDate = getUtcDate(addMinute(diffMins));
								}
							}

							if(aghzeyaSource){
								if((paymentMethod == Constants.KNET || paymentMethod == Constants.CREDIT_PAYMENT) && aghzeyaSource == Constants.SOURCE_CALL_CENTER){
									orderStatus = Constants.ORDER_PAYMENT_PENDING;
								}
							}else{
								if(isAdmin && paymentMethod != Constants.CASH_PAYMENT && paymentMethod != Constants.WALLET_PAYMENT) orderStatus = Constants.ORDER_PAYMENT_PENDING;
							}

							if(orderStatus== Constants.ORDER_PAYMENT_PENDING || req.body.payment_method == Constants.CASH_PAYMENT){
								orderPaid =false;
							}

							/** Set order save details  */
							let forderDate 	  = (isSchedule) ? getUtcDate(scheduledTime)	:getUtcDate();
							let orderSaveData =	{
								unique_order_id	: 	uniqueOrderId,
								invoice_number  :   invoiceNumber,
								captain_id		:	"",
								delivery_type	:	deliveryType,
								scheduled_date 	:   tmpScheduledDate,
								order_date		: 	forderDate,
								request_note	:	note,
								last_status_updated_on: getUtcDate(),
								branch_id	 	: 	branchId,
								area_id		 	: 	areaId,
								branch_area_id	: 	branchAreaId,
								area_name		: 	(records.area_name) ? records.area_name :{},
								payment_method	: 	paymentMethod,
								restaurant_id 	: 	restaurantId,
								restaurant_name : 	restaurantName,
								order_price		:	totalAmount,
								net_amount		:	round(orderNetAmount),
								order_status	: 	orderStatus,
								is_confirm		:	true,
								queue_time		:	getUtcDate(),
								number_of_queue : 	Constants.FIRST_REQUEUE_ORDER,
								delivery_fee	: 	records.delivery_fees,
								main_order_id	:	allOrderUniqueId,
								is_big_order	:	isBigOrder,
								order_source	:	orderSource,
								amount_debited_by_wallet: finalWalletDebitAmount,
								created			:	getUtcDate(),
								modified		:	getUtcDate(),
								placed_by		:	agentId,
								customer_latitude	:	latitude,
								customer_longitude	:	longitude,
								delivery_duration	: 	deliveryTime,
								discount_price		: 	(records.discount) ? records.discount :0,
								remaining_delivery_duration: deliveryTime,
								server_ip	: process.env.SERVER_IP,
							};

							/** Set all status keys like - admin_status, customer_status */
							if(orderStatus && Constants.ORDER_ACTIONS[orderStatus]) orderSaveData = {...orderSaveData,...Constants.ORDER_ACTIONS[orderStatus]};

							if(isSchedule){
								orderSaveData['is_schedule']					= true;
								orderSaveData['agent_selected_schedule_date']	= getUtcDate(selectedScdTime);
							}
							if(simphony) 		orderSaveData['simphony']			= true;
							if(isAghzeya) 		orderSaveData['aghzeya']			= true;
							if(sourcePaymentName)orderSaveData['source_payment_name']= sourcePaymentName;
							if(sourcePayment)	orderSaveData['source_payment']		= sourcePayment;
							if(sheelCard) 		orderSaveData['sheel_card']			= sheelCard;
							if(aghzeyaSource) 	orderSaveData['source']				= aghzeyaSource;
							if(aghzeyaSourceName) 	orderSaveData['source_name']	= aghzeyaSourceName;
							if(orderAutoCloseTime) 	orderSaveData['order_auto_close_time'] = getUtcDate(orderAutoCloseTime);

							if(records.partners) orderSaveData.partners = records.partners;

							if(paymentMethod == Constants.KNET){
								let knetValue	=	(res.locals.settings['Site.knet_charges']) ? res.locals.settings['Site.knet_charges'] :0;
								let knetCharges	=  (knetValue) ?(totalAmount * knetValue)/MAX_PERCENTAGE :0;

								orderSaveData.knet_charges		=	round(knetCharges);
								orderSaveData.total_knet_amount	=	totalAmount;
							}

							if(userId){
								orderSaveData.customer_id 	=	userId;
							}else{
								orderSaveData.device_id 	= 	deviceId;
								if(guestId){
									orderSaveData.customer_id 	= 	guestId;
									orderSaveData.is_guest 		= 	true;
								}
							}

							/** Save package details  */
							if(packageId){
								orderSaveData.package_id 			= 	packageId;
								orderSaveData.package_delivery_fees =	records.package_delivery_fees;
								orderSaveData.is_infinity_user 		=	true;
							}

							/** Save order details */
							orders.updateOne({_id: orderId },{$set: orderSaveData},{upsert: true}).then(()=>{

								/** update customer details*/
								this.updateCustomerDetailsInOrder(req,res,next,{
									order_id 	: orderId,
									customer_id	: userId
								}).then(()=>{});

								/** Push order id and restaurant id in array */
								orderIdsArray.push({
									order_id 		: orderId,
									restaurant_id	: restaurantId,
									unique_order_id	: uniqueOrderId,
									is_schedule 	: isSchedule,
									order_status 	: orderStatus,
									is_big_order	: isBigOrder,
								});

								paymentOrderIds.push(orderId);

								asyncParallel({
									order_details : (callback)=>{
										let restaurantLatitude	=	records.branch_latitude;
										let restaurantLongitude	=	records.branch_longitude;

										/** Set order details  */
										let orderDetailsData = {
											order_id			:	orderId,
											unique_order_id		:	uniqueOrderId,
											transaction_id		:	transactionId,
											customer_address_id	:	addressId,
											delivery_area_id	: 	deliveryAreaId,
											customer_address	:	address,
											customer_latitude	:	latitude,
											customer_longitude	:	longitude,
											customer_long_lat	:	[longitude,latitude],
											restaurant_address	:	records.branch_address,
											restaurant_latitude : 	restaurantLatitude,
											restaurant_longitude: 	restaurantLongitude,
											restaurant_long_lat	:	[restaurantLongitude,restaurantLatitude],
											total_amount		: 	totalAmount,
											net_amount			: 	round(orderNetAmount),
											discount_price		: 	(records.discount) ? records.discount :0,
											offer_id			: 	records.offer_id,
											offer_code			: 	(records.offer_code)?records.offer_code :"",
											offer_type			: 	(records.offer_type)?records.offer_type :"",
											delivery_fee		: 	records.delivery_fees,
											additional_tax		: 	records.additional_tax,
											reference_number	: 	referenceNumber,
											payment_method		: 	paymentMethod,
											delivery_duration	: 	deliveryTime,
											elapsed_time		: 	deliveryTime,
											preparation_time	: 	preparationTime,
											remaining_preparation_time	: 	preparationTime,
											remaining_delivery_duration	: 	deliveryTime,
											modified			: 	getUtcDate(),
											created				: 	getUtcDate(),
										};

										if(previousBranchId) orderDetailsData['branch_transfer_id']	=	new ObjectId(previousBranchId);

										if(records.additional_tax_percentage){
											orderDetailsData.additional_tax_percentage =	records.additional_tax_percentage;
										}

										if(records.offer_discount){
											orderDetailsData.offer_discount =	records.offer_discount;
										}

										if(records.offer_delivery_fees){
											orderDetailsData.offer_delivery_fees =	records.offer_delivery_fees;
										}

										if(userId){
											orderDetailsData.customer_id =	userId;
										}else{
											orderDetailsData.device_id 	 = 	deviceId;
											if(guestId) orderDetailsData.customer_id = 	guestId;
											if(guestAddressId){
												orderDetailsData.customer_address_id = 	guestAddressId;
											}
										}

										if(records.corporate_id){
											orderDetailsData.corporate_id =	new ObjectId(records.corporate_id);

											if(records.corporate_discount){
												orderDetailsData.corporate_discount =	records.corporate_discount;
											}
											if(records.corporate_delivery_fees){
												orderDetailsData.corporate_delivery_fees =	records.corporate_delivery_fees;
											}
										}

										if(records.branch_extra_charge_type){
											orderDetailsData.branch_extra_charge =	records.branch_extra_charge;
											orderDetailsData.branch_extra_charge_type =	records.branch_extra_charge_type;
										}

										if(records.branch_discount_type){
											orderDetailsData.branch_discount =	records.branch_discount;
											orderDetailsData.branch_discount_type =	records.branch_discount_type;
										}

										/** Save order details */
										order_details.insertOne(orderDetailsData).then(()=>{

											/** Update customer address*/
											this.updateCustomerAddressInOrder(req,res,next,{ order_id: orderId, address_id: addressId }).then(()=>{
												callback(null);
											}).catch(next);
										}).catch(next);
									},
									order_items : (callback)=>{

										/** Manage item save data */
										let itemSaveData = [];
										itemList.map(itemData=>{
											let itemDiscount = (itemData.discount) 	? itemData.discount  :0;
											let subPrice 	 = (itemData.sub_price)	? itemData.sub_price :0;

											let tempObj = {
												order_id 		: 	orderId,
												parent_item_id 	: 	itemData.parent_item_id,
												qty 			: 	itemData.qty,
												item_name 		: 	itemData.item_name,
												// item_image 		:	itemData.copy_image_name,
												item_image 		:	itemData.item_image,
												item_id 		: 	itemData.item_id,
												unit_id 		: 	itemData.unit_id,
												dough_id 		: 	itemData.dough_id,
												selector_id 	: 	itemData.selector_id,
												item_type 		:	itemData.item_type,
												note 			:	itemData.note,
												item_main_price :	itemData.item_main_price,
												cuisine_ids		:	(itemData.cuisine_ids) ? itemData.cuisine_ids :[],
												extra_items 	:	[],
												price			:	itemData.item_price,
												total_extra_item_price:	itemData.total_extra_item_price ? itemData.total_extra_item_price :0,
												sub_total		:	round(subPrice-itemDiscount),
												discounted_price:	itemDiscount,
												net_amount		:	subPrice,
												created 		:	getUtcDate(),
												order_date		: 	forderDate,
												cart_id			:	itemData._id,
												cart_created	:	itemData.created
											};

											if(itemData.item_unit_id){
												tempObj.item_unit_id =itemData.item_unit_id;
											}

											if(itemData.unit_lists && itemData.unit_lists.length >0){
												tempObj.unit_lists = itemData.unit_lists;
											}

											/** Manage extra items  */
											if(itemData.extra_items && itemData.extra_items.length >0){
												itemData.extra_items.map(extraItemData=>{
													let groupId = extraItemData.group_id;

													extraItemData.extra_item_ids.map(exItemData=>{

														tempObj.extra_items.push({
															group_id			:	groupId,
															extra_item_id		:	exItemData.extra_item_id,
															extra_item_group_id	:	exItemData.extra_group_item_id,
															extra_item_name		:	exItemData.extra_item_name,
															price				:	exItemData.extra_fees || 0,
															qty					:	exItemData.qty > 0 && parseInt(exItemData.qty) || 1
														});
													});
												});
											}

											itemSaveData.push(tempObj);
										});

										/** Save order item details */
										order_items.insertMany(itemSaveData).then(()=>{
											callback(null);
										}).catch(next);
									},
									remove_offer_logs : (callback)=>{
										let cartIds = [];
										itemList.map(itemData=>{
											cartIds.push(itemData._id);

											paymentCartIds.push(itemData._id);
										});


										asyncParallel({
											remove_offer_logs : (subCallback)=>{
												/** Delete logs  */
												tmp_offer_logs.deleteMany({
													cart_ids : {$in: cartIds}
												}).then(()=>{
													subCallback(null);
												}).catch(next);
											},
											update_order_id : (subCallback)=>{
												/** update logs  */
												offer_logs.updateMany({
													cart_ids : {$in: cartIds}
												},
												{
													$set: {
														order_id : orderId,
														modified : getUtcDate(),
													},
													$unset: {
														cart_ids : 1
													},
												}).then(()=>{
													subCallback(null);
												}).catch(next);
											},
											remove_cart : (subCallback)=>{
												/**to Update order posting status */
												const abandoned_carts_reports = this.db.collection(Tables.ABANDONED_CARTS_REPORTS);
												abandoned_carts_reports.updateMany({
													cart_ids: { $in: cartIds }
												},
												{
													$set: {
														modified : getUtcDate(),
														order_posting_status: Constants.ORDERED
													}
												}).then(()=>{}).catch(next);

												/** Remove carts  */
												user_carts.deleteMany({_id: {$in: cartIds} }).then(()=>{
													subCallback(null);
												}).catch(next);
											},
										},(subParallelErr)=>{
											callback(subParallelErr);
										});
									},
									update_package_details : (callback)=>{
										if(!userId || !packageId) return callback(null);

										users.updateOne({
											_id			: userId,
											package_id	: packageId,
											remaining_package_orders: {$gt: 0}
										},
										{$inc: {
											remaining_package_orders : -1
										}}).then(()=>{
											callback(null);
										}).catch(next);
									},
									add_cashback : (callback)=>{
										let cashBackAmount	  = totalAmount-finalWalletDebitAmount;
										if(!allowCashback || !pointsPerAmount || !userId || cashBackAmount<=0){
											return callback(null);
										}

										let totalCreditPoints = round(cashBackAmount*pointsPerAmount);
										if(isDoubleCashback){
											totalCreditPoints += totalCreditPoints;
										}

										/** Set points options */
										let creditOptions = {
											user_id 		:	userId,
											amount 			: 	totalCreditPoints,
											wallet_type  	: 	Constants.POINTS_AMOUNT,
											transaction_type: 	Constants.CREDIT,
											order_id		: 	allOrderUniqueId,
											extra_parameters:{
												order_id 			: orderId,
												branch_id 			: branchId,
												restaurant_id 		: restaurantId,
												order_place 		: true,
												is_double_cashback 	: isDoubleCashback,
											},
										};

										/** Add points in wallet */
										updateWalletBalance(req,res,next,creditOptions).then(()=>{
											callback(null);
										}).catch(next);
									},
									branch_transfer_logs: (callback)=>{
										if(tmpOrderDetails.transfer_branch_id || branchTransfer){
											const branch_transfer_logs	=	this.db.collection(Tables.BRANCH_TRANSFER_LOGS);
											branch_transfer_logs.insertOne({
												order_id : new ObjectId(orderId),
												from_branch : records.branch_id,
												to_branch	:	branchId,
												branch_transfer : true,
												time : getUtcDate()
											}).then(()=>{
												callback(null);
											}).catch(next);
										}else{
											callback(null);
										}
									},
								},(asyncParallelErr)=>{
									eachCallback(asyncParallelErr);
								});
							}).catch(next);
						});
					},(eachErr)=> {
						if(eachErr) return next(eachErr);

						let allOrderIds = [];
						let allUniqueOrderIds = [];
						orderIdsArray.map(records=>{
							allUniqueOrderIds.push(records.unique_order_id);
							allOrderIds.push(records.order_id);
						});

						asyncParallel({
							update_order_details: (callback)=>{

								/** Save order type */
								this.updateOrderType(req,res,next,{
									user_id 		: 	userId,
									device_id 		: 	deviceId,
									main_order_id 	:	allOrderUniqueId,
								}).then(()=>{

									/** Save order logs */
									asyncEach(orderIdsArray, (records, asyncEachCallback)=> {
										let tmpOrderStatus 	=	records.order_status;

										if(aghzeyaSource){
											if((req.body.payment_method == Constants.KNET || req.body.payment_method == Constants.CREDIT_PAYMENT) && req.body.source == Constants.SOURCE_CALL_CENTER){
												tmpOrderStatus = Constants.ORDER_PAYMENT_PENDING;
											}
										}else{
											if(isAdmin && paymentMethod != Constants.CASH_PAYMENT && paymentMethod != Constants.WALLET_PAYMENT) tmpOrderStatus = Constants.ORDER_PAYMENT_PENDING;
										}

										if(tmpOrderStatus != Constants.ORDER_SCHEDULED && tmpOrderStatus != Constants.ORDER_PAYMENT_PENDING) return asyncEachCallback(null);

										asyncEachCallback(null);
										saveOrderStatusLogs(req,res,next,{
											send_notification_call_center : false,
											order_id 		: 	records['order_id'],
											restaurant_id	:	records['restaurant_id'],
											user_id			:	userId,
											updated_by 		: 	agentId,
											user_role_id	:	(userId) ? Constants.CUSTOMER			:"",
											user_type		:	(userId) ? Constants.USER_TYPE_CUSTOMER	:"",
											is_customer		:	(userId) ? true	: false,
											device_id 		: 	deviceId,
											status 			:	tmpOrderStatus,
											order_status 	:	tmpOrderStatus,
											unique_order_id	:	uniqueOrderId
										}).then(()=>{ });
									},(asyncEachErr)=> {
										callback(asyncEachErr);
									});
								}).catch(next);
							},
						},(asyncChildErr)=>{
							if(asyncChildErr) return next(asyncChildErr);

							asyncParallel({
								update_outstanding_details: (parentCallback)=>{
									if(!userId || !outstandingOrderAmount || outstandingOrderAmount <=0 || userRevertOrders.length <= 0 || !orderPaid){
										return parentCallback(null);
									}

									parentCallback(null);

									/** Get pay outstanding amount **/
									this.payUserOrderOutstanding(req,res,next,{user_id: userId}).then(()=>{}).catch(next);
								},
								running_orders: (parentCallback)=>{
									/** Get customer running order list **/
									req.body.order_ids = allOrderIds;
									this.getCustomerRunningOrderList(req,res,next).then(runningResponse=>{

										let runningOrder = (runningResponse.result) ? runningResponse.result :[];
										parentCallback(null, runningOrder);
									}).catch(next);
								},
							},(_,asyncParallelRes)=>{

								let runningOrder = (asyncParallelRes.running_orders)? asyncParallelRes.running_orders :[];

								/** Calculate order payout */
								orderIdsArray.map(records=>{
									calculateOrderPayout(req,res,next,{order_id: records.order_id }).then(()=>{ });
								});

								/** Update logs details */
								const user_wallet_logs = this.db.collection(Tables.USER_WALLET_LOGS);
								user_wallet_logs.updateMany({order_id:allOrderUniqueId },{$unset:{order_id:1}}).then(()=>{}).catch(next);

								/** Save payment details */
								if(aghzeyaSource){
									if(req.body.source == Constants.SOURCE_CALL_CENTER && (req.body.payment_method == Constants.KNET || req.body.payment_method == Constants.CREDIT_PAYMENT)){
										this.saveUserPaymentDetails(req,res,next,{
											user_id 			: 	userId,
											device_id 			: 	deviceId,
											order_ids 			:	paymentOrderIds,
											cart_ids 			:	paymentCartIds,
											payment_method 		:	paymentMethod,
											payment_status 		:	Constants.PAYMENT_SUCCESS,
											payment_response 	:	paymentResponse,
											currency 			:	paymentCurrency,
											amount 				:	orderPrice
										}).then(()=>{ });
									}
								}else{
									if(paymentMethod != Constants.CASH_PAYMENT && paymentMethod != Constants.WALLET_PAYMENT){
										this.saveUserPaymentDetails(req,res,next,{
											user_id 			: 	userId,
											device_id 			: 	deviceId,
											order_ids 			:	paymentOrderIds,
											cart_ids 			:	paymentCartIds,
											payment_method 		:	paymentMethod,
											payment_status 		:	Constants.PAYMENT_SUCCESS,
											payment_response 	:	paymentResponse,
											currency 			:	paymentCurrency,
											amount 				:	orderPrice
										}).then(()=>{ });
									}
								}

								/** Send pn to guest when order limit exceed  */
								if(firstGuestId && guestTotalOrders >= GUEST_USER_ORDER_LIMIT-1){
									pushNotification(req,res,{
										user_id		:	firstGuestId,
										pn_body		:	Constants.NOTIFICATION_MESSAGES[NOTIFICATION_TO_GUEST_FOR_EXCEEDED_ORDER_LIMIT].message,
										pn_type	 	: 	Constants.NOTIFICATION_TO_GUEST_FOR_EXCEEDED_ORDER_LIMIT
									}).then(()=>{});
								}

								/** Send success response  */
								resolve({status: Constants.STATUS_SUCCESS, message: res.__("order.order_has_been_placed_successfully"), remaining_amount : remainingAmount,order_number: allUniqueOrderIds, running_orders : runningOrder, order_list : orderIdsArray });
							});
						});
					});
				});
			});
        }).catch(next);
	};// end placeOrder()

	/**
	 * Function to pay user order outstanding amount
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	**/
	async payUserOrderOutstanding(req,res,next,options){
		return new Promise(resolve=>{
			let userId	=	(options.user_id)	?	new ObjectId(options.user_id)	:"";

			/** Send error response */
			if(!userId) return resolve({status:Constants.STATUS_ERROR, message:res.__("system.missing_parameters")});

			/** Get user details  */
			const users = this.db.collection(Tables.USERS);
			users.findOne({_id: userId },{projection:{revert_orders:1}}).then((userDetails)=>{

				/** Send error response */
				if(!userDetails) return resolve({status: Constants.STATUS_ERROR, message: res.__("system.invalid_access") });

				/** Send success response */
				if(!userDetails.revert_orders || userDetails.revert_orders.length ==0){
					return resolve({status: Constants.STATUS_SUCCESS });
				}

				let revertOrdersIds = [];
				userDetails.revert_orders.map(data=>{
					revertOrdersIds.push(data.order_id);
				});

				revertOrdersIds = arrayToObject(revertOrdersIds);

				asyncParallel({
					update_order_details:(subChildCallback)=>{
						/** Update order details */
						const orders = this.db.collection(Tables.ORDERS);
						orders.updateMany({
							_id : {$in: revertOrdersIds}
						},
						{
							$set :{
								modified				: getUtcDate(),
								order_revert_paid_on	: getUtcDate(),
								revert_outstanding_paid	: true,
							},
						}).then(()=>{
							subChildCallback(null);
						}).catch(next);
					},
					update_user_details:(subChildCallback)=>{
						/** Update user details */
						users.updateMany({
							_id	: userId,
						},
						{
							$set: {
								modified: getUtcDate(),
							},
							$unset:	{
								revert_orders : 1,
							}
						}).then(()=>{
							subChildCallback(null);
						}).catch(next);
					},
				},(asyncSubChildErr)=>{
					if(asyncSubChildErr) return next(asyncSubChildErr);

					/** Send success response */
					resolve({status: Constants.STATUS_SUCCESS });
				});
			}).catch(next);
		}).catch(next);
	}// end payUserOrderOutstanding()

	/**
	 * Function to update order estimate time
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	**/
	async updateOrderEstimateTime  (req,res,next,options){
		return new Promise(resolve=>{
			let orderId	=	(options.order_id)	?	new ObjectId(options.order_id)	:"";

			/** Send error response **/
			if(!orderId) return resolve({status: Constants.STATUS_ERROR, message: res.__("system.missing_parameters")});

			const orders 		=	this.db.collection(Tables.ORDERS);
			const order_details	= 	this.db.collection(Tables.ORDER_DETAILS);
			asyncParallel({
				order_data: (callback)=>{
					/** Get order details */
					orders.findOne({
						_id: orderId
					},{projection: {_id:1, is_big_order:1, order_date:1, delivery_type:1, is_schedule:1, scheduled_date:1, is_confirm:1}}).then(result=>{
						callback(null, result);
					}).catch(next);
				},
				order_details: (callback)=>{
					/** Get order sub details */
					order_details.findOne({order_id: orderId },{projection: {preparation_time:1, delivery_duration:1}}).then(result=>{
						callback(null, result);
					}).catch(next);
				},
			},(asyncErr,asyncResponse)=>{
				if(asyncErr) return next(asyncErr);

				/** Send error response **/
				if(!asyncResponse.order_data || !asyncResponse.order_details){
					return resolve({status: Constants.STATUS_ERROR, message: res.__("system.something_going_wrong_please_try_again"), asyncResponse: asyncResponse });
				}

				let orderData 			= 	asyncResponse.order_data;
				let orderSubDetails		=	asyncResponse.order_details;
				let isConfirm			=	orderData.is_confirm;
				let tmpOrderDate 		= 	orderData.order_date;
				let tmpDeliveryType 	= 	orderData.delivery_type;
				let isSchedule 			= 	orderData.is_schedule;
				let scheduledDate 		= 	orderData.scheduled_date;
				let preparationTime 	= 	orderSubDetails.preparation_time;
				let deliveryDuration 	= 	orderSubDetails.delivery_duration;
				let tmpDate				=	(isSchedule) ? scheduledDate :tmpOrderDate;
				let tmpOrderFinishedTime= 	deliveryDuration/Constants.MINUTES_IN_A_HOUR;
				let estimateTime 		= 	getUtcDate(addDaysToDate(tmpOrderFinishedTime, tmpDate));

				/** Send success response **/
				if(!isConfirm) return resolve({status: Constants.STATUS_SUCCESS, is_confirm : isConfirm });

				/** Update order  */
				orders.updateOne({
					_id: orderId
				},
				{$set: {
					order_estimate_time : estimateTime
				}}).then(()=>{

					/** Send success response **/
					resolve({status: Constants.STATUS_SUCCESS });
				}).catch(next);
			});
		}).catch(next);
	};// end updateOrderEstimateTime()

	/**
	 * Function to update order type
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	**/
	async updateOrderType (req,res,next,options){
		return new Promise(resolve=>{
			let userId		= 	(options.user_id)		?	new ObjectId(options.user_id)	:"";
			let deviceId	= 	(options.device_id)		?	options.device_id			:"";
			let mainOrderId	= 	(options.main_order_id)	?	options.main_order_id		:"";

			/** Send error response **/
			if(!mainOrderId || (!userId && !deviceId)){
				return resolve({status: Constants.STATUS_ERROR, message: res.__("system.missing_parameters")});
			}

			const orders = this.db.collection(Tables.ORDERS);
			asyncParallel({
				user_order: (callback)=>{
					let orderConditions = {main_order_id: {$ne: mainOrderId} };
					if(userId){
						orderConditions = {...{customer_id: userId}, ...orderConditions};
					}else{
						orderConditions = {...{device_id: deviceId}, ...orderConditions};
					}

					/** get order details **/
					orders.countDocuments(orderConditions).then(countResult=>{
						callback(null,countResult);
					}).catch(next);
				},
				duplicate_order : (callback)=>{
					let odConditions = {main_order_id: mainOrderId };
					if(userId){
						odConditions = {...{customer_id: userId}, ...odConditions};
					}else{
						odConditions = {...{device_id: deviceId}, ...odConditions};
					}

					/** Get order id list **/
					orders.distinct("_id", odConditions).then(orderResult=>{

						/** Get order item id list **/
						const order_items	= this.db.collection(Tables.ORDER_ITEMS);
						order_items.distinct("item_id", {order_id: {$in : orderResult}}).then(itemResult=>{

							/** Set conditions */
							let lastConditions = {
								order_date	:	{$gte:	newDate(subtractMinute(Constants.DUPLICATE_ORDER_MINUTE))},
								_id 		: 	{$nin: 	orderResult},
							};
							if(userId){
								lastConditions.customer_id = userId;
							}else{
								lastConditions.device_id = deviceId;
							}

							/** Last  order ids **/
							orders.distinct("_id", lastConditions).then(lastOrdersIds=>{
								if(lastOrdersIds.length ==0) return callback(null,0);

								/** Check duplicate order */
								order_items.countDocuments({
									$and	 : [
										{order_id : {$nin: 	orderResult} },
										{order_id : {$in: 	lastOrdersIds} },
									],
									item_id	 : 	{$all	: 	itemResult},
									created	 :	{$gte	:	newDate(subtractMinute(Constants.DUPLICATE_ORDER_MINUTE))},
								}).then(countResult=>{
									callback(null,countResult);
								}).catch(next);
							}).catch(next);
						}).catch(next);
					}).catch(next);
				},
				is_user_vip : (callback)=>{
					if(!userId) return callback(null,false);

					/** Check user is vip or not **/
					const users = this.db.collection(Tables.USERS);
					users.findOne({_id: userId},{projection: {client_type:1}}).then(userResult=>{
						let isVip = (userResult && userResult.client_type == Constants.USER_CLIENT_TYPE_VIP) ? true : false;

						callback(null,isVip);
					}).catch(next);
				},
			},(asyncErr,asyncResponse)=>{
				if(asyncErr) return next(asyncErr);

				let firstOrder 		= (asyncResponse.user_order ==0) 		? true :false;
				let duplicateOrder 	= (asyncResponse.duplicate_order >0) 	? true :false;
				let isUserVip 		= (asyncResponse.is_user_vip) 			? true :false;
				let isConfirm 		= !(firstOrder || duplicateOrder);
				let callCenterNotification	=	(firstOrder || duplicateOrder) ? true : false;

				asyncParallel({
					update_order_details: (childCallback)=>{
						/** Set conditions */
						let updConditions = {main_order_id: mainOrderId };
						if(userId){
							updConditions = {...{customer_id: userId}, ...updConditions};
						}else{
							updConditions = {...{device_id: deviceId}, ...updConditions};
						}

						/** Update order details */
						orders.updateMany(updConditions,
						{$set: {
							is_first_order 		: firstOrder,
							is_duplicate_order 	: duplicateOrder,
							is_vip				: isUserVip,
							modified 			: getUtcDate(),
						}}).then(()=>{
							childCallback(null);
						}).catch(next);
					},
				},(asyncChildErr)=>{
					if(asyncChildErr) return next(asyncChildErr);

					/** Send success response */
					resolve({
						status				: 	Constants.STATUS_SUCCESS,
						is_not_confirm		: 	(!isConfirm) ? true :false,
						send_notification 	:	callCenterNotification
					});
				});
			});
		}).catch(next);
	};// end updateOrderType()

	/**
	 * Function to place modifier order
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	**/
	async placeModifierOrder  (req,res,next){
		return new Promise(resolve=>{
			/** Sanitize Data **/
			req.body 		=	sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
            let orderId		= 	(req.body.order_id)			?	new ObjectId(req.body.order_id)		:"";
            let userId		= 	(req.body.customer_id)		?	new ObjectId(req.body.customer_id)	:"";
            let modifiedBy	= 	(req.body.modified_by)		?	new ObjectId(req.body.modified_by)	:"";
            let deviceId	= 	(req.body.device_id)		?	req.body.device_id				:"";
            let mainDeviceId= 	(req.body.main_device_id)	?	req.body.main_device_id			:"";
            let isAdmin 	= 	(req.body.is_admin)			?	req.body.is_admin				:false;
            let isAdminModifier= (req.body.is_admin_modifier)?	req.body.is_admin_modifier		:false;

			/** Send error response **/
			if((!userId && !mainDeviceId) || !deviceId || !orderId || !modifiedBy){
				return resolve({status: Constants.STATUS_ERROR, message:res.__("system.missing_parameters")});
			}

			const orders  		= 	this.db.collection(Tables.ORDERS);
			const order_details = 	this.db.collection(Tables.ORDER_DETAILS);
			const order_items  	=	this.db.collection(Tables.ORDER_ITEMS);
			const offer_logs  	= 	this.db.collection(Tables.OFFER_LOGS);
			asyncParallel({
				order_details: (parentCallback)=>{
					/** Get order details */
					orders.findOne({_id: orderId }).then(orderResult=>{
						parentCallback(null, orderResult);
					}).catch(next);
				},
				cart_list: (parentCallback)=>{
					/** Get cart list */
					let cartOptions 					= 	clone(req.body);
					cartOptions.is_place_order 			= 	true;
					cartOptions.is_place_modified_order =	true;
					this.cartAPI.getUserCartList(req,res,next,cartOptions).then(response=>{
						parentCallback(null,response);
					}).catch(next);
				},
				offer_log_details: (parentCallback)=>{
					/** Get offer logs details */
					offer_logs.findOne({order_id: orderId },{projection: {order_discount:1,offer_id:1}}).then(logResult=>{
						parentCallback(null, logResult);
					}).catch(next);
				},
				get_modify_log_details: (parentCallback)=>{
					/** Get order modify logs details */
					const order_modify_logs = 	this.db.collection(Tables.ORDER_MODIFY_LOGS);
					order_modify_logs.findOne({order_id: orderId },{projection: {_id:1,version:1}}).then(logResult=>{
						parentCallback(null, logResult);
					}).catch(next);
				},
				item_list: (parentCallback)=>{
					/** Get order modify logs details */
					const order_items  	=	this.db.collection(Tables.ORDER_ITEMS);
					order_items.find({order_id: orderId},{projection:{_id:0,add_by_admin:0,last_qty:0}}).toArray().then(orderResult=>{
						parentCallback(null, orderResult);
					}).catch(next);
				},
			},(parentErr,parentResponse)=>{
				if(parentErr) return next(parentErr);

				/** Send error response */
				if(parentResponse.cart_list.status != Constants.STATUS_SUCCESS) return resolve(parentResponse.cart_list);

				let oldItemList  	=	parentResponse.item_list;
				let cartList  		=	parentResponse.cart_list.result;
				let grandTotal 		=	parentResponse.cart_list.grand_total;
				let orderDetails	=	parentResponse.order_details;
				let offerlogDetails	=	parentResponse.offer_log_details;
				let orderModifyLog	=	parentResponse.get_modify_log_details;
				let isLogExists		=	(orderModifyLog) ? true :false;

				/** Send error response **/
				if(cartList.length <=0 || !orderDetails){
					return resolve({status: Constants.STATUS_ERROR, message: res.__("system.something_going_wrong_please_try_again") });
				}

				/** Create object with qty */
				let itemQtyObj = {};
				if(oldItemList && oldItemList.length){
					oldItemList.map(record=>{
						if(record.qty && record.cart_id) itemQtyObj[record.cart_id] = record.qty;
					});
				}

				/** Check all branch or item available or not */
				let cartDetails	 		=	cartList[0];
				let branchAvailable 	= 	true;
				let itemAvailable		=	true;
				let orderNetAmount		=	0;

				if(!cartDetails.branch_available)  	branchAvailable = false;
				if(cartDetails.branch_open != Constants.OPEN) branchAvailable = false;
				cartDetails.item_list.map(itemData=>{
					if(!itemData.item_available)  itemAvailable = false;
					orderNetAmount += itemData.sub_price;
				});

				/** Send error response **/
				if(!branchAvailable || !itemAvailable){
					let message = (!branchAvailable) ? res.__("order.branch_not_available") : res.__("order.item_not_available");
					return resolve({status: Constants.STATUS_ERROR, message: message });
				}

				const offer_used    = 	this.db.collection(Tables.OFFER_USED);
				const tmp_offer_logs= 	this.db.collection(Tables.TMP_OFFER_LOGS);
				const user_carts 	= 	this.db.collection(Tables.USER_CARTS);
				const restaurants 	= 	this.db.collection(Tables.RESTAURANTS);

				let paidAmount	 	=	orderDetails.paid_amount;
				let mainOrderId	 	=	orderDetails.main_order_id;
				let oldOrderPrice	=	orderDetails.order_price;
				let finalOrderPrice	=	(paidAmount)  ? paidAmount :oldOrderPrice;
				let restaurantId 	= 	cartDetails.restaurant_id;
				let itemList 	 	=	cartDetails.item_list;
				let tmpOfferId  	= 	cartDetails.offer_id;
				let orderCustomerId = 	orderDetails.customer_id;
				let preOrderStatus 	= 	orderDetails.order_status;
				let uniqueOrderId 	= 	orderDetails.unique_order_id;
				let aghzeyaSource 	= 	orderDetails.source;
				let paymentMethod 	= 	orderDetails.payment_method;
				let orderPlacedBy 	= 	orderDetails.placed_by;
				let currentDiscount = 	(cartDetails.discount) ? cartDetails.discount :0;
				let lastOfferId 	=   "";
				let lastOfferAmount =   0;
				let lastOfferlogId 	=   "";
				let bothOfferSame   =	false;

				if(offerlogDetails){
					lastOfferlogId 	= (offerlogDetails._id) 			? offerlogDetails._id 	:"";
					lastOfferId 	= (offerlogDetails.offer_id) 		? offerlogDetails.offer_id :"";
					lastOfferAmount = (offerlogDetails.order_discount) 	? offerlogDetails.order_discount :0;
					bothOfferSame	= (String(lastOfferId) == tmpOfferId) ? true :false;
				}

				asyncParallel({
					save_modify_details: (childCallback)=>{
						if(isLogExists) return childCallback(null);

						/** Save order details */
						this.saveOrderDetails(req,res,next,{order_id: orderId, modified_by: orderPlacedBy }).then(response=>{
							if(response.status != Constants.STATUS_SUCCESS) return childCallback(response.message);
							childCallback(null);
						}).catch(next);
					},
					restaurant_concept_id: (childCallback)=>{
						/** Set conditions */
						let restConditions = {
							_id			:	new ObjectId(restaurantId),
							concept_id	:	{$exists : true, $ne: ""}
						};

						/** Get restaurant details */
						restaurants.findOne(restConditions,{projection: {concept_id:1}}).then(restResult=>{
							let conceptId = (restResult && restResult.concept_id) ? restResult.concept_id :null;
							childCallback(null, conceptId);
						}).catch(next);
					},
				},(childParallelErr,childParallelResponse)=>{
					if(childParallelErr) return next(childParallelErr);

					let restConceptId	= childParallelResponse.restaurant_concept_id;
					asyncParallel({
						delete_old_item: (parentCallback)=>{
							/** Delete order old items */
							order_items.deleteMany({order_id: orderId }).then(()=>{
								parentCallback(null);
							}).catch(next);
						},
						save_offer_logs: (parentCallback)=>{
							/** This use only when offer is different */
							if(!offerlogDetails|| !tmpOfferId || bothOfferSame){
								return parentCallback(null);
							}

							/** Set offer used conditions */
							let offerUsedConditions = {
								offer_id : 	new ObjectId(lastOfferId),
							};

							if(userId){
								offerUsedConditions.user_id 	= 	userId;
							}else{
								offerUsedConditions.device_id	=	mainDeviceId;
							}

							/** Update offer used */
							offer_used.updateOne(offerUsedConditions,{
								$set :{
									modified: 	getUtcDate()
								},
								$inc :{
									offer_used 			: -1,
									total_amount_used 	: lastOfferAmount*-1,
								},
								$pull :{
									offer_log_ids : lastOfferlogId,
								},
							}).then(()=>{

								/** Delete logs */
								offer_logs.deleteOne({_id: lastOfferlogId }).then(()=>{
									parentCallback(null);
								}).catch(next);
							}).catch(next);
						},
						update_offer_value: (parentCallback)=>{
							if(!offerlogDetails|| !tmpOfferId || !bothOfferSame || lastOfferAmount == currentDiscount){
								return parentCallback(null);
							}

							/** This use only when offer same but discount different */
							let adjustDiscount =  currentDiscount-lastOfferAmount;

							offer_logs.updateOne({
								_id : new ObjectId(lastOfferlogId)
							},
							{$set :{
								order_price	   : round(orderNetAmount),
								order_discount : currentDiscount,
								modified	   : getUtcDate()
							}}).then(()=>{

								/** Update offer used */
								offer_used.updateOne({
									offer_log_ids : {$in: [new ObjectId(lastOfferlogId)]}
								},
								{$inc :{
									total_amount_used : adjustDiscount,
								}}).then(()=>{
									parentCallback(null);
								}).catch(next);
							}).catch(next);
						},
					},(parentParallelErr)=>{
						if(parentParallelErr) return next(parentParallelErr);

						/** Set order save details  */
						let orderSaveData = {
							order_price		:	grandTotal,
							net_amount		:	round(orderNetAmount),
							// is_confirm		:	false,
							is_modified		:	true,
							modified_by		:	modifiedBy,
							queue_time		:	getUtcDate(),
							number_of_queue : 	Constants.FIRST_REQUEUE_ORDER,
							is_big_order	:	(orderNetAmount >= Constants.BIG_ORDER_AMOUNT) ? true :false,
							modified		:	getUtcDate(),
						};

						if(!paidAmount && preOrderStatus != Constants.ORDER_PAYMENT_PENDING) orderSaveData.paid_amount = oldOrderPrice;

						/** Update order status when admin modify order */
						let isChangedStatus = false;
						if(grandTotal  > finalOrderPrice && paymentMethod != Constants.CASH_PAYMENT){
							if(aghzeyaSource){
								if(aghzeyaSource == Constants.SOURCE_CALL_CENTER && (paymentMethod == Constants.KNET || paymentMethod == Constants.CREDIT_PAYMENT || paymentMethod == Constants.WALLET_PAYMENT)){
									isChangedStatus				=	true;
									preOrderStatus				= 	Constants.ORDER_PAYMENT_PENDING;
									orderSaveData.order_status	= 	Constants.ORDER_PAYMENT_PENDING;
								}
							}else{
								if(isAdminModifier && paymentMethod != Constants.CASH_PAYMENT){
									isChangedStatus				=	true;
									preOrderStatus 				= 	Constants.ORDER_PAYMENT_PENDING;
									orderSaveData.order_status 	=	Constants.ORDER_PAYMENT_PENDING;
								}
							}
						}

						/** Save order details */
						orders.updateOne({_id: orderId },{$set: orderSaveData}).then(()=>{

							asyncParallel({
								order_details : (callback)=>{
									let deliveryTime 	= 	(cartDetails.delivery_time) 	? cartDetails.delivery_time :Constants.DEFAULT_DELIVERY_TIME;
									let preparationTime = 	(cartDetails.preparation_time) 	? cartDetails.preparation_time :Constants.DEFAULT_PREPARATION_TIME;


									/** Set order details  */
									let orderDetailsData = {
										total_amount	: 	grandTotal,
										net_amount		: 	round(orderNetAmount),
										discount_price	:	(cartDetails.discount) 		?	cartDetails.discount	:0,
										offer_id	: 	cartDetails.offer_id,
										offer_code	: (cartDetails.offer_code)?cartDetails.offer_code :"",
										offer_type	: (cartDetails.offer_type)?cartDetails.offer_type :"",
										delivery_fee:(cartDetails.delivery_fees)?cartDetails.delivery_fees :0,
										additional_tax	 : 	cartDetails.additional_tax,
										delivery_duration: 	deliveryTime,
										elapsed_time	 : 	deliveryTime,
										preparation_time : 	preparationTime,
										remaining_preparation_time	: 	preparationTime,
										remaining_delivery_duration	: 	deliveryTime,
									};

									if(cartDetails.additional_tax_percentage){
										orderDetailsData.additional_tax_percentage = cartDetails.additional_tax_percentage;
									}

									if(cartDetails.offer_discount){
										orderDetailsData.offer_discount =	cartDetails.offer_discount;
									}
									if(cartDetails.offer_delivery_fees){
										orderDetailsData.offer_delivery_fees =	cartDetails.offer_delivery_fees;
									}

									if(cartDetails.corporate_id){
										orderDetailsData.corporate_id =	new ObjectId(cartDetails.corporate_id);

										if(cartDetails.corporate_discount){
											orderDetailsData.corporate_discount =	cartDetails.corporate_discount;
										}
										if(cartDetails.corporate_delivery_fees){
											orderDetailsData.corporate_delivery_fees =	cartDetails.corporate_delivery_fees;
										}
									}

									/** Save order details */
									order_details.updateOne({order_id: orderId },{$set: orderDetailsData}).then(()=>{
										callback(null);
									}).catch(next);
								},
								order_items : (callback)=>{

									/** Manage item save data */
									let itemSaveData 	= [];
									let modifierItemData= [];
									itemList.map(itemData=>{
										let itemDiscount =	(itemData.discount) ? itemData.discount:0;
										let subPrice 	 =	(itemData.sub_price) ? itemData.sub_price:0;
										let isModified 	 =	(itemData.is_modified) ? itemData.is_modified:false;
										let tmpItemId 	 =	itemData.item_id;
										let cartId 	 	 =	itemData.cart_id ? itemData.cart_id :itemData._id;
										let tmpQty 	 	 =	itemData.qty;

										let tempObj = {
											order_id 		: 	orderId,
											order_date 		: 	orderDetails.order_date,
											parent_item_id 	: 	itemData.parent_item_id,
											qty 			: 	tmpQty,
											item_name 		: 	itemData.item_name,
											item_image 		:	itemData.item_image,
											item_id 		: 	tmpItemId,
											unit_id 		: 	itemData.unit_id,
											dough_id 		: 	itemData.dough_id,
											selector_id 	: 	itemData.selector_id,
											item_type 		:	itemData.item_type,
											note 			:	itemData.note,
											item_main_price :	itemData.item_main_price,
											cuisine_ids		: 	(itemData.cuisine_ids) ? itemData.cuisine_ids :[],
											is_modified 	:	isModified,
											extra_items 	:	[],
											price			:	itemData.item_price,
											total_extra_item_price:	itemData.total_extra_item_price ? itemData.total_extra_item_price :0,
											sub_total		:	round(subPrice-itemDiscount),
											discounted_price:	itemDiscount,
											net_amount		:	subPrice,
											cart_id			:	cartId,
											cart_created	:	itemData.created,
											add_by_admin	:	itemData.add_by_admin,
											last_qty		:	itemData.last_qty,
											created 		:	getUtcDate(),
										};

										if(itemQtyObj && itemQtyObj[cartId]){
											if(tmpQty > itemQtyObj[cartId]){
												tempObj.new_qty = tmpQty-itemQtyObj[cartId];
											}
										}else{
											tempObj.new_qty = tmpQty;
										}

										if(itemData.item_unit_id){
											tempObj.item_unit_id =itemData.item_unit_id;
										}

										if(itemData.unit_lists && itemData.unit_lists.length >0){
											tempObj.unit_lists = itemData.unit_lists;
										}

										/** Manage extra items  */
										if(itemData.extra_items && itemData.extra_items.length >0){
											itemData.extra_items.map(extraItemData=>{
												let groupId = extraItemData.group_id;

												extraItemData.extra_item_ids.map(exItemData=>{

													tempObj.extra_items.push({
														group_id			:	groupId,
														extra_item_id		:	exItemData.extra_item_id,
														extra_item_group_id	:	exItemData.extra_group_item_id,
														extra_item_name		:	exItemData.extra_item_name,
														price				:	exItemData.extra_fees || 0,
														qty					:	exItemData.qty > 0 && parseInt(exItemData.qty) || 1
													});
												});
											});
										}

										itemSaveData.push(tempObj);

										let modifierTmpObj 		=	clone(tempObj);
										modifierTmpObj.is_new	=	true;
										modifierItemData.push(modifierTmpObj);
									});

									/** Save order item details */
									order_items.insertMany(itemSaveData).then(()=>{
										callback(null);
									}).catch(next);
								},
								remove_offer_logs : (callback)=>{
									let cartIds = [];
									itemList.map(itemData=>{
										cartIds.push(itemData._id);
									});

									asyncParallel({
										remove_offer_logs : (subCallback)=>{
											/** Delete logs  */
											tmp_offer_logs.deleteMany({
												cart_ids : {$in: cartIds}
											}).then(()=>{
												subCallback(null);
											}).catch(next);
										},
										update_order_id : (subCallback)=>{
											/** update logs  */
											offer_logs.updateMany({
												cart_ids : {$in: cartIds}
											},
											{
												$set: {
													order_id : orderId,
													modified : getUtcDate(),
												},
												$unset: {
													cart_ids : 1
												},
											}).then(()=>{
												subCallback(null);
											}).catch(next);
										},
										remove_cart : (subCallback)=>{
											/** Remove carts  */
											user_carts.deleteMany({_id: {$in: cartIds} }).then(()=>{
												subCallback(null);
											}).catch(next);
										},
									},(subParallelErr)=>{
										callback(subParallelErr);
									});
								}
							},(asyncParallelErr)=>{
								if(asyncParallelErr) return next(asyncParallelErr);

								/** Save order type */
								this.saveOrderDetails(req,res,next,{order_id: orderId, old_item_list: oldItemList, modified_by: modifiedBy}).then(response=>{
									if(response.status != Constants.STATUS_SUCCESS) return next(response.message);

									/** Send success response  */
									resolve({status: Constants.STATUS_SUCCESS, message: res.__("order.order_has_been_placed_successfully"), grand_total: grandTotal , order_status: preOrderStatus});

									/** Calculate order payout */
									calculateOrderPayout(req,res,next,{order_id:orderId}).then(()=>{});

									if(isChangedStatus){
										saveOrderStatusLogs(req,res,next,{
											order_id 		: 	orderId,
											restaurant_id	:	restaurantId,
											updated_by 		: 	modifiedBy,
											user_id 		: 	userId,
											user_role_id	:	(userId) ? CUSTOMER				:"",
											user_type		:	(userId) ? Constants.USER_TYPE_CUSTOMER	:"",
											is_customer		:	(userId) ? true	:false,
											device_id 		: 	mainDeviceId,
											status 			:	preOrderStatus,
											order_status 	:	preOrderStatus,
											is_modified     :   true,
											is_admin		:   isAdmin,
											unique_order_id	:	uniqueOrderId
										}).then(()=>{});
									}
								}).catch(next);
							});
						}).catch(next);
					});
				});
			});
        }).catch(next);
	};// end placeModifierOrder()

	/**
	 * Function to place modifier order
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	**/
	async saveOrderDetails  (req,res,next,options){
		return new Promise(resolve=>{
			let orderId 	=	(options.order_id) 		? 	options.order_id 		:"";
			let oldItemList	= 	(options.old_item_list) ?	options.old_item_list 	:[];
			let modifiedBy	= 	(options.modified_by) 	?	options.modified_by 	:"";

			/** Send error response */
			if(!orderId){
				return resolve({status: Constants.STATUS_ERROR, message:res.__("system.missing_parameters")});
			}

			const order_modify_logs  = 	this.db.collection(Tables.ORDER_MODIFY_LOGS);
			asyncParallel({
				order_details: (callback)=>{
					/** Get order details */
					const orders  		= 	this.db.collection(Tables.ORDERS);
					orders.findOne({_id: orderId },{projection: {_id:0}}).then(orderResult=>{
						callback(null, orderResult);
					}).catch(next);
				},
				order_sub_details: (callback)=>{
					/** Get order details */
					const order_details = 	this.db.collection(Tables.ORDER_DETAILS);
					order_details.findOne({order_id: orderId },{projection: {_id:0}}).then(orderResult=>{
						callback(null, orderResult);
					}).catch(next);
				},
				order_item_list: (callback)=>{
					/** Get order item list */
					const order_items  	=	this.db.collection(Tables.ORDER_ITEMS);
					order_items.find({order_id: orderId},{projection:{_id:0}}).toArray().then(orderResult=>{
						callback(null, orderResult);
					}).catch(next);
				},
				order_modify_log: (callback)=>{
					/** Get order item list */
					order_modify_logs.find({order_id: orderId},{projection:{version:1}}).sort({created : Constants.SORT_DESC}).limit(1).toArray().then(orderModifyResult=>{
						callback(null, orderModifyResult?.[0]|| {});
					}).catch(next);
				},
			},(parentErr,parentResponse)=>{
				if(parentErr) return next(parentErr);

				let orderItemList	=	parentResponse.order_item_list;
				let orderDetails	=	parentResponse.order_details;
				let orderSubDetails	=	parentResponse.order_sub_details;
				let orderModifyLog	=	parentResponse.order_modify_log;
				let version			=	(orderModifyLog && orderModifyLog.version) ? orderModifyLog.version : 0;

				/** Send error response **/
				if(!orderDetails || !orderSubDetails || !orderItemList || orderItemList.length <=0){
					return resolve({status: Constants.STATUS_ERROR, message: res.__("system.something_going_wrong_please_try_again") });
				}

				/** Set logs details */
				let orderAllDetails 				=   Object.assign(orderDetails,orderSubDetails);
				orderAllDetails.version 			=   version + 1;
				orderAllDetails.created 			=   getUtcDate();
				orderAllDetails.modified 			=   getUtcDate();
				orderAllDetails.modified_by_user_id =   modifiedBy;

				/** Save order modify logs */
				order_modify_logs.insertOne(orderAllDetails).then(result=>{

					let logId = (result && result.insertedId) ? result.insertedId :"";

					let logItems =[];
					orderItemList.map(records=>{

						if(oldItemList && oldItemList.length >0){
							let isOld = false;
							oldItemList.map(oldData=>{
								if(String(oldData.item_id) == String(records.item_id)) isOld = true;
							});

							records.is_new = (!isOld) ? true :false;
						}

						if(records.add_by_admin) records.is_new = true;
						if(records.last_qty && records.qty != records.last_qty) records.is_new = true;

						let tmpObj = clone(records);
						tmpObj.modify_log_id = logId;
						logItems.push(tmpObj);
					});

					const orders	=	this.db.collection(Tables.ORDERS);
					orders.updateOne({_id: orderId },{$set : { last_modified_order_id : new ObjectId(logId)}}).then(()=>{

						/** Save order modify item logs */
						const order_modify_item_logs  = this.db.collection(Tables.ORDER_MODIFY_ITEM_LOGS);
						order_modify_item_logs.insertMany(logItems).then(()=>{

							/** Send success response */
							return resolve({status: Constants.STATUS_SUCCESS });
						}).catch(next);
					}).catch(next);
				}).catch(next);
			});
		}).catch(next);
	}// end saveOrderDetails()

	/**
	 * Function to save payment transaction details
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	**/
	async savePaymentTransactionDetails (req,res,next){
		return new Promise(resolve=>{
			/** Sanitize Data **/
			req.body =	sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);

			/** Save payment details */
			this.saveUserPaymentDetails(req,res,next,req.body).then(response=>{
				if(response.status != Constants.STATUS_SUCCESS) return resolve(response);

				resolve({status: Constants.STATUS_SUCCESS});
			}).catch(next);
        }).catch(next);
	};// end savePaymentTransactionDetails()

	/**
	 * Function to save user payment details
	 *
	 * @param req		As Request Data
	 * @param res		As Response Data
	 * @param next		As Callback argument to the middleware function
	 * @param options	As object data
	 *
	 * @return json
	**/
	async saveUserPaymentDetails  (req,res,next,options){
		return new Promise(resolve=>{
			let userId			= 	(options.user_id)			?	new ObjectId(options.user_id)	:"";
			let deviceId		= 	(req?.body?.device_id)		?	req.body.device_id			:"";
			let orderIds		= 	(options.order_ids)			?	options.order_ids			:"";
            let paymentMethod	= 	(options.payment_method)	?	options.payment_method		:"";
            let paymentStatus	= 	(options.payment_status)	?	options.payment_status		:"";
            let paymentResponse	= 	(options.payment_response)	?	options.payment_response	:"";
            let paymentCurrency	= 	(options.currency)			?	options.currency			:"";
            let paymentAmount	= 	(options.amount)			?	parseFloat(options.amount)	:"";
            let paymentEvent	= 	(options.payment_event)		? 	options.payment_event		:Constants.ORDER_PAYMENT;
            let tmpTransactionId= 	(options.transaction_id)	? 	options.transaction_id		:"";
            let gatewayType		= 	(options.gateway_type)		? 	options.gateway_type		:Constants.MYFATOORAH_PAYMENT_GATEWAY;
            let notSaveStatus	= 	(options.not_save_status)	? 	options.not_save_status		:false;

			/** Send error response **/
			if((!userId && !deviceId) || !paymentMethod || !paymentStatus || !paymentResponse || !paymentCurrency || !paymentAmount){
				let missingObj = {};
				if(!userId && !deviceId)	missingObj.user_device_id 	= true;
				if(!paymentMethod) 			missingObj.payment_method 	= true;
				if(!paymentStatus) 			missingObj.payment_status 	= true;
				if(!paymentResponse) 		missingObj.payment_response = true;
				if(!paymentCurrency) 		missingObj.currency 		= true;
				if(!paymentAmount) 			missingObj.amount 			= true;

				return resolve({status: Constants.STATUS_ERROR, message:res.__("system.missing_parameters"), missing_object : missingObj});
			}

			asyncParallel({
				unqiue_id : (callback)=>{
					/** Get unqiue invoice number **/
					getUniqueId(req,res,next,{type:"payment_transactions"}).then(uniqueIdResponse=>{
						let unqiueId = (uniqueIdResponse.result) ? uniqueIdResponse.result :"";
						callback(null,unqiueId);
					}).catch(next);
				},
				cart_ids : (callback)=>{
					if(paymentEvent != Constants.ORDER_PAYMENT || orderIds) return  callback(null,[]);

					/** Set cart conditions */
					let cartConditions = {};
					if(userId){
						cartConditions.customer_id  = userId;
					}else{
						cartConditions.device_id 	= deviceId;
					}

					const user_carts = 	this.db.collection(Tables.USER_CARTS);
					user_carts.distinct( "_id", cartConditions).then(cartResult=>{
						callback(null,cartResult);
					}).catch(next);
				}
			},(asyncErr, asyncResponse)=>{
				if(asyncErr) return next(asyncErr);

				let invoiceNumber 	= 	asyncResponse.unqiue_id;
				let cartIds 		=	asyncResponse.cart_ids;
				if(orderIds) orderIds	= arrayToObject(orderIds);

				const payment_transactions = this.db.collection(Tables.PAYMENT_TRANSACTIONS);
				asyncParallel({
					save_payment_details: (callback)=>{
						let transactionId = (paymentResponse.InvoiceTransactions && paymentResponse.InvoiceTransactions[0]) ? paymentResponse.InvoiceTransactions[0].TransactionId :tmpTransactionId;

						/** Set save data */
						let paymentSaveData = {
							amount  		: paymentAmount,
							currency  		: paymentCurrency,
							payment_method  : paymentMethod,
							payment_status  : paymentStatus,
							payment_event  	: paymentEvent,
							invoice_number  : invoiceNumber,
							transaction_id  : transactionId,
							gateway_type  	: gatewayType,
							payment_response: JSON.stringify(paymentResponse),
							created  		: getUtcDate(),
							modified  		: getUtcDate(),
						};

						if(orderIds && orderIds.length >0){
							paymentSaveData.order_ids  	=  orderIds;
						}else if(cartIds && cartIds.length >0){
							paymentSaveData.cart_ids	=  cartIds;
						}

						if(userId){
							paymentSaveData.user_id   =  userId;
						}else{
							paymentSaveData.device_id = deviceId;
						}

						/** Save payment details */
						payment_transactions.insertOne(paymentSaveData).then(result=>{

							let paymentId = (result && result.insertedId) ? result.insertedId :"";

							asyncParallel({
								update_order_details: (childCallback)=>{
									if(orderIds.length <=0) return  childCallback(null,null);

									/** Update order details */
									const order_details = this.db.collection(Tables.ORDER_DETAILS);
									order_details.updateMany({
										order_id: {$in: orderIds}
									},
									{$set:{
										payment_id	: 	paymentId,
										modified	:	getUtcDate(),
									}}).then(()=>{
										childCallback(null);
									}).catch(next);
								},
								order_data: (childCallback)=>{
									if(orderIds.length <=0) return  childCallback(null,null);

									/** Set order update data */
									let orderUpdateData = {
										$set : {
											payment_received: 	(paymentStatus == Constants.STATUS_SUCCESS) ? true : false,
											payment_id		: 	paymentId,
											payment_gateway_type: gatewayType,
											modified		:	getUtcDate(),
										}
									};

									if(!notSaveStatus){
										orderUpdateData["$set"].order_status = (paymentStatus == Constants.STATUS_SUCCESS) ? Constants.ORDER_SUBMITTED : ORDER_PAYMENT_FAILED;
									}

									/** Unset order unpaid amount when payment success */
									if(paymentStatus == Constants.STATUS_SUCCESS){
										orderUpdateData["$unset"] = {order_unpaid_amount: 1, payment_link_expire_time: 1};
									}

									/** Update order details */
									const orders = this.db.collection(Tables.ORDERS);
									orders.updateMany({_id: {$in: orderIds} },orderUpdateData).then(()=>{
										childCallback(null);
									}).catch(next);
								}
							},(asyncErr)=>{
								callback(asyncErr,paymentId);
							});
						}).catch(next);
					},
					update_payment_details: (callback)=>{
						if(orderIds.length <=0 || cartIds.length <=0) return  callback(null,null);

						/** Update payment details */
						payment_transactions.updateMany({
							cart_ids: {$in: cartIds}
						},
						{
							$set:{
								order_ids	: 	orderIds,
								modified	:	getUtcDate(),
							},
							$unset:{
								cart_ids : 1
							}
						}).then(()=>{
							callback(null);
						}).catch(next);
					}
				},(asyncErr,asyncResponse)=>{
					if(asyncErr) return next(asyncErr);

					/** Send success response */
					resolve({
						status			:	Constants.STATUS_SUCCESS,
						invoice_number	:	invoiceNumber,
						payment_id		:	asyncResponse.save_payment_details
					});
				});
			});
        }).catch(next);
	};// end saveUserPaymentDetails()

	/**
	 * Function to get order details
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	 **/
	async getOrderDetails  (req,res,next){
		return new Promise(resolve=>{
			/** Sanitize Data **/
			req.body 		 = sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
            let orderId		 = (req.body.order_id)  	 ? new ObjectId(req.body.order_id) 		:"";
			let userId		 = (req.body.user_id)   	 ? new ObjectId(req.body.user_id)  		:"";
            let userType	 = (req.body.user_type) 	 ? req.body.user_type   		 	:"";
			let deviceId	 = (req.body.device_id) 	 ? req.body.device_id   		 	:"";
			let restaurantId = (req.body.restaurant_id)  ? new ObjectId(req.body.restaurant_id) :"";
			let branchId	 = (req.body.branch_id)   	 ? new ObjectId(req.body.branch_id)  	:"";
			let languageId	 = (req.body.language_id)	 ? req.body.language_id				:Constants.DEFAULT_LANGUAGE_MONGO_ID;
			let languageCode = (languageId == Constants.ARABIC_LANGUAGE_MONGO_ID)? 	Constants.ARABIC_LANGUAGE_CODE	:Constants.ENGLISH_LANGUAGE_CODE;

			/** Send error response **/
			if(!orderId || !userType || (userType == Constants.USER_TYPE_CUSTOMER && (!userId && !deviceId)) || (userType != Constants.USER_TYPE_CUSTOMER && userType != Constants.USER_TYPE_DRIVER && userType != Constants.USER_TYPE_RESTAURANT) ||(userType == Constants.USER_TYPE_DRIVER && !userId) || (userType == Constants.USER_TYPE_RESTAURANT && !restaurantId)){
				return resolve({status : Constants.STATUS_ERROR, message : res.__("system.missing_parameters")});
			}

			/** Set common conditions for orders **/
			let commonConditions = { _id : orderId};

			if(userType == Constants.USER_TYPE_DRIVER){
				commonConditions.captain_id = userId;
			}else if(userType == Constants.USER_TYPE_RESTAURANT){
				commonConditions.restaurant_id = restaurantId;
				commonConditions.is_confirm	   = true;

				if(branchId) commonConditions.branch_id = branchId;
			}else{
				if(userId){
					commonConditions.customer_id = userId;
				}else{
					commonConditions.device_id = deviceId;
				}
			}

			asyncParallel({
                orders_details : (callback)=>{
                    /** Get orders  */
                    const orders = this.db.collection(Tables.ORDERS);
					orders.findOne(commonConditions,{projection:{area_id:1,area_name:1,branch_id:1,captain_id:1,created:1,delivery_fee:1,delivery_type:1,net_amount:1,order_price:1,order_status:1,payment_method:1,request_note:1,restaurant_id:1,restaurant_name:1,scheduled_time:1,unique_order_id:1,delivery_status:1,customer_status:1,customer_id:1,captain_name:1, captain_number:1,picked_from:1,pickup_captain_id:1,pickup_lat:1,pickup_long:1,problem_type:1,problem_subtype:1, rejection_reason:1, outstanding_amount: 1,outstanding_payment: 1, refund_amount: 1,refund_amount_status: 1, refund_type:1,amount_debited_by_wallet:1,is_infinity_user:1,package_id:1,package_delivery_fees:1, order_date:1, delay_voc_status: 1,source : 1,source_payment:1,source_payment_name:1,aghzeya_bill_no:1}}).then(result=>{
                        callback(null,result);
                    }).catch(next);
                },
				order_sub_details : (callback)=>{
                    /** Get order sub details */
                    const order_details	= this.db.collection(Tables.ORDER_DETAILS);
					order_details.findOne({ order_id : orderId},{projection:{_id:0,delivery_area_id:1,customer_latitude:1,customer_longitude:1,restaurant_address:1,restaurant_latitude:1,restaurant_longitude:1,offer_code:1,delivery_fee:1,delivery_duration:1,preparation_time:1,remaining_preparation_time:1,remaining_delivery_duration:1,discount_price:1,customer_address_id:1,additional_tax:1,branch_extra_charge:1,customer_address_detail:1}}).then(orderDetailsResult=>{
                        callback(null,orderDetailsResult);
                    }).catch(next);
                },
                order_item_list : (callback)=>{
					/** Get order item list */
                    const order_items	= this.db.collection(Tables.ORDER_ITEMS);
                    order_items.aggregate([
						{$match:  {order_id : orderId}},
						{$lookup: {
							from		: Tables.ITEMS,
							localField	: "item_id",
							foreignField: "_id",
							as			: "item_details",
						}},
						{$project: {
							_id:1,qty:1,item_name:1,item_id:1,unit_id:1,dough_id:1,item_type:1,extra_items:1, price:1,sub_total:1,discounted_price:1,net_amount:1,item_unit_id:1,unit_lists:1,note:1,
							item_image: {$arrayElemAt:["$item_details.image", 0] },
						}},
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

									let itemList = {};
									itemResult.map(items=>{
										itemList[items._id] = items.name;
									});
									childCallback(null,itemList);
								}).catch(next);
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

									let doughList = {};
									doughResult.map(doughs=>{
										doughList[doughs._id] = doughs.unit_name;
									});
									childCallback(null,doughList);
								}).catch(next);
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

									let selectorList = {};
									selectorResult.map(selectors=>{
										selectorList[selectors._id] = selectors.unit_name;
									});
									childCallback(null,selectorList);
								}).catch(next);
							},
						},(childErr, childResponse)=>{
							if(childErr) return callback(childErr);

							let doughData		=	(childResponse.dough_records) ? childResponse.dough_records : {};
							let unitData		=	(childResponse.unit_records) ? childResponse.unit_records : {};
							let selectorData	=	(childResponse.selector_records) ? childResponse.selector_records : {};

							result.map(record=>{
								let tmpUnitId 	= 	record.unit_id;
								let tmpDoughId	=	record.dough_id;

								if(tmpUnitId){
									record.unit_name  = (unitData[tmpUnitId])   ? unitData[tmpUnitId]  :{};
									record.dough_name = (doughData[tmpDoughId]) ? doughData[tmpDoughId]:{};

									if(record.item_type==HALF_AND_HALF_ITEM || record.item_type==DEAL_ITEM ){
										record.unit_lists.map(data=>{
											if(data.unit_id) 	tmpUnitId	=	data.unit_id;
											if(data.dough_id) 	tmpDoughId 	=	data.dough_id;

											let tmpSelectorId =	data.selector_id;
											data.unit_name = (unitData[tmpUnitId]) ? unitData[tmpUnitId] :{};
											data.dough_name = (doughData[tmpDoughId]) ? doughData[tmpDoughId] :{};
											data.selector_name = (selectorData[tmpSelectorId]) ? selectorData[tmpSelectorId] :{};
										});
									}

								}
							});
							callback(null,result);
						});
					}).catch(next);
				},
                delivered_date_time : (callback)=>{
                    /** Get order delivered time */
                    const order_status_logs	= this.db.collection(Tables.ORDER_STATUS_LOGS);
                    order_status_logs.findOne({
						order_id 	: 	orderId,
						status 		:	Constants.ORDER_DELIVERED
					},{projection:{created:1}}).then(result=>{
						let deliveredTime = (result) ? result.created : "";
						callback(null,deliveredTime);
					}).catch(next);
				}
            },(err,response)=>{
				if(err) return next(err);

				/** Send error response */
				if(!response.orders_details || !response.order_sub_details || response.order_item_list.length<=0){
					return resolve({status : Constants.STATUS_ERROR, message : res.__("system.invalid_access")});
				}

                let restaurantId  		= 	response.orders_details.restaurant_id;
                let deliveredDateTime  	= 	response.delivered_date_time;
                let branchId  			= 	response.orders_details.branch_id;
                let paymentMethod 		= 	response.orders_details.payment_method;
                let customerId 			= 	response.orders_details.customer_id;
				let captainId 			=	response.orders_details.captain_id;
				let customerAddressDetail=	response.order_sub_details.customer_address_detail;
				let pickupCaptainId   	=	response.orders_details.pickup_captain_id;

				if(response.orders_details.refund_type) response.orders_details.refund_type = REFUND_TYPE[response.orders_details.refund_type];
				if(deliveredDateTime) response.orders_details.delivered_date_time = deliveredDateTime;

                asyncParallel({
                    restaurant_details : (childCallback)=>{
                        /** Get restaurant details */
                        const restaurants	= this.db.collection(Tables.RESTAURANTS);
                        restaurants.findOne({ _id : new ObjectId(restaurantId)},{projection:{_id:0,image:1}}).then(restaurantResult=>{
                            childCallback(null,restaurantResult);
                        }).catch(next);
                    },
                    branch_details : (childCallback)=>{
                        /** Get branch details */
                        const restaurant_branches	= this.db.collection(Tables.RESTAURANT_BRANCHES);
                        restaurant_branches.findOne({
							 _id 			: new ObjectId(branchId),
							 restaurant_id 	: new ObjectId(restaurantId)
						},{projection:{_id:0,name:1}}).then(branchResult=>{
                            childCallback(null,branchResult);
                        }).catch(next);
                    },
                    payment_method_details : (childCallback)=>{
                        /** Get payment method  details */
                        const payment_methods	= this.db.collection(Tables.PAYMENT_METHODS);
                        payment_methods.findOne({ slug : paymentMethod},{projection:{_id:0,title:1}}).then(paymentMethodsResult=>{
                            childCallback(null,paymentMethodsResult);
                        }).catch(next);
					},
					user_list : (childCallback)=>{
						/** Get driver/customer/pickup captain details */
						const users	= this.db.collection(Tables.USERS);
						users.find({
							_id : {$in : [customerId,captainId,pickupCaptainId]}
						},{projection:{id:1,full_name:1,mobile_number:1,latitude:1,longitude:1, revert_orders: 1}}).toArray().then(userResult=>{
							if(userResult.length<=0) return childCallback(null,{});

							let userList = {};
							userResult.map(records=>{
								userList[records._id] = records;
							});
							childCallback(null,userList);
						}).catch(next);
					},
					restaurant_sub_details : (childCallback)=>{
                        /** Get restaurant details */
                        const restaurant_details	= this.db.collection(Tables.RESTAURANT_DETAILS);
                        restaurant_details.findOne({ restaurant_id : new ObjectId(restaurantId)},{projection:{_id:0,mobile_number:1,phone_country_code:1}}).then(restaurantDetailsResult=>{
                            childCallback(null,restaurantDetailsResult);
                        }).catch(next);
                    },
					branch_phones : (childCallback)=>{
                        /** Get restaurant details */
                        const restaurant_branch_phone_numbers	= this.db.collection(Tables.RESTAURANT_BRANCH_PHONE_NUMBERS);
                        restaurant_branch_phone_numbers.findOne({
							branch_id 	 : new ObjectId(branchId),
							attribute_id : Constants.BRANCH_CUSTOMER_SERVICE_NUMBER_ATTRIBUTE_ID
						},{projection:{_id:0,country_code:1,contact_name:1,value:1}}).then(phoneResult=>{
                            childCallback(null,phoneResult);
                        }).catch(next);
                    },
                },(asyncErr,asyncResponse)=>{
                    if(asyncErr) return next(asyncErr);

					/** Add customer details in a object*/
					let userList  			= 	asyncResponse.user_list;
					let branchPhones  		= 	asyncResponse.branch_phones;
					let branchDetails  		= 	asyncResponse.branch_details;
					let restaurantDetails  	= 	asyncResponse.restaurant_details;
					let paymentMethodDetails= 	asyncResponse.payment_method_details;
					let captainDetails  	=   (captainId && userList[captainId]) ?userList[captainId]:"";
					let customerDetails  	= 	(customerId && userList[customerId])?userList[customerId]:{};
					let pickupCaptainDetails=	(pickupCaptainId && userList[pickupCaptainId])?userList[pickupCaptainId]:{};
					let restaurantSubDetails= 	asyncResponse.restaurant_sub_details;
					let additionalDetails   =   {};

					additionalDetails.branch_phone_details  = (branchPhones) 	  ? branchPhones :{};
					additionalDetails.restaurant_image      = (restaurantDetails) ? restaurantDetails.image :"";
					additionalDetails.branch_name   	    = (branchDetails) ? branchDetails.name :"";
					additionalDetails.payment_type       	= (paymentMethodDetails) ? paymentMethodDetails.title :"";
					additionalDetails.customer_name         = (customerDetails.full_name) ? customerDetails.full_name :"";
					additionalDetails.customer_mobile_number= (customerDetails.mobile_number) ? customerDetails.mobile_number :"";

					additionalDetails.customer_address      = (customerAddressDetail) 	?	arrangeUserAddress(req,res,next,customerAddressDetail)  :"";

					additionalDetails.pickup_captain_name          = (pickupCaptainDetails.full_name)     ? pickupCaptainDetails.full_name     :"";
					additionalDetails.pickup_captain_mobile_number = (pickupCaptainDetails.mobile_number) ? pickupCaptainDetails.mobile_number :"";
					additionalDetails.problem_type 	   		= (response.orders_details.problem_type)    ? ORDER_CANCELED_REASON_TYPE[response.orders_details.problem_type]    : "";
					additionalDetails.restaurant_mobile_number       = (restaurantSubDetails) ? restaurantSubDetails.mobile_number :"";
					additionalDetails.restaurant_mobile_country_code = (restaurantSubDetails) ? restaurantSubDetails.phone_country_code :"";

					if(captainDetails){
						additionalDetails.captain_name          = (captainDetails.full_name)	 ? captainDetails.full_name :"";
						additionalDetails.captain_mobile_number = (captainDetails.mobile_number) ? captainDetails.mobile_number :"";
					}else if(response.orders_details.captain_number){
						additionalDetails.captain_mobile_number = response.orders_details.captain_number;
					}

					let tpmOrderObj = response.orders_details;
					if(tpmOrderObj.source && tpmOrderObj.source == Constants.SOURCE_CALL_CENTER){
						let tmpPaymentMethod	=	(tpmOrderObj.payment_method)	?	tpmOrderObj.payment_method	:"";
						let tmpEnPaymentMethod 	= 	(Constants.AGHZEYA_PAYMENT_METHODS[tmpPaymentMethod]) ? Constants.AGHZEYA_PAYMENT_METHODS[tmpPaymentMethod] : "";
						let tmpArPaymentMethod 	=	(Constants.AGHZEYA_ARABIC_PAYMENT_METHODS[tmpPaymentMethod]) ? Constants.AGHZEYA_ARABIC_PAYMENT_METHODS[tmpPaymentMethod] :tmpEnPaymentMethod;

						additionalDetails.payment_type = {en: tmpEnPaymentMethod, ar: tmpArPaymentMethod};
					}else if(tpmOrderObj.source && tpmOrderObj.source != Constants.SOURCE_CALL_CENTER){
						additionalDetails.payment_type = (tpmOrderObj.source_payment_name) ? tpmOrderObj.source_payment_name :{};
					}

					let totalOutStanding 	= 	0;
					let outStandingOrderList=	[];
					if(customerDetails && customerDetails.revert_orders && customerDetails.revert_orders.length >0){
						outStandingOrderList = customerDetails.revert_orders;
						customerDetails.revert_orders.map(records=>{
							if(records.outstanding_amount){
								totalOutStanding +=	records.outstanding_amount;
							}
						});
					}

                    /** Send success response */
                    let orderDetails = Object.assign(response.orders_details,response.order_sub_details,additionalDetails);
                    resolve({
                        status 		  		 : Constants.STATUS_SUCCESS,
                        order_details 		 : orderDetails,
                        order_item_list 	 : response.order_item_list,
                        restaurant_image_url : Constants.RESTAURANT_FILE_URL,
                        item_image_url    	 : ITEMS_FILE_URL,
						outstanding_order_amount: round(totalOutStanding),
						outstanding_order_list	: outStandingOrderList,
                    });
                });
            });
		}).catch(next);
	};// end getOrderDetails()

	/**
	 * Function to get accepted order list
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	 **/
	async getAcceptedOrderList (req,res,next){
		return new Promise(resolve=>{
			/** Sanitize Data **/
			req.body 	= sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
			let userId	= (req.body.user_id) ? new ObjectId(req.body.user_id) :"";

			/** Send error response **/
			if(!userId) return resolve({status : Constants.STATUS_ERROR, message : res.__("system.missing_parameters")});

			/** Set driver conditions **/
			let userConditions = clone(DRIVER_COMMON_CONDITIONS);
			userConditions._id = userId;

			/** Find if user is not driver */
			const users	= 	this.db.collection(Tables.USERS);
			users.findOne(userConditions,{projection: { _id:1}}).then(userResult=>{

				/** Send error response **/
				if(!userResult) return resolve({status : Constants.STATUS_ERROR, message : res.__("admin.system.invalid_access")});

				asyncParallel({
					assignmnet_list : (callback)=>{
						 /** Get assigned order details */
						const order_assignment_logs	= this.db.collection(Tables.ORDER_ASSIGNMENT_LOGS);
						order_assignment_logs.find({
							captain_id 		: userId,
							current_status 	: Constants.Constants.ORDER_DRIVER_ASSIGNED
						},{projection: { _id:1,order_id:1}}).toArray().then(orderAssignmentResult=>{
							callback(null,orderAssignmentResult);
						}).catch(next);
					},
					orders_count : (callback)=>{
						/** Get orders count **/
						this.getOrdersCount(req,res,next).then((countResponse)=>{
							if(countResponse.status != Constants.STATUS_SUCCESS) return callback(null,countResponse.message);
							callback(null,countResponse);
						}).catch(next);
					}
				},(parentErr, parentResponse)=>{
					if(parentErr) return next(parentErr);

					let ordersCount 			=	parentResponse.orders_count;
					let orderAssignmentResult 	= 	parentResponse.assignmnet_list;

					if(orderAssignmentResult.length <= 0){
						return resolve({
							status 					: 	Constants.STATUS_SUCCESS,
							accepted_order_list 	: 	[],
							accept_order_count		: 	ordersCount.accept_order_count,
							pick_order_count		: 	ordersCount.pick_order_count,
							delivery_order_count	: 	ordersCount.delivery_order_count,
							restaurant_image_url 	:	Constants.RESTAURANT_FILE_URL
						});
					}

					/** Insert order ids in a array */
                    let orderIds = [];
                    orderAssignmentResult.map(records=>{
                        orderIds.push(records.order_id);
                    });
                    orderIds = arrayToObject(orderIds);

                    asyncParallel({
                        orders : (callback)=>{
							/** Get orders  */
                            const orders = this.db.collection(Tables.ORDERS);
                            orders.aggregate([
                                {$match : { _id : {$in : orderIds}}},
                                {$lookup : {
                                    from 		 : Tables.RESTAURANTS,
                                    localField 	 : "restaurant_id",
                                    foreignField : "_id",
                                    as 			 : "restaurant_details"
                                }},
                                {$project : { _id:1,unique_order_id:1,created:1,branch_id:1,restaurant_name:1,area_name:1,order_estimate_time:1,restaurant_logo: {$arrayElemAt : ["$restaurant_details.image",0]}}}
							]).toArray().then(orderResult=>{
                                if(orderResult.length ==0) return callback(null,orderResult);

								let allCustomerIds =[];
								let branchIds =[];
								orderResult.map(records=>{
									if(records.customer_id) allCustomerIds.push(records.customer_id);
									if(records.branch_id) branchIds.push(records.branch_id);
								});

								allCustomerIds	=	arrayToObject(allCustomerIds);
								branchIds 		= 	arrayToObject(branchIds);
								asyncParallel({
									user_list : (childCallback)=>{
										if(allCustomerIds.length ==0) return childCallback(null,{});

										/** Get user list */
										users.find({_id: {$in: allCustomerIds }},{projection: {_id: 1,revert_orders: 1}}).toArray().then(userResult=>{

											let userObj = {};
											userResult.map(records=>{
												userObj[records._id] = records;
											});
											childCallback(null,userObj);
										}).catch(next);
									},
									branch_detail : (childCallback)=>{
										const restaurant_branches = this.db.collection(Tables.RESTAURANT_BRANCHES);
										restaurant_branches.find({_id : {$in : arrayToObject(branchIds)}},{projection : {_id: 1,name: 1}}).toArray().then(branchResult=>{

											let branchList = {};
											branchResult.map(branch=>{
												branchList[branch._id] = branch.name;
											});
											childCallback(null,branchList);
										}).catch(next);
									},
								},(childErr, childResponse)=>{
									if(childErr) return callback(childErr,orderResult);

									let userList 		= childResponse.user_list;
									let branchDetail 	= childResponse.branch_detail;
									orderResult.map(records=>{
										let tmpCusId = records.customer_id;

										records.branch_name   = (branchDetail[records.branch_id]) ? branchDetail[records.branch_id] : "";

										if(tmpCusId && userList[tmpCusId]){
											let orderStatus		=	records.order_status;
											let paymentMethod	=	records.payment_method;
											let tmpUserDetails	=	userList[tmpCusId];
											let totalOutStanding= 0

											if(tmpUserDetails.revert_orders && tmpUserDetails.revert_orders.length >0 && paymentMethod == Constants.CASH_PAYMENT && !ORDER_FINISH_ACTIONS[orderStatus]){
												tmpUserDetails.revert_orders.map(data=>{
													if(data.outstanding_amount){
														totalOutStanding +=	data.outstanding_amount;
													}
												});
											}

											if(totalOutStanding >0) {
												records.outstanding_order_amount = round(totalOutStanding);
											}
										}
									});

									callback(null,orderResult);
								});
                            }).catch(next);
                        },
                        order_details : (callback)=>{
							/** Get order details */
                            const order_details	= this.db.collection(Tables.ORDER_DETAILS);
                            order_details.find({ order_id : {$in : orderIds}},{projection: {order_id:1,remaining_preparation_time:1}}).toArray().then(orderDetailsResult=>{
                                callback(null,orderDetailsResult);
                            }).catch(next);
						},
					},(err,response)=>{
                        if(err) return next(err);

						let orderResult        = response.orders       ? response.orders        :[];
                        let orderDetailsResult = response.order_details? response.order_details	:[];

						/** Insert accepted order list in a array */
                        let orderAcceptedList = [];
                        orderResult.map(orderRecords=>{
                            orderDetailsResult.map(orderDetailsRecords=>{
                                if(orderRecords._id.toString() == orderDetailsRecords.order_id.toString()){
									let rePreTime = 0;
									if(orderRecords.order_estimate_time){
										let tmpTime = getDifferenceBetweenTwoDatesInMinute(newDate(),orderRecords.order_estimate_time);

										rePreTime = (tmpTime >0) ? parseInt(tmpTime) :0;
									}

                                    let tmpObj = {
										order_id     		: orderRecords._id,
                                        order_number 		: orderRecords.unique_order_id,
                                        order_submitted_time: orderRecords.created,
                                        restaurant_name 	: orderRecords.restaurant_name,
                                        restaurant_logo 	: orderRecords.restaurant_logo,
										branch_name 		: orderRecords.branch_name,
                                        restaurant_area 	: orderRecords.area_name,
										remaining_time  	: rePreTime,
									};
									if(orderRecords.outstanding_order_amount){
										tmpObj.outstanding_order_amount = orderRecords.outstanding_order_amount;
									}

									orderAcceptedList.push(tmpObj);
                                }
                            });
                        });

						/** Send success response  */
                        resolve({
							status 					: 	Constants.STATUS_SUCCESS,
							accepted_order_list 	: 	orderAcceptedList,
							accept_order_count		: 	ordersCount.accept_order_count,
							pick_order_count		: 	ordersCount.pick_order_count,
							delivery_order_count	: 	ordersCount.delivery_order_count,
							restaurant_image_url 	:	Constants.RESTAURANT_FILE_URL
						});
                    });
				});
			}).catch(next);
		}).catch(next);
	};// end getAcceptedOrderList()

	/**
	 * Function to mark order problemetic
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	 **/
	async markOrderProblamatic (req,res,next){
		return new Promise(resolve=>{
			/** Sanitize Data **/
			req.body 		   = sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
			let userId		   = (req.body.user_id) 		? new ObjectId(req.body.user_id) 	:"";
			let orderId		   = (req.body.order_id) 	    ? new ObjectId(req.body.order_id)	:"";
			let reason		   = (req.body.reason) 			? req.body.reason 				:"";
			let problemType    = (req.body.problem_type)    ? req.body.problem_type 		:"";
			let problemSubtype = (req.body.problem_subtype) ? req.body.problem_subtype  	:"";

			/** Send error response **/
			if(!userId || !orderId || !problemType || (problemType == Constants.ACCIDENT && !problemSubtype)) return resolve({status : Constants.STATUS_ERROR, message : res.__("system.missing_parameters"), missing_fields : ["user_id","order_id","problem_type","problem_subtype"]});

			const users		=	this.db.collection(Tables.USERS);
			const orders 	=	this.db.collection(Tables.ORDERS);
			asyncParallel({
				order_details : (callback)=>{
					/** Get order details */
					orders.findOne({
						_id 		: 	orderId,
						captain_id	:	userId,
						is_completed:	{$exists: false}
					},{projection:{order_status:1,customer_id:1,branch_id:1,restaurant_id:1,unique_order_id:1}}).then(result=>{
						callback(null,result);
					}).catch(next);
				},
				captain_details : (callback)=>{
					/** Set conditions  */
					let userConditions 	= clone(Constants.DRIVER_ASSIGNMENT_CONDITIONS);
					userConditions._id  = userId;
					if(userConditions.is_suspend) delete userConditions.is_suspend;

					/** Get captain details */
					users.findOne(userConditions,{projection: {latitude:1, longitude: 1}}).then(result=>{
						callback(null,result);
					}).catch(next);
				},
				voc_list : (callback)=>{
					let deliveryVocOptions ={
						type 		: Constants.VOC_TYPE_FOR_CAPTAIN_ORDER_MARKED_PROBLEMATIC,
						user_type 	: Constants.VOC_FOR_CAPTAIN,
					};

					/**Get voc question list **/
					getUserVocQuestionList(req,res, next,deliveryVocOptions).then(vocResponse=> {
						if(vocResponse.status != Constants.STATUS_SUCCESS) return callback(vocResponse);
						callback(null,vocResponse.questions);
					}).catch(next);
				},
			},(asyncErr,asyncResponse)=>{
				if(asyncErr) return next(asyncErr);

				/** Send error response */
				if(!asyncResponse.order_details || !asyncResponse.captain_details){
					return resolve({status: Constants.STATUS_ERROR, message: res.__("system.invalid_access")});
				}

				let vocList 		= 	asyncResponse.voc_list;
				let orderDetails 	= 	asyncResponse.order_details;
				let uniqueOrderId 	= 	orderDetails.unique_order_id;
				let captainDetails 	=	asyncResponse.captain_details;
				let currentStatus	=	(orderDetails.order_status) ? orderDetails.order_status 	:'';
				let branchId	 	=	(orderDetails.branch_id) 	? orderDetails.branch_id 		:'';
				let customerId	 	=	(orderDetails.customer_id) 	? orderDetails.customer_id 		:'';
				let restauarntId 	=	(orderDetails.restaurant_id)? orderDetails.restaurant_id	:'';

				asyncParallel({
					update_order : (childCallback)=>{
						/** Set update data */
						let updateData ={
							$set: {
								//captain_id		:	"",
								problem_type	:	problemType,
								picked_from 	: 	Constants.USER_TYPE_DRIVER,
								pickup_captain_id:	userId,
								pickup_lat		:	captainDetails.latitude,
								pickup_long 	:	captainDetails.longitude,
								modified 		: 	getUtcDate(),
							}
						};

						if(problemType ==Constants.OTHERS) 	updateData["$set"].rejection_reason = 	reason;
						if(problemType ==Constants.OTHERS) 	updateData["$set"].problem_reason 	= 	reason;
						if(problemSubtype) 			updateData["$set"].problem_subtype 	=	problemSubtype;

						if(problemType == Constants.ACCIDENT && problemSubtype == Constants.PACKAGE_GETS_DAMAGED){
							updateData["$set"].picked_from = Constants.USER_TYPE_RESTAURANT;
						}

						/** Update order details */
						orders.updateOne({_id: orderId },updateData).then(()=>{
							childCallback(null);
						}).catch(next);
					},
					save_voc : (childCallback)=>{
						if(!vocList || vocList.length ==0) return childCallback(null);

						vocList.map(records=>{
							records.question_id = records._id;

							if(records.question.indexOf("interrupted") >= 0){
								let tmpAnswer = Constants.ORDER_CANCELED_REASON_TYPE[problemType].title;
								if(reason) tmpAnswer += "("+reason+")";
								if(problemType == Constants.ACCIDENT) tmpAnswer += "("+problemSubtype+")";

								records.answer = tmpAnswer;
							}
						});

						/** Set options for save voc response **/
						let vocOptions = {
							user_type     : Constants.VOC_FOR_CAPTAIN,
							type 		  : Constants.VOC_TYPE_FOR_CAPTAIN_ORDER_MARKED_PROBLEMATIC,
							user_id 	  : userId,
							order_id 	  : orderId,
							question_list : vocList,
							is_not_seen	  : true
						};

						/** Save voc response details**/
						saveVocResponses(req,res, next,vocOptions).then(vocResponse=> {
							if(vocResponse.status != Constants.STATUS_SUCCESS) return childCallback(vocResponse);
							childCallback(null);
						}).catch(next);
					},
					update_driver_details : (childCallback)=>{
						if(problemType != Constants.ACCIDENT && problemType != Constants.CAR_BREAKDOWN) return childCallback(null);

						/** Mark driver account is suspend */
						users.updateOne({_id:userId},{$set: {is_suspend: Constants.SUSPEND, is_highlight: true }}).then(()=>{
							childCallback(null);
						}).catch(next);
					},
				},(childErr)=>{
					if(childErr) return next(childErr);

					/** Save order logs */
					saveOrderStatusLogs(req,res,next,{
						updated_by 		: 	userId,
						user_role_id 	: 	Constants.DRIVER,
						is_driver	 	: 	true,
						status 			:	Constants.ORDER_PROBLEMATIC,
						order_status	:	currentStatus,
						restaurant_id	:	restauarntId,
						order_id 		:	orderId,
						branch_id		:	branchId,
						user_id			:	customerId,
						user_type		:	Constants.USER_TYPE_DRIVER,
					}).then(()=>{

						/** Send success response */
						resolve({
							status  : Constants.STATUS_SUCCESS,
							message : res.__("order.order_marked_problamatic")
						});

						/** Send notification to fleet or admin */
						insertNotifications(req,res,{
							notification_data : {
								notification_type:	Constants.NOTIFICATION_TO_FLEET_ORDER_MARKED_PROBLEMATIC,
								message_params 	:	[uniqueOrderId],
								parent_table_id : 	orderId,
								user_id 		: 	userId,
								user_role_id 	: 	Constants.DRIVER,
								is_driver	 	: 	true,
								role_id 		: 	[Constants.CRAVEZ,Constants.FLEET],
								only_for_user_role:	true,
								extra_parameters: 	{
									order_id 	: orderId
								}
							}
						}).then(()=>{});
					});
				});
			});
		}).catch(next);
	};// end markOrderProblamatic()

	/**
	 * Function to get order problemetic reason list
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	 **/
	async orderProblamaticReasonList (req,res,next){
		return new Promise(resolve=>{
			/** Sanitize Data **/
			req.body	= 	sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
			let type	=	(req.body.type)	?	req.body.type	:"";

			let reasonList = [];
			Object.keys(Constants.ORDER_CANCELED_REASON_TYPE).map(key=>{
				if(type !="delivered" || key != Constants.ORDER_NOT_READY){
					reasonList.push({
						type 	: key,
						title 	: Constants.ORDER_CANCELED_REASON_TYPE[key].title,
						title_ar: Constants.ORDER_CANCELED_REASON_TYPE[key].title_ar,
					});
				}
			});

			/** Send success response */
			resolve({
				status  : Constants.STATUS_SUCCESS,
				reasons : reasonList
			});
		}).catch(next);
	};// end orderProblamaticReasonList()

	/**
	 * Function to get accepted order list
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	 **/
	async updateOrderStatus  (req,res,next){
		return new Promise(resolve=>{
			/** Sanitize Data **/
			req.body 		= sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
			let userId		= (req.body.user_id) 	? 	new ObjectId(req.body.user_id)	:"";
			let orderId		= (req.body.order_id) 	? 	new ObjectId(req.body.order_id)	:"";
			let orderStatus	= (req.body.status) 	?	req.body.status 			:"";
			let outstandingOrderAmount=(req.body.outstanding_order_amount)? parseFloat(req.body.outstanding_order_amount) :0;

			/** Send error response **/
			if(!userId || !orderId || !orderStatus) return resolve({status : Constants.STATUS_ERROR, message : res.__("system.missing_parameters")});

			/** Get orders details  */
			const orders = this.db.collection(Tables.ORDERS);
			orders.findOne({_id: orderId }).then(result=>{

				/** Send error response */
				if(!result) return resolve({status:Constants.STATUS_ERROR,message: res.__("system.invalid_access"), result: result});

				let customerId 		= 	result.customer_id;
				let paymentMethod 	=	result.payment_method;

				/** Update order status **/
				this.assignmentAPI.updateOrderStatus(req,res,next,req.body).then((response)=>{
					if(response.status != Constants.STATUS_SUCCESS) return resolve(response);

					asyncParallel({
						update_outstanding_details: (parentCallback)=>{
							if(!customerId || !outstandingOrderAmount || outstandingOrderAmount <=0  || paymentMethod != Constants.CASH_PAYMENT || orderStatus != Constants.ORDER_DELIVERED){
								return parentCallback(null);
							}

							/** Pay outstanding amount **/
							this.payUserOrderOutstanding(req,res,next,{user_id: customerId}).then(()=>{
								parentCallback(null);
							}).catch(next);
						},
					},()=>{

						/** Send success response */
						resolve(response);
					});
				}).catch(next);
			}).catch(next);
		}).catch(next);
	};// end updateOrderStatus()

	/**
	 * Function to reorder
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	 **/
	async reOrder (req,res,next){
		return new Promise(resolve=>{
			/** Sanitize Data **/
			req.body 		= sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
			let userId		= (req.body.user_id) 		? 	new ObjectId(req.body.user_id) 	:"";
			let orderId		= (req.body.order_id) 		? 	new ObjectId(req.body.order_id)	:"";
			let deviceId	= (req.body.device_id)		?	req.body.device_id			:"";
			let isModified	= (req.body.is_modified)	? 	JSON.parse(req.body.is_modified) :false;
			let apiType		= 	(req.body.api_type)		?	req.body.api_type			:"";
			let maxModifiedTime	= (req.body.max_modified_time)	?	req.body.max_modified_time :"";

			/** Send error response **/
			if((!userId && !deviceId) || !orderId){
				return resolve({status: Constants.STATUS_ERROR, message: res.__("system.missing_parameters"), missing_fields: ["user_id","device_id","order_id"] });
			}

			const user_carts = this.db.collection(Tables.USER_CARTS);
			asyncParallel({
				order_details : (callback)=>{
					/** Set order conditions */
					let orderConditions ={
						_id : orderId
					};

					if(userId){
						orderConditions.customer_id =	userId;
					}else{
						orderConditions.device_id 	=	deviceId;
					}

					/** Get order details */
					const orders = 	this.db.collection(Tables.ORDERS);
					orders.findOne(orderConditions,{projection: { _id:1,restaurant_id:1,branch_id:1,area_id:1}}).then(result=>{
						callback(null,result);
					}).catch(next);
				},
				order_item_list : (callback)=>{
					/** Get order item list */
					const order_items = this.db.collection(Tables.ORDER_ITEMS);
					order_items.find({
						order_id : orderId
					},{projection:{parent_item_id: 1, qty: 1,item_id: 1, unit_id: 1, dough_id: 1, selector_id: 1, item_type: 1, extra_items: 1, item_unit_id: 1, unit_lists: 1}}).toArray().then(result=>{
						callback(null,result);
					}).catch(next);
				},
				modified_details : (callback)=>{
					if(!isModified) return callback(null,null);

					/** Set cart conditions */
					let cartConditions = {};
					if(userId){
						cartConditions.customer_id 	=	userId;
					}else{
						cartConditions.device_id 	=	deviceId;
					}

					/** Delete cart item */
					user_carts.deleteMany(cartConditions).then(()=>{
						callback(null);
					}).catch(next);
				}
			},(asyncErr, asyncResponse)=>{
				if(asyncErr) return next(asyncErr);

				/** Send error response */
				if(!asyncResponse.order_details || asyncResponse.order_item_list.length <=0){
					return resolve({status : Constants.STATUS_ERROR, message : res.__("system.invalid_access")});
				}

				let areaId 			= 	asyncResponse.order_details.area_id;
				let branchId 		= 	asyncResponse.order_details.branch_id;
				let restaurantId	=	asyncResponse.order_details.restaurant_id;

				asyncEach(asyncResponse.order_item_list,(records, eachCallback)=>{
					let unitLists	= (records.unit_lists)	? records.unit_lists	:[];
					let extraItems	= (records.extra_items)	? records.extra_items	:[];

					let tmpBodyObj = {
						user_id		: 	userId,
						device_id	: 	deviceId,
						api_type	: 	apiType,
						area_id		: 	areaId,
						branch_id	: 	branchId,
						restaurant_id: 	restaurantId,
						order_id	: 	(isModified) 			? orderId 				:"",
						item_id 	: 	(records.item_id) 		? records.item_id 		:"",
						qty 		: 	(records.qty) 			? records.qty 			:"",
						unit_id 	: 	(records.unit_id) 		? records.unit_id 		:"",
						dough_id 	: 	(records.dough_id) 		? records.dough_id 		:"",
						selector_id : 	(records.selector_id) 	? records.selector_id 	:"",
						item_type 	: 	(records.item_type) 	? records.item_type 	:"",
						item_unit_id:	(records.item_unit_id)	? records.item_unit_id 	:"",
						max_modified_time: 	maxModifiedTime,
					};

					if(extraItems.length >0){
						let tmpGroupData = {};
						extraItems.map(exData=>{
							let groupId = (exData.group_id) ? exData.group_id :"";
							if(!tmpGroupData[groupId]) tmpGroupData[groupId] = {extra_item_ids:[]};

							tmpGroupData[groupId]["group_id"] = groupId;
							tmpGroupData[groupId].extra_item_ids.push({
								extra_item_id 		: exData.extra_item_id,
								extra_group_item_id : exData.extra_item_group_id,
							});
						});

						tmpBodyObj.extra_items = Object.values(tmpGroupData);
					}

					if(unitLists.length >0){
						let tmpUnitData = [];
						unitLists.map(listData=>{
							let tmpExtraItems= (listData.extra_items)	? listData.extra_items	:[];

							let tmpUnitList = {
								unit_id 	: 	(listData.unit_id) 		? listData.unit_id 		:"",
								dough_id 	: 	(listData.dough_id) 	? listData.dough_id 	:"",
								selector_id : 	(listData.selector_id) 	? listData.selector_id 	:"",
								item_unit_id:	(listData.item_unit_id)	? listData.item_unit_id :"",
							};

							let tmpGroupData = {};
							if(tmpExtraItems.length >0){
								tmpExtraItems.map(exData=>{
									let groupId = (exData.group_id) ? exData.group_id :"";
									if(!tmpGroupData[groupId]) tmpGroupData[groupId] = {extra_item_ids:[]};

									tmpGroupData[groupId]["group_id"] = groupId;
									exData.extra_item_ids.map(tmpExdata=>{
										tmpGroupData[groupId].extra_item_ids.push({
											extra_item_id 		: tmpExdata.extra_item_id,
											extra_group_item_id : tmpExdata.extra_group_item_id,
										});
									});
								});
							}
							tmpUnitList.extra_items = Object.values(tmpGroupData);

							tmpUnitData.push(tmpUnitList);
						});
						tmpBodyObj.unit_lists = tmpUnitData;
					}

					/** Add cart data */
					req.body =	tmpBodyObj;
					this.cartAPI.updateCart(req,res,next).then(cartResponse=>{
						if(cartResponse.status != Constants.STATUS_SUCCESS) return eachCallback(cartResponse);
						eachCallback(null);
					}).catch(next);
				},(asyncEachErr)=>{

					asyncParallel({
						cart_details : (childCallback)=>{
							if(!asyncEachErr && isModified) return childCallback(null);

							if(asyncEachErr){
								/** Delete cart when error found */
								user_carts.deleteMany({order_id: orderId}).then(()=>{
									childCallback(null);
								}).catch(next);
							}else{
								/** Update cart details */
								user_carts.updateMany({order_id: orderId},{$unset: {order_id: 1}}).then(()=>{
									childCallback(null);
								}).catch(next);
							}
						},
					},(asyncChildErr)=>{
						if(asyncChildErr) return next(asyncChildErr);

						/** Send success response */
						resolve({
							status 	: 	(asyncEachErr) ? Constants.STATUS_ERROR :Constants.STATUS_SUCCESS,
							message :	(asyncEachErr) ? asyncEachErr.message :res.__("orders.item_added_into_cart_successfully")
						});
					});
				});
			});
		}).catch(next);
	};// end reOrder()

	/**
	 * Function to place modifier order
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	**/
	async placeModifierOrderByCustomer  (req,res,next){
		return new Promise(resolve=>{
			/** Sanitize Data **/
			req.body 			=	sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
            let orderId			= 	(req.body.order_id)			?	new ObjectId(req.body.order_id)		:"";
            let userId			= 	(req.body.user_id)			?	new ObjectId(req.body.user_id)		:"";
			let deviceId		= 	(req.body.device_id)		?	req.body.device_id				:"";
			let isWallet 		=	(req.body.is_wallet)		?	JSON.parse(req.body.is_wallet)	:false;
            let paymentCurrency	= 	(req.body.currency)			?	req.body.currency				:"";
            let orderPrice 		=	(req.body.order_price) 		?	req.body.order_price			:0;
            let paymentMethod 	=	(req.body.payment_method) 	?	req.body.payment_method			:"";
			let paymentResponse	= 	(req.body.payment_response)	?	req.body.payment_response		:"";
			let isUsedPoints 	=	(req.body.is_used_points)	?JSON.parse(req.body.is_used_points):false;
			let walletDebitAmount=	(req.body.wallet_amount)	?	parseFloat(req.body.wallet_amount):0;

			/** Send error response **/
			if((!userId && !deviceId) || !orderId || (paymentResponse && (!paymentMethod ||!paymentCurrency || !orderPrice || isNaN(orderPrice)))){
				return resolve({status: Constants.STATUS_ERROR, message: res.__("system.missing_parameters"), missing_fields: ["user_id","device_id","order_id","payment_response","payment_method","currency","order_price"] });
			}

			const orders  		= 	this.db.collection(Tables.ORDERS);
			const order_details = 	this.db.collection(Tables.ORDER_DETAILS);
			const order_items  	=	this.db.collection(Tables.ORDER_ITEMS);
			const offer_logs  	= 	this.db.collection(Tables.OFFER_LOGS);
			asyncParallel({
				order_details: (parentCallback)=>{
					/** Set order conditions */
					let orderConditions = {_id: orderId};

					if(userId){
						orderConditions.customer_id =	userId;
					}else{
						orderConditions.device_id 	=	deviceId;
					}

					/** Get order details */
					orders.findOne(orderConditions).then(orderResult=>{
						parentCallback(null, orderResult);
					}).catch(next);
				},
				cart_list: (parentCallback)=>{
					/** Get cart list */
					let cartOptions = clone(req.body);
					cartOptions.is_place_order = true;
					cartOptions.is_place_modified_order = true;
					this.cartAPI.getUserCartList(req,res,next,cartOptions).then(response=>{
						parentCallback(null,response);
					}).catch(next);
				},
				offer_log_details: (parentCallback)=>{
					/** Get offer logs details */
					offer_logs.findOne({order_id: orderId },{projection: {order_discount:1,offer_id:1}}).then(logResult=>{
						parentCallback(null, logResult);
					}).catch(next);
				},
				get_modify_log_details: (parentCallback)=>{
					/** Get order modify logs details */
					const order_modify_logs = 	this.db.collection(Tables.ORDER_MODIFY_LOGS);
					order_modify_logs.findOne({order_id: orderId },{projection: {_id:1}}).then(logResult=>{
						parentCallback(null, logResult);
					}).catch(next);
				},
			},(parentErr,parentResponse)=>{
				if(parentErr) return next(parentErr);

				/** Send error response */
				if(parentResponse.cart_list.status != Constants.STATUS_SUCCESS) return resolve(parentResponse.cart_list);

				let cartList  		=	parentResponse.cart_list.result;
				let grandTotal 		=	parentResponse.cart_list.grand_total;
				let orderDetails	=	parentResponse.order_details;
				let offerlogDetails	=	parentResponse.offer_log_details;
				let orderModifyLog	=	parentResponse.get_modify_log_details;
				let isLogExists		=	(orderModifyLog) ? true :false;

				/** Send error response **/
				if(cartList.length <=0 || !orderDetails){
					return resolve({status: Constants.STATUS_ERROR, message: res.__("system.something_going_wrong_please_try_again") });
				}

				/** Check all branch or item available or not */
				let cartDetails	 	=	cartList[0];
				let branchAvailable	= 	true;
				let itemAvailable	=	true;
				let orderNetAmount	=	0;
				let orderCustomerId = 	orderDetails.customer_id;
				let paidAmount	 	=	orderDetails.paid_amount;
				let mainOrderId	 	=	orderDetails.main_order_id;
				let uniqueOrderId	=	orderDetails.unique_order_id;
				let isGuest			=	orderDetails.is_guest;
				let oldOrderPrice	=	orderDetails.order_price;
				let orderTotalAmount=	(paidAmount) ? paidAmount :oldOrderPrice;
				let totalRemaining	=	0;
				let isOutStanding	=	false;

				if(orderTotalAmount < grandTotal){
					isOutStanding 	= true;
					totalRemaining 	= grandTotal-orderTotalAmount;
				}else{
					totalRemaining 	= orderTotalAmount-grandTotal;
				}

				if(isOutStanding){
					/** Payment missing parameter */
					let missingObject     = {};
					let missingParameters = false;
					if(paymentMethod != Constants.CASH_PAYMENT && paymentMethod != Constants.WALLET_PAYMENT){
						if(!paymentMethod || !paymentResponse || !paymentCurrency || !orderPrice){
							missingParameters = true;

							if(!paymentMethod) 	 missingObject.payment_method 	= true;
							if(!paymentResponse) missingObject.payment_response = true;
							if(!paymentCurrency) missingObject.currency 		= true;
							if(!orderPrice) 	 missingObject.order_price 		= true;
						}
					}

					/** Send error reponse */
					if(missingParameters){
						return resolve({status: Constants.STATUS_ERROR, message: res.__("system.missing_parameters"), missing_fields: Object.keys(missingObject) });
					}
				}

				if(!cartDetails.branch_available)  	branchAvailable = false;
				if(cartDetails.branch_open != OPEN) branchAvailable = false;
				cartDetails.item_list.map(itemData=>{
					if(!itemData.item_available)  itemAvailable = false;

					orderNetAmount += itemData.sub_price;
				});

				/** Send error response **/
				if(!branchAvailable || !itemAvailable){
					let message = (!branchAvailable) ? res.__("order.branch_not_available") : res.__("order.item_not_available");
					return resolve({status: Constants.STATUS_ERROR, message: message });
				}

				let restaurantId 	= 	cartDetails.restaurant_id;
				let branchId 		= 	cartDetails.branch_id;
				let itemList 	 	=	cartDetails.item_list;
				let tmpOfferId  	= 	cartDetails.offer_id;
				let currentDiscount = 	(cartDetails.discount) ? cartDetails.discount :0;
				let isDoubleCashback=(cartDetails.is_double_cashback) ? cartDetails.is_double_cashback :"";
				let lastOfferId 	=   "";
				let lastOfferAmount =   0;
				let lastOfferlogId 	=   "";
				let bothOfferSame   =	false;

				if(offerlogDetails){
					lastOfferlogId 	= (offerlogDetails._id) 		? offerlogDetails._id 	:"";
					lastOfferId 	= (offerlogDetails.offer_id) 	? offerlogDetails.offer_id :"";
					lastOfferAmount = (offerlogDetails.order_discount) ? offerlogDetails.order_discount :0;
					bothOfferSame	= (String(lastOfferId) == tmpOfferId) ? true :false;
				}

				const offer_used    = 	this.db.collection(Tables.OFFER_USED);
				const tmp_offer_logs= 	this.db.collection(Tables.TMP_OFFER_LOGS);
				const user_carts 	= 	this.db.collection(Tables.USER_CARTS);
				const restaurants 	= 	this.db.collection(Tables.RESTAURANTS);

				asyncParallel({
					save_modify_details: (childCallback)=>{
						if(isLogExists) return childCallback(null);

						/** Save order details */
						this.saveOrderDetails(req,res,next,{order_id: orderId}).then(response=>{
							if(response.status != Constants.STATUS_SUCCESS) return childCallback(response.message);
							childCallback(null);
						}).catch(next);
					},
					restaurant_concept_id: (childCallback)=>{
						/** Set conditions */
						let restaurantConditions = {
							_id			:	new ObjectId(restaurantId),
							concept_id	:	{$exists : true, $ne: ""}
						};

						/** Get restaurant details */
						restaurants.findOne(restaurantConditions,{projection: {concept_id:1}}).then(restResult=>{
							let conceptId = (restResult && restResult.concept_id) ? restResult.concept_id :null;
							childCallback(null, conceptId);
						}).catch(next);
					},
				},(childParallelErr,childParallelResponse)=>{
					if(childParallelErr) return next(childParallelErr);

					let restaurantConceptId		=	childParallelResponse.restaurant_concept_id;
					let remainingAmount 		=	0;
					let finalWalletDebitAmount 	=	0;
					asyncParallel({
						delete_old_item: (parentCallback)=>{
							/** Delete order old items */
							order_items.deleteMany({order_id: orderId }).then(()=>{
								parentCallback(null);
							}).catch(next);
						},
						save_offer_logs: (parentCallback)=>{
							/** This use only when offer is different */
							if(!offerlogDetails|| !tmpOfferId || bothOfferSame){
								return parentCallback(null);
							}

							/** Set offer used conditions */
							let offerUsedConditions = {
								offer_id : 	new ObjectId(lastOfferId),
							};

							if(userId){
								offerUsedConditions.user_id 	= 	userId;
							}else{
								offerUsedConditions.device_id	=	mainDeviceId;
							}

							/** Update offer used */
							offer_used.updateOne(offerUsedConditions,{
								$set :{
									modified: 	getUtcDate()
								},
								$inc :{
									offer_used 			: -1,
									total_amount_used 	: lastOfferAmount*-1,
								},
								$pull :{
									offer_log_ids : lastOfferlogId,
								},
							}).then(()=>{

								/** Delete logs */
								offer_logs.deleteOne({_id: lastOfferlogId }).then(()=>{
									parentCallback(null);
								}).catch(next);
							}).catch(next);
						},
						update_offer_value: (parentCallback)=>{
							if(!offerlogDetails|| !tmpOfferId || !bothOfferSame || lastOfferAmount == currentDiscount){
								return parentCallback(null);
							}

							/** This use only when offer same but discount different */
							let adjustDiscount =  currentDiscount-lastOfferAmount;

							offer_logs.updateOne({
								_id : new ObjectId(lastOfferlogId)
							},
							{$set :{
								order_price	   : round(orderNetAmount),
								order_discount : currentDiscount,
								modified	   : getUtcDate()
							}}).then(()=>{

								/** Update offer used */
								offer_used.updateOne({
									offer_log_ids : {$in: [new ObjectId(lastOfferlogId)]}
								},
								{$inc :{
									total_amount_used : adjustDiscount,
								}}).then(()=>{
									parentCallback(null);
								}).catch(next);
							}).catch(next);
						},
						update_wallet: (parentCallback)=>{
							if(!walletDebitAmount || walletDebitAmount<=0 || !userId || !isOutStanding || totalRemaining<=0){
								remainingAmount += totalRemaining;
								return parentCallback(null);
							}

							let tmpDebitAmount =  0;
							if(walletDebitAmount >= totalRemaining){
								walletDebitAmount = walletDebitAmount-totalRemaining;
								tmpDebitAmount 	  = totalRemaining;
							}else{
								walletDebitAmount = 0;
								tmpDebitAmount 	  = walletDebitAmount;
							}

							/** Set wallet options */
							finalWalletDebitAmount = tmpDebitAmount;
							let walletOptions = {
								user_id      	: userId,
								amount       	: tmpDebitAmount,
								transaction_type: DEBIT,
								order_id		: mainOrderId,
								is_used_points	: isUsedPoints,
								is_double_cashback: isDoubleCashback,
								extra_parameters:{
									order_id 		: orderId,
									branch_id 		: branchId,
									restaurant_id 	: restaurantId,
									order_place 	: true,
								}
							};

							/** Update wallet  */
							updateWalletBalance(req,res,next,walletOptions).then(walletResponse=>{
								if(walletResponse.status != Constants.STATUS_SUCCESS) return parentCallback(walletResponse);

								remainingAmount += (walletResponse.remaining_amount) ? walletResponse.remaining_amount :0;

								parentCallback(null,walletResponse.transaction_id);
							}).catch(next);
						},
					},(parentParallelErr)=>{
						if(parentParallelErr) return next(parentParallelErr);

						/** Set order save details  */
						let orderStatus		=	Constants.ORDER_SUBMITTED;
						let orderSaveData 	= 	{
							$set : {
								order_price		:	grandTotal,
								net_amount		:	round(orderNetAmount),
								order_status	:	orderStatus,
								// is_confirm		:	false,
								is_modified		:	true,
								queue_time		:	getUtcDate(),
								number_of_queue : 	Constants.FIRST_REQUEUE_ORDER,
								is_big_order	:	(orderNetAmount >= Constants.BIG_ORDER_AMOUNT) ? true :false,
								modified		:	getUtcDate(),
							},
							$inc : {
								amount_debited_by_wallet : finalWalletDebitAmount
							}
						};

						if(isOutStanding){
							orderSaveData["$set"].outstanding_amount 	= 	totalRemaining;
							orderSaveData["$set"].outstanding_payment	=	Constants.UNPAID;
						}

						if(!userId)   orderSaveData["$set"].modified_by = userId;
						if(!paidAmount) orderSaveData["$set"].paid_amount = oldOrderPrice;

						if(isOutStanding && paymentMethod == Constants.KNET){
							let onlinePaymentAmount = totalRemaining-finalWalletDebitAmount;
							let knetValue	=	(res.locals.settings['Site.knet_charges']) ? res.locals.settings['Site.knet_charges'] :0;
							let knetCharges	=(knetValue) ? (onlinePaymentAmount * knetValue)/Constants.MAX_PERCENTAGE :0;

							orderSaveData["$inc"].total_knet_amount = 	onlinePaymentAmount;
							orderSaveData["$inc"].knet_charges		=	round(knetCharges);
						}

						/** Save order details */
						orders.updateOne({_id: orderId },orderSaveData).then(()=>{

							let paymentCartIds 	=	[];
							asyncParallel({
								order_details : (callback)=>{
									let deliveryTime 	= 	(cartDetails.delivery_time) 	? cartDetails.delivery_time :Constants.DEFAULT_DELIVERY_TIME;
									let preparationTime = 	(cartDetails.preparation_time) 	? cartDetails.preparation_time :Constants.DEFAULT_PREPARATION_TIME;

									/** Set order details  */
									let orderDetailsData = {
										total_amount	: 	grandTotal,
										net_amount		: 	round(orderNetAmount),
										discount_price	: 	(cartDetails.discount) 		? 	cartDetails.discount 	:0,
										offer_id		: 	cartDetails.offer_id,
										offer_code		: 	(cartDetails.offer_code)	?	cartDetails.offer_code 	:"",
										offer_type		: 	(cartDetails.offer_type)	?	cartDetails.offer_type 	:"",
										delivery_fee	:	(cartDetails.delivery_fees)	?	cartDetails.delivery_fees:0,
										additional_tax	 : 	cartDetails.additional_tax,
										delivery_duration: 	deliveryTime,
										elapsed_time	 : 	deliveryTime,
										preparation_time : 	preparationTime,
										remaining_preparation_time	: 	preparationTime,
										remaining_delivery_duration	: 	deliveryTime,
									};

									if(cartDetails.additional_tax_percentage){
										orderDetailsData.additional_tax_percentage = cartDetails.additional_tax_percentage;
									}

									if(cartDetails.corporate_id){
										orderDetailsData.corporate_id =	new ObjectId(cartDetails.corporate_id);

										if(cartDetails.corporate_discount){
											orderDetailsData.corporate_discount =	cartDetails.corporate_discount;
										}
										if(cartDetails.corporate_delivery_fees){
											orderDetailsData.corporate_delivery_fees =	cartDetails.corporate_delivery_fees;
										}
									}

									/** Save order details */
									order_details.updateOne({order_id: orderId },{$set: orderDetailsData}).then(()=>{
										callback(null);
									}).catch(next);
								},
								order_items : (callback)=>{
									/** Manage item save data */
									let itemSaveData 	= [];
									let modifierItemData= [];
									itemList.map(itemData=>{
										let itemDiscount = (itemData.discount) ? itemData.discount:0;
										let subPrice 	 = (itemData.sub_price) ? itemData.sub_price:0;

										let tempObj = {
											order_id 		: 	orderId,
											order_date 		: 	orderDetails.order_date,
											parent_item_id 	: 	itemData.parent_item_id,
											qty 			: 	itemData.qty,
											item_name 		: 	itemData.item_name,
											// item_image 		:	itemData.copy_image_name,
											item_image 		:	itemData.item_image,
											item_id 		: 	itemData.item_id,
											unit_id 		: 	itemData.unit_id,
											dough_id 		: 	itemData.dough_id,
											selector_id 	: 	itemData.selector_id,
											item_type 		:	itemData.item_type,
											item_main_price :	itemData.item_main_price,
											cuisine_ids		: 	(itemData.cuisine_ids) ? itemData.cuisine_ids :[],
											extra_items 	:	[],
											price			:	itemData.item_price,
											total_extra_item_price:	itemData.total_extra_item_price ? itemData.total_extra_item_price :0,
											sub_total		:	round(subPrice-itemDiscount),
											discounted_price:	itemDiscount,
											net_amount		:	subPrice,
											cart_created	:	itemData.created,
											created 		:	getUtcDate(),
										};

										if(itemData.item_unit_id){
											tempObj.item_unit_id =itemData.item_unit_id;
										}

										if(itemData.unit_lists && itemData.unit_lists.length >0){
											tempObj.unit_lists = itemData.unit_lists;
										}

										/** Manage extra items  */
										if(itemData.extra_items && itemData.extra_items.length >0){
											itemData.extra_items.map(extraItemData=>{
												let groupId = extraItemData.group_id;

												extraItemData.extra_item_ids.map(exItemData=>{

													tempObj.extra_items.push({
														group_id			:	groupId,
														extra_item_id		:	exItemData.extra_item_id,
														extra_item_group_id	:	exItemData.extra_group_item_id,
														extra_item_name		:	exItemData.extra_item_name,
														price				:	exItemData.extra_fees || 0,
														qty					:	exItemData.qty > 0 && parseInt(exItemData.qty) || 1
													});
												});
											});
										}

										itemSaveData.push(tempObj);

										let modifierTmpObj 		=	clone(tempObj);
										modifierTmpObj.is_new	=	true;
										modifierItemData.push(modifierTmpObj);
									});

									/** Save order item details */
									order_items.insertMany(itemSaveData).then(()=>{
										callback(null);
									}).catch(next);
								},
								remove_offer_logs : (callback)=>{
									let cartIds = [];
									itemList.map(itemData=>{
										cartIds.push(itemData._id);
										paymentCartIds.push(itemData._id);
									});

									asyncParallel({
										remove_offer_logs : (subCallback)=>{
											/** Delete logs  */
											tmp_offer_logs.deleteMany({
												cart_ids : {$in: cartIds}
											}).then(()=>{
												subCallback(null);
											}).catch(next);
										},
										update_order_id : (subCallback)=>{
											/** update logs  */
											offer_logs.updateMany({
												cart_ids : {$in: cartIds}
											},
											{
												$set: {
													order_id : orderId,
													modified : getUtcDate(),
												},
												$unset: {
													cart_ids : 1
												},
											}).then(()=>{
												subCallback(null);
											}).catch(next);
										},
										remove_cart : (subCallback)=>{
											/** Remove carts  */
											user_carts.deleteMany({_id: {$in: cartIds} }).then(()=>{
												subCallback(null);
											}).catch(next);
										},
									},(subParallelErr)=>{
										callback(subParallelErr);
									});
								},
								update_outstanding_amount : (callback)=>{
									if(isOutStanding || totalRemaining<=0) return callback(null);

									/** Set refund options */
									let refundOptions	=	{
										order_id		: 	orderId,
										user_id 		: 	userId,
										device_id 		: 	deviceId,
										is_guest		:	isGuest,
										total_refund	:	totalRemaining,
										total_amount	:	orderTotalAmount,
										unique_order_id:	uniqueOrderId
									};
									callRefundAmount(req,res,next,refundOptions).then(refundResponse=>{
										if(refundResponse.status != Constants.STATUS_SUCCESS) return callback(refundResponse);

										callback(null);
									}).catch(next);
								}
							},(asyncParallelErr)=>{
								if(asyncParallelErr) return next(asyncParallelErr);

								/** Save order type */
								this.saveOrderDetails(req,res,next,{order_id: orderId}).then(response=>{
									if(response.status != Constants.STATUS_SUCCESS) return next(response.message);

									/** Send success response  */
									resolve({status: Constants.STATUS_SUCCESS, message: res.__("order.order_has_been_placed_successfully"), outstanding_amount: totalRemaining, remaining_amount :remainingAmount });

									/** Calculate order payout */
									calculateOrderPayout(req,res,next,{order_id:orderId}).then(()=>{});

									/** Save order type */
									this.updateOrderType(req,res,next,{
										user_id 		: 	userId,
										device_id 		: 	deviceId,
										main_order_id 	:	mainOrderId,
									}).then(()=>{

										saveOrderStatusLogs(req,res,next,{
											order_id 		: 	orderId,
											restaurant_id	:	restaurantId,
											updated_by 		: 	userId,
											user_id 		: 	userId,
											user_role_id	:	(userId) ? Constants.CUSTOMER			:"",
											user_type		:	(userId) ? Constants.USER_TYPE_CUSTOMER	:"",
											is_customer		:	(userId) ? true	:false,
											device_id 		: 	deviceId,
											status 			:	orderStatus,
											order_status 	:	orderStatus,
											is_modified     :   true,
											is_admin		:   false,
											is_user			:   false
										}).then(()=>{}).catch(next);
									}).catch(next);

									/** Save payment details */
									if(paymentResponse){
										this.saveUserPaymentDetails(req,res,next,{
											user_id 			: 	userId,
											device_id 			: 	deviceId,
											order_ids 			:	[orderId],
											cart_ids 			:	paymentCartIds,
											payment_method 		:	paymentMethod,
											payment_status 		:	Constants.PAYMENT_SUCCESS,
											payment_response 	:	paymentResponse,
											currency 			:	paymentCurrency,
											amount 				:	orderPrice
										}).then(()=>{ });
									}

									if(isOutStanding){
										sendMailToUsers(req,res,{
											event_type 			: Constants.NOTIFICATION_OVERSTANDING_PAYMENT_MODIFY_ORDER,
											order_id			: orderId,
											unique_order_id		: uniqueOrderId,
											amount				: currencyFormat(totalRemaining),
											customer_id			: userId,
										});
									}
								}).catch(next);
							});
						}).catch(next);
					});
				});
			});
        }).catch(next);
	};// end placeModifierOrderByCustomer()

	/**
	 * Function to modify order
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	 **/
	async modifyOrder (req,res,next){
		return new Promise(resolve=>{
			/** Sanitize Data **/
			req.body 		= sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
			let userId		= (req.body.user_id) 	? 	new ObjectId(req.body.user_id) 	:"";
			let orderId		= (req.body.order_id) 	? 	new ObjectId(req.body.order_id)	:"";
			let deviceId	= (req.body.device_id)	?	req.body.device_id			:"";

			/** Send error response **/
			if((!userId && !deviceId) || !orderId){
				return resolve({status: Constants.STATUS_ERROR, message: res.__("system.missing_parameters"), missing_fields: ["user_id","device_id","order_id"] });
			}

			asyncParallel({
				order_details : (callback)=>{
					/** Set order conditions */
					let orderConditions ={
						_id : orderId
					};

					if(userId){
						orderConditions.customer_id =	userId;
					}else{
						orderConditions.device_id 	=	deviceId;
					}

					/** Get order details */
					const orders = 	this.db.collection(Tables.ORDERS);
					orders.findOne(orderConditions,{projection:{order_date:1}}).then(result=>{
						callback(null,result);
					}).catch(next);
				},
				order_sub_details : (callback)=>{
					/** Get order sub details */
					const order_details = 	this.db.collection(Tables.ORDER_DETAILS);
					order_details.findOne({order_id: orderId},{projection:{preparation_time:1}}).then(result=>{
						callback(null,result);
					}).catch(next);
				},
			},(asyncErr, asyncResponse)=>{
				if(asyncErr) return next(asyncErr);

				/** Send error response */
				if(!asyncResponse.order_details || !asyncResponse.order_sub_details){
					return resolve({status : Constants.STATUS_ERROR, message : res.__("system.invalid_access")});
				}

				let orderDetails 	=	asyncResponse.order_details;
				let orderSubDetails =	asyncResponse.order_sub_details;
				let orderDate		= 	orderDetails.order_date;
				let preparationTime = 	orderSubDetails.preparation_time;
				let isModifiedAllow = 	false;
				let maxModifiedTime	=	"";
				if(preparationTime){
					let preparationHours= (preparationTime/MAX_ORDER_MODIFY_DIVIDED)/MINUTES_IN_A_HOUR;
					maxModifiedTime 	= newDate(addDaysToDate(preparationHours,orderDate));
					let currentTime    	= newDate();

					if(maxModifiedTime > currentTime) isModifiedAllow = true;
				}

				/** Send error response */
				if(!isModifiedAllow){
					return resolve({status : Constants.STATUS_ERROR, message : res.__("orders.not_allowed_to_modify_this_order")});
				}

				/** Add item in cart */
				req.body.is_modified 		= 	true;
				req.body.max_modified_time	=	maxModifiedTime;
				this.reOrder(req,res,next).then(response=>{
					resolve(response);
				}).catch(next);
			});
		}).catch(next);
	};// end modifyOrder()

	/**
	 * Function to cancel modify order
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	 **/
	async cancelModifyOrder (req,res,next){
		return new Promise(resolve=>{
			/** Sanitize Data **/
			req.body 		= sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
			let userId		= (req.body.user_id) 	? 	new ObjectId(req.body.user_id) 	:"";
			let orderId		= (req.body.order_id) 	? 	new ObjectId(req.body.order_id)	:"";
			let deviceId	= (req.body.device_id)	?	req.body.device_id			:"";

			/** Send error response **/
			if((!userId && !deviceId) || !orderId){
				return resolve({status: Constants.STATUS_ERROR, message: res.__("system.missing_parameters"), missing_fields: ["user_id","device_id","order_id"] });
			}

			/** Set cart conditions */
			let cartConditions = {order_id: orderId};

			if(userId){
				cartConditions.customer_id 	=	userId;
			}else{
				cartConditions.device_id 	=	deviceId;
			}

			/** Delete cart list */
			const user_carts = this.db.collection(Tables.USER_CARTS);
			user_carts.deleteMany(cartConditions).then(()=>{
				/** Send success response */
				resolve({status: Constants.STATUS_SUCCESS, message: res.__("orders.items_have_been_removed_from_modified_list") });
			}).catch(next);
		}).catch(next);
	};// end cancelModifyOrder()

	/**
	 * Function to add order review
	 *
	 * @param req	As	Request Data
	 * @param res	As 	Response Data
	 * @param next 	As Callback
	 *
	 * @return json
	 **/
	async addOrderReview (req,res,next) {
		return new Promise(resolve=>{
			/** Sanitize Data **/
			req.body 			= 	sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
			let orderId 		=	(req.body.order_id) 		? 	new ObjectId(req.body.order_id) 	:"";
			let orderUniqueId	=	(req.body.order_unique_id)	?	req.body.order_unique_id 		:"";
			let restaurantId	=	(req.body.restaurant_id)	? 	new ObjectId(req.body.restaurant_id):"";
			let userId 			=	(req.body.user_id) 			? 	new ObjectId(req.body.user_id) 		:"";
			let branchId		=	(req.body.branch_id)		?	new ObjectId(req.body.branch_id)	:"";
			let rating 			= 	(req.body.rating)			?	parseFloat(req.body.rating)		:0;
			let review			=	(req.body.review) 			? 	req.body.review 				:"";

			/** Send error response **/
			if(!orderId || !restaurantId || !userId || !branchId|| !orderUniqueId) return resolve({status:Constants.STATUS_ERROR, message:res.__("system.missing_parameters"),missing_fields:["order_id","restaurant_id","order_unique_id","user_id","branch_id","order_unique_id"]});

			if(rating) return resolve({status : Constants.STATUS_ERROR, message :[{param : "rating", msg :res.__("orders.please_select_rating")}]});
			if(isNaN(rating) || !Constants.VALID_NUMBER_REGEX.test(rating)) return resolve({status : Constants.STATUS_ERROR, message :[{param : "rating", msg :res.__("orders.invalid_rating")}]});

			/** Send error response **/
			let maxRating	= MAX_RATTING;
			if(rating <=0 || rating > maxRating){
				return resolve({status : Constants.STATUS_ERROR, message :[{param : "rating", msg :res.__("orders.rating_greater_than_zero",maxRating)}]});
			}

			/** Get orer review rating details   */
			const order_review_ratings	= this.db.collection(Tables.ORDER_REVIEW_RATINGS);
			order_review_ratings.findOne({
				user_id 		: 	userId,
				restaurant_id 	: 	restaurantId,
				type			:	RATING_TO_RESTAURANT,
				branch_id 		: 	branchId,
				order_id 		: 	orderId,
			}).then(orderReviewDetails=>{

				/** Send error response */
				if(orderReviewDetails) return resolve({status: Constants.STATUS_ERROR, message: res.__("orders.rating_already_given")});

				let currentRatingId = new ObjectId();
				asyncParallel({
					save_rating : (callback)=>{
						/**
						 * Save rating
						 * branch_id is the branch who receiving rating
						 **/
						order_review_ratings.insertOne({
							_id					:	currentRatingId,
							user_id 			: 	userId,
							type				:	RATING_TO_RESTAURANT,
							order_id 			: 	orderId,
							restaurant_id 		: 	restaurantId,
							branch_id 			: 	branchId,
							order_unique_number	:	orderUniqueId,
							rating 				:	rating,
							review 				: 	review,
							created 			:	getUtcDate(),
						}).then(()=>{
							callback(null);
						}).catch(next);
					},
					rating_list : (callback)=>{
						/** Branch rating list  **/
						order_review_ratings.find({
							_id				:	{$ne:currentRatingId},
							restaurant_id 	:	restaurantId,
							branch_id		:	branchId
						},{projection: {rating:1}}).toArray().then(result=>{
							callback(null, result);
						}).catch(next);
					},
				},(asyncErrs,asyncResponse)=>{
					if(asyncErrs) return next(asyncErrs);

					let ratingList	=	(asyncResponse.rating_list)	? asyncResponse.rating_list	:[];
					let ratingCount	=	ratingList.length+1;
					let totalRating	=	rating;
					if(ratingList.length >0){
						ratingList.map(records=>{
							if(records.rating)  totalRating += parseFloat(records.rating);
						});
					}

					/** Calculate rating */
					let avgRating  = (totalRating && ratingCount) ? round(totalRating/ratingCount,0) :0;

					/** Update restaurant branches rating **/
					const restaurant_branches= this.db.collection(Tables.RESTAURANT_BRANCHES);
					restaurant_branches.updateOne({
						_id			 : 	branchId,
						restaurant_id:	restaurantId
					},
					{$set : {
						rating 		:	avgRating,
						modified	:	getUtcDate(),
					}}).then(()=>{

						/** Send success response **/
						resolve({
							status	: 	Constants.STATUS_SUCCESS,
							message	:	res.__("orders.rating_has_been_added_successfully")
						});
					}).catch(next);
				});
			}).catch(next);
		}).catch(next);
	};// end addOrderReview()

	/**
	 * Function to plcae interrupt order
	 *
	 * @param req	As	Request Data
	 * @param res	As 	Response Data
	 * @param next 	As Callback
	 * @param options 	As Callback
	 *
	 * @return json
	 **/
	async placeInterruptOrder  (req,res,next,options) {
		return new Promise(resolve=>{
			let orderId	=	(options.order_id)	?	new ObjectId(options.order_id)	:"";

			/** Send error response **/
			if(!orderId) return resolve({status:Constants.STATUS_ERROR, message:res.__("system.missing_parameters"), missing_fields:["order_id"]});

			const orders 		= 	this.db.collection(Tables.ORDERS);
			const order_items	= 	this.db.collection(Tables.ORDER_ITEMS);
			const order_details = 	this.db.collection(Tables.ORDER_DETAILS);
			asyncParallel({
				order_details : (callback)=>{
					/** Get order details */
					orders.aggregate([
						{$match : {
							_id : orderId
						}},
						{$lookup : {
							from 		 : Tables.USERS,
							localField 	 : "customer_id",
							foreignField : "_id",
							as 			 : "user_details"
						}},
						{$addFields :{
							user_device_type : {$arrayElemAt : ["$user_details.device_details",0]}
						}},
						{$project : {
							_id:0,is_big_order:1, delivery_fee:1, is_confirm:1,order_status:1,net_amount:1,order_price:1, restaurant_name:1, restaurant_id:1, payment_method:1, area_name:1, area_id:1, branch_id:1, request_note:1, delivery_type:1, is_guest:1, customer_id:1, device_id:1, package_id:1, package_delivery_fees:1, is_infinity_user:1, user_mobile_number: {$arrayElemAt : ["$user_details.mobile_number",0]}, payment_id: 1, is_duplicate_order:1, amount_debited_by_wallet: 1, is_first_order:1, is_vip:1,user_device_type: {$arrayElemAt : ["$user_device_type.device_type",0]},full_name:1,first_name:1,last_name:1,mobile_number:1,branch_area_id:1
						}}
					]).toArray().then(result=>{
						callback(null,result?.[0] || null);
					}).catch(next);
				},
				order_sub_details : (callback)=>{
					/** Get order sub details */
					order_details.findOne({
						order_id: orderId
					},{projection:{_id:0, offer_type:1, offer_id:1, offer_code:1, total_amount:1, net_amount:1,discount_price:1, restaurant_long_lat:1, restaurant_longitude:1, restaurant_latitude:1, restaurant_address:1, delivery_fee:1, customer_longitude:1, customer_long_lat:1, customer_latitude:1, delivery_area_id:1, customer_address:1,
					branch_discount_type:1, branch_discount:1, branch_extra_charge: 1, branch_extra_charge_type: 1,  corporate_delivery_fees:1, corporate_discount:1, corporate_id:1, customer_address_id:1, customer_id:1, device_id:1, offer_discount:1, offer_delivery_fees:1, preparation_time:1, delivery_duration:1, payment_method:1, additional_tax:1,additional_tax_percentage:1,
					}}).then(orderReviewDetails=>{
						callback(null,orderReviewDetails);
					}).catch(next);
				},
				item_list : (callback)=>{
					/** Get order item list */
					order_items.find({
						order_id: orderId
					},{projection:{_id: 0, parent_item_id: 1, qty: 1, item_name: 1, item_image: 1, item_id: 1, unit_id: 1, dough_id: 1, selector_id: 1, item_type: 1, note: 1, extra_items: 1, price: 1, sub_total: 1, discounted_price: 1, item_main_price:1, net_amount: 1, item_unit_id: 1, unit_lists: 1, cuisine_ids:1}}).toArray().then(result=>{
						callback(null,result);
					}).catch(next);
				},
				today_order_count: (callback)=>{
					/** Get order count  */
					let currentDate = newDate(newDate("",Constants.CURRENTDATE_START_DATE_FORMAT));
					const unique_order_ids = this.db.collection(Tables.UNIQUE_ORDER_IDS);
					unique_order_ids.findOneAndUpdate({
						order_date: {$gte: currentDate},
					},
					{
						$inc : {
							order_count: 1
						},
						$setOnInsert: {
							order_date : currentDate,
						}
					},{upsert:true, projection :{order_count: 1}}).then(orderCount=>{
						orderCount = orderCount?.order_count+1 || 1;
						callback(null,orderCount);
					}).catch(next);
				},
				main_order_id: (parentCallback)=>{
					/** get order unqiue id **/
					getUniqueId(req,res,next,{type:"main_order_id"}).then(uniqueIdResponse=>{
						parentCallback(null,uniqueIdResponse.result);
					}).catch(next);
				},
				admin_data : (callback)=>{
					const users	=	this.db.collection(Tables.USERS);
					users.findOne({user_role_id : SYSTEM_ADMIN_ROLE_ID},{projection:{_id:1}}).then(adminResult=>{
						callback(null, adminResult);
					}).catch(next);
				},
			},(asyncErr, asyncResponse)=>{
				if(asyncErr) return next(asyncErr);

				/** Send error response */
				if(!asyncResponse.order_details || !asyncResponse.order_sub_details || asyncResponse.item_list.length <=0){
					return resolve({status : Constants.STATUS_ERROR, message : res.__("system.invalid_access")});
				}

				let orderItems	 	=	asyncResponse.item_list;
				let orderData		= 	asyncResponse.order_details;
				let orderSubDetails = 	asyncResponse.order_sub_details;
				let mainOrderId		= 	asyncResponse.main_order_id;
				let adminData 		= 	asyncResponse.admin_data;
				let todayOrderCount = 	(asyncResponse.today_order_count) ? asyncResponse.today_order_count :1;

				let adminId 		= 	(adminData._id) 				? adminData._id 			:"";
				let isGuest 		= 	(orderData.is_guest) 			? orderData.is_guest 		:"";
				let branchId		=	(orderData.branch_id)			? orderData.branch_id 		:"";
				let deviceId		=	(orderData.device_id)			? orderData.device_id		:"";
				let customerId		=	(orderData.customer_id)			? orderData.customer_id		:"";
				let restaurantId	=	(orderData.restaurant_id)		? orderData.restaurant_id 	:"";
				let userDeviceType 	= 	(orderData.user_device_type) 	? orderData.user_device_type:"";
				let userMobileNumber=	(orderData.user_mobile_number)	? orderData.user_mobile_number :"";
				if(isGuest) userMobileNumber = "";

				asyncParallel({
					unique_order_id: (parentCallback)=>{
						/** get order unqiue id **/
						getUniqueId(req,res,next,{type: "orders", order_count: todayOrderCount}).then(uniqueIdResponse=>{
							parentCallback(null,uniqueIdResponse.result);
						}).catch(next);
					},
					invoice_number : (parentCallback)=>{
						/** Set invoice options */
						let invoiceOptions = {
							type 			:	"order_invoice_number",
							platform 		: 	userDeviceType,
							client_number	: 	userMobileNumber,
						};

						/** get invoice unqiue number **/
						getUniqueId(req,res,next,invoiceOptions).then(uniqueIdResponse=>{
							parentCallback(null,uniqueIdResponse.result);
						}).catch(next);
					},
					transaction_id : (parentCallback)=>{
						return parentCallback(null, String(new ObjectId()));
					},
				},(parentParallelErr,parentParallelResponse)=>{
					if(parentParallelErr) return eachCallback(parentParallelErr);

					let uniqueOrderId 	= 	parentParallelResponse.unique_order_id;
					let invoiceNumber 	= 	parentParallelResponse.invoice_number;
					let transactionId	=	parentParallelResponse.transaction_id;
					let newOrderId		=	new ObjectId();

					asyncParallel({
						save_order_details : (childCallback)=>{
							/** Set order save details  */
							let orderSaveData = {
								captain_id		:	"",
								parent_order_id	: 	orderId,
								unique_order_id	: 	uniqueOrderId,
								invoice_number  :   invoiceNumber,
								main_order_id	:	mainOrderId,
								queue_time		:	getUtcDate(),
								number_of_queue : 	Constants.FIRST_REQUEUE_ORDER,
								order_status	: 	Constants.ORDER_SUBMITTED,
								order_date		: 	getUtcDate(),
								last_status_updated_on: getUtcDate(),
								created			:	getUtcDate(),
								modified		:	getUtcDate(),
								customer_id		:	orderData.customer_id,
								device_id		:	orderData.device_id,
								delivery_type	:	orderData.delivery_type,
								request_note	:	orderData.request_note,
								branch_area_id	: 	orderData.branch_area_id,
								branch_id	 	: 	orderData.branch_id,
								area_id		 	: 	orderData.area_id,
								area_name		: 	orderData.area_name,
								payment_method	: 	orderData.payment_method,
								restaurant_id 	: 	orderData.restaurant_id,
								restaurant_name : 	orderData.restaurant_name,
								order_price		:	orderData.order_price,
								net_amount		:	orderData.net_amount,
								is_confirm		:	orderData.is_confirm,
								delivery_fee	: 	orderData.delivery_fee,
								is_big_order	:	orderData.is_big_order,
								is_first_order	:	orderData.is_first_order,
								is_vip			:	orderData.is_vip,
								is_duplicate_order:	orderData.is_duplicate_order,
								full_name		:	orderData.full_name,
								first_name		:	orderData.first_name,
								last_name		:	orderData.last_name,
								mobile_number	:	orderData.mobile_number,
								amount_debited_by_wallet:orderData.amount_debited_by_wallet,
							};

							if(orderData.is_guest)	 orderSaveData.is_guest  =	true;
							if(orderData.payment_id) orderSaveData.payment_id=	orderSaveData.payment_id;

							/** Save package details  */
							if(orderData.package_id){
								orderSaveData.package_id 			= 	orderData.package_id;
								orderSaveData.package_delivery_fees =	orderData.package_delivery_fees;
								orderSaveData.is_infinity_user 		=	true;
							}

							/** Save order details */
							orders.updateOne({_id: newOrderId },{$set: orderSaveData},{upsert: true}).then(()=>{
								childCallback(null);
							}).catch(next);
						},
						save_order_sub_details : (childCallback)=>{
							/** Set order details  */
							let orderDetailsData = {
								order_id			:	newOrderId,
								unique_order_id		:	uniqueOrderId,
								transaction_id		:	transactionId,
								customer_id			:	orderSubDetails.customer_id,
								customer_address_id	:	orderSubDetails.customer_address_id,
								delivery_area_id	: 	orderSubDetails.delivery_area_id,
								customer_address	:	orderSubDetails.customer_address,
								customer_latitude	:	orderSubDetails.customer_latitude,
								customer_longitude	:	orderSubDetails.customer_longitude,
								customer_long_lat	:	orderSubDetails.customer_long_lat,
								restaurant_address	:	orderSubDetails.restaurant_address,
								restaurant_latitude : 	orderSubDetails.restaurant_latitude,
								restaurant_longitude: 	orderSubDetails.restaurant_longitude,
								restaurant_long_lat	:	orderSubDetails.restaurant_long_lat,
								total_amount		: 	orderSubDetails.total_amount,
								net_amount			: 	orderSubDetails.net_amount,
								discount_price		: 	orderSubDetails.discount_price,
								offer_id			: 	orderSubDetails.offer_id,
								offer_code			: 	orderSubDetails.offer_code,
								offer_type			: 	orderSubDetails.offer_type,
								delivery_fee		: 	orderSubDetails.delivery_fee,
								additional_tax		: 	orderSubDetails.additional_tax,
								payment_method		: 	orderSubDetails.payment_method,
								delivery_duration	: 	orderSubDetails.delivery_duration,
								elapsed_time		: 	orderSubDetails.delivery_duration,
								preparation_time	: 	orderSubDetails.preparation_time,
								remaining_preparation_time	: 	orderSubDetails.preparation_time,
								remaining_delivery_duration	: 	orderSubDetails.delivery_duration,
							};

							if(orderSubDetails.additional_tax_percentage){
								orderDetailsData.additional_tax_percentage = orderSubDetails.additional_tax_percentage;
							}

							if(orderSubDetails.device_id){
								orderDetailsData.device_id =	orderSubDetails.device_id;
							}

							if(orderSubDetails.offer_discount){
								orderDetailsData.offer_discount =	orderSubDetails.offer_discount;
							}

							if(orderSubDetails.offer_delivery_fees){
								orderDetailsData.offer_delivery_fees =	orderSubDetails.offer_delivery_fees;
							}

							if(orderSubDetails.corporate_id){
								orderDetailsData.corporate_id =	orderSubDetails.corporate_id;

								if(orderSubDetails.corporate_discount){
									orderDetailsData.corporate_discount =	orderSubDetails.corporate_discount;
								}
								if(orderSubDetails.corporate_delivery_fees){
									orderDetailsData.corporate_delivery_fees =	orderSubDetails.corporate_delivery_fees;
								}
							}

							if(orderSubDetails.branch_extra_charge_type){
								orderDetailsData.branch_extra_charge =	orderSubDetails.branch_extra_charge;
								orderDetailsData.branch_extra_charge_type =	orderSubDetails.branch_extra_charge_type;
							}

							if(orderSubDetails.branch_discount_type){
								orderDetailsData.branch_discount =	orderSubDetails.branch_discount;
								orderDetailsData.branch_discount_type =	orderSubDetails.branch_discount_type;
							}

							/** Save order details */
							order_details.insertOne(orderDetailsData).then(()=>{
								childCallback(null);
							}).catch(next);
						},
						save_item_list : (childCallback)=>{
							/** Manage item save data */
							let itemSaveData = [];
							orderItems.map(itemData=>{
								let tempObj = {
									order_id 		: 	newOrderId,
									order_date		: 	getUtcDate(),
									parent_item_id 	: 	itemData.parent_item_id,
									qty 			: 	itemData.qty,
									item_name 		: 	itemData.item_name,
									item_image 		:	itemData.item_image,
									item_id 		: 	itemData.item_id,
									unit_id 		: 	itemData.unit_id,
									dough_id 		: 	itemData.dough_id,
									selector_id 	: 	itemData.selector_id,
									item_type 		:	itemData.item_type,
									note 			:	itemData.note,
									extra_items 	:	itemData.extra_items,
									price			:	itemData.price,
									total_extra_item_price:	itemData.total_extra_item_price ? itemData.total_extra_item_price :0,
									sub_total		:	itemData.sub_total,
									item_main_price :	itemData.item_main_price,
									cuisine_ids		: 	(itemData.cuisine_ids) ? itemData.cuisine_ids :[],
									discounted_price:	itemData.discounted_price,
									net_amount		:	itemData.net_amount,
									cart_created	:	itemData.created,
									created 		:	getUtcDate(),
								};

								if(itemData.item_unit_id)	tempObj.item_unit_id= itemData.item_unit_id;
								if(itemData.unit_lists) 	tempObj.unit_lists 	= itemData.unit_lists;

								itemSaveData.push(tempObj);
							});

							/** Save order item details */
							order_items.insertMany(itemSaveData).then(()=>{
								childCallback(null);
							}).catch(next);
						},
						update_payment_details : (childCallback)=>{
							/** Update payment transactions details */
							const payment_transactions = 	this.db.collection(Tables.PAYMENT_TRANSACTIONS);
							payment_transactions.updateMany({
								order_ids: {$in: [orderId]}
							},
							{$addToSet:{
								order_ids : newOrderId,
							}}).then(()=>{

								/** Remove old order id form payment transactions */
								payment_transactions.updateMany({
									order_ids: {$in: [newOrderId]}
								},
								{$pull:{
									order_ids : {$in: [orderId]},
								}}).then(()=>{
									childCallback(null);
								}).catch(next);
							}).catch(next);
						},
						update_wallet_logs : (childCallback)=>{
							/** Update Wallet logs */
							const user_wallet_logs = 	this.db.collection(Tables.USER_WALLET_LOGS);
							user_wallet_logs.updateMany({
								"extra_parameters.order_place"	: true,
								"extra_parameters.order_id" 	: orderId
							},
							{$set:{
								"extra_parameters.order_id" : 	newOrderId,
							}}).then(()=>{
								childCallback(null);
							}).catch(next);
						},
						update_old_order : (childCallback)=>{
							/** Cancel last order */
							orders.updateOne({
								_id : orderId
							},
							{$set:{
								order_status 	 		: 	ORDER_CANCELLED,
								rejection_reason 		: 	PACKAGE_GETS_DAMAGED,
								cancelled_user_role_id 	: 	CRAVEZ,
							}}).then(()=>{
								childCallback(null);
							}).catch(next);
						},
						update_order_status : (childCallback)=>{
							/** Update last order status logs */
							saveOrderStatusLogs(req,res,next,{
								updated_by 		: 	adminId,
								user_role_id 	: 	CRAVEZ,
								status 			:	ORDER_CANCELLED,
								order_status	:	orderData.order_status,
								restaurant_id	:	restaurantId,
								order_id 		:	orderId,
								branch_id		:	branchId,
								user_id			:	customerId,
								user_type		:	USER_TYPE_ADMIN,
								not_refund		:	true,
								not_send_notification: true,
							}).then(()=>{
								childCallback(null)
							});
						}
					},(asyncErr, _)=>{
						if(asyncErr) return next(asyncErr);

						/** Send response */
						resolve({status: Constants.STATUS_SUCCESS});

						/** Update new order status logs */
						saveOrderStatusLogs(req,res,next,{
							order_id 		: 	newOrderId,
							restaurant_id	:	restaurantId,
							user_id			:	customerId,
							updated_by 		: 	adminId,
							user_role_id	:	(customerId) ? CUSTOMER				:"",
							user_type		:	(customerId) ? Constants.USER_TYPE_CUSTOMER	:"",
							is_customer		:	(userId) ? true	:false,
							device_id 		: 	deviceId,
							status 			:	Constants.ORDER_SUBMITTED,
							order_status 	:	Constants.ORDER_SUBMITTED,
						}).then(()=>{});
					});
				});
			});
		}).catch(next);
	};// end placeInterruptOrder()

	/**
	 * Function to get orders count
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	 **/
	async getOrdersCount (req,res,next){
		return new Promise(resolve=>{
			/** Sanitize Data **/
			req.body 	= sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
			let userId	= (req.body.user_id) ? new ObjectId(req.body.user_id) :"";

			/** Send error response **/
			if(!userId) return resolve({status : Constants.STATUS_ERROR, message : res.__("system.missing_parameters")});

           	const orders = this.db.collection(Tables.ORDERS);
			asyncParallel({
				accepted_count : (callback)=>{
					/** Set assigned order conditions */
					let assignmentConditions = {
						captain_id 		: userId,
						current_status 	: Constants.ORDER_DRIVER_ASSIGNED
					};

					/** Get assigned order list */
					const order_assignment_logs	= this.db.collection(Tables.ORDER_ASSIGNMENT_LOGS);
					order_assignment_logs.distinct("order_id", assignmentConditions).then(orderIds=>{
						if(orderIds.length <=0) return callback(null,0);

						/** Get accepted orders count */
						orders.countDocuments({_id: {$in: orderIds}}).then(orderCount =>{
							callback(null,orderCount);
						}).catch(next);
					}).catch(next);
				},
				pickup_count : (callback)=>{
					/** Set pickup order conditions */
					let pickupConditions = {
						captain_id 		: 	userId,
						delivery_status	:	{$in: Constants.DRIVER_PICKUP_ORDER_STATUS},
					};

					/** Get pick orders count */
					orders.countDocuments(pickupConditions).then(orderCount =>{
						callback(null,orderCount);
					}).catch(next);
				},
				delivery_count : (callback)=>{
					/** Set delivery order conditions */
					let deliveryConditions = {
						captain_id 		: 	userId,
						delivery_status	:	{$in: Constants.DRIVER_DELIVERED_ORDER_STATUS},
					};

					/** Get delivery orders count */
					orders.countDocuments(deliveryConditions).then(orderCount =>{
						callback(null,orderCount);
					}).catch(next);
				},
			},(err,response)=>{
				if(err) return next(err);

				/** Send response **/
				resolve({
					status			    : Constants.STATUS_SUCCESS,
					accept_order_count  : (response.accepted_count) ? response.accepted_count :0,
					pick_order_count	: (response.pickup_count)   ? response.pickup_count   :0,
					delivery_order_count: (response.delivery_count) ? response.delivery_count :0
				});
			});
		}).catch(next);
	};// end getOrdersCount()

	/**
	 * Function to get restaurant orders count
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	 **/
	async getRestaurantOrdersCount (req,res,next){
		return new Promise(resolve=>{
			/** Sanitize Data **/
			req.body 			=	sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
			let branchId		= 	(req.body.branch_id) 		? 	new ObjectId(req.body.branch_id) 	:"";
			let restaurantId	= 	(req.body.restaurant_id) 	?	new ObjectId(req.body.restaurant_id):"";

			/** Send error response **/
			if(!restaurantId) return resolve({status : Constants.STATUS_ERROR, message : res.__("system.missing_parameters")});

			/** Set order conditions */
			let orderConditions = {
				is_confirm 		: true,
				restaurant_id 	: restaurantId,
			};

			if(branchId) orderConditions.branch_id = branchId;

			const orders = this.db.collection(Tables.ORDERS);
			asyncParallel({
				pending_count : (callback)=>{
					/** Set pending order conditions */
					let pendingConditions = clone(orderConditions);
					pendingConditions.restaurant_status = ORDER_PENDING;

					/** Get accepted orders count */
					orders.countDocuments(pendingConditions).then(orderCount =>{
						callback(null,orderCount);
					}).catch(next);
				},
				preparing_count : (callback)=>{
					/** Set preparing order conditions */
					let preparingConditions = clone(orderConditions);
					preparingConditions.restaurant_status = Constants.ORDER_PREPARING;

					/** Get preparing orders count */
					orders.countDocuments(preparingConditions).then(orderCount =>{
						callback(null,orderCount);
					}).catch(next);
				},
				ready_to_pick_up_count : (callback)=>{
					/** Set ready to pickup order conditions */
					let readyConditions = clone(orderConditions);
					readyConditions.restaurant_status = Constants.ORDER_READY_TO_PICK_UP;

					/** Get ready to pickup orders count */
					orders.countDocuments(readyConditions).then(orderCount =>{
						callback(null,orderCount);
					}).catch(next);
				},
				on_the_way_count : (callback)=>{
					/** Set on the way order conditions */
					let onThewayConditions =	clone(orderConditions);
					onThewayConditions.restaurant_status = Constants.ORDER_ON_THE_WAY;

					/** Get on the way orders count */
					orders.countDocuments(onThewayConditions).then(orderCount =>{
						callback(null,orderCount);
					}).catch(next);
				},
				delivered_count : (callback)=>{
					/** Set delivered order conditions */
					let deliveredConditions =	clone(orderConditions);
					deliveredConditions.restaurant_status = Constants.ORDER_DELIVERED;

					/** Get delivery orders count */
					orders.countDocuments(deliveredConditions).then(orderCount =>{
						callback(null,orderCount);
					}).catch(next);
				},
			},(err,response)=>{
				if(err) return next(err);

				/** Send response **/
				response.status = Constants.STATUS_SUCCESS;
				resolve(response);
			});
		}).catch(next);
	};// end getRestaurantOrdersCount()

	/**
	 * Function to get cancel order reason
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	 **/
	async getCancelReason  (req,res,next){
		return new Promise(resolve=>{
			/** Sanitize Data **/
			req.body 	 = sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
			let userType = (req.body.user_type) ? req.body.user_type 	:"";

			/** Send error response **/
			if(!userType) return resolve({status: Constants.STATUS_ERROR, message: res.__("system.missing_parameters")});

			/** Send error response **/
            if(userType != Constants.USER_TYPE_RESTAURANT && userType != Constants.USER_TYPE_CUSTOMER) return resolve({status: Constants.STATUS_ERROR, message: res.__("system.invalid_access")});

			/** Find cancel reasons **/
			const cancel_reasons = this.db.collection(Tables.CANCEL_REASONS);
            cancel_reasons.find({channel_id : userType,status : Constants.ACTIVE },{projection : {_id:1,title :1}}).sort({order: Constants.SORT_ASC}).toArray().then(reasonResult => {

                /** Send success response */
                resolve({ status: Constants.STATUS_SUCCESS, result: reasonResult});
            }).catch(next);
		}).catch(next);
	};// end getCancelReason()

	/**
	 * Function to pay outstanding amount for order
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	 **/
	async payOutstandingAmountForOrder (req,res,next){
		return new Promise(resolve=>{
			/** Sanitize Data **/
			req.body 	    	= sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
			let restaurantId	= (req.body.restaurant_id) 	  	? 	new ObjectId(req.body.restaurant_id) 	:"";
			let userId			= (req.body.user_id) 	  		? 	new ObjectId(req.body.user_id) 	:"";
			let orderId			= (req.body.order_id) 	  		? 	new ObjectId(req.body.order_id)	:"";
			let deviceId		= (req.body.device_id)	  		?	req.body.device_id			:"";
			let amount      	= (req.body.amount)		  		? 	parseFloat(req.body.amount) :0;
			let paymentType 	= (req.body.payment_type) 		? 	req.body.payment_type 		:"";
			let paymentResponse	= (req.body.payment_response) 	?	req.body.payment_response 	:"";
			let paymentCurrency	= (req.body.payment_currency) 	?	req.body.payment_currency 	:"";
			let transactionId	= (req.body.transaction_id) 	?	req.body.transaction_id 	:"";
			let walletDebitAmount=(req.body.wallet_amount)		?	parseFloat(req.body.wallet_amount):0;
			let isAdmin 		= 	(req.body.is_admin)			?	req.body.is_admin				:false;
			let notSavedLogs 	= 	(req.body.not_saved_logs)	?	req.body.not_saved_logs			:false;

			/** Send error response **/
			if((!userId && !deviceId) || !orderId || !paymentType || !amount){
				return resolve({status: Constants.STATUS_ERROR, message: res.__("system.missing_parameters"), missing_fields: ["user_id","device_id","order_id","amount","payment_type"] });
			}

			if(paymentType != Constants.WALLET_PAYMENT && (!paymentResponse || !paymentCurrency)) return resolve({status: Constants.STATUS_ERROR, message: res.__("system.missing_parameters"), missing_fields: ["payment_currency","payment_response"]});

			/** Set conditions */
			let conditions = {
				_id 				: orderId,
				outstanding_payment : Constants.UNPAID
			};

			if(userId){
				conditions.customer_id = userId;
			}else{
				conditions.device_id = deviceId;
			}

			/** Find order details  **/
			const orders = this.db.collection(Tables.ORDERS);
			orders.findOne(conditions).then(orderResult=>{

				/** Send error response */
				if(!orderResult) return resolve({status: Constants.STATUS_ERROR, message: res.__("admin.system.invalid_access")});

				let onlinePaymentAmount = amount-walletDebitAmount;
				asyncParallel({
					pay_by_wallet : (callback)=>{
						if(!userId || walletDebitAmount<=0 ) return callback(null);

						/** Update wallet  */
						updateWalletBalance(req,res,next,{
							user_id      	: userId,
							amount       	: walletDebitAmount,
							transaction_type: DEBIT,
							order_id		: orderId
						}).then(response=>{
							if(response.status != Constants.STATUS_SUCCESS) return callback(response);
							callback(null);
						}).catch(next);
					},
					pay_by_other : (callback)=>{
						if(paymentType == Constants.WALLET_PAYMENT) return callback(null);

						if(notSavedLogs) return callback(null);

						/** Save payment details */
						this.saveUserPaymentDetails(req,res,next,{
							user_id 			: 	userId,
							device_id 			: 	deviceId,
							order_ids 			:	[orderId],
							payment_method 		:	paymentType,
							payment_status 		:	Constants.PAYMENT_SUCCESS,
							payment_response 	:	paymentResponse,
							currency 			:	paymentCurrency,
							amount 				:	onlinePaymentAmount,
							transaction_id 		:	transactionId,
							gateway_type 		:	(req.body.gateway_type) ? req.body.gateway_type :""
						}).then(response=>{
							if(response.status != Constants.STATUS_SUCCESS) return callback(response);
							callback(null);
						}).catch(next);
					},
					order_logs : (callback)=>{
						/** Get order delivered time */
						const order_status_logs	= this.db.collection(Tables.ORDER_STATUS_LOGS);
						order_status_logs.find({
							order_id 	: 	orderId,
							status 		: 	{$nin: [Constants.ORDER_PAYMENT_PENDING, ORDER_PAYMENT_FAILED]},
						},{projection:{status:1}}).sort({created: Constants.SORT_DESC}).limit(1).toArray().then(result=>{
							let previousStatus = (result && result[0]) ? result[0].status : ((orderResult.is_schedule && !orderResult.scheduled_to_submit_time) ? Constants.ORDER_SCHEDULED :Constants.ORDER_SUBMITTED);
							callback(null,previousStatus);
						}).catch(next);
					},
				},(asyncErr,asyncResponse)=>{
					if(asyncErr) return next(asyncErr);

					let previousStatus	=	(asyncResponse.order_logs) 	  ?	asyncResponse.order_logs 	:'';
					let orderDate		= 	(orderResult.order_date) 	  ? orderResult.order_date 		:"";
					let isSchedule		= 	(orderResult.is_schedule) 	  ? orderResult.is_schedule 	:"";
					let aghzeyaBillNo	= 	(orderResult.aghzeya_bill_no) ? orderResult.aghzeya_bill_no :"";
					let scheduledToSubmitTime= (orderResult.scheduled_to_submit_time) ? orderResult.scheduled_to_submit_time :"";

					/** Set update data */
					let orderSaveData = {
						$set : {
							paid_amount			: 	orderResult.order_price,
							payment_received	: 	true,
							outstanding_payment	: 	PAID,
							modified			:	getUtcDate(),
							is_online_payment_received:	true,
						},
						$inc : {
							amount_debited_by_wallet: walletDebitAmount,
						}
					};

					if(!aghzeyaBillNo && !isSchedule){
						orderSaveData["$set"].order_date 		  =	getUtcDate();
						orderSaveData["$set"].previous_order_date = orderDate;
					}

					if(paymentType == Constants.KNET && onlinePaymentAmount >0){
						let previousPaid	= (orderResult.paid_amount) ? orderResult.paid_amount : 0;
						onlinePaymentAmount = (onlinePaymentAmount-previousPaid);
						let knetValue		= (res.locals.settings['Site.knet_charges']) ? res.locals.settings['Site.knet_charges'] :0;
						let knetCharges		= (knetValue) ? (onlinePaymentAmount*knetValue)/MAX_PERCENTAGE :0;

						if(!orderSaveData["$inc"])	 orderSaveData["$inc"] = {};
						orderSaveData["$inc"].total_knet_amount =	onlinePaymentAmount
						orderSaveData["$inc"].knet_charges 		=	round(knetCharges)
					}

					/** Save order details */
					orders.updateOne({_id: orderId },orderSaveData).then(()=>{

						/** Send success response */
						resolve({status: Constants.STATUS_SUCCESS, message: res.__("orders.outstanding_amount_has_been_paid_successfully"),  updated_status: previousStatus});

						calculateOrderPayout(req,res,next,{order_id: orderId }).then(()=>{ });

						/*************** Send Mail  ***************/
						sendMailToUsers(req,res,{
							event_type 			: NOTIFICATION_ORDER_OUTSTANDING_AMOUNT_PAID,
							order_id			: orderId,
							unique_order_id		: orderResult.unique_order_id,
							amount				: currencyFormat(amount),
							user_id				: userId,
						});
						/*************** Send Mail  ***************/
					}).catch(next);
				});
			}).catch(next);
		}).catch(next);
	};// end payOutstandingAmountForOrder()

	/**
	 * Function to get customer running order list
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	 **/
	async getCustomerRunningOrderList (req,res,next){
		return new Promise(resolve=>{
			/** Sanitize Data **/
			req.body 		= 	sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
			let userId		= 	(req.body.user_id) 		? 	new ObjectId(req.body.user_id) 	:"";
			let deviceId	=	(req.body.device_id)	?	req.body.device_id			:"";
			let orderIds	=	(req.body.order_ids)	?	req.body.order_ids			:"";

			/** Send error response **/
			if(!userId && !deviceId) {
				return resolve({status: Constants.STATUS_ERROR, message: res.__("system.missing_parameters")});
			}

			/** Set conditions **/
			let orderConditions = {
				$or :[
					{is_completed: {$exists: false}},
					{is_completed: {$ne: true}},
				]
			}

			if(orderIds){
				if(orderIds.constructor !== Array) orderIds =[orderIds];
				orderIds = arrayToObject(orderIds);

				orderConditions._id = {$in: orderIds}
			}

			if(userId){
				orderConditions.customer_id = userId;
			}else{
				orderConditions.device_id = deviceId;
			}

			/** Find order details  **/
			const orders = this.db.collection(Tables.ORDERS);
			orders.aggregate([
				{$match : orderConditions},
				{$lookup : {
					from 		 : Tables.ORDER_DETAILS,
					localField 	 : "_id",
					foreignField : "order_id",
					as 			 : "order_detail"
				}},
				{$lookup : {
					from 		 : Tables.PAYMENT_METHODS,
					localField 	 : "payment_method",
					foreignField : "slug",
					as 			 : "payment_method_detail"
				}},
				{$project : {
					_id:1,unique_order_id : 1,order_date : 1, restaurant_name : 1, customer_id : 1,payment_method : 1, customer_status:1, delivery_type:1,net_amount:1,order_price:1,delivery_duration: {$arrayElemAt: ["$order_detail.delivery_duration",0]},delivery_fee: {$arrayElemAt: ["$order_detail.delivery_fee",0]},discount_price: {$arrayElemAt: ["$order_detail.discount_price",0]},preparation_time: {$arrayElemAt : ["$order_detail.preparation_time",0]}, payment_method_title: {$arrayElemAt : ["$payment_method_detail.title",0]},
					is_confirm: 1, order_status: 1,  placed_by: 1, device_id: 1, restaurant_id: 1, is_schedule: 1
				}},
				{$sort : { order_date: Constants.SORT_DESC}}
			]).toArray().then(orderResult=>{

				/** Send success response  */
				resolve({
					status 	:  Constants.STATUS_SUCCESS,
					result  :  orderResult
				});
			}).catch(next);
		}).catch(next);
	};// end getCustomerRunningOrderList()

	/**
	 * Function to update customer address in orders
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	 **/
	async updateCustomerAddressInOrder (req,res,next,options){
		return new Promise(resolve=>{

			let customerAddressId = (options.address_id)? options.address_id: "";
			let orderId			  = (options.order_id)	? options.order_id	: "";
			const order_details	  = this.db.collection(Tables.ORDER_DETAILS);

			if(!customerAddressId || !orderId) return resolve({status : Constants.STATUS_SUCCESS});

			getCustomerAddress(req,res,next,{customer_address_id : customerAddressId}).then(response=>{
				if(response.status != Constants.STATUS_SUCCESS) return resolve({status : response.status,message:response.message});

				let addressDetails = (response.result && response.result[customerAddressId]) ? response.result[customerAddressId] : "";
				if(!addressDetails) return resolve({status : Constants.STATUS_SUCCESS});
				delete addressDetails._id;
				delete addressDetails.modified;
				order_details.updateOne({
					order_id : new ObjectId(orderId)
				},
				{$set : {
					customer_address_detail : 	addressDetails,
					address_updated_at 		: 	getUtcDate(),
					modified				:	getUtcDate()
				}}).then(()=>{

					resolve({status: Constants.STATUS_SUCCESS});

					const orders = this.db.collection(Tables.ORDERS);
					orders.updateOne({_id: new ObjectId(orderId) },{$set : {customer_address_detail: addressDetails }}).then(()=>{ });
				}).catch(next);
			}).catch(next);
		}).catch(next);
	};// end updateCustomerAddressInOrder()

	/**
	 * Function to update customer details in order
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	 **/
	async updateCustomerDetailsInOrder(req,res,next,options){
		return new Promise(resolve=>{
			let customerId	= (options.customer_id)? options.customer_id: "";
			let orderId		= (options.order_id)	? options.order_id	: "";
			const orders	= this.db.collection(Tables.ORDERS);
			const users		= this.db.collection(Tables.USERS);

			if(!customerId || !orderId) return resolve({status : Constants.STATUS_SUCCESS});
			users.findOne({_id : new ObjectId(customerId)},{projection:{full_name:1,first_name:1,last_name:1,mobile_number:1,cust_tele2:1}}).then(result=>{

				if(!result) return resolve({status : Constants.STATUS_SUCCESS});
				delete result._id;

				orders.updateOne({
					_id : new ObjectId(orderId)
				},
				{$set : result}).then(()=>{
					return resolve({status : Constants.STATUS_SUCCESS});
				}).catch(next);
			}).catch(next);
		}).catch(next);
	};// end updateCustomerDetailsInOrder()
}
export default Order;
