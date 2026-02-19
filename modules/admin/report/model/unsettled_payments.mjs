import { ObjectId } from 'mongodb';
import { parallel as asyncParallel} from 'async';
import * as Constants from '../../../../config/global_constant.mjs';
import Tables from '../../../../config/database_tables.mjs';
import BREADCRUMBS from '../../../../breadcrumbs.mjs';
import { isPost, getDropdownList,arrayToObject, newDate, exportToExcel, configDatatable, currencyFormat, sanitizeData, getUtcDate } from '../../../../utils/index.mjs';

// Model for unsettled payments
export default class UnsettledPayments {
	constructor(db) {
		this.db = db;
	}

	/**
	 * Function to get unsettled payments list
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 *
	 * @return render/json
	 */
	async getUnsettledPaymentsList(req,res,next){
		try{
			if(isPost(req)){
				let limit		  = (req.body.length) ? parseInt(req.body.length) :Constants.ADMIN_LISTING_LIMIT;
				let skip		  = (req.body.start)  ? parseInt(req.body.start)  :Constants.DEFAULT_SKIP;
				let fromDate      = (req.body.from_date) ? req.body.from_date : "";
				let toDate 	  	  = (req.body.to_date)   ? req.body.to_date   : "";
				let settlementMethod = (req.body.settlement_method) ? req.body.settlement_method :'';
				let restaurantId 	 = (req.body.restaurant_id)   	? req.body.restaurant_id 	 :'';
				let branchId 	 	 = (req.body.branch_id)   		? req.body.branch_id 	 	 :'';
				let paymentMethod 	 = (req.body.payment_method)   	? req.body.payment_method 	 :'';
				const collection  	 = this.db.collection(Tables.ORDERS);

				/** Get restaurant ids */
				let restaurantIds = [];
				if(settlementMethod){
					const restaurant_details = this.db.collection(Tables.RESTAURANT_DETAILS);
					restaurantIds = await restaurant_details.distinct("restaurant_id",{
						settlement_method : {$in : [settlementMethod]}
					});
				}			

				/** Configure Datatable conditions*/
				let dataTableConfig = await configDatatable(req,res,null);

				/** Set common condition  */
				let commonConditions = {
					is_settlement : {$exists : false}
				};

				/** Condition for settlement method */
				if(settlementMethod) commonConditions.restaurant_id = {$in : restaurantIds};

				/** Conditions for order date */
				if (fromDate != "" && toDate != "") {
					dataTableConfig.conditions["order_date"] = {
						$gte 	: newDate(fromDate),
						$lte 	: newDate(toDate),
					};
				}

				/** Conditions for restaurants */
				if(restaurantId){
					if(restaurantId.constructor !== Array)  restaurantId = [restaurantId];
					restaurantId = arrayToObject(restaurantId);

					if(!dataTableConfig.conditions['$and']) dataTableConfig.conditions['$and'] = [];
					dataTableConfig.conditions['$and'].push({
						restaurant_id : {$in : restaurantId}
					});
				}

				/** Conditions for payment method */
				if(paymentMethod){
					if(paymentMethod.constructor !== Array)  paymentMethod = [paymentMethod];
					dataTableConfig.conditions['payment_method'] =	{$in: paymentMethod};
				}

				/** Conditions for branches */
				if(branchId){
					if(branchId.constructor !== Array)  branchId = [branchId];
					branchId = arrayToObject(branchId);

					if(!dataTableConfig.conditions['$and']) dataTableConfig.conditions['$and'] = [];
					dataTableConfig.conditions['$and'].push({
						branch_id : {$in : branchId}
					});
				}

				dataTableConfig.conditions = Object.assign(dataTableConfig.conditions,commonConditions);

				asyncParallel({
					payments_list :(callback)=>{
						/** Get list of  unsettled payments list  **/
						collection.aggregate([
							{$match	: dataTableConfig.conditions},
							{$group	: {
								_id : { restaurant_id   : "$restaurant_id"},
								restaurant_name 	 : { $first : "$restaurant_name"},
								restaurant_id        : { $first : "$restaurant_id"},
								account_manager_name : { $first : "$account_manager_name"},
								email_address   	 : { $first : "$email_address"},
								mobile_number   	 : { $first : "$mobile_number"},
								branch_detail   	 : { $addToSet  : "$branch_id"},
								total_due_payment    : { $sum : "$total_payout"},
								total_due_payment_to_pay : { $sum : "$restaurant_payout"},
								total_commission 	 : { $sum : "$cravez_payout"},
							}},
							{$sort 	: dataTableConfig.sort_conditions},
							{$skip 	: skip},
							{$limit : limit},
							{$lookup:	{ /** Get restaurant details */
								"from" 			: 	Tables.RESTAURANT_DETAILS,
								"localField" 	:	"restaurant_id",
								"foreignField" 	: 	"restaurant_id",
								"as" 			: 	"restaurant_detail"
							}},
							{$addFields:	{
								account_manager_name : {$arrayElemAt: ["$restaurant_detail.account_manager",0]},
								email_address		 : {$arrayElemAt: ["$restaurant_detail.email",0]},
								mobile_number        : {$arrayElemAt: ["$restaurant_detail.mobile_number",0]},
								total_branches 		 : {$size: "$branch_detail"},
							}},
							{$project : {restaurant_detail: 0} }
						]).toArray().then(findResult => {
							callback(null,findResult);
						}).catch(next);
					},
					total_records:(callback)=>{
						/** Get total number of records in orders collection **/
						collection.distinct("restaurant_id",commonConditions).then(restaurantIds => {
							let count = restaurantIds.length;
							callback(null, count);
						}).catch(next);
					},
					filter_records:(callback)=>{
						/** Get filtered records counting in orders **/
						collection.distinct("restaurant_id",dataTableConfig.conditions).then(restaurantIds => {
							let filterCount = restaurantIds.length;
							callback(null, filterCount);
						}).catch(next);
					}
				},(err, response)=>{
					/** Send response **/
					res.send({
						status			: (!err) ? Constants.STATUS_SUCCESS : Constants.STATUS_ERROR,
						draw			: dataTableConfig.result_draw,
						data			: (response.payments_list) ? response.payments_list :[],
						recordsFiltered	: (response.filter_records) ? response.filter_records :0,
						recordsTotal	: (response.total_records) 	? response.total_records :0
					});
				});
			}else{
				/** Set dropdown options **/
				let options = {
					collections :[
						{
							collection : Tables.SETTLEMENT_METHODS,
							columns    : ["slug","title"]
						},
						{
							collection : Tables.RESTAURANTS,
							columns    : ["_id",["name",Constants.DEFAULT_LANGUAGE_CODE]],
							conditions : {
								is_deleted	: Constants.NOT_DELETED
							},
						},
						{
							collection : Tables.PAYMENT_METHODS,
							columns    : ["slug",["title",Constants.DEFAULT_LANGUAGE_CODE]]
						},
					]
				};

				/**Get dropdown list **/
				getDropdownList(req,res, next,options).then(response=> {
					/** render unsettled payments listing page **/
					req.breadcrumbs(BREADCRUMBS['admin/report/unsettled_payment_list']);
					res.render('unsettled_payment_list',{
						settlement_methods  : response?.final_html_data?.[0] || "",
						restaurant_list     : response?.final_html_data?.[1] || "",
						payment_methods     : response?.final_html_data?.[2] || ""
					});
				}).catch(next);
			}
		}catch(error){
			return next(error);
		}
	};//End getUnsettledPaymentsList()

