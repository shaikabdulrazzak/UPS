import { ObjectId } from 'mongodb';
import clone from 'clone';
// import odbc from 'odbc';
import { parallel as asyncParallel, eachOfSeries, each as asyncEach, forEachOf as asyncForEachOf} from 'async';
import * as Constants from "../../../../config/global_constant.mjs";
import Tables from '../../../../config/database_tables.mjs';
import * as Helper from "../../../../utils/index.mjs";

/**
 * Class to handle report cron jobs
 */
export default class ReportCron {
    constructor(db) {
        this.db = db;       
    }  

	/**
	 * Function to get report of customer order value
	 *
	 * @param req 	As	 Request Data
	 * @param res 	As	Response Data
	 * @param next	As 	Callback argument to the middleware function
	 *
	 * @return render null
	 */
	async getReportCustomerOrderValue (req, res,next){
		try {
			/** Send response to client and work in background */
			res.render('blank',{layout:false});
			
			let days = (req.params.days) ? parseInt(req.params.days) :"";
			if(days <=0 || isNaN(days)) days = Constants.CUSTOMER_ORDER_REPORT_DAYS;

			let hoursInADay =  days*Constants.HOURS_IN_A_DAY;
			let fromDate	=  Helper.newDate(Helper.subtractDate(hoursInADay));
			let toDate      =  Helper.newDate(Helper.newDate("",Constants.CURRENTDATE_START_DATE_FORMAT));
			let dates  		=  Helper.getDateRange(fromDate,toDate);

			const orders    	  =  this.db.collection(Tables.ORDERS);
			const customer_orders =  this.db.collection(Tables.CUSTOMER_ORDERS);
			asyncEach(dates, (date, parentCallback)=> {
				let tempToDate  = 	Helper.newDate(date,Constants.DATABASE_DATE_FORMAT);
				let tempFromDate= 	Helper.newDate(date,Constants.DATABASE_DATE_FORMAT);
				tempToDate  	=	Helper.newDate(tempToDate+" "+Constants.END_DATE_TIME_FORMAT);
				tempFromDate  	=	Helper.newDate(tempFromDate+" "+Constants.START_DATE_TIME_FORMAT);

				/** Get customer orders */
				orders.aggregate([
					{$match :  {
						order_date 		:	{$gte: tempFromDate, $lte: tempToDate },
						customer_id 	:	{$exists: true, $nin:[null,""]},
						is_completed 	:	true,
					}},
					{$lookup:	{
						"from" 			: 	Tables.ORDER_DETAILS,
						"localField" 	:	"_id",
						"foreignField" 	: 	"order_id",
						"as" 			: 	"order_detail"
					}},
					{$addFields:	{
						delivery_area_id: {$arrayElemAt: ["$order_detail.delivery_area_id",0]}
					}},
					{$group	: {
						_id :  {
							restaurant_id   : "$restaurant_id",
							branch_id       : "$branch_id",
							delivery_area_id: "$delivery_area_id",
							customer_id     :  "$customer_id",
						},
						restaurant_id 		:	{$first : "$restaurant_id"},
						branch_id      	 	:	{$first : "$branch_id"},
						delivery_area_id	: 	{$first : "$delivery_area_id"},
						area_id				: 	{$first : "$area_id"},
						total_orders    	:   {$sum   : 1},
						total_order_amount	:  	{$sum   : "$order_price"},
						total_net_amount	:	{$sum   : "$net_amount"},
						customer_id     	: 	{$first : "$customer_id"},
					}},
				]).toArray().then(result=>{
					if(result?.length <=0) return parentCallback(null);

					asyncEach(result, (records, eachCallback)=> {
						
						/** Insert customer orders */
						customer_orders.insertOne({
							restaurant_id 	  	: 	records.restaurant_id,
							branch_id     	  	: 	records.branch_id,
							delivery_area_id  	: 	records.delivery_area_id,
							area_id     	  	: 	records.area_id,
							customer_id       	: 	records.customer_id,
							total_orders      	: 	records.total_orders,
							total_order_amount 	: 	Helper.round(records.total_order_amount),
							total_net_amount 	: 	Helper.round(records.total_net_amount),
							date              	:	Helper.getUtcDate(tempFromDate),
							created             :	Helper.getUtcDate()
						}).then(()=>{
							eachCallback(null);
						}).catch(err=>{
							eachCallback(err);
						});
					},(childEachErr)=>{
						parentCallback(childEachErr);
					});
				}).catch(err=>{
					parentCallback(err);
				});
			},(eachErr)=> {
				if(eachErr){
					console.error("Error in getReportCustomerOrderValue");
					return console.error(eachErr);
				}
			});
		} catch (error) {
			console.error("Catch error in getReportCustomerOrderValue",error);
		}
	};//End getReportCustomerOrderValue()

	/**
	 * Function to migrate agent performance stats
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 * Cron Hit once in a day and get one day before data
	 * @return render
	 */
	async agentPerformance (req, res, next){
		try {
			/** Send response to client and work in background */
			res.render('blank',{layout:false});
			
			let date = Helper.subtractDate(Constants.HOURS_IN_A_DAY);
			let startDate	=	Helper.newDate(date,Constants.DATABASE_DATE_FORMAT+" "+Constants.START_DATE_TIME_FORMAT);
			let endDate		=	Helper.newDate(date,Constants.DATABASE_DATE_FORMAT+" "+Constants.END_DATE_TIME_FORMAT);
			let options		=	{
				start_date	:	startDate,
				end_date	:	endDate
			};
			asyncParallel({
				performance_stat :(parentCallback)=>{
					this.agentPerformanceStats(req,res,next,options);
					parentCallback(null);
				},
				activity_stat :(parentCallback)=>{
					this.agentActivityStats(req,res,next,options);
					parentCallback(null);
				},
				login_stat :(parentCallback)=>{
					this.agentLoginStats(req,res,next,options);
					parentCallback(null);
				},
				shift_stat :(parentCallback)=>{
					this.agentShiftsStats(req,res,next,options);
					parentCallback(null);
				},
			},(parentAsyncError)=>{
				if(parentAsyncError){
					console.error("Error in agentPerformance",parentAsyncError);
				}
			});
		} catch (error) {
			console.error("Catch error in agentPerformance",error);
		}
	}; //end agentPerformance 

	/**
	 * Function to calculate agent performance stats like offered/answered/outbound/abandoned/conformance/aht
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 *
	 * @return render
	 */
	async agentPerformanceStats (req, res, next,options){
		try {
			let startDate 	=	options.start_date;
			let endDate 	= 	options.end_date;
			const iAgentPerformanceStat	=	this.db.collection(Tables.IAGENTPERFORMANCESTAT);
			iAgentPerformanceStat.aggregate([
				{ $match : { Timestamp		:	{$gte: startDate, $lte: endDate}}},
				{ $addFields: {
					convertedOffered: { $convert: { input: "$CallsOffered", to: "int" } },
					convertedAnswered: { $convert: { input: "$CallsAnswered", to: "int" } },
					convertedDNInExtCalls: { $convert: { input: "$DNInExtCalls", to: "int" } },
					convertedDNInIntCalls: { $convert: { input: "$DNInIntCalls", to: "int" } },
					convertedDNOutExtCalls: { $convert: { input: "$DNOutExtCalls", to: "int" } },
					convertedDNOutIntCalls: { $convert: { input: "$DNOutIntCalls", to: "int" } },
					convertedCallsReturnedToQDueToTimeout: { $convert: { input: "$CallsReturnedToQDueToTimeout", to: "int" } },
					convertedTalkTime: { $convert: { input: "$TalkTime", to: "int" } },
					convertedLoggedInTime: { $convert: { input: "$LoggedInTime", to: "int" } },
				}},
				{ $group	:	{
					_id		:	"$AgentLogin",
					CallsOffered:	{$sum : "$convertedOffered"},
					CallsAnswered:	{$sum : "$convertedAnswered"},
					DNInExtCalls:	{$sum : "$convertedDNInExtCalls"},
					DNInIntCalls:	{$sum : "$convertedDNInIntCalls"},
					DNOutExtCalls:	{$sum : "$convertedDNOutExtCalls"},
					DNOutIntCalls:	{$sum : "$convertedDNOutIntCalls"},
					CallsReturnedToQDueToTimeout:	{$sum : "$CallsReturnedToQDueToTimeout"},
					LoggedInTime:	{$sum : "$convertedLoggedInTime"},
					AgentGivenName:	{$first: "$AgentGivenName"},
					AgentSurName:	{$first: "$AgentSurName"},
					Timestamp	:	{$first: "$Timestamp"},
					TalkTime	:	{$sum : "$convertedTalkTime"},
				}},
			]).toArray().then(result=>{
				if(result && result.length > 0){
					asyncEach(result,(data, asyncEachCallback)=>{
						let agentName	=	data?.AgentGivenName+' '+data?.AgentSurName;
						asyncParallel({
							offered :(callback)=>{
								const avaya_offered	=	this.db.collection(Tables.AVAYA_OFFERED);
								avaya_offered.insertOne({
									agent_name 		: agentName,
									code 			: data._id,
									date			: Helper.getUtcDate(data.Timestamp),
									count 			: data.CallsOffered,
									created			: Helper.getUtcDate()
								}).then(()=>{
									callback(null);
								}).catch(err=>{
									callback(err);
								});
								callback(null);
							},
							answered :(callback)=>{
								const avaya_answered	=	this.db.collection(Tables.AVAYA_ANSWERED);
								avaya_answered.insertOne({
									agent_name 		: agentName,
									code 			: data._id,
									date			: Helper.getUtcDate(data.Timestamp),
									count 			: data.CallsAnswered,
									created			: Helper.getUtcDate()
								}).then(()=>{
									callback(null);
								}).catch(err=>{
									callback(err);
								});
							},
							outbound :(callback)=>{
								let dnOutboundCalls	=	data.DNInExtCalls + data.DNInIntCalls + data.DNOutExtCalls + data.DNOutIntCalls;
								const avaya_outbound	=	this.db.collection(Tables.AVAYA_OUTBOUND);
								avaya_outbound.insertOne({
									agent_name 		: agentName,
									code 			: data._id,
									date			: Helper.getUtcDate(data.Timestamp),
									count 			: dnOutboundCalls,
									created			: Helper.getUtcDate()
								}).then(()=>{
									callback(null);
								}).catch(err=>{
									callback(err);
								});
							},
							abandoned :(callback)=>{
								const avaya_abandoned	=	this.db.collection(Tables.AVAYA_ABANDONED);
								avaya_abandoned.insertOne({
									agent_name 		: agentName,
									code 			: data._id,
									date			: Helper.getUtcDate(data.Timestamp),
									count 			: data.CallsReturnedToQDueToTimeout,
									created			: Helper.getUtcDate()
								}).then(()=>{
									callback(null);
								}).catch(err=>{
									callback(err);
								});
							},
							conformance :(callback)=>{
								const avaya_conformance	=	this.db.collection(Tables.AVAYA_CONFORMANCE);
								avaya_conformance.insertOne({
									agent_name 		: agentName,
									code 			: data._id,
									date			: Helper.getUtcDate(data.Timestamp),
									time			: Helper.convertSecondsToTimeFormat(data.LoggedInTime,Constants.AVAYA_TIME_FORMAT),
									created			: Helper.getUtcDate()
								}).then(()=>{
									callback(null);
								}).catch(err=>{
									callback(err);
								});
							},
							aht :(callback)=>{
								const avaya_aht	=	this.db.collection(Tables.AVAYA_AHT);
								avaya_aht.insertOne({
									agent_name 		: agentName,
									code 			: data._id,
									date			: Helper.getUtcDate(data.Timestamp),
									time			: (data.TalkTime) ? Helper.convertSecondsToTimeFormat(data.TalkTime / data.CallsAnswered,Constants.AVAYA_TIME_FORMAT) : '',
									talk_time		: data.TalkTime,
									calls_answered	: data.CallsAnswered,
									created			: Helper.getUtcDate()
								}).then(()=>{
									callback(null);
								}).catch(err=>{
									callback(err);
								});
							},
						},(asyncError)=>{
							asyncEachCallback(asyncError);
						});
					},(asyncErr)=>{
						if(asyncErr){
							console.error("Error in asyncEach of series at agentPerformanceStats",asyncErr);
						}
					});
				}
			}).catch(err=>{
				console.error("Error in agentPerformanceStats",err);
			});

			return {status: Constants.STATUS_SUCCESS};
		} catch (error) {
			console.error("Catch error in agentPerformanceStats",error);
		}
	}; //end agentPerformanceStats

