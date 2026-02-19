import { ObjectId } from 'mongodb';
import { parallel as asyncParallel } from 'async';
import BREADCRUMBS from "../../../../breadcrumbs.mjs";
import * as Constants from "../../../../config/global_constant.mjs";
import Tables from "../../../../config/database_tables.mjs";
import { newDate, arrayToObject,isPost, getDropdownList, exportToExcel} from "../../../../utils/index.mjs";

export default class TopContributionLostRevenueReport {
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
	async getTopContributionLostRevenueList (req,res,next){
		try {
			let restaurantId	= new ObjectId(req.session.user.restaurant_id);
			if(isPost(req)){
				let years			= (req.body.years) 		? req.body.years : [];
				let branchIds		= (req.body.branch_ids) ? req.body.branch_ids : [];
				let branchArray		= (branchIds.constructor === Array) ? branchIds : [branchIds];
				let yearsArray		= (years.constructor === Array) ? years : [years];
				
				yearsArray	= yearsArray.map(year => parseInt(year));
				
				const collection = 	this.db.collection(Tables.ORDERS);
				
				let commonConditions	=	{
					restaurant_id:	restaurantId,
					admin_status : Constants.ORDER_CANCELLED
				};
				
				let yearConditions	= {year : {$in :yearsArray}};
				
				if(branchArray.length > 0) commonConditions.branch_id = {$in : arrayToObject(branchArray)};	
				asyncParallel({
					report : (callback)=>{
						collection.aggregate([
							{$match : commonConditions},						
							{$group : {
								_id : {
									cancel_reason_id : "$cancel_reason_id",
									year_month 	: { $dateToString: { format: "%Y-%m", date: "$order_date", timezone: Constants.DEFAULT_TIME_ZONE }}
								},
								year  : {$last 	: {"$year": "$order_date"}},
								month : {$last 	: {"$month": "$order_date"}},
								cancel_reason_id: {$first : "$cancel_reason_id"},	
								lost_revenue	: {$sum : "$restaurant_payout"}
							}},
							{$match : yearConditions},
							{$lookup:	{
								"from" 			: 	Tables.CANCEL_REASONS,
								"localField" 	:	"cancel_reason_id",
								"foreignField" 	: 	"_id",
								"as" 			: 	"reason_detail"
							}},
							{$addFields : {		
								cancel_reason: {$arrayElemAt: ["$reason_detail.title."+Constants.DEFAULT_LANGUAGE_CODE,0]}
							}},
							{$project : {
								reason_detail : 0
							}},
						]).toArray().then(result => {
							callback(null, result);
						}).catch(err => {
							callback(err, null);
						});
					},
					reason_list : (callback)=>{
						const aghzeya_restaurant_cancel_reasons	= this.db.collection(Tables.AGHZEYA_RESTAURANT_CANCEL_REASONS);
						aghzeya_restaurant_cancel_reasons.distinct("cancel_reason_id",{
							restaurant_id : restaurantId,
							$and: [
								{cancel_reason_id: {$exists: true}},
								{cancel_reason_id: {$nin: ["",null]}},
							]
						}).then(reasonIds => {

							const cancel_reasons = this.db.collection(Tables.CANCEL_REASONS);						
							cancel_reasons.distinct("title."+Constants.DEFAULT_LANGUAGE_CODE,{_id : {$in : reasonIds}}).then(result => {
								callback(null, result);
							}).catch(err => {
								callback(err, null);
							});
						}).catch(err => {
							callback(err, null);
						});
					}				
				},(parallelErr,parallelResponse)=>{				
					if(parallelErr) return next(parallelErr);								
					
					let currentYear		= newDate().getFullYear();
					let currentMonth 	= newDate().getMonth()+1;
					let yearWiseData 	= {};
					
					parallelResponse.report.map(record=>{
						if(!yearWiseData[record.year]) yearWiseData[record.year] = {};	
						if (!yearWiseData[record.year][record.month]) yearWiseData[record.year][record.month] = {};
						if(record.cancel_reason){
							yearWiseData[record.year][record.month][record.cancel_reason] = record.lost_revenue;
						}
					});
					let finalArray 	= [];
					let dataYears	= Object.keys(yearWiseData);
					Object.keys(Constants.REPORT_CHART_MONTH_NAMES).map(month=>{
						let tmpRow = [Constants.REPORT_CHART_MONTH_NAMES[month]];
						dataYears.map(tmpYear=>{
							let tmpObj = (yearWiseData[tmpYear] && yearWiseData[tmpYear][month]) ? yearWiseData[tmpYear][month] : {};
							parallelResponse.reason_list.map(reasonName=>{
								if (!tmpObj[reasonName]) tmpObj[reasonName] = 0;
								if (tmpYear == currentYear && month > currentMonth && (!tmpObj[reasonName] || tmpObj[reasonName] == 0)) {
									tmpObj[reasonName] = null;
								}
								tmpRow.push(tmpObj[reasonName])
							});						
						});					
						finalArray.push(tmpRow);
					});
					
					res.send({status : Constants.STATUS_SUCCESS, result : finalArray,years : dataYears,reason_list : parallelResponse.reason_list });
				});
			}else{	
				/**Get dropdown list **/
				let response = await getDropdownList(req,res, next,{
					collections :[
						{
							collection : Tables.RESTAURANT_BRANCHES,
							columns    : ["_id",["name",Constants.DEFAULT_LANGUAGE_CODE]],
							conditions : {
								restaurant_id 	: restaurantId,
								is_active		: Constants.ACTIVE,
							},
						},
					]
				});
					
				/** render listing page **/
				req.breadcrumbs(BREADCRUMBS['reports/top_contribution_lost_revenue']);
				res.render('top_contribution_to_lost_revenue',{
					branch_list : response?.final_html_data?.["0"] || "",
				});
			}
		} catch (error) {
			return next(error);
		}
    };//End getTopContributionLostRevenueList()