	/**
	 * Function for proceed to pay unsettled payments
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 * @param next 	As Callback argument to the middleware function
	 *
	 * @return render/json
	 */
	async proceedUnsettledPayments(req, res,next){
		try{
			let restaurantId = (req.params.restaurant_id) ? new ObjectId(req.params.restaurant_id)	:"";
			let orderIds	 = (req.query.order_ids) 	  ? req.query.order_ids.split(",") 		:[];
			
			if(!restaurantId || orderIds.length <=0){
				return res.status(400).send({status: Constants.STATUS_ERROR,message:res.__("admin.system.invalid_access")});
			}

			const orders  = this.db.collection(Tables.ORDERS);

			/** Convert object id */
			orderIds = arrayToObject(orderIds);
			if(isPost(req)){
				/** Sanitize Data **/
				req.body  			 = sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
				let settlementMethod = req.body.settlement_method;
				let errors = [];
				
				if(!req.body.settlement_method){
					errors.push({ 'param': 'settlement_method', 'msg': res.__("admin.unsettled_payments.please_select_settlement_method")});
				}

				if(!req.body.amount){
					errors.push({ 'param': 'amount', 'msg': res.__("admin.unsettled_payments.please_enter_amount")});
				}else if(req.body.amount <= 0 || isNaN(req.body.amount)){
					errors.push({ 'param': 'amount', 'msg': res.__("admin.unsettled_payments.please_enter_valid_amount")});
				}

				if(!req.body.date_of_payment){
					errors.push({ 'param': 'date_of_payment', 'msg': res.__("admin.unsettled_payments.please_select_date_of_payment")});
				}				

				if(settlementMethod == Constants.CHEQUE_SETTLEMENT_METHOD){
					if(!req.body.bank_account_number){
						errors.push({ 'param': 'bank_account_number', 'msg': res.__("admin.unsettled_payments.please_enter_bank_account_number")});
					}

					if(!req.body.beneficiary_name){
						errors.push({ 'param': 'beneficiary_name', 'msg': res.__("admin.unsettled_payments.please_enter_beneficiary_name")});
					}

					if(!req.body.iban){
						errors.push({ 'param': 'iban', 'msg': res.__("admin.unsettled_payments.please_enter_iban")});
					}

					if(!req.body.cheque_number){
						errors.push({ 'param': 'cheque_number', 'msg': res.__("admin.unsettled_payments.please_enter_cheque_number")});
					}else if(isNaN(req.body.cheque_number) || req.body.cheque_number <=0){
						errors.push({ 'param': 'cheque_number', 'msg': res.__("admin.unsettled_payments.please_enter_valid_cheque_number")});
					}

					if(!req.body.cheque_date){
						errors.push({ 'param': 'cheque_date', 'msg': res.__("admin.unsettled_payments.please_select_cheque_date")});
					}
				}
				/** Send error response **/
				if(errors.length > 0) return res.send({status: Constants.STATUS_ERROR, message: errors});
				
				/** Get order details **/
				orders.aggregate([
					{$match	: {
						_id 		  : {$in : orderIds},
						restaurant_id : restaurantId,
						is_settlement : {$exists : false}
					}},
					{$group	: {
						_id 		: "$restaurant_id",
						pay_amount 	: {$sum 	: "$restaurant_payout"},
						order_ids 	: {$push 	: "$_id"},
					}},
				]).toArray().then(orderResult => {

					if(orderResult.length <=0){
						return res.send({status: Constants.STATUS_ERROR, message: res.__("admin.system.something_went_wrong")});
					}

					let payAmount 	  	=	(orderResult[0]) ? orderResult[0].pay_amount	:0;
					let finalOrderIds	= 	(orderResult[0]) ? orderResult[0].order_ids 	:[];
					let dateOfPayment 	= 	newDate(req.body.date_of_payment,Constants.DATABASE_DATE_FORMAT);
					dateOfPayment     	= 	getUtcDate(dateOfPayment+" "+Constants.END_DATE_TIME_FORMAT);

					/** set data in object **/
					let insertData = {
						pay_amount   	  : parseFloat(payAmount),
						date_of_payment   : dateOfPayment,
						remarks           : (req.body.remarks) ? req.body.remarks :"",
						created    		  : getUtcDate(),
						proceed_by        : new ObjectId(req.session.user._id),
						settlement_method : settlementMethod,
						restaurant_id     : new ObjectId(restaurantId),
						order_ids     	  : finalOrderIds
					};

					/** set data according settlement method **/
					if(settlementMethod == Constants.CHEQUE_SETTLEMENT_METHOD){
						let chequeDate = newDate(req.body.cheque_date,Constants.DATABASE_DATE_FORMAT);
						chequeDate     = getUtcDate(chequeDate+" "+Constants.END_DATE_TIME_FORMAT);

						insertData.cheque_date 	 	   = chequeDate;
						insertData.cheque_number       = req.body.cheque_number;
						insertData.bank_account_number = req.body.bank_account_number;
						insertData.beneficiary_name    = req.body.beneficiary_name;
						insertData.iban 			   = req.body.iban;
					}

					asyncParallel({
						order_settlement :(callback)=>{
							/** Save order settlement payment logs details **/
							const order_settlement_payment_logs  = this.db.collection(Tables.ORDER_SETTLEMENT_PAYMENT_LOGS);
							order_settlement_payment_logs.insertOne(insertData).then(insertResult => {
								callback(null,insertResult);
							}).catch(next);
						},
						update_order_details :(callback)=>{
							/** Save order settlement payment logs details **/
							orders.updateMany({
								_id : {$in: finalOrderIds}
							},
							{$set : {
								is_settlement 	: true,
								modified    	: getUtcDate(),
							}}).then(updateResult => {
								callback(null,updateResult);
							}).catch(next);
						},
					},(asyncErr)=>{
						if(asyncErr) return next(asyncErr);

						/** Send success response **/
						req.flash(Constants.STATUS_SUCCESS,res.__("admin.unsettled_payments.unsettled_payment_has_been_paid_successfully"));
						res.send({
							status		 : Constants.STATUS_SUCCESS,
							message		 : res.__("admin.unsettled_payments.unsettled_payment_has_been_paid_successfully"),
							redirect_url : Constants.WEBSITE_ADMIN_URL+"report/unsettled_payment/order_details/"+restaurantId
						});
					});
				});
			}else{
				asyncParallel({
					restaurant_details :(callback)=>{
						/** Get restaurant details **/
						const restaurant_details  = this.db.collection(Tables.RESTAURANT_DETAILS);
						restaurant_details.findOne({restaurant_id: restaurantId },{projection: {beneficiary:1,iban:1,bank_account:1}}).then(restaurantResult => {
							callback(null, restaurantResult);
						}).catch(next);
					},
					order_details : (callback)=>{
						/** Get order details **/
						orders.aggregate([
							{$match	: {
								_id 		  : {$in : orderIds},
								restaurant_id : restaurantId,
								is_settlement : {$exists : false}
							}},
							{$group	: {
								_id 		: 	"$restaurant_id",
								pay_amount 	:	{$sum : "$restaurant_payout"},
							}},
						]).toArray().then(orderResult => {
							orderResult = (orderResult && orderResult[0]) ? orderResult[0] :{};
							callback(null,orderResult);
						}).catch(next);
					},
					settlement_list : (callback)=>{
						/** Set dropdown options **/
						let options = {
							collections :[{
								collection : Tables.SETTLEMENT_METHODS,
								columns    : ["slug","title"]
							}]
						};

						/**Get settlement method dropdown list **/
						getDropdownList(req,res, next,options).then(response=> {
							let settlementList = (response?.final_html_data) ? response?.final_html_data[0] :"";
							callback(null,settlementList);
						}).catch(next);
					}
				},async (childAsyncErr,childAsyncResponse)=>{
					if(childAsyncErr) return next(childAsyncErr);

					/** Render proceed payment page */
					res.render('proceed_payment',{
						layout			   : false,
						order_ids          : orderIds,
						restaurant_id 	   : restaurantId,
						order_details      : childAsyncResponse.order_details,
						settlement_methods : childAsyncResponse.settlement_list,
						restaurant_details : childAsyncResponse.restaurant_details,
					});
				});
			}
		}catch(error){
			return next(error);
		}
	};//End proceedUnsettledPayments()