	/**
	 * Function to calculate agent activity stats like NR
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 *
	 * @return render
	 */
	async agentActivityStats (req, res, next,options){
		try {
			let startDate 	=	options.start_date;
			let endDate 	= 	options.end_date;
			const iActivityCodeStat	=	this.db.collection(Tables.IACTIVITYCODESTAT);
			iActivityCodeStat.aggregate([
				{ $match : {
					Timestamp			:	{$gte: startDate, $lte: endDate},
					$or: [
						{ActivityCodeName : "Short Break"},
						{ActivityCodeName : "Not_Ready_Default_Reason_Code"}
					]
				}},
				{ $addFields: {
					convertedActivityTime: { $convert: { input: "$ActivityTime", to: "int" } },
				}},
				{ $group	:	{
					_id		:	"$AgentLogin",
					ActivityTime:	{$sum : "$convertedActivityTime"},
					AgentGivenName:	{$first: "$AgentGivenName"},
					AgentSurName:	{$first: "$AgentSurName"},
					Timestamp	:	{$first: "$Timestamp"},
				}},
			]).toArray().then(result=>{

				if(result && result.length > 0){
					asyncEach(result,(data, asyncEachCallback)=>{
						let agentName	=	data?.AgentGivenName+' '+data?.AgentSurName;

						const avaya_nr	=	this.db.collection(Tables.AVAYA_NR);
						avaya_nr.insertOne({
							agent_name 		: agentName,
							code 			: data._id,
							date			: Helper.getUtcDate(data.Timestamp),
							time			: Helper.convertSecondsToTimeFormat(data.ActivityTime,Constants.AVAYA_TIME_FORMAT),
							created			: Helper.getUtcDate()
						}).then(()=>{
							asyncEachCallback(null);
						}).catch(()=>{
							asyncEachCallback(null);
						});
					},(asyncErr)=>{
						if(asyncErr){
							console.error("Error in asyncEach of series at agentActivityStats",asyncErr);
						}
					});
				}
			}).catch(err=>{
				console.error("Error in agentActivityStats",err);
			});
			
			return {status: Constants.STATUS_SUCCESS};
		} catch (error) {
			console.error("Catch error in agentActivityStats",error);
		}
	}; //end agentActivityStats

	/**
	 * Function to calculate agent login stats like login_time/tardiness/
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 *
	 * @return render
	 */
	async agentLoginStats (req, res, next,options){
		try {
			let startDate 	=	options.start_date;
			let endDate 	= 	options.end_date;
			const eAgentLoginStat	=	this.db.collection(Tables.EAGENTLOGINSTAT);
			eAgentLoginStat.aggregate([
				{ $match : { Timestamp:	{$gte: startDate, $lte: endDate}}},
				{ $group	:	{
					_id		:	"$AgentLogin",
					Time	:	{$first : "$Time"},
					AgentGivenName:	{$first: "$AgentGivenName"},
					AgentSurName:	{$first: "$AgentSurName"},
					Timestamp	:	{$first: "$Timestamp"},
				}},
			]).toArray().then(result=>{
				if(result && result.length > 0){
					asyncEach(result,(data, asyncEachCallback)=>{
						let agentName	=	data?.AgentGivenName+' '+data?.AgentSurName;
						asyncParallel({
							login_time :(callback)=>{
								const avaya_login_time	=	this.db.collection(Tables.AVAYA_LOGIN_TIME);
								avaya_login_time.insertOne({
									agent_name 		: agentName,
									code 			: data._id,
									date			: Helper.getUtcDate(data.Timestamp),
									time			: data.Time,
									created			: Helper.getUtcDate()
								}).then(()=>{}).catch(()=>{});
								callback(null);
							},
							tardiness :(callback)=>{
								const users	=	this.db.collection(Tables.USERS);
								users.aggregate([
									{$match : { code : data._id}},
									{$lookup:	{
										from     : Tables.TEAM_AVAILABILITIES,
										let      : {userId : "$_id"},
										pipeline : [
											{$match : {
												$expr: {
													$and : [
														{$eq: ["$user_id", "$$userId"]},
														{$gte: ["$date", Helper.getUtcDate(startDate)]},
														{$lte: ["$date", Helper.getUtcDate(endDate)]},
													]
												}
											}},
										],
										as:	"shift_detail"
									}},
									{ $project : {_id:1,shift_id: {$arrayElemAt: ["$shift_detail.shift_id",0]} }}
								]).toArray().then(tardResult=>{

									let shiftId	=	(tardResult[0] && tardResult[0].shift_id) ? tardResult[0].shift_id : '';
									if(shiftId){
										const shifts	=	this.db.collection(Tables.SHIFTS);
										shifts.findOne({
											_id : 	new ObjectId(shiftId),
										},{projection:{start_time:1}}).then(shiftResult=>{

											let shiftStartTime	=	(shiftResult && shiftResult.start_time) ? shiftResult.start_time : '';
											if (shiftStartTime && shiftStartTime.toString().indexOf('.') != -1){
												shiftStartTime	=	String(shiftStartTime).replace(".",":")+':00';
											}else{
												shiftStartTime	=	shiftStartTime+':00:00';
											}
											shiftStartTime		=	Helper.newDate(Helper.newDate(startDate,Constants.DATABASE_DATE_FORMAT)+' '+shiftStartTime);
											let loginTime		=	Helper.newDate(Helper.newDate(startDate,Constants.DATABASE_DATE_FORMAT)+' '+data.Time);
											let tardMints		=	0;

											if(loginTime > shiftStartTime){
												tardMints	=	Helper.getDifferenceBetweenTwoDatesInMinute(shiftStartTime,loginTime);
												const avaya_tardiness	=	this.db.collection(Tables.AVAYA_TARDINESS);
												avaya_tardiness.insertOne({
													agent_name 		: agentName,
													code 			: data._id,
													date			: Helper.getUtcDate(data.Timestamp),
													time			: Helper.convertSecondsToTimeFormat(tardMints * Constants.SECONDS_IN_A_MINUTE,Constants.AVAYA_TIME_FORMAT),
													created			: Helper.getUtcDate()
												}).then(()=>{}).catch(()=>{});
											}
											callback(null);
										});
									}else{
										callback(null);
									}
								});
							},							
						},(asyncError)=>{
							asyncEachCallback(asyncError);
						});
					},(asyncErr)=>{
						if(asyncErr){
							console.error("Error in asyncEach of series at agentLoginStats",asyncErr);
						}
					});
				}
			}).catch(err=>{
				console.error("Error in agentLoginStats",err);
			});

			return {status: Constants.STATUS_SUCCESS};
		} catch (error) {
			console.error("Catch error in agentLoginStats",error);
		}
	}; //end agentLoginStats

	/**
	 * Function to calculate agent shift stats like shift_detail
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 *
	 * @return render
	 */
	async agentShiftsStats (req, res, next,options){
		try {
			let startDate 	=	options.start_date;
			let endDate 	= 	options.end_date;
			let teamConditions 		 =  clone(Constants.ADMIN_USER_COMMON_CONDITIONS);
			teamConditions.team_head = false;
			teamConditions.parent_id = { $exists: true ,$ne : "" };
			
			const users		=	this.db.collection(Tables.USERS);
			users.find(teamConditions,{projection : { _id:1,full_name:1,code:1}}).toArray().then(userResult=>{
				if(userResult.length > 0){
					asyncEach(userResult,(data, asyncEachCallback)=>{
						let userName	=	(data.full_name) ? data.full_name : '';
						let code		=	(data.code) 	 ? data.code 	  : '';
						const team_availabilities	=	this.db.collection(Tables.TEAM_AVAILABILITIES);
						team_availabilities.findOne({
							user_id	:	data._id,
							date	:	{$gte : Helper.getUtcDate(startDate), $lte : Helper.getUtcDate(endDate)}
						},{
							projection : { shift_id:1, leave_type:1}
						}).then(result=>{
							if(!result) return asyncEachCallback(null,{});
							
							let shiftId 	= (result?.shift_id) ? result?.shift_id : '';
							let leaveType	= (result?.leave_type) ? result?.leave_type : '';
							asyncParallel({
								shift_detail :(callback)=>{
									if(!shiftId) return callback(null,{});
									
									const shifts	=	this.db.collection(Tables.SHIFTS);
									shifts.findOne({
										_id	:	shiftId,
									},{
										projection : { start_time:1 }
									}).then(shiftResult=>{
										callback(null,shiftResult);
									}).catch(err=>{
										callback(err,{});
									});
								},
							},(childAsyncError, childAsyncResponse)=>{
								if(childAsyncError) return asyncEachCallback(childAsyncError);

								let shiftDetails	=	(childAsyncResponse.shift_detail) ? childAsyncResponse.shift_detail : {};
								let startTime		=	(shiftDetails.start_time) ? shiftDetails.start_time : '';
								if (startTime){
									if(startTime.toString().indexOf('.') != -1){
										startTime	=	String(startTime).replace(".",":")+':00';
									}else{
										startTime	=	startTime+':00:00';
									}
								}
								let dataToInsert	=	{
									agent_name 		: userName,
									code 			: code,
									date			: Helper.getUtcDate(startDate),
									created			: Helper.getUtcDate()
								};
								if(startTime) dataToInsert['time']			=	startTime;
								if(leaveType) dataToInsert['leave_type']	=	leaveType;
								
								const avaya_shift	=	this.db.collection(Tables.AVAYA_SHIFT);
								avaya_shift.insertOne(dataToInsert).then(()=>{}).catch(()=>{});
								asyncEachCallback(null);
							});
						});
					},(asyncError)=>{
						if(asyncError){
							console.error("Error in asyncEach of series at agentShiftsStats",asyncError);
						}
					});
				}
			}).catch(err=>{
				console.error("Error in agentShiftsStats",err);
			});

			return {status: Constants.STATUS_SUCCESS};
		} catch (error) {
			console.error("Catch error in agentShiftsStats",error);
		}
	}; // End agentShiftsStats

