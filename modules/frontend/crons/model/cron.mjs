import { ObjectId } from 'mongodb';
import { writeFile } from 'fs';
import { parallel as asyncParallel, each as asyncEach} from 'async';
import * as Constants from "../../../../config/global_constant.mjs";
import Tables from '../../../../config/database_tables.mjs';
import * as Helper from "../../../../utils/index.mjs";
import * as services from "../../../../services/index.mjs";
import myCache from '../../../../cache.mjs';

import reportCronModule from './reportCron.mjs';

export default class OrderCron {
    constructor(db) {
        this.db = db;

        this.reportCronModel = new reportCronModule(db);
    }

    /**
	 * Function to send scheduled email/sms/notification
	 *  Frequency : every 30 minutes/1 hour or accordingly
	 *
	 * @param req 		As Request Data
	 * @param res 		As Response Data
	 * @param options 	As Object Data
	 *
	 * @return render
	 */
	async sendScheduledNotifications (req, res){

        /** Send response to client and work in background */
		res.render('blank',{layout:false});

        /** Get scheduled notifications list */
		const scheduled_notifications = this.db.collection(Tables.SCHEDULED_NOTIFICATIONS);
		scheduled_notifications.find({
			is_sent : Constants.NOT_SENT,
			$or		:	[
				{scheduled_date : {$exists : false}},
				{scheduled_date : {$lte : Helper.newDate()}},
			]
		}).toArray().then(result=>{

            if(result && result.length >0){
                let successfullIds = [];
                asyncEach(result,(records, mailParentCallback)=>{
                    /** Send a mail to user according to event type */
                    switch(records.event_type){
                        case Constants.BRANCH_ENQUIRY_APPROVE_EMAIL_EVENTS:
    
                            /**Send mails on branch approval */
                            if(records.options.restaurant_id && records.options.branch_id  && records.options.user_id && records.options.branch_number && records.options.restaurant_name && records.options.branch_name){
    
                                /** Set conditions */
                                let userFindConditions = {
                                    $or : [
                                        {_id : new ObjectId(records.options.user_id)},
                                        {
                                            restaurant_id : new ObjectId(records.options.restaurant_id),
                                            user_role_id :Constants.RESTAURANT,
                                            user_type : Constants.USER_TYPE_RESTAURANT
                                        }
                                    ],
                                    is_deleted: Constants.NOT_DELETED,
                                };
    
                                /** Get details form users */
                                const users = this.db.collection(Tables.USERS);
                                users.find(userFindConditions,{projection:{_id:1,email:1,full_name:1,user_role_id:1}}).toArray().then(userResult=>{
                                    /**For check error */
                                    if(userResult?.length == 0) return mailParentCallback(null);
    
                                    userResult.map(userData =>{
                                        /**Set variable for send email */
                                        let userEmail  = (userData.email) 	     ? userData.email 		:"";
                                        let fullName   = (userData.full_name)    ? userData.full_name 	:"";
    
                                        if(Constants.EMAIL_EVENTS[Constants.BRANCH_ENQUIRY_APPROVE_EMAIL_EVENTS].notification_types.indexOf(Constants.NOTIFICATION_TYPE_EMAIL) !== -1){
    
                                            /**Send email function */
                                            if(userEmail) services.sendMail(req,res,{
                                                to 			: userEmail,
                                                action 		: "restaurant_pending_branch_enquiry_approved",
                                                rep_array 	: [fullName,records.options.branch_name]
                                            });
                                        }
    
                                        if(Constants.EMAIL_EVENTS[Constants.BRANCH_ENQUIRY_APPROVE_EMAIL_EVENTS].notification_types.indexOf(Constants.NOTIFICATION_TYPE_NOTIFICATION) !== -1){
                                            /*************** Send notification  ***************/
                                                let statusTitle = Constants.STATUS_LABELS[Constants.APPROVED].status_name.toLowerCase();
                                                let notificationMessageParams = [records.options.branch_name,records.options.branch_number,records.options.restaurant_name,statusTitle];
                                                services.insertNotifications(req,res,{
                                                    notification_data : {
                                                        notification_type 	: 	Constants.NOTIFICATION_BRANCH_APPROVAL_REQUEST_STATUS_UPDATE,
                                                        message_params 		: 	notificationMessageParams,
                                                        parent_table_id 	: 	records.options.branch_id,
                                                        user_ids 			: 	[userData._id],
                                                        role_id 			: 	userData.user_role_id,
                                                        extra_parameters 	:	{
                                                            user_id : userData._id
                                                        }
                                                    }
                                                });
                                            /*************** Send notification  ***************/
                                        }
                                    });
                                    successfullIds.push(records._id);
                                    mailParentCallback(null);
                                });
                            }else{
                                mailParentCallback(null);
                            }
                        break;
                    }
                },(parentErr)=>{
                    if(parentErr){
                        console.error("Error in send schedule async each",parentErr);
                    }
    
                    if(successfullIds?.length>0){
                        /** Update team availability status  */
                        scheduled_notifications.updateMany({
                            _id : {
                                $in : Helper.arrayToObject(successfullIds)
                            }
                        },
                        {$set: {
                            is_sent : Constants.SENT
                        }}).then(()=>{}).catch(()=>{});
                    }
                });
            }
		}).catch(err=>{
			console.error("Error in send schedule find",err);
		});
	};//End sendScheduledNotifications()   

