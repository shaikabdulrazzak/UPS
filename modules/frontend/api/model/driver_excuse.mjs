import { ObjectId } from 'mongodb';
import * as Constants from "../../../../config/global_constant.mjs";
import Tables from '../../../../config/database_tables.mjs';
import { sanitizeData, getUtcDate, newDate, set24HourFormat, applyValidationInterCallFunction} from "../../../../utils/index.mjs";
import { sendMailToUsers} from "../../../../services/index.mjs";
import { excuseValidation } from '../validations/driverValidations.mjs';

export default class DriverExcuse {

    constructor(db) {
        this.db     =   db;
        this.driverExcusesDB = db.collection(Tables.DRIVER_EXCUSES);
    }

	/**
	 * Function to post driver excuse
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	**/
	async postDriverExcuse (req,res,next){
		req.body 	= sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
		let type 	= (req.body.type)    ? req.body.type 			  :"";
		let userId  = (req.body.user_id) ? new ObjectId(req.body.user_id) :"";
		let date    = (req.body.date) 	 ? req.body.date 			  :"";
		let from    = (req.body.from) 	 ? parseFloat(req.body.from)  :"";
		let to 	    = (req.body.to) 	 ? parseFloat(req.body.to) 	  :"";
		let reason  = (req.body.reason)  ? req.body.reason 			  :"";

		/** Send error response **/
		if(!userId || (type != Constants.IN_EXCUSE && type != Constants.OUT_EXCUSE && type != Constants.CANCEL_EXCUSE)){
			return {status: Constants.STATUS_ERROR, message: res.__("system.missing_parameters")};
		}


		if(type == Constants.IN_EXCUSE || type == Constants.OUT_EXCUSE){
			/** Apply validation */
			let validationResponse = await applyValidationInterCallFunction(req, res, next, excuseValidation);
			if(validationResponse.status != Constants.STATUS_SUCCESS) return validationResponse;
		}

		let requestedDate = newDate(date,Constants.DATABASE_DATE_FORMAT);

		/** For get driver excuse details */
		let findResult = await this.driverExcusesDB.findOne({
			driver_id    : userId,
			is_completed : false
		},{projection: {_id: 1, status: 1, is_start: 1}, sort: {created: Constants.SORT_DESC}});

		/** Send error response when excuse found but driver post another excuse */
		if(findResult  && type == Constants.IN_EXCUSE) return {status: Constants.STATUS_ERROR, message: res.__("driver_excuses.driver_excuses_is_already_in_running")};

		/** Send error response when excuse not found but driver want to stop or cancel */
		if(!findResult && (type == Constants.OUT_EXCUSE || type == Constants.CANCEL_EXCUSE)) return {status: Constants.STATUS_ERROR, message: res.__("driver_excuses.you_have_not_taken_any_excuses_yet")};

		if(type == Constants.OUT_EXCUSE){
			/** Send error response when excuse not approved but driver want to stop */
			if(findResult.status != Constants.APPROVED) return {status:Constants.STATUS_ERROR, message:res.__("driver_excuses.your_request_not_approve_by_admin")};

			/** Send error response when excuse not start but driver want to stop */
			if(!findResult.is_start) return {status: Constants.STATUS_ERROR, message: res.__("driver_excuses.excuse_not_end_untill_start")};
		}

		if(type == Constants.CANCEL_EXCUSE){
			/** Send error response when excuse reject but driver want to cancel */
			if(findResult.status == Constants.REJECTED ) return {status: Constants.STATUS_ERROR, message: res.__("driver_excuses.your_request_not_approve_by_admin")};

			/** Send error response when excuse start but driver want to cancel  */
			if(findResult.is_start) return {status: Constants.STATUS_ERROR, message: res.__("driver_excuses.not_allow_to_Constants.CANCEL_EXCUSE")};
		}

		if(type == Constants.IN_EXCUSE){
			/** Set insert-able data */
			let insertData = {
				type  			: 	Constants.IN_EXCUSE,
				date			: 	getUtcDate(requestedDate+" "+Constants.START_DATE_TIME_FORMAT),
				from 			: 	from,
				to 				: 	to,
				status			: 	Constants.PENDING,
				driver_id   	: 	userId,
				is_completed	: 	false,
				reason 			: 	reason,
				created			: 	getUtcDate(),
				modified		:	getUtcDate()
			};

			/** insert driver excuse details */
			let insertResult = await this.driverExcusesDB.insertOne(insertData);

			/*************** Send Mail  ***************/
			sendMailToUsers(req,res,{
				event_type 		: Constants.DRIVER_EXCUSES_REQUEST_POSTED_EMAIL_EVENTS,
				excuse_id		: insertResult?.insertedId || "",
				user_id			: Constants.CRAVEZ,
				member_id		: userId,
				excuses_details	: insertData
			});
			/*************** Send Mail  ***************/

			/**Send success response */
			return {status: Constants.STATUS_SUCCESS,message : res.__("driver_excuses.excuse_has_been_added_successfully")};

		}else if(type == Constants.OUT_EXCUSE){
			/** update driver excuse details */
			await this.driverExcusesDB.updateOne({
				driver_id 		:	userId,
				is_completed 	:	false,
				status			: 	Constants.APPROVED
			},
			{$set:{
				is_completed: true,
				from 		: from,
				to 			: to,
				type  		: Constants.OUT_EXCUSE,
				modified	: getUtcDate()
			}});

			/** Save driver status logs */
			saveDriverStatusLogs(req,res,next,{
				parent_id 	: findResult._id,
				driver_id 	: userId,
				type	  	: 'driver_excuses',
				event_type	: Constants.OUT_EXCUSE,
				end_time	: to,
			}).then(()=>{ });

			/**Send success response */
			return {status: Constants.STATUS_SUCCESS,message: res.__("driver_excuses.excuse_has_been_ended_successfully")};

		}else if(type == Constants.CANCEL_EXCUSE){
			/** update driver excuse details */
			await this.driverExcusesDB.updateOne({
				driver_id 	 :	userId,
				is_completed :	false,
				$or:	[
					{status: Constants.APPROVED},
					{status: Constants.PENDING}
				]
			},
			{$set: {
				is_completed: true,
				status      :  CANCELLED,
				type 		: Constants.CANCEL_EXCUSE,
				modified	: getUtcDate()
			}});

			/**Send success response */
			return {status: Constants.STATUS_SUCCESS, message : res.__("driver_excuses.excuse_has_been_canceled_successfully")};
		}
	}// end postDriverExcuse()

	/**
	 * Function to get latest Excuse
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	**/
	async getDriverExcuses (req,res,next){
		let userId = req?.body?.user_id || "";

		/** Send error response **/
		if(!userId) return {status : Constants.STATUS_ERROR, message : res.__("system.missing_parameters")};

		/** For get driver excuses details */
		let findResult = await this.driverExcusesDB.findOne({
			driver_id 	 : new ObjectId(userId),
			is_completed : false
		},{projection: { _id:1,date:1,driver_id:1,from:1,to:1,status:1,is_completed:1,reason:1,is_start:1},sort:{created:Constants.SORT_DESC}});

		/* If no record found*/
		if(!findResult) return {status	: Constants.STATUS_SUCCESS, message: res.__("system.no_record_found")};

		/** Convert into 24 hours format */
		findResult.to 	= set24HourFormat(findResult.to);
		findResult.from = set24HourFormat(findResult.from);

		/**Send success response */
		return {status: Constants.STATUS_SUCCESS, result: findResult};
	}// end getDriverExcuses()
}
