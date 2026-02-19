import { ObjectId } from 'mongodb';
import { parallel as asyncParallel, each as asyncEach} from 'async';
import * as Constants from "../../../../config/global_constant.mjs";
import Tables from '../../../../config/database_tables.mjs';
import * as Helper from "../../../../utils/index.mjs";

export default class BranchCron {
    constructor(db) {
        this.db = db;
    }

	/**
	 * Function to save open branch details
	 *  Frequency : every 00.05 am
	 *
	 * @param req 	As	 Request Data
	 * @param res 	As	Response Data
	 * @param next	As 	Callback argument to the middleware function
	 *
	 * @return render driver_excuses
	 */
	async saveOpenBranchList (req, res,next,options){
		try {
			let isToday		= 	(req.params.today) ? parseInt(req.params.today) :"";
			let branchId 	=	(options && options.branch_id)	?	new ObjectId(options.branch_id)	:"";
			var date		=	(branchId || isToday) ? new Date() :new Date(new Date(). getTime() + Constants.ONE_DAY_TIMESTAMP);
			let currentDay 	= 	parseInt(date.getUTCDay());
			let deleteAbleId= 	String(new ObjectId());

			/** If current day is 0 then set it to 7 for sunday */
			if(currentDay == 0) currentDay = 7;

			let startDate 	= 	Helper.newDate(Helper.newDate(date,Constants.CURRENTDATE_START_DATE_FORMAT));
			let endDate 	= 	Helper.newDate(Helper.newDate(date,Constants.CURRENTDATE_END_DATE_FORMAT));

			const restaurant_open_branches 		= 	this.db.collection(Tables.RESTAURANT_OPEN_BRANCHES);
			const restaurant_branch_calendars 	=	this.db.collection(Tables.RESTAURANT_BRANCH_CALENDARS);
			asyncParallel({
				open_branch_list : (callback)=>{
					let calendarConditions = {
						parent_id	:	"",
						status		: 	Constants.OPEN,
						type		: 	Constants.DEFAULT_WEEK,
						$and		:	[
							{$or: [
								{is_exception:	false},
								{is_exception:	{$exists: false}}
							]},
							{$or: [
								{is_sw:	false},
								{is_sw:	{$exists: false}}
							]},
						]
					};

					if(branchId) calendarConditions = {branch_id: branchId, ...calendarConditions};
					
					restaurant_branch_calendars.aggregate([
						{$match : calendarConditions},
						{$lookup:	{
							from     : Tables.RESTAURANT_BRANCH_CALENDARS,
							let      : {branchId : "$branch_id"},
							pipeline : [
								{$match : {
									$expr: {
										$and : [
											{$eq: ["$is_exception",true]},
											{$eq: ["$branch_id", "$$branchId"]},
											{$eq: ["$day", currentDay]},
										]
									}
								}},
								{$project : { to_hour: 1, to_minute: 1, from_hour: 1, from_minute: 1 }},
							],
							as	:	"exception_details"
						}},
						{$lookup:	{
							from     : Tables.RESTAURANT_BRANCH_CALENDARS,
							let      : {branchId : "$branch_id"},
							pipeline : [
								{$match : {
									$expr: {
										$and : [
											{$eq: ["$is_sw", true]},
											{$eq: ["$branch_id", "$$branchId"]},
											{$eq: ["$day", currentDay]},
										]
									}
								}},
								{$project : { to_hour: 1, to_minute: 1, from_hour: 1, from_minute: 1 }},
							],
							as	:	"sw_details"
						}},
						{$lookup:	{ /** Check this branch close or not today */
							from     : Tables.RESTAURANT_BRANCH_CALENDARS,
							let      : {branchId : "$branch_id"},
							pipeline : [
								{$match : {
									$expr: {
										$and : [
											{$eq: ["$branch_id", "$$branchId"]},
											{$eq: ["$day", currentDay]},
											{$eq: ["$status",Constants.CLOSE]},
											{$eq: ["$type",Constants.WEEK_DAY]},
										]
									}
								}},
							],
							as	:	"close_day_details"
						}},
						{$match: {
							close_day_details : {$size : 0}
						}}
					]).toArray().then((result)=>{
						callback(null,result);
					}).catch((err)=>{
						callback(err);
					});
				},
				delete_branch_list : (callback)=>{
					/** Set conditions */
					let deleteConditions = {
						created	 :	{
							$gte : startDate,
							$lte : endDate,
						},
					};

					if(branchId) deleteConditions = {branch_id: branchId, ...deleteConditions};

					/** update as delete */
					restaurant_open_branches.updateMany(deleteConditions,{$set: { to_be_deleted: deleteAbleId }}).then((result)=>{
						callback(null,result);
					}).catch((err)=>{
						callback(err);
					});
				},
			},(asyncErr,asyncResponse)=>{
				if(asyncErr){
					console.log("Async parallel error on branchCron at saveOpenBranchList");
					return console.log(asyncErr);
				}

				if(asyncResponse?.open_branch_list?.length >0){

					asyncEach(asyncResponse.open_branch_list,(records, eachCallback)=>{

						asyncParallel({
							close_list : (parallelCallback)=>{
                               if(!records?.exception_details?.length) return parallelCallback(null);

								asyncEach(records.exception_details,(closeRecords, eachCloseCallback)=>{
									let fromHour 	=	closeRecords?.from_hour || "00";
									let fromMinute 	=	closeRecords?.from_minute || "00";
									let toHour 		=	closeRecords?.to_hour || "00";
									let toMinute 	=	closeRecords?.to_minute || "00";

									if(String(fromMinute).length ==1) 	fromMinute 	= 	"0"+fromMinute;
									if(String(toMinute).length ==1) 	toMinute	= 	"0"+toMinute;

									restaurant_open_branches.updateOne({
										branch_id 		: 	records.branch_id,
										restaurant_id 	:	records.restaurant_id,
										created			:	{
											$gte : startDate, $lte : endDate,
										},
										type	: Constants.CLOSE,
										from 	: parseFloat(fromHour+"."+fromMinute),
										to 		: parseFloat(toHour+"."+toMinute)
									},
									{
										$set : {
											modified: Helper.getUtcDate()
										},
										$setOnInsert : {
											created: endDate
										},
										$unset : {
											to_be_deleted : 1
										}
									},{upsert : true}).then((result)=>{
										eachCloseCallback(null,result);
									}).catch((err)=>{
										eachCloseCallback(err);
									});
								},(asyncEachCloseErr)=>{
									parallelCallback(asyncEachCloseErr);
								});
							},
							sw_list : (parallelCallback)=>{
								if(!records?.sw_details?.length) return parallelCallback(null);

								asyncEach(records.sw_details,(swRecords, eachSwCallback)=>{
									let fromHour 	=	swRecords?.from_hour || "00";
									let fromMinute 	=	swRecords?.from_minute || "00";
									let toHour 		=	swRecords?.to_hour || "00";
									let toMinute 	=	swRecords?.to_minute || "00";

									if(String(fromMinute).length ==1) 	fromMinute 	= 	"0"+fromMinute;
									if(String(toMinute).length ==1) 	toMinute	= 	"0"+toMinute;

									restaurant_open_branches.updateOne({
										branch_id 		: 	records.branch_id,
										restaurant_id 	:	records.restaurant_id,
										created			:	{
											$gte : startDate, $lte : endDate,
										},
										type	: Constants.OPEN,
										from 	: parseFloat(fromHour+"."+fromMinute),
										to 		: parseFloat(toHour+"."+toMinute)
									},
									{
										$set : {
											modified: Helper.getUtcDate()
										},
										$setOnInsert : {
											created : endDate
										},
										$unset : {
											to_be_deleted : 1
										}
									},{upsert : true}).then((result)=>{
										eachSwCallback(null,result);
									}).catch((err)=>{
										eachSwCallback(err);
									});
								},(asyncSwErr)=>{
									parallelCallback(asyncSwErr);
								});
							},
							open_list : (parallelCallback)=>{
								if(records?.sw_details?.length) return parallelCallback(null);

								let fromHour 	=	records?.from_hour || "00";
								let fromMinute 	=	records?.from_minute || "00";
								let toHour 		=	records?.to_hour || "00";
								let toMinute 	=	records?.to_minute || "00";

								if(String(fromMinute).length ==1) 	fromMinute 	= 	"0"+fromMinute;
								if(String(toMinute).length ==1) 	toMinute	= 	"0"+toMinute;

								restaurant_open_branches.updateOne({
									branch_id 		: 	records.branch_id,
									restaurant_id 	:	records.restaurant_id,
									created			:	{
										$gte : startDate, $lte : endDate,
									},
									type	: Constants.OPEN,
									from 	: parseFloat(fromHour+"."+fromMinute),
									to 		: parseFloat(toHour+"."+toMinute)
								},
								{
									$set : {
										modified: Helper.getUtcDate()
									},
									$setOnInsert : {
										created : endDate
									},
									$unset : {
										to_be_deleted : 1
									}
								},{upsert : true}).then((result)=>{
									parallelCallback(null,result);
								}).catch((err)=>{
									parallelCallback(err);
								});
							},
						},(asyncParallelErr)=>{
							eachCallback(asyncParallelErr);
						});
					},(asyncEachErr)=>{
						if(asyncEachErr){
							console.log("Async each error on branchCron at saveOpenBranchList");
							return console.log(asyncEachErr);
						}

						asyncParallel({
							delete_branch_list : (subCallback)=>{
								/** Set conditions */
								let deleteConditions = {
									created	 :	{
										$gte : startDate,
										$lte : endDate,
									},
									to_be_deleted: deleteAbleId
								};

								if(branchId) deleteConditions = {branch_id: branchId, ...deleteConditions};

								/** Mark as delete */
								restaurant_open_branches.deleteMany(deleteConditions).then((result)=>{
									subCallback(null,result);
								}).catch((err)=>{
									subCallback(err);
								});
							},
						},(asyncSubErr)=>{
							if(asyncSubErr){
								console.log("Async sub parallel error on branchCron at saveOpenBranchList");
								return console.log(asyncSubErr);
							}
						});
					});
				}
			});
			if(branchId) return "";
			res.render('blank',{layout:false});
		} catch (error) {
			console.log("Error on branchCron at saveOpenBranchList");
			return console.log(error);
		}
	};//End saveOpenBranchList()

