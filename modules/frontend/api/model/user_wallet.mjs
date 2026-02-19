import { ObjectId } from 'mongodb';
import clone from 'clone';
import {parallel as asyncParallel} from 'async';
import * as Constants from "../../../../config/global_constant.mjs";
import Tables from '../../../../config/database_tables.mjs';
import { sanitizeData, getUtcDate, newDate, cleanRegex, updateWalletBalance, applyValidationInterCallFunction,currencyFormat, debitWalletBalance, getWalletBalance} from "../../../../utils/index.mjs";
import { sendMailToUsers} from "../../../../services/index.mjs";
import { transferBalanceValidation } from '../validations/userWalletValidations.mjs';
import cartModal from './user_carts.mjs';
import orderModal from './order.mjs';

export default class UserWallet {

    constructor(db) {
        this.db     =   db;
        this.userDB = db.collection(Tables.USERS);
        this.userWalletLogDB = db.collection(Tables.USER_WALLET_LOGS);
        this.userTransferBalanceDB = db.collection(Tables.USER_TRANSFER_BALANCES);

        this.cartAPI   =   new cartModal(db);
        this.orderAPI  =   new orderModal(db);
    }

    /**
	 * Function to add money
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	 **/
	async addMoney(req,res,next){
		/** Sanitize Data **/
        req.body 			= sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
        let userId			= (req.body.user_id) ? new ObjectId(req.body.user_id) :"";
        let amount			= (req.body.amount)  ? req.body.amount  		  :"";
        let paymentResponse	= (req.body.payment_response)  ? req.body.payment_response  :"";
        let paymentMethod	= (req.body.payment_method)    ? req.body.payment_method    :"";
        let paymentCurrency	= (req.body.payment_currency)  ? req.body.payment_currency  :"";

        /** Send error response **/
        if(!userId || !amount || !paymentResponse || !paymentMethod || !paymentCurrency){
            return {
                status : Constants.STATUS_ERROR,
                message : res.__("system.missing_parameters"),
                missing_fields:["user_id","amount","payment_response","payment_method","payment_currency"]
            };
        }

        /** Set payment save options */
        let savePayResponse = await this.orderAPI.saveUserPaymentDetails(req,res,next,{
            user_id 		: userId,
            payment_response: paymentResponse,
            payment_method	: paymentMethod,
            payment_status	: Constants.PAYMENT_SUCCESS,
            currency		: paymentCurrency,
            amount 			: amount,
            payment_event	: Constants.ADD_MONEY_IN_WALLET,
        });

        /** Send error response */
        if(savePayResponse.status != Constants.STATUS_SUCCESS) return savePayResponse;

        /** Add money in wallet */
        let creditResponse = await updateWalletBalance(req,res,next,{
            user_id 		:	userId,
            amount 			: 	amount,
            wallet_type  	: 	Constants.TOP_UP_AMOUNT,
            transaction_type: 	Constants.CREDIT,
            extra_parameters:	{
                payment_id		: 	savePayResponse?.payment_id || '',
                event_type		:	Constants.ADD_MONEY_IN_WALLET
            },
        });

        /** Send error response */
        if(creditResponse.status != Constants.STATUS_SUCCESS) return creditResponse;

        /** Send success response */
        return {status: Constants.STATUS_SUCCESS, message: res.__("my_account.money_has_been_added_successfully_in_your_account") };
	};// end addMoney()