	/**
	 * Function to calculate agent date wise report
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 *
	 * @return render
	 */
	async calculateDailyStats (req, res, next,options){
		try {
			let date 		=	(req.params.date) 	? 	req.params.date 	:"";
			let startDate 	=	Helper.newDate(date,Constants.DATABASE_DATE_FORMAT+" "+Constants.START_DATE_TIME_FORMAT);
			let endDate 	= 	Helper.newDate(date,Constants.DATABASE_DATE_FORMAT+" "+Constants.END_DATE_TIME_FORMAT);
			const iAgentPerformanceStat	=	this.db.collection(Tables.IACTIVITYCODESTAT);
			iAgentPerformanceStat.aggregate([
				{$match : {
					Timestamp		:	{$gte: startDate, $lte: endDate}}
				},
				{ $group	:	{
					_id		:	"$AgentLogin",
					AgentGivenName:	{$first: "$AgentGivenName"},
					AgentSurName:	{$first: "$AgentSurName"},
				}},
			]).toArray().then(result=>{

				let finalArray	=	[];
				let loginIds	=	[];
				if(result.length > 0){
					result.map(records=>{
						loginIds.push(records._id)
					});
				}
				asyncParallel({
					offered: (callback)=>{
						/** Get offered counts */
						const avaya_offered = this.db.collection(Tables.AVAYA_OFFERED);
						avaya_offered.find({code : {$in : loginIds},date : {$gte: Helper.getUtcDate(startDate), $lte: Helper.getUtcDate(endDate)}},{projection : {code: 1,count: 1}}).toArray().then(offeredResult=>{
							let offeredList = {};
							offeredResult.map(data=>{
								offeredList[data.code] = data.count;
							});
							callback(null,offeredList);
						}).catch(err=>{
							callback(err,{});
						});
					},
					answered: (callback)=>{
						/** Get answered counts */
						const avaya_answered = this.db.collection(Tables.AVAYA_ANSWERED);
						avaya_answered.find({code : {$in : loginIds},date : {$gte: Helper.getUtcDate(startDate), $lte: Helper.getUtcDate(endDate)}},{projection : {code: 1,count: 1}}).toArray().then(answeredResult=>{
							let answeredList = {};
							answeredResult.map(data=>{
								answeredList[data.code] = data.count;
							});
							callback(null,answeredList);
						}).catch(err=>{
							callback(err,{});
						});
					},
					abandoned: (callback)=>{
						/** Get abandoned counts */
						const avaya_abandoned = this.db.collection(Tables.AVAYA_ABANDONED);
						avaya_abandoned.find({code : {$in : loginIds},date : {$gte: Helper.getUtcDate(startDate), $lte: Helper.getUtcDate(endDate)}},{projection : {code: 1,count: 1}}).toArray().then(abandonedResult=>{
							let abandonedList = {};
							abandonedResult.map(data=>{
								abandonedList[data.code] = data.count;
							});
							callback(null,abandonedList);
						}).catch(err=>{
							callback(err,{});
						});
					},
					outbound: (callback)=>{
						/** Get outbound counts */
						const avaya_outbound = this.db.collection(Tables.AVAYA_OUTBOUND);
						avaya_outbound.find({code : {$in : loginIds},date : {$gte: Helper.getUtcDate(startDate), $lte : Helper.getUtcDate(endDate)}},{projection : {code: 1,count: 1}}).toArray().then(outboundResult=>{
							let outboundList = {};
							outboundResult.map(data=>{
								outboundList[data.code] = data.count;
							});
							callback(null,outboundList);
						}).catch(err=>{
							callback(err,{});
						});
					},
					aht: (callback)=>{
						/** Get aht time */
						const avaya_aht = this.db.collection(Tables.AVAYA_AHT);
						avaya_aht.find({code : {$in : loginIds},date : {$gte: Helper.getUtcDate(startDate), $lte: Helper.getUtcDate(endDate)}},{projection : {code: 1,time: 1}}).toArray().then(ahtResult=>{
							let ahtList = {};
							ahtResult.map(data=>{
								ahtList[data.code] = data.time;
							});
							callback(null,ahtList);
						}).catch(err=>{
							callback(err,{});
						});
					},
					conformance: (callback)=>{
						/** Get conformance time */
						const avaya_conformance = this.db.collection(Tables.AVAYA_CONFORMANCE);
						avaya_conformance.find({code : {$in : loginIds},date : {$gte: Helper.getUtcDate(startDate), $lte: Helper.getUtcDate(endDate)}},{projection : {code: 1,time: 1}}).toArray().then(conformanceResult=>{
							let conformanceList = {};
							conformanceResult.map(data=>{
								conformanceList[data.code] = data.time;
							});
							callback(null,conformanceList);
						}).catch(err=>{
							callback(err,{});
						});
					},
					shift: (callback)=>{
						/** Get shift time/leave type */
						const avaya_shift = this.db.collection(Tables.AVAYA_SHIFT);
						avaya_shift.find({code : {$in : loginIds},date : {$gte: Helper.getUtcDate(startDate), $lte: Helper.getUtcDate(endDate)}},{projection : {code: 1,time: 1,leave_type:1}}).toArray().then(shiftResult=>{
							let shiftList = {};
							shiftResult.map(data=>{
								if(data.time) shiftList[data.code] = data.time;
								if(data.leave_type) shiftList[data.code] = data.leave_type;
							});
							callback(null,shiftList);
						}).catch(err=>{
							callback(err,{});
						});
					},
					login: (callback)=>{
						/** Get login time  */
						const avaya_login_time = this.db.collection(Tables.AVAYA_LOGIN_TIME);
						avaya_login_time.find({code : {$in : loginIds},date : {$gte: Helper.getUtcDate(startDate), $lte: Helper.getUtcDate(endDate)}},{projection : {code: 1,time: 1}}).toArray().then(loginResult=>{
							let loginList = {};
							loginResult.map(data=>{
								loginList[data.code] = data.time;
							});
							callback(null,loginList);
						}).catch(err=>{
							callback(err,{});
						});
					},
					tardiness: (callback)=>{
						/** Get tardiness time  */
						const avaya_tardiness = this.db.collection(Tables.AVAYA_TARDINESS);
						avaya_tardiness.find({code : {$in : loginIds},date : {$gte: Helper.getUtcDate(startDate), $lte: Helper.getUtcDate(endDate)}},{projection : {code: 1,time: 1}}).toArray().then(tardinessResult=>{
							let tardinessList = {};
							tardinessResult.map(data=>{
								tardinessList[data.code] = data.time;
							});
							callback(null,tardinessList);
						}).catch(err=>{
							callback(err,{});
						});
					},
					nr: (callback)=>{
						/** Get nr time  */
						const avaya_nr = this.db.collection(Tables.AVAYA_NR);
						avaya_nr.find({code : {$in : loginIds},date : {$gte: Helper.getUtcDate(startDate), $lte: Helper.getUtcDate(endDate)}},{projection : {code: 1,time: 1}}).toArray().then(nrResult=>{
							let nrList = {};
							nrResult.map(data=>{
								nrList[data.code] = data.time;
							});
							callback(null,nrList);
						}).catch(err=>{
							callback(err,{});
						});
					},
				},(asyncError, asyncResponse)=>{
					if(asyncError) {
						console.error("Error in asyncEach of series at calculateDailyStats",asyncError);
					}
					
					if(result.length > 0){
						result.map(records=>{
							let conformance		= (asyncResponse.conformance[records._id]) ? asyncResponse.conformance[records._id] : '';
							let nr				= (asyncResponse.nr[records._id]) ? asyncResponse.nr[records._id] : '';
							let nrPercentage	= 0; // NR percentage will be calculated if nr is not empty otherwise 0
							if(nr) nrPercentage	= (Helper.convertTimeFormatToSeconds(nr)/Helper.convertTimeFormatToSeconds(conformance))*Constants.MAX_PERCENTAGE;
							records.offered		= (asyncResponse.offered[records._id]) ? asyncResponse.offered[records._id] : 0;
							records.answered	= (asyncResponse.answered[records._id]) ? asyncResponse.answered[records._id] : 0;
							records.abandoned	= (asyncResponse.abandoned[records._id]) ? asyncResponse.abandoned[records._id] : 0;
							records.outbound	= (asyncResponse.outbound[records._id]) ? asyncResponse.outbound[records._id] : 0;
							records.aht			= (asyncResponse.aht[records._id]) ? asyncResponse.aht[records._id] : '';
							records.conformance	= conformance;
							records.shift		= (asyncResponse.shift[records._id]) ? asyncResponse.shift[records._id] : '';
							records.login		= (asyncResponse.login[records._id]) ? asyncResponse.login[records._id] : '';
							records.tardiness	= (asyncResponse.tardiness[records._id]) ? asyncResponse.tardiness[records._id] : '';
							records.nr			= Helper.round(nrPercentage,Constants.ROUND_PRECISION);
						});

						res.send({"result":result});
					}else{
						res.render('blank',{layout:false});
					}
				});
			});
		} catch (error) {
			console.error("Catch error in calculateDailyStats",error);
		}
	}; // End calculateDailyStats

	/**
	 * Function to calculate weekly quality stats
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 *
	 * @return render
	 */
	async weeklyQualityStats (req, res, next){
		try {
			let startDate 	=	Helper.newDate("2020-02-01",Constants.DATABASE_DATE_FORMAT+" "+Constants.START_DATE_TIME_FORMAT);
			let endDate 	= 	Helper.newDate("2020-02-29",Constants.DATABASE_DATE_FORMAT+" "+Constants.END_DATE_TIME_FORMAT);
			const avaya_quality_summary	=	this.db.collection(Tables.AVAYA_QUALITY_SUMMARY);
			avaya_quality_summary.aggregate([
				{ $match : { call_date_time	:	{$gte: Helper.getUtcDate(startDate), $lte: Helper.getUtcDate(endDate)}}},
				{
					"$unwind": "$data"
				},
				{
					"$project": {
						"weekOfMonth": {$floor: {$divide: [{$dayOfMonth: "$call_date_time"}, 7]}},
						"month": { $month: "$call_date_time" },
						"data": 1,
						"agent_id": 1
					}
				},
				{$group: {
					_id : {
						_id : "$weekOfMonth",
						type : "$data.type",
						agent_id : 	"$agent_id",
					},
					main_id : {$first : "$weekOfMonth" },
					month : {$first : "$month" },
					type : {$first : "$data.type" },
					data : {$first : "$data" },
					total_value : {$sum : "$data.number_of_error" },
					agent_id : {$first : "$agent_id" }
				}},
				{$group: {
					_id                 :   {
						main_id 			: 	"$main_id",
						agent_id 			: 	"$agent_id",
					},
					month : {$first : "$month" },
					non_critical_count  :   {
						'$sum': {
							$cond: [
								{$and: [
									{ $eq : ["$type",Constants.NON_CRITICAL] },
								]},
								'$total_value',
								0
							]
						}
					},
					business_count  :   {
						'$sum': {
							$cond: [
								{$and: [
									{ $eq : ["$type",Constants.BUSINESS_CRITICAL] },
								]},
								'$total_value',
								0
							]
						}
					},
					end_user_count  :   {
						'$sum': {
							$cond: [
								{$and: [
									{ $eq : ["$type",Constants.END_USER_CRITICAL] },
								]},
								'$total_value',
								0
							]
						}
					}
				}},
				{$group: {
					_id :	"$_id.agent_id",
					month : {$first : "$month" },
					data:	{
						$push:	{
							weekOfMonth:"$_id.main_id",
							non_critical_count:"$non_critical_count",
							business_count:"$business_count",
							end_user_count:"$end_user_count"
						}

					}
				}}
			]).toArray().then(result=>{
				res.send({
					"result":result
				});
			}).catch(err=>{
				console.error("Error in weeklyQualityStats",err);
			});
		} catch (error) {
			console.error("Catch error in weeklyQualityStats",error);
		}
	};// End weeklyQualityStats

	/**
	 * Function to get avaya date from avaya db and put or cravez database
	 *
	 * @param date 		as	Date object
	 * @param format 	as 	Date format
	 *
	 * @return date string
	 */
	async getAvayaData (req,res,next,options){
		return new Promise(resolve=>{
			const connectionConfig = {
				connectionString: 'DSN=avayaodbc',
				connectionTimeout: 10,
				loginTimeout: 10,
			};

			odbc.connect(connectionConfig, (error, connection) => {
				
				let startDate 	=	Helper.newDate(Helper.subtractDate(Constants.HOURS_IN_A_DAY),Constants.DATABASE_DATE_FORMAT+" "+Constants.START_DATE_TIME_FORMAT);
				let endDate 	= 	Helper.newDate(Helper.subtractDate(Constants.HOURS_IN_A_DAY),Constants.DATABASE_DATE_FORMAT+" "+Constants.END_DATE_TIME_FORMAT);
				
				asyncParallel({
					i_agent_performance_stat_fetch:(callback)=>{
						if(connection == "") return callback(null,null);

						connection.query("SELECT * FROM iAgentPerformanceStat WHERE Timestamp >= '"+startDate+"' AND Timestamp <= '"+endDate+"'", (error, result) => {
							if(error || result.length <=0) return callback(error, {});
							callback(null, result);
						});
					},
					e_agent_login_stat_fetch:(callback)=>{
						if(connection == "") return callback(null,null);

						connection.query("SELECT * FROM eAgentLoginStat WHERE Timestamp >= '"+startDate+"' AND Timestamp <= '"+endDate+"'", (error, result) => {
							if(error || result.length <=0) return callback(error, {});
							callback(null, result);
						});
					},
					i_activity_code_stat_fetch:(callback)=>{
						if(connection == "") return callback(null,null);

						connection.query("SELECT * FROM iActivityCodeStat WHERE Timestamp >= '"+startDate+"' AND Timestamp <= '"+endDate+"'", (error, result) => {
							if(error || result.length <=0) return callback(error, {});
							callback(null, result);
						});
					},
				},(asyncErr, asyncResponse)=>{
					if(asyncErr) {
						console.error("Error in asyncEach of series at getAvayaData",asyncErr);
					}
					
					let iAgentPerformanceStatFetch 	= (asyncResponse.i_agent_performance_stat_fetch) ? asyncResponse.i_agent_performance_stat_fetch:{};
					let eAgentLoginStatFetch	 	= (asyncResponse.e_agent_login_stat_fetch) ?asyncResponse.e_agent_login_stat_fetch:{};
					let iActivityCodeStatFetch 	 	= (asyncResponse.i_activity_code_stat_fetch) ?asyncResponse.i_activity_code_stat_fetch:{};
					
					asyncParallel({
						i_agent_performance_stat_insert:(childCallback)=>{
							if(Object.keys(iAgentPerformanceStatFetch).length <=0) return childCallback(null, null);
							
							const iAgentPerformanceStat = this.db.collection(Tables.IAGENTPERFORMANCESTAT);
							iAgentPerformanceStat.insertMany(iAgentPerformanceStatFetch).then(()=>{
								childCallback(null);
							}).catch(()=>{
								childCallback(null);
							});
						},
						e_agent_login_stat_insert:(childCallback)=>{
							if(Object.keys(eAgentLoginStatFetch).length <=0) return childCallback(null, null);

							const eAgentLoginStat = this.db.collection(Tables.EAGENTLOGINSTAT);
							eAgentLoginStat.insertMany(eAgentLoginStatFetch).then(()=>{
								childCallback(null);
							}).catch(()=>{
								childCallback(null);
							});
						},
						i_activity_code_stat_insert:(childCallback)=>{
							if(Object.keys(iActivityCodeStatFetch).length <=0) return childCallback(null, null);

							const iActivityCodeStat = this.db.collection(Tables.IACTIVITYCODESTAT);
							iActivityCodeStat.insertMany(iActivityCodeStatFetch).then(()=>{
								childCallback(null);
							}).catch(()=>{
								childCallback(null);
							});
						},
					},(childAsyncErr, childAsyncResponse)=>{
						if(childAsyncErr) {
							console.error("Error in asyncEach of series at getAvayaData",childAsyncErr);
						}
						
						resolve({status : Constants.STATUS_SUCCESS});
					});
				});
			});
		});
	};// End getAvayaData

