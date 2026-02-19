import { parallel as asyncParallel} from 'async';
import * as Constants from '../../../../config/global_constant.mjs';
import Tables from '../../../../config/database_tables.mjs';
import BREADCRUMBS from '../../../../breadcrumbs.mjs';
import { isPost, getDropdownList,arrayToObject, newDate, exportToExcel, configDatatable, currencyFormat } from '../../../../utils/index.mjs';

// Model for restaurant sales report
export default class RestaurantSalesReport {
	constructor(db) {
		this.db = db;
	}

	/**
	 * Function to get Restaurant sales report
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 *
	 * @return render/json
	 */
	async getRestaurantSalesReportList(req,res,next){
		try{
			if(isPost(req)){
				let limit			= (req.body.length) 		? parseInt(req.body.length) :Constants.ADMIN_LISTING_LIMIT;
				let skip		 	= (req.body.start)  		? parseInt(req.body.start)  :Constants.DEFAULT_SKIP;
				let fromDate     	= (req.body.from_date) 		? req.body.from_date 		:"";
				let toDate 	  	 	= (req.body.to_date)   		? req.body.to_date   		:"";			
				let areaIds			= (req.body.area_ids)   	? req.body.area_ids   		:[];
				let restaurantIds	= (req.body.restaurant_ids) ? req.body.restaurant_ids   :[];

				restaurantIds= (restaurantIds && restaurantIds.constructor === Array) ?restaurantIds :[restaurantIds];
				areaIds		= (areaIds && areaIds.constructor === Array) ?areaIds :[areaIds];

				const collection = 	this.db.collection(Tables.ORDERS);

				/** Configure Datatable conditions*/
				let dataTableConfig = await configDatatable(req,res,null);
				let commonConditions = {};

				/** Condition for date */
				if (fromDate != "" && toDate != "") {
					commonConditions["order_date"] = {
						$gte 	: newDate(fromDate),
						$lte 	: newDate(toDate),
					};
				}

				commonConditions["admin_status"] = Constants.ORDER_DELIVERED;
				dataTableConfig.conditions = Object.assign(dataTableConfig.conditions,commonConditions);
				if(restaurantIds.length > 0) dataTableConfig.conditions.restaurant_id = {$in : arrayToObject(restaurantIds)};
				if(areaIds.length > 0) dataTableConfig.conditions.area_id 		= {$in : arrayToObject(areaIds)};

				asyncParallel({
					records :(callback)=>{
						/** Get list **/
						collection.aggregate([
							{$match : dataTableConfig.conditions},
							{$lookup:	{
								"from" 			: 	Tables.RESTAURANT_BRANCHES,
								"localField" 	:	"branch_id",
								"foreignField" 	: 	"_id",
								"as" 			: 	"branch_details"
							}},
							{$addFields : {
								branch_name: {$arrayElemAt: ["$branch_details.name",0]},
							}},
							{$group : {
								_id					: {
									"restaurant_id" : "$restaurant_id",
									"branch_id" 	: "$branch_id",
								},
								total_amount	: {$sum : "$net_amount" },
								branch_id		: {$first: "$branch_id"},
								area_id			: {$first: "$area_id"},
								restaurant_id	: {$first: "$restaurant_id"},
								branch_name		: {$first: "$branch_name"},
								restaurant_name	: {$last : "$restaurant_name"},
								callcenter_orders: {$sum : {
										$cond: [
											{$and: [
												{$eq: ["$source", String(Constants.SOURCE_CALL_CENTER)] },
											]},
											1,
											0
										]}
									},
									talabat_orders	: {$sum : {
										$cond: [
											{$and: [
												{$eq: ["$source", String(Constants.SOURCE_TALABAT)] },
											]},
											1,
											0
										]}
									},
									delivero_orders	: {$sum : {
										$cond: [
											{$and: [
												{$eq: ["$source", String(Constants.SOURCE_DELIVRO)] },
											]},
											1,
											0
										]}
									},
									web_orders	: {$sum : {
										$cond: [
											{$and: [
												{$eq: ["$source", String(Constants.SOURCE_WEB)] },
											]},
											1,
											0
										]}
									},
									callcenter_orders_amount	: {$sum : {
										$cond: [
											{$and: [
												{$eq: ["$source", String(Constants.SOURCE_CALL_CENTER)] },
											]},
											"$net_amount",
											0
										]}
									},
									talabat_orders_amount	: {$sum : {
										$cond: [
											{$and: [
												{$eq: ["$source", String(Constants.SOURCE_TALABAT)] },
											]},
											"$net_amount",
											0
										]}
									},
									delivero_orders_amount	: {$sum : {
										$cond: [
											{$and: [
												{$eq: ["$source", String(Constants.SOURCE_DELIVRO)] },
											]},
											"$net_amount",
											0
										]}
									},
									web_orders_amount	: {$sum : {
										$cond: [
											{$and: [
												{$eq: ["$source", String(Constants.SOURCE_WEB)] },
											]},
											"$net_amount",
											0
										]}
									},
									total    : { $sum: 1 },
							}},
							{$sort 	: dataTableConfig.sort_conditions},
							{$skip 	: skip},
							{$limit : limit},
						]).toArray().then(result => {
							callback(null,result);
						}).catch(next);
					},
					total_records:(callback)=>{
						/** Get total number of records **/
						collection.aggregate([
							{$match : commonConditions},
							{$group : {
								_id					: {
									"restaurant_id" : "$restaurant_id",
									"branch_id" 	: "$branch_id",
								},
							}}
						]).toArray().then(countResult => {
							callback(null, countResult.length);
						}).catch(next);
					},
					filter_records:(callback)=>{
						/** Get filtered records counting **/
						collection.aggregate([
							{$match : dataTableConfig.conditions},
							{$group : {
								_id					: {
									"restaurant_id" : "$restaurant_id",
									"branch_id" 	: "$branch_id",
								},
							}}
						]).toArray().then(countResult => {
							callback(null, countResult.length);
						}).catch(next);
					}
				},(err, response)=>{
					/** Send response **/
					res.send({
						status			: (!err) ? Constants.STATUS_SUCCESS : Constants.STATUS_ERROR,
						draw			: dataTableConfig.result_draw,
						data			: (response.records) ?response.records:[],
						recordsFiltered	: response.filter_records,
						recordsTotal	: response.total_records,
					});
				});
			}else{

				/** Set dropdown options **/
				let options = {
					collections :[
						{
							collection : Tables.RESTAURANTS,
							columns    : ["_id",["name",Constants.DEFAULT_LANGUAGE_CODE]],
							conditions : {
								is_deleted	: Constants.NOT_DELETED
							},
						}
					]
				};

				/**Get dropdown list **/
				getDropdownList(req,res, next,options).then(response=> {
					/** render listing page **/
					req.breadcrumbs(BREADCRUMBS['admin/report/restaurant_sales_report']);
					res.render('restaurant_sales_report',{
						restaurant_list : response?.final_html_data?.["0"] || "",
					});
				}).catch(next);
			}
		}catch(error){
			return next(error);
		}
	};//End getRestaurantSalesReportList()

