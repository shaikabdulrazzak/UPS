import { ObjectId } from 'mongodb';
import clone from 'clone';
import  geolib from 'geolib';
import {parallel as asyncParallel, eachOfSeries, each as asyncEach, series as asyncSeries} from 'async';
import * as Constants from "../../../../config/global_constant.mjs";
import Tables from '../../../../config/database_tables.mjs';
import { addDate, getUtcDate, newDate, arrayToObject, saveOrderStatusLogs,subtractMinute, addDaysToDate, generateTicket, round} from "../../../../utils/index.mjs";

import distance from '../../../../vendor/google-distance/index.js';
distance.apiKey = 	Constants.DISTANCE_GOOGLE_API;

export default class Assignment {

	constructor(db) {
		this.userDB  = db.collection(Tables.USERS);

		this.restaurantDB  = db.collection(Tables.RESTAURANTS);
		this.restaurantBranchDB  = db.collection(Tables.RESTAURANT_BRANCHES);
		this.restaurantBranchAraDB  = db.collection(Tables.RESTAURANT_BRANCH_AREAS);
		this.restaurantBranchAssignmentSlabDB  = db.collection(Tables.RESTAURANT_BRANCH_ASSIGNMENT_SLABS);

		this.googleApiCountLogDB  = db.collection(Tables.GOOGLE_API_COUNT_LOGS);
		this.driverAvailabilitiesDB  = db.collection(Tables.DRIVER_AVAILABILITIES);

		this.orderDB = db.collection(Tables.ORDERS);
		this.orderDetailDB = db.collection(Tables.ORDER_DETAILS);
		this.orderStatusLogDB = db.collection(Tables.ORDER_STATUS_LOGS);

		this.orderAssignmentLogDB = db.collection(Tables.ORDER_ASSIGNMENT_LOGS);
		this.assignmentSlabDB = db.collection(Tables.ASSIGNMENT_SLABS);
		this.orderAssignmentLogStepDB = db.collection(Tables.ORDER_ASSIGNMENT_LOG_STEPS);
		this.orderAssignmentProcessStepDB = db.collection(Tables.ORDER_ASSIGNMENT_PROCESS_STEP_LOGS);
		this.orderAssignmentProcessLogsDB = db.collection(Tables.ORDER_ASSIGNMENT_PROCESS_LOGS);
	}

	/*
	Site Settings:
		--
		Auto Assignment Process
		Order_Assignment.assignment_process

		Request Accept time for captain (In Seconds)
		Order_Assignment.request_accept_time
		-
		Max number of order assigned to a captain (In Minutes)
		Order_Assignment.max_order_assigned_to_captain
		-
		Assignment Buffer time (In Minutes)
		Order_Assignment.assignment_buffer_time
		-
		Assignment Maximum buffer time (In Minutes)
		Order_Assignment.maximum_buffer_time
		suppose 30 minutes is max buffer time then, If preparation time is 30 minutes but no captain available in 30 minutes then 30 min. max buffer time will be added in preparation time and now system find for a captain who is available in 31 min., then 32,33,34.....60 minutes(30 preparation time+30 max buffer time)
		-
		Near By Restaurants Distance in minutes (In Minutes)
		Order_Assignment.near_by_restaurant_distance_in_minutes
		-
		Bike Max distance (In KM)
		Order_Assignment.bike_max_distance
		-
		Car Max distance (In KM)
		Order_Assignment.car_max_distance
	*/

	/**
	 * Function to assign captain for order
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	**/
	async assignCaptainForOrder(req,res,next,options){
		return new Promise(resolve=>{
			const requestAcceptTime	= (res.locals.settings['Order_Assignment.request_accept_time']) ? parseInt(res.locals.settings['Order_Assignment.request_accept_time']) :0;
			const maxOrderAssigned	= (res.locals.settings['Order_Assignment.max_order_assigned_to_captain']) ? parseInt(res.locals.settings['Order_Assignment.max_order_assigned_to_captain']) :0;

			/** Send error response */
			if(!options.order_id || !options.restaurant_id || !options.branch_id || !options.delivery_area_id || !options.area_id || !options.captain_id || !options.customer_id) return resolve({status: Constants.STATUS_ERROR, message: res.__("system.missing_parameters")});

			let orderId 			= 	new ObjectId(options.order_id);
			let restaurantId		= 	new ObjectId(options.restaurant_id);
			let branchId			= 	new ObjectId(options.branch_id);
			let deliveryAreaId		= 	new ObjectId(options.delivery_area_id);
			let areaId				= 	new ObjectId(options.area_id);
			let captainId			= 	new ObjectId(options.captain_id);
			let customerId			= 	new ObjectId(options.customer_id);
			let assignmentType		= 	(options.assignment_type) 		? 	options.assignment_type 				:Constants.AUTOMATIC_ASSIGNMENT;
			let assignedBy			= 	(options.assigned_by) 			? 	new ObjectId(options.assigned_by) 		:"";
			let restaurantLatitude	= 	(options.restaurant_latitude) 	? 	parseFloat(options.restaurant_latitude) :"";
			let restaurantLongitude	=	(options.restaurant_longitude) 	? 	parseFloat(options.restaurant_longitude):"";
			let timeOfArrival		=	(options.time_of_arrival) 		?	options.time_of_arrival 				:0;
			let processId			=	(options.process_id) 			?	options.process_id 						:"";
			let timeOfArrivalDate 	= 	addDate(timeOfArrival/Constants.MINUTES_IN_A_HOUR);

			asyncParallel({
				order_data : (callback)=>{
					/** Get order details  */
					this.orderDB.findOne({_id : orderId },{projection: {customer_distance_from_branch:1,customer_distance_minutes_from_branch:1,unique_order_id:1,assigned_captain:1}}).then(orderRes=>{
						callback(null,orderRes);
					}).catch(next);
				},
				order_details : (callback)=>{
					/** Get order remaining preparation delivery duration time  */
					this.orderDetailDB.findOne({order_id : orderId },{projection: {remaining_preparation_time:1,remaining_delivery_duration:1,customer_latitude:1,customer_longitude:1}}).then(orderPreparationData => {
						callback(null,orderPreparationData);
					}).catch(next);
				}
			},(asyncErr,asyncResponse)=>{
				if(asyncErr) return next(asyncErr);

				/** Send error response */
				if(!asyncResponse.order_details || !asyncResponse.order_data){
					return resolve({ status: Constants.STATUS_ERROR, message: res.__("system.something_going_wrong_please_try_again"), order_not_found: true });
				}

				let orderData 					=	asyncResponse.order_data;
				let orderDetails 				=	asyncResponse.order_details;
				let customerLatitude			= 	orderDetails.customer_latitude;
				let customerLongitude			= 	orderDetails.customer_longitude;
				let customerDistanceFromBranch	= 	(orderData.customer_distance_from_branch) ? orderData.customer_distance_from_branch :0;
				let customerDistanceMinFromBranch= 	(orderData.customer_distance_minutes_from_branch) ? orderData.customer_distance_minutes_from_branch :0;
				let remainingPreparitionTime 	=	parseInt(orderDetails.remaining_preparation_time);
				let remainingDeliveryDuration 	= 	parseInt(orderDetails.remaining_delivery_duration);
				let cancelledTime				= 	addDate(requestAcceptTime/Constants.SECONDS_IN_A_HOUR);
				let uniqueOrderId 				= 	(orderData.unique_order_id) ? orderData.unique_order_id :"";

				/** Send error response */
				if(orderData.assigned_captain) return resolve({status: Constants.STATUS_ERROR, message: res.__("order_assignment.already_assigned_this_order"), already_assigned: true });

				/** Manage this conditions from global constant */
				let userConditions 		=	{...{_id: captainId }, ...Constants.DRIVER_ASSIGNMENT_CONDITIONS};
				userConditions["$and"] 	=	[
					{"$or" : [
						{active_orders:	{$exists: false}},
						{active_orders: {$lt: maxOrderAssigned }}
					]}
				];

				/** Get driver details */
				this.userDB.findOne(userConditions,{projection: {active_orders:1, orders:1}}).then(userData => {

					/** Send error response */
					if(!userData) return resolve({status: Constants.STATUS_ERROR, captain_max_order_limit_or_unavailable: true, message: res.__("system.something_going_wrong_please_try_again") });

					let userOrderList 		=	userData.orders	?	userData.orders	:[];
					let alreadyAssigned 	= 	false;
					let lastAssinedLati 	= 	0;
					let lastAssinedLongi	= 	0;

					if(userOrderList.length >0){
						userOrderList.map(tmpRecords=>{
							if(String(tmpRecords.order_id) == String(orderId)) alreadyAssigned = true;

							lastAssinedLati	 = tmpRecords.customer_latitude;
							lastAssinedLongi = tmpRecords.customer_longitude;
						});
					}

					/** Send error response */
					if(alreadyAssigned) return resolve({status : Constants.STATUS_ERROR, message: res.__("order_assignment.already_assigned_this_order"), already_assigned: true });

					asyncParallel({
						update_user : (callback)=>{
							/** Update driver details */
							this.userDB.updateOne({_id : captainId},{
								$set: {
									order_status  		: 	Constants.ORDER_DRIVER_ASSIGNED,
									delivery_latitude  	: 	restaurantLatitude,
									delivery_longitude 	:	restaurantLongitude
								},
								$inc: {
									active_orders				: 1,
									free_in						: remainingDeliveryDuration,
									order_prepare_remaining_time: remainingPreparitionTime
								},
								$addToSet: {
									orders: {
										order_id			:	orderId,
										unique_order_id		:	uniqueOrderId,
										status				: 	Constants.ORDER_DRIVER_ASSIGNED,
										preparation_time	: 	remainingPreparitionTime,
										free_in				: 	remainingDeliveryDuration,
										branch_latitude  	: 	restaurantLatitude,
										branch_longitude 	:	restaurantLongitude,
										customer_latitude	: 	customerLatitude,
										customer_longitude	: 	customerLongitude,
										customer_to_branch_distance: customerDistanceFromBranch,
										customer_to_branch_distance_minutes: customerDistanceMinFromBranch,
										have_customer_latlong:	(customerLatitude && customerLongitude) ? true :false,
									}
								}
							}).then(()=>{

								if(customerLatitude && customerLongitude && lastAssinedLati && lastAssinedLongi){
									/** Get last assigned order customer to current assigned order customer  */
									this.getDistanceBetweenLocations(req,res,next,{
										order_id 		: orderId,
										process_id 		: processId,
										assignment_type : assignmentType,
										locations: [{
											latitude	: customerLatitude,
											longitude	: customerLongitude
										}],
										pickup_latitude : lastAssinedLati,
										pickup_longitude: lastAssinedLongi,
									}).then(locationResponse=>{
										let disLocations 	= (locationResponse.locations)		?	locationResponse.locations[0] 	:{};
										let tmpDistance	 	= (disLocations.distance_in_km)		?	disLocations.distance_in_km		:0;
										let tmpDistanceInMin= (disLocations.distance_in_minutes)?	disLocations.distance_in_minutes:0;

										/** Save customer distance */
										this.userDB.updateOne({
											_id		: 	captainId,
											orders	:	{$elemMatch: {order_id: orderId } }
										},
										{$set :{
											"orders.$.customer_to_customer_invalid" 		: 	disLocations.invalid,
											"orders.$.customer_to_customer_distance" 		: 	parseFloat(tmpDistance),
											"orders.$.customer_to_customer_distance_minutes":	parseFloat(tmpDistanceInMin)
										}}).then(()=>{
											callback(null);
										}).catch(next);
									}).catch(next);
								}else{
									callback(null);
								}
							}).catch(next);
						},
						insert_in_assignment_log : (callback)=>{
							/** Save order assignment logs */
							this.orderAssignmentLogDB.insertOne({
								order_id 			: orderId,
								restaurant_id		: restaurantId,
								branch_id			: branchId,
								area_id				: areaId,
								delivery_area_id	: deliveryAreaId,
								captain_id 			: captainId,
								customer_id 		: customerId,
								assignment_type 	: assignmentType,
								cancelled_at 		: getUtcDate(cancelledTime),
								status 				: Constants.ORDER_DRIVER_ASSIGNED,
								current_status		: Constants.ORDER_DRIVER_ASSIGNED,
								request_assigned_by : assignedBy,
								created 			: getUtcDate()
							}).then(orderAssignmentRes=>{
								callback(null, orderAssignmentRes);
							}).catch(next);
						},
						update_in_order : (callback)=>{
							/** Update order details */
							this.orderDB.updateOne({_id : orderId},{
								$set: {
									assigned_captain		: 	captainId,
									assigned_captain_status	: 	Constants.ORDER_DRIVER_ASSIGNED,
									time_of_arrival			:	getUtcDate(timeOfArrivalDate),
									assignment_type 		:	assignmentType
								}
							}).then(()=>{
								callback(null);
							}).catch(next);
						},
					},(userUpdateErr)=>{
						if(userUpdateErr) return next(userUpdateErr);

						/** Save order status logs */
						saveOrderStatusLogs(req,res,next,{
							order_id 		: 	orderId,
							user_id			:	captainId,
							assigned_by 	: 	assignedBy,
							updated_by 		: 	captainId,
							user_role_id	:	Constants.DRIVER,
							user_type		:	Constants.DRIVER,
							status 			:	Constants.ORDER_DRIVER_ASSIGNED,
							order_status 	:	Constants.ORDER_DRIVER_ASSIGNED,
						}).then(()=>{

							/** Send success response */
							resolve({
								status			: Constants.STATUS_SUCCESS,
								captain_found	: true,
								message			: res.__("order_assignment.captain_assigned")
							});
						});
					});
				}).catch(next);
			});
		}).catch(next);
	};// end assignCaptainForOrder()