	/**
	 * Function to save cron logs
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return render
	 */
	async saveCronLogs (req, res,next, options) {
		try {
			let methodName 	= 	(options.method_name) 	?	options.method_name :"";
			let cronData 	=	(options.data)			? 	options.data 		:"";

			/** Set data */
			let insertAbleData = {
				method_name: methodName,
				created	   : Helper.getUtcDate(),
			};
			if(cronData) insertAbleData.cron_data = cronData;

			const system_cron_logs 	= this.db.collection(Tables.SYSTEM_CRON_LOGS);
			await system_cron_logs.insertOne(insertAbleData);
				
			let result = await system_cron_logs.find({method_name: methodName }, { projection: { _id: 1} }).sort({_id: Constants.SORT_ASC}).toArray();
			
			if(result.length>10){
				await system_cron_logs.deleteOne({ _id: result[0]._id });
			}
		} catch (error) {
			console.error("Catch error in saveCronLogs",error);
		}
	};//End saveCronLogs()

	/**
	 * Function to get bulk avaya data
	 *
	 *
	 * @param req 		As Request Data
	 * @param res 		As Response Data
	 * @param options 	As Object Data
	 *
	 * @return render
	*/
	async getBulkAvayaData (req, res,next){
		try {			
			/** Send response to client and work in background */
			res.render('blank',{layout:false});
			
			const connectionConfig = {
				connectionString: 'DSN=Avaya',
				connectionTimeout: 10,
				loginTimeout: 10,
			}
			odbc.connect(connectionConfig, (error, connection) => {
				var getDataInterval = null;
				var daysHours	=	totalDays*24;
				var subtractHoursTimestamp = daysHours * 60 * 60 * 1000;
				now 	= new Date(Date.now() - subtractHoursTimestamp);
				var dates = [],
				currentDate = now,
				toDate 		= new Date(),
				addDays = function(days) {
					var date = new Date(this.valueOf());
					date.setDate(date.getDate() + days);
					return date;
				};

				while (currentDate <= toDate) {
					dates.push(currentDate);
					currentDate = addDays.call(currentDate, 1);
				}
				getDataInterval = setInterval(function(){
					var totalPushDate = 2;
					var items = dates.splice(0, totalPushDate);
					if(dates.length == 0) clearInterval(getDataInterval);
					var options	=	{
						'dates':items,
						'connection':connection,
					}

					this.getAvayaData(req, res,next,options).then(returnValue=>{
						res.send({
							"status":Constants.STATUS_SUCCESS
						});
					});
				},10000);
			});
		} catch (error) {
			console.error("Catch error in getBulkAvayaData",error);
		}
	};//End getBulkAvayaData()

	/**
	 * Function to save captain wise orders
	 *
	 * @param req 		As Request Data
	 * @param res 		As Response Data
	 * @param options 	As Object Data
	 *
	 * @return render
	 */
	async saveRestaurnatWiseOrders (req, res,next){
		try {
			/** Send response to client and work in background */
			res.render('blank', { layout: false });

			this.saveCronLogs(req, res, next, {method_name: "saveRestaurnatWiseOrders"});

			/** Get number of days */
			let numberOfDays 	   = (req.params.days) ? parseInt(req.params.days) :2;
			if(numberOfDays <= 0 || isNaN(numberOfDays)) numberOfDays = 2;

			/** Get start and end date */
			let hoursInADay   =  numberOfDays*Constants.HOURS_IN_A_DAY;
			let tempStartDate =  Helper.newDate(Helper.subtractDate(hoursInADay));
			let startDate     =  Helper.newDate(tempStartDate,Constants.DATABASE_DATE_FORMAT);
			startDate  	      =  Helper.newDate(startDate+" "+Constants.START_DATE_TIME_FORMAT);
			let endDate  	  =  Helper.newDate(Helper.newDate("",Constants.CURRENTDATE_START_DATE_FORMAT));
			
			const orders  =  this.db.collection(Tables.ORDERS);
			const branch_wise_processed_orders	=  this.db.collection(Tables.BRANCH_WISE_PROCESSED_ORDERS);

			let datesArray = Helper.getDateRange(startDate, endDate);
			eachOfSeries(datesArray, (tmpDate, key, seariesCallback) => {
				let tmpCurrentDate = Helper.newDate(tmpDate, Constants.DATABASE_DATE_FORMAT);
				let tmpStartDate = Helper.newDate(tmpCurrentDate + " " + Constants.START_DATE_TIME_FORMAT);
				let tmpEndDate = Helper.newDate(tmpCurrentDate + " " + Constants.END_DATE_TIME_FORMAT);

				/** Get driver in out shift details */
				orders.aggregate([
					{$match :{
						order_date		: { $gte: tmpStartDate, $lt: tmpEndDate},
						admin_status 	: Constants.ORDER_DELIVERED
					}},
					{$lookup:	{
						"from" 			: 	Tables.AREAS,
						"localField" 	:	"area_id",
						"foreignField" 	: 	"_id",
						"as" 			: 	"area_details"	
					}},
					{$addFields : {
						city_id		: {$arrayElemAt: ["$area_details.city_id",0]},
					}},
					{$group : {
						_id : {
							branch_id		: "$branch_id",
							area_id			: "$area_id",
							delivery_type	: "$delivery_type",
							date 			: { $dateToString: { format: "%Y-%m-%d", date: "$order_date", timezone: Constants.DEFAULT_TIME_ZONE }}
						},
						branch_id 		: {$first : "$branch_id"},
						restaurant_id	: {$first : "$restaurant_id"},
						area_id 		: {$first : "$area_id"},
						area_name 		: {$first : "$area_name"},
						restaurant_name : {$first : "$restaurant_name"},
						city_id 		: {$first : "$city_id"},
						order_date   	: {$first : "$order_date"},
						delivery_type	: {$first : "$delivery_type"},
						total_amount	: {$sum : "$order_price"},
						delivery_fee	: {$sum : "$delivery_fee"},
						cravez_payout	: {$sum : "$cravez_payout"},
						restaurant_payout: {$sum : "$restaurant_payout"},
						total_orders	: {$sum : 1},
						guest_orders	: {$sum: {
							$cond: [
								{$and : [ { $eq: [  "$is_guest", true]}]},
								1,
								0
							]
						}},
					}}
				],{allowDiskUse: true}).toArray().then(result=>{
					if(result.length <=0) return seariesCallback(null);

					/** Update driver wise orders*/
					asyncEach(result, (records, eachCallback)=> {
						let created			=	records.order_date;
						let createdDate		=  	Helper.newDate(created,Constants.DATABASE_DATE_FORMAT);
						let createdStart	=	Helper.newDate(createdDate+" "+Constants.START_DATE_TIME_FORMAT);
						let createdEnd		=	Helper.newDate(createdDate+" "+Constants.END_DATE_TIME_FORMAT);

						branch_wise_processed_orders.updateOne({
							branch_id : (records.branch_id) ? new ObjectId(records.branch_id) : "",
							area_id   : (records.area_id) ? new ObjectId(records.area_id) : "",
							date      : {
								$gte: Helper.newDate(createdStart),
								$lte: Helper.newDate(createdEnd)
							},
							delivery_type	: records.delivery_type,
						},
						{
							$set : {
								guest_orders	: (records.guest_orders) 	? parseInt(records.guest_orders) : 0,
								total_orders	: (records.total_orders) 	? parseInt(records.total_orders) : 0,
								restaurant_id	: (records.restaurant_id) 	? new ObjectId(records.restaurant_id) : "",
								city_id			: (records.city_id) 		? new ObjectId(records.city_id) : "",
								area_name		: records.area_name,
								restaurant_name	: records.restaurant_name,
								total_amount	: (records.total_amount) 	? Helper.round(records.total_amount, Constants.CURRENCY_ROUND_PRECISION) : 0,
								delivery_fee	: (records.delivery_fee) 	? Helper.round(records.delivery_fee, Constants.CURRENCY_ROUND_PRECISION) : 0,
								cravez_payout	: (records.cravez_payout) 	? Helper.round(records.cravez_payout, Constants.CURRENCY_ROUND_PRECISION) : 0,
								restaurant_payout: (records.restaurant_payout)? Helper.round(records.restaurant_payout, Constants.CURRENCY_ROUND_PRECISION):0,
							},
							$setOnInsert : {
								date	: records.order_date,
								created	: Helper.getUtcDate(),
							}
						},{upsert : true}).then(()=>{
							eachCallback(null);
						}).catch(()=>{
							eachCallback(null);
						});
					},()=>{
						seariesCallback(null);
					});
				}).catch(err=>{
					console.error("Error in saveRestaurnatWiseOrders",err);
					return seariesCallback(null);
				});
			}, (eachErr) => {
				if(eachErr) console.error("Error in eachOfSeries at saveRestaurnatWiseOrders",eachErr);
			});
		} catch (error) {
			console.error("Catch error in saveRestaurnatWiseOrders",error);
		}
	};//End saveRestaurnatWiseOrders()