	/**
	 * Function to get order details list
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 * @param settlement 	As Settlement flag
	 *
	 * @return render/json
	 */
	async getOrderDetailsList(req,res,next, settlement=false){
		try{
			let restaurantId = (req.params.restaurant_id)   ? req.params.restaurant_id   :"";
			let fromDate  	 = (req.query.date_from) 		? req.query.date_from 		 :"";
			let toDate 	  	 = (req.query.date_to)   		? req.query.date_to       	 :"";

			if(isPost(req)){
				let limit	 	  = (req.body.length)   ? parseInt(req.body.length) :Constants.ADMIN_LISTING_LIMIT;
				let skip     	  = (req.body.start)    ? parseInt(req.body.start)  :Constants.DEFAULT_SKIP;
				fromDate  	 	  = (req.body.fromDate) ? req.body.fromDate 	    :"";
				toDate 	  	 	  = (req.body.toDate)   ? req.body.toDate           :"";
				let orderStatus   = (req.body.order_status) ? req.body.order_status :"";
				let paymentMethod = (req.body.payment_method)  ? req.body.payment_method :'';
				const collection  =	this.db.collection(Tables.ORDERS);
				
				/** Configure Datatable conditions*/
				let dataTableConfig = await configDatatable(req,res,null);

				/** Set common conditions */
				let commonConditions = {
					restaurant_id : new ObjectId(restaurantId),
					is_settlement : {$exists : false}
				};

				/** Conditions for settled order logs */
				if(settlement) {
					commonConditions = {
						restaurant_id : new ObjectId(restaurantId),
						is_settlement : true
					}
				}

				/** Conditions for order date */
				if (fromDate != "" && toDate != "") {
					dataTableConfig.conditions["order_date"] = {
						$gte : 	newDate(fromDate),
						$lte :	newDate(toDate),
					};
				}

				/** Conditions for order status */
				if(orderStatus){
					dataTableConfig.conditions["order_status"] = orderStatus;
				}

				/** Conditions for payment method */
				if(paymentMethod){
					if(paymentMethod.constructor !== Array)  paymentMethod = [paymentMethod];
					dataTableConfig.conditions['payment_method'] =	{$in: paymentMethod};
				}

				dataTableConfig.conditions = Object.assign(dataTableConfig.conditions,commonConditions);
				asyncParallel({
					order_list :(callback)=>{
						/** Get list of order details  **/
						collection.aggregate([
							{$match : dataTableConfig.conditions},
							{$sort  : dataTableConfig.sort_conditions},
							{$skip 	: skip},
							{$limit : limit},
							{$lookup: {	/** Get users details **/
								from 		:	Tables.USERS,
								localField  :	"customer_id",
								foreignField:	"_id",
								as 		  	:	"customer_details"
							}},
							{$lookup: {	/** Get order details **/
								from 		:	Tables.ORDER_DETAILS,
								localField  :	"_id",
								foreignField:	"order_id",
								as 		  	:	"order_details"
							}},
							{$lookup: {	/** Get restaurant branch details **/
								from 		:	Tables.RESTAURANT_BRANCHES,
								localField  :	"branch_id",
								foreignField:	"_id",
								as 		  	:	"branch_details"
							}},
							{$project : {
								_id:1,order_date:1,unique_order_id:1,delivery_type:1,payment_method:1,net_amount:1,order_price:1,delivery_fee:1,knet_charges:1,branch_id:1,order_status:1,area_name:1,cravez_payout:1,total_knet_amount:1,discount_refund_to_restaurant:1,restaurant_payout:1,
								client_full_name: {$arrayElemAt: ["$customer_details.full_name",0]},
								customer_category: {$arrayElemAt: ["$customer_details.client_type",0]},
								mobile_number: {$arrayElemAt: ["$customer_details.mobile_number",0]},
								discount_price: {$arrayElemAt: ["$order_details.discount_price",0]},
								offer_code: {$arrayElemAt: ["$order_details.offer_code",0]},branch_name: {$arrayElemAt: ["$branch_details.name."+Constants.DEFAULT_LANGUAGE_CODE,0]},
							}},
						]).toArray().then(findResult => {
							if(!findResult || findResult.length < 0) return callback(null,[]);

							let deliveryTypes  = [];
							let paymentMethods = [];
							findResult.map(records=>{
								deliveryTypes.push(records.delivery_type);
								paymentMethods.push(records.payment_method);
							});

							asyncParallel({
								delivery_method_details :(subCallback)=>{
									/** Get delivery type **/
									const delivery_methods  = this.db.collection(Tables.DELIVERY_METHODS);
									delivery_methods.find({slug : {$in : deliveryTypes}},{projection: {slug:1,title:1}}).toArray().then(deliveryResult => {
										if(!deliveryResult || deliveryResult.length < 0) return subCallback(null,{});
										let deliveryMethodList = {};
										deliveryResult.map(records=>{
											deliveryMethodList[records.slug] = records.title;
										});
										subCallback(null,deliveryMethodList);
									}).catch(next);
								},
								payment_method_details :(subCallback)=>{
									/** Get payment method **/
									const payment_methods  = this.db.collection(Tables.PAYMENT_METHODS);
									payment_methods.find({slug : {$in : paymentMethods}},{projection: {slug:1,title:1}}).toArray().then(paymentResult => {
										if(!paymentResult || paymentResult.length < 0) return subCallback(null,{});
										let paymentMethodList = {};
										paymentResult.map(records=>{
											paymentMethodList[records.slug] = records.title.en;
										});
										subCallback(null,paymentMethodList);
									}).catch(next);
								}
							},(childAsyncErr,childAsyncResponse)=>{
								if(childAsyncErr) return callback(childAsyncErr);

								findResult.map(record=>{
									record.delivery_type  = childAsyncResponse.delivery_method_details[record.delivery_type] ? childAsyncResponse.delivery_method_details[record.delivery_type] : "";
									record.payment_method = childAsyncResponse.payment_method_details[record.payment_method] ? childAsyncResponse.payment_method_details[record.payment_method] : "";
								});
								callback(null,findResult);
							});
						}).catch(next);
					},
					total_records:(callback)=>{
						/** Get total number of records in orders collection **/
						collection.countDocuments(commonConditions).then(countResult => {
							callback(null, countResult);
						}).catch(next);
					},
					filter_records:(callback)=>{
						/** Get filtered records counting in orders **/
						collection.countDocuments(dataTableConfig.conditions).then(filterContResult => {
							callback(null, filterContResult);
						}).catch(next);
					}
				},(err, response)=>{
					/** Send response **/
					res.send({
						status			: (!err) ? Constants.STATUS_SUCCESS : Constants.STATUS_ERROR,
						draw			: dataTableConfig.result_draw,
						data			: (response.order_list)     ? response.order_list 	  :[],
						recordsFiltered	: (response.filter_records) ? response.filter_records :0,
						recordsTotal	: (response.total_records)  ? response.total_records  :0
					});
				});
			}else{
				asyncParallel({
					restaurant :(callback)=>{
						/** Get restaurant details **/
						const restaurants  = this.db.collection(Tables.RESTAURANTS);
						restaurants.findOne({_id: new ObjectId(restaurantId)},{projection: {name:1,restaurant_number:1}}).then(restResult => {
							callback(null,restResult);
						}).catch(next);
					},
					restaurant_detail :(callback)=>{
						/** Get restaurant details **/
						const restaurant_details  = this.db.collection(Tables.RESTAURANT_DETAILS);
						restaurant_details.findOne({restaurant_id: new ObjectId(restaurantId)},{projection: {commission_value:1}}).then(restDetailsResult => {
							callback(null,restDetailsResult);
						}).catch(next);
					}
				},(err,response)=>{
					if(err) return next(err);

					/**Get restaurant branch dropdown list **/
					getDropdownList(req,res, next,{
						collections :[
							{
								collection : Tables.RESTAURANT_BRANCHES,
								columns    : ["_id",["name",Constants.DEFAULT_LANGUAGE_CODE]],
								conditions : {
									is_active	  : Constants.ACTIVE,
									restaurant_id : new ObjectId(restaurantId)
								}
							},
							{
								collection : Tables.PAYMENT_METHODS,
								columns    : ["slug",["title",Constants.DEFAULT_LANGUAGE_CODE]]
							}
						]
					}).then(dropDownResponse=> {
						
						/** render order details listing page **/
						req.breadcrumbs(BREADCRUMBS['admin/report/order_details']);
						res.render('order_details',{
							restaurant_id    	:	restaurantId,
							branch_list      	:	dropDownResponse?.final_html_data?.[0] || "",
							payment_methods  	:	dropDownResponse?.final_html_data?.[1] || "",
							settlement   	 	:	settlement,
							from_date        	:	fromDate,
							to_date          	:	toDate,
							restaurant_details 	: 	(response?.restaurant) ? response?.restaurant : {},
							restaurant_commission : (response?.restaurant_detail) ? response?.restaurant_detail : {}
						});
					}).catch(next);
				});
			}
		}catch(error){
			return next(error);
		}
	};//End getOrderDetailsList()