    /**
	 * Function to update offer status
	 *
	 * @param req 	As	 Request Data
	 * @param res 	As	Response Data
	 * @param next	As 	Callback argument to the middleware function
	 *
	 * @return render null
	 */
	async updateOfferStatus (req, res,next){
        /** Send response to client and work in background */
		res.render('blank',{layout:false});

		/** Update offer details */
		const offers = this.db.collection(Tables.OFFERS);
		offers.updateMany({
			status 	  	: 	Constants.OFFER_PUBLISHED,
			valid_to	:	{$lte: Helper.newDate()},
		},
		{$set: {
			status 	    : 	Constants.OFFER_EXPIRED,
			modified	:	Helper.getUtcDate()
		}}).then(()=>{}).catch(err=>{
			console.error("update many error in updateOfferStatus",err);
		});
	};//End updateOfferStatus()

    /**
	 * Function to update wallat user logs
	 *
	 * @param req 	As	 Request Data
	 * @param res 	As	Response Data
	 * @param next	As 	Callback argument to the middleware function
	 *
	 * @return render null
	 */
	async updateWalletLogs (req, res,next){
        /** Send response to client and work in background */
        res.render('blank',{layout:false});

		const user_wallet_logs	= this.db.collection(Tables.USER_WALLET_LOGS);
		let result = await user_wallet_logs.find({
			transaction_type				: Constants.CREDIT,
			remaining_amount				: {$gt : 0},
			"extra_parameters.is_expired"	: {$exists : false},
			"extra_parameters.expiry_date" 	: {$lte : Helper.newDate()}
		},{projection : {_id : 1,remaining_amount : 1,user_id:1,wallet_type:1}}).toArray();

        if(result && result.length > 0){
            asyncEach(result,(records, asyncCallback)=>{
                let remainingAmount = (records.remaining_amount) ? parseFloat(records.remaining_amount) : 0;
                
                let userId	 	= 	(records.user_id)	? new ObjectId(records.user_id) :"";
                let recordId	=	(records._id)		? new ObjectId(records._id) 	:"";
                asyncParallel([
                    (callback)=>{
                        user_wallet_logs.updateOne({
                            _id : recordId
                        },
                        {$set : {
                            "extra_parameters.is_expired" : true
                        }}).then(()=>{
                            callback(null);
                        }).catch(err=>{
                            callback(err);
                        });
                    },
                    (callback)=>{
                        /**To debit amount from users table */
                        Helper.debitWalletBalance(req,res,{
                            user_id			: userId,
                            amount			: remainingAmount,
                            wallet_type		: records.wallet_type,
                            extra_parameters: {
                                parent_wallet_id : recordId
                            },
                            is_expire_cron : true
                        }).then(()=>{
                            callback(null);
                        });
                    }
                ],(parallelErr)=>{
                    asyncCallback(parallelErr);
                });
            },(asyncErr)=>{
                if(asyncErr){
                    console.error("Async each error on updateWalletLogs",asyncErr);
                }
            });
        }
	};//End updateWalletLogs()

