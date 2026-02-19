import { ObjectId } from 'mongodb';
import clone from 'clone';
import fs from 'fs';
import { parallel as asyncParallel, each as asyncEach, eachOfSeries} from 'async';
import * as Constants from "../../../../config/global_constant.mjs";
import Tables from '../../../../config/database_tables.mjs';
import * as Helper from "../../../../utils/index.mjs";
import * as services from "../../../../services/index.mjs";


export default class DriverCron {
    constructor(db) {
        this.db = db;
    }   

    /**
	 * Function to start driver excuses
	 *  Frequency : every 5 to 15 minutes
	 *
	 * @param req 	As	 Request Data
	 * @param res 	As	Response Data
	 * @param next	As 	Callback argument to the middleware function
	 *
	 * @return render driver_excuses
	 */
	async startDriverExcuses (req, res,next){
        /** Send response to client and work in background */
		res.render('blank',{layout:false});

        try {
            let startDate 	=	Helper.newDate(Helper.newDate("",Constants.CURRENTDATE_START_DATE_FORMAT));
            let endDate 	= 	Helper.newDate(Helper.newDate("",Constants.CURRENTDATE_END_DATE_FORMAT));
            let currentTime =	parseFloat(Helper.newDate("",Constants.BREAK_TIME_FORMAT).replace(':','.'));
    
            /** Get driver excuses list */
            const driver_excuses = this.db.collection(Tables.DRIVER_EXCUSES);
            let result = await driver_excuses.find({
                date		:	{$gte: startDate, $lte: endDate},
                status		: 	Constants.APPROVED,
                is_start 	:	{$exists: false},
                from		:	{$lte 	: currentTime},
                is_completed:	false,
            }).toArray();
    
            if(result && result.length >0){
                asyncEach(result,(records, asyncEachCallback)=>{
    
                    /** Update driver excuse start flag  */
                    driver_excuses.updateOne({
                        _id : records._id,
                    },
                    {$set: {
                        is_start 	: 	true,
                        modified	:	getUtcDate()
                    }}).then(()=>{

                        /** Save driver status logs */
                        services.saveDriverStatusLogs(req,res,next,{
                            parent_id 	: records._id,
                            driver_id 	: records.driver_id,
                            type	  	: Tables.DRIVER_EXCUSES,
                            event_type	: Constants.IN_EXCUSE,
                            start_time	: records.from,
                        }).then(()=>{
                            asyncEachCallback(null);
                        }).catch(err=>{
                            asyncEachCallback(err);
                        });
                    }).catch(err=>{
                        asyncEachCallback(err);
                    });
                },(asyncEachErr)=>{
                    if(asyncEachErr){
                        console.error("async each error in startDriverExcuses",asyncEachErr);
                    }
                });
            }        
        } catch (error) {
            console.error("Error in startDriverExcuses try catch",error);
        }

	};//End startDriverExcuses()

