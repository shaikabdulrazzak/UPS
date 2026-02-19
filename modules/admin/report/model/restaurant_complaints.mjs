import { ObjectId } from 'mongodb';
import { parallel as asyncParallel} from 'async';
import * as Constants from '../../../../config/global_constant.mjs';
import Tables from '../../../../config/database_tables.mjs';
import BREADCRUMBS from '../../../../breadcrumbs.mjs';
import { isPost, getDropdownList,arrayToObject, newDate, exportToExcel, configDatatable } from '../../../../utils/index.mjs';

// Model for restaurant complaints report
export default class RestaurantComplaintsReport {
	constructor(db) {
		this.db = db;
		
		/** Use in export data **/
		this.exportNumber					= 0;
		this.exportFilterConditions 		= {};
		this.exportSortConditions			= {};
		this.exportCommonConditions			= {};
		this.exportSortConditions[this.exportNumber]= {_id : Constants.SORT_DESC};
	}

	/**
	 * Function to get list
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 *
	 * @return render/json
	 */
    async getRestaurantComplaintReportList(req,res,next){
		try{
			if(isPost(req)){
				let limit			= (req.body.length) ? parseInt(req.body.length) :Constants.ADMIN_LISTING_LIMIT;
				let skip		 	= (req.body.start)  		? parseInt(req.body.start)  :Constants.DEFAULT_SKIP;
				let fromDate     	= (req.body.from_date) 	    ? req.body.from_date 		: "";
				let toDate 	  	 	= (req.body.to_date)   	    ? req.body.to_date   		: "";
				let orderId    		= (req.body.order_id)  		? req.body.order_id   		: "";
				let restaurantIds	= (req.body.restaurant_ids) ? req.body.restaurant_ids   : [];
				let branchIds		= (req.body.branch_ids)   	? (req.body.branch_ids)   	: [];
				let exportCount	  	= (req.body.export_count) 	  ? req.body.export_count     : 0;
			
				restaurantIds = (restaurantIds && restaurantIds.constructor === Array) ? restaurantIds : [restaurantIds];
				branchIds	= (branchIds && branchIds.constructor === Array) ? branchIds : [branchIds];

				const customer_restaurant_complaints = this.db.collection(Tables.CUSTOMER_RESTAURANT_COMPLAINTS);
			
				/** Configure Datatable conditions*/
				let dataTableConfig = await configDatatable(req,res,null);

				let commonConditions = {gfc_push_status: true};

				/** Condition for date */
				if (fromDate != "" && toDate != "") {
					dataTableConfig.conditions["created"] = {
						$gte: newDate(fromDate),
						$lte: newDate(toDate),
					};
				}

				dataTableConfig.conditions = Object.assign(dataTableConfig.conditions, commonConditions);
				
				if (restaurantIds.length > 0) dataTableConfig.conditions.restaurant_id = { $in: arrayToObject(restaurantIds) };
				if(branchIds.length > 0) dataTableConfig.conditions.branch_id	= {$in : arrayToObject(branchIds)};
				if (orderId) dataTableConfig.conditions.unique_order_id = { $regex: orderId };
				
				/** Set conditions for export order detail report **/
				this.exportCommonConditions				= commonConditions;
				this.exportFilterConditions[exportCount] = dataTableConfig.conditions;
				this.exportSortConditions[exportCount]	= dataTableConfig.sort_conditions;
			
				asyncParallel({
					records :(callback)=>{
						/** Get list of all orders of guest and customer **/
						customer_restaurant_complaints.aggregate([
							{ $match: dataTableConfig.conditions },
							{ $project : {
								order_id: 1, restaurant_id: 1, unique_order_id: 1, created: 1, customer_id: 1, agent_id:1, branch_id:1,gfc_push_status:1
							}},
							{ $sort : dataTableConfig.sort_conditions },
							{$skip 	: skip},
							{$limit : limit},
							{$lookup: {
								"from"          : Tables.RESTAURANTS,
								"localField"    : "restaurant_id",
								"foreignField"  : "_id",
								"as"            : "restaurant_details"
							}},
							{$lookup: {
								"from"          : Tables.RESTAURANT_BRANCHES,
								"localField"    : "branch_id",
								"foreignField"  : "_id",
								"as"            : "branch_details"
							}},
							{$lookup:	{
								"from" 			: 	Tables.USERS,
								"localField" 	:	"agent_id",
								"foreignField" 	: 	"_id",
								"as" 			: 	"agent_details"
							}},
							{$lookup:	{
								"from" 			: 	Tables.USERS,
								"localField" 	:	"customer_id",
								"foreignField" 	: 	"_id",
								"as" 			: 	"customer_details"
							}},
							{ $addFields : {
								agent_name: { $arrayElemAt: ["$agent_details.full_name", 0] }, restaurant_name: { $arrayElemAt: ["$restaurant_details.name", 0] },branch_name: { $arrayElemAt: ["$branch_details.name", 0] },customer_name: { $arrayElemAt: ["$customer_details.full_name", 0] },customer_mobile: { $arrayElemAt: ["$customer_details.mobile_number", 0] },
							}},
						]).toArray().then(result=>{ 
							callback(null,result);
						}).catch(next);
					},
					filter_records:(callback)=>{
						customer_restaurant_complaints.countDocuments(dataTableConfig.conditions).then(countResult=>{
							callback(null, countResult);
						}).catch(next);
					}
				},(err, response)=>{
					/** Send response **/
					res.send({
						status			: (!err) ? Constants.STATUS_SUCCESS : Constants.STATUS_ERROR,
						draw			: dataTableConfig.result_draw,
						data			: response.records,
						recordsFiltered	: response.filter_records,
						recordsTotal	: response.filter_records,
					});
				});
			}else{
				this.exportNumber++;
				
				/** Set dropdown options **/
				let options = {
					collections: [
						{
							collection: Tables.RESTAURANTS,
							columns: ["_id", ["name", Constants.DEFAULT_LANGUAGE_CODE]],
							conditions: {
								is_deleted: Constants.NOT_DELETED
							},
						}
					]
				};

				/**Get dropdown list **/
				let response = await getDropdownList(req, res, next, options);
				
				/** render listing page **/
				req.breadcrumbs(BREADCRUMBS['admin/report/restaurant_complaints']);
				res.render('restaurant_complaints',{
					restaurant_list: response?.final_html_data?.["0"] || "",
					export_count   : this.exportNumber,
				});
			}
		}catch(error){
			return next(error);
		}
    };//End getRestaurantComplaintReportList()

