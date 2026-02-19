/** Model file path for current plugin **/
var modelPath           =	__dirname+"/model/cron";
var modulePath	        = 	FRONT_END_NAME+"crons";
const {updateUserLeave, lapseUserLeave, sendScheduledNotifications, startDriverExcuses, saveOpenBranchList, saveBranchOpenStatus, updateOrderRulesStatus,updateOfferStatus, updateOrderDeliveryPreparationTime ,orderScheduled, orderCanceled, updateDriverAvailableStatus, updateWalletLogs, assignCaptain, updateOrderAssignmentLogs,updateCaptainFreeTime, sendOrderRemindNotification,getReportCustomerOrderValue,paymentRefund,updatePackageDays, markMenuActive, removeModifiedOrderFromCart, updateCravezItems, updateCravezComboItems, agentPerformance,calculateMonthlyStats,calculateDailyStats,weeklyQualityStats, saveOrderCuisineReport,getAvayaData,abandonCartNotification,sendScheduledPNs,getBulkAvayaData,saveDriverPetrolConsumption,writeSettingsFile,saveCaptainWiseOrders,saveRestaurnatWiseOrders,sendAutomaticOrdersVocPN,sendShiftJoinPN,updateModifyOrder,autoEndBreak,saveOperationReport,saveCustomerBreakdownReport,saveAverageBasketSizeReport,autoCloseOrders,updateAghzeyaOrderStatus,saveCustomerOrderStatsReport,updateExpirePaymentOrderStatus,pushRejectedOrderToGfc,pushCancleOrderToGfc,markDriverOutShift,updateOrderStatusPreparingToReadyToPick ,updateAssignmentSlabsData,deleteGfcRequestResponse,deleteOrderAssignmentLogs, pushOrderToDhub, pushCancelOrderToDhub} =   require(modelPath);

/** Set current view folder **/
app.use(modulePath,(req,res,next)=>{
   /** Set current view folder **/
   req.rendering.views	=	__dirname + "/views";
   req.rendering.layout = false;

   next();
});


/* -------------------------------------------------------------------------------------------------------- */

/** Routing is used to update branch area details **/
app.get(modulePath+"/update_branch_area_detail",(req, res,next)=>{
	const asyncEach     = require("async/each");

	/** Get restaurant branch area settings */
	const restaurant_branch_area_settings = db.collection('restaurant_branch_area_settings');
	restaurant_branch_area_settings.aggregate([
		{$group	:	{
			_id :  {
				area_id         : "$area_id",
				branch_id       : "$branch_id",
				restaurant_id   : "$restaurant_id",
			},
			area_id 	    :	{$first : "$area_id"},
			branch_id       :	{$first : "$branch_id"},
			restaurant_id   : 	{$first : "$restaurant_id"},
			attribute_list  :   {$push :{
				attribute_id    : "$attribute_id",
				attribute_value : "$attribute_value",
			}}
		}},
	]).toArray((err,result)=>{
		if(err){
			console.error(err);
			return console.error("Error in update branch area detail");
		}

		if(result && result.length >0){
			const restaurant_branch_areas = db.collection('restaurant_branch_areas');
			asyncEach(result,(records, eachCallback)=>{
				let branchAreaFields    = {};

				/** Get branch area fields */
				records.attribute_list.map(attributeRecords=>{
					let  tmpFields = setBranchAreaFields(attributeRecords.attribute_id,attributeRecords.attribute_value);

					if(tmpFields) branchAreaFields = Object.assign(branchAreaFields ,tmpFields);
				});

				if(Object.keys(branchAreaFields).length <=0) return eachCallback(null);

				/** Update restaurant branch areas */
				restaurant_branch_areas.updateOne({
					area_id         : records.area_id,
					branch_id       : records.branch_id,
					restaurant_id   : records.restaurant_id
				},{$set: branchAreaFields},(updateErr)=>{
					eachCallback(updateErr);
				});
			},(asyncEachErr)=>{
				if(asyncEachErr){
					console.error("async each error in updateBranchAreaDetail");
					return  console.error(asyncEachErr);
				}
			});
		}
	});
	res.render('blank',{layout:false});
});

