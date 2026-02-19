import { ObjectId } from 'mongodb';
import clone from 'clone';
import {parallel as asyncParallel} from 'async';
import * as Constants from "../../../../config/global_constant.mjs";
import Tables from '../../../../config/database_tables.mjs';
import { sanitizeData, getUtcDate, newDate, arrayToObject, applyValidationInterCallFunction,convertIntoTimeFormat, subtractDate, set24HourFormat} from "../../../../utils/index.mjs";
import { sendMailToUsers, saveDriverStatusLogs} from "../../../../services/index.mjs";
import { fuelingValidation, serviceValidation, inOutShiftValidation } from '../validations/driverValidations.mjs';

export default class DriverBreaks{

	constructor(db) {
        this.userDB 				= db.collection(Tables.USERS);
		this.shiftDB 				= db.collection(Tables.SHIFTS);
		this.orderDB 				= db.collection(Tables.ORDERS);
		this.userOnLineLogsDB 		= db.collection(Tables.USER_ONLINE_LOGS);
		this.driverBreakDB 			= db.collection(Tables.DRIVER_BREAKS);
		this.driverAvailabilitiesDB = db.collection(Tables.DRIVER_AVAILABILITIES);
		this.driverInOutShiftDB 	= db.collection(Tables.DRIVER_IN_OUT_SHIFTS);
		this.driverOverTimeRequestDB= db.collection(Tables.CAPTAIN_OVERTIME_REQUESTS);
		this.driverFuelDB 			= db.collection(Tables.DRIVER_FUELS);
		this.driverServiceDB 		= db.collection(Tables.DRIVER_SERVICES);
    }

	/**
	 * Function to update driver breaks
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	**/
	async updateDriverBreaks (req,res,next){
		let type 	= (req.body.type)    ? req.body.type 			  : "";
		let userId  = (req.body.user_id) ? new ObjectId(req.body.user_id) : "";

		/** Send error response **/
		if(!type || !userId) return {status: Constants.STATUS_ERROR, message: res.__("system.missing_parameters")};

		/**For check type */
		if(Constants.DRIVER_BREAK_TYPE.indexOf(type) == -1 ) return {status: Constants.STATUS_ERROR, message: res.__("admin.system.invalid_access")};

		let currentDate = newDate(newDate("",Constants.CURRENTDATE_START_DATE_FORMAT));

		/** For get driver breaks details */
		let findResult = await this.driverBreakDB.findOne({
			driver_id    : userId,
			date         : {$gte: currentDate},
			is_completed : false
		},{projection: {_id: 1,status: 1, start_time: 1,duration:1}});

		/** Send  error response when any running break found */
		if(findResult && type == Constants.IN_BREAK) return {status: Constants.STATUS_ERROR, message: res.__("driver_breaks.break_is_already_in_running")};

		if(type == Constants.END_BREAK){
			/** Send  error response when any running break not found */
			if(!findResult) return {status: Constants.STATUS_ERROR, message: res.__("driver_breaks.you_have_not_taken_any_break_yet")};

			/** Send error response when break not approved */
			if(findResult.status != Constants.APPROVED) return {status: Constants.STATUS_ERROR, message: res.__("driver_break.break_is_not_approved_yet_you_cannot_end_this_break")};
		}

		if(type == Constants.IN_BREAK){
			/** Set insert-able data */
			let insertAbleData = {
				break_type  		: 	new ObjectId(BREAK),
				date				: 	getUtcDate(currentDate),
				duration_in_minutes : 	"",
				duration			: 	"",
				start_time  		: 	"",
				end_time    		: 	"",
				status				: 	Constants.PENDING,
				driver_id   		: 	userId,
				is_completed		: 	false,
				created				: 	getUtcDate(),
				modified			:	getUtcDate()
			};

			/** Save driver breaks details */
			let insertResult = await this.driverBreakDB.insertOne(insertAbleData);

			/*************** Send Mail  ***************/
				sendMailToUsers(req,res,{
					event_type 		:	Constants.DRIVER_BREAK_REQUEST_POSTED_EMAIL_EVENTS,
					break_id		: 	insertResult?.insertedId || "",
					user_id			: 	userId,
					break_details	: 	insertAbleData
				});
			/*************** Send Mail  ***************/

			/**Send success response */
			return {status: Constants.STATUS_SUCCESS, message: res.__("driver_break.break_has_been_added_successfully")};

		}else if(type == Constants.END_BREAK){
			/** Get break end time **/
			let startTime 	= 	(findResult.start_time) ? String(findResult.start_time).replace('.',':') :"";
			let endTime 	=	newDate("",Constants.BREAK_TIME_FORMAT);
			let breakStart	=	new Date(newDate("",Constants.DATABASE_DATE_FORMAT+' '+startTime));
			let breakEnd	= 	new Date(newDate("",Constants.DATABASE_DATE_FORMAT+' '+endTime));
			let difference	= 	Math.ceil((breakEnd - breakStart)/Constants.MILLISECONDS_IN_A_SECOND);
			endTime 		=	parseFloat(endTime.replace(':','.'));
			let endTimeStamp=	newDate().getTime();

			/** update driver breaks details */
			await this.driverBreakDB.updateOne({
				driver_id 	 :	userId,
				is_completed : 	false,
				status		 : 	Constants.APPROVED,
				date         : 	{$gte: currentDate}
			},
			{$set: {
				is_completed : 	true,
				end_time     : 	endTime,
				end_timestamp:	endTimeStamp,
				elapsed_time :	difference,
				duration     :	difference,
				modified	 :	getUtcDate()
			}});

			/*************** Send Mail  ***************/
				sendMailToUsers(req,res,{
					event_type 		:	Constants.DRIVER_BREAK_REQUEST_ENDED_EMAIL_EVENTS,
					break_id		: 	findResult._id,
					user_id			: 	userId,
				});
			/*************** Send Mail  ***************/

			/** Save driver status logs */
			saveDriverStatusLogs(req,res,next,{
				parent_id 	: 	findResult._id,
				driver_id 	: 	userId,
				type	  	: 	'driver_breaks',
				event_type	: 	Constants.END_BREAK,
				end_time	: 	endTime,
				duration	:	difference
			}).then(()=>{});

			/**Send success response */
			return {status: Constants.STATUS_SUCCESS, message: res.__("driver_break.break_has_been_ended_successfully")};
		}
	}// end updateDriverBreaks()