    /**
	 * Function to update driver available status
	 *
	 * @param req 	As	 Request Data
	 * @param res 	As	Response Data
	 * @param next	As 	Callback argument to the middleware function
	 *
	 * @return render null
	 */
	async updateDriverAvailableStatus (req, res,next){

        /** Send response to client and work in background */
		res.render('blank',{layout:false});

		const users = this.db.collection(Tables.USERS);
		asyncParallel({
			update_driver_details : (callback)=>{
				let driverUpdateConditions = clone(Constants.DRIVER_COMMON_CONDITIONS);
				driverUpdateConditions.is_online = {$ne: Constants.ONLINE};

				/** Update driver available status  */
				users.updateMany(driverUpdateConditions,
				{$set: {
					is_available: Constants.NOT_AVAILABLE,
				}}).then(()=>{
					callback(null);
				}).catch(err=>{
					callback(err);
				});
			},
			driver_ids : (callback)=>{
				let driverConditions = clone(Constants.DRIVER_COMMON_CONDITIONS);
				driverConditions.is_online = Constants.ONLINE;

				/** Get driver list */
				users.distinct( "_id",driverConditions).then(driverIds=>{
					callback(null, driverIds);
				}).catch(err=>{
					callback(err, []);
				});
			},
		},(parentErr,parentResponse)=>{
			if(parentErr){
				console.error("Parallel Error in updateDriverAvailableStatus",parentErr);
			}

			let driverIds   =   parentResponse?.driver_ids || [];
			let currentDate =	Helper.newDate(Helper.newDate("",Constants.CURRENTDATE_START_DATE_FORMAT));
			let dayEndDate 	= 	Helper.newDate(Helper.newDate("",Constants.CURRENTDATE_END_DATE_FORMAT));
			let currentTime	= 	parseFloat(Helper.newDate("",Constants.EXCUSES_TIME_FORMAT));
			if(driverIds.length > 0){
				asyncParallel({
					driver_breaks : (callback)=>{
						/** Get driver breaks list */
						const driver_breaks = this.db.collection(Tables.DRIVER_BREAKS);
						driver_breaks.find({
							driver_id    : 	{$in: driverIds},
							date         : 	{$gte: currentDate},
							status 		 : 	Constants.APPROVED,
							is_completed :	false,
							$or 		 : 	[
								{start_time: {$gte: currentTime }},
								{start_time: {$lte: currentTime }}
							],
						},{projection: {driver_id:1}}).toArray().then(breakResult=>{
							if(breakResult.length <=0) return callback(null,{});

							let breakList = {};
							breakResult.map(records=>{
								breakList[records.driver_id] = records;
							});
							callback(null,breakList);
						}).catch(err=>{
							callback(err,{});
						});
					},
					driver_excuses : (callback)=>{
						/** Get driver excuses list */
						const driver_excuses = this.db.collection(Tables.DRIVER_EXCUSES);
						driver_excuses.find({
							driver_id    : 	{$in: driverIds},
							date         : 	{$gte: currentDate, $lte: dayEndDate},
							status 		 : 	Constants.APPROVED,
							is_completed :	false,
							$or 		 : 	[
								{$and : [
									{from 	: {$gte: currentTime } },
									{to 	: {$lte: currentTime } }
								]},
								{$and : [
									{to 	: {$gte: currentTime } },
									{from 	: {$lte: currentTime } }
								]}
							],
						},{projection: {driver_id:1}}).toArray().then(excuseResult=>{
							if(excuseResult.length <=0) return callback(null,{});

							let excuseList = {};
							excuseResult.map(records=>{
								excuseList[records.driver_id] = records;
							});
							callback(null,excuseList);
						}).catch(err=>{
							callback(err,{});
						});
					},
					driver_inshift : (callback)=>{
						let shiftList 		=	{};
						let currentTime		=	parseFloat(Helper.newDate('',Constants.SHIFT_TIME_FORMAT));
						let prevStartDate 	=	Helper.newDate(Helper.newDate(Helper.subtractDate(Constants.HOURS_IN_A_DAY),Constants.CURRENTDATE_START_DATE_FORMAT));
						let prevEndDate 	=	Helper.newDate(Helper.newDate(Helper.subtractDate(Constants.HOURS_IN_A_DAY),Constants.CURRENTDATE_END_DATE_FORMAT));

						const shifts = this.db.collection(Tables.SHIFTS);
						const driver_availabilities = this.db.collection(Tables.DRIVER_AVAILABILITIES);
						const driver_in_out_shifts = this.db.collection(Tables.DRIVER_IN_OUT_SHIFTS);
						
                        asyncEach(driverIds,(driverId,eachCallback)=>{

							asyncParallel({
								check_previous : (chiildCallback)=>{
									driver_in_out_shifts.findOne({
										driver_id :	new ObjectId(driverId),
										type 	  : Constants.IN_SHIFT,
										created	  :	{
											$gte: prevStartDate,
											$lte: prevEndDate
										}
									},{projection: {_id:1},sort:{created:Constants.SORT_DESC}}).then(findResult=>{
										if(!findResult) return chiildCallback(null,false);

										/** For get driver shift details */
										driver_availabilities.distinct("shift_id",{
											user_id	: 	new ObjectId(driverId),
											date	: 	{$gte: prevStartDate, $lte: prevEndDate }
										}).then(shiftIds=>{
											if(shiftIds.length==0) return chiildCallback(null,false);

											/** Check driver shifts */
											shifts.aggregate([
												{$match	: {
													_id	: {$in: Helper.arrayToObject(shiftIds) },
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
												chiildCallback(null,shiftFlag);
											}).catch(err=>{
												chiildCallback(err,false);
											});
										}).catch(err=>{
                                            chiildCallback(err,false);
                                        });
									}).catch(err=>{
                                        chiildCallback(err,false);
                                    });
								},
								force_active : (chiildCallback)=>{
									/** Get driver details  */
									users.findOne({_id: new ObjectId(driverId)},{projection: {force_active:1,vehicle_id:1}}).then(userResult=>{
										if(!userResult || userResult.force_active != Constants.FORCE_ACTIVE || !userResult.vehicle_id){
											return chiildCallback(null,false);
										}

										driver_in_out_shifts.findOne({
											driver_id :	new ObjectId(driverId),
											type 	  : Constants.IN_SHIFT,
											vehicle_id:	userResult.vehicle_id,
										},{projection: {created:1},sort:{created:Constants.SORT_DESC}}).then(findResult=>{
											return chiildCallback(null,findResult?.created || false);
										}).catch(err=>{
											return chiildCallback(err,false);
										});
									}).catch(err=>{
										return chiildCallback(err,false);
									});
								}
							},(asyncChildErr, asyncChildResponse)=>{
								if(asyncChildErr) return eachCallback(asyncChildErr);

								/** Set conditions */
								let inoutConditions = {
									driver_id 	:	new ObjectId(driverId),
									created     : 	{$gte: currentDate},
									type		:	Constants.IN_SHIFT,
								};

								if(asyncChildResponse.check_previous){
									inoutConditions.created = {$gte: prevStartDate };
								}else if(asyncChildResponse.force_active){
									inoutConditions.created = {$gte: Helper.newDate(asyncChildResponse.force_active)};
								}

								/** Get driver inshift list */
								driver_in_out_shifts.findOne(inoutConditions,{projection: { _id:1},sort:{created:Constants.SORT_DESC}}).then(findResult=>{
									if(findResult) shiftList[driverId] = findResult;
									eachCallback(null);
								}).catch(err=>{
									eachCallback(err);
								});
							});
						},(asyncEachErr)=>{
							callback(asyncEachErr,shiftList);
						});
					},
				},(asyncErr,asyncResponse)=>{
					if(asyncErr){
						return console.log("Async parallel error on updateDriverAvailableStatus",asyncErr);
					}

					let driverBreakList 	= (asyncResponse.driver_breaks) ? asyncResponse.driver_breaks  :{};
					let driverExcusesList 	= (asyncResponse.driver_excuses)? asyncResponse.driver_excuses :{};
					let driverInshiftList 	= (asyncResponse.driver_inshift)? asyncResponse.driver_inshift :{};

					asyncEach(driverIds,(driverId,eachCallback)=>{
						let isAvailable = Constants.NOT_AVAILABLE;

						if(driverInshiftList[driverId]) isAvailable = Constants.AVAILABLE;

						if(driverBreakList[driverId] || driverExcusesList[driverId]){
							isAvailable = Constants.NOT_AVAILABLE;
						}

						/** Update driver available status  */
						users.updateOne({
							_id : new ObjectId(driverId),
						},
						{$set: {
							is_available 	: isAvailable,
						}}).then(()=>{
							eachCallback(null);
						}).catch(err=>{
							eachCallback(err);
						});
					},(asyncEachErr)=>{
						if(asyncEachErr){
							console.error("Async each error on updateDriverAvailableStatus",asyncEachErr);
						}
					});
				});
			}
		});		
	};//End updateDriverAvailableStatus()

	/**
	 * Function to update captain  free time
	 *
	 * @param req 	As	 Request Data
	 * @param res 	As	Response Data
	 * @param next	As 	Callback argument to the middleware function
	 *
	 * @return render null
	 */
	async updateCaptainFreeTime  (req,res,next){
		/** Send response to client and work in background */
		return res.render('blank',{layout:false});

		/** Set driver conditions */
		let orderProcessTime 			= Helper.newDate(Helper.subtractMinute(Constants.DRIVER_ORDER_PROCESS_TIME_IN_MINUTES));
		let driverConditions 			= clone(Constants.DRIVER_COMMON_CONDITIONS);
		driverConditions["orders.0"]	= {$exists: true};
		driverConditions["$or"]			= [
			{process_time : {$exists: false}},
			{process_time : {$lte: orderProcessTime}}
		];

		const users = this.db.collection(Tables.USERS);
		const order_details = this.db.collection(Tables.ORDER_DETAILS);
		
		/** Get user list */
		users.find(driverConditions,{projection: {_id:1,orders:1}}).toArray().then(result=>{
			if(result && result.length > 0){
				let captainIds = [];
				result.map(records=>{
					captainIds.push(records._id);
				});
				
				/** Update user details */
				users.updateMany({_id:{$in: captainIds}},{$set:{process_time: Helper.getUtcDate()}}).then(()=>{
					asyncEach(result,(records,callback)=>{
						
						let orderIds 		=	[];
						let firstOrderId 	= 	"";
						let orderList		=	records.orders;
						orderList.map((data,key)=>{
							if(key ==0) firstOrderId = data.order_id;
							orderIds.push(data.order_id);
						});

						/** Find order details */
						order_details.find({ 
							order_id:  { $in : Helper.arrayToObject(orderIds)}
						},{projection: {
							remaining_delivery_duration: 1,remaining_preparation_time:1,order_id:1
						}}).sort({remaining_delivery_duration: Constants.SORT_DESC}).toArray().then(orderResult=>{

							if(orderResult && orderResult.length > 0){
								asyncEach(orderResult,(data,childCallback)=>{
									let freeIn			=	orderResult[0]?.remaining_delivery_duration || 0;
									let orderPrepareTime=	(String(data.order_id) == String(firstOrderId)) ? data.remaining_preparation_time : '';
									let dataToBeUpdated	=	{};
									dataToBeUpdated['$set']	=	{
										free_in: parseInt(freeIn),
										"orders.$.free_in" : parseInt(data.remaining_delivery_duration)
									}
									if(orderPrepareTime){
										dataToBeUpdated['$set']["order_prepare_remaining_time"] = parseInt(orderPrepareTime);
									}
		
									dataToBeUpdated['$unset']	=	{ process_time : 1 };

									/** Update users order detail accordingly */
									users.updateOne({
										_id		: new ObjectId(records._id),
										orders: { $elemMatch: { order_id: data.order_id } }
									},dataToBeUpdated).then(()=>{
										childCallback(null);
									}).catch(err=>{
										childCallback(err);
									});									
								},(asyncChildEachErr)=>{
									callback(asyncChildEachErr);
								});
							}else{
								callback(null);
							}
						}).catch(err=>{
							callback(err);
						});
					},(asyncEachErr)=>{
						if(asyncEachErr){
							console.error("Error in updateCaptainFreeTime after asyncEach",asyncEachErr);
						}
					});
				}).catch(err=>{
					console.error("Error in updateCaptainFreeTime after updateMany",err);
				});
			}
		}).catch(err=>{
			console.error("Error in updateCaptainFreeTime after find",err);
		});
	};//End updateCaptainFreeTime()

	/**
	 * Function to auto end or cancel driver break
	 *
	 * @param req 		As Request Data
	 * @param res 		As Response Data
	 * @param next	As 	Callback argument to the middleware function
	 *
	 * @return render
	*/
	async autoEndBreak (req, res,next){
		/** Send response to client and work in background */
		res.render('blank',{layout:false});

		let currentDate 	=	Helper.newDate(Helper.newDate("",Constants.CURRENTDATE_START_DATE_FORMAT));
		let currentTime		= 	parseFloat(Helper.newDate("",Constants.EXCUSES_TIME_FORMAT));
		const driver_breaks =	this.db.collection(Tables.DRIVER_BREAKS);
		asyncParallel({
			driver_breaks : (callback)=>{
				/** Get driver breaks list */
				driver_breaks.find({
					date         : 	{$gte: currentDate},
					status 		 : 	Constants.APPROVED,
					is_completed :	false,
					end_time	 :	{$lte: currentTime},
				}).toArray().then(breakResult=>{
					callback(null,breakResult);
				}).catch(err=>{
					callback(err,[]);
				});
			},
		},(asyncErr,asyncResponse)=>{
			if(asyncErr){
				console.error("Parallel error in autoEndBreak",asyncErr);
			}

			if(asyncResponse?.driver_breaks?.length >0){
				asyncEach(asyncResponse?.driver_breaks,(records, eachCallback)=>{
					let breakId  	= 	records._id;
					let driverId  	= 	records.driver_id;
					let startTime 	=	(records.start_time)? String(Helper.set24HourFormat(records.start_time)).replace('.',':') :"";
					let endTime 	=	Helper.newDate("",Constants.BREAK_TIME_FORMAT);
					let breakStart	=	Helper.newDate(Helper.newDate("",Constants.DATABASE_DATE_FORMAT+' '+startTime));
					let breakEnd	= 	Helper.newDate(Helper.newDate("",Constants.DATABASE_DATE_FORMAT+' '+endTime));
					let difference	= 	Math.ceil((breakEnd - breakStart)/Constants.MILLISECONDS_IN_A_SECOND);
					endTime 		=	parseFloat(endTime.replace(':','.'));
					let endTimeStamp=	Helper.newDate().getTime();

					/** Update driver breaks details */
					driver_breaks.updateOne({
						_id 	 	 :	breakId,
						driver_id 	 :	driverId,
						is_completed : 	false,
						status		 : 	Constants.APPROVED,
						date         : 	{$gte: currentDate}
					},
					{$set: {
						is_completed : 	true,
						end_time     : 	endTime,
						end_timestamp:	endTimeStamp,
						elapsed_time :	difference,
						ia_auto_end  :	Helper.getUtcDate(),
						modified	 :	Helper.getUtcDate()
					}}).then(()=>{

						/*************** Send Mail  ***************/
							services.sendMailToUsers(req,res,{
								event_type 		:	Constants.DRIVER_BREAK_REQUEST_ENDED_EMAIL_EVENTS,
								break_id		: 	breakId,
								user_id			: 	driverId,
							});
						/*************** Send Mail  ***************/

						/** Save driver status logs */
							services.saveDriverStatusLogs(req,res,next,{
								parent_id 	: 	breakId,
								driver_id 	: 	driverId,
								type	  	: 	'driver_breaks',
								event_type	: 	Constants.END_BREAK,
								end_time	: 	endTime,
								duration	:	records?.duration || 0
							}).then(()=>{});

						/*************** Send Mail  ***************/
							services.sendMailToUsers(req,res,{
								event_type 		: 	Constants.DRIVER_BREAK_END_EMAIL_EVENTS,
								break_id		: 	breakId,
								user_id			: 	driverId,
								break_details	:	records
							});
						/*************** Send Mail  ***************/

						eachCallback(null);
					}).catch(err=>{
						eachCallback(err);
					});
				},(eachErr)=>{
					if(eachErr){
						console.error("Each error in autoEndBreak",eachErr);
					}
				});
			}
		});
	};//End autoEndBreak()

	/**
	 * Function to mark driver out shift
	 *
	 * @param req 		As Request Data
	 * @param res 		As Response Data
	 * @param options 	As Object Data
	 *
	 * @return render
	 */
	async markDriverOutShift (req, res, next){
		/** Send response to client and work in background */
		res.render('blank', { layout: false });

		let numberOfDays = (req.params.days) ? parseInt(req.params.days) :2;
		if(numberOfDays <= 0 || isNaN(numberOfDays)) numberOfDays = 2;

		let startDate 		= 	Helper.newDate(Helper.newDate(Helper.subtractDate(numberOfDays*Constants.HOURS_IN_A_DAY)),Constants.DATABASE_DATE_FORMAT);
		startDate 			= 	Helper.newDate(startDate+" "+Constants.START_DATE_TIME_FORMAT);
		let endDate 		= 	Helper.newDate(Helper.newDate("",Constants.CURRENTDATE_START_DATE_FORMAT));
		let datesArray 		= 	Helper.getDateRange(startDate, endDate);
		let settingMins 	=	(res.locals.settings['App.max_mins_to_update_out_shift']) ? parseFloat(res.locals.settings['App.max_mins_to_update_out_shift']) :0;

		/** Convert setting mins to hours format like - 190 mins => 3.10 */
		let tmpHours 		=	parseInt(settingMins/Constants.MINUTES_IN_A_HOUR);
		let tmpMins 		=	settingMins%Constants.MINUTES_IN_A_HOUR;
		if(tmpMins < 10) tmpMins = "0"+tmpMins;
		let finalSettTime 	=	String(tmpHours+"."+tmpMins);

		const users						=	this.db.collection(Tables.USERS);
		const orders 					=	this.db.collection(Tables.ORDERS);
		const shifts 					=	this.db.collection(Tables.SHIFTS);
		const driver_in_out_shifts  	=  	this.db.collection(Tables.DRIVER_IN_OUT_SHIFTS);
		const driver_availabilities		=	this.db.collection(Tables.DRIVER_AVAILABILITIES);
		const notification_types		=	this.db.collection(Tables.NOTIFICATION_TYPES);
		const captain_overtime_requests =	this.db.collection(Tables.CAPTAIN_OVERTIME_REQUESTS);

		eachOfSeries(datesArray, (tmpDate, firstKey, seariesCallback) => {
			let tmpStartDate	= 	Helper.newDate(Helper.newDate(tmpDate, Constants.CURRENTDATE_START_DATE_FORMAT));
			let tmpEndDate 		=	Helper.newDate(Helper.newDate(tmpDate, Constants.CURRENTDATE_END_DATE_FORMAT));

			/**Get driver shift details */
			driver_in_out_shifts.find({
				created	: 	{$gte: tmpStartDate, $lt: tmpEndDate},
				type	:	Constants.IN_SHIFT,
			},{projection:{_id: 1, driver_id: 1, created: 1, start_km: 1}}).toArray().then(outList=>{
				if(outList?.length <=0) return seariesCallback(null);

				eachOfSeries(outList, (record, secondKey, eachCallback) => {
					let startKm 	= 	record.start_km;
					let outShiftId 	= 	new ObjectId(record._id);
					let driverId 	= 	new ObjectId(record.driver_id);
					let shiftInDate	= 	Helper.newDate(Helper.newDate(record.created,Constants.CURRENTDATE_END_DATE_FORMAT));
					let shiftInHour	= 	parseFloat(Helper.newDate(record.created,Constants.SHIFT_TIME_FORMAT));
					let currentTime	= 	parseFloat(Helper.newDate("",Constants.SHIFT_TIME_FORMAT));

					asyncParallel({
						driver_details : (parentCallback)=>{
							/**Get drivers details */
							users.findOne({_id : driverId },{projection:{_id:1,latitude:1,longitude:1}}).then(result=>{
								parentCallback(null,result);
							}).catch(err=>{
								parentCallback(err,null);
							});
						},
						overtime_details : (parentCallback)=>{
							/** Get overtime details */
							captain_overtime_requests.findOne({
								user_id		:	driverId,
								request_date:	{$gte: tmpStartDate, $lte: tmpEndDate },
							},{projection: {hours:1}}).then(overtimeResult=>{
								parentCallback(null, overtimeResult);
							}).catch(err=>{
								parentCallback(err, null);
							});
						},
						noti_details : (parentCallback)=>{
							/**Get drivers details */
							notification_types.findOne({
								notification_type : Constants.NOTIFICATION_TO_DRIVER_SHIFT_MARKED_OUTSHIFT_FORCEFULLY 
							},{projection:{message:1,title:1}}).then(result=>{
								parentCallback(null,result);
							}).catch(err=>{
								parentCallback(err, null);
							});
						},
					},(asyncParentErr,asyncParentRes)=>{
						if(asyncParentErr){
							console.error("Async first parallel error on markDriverOutShift",asyncParentErr);
							return eachCallback(null);
						}

						let notiDetails		= 	(asyncParentRes.noti_details) 		?	asyncParentRes.noti_details		:{};
						let driverDetails	= 	(asyncParentRes.driver_details) 	?	asyncParentRes.driver_details	:{};
						let overtimeHours	= 	(asyncParentRes.overtime_details)	? 	parseFloat(asyncParentRes.overtime_details.hours) :0;
						asyncParallel({
							have_order : (callback)=>{
								/** Check driver have orders */
								orders.countDocuments({
									$or : [
										{captain_id		 : driverId},
										{assigned_captain: driverId},
									],
									admin_status : {$nin: [Constants.ORDER_DELIVERED, Constants.ORDER_REJECTED ] },
									is_completed : {$ne: true },
								}).then(contResult=>{
									callback(null,contResult);
								}).catch(err=>{
									callback(err,false);
								});
							},
							shift_details: (callback)=>{
								/**Get driver shift details */
								driver_availabilities.distinct("shift_id",{
									user_id 	: 	driverId,
									date		: 	{$gte: tmpStartDate, $lte: tmpEndDate},
									leave_type	:	{$exists: false},
								}).then(shiftIds=>{
									if(shiftIds?.length == 0) return callback(null,false);

									/**Get shift details */
									shifts.aggregate([
										{$match	: {_id: {$in: Helper.arrayToObject(shiftIds)} }},
										{$addFields:{
											is_next_day : {$cond: [
												{$and: [
													{ $gt: ["$start_time","$end_time"] },
												]},
												true,
												false
											]},
										}},
									]).toArray().then(shiftResult=>{
										if(shiftResult?.length == 0) return  callback(null,false);

										let allowOutshift 	=	false;
										shiftResult.map(shiftDetails=>{
											let isNextDay 	=	shiftDetails.is_next_day;
											let tmpEndTime 	=	parseFloat(shiftDetails.end_time);

											if(shiftDetails.start_time <= shiftInHour && ((!isNextDay && tmpEndTime >= shiftInHour) || (isNextDay && tmpEndTime <= shiftInHour))){
												let finalEndTime =	Helper.convertIntoTimeFormat([tmpEndTime,overtimeHours, finalSettTime ]);

												if(finalEndTime >= Constants.HOURS_IN_A_DAY){
													isNextDay   	= 	true;
													finalEndTime	= 	Helper.round(finalEndTime-Constants.HOURS_IN_A_DAY);
												}

												if(!isNextDay && currentTime >= finalEndTime) allowOutshift = true;
												if(isNextDay && shiftInDate <= Helper.newDate() && finalEndTime <= currentTime) allowOutshift = true;
											}
										});
										callback(null, allowOutshift);
									}).catch(err=>{
										callback(err,false);
									});
								}).catch(err=>{
									callback(err,false);
								});
							},
						},(asyncErr,asyncRes)=>{
							if(asyncErr){
								console.error("Async parallel error on markDriverOutShift",asyncErr);
								return eachCallback(null);
							}

							if(asyncRes.have_order || !asyncRes.shift_details) return eachCallback(null);

							/** Update driver out shifts details */
							driver_in_out_shifts.updateOne({
								_id : outShiftId
							},
							{$set: {
								type			: 	Constants.OUT_SHIFT,
								km		 		: 	startKm,
								out_km		 	: 	startKm,
								total_km 		: 	0,
								out_latitude 	: 	(driverDetails.latitude)	?	driverDetails.latitude	:0,
								out_longitude 	: 	(driverDetails.longitude)	?	driverDetails.longitude	:0,
								modified 		:	Helper.getUtcDate(),
								out_time		:	Helper.getUtcDate(),
								updated_by_cron	:	Helper.getUtcDate(),
							}}).then(()=>{

								if(notiDetails && notiDetails._id){
									services.pushNotification(req,res,{
										user_id		:	driverId,
										pn_type		: 	Constants.NOTIFICATION_TO_DRIVER_SHIFT_MARKED_OUTSHIFT_FORCEFULLY,
										pn_body		:	notiDetails.message.en,
										notification_details: notiDetails,
										pn_body_descriptions: {
											message :	notiDetails.message,
											title 	:	notiDetails.title,
										},
									}).then(()=>{});
								}
							}).catch(err=>{
								eachCallback(err);
							});
						});
					});
				},(childEachErr)=>{
					seariesCallback(childEachErr);
				});
			}).catch(err=>{
				console.error("Error in markDriverOutShift after find",err);
				return seariesCallback(null);
			});
		},(eachErr)=>{
			if(eachErr){
				console.error("Error in Series markDriverOutShift");
				console.error(eachErr);
			}
		});
	};//End markDriverOutShift()

	/**
	 * Function to send pn to driver and cravez for driver not join the shift
	 *
	 * @param req 		As Request Data
	 * @param res 		As Response Data
	 * @param options 	As Object Data
	 *
	 * @return render
	 */
	async sendShiftJoinPN (req, res,next){
		/** Send response to client and work in background */
		res.render('blank',{layout:false});

		const shifts				= this.db.collection(Tables.SHIFTS);
		const users					= this.db.collection(Tables.USERS);
		const driver_in_out_shifts  = this.db.collection(Tables.DRIVER_IN_OUT_SHIFTS);

		let bufferTime		= parseInt(res?.locals?.settings?.['Site.shift_not_join_pn_waiting'] || 0);
		let checkTime 		= Helper.subtractMinute(bufferTime);
		let lowerCheckTime 	= Helper.subtractMinute(bufferTime+Constants.MINUTES_IN_A_HOUR);
		let finalTime		= parseFloat(Helper.newDate(checkTime,Constants.TIME_FORMAT));
		let lowerTime		= parseFloat(Helper.newDate(lowerCheckTime,Constants.TIME_FORMAT));

		let createdDate		=  	Helper.newDate("",Constants.DATABASE_DATE_FORMAT);
		let createdStart	=	Helper.newDate(createdDate+" "+Constants.START_DATE_TIME_FORMAT);
		let createdEnd		=	Helper.newDate(createdDate+" "+Constants.END_DATE_TIME_FORMAT);

		/** Get driver in out shift details */
		shifts.aggregate([
			{$match : {
				$or : [
					{pn_sent_time : {$exists : false}},
					{pn_sent_time : {$lte : createdStart}},
				],
				start_time 	:	{$lte : finalTime,$gte : lowerTime},
				is_deleted	: 	{$ne: Constants.DELETED}
			}},
			{$lookup:	{
				from     : Tables.DRIVER_AVAILABILITIES,
				let      : {shiftId : "$_id"},
				pipeline : [
					{$match : {
						date: {$gte: createdStart, $lte: createdEnd},
						$expr: {
							$and : [
								{$eq: ["$shift_id","$$shiftId"]},
							]
						},
					}},
				],
				as	:	"assigned_drivers"
			}},
			{$unwind: "$assigned_drivers" },
			{$group : {
				_id: "$_id",
				start_time :{$first : "$start_time"},
				shift_name :{$first : "$shift_name"},
				assigned_drivers: { $push:  "$assigned_drivers.user_id"},
			}},
		]).toArray().then(result=>{
				
			if(result && result.length > 0){
				/** Update driver wise orders*/
				asyncEach(result, (shift, eachCallback)=> {
					if(!shift.assigned_drivers || shift.assigned_drivers.length == 0) return eachCallback(null);

					asyncParallel({
						update_shift : (childCallback)=>{
							shifts.updateOne({_id : new ObjectId(shift._id)},{$set : {pn_sent_time : Helper.getUtcDate()}}).then(()=>{
								childCallback(null,null);
							}).catch(err=>{
								childCallback(err,null);
							});
						},
						joined_captains : (childCallback)=>{
							driver_in_out_shifts.distinct("driver_id",{
								created    : {$gte : createdStart,$lte : createdEnd},
								driver_id  : {$in : Helper.arrayToObject(shift.assigned_drivers)}
							}).then(joinedDriverIds=>{
								childCallback(null,joinedDriverIds);
							}).catch(err=>{
								childCallback(err,null);
							});
						},
					},(asyncErr,asyncResponse)=>{
						if(asyncErr) return eachCallback(asyncErr);

						let driverCondition = {
							_id : {$in : Helper.arrayToObject(shift.assigned_drivers || [])},
							...clone(Constants.DRIVER_COMMON_CONDITIONS),
						}
						driverCondition["$and"]	= [
							{_id : {$nin : Helper.arrayToObject(asyncResponse?.joined_captains || [])}},
						];
						
						users.find(driverCondition,{projection:{_id:1,full_name:1,user_role_id:1}}).toArray().then(driverList=>{
							
							eachCallback(null);

							driverList.map(driver=>{
								if(!driver._id) return;

								/** Notification to driver to join shift and admin */
									let shiftTime = String(shift.start_time).replace(".",":");
									services.insertNotifications(req,res,{
										notification_data : {
											notification_type 	: 	Constants.NOTIFICATION_SHIFT_NOT_JOIN_PN_DRIVER,
											message_params 		: 	[shift.shift_name,shiftTime],
											parent_table_id 	: 	new ObjectId(shift._id),
											user_ids 			: 	[driver._id],
											role_id 			: 	driver.user_role_id,
											extra_parameters 	:	{
												driver_id : new ObjectId(driver._id),
												shift_name: shift.shift_name
											}
										}
									});

									/** Send Pn To Admin*/
									services.insertNotifications(req,res,{
										notification_data : {
											notification_type 	: 	Constants.NOTIFICATION_SHIFT_NOT_JOIN_PN_CRAVEZ,
											message_params 		: 	[driver.full_name,shift.shift_name],
											parent_table_id 	: 	new ObjectId(shift._id),
											user_id 		    : 	new ObjectId(driver._id),
											user_role_id 		: 	driver.user_role_id,
											role_id 			: 	[Constants.CRAVEZ,Constants.FLEET],
											only_for_user_role	:	true,
											extra_parameters 	:	{
												driver_id : new ObjectId(driver._id),
											}
										}
									});
								/*************** Notification to driver to join shift and admin  ***************/
							});
						}).catch(err=>{
							eachCallback(err);
						});
					});
				},(childEachErr)=>{
					if(childEachErr){
						console.error("Error in sendShiftJoinPN after asyncEach",childEachErr);
					}
				});	
			}
		}).catch(err=>{
			console.error("Error in sendShiftJoinPN after aggregate",err);
		});
	};//End sendShiftJoinPN()

	/**
	 * Function to save driver petrol consumptions details
	 *
	 * @param req 		As Request Data
	 * @param res 		As Response Data
	 * @param options 	As Object Data
	 *
	 * @return render
	 */
	async saveDriverPetrolConsumption (req, res,next){

		/** Send response to client and work in background */
		res.render('blank',{layout:false});

		let numberOfDays 	   = (req.params.days) ? parseInt(req.params.days) :2;
		let AveragePerKmPetrol = parseFloat(res?.locals?.settings?.['App.average_per_km_petrol'] || 1);

		if(numberOfDays <= 0 || isNaN(numberOfDays)) numberOfDays = 2;

		let hoursInADay   =  numberOfDays*Constants.HOURS_IN_A_DAY;
		let tempStartDate =  Helper.newDate(Helper.subtractDate(hoursInADay));
		let startDate     =  Helper.newDate(tempStartDate,Constants.DATABASE_DATE_FORMAT);
		startDate  	      =  Helper.newDate(startDate+" "+Constants.START_DATE_TIME_FORMAT);
		let endDate  	  =  Helper.newDate(Helper.newDate("",Constants.CURRENTDATE_START_DATE_FORMAT));

		const driver_in_out_shifts  	  =  this.db.collection(Tables.DRIVER_IN_OUT_SHIFTS);
		const driver_petrol_consumptions  =  this.db.collection(Tables.DRIVER_PETROL_CONSUMPTIONS);

		/** Get driver in out shift details */
		driver_in_out_shifts.aggregate([
			{$match :{
				created : {$gte: startDate, $lt: endDate}
			}},
			{$lookup:	{
				"from" 			: 	Tables.USERS,
				"localField" 	:	"driver_id",
				"foreignField" 	: 	"_id",
				"as" 			: 	"driver_details"
			}},
			{$addFields : {
				vehicle_type: {$arrayElemAt: ["$driver_details.vehicle_type",0]},
				vehicle_id: {$arrayElemAt: ["$driver_details.vehicle_id",0]}
			}},
			{$group :{
				_id : {
					driver_id : "$driver_id",
					date : { $dateToString: { format: "%Y-%m-%d", date: "$created", timezone: Constants.DEFAULT_TIME_ZONE }}
				},
				total_km  	: {$sum   : "$total_km"},
				driver_id 	: {$first : "$driver_id"},
				vehicle_type: {$first : "$vehicle_type"},
				vehicle_id	: {$first : "$vehicle_id"},
				created     : {$first : "$created"}
			}}
		]).toArray().then(result=>{
			
			if(result && result.length > 0){
				/** Update driver petrol consumption details*/
				asyncEach(result, (records, eachCallback)=> {
					let totalKm = Helper.round(records.total_km);
					let petrolConsumption = Helper.round(totalKm*AveragePerKmPetrol);
					let created			=	records.created;
					let vehicleType		=	records.vehicle_type;
					let vehicleId		=	(records.vehicle_id) ? new ObjectId(records.vehicle_id) : "";
					let createdDate		=  	Helper.newDate(created,Constants.DATABASE_DATE_FORMAT);
					let createdStart	=	Helper.newDate(createdDate+" "+Constants.START_DATE_TIME_FORMAT);
					let createdEnd		=	Helper.newDate(createdDate+" "+Constants.END_DATE_TIME_FORMAT);

					driver_petrol_consumptions.updateOne({
						driver_id : records.driver_id,
						date      : {
							$gte: Helper.newDate(createdStart),
							$lte: Helper.newDate(createdEnd)
						},
					},
					{
						$set : {
							total_km          	: totalKm,
							petrol_consumption	: petrolConsumption,
							vehicle_id			: vehicleId,
							vehicle_type		: vehicleType,
							modified           	: Helper.getUtcDate()
						},
						$setOnInsert : {
							date	: 	records.created,
							created	:	Helper.getUtcDate(),
						}
					},{upsert : true}).then(()=>{
						eachCallback(null);
					}).catch(err=>{
						eachCallback(err);
					});
				},(childEachErr)=>{
					if(childEachErr){
						console.error("Error in saveDriverPetrolConsumption after asyncEach",childEachErr);
					}
				});
			}
		}).catch(err=>{
			console.error("Error in saveDriverPetrolConsumption after aggregate",err);
		});
	};//End saveDriverPetrolConsumption()
}