    /**
	 * Function to update remaining package days ( once in a day)
	 *
	 * @param req 	As	 Request Data
	 * @param res 	As	Response Data
	 * @param next	As 	Callback argument to the middleware function
	 *
	 * @return render null
	 */
	async updatePackageDays (req, res,next){
		try {
			/** Send response to client and work in background */
			res.render('blank',{layout:false});
	
			const users = this.db.collection(Tables.USERS);
			let result = await users.find({
				package_id : {$exists : true }
			},{projection:{_id:1,package_valid_till: 1}}).toArray();
			
			let currentDate	= Helper.newDate("",Constants.DATABASE_DATE_FORMAT);
			if(result && result.length > 0){
				result.forEach((records)=>{
					let packageValidTill	=	Helper.newDate(records.package_valid_till,Constants.DATABASE_DATE_FORMAT);
					let remainingDays		=	(packageValidTill) ? (Helper.getDifferenceBetweenTwoDatesInMinute(currentDate,packageValidTill))/(Constants.MINUTES_IN_A_HOUR*Constants.HOURS_IN_A_DAY) : 0;

					let dataToBeUpdated	=	{};
					if(remainingDays > 0){
						dataToBeUpdated['$set'] = { 'remaining_package_days' : Helper.round(remainingDays,0) };
					}else{
						dataToBeUpdated['$set'] = { package_status : Constants.PACKAGE_EXPIRE };
						dataToBeUpdated["$unset"] 	= {
							package_id 				: 1,
							package_valid_till 		: 1,
							remaining_package_days 	: 1,
							remaining_package_orders: 1
						};
					}

					users.updateOne({_id : records._id},dataToBeUpdated).then(()=>{}).catch(err=>{
						console.error("Error in updatePackageDays",err);
					});
				});
			}			
		} catch (error) {
			console.error("Catch error in updatePackageDays",error);
		}
	}; // End updatePackageDays

	/**
	 * Function to refund customer amount like order/package value
	 *
	 * @param req 	As	 Request Data
	 * @param res 	As	Response Data
	 * @param next	As 	Callback argument to the middleware function
	 *
	 * @return render null
	 */
	async paymentRefund (req, res,next){
		try {
			/** Send response to client and work in background */
			res.render('blank',{layout:false});
	
			const payment_refund_logs 	=  this.db.collection(Tables.PAYMENT_REFUND_LOGS);
			let paymentResult = await payment_refund_logs.find({
				status: Constants.REFUND_INITIALIZE,
			},{projection:{_id:1,user_id:1,order_id:1,device_id:1,payment_detail:1,transaction_id:1,payment_type:1, wallet_type: 1 }}).toArray();
	
			if(paymentResult && paymentResult.length > 0){
				asyncEach(paymentResult,(records, asyncEachCallback)=>{
					let logId     		=   records?._id || "";
					let orderId     	=   records?.order_id || "";
					let userId			= 	records?.user_id || "";
					let deviceId		= 	records?.device_id || "";
					let refundDetails	= 	records?.payment_detail || [];
					let paymentType		= 	records?.payment_type || "";
					let walletType		= 	records?.wallet_type || "";

					let fetchAmountData	=	{
						refund_id		:	logId,
						order_id		:	orderId,
						refund_detail	:	refundDetails,
						user_id			:	userId,
						device_id		:	deviceId,
						wallet_type		:	walletType
					};
					Helper.paymentRefundProcess(req,res,next,fetchAmountData).then(fetchAmountResponse=>{
						/** Send error response */
						if(fetchAmountResponse.status != Constants.STATUS_SUCCESS){
							return  asyncEachCallback(fetchAmountResponse);
						}

						let paymentResponse	=	(fetchAmountResponse.gateway_response && fetchAmountResponse.gateway_response.payment_response) ? fetchAmountResponse.gateway_response.payment_response : "";
						let walletResponse	=	(fetchAmountResponse.gateway_response && fetchAmountResponse.gateway_response.wallet_response) ? fetchAmountResponse.gateway_response.wallet_response : "";
						
						if(walletResponse || paymentResponse){
							let dataToUpdate =	{modified: Helper.getUtcDate()};
							let conditions	 =	{
								_id : logId,
							};

							let walletStatusFlag	=	false;
							if(walletResponse){
								if(walletResponse.status == Constants.STATUS_SUCCESS){
									conditions["payment_detail.type"] = Constants.WALLET_PAYMENT;
									dataToUpdate["payment_detail.$.is_paid"] = true;
									dataToUpdate["payment_detail.$.transaction_id"] = walletResponse.transaction_id;
									walletStatusFlag	=	true;
								}
							}else{
								walletStatusFlag	=	true;
							}
							let gatewayStatusFlag	=	false;
							if(paymentResponse){
								if(paymentResponse.IsSuccess == true){
									conditions["payment_detail.type"] = {$in:Constants.ONLINE_PAYMENT};
									dataToUpdate["payment_detail.$.is_paid"] = true;
									dataToUpdate["payment_detail.$.transaction_detail"] = paymentResponse.Data;
									gatewayStatusFlag	=	true;
								}
							}else{
								gatewayStatusFlag	=	true;
							}
							if(walletStatusFlag && gatewayStatusFlag){
								dataToUpdate['status'] 		= Constants.REFUND_COMPLETED;
								dataToUpdate['refunded_on'] = Helper.getUtcDate();
							}

							payment_refund_logs.updateOne(conditions,{$set: dataToUpdate}).then(()=>{
								asyncEachCallback(null);
							}).catch(err=>{
								asyncEachCallback(err);
							});
						}else{
							asyncEachCallback(null);
						}
					}).catch(next);
				},(asyncEachErr)=>{
				});
			}
		} catch (error) {
			console.error("Catch error in paymentRefund",error);
		}
	};//End paymentRefund()