	/**
	 * Function to save cuisine report
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 *
	 * @return render
	 */
	async saveOrderCuisineReport (req, res, next){
		try {
			/** Send response to client and work in background */
			res.render('blank', { layout: false });

			/** Get number of days */
			let numberOfDays 	   = (req.params.days) ? parseInt(req.params.days) :2;
			if(numberOfDays <= 0 || isNaN(numberOfDays)) numberOfDays = 2;

			/** Get start and end date */
			let hoursInADay   =  numberOfDays*Constants.HOURS_IN_A_DAY;
			let tempStartDate =  Helper.newDate(Helper.subtractDate(hoursInADay));
			let startDate     =  Helper.newDate(tempStartDate,Constants.DATABASE_DATE_FORMAT);
			startDate  	      =  Helper.newDate(startDate+" "+Constants.START_DATE_TIME_FORMAT);
			let endDate  	  =  Helper.newDate(Helper.newDate("",Constants.CURRENTDATE_START_DATE_FORMAT));

			let datesArray = Helper.getDateRange(startDate, endDate);
			eachOfSeries(datesArray,(tmpDate, key,seariesCallback)=>{
				let tmpCurrentDate	= Helper.newDate(tmpDate,Constants.DATABASE_DATE_FORMAT);
				let tmpStartDate	= Helper.newDate(tmpCurrentDate+" "+Constants.START_DATE_TIME_FORMAT);
				let tmpEndDate		= Helper.newDate(tmpCurrentDate+" "+Constants.END_DATE_TIME_FORMAT);

				asyncParallel({
					order_list : (callback)=>{
						/** Get orders list */
						const orders	=	this.db.collection(Tables.ORDERS);
						orders.aggregate([
							{$match :{
								order_date 		: {$gte: tmpStartDate, $lt: tmpEndDate},
								admin_status 	: Constants.ORDER_DELIVERED,
							}},
							{$lookup:	{
								"from" 			: 	Tables.AREAS,
								"localField" 	:	"area_id",
								"foreignField" 	: 	"_id",
								"as" 			: 	"area_details"
							}},
							{$addFields : {
								city_id	: {$arrayElemAt: ["$area_details.city_id",0]},
							}},
							{$lookup:	{
								from     : Tables.ORDER_ITEMS,
								let      : {orderId : "$_id"},
								pipeline : [
									{$match : {
										$expr: {
											$and : [
												{$eq: ["$order_id", "$$orderId"]},
											]
										}
									}},
									{$lookup:	{
										"from" 			: 	Tables.ITEMS,
										"localField" 	:	"item_id",
										"foreignField" 	: 	"_id",
										"as" 			: 	"item_details"
									}},
									{$project : {
										item_id: 1, cuisine_id: {$arrayElemAt: ["$item_details.cuisine_id",0]},
										category_ids: {$arrayElemAt: ["$item_details.category_ids",0]}
									}},
								],
								as	:	"order_items"
							}}
						]).toArray().then(result=>{
							callback(null,result);
						}).catch(err=>{
							callback(err,null);
						});
					},
					category_cuisine_list : (callback)=>{
						/** Get category list */
						const restaurant_categories	=	this.db.collection(Tables.RESTAURANT_CATEGORIES);
						restaurant_categories.find({cuisine_id: {$exists: true} },{projection: {cuisine_id:1,_id:1, restaurant_id:1 }}).toArray().then(catResult=>{
							if(catResult.length <=0) return callback(null,null);

							let cuisineIdObj	= 	{};
							let categoryObj 	= 	{};
							let tmpCuisineObj 	=	{};
							catResult.forEach(records=>{
								let tmpRestaurantId = records.restaurant_id;

								if(!tmpCuisineObj[tmpRestaurantId]) tmpCuisineObj[tmpRestaurantId] 	=	{};
								if(!cuisineIdObj[tmpRestaurantId]) 	cuisineIdObj[tmpRestaurantId] 	=	[];
								if(!categoryObj[tmpRestaurantId]) 	categoryObj[tmpRestaurantId] 	=	{};

								categoryObj[tmpRestaurantId][records._id] = records.cuisine_id;

								if(!tmpCuisineObj[tmpRestaurantId][records.cuisine_id]){

									tmpCuisineObj[tmpRestaurantId][records.cuisine_id] = records.cuisine_id;
									cuisineIdObj[tmpRestaurantId].push(records.cuisine_id);
								}
							});

							callback(null,{
								cuisine_list 	: 	cuisineIdObj,
								category_list 	:	categoryObj,
							});
						}).catch(err=>{
							callback(err,null);
						});
					},
				},(parallelErr, parallelResponse)=>{
					if(parallelErr){
						console.error("Parallel error On Crons saveCuisineReport");
						return  console.error(parallelErr);
					}

					let orderList 			= 	parallelResponse.order_list;
					let categoryCuisineList =	parallelResponse.category_cuisine_list;

					if(orderList && orderList.length >0 && categoryCuisineList){
						let cuisineList 	=  categoryCuisineList.cuisine_list;
						let categoryList 	=  categoryCuisineList.category_list;
						let finalSaveData	=  {};
						const order_cuisine_reports	=	this.db.collection(Tables.ORDER_CUISINE_REPORTS);
						asyncEach(orderList,(records, eachCallback)=>{
							let orderId 		=	records._id;
							let areaId 			= 	records.area_id;
							let branchId 		= 	records.branch_id;
							let restaurantId 	=	records.restaurant_id;
							let orderAmount 	=	(records.order_price) ? parseFloat(records.order_price) : 0;
							let orderItems 		=	records.order_items;
							let orderDate 		=	records.order_date;
							let dateString 		=	Helper.newDate(orderDate,Constants.DATABASE_DATE_FORMAT);

							let restCuisineList	=	(cuisineList[restaurantId]) ? cuisineList[restaurantId] :[];
							let restCategoryList=	(categoryList[restaurantId]) ? categoryList[restaurantId] :{};

							let uniqueItemList	=	{};
							let uniqueOrderList	=	{};
							let orderDetails	=	{
								branch_id 			: new ObjectId(branchId),
								area_id   			: (areaId) ? new ObjectId(areaId) : "",
								restaurant_id 		: new ObjectId(restaurantId),
								city_id 			: new ObjectId(records.city_id),
								delivery_type 		: records.delivery_type,
								area_name			: records.area_name,
								restaurant_name		: records.restaurant_name,
								total_orders		: 1,
								total_amount		: orderAmount,
								date				: orderDate,
								cron_date			: dateString
							};

							uniqueOrderList[orderId] = {};
							orderItems.map(itemData=>{
								let tmpItemId = itemData.item_id;

								if(!uniqueItemList[tmpItemId]){
									if(itemData.cuisine_id){
										if(!uniqueOrderList[orderId][itemData.cuisine_id]){
											let uniqueCombiKey	= dateString+branchId+areaId+itemData.cuisine_id;
											if(finalSaveData[uniqueCombiKey]){
												let currentCount	= finalSaveData[uniqueCombiKey].total_orders;
												let currentAmount	= finalSaveData[uniqueCombiKey].total_amount;

												finalSaveData[uniqueCombiKey].total_amount = Helper.round(currentAmount+orderAmount, Constants.CURRENCY_ROUND_PRECISION);
												finalSaveData[uniqueCombiKey].total_orders = parseInt(currentCount+1);
											}else{
												let tmpDetails = clone(orderDetails);
												tmpDetails.cuisine_id = new ObjectId(itemData.cuisine_id);
												finalSaveData[uniqueCombiKey] = tmpDetails;
											}
											uniqueOrderList[orderId][itemData.cuisine_id] = true;
										}
										uniqueItemList[tmpItemId] = true;
									}else if(itemData.category_ids && itemData.category_ids.length >0){
										itemData.category_ids.map(tmpCatId=>{
											if(restCategoryList[tmpCatId]){
												uniqueItemList[tmpItemId] = true;
												let tmpCuisinesId	= restCategoryList[tmpCatId];
												let uniqueCombiKey	= dateString+branchId+areaId+tmpCuisinesId;
												if(!uniqueOrderList[orderId][tmpCuisinesId]){
													if(finalSaveData[uniqueCombiKey]){
														let currentCount	= finalSaveData[uniqueCombiKey].total_orders;
														let currentAmount	= finalSaveData[uniqueCombiKey].total_amount;
														finalSaveData[uniqueCombiKey].total_amount = Helper.round(currentAmount+orderAmount, Constants.CURRENCY_ROUND_PRECISION);
														finalSaveData[uniqueCombiKey].total_orders = parseInt(currentCount+1);
													}else{
														let tmpDetails = clone(orderDetails);
														tmpDetails.cuisine_id			= new ObjectId(tmpCuisinesId);
														finalSaveData[uniqueCombiKey]	= tmpDetails;
													}
													uniqueOrderList[orderId][tmpCuisinesId] = true;
												}
											}
										});
									}else{
										uniqueItemList[tmpItemId] = true;
										restCuisineList.map(tmpCuisinesId=>{
											let uniqueCombiKey	= dateString+branchId+areaId+tmpCuisinesId;
											if(!uniqueOrderList[orderId][tmpCuisinesId]){
												if(finalSaveData[uniqueCombiKey]){
													let currentCount	= finalSaveData[uniqueCombiKey].total_orders;
													let currentAmount	= finalSaveData[uniqueCombiKey].total_amount;
													finalSaveData[uniqueCombiKey].total_amount = Helper.round(currentAmount+orderAmount, Constants.CURRENCY_ROUND_PRECISION);
													finalSaveData[uniqueCombiKey].total_orders = parseInt(currentCount+1);
												}else{
													let tmpDetails = clone(orderDetails);
													tmpDetails.cuisine_id			= new ObjectId(tmpCuisinesId);
													finalSaveData[uniqueCombiKey]	= tmpDetails;
												}
												uniqueOrderList[orderId][tmpCuisinesId] = true;
											}
										});
									}
								}
							});
							eachCallback(null);
						},asyncEachErr=>{
							if(asyncEachErr){
								console.error("Error On Crons saveCuisineReport",asyncEachErr);
							}

							let dataToBeSaved	=  Object.values(finalSaveData);
							if(dataToBeSaved.length > 0){
								/** Save cuisine report data */
								asyncEach(dataToBeSaved, (records, childEachCallback)=> {
									let created			=	records.cron_date;
									let createdDate		=  	Helper.newDate(created,Constants.DATABASE_DATE_FORMAT);
									let createdStart	=	Helper.newDate(createdDate+" "+Constants.START_DATE_TIME_FORMAT);
									let createdEnd		=	Helper.newDate(createdDate+" "+Constants.END_DATE_TIME_FORMAT);

									order_cuisine_reports.updateOne({
										branch_id : new ObjectId(records.branch_id),
										area_id   : (records.area_id) ? new ObjectId(records.area_id) : "",
										cuisine_id: (records.cuisine_id) ? new ObjectId(records.cuisine_id) : "",
										date      : {
											$gte: Helper.newDate(createdStart),
											$lte: Helper.newDate(createdEnd)
										},
									},
									{
										$set : {
											total_orders	: parseInt(records.total_orders),
											restaurant_id	: new ObjectId(records.restaurant_id),
											city_id			:  (records.city_id) ? new ObjectId(records.city_id) : "",
											delivery_type	: records.delivery_type,
											area_name		: records.area_name,
											restaurant_name	: records.restaurant_name,
											total_amount	: Helper.round(records.total_amount, Constants.CURRENCY_ROUND_PRECISION),
										},
										$setOnInsert : {
											date	: records.date,
											created	: Helper.getUtcDate(),
										},
									},{upsert : true}).then(()=>{
										childEachCallback(null);
									}).catch(err=>{
										childEachCallback(err);
									});
								},(childEachErr)=>{
									if(childEachErr){
										console.error("Error in saveOrderCuisineReport",childEachErr);
									}
									seariesCallback(null);
								});
							}else{
								seariesCallback(null);
							}
						});
					} else {
						seariesCallback(null);
					}
				});
			}, (eachErr) => {
				if (eachErr) {
					console.error("Error at eachErr in saveOrderCuisineReport",eachErr);
				}
			});
		} catch (error) {
			console.error("Catch error in saveOrderCuisineReport",error);
		}
	};// End saveOrderCuisineReport