/** Routing is used to update branch details **/
app.get(modulePath+"/update_branch_detail",(req, res,next)=>{
	const asyncEach  = require("async/each");

	/** Get restaurant branch area settings */
	const restaurant_branch_attributes = db.collection('restaurant_branch_attributes');
	restaurant_branch_attributes.aggregate([
		{$group	:	{
			_id :  {
				branch_id       : "$branch_id",
				restaurant_id   : "$restaurant_id",
			},
			branch_id       :	{$first : "$branch_id"},
			restaurant_id   : 	{$first : "$restaurant_id"},
			attribute_list  :   {$push :{
				attribute_id    : "$attribute_id",
				attribute_value : "$value",
			}}
		}},
	]).toArray((err,result)=>{
		if(err){
			console.error(err);
			return console.error("Error in update branch detail");
		}

		if(result && result.length >0){
			const restaurant_branches = db.collection('restaurant_branches');
			asyncEach(result,(records, eachCallback)=>{
				let branchAreaFields    = {};

				/** Get branch area attributes */
				records.attribute_list.map(attributeRecords=>{
					let  tmpFields = setBranchAreaAttributes(attributeRecords.attribute_id,attributeRecords.attribute_value);

					if(tmpFields) branchAreaFields = Object.assign(branchAreaFields ,tmpFields);
				});

				if(Object.keys(branchAreaFields).length <=0) return eachCallback(null);

				/** Update restaurant branches */
				restaurant_branches.updateOne({
					_id             : records.branch_id,
					restaurant_id   : records.restaurant_id
				},{$set: branchAreaFields},(updateErr)=>{
					eachCallback(updateErr);
				});
			},(asyncEachErr)=>{
				if(asyncEachErr){
					console.error("async each error in updateBranchDetail");
					return  console.error(asyncEachErr);
				}
			});
		}
	});
	res.render('blank',{layout:false});
});

/** Routing is used to update branch details **/
app.get(modulePath+"/update_branch_area_settings",(req, res,next)=>{
	const asyncEach  	= 	require("async/each");
	const asyncParallel	=	require("async/parallel");

	const restaurant_branch_areas 	=	db.collection('restaurant_branch_areas');
	asyncParallel({
		branch_area_list:(callback)=>{
			restaurant_branch_areas.aggregate([
				{$group : {
					_id : {
						branch_id : "$branch_id",
						area_id   : "$area_id",
					},
					branch_id     : {$first : "$branch_id"},
					area_id   	  : {$first : "$area_id"},
					restaurant_id : {$first : "$restaurant_id"}
				}}
			]).toArray((branchAreaErr, branchAreaResult)=>{
				callback(branchAreaErr, branchAreaResult);
			});
		},
		attributes_list:(callback)=>{
			const attributes =	db.collection('attributes');
			attributes.find({type : "branch_area",}, {projection : {attribute_id:1,title:1,default_value:1}}).toArray((err,result)=>{
				callback(err,result);
			});
		}
	},(asyncErr,asyncResponse)=>{
		if(asyncErr){
			console.error(asyncErr);
			return console.error("Error in asyncErr");
		}

		let branchAres 		= 	asyncResponse.branch_area_list;
		let attributesList 	=	asyncResponse.attributes_list;

		const restaurant_branch_area_settings 	=	db.collection('restaurant_branch_area_settings');
		if(branchAres && branchAres.length >0 && attributesList && attributesList.length >0){
			asyncEach(branchAres, (records, eachCallback)=> {

				asyncEach(attributesList, (attributeData, subCallback)=> {

					restaurant_branch_area_settings.updateOne({
						branch_id    : records.branch_id,
						area_id      : records.area_id,
						attribute_id : parseInt(attributeData.attribute_id),
					},
					{
						$setOnInsert : {
							attribute_value : attributeData.default_value,
							added_by   		: ObjectId("5df1e6bf517e712e9f33a2b3"),
							restaurant_id   : records.restaurant_id,
							created    		: getUtcDate()
						},
					},{ upsert : true},(updateBranchAreaErr) => {
						subCallback(updateBranchAreaErr);
					});
				},(asyncSubEachErr)=> {
					eachCallback(asyncSubEachErr, null);
				});
			},(asyncEachErr)=> {
				if(asyncEachErr){
					console.error("Error in async each err");
					return console.error(asyncEachErr);
				}
			});
		}

		res.render('blank',{layout:false});
	});
});