	/**
	 * This function accepts order id and assign captain for the order
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	**/
	async assignCaptainByOrderId  (req,res,next,options){
		return new Promise(resolve=>{
			/** Send error response */
			if(!options.order_id) return resolve({status: Constants.STATUS_ERROR, message: res.__("system.missing_parameters")});

			let saveAssignmentLogId =	new ObjectId();
			let orderId 			=	new ObjectId(options.order_id);

			asyncParallel({
				order_data : (callback)=>{
					this.orderDB.findOne({_id : orderId}).then(orderDetailsData=> {
						callback(null,orderDetailsData);
					}).catch(next);
				},
				order_details : (callback)=>{
					this.orderDetailDB.findOne({order_id: orderId }).then(orderDetailsData=> {
						callback(null,orderDetailsData);
					}).catch(next);
				},
				preparing_status_details : (callback)=>{
					this.orderStatusLogDB.findOne({
						order_id 	: 	orderId,
						status 		:	{$in: [Constants.ORDER_PREPARING,Constants.ORDER_READY_TO_PICK_UP]}
					}).then(orderDetailsData=> {
						callback(null,orderDetailsData);
					}).catch(next);
				},
				save_assignment_logs : (callback)=>{
					callback(null);

					this.saveAssignmentLogs(req,res,next,{
						order_id	: orderId,
						log_type	: "process_start",
						process_id	: saveAssignmentLogId
					}).then(()=>{ });
				},
			},(asyncErr,asyncResponse)=>{
				if(asyncErr) return next(asyncErr);

				/** Send error response */
				if(!asyncResponse.order_data || !asyncResponse.order_details) return resolve({
					status: Constants.STATUS_ERROR, order_not_found: true, message: res.__("system.something_going_wrong_please_try_again"),
				});

				let orderData  	  			= 	asyncResponse.order_data;
				let orderDetails  			= 	asyncResponse.order_details;
				let preparingStatusDetails 	= 	asyncResponse.preparing_status_details;
				let preparingStatusDate 	=	(preparingStatusDetails && preparingStatusDetails.created) ? preparingStatusDetails.created :newDate();
				let orderProcessMaxTime 	=	newDate(subtractMinute(Constants.ORDER_PROCESS_TIME_IN_MINUTES));

				this.saveAssignmentLogs(req,res,next,{
					order_id		: 	orderId,
					log_type		: 	"save_unique_order_id",
					process_id		: 	saveAssignmentLogId,
					unique_order_id	:	orderData.unique_order_id
				}).then(()=>{ });

				if(!orderData.order_assignment_process_time || newDate(orderData.order_assignment_process_time) < orderProcessMaxTime){
					/* Add order assignment process time field */
					this.orderDB.updateOne({
						_id : orderId
					},{
						$set: {
							order_assignment_process_time: getUtcDate()
						}
					}).then(()=>{
						this.findCaptainForOrder(req,res,next,{
							order_details			: orderDetails,
							order_data				: orderData,
							save_assignment_log_id	: saveAssignmentLogId
						}).then(response=>{

							/* Unset order assignment process time field */
							this.orderDB.updateOne({
								_id : orderId
							},{
								$unset: {
									order_assignment_process_time: 1
								}
							}).then(()=>{
								if(response.captain_max_order_limit_or_unavailable){
									/* find for other captain */
									this.assignCaptainByOrderId(req,res,next,{order_id: orderId }).then(assignmentResponse=>{
										return resolve(assignmentResponse);
									}).catch(next);
								}else{
									if(response.status == Constants.STATUS_ERROR || response.captain_found) return resolve(response);

									asyncParallel({
										update_order_details : (subCallback)=>{
											if(!response.exceed_max_distance || orderData.exceed_max_distance) return subCallback(null);

											/** Update order details when max distance exceed  */
											this.orderDB.updateOne({
												_id : orderId
											},
											{$set: {
												exceed_max_distance: getUtcDate(),
											}}).then(()=>{
												subCallback(null);
											}).catch(next);
										},
									},()=>{

										let orderPreparationTime 	=	(orderDetails.preparation_time) ? orderDetails.preparation_time :0;
										let hours	  				= 	orderPreparationTime/Constants.MINUTES_IN_A_HOUR;
										let checkDate 				=	newDate(addDaysToDate(hours,preparingStatusDate));

										/** Check preparation time is more than current time like preparation time 2.30 or current time is 2.00 */
										if(checkDate > newDate()) return resolve(response);

										/** Update assign to fleet  */
										this.orderDB.updateOne({
											_id : orderId
										},
										{$set: {
											is_assign_to_fleet		: 	true,
											assign_to_fleet_time	:	getUtcDate(checkDate),
										}}).then(()=>{

											/* Assign order to fleet(Generate ticket): order should assign only once */
											generateTicket(req,res,next,{
												type 		:  Constants.AUTOMATED_TICKET_FOR_DRIVER_NOT_AVAILABLE,
												order_id	:  orderId,
											}).then(ticketResponse=>{
												if(ticketResponse.status == Constants.STATUS_ERROR) return resolve(ticketResponse);

												resolve(response);
											}).catch(next);
										}).catch(next);
									});
								}
							}).catch(next);
						}).catch(next);
					}).catch(next);
				}else{
					resolve({ status: Constants.STATUS_ERROR, message: res.__("Assignment already in process") });
				}
			});
		}).catch(next);
	};// end assignCaptainByOrderId()