	/**
	 * Function to save operation reports
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return render
	 */
	async saveOperationReport (req, res,next){
		try {
			/** Send response to client and work in background */
			res.render('blank', { layout: false });

			/** Get number of days */
			let numberOfDays  = (req.params.days) ? parseInt(req.params.days) :2;
			if(numberOfDays	 <= 0 || isNaN(numberOfDays)) numberOfDays = 2;

			/** Get start and end date */
			let hoursInADay   =  numberOfDays*Constants.HOURS_IN_A_DAY;
			let tempStartDate =  Helper.newDate(Helper.subtractDate(hoursInADay));
			let startDate     =  Helper.newDate(tempStartDate,Constants.DATABASE_DATE_FORMAT);
			startDate  	      =  Helper.newDate(startDate+" "+Constants.START_DATE_TIME_FORMAT);
			let endDate  	  =  Helper.newDate(Helper.newDate("",Constants.CURRENTDATE_START_DATE_FORMAT));

			const orders  	  		= this.db.collection(Tables.ORDERS);
			const operation_reports	= this.db.collection(Tables.OPERATION_REPORTS);
			let datesArray	  		= Helper.getDateRange(startDate,endDate);
			eachOfSeries(datesArray,(tmpDate, key,seariesCallback)=>{
				let tmpCurrentDate	= Helper.newDate(tmpDate,Constants.DATABASE_DATE_FORMAT);
				let tmpStartDate	= Helper.newDate(tmpCurrentDate+" "+Constants.START_DATE_TIME_FORMAT);
				let tmpEndDate		= Helper.newDate(tmpCurrentDate+" "+Constants.END_DATE_TIME_FORMAT);

				orders.aggregate([
					{$match :{
						order_date 	: {$gte: tmpStartDate, $lt: tmpEndDate},
						is_completed: true,
					}},
					{$group : {
						_id : {
							branch_id	: "$branch_id",
							date 		: { $dateToString: {format: "%Y-%m-%d",date: "$order_date",timezone: Constants.DEFAULT_TIME_ZONE}}
						},
						branch_id 		: {$first : "$branch_id"},
						restaurant_id	: {$first : "$restaurant_id"},
						restaurant_name : {$first : "$restaurant_name"},
						order_date   	: {$first : "$order_date"},
						total_orders	: {$sum : 1},
						total_amount	: {$sum : "$order_price"},
						transmission_time: {$sum : "$transmission_time"},
						branch_transmission_time: {$sum : "$branch_transmission_time"},
						contacted_orders: {$sum: {
							$cond: [
								{$and : [ { $eq: [  "$ticketing", true]}]},
								1,
								0
							]
						}},
						delivered_orders: {$sum: {
							$cond: [
								{$and : [ { $eq: [  "$admin_status", Constants.ORDER_DELIVERED]}]},
								1,
								0
							]
						}},
						sales	: {$sum: {
							$cond: [
								{$and : [ { $eq: [  "$admin_status", Constants.ORDER_DELIVERED]}]},
								"$order_price",
								0
							]
						}},
						cancelled_orders: {$sum: {
							$cond: [
								{$and : [ { $eq: [  "$admin_status", Constants.ORDER_CANCELLED]}]},
								1,
								0
							]
						}},
						manual_transmission: {$sum: {
							$cond: [
								{$or : [
									{ $eq: [  "$admin_status", Constants.ORDER_CANCELLED]},
									{ $eq: [  "$is_modified", true]}
								]},
								1,
								0
							]
						}},
						rejected_orders: {$sum: {
							$cond: [{$or : [
								{$eq: ["$admin_status",Constants.ORDER_REJECTED]},
								{ $eq: ["$admin_status", Constants.ORDER_REJECTED_BY_ADMIN]},
							]},1,0]
						}},
						lost_revenue: {
							$sum: {
								$cond: [
									{
										$or: [
											{ $eq: ["$admin_status", Constants.ORDER_CANCELLED] },
											{ $eq: ["$admin_status", Constants.ORDER_REJECTED] },
											{ $eq: ["$admin_status", Constants.ORDER_REJECTED_BY_ADMIN] }
										]

									},
									"$order_price",
									0
								]
							}
						},
						tt_less_than_3: {$sum: {
							$cond: [{$and : [ { $gte: ["$transmission_time",0]},{ $lt: ["$transmission_time",3]}]},1,0]
						}},
						tt_3_to_5: {$sum: {
							$cond: [{$and : [{ $gte: ["$transmission_time",3]},{ $lt: [ "$transmission_time",5]}]},1,0]
						}},
						tt_5_to_7: {$sum: {
							$cond: [{$and : [{ $gte: ["$transmission_time",5]},{ $lt: [ "$transmission_time",7]}]},1,0]
						}},
						tt_7_to_10: {$sum: {
							$cond: [{$and : [{ $gte: ["$transmission_time",7]},{ $lt: ["$transmission_time",10]}]},1,0]
						}},
						tt_more_than_10: {$sum: {
							$cond: [{$and : [{ $gte: ["$transmission_time", 10]}]},1,0]
						}},
					}}
				]).toArray().then(result=>{
					if(result.length <=0) return seariesCallback(null);
					
					/** Update driver wise orders*/
					asyncEach(result, (records, eachCallback)=> {
						let created			=	records.order_date;
						let createdDate		=  	Helper.newDate(created,Constants.DATABASE_DATE_FORMAT);
						let createdStart	=	Helper.newDate(createdDate+" "+Constants.START_DATE_TIME_FORMAT);
						let createdEnd		=	Helper.newDate(createdDate+" "+Constants.END_DATE_TIME_FORMAT);

						operation_reports.updateOne({
							branch_id : new ObjectId(records.branch_id),
							date      : {
								$gte: Helper.newDate(createdStart),
								$lte: Helper.newDate(createdEnd)
							},
						},
						{
							$set : {
								total_orders	: (records.total_orders) 	? parseInt(records.total_orders) : 0,
								restaurant_id	: (records.restaurant_id) 	? new ObjectId(records.restaurant_id) : "",
								restaurant_name	: records.restaurant_name,
								branch_transmission_time: Helper.round(records.branch_transmission_time),
								transmission_time: Helper.round(records.transmission_time),
								cancelled_orders: parseInt(records.cancelled_orders),
								rejected_orders : parseInt(records.rejected_orders),
								contacted_orders: parseInt(records.contacted_orders),
								delivered_orders: parseInt(records.delivered_orders),
								manual_transmission: parseInt(records.manual_transmission),
								tt_less_than_3	: parseInt(records.tt_less_than_3),
								tt_3_to_5		: parseInt(records.tt_3_to_5),
								tt_5_to_7		: parseInt(records.tt_5_to_7),
								tt_7_to_10		: parseInt(records.tt_7_to_10),
								tt_more_than_10	: parseInt(records.tt_more_than_10),
								sales			: Helper.round(records.sales,Constants.CURRENCY_ROUND_PRECISION),
								lost_revenue	: Helper.round(records.lost_revenue,Constants.CURRENCY_ROUND_PRECISION),
								total_amount	: (records.total_amount) ? Helper.round(records.total_amount,Constants.CURRENCY_ROUND_PRECISION) : 0,
							},
							$setOnInsert : {
								date	: records.order_date,
								created	: Helper.getUtcDate(),
							}
						},{upsert : true}).then(()=>{
							eachCallback(null);
						}).catch(err=>{
							eachCallback(err);
						});
					},(childEachErr)=>{
						seariesCallback(childEachErr);
					});
				}).catch(err=>{
					seariesCallback(err);
				});
			},(eachErr)=>{
				if(eachErr){
					console.error("Error at eachErr in saveOperationReport",eachErr);
				}
			});
		} catch (error) {
			console.error("Error in saveOperationReport",error);
		}
	};//End saveOperationReport()

	/**
	 * Function to save customer breakdown reports
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return render
	 */
	async saveCustomerBreakdownReport (req, res,next){
		try {
			/** Send response to client and work in background */
			res.render('blank', { layout: false });

			/** Get current year, month and date */
			let currentYear		= Helper.newDate().getFullYear();
			let currentMonth 	= Helper.newDate().getMonth()+1;
			let currentDate 	= Helper.newDate().getDate();
			let reportYear		= (req.params.year) ? parseInt(req.params.year)   : currentYear;
			let reportMonth		= (req.params.month) ? parseInt(req.params.month) : currentMonth;

			let reportStartDate	= (reportMonth == 1 && currentMonth==1 && currentDate == 1) ? (reportYear -1)+"-"+12+"-01" : reportYear+"-"+reportMonth+"-01";
			let reportEndDate	= reportYear+"-"+reportMonth+"-31";
			let startDate		= Helper.newDate(reportStartDate+" "+Constants.START_DATE_TIME_FORMAT);
			let endDate			= Helper.newDate(reportEndDate+" "+Constants.END_DATE_TIME_FORMAT);

			const users		= this.db.collection(Tables.USERS);
			const orders	= this.db.collection(Tables.ORDERS);
			let cusomersConditions		= clone(Constants.CUSTOMER_COMMON_CONDITIONS);
			cusomersConditions.created	= {$gte: startDate, $lt: endDate};

			let customerIds = await users.distinct("_id",cusomersConditions);
				
			asyncParallel({
				customer_without_order:(callback)=>{
					orders.aggregate([
						{$match : {
							order_date 	: {$gte: startDate, $lt: endDate},
							customer_id : {$in : customerIds},
							admin_status: Constants.ORDER_DELIVERED
						}},
						{$group : {
							_id : "$customer_id",
						}},
					]).toArray().then(result=>{
						
						let registredUsers	= customerIds.length;
						let orderedCustomer	= result.length;
						let dataArray = [{
							_id		: reportYear+'-'+reportMonth,
							year 	: reportYear,
							month 	: reportMonth,
							count 	: (registredUsers-orderedCustomer),
						}];
						callback(null,dataArray);
					}).catch(err=>{
						callback(err);
					});
				},
				multi_order_customer:(callback)=>{
					orders.aggregate([
						{$match : {
							order_date 	: {$gte: startDate, $lt: endDate},
							customer_id : {$in : customerIds},
							admin_status : Constants.ORDER_DELIVERED,
						}},
						{$group : {
							_id : "$customer_id",
							count : {$sum : 1},
						}},
						{$match : {count :{$gt : 1}}},
					]).toArray().then(result=>{
						let orderedCustomer	= result.length;
						let dataArray = [{
							_id		: reportYear+'-'+reportMonth,
							year	: reportYear,
							month	: reportMonth,
							count	: orderedCustomer,
						}];
						callback(null,dataArray);
					}).catch(err=>{
						callback(err);
					});
				},
				repeating_customers :(callback)=>{
					orders.aggregate([
						{$match : {
							order_date 	: {$gte: startDate, $lt: endDate},
							admin_status : Constants.ORDER_DELIVERED
						}},
						{$addFields : {
							year 		: {$year: "$order_date" },
							year_month	: { $dateToString: { format: "%Y-%m", date: "$order_date", timezone: Constants.DEFAULT_TIME_ZONE }}
						}},
						{$group : {
							_id : {
								year_month : "$year_month",
								customer_id : "$customer_id"
							},
							year_month  : {$first : "$year_month"},
							year  		: {$first : { "$year": "$order_date"}},
							month 		: {$first : { "$month": "$order_date"}},
							order_count : {$sum : 1},
						}},
						{$match : {order_count :{$gt : 1}}},
						{$group : {
							_id 	: "$year_month",
							year  	: {$first : "$year"},
							month 	: {$first : "$month"},
							count 	: {$sum : 1},
						}},
					]).toArray().then(result=>{
						callback(null,result);
					}).catch(err=>{
						callback(err);
					});
				},
				winback_customers :(callback)=>{
					let orderCutoffdate	= Helper.newDate(reportYear+"-"+(reportMonth - 6)+"-01");
					switch(reportMonth){
						case 6:
							orderCutoffdate	= Helper.newDate((reportYear-1)+"-12-01");
						break;
						case 5:
							orderCutoffdate	= Helper.newDate((reportYear-1)+"-11-01");
						break;
						case 4:
							orderCutoffdate	= Helper.newDate((reportYear-1)+"-10-01");
						break;
						case 3:
							orderCutoffdate	= Helper.newDate((reportYear-1)+"-9-01");
						break;
						case 2:
							orderCutoffdate	= Helper.newDate((reportYear-1)+"-8-01");
						break;
						case 1:
							orderCutoffdate	= Helper.newDate((reportYear-1)+"-7-01");
						break;
					}

					orders.aggregate([
						{$match : {
							order_date : {$gte: orderCutoffdate, $lt: endDate},
							admin_status: Constants.ORDER_DELIVERED,
						}},
						{$addFields : {
							year_month	: { $dateToString: { format: "%Y-%m", date: "$order_date", timezone: Constants.DEFAULT_TIME_ZONE }}
						}},
						{$group : {
							_id : {
								year_month : "$year_month",
							},
							customer_ids: {$addToSet : "$customer_id"},
							year_month  : {$first : "$year_month"},
							year  		: {$first : { "$year": "$order_date"}},
							month 		: {$first : { "$month": "$order_date"}},
						}},
						{$sort : {year_month : Constants.SORT_ASC}}
					],{ allowDiskUse: true}).toArray().then(result=>{
						
						let customerLists = {};
						result.map(record=>{
							customerLists[record.year_month] = record.customer_ids.map(rec=>{ return String(rec)});
						});
						let winbackUsers = {};
						result.map(record=>{
							let currentYearMonth	= record.year_month;
							let lastMonth			= (record.month-1) < 10 ? "0"+(record.month-1) : record.month-1;
							let lastYearMonth		= (record.month == 1 ? (record.year-1) : record.year)+"-"+lastMonth;
							let reportStartDate		= reportYear+"-"+reportMonth+"-01";
							if(record.year == reportYear && record.month == reportMonth){
								if(!winbackUsers[currentYearMonth]) winbackUsers[currentYearMonth] = {month : record.month,year : record.year,customers : []};

								record.customer_ids.map(cid=>{
									if(!customerLists[lastYearMonth] || ( customerLists[lastYearMonth] && customerLists[lastYearMonth].indexOf(String(cid))) == -1){
										let orderInSixMonth  = false;
										let tmpReportYear	 = reportYear;
										for(i=2; i<= 6; i++){
											let prevMonth	= (record.month-i) < 10 ? "0"+(record.month-i) : record.month-i;
											let prevYearMonth= tmpReportYear+"-"+prevMonth;
											if(prevMonth == "01") tmpReportYear--;

											if(customerLists[prevYearMonth] && customerLists[prevYearMonth].indexOf(String(cid)) != -1){
												orderInSixMonth = true;
											}
										}
										if(orderInSixMonth) winbackUsers[currentYearMonth].customers.push(String(cid));
									}
								});
							}
						});
						callback(null,Object.values(winbackUsers));
					}).catch(err=>{
						callback(err);
					});
				},
			},(err, response)=>{
				
				
				let yearWiseData 	= {};
				response?.customer_without_order?.map(record=>{
					let tmpKey	= record.year+"-"+record.month;
					let tmpDate = Helper.getUtcDate(record.year+"-"+record.month+"-01 00:00:00");
					if(!yearWiseData[tmpKey]) yearWiseData[tmpKey] = {};
					yearWiseData[tmpKey]["year"]	= record.year;
					yearWiseData[tmpKey]["month"]	= record.month;
					yearWiseData[tmpKey]["date"]	= tmpDate;
					yearWiseData[tmpKey]["customer_without_order"] = record.count;
				});
				response?.multi_order_customer?.map(record=>{
					let tmpKey	= record.year+"-"+record.month;
					let tmpDate = Helper.getUtcDate(record.year+"-"+record.month+"-01 00:00:00");
					if(!yearWiseData[tmpKey]) yearWiseData[tmpKey] = {};
					yearWiseData[tmpKey]["year"]	= record.year;
					yearWiseData[tmpKey]["month"]	= record.month;
					yearWiseData[tmpKey]["date"]	= tmpDate;
					yearWiseData[tmpKey]["multi_order_customer"] = record.count;
				});

				response?.repeating_customers?.map(record=>{
					let tmpKey	= record.year+"-"+record.month;
					let tmpDate = Helper.getUtcDate(record.year+"-"+record.month+"-01 00:00:00");
					if(!yearWiseData[tmpKey]) yearWiseData[tmpKey] = {};
					yearWiseData[tmpKey]["year"]	= record.year;
					yearWiseData[tmpKey]["month"]	= record.month;
					yearWiseData[tmpKey]["date"]	= tmpDate;
					yearWiseData[tmpKey]["repeating_customers"] = record.count;
				});
				response?.winback_customers?.map(record=>{
					let tmpKey	= record.year+"-"+record.month;
					let tmpDate = Helper.getUtcDate(record.year+"-"+record.month+"-01 00:00:00");
					if(!yearWiseData[tmpKey]) yearWiseData[tmpKey] = {};
					yearWiseData[tmpKey]["year"]	= record.year;
					yearWiseData[tmpKey]["month"]	= record.month;
					yearWiseData[tmpKey]["date"]	= tmpDate;
					yearWiseData[tmpKey]["winback_customers"] = record.customers.length;
				});

				const monthly_customer_breakdown = this.db.collection(Tables.MONTHLY_CUSTOMER_BREAKDOWN);
				asyncForEachOf(yearWiseData, (records, key, childEachCallback)=> {
					if(!records.customer_without_order)	records.customer_without_order	= 0;
					if(!records.multi_order_customer)	records.multi_order_customer	= 0;
					if(!records.repeating_customers)	records.repeating_customers		= 0;
					if(!records.winback_customers)		records.winback_customers		= 0;
					;
					monthly_customer_breakdown.updateOne({
						year_month : key
					},
					{
						$set : records,
						$setOnInsert : {created : Helper.getUtcDate()}
					},{upsert : true}).then(()=>{
						childEachCallback(null);
					}).catch(err=>{
						childEachCallback(err);
					});
				},(err)=>{
					if(err) console.error("Error in saveCustomerBreakdownReport",err);
				});
			});
		} catch (error) {
			console.error("Error in saveCustomerBreakdownReport",error);
		}
	};//End saveCustomerBreakdownReport()