/** Routing is used to calculate restaurant payout **/
app.get(modulePath+"/calculate_restaurant_payout/:from/:to",(req, res,next)=>{

	let fromDate = getUtcDate(req.params.from);
	let toDate = getUtcDate(req.params.to);
	/** Set order conditions */
	let orderConditions = {
		order_date	  : {$gte : fromDate,$lte : toDate},
		order_status  : ORDER_DELIVERED,
		is_settlement : {$exists : false}
	};

	/** Find order details */
	const orders = db.collection('orders');
	orders.find(orderConditions,{projection: {_id:1}}).toArray((err, result)=>{
		if(err){
			console.error(err);
			return console.error("Error in calculate restaurant payout");
		}
		if(result && result.length >0){
			result.map(records=>{
				calculateOrderPayout(req,res,next,{order_id: records._id }).then(()=>{});
			});
		}
	});
	res.render('blank',{layout:false});
});


app.get(modulePath+"/send_push_notification/:user_id",async (req, res, next)=>{
	/** Send push notification */
	pushNotification(req,res,{
		user_id		: 	req.params.user_id,
		pn_type		: 	2,
		pn_body		:	"Test",
	}).then(response=>{
		res.send(response);

	});
});

/** Routing is used to save cancelled user role id **/
app.get(modulePath+"/save_cancelled_order_user_role_id",(req, res,next)=>{
	const asyncEach  = require("async/each");

	/** Set order conditions */
	let orderConditions = {
		order_status  		   : ORDER_CANCELLED,
		cancelled_user_role_id : {$exists : false}
	};

	/** Find order details */
	const orders = db.collection('orders');
	orders.aggregate([
		{$match : orderConditions},
		{$lookup:	{
			from     : "order_status_logs",
			let      : {orderId : "$_id"},
			pipeline : [
				{$match : {
					$expr: {
						$and : [
							{$eq: ["$order_id", "$$orderId"]},
							{$eq: ["$status", ORDER_CANCELLED]},
						]
					}
				}},
				{$project : { _id :0, user_role_id :1 }},
			],
			as	:	"order_status_details"
		}},
		{$project : {order_status_details: 1, _id :1}}
	]).toArray((err,result)=>{
		if(err){
			console.error(err);
			return console.error("Error in save cancelled user role id in cancelled order");
		}

		if(result && result.length >0){

			asyncEach(result,(records, eachCallback)=>{
				let orderStatusDetails = (records.order_status_details && records.order_status_details[0]) ? records.order_status_details[0] : {};

				let userRoleId = "";
				if(orderStatusDetails.user_role_id == FLEET){
					userRoleId = FLEET;
				}else if(orderStatusDetails.user_role_id == RESTAURANT){
					userRoleId = RESTAURANT;
				}else if(orderStatusDetails.user_role_id == CUSTOMER){
					userRoleId = CUSTOMER;
				}else{
					userRoleId = CRAVEZ;
				}

				/** Update order details */
				orders.updateOne({
					_id   : records._id,
				},{$set: {
					cancelled_user_role_id : userRoleId,
					cancel_order_role_id   : true
				}},(updateErr)=>{
					eachCallback(updateErr);
				});
			},(asyncEachErr)=>{
				if(asyncEachErr){
					console.error("async each error in save cancelled user role id in cancelled order");
					return  console.error(asyncEachErr);
				}
			});
		}
	});
	res.render('blank',{layout:false});
});

