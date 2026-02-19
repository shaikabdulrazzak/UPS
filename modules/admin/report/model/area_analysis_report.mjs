import { parallel as asyncParallel} from 'async';
import * as Constants from '../../../../config/global_constant.mjs';
import Tables from '../../../../config/database_tables.mjs';
import BREADCRUMBS from '../../../../breadcrumbs.mjs';
import { isPost, getDropdownList,arrayToObject, newDate, exportToExcel, configDatatable, round } from '../../../../utils/index.mjs';

// Model for area analysis report
export default class AreaAnalysisReport {

    constructor(db) {
        this.db = db;
    }

	/**
	 * Function to get area analysis list
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 *
	 * @return render/json
	 */
    async getAreaAnalysisReportList(req,res,next){
		try {
			if(isPost(req)){
				let limit			= (req.body.length) 		? parseInt(req.body.length) :Constants.ADMIN_LISTING_LIMIT;
				let skip		 	= (req.body.start)  		? parseInt(req.body.start)  :Constants.DEFAULT_SKIP;
				let fromDate     	= (req.body.from_date) 	    ? req.body.from_date 		:"";
				let toDate 	  	 	= (req.body.to_date)   	    ? req.body.to_date   		:"";
				let restaurantIds	= (req.body.restaurant_ids) ? req.body.restaurant_ids   :[];
				let branchIds		= (req.body.branch_ids)   	? req.body.branch_ids   	:[];
				let areaIds			= (req.body.area_ids)   	? req.body.area_ids   		:[];
				let deliveryBy      = (req.body.delivery_by)    ? req.body.delivery_by 		:"";
				let deliveryMinuteRange = (req.body.delivery_minute_range)  ? req.body.delivery_minute_range 	:"";
				let deliveryOrderValue  = (req.body.delivery_order_value)  ? req.body.delivery_order_value 		:"";
				let deliveryHoursValue  = (req.body.delivery_hours_value)  ? req.body.delivery_hours_value 		:"";

				const collection	= this.db.collection(Tables.ORDERS);
				restaurantIds= (restaurantIds && restaurantIds.constructor === Array) ?restaurantIds :[restaurantIds];
				branchIds	= (branchIds && branchIds.constructor === Array) ?branchIds :[branchIds];
				areaIds		= (areaIds && areaIds.constructor === Array) ?areaIds :[areaIds];

				/** Configure Datatable conditions*/
				let dataTableConfig = await configDatatable(req,res,null);
				
				/** Condition for date */
				let commonConditions = {};
				if(fromDate != "" && toDate != "")  commonConditions["order_date"] = {$gte: newDate(fromDate), $lte: newDate(toDate) };

				commonConditions.admin_status = Constants.ORDER_DELIVERED;

				if(restaurantIds.length > 0) dataTableConfig.conditions.restaurant_id = {$in : arrayToObject(restaurantIds)};
				if(branchIds.length > 0) dataTableConfig.conditions.branch_id	= {$in : arrayToObject(branchIds)};
				if(areaIds.length > 0) dataTableConfig.conditions.area_id 		= {$in : arrayToObject(areaIds)};

				/** Conditions for search*/
				if (deliveryBy != "") {
					switch (deliveryBy) {
						case Constants.DELIVERY_BY_RESTAURANT:
							dataTableConfig.conditions["delivery_type"] = Constants.DELIVERY_BY_RESTAURANT;
						break;
						case Constants.DELIVERY_BY_CRAVEZ:
							dataTableConfig.conditions["delivery_type"] = Constants.DELIVERY_BY_CRAVEZ;
						break;
						case Constants.DELIVERY_BY_PICK_UP:
							dataTableConfig.conditions["delivery_type"] = Constants.DELIVERY_BY_PICK_UP;
						break;
					}
				}
				/** Condition for delivery minutes */
				let durationConditions = {};
				if(deliveryMinuteRange != ""){
					if(deliveryMinuteRange == Constants.SIXTY_PLUS){
						durationConditions["delivery_duration"] = {$gte: Constants.DELIVERY_MINUTES_RANGE[deliveryMinuteRange].min};
					}else{
						durationConditions["delivery_duration"] = {$gte: Constants.DELIVERY_MINUTES_RANGE[deliveryMinuteRange].min, $lte: Constants.DELIVERY_MINUTES_RANGE[deliveryMinuteRange].max };
					}
				}

				/** Condition for delivery order value */
				if(deliveryOrderValue != ""){
					if(deliveryOrderValue == Constants.TWENTY_PLUS){
						commonConditions["order_price"] = {$gte: Constants.DELIVERY_ORDER_VALUE[deliveryOrderValue].min};
					}else{
						commonConditions["order_price"] = {$gte: Constants.DELIVERY_ORDER_VALUE[deliveryOrderValue].min, $lte: Constants.DELIVERY_ORDER_VALUE[deliveryOrderValue].max };
					}
				}

				/** Condition for delivery order value */
				if(deliveryHoursValue){
					commonConditions["$or"] = [];
					dates = getDates(new Date(fromDate), new Date(toDate));
					dates.map(records=>{
						deliveryHoursValue.map(deliveryHoursValue=>{
							let minValue =	ORDER_PLACE_HOURS_RANGE[deliveryHoursValue].min;
							let maxValue =	ORDER_PLACE_HOURS_RANGE[deliveryHoursValue].max;
							commonConditions["$or"].push({
								order_date : {$gte: newDate(newDate(records, Constants.DATABASE_DATE_FORMAT+" "+minValue+":00:00")), $lte: newDate(newDate(records, Constants.DATABASE_DATE_FORMAT+" "+maxValue+":00:00")) }
							});
						});
					});
				}

				asyncParallel({
					records :(callback)=>{
						/** Get list of all orders of guest and customer **/
						collection.aggregate([
							{$match : commonConditions},
							{$lookup: {
								"from" 			: Tables.ORDER_DETAILS,
								"localField" 	: "_id",
								"foreignField" 	: "order_id",
								"as" 			: "order_subdetails"
							}},
							{$addFields : {
								delivery_duration: {$arrayElemAt: ["$order_subdetails.delivery_duration",0]}
							}},
							{$match : durationConditions},
							{$group : {
								_id	: {
									branch_id	 : "$branch_id",
									area_id	     : "$area_id",
									delivery_type: "$delivery_type"
								},
								branch_id		: {$first: "$branch_id"},
								area_id			: {$first: "$area_id"},
								order_date		: {$first: "$order_date"},
								restaurant_id	: {$first: "$restaurant_id"},
								area_name		: {$last : "$area_name"},
								restaurant_name	: {$last : "$restaurant_name"},
								delivery_type   : {$first: "$delivery_type" },
								delivery_duration:{$first: "$delivery_duration" },
								total_orders	: {$sum  : 1},
							}},
							{$match : dataTableConfig.conditions},
							{$sort 	: dataTableConfig.sort_conditions},
							{$skip 	: skip},
							{$limit : limit},
							{$lookup:	{
								"from" 			: 	Tables.RESTAURANT_BRANCHES,
								"localField" 	:	"branch_id",
								"foreignField" 	: 	"_id",
								"as" 			: 	"branch_details"
							}},
							{$addFields : {
								branch_name: {$arrayElemAt: ["$branch_details.name",0]},
							}},
						]).toArray().then(result=>{
							callback(null,result);
						}).catch(err=>{
							callback(err,[]);
						});
					},
					total_records:(callback)=>{
						/** Get total number of records **/
						collection.aggregate([
							{$match : commonConditions},
							{$group : {
								_id	: {
									branch_id	 : "$branch_id",
									area_id	     : "$area_id",
									delivery_type: "$delivery_type"
								},
							}}
						]).toArray().then(countResult=>{
							countResult = (countResult) ? countResult.length :0;
							callback(null, countResult );
						}).catch(err=>{
							callback(err, 0);
						});
					},
					filter_records:(callback)=>{
						/** Get filtered records counting **/
						collection.aggregate([
							{$match : commonConditions},
							{$lookup : {
								"from" 			: Tables.ORDER_DETAILS,
								"localField" 	: "_id",
								"foreignField" 	: "order_id",
								"as" 			: "order_subdetails"
							}},
							{$addFields : {
								delivery_duration	: {$arrayElemAt: ["$order_subdetails.delivery_duration",0]}
							}},
							{$match : durationConditions},
							{$group : {
								_id	: {
									branch_id	 : "$branch_id",
									area_id	     : "$area_id",
									delivery_type: "$delivery_type"
								},
								branch_id			: {$first: "$branch_id"},
								area_id				: {$first: "$area_id"},
								restaurant_id		: {$first: "$restaurant_id"},
								area_name			: {$last : "$area_name"},
								restaurant_name		: {$last : "$restaurant_name"},
								delivery_type       : {$first: "$delivery_type" },
								delivery_duration	: {$first: "$delivery_duration" },
								total_orders	    : {$sum : 1},
							}},
							{$match : dataTableConfig.conditions},
						]).toArray().then(countResult=>{
							countResult = (countResult) ? countResult.length :0;
							callback(null, countResult);
						}).catch(err=>{
							callback(err, 0);
						});
					}
				},(err, response)=>{
					/** Send response **/
					res.send({
						status			: (!err) ? Constants.STATUS_SUCCESS : Constants.STATUS_ERROR,
						draw			: dataTableConfig.result_draw,
						data			: response.records,
						recordsFiltered	: response.filter_records,
						recordsTotal	: response.total_records,
					});
				});
			}else{
				/**Get dropdown list **/
				getDropdownList(req,res, next, {
					collections :[
						{
							collection : Tables.RESTAURANTS,
							columns    : ["_id",["name",Constants.DEFAULT_LANGUAGE_CODE]],
							conditions : {is_deleted : Constants.NOT_DELETED},
						},
						{
							collection	:	Tables.AREAS,
							columns		: 	["_id", ["name", Constants.DEFAULT_LANGUAGE_CODE]],
							conditions	: 	{is_active : Constants.ACTIVE },
						}
					]
				}).then(response=> {
					

					/** render listing page **/
					req.breadcrumbs(BREADCRUMBS['admin/report/area_analysis_report']);
					res.render('area_analysis_report',{
						restaurant_list : response?.final_html_data?.[0] || "",
						area_list 		: response?.final_html_data?.[1] || "",
					});
				}).catch(next);
			}
		} catch (error) {
			return next(error);
		}
	};//End getAreaAnalysisReportList()

