import { ObjectId } from 'mongodb';
import clone from 'clone';
import { parallel as asyncParallel } from 'async';
import BREADCRUMBS from "../../../../breadcrumbs.mjs";
import * as Constants from "../../../../config/global_constant.mjs";
import Tables from "../../../../config/database_tables.mjs";
import { newDate, isPost, exportToExcel} from "../../../../utils/index.mjs";

export default class CustomerBreakdownReports {
	constructor(db) {
		this.db = db;
	}
	
	/**
	* Function to get listing page
	*
	* @param req 	As Request Data
	* @param res 	As Response Data
	*
	* @return render/json
	*/
	async getCustomerBreakdownReport (req,res,next){
		try {
			let restaurantId = (req.session.user.restaurant_id) ? new ObjectId(req.session.user.restaurant_id) : '';
			if(isPost(req)){
				let year			= (req.body.year) ? parseInt(req.body.year) : "";
				let reportStartDate	= year+"-01-01";
				let reportEndDate	= year+"-12-31";
				let startDate		= newDate(reportStartDate+" "+Constants.START_DATE_TIME_FORMAT);
				let endDate			= newDate(reportEndDate+" "+Constants.END_DATE_TIME_FORMAT);
				
				/** Condition for customer */
				let cusomersConditions		= clone(Constants.CUSTOMER_COMMON_CONDITIONS);
				cusomersConditions.created	= {$gte: startDate, $lt: endDate};
				
				/** Get customer list  monthly wise*/
				const users	= this.db.collection(Tables.USERS);
				let customerList = await users.aggregate([
					{$match : cusomersConditions},
					{$project : {
						_id 		: 1,
						month		: {"$month": "$created"},					
					}},
				]).toArray();
				
				let customerIds = [];
				let customerObj = {};					
				customerList.map(data=>{
					if(!customerObj[data.month]) customerObj[data.month] = [];
					customerIds.push(new ObjectId(data._id));
					customerObj[data.month].push(String(data._id))
				});		
				
				const orders = this.db.collection(Tables.ORDERS);
				asyncParallel({
					customer_without_order:(callback)=>{						
						orders.aggregate([
							{$match : {
								order_date 		: {$gte: startDate, $lt: endDate},
								admin_status	: Constants.ORDER_DELIVERED,								
								customer_id 	: {$in : customerIds},
								restaurant_id	: restaurantId,
							}},								
							{$group : {
								_id 	: {									
									year_month	: {$dateToString: {format: "%Y-%m",date: "$order_date",timezone: Constants.DEFAULT_TIME_ZONE}}
								},
								month		: {$last : { "$month": "$order_date"}},
								customers	: {$addToSet : "$customer_id"},								
							}},
						]).toArray().then(result=>{	

							let dataArray = [];
							if(result && result.length > 0){
								result.map(record=>{
									let registredUsers	= (customerObj[record.month]) ? customerObj[record.month] : [];
									let orderedCustomer	= (record.customers) ? record.customers : [];
									let newCustomers	= 0;
									
									orderedCustomer.map(cid=>{
										if(registredUsers.indexOf(String(cid)) !== -1){
											newCustomers++;
										}										
									});

									dataArray.push({
										_id		: year+'-'+record.month,
										year 	: year,
										month 	: record.month,									
										count 	: (registredUsers.length-newCustomers),
									});
								});	
							}
							callback(null,dataArray);
						}).catch(err=>{
							callback(err,[]);
						});
					},
					multi_order_customer:(callback)=>{
						orders.aggregate([
							{$match : {
								order_date 		: {$gte: startDate, $lt: endDate},
								admin_status	: Constants.ORDER_DELIVERED,
								customer_id 	: {$in : customerIds},
								restaurant_id	: restaurantId,
							}},	
							{$group : {
								_id 	: {
									customer_id	: "$customer_id",
									year_month	: {$dateToString: {format: "%Y-%m",date: "$order_date",timezone: Constants.DEFAULT_TIME_ZONE}}
								},
								month	: {$last : { "$month": "$order_date"}},				
								customer_id	: {$first :  "$customer_id"},				
								count	: {$sum : 1},
							}},
							{$match : {count :{$gt : 1}}},
							{$group : {
								_id 		: "$month",
								month		: {$first : "$month"},								
								customers	: {$addToSet : "$customer_id"},						
							}},
						]).toArray().then(result=>{		

							let dataArray = [];
							if(result && result.length > 0){
								result.map(record=>{
									let registredUsers	= (customerObj[record.month]) ? customerObj[record.month] : [];
									let orderedCustomer	= (record.customers) ? record.customers : [];
									
									let newCustomers	= 0;
									orderedCustomer.map(cid=>{
										if(registredUsers.indexOf(String(cid)) !== -1){
											newCustomers++;
										}										
									});

									dataArray.push({
										_id		: year+'-'+record.month,
										year 	: year,
										month 	: record.month,									
										count 	: newCustomers,
									});
								});		
							}
							callback(null,dataArray);
						}).catch(err=>{
							callback(err,[]);
						});
					},					
					repeating_customers :(callback)=>{
						orders.aggregate([
							{ $match: { 
								restaurant_id:restaurantId,
								admin_status: Constants.ORDER_DELIVERED, 
							}},
							{$addFields : {
								year 		: {$year: "$order_date" },
								year_month	: { $dateToString: { format: "%Y-%m", date: "$order_date", timezone: Constants.DEFAULT_TIME_ZONE }}
							}},
							{$match : {year : year}},		
							{$group : {
								_id : {
									year_month : "$year_month",
									customer_id : "$customer_id"
								},							
								year_month  : {$last : "$year_month"},
								year  		: {$last : { "$year": "$order_date"}},
								month 		: {$last : { "$month": "$order_date"}},
								order_count : {$sum : 1},
							}},
							{$match : {order_count :{$gt : 1}}},
							{$group : {
								_id 	: "$year_month",
								year  	: {$last : "$year"},
								month 	: {$last : "$month"},
								count 	: {$sum : 1},
							}},
						],{ allowDiskUse: true}).toArray().then(result=>{
							callback(null,result);
						}).catch(err=>{
							callback(err,[]);
						});						
					},
					winback_customers :(callback)=>{
						let orderCutoffdate	= newDate((year-1)+"-07-01");
						let todayDate		= newDate();
						
						orders.aggregate([
							{$match : {
								order_date 	 : {$gte: orderCutoffdate, $lt: todayDate},
								restaurant_id: restaurantId,
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
							let winbackUsers = {};

							if(result && result.length > 0){
								result.map(record=>{
									customerLists[record.year_month] = record.customer_ids.map(rec=>{ return String(rec)});
								});
								
								result.map(record=>{
									let currentYearMonth	= record.year_month;
									let lastMonth			= (record.month-1) < 10 ? "0"+(record.month-1) : record.month-1;
									let lastYearMonth		= (record.month == 1 ? (record.year-1) : record.year)+"-"+lastMonth;
									if(record.year == year){
										if(!winbackUsers[currentYearMonth]) winbackUsers[currentYearMonth] = {month : record.month,year : record.year,customers : []};
										
										record.customer_ids.map(cid=>{								
											if(!customerLists[lastYearMonth] || ( customerLists[lastYearMonth] && customerLists[lastYearMonth].indexOf(String(cid))) == -1){
												let orderInSixMonth  = false;
												for(i=2; i<= 6; i++){
													if(customerLists[lastYearMonth] && customerLists[lastYearMonth].indexOf(String(cid)) != -1){
														orderInSixMonth = true;
													}										
												}									
												if(orderInSixMonth) winbackUsers[currentYearMonth].customers.push(String(cid));
											}								
										});	
									}
								});
							}
							
							callback(null,Object.values(winbackUsers));
						}).catch(err=>{
							callback(err,[]);
						});								
					},
				},(err, response)=>{

					/** Send response **/
					let currentYear		= newDate().getFullYear();
					let currentMonth 	= newDate().getMonth()+1;
					let yearWiseData 	= {};
					if(response?.customer_without_order?.length > 0){
						response.customer_without_order.map(record=>{
							if(!yearWiseData[record.year]) yearWiseData[record.year] = {};					
							if(!yearWiseData[record.year][record.month]) yearWiseData[record.year][record.month] = {};				
							yearWiseData[record.year][record.month]["customer_without_order"] = record.count;
						});
					}

					if(response?.multi_order_customer?.length > 0){
						response.multi_order_customer.map(record=>{
							if(!yearWiseData[record.year]) yearWiseData[record.year] = {};
							if(!yearWiseData[record.year][record.month]) yearWiseData[record.year][record.month] = {};				
							yearWiseData[record.year][record.month]["multi_order_customer"] = record.count;
						});	
					}

					if(response?.repeating_customers?.length > 0){
						response.repeating_customers.map(record=>{
							if(!yearWiseData[record.year]) yearWiseData[record.year] = {};
							if(!yearWiseData[record.year][record.month]) yearWiseData[record.year][record.month] = {};				
							yearWiseData[record.year][record.month]["repeating_customers"] = record.count;
						});
					}

					if(response?.winback_customers?.length > 0){
						response.winback_customers.map(record=>{
							if(!yearWiseData[record.year]) yearWiseData[record.year] = {};
							if(!yearWiseData[record.year][record.month]) yearWiseData[record.year][record.month] = {};				
							yearWiseData[record.year][record.month]["winback_customers"] = record.customers.length;
						});
					}

					let finalArray 	= [];
					let dataYears	= Object.keys(yearWiseData);
					
					Object.keys(Constants.REPORT_CHART_MONTH_NAMES).map(month=>{
						let tmpRow = [Constants.REPORT_CHART_MONTH_NAMES[month]];
						dataYears.map(tmpYear=>{
							let tmpObj = (yearWiseData[tmpYear] && yearWiseData[tmpYear][month]) ? yearWiseData[tmpYear][month] : {};
							if(!tmpObj.customer_without_order)	tmpObj.customer_without_order	= (customerObj[month]) ? customerObj[month].length : 0;
							if(!tmpObj.multi_order_customer)	tmpObj.multi_order_customer 	= 0;
							if(!tmpObj.repeating_customers) 	tmpObj.repeating_customers		= 0;
							if(!tmpObj.winback_customers)		tmpObj.winback_customers		= 0;
							
							if(tmpYear == currentYear && month > currentMonth){
								tmpObj.customer_without_order = null;
								tmpObj.multi_order_customer = null;
								tmpObj.repeating_customers = null;
								tmpObj.winback_customers = null;
							}

							tmpRow.push(tmpObj.customer_without_order);
							tmpRow.push(tmpObj.multi_order_customer);
							tmpRow.push(tmpObj.repeating_customers);
							tmpRow.push(tmpObj.winback_customers);
						});
						finalArray.push(tmpRow);
					});		
					res.send({status : Constants.STATUS_SUCCESS, result : finalArray,years : dataYears});
				});			
			}else{	
				/** render listing page **/
				req.breadcrumbs(BREADCRUMBS['reports/monthly_customer_breakdown_report']);
				res.render('monthly_customer_breakdown_report');
			}	
		} catch (error) {
			return next(error);
		}
	}

	/**
	 *  Function for export report
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 * @param next 	As 	Callback argument to the middleware function
	 *
	 * @return null
    */
	async exportCustomerBreakdownReport (req,res,next){
		try {
			let restaurantId = (req.session.user.restaurant_id) ? new ObjectId(req.session.user.restaurant_id) : '';
			let year		= (req.query.year) ? parseInt(req.query.year) : "";;
			const users		= this.db.collection(Tables.USERS);
			const orders	= this.db.collection(Tables.ORDERS);
        
			let query = { userId: "$_id", yearMonth: "$year_month", restaurantId: restaurantId };

			asyncParallel({
				customer_without_order:(callback)=>{
					users.aggregate([					
						{$match : Constants.CUSTOMER_COMMON_CONDITIONS},
						{$addFields : {
							year 		: {$year: "$created" },
							year_month	: {$dateToString: {format: "%Y-%m",date: "$created",timezone: Constants.DEFAULT_TIME_ZONE}}
						}},
						{$match : {year : year}},					
						{$lookup:	{
							from     : "orders",
							let      : query,
							pipeline : [
								{$addFields : {									
									year_month	: {$dateToString: {format: "%Y-%m",date: "$created",timezone: Constants.DEFAULT_TIME_ZONE}}
								}},
								{$match : {
									$expr: {
										$and : [
											{$eq: ["$customer_id", "$$userId"]},
											{$eq: ["$year_month", "$$yearMonth"]},
											{$eq: ["$restaurant_id", "$$restaurantId"] },
										]
									}
								}},								
							],
							as	:	"order_detials"
						}},				
						{$addFields : {order_count : { "$size": "$order_detials" }}},
						{$match : {order_count :0}},
						{$group : {
							_id : {
								year_month : { $dateToString: { format: "%Y-%m", date: "$created", timezone: Constants.DEFAULT_TIME_ZONE }}
							},
							year  : {$first : { "$year": "$created"}},
							month : {$first : { "$month": "$created"}},
							count : {$sum : 1},
						}},
					]).toArray().then(result=>{						
						callback(null,result);
					}).catch(err=>{
						callback(err,[]);
					});						
				},
				multi_order_customer:(callback)=>{
					users.aggregate([
						{$match : Constants.CUSTOMER_COMMON_CONDITIONS},
						{$addFields : {
							year 		: {$year: "$created" },
							year_month	: {$dateToString: {format: "%Y-%m",date: "$created",timezone: Constants.DEFAULT_TIME_ZONE}}
						}},
						{$match : {year : year}},					
						{$lookup:	{
							from     : "orders",
							let      : query,
							pipeline : [
								{$addFields : {									
									year_month	: {$dateToString: {format: "%Y-%m",date: "$created",timezone: Constants.DEFAULT_TIME_ZONE}}
								}},
								{$match : {
									$expr: {
										$and : [
											{$eq: ["$customer_id", "$$userId"]},
											{$eq: ["$year_month", "$$yearMonth"]},
											{ $eq: ["$restaurant_id", "$$restaurantId"] },
										]
									}
								}},								
							],
							as	:	"order_detials"
						}},				
						{$addFields : {order_count : { "$size": "$order_detials" }}},
						{$match : {order_count :{$gt : 1}}},
						{$group : {
							_id : {
								year_month : { $dateToString: { format: "%Y-%m", date: "$created", timezone: Constants.DEFAULT_TIME_ZONE }}
							},
							year  : {$first : { "$year": "$created"}},
							month : {$first : { "$month": "$created"}},
							count : {$sum : 1},
						}},					
						
					]).toArray().then(result=>{						
						callback(null,result);
					}).catch(err=>{
						callback(err,[]);
					});						
				},
				repeating_customers :(callback)=>{
					orders.aggregate([
						{ $match: { admin_status: Constants.ORDER_DELIVERED, restaurant_id: restaurantId}},
						{$addFields : {
							year 		: {$year: "$order_date" },
							year_month	: { $dateToString: { format: "%Y-%m", date: "$order_date", timezone: Constants.DEFAULT_TIME_ZONE }}
						}},
						{$match : {year : year}},		
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
						callback(err,[]);
					});						
				},
				winback_customers :(callback)=>{
					let orderCutoffdate	= newDate((year-1)+"-07-01");
					let todayDate		= newDate();
					
					orders.aggregate([
						{$match : {
							admin_status: Constants.ORDER_DELIVERED,
							restaurant_id: restaurantId,
							"$and" 		: [{order_date: {$gte : orderCutoffdate}},{order_date: {$lte : todayDate}}]
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
					]).toArray().then(result=>{
							let customerLists = {};
							let winbackUsers = {};
							
							if(result && result.length > 0){
								result.map(record=>{
									customerLists[record.year_month] = record.customer_ids.map(rec=>{ return String(rec)});
								});
								result.map(record=>{
									let currentYearMonth	= record.year_month;
									let lastMonth			= (record.month-1) < 10 ? "0"+(record.month-1) : record.month-1;
									let lastYearMonth		= (record.month == 1 ? (record.year-1) : record.year)+"-"+lastMonth;
									if(record.year == year){
										if(!winbackUsers[currentYearMonth]) winbackUsers[currentYearMonth] = {month : record.month,year : record.year,customers : []};
										
										record.customer_ids.map(cid=>{								
											if(!customerLists[lastYearMonth] || ( customerLists[lastYearMonth] && customerLists[lastYearMonth].indexOf(String(cid))) == -1){
												let orderInSixMonth  = false;
												for(i=2; i<= 6; i++){
													if(customerLists[lastYearMonth] && customerLists[lastYearMonth].indexOf(String(cid)) != -1){
														orderInSixMonth = true;
													}										
												}									
												if(orderInSixMonth) winbackUsers[currentYearMonth].customers.push(String(cid));
											}								
										});	
									}
								});								
							}
						callback(null,Object.values(winbackUsers));
					}).catch(err=>{
						callback(err,[]);
					});								
				},
			},(err, response)=>{

				/** Send response **/
				let currentYear		= newDate().getFullYear();
				let currentMonth 	= newDate().getMonth()+1;
				let yearWiseData 	= {};
				if(response?.customer_without_order?.length > 0){
					response.customer_without_order.map(record=>{
						if(!yearWiseData[record.year]) yearWiseData[record.year] = {};					
						if(!yearWiseData[record.year][record.month]) yearWiseData[record.year][record.month] = {};				
						yearWiseData[record.year][record.month]["customer_without_order"] = record.count;
					});
				}
				if(response?.multi_order_customer?.length > 0){
					response.multi_order_customer.map(record=>{
					if(!yearWiseData[record.year]) yearWiseData[record.year] = {};
					if(!yearWiseData[record.year][record.month]) yearWiseData[record.year][record.month] = {};				
						yearWiseData[record.year][record.month]["multi_order_customer"] = record.count;
					});	
				}
				if(response?.repeating_customers?.length > 0){
					response.repeating_customers.map(record=>{
					if(!yearWiseData[record.year]) yearWiseData[record.year] = {};
					if(!yearWiseData[record.year][record.month]) yearWiseData[record.year][record.month] = {};				
						yearWiseData[record.year][record.month]["repeating_customers"] = record.count;
					});
				}
				if(response?.winback_customers?.length > 0){
					response.winback_customers.map(record=>{
					if(!yearWiseData[record.year]) yearWiseData[record.year] = {};
					if(!yearWiseData[record.year][record.month]) yearWiseData[record.year][record.month] = {};				
						yearWiseData[record.year][record.month]["winback_customers"] = record.customers.length;
					});
				}
				
				let finalArray 	= [];
				let dataYears	= Object.keys(yearWiseData);
				Object.keys(Constants.REPORT_CHART_MONTH_NAMES).map(month=>{
					let tmpRow = [Constants.REPORT_CHART_MONTH_NAMES[month]];
					dataYears.map(tmpYear=>{
						let tmpObj = (yearWiseData[tmpYear] && yearWiseData[tmpYear][month]) ? yearWiseData[tmpYear][month] : {};
						if(!tmpObj.customer_without_order)	tmpObj.customer_without_order	= 0;
						if(!tmpObj.multi_order_customer)	tmpObj.multi_order_customer 	= 0;
						if(!tmpObj.repeating_customers) 	tmpObj.repeating_customers		= 0;
						if(!tmpObj.winback_customers)		tmpObj.winback_customers		= 0;
						
						if(tmpYear == currentYear && month > currentMonth && (!tmpObj.customer_without_order || tmpObj.customer_without_order == 0)){
							tmpObj.customer_without_order = null;
						}
						if(tmpYear == currentYear && month > currentMonth && (!tmpObj.multi_order_customer || tmpObj.multi_order_customer == 0)){
							tmpObj.multi_order_customer = null;
						}
						if(tmpYear == currentYear && month > currentMonth && (!tmpObj.repeating_customers || tmpObj.repeating_customers == 0)){
							tmpObj.repeating_customers = null;
						}
						if(tmpYear == currentYear && month > currentMonth && (!tmpObj.winback_customers || tmpObj.winback_customers == 0)){
							tmpObj.winback_customers = null;
						}
						tmpRow.push(tmpObj.customer_without_order);
						tmpRow.push(tmpObj.multi_order_customer);
						tmpRow.push(tmpObj.repeating_customers);
						tmpRow.push(tmpObj.winback_customers);
					});
					finalArray.push(tmpRow);
				});		

				let commonColls	= [
					res.__("reports.month"),
					res.__("reports.new_customer_without_purchase"),
					res.__("reports.new_customer_multi_purchase"),
					res.__("reports.repeating_customer"),
					res.__("reports.winback_customers")
				];

				/**  Function to export data in excel format **/
				exportToExcel(req,res,{
					file_prefix 		: "CustomerBreakdownExport",
					heading_columns		: commonColls,
					export_data			: finalArray
				});
			});	
		} catch (error) {
			return next(error);
		}
	}
}