	/**
	 * Function to save branch open status
	 *  Frequency : every 5 minutes
	 *
	 * @param req 	As	 Request Data
	 * @param res 	As	Response Data
	 * @param next	As 	Callback argument to the middleware function
	 *
	 * @return render driver_excuses
	 */
	async saveBranchOpenStatus (req, res,next){
		/** Send response to client and work in background */
		res.render('blank',{layout:false});
		
		try {
			let startDate 	= 	Helper.newDate("",Constants.CURRENTDATE_START_DATE_FORMAT);
			let endDate 	= 	Helper.newDate("",Constants.CURRENTDATE_END_DATE_FORMAT);
			let currentTime =	Helper.newDate("",Constants.OPEN_TIME_FORMAT);
			startDate 		= 	Helper.newDate(startDate);
			endDate 		=	Helper.newDate(endDate);
			currentTime 	=	parseFloat(currentTime.replace(':','.'));

			const restaurant_open_branches = this.db.collection(Tables.RESTAURANT_OPEN_BRANCHES);
			asyncParallel({
				branch_list : (parentCallback)=>{
					/** Get branch open status */
					restaurant_open_branches.aggregate([
						{$match :{
							created: {
								$gte: startDate, $lte: endDate,
							},
						}},
						{$addFields:{
							is_overnight: {$cond: [
								{$and: [
									{$lt: ["$to", "$from"] },
								]},
								true, false
							]}
						}},
						{$match :{
							$or: [
								{
									type	: 	Constants.OPEN,
									$and	:	[
										{$or:	[
											{from: 	{$lte: currentTime}},
											{
												is_overnight : true,
												from: 	{$gte: currentTime},
												to: 	{$gte: currentTime}
											}
										]},
										{$or:	[
											{to :{$gte: currentTime}},
											{is_overnight : true}
										]}
									]
								},
								{
									type	: 	Constants.CLOSE,
									from 	: 	{$lte: currentTime},
									to 		:	{$gte: currentTime}
								}
							]
						}},
						{$group :{
							_id 		:	"$branch_id",
							open_from	: 	{$min: "$from"},
							close_to	: 	{$max: "$to"},
							open_count  : 	{$sum: {$cond: [
									{$and: [
										{ $eq : ["$type", Constants.OPEN] },
									]},
									1,0
								]},
							},
							close_count  : {$sum: {$cond: [
									{$and: [
										{ $eq : ["$type", Constants.CLOSE] },
									]},
									1,0
								]},
							},
						}},
						{$match : {
							open_count  : {$gte: 1},
							close_count : {$lt : 1},
						}}
					]).toArray().then((result)=>{
						parentCallback(null,result);
					}).catch((err)=>{
						parentCallback(err);
					});
				},
				open_branch_list : (parentCallback)=>{
					restaurant_open_branches.aggregate([
						{$match :{
							type	: 	Constants.OPEN,
							created	: 	{
								$gte: startDate, $lte: endDate,
							},
						}},
						{$group :{
							_id 		:	"$branch_id",
							open_from	: 	{$min: "$from"},
							close_to	: 	{$max: "$to"},
						}},
					]).toArray().then((result)=>{
						parentCallback(null,result);
					}).catch((err)=>{
						parentCallback(err);
					});
				},
			},(parentAsyncErr,parentAsyncResponse)=>{
				if(parentAsyncErr){
					console.log("parent parallel on branchCron at saveBranchOpenStatus");
					return console.log(parentAsyncErr);
				}

				let branchIds 		= 	[];
				let branchList 		=	parentAsyncResponse?.branch_list || [];
				let branchOpenList 	=	parentAsyncResponse?.open_branch_list || [];
				if(branchList?.length >0){
					branchList.map(records=>{
						branchIds.push(records._id);
					});
				}

				const restaurant_branches = this.db.collection(Tables.RESTAURANT_BRANCHES);
				asyncParallel({
					mark_branch_open : (callback)=>{
						/** update branch details */
						restaurant_branches.find({
							_id		: { $in: branchIds },
							is_open	: Constants.CLOSE,
						},{projection: { _id: 1 }}).toArray().then((result) => {

							restaurant_branches.updateMany({
								_id : {$in: branchIds}
							},
							{$set: {
								is_open: Constants.OPEN,
							}}).then(()=>{
								
								if(result?.length >0){
									result.forEach(record => {
										this.saveBranchOpenCloseLogs(req, res, next, {
											status: Constants.BRANCH_OPEN,
											branch_id: record._id
										});
									});
								}
								callback(null,null);
							}).catch((err)=>{
								callback(err);
							});
						}).catch((err)=>{
							callback(err);
						});
					},
					mark_branch_close : (callback)=>{
						/** update branch details */
						restaurant_branches.find({
							_id		: { $nin: branchIds },
							is_open	: Constants.OPEN,
						},{projection: { _id: 1 } }).toArray().then((result) => {
							
							restaurant_branches.updateMany({
								_id : {$nin: branchIds}
							},
							{$set: {
								is_open: Constants.CLOSE,
							}}).then(()=>{
								
								if(result?.length >0){
									result.forEach(record => {
										this.saveBranchOpenCloseLogs(req,res,next, {status: Constants.CLOSE, branch_id: record._id});
									});
								}

								callback(null,null);
							}).catch((err)=>{
								callback(err);
							});
						}).catch((err)=>{
							callback(err);
						});
					},
					update_branch_hours : (callback)=>{
						if(!branchOpenList?.length) return callback(null);

						asyncEach(branchOpenList,(records, eachCallback)=>{
							let openTime	= 	parseFloat(records.open_from).toFixed(Constants.ROUND_PRECISION);
							let closeTime 	=	parseFloat(records.close_to).toFixed(Constants.ROUND_PRECISION);
							if(openTime.length<=4) 	openTime	= 	"0"+openTime;
							if(closeTime.length<=4) closeTime 	=	"0"+closeTime;

							/** update branch details */
							restaurant_branches.updateOne({
								_id : records._id
							},
							{$set: {
								open_time : openTime,
								close_time:	closeTime,
							}}).then(()=>{
								eachCallback(null,null);
							}).catch((err)=>{
								eachCallback(err);
							});
						},(asyncEachErr)=>{
							callback(asyncEachErr);
						});
					}
				},(asyncErr)=>{
					if(asyncErr){
						console.log("Async parallel error on branchCron at saveBranchOpenStatus",asyncErr);
					}
				});				
			});
		} catch (error) {
			console.log("Error on branchCron at saveBranchOpenStatus",error);
		}
	};//End saveBranchOpenStatus()