/** Routing is used to insert driver id in users collection **/
app.get(modulePath+"/insert_driver_id",(req, res,next)=>{
	const asyncEach  = require("async/each");

	/** Set driver conditions */
	let driverConditions = {
		user_role_id:	DRIVER,
		// is_deleted 	:	NOT_DELETED,
		user_type 	:	USER_TYPE_OTHER,
		$or : [
			{driver_id   :   {$exists : false}},
			{driver_id   :   {$in : [null,""]}},
		]
	}

	/** Find driver details */
	const users = db.collection('users');
	users.distinct("_id",driverConditions,(userErr, driverIds)=>{
		if(userErr){
			console.error(userErr);
			return console.error("Error in insert driver id");
		}

		if(driverIds && driverIds.length >0){

			asyncEach(driverIds,(records, eachCallback)=>{

				/** Get unique driver id */
				getUniqueId(req,res,next,{type: "user_driver_id"}).then(uniqueIdResponse=>{

					/** Save driver id */
					users.updateOne({
						_id : records
					},
						{$set: {
							driver_id 	: uniqueIdResponse.result,
							modified 	: getUtcDate()
						}
					},(updateErr)=>{
						eachCallback(updateErr);
					});
				}).catch(next);
			},(asyncEachErr)=>{
				if(asyncEachErr){
					console.error("async each error in insert driver id");
					return  console.error(asyncEachErr);
				}
			});
		}
	});
	res.render('blank',{layout:false});
});

/** Routing is used for change language */
app.all(FRONT_END_NAME+"translate",(req, res,next)=>{
	const fs = require('fs');
	const LanguageTranslatorV3 = require('ibm-watson/language-translator/v3');
	const { IamAuthenticator } = require('ibm-watson/auth');
	const languageTranslator = new LanguageTranslatorV3({
		version: '2018-05-01',
		authenticator: new IamAuthenticator({
			apikey: 'CdRz9RGlTnhasGSnTI_xxTVZEjlKNGnbmWffTyCdTJXn',
		}),
		url: 'https://api.eu-gb.language-translator.watson.cloud.ibm.com',
	});
	//~ const translateParams = {
		//~ text: 'How are you',
		//~ modelId: 'en-ro',
	//~ };

	//~ // To translate
	//~ languageTranslator.translate(translateParams)
		//~ .then(translationResult => {
			//~ // console.log(JSON.stringify(translationResult, null, 2));
			//~ res.send(translationResult.result);
		//~ })
		//~ .catch(err => {
			//~ console.log('error:', err);
		//~ });

		//~ const translateDocumentParams = {
  //~ file: fs.createReadStream(WEBSITE_UPLOADS_ROOT_PATH+'textsettings.xlsx'),
  //~ modelId: 'en-ar',
  //~ filename: 'textsettings.xlsx',
//~ };

//~ languageTranslator.translateDocument(translateDocumentParams)
  //~ .then(result => {
	//~ console.log(JSON.stringify(result, null, 2));
  //~ })
  //~ .catch(err => {
	//~ console.log('error:', err);
  //~ });

  const getTranslatedDocumentParams = {
  documentId: 'ea116c3a-5f9e-413b-a5a0-cf8193239599',
};

//~ languageTranslator.getDocumentStatus(getTranslatedDocumentParams)
  //~ .then(result => {
	//~ console.log(JSON.stringify(result, null, 2));
  //~ })
  //~ .catch(err => {
	//~ console.log('error:', err);
  //~ });

  languageTranslator.getTranslatedDocument(getTranslatedDocumentParams)
  .then(response => {
	const outputFile = fs.createWriteStream(WEBSITE_UPLOADS_ROOT_PATH+'textsettings1.xlsx');
	response.result.pipe(outputFile);
  })
  .catch(err => {
	console.log('error:', err);
  });


});

/** Routing is used to update branch details **/
app.get(modulePath+"/test_assignment/:api_key?",(req, res,next)=>{
	let apiKey 			=	(req.params.api_key) ? req.params.api_key :'AIzaSyC7BU7kUokcgeH0zO_l0KyvwV3hCOWOjHs';

	const distance 		= 	require('google-distance');
	distance.apiKey 	= 	apiKey;
	let origins 		= 	['29.12394,48.134746' ];
	let destinations 	=	['30.0471588,31.3794419','26.9481155,75.840373' ];

	distance.get({
		origins: origins,
		destinations: destinations,
		sensor: false,
		mode: "driving"
	},(err, data)=>{
		res.send({
			apiKey : apiKey,
			err : String(err),
			data : data,
			origins : origins,
			destinations : destinations
		});
	});
});