	/**
	 * Function to find captain
	 *
	 * @param req		As 	Request Data
	 * @param res		As 	Response Data
	 * @param next		As 	Callback argument to the middleware function
	 * @param options	As	data object
	 *
	 * @return json
	**/
	async findCaptainForOrder  (req,res,next,options){
		return new Promise(resolve=>{
			let orderData 			= 	(options.order_data) 				? 	options.order_data 								:{};
			let orderDetails 		= 	(options.order_details) 			? 	options.order_details 							:{};
			let orderId				= 	(orderData._id) 					? 	new ObjectId(orderData._id) 						:"";
			let restaurantId		= 	(orderData.restaurant_id)			? 	new ObjectId(orderData.restaurant_id)				:"";
			let branchId			=	(orderData.branch_id) 				?	new ObjectId(orderData.branch_id) 					:"";
			let deliveryAreaId		=	(orderDetails.delivery_area_id)		? 	new ObjectId(orderDetails.delivery_area_id)			:"";
			let areaId				= 	(orderData.area_id) 				? 	new ObjectId(orderData.area_id) 					:"";
			let customerId			= 	(orderData.customer_id) 			?	new ObjectId(orderData.customer_id) 				:"";
			let restaurantLatitude	= 	(orderDetails.restaurant_latitude) 	? 	parseFloat(orderDetails.restaurant_latitude) 	:"";
			let restaurantLongitude	= 	(orderDetails.restaurant_longitude) ? 	parseFloat(orderDetails.restaurant_longitude)	:"";
			let customerLatitude	=	(orderDetails.customer_latitude) 	?	parseFloat(orderDetails.customer_latitude)		:"";
			let customerLongitude	= 	(orderDetails.customer_longitude) 	? 	parseFloat(orderDetails.customer_longitude) 	:"";
			let transferFromBranch	= 	(orderDetails.order_transfer_id) 	? 	new ObjectId(orderDetails.order_transfer_id) 		:"";
			let problemType			= 	(orderData.problem_type) 			? 	orderData.problem_type 							:"";
			let pickupLat			= 	(orderData.pickup_lat) 				? 	orderData.pickup_lat 							:0;
			let pickupLong			= 	(orderData.pickup_long)				?	orderData.pickup_long							:0;
			let customerDistance	= 	(orderData.customer_distance_from_branch)?	orderData.customer_distance_from_branch		:0;
			let invalidCustomerDistance	= 	(orderData.invalid_customer_distance)?orderData.invalid_customer_distance			:false;
			let assignedCaptain		= 	{};
			let captainFound		= 	false;
			let saveAssignmentLogId	= 	options.save_assignment_log_id;
			let captainFoundWhichPriority = "";
			const carMaxDistance	=	(res.locals.settings['Order_Assignment.car_max_distance']) ? parseInt(res.locals.settings['Order_Assignment.car_max_distance'])   :0;
			const bikeMaxDistance	= 	(res.locals.settings['Order_Assignment.bike_max_distance']) ? parseInt(res.locals.settings['Order_Assignment.bike_max_distance']) :0;

			/** Send success response */
			if(!restaurantLatitude || !restaurantLongitude){
				return resolve({status: Constants.STATUS_SUCCESS, captain_found: captainFound , message: res.__("Restaurant lat long problem"), });
			}

			/** Send success response */
			if(problemType && (!pickupLat || !pickupLong)){
				return resolve({ status:  Constants.STATUS_SUCCESS, captain_found: captainFound, message: res.__("Pickup lat long problem"), });
			}

			/** When order is transferred from branch A to branch B then, in assignment process, to consider the values of delivery methods of branch A on area ABC */
			let newBranchId = (transferFromBranch) ? transferFromBranch : branchId;

			let orderPickupLatitude 	= 	(problemType)	? 	pickupLat	:restaurantLatitude;
			let orderPickupLongitude 	= 	(problemType) 	?	pickupLong 	:restaurantLongitude;
			let assignmentProcessId 	= 	new ObjectId();
			let distanceOptions 		=	{
				order_id 		: orderId,
				process_id 		: assignmentProcessId,
				locations: [{
					latitude	: customerLatitude,
					longitude	: customerLongitude
				}],
				pickup_latitude : orderPickupLatitude,
				pickup_longitude: orderPickupLongitude,
			};

			asyncParallel({
				previously_assigned_captains : (callback)=>{
					/* get previously assigned captain ids of this order */
					this.orderAssignmentLogDB.distinct("captain_id",{order_id:orderId}).then(captainIds=>{
						callback(null,captainIds);
					}).catch(next);
				},
				customer_distance : (callback)=>{
					if(!customerLatitude || !customerLatitude) return callback(null,{invalid: false, distance:0});

					if(customerDistance) return callback(null,{invalid: false, distance: customerDistance});

					if(invalidCustomerDistance) return callback(null,{invalid: false, distance: 0});

					/* get distance between two location */
					let tmpDisOpt = clone(distanceOptions);
					this.getDistanceBetweenLocations(req,res,next,tmpDisOpt).then(locationResponse=>{
						if(locationResponse.status == Constants.STATUS_ERROR) return callback(null,{invalid:true, response:locationResponse});

						let disLocations 	= (locationResponse.locations)		?	locationResponse.locations[0] 	:{};
						let tmpDistance	 	= (disLocations.distance_in_km)		?	disLocations.distance_in_km		:0;
						let tmpDistanceInMin= (disLocations.distance_in_minutes)?	disLocations.distance_in_minutes:0;
						let invalid	 	 	= (disLocations.invalid)			?	disLocations.invalid			:0;

						// if(invalid) return callback(null,{invalid:true, distance:0, response:locationResponse});

						/** Save customer distance logs */
						this.orderDB.updateOne({
							_id: orderId
						},
						{$set: {
							invalid_customer_distance		 	 : invalid,
							customer_distance_from_branch		 : parseFloat(tmpDistance),
							customer_distance_minutes_from_branch: parseFloat(tmpDistanceInMin)
						}}).then(()=>{
							callback(null,{invalid: invalid, distance: tmpDistance, response:locationResponse});
						}).catch(next);
					}).catch(next);
				},
				branch_details : (callback)=>{
					/** Get branch details */
					this.restaurantBranchDB.findOne({_id : newBranchId },{projection: {delivery_vehicle_type:1}}).then(beResult => {
						callback(null,beResult);
					}).catch(next);
				},
				restaurant_details : (callback)=>{
					/** Get restaurant details */
					this.restaurantDB.findOne({_id : restaurantId },{projection: {delivery_vehicle_type:1}}).then(beResult => {
						callback(null,beResult);
					}).catch(next);
				},
				branch_attribute_data : (callback)=>{
					/** Get branch attribute data */
					this.restaurantBranchAraDB.findOne({
						restaurant_id 	: restaurantId,
						branch_id 		: newBranchId,
						area_id 		: deliveryAreaId
					},{projection: {delivery_vehicle_type:1,driver_selection_type:1}}).then(areasResult => {

						let vehicleTypes 	= (areasResult && areasResult.delivery_vehicle_type ) ? areasResult.delivery_vehicle_type :[];
						let selectionType 	= (areasResult && areasResult.driver_selection_type ) ? areasResult.driver_selection_type :"";

						callback(null,{driver_selection_type: selectionType, area_vehicle_type: vehicleTypes});
					}).catch(next);
				},
			},(asyncErr,asyncResponse)=>{
				if(asyncErr) return next(asyncErr);

				let customerDistance 	=	asyncResponse.customer_distance;
				let branchDetails	 	=	(asyncResponse.branch_details) 			?	asyncResponse.branch_details 		:{};
				let restDetails	 		=	(asyncResponse.restaurant_details) 		? 	asyncResponse.restaurant_details 	:{};
				let branchAttributeData	=	(asyncResponse.branch_attribute_data) 	? 	asyncResponse.branch_attribute_data :{};
				let restVehicleTypes 	=	(restDetails.delivery_vehicle_type) 	? 	restDetails.delivery_vehicle_type	:[];
				let branchVehicleTypes 	=	(branchDetails.delivery_vehicle_type) 	? 	branchDetails.delivery_vehicle_type	:[];
				let areaVehicleTypes	=	(branchAttributeData.area_vehicle_type)	? 	branchAttributeData.area_vehicle_type :[];

				let finalVehicleTypes	=	restVehicleTypes;
				let deliveryMethodExtractedFrom = "Restaurant";
				if(areaVehicleTypes.length > 0){
					finalVehicleTypes 			= areaVehicleTypes;
					deliveryMethodExtractedFrom = "Area";
				}else if(branchVehicleTypes.length > 0) {
					finalVehicleTypes 			= branchVehicleTypes;
					deliveryMethodExtractedFrom = "Branch";
				}
				let isDriverSelectionOnPriority	= (branchAttributeData.driver_selection_type && branchAttributeData.driver_selection_type==Constants.PRIORITY && finalVehicleTypes.length==1) ? true : false;

				let firstTimeVehicleTypes 	= finalVehicleTypes;
				let priorityVehicleTypes 	= [];
				if(options.is_assignment_on_priority){
					finalVehicleTypes 	= (finalVehicleTypes.indexOf(Constants.VEHICLE_TYPE_CAR) >= 0) ? [Constants.VEHICLE_TYPE_BIKE] : [Constants.VEHICLE_TYPE_CAR];
					priorityVehicleTypes= finalVehicleTypes;
				}

				let onlyHaveOneVehicle = (finalVehicleTypes.length == 1) ? true :false;

				/** Save assignment process logs */
				this.saveAssignmentLogs(req,res,next,{
					order_id						: orderId,
					log_type						: "customer_distance",
					process_id						: saveAssignmentLogId,
					delivery_method_extracted_from	: deliveryMethodExtractedFrom,
					customer_distance: {
						carMaxDistance 	: carMaxDistance,
						bikeMaxDistance : bikeMaxDistance,
						distanceOptions : distanceOptions,
						distance 		: (customerDistance.distance) ? customerDistance.distance :0,
						response 		: (customerDistance.response) ? customerDistance.response :{},
						final_vehicle_type			:	finalVehicleTypes,
						restaurant_vehicle_type		:	restVehicleTypes,
						branch_vehicle_type			: 	branchVehicleTypes,
						area_vehicle_type			:	areaVehicleTypes,
						new_branch_id				:	newBranchId,
						is_assignment_on_priority	:	priorityVehicleTypes,
						first_time_vehicle_types	:	firstTimeVehicleTypes,
					}
				}).then(()=>{ });

				/** Send error response */
				let customerDistanceInKm = asyncResponse.customer_distance.distance;
				if(!onlyHaveOneVehicle && customerDistanceInKm && carMaxDistance < customerDistanceInKm && bikeMaxDistance < customerDistanceInKm){
					return resolve({status: Constants.STATUS_SUCCESS, exceed_max_distance: true, message: res.__("Assignment max distance reached") });
				}

				let optimalOptions 							= 	clone(options);
				optimalOptions.customer_distance			= 	customerDistanceInKm;
				optimalOptions.distance_in_km				= 	customerDistanceInKm;
				optimalOptions.previously_assigned_captains	=	asyncResponse.previously_assigned_captains;
				optimalOptions.assignment_process_id 		= 	assignmentProcessId;
				if(options.is_assignment_on_priority) optimalOptions.is_assignment_on_priority = true;

				/** Save assignment process logs */
				this.saveAssignmentProcessLogs(req,res,next,{
					order_id 					: 	orderId,
					driver_ids 					: 	[],
					process_id				 	:	assignmentProcessId,
					assignment_process_details 	:	{},
				}).then(()=>{});

				let processDriverIds 	 		= 	[];
				let allCaptainIds 	 			= 	[];
				let assignmentProcessDetails 	=	{};
				asyncSeries({
					find_already_assigned_captains_same_customer: (callback)=>{
						if(problemType)  return callback(null,null);

						/* first priority with same customer : find assigned captains, who is already assigned to the same restaurant */
						optimalOptions.priority_type = "find_already_assigned_captains";
						optimalOptions.same_customer = true;

						this.findOptimalCaptains(req,res,next,optimalOptions).then((assignmentResponse)=>{
							assignmentProcessDetails["find_already_assigned_captains_same_customer"] = (assignmentResponse.captain_found) ? assignmentResponse.assigned_captain._id :"";

							if(assignmentResponse.all_captain_ids && assignmentResponse.all_captain_ids.length > 0){
								allCaptainIds	=	allCaptainIds.concat(assignmentResponse.all_captain_ids);
							}

							if(assignmentResponse.captain_found) {
								assignedCaptain 	= 	assignmentResponse.assigned_captain;
								captainFound		= 	true;
								processDriverIds.push(assignedCaptain._id);
								captainFoundWhichPriority = "find_already_assigned_captains_same_customer";
							}
							callback(null,assignmentResponse);
						});
					},
					find_already_assigned_captains: (callback)=>{
						if(problemType)  return callback(null,null);

						/* first priority with different customer : find assigned captains, who is already assigned to the same restaurant */
						if(captainFound) return callback(null,null);

						if(optimalOptions.same_customer) delete optimalOptions.same_customer;

						optimalOptions.priority_type = "find_already_assigned_captains";
						this.findOptimalCaptains(req,res,next,optimalOptions).then((assignmentResponse)=>{
							assignmentProcessDetails["find_already_assigned_captains"] = (assignmentResponse.captain_found) ? assignmentResponse.assigned_captain._id :"";

							if(assignmentResponse.all_captain_ids && assignmentResponse.all_captain_ids.length > 0){
								allCaptainIds	=	allCaptainIds.concat(assignmentResponse.all_captain_ids);
							}

							if(assignmentResponse.captain_found) {
								assignedCaptain = assignmentResponse.assigned_captain;
								captainFound	= true;
								processDriverIds.push(assignedCaptain._id);
								captainFoundWhichPriority = "find_already_assigned_captains";
							}
							callback(null,assignmentResponse);
						});
					},
					find_max_buffer_captains: (callback)=>{
						/* Second priority : find captain by adding max buffer in preparation time, captain who is available more than actual preparation time  will be assigned first in this case
							like
								preparation time		= 	20,
								max buffer time 		= 	10,
								total preparation time	=	30 (preparation time + max buffer time)
								or captains are available 18, 20, 21, 28, 29 minutes
								than order is assign to 21 minutes
						*/
						if(captainFound) return callback(null,null);

						optimalOptions.priority_type = "find_max_buffer_captains";
						this.findOptimalCaptains(req,res,next,optimalOptions).then((assignmentResponse)=>{
							assignmentProcessDetails["find_max_buffer_captains"] = (assignmentResponse.captain_found) ? assignmentResponse.assigned_captain._id :"";

							if(assignmentResponse.all_captain_ids && assignmentResponse.all_captain_ids.length > 0){
								allCaptainIds	=	allCaptainIds.concat(assignmentResponse.all_captain_ids);
							}

							if(assignmentResponse.captain_found) {
								assignedCaptain = assignmentResponse.assigned_captain;
								captainFound	= true;
								processDriverIds.push(assignedCaptain._id);
								captainFoundWhichPriority = "find_max_buffer_captains";
							}
							callback(null,assignmentResponse);
						});
					},
				},async (seriesErr,seriesResponse)=>{
					if(seriesErr) return next(seriesErr);

					/** Save assignment logs */
					this.saveAssignmentLogs(req,res,next,{
						order_id			: orderId,
						log_type			: "all_driver",
						process_id			: saveAssignmentLogId,
						order_details		: orderData,
						order_sub_details	: orderDetails,
						all_captain_ids		: allCaptainIds,
						restaurant_latitude	: restaurantLatitude,
						restaurant_longitude: restaurantLongitude,
						pickup_details		: {
							latitude 		:	orderPickupLatitude,
							longitude 		: 	orderPickupLongitude,
						},
					}).then(()=>{ });

					/** Send response */
					if(seriesResponse.find_already_assigned_captains_same_customer && seriesResponse.find_already_assigned_captains_same_customer.status == Constants.STATUS_ERROR) return resolve(seriesResponse.find_already_assigned_captains_same_customer);
					if(seriesResponse.find_already_assigned_captains && seriesResponse.find_already_assigned_captains.status == Constants.STATUS_ERROR) return resolve(seriesResponse.find_already_assigned_captains);
					if(seriesResponse.find_max_buffer_captains && seriesResponse.find_max_buffer_captains.status == Constants.STATUS_ERROR) return resolve(seriesResponse.find_max_buffer_captains);

					/** Save assignment process logs */
					this.saveAssignmentProcessLogs(req,res,next,{
						order_id 					: 	orderId,
						driver_ids 					: 	processDriverIds,
						process_id				 	:	optimalOptions.assignment_process_id,
						assignment_process_details 	:	assignmentProcessDetails,
					}).then(()=>{});

					if(!captainFound){

						/** If driver selection type in branch area option is set to “Priority”, system, in auto-assignment process, will search for selected delivery method (car or bike). If found then ok. If no driver found (in all scenarios and all slabs) then system will search for drivers with other delivery method. */
						if(isDriverSelectionOnPriority && !options.is_assignment_on_priority){
							options.is_assignment_on_priority = true;

							let tmpDriverAssignDetails =  await this.findCaptainForOrder(req,res,next,options);
							return resolve(tmpDriverAssignDetails);

						}else{
							/** Save assignment logs */
							this.saveAssignmentLogs(req,res,next,{
								order_id			: orderId,
								log_type			: "assigned_driver",
								process_id			: saveAssignmentLogId,
								order_details		: orderData,
								order_sub_details	: orderDetails,
								assigned_driver 	: {},
								captain_found_which_priority : captainFoundWhichPriority,
							}).then(()=>{ });
						}

						/** Send response */
						return resolve({status:	Constants.STATUS_SUCCESS, captain_found: captainFound, message: res.__("No captain available at the moment"),});
					}

					/** Assign order to captain  */
					this.assignCaptainForOrder(req,res,next,{
						order_id 				: orderId,
						restaurant_id 			: restaurantId,
						branch_id 				: branchId,
						delivery_area_id 		: deliveryAreaId,
						area_id 				: areaId,
						captain_id 				: assignedCaptain._id,
						time_of_arrival 		: assignedCaptain.time_of_arrival,
						customer_id 			: customerId,
						restaurant_latitude 	: restaurantLatitude,
						restaurant_longitude 	: restaurantLongitude,
						process_id				: optimalOptions.assignment_process_id,
					}).then((assignCaptainResponse)=>{

						/** Send response */
						resolve(assignCaptainResponse);

						/** Save assignment logs */
						this.saveAssignmentLogs(req,res,next,{
							order_id			: orderId,
							log_type			: "assigned_driver",
							process_id			: saveAssignmentLogId,
							order_details		: orderData,
							order_sub_details	: orderDetails,
							assigned_driver 	: assignedCaptain,
							captain_found_which_priority : captainFoundWhichPriority,
						}).then(()=>{ });
					});
				});
			});
        }).catch(next);
	};// end findCaptainForOrder()

