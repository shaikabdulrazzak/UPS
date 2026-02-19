import { ObjectId } from 'mongodb';
import { parallel as asyncParallel} from 'async';
import * as Constants from '../../../../config/global_constant.mjs';
import Tables from '../../../../config/database_tables.mjs';
import BREADCRUMBS from '../../../../breadcrumbs.mjs';
import { isPost, getDropdownList,arrayToObject, newDate, exportToExcel, configDatatable } from '../../../../utils/index.mjs';

// Model for Agent Performance Report
export default class AgentPerformanceReport2 {
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
    async getAgentPerformanceList2(req,res,next){
		try {
			if(isPost(req)){
				let limit		 	= (req.body.length) 		? parseInt(req.body.length) :Constants.ADMIN_LISTING_LIMIT;
				let skip		 	= (req.body.start)  		? parseInt(req.body.start)  :Constants.DEFAULT_SKIP;
				let fromDate     	= (req.body.from_date) 		? req.body.from_date 		:"";
				let toDate 	  	 	= (req.body.to_date)   		? req.body.to_date   		:"";
				let agentNameId 	= (req.body.agent_name)		? new ObjectId(req.body.agent_name)   	:"";
				let itemIds			= (req.body.item_ids) 		? req.body.item_ids   		:[];
				let restaurantIds	= (req.body.restaurant_ids)	? req.body.restaurant_ids	:[];
	
				if(restaurantIds.constructor != Array) restaurantIds = [restaurantIds];
				if(itemIds.constructor != Array) 	itemIds	= [itemIds];
	
				const collection = 	this.db.collection(Tables.ORDER_ITEMS);
				const orders 	 = 	this.db.collection(Tables.ORDERS);
				const users 	 = 	this.db.collection(Tables.USERS);
	
				/** Set order condition */
				let orderConditions = {admin_status : Constants.ORDER_DELIVERED};
	
				/** Condition for agent name  **/
				if(agentNameId != ""){
					orderConditions.placed_by = agentNameId;
				}
				/** Condition for order date **/
				if (fromDate != "" && toDate != "") {
					orderConditions.order_date = {
						$gte 	: newDate(fromDate),
						$lte 	: newDate(toDate),
					};
				}
	
				/** Condition for restaurant **/
				if(restaurantIds.length > 0){
					orderConditions.restaurant_id = {$in: arrayToObject(restaurantIds)};
				}
	
				asyncParallel({
					order_details:(callback)=>{
						/** Get order ids  */
						orders.distinct("_id",orderConditions).then(orderIds=>{
							callback(null,orderIds);
						}).catch(err=>{
							callback(err,[]);
						});
					},
					agent_name: (callback) => {
						/** Get agent_name**/
						users.findOne({
							_id: agentNameId,
						}, { projection: { _id: 1, full_name: 1} }).then(findResult=>
							callback(null,findResult)
						).catch(err=>{
							callback(err,null);
						});
					},
				},async(asyncErr, asyncResponse)=>{
					if(asyncErr) return next(asyncErr);
	
					let orderIds  = asyncResponse?.order_details || [];
					let agentName = asyncResponse?.agent_name?.full_name ||"";
	
					/** Configure Datatable conditions*/
					let dataTableConfig = await configDatatable(req,res,null);

					/** Set common condition **/
					let commonConditions = { order_id : { $in : orderIds} };

					/** Condition for items  **/
					if(itemIds.length > 0){
						commonConditions.item_id = {$in: arrayToObject(itemIds)};
					}

					dataTableConfig.conditions	= Object.assign(commonConditions, dataTableConfig.conditions);
					asyncParallel({
						agent_performance_list :(callback)=>{
							/** Get list of items **/
							collection.aggregate([
								{$match : dataTableConfig.conditions},
								{$lookup:	{ /** Get item details **/
									"from" 			: 	Tables.ORDERS,
									"localField" 	:	"order_id",
									"foreignField" 	: 	"_id",
									"as" 			: 	"order_detail"
								}},
								{$addFields: { order_source: { $arrayElemAt: ["$order_detail.source",0]} }},
								{$group: {
									_id: {
										item_id : "$item_id"
									},
									item_id 	: {$first : "$item_id"},
									item_name  	: {$first : "$item_name"},
									callcenter_orders	: {$sum : {
										$cond: [
											{$and: [
												{ $eq: ["$order_source", String(Constants.SOURCE_CALL_CENTER)] },
											]},
											1,
											0
										]}
									},
									talabat_orders	: {$sum : {
										$cond: [
											{$and: [
												{ $eq: ["$order_source", String(Constants.SOURCE_TALABAT)] },
											]},
											1,
											0
										]}
									},
									delivero_orders	: {$sum : {
										$cond: [
											{$and: [
												{ $eq: ["$order_source", String(Constants.SOURCE_DELIVRO)] },
											]},
											1,
											0
										]}
									},
									web_orders	: {$sum : {
										$cond: [
											{$and: [
												{ $eq: ["$order_source", String(Constants.SOURCE_WEB)] },
											]},
											1,
											0
										]}
									},
									total    : { $sum: 1 },
								}},
								{$sort 	: dataTableConfig.sort_conditions},
								{$skip 	: skip},
								{$limit : limit},
							]).toArray().then(result=>{
								if(result.length ==0) return callback(null, result);

								result.map(record=>{
									record.agent_name 	=	agentName;
									record.from_date  	= 	fromDate;
									record.to_date 		= 	toDate;
								});
								callback(null, result);
							}).catch(err=>{
								callback(err, []);
							});
						},
						records_total: (callback)=>{
							/** Get total number of records in order items  collection **/
							collection.distinct("item_id",commonConditions).then(itemIds=>{
								let count = itemIds.length;
								callback(null, count);
							}).catch(err=>{
								callback(err, 0);
							});
						},
						records_filtered: (callback)=>{
							/** Get filtered records counting in order items   **/
							collection.distinct("item_id",dataTableConfig.conditions).then(itemIds=>{
								let filterCount = itemIds.length;
								callback(null, filterCount);
							}).catch(err=>{
								callback(err, 0);
							});
						}
					},(err, response)=>{
					
						/** Send response **/
						res.send({
							status			: (!err) ? Constants.STATUS_SUCCESS : Constants.STATUS_ERROR,
							draw			: dataTableConfig.result_draw,
							data			: response.agent_performance_list,
							recordsFiltered	: response.records_filtered,
							recordsTotal	: response.records_total,
						});
					});
				});
			}else{
				/**Get dropdown list **/
				getDropdownList(req, res, next, {
					collections: [
						{
							collection  : Tables.RESTAURANTS,
							columns     : ["_id", ["name", Constants.DEFAULT_LANGUAGE_CODE]],
							conditions  : {
								is_deleted  : Constants.NOT_DELETED
							},
						},
						{
							collection  : Tables.USERS,
							columns     : ["_id", "full_name"],
							conditions  : {
								user_role_id: Constants.CALL_CENTER_TEAM,
								user_type 	: Constants.USER_TYPE_ADMIN,
								is_deleted  : Constants.NOT_DELETED
							},
						}
					]
				}).then(response => {
					
					/** render listing page **/
					req.breadcrumbs(BREADCRUMBS['admin/report/agent_performance_report_2']);
					res.render('agent_performance_report_2', {
						restaurant_list : response?.final_html_data?.[0] || "",
						user_list 		: response?.final_html_data?.[1] || "",
					});
				}).catch(next);
			}			
		} catch (error) {
			return next(error);
		}
    };//End getAgentPerformanceList2()