/** make city id in array in **/
app.get(modulePath+"/update_status_of_failed_orders",(req, res,next)=>{
	const asyncEach  	=	require("async/each");
	const asyncParallel	=	require("async/parallel");

	const order_status_logs = db.collection("order_status_logs");
	order_status_logs.find({status: ORDER_DELIVERED,status_changed_from:{$in: [ORDER_PAYMENT_PENDING,ORDER_PAYMENT_FAILED]}},{projection: {order_id:1,status_changed_from:1}}).toArray((err, result)=>{
		if(err){
			console.error(err);
			return console.error("Error in find order_status_logs");
		}

		if(result && result.length >0){
			const orders = db.collection("orders");
			asyncEach(result,(records, eachCallback)=>{

				asyncParallel({
					update_order:(callback)=>{
						/** Set update data */
						let orderUpdateData				= 	(ORDER_ACTIONS[records.status_changed_from])	?	ORDER_ACTIONS[records.status_changed_from] :{};
						orderUpdateData.modified		= 	getUtcDate();
						orderUpdateData.status_reverted	=	getUtcDate();

						/** Revert order status */
						orders.updateOne({_id: ObjectId(records.order_id) },{$set: orderUpdateData, $unset: {is_completed: 1}},(updateErr)=>{
							callback(updateErr);
						});
					},
					delete_logs:(callback)=>{
						/** Delete current log */
						order_status_logs.deleteOne({_id: records._id},(err)=>{
							callback(err);
						});
					}
				},(asyncErr)=>{
					eachCallback(asyncErr);
				});
			},(asyncEachErr)=>{
				if(asyncEachErr){
					console.error("async each error in update_status_of_failed_orders");
					return  console.error(asyncEachErr);
				}
			});
		}
	});
	res.render('blank',{layout:false});
});

/** Update in orders table */
app.get(modulePath + "/update_order_details/:days?", (req, res, next) => {
	res.render('blank',{layout:false});

	let days = (req.params.days) ? parseInt(req.params.days) :"";

	if(days <=0 || isNaN(days)) days = CUSTOMER_ORDER_REPORT_DAYS;

	let dates  			=  	getDates(newDate(subtractDate(days*HOURS_IN_A_DAY)),newDate());
	const eachOfSeries 	= 	require("async/eachOfSeries");

	const orders    	=	db.collection('stage_orders');
	const order_details	=  	db.collection('stage_order_details');
	eachOfSeries(dates,(date, firstKey, parentCallback)=>{
		let tmpStartDate 	=	newDate(newDate(date,CURRENTDATE_START_DATE_FORMAT));
		let tmpEndDate		= 	newDate(newDate(date,CURRENTDATE_END_DATE_FORMAT));

		logger("tmpEndDate "+tmpEndDate)

		orders.find({
			order_date: {$gte: tmpStartDate, $lte : tmpEndDate},
			customer_latitude : {$exists: false}
		},{projection:{_id:1,}}).toArray((orderErr, orderList)=>{
			if(orderErr || orderList.length ==0) return parentCallback(orderErr);

			logger("orderList "+orderList.length)

			eachOfSeries(orderList,(records, secKey, childCallback)=>{
				let orderId = records._id;

				order_details.findOne({order_id : orderId },{projection:{customer_latitude:1,customer_longitude:1,delivery_duration:1,discount_price:1,remaining_delivery_duration:1,customer_address_detail:1}},(err, result)=>{
					if(err || !result) return childCallback(err);

					orders.updateOne({
						_id: orderId
					},
					{$set: {
						customer_latitude			:	(result.customer_latitude)  			? 	result.customer_latitude 	:0,
						customer_longitude			:	(result.customer_longitude) 			? 	result.customer_longitude 	:0,
						delivery_duration			:	(result.delivery_duration) 				? 	result.delivery_duration 	:0,
						discount_price				:	(records.discount_price) 				? 	records.discount_price 		:0,
						remaining_delivery_duration	:	(result.remaining_delivery_duration)	? 	result.remaining_delivery_duration :0,
						customer_address_detail		:	(result.customer_address_detail) 		? 	result.customer_address_detail	:{},
					}},(updateErr)=>{
						childCallback(updateErr);
					});
				});
			},(eachErr)=> {
				parentCallback(eachErr);
			});
		});
	},(eachErr)=> {
		if(eachErr){
			console.error("Error in last each");
			return console.error(eachErr);
		}

		console.error("Done");
	});
});