	/**
	 *  Function for Restaurant sales report export
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 * @param next 	As 	Callback argument to the middleware function
	 *
	 * @return null
    */
    async getRestaurantSalesReportExport(req,res,next){
		try{
			let fromDate     	= (req.query.from_date) 	? req.query.from_date 		: "";
			let toDate 	  	 	= (req.query.to_date)   	? req.query.to_date   		: "";
			let sortingField  	= (req.query.sort_field) 	? req.query.sort_field   	: "_id";
			let sortingDir 	 	= (req.query.sort_dir) 		? req.query.sort_dir   		: "asc";
			let sortOrder		= (sortingDir == 'asc') 	? Constants.SORT_ASC : Constants.SORT_DESC;
			let restaurantIds	= (req.query.restaurant_ids)? (req.query.restaurant_ids).split(","): [];
			let areaIds			= (req.query.area_ids) ? (req.query.area_ids).split(",")   	: [];

			if(restaurantIds.constructor != Array) restaurantIds = [restaurantIds];
			if(areaIds.constructor != Array) 	areaIds	= [areaIds];

			let exportConditions	= {};
			/** Condition for date */
			if (fromDate != "" && toDate != "") {
				exportConditions["order_date"] = {
					$gte 	: newDate(fromDate),
					$lte 	: newDate(toDate),
				};
			}
			exportConditions["admin_status"] = Constants.ORDER_DELIVERED;

			let sortConditions		= {};
			sortConditions[sortingField] = sortOrder;

			if(restaurantIds.length > 0) exportConditions.restaurant_id	= {$in: arrayToObject(restaurantIds)};
			if(areaIds.length > 0 ) exportConditions.area_id		= {$in: arrayToObject(areaIds)};

			/** Get order details **/
			const orders = this.db.collection(Tables.ORDERS);
			orders.aggregate([
				{$match : exportConditions},
				{$sort 	: {_id : Constants.SORT_DESC}},
				{$lookup:	{
					"from" 			: 	Tables.RESTAURANT_BRANCHES,
					"localField" 	:	"branch_id",
					"foreignField" 	: 	"_id",
					"as" 			: 	"branch_details"
				}},
				{$addFields : {
					branch_name: {$arrayElemAt: ["$branch_details.name",0]},
				}},
				{$group : {
					_id					: {
						"restaurant_id" : "$restaurant_id",
						"branch_id" 	: "$branch_id",
					},
					total_amount	: { $sum: "$net_amount" },
					branch_id		: { $first: "$branch_id" },
					area_id			: { $first: "$area_id" },
					restaurant_id	: { $first: "$restaurant_id" },
					branch_name		: { $first: "$branch_name" },
					restaurant_name	: { $last: "$restaurant_name" },
					area_name		: { $last: "$area_name" },
					callcenter_orders: {
						$sum: {
							$cond: [
								{$and: [
									{$eq: ["$source", String(Constants.SOURCE_CALL_CENTER)] },
								]},
								1,
								0
							]
						}
					},
					talabat_orders: {
						$sum: {
							$cond: [
								{$and: [
									{$eq: ["$source", String(Constants.SOURCE_TALABAT)] },
								]},
								1,
								0
							]
						}
					},
					delivero_orders: {
						$sum: {
							$cond: [
								{$and: [
									{$eq: ["$source", String(Constants.SOURCE_DELIVRO)] },
								]},
								1,
								0
							]
						}
					},
					web_orders: {
						$sum: {
							$cond: [
								{$and: [
									{$eq: ["$source", String(Constants.SOURCE_WEB)] },
								]},
								1,
								0
							]
						}
					},
					callcenter_orders_amount: {
						$sum: {
							$cond: [
								{$and: [
									{$eq: ["$source", String(Constants.SOURCE_CALL_CENTER)] },
								]},
								"$net_amount",
								0
							]
						}
					},
					talabat_orders_amount: {
						$sum: {
							$cond: [
								{$and: [
									{$eq: ["$source", String(Constants.SOURCE_TALABAT)] },
								]},
								"$net_amount",
								0
							]
						}
					},
					delivero_orders_amount: {
						$sum: {
							$cond: [
								{$and: [
									{$eq: ["$source", String(Constants.SOURCE_DELIVRO)] },
								]},
								"$net_amount",
								0
							]
						}
					},
					web_orders_amount: {
						$sum: {
							$cond: [
								{$and: [
									{$eq: ["$source", String(Constants.SOURCE_WEB)] },
								]},
								"$net_amount",
								0
							]
						}
					},
					total: { $sum: 1 },
				}},
				{$sort 	: sortConditions},
			]).toArray().then(findResult => {

				let temp		= [];
				let commonColls	= [];

				/** Define excel heading label **/
				commonColls	= [
					res.__("admin.report.restaurant_name"),
					res.__("admin.report.branch_name"),
					// res.__("admin.report.area_name"),
					res.__("admin.report.callcenter_orders"),
					res.__("admin.report.callcenter_orders_amount"),
					res.__("admin.report.talabat_orders"),
					res.__("admin.report.talabat_orders_amount"),
					res.__("admin.report.delivero_orders"),
					res.__("admin.report.delivero_orders_amount"),
					res.__("admin.report.web_orders"),
					res.__("admin.report.web_orders_amount"),
					res.__("admin.report.total_orders"),
					res.__("admin.report.total_amount"),
				];

				if(findResult && findResult.length > 0){
					findResult.map(records=>{
						let buffer =	[
							(records.restaurant_name)	? records.restaurant_name[Constants.DEFAULT_LANGUAGE_CODE] 		:"",
							(records.branch_name)		? records.branch_name[Constants.DEFAULT_LANGUAGE_CODE] 		:"",
							// (records.area_name)			? records.area_name[DEFAULT_LANGUAGE_CODE] 		:"",
							(records.callcenter_orders) ? (records.callcenter_orders) : (0),
							(records.callcenter_orders_amount) ? currencyFormat(records.callcenter_orders_amount) : currencyFormat(0),
							(records.talabat_orders)	? (records.talabat_orders) : (0),
							(records.talabat_orders_amount) ? currencyFormat(records.talabat_orders_amount) : currencyFormat(0),
							(records.delivero_orders) 	? (records.delivero_orders) : (0),
							(records.delivero_orders_amount) ? currencyFormat(records.delivero_orders_amount) : currencyFormat(0),
							(records.web_orders) 		? (records.web_orders) : (0),
							(records.web_orders_amount) ? currencyFormat(records.web_orders_amount) : currencyFormat(0),
							(records.total) 			? (records.total) : (0),
							(records.total_amount) 		? currencyFormat(records.total_amount) : currencyFormat(0),
						];
						temp.push(buffer);
					});
				}

				/**  Function to export data in excel format **/
				exportToExcel(req,res,{
					file_prefix 		: "RestaurantSalesReport ",
					heading_columns		: commonColls,
					export_data			: temp
				});
			}).catch(next);
		}catch(error){
			return next(error);
		}
	};// end getRestaurantSalesReportExport()
}