	/**
	 *  Function for export
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 * @param next 	As 	Callback argument to the middleware function
	 *
	 * @return null
    */
    async restaurantComplaintReportExport(req,res,next){
		try{
			let exportType	= (req.params.export_type) 	? 	req.params.export_type	:"";
			let exportCount = (req.params.export_count) ? 	req.params.export_count	:0;
			
			/** conditions **/
			let filterCondition = (this.exportFilterConditions[exportCount]) ? this.exportFilterConditions[exportCount] 	: {};
			let sortConditions	= (this.exportSortConditions[exportCount]) 	? this.exportSortConditions[exportCount] 	: this.exportSortConditions[0];
			let conditions	= (exportType == Constants.EXPORT_FILTERED) ? filterCondition : this.exportCommonConditions;
			
			const customer_restaurant_complaints = this.db.collection(Tables.CUSTOMER_RESTAURANT_COMPLAINTS);
			customer_restaurant_complaints.aggregate([
				{ $match: conditions },
				{ $lookup: {
					"from": Tables.RESTAURANTS,
					"localField": "restaurant_id",
					"foreignField": "_id",
					"as": "restaurant_details"
				}},
				{ $lookup: {
					"from"          : Tables.RESTAURANT_BRANCHES,
					"localField"    : "branch_id",
					"foreignField"  : "_id",
					"as"            : "branch_details"
				}},
				{ $lookup: {
					"from": Tables.USERS,
					"localField": "agent_id",
					"foreignField": "_id",
					"as": "agent_details"
				}},
				{$lookup:	{
					"from" 			: 	Tables.USERS,
					"localField" 	:	"customer_id",
					"foreignField" 	: 	"_id",
					"as" 			: 	"customer_details"
				}},
				{ $project: {
					order_id: 1, restaurant_id: 1, unique_order_id: 1, created: 1, customer_id: 1, agent_id: 1,agent_name: { $arrayElemAt: ["$agent_details.full_name", 0] }, restaurant_name: { $arrayElemAt: ["$restaurant_details.name", 0] },branch_name: { $arrayElemAt: ["$branch_details.name", 0] }, customer_name: { $arrayElemAt: ["$customer_details.full_name", 0] },customer_mobile: { $arrayElemAt: ["$customer_details.mobile_number", 0] }, message_list: 1, voc_type: 1
				}},
				{ $sort : sortConditions },
			]).toArray().then(findResult=>{ 
				
				let temp		= [];
				let commonColls	= [];
				/** Define excel heading label **/
				commonColls	= [
					res.__("admin.report.order_id"),
					res.__("admin.report.restaurant_name"),
					res.__("admin.report.branch_name"),
					res.__("admin.report.customer_name"),
					res.__("admin.report.customer_mobile"),
					res.__("admin.report.agent_name"),
					res.__("admin.report.voc_type"),
					res.__("admin.report.answer1"),
					res.__("admin.report.answers"),
					res.__("admin.system.created"),
				];

				if(findResult && findResult.length > 0){
					findResult.map(records=>{
						let answers		=	[];
						let firstAnswer	=	"";
						if(records.message_list && records.message_list.length > 0){
							records.message_list.map(list=>{ 
								if(list.answer){
									if(!firstAnswer){
										firstAnswer = list.answer;	
									}else{
										answers.push(list.answer);									
									}
								}							
							});
						}
						
						let buffer =	[
							(records.unique_order_id) ? records.unique_order_id : "",
							(records.restaurant_name) ? records.restaurant_name[Constants.DEFAULT_LANGUAGE_CODE] :"",
							(records.branch_name) 	  ? records.branch_name[Constants.DEFAULT_LANGUAGE_CODE] :"",
							(records.customer_name)   ? records.customer_name   : '',
							(records.customer_mobile) ? records.customer_mobile : "",
							(records.agent_name)      ? records.agent_name      : "",
							(records.voc_type)        ? Constants.VOC_TYPE_FOR_CLIENT[records.voc_type]      : "",
							firstAnswer,
							(answers.length > 0) 	  ? answers.join(" - ") : "",
							(records.created)         ? newDate(records.created, Constants.AM_PM_FORMAT_WITH_DATE) : "",
						];
						temp.push(buffer);
					});
				}

				/**  Function to export data in excel format **/
				exportToExcel(req,res,{
					file_prefix         : "RestaurantComplaintReport ",
					heading_columns		: commonColls,
					export_data			: temp
				});
			}).catch(next);
		}catch(error){
			return next(error);
		}
    };// end restaurantComplaintReportExport()

    /**
    * Function to view Messages
    *
    * @param req 	As Request Data
    * @param res 	As Response Data
    * @param next 	As Callback argument to the middleware function
    *
    * @return render/json
    */
    async viewMessages(req, res, next){
        try{
			let complaintId = new ObjectId(req.params.id);
			
			/** Get message details */                    
			const customer_restaurant_complaints = this.db.collection(Tables.CUSTOMER_RESTAURANT_COMPLAINTS);
			customer_restaurant_complaints.findOne({ _id: complaintId }, { projection: { _id: 1, message_list: 1 } }).then(result=>{                

				/** Render view Messages page */
				res.render("view_messages", {
					layout: false,    
					message_list: (result?.message_list) ? result.message_list : [],
				});
            }).catch(next);
        }catch(error){
            return next(error);
        }
    };//End viewMessages()
}