app.get(modulePath + "/breakdown_report", (req, res, next) => {
	const request 		=	require("request");
	const asyncEach		=	require("async/each");
	var currentYear		= 	newDate().getFullYear();
	var currentMonth 	= 	newDate().getMonth()+1;

	let range = dateRange("2017-01", currentYear+'-'+currentMonth);


	asyncEach(range, (record, parentCallback) => {
		var start    	= record.split('-');
		var startYear   = start[0];
		var startMonth  = start[1];

		request(WEBSITE_URL+"crons/testing_route/"+startYear+"/"+startMonth,()=>{ });
		parentCallback(null);
	},()=> {
		res.send({status: "Done"});
	});
});


/** Update in orders table */
app.get(modulePath + "/mark_manually_out_shift", (req, res, next) => {
	const eachOfSeries 	= 	require("async/eachOfSeries");

	const driver_in_out_shifts = db.collection('driver_in_out_shifts');
	driver_in_out_shifts.find({
		// type       : "in_shift",
		// vehicle_id : {$exists: false},
		created	   :  {$lte: newDate(subtractDate(5*HOURS_IN_A_DAY)) },

		// type        : "out_shift",
		// in_latitude : {$exists: true},
		// out_longitude : {$exists: false},
	}).toArray((err, list)=>{
		if(err || list.length ==0) return res.send({err: err, list: list});

		res.send({err: err, list: list});

		eachOfSeries(list,(data, firstKey, parentCallback)=>{

			let updateData = {
				type				: 	OUT_SHIFT,
				out_km		 		: 	data.km,
				total_km 			: 	0,
				out_time			:	data.modified,
				updated_by_manually	:	getUtcDate(),
			};

			if(data.in_latitude && data.in_longitude){
				updateData.out_latitude	= 	data.in_latitude;
				updateData.out_longitude=	data.in_longitude;
			}

			/** Update driver out shifts details */
			driver_in_out_shifts.updateOne({_id: data._id },{$set: updateData},(updateErr) => {
				parentCallback(updateErr);
			});
		},(eachErr)=> {
			if(eachErr){
				console.error("Error manually_mark_out_shift");
				return console.error(eachErr);
			}

			console.error("Done");
		});
	});
});

