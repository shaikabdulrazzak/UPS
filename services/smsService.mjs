import { ObjectId } from 'mongodb';
import axios from 'axios';

import { getDb } from '../config/connection.mjs';
import * as Constants from "../config/global_constant.mjs";
import Tables from '../config/database_tables.mjs';
import {getUtcDate} from '../utils/index.mjs';

/**
 * Function to send SMS
 *
 * @param req		As 	Request Data
 * @param res		As 	Response Data
 * @param options	As	Data object
 *
 * @return message
 */
export const sendSMS = (req,res,options)=>{
	return new Promise(resolve=>{
		let mobileNumber	=	(options && options.mobile_number)	?	options.mobile_number		:"";
		let userId			=	(options && options.user_id)		?	new ObjectId(options.user_id)	:"";

		/** Send success response **/
		let IsSMSSendingOn		= (res.locals.settings['Fcc.send_sms_on_off'] > 0) ? true : false;

		if(!IsSMSSendingOn) return resolve({status:	Constants.STATUS_SUCCESS,	message: "message sending turned off"});

		/** Send error response **/
		if(!mobileNumber) return resolve({status : Constants.STATUS_ERROR, options : options, message : res.__("system.something_going_wrong_please_try_again")});

		let msgBody			= (options && options.sms_template) 	? 	options.sms_template 	:"";
		let accountSid		= res.locals.settings['Fcc.sender_id'];
		let accountId		= res.locals.settings['Fcc.acount_id'];
		let userName		= res.locals.settings['Fcc.user_name'];
		let password		= res.locals.settings['Fcc.password'];
		let langCode		= res.locals.settings['Fcc.language'];

		/** Save sms logs data **/
		let saveData 				= 	{};
		saveData["user_id"] 		= 	userId;
		saveData["mobile_number"] 	= 	mobileNumber;
		saveData["message"] 		= 	msgBody;
		saveData["created"] 		= 	getUtcDate();

		let Msisdn			= mobileNumber.replace("+", "");
		let msg				= msgBody.replace(" ", "+").trim();
		let senderID		= accountSid.replace(" ", "%20");
		let timestampp 		= new Date().getTime();
		timestampp			= parseInt(timestampp/10000000);
		let tempRandNumber	= Math.floor(100000 + Math.random() * 900000);
		let randomNumber 	= String(timestampp+tempRandNumber);
		let finalURL        = 'http://secure1.future-club.com/BulkSMSwebserviceV1/SmsService.asmx/SendSMS?UName='+userName+'&Password='+password+'&AccountID='+accountId+'&Msisdn='+Msisdn+'&Msg='+msg+'&Lang='+langCode+'&SenderID='+senderID+'&TransactionID='+randomNumber;

		return resolve({status:	Constants.STATUS_SUCCESS});

        axios.get(finalURL).then(response => {
            let responseText = [];
			if(response && response.data){
				let jsonData = JSON.parse(xml2json(response.data, {compact: true, spaces: 4}));
				responseText = (jsonData.string && jsonData.string._text) ? jsonData.string._text.split("  ") : [];
			}

            if(responseText?.[0] > 0){
				/********** Save sms logs ************/
					saveData["status"] 		= 	Constants.NOT_SENT;
					saveData["response"] 	= 	responseText;

					saveSmsLogs(saveData);
				/********** Save sms logs ************/

				/** Send error response **/
				return resolve({
					status	:	Constants.STATUS_ERROR,
					message	: 	responseText?.[1] || ""
				});
			}
			/********** Save sms logs ************/
				saveData["status"]	= 	Constants.SENT;
				saveData["response"]=	responseText;

				saveSmsLogs(saveData);
			/********** Save sms logs ************/

			/** Send success response **/
			resolve({
				status	:	Constants.STATUS_SUCCESS,
				message	: 	responseText
			});

        }).catch(error => {
            console.error('Error:', error.message);

            /********** Save sms logs ************/
                saveData["status"] 		= 	Constants.NOT_SENT;
                saveData["response"] 	= 	error.message;

                saveSmsLogs(saveData);
            /********** Save sms logs ************/

            /** Send error response **/
            return resolve({
                status	:	Constants.STATUS_ERROR,
                message	: 	error.message
            });
        });
	});
}//sendSMS()

/**
 * Function to save sms logs
 *
 * @param options As	Data object
 *
 * @return null
 */
const saveSmsLogs = async (options)=>{
	/** Save sms logs **/
    let dbInstance = getDb();
	await dbInstance.collection(Tables.SMS_LOGS).insertOne(options);
	return;
}//End saveSmsLogs();