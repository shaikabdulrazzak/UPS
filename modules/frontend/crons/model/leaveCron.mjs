import { ObjectId } from 'mongodb';
import clone from 'clone';
import { parallel as asyncParallel, eachOfSeries, each as asyncEach} from 'async';
import * as Constants from "../../../../config/global_constant.mjs";
import Tables from '../../../../config/database_tables.mjs';
import * as Helper from "../../../../utils/index.mjs";


export default class LeaveCron {
    constructor(db) {
        this.db = db;  
    }

    /**
	 * Function to update user leave (frequency time: 1st day of each month )
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 *
	 * @return render
	 */
	async updateUserLeave (req, res,next){
        /** Send response to client and work in background */
		res.render('blank',{layout:false});

		const users 			= 	this.db.collection(Tables.USERS);
		const user_leaves		=	this.db.collection(Tables.USER_LEAVES);
		const leave_types		=	this.db.collection(Tables.LEAVE_TYPES);
		const user_leave_logs	=	this.db.collection(Tables.USER_LEAVE_LOGS);
		let currentMonthName	= 	Helper.newDate('',Constants.MONTH_DATE_FORMAT).toLowerCase();
		let todaysDate			= 	Helper.newDate("",Constants.DAY_DATE_FORMAT);

		asyncParallel({
			lapse_leave : (callback)=>{
				if(currentMonthName != Constants.FIRST_MONTH_NAME || todaysDate != 1) return callback(null);

				/** Get user leave list */
				user_leaves.find({
					"leaves.leaves" : {$gt :0}
				},{projection: {_id: 1, user_id :1, leaves: 1, parent_id:1}}).toArray().then(result=>{
					if(!result || result.length <=0) return callback(null);

					eachOfSeries(result,(leaveData, firstKey, firstCallback)=>{

						eachOfSeries(leaveData.leaves,(leaveRecords, childKey, firstChildCallback)=>{
							/** Decrease user leaves **/
							this.decrementOrIncrementUserLeave(req, res,{
								type 		:	Constants.DEBIT,
								parent_id 	: 	leaveData?.parent_id || "",
								user_id 	: 	leaveData?.user_id || "",
								leave_count : 	leaveRecords?.leaves || 0,
								leave_type 	: 	leaveRecords?.leave_type || ""
							}).then(()=>{
								firstChildCallback(null);
							}).catch(err=>{
								firstChildCallback(err);
							});
						},firstChildEachErr=>{
							firstCallback(firstChildEachErr);
						});
					},(firstEachErr)=>{
						callback(firstEachErr);
					});
				}).catch(err=>{
					callback(err);
				});
			},
			leave_type_list : (callback)=>{
				/** Check leave is details exists of this user */
				Helper.getAttributes(req,res,next,{type: "vacation_leave_type", is_show: true}).then(leaveType=>{
					callback(null,leaveType);
				}).catch(next);
			},
		},async (asyncFirstErr,asyncFirstResponse)=>{
			if(asyncFirstErr){
				console.error("Error On Crons updateUserLeave first parallel",asyncFirstErr);
			}

            try{
                let leaveTypeList = asyncFirstResponse?.leave_type_list || [];
    
                /** Get leave type list **/
                let result = await leave_types.find({},{projection: {type: 1, frequency: 1, leaves: 1,role_id:1,team_head:1,user_id:1}}).toArray();
				
                if(result && result.length >0 && leaveTypeList.length >0){    
                    eachOfSeries(result,(records, parentkey, parentCallback)=>{
                        
                        /** Get total leaves according to frequency */
                        let totalLeave = 0;
                        if(records.frequency == Constants.MONTHLY && Constants.FREQUENCY_MONTH_LIST[Constants.MONTHLY].indexOf(currentMonthName) != -1) totalLeave = parseInt(records.leaves);
                        if(records.frequency == Constants.QUATERLY && Constants.FREQUENCY_MONTH_LIST[Constants.QUATERLY].indexOf(currentMonthName) != -1) totalLeave = parseInt(records.leaves);
                        if(records.frequency == Constants.HALF_YEARLY && Constants.FREQUENCY_MONTH_LIST[Constants.HALF_YEARLY].indexOf(currentMonthName) != -1) totalLeave = parseInt(records.leaves);

						if(totalLeave <= 0) return parentCallback(null);

                        /** Set common conditions */
                        let userConditions = clone(Constants.ADMIN_USER_COMMON_CONDITIONS);

                        /** Add role id conditions  */
                        if(records.role_id == 0){
                            userConditions.user_role_id = {$ne: Constants.CRAVEZ};
                        }else{
                            userConditions.user_role_id = records.role_id;
                        }

                        /** Add team head conditions  */
                        if(typeof records.team_head !== typeof undefined) userConditions.team_head = records.team_head;

                        /** Add user id conditions  */
                        if(records.user_id){
                            let userIdArray =	(records.user_id.constructor !== Array)	? [records.user_id] :records.user_id;
                            userIdArray		=	Helper.arrayToObject(userIdArray);

                            userConditions._id = {$in :userIdArray};
                        }

                        let finalConditions = {
                            $or : [
                                userConditions,
                                clone(Constants.DRIVER_COMMON_CONDITIONS)
                            ]
                        };

                        /** Get user list **/
                        users.find(finalConditions,{projection: {_id:1, parent_id:1,user_role_id : 1 }}).toArray().then(userResult=>{
							if(!userResult || userResult.length <=0) return parentCallback(null);

                            eachOfSeries(userResult,(userData, childkey, childCallback)=>{

                                asyncParallel({
                                    old_data_count : (secondParallelCallback)=>{
                                        /** Check leave is add or not this current month */
                                        user_leave_logs.countDocuments({
                                            user_id 	:	userData._id,
                                            leave_type 	:	records.type,
                                            type 		:	Constants.CREDIT,
                                            month 		:	Helper.getUtcDate('',Constants.MONTH_DATE_FORMAT),
                                            year 		:	Helper.getUtcDate('',Constants.YEAR_DATE_FORMAT)
                                        }).then(contResult=>{
                                            secondParallelCallback(null,contResult);
                                        }).catch(err=>{
                                            secondParallelCallback(err);
                                        });
                                    },
                                    check_leave_records_exits : (secondParallelCallback)=>{
                                        /** Check leave is details exists of this user */
                                        user_leaves.countDocuments({
                                            user_id :	userData._id,
                                        }).then(contResult=>{
                                            secondParallelCallback(null,contResult);
                                        }).catch(err=>{
                                            secondParallelCallback(err);
                                        });
                                    },
                                },(secondParallelErr,secondParallelResponse)=>{
									if(secondParallelErr  || secondParallelResponse?.old_data_count >0) return childCallback(secondParallelErr);

                                    if(secondParallelResponse?.check_leave_records_exits == 0){
										/** Save leave details  */
                                        let leaveUpdateData = {
                                            user_id 		: userData._id,
                                            user_role_id 	: userData.user_role_id,
                                            parent_id		: (userData.parent_id) ? userData.parent_id :"",
                                            total_leave		: totalLeave,
                                            leaves			: []
                                        };

                                        leaveTypeList.map(leaveTypeRecords=>{
                                            let tempObj = {leave_type: leaveTypeRecords.attribute_id,leaves:0};

                                            if(String(leaveTypeRecords.attribute_id) == String(records.type)) tempObj.leaves = totalLeave;

                                            leaveUpdateData.leaves.push(tempObj);
                                        });

                                        /** Save user leave details */
                                        user_leaves.insertOne(leaveUpdateData).then(()=>{
                                            
                                            /** Save user leave logs **/
                                            this.saveUserLeaveLogs(req, res,{
                                                parent_id 	: 	(userData.parent_id) ? userData.parent_id :"",
                                                user_id 	: 	userData._id,
                                                leave_count : 	totalLeave,
                                                type 		:	Constants.CREDIT,
                                                leave_type 	: 	records.type
                                            }).then(()=>{
                                                childCallback(null);
                                            }).catch(err=>{
                                                childCallback(err);
                                            });
                                        }).catch(err=>{
											childCallback(err);
										});
                                    }else{
										/** Increase user leaves **/
                                        this.decrementOrIncrementUserLeave(req, res,{
                                            type 		:	Constants.CREDIT,
                                            user_id 	: 	userData._id,
                                            parent_id 	: 	(userData.parent_id) ? userData.parent_id :"",
                                            leave_count : 	totalLeave,
                                            leave_type 	: 	records.type
                                        }).then(()=>{
                                            childCallback(null);
                                        }).catch(err=>{
                                            childCallback(err);
                                        });
                                    }
                                });
                            },childEachErr=>{
                                parentCallback(childEachErr);
                            });
                        });
                    },asyncEachErr=>{
                        if(asyncEachErr){
                            console.error("Error On Crons updateUserLeave",asyncEachErr);
                        }
                    });
                }
            }catch(err){
                console.error("Error On Crons updateUserLeave at try catch",err);
            }
		});
	};//End updateUserLeave()