	/**
	 * Function to get latest break
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	**/
	async getBreaks (req,res,next){
		let userId  = (req.body.user_id) ? new ObjectId(req.body.user_id) : "";

		/** Send error response **/
		if(!userId) return {status:Constants.STATUS_ERROR, message: res.__("system.missing_parameters")};

		/** For get driver breaks details */
		let currentDate = newDate("",Constants.DATABASE_DATE_FORMAT);
		let findResult = await this.driverBreakDB.findOne({
			driver_id 	: userId,
			date      	: { $eq: newDate(currentDate+" "+Constants.START_DATE_TIME_FORMAT)},
			is_completed: false
		},{projection: {
			_id:1,date:1,driver_id:1,start_time:1,end_time:1,duration_in_minutes:1,status:1,rejection_reason:1,is_completed:1
		},sort:{created:Constants.SORT_DESC}});

		/**Send success response */
		if(!findResult)	return {status: Constants.STATUS_SUCCESS,message: res.__("system.no_record_found")};

		/** Convert into 24 hours format */
		findResult.end_time 	=	set24HourFormat(findResult.end_time);
		findResult.start_time 	=	set24HourFormat(findResult.start_time);

		/**Send success response */
		return {status	: Constants.STATUS_SUCCESS, result: findResult};
	}// end getBreaks()

