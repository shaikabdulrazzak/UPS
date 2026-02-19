import { ObjectId } from 'mongodb';
import * as Constants from "../../../../config/global_constant.mjs";
import Tables from '../../../../config/database_tables.mjs';
import { sanitizeData, newDate} from "../../../../utils/index.mjs";

export default class DriverOvertimeRequest {

    constructor(db) {
        this.db = db;
    }

	/**
	 * Function for get captain overtime request list
	 *
	 * @param req As Request Data
	 * @param res As Response Data
	 * @param next	As 	Callback argument to the middleware function
	 *
	 * @return render/json
	 */
	async getOvertimeRequestList(req, res,next){
		req.body 		 = sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
		let userId		 = (req.body.user_id)	? req.body.user_id		:"";
		let currentDate	 =	newDate("",Constants.DATABASE_DATE_FORMAT);
		let fromDate	 = 	newDate(currentDate+" "+Constants.START_DATE_TIME_FORMAT);
		let toDate 		 =  newDate(currentDate+" "+Constants.END_DATE_TIME_FORMAT);

		/** Send error response */
		if(!userId) return {status: Constants.STATUS_ERROR, message: res.__("system.missing_parameters")};

		/** Set conditions */
		let commonCondition	=	{
			user_id		:	new ObjectId(userId),
			request_date:	{ $gte: fromDate, $lte: toDate}
		};

		const captain_overtime_requests = this.db.collection(Tables.CAPTAIN_OVERTIME_REQUESTS);
		let result = await captain_overtime_requests.aggregate([
			{$match : commonCondition},
			{$lookup: {	/** Get TL details **/
				"from" 		  :	Tables.USERS,
				"localField"  :	"added_by",
				"foreignField":	"_id",
				"as" 		  :	"users_details"
			}},
			{$project : {
				request_date:1,purpose:1,hours:1,tl_name: {$arrayElemAt : ["$users_details.full_name",0]}
			}},
			{$sort: {_id: Constants.SORT_DESC}}
		]).toArray();

		if(result.length > 0){
			result.map(records=>{
				records.request_date = (records.request_date)  ? newDate(records.request_date,Constants.AM_PM_FORMAT_WITH_DATE) :"";
			});
		}

		/** Send response **/
		return {
			status : Constants.STATUS_SUCCESS,
			result : result
		};
	};//End getOvertimeRequestList()
}