	/**
	 * Function to get distance between locations
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	**/
	async findOptimalCaptains  (req,res,next,options){
		return new Promise(resolve=>{
			const maximumBufferTime		= (res.locals.settings['Order_Assignment.maximum_buffer_time']) ? parseInt(res.locals.settings['Order_Assignment.maximum_buffer_time']) :0;
			const assignmentBufferTime	= (res.locals.settings['Order_Assignment.assignment_buffer_time'])? parseInt(res.locals.settings['Order_Assignment.assignment_buffer_time']) :0;
			const maxOrderAssigned		= (res.locals.settings['Order_Assignment.max_order_assigned_to_captain']) ? parseInt(res.locals.settings['Order_Assignment.max_order_assigned_to_captain']) :0;
			const carMaxDistance		= (res.locals.settings['Order_Assignment.car_max_distance']) ? parseInt(res.locals.settings['Order_Assignment.car_max_distance']) :0;
			const bikeMaxDistance		= (res.locals.settings['Order_Assignment.bike_max_distance']) ? parseInt(res.locals.settings['Order_Assignment.bike_max_distance']) :0;

			let previouslyAssignedCaptains= (options.previously_assigned_captains) ? options.previously_assigned_captains 		:[];
			let orderData 			=	(options.order_data) 				?	options.order_data 								:{};
			let orderDetails 		= 	(options.order_details) 			? 	options.order_details 							:{};
			let orderId				= 	(orderData._id) 					? 	new ObjectId(orderData._id) 					:"";
			let restaurantId		= 	(orderData.restaurant_id) 			? 	new ObjectId(orderData.restaurant_id) 			:"";
			let branchId			= 	(orderData.branch_id) 				? 	new ObjectId(orderData.branch_id) 				:"";
			let deliveryAreaId		= 	(orderDetails.delivery_area_id) 	? 	new ObjectId(orderDetails.delivery_area_id) 	:"";
			let restaurantLatitude	= 	(orderDetails.restaurant_latitude) 	?	parseFloat(orderDetails.restaurant_latitude)	:"";
			let restaurantLongitude	= 	(orderDetails.restaurant_longitude) ?	parseFloat(orderDetails.restaurant_longitude) 	:"";
			let customerId			= 	(orderData.customer_id) 			? 	new ObjectId(orderData.customer_id) 			:"";
			let problemType			=	(orderData.problem_type)			? 	orderData.problem_type 							:"";
			let pickupLat			= 	(orderData.pickup_lat) 				? 	orderData.pickup_lat 							:0;
			let pickupLong			= 	(orderData.pickup_long)				?	orderData.pickup_long							:0;
			let isBigOrder  		=   (orderData.is_big_order)    		?   orderData.is_big_order  						:false;
			let customerDistance  	=   (orderData.customer_distance)    	?   orderData.customer_distance						:0;
			let transferFromBranch	= 	(orderDetails.order_transfer_id) 	? 	new ObjectId(orderDetails.order_transfer_id) 	:"";
			let saveAssignmentLogId	= 	options.save_assignment_log_id;

			/** When order is transferred from branch A to branch B then, in assignment process, to consider the values of delivery methods of branch A on area ABC */
			let newBranchId = (transferFromBranch) ? transferFromBranch : branchId;

			asyncParallel({
				already_assigned_captains : (callback)=>{
					if(options.priority_type != "find_already_assigned_captains") return callback(null,null);

					/** Set conditions */
					let assignmentConditions = {delivery_area_id: deliveryAreaId };

					if(options.priority_type == "find_already_assigned_captains"){
						assignmentConditions["current_status"]	=	{$in: [ Constants.ORDER_DRIVER_ASSIGNED, Constants.ORDER_DRIVER_ACCEPTED, Constants.ORDER_DRIVER_ARRIVED_AT_RESTAURANT ]};
						assignmentConditions["restaurant_id"] 	= 	restaurantId;
						assignmentConditions["branch_id"] 		= 	branchId;
					}

					if(options.same_customer) assignmentConditions["customer_id"] = customerId;

					/** Get captain ids */
					this.orderAssignmentLogDB.distinct("captain_id",assignmentConditions).then(captainIds=>{
						callback(null,captainIds);
					}).catch(next);
				},
				available_captains : (callback)=>{
					return callback(null,null);

					if(options.priority_type != "find_max_buffer_captains") return callback(null,null);

					let currentDate 	= newDate("",Constants.DATABASE_DATE_FORMAT);
					let todayStartDate 	= newDate(currentDate+" "+Constants.START_DATE_TIME_FORMAT);
					let todayEndDate   	= newDate(currentDate+" "+Constants.END_DATE_TIME_FORMAT);

					/** Get captain ids */
					this.driverAvailabilitiesDB.distinct("user_id",{
						date	: { $gte: todayStartDate, $lte: todayEndDate},
						area_id : deliveryAreaId
					}).then(driverIds=>{
						callback(null,driverIds);
					}).catch(next);
				},
				remaining_preparition_data : (callback)=>{
					/* Get remaining preparation time of order, All data is already received in options.order_details but we need exact remaining time of order, that's why we are finding order detail here */
					this.orderDetailDB.findOne({order_id: orderId },{projection: {remaining_preparation_time:1}}).then(orderPreparationData=>{
						callback(null,orderPreparationData);
					}).catch(next);
				},
				assignment_slabs : (callback)=>{
					/** Get assignment slabs */
					this.assignmentSlabDB.find({},{projection: {order:1,min_distance:1,max_distance:1}}).sort({order: Constants.SORT_ASC}).toArray().then(slabResult => {
						callback(null,slabResult);
					}).catch(next);
				},
				branch_assignment_slabs : (callback)=>{
					/** Get branch assignment slabs */
					this.restaurantBranchAssignmentSlabDB.find({branch_id: newBranchId},{projection: {order:1,min_distance:1,max_distance:1}}).sort({order: Constants.SORT_ASC}).toArray().then(slabResult=>{
						callback(null,slabResult);
					}).catch(next);
				},
				branch_details : (callback)=>{
					/** Get branch details */
					this.restaurantBranchDB.findOne({_id : newBranchId },{projection: {delivery_vehicle_type:1}}).then(beResult=>{
						callback(null,beResult);
					}).catch(next);
				},
				restaurant_details : (callback)=>{
					/** Get restaurant details */
					this.restaurantDB.findOne({_id : restaurantId },{projection: {delivery_vehicle_type:1}}).then(beResult=>{
						callback(null,beResult);
					}).catch(next);
				},
				branch_attribute_data : (callback)=>{
					/** Get branch attribute data */
					this.restaurantBranchAraDB.findOne({
						restaurant_id 	: restaurantId,
						branch_id 		: newBranchId,
						area_id 		: deliveryAreaId
					},{projection: {delivery_vehicle_type:1,driver_selection_type:1}}).then(areasResult=>{

						let vehicleTypes 	= (areasResult && areasResult.delivery_vehicle_type ) ? areasResult.delivery_vehicle_type :[];
						let selectionType 	= (areasResult && areasResult.driver_selection_type ) ? areasResult.driver_selection_type :"";

						callback(null,{driver_selection_type: selectionType, area_vehicle_type: vehicleTypes});
					}).catch(next);
				},
			},(asyncErr, asyncResponse)=>{
				if(asyncErr) return next(asyncErr);

				/** Send error response */
				if(!asyncResponse.remaining_preparition_data || !asyncResponse.branch_details || !asyncResponse.restaurant_details){
					return resolve({
						status: Constants.STATUS_ERROR, order_not_found: true, message: res.__("system.something_going_wrong_please_try_again"), asyncResponse: asyncResponse
					});
				}

				let branchDetails		=	asyncResponse.branch_details;
				let restDetails			=	asyncResponse.restaurant_details;
				let slabData 			=	(asyncResponse.assignment_slabs) 		?	asyncResponse.assignment_slabs 		 	:[];
				let branchSlabData		=	(asyncResponse.branch_assignment_slabs) ?	asyncResponse.branch_assignment_slabs	:[];
				let branchAttributeData	=	(asyncResponse.branch_attribute_data) 	? 	asyncResponse.branch_attribute_data 	:{};
				let restVehicleTypes 	=	(restDetails.delivery_vehicle_type) 	? 	restDetails.delivery_vehicle_type		:[];
				let branchVehicleTypes 	=	(branchDetails.delivery_vehicle_type) 	? 	branchDetails.delivery_vehicle_type 	:[];
				let areaVehicleTypes	=	(branchAttributeData.area_vehicle_type)	? 	branchAttributeData.area_vehicle_type	:[];
				let vehicleTypeArray	=	(areaVehicleTypes.length > 0) ? areaVehicleTypes : ((branchVehicleTypes.length > 0) ? branchVehicleTypes : restVehicleTypes);
				if(branchSlabData.length > 0) slabData = branchSlabData;

				/** If driver selection type option is set to “Priority”, system, in auto-assignment process,  will search for selected delivery method (car or bike). If found then ok. If no driver found (in all scenarios and all slabs) then system will search for drivers with other delivery method. */
				if(options.is_assignment_on_priority) vehicleTypeArray = (vehicleTypeArray.indexOf(Constants.VEHICLE_TYPE_CAR) >= 0) ? [Constants.VEHICLE_TYPE_BIKE] : [Constants.VEHICLE_TYPE_CAR];

				let onlyHaveBike 		= 	false;
				let onlyHaveCar	 		=	false;
				if(vehicleTypeArray.length == 1){
					if(vehicleTypeArray.indexOf(Constants.VEHICLE_TYPE_BIKE) >= 0) onlyHaveBike = true;
					if(vehicleTypeArray.indexOf(Constants.VEHICLE_TYPE_CAR) >= 0) onlyHaveCar = true;
				}

				let remainingPreparitionTime 	=	parseInt(asyncResponse.remaining_preparition_data.remaining_preparation_time);
				let custDisIsCar				=	(customerDistance && customerDistance > bikeMaxDistance) ? true :false;
				if(!onlyHaveBike && (isBigOrder || custDisIsCar)){
					vehicleTypeArray = [Constants.VEHICLE_TYPE_CAR];
				}

				vehicleTypeArray			=	vehicleTypeArray.sort();
				let isCaptainFound			=	false;
				let allCaptainIds			=	[];
				let assignedCaptainDetails	=	{};
				eachOfSeries(slabData,(data,key,parentCallback)=>{
					let slabMaxDis 	=	data.max_distance;
					let slabMinDis	= 	data.min_distance;

					if(isCaptainFound) return parentCallback(null);

					eachOfSeries(vehicleTypeArray,(tmpVehicleType,childKey,seriesCallback)=>{
						if(isCaptainFound) return seriesCallback(null);

						/** Return if slab distance more than max distance of car and bike  */
						if(!onlyHaveBike && tmpVehicleType == Constants.VEHICLE_TYPE_BIKE && slabMaxDis > bikeMaxDistance) return seriesCallback(null);
						if(!onlyHaveCar && tmpVehicleType == Constants.VEHICLE_TYPE_CAR && slabMaxDis > carMaxDistance) return seriesCallback(null);

						/* Manage this conditions from global constant */
						let logConditions 		=	{};
						let userConditions 		=	clone(Constants.DRIVER_ASSIGNMENT_CONDITIONS);
						userConditions["$and"] 	=	[
							{_id : {$nin : previouslyAssignedCaptains}},
							{vehicle_type: tmpVehicleType},
							{$or : [
								{active_orders : {$exists: false}},
								{active_orders : {$lt: maxOrderAssigned }}
							]},
							{"orders.have_customer_latlong": {$ne: false }},
							{$or : [
								{"orders.status" : {$ne: Constants.ORDER_DRIVER_ARRIVED_AT_CUSTOMER_LOCATION }},
								{"orders.status" : Constants.ORDER_DRIVER_ARRIVED_AT_CUSTOMER_LOCATION, "orders.1": {$exists: false}},
							]},
						];

						logConditions.branch_vehicle_type 	=	branchVehicleTypes;
						logConditions.priority_type 		=	options.priority_type;
						logConditions.previous_driver 		=	previouslyAssignedCaptains;
						logConditions.vehicle_type 			= 	tmpVehicleType;
						logConditions.active_orders 		= 	maxOrderAssigned;
						logConditions.driver_order_status	= 	{or: [
							{ne: Constants.ORDER_DRIVER_ARRIVED_AT_CUSTOMER_LOCATION},
							{eq: Constants.ORDER_DRIVER_ARRIVED_AT_CUSTOMER_LOCATION, single_order: true}
						]};

						if(options.priority_type == "find_max_buffer_captains"){
							// userConditions["$and"].push({_id : {$in : asyncResponse.available_captains}});

							logConditions.order_status  = [
								Constants.ORDER_DRIVER_FREE, Constants.ORDER_DRIVER_WAY_TO_CUSTOMER, Constants.ORDER_DRIVER_ARRIVED_AT_CUSTOMER_LOCATION
							];

							userConditions["$and"].push({
								"$or" : [
									{order_status : {$exists: false}},
									{$or: [
										{order_status: Constants.ORDER_DRIVER_FREE},
										{"orders.status": Constants.ORDER_DRIVER_WAY_TO_CUSTOMER, "orders.1": {$exists: false}, "orders.have_customer_latlong" : true},
										{"orders.status": Constants.ORDER_DRIVER_ARRIVED_AT_CUSTOMER_LOCATION, "orders.1": {$exists: false}},
									]}
								]
							});
						}else if(options.priority_type == "find_already_assigned_captains"){

							logConditions.already_assigned_captains  = asyncResponse.already_assigned_captains;
							logConditions.order_status  	= 	[Constants.ORDER_DRIVER_ASSIGNED, Constants.ORDER_DRIVER_ACCEPTED, Constants.ORDER_DRIVER_ARRIVED_AT_RESTAURANT];
							logConditions.not_order_status  =	[Constants.ORDER_DRIVER_WAY_TO_CUSTOMER];

							userConditions["$and"].push({_id: {$in: asyncResponse.already_assigned_captains}});
							userConditions["$and"].push({ "orders.status": {$nin: [ Constants.ORDER_DRIVER_WAY_TO_CUSTOMER ]} });
							userConditions["$and"].push({ "orders.status": {$in: [ Constants.ORDER_DRIVER_ASSIGNED, Constants.ORDER_DRIVER_ACCEPTED, Constants.ORDER_DRIVER_ARRIVED_AT_RESTAURANT ]} });
						}

						logConditions.restaurant_coordinates= 	[restaurantLongitude , restaurantLatitude ];
						logConditions.slab_min_distance  	= 	parseFloat(slabMinDis)*Constants.ONE_KMS_TO_METER;
						logConditions.slab_max_distance  	=	parseFloat(slabMaxDis)*Constants.ONE_KMS_TO_METER;

						/** Get eligible drivers list */
						this.userDB.aggregate([
							{$geoNear: {
								near : {
									type			: 	"Point",
									coordinates		: 	[ restaurantLongitude , restaurantLatitude ]
								},
								distanceMultiplier	: 	1 / Constants.ONE_KMS_TO_METER,	//  return distance in miles
								distanceField		: 	"query_distance",				//  return  total distance
								spherical			: 	false,	//	Required if using a 2dsphere index. use to check coordinate in circle
								maxDistance			: 	parseFloat(slabMaxDis)*Constants.ONE_KMS_TO_METER,
								minDistance			: 	parseFloat(slabMinDis)*Constants.ONE_KMS_TO_METER,
								query				: 	userConditions,
								includeLocs			:	'locs',		//  return branch matched coordinate
							}},
							{$match : userConditions},
							{$project: {full_name: 1, vehicle_type: 1, order_status: 1, order_prepare_remaining_time: 1, free_in: 1, latitude: 1, longitude: 1, delivery_latitude: 1, delivery_longitude: 1, driver_id: 1, locs: 1, query_distance: 1, orders: 1  }}
						]).toArray().then(captainList=>{

							/** Set assignment process logs */
							let processOptions = {
								order_id 		: 	orderId,
								driver_ids 		: 	[],
								process_id		:	options.assignment_process_id,
								assignment_type :	options.priority_type,
							};

							if(captainList.length == 0){
								/** Save assignment process logs */
								this.saveAssignmentProcessStepLogs(req,res,next,processOptions).then(()=>{});

								/** Save assignment logs */
								this.saveAssignmentLogs(req,res,next,{
									order_id					: 	orderId,
									log_type					: 	"eligible_drivers_with_google",
									slab_min_distance			: 	slabMinDis,
									slab_max_distance			: 	slabMaxDis,
									vehicle_type				:	tmpVehicleType,
									process_id					: 	saveAssignmentLogId,
									order_details				: 	orderData,
									order_sub_details			: 	orderDetails,
									priority_type 				: 	options.priority_type,
									same_customer 				: 	options.same_customer,
									maximum_buffer_time			:	maximumBufferTime,
									assignment_buffer_time		:	assignmentBufferTime,
									eligible_drivers_with_google:	captainList,
									remaining_preparation_time	: 	remainingPreparitionTime,
									max_order_assigned_to_captain: 	maxOrderAssigned,
									log_conditions				: 	logConditions,
									driver_to_customer_distance_list:	[],
								}).then(()=>{ });

								/** Send response */
								return seriesCallback(null);
							}

							let processDriverIds = [];
							captainList.map(captainData=>{
								allCaptainIds.push(captainData._id);
								processDriverIds.push(captainData._id);

								if(!captainData.free_in || options.priority_type == "find_already_assigned_captains") captainData.free_in = 0;

								if(options.priority_type != "find_already_assigned_captains" && captainData.orders && captainData.orders.length > 0){
									let tmpFreeIn = 0;
									captainData.orders.map((odData,odIndex)=>{
										if(odIndex != 0 && odData.customer_to_customer_distance_minutes){
											tmpFreeIn += odData.customer_to_customer_distance_minutes;
										}

										if(odIndex == 0){
											captainData.customer_latitude	=	odData.customer_latitude;
											captainData.customer_longitude	= 	odData.customer_longitude;
										}
									});

									captainData.free_in = tmpFreeIn;
								}

								if(options.priority_type == "find_already_assigned_captains" && captainData.orders && captainData.orders.length > 0){
									captainData.in_hand_orders_max_preparation_time = 0;

									captainData.orders.map(odData=>{
										if(!captainData.in_hand_orders_max_preparation_time || odData.preparation_time > captainData.in_hand_orders_max_preparation_time){
											captainData.in_hand_orders_max_preparation_time = odData.preparation_time;
										}
									});
								}
							});

							/** Save assignment process logs */
							processOptions.driver_ids = processDriverIds;
							this.saveAssignmentProcessStepLogs(req,res,next,processOptions).then(()=>{});

							/** Filter eligible drivers list according to assignment conditions  */
							this.filterLocations(req,res,next,{
								captains			:	captainList,
								pickup_latitude 	: 	(problemType) ? pickupLat :restaurantLatitude,
								pickup_longitude	: 	(problemType) ? pickupLong :restaurantLongitude,
								remaining_time		: 	remainingPreparitionTime,
								priority_type		: 	options.priority_type,
								same_customer		:	options.same_customer,
								order_id 			: 	orderId,
								customer_distance 	: 	customerDistance,
								save_assignment_log_id: saveAssignmentLogId,
								slab_min_distance	: 	slabMinDis,
								slab_max_distance	: 	slabMaxDis,
								vehicle_type		:	tmpVehicleType,
								log_conditions		: 	logConditions,
								only_have_bike		: 	onlyHaveBike,
								only_have_car		: 	onlyHaveCar,
							}).then(assignmentResponse=>{
								if(assignmentResponse.status == Constants.STATUS_ERROR) return seriesCallback(assignmentResponse);

								if(assignmentResponse.assigned_captain){
									isCaptainFound 		  	= 	true;
									assignedCaptainDetails 	=	assignmentResponse.assigned_captain;
								}
								seriesCallback(null);
							});
						}).catch(next);
					},chilldEachErr=>{
						parentCallback(chilldEachErr);
					});
				},eachErr=>{
					if(eachErr) return resolve(eachErr);

					/** Send success response */
					resolve({
						status			 : 	Constants.STATUS_SUCCESS,
						captain_found	 :	isCaptainFound,
						assigned_captain :	assignedCaptainDetails,
						all_captain_ids	 :	allCaptainIds
					});
				});
			});
		}).catch(next);
	};// end findOptimalCaptains()