	/**
	 * Function to get payment history list
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 *
	 * @return render/json
	 */
	async getPaymentHistoryList(req,res,next){
		try{
			let restaurantId = (req.params.restaurant_id)   ? req.params.restaurant_id   : "";

			if(isPost(req)){
				let limit		  = (req.body.length)   ? parseInt(req.body.length) :Constants.ADMIN_LISTING_LIMIT;
				let skip		  = (req.body.start)    ? parseInt(req.body.start)  :Constants.DEFAULT_SKIP;
				let fromDate  	  = (req.body.fromDate) ? req.body.fromDate 		:"";
				let toDate 	  	  = (req.body.toDate)   ? req.body.toDate       	:"";
				const collection  = this.db.collection(Tables.ORDER_SETTLEMENT_PAYMENT_LOGS);

				/** Configure Datatable conditions*/
				let dataTableConfig = await configDatatable(req,res,null);

					/** Set common conditions */
					let commonConditions = {
						restaurant_id : new ObjectId(restaurantId),
					};

					/** Conditions for date of payment */
					if (fromDate != "" && toDate != "") {
						dataTableConfig.conditions["date_of_payment"] = {
							$gte 	: newDate(fromDate),
							$lte 	: newDate(toDate),
						};
					}

					dataTableConfig.conditions = Object.assign(dataTableConfig.conditions,commonConditions);
					asyncParallel({
						history_list :(callback)=>{
							/** Get list of order settlement payment history  **/
							collection.aggregate([
								{$match : dataTableConfig.conditions},
								{$sort  : dataTableConfig.sort_conditions},
								{$skip 	: skip},
								{$limit : limit},
								{$lookup: {	/** Get restaurant details **/
									from 		:	Tables.RESTAURANTS,
									localField  :	"restaurant_id",
									foreignField:	"_id",
									as 		  	:	"restaurant_details"
								}},
								{$lookup: {	/** Get proceed by details **/
									from 		:	Tables.USERS,
									localField  :	"proceed_by",
									foreignField:	"_id",
									as 		  	:	"user_details"
								}},
								{$lookup: {	/** Get settlement  details **/
									from 		:	Tables.SETTLEMENT_METHODS,
									localField  :	"settlement_method",
									foreignField:	"slug",
									as 		  	:	"settlement_details"
								}},
								{$project : {
									_id:1, pay_amount:1, date_of_payment:1,beneficiary_name:1,iban:1,bank_account_number:1,cheque_number:1,cheque_date:1, remarks:1,
									proceed_by_name: {$arrayElemAt: ["$user_details.full_name",0]},
									settlement_method_title: {$arrayElemAt: ["$settlement_details.title",0]},
									restaurant_name: {$arrayElemAt: ["$restaurant_details.name."+Constants.DEFAULT_LANGUAGE_CODE,0]},
								}},
							]).toArray().then(findResult => {
								callback(null,findResult);
							}).catch(next);
						},
						total_records:(callback)=>{
							/** Get total number of records in order settlement payment logs collection **/
							collection.countDocuments(commonConditions).then(countResult => {
								callback(null, countResult);
							}).catch(next);
						},
						filter_records:(callback)=>{
							/** Get filtered records counting in order settlement payment logs **/
							collection.countDocuments(dataTableConfig.conditions).then(filterContResult => {
								callback(null, filterContResult);
							}).catch(next);
						}
					},(err, response)=>{
						/** Send response **/
						res.send({
							status			: (!err) ? Constants.STATUS_SUCCESS : Constants.STATUS_ERROR,
							draw			: dataTableConfig.result_draw,
							data			: (response.history_list) 	? response.history_list	 	:[],
							recordsFiltered	: (response.filter_records) ? response.filter_records   :0,
							recordsTotal	: (response.total_records) 	? response.total_records    :0
						});
					});
			}else{

				/**Get settlement method dropdown list **/
				getDropdownList(req,res, next,{
					collections :[{
						collection : Tables.SETTLEMENT_METHODS,
						columns    : ["slug","title"]
					}]
				}).then(response=> {

					/** render payment history listing page **/
					req.breadcrumbs(BREADCRUMBS['admin/report/payment_history']);
					res.render('payment_history',{
						restaurant_id   	: restaurantId,
						settlement_methods  : response?.final_html_data?.[0] ||""
					});
				}).catch(next);
			}
		}catch(error){
			return next(error);
		}
	};//End getPaymentHistoryList()