app.get(modulePath + "/copy_area_to_another_restaurant/:form_rest_id/:to_rest_id",(req, res, next) => {
	let fromRestId = req.params.form_rest_id;
	let toRestId   = req.params.to_rest_id;

	const eachOfSeries 	=	require("async/eachOfSeries");
	const asyncParallel	= 	require("async/parallel");

	const aghzeya_areas	= db.collection("aghzeya_areas");
	asyncParallel({
		area_list : (callback)=>{
			/** Get area list */
			aghzeya_areas.find({aghzeya_restaurant_id: {$in: [ parseInt(fromRestId), String(fromRestId) ]} }).toArray((err, result)=>{
				callback(err, result);
			})
		},
		rest_obj : (callback)=>{
			/** Get restaurant list */
			const restaurants = db.collection("restaurants");
			restaurants.find({aghzeya_restaurant_id: {$in: [parseInt(fromRestId), parseInt(toRestId), String(fromRestId), String(toRestId)]}},{projection: {_id:1,slug:1,aghzeya_restaurant_id:1}}).toArray((err, result)=>{
				let restObj = {};
				if(result){
					result.map(data=>{
						restObj[data.aghzeya_restaurant_id] = data;
					});
				}
				callback(err,restObj);
			})
		}
	},(asyncErr, asyncResponse)=>{
		if(asyncErr) return next(asyncErr);

		let areaList	=	asyncResponse.area_list	?	asyncResponse.area_list	:[];
		let restObj		= 	asyncResponse.rest_obj	? 	asyncResponse.rest_obj	:{};

		/** Send error response */
		if(areaList.length == 0) return res.send({ status: STATUS_ERROR, message: "No area found" });
		if(!restObj[fromRestId] || !restObj[toRestId]) return res.send({ status: STATUS_ERROR, message: "No restaurant found", restObj: restObj });

		let toRestObjId	 	=	restObj[toRestId]._id;
		let toRestSlug		= 	restObj[toRestId].slug;
		let deleteAbleId 	=	ObjectId();

		/** Update delete flag old mapped areas */
		aghzeya_areas.updateMany({restaurant_id: toRestObjId },{$set: { to_be_deleted : deleteAbleId }},(deleteErr)=>{
			if(deleteErr) return next(deleteErr);

			eachOfSeries(areaList,(data, key, seriesCallback)=>{
				/** Update areas details */
				aghzeya_areas.updateOne({
					restaurant_id 	: 	toRestObjId,
					aghzeya_area_id : 	data.aghzeya_area_id,
				},
				{
					$set: {
						name     	   	: data.name,
						modified 	   	: getUtcDate(),
						area_id		   	: data.area_id,
						cravez_area_id 	: data.cravez_area_id,
						copy_from_rest	: fromRestId,
					},
					$setOnInsert: {
						aghzeya				 : 	true,
						created			     :	getUtcDate(),
						restaurant_slug	     : 	toRestSlug,
						aghzeya_restaurant_id:	toRestId,
					},
					$unset: {
						to_be_deleted : 1
					},
				},{upsert: true},(err)=>{
					seriesCallback(err);
				});
			},(eachErr)=> {
				if(eachErr) return next(eachErr);

				/** Delete areas */
				aghzeya_areas.deleteMany({restaurant_id: toRestObjId, to_be_deleted: deleteAbleId },(deleteErr)=>{
					if(deleteErr) return next(deleteErr);

					/** Send success response */
					res.send({status: STATUS_SUCCESS, area_list: areaList });
				});
			});
		});
	});
});

app.get(modulePath + "/copy_cancel_reason_to_another_restaurant/:form_rest_id/:to_rest_id",(req, res, next) => {
	let fromRestId = req.params.form_rest_id;
	let toRestId   = req.params.to_rest_id;

	const eachOfSeries 	=	require("async/eachOfSeries");
	const asyncParallel	= 	require("async/parallel");

	const aghzeya_restaurant_cancel_reasons	= db.collection("aghzeya_restaurant_cancel_reasons");
	asyncParallel({
		reason_list : (callback)=>{
			/** Get area list */
			aghzeya_restaurant_cancel_reasons.find({aghzeya_restaurant_id: {$in: [ parseInt(fromRestId), String(fromRestId) ]} }).toArray((err, result)=>{
				callback(err, result);
			})
		},
		rest_obj : (callback)=>{
			/** Get restaurant list */
			const restaurants = db.collection("restaurants");
			restaurants.find({aghzeya_restaurant_id: {$in: [parseInt(fromRestId), parseInt(toRestId), String(fromRestId), String(toRestId)]}},{projection: {_id:1,slug:1,aghzeya_restaurant_id:1}}).toArray((err, result)=>{
				let restObj = {};
				if(result){
					result.map(data=>{
						restObj[data.aghzeya_restaurant_id] = data;
					});
				}
				callback(err,restObj);
			})
		}
	},(asyncErr, asyncResponse)=>{
		if(asyncErr) return next(asyncErr);

		let restObj		= 	asyncResponse.rest_obj		? 	asyncResponse.rest_obj		:{};
		let reasonList	=	asyncResponse.reason_list	?	asyncResponse.reason_list	:[];

		/** Send error response */
		if(reasonList.length == 0) return res.send({ status: STATUS_ERROR, message: "No area found" });
		if(!restObj[fromRestId] || !restObj[toRestId]) return res.send({ status: STATUS_ERROR, message: "No restaurant found", restObj: restObj });

		let toRestObjId	 	=	restObj[toRestId]._id;
		let toRestSlug		= 	restObj[toRestId].slug;
		let deleteAbleId 	=	ObjectId();

		/** Update delete flag old mapped areas */
		aghzeya_restaurant_cancel_reasons.updateMany({restaurant_id: toRestObjId },{$set: { to_be_deleted : deleteAbleId }},(deleteErr)=>{
			if(deleteErr) return next(deleteErr);

			eachOfSeries(reasonList,(data, key, seriesCallback)=>{
				/** Update areas details */
				aghzeya_restaurant_cancel_reasons.updateOne({
					restaurant_id 		: 	toRestObjId,
					aghzeya_reason_id 	: 	data.aghzeya_reason_id,
				},
				{
					$set: {
						name     	   	: data.name,
						modified 	   	: getUtcDate(),
						cancel_reason_id: data.cancel_reason_id,
						copy_from_rest	: fromRestId,
					},
					$setOnInsert: {
						aghzeya				 : 	true,
						created			     :	getUtcDate(),
						restaurant_slug	     : 	toRestSlug,
						aghzeya_restaurant_id:	toRestId,
					},
					$unset: {
						to_be_deleted : 1
					},
				},{upsert: true},(err)=>{
					seriesCallback(err);
				});
			},(eachErr)=> {
				if(eachErr) return next(eachErr);

				/** Delete areas */
				aghzeya_restaurant_cancel_reasons.deleteMany({restaurant_id: toRestObjId, to_be_deleted: deleteAbleId },(deleteErr)=>{
					if(deleteErr) return next(deleteErr);

					/** Send success response */
					res.send({status: STATUS_SUCCESS, reason_list: reasonList });
				});
			});
		});
	});
});