	/**
	 * Function to update In Out Shifts
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	**/
	async updateInOutShifts (req,res,next){
		return new Promise(async resolve=>{
			/** Sanitize Data **/
			req.body 		= 	sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
			let type 		=	(req.body.type)    		?	req.body.type 			  		:"";
			let userId  	= 	(req.body.user_id) 		? 	new ObjectId(req.body.user_id) 		:"";
			let km  		= 	(req.body.km) 	 		? 	parseFloat(req.body.km) 		:"";
			let latitude 	= 	(req.body.latitude)  	? 	parseFloat(req.body.latitude)  	:0;
			let longitude 	= 	(req.body.longitude)	? 	parseFloat(req.body.longitude) 	:0;

			/** Send error response **/
			if(!userId || (type != Constants.IN_SHIFT && type != Constants.OUT_SHIFT) ){
				return resolve({status: Constants.STATUS_ERROR, message: res.__("system.missing_parameters")});
			}
			
			/** Apply validation */
			let validationResponse = await applyValidationInterCallFunction(req, res, next, inOutShiftValidation);
			if(validationResponse.status != Constants.STATUS_SUCCESS) return resolve(validationResponse);	

			/** Set driver conditions **/
			let driverConditions = {...{_id: userId}, ...Constants.DRIVER_COMMON_CONDITIONS};

			let currentTime		=	parseFloat(newDate('',Constants.SHIFT_TIME_FORMAT));
			let startDate		=	newDate(newDate("",Constants.CURRENTDATE_START_DATE_FORMAT));
			let endDate			=	newDate(newDate("",Constants.CURRENTDATE_END_DATE_FORMAT));
			let prevStartDate 	=	newDate(newDate(subtractDate(Constants.HOURS_IN_A_DAY),Constants.CURRENTDATE_START_DATE_FORMAT));
			let prevEndDate 	=	newDate(newDate(subtractDate(Constants.HOURS_IN_A_DAY),Constants.CURRENTDATE_END_DATE_FORMAT));

			asyncParallel({
				driver_details : (callback)=>{
					/** Get driver details  */
					this.userDB.findOne(driverConditions,{projection: {force_active:1,vehicle_type:1,vehicle_id:1,is_suspend:1}}).then(userResult=>{
						callback(null,userResult);
					}).catch(next);
				},
				driver_leave_count : (callback)=>{
					if(type != Constants.IN_SHIFT) return callback(null, 0);

					/** Get today user leave count  */
					this.driverAvailabilitiesDB.countDocuments({
						user_id 	: 	userId,
						date 		:	{$gte: startDate, $lte: endDate},
						leave_status:	Constants.APPROVED,
						leave_type 	:	{$exists :true},
					}).then(leaveCount=>{
						callback(null, leaveCount);
					}).catch(next);
				},
				overtime_details : (callback)=>{
					if(type != Constants.OUT_SHIFT) return callback(null, null);

					/** Get overtime details */
					this.driverOverTimeRequestDB.findOne({
						user_id		:	userId,
						request_date:	{$gte: startDate, $lte: endDate },
					},{projection: {hours:1}}).then(leaveCount=>{
						callback(null, leaveCount);
					}).catch(next);
				},
				check_previous : (callback)=>{	
					this.driverInOutShiftDB.findOne({
						driver_id :	userId,
						type 	  : Constants.IN_SHIFT,
						created	  :	{
							$gte: newDate(prevStartDate),
							$lte: newDate(prevEndDate)
						}
					},{projection: {_id:1},sort:{created:Constants.SORT_DESC}}).then(findResult=>{
						if(!findResult) return callback(null,false);

						/** For get driver shift details */
						this.driverAvailabilitiesDB.distinct("shift_id",{
							user_id	: 	userId,
							date	: 	{$gte: newDate(prevStartDate), $lte: newDate(prevEndDate)}
						}).then(shiftIds=>{
							if(shiftIds.length==0) return callback(null,false);

							/** Check driver shifts */
							this.shiftDB.aggregate([
								{$match	: {
									_id	: {$in: arrayToObject(shiftIds) },
									is_deleted: {$ne: Constants.DELETED},
								}},
								{$addFields:{
									is_next_day : {$cond: [
										{$and: [
											{ $gt : ["$start_time","$end_time"] },
										]},
										true,
										false
									]},
								}},
								{$match	: {
									$or :[
										{$and : [
											{is_next_day: true },
											{start_time : {$lte: currentTime } },
											{end_time   : {$lte: currentTime } }
										]},
										{$and : [
											{is_next_day: true },
											{start_time : {$gte: currentTime } },
											{end_time   : {$gte: currentTime } }
										]},
										{$and : [
											{end_time 	: {$gte: currentTime } },
											{start_time : {$lte: currentTime } }
										]}
									]
								}},
							]).toArray().then(shiftResult=>{
								let shiftFlag = (shiftResult && shiftResult[0]) ? true : false;
								callback(null,shiftFlag);
							}).catch(next);
						}).catch(next);
					}).catch(next);
				}
			},async (asyncParentErr, asyncParentResponse)=>{

				if(asyncParentErr) return next(asyncParentErr);

				/** Send error response **/
				if(!asyncParentResponse.driver_details || asyncParentResponse.driver_leave_count) {
					return resolve({
						status 	: Constants.STATUS_ERROR,
						message : (!asyncParentResponse.driver_details) ? res.__("system.invalid_access") :res.__("driver_break.not_allow_in_shift")
					});
				}

				let userResult 	 	= 	asyncParentResponse.driver_details;
				let overtimeHours	= 	(asyncParentResponse.overtime_details) 	 ? parseFloat(asyncParentResponse.overtime_details.hours) :0;
				let isSuspend 	 	= 	userResult.is_suspend;
				let forceActive 	=  	userResult.force_active;
				let vehicleId 		=  	userResult.vehicle_id;
				let vehicleType 	=  	(userResult.vehicle_type) ? userResult.vehicle_type :"";
				let isForceActive	=	(forceActive == Constants.FORCE_ACTIVE) ? true :false;
				let userSuspend		=	(isSuspend == Constants.SUSPEND)	?	true :false;
				let checkPrevious 	=  	(asyncParentResponse.check_previous) ? asyncParentResponse.check_previous :"";

				/** Check user assign vehicle or not when mark shift in */
				if(type == Constants.IN_SHIFT && !vehicleType) return resolve({status: Constants.STATUS_ERROR, message: res.__("driver_break.not_allow_in_shift_unit_vehicle_not_assigned") });

				/** Get last shift details */
				let lastShiftDetails = await this.driverInOutShiftDB.findOne({
					vehicle_id 	:	new ObjectId(vehicleId),
					type 		: 	Constants.OUT_SHIFT,
				},{projection: {km:1, vehicle_type: 1}, sort: {_id: Constants.SORT_DESC}});

				/** Check current km is more than last shift out */
				if(type == Constants.IN_SHIFT && lastShiftDetails && lastShiftDetails.km && lastShiftDetails.km > km){
					return resolve({status: Constants.STATUS_ERROR, message: res.__("driver_break.please_enter_km_greater_then_last_km") });
				}

				asyncParallel({
					check_driver_shift : (callback)=>{
						if(type != Constants.IN_SHIFT) return callback(null,true);

						/** Send response when admin mark force active */
						if(isForceActive) return callback(null,true);

						/** Check driver availabilities */
						this.driverAvailabilitiesDB.distinct("shift_id",{
							user_id	: userId,
							date	: {$gte: startDate, $lte: endDate}
						}).then(shiftIds=>{
							if(shiftIds.length==0) return callback(null,false);

							/** Check driver shifts */
							this.shiftDB.aggregate([
								{$match	: {
									_id	: {$in: arrayToObject(shiftIds) },
									is_deleted: {$ne: Constants.DELETED},
								}},
								{$addFields:{
									is_next_day : {$cond: [
										{$and: [
											{ $gt : ["$start_time","$end_time"] },
										]},
										true,
										false
									]},
								}},
								{$match	: {
									$or :[
										{$and : [
											{is_next_day: true },
											{start_time : {$lte: currentTime } },
											{end_time   : {$lte: currentTime } }
										]},
										{$and : [
											{is_next_day: true },
											{start_time : {$gte: currentTime } },
											{end_time   : {$gte: currentTime } }
										]},
										{$and : [
											{end_time 	: {$gte: currentTime } },
											{start_time : {$lte: currentTime } }
										]}
									]
								}},
							]).toArray().then(shiftResult=>{
								let shiftFlag = (shiftResult && shiftResult[0]) ? true : false;
								callback(null,shiftFlag);
							}).catch(next);
						}).catch(next);
					},
					have_orders : (callback)=>{
						if(type != Constants.OUT_SHIFT || userSuspend) return callback(null,0);

						/** Check driver have orders */
						this.orderDB.countDocuments({
							$and: [
								{$or : [
									{captain_id		 : userId},
									{assigned_captain: userId},
								]},
								{order_status: 	{$nin : [Constants.ORDER_DELIVERED, Constants.ORDER_REJECTED ] } },
								{$or : [
									{is_completed: {$ne 	 :true }},
									{is_completed: {$exists  :false }},
								]},
							]
						}).then(contResult=>{
							callback(null,contResult);
						}).catch(next);
					},
					allow_outshift : (callback)=>{
						if(type != Constants.OUT_SHIFT) return callback(null,false);

						/** Send response when admin mark force active */
						if(isForceActive || userSuspend) return callback(null,true);

						/** Set conditions */
						let availabilitiesConditions = {
							user_id	: userId,
							date	: {$gte: startDate, $lte: endDate}
						};

						if(checkPrevious) availabilitiesConditions.date = {$gte: prevStartDate, $lte: endDate};

						/** Check driver availabilities */
						this.driverAvailabilitiesDB.distinct("shift_id",availabilitiesConditions).then(shiftIds=>{
							if(shiftIds.length==0) return callback(null,false);

							/** Check driver shifts */
							let overtimeCt 	=	(overtimeHours) ? parseFloat(newDate(subtractDate(overtimeHours),Constants.SHIFT_TIME_FORMAT)) :currentTime;
							this.shiftDB.aggregate([
								{$match	: {
									_id	: {$in: arrayToObject(shiftIds) },
									is_deleted: {$ne: Constants.DELETED},
								}},
								{$addFields:{
									is_next_day : {$cond: [
										{$and: [
											{ $gt : ["$start_time","$end_time"] },
										]},
										true,
										false
									]},
								}},
								{$addFields:{
									is_matched : {$cond: [
										{$or :[
											{$and : [
												{ $eq  : ["$is_next_day",true] },
												{ $lte : ["$start_time",currentTime] },
												{ $lte : ["$end_time",currentTime] },
											]},
											{$and : [
												{ $eq  : ["$is_next_day",true] },
												{ $gte : ["$start_time", currentTime] },
												{ $gte : ["$end_time",currentTime] },
											]},
											{$and : [
												{ $gte : ["$end_time",currentTime] },
												{ $lte : ["$start_time",currentTime] },
											]}
										]},
										true,
										false
									]},
									is_overtime_matched : {$cond: [
										{$or :[
											{$and : [
												{ $eq  : ["$is_next_day",true] },
												{ $lte : ["$start_time",overtimeCt] },
												{ $lte : ["$end_time",overtimeCt] },
											]},
											{$and : [
												{ $eq  : ["$is_next_day",true] },
												{ $gte : ["$start_time", overtimeCt] },
												{ $gte : ["$end_time",overtimeCt] },
											]},
											{$and : [
												{ $gte : ["$end_time",overtimeCt] },
												{ $lte : ["$start_time",overtimeCt] },
											]}
										]},
										true,
										false
									]},
								}},
							]).toArray().then(shiftResult=>{
								if(shiftResult.length == 0) return  callback(null,false);

								let allowOutshift = true;
								shiftResult.map(shiftDetails=>{
									if(shiftDetails.is_matched || shiftDetails.is_overtime_matched){
										let tmpEndTime 		=	parseFloat(shiftDetails.end_time);
										let isNextDay		=	shiftDetails.is_next_day;
										let finalEndTime	=	convertIntoTimeFormat([tmpEndTime,overtimeHours]);

										if(finalEndTime >= Constants.HOURS_IN_A_DAY){
											isNextDay   	= 	true;
											finalEndTime	= 	finalEndTime-Constants.HOURS_IN_A_DAY;
										}

										if(!isNextDay && currentTime < finalEndTime) allowOutshift = false;
										if(isNextDay && finalEndTime < currentTime) allowOutshift = false;
									}
								});
								callback(null, allowOutshift);
							}).catch(next);
						}).catch(next);
					},
					force_active : (callback)=>{
						if(!isForceActive) return callback(null, false);

						/** Get in-shift detail in force active case */
						this.driverInOutShiftDB.findOne({
							driver_id :	userId,
							type 	  : Constants.IN_SHIFT,
							vehicle_id: vehicleId,
						},{projection: {created:1},sort:{created:Constants.SORT_DESC}}).then(findResult=>{
							let tmpCreated = (findResult) ? findResult.created :false;
							callback(null,tmpCreated);
						}).catch(next);
					},
				},(asyncErr, asyncResponse)=>{
					if(asyncErr) return next(asyncErr);

					/** Send error response */
					if(!asyncResponse.check_driver_shift && type == Constants.IN_SHIFT) return resolve({status: Constants.STATUS_ERROR, message: res.__("driver_shift.you_have_not_assigned_any_shift") });

					/** Send error response */
					if(type == Constants.OUT_SHIFT){
						if(!asyncResponse.allow_outshift) return resolve({status: Constants.STATUS_ERROR, message: res.__("driver_shift.not_allowed_to_untill_shift_closed")});

						if(asyncResponse.have_orders) return resolve({status: Constants.STATUS_ERROR, message: res.__("driver_shift.not_allowed_to_untill_closed_orders")});
					}

					let inOutStartDate 	=	(checkPrevious) ?	prevStartDate	:startDate;
					let inOutEndDate 	= 	endDate;
					if(isForceActive && asyncResponse.force_active){
						inOutStartDate 	= asyncResponse.force_active;
						inOutEndDate 	= asyncResponse.force_active;
					}

					/** For get driver shift details */
					this.driverInOutShiftDB.findOne({
						driver_id 	: 	userId,
						created		:	{$gte: inOutStartDate, $lte: inOutEndDate },
						type 		:	Constants.IN_SHIFT,
					},{projection: {_id: 1,km:1,start_km:1,type:1}}).then(driverShiftResult=>{

						/** Send error response */
						if(driverShiftResult  && type == Constants.IN_SHIFT)  return resolve({status: Constants.STATUS_ERROR, message: res.__("driver_shift.driver_shift_is_already_in_added")});
						if(!driverShiftResult && type == Constants.OUT_SHIFT) return resolve({status: Constants.STATUS_ERROR, message: res.__("driver_shift.you_have_not_taken_any_shift_yet")});

						if(type == Constants.OUT_SHIFT && driverShiftResult && driverShiftResult.start_km >= km) return resolve({status: Constants.STATUS_ERROR, message: res.__("driver_shift.please_enter_km_more_than_in_shift_km")});

						req.body.status = (type == Constants.IN_SHIFT) ? Constants.ONLINE : Constants.OFFLINE;
						this.updateOnlineOfflineStatus(req,res,next).then(response=>{
							if(response.status != Constants.STATUS_SUCCESS) return resolve(response);

							/** Set data */
							let updateData = {
								driver_id   : userId,
								type 		: type,
								km 			: km,
								vehicle_id 	: vehicleId,
								vehicle_type: vehicleType,
								modified	: getUtcDate()
							};

							if(type == Constants.IN_SHIFT){
								updateData.start_km 	= 	km;
								updateData.in_latitude 	= 	latitude;
								updateData.in_longitude =	longitude;
							}

							if(type == Constants.OUT_SHIFT){
								let startKm =  (driverShiftResult.start_km) ? driverShiftResult.start_km :0;

								updateData.total_km 		= 	km -  startKm;
								updateData.out_latitude 	= 	latitude;
								updateData.out_longitude 	=	longitude;
							}

							asyncParallel({
								driver_shift : (subCallback)=>{
									/** Update driver in out shifts details */
									this.driverInOutShiftDB.updateOne({
										driver_id: 	userId,
										type	 : 	Constants.IN_SHIFT,
										created	 :	{$gte: inOutStartDate, $lte: inOutEndDate}
									},
									{
										$set: updateData,
										$setOnInsert: {
											created : getUtcDate(),
										}
									},{upsert: true}).then(()=>{
										subCallback(null);
									}).catch(next);
								},
								update_driver_details : (subCallback)=>{
									if(type != Constants.IN_SHIFT) return subCallback(null);

									/** Mark unsuspend when driver mark in-shift*/
									this.userDB.updateOne({
										_id: userId
									},
									{
										$set: {
											is_suspend: Constants.UNSUSPEND
										},
										$unset: {
											is_highlight: 1
										},
									}).then(()=>{
										subCallback(null);
									}).catch(next);
								},
							},(asyncChildErr)=>{
								if(asyncChildErr) return next(asyncChildErr);

								/** Send success response **/
								return resolve({
									status	: Constants.STATUS_SUCCESS,
									message : (type == Constants.IN_SHIFT) ? res.__("driver_shifts.in_shift_has_been_added_successfully") : res.__("driver_shifts.out_shift_has_been_added_successfully")
								});
							});
						}).catch(next);
					}).catch(next);
				});
			});
		}).catch(next);
	}// end updateInOutShifts()