	/**
	 * Function for get branch list
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 * @param next 	As Callback argument to the middleware function
	 *
	 * @return null
	 */
	async unsettledBranchList(req,res,next){
		try{
			let restaurantIds = req.body.restaurant_id;

			/** Send error response */
			if(!restaurantIds) return res.send({status: Constants.STATUS_ERROR, message :res.__("admin.system.something_going_wrong_please_try_again") });

			if(restaurantIds.constructor !== Array)	restaurantIds = [restaurantIds];
			restaurantIds = arrayToObject(restaurantIds);

			/**Get branch list **/
			getDropdownList(req,res, next,{
				collections :[
					{
					collection : Tables.RESTAURANT_BRANCHES,
						columns    : ["_id",["name",Constants.DEFAULT_LANGUAGE_CODE]],
						conditions : {
							restaurant_id : {$in : restaurantIds},
							is_active	  : Constants.ACTIVE,
						},
					},
				]
			}).then(dropDownResponse=> {
				if(dropDownResponse.status != Constants.STATUS_SUCCESS) return res.send({status: Constants.STATUS_ERROR, message :res.__("admin.system.something_going_wrong_please_try_again") });

				res.send({
					status       : Constants.STATUS_SUCCESS,
					branch_list  : dropDownResponse?.final_html_data?.[0] || ""
				});
			}).catch(next);
		}catch(error){
			return next(error);
		}
	};//End unsettledBranchList()