	/**
	 *  Function for export agent performance report
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 * @param next 	As 	Callback argument to the middleware function
	 *
	 * @return null
    */
    async agentPerformance2ExportData(req,res,next){
		try {
			let fromDate 		= (req.query.from_date) 	? req.query.from_date 	: "";
			let toDate 			= (req.query.to_date) 		? req.query.to_date 	: "";
			let sortingField	= (req.query.sort_field) 	? req.query.sort_field 	: "_id";
			let sortingDir 		= (req.query.sort_dir) 		? req.query.sort_dir 	: "asc";
			let sortOrder 		= (sortingDir == 'asc') 	? Constants.SORT_ASC 				: Constants.SORT_DESC;
			let agentNameId		= (req.query.agent_name) 	? new ObjectId(req.query.agent_name): "";
			let itemIds 		= (req.query.item_ids) 		? (req.query.item_ids).split(",") : [];
			let restaurantIds 	= (req.query.restaurant_ids)? (req.query.restaurant_ids).split(",") : [];

			if (restaurantIds.constructor != Array) restaurantIds = [restaurantIds];
			if (itemIds.constructor != Array) itemIds = [itemIds];

			const users = this.db.collection(Tables.USERS);

			/** Set order condition */
			let orderConditions = { admin_status: Constants.ORDER_DELIVERED };

			/** Condition for agent name  **/
			if(agentNameId != ""){
				orderConditions.placed_by = agentNameId;
			}

			/** Condition for order date **/
			if (fromDate != "" && toDate != "") {
				orderConditions["order_date"] = {
					$gte: newDate(fromDate),
					$lte: newDate(toDate),
				};
			}

			/** Condition for restaurant **/
			if (restaurantIds.length > 0) {
				orderConditions.restaurant_id = { $in: arrayToObject(restaurantIds) };
			}

			asyncParallel({
				order_details:(callback)=>{
					const orders = this.db.collection(Tables.ORDERS);
					orders.distinct("_id",orderConditions).then(orderIds=>{
						callback(null,orderIds);
					}).catch(err=>{
						callback(err,[]);
					});
				},
				agent_name: (callback) => {
					/** Get agent_name**/
					users.findOne({	_id: agentNameId}, { projection: { _id: 1, full_name: 1 } }).then(findResult=>{
						callback(null, findResult);
					}).catch(err=>{
						callback(err, null);
					});
				},
			},(asyncErr, asyncResponse)=>{
				if(asyncErr) return next(asyncErr);

				let orderIds  = asyncResponse?.order_details || [];
				let agentName = asyncResponse?.agent_name?.full_name || "";

				/** Set common condition */
				let exportConditions = {
					order_id : { $in : orderIds}
				};

				/** Condition for item ids **/
				if (itemIds.length > 0) {
					exportConditions.item_id = { $in: arrayToObject(itemIds) };
				}
				let sortConditions = {};
				sortConditions[sortingField] = sortOrder;

				/** Get list of items **/
				const order_items = this.db.collection(Tables.ORDER_ITEMS);
				order_items.aggregate([
					{ $match: exportConditions},
					{
						$lookup: { /** Get item details **/
							"from"          : Tables.ORDERS,
							"localField"    : "order_id",
							"foreignField"  : "_id",
							"as"            : "order_detail"
						}
					},
					{$addFields: { order_source: { $arrayElemAt: ["$order_detail.source",0]} }},
					{$group: {
						_id: {
							item_id : "$item_id"
						},
						item_id 	: {$first : "$item_id"},
						item_name  	: {$first : "$item_name"},
						callcenter_orders	: {$sum : {
							$cond: [
								{$and: [
									{ $eq: ["$order_source", String(Constants.SOURCE_CALL_CENTER)] },
								]},
								1,
								0
							]}
						},
						talabat_orders	: {$sum : {
							$cond: [
								{$and: [
									{ $eq: ["$order_source", String(Constants.SOURCE_TALABAT)] },
								]},
								1,
								0
							]}
						},
						delivero_orders	: {$sum : {
							$cond: [
								{$and: [
									{ $eq: ["$order_source", String(Constants.SOURCE_DELIVRO)] },
								]},
								1,
								0
							]}
						},
						web_orders	: {$sum : {
							$cond: [
								{$and: [
									{ $eq: ["$order_source", String(Constants.SOURCE_WEB)] },
								]},
								1,
								0
							]}
						},
						total: { $sum: 1 },
					}},
					{$sort 	: sortConditions},
				]).toArray().then(findResult=>{

					/** Define excel heading label **/
					let commonColls	= [
						res.__("admin.report.agent_name"),
						res.__("admin.report.item_name"),
						res.__("admin.report.callcenter_orders"),
						res.__("admin.report.talabat_orders"),
						res.__("admin.report.delivero_orders"),
						res.__("admin.report.web_orders"),
						res.__("admin.report.total"),
						res.__("admin.report.date_time")
					];
					
					let temp = [];
					if(findResult && findResult.length > 0){
						findResult.map(records=>{
							let buffer =	[
								agentName,
								(records.item_name) 	    ?  records.item_name[Constants.DEFAULT_LANGUAGE_CODE]  :"",
								(records.callcenter_orders) ? records.callcenter_orders        :0,
								(records.talabat_orders)    ? records.talabat_orders        :0,
								(records.delivero_orders)   ? records.delivero_orders        :0,
								(records.web_orders)        ? records.web_orders        :0,
								(records.total)             ? records.total : 0,
								(fromDate && toDate) ? '' + newDate(fromDate, Constants.AM_PM_FORMAT_WITH_DATE) + ' - ' + newDate(toDate, Constants.AM_PM_FORMAT_WITH_DATE) : '',
							];
							temp.push(buffer);
						});
					}
					/**  Function to export data in excel format **/
					exportToExcel(req,res,{
						file_prefix 		: "AgentPerformanceReport2",
						heading_columns		: commonColls,
						export_data			: temp
					});
				}).catch(next);
			});
		} catch (error) {
			return next(error);
		}
    };// end agentPerformance2ExportData()
}