	 /**
	 * Function to get wallet logs
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	 **/
	async getWalletLogs(req,res,next){
        /** Sanitize Data **/
        req.body 		= sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
        let userId		= (req.body.user_id)        ? new ObjectId(req.body.user_id)    :"";
        let walletTypes	= (req.body.wallet_types)   ? req.body.wallet_types         :"";
        let paidUnpaid	= (req.body.paid)           ? JSON.parse(req.body.paid)     :false;
        var endDate		= (req.body.date_to)    ?   newDate(req.body.date_to,Constants.DATABASE_DATE_FORMAT) 	:"";
        var startDate	= (req.body.date_from)  ?   newDate(req.body.date_from,Constants.DATABASE_DATE_FORMAT) :"";
        let transactionId	= (req.body.transaction_id)     ?   req.body.transaction_id     :"";
        let transactionType	= (req.body.transaction_type)   ?   req.body.transaction_type   :"";

        /** Send error response **/
        if(!userId) return {status:Constants.STATUS_ERROR, message: res.__("system.missing_parameters")};

        /** Set conditions */
        let conditions = {user_id : userId};
        if(startDate && endDate){
            let fromDate  	    = newDate(startDate+" "+Constants.START_DATE_TIME_FORMAT);
            let toDate 	  	    = newDate(endDate+" "+Constants.END_DATE_TIME_FORMAT);
            conditions.created  = {$gte : fromDate , $lte : toDate}
        }

        if(walletTypes && walletTypes.length>0) conditions['wallet_type'] = { $in : walletTypes };
        if(paidUnpaid) conditions['transaction_type'] = Constants.DEBIT;
        if(transactionType) conditions['$and'] = [{transaction_type: parseInt(transactionType)}];
        if(transactionId) conditions.transaction_id 	= new RegExp(cleanRegex(transactionId), "i");

        asyncParallel({
            user_wallet_logs : (callback)=>{
                /** Get user wallet transaction list **/
                this.userWalletLogDB.find(conditions,{projection: {user_id:1,transaction_id:1,transaction_type:1,wallet_type:1,amount:1,created:1}}).toArray().then(userWalletResult=>{
                    callback(null,userWalletResult);
                }).catch(next);
            },
            user_wallet_balance : (callback)=>{
                /** Get user wallet balance details **/
                this.cartAPI.getUserWalletBalance(req,res,next).then(response=>{
                    callback(null,response);
                }).catch(next);
            }
        },(asyncErr,asyncResponse)=>{
            if(asyncErr) return next(asyncErr);

            let userWalletBalanceResponse = asyncResponse.user_wallet_balance;
            let userWalletResult          = asyncResponse.user_wallet_logs;

            /** Send error response **/
            if(userWalletBalanceResponse.status == Constants.STATUS_ERROR) return userWalletBalanceResponse;

            /**Send success response */
            return {
                status: Constants.STATUS_SUCCESS,
                result : userWalletResult ,
                amount_per_points: userWalletBalanceResponse?.amount_per_points || 0,
                total_amount : userWalletBalanceResponse?.result?.total_amount || 0,
                wallet : userWalletBalanceResponse?.result?.wallet || {}
            };
        });
	};// end getWalletLogs()