	/**
	 *  Function for export user records
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 * @param next 	As 	Callback argument to the middleware function
	 *
	 * @return null
    */
    async orderExportData(req,res,next){
		try{
			let restaurantId 	= (req.query.restaurant_id) ? req.query.restaurant_id : "";
			let fromDate 		= (req.query.from_date) ? req.query.from_date : "";
			let toDate 			= (req.query.to_date) ? req.query.to_date : "";
			let orderStatus 	= (req.query.order_status) ? req.query.order_status : "";
			let settlement 		= (req.query.settlement) ? req.query.settlement : "";
			let branchId 		= (req.query.branch_id) ? new ObjectId(req.query.branch_id) : "";
			let paymentMethod 	= (req.query.payment_method) ? req.query.payment_method : '';
			let sortingField  	= (req.query.sort_field) ? req.query.sort_field   	: "_id";			
			let sortingDir 	 	= (req.query.sort_dir) ? req.query.sort_dir   		: "asc";
			let sortOrder		= (sortingDir == 'asc') ? Constants.SORT_ASC : Constants.SORT_DESC;

			let sortConditions = {};
			sortConditions[sortingField] = sortOrder;
			/** Set common conditions */
			let exportConditions = {
				restaurant_id: new ObjectId(restaurantId),
				is_settlement: { $exists: false }
			};

			/** Conditions for settled order logs */
			if (settlement) {
				exportConditions = {
					restaurant_id: new ObjectId(restaurantId),
					is_settlement: true
				}
			}

			/** Conditions for order date */
			if (fromDate != "" && toDate != "") {
				exportConditions["order_date"] = {
					$gte: newDate(fromDate),
					$lte: newDate(toDate),
				};
			}

			/** Conditions for order status */
			if (orderStatus) {
				exportConditions["order_status"] = orderStatus;
			}

			if (branchId) {
				exportConditions["branch_id"] = branchId;
			}
			/** Conditions for payment method */
			if (paymentMethod) {
				if (paymentMethod.constructor !== Array) paymentMethod = [paymentMethod];
				exportConditions['payment_method'] = { $in: paymentMethod };
			}
			/** Get order details **/
			const orders	= this.db.collection(Tables.ORDERS);
			orders.aggregate([
				{ $match: exportConditions},
				{$sort  : sortConditions},
				{$lookup: {	/** Get users details **/
					from 		:	Tables.USERS,
					localField  :	"customer_id",
					foreignField:	"_id",
					as 		  	:	"customer_details"
				}},
				{$lookup: {	/** Get order details **/
					from 		:	Tables.ORDER_DETAILS,
					localField  :	"_id",
					foreignField:	"order_id",
					as 		  	:	"order_details"
				}},
				{$lookup: {	/** Get restaurant branch details **/
					from 		:	Tables.RESTAURANT_BRANCHES,
					localField  :	"branch_id",
					foreignField:	"_id",
					as 		  	:	"branch_details"
				}},
				{$project : {
					_id:1,order_date:1,unique_order_id:1,delivery_type:1,payment_method:1,net_amount:1,order_price:1,delivery_fee:1,knet_charges:1,branch_id:1,order_status:1,area_name:1,cravez_payout:1,total_knet_amount:1,discount_refund_to_restaurant:1,restaurant_payout:1,
					client_full_name: {$arrayElemAt: ["$customer_details.full_name",0]},
					customer_category: {$arrayElemAt: ["$customer_details.client_type",0]},
					mobile_number: {$arrayElemAt: ["$customer_details.mobile_number",0]},
					discount_price: {$arrayElemAt: ["$order_details.discount_price",0]},
					offer_code: {$arrayElemAt: ["$order_details.offer_code",0]},branch_name: {$arrayElemAt: ["$branch_details.name."+Constants.DEFAULT_LANGUAGE_CODE,0]},
				}},
			]).toArray().then(findResult => {

				let deliveryTypes  = [];
				let paymentMethods = [];
				findResult.map(records=>{
					deliveryTypes.push(records.delivery_type);
					paymentMethods.push(records.payment_method);
				});

				asyncParallel({
					delivery_method_details :(subCallback)=>{
						/** Get delivery type **/
						const delivery_methods  = this.db.collection(Tables.DELIVERY_METHODS);
						delivery_methods.find({slug : {$in : deliveryTypes}},{projection: {slug:1,title:1}}).toArray().then(deliveryResult => {
							if(!deliveryResult || deliveryResult.length < 0) return subCallback(null,{});
							let deliveryMethodList = {};
							deliveryResult.map(records=>{
								deliveryMethodList[records.slug] = records.title;
							});
							subCallback(null,deliveryMethodList);
						}).catch(next);
					},
					payment_method_details :(subCallback)=>{
						/** Get payment method **/
						const payment_methods  = this.db.collection(Tables.PAYMENT_METHODS);
						payment_methods.find({slug : {$in : paymentMethods}},{projection: {slug:1,title:1}}).toArray().then(paymentResult => {
							if(!paymentResult || paymentResult.length < 0) return subCallback(null,{});
							let paymentMethodList = {};
							paymentResult.map(records=>{
								paymentMethodList[records.slug] = records.title.en;
							});
							subCallback(null,paymentMethodList);
						}).catch(next);
					}
				},(childAsyncErr,childAsyncResponse)=>{
					if(childAsyncErr) return next(childAsyncErr);

					findResult.map(record=>{
						record.delivery_type  = childAsyncResponse.delivery_method_details[record.delivery_type] ? childAsyncResponse.delivery_method_details[record.delivery_type] : "";
						record.payment_method = childAsyncResponse.payment_method_details[record.payment_method] ? childAsyncResponse.payment_method_details[record.payment_method] : "";
					});

					let temp			= [];
					let commonColls		= [];

					/** Define excel heading label **/
					commonColls		= 	[
						res.__("admin.unsettled_payments.order_date"),
						res.__("admin.unsettled_payments.order_id"),
						res.__("admin.unsettled_payments.branch_name"),
						res.__("admin.unsettled_payments.client_mobile_number"),
						res.__("admin.unsettled_payments.client_name"),
						res.__("admin.unsettled_payments.area"),
						res.__("admin.unsettled_payments.delivery_by"),
						res.__("admin.unsettled_payments.customer_category"),
						res.__("admin.unsettled_payments.payment_method"),
						res.__("admin.unsettled_payments.gross_order_amount"),
						res.__("admin.unsettled_payments.delivery_fees"),
						res.__("admin.unsettled_payments.discount_value"),
						res.__("admin.unsettled_payments.net_order_amount"),
						res.__("admin.unsettled_payments.offer"),
						res.__("admin.unsettled_payments.collected_by_cravez_cash"),
						res.__("admin.unsettled_payments.collected_by_cravez_knet"),
						res.__("admin.unsettled_payments.discount_refund_to_restaurant"),
						res.__("admin.unsettled_payments.cravez_commission"),
						res.__("admin.unsettled_payments.knet_charges")+' ('+((res.locals.settings['Site.knet_charges']) ? parseInt(res.locals.settings['Site.knet_charges']) :"")+ res.__("admin.report.percent")+')',
						res.__("admin.unsettled_payments.due_amount_to_restaurant"),
					];

					if(findResult && findResult.length > 0){
						findResult.map(records=>{
							let buffer =	[
								(records.order_date)		?	newDate(records.order_date,Constants.AM_PM_FORMAT_WITH_DATE) :"",
								(records.unique_order_id)	? 	records.unique_order_id 			:"",
								(records.branch_name)		? 	records.branch_name 				:"",
								(records.mobile_number) 	? 	records.mobile_number 				:"",
								(records.client_full_name) 	? 	records.client_full_name 			:"",
								(records.area_name.en) 		? 	records.area_name.en 				:"",
								(records.delivery_type) 	? 	records.delivery_type 				:"",
								(records.customer_category) ? 	Constants.USER_CLIENT_TYPE[records.customer_category] :"",
								(records.payment_method) 	? 	records.payment_method 				:"",
								(records.net_amount) 		? 	currencyFormat(records.net_amount) 	:currencyFormat(0),
								(records.delivery_fee) 		? 	currencyFormat(records.delivery_fee):currencyFormat(0),
								(records.discount_price) 	? 	currencyFormat(records.discount_price) :currencyFormat(0),
								(records.order_price) 		? 	currencyFormat(records.order_price)		:currencyFormat(0),
								(records.offer_code) 		? 	records.offer_code 					:"",
								(records.payment_method == Constants.PAYMENT_METHODS[Constants.CASH_PAYMENT]) 		? 	currencyFormat(records.order_price) 				:currencyFormat(0),
								(records.total_knet_amount) ? 	currencyFormat(records.total_knet_amount) 			:currencyFormat(0),
								(records.discount_refund_to_restaurant) 		? 	currencyFormat(records.discount_refund_to_restaurant) 			:currencyFormat(0),
								(records.cravez_payout) 	? 	currencyFormat(records.cravez_payout) 				:currencyFormat(0),
								(records.knet_charges) 		? 	currencyFormat(records.knet_charges) 				:currencyFormat(0),
								(records.restaurant_payout) ? 	currencyFormat(records.restaurant_payout)			:currencyFormat(0),
							];
							temp.push(buffer);
						});
					}

					/**  Function to export data in excel format **/
					exportToExcel(req,res,{
						file_prefix 		: "OrderLogs",
						heading_columns		: commonColls,
						export_data			: temp
					});
				});
			}).catch(next);
		}catch(error){
			return next(error);
		}
	};// end orderExportData()