	/**
	 * Function to update online offline status
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	 **/
	async updateOnlineOfflineStatus (req,res,next){
		/** Sanitize Data **/
		req.body 	= sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
		let userId	= (req.body.user_id) ? new ObjectId(req.body.user_id) :"";
		let status	= (req.body.status)  ? req.body.status  		  :"";

		/** Send error response **/
		if(!userId || !status) return {status : Constants.STATUS_ERROR, message : res.__("system.missing_parameters")};

		/** Set driver conditions **/
		let userConditions = clone(Constants.DRIVER_COMMON_CONDITIONS);
		userConditions._id = userId;

		/** Find if user is not driver */
		let userResult = await this.userDB.findOne(userConditions,{projection: { _id:1}});

		/** Send error response **/
		if(!userResult) return {status : Constants.STATUS_ERROR, message : res.__("admin.system.invalid_access")};

		/** Update user online offline status */
		await this.userDB.updateOne({ _id : userId},{$set : {is_online : parseInt(status)}});

		/** Save user online offline logs **/
		this.saveOnlineOfflineLogs(req,res,next,{user_id: userId, status: status}).then({}).catch(next);

		/**Send success response */
		return {status: Constants.STATUS_SUCCESS, message: res.__("my_account.status_has_been_updated_successfully") };
	};// end updateOnlineOfflineStatus()