    /**
	 * Function to decrement or increment user leave
	 *
	 * @param req 		As Request Data
	 * @param res 		As Response Data
	 * @param options 	As Object Data
	 *
	 * @return render
	 */
	async decrementOrIncrementUserLeave (req, res,options){
		return new Promise(resolve=>{
            let leaveType 	= 	(options.leave_type)	?	options.leave_type			:"";
			let totalLeave	=	(options.leave_count)	?	options.leave_count			:0;
			let type		=	(options.type)			?	options.type				:Constants.DEBIT;
			let userId 		= 	(options.user_id)		?	new ObjectId(options.user_id)	:"";
			let parentId	=	(options.parent_id)		?	new ObjectId(options.parent_id)	:"";

			/** Send error response */
			if(!userId || !leaveType || !totalLeave) return resolve({status: Constants.STATUS_ERROR, message: res.__("system.missing_parameters") });

			if(type == Constants.DEBIT)  totalLeave = totalLeave*-1;

			/** Decrement or increment user leave */
			const user_leaves =	this.db.collection(Tables.USER_LEAVES);
			user_leaves.updateOne({
				user_id : 	userId,
				leaves	:	{$elemMatch: { leave_type: leaveType } }
			},
            {$inc: {
                "leaves.$.leaves":	totalLeave,
                "total_leave"	:	totalLeave,
            }}).then(()=>{
				
				/** Save user leave logs **/
				this.saveUserLeaveLogs(req, res,{
					type 		:	type,
					user_id 	: 	userId,
					parent_id 	: 	parentId,
					leave_count : 	totalLeave,
					leave_type 	: 	leaveType
				}).then(()=>{

					/** Send success response **/
					resolve({status: Constants.STATUS_SUCCESS });
				}).catch(err=>{
					return resolve({status: Constants.STATUS_ERROR, message: err});
				});
			}).catch(err=>{
				return resolve({status: Constants.STATUS_ERROR, message: err});
			});
		});
	};//End decrementOrIncrementUserLeave()