	/**
	 * Function to save branch open close logs
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return JSON
	 */
	async saveBranchOpenCloseLogs (req, res, next, options) {
		try {
			let branchId = (options.branch_id) ? new ObjectId(options.branch_id) : "";
			let branchStatus = (options.status == Constants.CLOSE) ? Constants.CLOSE : Constants.BRANCH_OPEN;

			let dataToBeUpdate = {
				status: parseInt(branchStatus),
				modified: Helper.getUtcDate(),
			};

			let flag = true;
			if (branchStatus == Constants.CLOSE) {
				dataToBeUpdate.closing_time = Helper.getUtcDate();
				flag =false;
			}

			/** Get Branch details **/
			const restaurant_branches = this.db.collection(Tables.RESTAURANT_BRANCHES);
			let result = await restaurant_branches.findOne({ _id: branchId }, { projection: { restaurant_id: 1 } });
			
			let restaurantId = (result && result.restaurant_id) ? new ObjectId(result.restaurant_id) : "";

			/** If restaurant id not found then return error */
			if(!restaurantId) return {
				status: Constants.STATUS_ERROR
			};

			const branch_open_close_logs = this.db.collection(Tables.BRANCH_OPEN_CLOSE_LOGS);
			await branch_open_close_logs.updateOne({
				branch_id: branchId,
				status: Constants.BRANCH_OPEN,
			},
			{
				$set: dataToBeUpdate,
				$setOnInsert: {
					restaurant_id: restaurantId,
					created		: Helper.getUtcDate(),
					opening_time :Helper.getUtcDate(),
				}
			}, { upsert: flag });

			return {
				status: Constants.STATUS_SUCCESS
			};
		} catch (error) {
			console.log("Error on branchCron at saveBranchOpenCloseLogs catch block",error);
		}
	};// End saveBranchOpenCloseLogs()