	/**
	 * Function to save online offline logs
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	 **/
	async saveOnlineOfflineLogs (req,res,next,options){
		let userId	= (options.user_id) ? options.user_id :"";
		let status	= (options.status)  ? options.status : "";

		/** Send error response **/
		if(!userId || !status) return {status: Constants.STATUS_ERROR, message: res.__("system.missing_parameters")};

		/** Find user online logs details **/
		let result = await this.userOnLineLogsDB.find({user_id : new ObjectId(userId)}).sort({_id : Constants.SORT_DESC}).limit(1).toArray();

		let lastLogDetails	= (result && result[0]) ? result[0] : null;
		let logId 			= (lastLogDetails && lastLogDetails._id) ? lastLogDetails._id : "";
		let updateRecordId	= new ObjectId();

		asyncParallel([
			callback=>{
				/** Update offline time if user is already online but api get same status again */
				if(status == Constants.ONLINE && lastLogDetails && lastLogDetails.offline_time == ""){
					this.userOnLineLogsDB.updateOne(
						{_id : new ObjectId(logId)},
						{$set: {offline_time : getUtcDate()}}
					).then(()=>{
						callback(null);
					}).catch(next);
				}else{
					callback(null);
				}
			},
			callback=>{
				let dataToBeUpdated = {};

				if(status == Constants.OFFLINE && lastLogDetails && lastLogDetails.offline_time == "" && logId){
					updateRecordId = logId;
					dataToBeUpdated.offline_time = getUtcDate();
				}

				if(status == Constants.ONLINE){
					dataToBeUpdated = {
						user_id		: new ObjectId(userId),
						online_time	: getUtcDate(),
						offline_time: ""
					};
				}

				if(Object.keys(dataToBeUpdated).length < 1) return callback(null,null);

				/** Update user online logs **/
				this.userOnLineLogsDB.updateOne({
					_id : new ObjectId(updateRecordId)
				},{$set: dataToBeUpdated},{upsert : true}).then(()=>{
					callback(null);
				}).catch(next);
			}
		],(err)=>{
			if(err) return next(err);

			return {status: Constants.STATUS_SUCCESS};
		});
	};// end saveOnlineOfflineLogs()