	/**
	 * Function to remove modified order form cart
	 *
	 * @param req 	As	 Request Data
	 * @param res 	As	Response Data
	 * @param next	As 	Callback argument to the middleware function
	 *
	 * @return render null
	 */
	async removeModifiedOrderFromCart (req, res,next){
		try {
			/** Send response to client and work in background */
			res.render('blank',{layout:false});

			const user_carts = 	this.db.collection(Tables.USER_CARTS);
			await user_carts.deleteMany({
				max_modified_time : {$lt: Helper.newDate()}
			});
		} catch (error) {
			console.error("Catch error in removeModifiedOrderFromCart",error);
		}
	}; // End removeModifiedOrderFromCart

	/**
	 * Function to send abandon cart notification
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 *
	 * @return render
	 */
	async abandonCartNotification (req, res, next){
		try {
			
			/** Send response to client and work in background */
			res.render('blank',{layout:false});

			/** Get customer orders */
			let abandonCartTime = 	parseFloat(res.locals.settings['App.abandon_cart_time'] || 0);
			let currentDate		=	Helper.getUtcDate(Helper.subtractMinute(abandonCartTime));
			const user_carts	=	this.db.collection(Tables.USER_CARTS);
			let result = await user_carts.aggregate([
				{$match : {
					created				: {$lte : currentDate},
					is_abandon_pn_sent	: {$exists : false}
				}},
				{$lookup:	{
					from     : "items",
					let      : {itemId : "$item_id"},
					pipeline : [
						{$match : {
							$expr: {
								$and : [
									{$eq: ["$_id", "$$itemId"]},
									{$eq: ["$is_active", Constants.ACTIVE]},
								]
							}
						}},
						{$project : {_id: 1}},
					],
					as:	"item_details"
				}},
				{$match:{
					"item_details._id" : {$exists: true}
				}},
				{$addFields : { isDevice : {$ifNull: [ "$customer_id", true ] }}},
				{$group	: {
					_id : {
						user_device_id: {$cond: [
							{$and: [
								{$eq: ["$isDevice",true] },
							]},
							"$device_id",
							"$customer_id",
						]}
					},
					device_id	: 	{$first: "$device_id"} ,
					device_type	: 	{$first: "$device_type"} ,
					device_token: 	{$first: "$device_token"} ,
					customer_id	: 	{$first: "$customer_id"},
					cart_ids	:	{$push: "$_id"},
				}},
			]).toArray();

			if(result && result.length > 0){
				asyncEach(result,(records, asyncCallback)=>{

					let customerId	=	records?.customer_id  || "";
					let deviceType	=	records?.device_type  || "";
					let deviceToken	=	records?.device_token || "";
					let cartIds		=	records?.cart_ids 	  || [];
					
					/** Update cart details */
					user_carts.updateMany({
						_id: {$in: cartIds}
					},
					{$set:{
						is_abandon_pn_sent : Helper.getUtcDate()
					}}).then(()=>{

						/*************** Send push notification  ***************/
						if(customerId || (deviceType && deviceToken)){
							services.pushNotification(req,res,{
								pn_type		: 	Constants.NOTIFICATION_CART_ITEMS_PENDING,
								pn_body		:	res.__("user_cart.abandon_pn_message"),
								user_id		:	String(customerId),
								device_token:	(!customerId)  	? 	deviceToken :"",
								device_type	:	(!customerId)	?	deviceType	:"",
								user_role_id:	Constants.CUSTOMER
							}).then(()=>{
								this.reportCronModel.saveAbandonedCartsReport(req, res, next, {customer_id: customerId, cart_ids: cartIds});
							});
						}
						/*************** Send Mail  ***************/

						asyncCallback(null);
					}).catch(err=>{
						asyncCallback(err);
					});
				},(asyncErr)=>{
					if(asyncErr){
						console.error("Async each error on abandonCartNotification",asyncErr);
					}
				});
			}
		} catch (error) {
			console.error("Catch error in abandonCartNotification",error);
		}
	};//end abandonCartNotification