	/**
	 * Function to mark menu active
	 *
	 * @param req 	As	 Request Data
	 * @param res 	As	Response Data
	 * @param next	As 	Callback argument to the middleware function
	 *
	 * @return render null
	 */
	async markMenuActive (req, res,next){
		/** Send response to client and work in background */
		res.render('blank',{layout:false});

		try{
			/** Set restaurant conditions */
			let conditions = {
				status 		: Constants.ACTIVE,
				is_deleted	: Constants.NOT_DELETED,
			};
	
			/** Get restaurant list */
			const restaurants = this.db.collection(Tables.RESTAURANTS);
			let restaurantIds = await restaurants.distinct("_id",conditions);
	
			if(restaurantIds && restaurantIds.length >0){
				let currentDay 			=	parseInt(Helper.newDate("","d"));
				let currentTime 		=	parseFloat(Helper.newDate("",Constants.TIME_FORMAT));

				const items 			= 	this.db.collection(Tables.ITEMS);
				const restaurant_menus 	=	this.db.collection(Tables.RESTAURANT_MENUS);
				asyncEach(restaurantIds,(restaurantId,eachCallback)=>{

					/** Set menu conditions */
					let menuConditions = {
						restaurant_id:  restaurantId,
						$or : [
							{is_default: true},
							{$and: [
								{$or: [
									{$and : [
										{start_date : {$gte : currentDay }},
										{end_date   : {$lte : currentDay }}
									]},
									{$and : [
										{end_date 	 : {$gte : currentDay }},
										{start_date : {$lte : currentDay }}
									]}
								]},
								{$or: [
									{$and : [
										{start_time : {$gte : currentTime }},
										{end_time   : {$lte : currentTime }}
									]},
									{$and : [
										{end_time 	: {$gte : currentTime }},
										{start_time : {$lte : currentTime }}
									]}
								]},
							]}
						]
					};

					/** Get menu details */
					restaurant_menus.findOne(menuConditions,{projection: {_id: 1,start_date: 1}, sort: {start_date: Constants.SORT_ASC}}).then(menuResult=>{						

						let menuId = "";
						if(menuResult) menuId = menuResult._id;

						asyncParallel({
							update_menu : (parellelCallback)=>{
								if(!menuId) return parellelCallback(null);

								restaurant_menus.updateOne({
									_id : menuId,
								},
								{$set :{
									menu_active : true
								}}).then(()=>{
									parellelCallback(null);
								}).catch(err=>{
									parellelCallback(err);
								});
							},
							menu_deactive : (parellelCallback)=>{
								restaurant_menus.updateMany({
									restaurant_id	:  	restaurantId,
									_id 			:	{$nin: [menuId]},
								},
								{$set :{
									menu_active : false
								}}).then(()=>{
									parellelCallback(null);
								}).catch(err=>{
									parellelCallback(err);
								});
							},
							update_item : (parellelCallback)=>{
								items.updateMany({
									restaurant_id: restaurantId,
									$or : [
										{"menu_ids.0": {$exists: false}},
										{"menu_ids": {$in: [menuId]}}
									]
								},
								{$set :{
									menu_active : true
								}}).then(()=>{
									parellelCallback(null);
								}).catch(err=>{
									parellelCallback(err);
								});
							},
							item_deactive : (parellelCallback)=>{
								items.updateMany({
									"restaurant_id"	: restaurantId,
									"menu_ids.0"	: {$exists: true},
									"menu_ids"		: {$nin: [menuId]}
								},
								{$set :{
									menu_active : false
								}}).then(()=>{
									parellelCallback(null);
								}).catch(err=>{
									parellelCallback(err);
								});
							},
						},(asyncParentErr)=>{
							eachCallback(asyncParentErr);
						});
					}).catch(err=>{
						eachCallback(err);
					});
				},(asyncEachErr)=>{
					if(asyncEachErr){
						console.error("Each error in markMenuActive",asyncEachErr);
					}
				});
			}
		}catch(error){
			console.error("Catch error in markMenuActive",error);
		}		
	}; // End markMenuActive
}