	/**
	 * Function to save average basket size reports
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return render
	 */
	async saveAverageBasketSizeReport (req, res, next) {
		/** Send response to client and work in background */
		res.render('blank', { layout: false });

		let numberOfDays = (req.params.days) ? parseInt(req.params.days) : 2;
		if (numberOfDays <= 0 || isNaN(numberOfDays)) numberOfDays = 2;

		let hoursInADay 	= numberOfDays * Constants.HOURS_IN_A_DAY;
		let tempStartDate 	= Helper.newDate(Helper.subtractDate(hoursInADay));
		let startDate 		= Helper.newDate(tempStartDate, Constants.DATABASE_DATE_FORMAT);
		startDate 			= Helper.newDate(startDate + " " + Constants.START_DATE_TIME_FORMAT);
		let endDate 		= Helper.newDate(Helper.newDate("", Constants.CURRENTDATE_START_DATE_FORMAT));
		
		const orders 					= this.db.collection(Tables.ORDERS);
		const order_items 				= this.db.collection(Tables.ORDER_ITEMS);
		const avg_basket_size_reports 	= this.db.collection(Tables.AVG_BASKET_SIZE_REPORTS);

		let datesArray = Helper.getDateRange(startDate, endDate);
		eachOfSeries(datesArray, (tmpDate, key, seariesCallback) => {
			let tmpCurrentDate = Helper.newDate(tmpDate, Constants.DATABASE_DATE_FORMAT);
			let tmpStartDate = Helper.newDate(tmpCurrentDate + " " + Constants.START_DATE_TIME_FORMAT);
			let tmpEndDate = Helper.newDate(tmpCurrentDate + " " + Constants.END_DATE_TIME_FORMAT);

			orders.aggregate([
				{$match: {
					order_date	: { $gte: tmpStartDate, $lt: tmpEndDate },
					admin_status: Constants.ORDER_DELIVERED
				}},
				{$project: {_id: 1, admin_status: 1 }},
			]).toArray().then(result => {

				let orderIds = result.map(record => {
					return new ObjectId(record._id);
				});

				order_items.aggregate([
					{$match: { order_id: { $in: orderIds } } },
					{$lookup: { /** Get order details **/
						"from"			: Tables.ORDERS,
						"localField"	: "order_id",
						"foreignField"	: "_id",
						"as"			: "order_detail"
					}},
					{$addFields: {
						order_date		: { $arrayElemAt: ["$order_detail.order_date", 0] },
						restaurant_id	: { $arrayElemAt: ["$order_detail.restaurant_id", 0] },
						restaurant_name	: { $arrayElemAt: ["$order_detail.restaurant_name", 0] },
						branch_id		: { $arrayElemAt: ["$order_detail.branch_id", 0] },
					}},
					{$group: {
						_id: {
							year_month_date: { $dateToString: { format: "%Y-%m-%d", date: "$order_date", timezone: Constants.DEFAULT_TIME_ZONE } },
							restaurant_id:"$restaurant_id",
							branch_id:"$branch_id"
						},
						year			: { $first: { "$year": "$order_date" } },
						month			: { $first: { "$month": "$order_date" } },
						items			: { $sum: "$qty"},
						order_ids		: { $addToSet: "$order_id" },
						order_date 		: {$first : "$order_date"},
						restaurant_name	: { $first: "$restaurant_name" },
						restaurant_id	: { $first: "$restaurant_id" },
						branch_id		: { $first: "$branch_id" },
					}},
				]).toArray().then(result => {
					if (!result?.length) return seariesCallback(null);
					
					asyncEach(result, (records, eachCallback) => {
						let created 	= records.order_date;
						let createdDate = Helper.newDate(created, Constants.DATABASE_DATE_FORMAT);
						let createdStart= Helper.newDate(createdDate + " " + Constants.START_DATE_TIME_FORMAT);
						let createdEnd 	= Helper.newDate(createdDate + " " + Constants.END_DATE_TIME_FORMAT);
						let tmpItems 	= (records.items) ? records.items : 0;
						let orderCount 	= (records.order_ids) ? records.order_ids.length : 0;
						let avgSize 	= (tmpItems && orderCount) ? Math.round(tmpItems / orderCount) : 0;

						avg_basket_size_reports.updateOne({
							restaurant_id: new ObjectId(records.restaurant_id),
							branch_id	: new ObjectId(records.branch_id),
							date: {
								$gte: Helper.newDate(createdStart),
								$lte: Helper.newDate(createdEnd)
							}},
							{
								$set: {
									total_orders	: orderCount,
									total_items		: tmpItems,
									avg_size 		: avgSize,
									restaurant_name	: records.restaurant_name,
								},
								$setOnInsert: {
									date	: records.order_date,
									created	: Helper.getUtcDate(),
								}
							}, { upsert: true }).then(() => {
								eachCallback(null);
							}).catch(err => {
								eachCallback(err);
							});
					}, (childEachErr) => {
						if (childEachErr) console.error("Error in saveOperationReport eachCallback",childEachErr);
						
						seariesCallback(null);
					});
				}).catch(err => {
					console.error("Error in saveAverageBasketSizeReport find order items",err);
				});
			}).catch(err => {
				console.error("Error in saveAverageBasketSizeReport orders find",err);
			});
		}, () => {});
	};//End saveAverageBasketSizeReport()