	 /**
	 * Function to transfer balance
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	**/
	async transferBalance (req,res,next){
        /** Sanitize Data **/
        req.body 		    = sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
        let userId   	    = (req.body.user_id)       ? new ObjectId(req.body.user_id)  : "";
        let mobileNumber    = (req.body.mobile_number) ? req.body.mobile_number  	  	 : "";
        let amount          = (req.body.amount)        ? parseFloat(req.body.amount)     : "";

        /** Send error response **/
        if(!userId || !amount) return {status : Constants.STATUS_ERROR, message : res.__("system.missing_parameters")};

        /** Apply validation */
        let validationResponse = await applyValidationInterCallFunction(req, res, next, transferBalanceValidation);
        if(validationResponse.status != Constants.STATUS_SUCCESS) return validationResponse;

        asyncParallel({
            sender_details : (mainCallback)=>{
                /** Find amount sender mobile number **/
                this.userDB.findOne({_id : userId},{projection: {_id:1,mobile_number:1}}).then(userSenderResult=>{
                    mainCallback(null,userSenderResult);
                }).catch(next);
            },
            customer_details : (mainCallback)=>{
                /** Set customer conditions **/
                let userConditions 			 = clone(Constants.CUSTOMER_COMMON_CONDITIONS);
                userConditions.mobile_number = mobileNumber;

                /** Find customer details **/
                this.userDB.findOne(userConditions,{projection: {_id:1,user_role_id:1}}).then(userResult=>{
                    mainCallback(null,userResult);
                }).catch(next);
            },
            get_wallet_balance : (mainCallback)=>{
                /** Get wallet balance **/
                getWalletBalance(req,res,next,{user_id : userId}).then(walletBalanceResponse=>{
                    mainCallback(null,walletBalanceResponse);
                }).catch(next);
            },
        },(mainAsyncErr,mainAsyncResponse)=>{
            if(mainAsyncErr) return next(mainAsyncErr);

            let senderDetails    = mainAsyncResponse.sender_details;
            let customerDetails  = mainAsyncResponse.customer_details;
            let getWalletBalance = mainAsyncResponse.get_wallet_balance;

            /** Send error message **/
            if(!senderDetails) return {status : Constants.STATUS_ERROR, message : res.__("admin.system.invalid_access")};

            /** If mobile number is not valid **/
            if(!customerDetails) return {status : Constants.STATUS_ERROR, message : res.__("user_wallet.please_enter_valid_mobile_number")};

            let senderMobileNumber = senderDetails.mobile_number;
            let transferId         = customerDetails._id;
            let userRoleId         = customerDetails.user_role_id;
            let totalAmount        = (getWalletBalance.wallet && getWalletBalance.wallet.top_up_amount) ? getWalletBalance.wallet.top_up_amount : 0;

            /** Send error response when not have balance */
            if(amount > totalAmount) return {status: Constants.STATUS_ERROR, message: res.__("user_wallet.you_have_insufficient_balance") };

            asyncParallel({
                user_transfer_balance : (callback)=>{
                    /** Save user transfer balance details **/
                    this.userTransferBalanceDB.insertOne({
                        user_id     : userId,
                        amount      : amount,
                        transfer_to : new ObjectId(transferId),
                        status      : Constants.PENDING,
                        created     : getUtcDate()
                    }).then(insertResult=>{
                        callback(null,insertResult?.insertedId || "");
                    }).catch(next);
                },
                save_user_details : (callback)=>{
                    /** Update wallet balance */
                    debitWalletBalance(req,res,next,{
                        user_id 		:	userId,
                        amount 			: 	amount,
                        wallet_type  	: 	Constants.TOP_UP_AMOUNT,
                        transaction_type: 	Constants.DEBIT,
                        extra_parameters:	{ transfer_to : new ObjectId(transferId) },
                    }).then(updateResponse=>{
                        callback(null,updateResponse);
                    }).catch(next);
                }
            },(asyncErr,asyncResponse)=>{
                if(asyncErr) return next(asyncErr);

                /*************** Send Mail  ***************/
                sendMailToUsers(req,res,{
                    event_type 			: Constants.NOTIFICATION_TRANSFER_BALANCE,
                    transfer_balance_id	: asyncResponse.user_transfer_balance || "",
                    amount				: currencyFormat(amount),
                    mobile_number   	: senderMobileNumber,
                    transfer_to     	: transferId,
                    user_role_id    	: userRoleId,
                    user_id             : userId
                });
                /*************** Send Mail  ***************/

                /**Send success response */
                return {status: Constants.STATUS_SUCCESS, message: res.__("user_wallet.amount_has_been_transferred_successfully") };
            });
        });
	};// end transferBalance()

