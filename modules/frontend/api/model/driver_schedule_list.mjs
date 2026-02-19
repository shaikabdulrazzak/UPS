import { ObjectId } from 'mongodb';
import * as Constants from "../../../../config/global_constant.mjs";
import Tables from '../../../../config/database_tables.mjs';
import { sanitizeData, addDate, getAttributes, set24HourFormat, newDate, getDateRange} from "../../../../utils/index.mjs";

export default class DriverScheduleList {
	constructor(db) {
		this.db = db;
	}

	/**
	 * Function to get driver schedule list
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 *
	 * @return render/json
	*/
	async getScheduleList (req,res,next){
		return new Promise(async resolve=>{
			try{
				/** Sanitize Data **/
				req.body 		= sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
				var fromDate	= newDate("",Constants.DATABASE_DATE_FORMAT);
				var toDate		= newDate(addDate(Constants.HOURS_IN_A_DAY*(Constants.DAYS_IN_A_WEEK-1)),Constants.DATABASE_DATE_FORMAT);
				let userId 	  	= req?.body?.user_id || "";

				/** Send error response */
				if(!userId) return resolve({status: Constants.STATUS_ERROR, message: res.__("system.missing_parameters")});

				/**call function for get driver shifts details */
				this.teamAvailabilitiesDetails(req,res,next,{from_date: fromDate,to_date: toDate, user_id: userId}).then(response=>{
					if(response.status != Constants.STATUS_SUCCESS) return resolve({status: Constants.STATUS_ERROR, message: res.__("system.invalid_access") });

					/** Send success response */
					resolve({status: Constants.STATUS_SUCCESS, result: Object.values(response.shift_availablity) });
				}).catch(next);
			}catch(err){
				return next(err);
			}
		});
	}// End getScheduleList

	/**
	 * Function to get shifts detail
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next 	As Callback argument to the middleware function
	 *
	 * @return json
	*/
	async teamAvailabilitiesDetails (req,res,next,options){
		return new Promise(async resolve=>{
			try{
				let fromDate  =  newDate(options.from_date+" "+Constants.START_DATE_TIME_FORMAT);
				let toDate 	  =  newDate(options.to_date+" "+Constants.END_DATE_TIME_FORMAT);
				let userId 	  =  options?.user_id || '';

				/** Get leave type list **/
				let leaveTypeList = await getAttributes(req,res,next,{type: "vacation_leave_type"});
				let leaveTypeObj = {};
				if(leaveTypeList.length >0){
					leaveTypeList.map(records=>{
						leaveTypeObj[String(records.attribute_id)] = records.title;
					});
				}

				let commonConditions = {
					date	: { $gte: fromDate, $lte: toDate},
					user_id : 	new ObjectId(userId),
					$or 	:	[
						{shift_id	: {$ne : ""}},
						{leave_type : {$exists :true}, leave_status: Constants.APPROVED }
					]
				};

				const driver_availabilities = this.db.collection(Tables.DRIVER_AVAILABILITIES);
				let teamResult = await  driver_availabilities.aggregate([
					{$match:  {
						date	: { $gte: fromDate, $lte: toDate},
						user_id : 	new ObjectId(userId),
						$or 	:	[
							{shift_id	: {$ne : ""}},
							{leave_type : {$exists :true}, leave_status: Constants.APPROVED }
						]
					}},
					{$lookup: {
						from		: Tables.CITIES,
						localField	: "city_id",
						foreignField: "_id",
						as			: "city_details",
					}},
					{$lookup: {
						from		: Tables.AREAS,
						localField	: "area_id",
						foreignField: "_id",
						as			: "area_details",
					}},
					{$lookup: {
						from		: Tables.SHIFTS,
						localField	: "shift_id",
						foreignField: "_id",
						as			: "shift_details",
					}},
					{$project: {
						_id:1,date:1,shift_id:1,user_id:1,city_id:1,area_id:1,leave_type:1,leave_status:1,						
						shift_name: {$arrayElemAt:["$shift_details.shift_name", 0] },
						start_time: {$arrayElemAt:["$shift_details.start_time", 0] },
						end_time  : {$arrayElemAt:["$shift_details.end_time", 0] },
						area_name : {$arrayElemAt:["$area_details.name", 0] },
						city_name : {$arrayElemAt:["$city_details.name", 0] },
					}},
					{$sort: {
						date: Constants.SORT_ASC,
						start_time: Constants.SORT_ASC
					}},
				]).toArray()

				if(teamResult?.length){
					teamResult.map(record=>{
						record.start_time =	(record.start_time) ? set24HourFormat(record.start_time) :"";
						record.end_time   =	(record.end_time) 	? set24HourFormat(record.end_time) 	 :"";
					});
				}				

				let dates  		= 	getDateRange(new Date(fromDate),new Date(toDate));
				let userShifts	= 	[];
				let result 		=	[];
				dates.forEach(shiftDate=>{
					let date = newDate(shiftDate,Constants.DATABASE_DATE_FORMAT);
					
					let leaveDates = {};
					teamResult.forEach(shiftTime=>{
						let leaveType 	=	shiftTime?.leave_type || "";
						let leaveStatus =	shiftTime?.leave_status || "";
						let dbDate 		=	newDate(shiftTime.date,Constants.DATABASE_DATE_FORMAT);
						let isLeave 	=	(leaveType && leaveStatus == Constants.APPROVED) ? true :false;

						if(date == dbDate && !leaveDates[dbDate]){
							if(isLeave) leaveDates[dbDate] = true;
							if(!userShifts[dbDate]) userShifts[dbDate] = [];

							userShifts[dbDate].push({
								date 	   : shiftTime?.date || date,
								shift_name : shiftTime?.shift_name || "",
								start_time : shiftTime?.start_time || "",
								end_time   : shiftTime?.end_time || "",
								leave_type : isLeave && leaveTypeObj?.[String(leaveType)] ||"",
								city 	   : shiftTime?.city_name || "",
								area 	   : shiftTime?.area_name || "",
							});

							result[dbDate] 				=	{dbDate};
							result[dbDate].shift_list 	= 	userShifts[dbDate];
						}
					});
				});

				/** Send success response **/
				resolve({ status: Constants.STATUS_SUCCESS, shift_availablity : result });				
			}catch(err){
				return next(err);
			}
		}).catch(next);
	};// End teamAvailabilitiesDetails()
}