	/**
	 * Function to filter 1 location according to conditions
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middle ware function
	 *
	 * @return json
	**/
	async filterLocations  (req,res,next,options){
		return new Promise(resolve=>{
			const assignmentBufferTime= (res.locals.settings['Order_Assignment.assignment_buffer_time'])? 	parseInt(res.locals.settings['Order_Assignment.assignment_buffer_time']):0;
			const maximumBufferTime	= 	(res.locals.settings['Order_Assignment.maximum_buffer_time']) 	? 	parseInt(res.locals.settings['Order_Assignment.maximum_buffer_time']) 	:0;
			const carMaxDistance	=	(res.locals.settings['Order_Assignment.car_max_distance'])		? 	parseInt(res.locals.settings['Order_Assignment.car_max_distance']) 		:0;
			const bikeMaxDistance	= 	(res.locals.settings['Order_Assignment.bike_max_distance'])	 	?	parseInt(res.locals.settings['Order_Assignment.bike_max_distance']) 	:0;
			const maxOrderAssigned	= 	(res.locals.settings['Order_Assignment.max_order_assigned_to_captain']) ? parseInt(res.locals.settings['Order_Assignment.max_order_assigned_to_captain']) :0;

			let orderId				= 	options.order_id;
			let saveAssignmentLogId	=	options.save_assignment_log_id;

			let distanceOptions 			= 	clone(options);
			distanceOptions.locations  		= 	options.captains;
			distanceOptions.process_id		=  	saveAssignmentLogId;
			delete distanceOptions.captains;

			asyncParallel({
				captain_list : (callback)=>{
					if(options.priority_type == "find_already_assigned_captains"){
						return callback(null, distanceOptions.locations)
					}

					/** Send to google api to get distance */
					this.getDistanceBetweenLocations(req,res,next,distanceOptions).then(locationResponse=>{
						if(locationResponse.status == Constants.STATUS_ERROR) return callback(locationResponse);

						callback(null, locationResponse.locations);
					}).catch(next);
				},
				driver_to_customer_distance_list : (callback)=>{
					if(options.priority_type == "find_already_assigned_captains"){
						return callback(null, {})
					}

					let cusDriverObj  = {};
					let cusDriverList = clone(distanceOptions.locations);
					eachOfSeries(cusDriverList,(locData, seriesIndex, seriesCallback)=>{
						let tmpDriverId = 	locData._id;
						let tmpCusLat	= 	(locData.customer_latitude) 	? 	locData.customer_latitude	:0;
						let tmpCusLong 	=	(locData.customer_longitude) 	?	locData.customer_longitude 	:0;

						if(!tmpCusLat || !tmpCusLong) return seriesCallback(null);

						/** Get last assigned order customer to current assigned order customer  */
						this.getDistanceBetweenLocations(req,res,next,{
							order_id		:	orderId,
							process_id		:   saveAssignmentLogId,
							locations		:	[locData],
							pickup_latitude : 	tmpCusLat,
							pickup_longitude: 	tmpCusLong,
						}).then(locationResponse=>{
							let disLocations 	= (locationResponse.locations)		?	locationResponse.locations[0] 	:{};
							let tmpDistance	 	= (disLocations.distance_in_km)		?	disLocations.distance_in_km		:0;
							let tmpDistanceInMin= (disLocations.distance_in_minutes)?	disLocations.distance_in_minutes:0;

							cusDriverObj[tmpDriverId] = {_id: tmpDriverId, distance_in_km: tmpDistance, distance_in_minutes: tmpDistanceInMin, invalid: disLocations.invalid, response: disLocations};
							seriesCallback(null);
						}).catch(next);

					},()=>{
						callback(null, cusDriverObj);
					});
				}
			},(asyncErr,asyncResponse)=>{
				if(asyncErr){
					/** Save assignment logs */
					this.saveAssignmentLogs(req,res,next,{
						order_id			: 	orderId,
						log_type			: 	"eligible_drivers_with_google",
						process_id			: 	saveAssignmentLogId,
						priority_type 		: 	options.priority_type,
						google_error		:	asyncErr,
						eligible_drivers_with_google: (asyncResponse.captain_list) ? asyncResponse.captain_list :[],
						remaining_preparation_time: distanceOptions.remaining_time,
						assignment_buffer_time: assignmentBufferTime,
						maximum_buffer_time	:	maximumBufferTime,
						same_customer		:	distanceOptions.same_customer,
						google_options		:	distanceOptions,
						slab_min_distance	: 	distanceOptions.slab_min_distance,
						slab_max_distance	: 	distanceOptions.slab_max_distance,
						vehicle_type		:	distanceOptions.vehicle_type,
						log_conditions		:	distanceOptions.log_conditions,
						max_order_assigned_to_captain: 	maxOrderAssigned,
						driver_to_customer_distance_list: (asyncResponse.driver_to_customer_distance_list) ? Object.values(asyncResponse.driver_to_customer_distance_list) :[],
					}).then(()=>{ });

					return resolve(asyncErr);
				}

				let captainList 		=	asyncResponse.captain_list;
				let remainingTime 		=	distanceOptions.remaining_time;
				let onlyHaveBike 		= 	distanceOptions.only_have_bike;
				let onlyHaveCar			= 	distanceOptions.only_have_car;
				let driverToCustDisObj	= 	(asyncResponse.driver_to_customer_distance_list) ? asyncResponse.driver_to_customer_distance_list :{};

				/** Save assignment logs */
				this.saveAssignmentLogs(req,res,next,{
					order_id					:	orderId,
					log_type					:	"eligible_drivers_with_google",
					process_id					:	saveAssignmentLogId,
					priority_type 				:	options.priority_type,
					same_customer				:	distanceOptions.same_customer,
					maximum_buffer_time			:	maximumBufferTime,
					assignment_buffer_time		:	assignmentBufferTime,
					remaining_preparation_time	:	remainingTime,
					eligible_drivers_with_google: 	captainList,
					slab_min_distance			: 	distanceOptions.slab_min_distance,
					slab_max_distance			: 	distanceOptions.slab_max_distance,
					vehicle_type				:	distanceOptions.vehicle_type,
					log_conditions				:	distanceOptions.log_conditions,
					max_order_assigned_to_captain: 	maxOrderAssigned,
					driver_to_customer_distance_list: 	Object.values(driverToCustDisObj),
				}).then(()=>{ });

				let orderStatusLevel = {};
				orderStatusLevel[Constants.ORDER_DRIVER_FREE] = 1;
				orderStatusLevel[Constants.ORDER_DRIVER_WAY_TO_CUSTOMER] = 3;

				let finalLocations 	= [];
				captainList.map(locationData=>{
					let captainId = locationData._id;

					if(locationData.invalid) return;

					if(driverToCustDisObj[captainId] && driverToCustDisObj[captainId].invalid)  return;

					let custDriverDisMin		=	(driverToCustDisObj[captainId] && driverToCustDisObj[captainId].distance_in_minutes) ? driverToCustDisObj[captainId].distance_in_minutes :0;
					let remainingBufferTime 	= 	remainingTime;
					let locationDistance		= 	locationData.distance_in_minutes+locationData.free_in+custDriverDisMin;
					let locationDistanceInKm	=	locationData.distance_in_km;
					let tmpVehicleType			=	locationData.vehicle_type;

					/** Set status level  */
					let drOrderStatus				=	(locationData.order_status) 		? 	locationData.order_status 		:Constants.ORDER_DRIVER_FREE;
					locationData.order_status_level =	(orderStatusLevel[drOrderStatus])	?	orderStatusLevel[drOrderStatus] :2;

					if(options.priority_type == "find_already_assigned_captains" ){
						/* Both first and second order should not be delay, including buffer time */
						if(locationData.in_hand_orders_max_preparation_time <= remainingBufferTime && locationData.in_hand_orders_max_preparation_time+assignmentBufferTime  >= remainingBufferTime){
							finalLocations.push(locationData);
						}else if(locationData.in_hand_orders_max_preparation_time >= remainingBufferTime && locationData.in_hand_orders_max_preparation_time <= remainingBufferTime+assignmentBufferTime){
							finalLocations.push(locationData);
						}
						return;
					}else{
						remainingBufferTime = remainingTime+maximumBufferTime;

						if(locationDistance <= remainingBufferTime){
							if(tmpVehicleType == Constants.VEHICLE_TYPE_BIKE && (onlyHaveBike || locationDistanceInKm <= bikeMaxDistance)){
								finalLocations.push(locationData);
							}else if(tmpVehicleType == Constants.VEHICLE_TYPE_CAR && (onlyHaveCar || locationDistanceInKm <= carMaxDistance)){
								finalLocations.push(locationData);
							}
						}
					}
				});

				if(finalLocations.length==0) return resolve({ status: Constants.STATUS_SUCCESS });

				let sortKeys 		= 	[];
				let sortType		= 	Constants.SORT_DESC;
				let distanceField 	=	"distance_in_minutes";

				if(distanceOptions.priority_type == "find_max_buffer_captains") sortType = Constants.SORT_ASC;
				if(sortType == Constants.SORT_DESC) distanceField = "-"+distanceField;

				sortKeys.push("order_status_level", distanceField);

				let sortedLocations = finalLocations.sort(sortByKey(sortKeys));

				resolve({ assigned_captain: sortedLocations[0] });
			});
        }).catch(next);
	};// end filterLocations()