	/**
	 *  Function for export top_contribution_lost_revenue
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 * @param next 	As 	Callback argument to the middleware function
	 *
	 * @return null
    */
    async topContributionLostRevenueExportData (req,res,next){
		try {
			let restaurantId    = new ObjectId(req.session.user.restaurant_id);
			let branchIds       = (req.query.branch_ids) ? (req.query.branch_ids).split(",") : [];
			let years           = (req.query.years) ? (req.query.years).split(",") : [];

			let branchArray = (branchIds.constructor === Array) ? branchIds : [branchIds];
			let yearsArray  = (years.constructor === Array) ? years : [years];
			yearsArray      = yearsArray.map(year => parseInt(year));

			let exportConditions	= {
				restaurant_id: restaurantId,
				admin_status : Constants.ORDER_CANCELLED
			};
			let yearConditions = { year: { $in: yearsArray } };

			if (branchArray.length > 0) exportConditions.branch_id = { $in: arrayToObject(branchArray) };

			const orders = this.db.collection(Tables.ORDERS);
			orders.aggregate([
				{ $match: exportConditions },
				{ $addFields: { "cancel_reason_id": { "$toString": "$cancel_reason_id" } } },
				{$group: {
					_id: {
						year_month: { $dateToString: { format: "%Y-%m", date: "$order_date", timezone: Constants.DEFAULT_TIME_ZONE } }
					},
					year : { $last: { "$year": "$order_date" } },
					month: { $last: { "$month": "$order_date" } },
					unavailable_items: {
						$sum: {
							$cond: [
								{
									$and: [
										{ $eq: ["$cancel_reason_id", Constants.UNAVAILABLE_ITEMS] },
									]
								},
								1,
								0
							]
						}
					},
					shortage_delivery_driver: {
						$sum: {
							$cond: [
								{
									$and: [
										{ $eq: ["$cancel_reason_id", Constants.SHORTAGE_OF_DELIVERY_DRIVER] },
									]
								},
								1,
								0
							]
						}
					},
					no_response: {
						$sum: {
							$cond: [
								{
									$and: [
										{ $eq: ["$cancel_reason_id", Constants.NO_RESPONSE_FROM_RESTAURANT] },
									]
								},
								1,
								0
							]
						}
					},
					wrong_order: {
						$sum: {
							$cond: [
								{
									$and: [
										{ $eq: ["$cancel_reason_id", Constants.WRONG_ORDER_BY_CRAVEZ] },
									]
								},
								1,
								0
							]
						}
					},
				}},
				{ $match: yearConditions }
			]).toArray().then(result => {

				let currentYear = newDate().getFullYear();
				let currentMonth = newDate().getMonth() + 1;
				let yearWiseData = {};

				result.map(record => {
					if (!yearWiseData[record.year]) yearWiseData[record.year] = {};
					if (!yearWiseData[record.year][record.month]) yearWiseData[record.year][record.month] = {};
					yearWiseData[record.year][record.month]["unavailable_items"] = record.unavailable_items;
					yearWiseData[record.year][record.month]["shortage_delivery_driver"] = record.shortage_delivery_driver;
					yearWiseData[record.year][record.month]["no_response"] = record.no_response;
					yearWiseData[record.year][record.month]["wrong_order"] = record.wrong_order;
				});
			
				let finalArray = [];
				let dataYears = Object.keys(yearWiseData);
				Object.keys(Constants.REPORT_CHART_MONTH_NAMES).map(month => {
					let tmpRow = [Constants.REPORT_CHART_MONTH_NAMES[month]];
					dataYears.map(tmpYear => {
						let tmpObj = (yearWiseData[tmpYear] && yearWiseData[tmpYear][month]) ? yearWiseData[tmpYear][month] : {};
						if (!tmpObj.unavailable_items) tmpObj.unavailable_items = 0;
						if (!tmpObj.shortage_delivery_driver) tmpObj.shortage_delivery_driver = 0;
						if (!tmpObj.no_response) tmpObj.no_response = 0;
						if (!tmpObj.wrong_order) tmpObj.wrong_order = 0;

						if (tmpYear == currentYear && month > currentMonth && (!tmpObj.unavailable_items || tmpObj.unavailable_items == 0)) {
							tmpObj.unavailable_items = null;
						}
						if (tmpYear == currentYear && month > currentMonth && (!tmpObj.shortage_delivery_driver || tmpObj.shortage_delivery_driver == 0)) {
							tmpObj.shortage_delivery_driver = null;
						}
						if (tmpYear == currentYear && month > currentMonth && (!tmpObj.no_response || tmpObj.no_response == 0)) {
							tmpObj.no_response = null;
						}
						if (tmpYear == currentYear && month > currentMonth && (!tmpObj.wrong_order || tmpObj.wrong_order == 0)) {
							tmpObj.wrong_order = null;
						}
						tmpRow.push(tmpObj.unavailable_items);
						tmpRow.push(tmpObj.shortage_delivery_driver);
						tmpRow.push(tmpObj.no_response);
						tmpRow.push(tmpObj.wrong_order);
					});
					finalArray.push(tmpRow);
				});
				
				let commonColls = [
					res.__("reports.month"),
					res.__("reports.unavailable_items"),
					res.__("reports.shortage_of_delivery_driver"),
					res.__("reports.no_response_from_restaurant"),
					res.__("reports.wrong_order")
				];

				/**  Function to export data in excel format **/
				exportToExcel(req,res,{
					file_prefix 		: "topContributionToLostRevenueReport",
					heading_columns		: commonColls,
					export_data			: finalArray
				});
			});
		} catch (error) {
			return next(error);
		}
    };// end topContributionLostRevenueExportData()
}
