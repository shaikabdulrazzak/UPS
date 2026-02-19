import { ObjectId } from "mongodb";
import clone from "clone";
import { parallel as asyncParallel } from "async";
import * as Constants from "../config/global_constant.mjs";
import * as Helper from "../utils/index.mjs";
import Tables from './../config/database_tables.mjs';
import { getDb } from '../config/connection.mjs';
import { insertNotifications, sendMail, sendSMS } from "../services/index.mjs";

/**
 * Function to send mail on various events
 *
 * @param options As Requested options
 *
 * @return array
 */
export const sendMailToUsers = (req,res,options)=>{
	let notificationCallCenter= options?.notification_call_center || "";
	let captainName			= options?.captain_name 		|| "";
	let eventType 			= options?.event_type 			|| "";
	let NotificationType 	= options?.notification_type 	|| "";
	let userId				= options?.user_id    			|| "";
	let userRoleId			= options?.user_role_id   		|| "";
	let receiverId			= options?.receiver_id			|| "";
	let orderId				= options?.order_id			    || "";
	let orderUniqueId		= options?.unique_order_id		|| "";
	let timeOut				= options?.time_out   			|| 0;
	let isAdmin 			= options?.is_admin 			|| "";
	let notificationOptions = clone(options);

	let dbInstance = getDb();

	if(notificationOptions.time_out) delete notificationOptions.time_out;
	if(notificationOptions.event_type) delete notificationOptions.event_type;

	const users			=	dbInstance.collection(Tables.USERS);
	const orders		=	dbInstance.collection(Tables.ORDERS);
	const restaurants	=	dbInstance.collection(Tables.RESTAURANTS);
	const restaurant_details	=	dbInstance.collection(Tables.RESTAURANT_DETAILS);
	const restaurant_branches	=	dbInstance.collection(Tables.RESTAURANT_BRANCHES);
	const tmp_restaurant_branches=	dbInstance.collection(Tables.TMP_RESTAURANT_BRANCHES);
	const restaurant_enquiries	= dbInstance.collection(Tables.RESTAURANT_ENQUIRIES);

	if(eventType == Constants.BRANCH_ENQUIRY_APPROVE_EMAIL_EVENTS){
		/** Save user leave details */
		const scheduled_notifications = dbInstance.collection(Tables.SCHEDULED_NOTIFICATIONS);
		scheduled_notifications.insertOne({
			is_sent 		: Constants.NOT_SENT,
			scheduled_date 	: options.scheduled_date ? Helper.getUtcDate(options.scheduled_date) : Helper.getUtcDate(),
			event_type		: options.event_type,
			options 		: notificationOptions,
			created 		: Helper.getUtcDate()
		}).then(()=>{

		}).catch(err=>{
			console.error("save scheduled_notifications in sendMailToUsers error ===>",eventType, err);
		});
	}

	/** Send a mail to user according to event type */
	switch(eventType){
		case Constants.CATEGORY_ACTIVATE_DEACTIVATE_EVENT:

			/** Notification to restaurant on accepting order by driver */
			insertNotifications(req,res,{
				notification_data : {
					notification_type  : Constants.NOTIFICATION_TO_CONTENT_ON_CATEGORY_ACTIVE_DEACTIVE,
					message_params 	   : [options.category_name,options.status,options.restaurant_name],
					parent_table_id    : options.category_id,
					user_id 		   : options.restaurant_id,
					user_role_id 	   : Constants.RESTAURANT,
					role_id            : [Constants.CRAVEZ,Constants.CONTENT_TEAM],
					only_for_user_role : true,
					extra_parameters 	:	{
						restaurant_id : options.restaurant_id,
						category_id   : options.category_id,
						restaurant_slug: options.restaurant_slug
					}
				}
			}).then(()=>{});

		break;
		case Constants.ITEM_ACTIVATE_DEACTIVATE_EVENT:

			/** Notification to restaurant on accepting order by driver */
			insertNotifications(req,res,{
				notification_data : {
					notification_type  : Constants.NOTIFICATION_TO_CONTENT_ON_ITEM_ACTIVE_DEACTIVE,
					message_params 	   : [options.item_name,options.status,options.restaurant_name],
					parent_table_id    : options.item_id,
					user_id 		   : options.restaurant_id,
					user_role_id 	   : Constants.RESTAURANT,
					role_id            : [Constants.CRAVEZ,Constants.CONTENT_TEAM],
					only_for_user_role : true,
					extra_parameters 	:	{
						restaurant_id 	: options.restaurant_id,
						item_id   		: options.item_id,
						restaurant_slug	: options.restaurant_slug
					}
				}
			}).then(()=>{});

		break;
		case Constants.ORDER_STATUS_PAYMENT_PENDING_EVENT:
			asyncParallel({
				user_details : (callback)=>{
					users.findOne({_id : new ObjectId(userId)},{projection:{full_name:1,_id:1,email:1,phone_country_code:1,mobile_number:1}}).then(result=>{
						callback(null, result);
					}).catch(err=>{
						console.error("get user details in sendMailToUsers error ===>",eventType, err);
						callback(err);
					});
				},
				restaurant_user_data : (callback)=>{
					/** Get restaurant data to inform about the order */
					restaurants.findOne({_id : new ObjectId(options.restaurant_id)},{projection:{name:1}}).then(restResult=>{
						callback(null, restResult);
					}).catch(err=>{
						console.error("get restaurant data in sendMailToUsers error ===>",eventType, err);
						callback(err);
					});
				}
			},(_,response)=>{
				if(response.user_details){	
					let userDetails		= response?.user_details || {};
					let restaurantName	= response?.restaurant_user_data?.name?.[Constants.DEFAULT_LANGUAGE_CODE] || '';
					let userDetailId	= userDetails?._id || '';
					let fullName		= userDetails?.full_name || '';
					let email			= userDetails?.email || '';
					let code			= userDetails?.phone_country_code || '';
					let mobile			= userDetails?.mobile_number || '';
					let emailAction		= (eventType == Constants.ORDER_STATUS_SUBMITTED_EVENT) ? 'order_submitted' : ((eventType == Constants.ORDER_STATUS_PAYMENT_PENDING_EVENT) ? 'order_payment_pending' : 'order_payment_failed');
					let smsAction		= (eventType == Constants.ORDER_STATUS_SUBMITTED_EVENT) ? 'SMS.order_submitted' : ((eventType == Constants.ORDER_STATUS_PAYMENT_PENDING_EVENT) ? 'SMS.order_payment_pending' : 'SMS.order_payment_failed');
					//if(email){
						///**** Send link to user email ****/
							//sendMail(req,res,{
								//to 			: 	email,
								//action 		: 	emailAction,
								//rep_array	:	[fullName,options.unique_order_id,restaurantName]
							//});
						///**** Send link to user email ****/
					//}
					// if(mobile && code){
					// 	/*************** SEND LINK ON USER MOBILE NUMBER  ***************/
					// 		let msgBody	= (res.locals.settings[smsAction]) ? res.locals.settings[smsAction] :"";
					// 		msgBody		= msgBody.replace(RegExp('{ORDER_ID}','g'),options.unique_order_id);
					// 		msgBody		= msgBody.replace(RegExp('{RESTAURANT_NAME}','g'),restaurantName);

					// 		/**Send sms **/
					// 		sendSMS(req,res,{
					// 			mobile_number	:	code+mobile,
					// 			sms_template	:	msgBody,
					// 			user_id			:	options.user_id
					// 		}).then(()=>{});						
					// 	/*************** SEND LINK ON USER MOBILE NUMBER  **************/
					// }
				}
			});
		break;
		case Constants.ORDER_STATUS_MODIFIED_PAYMENT_PENDING_EVENT:
			asyncParallel({
				user_details : (callback)=>{
					users.findOne({_id : new ObjectId(receiverId)},{projection:{full_name:1,_id:1,email:1,phone_country_code:1,mobile_number:1}}).then(result=>{
						callback(null, result);
					}).catch(err=>{
						console.error("get user details in sendMailToUsers error ===>",eventType, err);
						callback(err);
					});
				},
				restaurant_user_data : (callback)=>{
					/** Get restaurant data to inform about the order */					
					restaurants.findOne({_id : new ObjectId(options.restaurant_id)},{projection:{name:1}}).then(restResult=>{
						callback(null, restResult);
					}).catch(err=>{
						console.error("get restaurant data in sendMailToUsers error ===>",eventType, err);
						callback(err);
					});
				}
			},(_,response)=>{
				if(response.user_details){
					let userDetails		= response?.user_details || {};
					let restaurantName	= response?.restaurant_user_data?.name?.[Constants.DEFAULT_LANGUAGE_CODE] || '';
					let userDetailId	= userDetails?._id || '';
					let fullName		= userDetails?.full_name || '';
					let email			= userDetails?.email || '';
					let code			= userDetails?.phone_country_code || '';
					let mobile			= userDetails?.mobile_number || '';
					let emailAction		= 'modified_order_payment';
					let smsAction		= 'SMS.modified_order_payment';
					//if(email){
						///**** Send link to user email ****/
							//sendMail(req,res,{
								//to 			: 	email,
								//action 		: 	emailAction,
								//rep_array	:	[fullName,options.unique_order_id,restaurantName]
							//});
						///**** Send link to user email ****/
					//}
					if(mobile && code){
						/*************** SEND LINK ON USER MOBILE NUMBER  ***************/
							let msgBody	= (res.locals.settings[smsAction]) ? res.locals.settings[smsAction] :"";
							msgBody		= msgBody.replace(RegExp('{ORDER_ID}','g'),options.unique_order_id);
							msgBody		= msgBody.replace(RegExp('{RESTAURANT_NAME}','g'),restaurantName);

							/**Send sms **/
							sendSMS(req,res,{
								mobile_number	:	code+mobile,
								sms_template	:	msgBody,
								user_id			:	options.user_id
							}).then(()=>{});
						/*************** SEND LINK ON USER MOBILE NUMBER  **************/
					}
				}
			});
		break;
		case Constants.ORDER_STATUS_SUBMITTED_EVENT:
		case Constants.ORDER_STATUS_PAYMENT_FAILED_EVENT:
			asyncParallel({
				user_details : (callback)=>{
					users.findOne({_id : new ObjectId(receiverId)},{projection:{full_name:1,_id:1,email:1,phone_country_code:1,mobile_number:1}}).then(result=>{
						callback(null, result);
					}).catch(err=>{
						console.error("get user details in sendMailToUsers error ===>",eventType, err);
						callback(err);
					});
				},
				restaurant_user_data : (callback)=>{
					/** Get restaurant data to inform about the order */
					restaurants.findOne({_id : new ObjectId(options.restaurant_id)},{projection:{name:1}}).then(restResult=>{
						callback(null, restResult);
					}).catch(err=>{
						console.error("get restaurant data in sendMailToUsers error ===>",eventType, err);
						callback(err);
					});
				}
			},(_,response)=>{
				if(response.user_details){
					let userDetails		= response.user_details;
					let restaurantName	= (response.restaurant_user_data && response.restaurant_user_data.name) ? response.restaurant_user_data.name[Constants.DEFAULT_LANGUAGE_CODE] : '';
					let userDetailId	= (userDetails._id) 		? userDetails._id 		:'';
					let fullName		= (userDetails.full_name) 	? userDetails.full_name	:'';
					let email			= (userDetails.email) 		? userDetails.email 	:'';
					let code			= (userDetails.phone_country_code) 		? userDetails.phone_country_code 	:'';
					let mobile			= (userDetails.mobile_number) 		? userDetails.mobile_number 	:'';
					let emailAction		= (eventType == Constants.ORDER_STATUS_SUBMITTED_EVENT) ? 'order_submitted' : ((eventType == Constants.ORDER_STATUS_PAYMENT_PENDING_EVENT) ? 'order_payment_pending' : 'order_payment_failed');
					let smsAction		= (eventType == Constants.ORDER_STATUS_SUBMITTED_EVENT) ? 'SMS.order_submitted' : ((eventType == Constants.ORDER_STATUS_PAYMENT_PENDING_EVENT) ? 'SMS.order_payment_pending' : 'SMS.order_payment_failed');
					//if(email){
						///**** Send link to user email ****/
							//sendMail(req,res,{
								//to 			: 	email,
								//action 		: 	emailAction,
								//rep_array	:	[fullName,options.unique_order_id,restaurantName]
							//});
						///**** Send link to user email ****/
					//}
					// if(mobile && code){
					// 	/*************** SEND LINK ON USER MOBILE NUMBER  ***************/
					// 		let msgBody	= (res.locals.settings[smsAction]) ? res.locals.settings[smsAction] :"";
					// 		msgBody		= msgBody.replace(RegExp('{ORDER_ID}','g'),options.unique_order_id);
					// 		msgBody		= msgBody.replace(RegExp('{RESTAURANT_NAME}','g'),restaurantName);

					// 		/**Send sms **/
					// 		sendSMS(req,res,{
					// 			mobile_number	:	code+mobile,
					// 			sms_template	:	msgBody,
					// 			user_id			:	options.user_id
					// 		}).then(()=>{});
					// 	/*************** SEND LINK ON USER MOBILE NUMBER  **************/
					// }
					if(orderUniqueId){
						let pendingNotificationMessageParams = [orderUniqueId];
						let pendingNofificationData	=	{
							notification_type : Constants.NOTIFICATION_ORDER_PENDING,
							message_params : pendingNotificationMessageParams,
							parent_table_id : orderId,
							user_id : userId,
							user_role_id : userRoleId,
						};

						if(notificationCallCenter){
							pendingNofificationData['only_for_user_role']	=	true;
							pendingNofificationData['role_id']				=	Constants.CALL_CENTER_TEAM;
						}else{
							pendingNofificationData['restaurant_id']		=	options.restaurant_id;
							pendingNofificationData['role_id']				=	Constants.RESTAURANT;
							pendingNofificationData['only_for_user_role']	=	true;
							pendingNofificationData['is_restaurant_notification']=	true;
						}

						/** Notification to restaurant on placing order */
						insertNotifications(req,res,{
							notification_data : pendingNofificationData
						}).then(()=>{});
					}
				}
			});
		break;
		case Constants.CORPORATE_REGISTRATION_EVENT:
			if(options.customer_fullname && options.customer_email && options.customer_password && options.customer_mobile){
				/**** Send add customer user email ****/
					sendMail(req,res,{
						to 			: 	options.customer_email,
						action 		: 	"corporate_registration_mail",
						rep_array	:	[options.customer_fullname,options.customer_email,options.customer_mobile,options.customer_password]
					});
				/**** Send add driver user email ****/
			}
		break;
		case Constants.PACKAGE_PURCHASE_MAIL:
			if(options.email && options.rep_array){
				/**** Send add customer user email ****/
					sendMail(req,res,{
						to 			: 	options.email,
						action 		: 	"package_purchase_mail",
						rep_array	:	options.rep_array
					});
				/**** Send add driver user email ****/
			}
		break;
		case Constants.PACKAGE_ACCEPT_MAIL:
			if(options.email && options.rep_array){
				/**** Send add customer user email ****/
					sendMail(req,res,{
						to 			: 	options.email,
						action 		: 	"package_accept_mail",
						rep_array	:	options.rep_array
					});
				/**** Send add driver user email ****/
			}
		break;
		case Constants.ORDER_STATUS_MODIFIED_EVENT:
			/** Notification to user on placing order */
			insertNotifications(req,res,{
				notification_data : {
					notification_type 	: NotificationType,
					message_params 		: [orderUniqueId],
					parent_table_id 	: orderId,
					user_id 			: userId,
					user_role_id 		: userRoleId,
					user_ids 			: [receiverId],
					role_id 			: Constants.CUSTOMER
				}
			}).then(()=>{});


			/** Send notification to admin or restaurant */
			let nofificationData	=	{
				notification_type  : NotificationType,
				message_params 	   : [orderUniqueId],
				parent_table_id    : orderId,
				user_id 		   : userId,
				user_role_id 	   : userRoleId,
			};

			if(isAdmin){
				nofificationData['only_for_user_role']	=	true;
				nofificationData['role_id']				=	Constants.CALL_CENTER_TEAM;
			}else{
				nofificationData['restaurant_id']		=	options.restaurant_id;
				nofificationData['role_id']				=	Constants.RESTAURANT;
				nofificationData['only_for_user_role']	=	true;
				nofificationData['is_restaurant_notification']=	true;
			}

			/** Notification to admin or restaurant on placing order */
			insertNotifications(req,res,{
				notification_data : nofificationData
			}).then(()=>{});

		break;
		case Constants.NOTIFICATION_TO_RESTAURANT_ON_PAYMENT_OF_MODIFIED_ORDER:
			asyncParallel({
				admin_details : (callback)=>{
					users.findOne({user_role_id : Constants.CRAVEZ},{projection:{full_name:1,_id:1}}).then(result=>{
						callback(null, result);
					}).catch(err=>{
						console.error("get admin details in sendMailToUsers error ===>",eventType, err);
						callback(err);
					});
				},
			},(_,response)=>{
				if(response){
					let adminDetails	= (response.admin_details) 	? response.admin_details 	:{};
					let adminId			=	(adminDetails && adminDetails._id) ? adminDetails._id : '';
					
					/** Notification to restaurant on payment of modified order */
					let confirmedModifiedNofificationData	=	{
						notification_type : Constants.NOTIFICATION_TO_RESTAURANT_ON_PAYMENT_OF_MODIFIED_ORDER,
						message_params : [orderUniqueId],
						parent_table_id : orderId,
						user_id : adminId,
						user_role_id : Constants.CRAVEZ,
					};
					confirmedModifiedNofificationData['restaurant_id']		=	options.restaurant_id;
					confirmedModifiedNofificationData['role_id']			=	Constants.RESTAURANT;
					confirmedModifiedNofificationData['only_for_user_role']	=	true;
					confirmedModifiedNofificationData['is_restaurant_notification']= true;
					/** Notification to restaurant on accepting order */
					insertNotifications(req,res,{
						notification_data : confirmedModifiedNofificationData
					}).then(()=>{});
				}
			});

		break;
		case Constants.ORDER_STATUS_DRIVER_ACCEPTED_EVENT:
			/** Notification to restaurant on accepting order by driver */
			insertNotifications(req,res,{
				notification_data : {
					notification_type  : NotificationType,
					message_params 	   : [orderUniqueId],
					parent_table_id    : orderId,
					order_id		   : orderId,
					user_id 		   : userId,
					user_role_id 	   : userRoleId,
					restaurant_id      : options.restaurant_id,
					role_id            : Constants.RESTAURANT,
					is_restaurant_notification:	true,
					only_for_user_role : true,
				}
			}).then(()=>{});

		break;
		case Constants.ORDER_STATUS_DRIVER_ASSIGNED_EVENT:
			/** Notification to driver on assigning order */
			insertNotifications(req,res,{
				notification_data : {
					notification_type  : NotificationType,
					message_params 	   : [orderUniqueId],
					parent_table_id    : orderId,
					order_id    	   : orderId,
					user_id 		   : userId,
					user_role_id 	   : userRoleId,
					user_ids      	   : [receiverId],
					role_id            : Constants.DRIVER,
				}
			}).then(()=>{});

		break;
		case Constants.ORDER_STATUS_REJECTED_EVENT:
		case Constants.ORDER_STATUS_PENDING_EVENT:
			let pendingNotificationMessageParams = [orderUniqueId];
			let pendingNofificationData	=	{
				notification_type : NotificationType,
				message_params : pendingNotificationMessageParams,
				parent_table_id : orderId,
				user_id : userId,
				user_role_id : userRoleId,
			};

			if(notificationCallCenter){
				pendingNofificationData['only_for_user_role']	=	true;
				pendingNofificationData['role_id']				=	Constants.CALL_CENTER_TEAM;
			}else{
				pendingNofificationData['restaurant_id']		=	options.restaurant_id;
				pendingNofificationData['role_id']				=	Constants.RESTAURANT;
				pendingNofificationData['only_for_user_role']	=	true;
				pendingNofificationData['is_restaurant_notification']=	true;
			}

			/** Notification to restaurant on placing order */
			insertNotifications(req,res,{notification_data : pendingNofificationData}).then(()=>{});

			/** Notification to customer on order rejected */
			if(Constants.ORDER_STATUS_REJECTED_EVENT && isAdmin){
				let notificationMessageParams = [orderUniqueId];
				insertNotifications(req,res,{
					notification_data : {
						notification_type : NotificationType,
						message_params 	  : notificationMessageParams,
						parent_table_id   : orderId,
						user_id 		  : userId,
						user_role_id 	  : userRoleId,
						user_ids 		  : [receiverId],
						role_id 		  : Constants.CUSTOMER
					}
				}).then(()=>{});
			}

			if(options.order_status == Constants.ORDER_REJECTED_BY_ADMIN){
				let notificationMessageParams = [orderUniqueId];
				insertNotifications(req,res,{
					notification_data : {
						notification_type : NotificationType,
						message_params 	  : notificationMessageParams,
						parent_table_id   : orderId,
						user_id 		  : userId,
						user_role_id 	  : userRoleId,
						user_ids 		  : [receiverId],
						role_id 		  : Constants.CUSTOMER
					}
				}).then(()=>{});
			}
			asyncParallel({
				user_details : (callback)=>{
					users.findOne({_id : new ObjectId(userId)},{projection:{full_name:1,_id:1,email:1,phone_country_code:1,mobile_number:1}}).then(result=>{
						callback(null, result);
					}).catch(err=>{
						console.error("get user details in sendMailToUsers error ===>",eventType, err);
						callback(err);
					});
				},
				restaurant_user_data : (callback)=>{
					/** Get restaurant data to inform about the order */
					restaurants.findOne({_id : new ObjectId(options.restaurant_id)},{projection:{name:1}}).then(restResult=>{
						callback(null, restResult);
					}).catch(err=>{
						console.error("get restaurant data in sendMailToUsers error ===>",eventType, err);
						callback(err);
					});
				}
			},(_,response)=>{
				if(response.user_details){
					let userDetails		= response.user_details;
					let restaurantName	= (response.restaurant_user_data && response.restaurant_user_data.name) ? response.restaurant_user_data.name[Constants.DEFAULT_LANGUAGE_CODE] : '';
					let userDetailId	= (userDetails._id) 		? userDetails._id 		:'';
					let fullName		= (userDetails.full_name) 	? userDetails.full_name	:'';
					let email			= (userDetails.email) 		? userDetails.email 	:'';
					let code			= (userDetails.phone_country_code) 		? userDetails.phone_country_code 	:'';
					let mobile			= (userDetails.mobile_number) 		? userDetails.mobile_number 	:'';
					let emailAction		= 'order_submitted'
					let smsAction		= 'SMS.order_submitted';
					//if(email){
						///**** Send link to user email ****/
							//sendMail(req,res,{
								//to 			: 	email,
								//action 		: 	emailAction,
								//rep_array	:	[fullName,options.unique_order_id,restaurantName]
							//});
						///**** Send link to user email ****/
					//}
					if(mobile && code){
						/*************** SEND LINK ON USER MOBILE NUMBER  ***************/
						/*	let msgBody	= (res.locals.settings[smsAction]) ? res.locals.settings[smsAction] :"";
							msgBody		= msgBody.replace(RegExp('{ORDER_ID}','g'),options.unique_order_id);
							msgBody		= msgBody.replace(RegExp('{RESTAURANT_NAME}','g'),restaurantName);

							/**Send sms **/
						/*	sendSMS(req,res,{
								mobile_number	:	code+mobile,
								sms_template	:	msgBody,
								user_id			:	options.user_id
							}).then(()=>{});
						*/
						/*************** SEND LINK ON USER MOBILE NUMBER  **************/
					}
				}
			});
		break;
		case Constants.ORDER_STATUS_CONFIRMED_EVENT:
			let confirmedNotificationMessageParams = [orderUniqueId];
			let confirmedNofificationData	=	{
				notification_type : NotificationType,
				message_params : confirmedNotificationMessageParams,
				parent_table_id : orderId,
				user_id : userId,
				user_role_id : userRoleId,
			};
			confirmedNofificationData['restaurant_id']		=	options.restaurant_id;
			confirmedNofificationData['role_id']			=	Constants.RESTAURANT;
			confirmedNofificationData['only_for_user_role']	=	true;
			confirmedNofificationData['is_restaurant_notification']= true;

			/** Notification to restaurant on accepting order */
			insertNotifications(req,res,{
				notification_data : confirmedNofificationData
			}).then(()=>{});
		break;
		case Constants.ORDER_STATUS_READY_TO_PICK_UP_EVENT:
			asyncParallel({
				assigned_captain : (callback)=>{
					/** Get captain assigned to order to notify captain in case of order is ready to pick up */
					orders.findOne({
						_id : 	new ObjectId(orderId),
					},{projection:{captain_id:1}}).then(orderResult=>{
						let captainId = (orderResult && orderResult.captain_id) ? orderResult.captain_id: "";
						callback(null, captainId);
					}).catch(err=>{
						console.error("get captain assigned to order to notify captain in case of order is ready to pick up error ===>",eventType, err);
						callback(err);
					});
				}
			},(asyncErr,asyncResponse)=>{
				let driverAssigned	=	(asyncResponse.assigned_captain) ? asyncResponse.assigned_captain : '';
				if(driverAssigned){
					/** Notification to driver on order ready to pick up */
					insertNotifications(req,res,{
						notification_data : {
							notification_type : Constants.NOTIFICATION_TO_DRIVER_ORDER_READY_TO_PICK_UP,
							message_params : [orderUniqueId],
							parent_table_id : orderId,
							user_id : userId,
							user_role_id : userRoleId,
							user_ids : [driverAssigned],
							role_id : Constants.DRIVER,
							order_id : orderId
						}
					}).then(()=>{});
				}
				/** Notification to customer on order status update */
				insertNotifications(req,res,{
					notification_data : {
						notification_type : NotificationType,
						message_params : [orderUniqueId],
						parent_table_id : orderId,
						user_id : userId,
						user_role_id : userRoleId,
						user_ids : [receiverId],
						role_id : Constants.CUSTOMER
					}
				}).then(()=>{});
			});
		break;
		case Constants.ORDER_STATUS_PREPARING_EVENT:
		case Constants.ORDER_STATUS_DRIVER_WAY_TO_CUSTOMER_EVENT:
		case Constants.ORDER_STATUS_DRIVER_ARRIVED_AT_CUSTOMER_LOCATION_EVENT:
		case Constants.ORDER_STATUS_ON_THE_WAY_EVENT:
			
		    /** Notification to customer on order status update */
			insertNotifications(req,res,{
				notification_data : {
					notification_type : NotificationType,
					message_params : [orderUniqueId],
					parent_table_id : orderId,
					order_id : orderId,
					user_id : userId,
					user_role_id : userRoleId,
					user_ids : [receiverId],
					role_id : Constants.CUSTOMER
				}
			}).then(()=>{});

		break;
		case Constants.ORDER_STATUS_CANCELLED_EVENT:
			asyncParallel({
				assigned_captain : (callback)=>{
					/** Get captain assigned to order to notify captain in case of order is ready to pick up */
						orders.findOne({
						_id : 	new ObjectId(orderId),
					},{projection:{captain_id:1}}).then(orderResult=>{
						let captainId = (orderResult && orderResult.captain_id) ? orderResult.captain_id: "";
						callback(null, captainId);
					}).catch(err=>{
						console.error("get captain assigned to order to notify captain in case of order is ready to pick up error ===>",eventType, err);
						callback(err);
					});
				}
			},(_,response)=>{
				let driverAssigned	=	(response.assigned_captain) ? response.assigned_captain : '';
				if(driverAssigned){
					/** Notification to driver on order cancelled */
					insertNotifications(req,res,{
						notification_data : {
							notification_type : Constants.NOTIFICATION_ORDER_CANCELLED_TO_DRIVER,
							message_params : [orderUniqueId],
							parent_table_id : orderId,
							order_id : orderId,
							user_id : userId,
							user_role_id : userRoleId,
							user_ids : [driverAssigned],
							role_id : Constants.DRIVER
						}
					}).then(()=>{});
				}

				/** Notification to customer on order status update */
				insertNotifications(req,res,{
					notification_data : {
						notification_type : NotificationType,
						message_params : [orderUniqueId],
						parent_table_id : orderId,
						user_id : userId,
						user_role_id : userRoleId,
						user_ids : [receiverId],
						role_id : Constants.CUSTOMER
					}
				}).then(()=>{});
			});
		break;
		case Constants.ORDER_STATUS_DELIVERED_EVENT:
			asyncParallel({
				order_data : (callback)=>{
					/** Get captain assigned to order to notify captain in case of order is delivered */
					orders.findOne({_id: new ObjectId(orderId)},{projection:{captain_id:1}}).then(result=>{
						callback(null, result);
					}).catch(err=>{
						console.error("get order details in sendMailToUsers error ===>",eventType, err);
						callback(err);
					});
				},
			},(_,response)=>{
				let driverId = response?.order_data?.captain_id || '';
				
				/** Notification to customer on order status update */
				insertNotifications(req,res,{
					notification_data : {
						notification_type : NotificationType,
						message_params : [orderUniqueId],
						parent_table_id : orderId,
						user_id : userId,
						user_role_id : userRoleId,
						user_ids : [receiverId],
						role_id : Constants.CUSTOMER
					}
				}).then(()=>{});

				/** Notification to admin */
				insertNotifications(req,res,{
					notification_data : {
						notification_type : NotificationType,
						message_params : [orderUniqueId],
						parent_table_id : orderId,
						user_id : userId,
						user_role_id : userRoleId,
						only_for_user_role : true,
						role_id : Constants.CRAVEZ,
					}
				}).then(()=>{});

				/** Notification to restaurant on delivering order by driver */
				insertNotifications(req,res,{
					notification_data : {
						notification_type  : NotificationType,
						message_params 	   : [orderUniqueId],
						parent_table_id    : orderId,
						user_id 		   : userId,
						user_role_id 	   : userRoleId,
						restaurant_id      : options.restaurant_id,
						role_id            : Constants.RESTAURANT,
						is_restaurant_notification:	true,
						only_for_user_role : true,
					}
				}).then(()=>{});

				if(driverId){
					/** Notification to driver on delivering */
					insertNotifications(req,res,{
						notification_data : {
							notification_type : NotificationType,
							message_params : [orderUniqueId],
							parent_table_id : orderId,
							user_id : userId,
							user_role_id : userRoleId,
							user_ids : [driverId],
							role_id : Constants.DRIVER
						}
					}).then(()=>{});
				}
			});
		break;
		case Constants.ORDER_STATUS_PROBLEMATIC_EVENT:
			asyncParallel({
				order_data : (callback)=>{
					/** Get order details */
					orders.findOne({_id: new ObjectId(orderId)},{projection:{unique_order_id:1}}).then(result=>{
						callback(null, result);
					}).catch(err=>{
						console.error("get order details in sendMailToUsers error ===>",eventType, err);
						callback(err);
					});
				},
			},(_,response)=>{
				if(response){
					let orderDetails = response?.order_data || {};
					let uniqueOrderId= orderDetails?.unique_order_id || "";

					/** Notification to customer on order marked problematic */
					insertNotifications(req,res,{
						notification_data : {
							notification_type 	: NotificationType,
							message_params 		: [uniqueOrderId],
							parent_table_id 	: orderId,
							user_id 			: userId,
							user_role_id 		: userRoleId,
							user_ids 			: [receiverId],
							role_id 			: Constants.CUSTOMER
						}
					}).then(()=>{});
				}
			});
		break;
		case Constants.USER_REGISTRATION_EMAIL_EVENTS:
			asyncParallel({
				admin_details : (callback)=>{
					users.findOne({
						user_role_id : Constants.CRAVEZ
					},{projection:{full_name:1,_id:1}}).then(result=>{
						callback(null, result);
					}).catch(err=>{
						console.error("get admin details in sendMailToUsers error ===>",eventType, err);
						callback(err);
					});
				},
				user_details : (callback)=>{
					users.findOne({_id: new ObjectId(userId)},{projection:{full_name:1,email:1,_id:1,is_email_verified:1}}).then(result=>{
						callback(null, result);
					}).catch(err=>{
						console.error("get user details in sendMailToUsers error ===>",eventType, err);
						callback(err);
					});
				}
			},(_,response)=>{
				if(response){
					let userDetails 	= response?.user_details || {};
					let adminDetails	= response?.admin_details || {};
					let userId			= userDetails?._id || '';
					let fullName		= userDetails?.full_name || '';					
					let adminId			= adminDetails?._id || '';

					/** Notification to admin on registration */
					if(adminId){
						insertNotifications(req,res,{
							notification_data : {
								notification_type : Constants.NOTIFICATION_USER_REGISTER,
								message_params : [fullName],
								parent_table_id : id,
								user_id : id,
								user_role_id : Constants.FRONT_USER_ROLE_ID,
								user_ids : [adminId],
								role_id : Constants.CRAVEZ,
								extra_parameters : {
									user_id 	: userId
								}
							}
						}).then(()=>{});
					}
				}
			});
		break;

		case Constants.BRANCH_ENQUIRY_REJECT_EMAIL_EVENTS:
			let tmpBranchId	= options?.branch_id || "";
			tmp_restaurant_branches.aggregate([
				{$match :  {branch_id : new ObjectId(tmpBranchId) }},
				{$lookup:	{
					"from" 			: 	Tables.RESTAURANTS,
					"localField" 	:	"restaurant_id",
					"foreignField" 	: 	"_id",
					"as" 			: 	"restaurant_detail"
				}},
				{$project :	{ 
					_id:1,user_id:1,restaurant_id:1,branch_number:1,rejection_reason:1,name:1,
					restaurant_name: {$arrayElemAt: ["$restaurant_detail.default_name",0]} 
				}}
			]).toArray().then(result=>{
				if(result && result[0]){
					result				=	result[0];
					let userDataId 	 	= 	result?.user_id ? new ObjectId(result.user_id) : "";
					let restaurantId 	= 	result?.restaurant_id ? new ObjectId(result.restaurant_id) : "";
					let branchNumber 	= 	result?.branch_number || "";
					let rejectionReason	= 	result?.rejection_reason || "";
					let restaurantName	=	result?.restaurant_name || "";
					let branchName 		= 	result?.name?.[Constants.DEFAULT_LANGUAGE_CODE] || "";

					/**get details form users */
					let userFindConditions = {
						$or : [
							{_id : userDataId},
							{restaurant_id : restaurantId,user_role_id :Constants.RESTAURANT,user_type : Constants.USER_TYPE_RESTAURANT}
						],
						is_deleted : Constants.NOT_DELETED,
					};
					users.find(userFindConditions,{projection:{_id:1,email:1,full_name:1,user_role_id:1}}).toArray().then(userResult=>{
						
						if(userResult && userResult.length > 0){
							userResult.forEach(userData =>{
								/**Set variable for send email */
								let userEmail  = userData?.email || "";
								let fullName   = userData?.full_name || "";

								/**Send email function */
								if(userEmail) sendMail(req,res,{
									to 			: userEmail,
									action 		: "restaurant_pending_branch_enquiry_rejected",
									rep_array 	: [fullName,branchName,rejectionReason]
								});

								/*************** Send notification  ***************/
									let statusTitle = Constants.STATUS_LABELS?.[Constants.REJECTED]?.status_name?.toLowerCase() || "";
									insertNotifications(req,res,{
										notification_data : {
											notification_type 	: 	Constants.NOTIFICATION_BRANCH_APPROVAL_REQUEST_STATUS_UPDATE,
											message_params 		: 	[branchName,branchNumber,restaurantName,statusTitle],
											parent_table_id 	: 	tmpBranchId,
											user_ids 			: 	[userData._id],
											role_id 			: 	userData.user_role_id,
											extra_parameters 	:	{
												user_id : userData._id
											}
										}
									}).then(()=>{ });
								/*************** Send notification  ***************/
							});
						}
					}).catch(err=>{
						console.error("get user details in sendMailToUsers error ===>",eventType, err);
					});
				}
			}).catch(err=>{
				console.error("get branch enquiry reject email details in sendMailToUsers error ===>",eventType, err);
			});
		break;
		case Constants.RESTAURANT_ENQUIRY_REJECT_EMAIL_EVENTS:
			let restaurantEnquiryId	= options?.enquiry_id || "";			
			restaurant_enquiries.findOne({_id : new ObjectId(restaurantEnquiryId)},{projection :{_id :1,email:1,name:1,rejection_msg:1,contact_person_name:1}}).then(enqiryData=>{
				if(enqiryData){
					let reason 	 = enqiryData?.rejection_msg || "";
					let email	 = enqiryData?.email || "";
					let fullName = enqiryData?.contact_person_name || "";

					/**Send email function */
					if(email) sendMail(req,res,{
						to 			: email,
						action 		: "restaurant_enquiry_rejected",
						rep_array 	: [fullName,reason]
					});
				}
			}).catch(err=>{
				console.error("get restaurant enquiry reject email details in sendMailToUsers error ===>",eventType, err);
			});
		break;
		case Constants.RESTAURANT_ENQUIRY_APPROVE_EMAIL_EVENTS:
			let restaurantId	= options?.restaurant_id || "";
			let password		= options?.password || "";

			restaurant_details.findOne({restaurant_id : new ObjectId(restaurantId)},{projection :{_id :1,email:1,account_manager:1}}).then(result=>{
				if(result){
					let email	 		= result?.email || "";
					let accountManager	= result?.account_manager || "";

					/**Send email function */
					if(email) sendMail(req,res,{
						to 			: email,
						action 		: "restaurant_enquiry_approved",
						rep_array 	:[accountManager,email,password]
					});
				}
			}).catch(err=>{
				console.error("get restaurant enquiry approve email details in sendMailToUsers error ===>",eventType, err);
			});
		break;
		case Constants.TEAM_BREAK_APPROVE_REJECT_EMAIL_EVENTS:
			asyncParallel({
				user_details : (callback)=>{
					users.findOne({_id : new ObjectId(userId)},{projection:{full_name:1,email:1,_id:1,parent_id:1}}).then(result=>{
						callback(null, result);
					}).catch(err=>{
						console.error("get user details in sendMailToUsers error ===>",eventType, err);
						callback(err);
					});
				}
			},(_,response)=>{
				if(response.user_details){
					let userDetails = response.user_details;
					let fullName	= (userDetails.full_name) 	? userDetails.full_name 	:'';
					let email		= (userDetails.email) 		? userDetails.email 		:'';
					let breakDetail	= (options.break_details)	? options.break_details 	:{};
					let startTime	= (breakDetail.start_time) 	? breakDetail.start_time 	:"";
					let endTime		= (breakDetail.end_time)	? breakDetail.end_time 		:"";
					let action		= (options.action_taken)	? options.action_taken 		:"";
					let reason		= (breakDetail.rejection_reason)? breakDetail.rejection_reason 	:"";
					let emailAction	= (action == Constants.APPROVED) 		? "break_approved" : "break_rejected";
					let breakDate	= (breakDetail.date)		? Helper.getUtcDate(breakDetail.date,Constants.DATE_FORMAT_EMAIL) :"";
					let repArray	= (action == Constants.APPROVED) ? [fullName,breakDate,startTime,endTime] : [fullName,breakDate,startTime,endTime,reason];

					/**Send email function */
					if(email) sendMail(req,res,{
						to 			: email,
						action 		: emailAction,
						rep_array 	: repArray
					});

					/*************** Send notification ***************/
					let statusTitle = Constants.TEAM_BREAK_STATUS?.[action]?.status_name?.toLowerCase() || "";
					insertNotifications(req,res,{
						notification_data : {
							notification_type 	: Constants.NOTIFICATION_TEAM_BREAK_APPROVE_REJECT,
							message_params 		: [statusTitle],
							parent_table_id 	: options.break_id,
							user_ids 			: [userDetails._id],
							role_id 			: userDetails.user_role_id,
							extra_parameters 	: {
								parent_id : new ObjectId(userDetails.parent_id)
							}
						}
					}).then(()=>{ });
					/*************** Send notification  ***************/
				}
			});
		break;
		case Constants.TEAM_BREAK_REQUEST_POSTED_EMAIL_EVENTS:
			let memberId = options?.member_id ? new ObjectId(options.member_id) : "";
			asyncParallel({
				user_details : (callback)=>{
					users.findOne({_id : new ObjectId(userId)},{projection:{full_name:1,email:1,_id:1,user_role_id:1}}).then(result=>{
						callback(null, result);
					}).catch(err=>{
						console.error("get user details in sendMailToUsers error ===>",eventType, err);
						callback(err);
					});
				},
				member_details : (callback)=>{
					users.findOne({_id: memberId},{projection:{full_name:1,email:1,_id:1}}).then(result=>{
						callback(null, result);
					}).catch(err=>{
						console.error("get member details in sendMailToUsers error ===>",eventType, err);
						callback(err);
					});
				}
			},(_,response)=>{
				if(response.user_details){
					let userDetails 	= response?.user_details || {};
					let memberDetails 	= response?.member_details || {};
					let fullName		= userDetails?.full_name || '';
					let email			= userDetails?.email || '';
					let memberName		= memberDetails?.full_name || '';
					let breakDetail		= options?.break_details || {};
					let startTime		= breakDetail?.start_time || "";
					let endTime			= breakDetail?.end_time || "";
					let breakDate		= breakDetail?.date ? Helper.newDate(breakDetail.date,Constants.DATE_FORMAT_EMAIL) :"";

					/**Send email function */
					if(email) sendMail(req,res, {
						to 			: email,
						action 		: "break_request_posted",
						rep_array 	: [fullName,memberName,breakDate,startTime,endTime]
					});

					/*************** Send notification  ***************/
					if(memberDetails){
						insertNotifications(req,res,{
							notification_data : {
								notification_type 	: Constants.NOTIFICATION_TEAM_BREAK_REQUEST_POST,
								message_params 		: [memberName],
								parent_table_id 	: options.break_id,
								user_ids 			: [userDetails._id],
								role_id 			: userDetails.user_role_id,
								extra_parameters 	: {
									member_id : new ObjectId(memberDetails._id)
								}
							}
						}).then(()=>{ });
					}
					/*************** Send notification  ***************/
				}
			});
		break;
		case Constants.RESTAURANT_ENQUIRY_REQUEST_EMAIL_EVENTS:
			if(options.enquiry_id && options.email_address && options.restaurant_name && options.contact_person_name){
				/** Notification to admin for restaurant enquiry */
					insertNotifications(req,res,{
						notification_data : {
							notification_type:	Constants.NOTIFICATION_RESTAURANT_ENQUIRY_REQUEST,
							message_params 	:	[options.restaurant_name],
							parent_table_id : 	options.enquiry_id,
							user_role_id 	: 	Constants.CRAVEZ,
							role_id 		: 	[Constants.CRAVEZ,Constants.SALES_TEAM,Constants.MARKETING_TEAM],
							only_for_user_role:	true,
							extra_parameters: 	{
								enquiry_id 	: options.enquiry_id
							}
						}
					}).then(()=>{});
				/*************** Send approval request to admin  ***************/

				/*** Send email function **/
					if(options.email_address) sendMail(req,res,{
						to 			: options.email_address,
						action 		: "restaurant_enquiry_request",
						rep_array 	: [options.contact_person_name]
					});
				/*** Send email function **/
			}
		break;
		case Constants.RESTAURANT_CATEGORY_REJECT_EMAIL_EVENTS:
			if(options.category_id && options.category_name && options.restaurant_id && options.reject_msg && options.user_id){

				asyncParallel({
					user_list : (callback)=>{
						/** Get user list */
						users.find({
							$or : [
								{_id : new ObjectId(options.user_id),},
								{restaurant_id : new ObjectId(options.restaurant_id),user_role_id :Constants.RESTAURANT,user_type : Constants.USER_TYPE_RESTAURANT}
							],
							is_deleted : Constants.NOT_DELETED,
						},{projection:{_id:1,email:1,full_name:1,user_role_id:1}}).toArray().then(userResult=>{
							callback(null,userResult);
						}).catch(err=>{
							console.error("get user list in sendMailToUsers error ===>",eventType, err);
							callback(err);
						});
					},
					restaurant_details : (callback)=>{
						/** Get restaurants details **/
						restaurants.findOne({_id : new ObjectId(options.restaurant_id)},{projection :{_id:1,default_name:1}}).then(result=>{
							callback(null,result);
						}).catch(err=>{
							console.error("get restaurant details in sendMailToUsers error ===>",eventType, err);
							callback(err);
						});
					}
				},(_, asyncResponse)=>{
					if(asyncResponse?.restaurant_details && asyncResponse?.user_list && asyncResponse?.user_list?.length >0){

						let restaurantName = asyncResponse?.restaurant_details?.default_name || "";
						asyncResponse.user_list.map(userData =>{
							/**Set variable for send email */
							let userEmail  = userData?.email || "";
							let fullName   = userData?.full_name || "";

							/**Send email function */
							if(userEmail) sendMail(req,res,{
								to 			: userEmail,
								action 		: "restaurant_pending_category_rejected",
								rep_array 	: [fullName,options.category_name,options.reject_msg]
							});

							/*************** Send notification  ***************/
								let statusTitle = Constants.STATUS_LABELS?.[Constants.REJECTED]?.status_name?.toLowerCase() || "";
								insertNotifications(req,res,{
									notification_data : {
										notification_type 	: 	Constants.NOTIFICATION_RESTAURANT_CATEGORY_APPROVAL_REQUEST_STATUS_UPDATE,
										message_params 		: 	[options.category_name,restaurantName,statusTitle],
										parent_table_id 	: 	options.category_id,
										user_ids 			: 	[userData._id],
										role_id 			: 	userData.user_role_id,
										extra_parameters 	:	{
											user_id : userData._id
										}
									}
								}).then(()=>{ });
							/*************** Send notification  ***************/
						});
					}
				});
			}
		break;
		case Constants.RESTAURANT_CATEGORY_APPROVE_EMAIL_EVENTS:
			if(options.category_id && options.category_name && options.restaurant_id && options.user_id){
				asyncParallel({
					user_list : (callback)=>{
						/** Get user list */
						users.find({
							$or : [
								{_id : new ObjectId(options.user_id)},
								{restaurant_id : new ObjectId(options.restaurant_id),user_role_id :Constants.RESTAURANT,user_type : Constants.USER_TYPE_RESTAURANT}
							],
							is_deleted : Constants.NOT_DELETED,
						},{projection:{_id:1,email:1,full_name:1,user_role_id:1}}).toArray().then(userResult=>{
							callback(null,userResult);
						}).catch(err=>{
							console.error("get user list in sendMailToUsers error ===>",eventType, err);
							callback(err);
						});
					},
					restaurant_details : (callback)=>{
						/** Get restaurants details **/
						restaurants.findOne({_id : new ObjectId(options.restaurant_id)},{projection :{_id:1,default_name:1}}).then(result=>{
							callback(null,result);
						}).catch(err=>{
							console.error("get restaurant details in sendMailToUsers error ===>",eventType, err);
							callback(err);
						});
					}
				},(_, asyncResponse)=>{
					if(asyncResponse?.restaurant_details && asyncResponse?.user_list && asyncResponse?.user_list?.length >0){

						let restaurantName = asyncResponse?.restaurant_details?.default_name || "";

						asyncResponse.user_list.map(userData =>{
							/**Set variable for send email */
							let userEmail  = userData?.email || "";
							let fullName   = userData?.full_name || "";

							/**Send email function */
							if(userEmail) sendMail(req,res,{
								to 			: userEmail,
								action 		: "restaurant_pending_category_approved",
								rep_array 	: [fullName,options.category_name]
							});

							/*************** Send notification  ***************/
								let statusTitle = Constants.STATUS_LABELS?.[Constants.APPROVED]?.status_name?.toLowerCase() || "";
								insertNotifications(req,res,{
									notification_data : {
										notification_type 	: 	Constants.NOTIFICATION_RESTAURANT_CATEGORY_APPROVAL_REQUEST_STATUS_UPDATE,
										message_params 		: 	[options.category_name,restaurantName,statusTitle],
										parent_table_id 	: 	options.category_id,
										user_ids 			: 	[userData._id],
										role_id 			: 	userData.user_role_id,
										extra_parameters 	:	{
											user_id : userData._id
										}
									}
								}).then(()=>{});
							/*************** Send notification  ***************/
						});
					}
				});
			}
		break;
		case Constants.RESTAURANT_MENU_REJECT_EMAIL_EVENTS:
			if(options.menu_id && options.menu_name && options.restaurant_id && options.reject_msg && options.user_id){

				asyncParallel({
					user_list : (callback)=>{
						/** Get user list */
						users.find({
							$or : [
								{_id : new ObjectId(options.user_id)},
								{restaurant_id : new ObjectId(options.restaurant_id),user_role_id :Constants.RESTAURANT,user_type : Constants.USER_TYPE_RESTAURANT}
							],
							is_deleted : Constants.NOT_DELETED,
						},{projection:{_id:1,email:1,full_name:1,user_role_id:1}}).toArray().then(userResult=>{
							callback(null,userResult);
						}).catch(err=>{
							console.error("get user list in sendMailToUsers error ===>",eventType, err);
							callback(err);
						});
					},
					restaurant_details : (callback)=>{
						/** Get restaurants details **/
						restaurants.findOne({_id : new ObjectId(options.restaurant_id)},{projection :{_id:1,default_name:1}}).then(result=>{
							callback(null,result);
						}).catch(err=>{
							console.error("get restaurant details in sendMailToUsers error ===>",eventType, err);
							callback(err);
						});
					}
				},(_, asyncResponse)=>{
					if(asyncResponse?.restaurant_details && asyncResponse?.user_list && asyncResponse?.user_list?.length >0){

						let restaurantName = asyncResponse?.restaurant_details?.default_name || "";

						asyncResponse.user_list.map(userData =>{
							/**Set variable for send email */
							let userEmail  = userData?.email || "";
							let fullName   = userData?.full_name || "";

							/**Send email function */
							if(userEmail) sendMail(req,res,{
								to 			: userEmail,
								action 		: "restaurant_menu_reject",
								rep_array 	: [fullName,options.menu_name,options.reject_msg]
							});

							/*************** Send notification  ***************/
								let statusTitle = Constants.STATUS_LABELS?.[Constants.REJECTED]?.status_name?.toLowerCase() || "";
								insertNotifications(req,res,{
									notification_data : {
										notification_type 	: 	Constants.NOTIFICATION_RESTAURANT_MENU_APPROVAL_REQUEST_STATUS_UPDATE,
										message_params 		: 	[options.menu_name,restaurantName,statusTitle],
										parent_table_id 	: 	options.menu_id,
										user_ids 			: 	[userData._id],
										role_id 			: 	userData.user_role_id,
										extra_parameters 	:	{
											user_id : userData._id
										}
									}
								}).then(()=>{ });
							/*************** Send notification  ***************/
						});
					}
				});
			}
		break;
		case Constants.RESTAURANT_MENU_APPROVE_EMAIL_EVENTS:
			if(options.menu_id && options.menu_name && options.restaurant_id && options.user_id){

				asyncParallel({
					user_list : (callback)=>{
						/** Get user list */
						users.find({
							$or : [
								{_id : new ObjectId(options.user_id)},
								{restaurant_id : new ObjectId(options.restaurant_id),user_role_id :Constants.RESTAURANT,user_type : Constants.USER_TYPE_RESTAURANT}
							],
							is_deleted : Constants.NOT_DELETED,
						},{projection:{_id:1,email:1,full_name:1,user_role_id:1}}).toArray().then(userResult=>{
							callback(null,userResult);
						}).catch(err=>{
							console.error("get user list in sendMailToUsers error ===>",eventType, err);
							callback(err);
						});
					},
					restaurant_details : (callback)=>{
						/** Get restaurants details **/
						restaurants.findOne({_id : new ObjectId(options.restaurant_id)},{projection :{_id:1,default_name:1}}).then(result=>{
							callback(null,result);
						}).catch(err=>{
							console.error("get restaurant details in sendMailToUsers error ===>",eventType, err);
							callback(err);
						});
					}
				},(_, asyncResponse)=>{
					if(asyncResponse?.restaurant_details && asyncResponse?.user_list && asyncResponse?.user_list?.length >0){

						let restaurantName = asyncResponse?.restaurant_details?.default_name || "";
						asyncResponse.user_list.map(userData =>{
							/**Set variable for send email */
							let userEmail  = userData?.email || "";
							let fullName   = userData?.full_name || "";

							/**Send email function */
							if(userEmail) sendMail(req,res,{
								to 			: userEmail,
								action 		: "restaurant_menu_approve",
								rep_array 	: [fullName,options.menu_name]
							});

							/*************** Send notification  ***************/
								let statusTitle = Constants.STATUS_LABELS?.[Constants.APPROVED]?.status_name?.toLowerCase() || "";
								insertNotifications(req,res,{
									notification_data : {
										notification_type 	: 	Constants.NOTIFICATION_RESTAURANT_MENU_APPROVAL_REQUEST_STATUS_UPDATE,
										message_params 		: 	[options.menu_name,restaurantName,statusTitle],
										parent_table_id 	: 	options.menu_id,
										user_ids 			: 	[userData._id],
										role_id 			: 	userData.user_role_id,
										extra_parameters 	:	{
											user_id : userData._id
										}
									}
								}).then(()=>{});
							/*************** Send notification  ***************/
						});
					}
				});
			}
		break;
		case Constants.RESTAURANT_REGISTRATION_EMAIL_EVENTS:
			if(options?.restaurant_id && options?.restaurant_name && options?.restaurant_email && options?.password){

				/**** Send add restaurant user email ****/
					sendMail(req,res,{
						to 			: 	options?.restaurant_email,
						action 		: 	"add_restaurant_user",
						rep_array	:	[options?.restaurant_name,options?.restaurant_email,options?.password,Constants.WEBSITE_URL]
					});
				/**** Send add restaurant user email ****/
			}
		break;
		case Constants.NOTIFICATION_OVERTIME_REQUEST:
			if(options.parent_table_id && options.tl_fullname && options.user_id){
				asyncParallel({
					user_details : (callback)=>{
						users.findOne({_id : new ObjectId(userId)},{projection:{full_name:1,email:1,_id:1}}).then(result=>{
							callback(null, result);
						}).catch(err=>{
							console.error("get user details in sendMailToUsers error ===>",eventType, err);
							callback(err);
						});
					}
				},(_, asyncResponse)=>{
					if(asyncResponse?.user_details ){
						/*************** Send notification  ***************/
						insertNotifications(req,res,{
							notification_data : {
								notification_type 	: 	Constants.NOTIFICATION_OVERTIME_REQUEST,
								message_params 		: 	[options?.tl_fullname || ""],
								parent_table_id 	: 	options.parent_table_id,
								user_ids 			: 	[asyncResponse.user_details._id],
								role_id 			: 	asyncResponse.user_details.user_role_id,
							}
						}).then(()=>{ });
						/*************** Send notification  ***************/
					}
				});
			}
		break;
		case Constants.NOTIFICATION_CAPTAIN_OVERTIME_REQUEST:
		case Constants.NOTIFICATION_TO_CAPTAIN_FOR_UPDATE_OVERTIME_REQUEST_HOURS:
			if(options.parent_table_id && options.tl_fullname && options.user_id){
				asyncParallel({
					user_details : (callback)=>{
						users.findOne({_id : new ObjectId(userId)},{projection:{full_name:1,email:1,_id:1}}).then(result=>{
							callback(null, result);
						}).catch(err=>{
							console.error("get user details in sendMailToUsers error ===>",eventType, err);
							callback(err);
						});
					}
				},(_, asyncResponse)=>{
					if(asyncResponse?.user_details ){
						let tlFullName 		= options?.tl_fullname || "";
						let hours 			= options?.hours || "";
						let requestDate 	= options?.request_date ? Helper.newDate(options.request_date,Constants.DATE_FORMAT_EMAIL) : "";
						if(hours && requestDate && tlFullName){
							/*************** Send notification  ***************/
							insertNotifications(req,res,{
								notification_data : {
									notification_type 	: 	(eventType == Constants.NOTIFICATION_CAPTAIN_OVERTIME_REQUEST) ? Constants.NOTIFICATION_CAPTAIN_OVERTIME_REQUEST : Constants.		NOTIFICATION_TO_CAPTAIN_FOR_UPDATE_OVERTIME_REQUEST_HOURS,
									message_params 		: 	[tlFullName,hours,requestDate],
									parent_table_id 	: 	options.parent_table_id,
									user_ids 			: 	[asyncResponse.user_details._id],
									role_id 			: 	asyncResponse.user_details.user_role_id,
								}
							}).then(()=>{ });
							/*************** Send notification  ***************/
						}
					}
				});
			}
		break;
		case Constants.NOTIFICATION_DRIVER_REGISTER:
			if(options.driver_fullname && options.driver_email && options.driver_password){
				let androidApp	= res.locals.settings['App.driver_android_app_link'];
				let iosApp		= res.locals.settings['App.driver_ios_app_link'];
				/**** Send add driver user email ****/
					sendMail(req,res,{
						to 			: 	options.driver_email,
						action 		: 	"add_driver",
						rep_array	:	[options.driver_fullname,options.driver_email,options.driver_password,androidApp,iosApp]
					});
				/**** Send add driver user email ****/
			}
		break;
		case Constants.NOTIFICATION_CUSTOMER_REGISTER:
			if(options.customer_fullname && options.customer_email && options.customer_password){
				let androidApp	= res.locals.settings['App.customer_android_app_link'];
				let iosApp		= res.locals.settings['App.customer_ios_app_link'];
				/**** Send add customer user email ****/
					sendMail(req,res,{
						to 			: 	options.customer_email,
						action 		: 	"add_customer",
						rep_array	:	[options.customer_fullname,options.customer_email,options.customer_password,androidApp,iosApp]
					});
				/**** Send add customer user email ****/
			}
		break;
		case Constants.NOTIFICATION_ADMIN_USER_REGISTER:
			if(options?.fullname && options?.email && options?.password){

				/**** Send add customer user email ****/
					sendMail(req,res,{
						to 			: 	options?.email,
						action 		: 	"add_user",
						rep_array	:	[options?.fullname,options?.email,options?.password,Constants.WEBSITE_ADMIN_URL]
					});
				/**** Send add customer user email ****/
			}
		break;
		case Constants.NOTIFICATION_SEND_LOGIN_CREDENTIALS:
			if(options?.fullname && options?.email && options?.password){

				/**** Send add customer user email ****/
					sendMail(req,res,{
						to 			: 	options?.email,
						action 		: 	"send_login_credentials",
						rep_array	:	[options?.fullname,options?.email,options?.password,Constants.WEBSITE_ADMIN_URL]
					});
				/**** Send add customer user email ****/
			}
		break;
		case Constants.NOTIFICATION_VACATION_REQUEST:
			if(options.parent_table_id && options.tl_fullname && options.user_id){
				asyncParallel({
					user_details : (callback)=>{
						users.findOne({_id : new ObjectId(userId)},{projection:{full_name:1,email:1,_id:1,user_role_id:1}}).then(result=>{
							callback(null, result);
						}).catch(err=>{
							console.error("get user details in sendMailToUsers error ===>",eventType, err);
							callback(err);
						});
					}
				},(_, asyncResponse)=>{
					if(asyncResponse?.user_details ){
						
						/*************** Send notification  ***************/
						insertNotifications(req,res,{
							notification_data : {
								notification_type 	: 	Constants.NOTIFICATION_VACATION_REQUEST,
								message_params 		: 	[options?.tl_fullname || ""],
								parent_table_id 	: 	options.parent_table_id,
								user_ids 			: 	[asyncResponse.user_details._id],
								role_id 			: 	asyncResponse.user_details.user_role_id,
							}
						}).then(()=>{ });
						/*************** Send notification  ***************/
					}
				});
			}
		break;
		case Constants.NOTIFICATION_WEEKLY_REQUEST:
			if(options.parent_table_id && options.tl_fullname && options.user_id){
				asyncParallel({
					user_details : (callback)=>{
						users.findOne({_id : new ObjectId(userId)},{projection:{full_name:1,email:1,_id:1,user_role_id:1}}).then(result=>{
							callback(null, result);
						}).catch(err=>{
							console.error("get user details in sendMailToUsers error ===>",eventType, err);
							callback(err);
						});
					}
				},(_, asyncResponse)=>{
					if(asyncResponse?.user_details ){
						
						/*************** Send notification  ***************/
						insertNotifications(req,res,{
							notification_data : {
								notification_type 	: 	Constants.NOTIFICATION_WEEKLY_REQUEST,
								message_params 		: 	[options?.tl_fullname || ""],
								parent_table_id 	: 	options.parent_table_id,
								user_ids 			: 	[asyncResponse.user_details._id],
								role_id 			: 	asyncResponse.user_details.user_role_id,
							}
						}).then(()=>{ });
						/*************** Send notification  ***************/
					}
				});
			}
		break;
		case Constants.NOTIFICATION_FRONT_CUSTOMER_REGISTER:
			if(options?.full_name && options?.email && options?.validate_string && options?.mobile_number && options?.otp){

				/**** Send add customer user email ****/
					let verifyLink	=	Constants.WEBSITE_HOST_URL+"verify_email/"+options?.validate_string;
					sendMail(req,res,{
						to 			: 	options?.email,
						action 		: 	"add_front_customer",
						rep_array	:	[options?.full_name,verifyLink]
					});
				/**** Send add customer user email ****/

				/*************** SEND OTP ON USER MOBILE NUMBER  ***************/
					let msgBody	= (res.locals.settings['SMS.user_registration']) ? res.locals.settings['SMS.user_registration'] :"";
					msgBody		= msgBody.replace(RegExp('{OTP}','g'),options?.otp);

					/**Send sms **/
					sendSMS(req,res,{
						mobile_number	:	options?.mobile_number,
						sms_template	:	msgBody,
						user_id			:	options?.user_id
					}).then(()=>{});
				/*************** SEND OTP ON USER MOBILE NUMBER  ***************/
			}
		break;
		case Constants.NOTIFICATION_FRONT_DRIVER_REGISTER:
			if(options.full_name && options.email && options.validate_string && options.mobile_number && options.otp){

				/**** Send add customer user email ****/
					let verifyLink	=	Constants.WEBSITE_URL+"verify_email/"+options?.validate_string;
					sendMail(req,res,{
						to 			: 	options?.email,
						action 		: 	"add_front_driver",
						rep_array	:	[options?.full_name,verifyLink]
					});
				/**** Send add customer user email ****/

				/*************** SEND OTP ON USER MOBILE NUMBER  ***************/
				let msgBody	= (res.locals.settings['SMS.user_registration']) ? res.locals.settings['SMS.user_registration'] :"";
				msgBody		= msgBody.replace(RegExp('{OTP}','g'),options.otp);

				/**Send sms **/
				sendSMS(req,res,{
					mobile_number	:	options.mobile_number,
					sms_template	:	msgBody,
					user_id			:	options.user_id
				}).then(()=>{});
			/*************** SEND OTP ON USER MOBILE NUMBER  ***************/
			}
		break;

		case Constants.RESEND_CUSTOMER_DRIVER_EMAIL_EVENTS:
			if(options?.email && options?.validate_string && options?.full_name){
				/*************** Send Email   ***************/
				let link = Constants.WEBSITE_URL+"verify_email/"+options?.validate_string;
				if(options?.user_type == Constants.USER_TYPE_CUSTOMER){
					link = Constants.WEBSITE_HOST_URL+"verify_email/"+options?.validate_string;
				}
				sendMail(req,res,{
					to			: options?.email,
					action		: "customer_driver_email_verification",
					rep_array	: [options?.full_name,link]
				});
				/*************** Send Email***************/
			}
		break;
		case Constants.CUSTOMER_DRIVER_FORGOT_PASSWORD_EMAIL_EVENTS:
			if(options?.email && options?.validate_string && options?.full_name && options?.user_type){
				/*************** Send Email   ***************/
				let link =  Constants.WEBSITE_URL+"reset_password/"+options?.validate_string+"/"+options?.user_type;
				if(options?.user_type == Constants.USER_TYPE_CUSTOMER){
					link =  Constants.WEBSITE_HOST_URL+"reset-password-by-email/"+options?.validate_string+"/"+options?.user_type;
				}
				sendMail(req,res,{
					to			: options?.email,
					action		: "customer_driver_forgot_password",
					rep_array	: [options?.full_name,link]
				});
				/*************** Send Email***************/
			}
		break;
		case Constants.NOTIFICATION_CUISINE_PRIORITIES_SEND_FOR_APPROVAL:
			if(options?.restaurant_id && options?.branch_id){
				asyncParallel({
					user_details : (callback)=>{
						users.findOne({restaurant_id : new ObjectId(options.restaurant_id)},{projection:{full_name:1,email:1,_id:1,user_role_id:1}}).then(result=>{
							callback(null, result);
						}).catch(err=>{
							console.error("get user details in sendMailToUsers error ===>",eventType, err);
							callback(err);
						});
					},
					branch_details : (callback)=>{
						restaurant_branches.findOne({_id : new ObjectId(options.branch_id),restaurant_id:new ObjectId(options.restaurant_id)},{projection :{_id:1,name:1}}).then(branchResult=>{
							callback(null,branchResult);
						}).catch(err=>{
							console.error("get branch details in sendMailToUsers error ===>",eventType, err);
							callback(err);
						});
					}
				},(_, asyncResponse)=>{
					if(asyncResponse?.user_details && asyncResponse?.branch_details){
						/*************** Send notification  ***************/
						insertNotifications(req,res,{
							notification_data : {
								notification_type 	: 	Constants.NOTIFICATION_CUISINE_PRIORITIES_SEND_FOR_APPROVAL,
								message_params 		: 	[asyncResponse.branch_details.name.en],
								parent_table_id 	: 	options.branch_id,
								user_ids 			: 	[asyncResponse.user_details._id],
								role_id 			: 	asyncResponse.user_details.user_role_id,
								extra_parameters 	:	{
									restaurant_id : options.restaurant_id,
									branch_id 	  : options.branch_id
								}
							}
						}).then(()=>{ });
						/*************** Send notification  ***************/
					}
				});
			}
		break;
		case Constants.NOTIFICATION_CUISINE_PRIORITIES_REJECTED:
			if(options.restaurant_id && options.branch_id){
				asyncParallel({
					restaurant_details : (callback)=>{
						restaurants.findOne({_id : new ObjectId(options.restaurant_id)},{projection :{_id:1,name:1}}).then(restaurantResult=>{
							callback(null,restaurantResult);
						}).catch(err=>{
							console.error("get restaurant details in sendMailToUsers error ===>",eventType, err);
							callback(err);
						});
					}
				},(_, asyncResponse)=>{
					if(asyncResponse?.restaurant_details){
						/*************** Send notification  ***************/
						insertNotifications(req,res,{
							notification_data : {
								notification_type 	: 	Constants.NOTIFICATION_CUISINE_PRIORITIES_REJECTED,
								message_params 		: 	[asyncResponse.restaurant_details?.name?.[Constants.DEFAULT_LANGUAGE_CODE] || ""],
								parent_table_id 	: 	options.branch_id,
								user_role_id 		: 	Constants.CRAVEZ,
								role_id 			: 	[Constants.CRAVEZ,Constants.CONTENT_TEAM],
								extra_parameters 	:	{
									restaurant_id : options.restaurant_id,
									branch_id 	  : options.branch_id
								}
							}
						}).then(()=>{ });
						/*************** Send notification  ***************/
					}
				});
			}
		break;
		case Constants.NOTIFICATION_CUISINE_PRIORITIES_APPROVED:
			if(options.restaurant_id && options.branch_id){
				asyncParallel({
					restaurant_details : (callback)=>{
						restaurants.findOne({_id : new ObjectId(options.restaurant_id)},{projection :{_id:1,name:1}}).then(restaurantResult=>{
							callback(null,restaurantResult);
						}).catch(err=>{
							console.error("get restaurant details in sendMailToUsers error ===>",eventType, err);
							callback(err);
						});
					}
				},(_, asyncResponse)=>{
					if(asyncResponse?.restaurant_details){
						/*************** Send notification  ***************/
						insertNotifications(req,res,{
							notification_data : {
								notification_type 	: 	Constants.NOTIFICATION_CUISINE_PRIORITIES_APPROVED,
								message_params 		: 	[asyncResponse.restaurant_details?.name?.[Constants.DEFAULT_LANGUAGE_CODE] || ""],
								parent_table_id 	: 	options.branch_id,
								user_role_id 		: 	Constants.CRAVEZ,
								role_id 			: 	[Constants.CRAVEZ,Constants.CONTENT_TEAM],
								only_for_user_role	:	true,
								extra_parameters 	:	{
									restaurant_id : options.restaurant_id,
									branch_id 	  : options.branch_id
								}
							}
						}).then(()=>{ });
						/*************** Send notification  ***************/
					}
				});
			}
		break;
		case Constants.RESTAURANT_ITEM_APPROVE_EMAIL_EVENTS:
			if(options.item_id && options.item_name && options.restaurant_id && options.user_id){
				asyncParallel({
					user_list : (callback)=>{
						/** Get user list */
						users.find({
							$or : [
								{_id : new ObjectId(options.user_id)},
								{restaurant_id : new ObjectId(options.restaurant_id),user_role_id :Constants.RESTAURANT,user_type : Constants.USER_TYPE_RESTAURANT}
							],
							is_deleted : Constants.NOT_DELETED,
						},{projection:{_id:1,email:1,full_name:1,user_role_id:1}}).toArray().then(userResult=>{
							callback(null,userResult);
						}).catch(err=>{
							console.error("get user list in sendMailToUsers error ===>",eventType, err);
							callback(err);
						});
					}
				},(_, asyncResponse)=>{
					if(asyncResponse?.user_list && asyncResponse?.user_list?.length >0){

						asyncResponse.user_list.map(userData =>{
							/**Set variable for send email */
							let userEmail  = userData?.email || "";
							let fullName   = userData?.full_name || "";

							/**Send email function */
							if(userEmail) sendMail(req,res,{
								to 			: userEmail,
								action 		: "restaurant_item_approve",
								rep_array 	: [fullName,options.item_name]
							});

							/*************** Send notification  ***************/
								let statusTitle = Constants.STATUS_LABELS?.[Constants.APPROVED]?.status_name?.toLowerCase() || "";
								insertNotifications(req,res,{
									notification_data : {
										notification_type 	: 	Constants.NOTIFICATION_RESTAURANT_ITEM_APPROVAL_REQUEST_STATUS_UPDATE,
										message_params 		: 	[options.item_name,statusTitle],
										parent_table_id 	: 	options.item_id,
										user_ids 			: 	[userData._id],
										role_id 			: 	userData.user_role_id,
										extra_parameters 	:	{
											user_id : userData._id
										}
									}
								}).then(()=>{});
							/*************** Send notification  ***************/
						});
					}
				});
			}
		break;
		case Constants.RESTAURANT_ITEM_REJECT_EMAIL_EVENTS:
			if(options.item_id && options.item_name && options.restaurant_id && options.reject_msg && options.user_id){
				asyncParallel({
					user_list : (callback)=>{
						/** Get user list */
						users.find({
							$or : [
								{_id : new ObjectId(options.user_id)},
								{restaurant_id : new ObjectId(options.restaurant_id),user_role_id :Constants.RESTAURANT,user_type : Constants.USER_TYPE_RESTAURANT}
							],
							is_deleted : Constants.NOT_DELETED,
						},{projection:{_id:1,email:1,full_name:1,user_role_id:1}}).toArray().then(userResult=>{
							callback(null,userResult);
						}).catch(err=>{
							console.error("get user list in sendMailToUsers error ===>",eventType, err);
							callback(err);
						});
					}
				},(_, asyncResponse)=>{
					if(asyncResponse?.user_list && asyncResponse?.user_list?.length >0){

						asyncResponse.user_list.map(userData =>{
							/**Set variable for send email */
							let userEmail  = userData?.email || "";
							let fullName   = userData?.full_name || "";

							/**Send email function */
							if(userEmail) sendMail(req,res,{
								to 			: userEmail,
								action 		: "restaurant_item_reject",
								rep_array 	: [fullName,options.item_name,options.reject_msg]
							});

							/*************** Send notification  ***************/
								let statusTitle = Constants.STATUS_LABELS?.[Constants.REJECTED]?.status_name?.toLowerCase() || "";
								insertNotifications(req,res,{
									notification_data : {
										notification_type 	: 	Constants.NOTIFICATION_RESTAURANT_ITEM_APPROVAL_REQUEST_STATUS_UPDATE,
										message_params 		: 	[options.item_name,statusTitle],
										parent_table_id 	: 	options.item_id,
										user_ids 			: 	[userData._id],
										role_id 			: 	userData.user_role_id,
										extra_parameters 	:	{
											user_id : userData._id
										}
									}
								}).then(()=>{});
							/*************** Send notification  ***************/
						});
					}
				});
			}
		break;
		case Constants.DRIVER_BREAK_APPROVE_REJECT_EMAIL_EVENTS:
			 asyncParallel({
			 	user_details : (callback)=>{
			 		users.findOne({_id : new ObjectId(userId)},{projection:{full_name:1,email:1,_id:1,parent_id:1,is_email_verified:1,user_role_id:1}}).then(result=>{
			 			callback(null, result);
			 		}).catch(err=>{
			 			console.error("get user details in sendMailToUsers error ===>",eventType, err);
			 			callback(err);
			 		});
			 	}
			 },(_, asyncResponse)=>{
			 	if(asyncResponse){
			 		let userDetails = asyncResponse?.user_details || {};
			 		let fullName	= userDetails?.full_name || '';
			 		let email		= userDetails?.email || '';
			 		let tmpUserRoleId= userDetails?.user_role_id || '';
			 		let breakDetail	= options?.break_details || {};
			 		let startTime	= breakDetail?.start_time || "";
			 		let endTime		= breakDetail?.end_time || "";
			 		let action		= options?.action_taken || "";
			 		let reason		= breakDetail?.rejection_reason || "";
			 		let breakDate	= breakDetail?.date ? Helper.newDate(breakDetail.date,Constants.DATE_FORMAT_EMAIL) :"";
			 		let emailAction	= action == Constants.APPROVED ? "driver_break_approved" : "driver_break_rejected";
			 		let repArray	= action == Constants.APPROVED ? [fullName,breakDate,startTime,endTime] : [fullName,breakDate,startTime,endTime,reason];

			 		/**Send email function */
			 		if(email && userDetails.is_email_verified == Constants.VERIFIED){
			 			sendMail(req,res,{
			 				to 			: email,
			 				action 		: emailAction,
			 				rep_array 	: repArray
			 			});
			 		}

			 		/*************** Send notification ***************/
			 		if(tmpUserRoleId){
			 			let statusTitle = Constants.DRIVER_BREAK_STATUS?.[action]?.status_name?.toLowerCase() || "";
			 			insertNotifications(req,res,{
			 				notification_data : {
			 					notification_type 	: Constants.NOTIFICATION_DRIVER_BREAK_APPROVE_REJECT,
			 					message_params 		: [statusTitle],
			 					parent_table_id 	: options.break_id,
			 					user_ids 			: [userDetails._id],
			 					role_id 			: tmpUserRoleId,
			 					extra_parameters 	: {
			 						parent_id : new ObjectId(userDetails.parent_id)
			 					}
			 				}
			 			}).then(()=>{ });
			 		}
			 		/*************** Send notification  ***************/
			 	}
			 });
		break;
		case Constants.DRIVER_BREAK_REQUEST_POSTED_EMAIL_EVENTS:
			asyncParallel({
				user_details : (callback)=>{
					users.findOne({_id : new ObjectId(userId)},{projection:{full_name:1,email:1,_id:1,user_role_id:1}}).then(result=>{
						callback(null, result);
					}).catch(err=>{
						console.error("get user details in sendMailToUsers error ===>",eventType, err);
						callback(err);
					});
				}
			},(_, asyncResponse)=>{
				if(asyncResponse && asyncResponse.user_details){
					let userDetails 	= asyncResponse.user_details;
					let fullName		= userDetails?.full_name || '';
					let userRoleId		= userDetails?.user_role_id || '';

					/*************** Send notification  ***************/
					insertNotifications(req,res,{
						notification_data : {
							notification_type 	: 	Constants.NOTIFICATION_DRIVER_BREAK_REQUEST_POST,
							message_params 		: 	[fullName],
							parent_table_id 	: 	options.break_id,
							user_id 		    : 	userId,
							user_role_id 		: 	userRoleId,
							role_id 			: 	[Constants.CRAVEZ,Constants.FLEET],
							only_for_user_role	:	true,
							extra_parameters 	:	{}
						}
					}).then(()=>{ });
					/*************** Send notification  ***************/
				}
			});
		break;
		case Constants.DRIVER_BREAK_REQUEST_ENDED_EMAIL_EVENTS:
			asyncParallel({
				user_details : (callback)=>{
					users.findOne({_id : new ObjectId(userId)},{projection:{full_name:1,email:1,_id:1,user_role_id:1}}).then(result=>{
						callback(null, result);
					}).catch(err=>{
						console.error("get user details in sendMailToUsers error ===>",eventType, err);
						callback(err);
					});
				}
			},(_, asyncResponse)=>{
				if(asyncResponse && asyncResponse.user_details){
					let userDetails 	= asyncResponse.user_details;
					let fullName		= userDetails?.full_name || '';
					let userRoleId		= userDetails?.user_role_id || '';

					/*************** Send notification  ***************/
					insertNotifications(req,res,{
						notification_data : {
							notification_type 	: 	Constants.NOTIFICATION_DRIVER_BREAK_ENDED,
							message_params 		: 	[fullName],
							parent_table_id 	: 	options.break_id,
							user_id 		    : 	userId,
							user_role_id 		: 	userRoleId,
							role_id 			: 	[Constants.CRAVEZ,Constants.FLEET],
							only_for_user_role	:	true,
							extra_parameters 	:	{}
						}
					}).then(()=>{ });
					/*************** Send notification  ***************/
				}
			});
		break;
		case Constants.DRIVER_EXCUSES_REQUEST_POSTED_EMAIL_EVENTS:
			 asyncParallel({
				 user_details : (callback)=>{
					users.findOne({user_role_id :String(userId)},{projection:{full_name:1,email:1,_id:1,user_role_id:1,is_email_verified:1}}).then(result=>{
						 callback(null, result);
					}).catch(err=>{
						console.error("get user details in sendMailToUsers error ===>",eventType, err);
						callback(err);
					});
				 },
				 member_details : (callback)=>{
					 users.findOne({_id : new ObjectId(options.member_id)},{projection:{full_name:1,email:1,_id:1}}).then(result=>{
						 callback(null, result);
					}).catch(err=>{
						console.error("get member details in sendMailToUsers error ===>",eventType, err);
						callback(err);
					});
				 }
			},(_, asyncResponse)=>{
				if(asyncResponse){
					let userDetails		= asyncResponse?.user_details || {};
					let memberDetails 	= asyncResponse?.member_details || {};
					let fullName		= userDetails?.full_name || '';
					let email			= userDetails?.email || '';
					let tmpUserRoleId	= userDetails?.user_role_id || '';
					let memberName		= memberDetails?.full_name || '';
					let excuseDetail	= options?.excuses_details || {};
					let startTime		= excuseDetail?.from || "";
					let endTime			= excuseDetail?.to || "";
					let excuseDate		= excuseDetail?.date ? Helper.newDate(excuseDetail.date,Constants.DATE_FORMAT_EMAIL) :"";

					/**Send email function */
					if(email  && userDetails.is_email_verified == Constants.VERIFIED){
						sendMail(req,res,{
							to 			: email,
							action 		: "driver_excuse_request_posted",
							rep_array 	: [fullName,memberName,excuseDate,startTime,endTime]
						});
					}

					/*************** Send notification  ***************/
					if(memberDetails._id && tmpUserRoleId){
						insertNotifications(req,res,{
							notification_data : {
								notification_type 	: Constants.NOTIFICATION_EXCUSES_REQUEST_POST,
								message_params 		: [memberName],
								parent_table_id 	: options.excuse_id,
								user_role_id 		: Constants.CRAVEZ,
								role_id 			: [Constants.CRAVEZ,Constants.FLEET],
								only_for_user_role	: true,
								extra_parameters 	: {
									member_id : new ObjectId(memberDetails._id)
								}
							}
						}).then(()=>{ });
					}
					/*************** Send notification  ***************/
				}
			 });
		break;
		case Constants.DRIVER_EXCUSE_APPROVE_REJECT_EMAIL_EVENTS:
			asyncParallel({
				user_details : (callback)=>{
					users.findOne({_id : new ObjectId(userId)},{projection:{full_name:1,email:1,_id:1,parent_id:1,is_email_verified:1,user_role_id:1}}).then(result=>{
						callback(null, result);
					}).catch(err=>{
						console.error("get user details in sendMailToUsers error ===>",eventType, err);
						callback(err);
					});
				}
			},(_, asyncResponse)=>{
				if(asyncResponse?.user_details){
					let userDetails 	= asyncResponse?.user_details || {};
					let fullName		= userDetails?.full_name || '';
					let email			= userDetails?.email || '';
					let tmpUserRoleId	= userDetails?.user_role_id || '';
					let excuseDetail	= options?.excuse_details || {};
					let excuseDate		= excuseDetail?.date ? Helper.newDate(excuseDetail.date,Constants.DATE_FORMAT_EMAIL) : "";
					let startTime		= excuseDetail?.start_time || "";
					let endTime			= excuseDetail?.end_time || "";
					let reason			= excuseDetail?.rejection_reason || "";
					let action			= options?.action_taken || "";
					let emailAction	= action == "driver_excuse_approved" ? "driver_excuse_approved" : "driver_excuse_rejected";
					let repArray		= action == "driver_excuse_approved" ? [fullName,excuseDate,startTime,endTime] : [fullName,excuseDate,startTime,endTime,reason];

					/**Send email function */
					if(email  && userDetails.is_email_verified == Constants.VERIFIED){
						sendMail(req,res,{
							to 			: email,
							action 		: emailAction,
							rep_array 	: repArray
						});
					}

					/*************** Send notification ***************/
						if(tmpUserRoleId){
							let statusTitle = action == "driver_excuse_approved" ? Constants.DRIVER_EXCUSE_STATUS?.[Constants.APPROVED]?.status_name?.toLowerCase() : Constants.DRIVER_EXCUSE_STATUS?.[Constants.REJECTED]?.status_name?.toLowerCase() || "";

							insertNotifications(req,res,{
							notification_data : {
									notification_type 	: Constants.NOTIFICATION_DRIVER_EXCUSES_APPROVE_REJECT,
									message_params 		: [statusTitle],
									parent_table_id 	: options.excuse_id,
									user_ids 			: [userDetails._id],
									role_id 			: tmpUserRoleId,
									extra_parameters 	: {
										parent_id : new ObjectId(userDetails.parent_id)
									}
								}
							}).then(()=>{ });
						}
					/*************** Send notification  ***************/
			 	}
			});
		break;
		case Constants.DRIVER_BREAK_EXCUSE_IMMEDIATELY_CANCELED:
			/*************** Send notification  ***************/
				insertNotifications(req,res,{
					notification_data : {
						notification_type 	: 	Constants.NOTIFICATION_BREAK_EXCUSE_IMMEDIATELY_CANCELED,
						message_params 		: 	[],
						parent_table_id 	: 	userId,
						user_ids 			: 	[userId],
						role_id 			: 	options.user_role_id,
						extra_parameters 	:	{
							user_id : userId
						}
					}
				}).then(()=>{});
			/*************** Send notification  ***************/
		break;
		case Constants.ADD_IN_WALLET_EMAIL_EVENTS:
			if(options.wallet_id && options.amount && options.user_list){

				options.user_list.map((userData,index) =>{
					/**Set variable for send email */
					let userEmail  = userData?.email || "";
					let fullName   = userData?.full_name || "";

					/**Send email function */
					if(userEmail && userData.is_email_verified == Constants.VERIFIED){
						sendMail(req,res,{
						   to 			: userEmail,
						   action 		: "add_in_wallet",
						   rep_array 	: [fullName,options.amount]
					   });
					}

					/*************** Send notification  ***************/
						insertNotifications(req,res,{
							notification_data : {
								notification_type 	: 	Constants.NOTIFICATION_ADD_IN_WALLET,
								message_params 		: 	[options.amount],
								parent_table_id 	: 	options.wallet_id,
								user_ids 			: 	[userData._id],
								role_id 			: 	userData.user_role_id,
								extra_parameters 	:	{
									user_id : userData._id
								}
							}
						}).then(()=>{});
					/*************** Send notification  ***************/
				});
			}
		break;
		case Constants.NOTIFICATION_TRANSFER_BALANCE:
			if(options.transfer_to && options.transfer_balance_id && options.user_role_id && options.amount && options.mobile_number){

				/*************** Send notification  ***************/
					insertNotifications(req,res,{
						notification_data : {
							notification_type 	: 	Constants.NOTIFICATION_TRANSFER_BALANCE,
							message_params 		: 	[options.amount,options.mobile_number],
							parent_table_id 	: 	options.transfer_balance_id,
							user_ids 			: 	[options.transfer_to],
							role_id 			: 	options.user_role_id,
							user_id 			:   userId,
						}
					}).then(()=>{});
				/*************** Send notification  ***************/
			}
		break;
		case Constants.NOTIFICATION_PURCHASE_PACKAGE:
			if(options.transfer_to && options.amount && options.package_request_id){

				/*************** Send notification  ***************/
					insertNotifications(req,res,{
						notification_data : {
							notification_type 	: 	Constants.NOTIFICATION_PURCHASE_PACKAGE,
							message_params 		: 	[options.amount],
							parent_table_id 	: 	options.package_request_id,
							user_ids 			: 	[options.transfer_to],
							role_id 			: 	Constants.CUSTOMER,
						}
					}).then(()=>{});
				/*************** Send notification  ***************/
			}
		break;
		case Constants.NOTIFICATION_PURCHASE_PACKAGE_STATUS:

			if(options.user_id && options.package_id && options.status){

				/*************** Send notification  ***************/
					insertNotifications(req,res,{
						notification_data : {
							notification_type 	: 	Constants.NOTIFICATION_PURCHASE_PACKAGE_STATUS,
							message_params 		: 	[options.status],
							parent_table_id 	: 	options.package_id,
							user_ids 			: 	[options.user_id],
							role_id 			: 	Constants.CUSTOMER,
						}
					}).then(()=>{});
				/*************** Send notification  ***************/
			}
		break;
		case Constants.NOTIFICATION_OVERSTANDING_PAYMENT_MODIFY_ORDER:

			if(options.customer_id && options.order_id && options.amount && options.unique_order_id){

				/*************** Send notification  ***************/
					insertNotifications(req,res,{
						notification_data : {
							notification_type 	: 	Constants.NOTIFICATION_OVERSTANDING_PAYMENT_MODIFY_ORDER,
							message_params 		: 	[options.amount,options.unique_order_id],
							parent_table_id 	: 	options.order_id,
							user_ids 			: 	[options.customer_id],
							role_id 			: 	Constants.CUSTOMER,
						}
					}).then(()=>{});
				/*************** Send notification  ***************/
			}
		break;
		case Constants.NOTIFICATION_SEND_TO_USERS_ORDER_REMIND:
			if(options.user_list && options.user_list.length >0){
				options.user_list.map((records,index) =>{
					let tmpUserId = records._id;

					/*************** Send notification  ***************/
						insertNotifications(req,res,{
							notification_data : {
								notification_type 	: 	Constants.NOTIFICATION_SEND_TO_USERS_ORDER_REMIND,
								message_params 		: 	[records.days],
								parent_table_id 	: 	tmpUserId,
								user_ids 			: 	[tmpUserId],
								role_id 			: 	records.user_role_id,
							}
						}).then(()=>{});
					/*************** Send notification  ***************/
				});
			}
		break;

		/**Send conact us mail to admin  */
		case Constants.USER_CONTACT_US_EVENTS:
			if(options.name && options.email && options.phone && options.message){
				/**Set variable for contact us send email */
				let adminEmail		= (res.locals.settings["Site.email"]) ? res.locals.settings["Site.email"] : "";
				let emailOptionsContact			= clone(options);
				emailOptionsContact.to			= adminEmail;
				emailOptionsContact.action		= "contact_us";
				emailOptionsContact.rep_array	= [options.name,options.email,options.phone,options.message];
				/** Send email **/
				if(options.email) sendMail(req,res,emailOptionsContact);

				/**Set variable for send reply to user email */
				let emailOptionsReply			= clone(options);
				emailOptionsReply.to			= options.email;
				emailOptionsReply.action		= "reply_to_user";
				emailOptionsReply.rep_array		= [options.name];
				/** Send email **/
				if(options.email) sendMail(req,res,emailOptionsReply);
			}
		break;
		case Constants.DRIVER_BREAK_CANCEL_EMAIL_EVENTS:
			 asyncParallel({
			 	user_details : (callback)=>{
			 		users.findOne({_id : new ObjectId(userId)},{projection:{full_name:1,email:1,_id:1,parent_id:1,is_email_verified:1,user_role_id:1}}).then(result=>{
			 			callback(null, result);
			 		}).catch(err=>{
			 			console.error("get user details in sendMailToUsers error ===>",eventType, err);
			 			callback(err);
			 		});
			 	}
			 },(_, asyncResponse)=>{
			 	if(asyncResponse?.user_details){
			 		let userDetails = asyncResponse.user_details;
					let fullName	= userDetails?.full_name || '';
			 		let email		= userDetails?.email || '';
			 		let tmpUserRoleId= userDetails?.user_role_id || '';
			 		let breakDetail	= options?.break_details || {};
			 		let reason		= breakDetail?.cancel_reason || "";
			 		let breakDate	= breakDetail?.date ? Helper.newDate(breakDetail.date,Constants.DATE_FORMAT_EMAIL) :"";

					 /**Send email function */
			 		if(email && userDetails.is_email_verified == Constants.VERIFIED){
			 			sendMail(req,res,{
			 				to 			: email,
			 				action 		: "driver_break_cancel",
			 				rep_array 	: [fullName,breakDate,reason]
			 			});
			 		}

			 		/*************** Send notification ***************/
			 		if(tmpUserRoleId){
			 			insertNotifications(req,res,{
			 				notification_data : {
			 					notification_type 	: Constants.NOTIFICATION_DRIVER_BREAK_CANCEL,
			 					message_params 		: [],
			 					parent_table_id 	: options.break_id,
			 					user_ids 			: [userDetails._id],
			 					role_id 			: tmpUserRoleId,
			 					extra_parameters 	: {
			 						parent_id : new ObjectId(userDetails.parent_id)
			 					}
			 				}
			 			}).then(()=>{ });
			 		}
			 		/*************** Send notification  ***************/
			 	}
			 });
		break;
		case Constants.DRIVER_BREAK_ADD_EMAIL_EVENTS:
			asyncParallel({
				user_details : (callback)=>{
					users.findOne({_id : new ObjectId(userId)},{projection:{full_name:1,email:1,_id:1,user_role_id:1}}).then(result=>{
						callback(null, result);
					}).catch(err=>{
						console.error("get user details in sendMailToUsers error ===>",eventType, err);
						callback(err);
					});
				}
			},(_, asyncResponse)=>{
				if(asyncResponse?.user_details){
					let userDetails 	= asyncResponse.user_details;
					let fullName		= userDetails?.full_name || '';
					let userRoleId		= userDetails?.user_role_id || '';
					let email			= userDetails?.email || '';
					let breakDetails    = options.break_details ? options.break_details : {};
					let date 			= breakDetails?.date ? Helper.newDate(breakDetails.date,Constants.DATE_FORMAT_EMAIL) : "";

					sendMail(req,res,{
						to 			: email,
						action 		: "driver_break_add",
						rep_array 	: [fullName,date]
					});

					/*************** Send notification  ***************/
					insertNotifications(req,res,{
						notification_data : {
							notification_type 	: Constants.NOTIFICATION_DRIVER_BREAK_ADD,
							message_params 		: [fullName],
							parent_table_id 	: options.break_id,
							user_ids 			: [userId],
							role_id 			: userRoleId,
							extra_parameters 	: {}
						}
					}).then(()=>{ });
					/*************** Send notification  ***************/
				}
			});
		break;
		case Constants.DRIVER_BREAK_END_EMAIL_EVENTS:
			asyncParallel({
				user_details : (callback)=>{
					users.findOne({_id : new ObjectId(userId)},{projection:{full_name:1,email:1,_id:1,user_role_id:1}}).then(result=>{
						callback(null, result);
					}).catch(err=>{
						console.error("get user details in sendMailToUsers error ===>",eventType, err);
						callback(err);
					});
				}
			},(_, asyncResponse)=>{
				if(asyncResponse?.user_details){
					let userDetails 	= asyncResponse.user_details;
					let fullName		= userDetails?.full_name || '';
					let userRoleId		= userDetails?.user_role_id || '';
					let email			= userDetails?.email || '';
					let breakDetails    = options.break_details ? options.break_details : {};
					let date 			= breakDetails?.date ? Helper.newDate(breakDetails.date,Constants.DATE_FORMAT_EMAIL) : "";

					sendMail(req,res,{
						to 			: email,
						action 		: "driver_break_end",
						rep_array 	: [fullName,date]
					});

					/*************** Send notification  ***************/
					insertNotifications(req,res,{
						notification_data : {
							notification_type 	: Constants.NOTIFICATION_DRIVER_BREAK_END,
							message_params 		: [fullName],
							parent_table_id 	: options.break_id,
							user_ids 			: [userId],
							role_id 			: userRoleId,
							extra_parameters 	: {}
						}
					}).then(()=>{ });
					/*************** Send notification  ***************/
				}
			});
		break;
		case Constants.DRIVER_EXCUSE_CANCEL_EMAIL_EVENTS:
			asyncParallel({
				user_details : (callback)=>{
					users.findOne({_id : new ObjectId(userId)},{projection:{full_name:1,email:1,_id:1,parent_id:1,is_email_verified:1,user_role_id:1}}).then(result=>{
						callback(null, result);
					}).catch(err=>{
						console.error("get user details in sendMailToUsers error ===>",eventType, err);
						callback(err);
					});
				}
			},(_, asyncResponse)=>{
				if(asyncResponse?.user_details){
					let userDetails 	= asyncResponse?.user_details || {};
					let fullName		= userDetails?.full_name || '';
					let email			= userDetails?.email || '';
					let tmpUserRoleId	= userDetails?.user_role_id || '';
					let excuseDetail	= options?.excuse_details || {};
					let excuseDate		= excuseDetail?.date ? Helper.newDate(excuseDetail.date,Constants.DATE_FORMAT_EMAIL) : "";
					let startTime		= excuseDetail?.start_time || "";
					let endTime			= excuseDetail?.end_time || "";
					let reason			= excuseDetail?.cancel_reason || "";
					let emailAction		= "driver_excuse_cancel";
					let repArray		= [fullName,excuseDate,startTime,endTime,reason];

					/**Send email function */
					if(email  && userDetails.is_email_verified == Constants.VERIFIED){
						sendMail(req,res,{
							to 			: email,
							action 		: emailAction,
							rep_array 	: repArray
						});
					}

					/*************** Send notification ***************/
						if(tmpUserRoleId){
							insertNotifications(req,res,{
								notification_data : {
									notification_type 	: Constants.NOTIFICATION_DRIVER_EXCUSES_CANCEL,
									message_params 		: [],
									parent_table_id 	: options.excuse_id,
									user_ids 			: [userDetails._id],
									role_id 			: tmpUserRoleId,
									extra_parameters 	: {
										parent_id : new ObjectId(userDetails.parent_id)
									}
								}
							}).then(()=>{ });
						}
					/*************** Send notification  ***************/
			 	}
			});
		break;
		case Constants.NOTIFICATION_ORDER_OUTSTANDING_AMOUNT_PAID:
			if(options.order_id && options.amount && options.unique_order_id){
				/*************** Send notification  ***************/
					insertNotifications(req,res,{
						notification_data : {
							notification_type 	: 	Constants.NOTIFICATION_ORDER_OUTSTANDING_AMOUNT_PAID,
							message_params 		: 	[options.amount,options.unique_order_id],
							parent_table_id 	: 	options.order_id,
							user_id 			:   userId,
							only_for_user_role  :   true,
							role_id 			: 	Constants.CALL_CENTER_TEAM,
							extra_parameters 	: {
								order_id : options.order_id
							}
						}
					}).then(()=>{});
				/*************** Send notification  ***************/
			}
		break;
		case Constants.NOTIFICATION_FOR_RESTAURANT_UPDATED_PASSWORD:
			if(options.user_id && options.restaurant_id){
				let tmpRestaurantId = new ObjectId(options?.restaurant_id);

				asyncParallel({
					restaurant_details : (callback)=>{
						/** Get restaurant details */
						restaurants.findOne({_id: tmpRestaurantId},{projection:{name: 1, slug: 1}}).then(result=>{
							callback(null, result);
						}).catch(err=>{
							console.error("get restaurant details in sendMailToUsers error ===>",eventType, err);
							callback(err);
						});
					}
				},(_, asyncResponse)=>{
					if(asyncResponse?.restaurant_details){
						let restaurantDetails = asyncResponse.restaurant_details;

						/*************** Send notification  ***************/
						insertNotifications(req,res,{
							notification_data : {
								notification_type 	: 	Constants.NOTIFICATION_FOR_RESTAURANT_UPDATED_PASSWORD,
								message_params 		: 	[restaurantDetails?.name?.[Constants.DEFAULT_LANGUAGE_CODE] || ""],
								parent_table_id 	: 	userId,
								user_id 		    : 	userId,
								user_role_id 		: 	userRoleId,
								role_id 			: 	[Constants.CRAVEZ,Constants.CONTENT_TEAM],
								only_for_user_role	:	true,
								extra_parameters 	:	{
									restaurant_slug : restaurantDetails.slug,
									restaurant_id  	: tmpRestaurantId
								}
							}
						}).then(()=>{ });
						/*************** Send notification  ***************/
					}
				});
			}
		break;
		case Constants.NOTIFICATION_TO_DRIVER_ORDER_ADDRESSED_CHANGED:

			if(options?.driver_id && options?.order_id){
				/*************** Send notification  ***************/
					insertNotifications(req,res,{
						notification_data : {
							notification_type 	: 	Constants.NOTIFICATION_TO_DRIVER_ORDER_ADDRESSED_CHANGED,
							message_params 		: 	[options?.unique_order_id],
							parent_table_id 	: 	options?.order_id,
							user_ids 			: 	[options?.driver_id],
							role_id 			: 	Constants.DRIVER,
							extra_parameters	:	options?.extra_parameters || {}
						}
					}).then(()=>{});
				/*************** Send notification  ***************/
			}
		break;
	}
}; //End sendMailToUsers()