	/**
	 * Function to sort array
	**/
	sortByKey = (fields) => (a, b) => fields.map(o => {
		let dir = 1;
		if (o[0] === '-') { dir = -1; o=o.substring(1); }
		return a[o] > b[o] ? dir : a[o] < b[o] ? -(dir) : 0;
	}).reduce((p, n) => p ? p : n, 0);

	/**
	 * Function to get distance between locations
	 *
	 * @param req		As 	Request Data
	 * @param res		As 	Response Data
	 * @param next		As 	Callback argument to the middleware function
	 * @param options	As	Object data for get distance
	 *
	 * @return json
	**/
	async getDistanceBetweenLocations  (req,res,next,options){
		return new Promise(resolve=>{
			/** Send error response */
			if(!options.pickup_latitude || !options.pickup_longitude || !options.locations) return resolve({
				status: Constants.STATUS_ERROR,
				message: res.__("system.missing_parameters")
			});

			let latitudeField 	=	options.latitude_field	? 	options.latitude_field	:"latitude";
			let longitudeField	= 	options.longitude_field ?	options.longitude_field :"longitude";

			/** Send success response */
			if(options.locations.length == 0) return resolve({
				status: Constants.STATUS_SUCCESS,
				locations: []
			});

			let origins 		= [options.pickup_latitude+","+options.pickup_longitude];
			let destinations	= [];
			let locations		= [];
			let totalLocations  = {};
			options.locations.map((locationRecords,index)=>{
				let lat = locationRecords[latitudeField] ? locationRecords[latitudeField] : "";
				let lng = locationRecords[longitudeField] ? locationRecords[longitudeField] : "";

				locationRecords.distance_in_minutes = 0;
				locationRecords.distance_in_km 		= 0;
				// locationRecords.invalid 			= true;
				locationRecords.invalid 			= false;
				totalLocations[index] 				= locationRecords;
				if(lat && lng){
					locationRecords.index = index;
					locations.push(locationRecords);
					destinations.push(lat+","+lng);
				}
			});

			return resolve({
				status: Constants.STATUS_SUCCESS,
				locations: options.locations
			});

			/**Save google api count logs */
			this.saveGoogleApiCountLogs(req,res,next,options).then(()=>{ });

			/** Send success response */
			if(destinations.length == 0 || origins.length == 0) return resolve({
				status 		: 	Constants.STATUS_SUCCESS,
				locations	:	Object.values(totalLocations)
			});

			/** Get distance details by google */
			distance.get({
				origins		:	origins,
				destinations: 	destinations,
				mode		: 	"driving"
			},(err, data)=>{
				if(err) console.error(err);

				/** Send error response */
				if(err) return resolve({
					status: Constants.STATUS_ERROR,
					message: res.__("system.something_going_wrong_please_try_again"),
					google_error: err
				});

				if(data.length>0){
					data.map((distanceData,distanceIndex)=>{
						let durationInSeconds 	= (distanceData.durationValue) ? distanceData.durationValue : 0;
						let distanceInMinutes 	= durationInSeconds ? Math.ceil(durationInSeconds/SECONDS_IN_A_MINUTE) : 0;

						let distanceInMeters	= 	(distanceData.distanceValue) 	? 	distanceData.distanceValue 					:0;
						let distanceInKm 		= 	durationInSeconds 				? 	Math.round(distanceInMeters/METER_IN_1_KM)	:0;
						let tmpInvalid			= 	(distanceData.invalid) 			? 	distanceData.invalid 						:false;
						let resultStatus		=	(distanceData.resultStatus) 	?	distanceData.resultStatus 					:"";
						if(locations[distanceIndex]){
							let locationIndex = locations[distanceIndex].index;
							totalLocations[locationIndex].distance_in_minutes += distanceInMinutes;
							totalLocations[locationIndex].distance_in_km 	   = distanceInKm;
							totalLocations[locationIndex].distance_in_meters   = distanceInMeters;
							totalLocations[locationIndex].resultStatus   		= resultStatus;
							totalLocations[locationIndex].google_response  = distanceData;

							delete totalLocations[locationIndex].index;

							if(!tmpInvalid){
								delete totalLocations[locationIndex].invalid;
							}
						}
					});
				}

				/** Send success response */
				resolve({
					status : Constants.STATUS_SUCCESS,
					locations: Object.values(totalLocations)
				});
			});
		}).catch(next);
	};// end getDistanceBetweenLocations()