	/**
	 * Function to get in out shifts
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	**/
	async getInOutShifts (req,res,next){
		let userId  = (req.body.user_id) ? new ObjectId(req.body.user_id) : "";

		/** Send error response **/
		if(!userId) return {status : Constants.STATUS_ERROR, message : res.__("system.missing_parameters")};

		let currentTime		= 	parseFloat(newDate('',Constants.SHIFT_TIME_FORMAT));
		let prevStartDate 	=	newDate(subtractDate(Constants.HOURS_IN_A_DAY),Constants.CURRENTDATE_START_DATE_FORMAT);
		let prevEndDate 	=	newDate(subtractDate(Constants.HOURS_IN_A_DAY),Constants.CURRENTDATE_END_DATE_FORMAT);
		let startDate 		=	newDate("",Constants.CURRENTDATE_START_DATE_FORMAT);
		let endDate 		=	newDate("",Constants.CURRENTDATE_END_DATE_FORMAT);

		asyncParallel({
			check_previous : (callback)=>{
				this.driverInOutShiftDB.findOne({
					driver_id :	userId,
					type 	  : Constants.IN_SHIFT,
					created	  :	{
						$gte: newDate(prevStartDate),
						$lte: newDate(prevEndDate)
					}
				},{projection: {_id:1},sort:{created:Constants.SORT_DESC}}).then(findResult=>{
					if(!findResult) return callback(null,false);

					/** For get driver shift details */
					this.driverAvailabilitiesDB.distinct("shift_id",{
						user_id	: 	userId,
						date	: 	{$gte: newDate(prevStartDate), $lte: newDate(prevEndDate)}
					}).then(shiftIds=>{
						if(null || shiftIds.length==0) return callback(null,false);

						/** Check driver shifts */
						this.shiftDB.aggregate([
							{$match	: {
								_id	: {$in: arrayToObject(shiftIds) },
								is_deleted: {$ne: Constants.DELETED},
							}},
							{$addFields:{
								is_next_day : {$cond: [
									{$and: [
										{ $gt : ["$start_time","$end_time"] },
									]},
									true,
									false
								]},
							}},
							{$match	: {
								$or :[
									{$and : [
										{is_next_day: true },
										{start_time : {$lte: currentTime } },
										{end_time   : {$lte: currentTime } }
									]},
									{$and : [
										{is_next_day: true },
										{start_time : {$gte: currentTime } },
										{end_time   : {$gte: currentTime } }
									]},
									{$and : [
										{end_time 	: {$gte: currentTime } },
										{start_time : {$lte: currentTime } }
									]}
								]
							}},
						]).toArray().then(shiftResult=>{
							let shiftFlag = (shiftResult && shiftResult[0]) ? true : false;
							callback(shiftErr,shiftFlag);
						}).catch(next);
					}).catch(next);
				});
			},
			force_active : (callback)=>{
				/** Get driver details  */
				this.userDB.findOne({_id: userId},{projection: {force_active:1,vehicle_id:1}}).then(userResult=>{
					if(!userResult || userResult.force_active != Constants.FORCE_ACTIVE || !userResult.vehicle_id){
						return callback(null,false);
					}

					this.driverInOutShiftDB.findOne({
						driver_id :	userId,
						type 	  : Constants.IN_SHIFT,
						vehicle_id:	userResult.vehicle_id,
					},{projection: {created:1},sort:{created:Constants.SORT_DESC}}).then(findResult=>{
						if(!findResult) return callback(null,false);

						callback(null,findResult.created);
					}).catch(next);
				}).catch(next);
			},
		},(asyncErr, asyncRes)=>{
			if(asyncErr) return next(asyncErr);

			/** Set conditions */
			let inoutConditions = {
				driver_id :	userId,
				created	  :	{
					$gte: newDate(startDate),
					$lte: newDate(endDate)
				}
			};

			if(asyncRes.check_previous){
				inoutConditions.created = {$gte: newDate(prevStartDate), $lte: newDate(endDate) };
			}else if(asyncRes.force_active){
				inoutConditions.created = {$gte: newDate(asyncRes.force_active)};
			}

			/** For get driver shift details */
			this.driverInOutShiftDB.findOne(inoutConditions,{projection: { _id:1,driver_id:1,type:1,km:1,created:1,modified:1},sort:{created:Constants.SORT_DESC}}).then(findResult=>{

				/**Send success response */
				return {status	: Constants.STATUS_SUCCESS, result: findResult, asyncRes: asyncRes};
			}).catch(next);
		});
	}// end getInOutShifts()