	/**
	 *  Function for all orders export
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 * @param next 	As 	Callback argument to the middleware function
	 *
	 * @return null
    */
	async areaAnalysisReportExport(req,res,next){
		try {
			let reqQuery			=	(req.query)						?	req.query									:{};
			let fromDate     		=	(reqQuery.from_date) 			? 	reqQuery.from_date 							:"";
			let toDate 	  	 		= 	(reqQuery.to_date)   			? 	reqQuery.to_date   							:"";
			let sortingField    	= 	(reqQuery.sort_field)  			? 	reqQuery.sort_field 						:"_id";
			let sortingDir      	= 	(reqQuery.sort_dir)      		? 	reqQuery.sort_dir    						:"asc";
			let sortOrder       	= 	(sortingDir == 'asc')     		? 	Constants.SORT_ASC 									:Constants.SORT_DESC;
			let branchIds			= 	(reqQuery.branch_ids)  			? 	(reqQuery.branch_ids).split(",")   	   		:[];
			let areaIds				= 	(reqQuery.area_ids)    			? 	(reqQuery.area_ids).split(",") 				:[];
			let deliveryBy      	= 	(reqQuery.delivery_by)			? 	reqQuery.delivery_by 						:"";
			let restaurantIds		= 	(reqQuery.restaurant_ids)		?	(reqQuery.restaurant_ids).split(",")		:[];
			let deliveryOrderValue  = 	(reqQuery.delivery_order_value)	? 	reqQuery.delivery_order_value 				:"";
			let deliveryMinuteRange = 	(req.query.delivery_minute_range)? 	req.query.delivery_minute_range				:"";
			let deliveryHoursValue  = 	(reqQuery.delivery_hours_value)	? 	(reqQuery.delivery_hours_value).split(",")	:[];

			if(areaIds.constructor != Array)  		areaIds			=	[areaIds];
			if(branchIds.constructor != Array) 		branchIds		= 	[branchIds];
			if(restaurantIds.constructor != Array) 	restaurantIds	= 	[restaurantIds];
			if(deliveryHoursValue.constructor != Array) deliveryHoursValue	= [deliveryHoursValue];

			let exportConditions	= {};
			let commonConditions	= {};
			let sortConditions      = {};
			sortConditions[sortingField]= sortOrder;

			/** Condition for date */
			if (fromDate != "" && toDate != "") {
				exportConditions["order_date"] = {$gte: newDate(fromDate), $lte: newDate(toDate) };
			}

			exportConditions.admin_status = Constants.ORDER_DELIVERED;

			if(restaurantIds.length > 0)exportConditions.restaurant_id		=	{$in: arrayToObject(restaurantIds)};
			if(branchIds.length > 0)	exportConditions.branch_id			= 	{$in: arrayToObject(branchIds)};
			if(areaIds.length > 0)		exportConditions.area_id			= 	{$in: arrayToObject(areaIds)};
			if (deliveryBy) 			exportConditions["delivery_type"]	= 	deliveryBy;

			/** Condition for delivery minutes */
			let durationConditions = {};
			if(deliveryMinuteRange != "" && Constants.DELIVERY_MINUTES_RANGE[deliveryMinuteRange]){
				if(deliveryMinuteRange == Constants.SIXTY_PLUS){
					durationConditions["delivery_duration"] = {$gte: Constants.DELIVERY_MINUTES_RANGE[deliveryMinuteRange].min};
				}else{
					durationConditions["delivery_duration"] = {$gte: Constants.DELIVERY_MINUTES_RANGE[deliveryMinuteRange].min, $lte: Constants.DELIVERY_MINUTES_RANGE[deliveryMinuteRange].max };
				}
			}

			/** Condition for delivery order value */
			if(deliveryOrderValue != ""){
				if(deliveryOrderValue == Constants.TWENTY_PLUS){
					exportConditions["order_price"] = {$gte: Constants.DELIVERY_ORDER_VALUE[deliveryOrderValue].min};
				}else{
					exportConditions["order_price"] = {$gte: Constants.DELIVERY_ORDER_VALUE[deliveryOrderValue].min, $lte: Constants.DELIVERY_ORDER_VALUE[deliveryOrderValue].max };
				}
			}

			/** Condition for delivery hours value */
			if(deliveryHoursValue.length > 0){
				exportConditions["$or"] = [];
				dates = getDates(new Date(fromDate), new Date(toDate));
				dates.map(records=>{
					deliveryHoursValue.map(deliveryHoursValue=>{
						let minValue =	ORDER_PLACE_HOURS_RANGE[deliveryHoursValue].min;
						let maxValue =	ORDER_PLACE_HOURS_RANGE[deliveryHoursValue].max;
						exportConditions["$or"].push({
							order_date : {$gte: newDate(newDate(records, Constants.DATABASE_DATE_FORMAT+" "+minValue+":00:00")), $lte: newDate(newDate(records, Constants.DATABASE_DATE_FORMAT+" "+maxValue+":00:00")) }
						});
					});
				});
			}

			/** Get order details **/
			const orders	= this.db.collection(Tables.ORDERS);
			orders.aggregate([
				{$match : exportConditions},
				{$lookup: {
					"from" 			: Tables.ORDER_DETAILS,
					"localField" 	: "_id",
					"foreignField" 	: "order_id",
					"as" 			: "order_subdetails"
				}},
				{$addFields : {
					delivery_duration	: {$arrayElemAt: ["$order_subdetails.delivery_duration",0]}
				}},
				{$match : durationConditions},
				{$group : {
					_id	: {
						branch_id	 : "$branch_id",
						area_id	     : "$area_id",
						delivery_type: "$delivery_type"
					},
					branch_id			: {$first: "$branch_id"},
					area_id				: {$first: "$area_id"},
					restaurant_id		: {$first: "$restaurant_id"},
					area_name			: {$last : "$area_name"},
					restaurant_name		: {$last : "$restaurant_name"},
					delivery_duration	: {$first: "$delivery_duration" },
					delivery_type       : {$first: "$delivery_type" },
					total_orders	    : {$sum : 1},
				}},
				{$match : commonConditions},
				{$sort	: sortConditions},
				{$lookup:	{
					"from" 			: 	Tables.RESTAURANT_BRANCHES,
					"localField" 	:	"branch_id",
					"foreignField" 	: 	"_id",
					"as" 			: 	"branch_details"
				}},
				{$addFields : {
					branch_name: {$arrayElemAt: ["$branch_details.name",0]},
				}},
			]).toArray().then(findResult=>{

				/** Define excel heading label **/
				let commonColls	= [
					res.__("admin.report.restaurant_name"),
					res.__("admin.report.branch_name"),
					res.__("admin.report.area_name"),
					res.__("admin.report.no_of_orders"),
					res.__("admin.report.delivery_by"),
				];

				let temp = [];
				if(findResult && findResult.length > 0){
					findResult.map(records=>{
						temp.push([
							(records.restaurant_name)?	records.restaurant_name[Constants.DEFAULT_LANGUAGE_CODE]	:"",
							(records.branch_name)	 ? 	records.branch_name[Constants.DEFAULT_LANGUAGE_CODE] 		:"",
							(records.area_name)		 ? 	records.area_name[Constants.DEFAULT_LANGUAGE_CODE] 		:"",
							(records.total_orders)	 ? 	round(records.total_orders) 					:0,
							(records.delivery_type)  ? 	Constants.DELIVERY_BY[records.delivery_type] 				:"",
						]);
					});
				}

				/**  Function to export data in excel format **/
				exportToExcel(req,res,{
					file_prefix     :	"AreaAnalysisReport ",
					heading_columns	: 	commonColls,
					export_data		: 	temp
				});
			}).catch(next);
		} catch (error) {
			return next(error);
		}
    };// end areaAnalysisReportExport()
}