	/***
	 * Function to save google api count logs
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	 */
	async saveGoogleApiCountLogs  (req,res,next,options){
		return new Promise(resolve=>{
			let orderIds		=	(options.order_id)			?	options.order_id		:"";
			let processId		=	(options.process_id)		?	options.process_id		:new ObjectId();
			let assignmentType 	=	(options.assignment_type)	?	options.assignment_type	:Constants.AUTOMATIC_ASSIGNMENT;
			let drivers		 	=	(options.locations)			?	options.locations		:[];

			/** Send error response */
			if(!orderIds) return resolve({status: Constants.STATUS_ERROR, message: res.__("system.missing_parameters") });

			if(orderIds.constructor !== Array)  orderIds = [orderIds];
			let orderCount = round(drivers.length/orderIds.length,Constants.ROUND_PRECISION);

			/**Collection name */
			asyncEach(orderIds, (mainOrderId, eachCallback)=> {
				asyncParallel({
					save_api_logs : (callback)=>{ // Save google api count logs
						this.orderDB.findOne({_id : new ObjectId(mainOrderId)}).then(orderResult=>{
							if(!orderResult) return callback(null);

							this.googleApiCountLogDB.updateOne({
								_id 			:	new ObjectId(processId),
								order_id		:	new ObjectId(mainOrderId),
								assignment_type :	assignmentType,
							},
							{
								$set :{
									modified :	getUtcDate(),
								},
								$inc :{
									order_count: orderCount,
								},
								$setOnInsert: {
									order_date		:	orderResult.order_date,
									unique_order_id : 	orderResult.unique_order_id,
									created			:	getUtcDate(),
								}
							},{upsert: true}).then(()=>{
								callback(null);
							}).catch(next);
						}).catch(next);
					},
					update_order_details : (callback)=>{ // update google api count in order details
						/** Set update data */
						let updateData = {
							$inc : {
								"google_api_count.total" : orderCount
							}
						}

						/**Set condition for assignment type count */
						if(assignmentType) updateData["$inc"]["google_api_count."+assignmentType] = orderCount;

						/**Save google api count in order details */
						this.orderDetailDB.updateOne({order_id : new ObjectId(mainOrderId)},updateData).then(()=>{
							callback(null);
						}).catch(next);
					}
				},(asyncErr)=>{
					eachCallback(asyncErr);
				});
			},()=> {
				/** Send success response */
				resolve({ status: Constants.STATUS_SUCCESS });
			});
		}).catch(next);
	}; // end  saveGoogleApiCountLogs()

	/**
	 * Function to update order status
	 *
	 * @param req		As Request Data
	 * @param res		As Response Data
	 * @param next		As Callback argument to the middle ware function
	 * @param options	As object data
	 *
	 * @return json
	**/
	async updateOrderStatus  (req,res,next,options){
		return new Promise(resolve=>{
			let orderId 	= (options.order_id) 	? 	new ObjectId(options.order_id) 	:"";
			let captainId 	= (options.user_id) 	?	new ObjectId(options.user_id)	:"";
			let orderStatus = (options.status) 		?	options.status			 	:"";

			/** Send error response */
			if(!orderId || !captainId || !orderStatus || (!Constants.DRIVER_ORDER_STATUS[orderStatus] && orderStatus != Constants.ORDER_DELIVERED)){
				return resolve({status: Constants.STATUS_ERROR, message: res.__("system.missing_parameters") });
			}

			/** Set captain conditions */
			let captainConditions = clone(Constants.DRIVER_COMMON_CONDITIONS);
			captainConditions._id = captainId;

			asyncParallel({
				order_details : (callback)=>{
					/** Set order conditions */
					let orderConditions = {
						_id			: orderId,
						is_completed: {$exists: false},
						captain_id	: ""
					};

					/** Add captain conditions */
					if(orderStatus != Constants.ORDER_DRIVER_ACCEPTED){
						orderConditions.captain_id = captainId;
					}

					/** Get order details */
					this.orderDB.findOne(orderConditions,{projection: {order_status: 1, customer_id:1,restaurant_id:1,device_id:1,}}).then(result=> {
						callback(null,result);
					}).catch(next);
				},
				captain_details : (callback)=>{
					/** Get captain details */
					this.userDB.findOne(captainConditions,{projection: {orders:1}}).then(result=> {
						callback(null,result);
					}).catch(next);
				},
				assignment_details : (callback)=>{
					if(orderStatus != Constants.ORDER_DRIVER_ACCEPTED) return callback(null,true);

					/** Get assignment details */
					this.orderAssignmentLogDB.countDocuments({
						order_id 	:	orderId,
						captain_id 	:	captainId,
						status 		:	Constants.ORDER_DRIVER_ASSIGNED,
						cancelled_at:	{$gte: newDate() },
					}).then(contResult=> {
						callback(null,contResult);
					}).catch(next);
				}
			},(asyncErr,asyncResponse)=>{
				if(asyncErr) return next(asyncErr);

				let captainOrders = (asyncResponse.captain_details && asyncResponse.captain_details.orders) ? asyncResponse.captain_details.orders:[];
				if(!asyncResponse.order_details || !asyncResponse.captain_details || !asyncResponse.assignment_details || captainOrders.length <=0){
					return resolve({status: Constants.STATUS_ERROR, message: res.__("bookings.invalid_access_or_unassigned"), asyncResponse: asyncResponse });
				}

				let orderData =	asyncResponse.order_details;
				asyncParallel({
					update_captain_details : (callback)=>{
						/** Set updated data */
						let userUpdateData = {
							$set :{
								modified : getUtcDate()
							}
						};

						/** Update captain details  */
						this.userDB.updateOne(captainConditions,userUpdateData).then(()=>{
							callback(null);
						}).catch(next);
					},
					update_order_details : (callback)=>{
						if(orderStatus != Constants.ORDER_DRIVER_ACCEPTED) return callback(null);

						/** Set updated data */
						let orderUpdateData = {
							modified : getUtcDate()
						};

						if(orderStatus == Constants.ORDER_DRIVER_ACCEPTED){
							orderUpdateData.captain_id = captainId;
						}

						/** Update order details  */
						this.orderDB.updateOne({_id: orderId},{$set: orderUpdateData}).then(()=>{
							callback(null);
						}).catch(next);
					},
					update_order_logs : (callback)=>{
						/** Update order assignment logs details  */
						this.orderAssignmentLogDB.updateMany({
							captain_id	: captainId,
							order_id	: orderId
						},
						{$set: {
							// status 			:	orderStatus,
							current_status 	: 	orderStatus,
							modified 		: 	getUtcDate(),
						}}).then(()=>{
							callback(null);
						}).catch(next);
					}
				},(asyncChildErr)=>{
					if(asyncChildErr) return next(asyncChildErr);

					let message = "";
					switch(orderStatus){
						case Constants.ORDER_DELIVERED :
							message =  res.__("assignment.order_has_been_delivered_successfully");
						break;
						case Constants.ORDER_DRIVER_ACCEPTED :
							message =  res.__("assignment.order_has_been_accepted");
						break;
						case Constants.ORDER_DRIVER_ARRIVED_AT_RESTAURANT :
							message =  res.__("assignment.order_status_as_marked_arrived_at_restaurant");
						break;
						case Constants.ORDER_DRIVER_WAY_TO_CUSTOMER :
							message =  res.__("assignment.order_status_as_marked_way_to_customer");
						break;
						case Constants.ORDER_DRIVER_ARRIVED_AT_CUSTOMER_LOCATION :
							message =  res.__("assignment.order_status_as_marked_arrived_at_customer");
						break;
					}

					/** Send success response */
					resolve({status: Constants.STATUS_SUCCESS, message: message });

					/** Save order status logs */
					saveOrderStatusLogs(req,res,next,{
						updated_by		:	captainId,
						user_id			:	orderData.customer_id,
						restaurant_id	:	orderData.restaurant_id,
						device_id		:	orderData.device_id,
						status 			:	orderStatus,
						order_status	:	orderData.order_status,
						order_id 		:	orderId,
					}).then(()=>{});
				});
			});
        }).catch(next);
	};// end updateOrderStatus()

	/**
	 * Function to get geo locations
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	**/
	async getGeoLocations  (req,res,next,options){
		return new Promise(resolve=>{
			let toLat	 = (options.to_lat)	   ? options.to_lat    :"";
			let toLong	 = (options.to_long)   ? options.to_long   :"";
			let fromLat	 = (options.from_lat)  ? options.from_lat  :"";
			let fromLong = (options.from_long) ? options.from_long :"";

			/** Send error response */
			if(!toLat || !toLong || !fromLat || !fromLong){
				return resolve({status: Constants.STATUS_ERROR, message: res.__("system.missing_parameters")});
			}

			/** Get distance */
			let distance = 	geolib.getDistance(
				{ latitude: toLat, longitude: toLong },
				{ latitude: fromLat, longitude: fromLong }
			);

			/** Send success response */
			resolve({
				status 	 : Constants.STATUS_SUCCESS,
				distance : distance
			});
        }).catch(next);
	};// end getGeoLocations()