	/**
	 * Function to save driver service details
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	**/
	async driverService (req,res,next){
		/** Sanitize Data **/
		req.body 			= sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
		let userId 			= (req.body.user_id) 			? 	new ObjectId(req.body.user_id) 		:"";
		let kilometers 		= (req.body.kilometers) 		? 	parseInt(req.body.kilometers) 	:"";
		let nextServiceDate = (req.body.next_service_date) 	?	req.body.next_service_date 		:"";

		/** Send error response **/
		if(!userId) return {status : Constants.STATUS_ERROR, message : res.__("system.missing_parameters")};

		/** Apply validation */
		let validationResponse = await applyValidationInterCallFunction(req, res, next, serviceValidation);
		if(validationResponse.status != Constants.STATUS_SUCCESS) return validationResponse;

		/** Insert driver service details */
		await this.driverServiceDB.insertOne({
			user_id 	  		: userId,
			kilometers	  		: kilometers,
			next_service_date	: getUtcDate(nextServiceDate+" "+Constants.START_DATE_TIME_FORMAT),
			created 	  		: getUtcDate()
		});

		/**Send success response */
		return {status: Constants.STATUS_SUCCESS, message: res.__("driver_break.driver_service_detail_has_been_added_successfully")};
	};// end driverService()

	/**
	 * Function to save driver fueling details
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	**/
	async driverFueling (req,res,next){
		/** Sanitize Data **/
		req.body 		= sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
		let userId 		= (req.body.user_id) ? new ObjectId(req.body.user_id) :"";
		let kilometers 	= (req.body.kilometers) ? parseInt(req.body.kilometers) :"";
		let amount   	= (req.body.amount) ? parseFloat(req.body.amount) :"";

		/** Send error response **/
		if(!userId) return {status : Constants.STATUS_ERROR, message : res.__("system.missing_parameters")};

		/** Apply validation */
		let validationResponse = await applyValidationInterCallFunction(req, res, next, fuelingValidation);
		if(validationResponse.status != Constants.STATUS_SUCCESS) return validationResponse;

		/** Insert driver fueling details */
		await this.driverFuelDB.insertOne({
			user_id 	: userId,
			kilometers	: kilometers,
			amount		: amount,
			created 	: getUtcDate()
		});

		/**Send success response */
		return {status: Constants.STATUS_SUCCESS, message: res.__("driver_break.driver_fueling_details_has_been_added_successfully")};
	};// end driverFueling()
};