    /**
	 * Function to save user leave logs
	 *
	 * @param req 		As Request Data
	 * @param res 		As Response Data
	 * @param options 	As Object Data
	 *
	 * @return render
	 */
	async saveUserLeaveLogs (req, res,options){
		return new Promise(resolve=>{
			/** Save user leave logs */
			const user_leave_logs =	this.db.collection(Tables.USER_LEAVE_LOGS);
			user_leave_logs.insertOne({
				parent_id 	: 	(options.parent_id)	? options.parent_id	:"",
				user_id 	: 	options.user_id,
				leave_count : 	options.leave_count,
				type 		:	options.type,
				leave_type 	: 	options.leave_type,
				month 		:	Helper.newDate('',Constants.MONTH_DATE_FORMAT),
				year 		:	Helper.newDate('',Constants.YEAR_DATE_FORMAT),
				created 	:	Helper.getUtcDate(),
			}).then(()=>{
				/** Send success response */
				resolve({status: Constants.STATUS_SUCCESS});
			}).catch(err=>{
				return resolve({status: Constants.STATUS_ERROR, message: err});
			});
		});
	};//End saveUserLeaveLogs()

    /**
	 * Function to lapse user leave (frequency time: every day -12.01 )
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 *
	 * @return render
	 */
	async lapseUserLeave (req, res){
        /** Send response to client and work in background */
		res.render('blank',{layout:false});

		let todayStartDate	=	Helper.newDate('',Constants.DATABASE_DATE_FORMAT);
		todayStartDate		=	Helper.newDate(todayStartDate+" "+Constants.START_DATE_TIME_FORMAT);

		asyncParallel({
			team_leave_details : (parentCallback)=>{
				/** Get user leave list */
				const team_availabilities	=	this.db.collection(Tables.TEAM_AVAILABILITIES);
				team_availabilities.find({
					date 		:	{$lt: todayStartDate },
					leave_type	:	{$exists: true},
					status		:	Constants.PENDING,
					leave_status:	Constants.APPROVED,
				},{projection: {_id: 1, user_id: 1, leave_type: 1, parent_id: 1, date:1}}).toArray().then(result=>{
					if(result?.length <=0) return parentCallback(null);

					if(result && result.length >0){
						eachOfSeries(result,(records, key, seriesCallback)=>{
							let tmpUserId	 	=	(records.user_id)		?	records.user_id		:"";
							let tmpLeaveType 	=	(records.leave_type)	?	records.leave_type	:"";
							let tmpParentId		=	(records.parent_id) 	? 	records.parent_id 	:"";

							asyncParallel({
								leave_update_details : (parallelCallback)=>{
									if(tmpLeaveType == Constants.WEEKLY_OFF) return parallelCallback(null);

									/** Decrease user leaves **/
									this.decrementOrIncrementUserLeave(req, res,{
										type 		:	Constants.DEBIT,
										user_id 	: 	tmpUserId,
										parent_id 	: 	tmpParentId,
										leave_count : 	1,
										leave_type 	: 	tmpLeaveType
									}).then(()=>{
										parallelCallback(null);
									}).catch(err=>{
										parallelCallback(err);
									});
								},
								availability_update_details : (parallelCallback)=>{
									/** Update team availability status  */
									team_availabilities.updateOne({_id : records._id,},{$set: {status : Constants.TAKEN }}).then(()=>{
										parallelCallback(null);
									}).catch(err=>{
										parallelCallback(err);
									});
								},
							},(parallelErr)=>{
								seriesCallback(parallelErr);
							});
						},seriesEachErr=>{
							parentCallback(seriesEachErr);
						});
					}
				}).catch(err=>{
					parentCallback(err);
				});
			},
			driver_leave_details : (parentCallback)=>{
				/** Get driver leave list */
				const driver_availabilities	=	this.db.collection(Tables.DRIVER_AVAILABILITIES);
				driver_availabilities.aggregate([
					{$match: {
						date 		:	{$lt: todayStartDate },
						leave_type	:	{$exists: true},
						status		:	Constants.PENDING,
						leave_status:	Constants.APPROVED,
					}},
					{$group: {
						_id: {
							date	: 	{$dateToString: {format: "%Y-%m-%d", date: "$date", timezone: Constants.DEFAULT_TIME_ZONE }},
							user_id	: 	"$user_id",
						},
						date 		: 	{$first: "$date"},
						user_id 	:	{$first: "$user_id"},
						leave_ids	: 	{$push: "$_id"},
						leave_type 	:	{$first: "$leave_type"},
						parent_id 	:	{$first: "$parent_id"},
					}},
				]).toArray().then(result=>{
					if(result?.length <=0) return parentCallback(null);

					if(result && result.length >0){
						eachOfSeries(result,(records, key, seriesCallback)=>{
							let tmpDate	 		=	(records.date)			?	Helper.newDate(records.date):"";
							let tmpUserId	 	=	(records.user_id)		?	records.user_id		:"";
							let tmpLeaveType 	=	(records.leave_type)	?	records.leave_type	:"";
							let tmpParentId		=	(records.parent_id) 	? 	records.parent_id 	:"";
							let leaveIds		=	(records.leave_ids) 	? 	records.leave_ids 	:[];

							asyncParallel({
								leave_weekly : (parallelCallback)=>{
									if(tmpLeaveType != Constants.WEEKLY_OFF) return parallelCallback(null);

									asyncParallel({
										previous_day_leave : (childCallback)=>{
											let preStartDate   	= 	Helper.newDate(Helper.newDate(Helper.subtractMinuteFromDate(tmpDate,Constants.HOURS_IN_A_DAY*Constants.MINUTES_IN_A_HOUR),Constants.CURRENTDATE_START_DATE_FORMAT));
											let preEndDate		= 	Helper.newDate(Helper.newDate(preStartDate,Constants.CURRENTDATE_END_DATE_FORMAT));

											driver_availabilities.find({
												user_id 	:	tmpUserId,
												date 		:	{$gte: preStartDate, $lte: preEndDate},
												leave_type	:	{$exists: true},
												leave_status:	Constants.APPROVED,
												status 		:	Constants.TAKEN
											},{projection: {_id:1}}).toArray().then(leaveResult=>{
												childCallback(null, leaveResult);
											}).catch(err=>{
												childCallback(err);
											});
										},
										next_day_leave : (childCallback)=>{
											let tmpStartDate   	= 	Helper.newDate(Helper.newDate(Helper.addDaysToDate(Constants.HOURS_IN_A_DAY, tmpDate),Constants.CURRENTDATE_START_DATE_FORMAT));
											let tmpEndDate		= 	Helper.newDate(Helper.newDate(tmpStartDate,Constants.CURRENTDATE_END_DATE_FORMAT));

											driver_availabilities.find({
												user_id 	:	tmpUserId,
												date 		:	{$gte: tmpStartDate, $lt: tmpEndDate},
												leave_type	:	{$exists: true},
												leave_status:	Constants.APPROVED,
												status 		:	Constants.TAKEN
											},{projection: {_id:1}}).toArray().then(leaveResult=>{
												childCallback(null, leaveResult);
											}).catch(err=>{
												childCallback(err);
											});
										},
									},(childParallelErr, childParallelRes)=>{
										
                                        if(childParallelRes?.previous_day_leave?.length > 0 && childParallelRes?.next_day_leave?.length > 0){

											/** Decrease user leaves **/
											this.decrementOrIncrementUserLeave(req, res,{
												type 		:	Constants.DEBIT,
												user_id 	: 	tmpUserId,
												parent_id 	: 	tmpParentId,
												leave_count : 	1,
												leave_type 	: 	tmpLeaveType
											}).then(()=>{
												parallelCallback(null);
											}).catch(err=>{
												parallelCallback(err);
											});
										}else{
											parallelCallback(childParallelErr);
										}
									});
								},
								leave_update_details : (parallelCallback)=>{
									if(tmpLeaveType == Constants.WEEKLY_OFF) return parallelCallback(null);

									/** Decrease user leaves **/
									this.decrementOrIncrementUserLeave(req, res,{
										type 		:	Constants.DEBIT,
										user_id 	: 	tmpUserId,
										parent_id 	: 	tmpParentId,
										leave_count : 	1,
										leave_type 	: 	tmpLeaveType
									}).then(()=>{
										parallelCallback(null);
									}).catch(err=>{
										parallelCallback(err);
									});
								},
								availability_update_details : (parallelCallback)=>{
									/** Update team availability status  */
									driver_availabilities.updateMany({_id: {$in: leaveIds }},{$set: {status: Constants.TAKEN }}).then(()=>{
										parallelCallback(null);
									}).catch(err=>{
										parallelCallback(err);
									});
								},
							},(parallelErr)=>{
								seriesCallback(parallelErr);
							});
						},seriesEachErr=>{
							parentCallback(seriesEachErr);
						});
					}
				}).catch(err=>{
					parentCallback(err);
				});
			},
		},(parallelErr)=>{
			if(parallelErr){
				console.error("Error On Crons lapseUserLeave",parallelErr);
			}
		});
	};//End lapseUserLeave()    