	/***
	 * Function to save assignment process logs
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	 */
	async saveAssignmentProcessLogs  (req,res,next,options){
		return new Promise(resolve=>{
			let orderId			=	(options.order_id)			?	new ObjectId(options.order_id)	:"";
			let driverIds		=	(options.driver_ids)		?	options.driver_ids			:[];
			let processId		=	(options.process_id)		?	options.process_id			:"";
			let processDetails	=	(options.assignment_process_details) ? options.assignment_process_details :{};

			if(!orderId){
				return resolve({status: Constants.STATUS_ERROR, message: res.__("system.missing_parameters") });
			}

			if(driverIds.constructor !== Array) driverIds = [driverIds];
			driverIds	=	arrayToObject(driverIds);

			let updatedData = {
				$set: {
					process_details : 	processDetails,
					modified 		:	getUtcDate(),
				},
				$addToSet: {
					driver_ids : {$each: driverIds}
				},
				$setOnInsert: {
					created	: getUtcDate(),
				}
			};

			if(options.process_error){
				updatedData["$set"].process_error = options.process_error;
			}

			/** Save order assignment process logs */
			this.orderAssignmentProcessLogsDB.updateOne({
				order_id 	: 	orderId,
				process_id	:	processId,
			},updatedData,{upsert: true}).then(()=>{
				/** Send success response */
				resolve({ status: Constants.STATUS_SUCCESS });
			}).catch(next);
		}).catch(next);
	}; // end  saveAssignmentProcessLogs()

	/***
	 * Function to save assignment process step logs
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	 */
	async saveAssignmentProcessStepLogs  (req,res,next,options){
		return new Promise(resolve=>{
			let orderId			=	(options.order_id)			?	new ObjectId(options.order_id)	:"";
			let driverIds		=	(options.driver_ids)		?	options.driver_ids			:[];
			let processId		=	(options.process_id)		?	options.process_id			:"";
			let assignmentType	=	(options.assignment_type)	?	options.assignment_type		:"";

			if(!orderId || !assignmentType || !processId){
				return resolve({status: Constants.STATUS_ERROR, message: res.__("system.missing_parameters") });
			}

			if(driverIds.constructor !== Array) driverIds = [driverIds];
			driverIds	=	arrayToObject(driverIds);

			/** Save order assignment process logs */
			this.orderAssignmentProcessStepDB.updateOne({
				order_id 		: 	orderId,
				process_id		:	processId,
				assignment_type :	assignmentType
			},
			{
				$set: {
					modified : getUtcDate(),
				},
				$addToSet: {
					driver_ids : {$each: driverIds}
				},
				$setOnInsert: {
					created	: getUtcDate(),
				}
			},{upsert: true}).then(()=>{
				/** Send success response */
				resolve({ status: Constants.STATUS_SUCCESS });
			}).catch(next);
		}).catch(next);
	}; // end  saveAssignmentProcessStepLogs()

	/***
	 * Function to save assignment logs
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	 */
	async saveAssignmentLogs  (req,res,next,options){
		return new Promise(resolve=>{
			let orderId			=	(options.order_id)			?	new ObjectId(options.order_id)	:"";
			let processId		=	(options.process_id)		?	new ObjectId(options.process_id):"";
			let logType			=	(options.log_type)			?	options.log_type			:"";
			let pickupDetails	=	(options.pickup_details)	?	options.pickup_details		:{};
			let allCaptainIds	=	(options.all_captain_ids)	?	options.all_captain_ids		:[];

			/** Send error response */
			if(!orderId || !logType || !processId){
				return resolve({status: Constants.STATUS_ERROR, message: res.__("system.missing_parameters") });
			}

			const saveAllDriverLogs	=	(res.locals.settings['Order_Assignment.save_all_driver_logs']) ? parseInt(res.locals.settings['Order_Assignment.save_all_driver_logs']) :0;
			let logsUpdatdData 		= 	{$set: {}};

			asyncParallel({
				process_start : (callback)=>{
					if(logType != "process_start") return callback(null);

					logsUpdatdData["$set"]["process_start_time"] = getUtcDate();
					callback(null);
				},
				save_unique_order_id : (callback)=>{
					if(logType != "save_unique_order_id") return callback(null);

					logsUpdatdData["$set"]["unique_order_id"] = options.unique_order_id;
					callback(null);
				},
				all_driver : (callback)=>{
					if(logType != "all_driver") return callback(null);

					if(saveAllDriverLogs != Constants.ACTIVE){
						logsUpdatdData["$set"]["all_drivers"] = { drivers: [], settings: saveAllDriverLogs  };
						return callback(null);
					}

					/** set user conditions */
					let userConditions 		=	clone(Constants.DRIVER_ASSIGNMENT_CONDITIONS);
					userConditions["_id"]	=	{$nin : allCaptainIds};

					let aggPipline 		=	[];
					let restLongitude 	=	options.restaurant_longitude;
					let restLatitude	= 	options.restaurant_latitude;
					if(restLongitude && restLatitude){
						aggPipline.push({
							$geoNear: {
								near : {
									type			: 	"Point",
									coordinates		: 	[ restLongitude , restLatitude ]
								},
								distanceMultiplier	: 	1 / Constants.ONE_KMS_TO_METER,
								distanceField		: 	"query_distance",
								spherical			: 	false,
								query				: 	userConditions,
								includeLocs			:	'locs',
							}
						});
					}

					aggPipline.push({$match: userConditions});
					aggPipline.push({$project: {query_distance:1,full_name:1, driver_id: 1,active_orders: 1,latitude: 1,longitude: 1, is_available:1,order_status:1,vehicle_type:1,orders: 1} });

					/** Get all driver list */
					this.userDB.aggregate(aggPipline).toArray().then(driverList=>{
						logsUpdatdData["$set"]["all_drivers"] = driverList;

						callback(null, driverList);
					}).catch(next);
				},
				customer_distance : (callback)=>{
					if(logType != "customer_distance") return callback(null);

					logsUpdatdData["$set"]["customer_distance_with_google"] = options.customer_distance;
					if(options.google_error){
						logsUpdatdData["$set"]["customer_distance_with_google_error"] 	= options.google_error;
						logsUpdatdData["$set"]["customer_distance_with_google_options"] = options.google_options;
					}
					if(options.delivery_method_extracted_from) logsUpdatdData["$set"]["delivery_method_extracted_from"] = options.delivery_method_extracted_from;
					callback(null);
				},
				eligible_drivers : (callback)=>{
					if(logType != "eligible_drivers") return callback(null);

					logsUpdatdData["$push"] = {
						eligible_driver_list: {
							priority_type 	 			:	options.priority_type,
							same_customer 	 			: 	(options.same_customer) ? options.same_customer :false,
							eligible_drivers 			: 	options.eligible_drivers,
							slab_min_distance 			: 	options.slab_min_distance,
							slab_max_distance 			: 	options.slab_max_distance,
							vehicle_type 				: 	options.vehicle_type,
							remaining_preparation_time	:	options.remaining_time,
						}
					};
					callback(null);
				},
				eligible_drivers_with_google : (callback)=>{
					if(logType != "eligible_drivers_with_google") return callback(null);

					let minSlab 		=	options.slab_min_distance;
					let maxSlab 		=	options.slab_max_distance;
					let tmpVehicleType 	=	options.vehicle_type;
					let slabString		= 	"slab_"+minSlab+"_"+maxSlab;
					let priorityType	= 	(options.same_customer) ? "find_already_assigned_captains_same_customer" :options.priority_type;
					let dbKey			=	"eligible_drivers_with_google."+priorityType+"."+slabString+"."+tmpVehicleType;

					if(!logsUpdatdData["$push"]) logsUpdatdData["$push"] = {};
					logsUpdatdData["$push"][dbKey] = {
						remaining_preparation_time 		: 	options.remaining_preparation_time,
						assignment_buffer_time 			: 	options.assignment_buffer_time,
						maximum_buffer_time 			: 	options.maximum_buffer_time,
						slab_min_distance 				: 	options.slab_min_distance,
						slab_max_distance 				: 	options.slab_max_distance,
						vehicle_type 					: 	options.vehicle_type,
						log_conditions					:	options.log_conditions,
						max_order_assigned_to_captain	:	options.max_order_assigned_to_captain,
						eligible_drivers 				:	options.eligible_drivers_with_google,
						driver_to_customer_distance_list:	options.driver_to_customer_distance_list,
					}

					if(options.google_error){
						logsUpdatdData["$push"][dbKey]["google_error"]		=	options.google_error;
						logsUpdatdData["$push"][dbKey]["google_options"]	=	options.google_options;
					}
					callback(null);
				},
				assigned_driver : (callback)=>{
					if(logType != "assigned_driver") return callback(null);

					logsUpdatdData["$set"]["assigned_driver_which_priority"] = (options.captain_found_which_priority)? options.captain_found_which_priority:"";
					logsUpdatdData["$set"]["assigned_driver"] = options.assigned_driver;
					callback(null);
				},
				max_distance_reach : (callback)=>{
					if(logType != "max_distance_reach") return callback(null);

					logsUpdatdData["$addToSet"] = {
						max_distance_reach : {
							priority_type 	: 	options.priority_type,
							car_distance 	:	options.car_distance,
							total_distance 	:	options.total_distance
						}
					};
					callback(null);
				},
				distance_to_find_vechile_type : (callback)=>{
					if(logType != "distance_to_find_vechile_type") return callback(null);

					logsUpdatdData["$set"] = {
						distance_to_find_vechile_type: {
							total_distance 	: 	options.total_distance,
							driver_details	: 	options.driver_details,
							matched_location_details: options.pickup_details
						}
					};
					callback(null);
				},
			},(asyncErr)=>{
				if(asyncErr) return next(asyncErr);

				/** Send success response */
				if(Object.keys(logsUpdatdData["$set"]).length ==0 && ((logsUpdatdData["$addToSet"] && Object.keys(logsUpdatdData["$addToSet"]).length ==0)  && (logsUpdatdData["$push"] && Object.keys(logsUpdatdData["$push"]).length ==0))){
					return resolve({ status: Constants.STATUS_SUCCESS });
				}

				logsUpdatdData["$set"].modified = getUtcDate();
				logsUpdatdData["$setOnInsert"] = {
					created	: getUtcDate(),
				};

				/** Save order assignment process logs */
				this.orderAssignmentLogStepDB.updateOne({
					order_id 		: 	orderId,
					process_id		:	processId,
				},logsUpdatdData,{upsert: true}).then(()=>{
					/** Send success response */
					resolve({ status: Constants.STATUS_SUCCESS });
				}).catch(next);
			});
		}).catch(next);
	}; // end  saveAssignmentLogs()

	/***
	 * Function to get all assigned order customer distance form driver location
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	 */
	async getDriverToAllAssignedOrderDistance (req,res,next,options){
		return new Promise(resolve=>{
			/** Send error response */
			if(!options || !options.driver_details) return resolve({status: Constants.STATUS_ERROR, message: res.__("system.missing_parameters") });

			let driverDetails	=	options.driver_details;
			let orderList 	   	=	driverDetails.orders;

			/** Send success response */
			if(!driverDetails.latitude || !driverDetails.longitude || !orderList || orderList.length == 0){
				return resolve({status: Constants.STATUS_SUCCESS, distance: 0, distance_in_minutes: 0, invalid: false });
			}

			/** Get distance driver to all assigned customer location */
			this.getDistanceBetweenLocations(req,res,next,{
				locations		:	orderList,
				pickup_latitude : 	driverDetails.latitude,
				pickup_longitude: 	driverDetails.longitude,
				latitude_field 	: 	"customer_latitude",
				longitude_field : 	"customer_longitude",
			}).then(locationResponse=>{
				if(locationResponse.status != Constants.STATUS_SUCCESS) return resolve(locationResponse);

				let totalDistance = 0;
				let totalTime 	  = 0;
				let isInvalid 	  = false;
				locationResponse.locations.map(records=>{
					if(records.invalid){
						isInvalid = true;
					}else{
						totalTime	  += records.distance_in_minutes;
						totalDistance += records.distance_in_km;
					}
				});

				/** Send success response */
				resolve({status: Constants.STATUS_SUCCESS, distance: totalDistance, distance_in_minutes: totalTime, invalid: isInvalid });
			}).catch(next);
		}).catch(next);
	}; // end  getDriverToAllAssignedOrderDistance()
}