	/**
	 * Function to save captain wise orders
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return render
	 */
	async saveCaptainWiseOrders (req, res,next){
		/** Send response to client and work in background */
		res.render('blank', { layout: false });

		let numberOfDays 	   = (req.params.days) ? parseInt(req.params.days) :2;
		if(numberOfDays <= 0 || isNaN(numberOfDays)) numberOfDays = 2;

		let hoursInADay   =  numberOfDays*Constants.HOURS_IN_A_DAY;
		let tempStartDate =  Helper.newDate(Helper.subtractDate(hoursInADay));
		let startDate     =  Helper.newDate(tempStartDate,Constants.DATABASE_DATE_FORMAT);
		startDate  	      =  Helper.newDate(startDate+" "+Constants.START_DATE_TIME_FORMAT);
		let endDate  	  =  Helper.newDate(Helper.newDate("",Constants.CURRENTDATE_START_DATE_FORMAT));

		const orders  	  					=  this.db.collection(Tables.ORDERS);
		const captain_wise_processed_orders	=  this.db.collection(Tables.CAPTAIN_WISE_PROCESSED_ORDERS);
		const driver_in_out_shifts = this.db.collection(Tables.DRIVER_IN_OUT_SHIFTS);

		let datesArray = Helper.getDateRange(startDate, endDate);
		eachOfSeries(datesArray, (tmpDate, key, seariesCallback) => {
			let tmpCurrentDate = Helper.newDate(tmpDate, Constants.DATABASE_DATE_FORMAT);
			let tmpStartDate = Helper.newDate(tmpCurrentDate + " " + Constants.START_DATE_TIME_FORMAT);
			let tmpEndDate = Helper.newDate(tmpCurrentDate + " " + Constants.END_DATE_TIME_FORMAT);

			asyncParallel({
				orders_count: (callback) => {
					orders.aggregate([
						{$match :{
							order_date		: { $gte: tmpStartDate, $lt: tmpEndDate },
							captain_id		: {$ne : ""},
							admin_status 	: Constants.ORDER_DELIVERED
						}},
						{$group :{
							_id : {
								captain_id 	: "$captain_id",
								date 		: { $dateToString: { format: "%Y-%m-%d", date: "$order_date", timezone: Constants.DEFAULT_TIME_ZONE }}
							},
							captain_id 		: {$first : "$captain_id"},
							order_date   	: {$first : "$order_date"},
							orders			: {$sum : 1},
							delayed_orders	: {$sum: {
								$cond: [
									{$and : [ { $eq: [  "$is_delayed", true]}]},
									1,
									0
								]
							}},
						}},
					]).toArray().then(result => {
						callback(null, result);
					}).catch(err => {
						callback(err, []);
					});
				},
				working_hours: (callback) => {
					driver_in_out_shifts.aggregate([
						{$match :{
							created	: { $gte: tmpStartDate, $lt: tmpEndDate },
							type	: Constants.OUT_SHIFT
						}},
						{$group :{
							_id : {
								captain_id : "$driver_id",
								date : { $dateToString: { format: "%Y-%m-%d", date: "$created", timezone: Constants.DEFAULT_TIME_ZONE }}
							},
							captain_id: { $first: "$driver_id"},
							created: { $first: "$created"},
							shifts : {$push : {
								created: "$created",
								modified: "$modified",
							}}
						}},
					]).toArray().then(result => {
						if(result){
							result.map(record=>{
								let difference = 0;
								record.shifts.map(shift=>{
									let tmpCreated 	=	Helper.newDate(Helper.newDate(shift.created, "yyyy/MM/dd HH:MM:00"));
									let tmpModified	= 	Helper.newDate(Helper.newDate(shift.modified, "yyyy/MM/dd HH:MM:00"));
									difference += Helper.getDifferenceBetweenTwoDatesInMinute(tmpCreated,tmpModified);
								});
								record.working_minutes = Math.round(difference);
								record.working_hours = Math.round(difference/Constants.MINUTES_IN_A_HOUR);
							});
						}
						callback(null, result);
					}).catch(err => {
						callback(err, []);
					});
				}
			}, (err, response) => {
				if(err){
					console.error("Error in saveCaptainWiseOrders",err);
					return seariesCallback(null);
				}

				let orderCount   = (response.orders_count) ? response.orders_count :[];
				let workingHours = (response.working_hours) ? response.working_hours : [];
				asyncParallel({
					save_orders_count: (childCallback) => {
						if(!orderCount || orderCount.length ==0) return childCallback(null);

						eachOfSeries(orderCount, (records, key,eachCallback)=> {
							let created			=	records.order_date;
							let createdDate		=  	Helper.newDate(created,Constants.DATABASE_DATE_FORMAT);
							let createdStart	=	Helper.newDate(createdDate+" "+Constants.START_DATE_TIME_FORMAT);
							let createdEnd		=	Helper.newDate(createdDate+" "+Constants.END_DATE_TIME_FORMAT);

							captain_wise_processed_orders.updateOne({
								captain_id : new ObjectId(records.captain_id),
								date      : {
									$gte: Helper.newDate(createdStart),
									$lte: Helper.newDate(createdEnd)
								},
							},
							{
								$set : {
									delayed_orders : (records.delayed_orders) ? parseInt(records.delayed_orders) : 0,
									orders		: (records.orders) ? parseInt(records.orders) : 0,
								},
								$setOnInsert : {
									date			: records.order_date,
									working_minutes : 0,
									working_hours 	: 0,
									created			: Helper.getUtcDate(),
								}
							},{upsert : true}).then(() => {
								eachCallback(null);
							}).catch(err => {
								eachCallback(err);
							});
						},(childEachErr)=>{
							childCallback(childEachErr);
						});
					},
				}, (childErr) => {
					if(childErr){
						console.error("Error in child Parallel saveCaptainWiseOrders",childErr);
						return seariesCallback(null);
					}

					if(workingHours && workingHours.length > 0){
						/** Update driver wise orders*/
						eachOfSeries(workingHours, (records, key,eachCallback)=> {
							let created			=	records.created;
							let createdDate		=  	Helper.newDate(created,Constants.DATABASE_DATE_FORMAT);
							let createdStart	=	Helper.newDate(createdDate+" "+Constants.START_DATE_TIME_FORMAT);
							let createdEnd		=	Helper.newDate(createdDate+" "+Constants.END_DATE_TIME_FORMAT);

							captain_wise_processed_orders.updateOne({
								captain_id : new ObjectId(records.captain_id),
								date      : {
									$gte: Helper.newDate(createdStart),
									$lte: Helper.newDate(createdEnd)
								},
							},
							{
								$set : {
									working_minutes: (records.working_minutes) ? Helper.round(records.working_minutes) : 0,
									working_hours: (records.working_hours) ? Helper.round(records.working_hours) : 0,
								},
								$setOnInsert : {
									date			: records.created,
									orders			: 0,
									delayed_orders 	: 0,
									created			: Helper.getUtcDate(),
								}
							},{upsert : true}).then(() => {
								eachCallback(null);
							}).catch(err => {
								eachCallback(err);
							});
						},(childEachErr)=>{
							if(childEachErr) console.error("Error in child series saveCaptainWiseOrders",childEachErr);
							seariesCallback(null);
						});
					}else{
						seariesCallback(null);
					}
				});
			});
		}, (eachErr) => {
			if (eachErr) {
				console.error("async each error in saveCaptainWiseOrders",eachErr);
			}
		});
	};//End saveCaptainWiseOrders()	

	/**
	 * Function to save customer order reports
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return render
	 */
	async saveCustomerOrderStatsReport (req, res, next){
		/** Send response to client and work in background */
		res.render('blank', { layout: false });

		this.saveCronLogs(req, res, next, {method_name: "saveCustomerOrderStatsReport"});

		let numberOfDays = (req.params.days) ? parseInt(req.params.days) : 2;
		if (numberOfDays <= 0 || isNaN(numberOfDays)) numberOfDays = 2;

		let hoursInADay 	= numberOfDays * Constants.HOURS_IN_A_DAY;
		let tempStartDate 	= Helper.newDate(Helper.subtractDate(hoursInADay));
		let startDate 		= Helper.newDate(tempStartDate, Constants.DATABASE_DATE_FORMAT);
		startDate 			= Helper.newDate(startDate + " " + Constants.START_DATE_TIME_FORMAT);
		let endDate 		= Helper.newDate(Helper.newDate("", Constants.CURRENTDATE_START_DATE_FORMAT));

		const orders 				= this.db.collection(Tables.ORDERS);
		const customer_order_stats 	= this.db.collection(Tables.CUSTOMER_ORDER_STATS);

		let datesArray = Helper.getDateRange(startDate, endDate);
		eachOfSeries(datesArray, (tmpDate, key, seariesCallback) => {
			let tmpCurrentDate = Helper.newDate(tmpDate, Constants.DATABASE_DATE_FORMAT);
			let tmpStartDate = Helper.newDate(tmpCurrentDate + " " + Constants.START_DATE_TIME_FORMAT);
			let tmpEndDate = Helper.newDate(tmpCurrentDate + " " + Constants.END_DATE_TIME_FORMAT);

			orders.aggregate([
				{$match: {
					order_date	: { $gte: tmpStartDate, $lt: tmpEndDate },
					admin_status: Constants.ORDER_DELIVERED
				}},
				{$group : {
					_id 			: "$customer_id",
					total_orders 	: {$sum : 1},
					total_amount	: {$sum : "$order_price"},
					customer_id		: {$first : "$customer_id"},
					order_date		: {$first : "$order_date"},
				}}
			]).toArray().then(result => {
				if (result.length == 0) return seariesCallback(null);				
				
				asyncEach(result, (records, eachCallback) => {
					let created 	= records.order_date;
					let createdDate = Helper.newDate(created, Constants.DATABASE_DATE_FORMAT);
					let createdStart= Helper.newDate(createdDate + " " + Constants.START_DATE_TIME_FORMAT);
					let createdEnd 	= Helper.newDate(createdDate + " " + Constants.END_DATE_TIME_FORMAT);
					let orderCount 	= (records.total_orders) ? parseFloat(records.total_orders) : 0;
					let totalAmount = (records.total_amount) ? parseFloat(records.total_amount) : 0;
					let avgValue 	= (orderCount && totalAmount) ? Helper.round(totalAmount / orderCount) : 0;

					customer_order_stats.updateOne({
						customer_id: new ObjectId(records.customer_id),
						date: {
							$gte: Helper.newDate(createdStart),
							$lte: Helper.newDate(createdEnd)
						}
					},
					{
						$set: {
							total_orders	: orderCount,
							total_amount	: totalAmount,
							avg_order_value	: avgValue
						},
						$setOnInsert: {
							date	: records.order_date,
							created	: Helper.getUtcDate(),
						}
					}, { upsert: true }).then(() => {
						eachCallback(null);
					}).catch(err => {
						eachCallback(err);
					});
				}, (childEachErr) => {
					if (childEachErr) {
						console.error("Error in saveCustomerOrderStatsReport eachCallback",childEachErr);
					}

					seariesCallback(null);
				});
			}).catch(err => {
				console.error("Error in saveCustomerOrderStatsReport find",err);				
				return seariesCallback(null);				
			});
		}, (eachErr) => {
			if (eachErr) {
				console.error("Error at eachErr in saveCustomerOrderStatsReport",eachErr);
			}
		});
	};//End saveCustomerOrderStatsReport()		
	
	/**
	 * Function to save abandoned carts reports
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return render
	 */
	async saveAbandonedCartsReport (req, res,next, options) {
		if(!options?.cart_ids?.length) return {status: Constants.STATUS_SUCCESS};
		
		const user_carts = this.db.collection(Tables.USER_CARTS);
		user_carts.aggregate([
			{$match: { 
				_id: { $in: Helper.arrayToObject(options.cart_ids) }
			}},
			{$lookup: {
				"from"			: Tables.USERS,
				"localField"	: "customer_id",
				"foreignField"	: "_id",
				"as"			: "user_detail"
			}},
			{$lookup: {
				"from"			: Tables.RESTAURANTS,
				"localField"	: "restaurant_id",
				"foreignField"	: "_id",
				"as"			: "restaurant_detail"
			}},
			{$lookup: {
				"from"			: Tables.RESTAURANT_BRANCHES,
				"localField"	: "branch_id",
				"foreignField"	: "_id",
				"as"			: "branch_detail"
			}},
			{$lookup: {
				"from"			: Tables.ITEMS,
				"localField"	: "item_id",
				"foreignField"	: "_id",
				"as"			: "item_detail"
			}},
			{$group: {
				_id: {
					customer_id		: "$customer_id",
					restaurant_id	: "$restaurant_id",
					branch_id		: "$branch_id"
				},
				cart_ids			: { $push: "$_id" },
				customer_id			: { $first: "$customer_id" },
				branch_id			: { $first: "$branch_id" },
				item_id				: { $push: "$item_id" },
				restaurant_id		: { $first: "$restaurant_id"},
				user_name			: { $first: {$arrayElemAt: ["$user_detail.full_name", 0] } },
				customer_mobile		: { $first: {$arrayElemAt: ["$user_detail.mobile_number", 0] } },
				restaurant_name		: { $first: {$arrayElemAt: ["$restaurant_detail.name", 0] } },
				branch_name			: { $first: {$arrayElemAt: ["$branch_detail.name", 0] } },
				item_name			: { $push: {$arrayElemAt: ["$item_detail.name", 0] } },
			}},
		]).toArray().then(result => {
			if(!result?.length) return {status: Constants.STATUS_SUCCESS};			
						
			const abandoned_carts_reports 	= this.db.collection(Tables.ABANDONED_CARTS_REPORTS);
			asyncEach(result, (records, eachCallback) => {
				abandoned_carts_reports.insertOne({
					customer_mobile	: records.customer_mobile,
					customer_id		: records.customer_id,
					cart_ids		: Helper.arrayToObject(records.cart_ids),
					customer_name	: records.user_name,
					restaurant_name	: records.restaurant_name,
					restaurant_id	: records.restaurant_id,
					branch_name		: records.branch_name,
					item_id			: records.item_id,
					item_name		: records.item_name,
					branch_id		: records.branch_id,
					pn_status		: Constants.SENT,
					order_posting_status: Constants.NOT_ORDERED,
					created			: Helper.getUtcDate(),
				}).then(() => {
					eachCallback(null);
				}).catch(err => {
					eachCallback(err);
				});
			}, (eachErr) => {
				if(eachErr) console.error("Error in each of series at saveAbandonedCartsReport",eachErr);

				return {status: Constants.STATUS_SUCCESS};
			});
		}).catch(err => {
			console.error("Error in saveAbandonedCartsReport",err);

			return {status: Constants.STATUS_SUCCESS};
		});
	};//End saveAbandonedCartsReport()
}