	/**
	 * Function to calculate agent performance stats like offered/answered/outbound/abandoned/conformance/aht
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 *
	 * @return render
	 */
	async agentPerformanceStats (req, res, next,options){
		let startDate 	=	options.start_date;
		let endDate 	= 	options.end_date;
		const iAgentPerformanceStat	=	this.db.collection(Tables.I_AGENT_PERFORMANCE_STAT);
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
		]).toArray((err,result)=>{
			if(err) return next(err);
			if(result && result.length > 0){
				asyncEach(result,(data, asyncEachCallback)=>{
					let agentName	=	data.AgentGivenName+' '+data.AgentSurName;
					asyncParallel({
						offered :(callback)=>{
							const avaya_offered	=	db.collection('avaya_offered');
							avaya_offered.insertOne({
								agent_name 		: agentName,
								code 			: data._id,
								date			: getUtcDate(data.Timestamp),
								count 			: data.CallsOffered,
								created			: getUtcDate()
							},(offeredErr)=>{});
							callback(null);
						},
						answered :(callback)=>{
							const avaya_answered	=	db.collection('avaya_answered');
							avaya_answered.insertOne({
								agent_name 		: agentName,
								code 			: data._id,
								date			: getUtcDate(data.Timestamp),
								count 			: data.CallsAnswered,
								created			: getUtcDate()
							},(answeredErr)=>{});
							callback(null);
						},
						outbound :(callback)=>{
							let dnOutboundCalls	=	data.DNInExtCalls + data.DNInIntCalls + data.DNOutExtCalls + data.DNOutIntCalls;
							const avaya_outbound	=	db.collection('avaya_outbound');
							avaya_outbound.insertOne({
								agent_name 		: agentName,
								code 			: data._id,
								date			: getUtcDate(data.Timestamp),
								count 			: dnOutboundCalls,
								created			: getUtcDate()
							},(outboundErr)=>{});
							callback(null);
						},
						abandoned :(callback)=>{
							const avaya_abandoned	=	db.collection('avaya_abandoned');
							avaya_abandoned.insertOne({
								agent_name 		: agentName,
								code 			: data._id,
								date			: getUtcDate(data.Timestamp),
								count 			: data.CallsReturnedToQDueToTimeout,
								created			: getUtcDate()
							},(abandonedErr)=>{});
							callback(null);
						},
						conformance :(callback)=>{
							const avaya_conformance	=	db.collection('avaya_conformance');
							avaya_conformance.insertOne({
								agent_name 		: agentName,
								code 			: data._id,
								date			: getUtcDate(data.Timestamp),
								time			: convertSecondsToTimeFormat(data.LoggedInTime,AVAYA_TIME_FORMAT),
								created			: getUtcDate()
							},(conformanceErr)=>{ });
							callback(null);
						},
						aht :(callback)=>{
							const avaya_aht	=	db.collection('avaya_aht');
							avaya_aht.insertOne({
								agent_name 		: agentName,
								code 			: data._id,
								date			: getUtcDate(data.Timestamp),
								time			: (data.TalkTime) ? convertSecondsToTimeFormat(data.TalkTime / data.CallsAnswered,AVAYA_TIME_FORMAT) : '',
								talk_time		: data.TalkTime,
								calls_answered	: data.CallsAnswered,
								created			: getUtcDate()
							},(ahtErr)=>{ });
							callback(null);
						},
					},(asyncError, asyncResponse)=>{
						if(asyncError) return asyncEachCallback(asyncError);
						asyncEachCallback(null);
					});
				},(asyncErr)=>{
					if(asyncErr) return next(asyncErr);
				});
			}
		});
	}; //end agentPerformanceStats
}