app.get(modulePath+"/update-ref-in-orders",(req, res, next) => {

	let numberOfDays 	=	90;
	let startDate 		=	newDate(newDate(subtractDate(numberOfDays * HOURS_IN_A_DAY),CURRENTDATE_START_DATE_FORMAT));

	const orders = db.collection("orders");
	orders.aggregate([
		{$match :  {
			order_date		:	{$gte: startDate},
			simphonyCheckRef:	{$exists: true},
			simphonyLocRef	:	{$exists: false},
			simphonyRvcRef	:	{$exists: false},
		}},
		{$lookup: {
			from     : "order_items",
			let      : {orderId : "$_id"},
			pipeline : [
				{$match : {
					$expr: {
						$and : [
							{$eq: ["$order_id", "$$orderId"]},
						]
					}
				}},
				{$sort : {cart_created: SORT_ASC}},
				{$limit: 1},
				{$lookup:	{
					"from" 			: 	"items",
					"localField" 	:	"item_id",
					"foreignField" 	: 	"_id",
					"as" 			: 	"item_detail"
				}},
				{$match :  {
					'item_detail.0': {$exists: true},
				}},
				{$project:{
					item_detail: {$arrayElemAt: ["$item_detail.branches",0]} ,
				}}
			],
			as:	"item_list"
		}},
		{$match: {
			'item_list.0': {$exists: true},
		}},
		{$project: { _id:1, branch_id: 1, item_branch: {$arrayElemAt: ["$item_list.item_detail",0]} }},
	]).toArray((err, result)=>{
		if(err || !result.length) return res.send({err : err, result : result});

		const eachOfSeries = require("async/eachOfSeries");
		eachOfSeries(result,(records, firstKey, parentCallback)=>{
			let branchId 		= 	records.branch_id;
			let itemBranches	= 	records.item_branch ? records.item_branch :{} ;
			let locRef 	 		=	"";
			let rvcRef 	 		=	"";

			if(itemBranches[branchId] && Object.keys(itemBranches[branchId]).length){
				let tmpLocRef  =	Object.keys(itemBranches[branchId])[0];
				let tmpRvcRef  =	itemBranches[branchId][tmpLocRef];

				if(tmpLocRef && tmpRvcRef){
					locRef = tmpLocRef;
					rvcRef = tmpRvcRef;
				}
			}

			if(!locRef || !rvcRef) return parentCallback(null);

			/** Update ref in orders */
			orders.updateOne({
				_id: records._id,
			},{$set: {
				simphonyLocRef	:	locRef,
				simphonyRvcRef	:	rvcRef,
			}},(updateErr)=>{
				parentCallback(updateErr);
			});
		},(eachErr)=> {
			res.send({eachErr : eachErr, result : result});
		});
	});
});