	/**
	 * Function to get transfer balance list
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	 **/
	async getTransferBalanceList(req,res,next){
        /** Sanitize Data **/
        req.body 	    = sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
        let userId	    = (req.body.user_id)    ? new ObjectId(req.body.user_id)                        :"";
        var endDate		= (req.body.date_to)    ? newDate(req.body.date_to,Constants.DATABASE_DATE_FORMAT) 	:"";
        var startDate	= (req.body.date_from)  ? newDate(req.body.date_from,Constants.DATABASE_DATE_FORMAT)  :"";

        /** Send error response **/
        if(!userId) return {status:Constants.STATUS_ERROR, message: res.__("system.missing_parameters")};

        /** Set conditions **/
        let conditions = { transfer_to : userId};

            /** Set filter by date **/
        if(startDate && endDate){
            let fromDate  	    = newDate(startDate+" "+Constants.START_DATE_TIME_FORMAT);
            let toDate 	  	    = newDate(endDate+" "+Constants.END_DATE_TIME_FORMAT);
            conditions.created  = { $gte : fromDate , $lte : toDate}
        }

        /** Get transfer balance list **/
        let result = await this.userTransferBalanceDB.find(conditions,{projection: {user_id:1,amount:1,created:1,status:1}}).sort({_id: Constants.SORT_DESC}).toArray();

        /** Send success response **/
        if(result.length <= 0) return {status: Constants.STATUS_SUCCESS, result: []};

        let userIds = [];
        result.map(records=>{
            userIds.push(records.user_id);
        });

        /** Get user list **/
        let userResult = await this.userDB.find({_id: {$in : userIds}},{projection: {mobile_number:1,full_name:1}}).toArray();

        let userObject = {};
        if(userResult.length >0){
            userResult.map(records=>{
                userObject[records._id] = records;
            });
        }

        /** Add sender details  */
        result.map(records=>{
            let tmpUserId = records.user_id;

            records.sender_name = (userObject[tmpUserId]) ? userObject[tmpUserId].full_name :"";
            records.sender_mobile_number = (userObject[tmpUserId]) ? userObject[tmpUserId].mobile_number :"";
        });

        /**Send success response */
        return {status: Constants.STATUS_SUCCESS, result: result};
	};// end getTransferBalanceList()

	/**
	 * Function to update transfer balance status
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	 **/
	async updateTransferBalanceStatus(req,res,next){
        /** Sanitize Data **/
        req.body 			  = sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
        let userId			  = (req.body.user_id) 			   ? new ObjectId(req.body.user_id) :"";
        let status			  = (req.body.status)  			   ? parseInt(req.body.status) 	:"";
        let transferBalanceId = (req.body.transfer_balance_id) ? new ObjectId(req.body.transfer_balance_id) :"";

        /** Send error response **/
        if(!userId || !status || !transferBalanceId || (status != Constants.APPROVED && status != REJECTED)) {
            return {status : Constants.STATUS_ERROR, message : res.__("system.missing_parameters")};
        }

        /** Get transfer balance details **/
        let transferResult = await this.userTransferBalanceDB.findOne({
            _id         : transferBalanceId,
            status      : Constants.PENDING,
            transfer_to : userId,
        },{projection:{_id:1,transfer_to:1,amount:1,user_id:1}});

        /** Send error response **/
        if(!transferResult) return {status: Constants.STATUS_ERROR, message: res.__("admin.system.invalid_access")};

        /** Update transfer balance details **/
        await this.userTransferBalanceDB.updateOne({
            _id   : transferBalanceId
        },
        {$set: {
            status 	 : status,
            modified : getUtcDate(),
        }});

        /** update wallet balance */
        updateWalletBalance(req,res,next,{
            user_id 		:	(status == Constants.APPROVED) ? new ObjectId(transferResult.transfer_to) :new ObjectId(transferResult.user_id),
            amount 			: 	transferResult.amount,
            wallet_type  	: 	(status == Constants.APPROVED) ? Constants.TRANSFERRED_BALANCE_AMOUNT : Constants.TOP_UP_AMOUNT,
            transaction_type: 	Constants.CREDIT,
            extra_parameters:	{ transfer_balance_id : transferBalanceId },
        }).then(()=>{}).catch(next);

        /** Send success response */
        let message = (status == Constants.APPROVED) ? res.__("my_account.money_has_been_accepted_successfully") : res.__("my_account.money_has_been_rejected_successfully");
        return {status: Constants.STATUS_SUCCESS, message:  message};
	};// end updateTransferBalanceStatus()
};