	/**
	 * Function to send scheduled push notification
	 *  Frequency : every 30 minutes/1 hour or accordingly
	 *
	 * @param req 		As Request Data
	 * @param res 		As Response Data
	 * @param options 	As Object Data
	 *
	 * @return render
	 */
	async sendScheduledPNs (req, res,next){
		try {
			/** Get push notifications list */
			this.sendScheduledNotifications(req,res,next);
		} catch (error) {
			console.error("Catch error in sendScheduledPNs",error);
		}
	};//End sendScheduledPNs()

	/**
	 * Function to write settings file
	 *
	 *
	 * @param req 		As Request Data
	 * @param res 		As Response Data
	 * @param options 	As Object Data
	 *
	 * @return render
	*/
	async writeSettingsFile (req, res,next){
		try {
			/** Send response to client and work in background */
			res.render('blank',{layout:false});

			const settings 	= this.db.collection(Tables.SETTINGS);
			let result = await settings.find({},{projection: {_id:1,key_value:1,value:1}}).toArray();
			if(result && result.length > 0){
				let settingsObj = {};
				result.map(record=>{
					let settingKey 		=	(record.key_value)	?	record.key_value	:"";
					let settingValue	= 	(record.value)		?	record.value		:"";

						settingKey 		= 	settingKey.replace(/"/g,'\\"');
						settingKey 		=	settingKey.replace(/'/g,"\\'");
						settingValue 	= 	settingValue.replace(/"/g,'\\"');
						settingValue 	= 	settingValue.replace(/'/g,"\\'");

					settingsObj[settingKey] = settingValue;
				});
				
				writeFile(Constants.WEBSITE_ROOT_PATH+"config/settings.json", JSON.stringify(settingsObj), "utf8",function(err){});
				
				setTimeout(function(){
					if (typeof myCache !== 'undefined') {
						myCache.del( "settings");
					}
				},5000);
			}
		} catch (error) {
			console.error("Catch error in writeSettingsFile",error);
		}
	};//End writeSettingsFile()

	async successPayment (req, res,next){
		console.log('Cron successPayment success');
		console.log(req.body);

		res.status(200).json({status: Constants.STATUS_SUCCESS});
	}// end successPayment()

	async failPayment (req, res,next){
		console.log('Cron failPayment failed');
		console.log(req.body);

		res.status(200).json({status: Constants.STATUS_SUCCESS});
	}// end failPayment()

	/**
	 * Function to delete gfc request response
	 *
	 * @param req 	As	 Request Data
	 * @param res 	As	Response Data
	 * @param next	As 	Callback argument to the middleware function
	 *
	 * @return render null
	 */
	async deleteGfcRequestResponse (req, res,next){
		try {
			/** Send response to client and work in background */
			res.render('blank',{layout:false});
			
			let numberOfDays 	= 	parseInt(req.params.days);
			let toDate			=	Helper.newDate(Helper.subtractDate(numberOfDays*Constants.HOURS_IN_A_DAY), Constants.CURRENTDATE_END_DATE_FORMAT);

			/** Delete thitd api xml data */
			const kfg_request_response = this.db.collection(Tables.KFG_REQUEST_RESPONSE);
			await kfg_request_response.deleteMany({created: {$lte: toDate} });
		} catch (error) {
			console.error("Catch error in deleteGfcRequestResponse",error);
		}
	};//End deleteGfcRequestResponse

	/**
	 * Function to delete order auto assignment logs
	 *
	 * @param req 	As	Request Data
	 * @param res 	As	Response Data
	 * @param next	As 	Callback argument to the middleware function
	 *
	 * @return render null
	 */
	async deleteOrderAssignmentLogs (req, res,next){
		try {
			/** Send response to client and work in background */
			res.render('blank',{layout:false});
			
			let numberOfDays 	= 	parseInt(req.params.days);
			let toDate			=	Helper.newDate(Helper.subtractDate(numberOfDays*Constants.HOURS_IN_A_DAY), Constants.CURRENTDATE_END_DATE_FORMAT);

		/** Delete order auto assignment logs */
			const orderAssignmentLogSteps = this.db.collection(Tables.ORDER_ASSIGNMENT_LOG_STEPS);
			await orderAssignmentLogSteps.deleteMany({created: {$lte: toDate}});
		} catch (error) {
			console.error("Catch error in deleteOrderAssignmentLogs",error);
		}
	}; //End deleteOrderAssignmentLogs
    
}