	/**
	 *  Function for export user records
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 * @param next 	As 	Callback argument to the middleware function
	 *
	 * @return null
    */
    async unsettledExportData(req,res,next){
		try{
			let fromDate 		= (req.query.from_date) ? req.query.from_date : "";
			let toDate 			= (req.query.to_date) ? req.query.to_date : "";
			let branchId 		= (req.query.branch_id) ? (req.query.branch_id) : "";
			let restaurantId 	= (req.query.restaurant_id) ? (req.query.restaurant_id) : "";

			let settlementMethod= (req.query.settlement_method) ? req.query.settlement_method : '';
			let paymentMethod 	= (req.query.payment_method) ? (req.query.payment_method): "";

			/** Get restaurant ids */
			let restaurantIds = [];
			if(settlementMethod){
				const restaurant_details = this.db.collection(Tables.RESTAURANT_DETAILS);
				restaurantIds = await restaurant_details.distinct("restaurant_id",{
					settlement_method : {$in : [settlementMethod]}
				});
			}

			/** Set condition  */
			let exportConditions = {
				is_settlement: { $exists: false }
			};

			/** Condition for settlement method */
			if (settlementMethod) exportConditions.restaurant_id = { $in: restaurantIds };

			/** Conditions for order date */
			if (fromDate != "" && toDate != "") {
				exportConditions["order_date"] = {
					$gte: newDate(fromDate),
					$lte: newDate(toDate),
				};
			}

			/** Conditions for restaurants */
			if (restaurantId) {
				if (restaurantId.constructor !== Array) restaurantId = [restaurantId];
				restaurantId = arrayToObject(restaurantId);

				if (!exportConditions['$and']) exportConditions['$and'] = [];
				exportConditions['$and'].push({
					restaurant_id: { $in: restaurantId }
				});
			}

			/** Conditions for payment method */
			if (paymentMethod) {
				if (paymentMethod.constructor !== Array) paymentMethod = [paymentMethod];
				exportConditions['payment_method'] = { $in: paymentMethod };
			}

			/** Conditions for branches */
			if (branchId) {
				if (branchId.constructor !== Array) branchId = [branchId];
				branchId = arrayToObject(branchId);

				if (!exportConditions['$and']) exportConditions['$and'] = [];
				exportConditions['$and'].push({
					branch_id: { $in: branchId }
				});
			}
			/** Get order details **/
			const orders	= this.db.collection(Tables.ORDERS);
			orders.aggregate([
				{ $match: exportConditions},
				{$group	: {
					_id : { restaurant_id   : "$restaurant_id"},
					restaurant_name 	 : { $first : "$restaurant_name"},
					restaurant_id        : { $first : "$restaurant_id"},
					account_manager_name : { $first : "$account_manager_name"},
					email_address   	 : { $first : "$email_address"},
					mobile_number   	 : { $first : "$mobile_number"},
					branch_detail   	 : { $addToSet  : "$branch_id"},
					total_due_payment    : { $sum : "$total_payout"},
					total_due_payment_to_pay : { $sum : "$restaurant_payout"},
					total_commission 	 : { $sum : "$cravez_payout"},
				}},
				{ $sort: { "_id": -1 }},
				{$lookup:	{ /** Get restaurant details */
					"from" 			: 	Tables.RESTAURANT_DETAILS,
					"localField" 	:	"restaurant_id",
					"foreignField" 	: 	"restaurant_id",
					"as" 			: 	"restaurant_detail"
				}},
				{$addFields:	{
					account_manager_name : {$arrayElemAt: ["$restaurant_detail.account_manager",0]},
					email_address		 : {$arrayElemAt: ["$restaurant_detail.email",0]},
					mobile_number        : {$arrayElemAt: ["$restaurant_detail.mobile_number",0]},
					total_branches 		 : {$size: "$branch_detail"},
				}},
				{$project : {restaurant_detail: 0} }
			]).toArray().then(findResult => {

				let temp			= [];
				let commonColls		= [];

				/** Define excel heading label **/
				commonColls		= 	[
					res.__("admin.unsettled_payments.restaurant_name"),
					res.__("admin.unsettled_payments.total_due_payment_to_pay"),
					res.__("admin.unsettled_payments.total_commission"),
					res.__("admin.unsettled_payments.contact_number"),
					res.__("admin.unsettled_payments.email_address"),
					res.__("admin.unsettled_payments.account_manager_name"),
					res.__("admin.unsettled_payments.total_branches"),
				];

				if(findResult && findResult.length > 0){
					findResult.map(records=>{
						let buffer =	[
							records?.restaurant_name?.[Constants.DEFAULT_LANGUAGE_CODE] || "",
							currencyFormat(records?.total_due_payment_to_pay || 0),
							currencyFormat(records?.total_commission || 0),
							records?.mobile_number || "",
							records?.email_address || "",
							records?.account_manager_name || "",
							records?.total_branches || "",
						];
						temp.push(buffer);
					});	
				}

				/**  Function to export data in excel format **/
				exportToExcel(req,res,{
					file_prefix 		: "UnsettledPaymentReport",
					heading_columns		: commonColls,
					export_data			: temp
				});
			}).catch(next);			
		}catch(error){
			return next(error);
		}
	};// end unsettledExportData()
}
