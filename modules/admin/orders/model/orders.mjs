import {hash as bcrypt} from "bcrypt";
import axios from 'axios';
import https from 'https';
import soap from 'soap';
import { ObjectId } from 'mongodb';
import clone from 'clone';
import {parallel as asyncParallel} from 'async';

import * as Constants from "../../../../config/global_constant.mjs";
import Tables from '../../../../config/database_tables.mjs';
import * as Helper from "../../../../utils/index.mjs";
import BREADCRUMBS from '../../../../breadcrumbs.mjs';
import { saveSystemLogs, savePaymentGatewayLogs, sendMailToUsers, sendMail} from "../../../../services/index.mjs";
import { addEditAddressValidation } from '../../../frontend/api/validations/addressValidations.mjs';

import cartModal from '../../../frontend/api/model/user_carts.mjs';
import customerAddressModal from '../../../frontend/api/model/customer_address.mjs';
import placeOrderModal from '../../place_order/model/place_order.mjs';
import aghzeyaModal from '../../../frontend/aghzeya/model/aghzeya.mjs';

export default class AdminOrders {
    constructor(db) {
        this.db = db;
        this.orderCollection 		= 	db.collection(Tables.ORDERS);
        this.orderDetailsCollection = 	db.collection(Tables.ORDER_DETAILS);
        this.orderItemCollection 	= 	db.collection(Tables.ORDER_ITEMS);
        this.orderModifyCollection 	=	db.collection(Tables.ORDER_MODIFY_LOGS);

		this.cartAPI   			=   new cartModal(db);
        this.placeOrderModule  	=   new placeOrderModal(db);
        this.customerAddressAPI =   new customerAddressModal(db);
		this.aghzeyaModule  	=   new aghzeyaModal(db);

		 // Use in export data
        this.exportNumber = 0;
        this.exportFilterConditions = {};
        this.exportSortConditions = {};
        this.exportCommonConditions = {};
        this.exportSortConditions[this.exportNumber] = { _id: Constants.SORT_DESC };
    }

	/**
	 * Function to get orders list
	 *
	 * @param req As Request Data
	 * @param res As Response Data
	 *
	 * @return render/json
	 */
	async getOrdersList (req, res,next){
		let status		= (req.query.status)	 ? req.query.status     : '';
		let cuisineId	= (req.query.cuisine_id) ? req.query.cuisine_id : '';
		let orderType	= (req.query.order_type) ? req.query.order_type : '';
		let offerId		= (req.query.offer_id)	 ? req.query.offer_id   : '';
		let deliveryType= (req.query.delivery_type)  ? req.query.delivery_type : "";
		
		let isTeamHead	=   (req.session.user.team_head) ? req.session.user.team_head :false;
		let authRoleId	=	(req.session.user.user_role_id)? req.session.user.user_role_id :"";

		let businessRule 		= 	null;
		let businessConditions 	=	null;
		if(authRoleId == Constants.CALL_CENTER_TEAM && !isTeamHead){
			let taskAssignments = await Helper.getConditionsBasedOnCallCenterRole(req,res,next);
			businessRule 		= taskAssignments?.rules || {};
			businessConditions 	= taskAssignments?.conditions || [];
		}

		if(Helper.isPost(req)){
			let limit			= (req.body.length) ? parseInt(req.body.length)	: Constants.ADMIN_LISTING_LIMIT;
			let skip			= (req.body.start)	? parseInt(req.body.start)	: Constants.DEFAULT_SKIP;
			let status			= (req.body.status)   ? req.body.status 	: '';
			let fromDate  		= (req.body.fromDate) ? req.body.fromDate 	: "";
			let toDate 	  		= (req.body.toDate)   ? req.body.toDate     : "";
			let mobileNumber	= (req.body.mobile_number)   ? req.body.mobile_number     : "";
			let restaurantIds 	= (req.body.restaurant_ids)  ? req.body.restaurant_ids    : "";
			deliveryType 		= (req.body.delivery_type)   ? req.body.delivery_type     : "";
			let isOrderAssigned = (req.body.is_order_assigned)? req.body.is_order_assigned: "";
			let exportCount	  	= (req.body.export_count) 	  ? req.body.export_count     : 0;
			let captainId 		= (req.body.captain_id)		  ? req.body.captain_id		  : "";
			let orderSource 	= (req.body.sources) ? req.body.sources : "";
			
			/** Configure Datatable conditions*/
			const dataTableConfig = await Helper.configDatatable(req, res, null);

			asyncParallel({
				offer_orders:(callback)=>{
					if(!offerId) return callback(null,[]);

					/** Get order ids where offer used */
					this.orderDetailsCollection.distinct("order_id",{offer_id : new ObjectId(offerId)}).then(orderIds=>{
						callback(null,orderIds);
					}).catch(next);
				},
				cuisine_orders:(callback)=>{
					if(!cuisineId) return callback(null,[]);

					/** Get order ids where offer used */
					this.orderItemCollection.distinct("order_id",{cuisine_ids : {$in : [new ObjectId(cuisineId)]}}).then(orderIds=>{
						callback(null,orderIds);
					}).catch(next);
				},
			},async (asyncErr, asyncResponse)=>{
				if(asyncErr) return next(asyncErr);

				let commonConditions = {};
				if(authRoleId == Constants.CALL_CENTER_TEAM && !isTeamHead){
					if(businessConditions?.length){
                        businessConditions.push({delivery_type : Constants.DELIVERY_BY_PICK_UP});
                        commonConditions["$or"] = businessConditions;
                    }else{
                        /** Send response **/
                        return res.send({
                            status			: Constants.STATUS_SUCCESS,
                            draw			: dataTableConfig.result_draw,
                            data			: [],
                            recordsFiltered	: 0,
                            recordsTotal	: 0,
                        });
                    }
				}

				if(status){
					if(status.constructor !== Array)  status = [status];
					let statusConditions = [];
					status.map(statusKey=>{
						if(statusKey == Constants.ORDER_REJECTED){
							statusConditions.push({
								admin_status : {$in : [Constants.ORDER_REJECTED, Constants.ORDER_REJECTED_BY_ADMIN]}
							});
						}else{
							statusConditions.push({admin_status : statusKey });
						}

						dataTableConfig.conditions['$and'] = [{$or: statusConditions}];

						if(statusKey == Constants.ORDER_PENDING && req.query && req.query.is_confirm && typeof req.query.is_confirm !== typeof undefined){
							dataTableConfig.conditions['is_confirm']= JSON.parse(req.query.is_confirm);
						}
					});
				}

				if(orderType){
					let tmpConditions = Helper.getTaskAssignmentConditions({[orderType]:orderType});
					if(tmpConditions?.length){
						if(!commonConditions["$and"]) commonConditions["$and"] = [];
						commonConditions["$and"].push(...tmpConditions);
					}
				}

				/** Conditions for order date */
				let dateConditions = {};
				if (fromDate != "" && toDate != "") {
					dateConditions["order_date"] = {
						$gte 	: Helper.newDate(fromDate),
						$lte 	: Helper.newDate(toDate),
					};
				}

				/** Conditions for delivery by */
				if(deliveryType){
					if(deliveryType.constructor !== Array)  deliveryType = [deliveryType];

					let deliveryByConditions = [];
					deliveryType.map(key=>{
						deliveryByConditions.push({delivery_type : key });
					});
					if( !dataTableConfig.conditions['$and']) dataTableConfig.conditions['$and'] = [];

					dataTableConfig.conditions['$and'].push({$or: deliveryByConditions});
				}

				/** Conditions for restaurant */
				if(restaurantIds){
					if(restaurantIds.constructor !== Array)	restaurantIds = [restaurantIds];
					restaurantIds = Helper.arrayToObject(restaurantIds);

					if(!dataTableConfig.conditions['$and']) dataTableConfig.conditions['$and'] =[];
					dataTableConfig.conditions['$and'].push({restaurant_id: {$in: restaurantIds}});
				}

				/** Conditions for order assigned or not */
				if(isOrderAssigned){
					if(!dataTableConfig.conditions['$and']) dataTableConfig.conditions['$and'] =[];

					if(isOrderAssigned == Constants.ORDER_ASSIGNED){
						dataTableConfig.conditions['$and'].push({$or: [
							{captain_name	: {$exists: true, $ne: ""}}, // when restaurant delivered
							{captain_id		: {$nin: ["",null]}},// when cravez delivered
						]});
					}else{
						dataTableConfig.conditions['$and'].push(
							{is_completed: {$ne: true }},
							{admin_status: {$nin: [Constants.ORDER_PAYMENT_PENDING, Constants.ORDER_PAYMENT_FAILED] }},
							{$or:[
								{delivery_type:	Constants.DELIVERY_BY_CRAVEZ, captain_id:	""},
								{delivery_type:	Constants.DELIVERY_BY_RESTAURANT, captain_name: {$exists: false} },
							]}
						);
					}
				}

				/** Conditions for redeem offer */
				if(offerId) commonConditions['_id']  = {$in : Helper.arrayToObject(asyncResponse.offer_orders)};
				if(cuisineId) commonConditions['_id']  = {$in : Helper.arrayToObject(asyncResponse.cuisine_orders)};
				
				/** Conditions for captain id */
				if(captainId){
					if(!dataTableConfig.conditions['$and']) dataTableConfig.conditions['$and'] =[];
					dataTableConfig.conditions['$and'].push({
						captain_id : 	new ObjectId(captainId)
					});
				}

				if(mobileNumber){
					if(!dataTableConfig.conditions['$and']) dataTableConfig.conditions['$and'] =[];

					try{
						mobileNumber = Helper.cleanRegex(mobileNumber);
						dataTableConfig.conditions['$and'].push({$or: [
							{ 'mobile_number' 	:	new RegExp(mobileNumber, "i") },
							{ 'cust_tele2'		: 	new RegExp(mobileNumber, "i") }
						]});
					}catch(e){
						dataTableConfig.conditions['$and'].push({$or: [
							{ 'mobile_number':	mobileNumber },
							{ 'cust_tele2'	 : 	mobileNumber }
						]});
					}
				}

				/** More conditions */
				let extraConditions = {};
				if (orderSource){
					if(orderSource.constructor !== Array)  orderSource = [orderSource];
					extraConditions["source"] = { $in: orderSource };
				}

				dataTableConfig.conditions = Object.assign(dateConditions,dataTableConfig.conditions,commonConditions,extraConditions);

				/** Set conditions for export order detail report **/
				this.exportCommonConditions				 = commonConditions;
				this.exportFilterConditions[exportCount] = dataTableConfig.conditions;
				this.exportSortConditions[exportCount]	 = dataTableConfig.sort_conditions;

				/** Default sorting **/
				if(dataTableConfig.sort_conditions && typeof dataTableConfig.sort_conditions["_id"] !== typeof undefined){
					dataTableConfig.sort_conditions = {order_date:Constants.SORT_DESC};
				}

				// Get list or count of area blocks 
                let dbRes = await this.orderCollection.aggregate([
                    { $match: dataTableConfig.conditions },
                    {$facet : {
                        list : [
                            {$match : dataTableConfig.conditions},
							{$sort  : dataTableConfig.sort_conditions},
							{$skip 	: skip},
							{$limit : limit},
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
								_id:1,customer_id:1,is_confirm:1,number_of_queue:1,queue_time:1,invoice_number:1,unique_order_id:1,order_date:1,last_status_updated_on:1,restaurant_name:1,order_price:1,infinity_service:1,admin_status:1,modified:1,net_amount:1, is_first_order: 1, is_duplicate_order:1,is_completed:1,is_modified:1,order_status:1,package_id:1,first_name: 1,last_name: 1,aghzeya_bill_no:1, order_revert_by: 1, auto_closed: 1,branch_id:1,restaurant_id:1,queue_sort: { $cond: [{$eq : ["$queue_time",""]},1,0]},refund_amount_status:1,is_big_order:1,is_delayed_acceptance:1,is_delayed_preperation:1,is_delayed_pickup_by_captain:1,is_delayed_picked_up_by_customer:1,is_delayed_pickup:1,delivery_type:1,is_vip:1,is_delayed_delivery:1,notes:1,payment_method:1,rejection_reason:1,cancelled_user_role_id:1,request_note:1,partners:1,is_delayed:1,delivery_status:1,cancel_reason_id:1, captain_name: 1,captain_id:1,assignment_type:1,amount_debited_by_wallet:1,source : 1,source_payment:1,source_payment_name:1,aghzeya:1,is_order_printed:1,mobile_number: 1,cust_tele2:1, customer_latitude: {$arrayElemAt: ["$order_details.customer_latitude",0]}, customer_longitude: {$arrayElemAt: ["$order_details.customer_longitude",0]}, restaurant_address: {$arrayElemAt: ["$order_details.restaurant_address",0]},delivery_area_id: {$arrayElemAt: ["$order_details.delivery_area_id",0]}, customer_address_id: {$arrayElemAt: ["$order_details.customer_address_id",0]},offer_id: {$arrayElemAt: ["$order_details.offer_id",0]}, customer_address_detail: {$arrayElemAt: ["$order_details.customer_address_detail",0]}, discount_price: {$arrayElemAt: ["$order_details.discount_price",0]}, delivery_duration: {$arrayElemAt: ["$order_details.delivery_duration",0]},remaining_delivery_duration: {$arrayElemAt: ["$order_details.remaining_delivery_duration",0]}, order_transfer_id: {$arrayElemAt: ["$order_details.order_transfer_id",0]},is_schedule:1,scheduled_to_submit_time:1,gfc_push_retry:1,gfc_modified_push_retry:1,gfc_cancel_retry:1,branch_restaurant_name:{$arrayElemAt: ["$branch_details.name."+Constants.DEFAULT_LANGUAGE_CODE,0]},cancelled_by:1,order_source: 1,simphony:1,dhub_push_retry:1,dhub_cancel_retry:1,dhub_order_id:1,dhub_order_cancel_time:1
							}},
                        ],
                        count: [
                            {$count: "count"},
                        ],
                    }}
                ],{allowDiskUse: true}).toArray();

				let result = dbRes?.[0]?.list ||[];
				let uniqueOrderIds = [];
				let deliveryAreaIds = [];
				let cancelledByIds	= [];
				result.map(record=>{
					if(record.unique_order_id) 	uniqueOrderIds.push(record.unique_order_id);
					if(record.delivery_area_id) deliveryAreaIds.push(record.delivery_area_id);
					if(record.cancelled_by) 	cancelledByIds.push(record.cancelled_by);
				});

				asyncParallel({
					modify_order_details : (childCallback)=>{
						/** Get modify order price **/
						this.orderModifyCollection.aggregate([
							{$match	: {unique_order_id : {$in : uniqueOrderIds}}},
							{$sort : {created: Constants.SORT_ASC}},
							{$group	: {
								_id  :{
									unique_order_id   : "$unique_order_id"
								},
								unique_order_id    : {$first : "$unique_order_id"},
								modify_order_price : {$first : "$order_price"},
							}},
						]).toArray().then(findResult=>{
							childCallback(null,findResult);
						}).catch(next);
					},
					delivery_area_details : (childCallback)=>{
						/** Get delivery area name **/
						const areas = this.db.collection(Tables.AREAS);
						areas.find({_id : {$in : deliveryAreaIds}},{projection : {_id: 1,name:1}}).toArray().then(deliveryAreaResult=>{
							let deliveryAreaList = {};
							deliveryAreaResult.map(records=>{
								deliveryAreaList[records._id] = records.name[Constants.DEFAULT_LANGUAGE_CODE];
							});
							childCallback(null,deliveryAreaList);
						}).catch(next);
					},
					cancelled_by_list : (childCallback)=>{
						if(cancelledByIds.length ==0) return childCallback(null, {});

						/** Get cancelled by  name **/
						const users = this.db.collection(Tables.USERS);
						users.find({_id : {$in : cancelledByIds}},{projection : {_id: 1,full_name:1}}).toArray().then(userResult=>{
							let tmpUserList = {};
							userResult.map(records=>{
								tmpUserList[records._id] = (records.full_name) ? records.full_name :"";
							});
							childCallback(null,tmpUserList);
						}).catch(next);
					},
				},(childErr, childResponse)=>{
					if(childErr) return next(childErr);

					let modifyOrderResult	= 	(childResponse.modify_order_details)	? 	childResponse.modify_order_details 	:[];
					let deliveryAreaResult 	=	(childResponse.delivery_area_details) 	?	childResponse.delivery_area_details :{};
					let cancelledByList 	=	(childResponse.cancelled_by_list) 		?	childResponse.cancelled_by_list 	:{};
					result.map(record=>{
						/** Insert delivery area in records **/
						record.delivery_area = deliveryAreaResult?.[record.delivery_area_id] ||"";

						if(record.cancelled_by) record.cancelled_by_name = cancelledByList?.[record.cancelled_by] ||"";

						/** Insert modify order price in records **/
						modifyOrderResult.map(orderRecords=>{
							if(record.unique_order_id == orderRecords.unique_order_id){
								record.modify_order_price = orderRecords.modify_order_price
							}
						});

						/** Insert time passed in records **/
						let currentDate 	=	Helper.newDate();
						let timePassed  	= 	Helper.getDifferenceBetweenTwoDatesInMinute(record.order_date,currentDate);
						record.time_passed 	= 	(timePassed >0) ? parseInt(timePassed) :0;
					});

					/** Send response **/
					res.send({
						status			: 	Constants.STATUS_SUCCESS,
						draw			: 	dataTableConfig.result_draw,
						data			:   result,
						recordsTotal	:	dbRes?.[0]?.count?.[0]?.count || 0,
						recordsFiltered	:  	dbRes?.[0]?.count?.[0]?.count || 0,
					}); 					
				});
			});
		}else{
			this.exportNumber++;

			/**Set driver conditions */
			let driverConditions	= clone(Constants.DRIVER_COMMON_CONDITIONS);
			let selectRestaurant	= req?.query?.restaurant_id || "";
			let selectBranch		= req?.query?.branch_id || "";
			let fromDate			= req?.query?.from_date || "";
			let toDate				= req?.query?.to_date || "";
			let uniqueOrderId		= req?.query?.unique_order_id || "";

			asyncParallel({
				dropdown_list : (callback)=>{
					/**Get dropdown list **/
					Helper.getDropdownList(req,res, next,{
						collections :[
							{
								collection : Tables.RESTAURANTS,
								columns    : ["_id",["name",Constants.DEFAULT_LANGUAGE_CODE]],
								selected   : selectRestaurant ? [selectRestaurant] : [],
								conditions : {status : Constants.ACTIVE ,is_deleted : Constants.NOT_DELETED},
							},
							{
								collection : Tables.CANCEL_REASONS,
								columns    : ["_id",["title",Constants.DEFAULT_LANGUAGE_CODE]],
								conditions : { status : Constants.ACTIVE},
							},
							{
								collection 	: Tables.USERS,
								columns    	: ["_id","full_name"],
								conditions 	: driverConditions,
								sort_conditions : {is_available : Constants.SORT_DESC,full_name: Constants.SORT_ASC}
							}
						],
					}).then(dropDownResponse=> {
						if(dropDownResponse.status != Constants.STATUS_SUCCESS) return callback(dropDownResponse);
						callback(null,dropDownResponse?.final_html_data || []);
					});
				},
				orders_detail : (callback)=>{
					/** Get total orders **/
					callback(null,{});
				},
				source_list : (callback)=>{
					/** Get source list restaurant wise */
					const aghzeya_restaurant_sources = this.db.collection(Tables.AGHZEYA_RESTAURANT_SOURCES);
					aghzeya_restaurant_sources.aggregate([
						{$group	: {
							_id  :"$aghzeya_source_id",
							name : {$first : "$name"},
						}},
						{$project : {
							id 		: 	"$aghzeya_source_id",
							name 	: 	"$name."+Constants.DEFAULT_LANGUAGE_CODE,
						}}
					]).toArray().then(sourceResult=>{
						callback(null, sourceResult);
					}).catch(next);
				}
			},(asyncErr, asyncResponse)=>{
				if(asyncErr) return next(asyncErr);

				/** render listing page **/
				req.breadcrumbs(BREADCRUMBS['admin/orders/list']);
				res.render('list',{
					status			: status,
					order_type		: orderType,
					is_confirm		: (req.query.is_confirm) ? req.query.is_confirm : '',
					first_orders 			: asyncResponse.orders_detail.first_orders 	? asyncResponse.orders_detail.first_orders 			: 0,
					duplicate_orders		: asyncResponse.orders_detail.duplicate_orders ? asyncResponse.orders_detail.duplicate_orders 		: 0,
					big_orders 				: asyncResponse.orders_detail.big_orders ? asyncResponse.orders_detail.big_orders 		: 0,
					order_rejected 			: asyncResponse.orders_detail.order_rejected 	? asyncResponse.orders_detail.order_rejected  : 0,
					delayed_acceptance 		: asyncResponse.orders_detail.delayed_acceptance 	? asyncResponse.orders_detail.delayed_acceptance  : 0,
					delayed_preparation 	: asyncResponse.orders_detail.delayed_preparation ? asyncResponse.orders_detail.delayed_preparation : 0,
					delayed_pickup_by_captain 	: asyncResponse.orders_detail.delayed_pickup_by_captain ? asyncResponse.orders_detail.delayed_pickup_by_captain : 0,
					delayed_pickup_by_customer 	: asyncResponse.orders_detail.delayed_pickup_by_customer ? asyncResponse.orders_detail.delayed_pickup_by_customer : 0,
					delayed_pickup_by_restaurant: asyncResponse.orders_detail.delayed_pickup_by_restaurant ? asyncResponse.orders_detail.delayed_pickup_by_restaurant : 0,
					vip_orders 			: asyncResponse.orders_detail.vip_orders ? asyncResponse.orders_detail.vip_orders : 0,
					delayed_delivery 	: asyncResponse.orders_detail.delayed_delivery ? asyncResponse.orders_detail.delayed_delivery : 0,
					delivery_cravez 	: asyncResponse.orders_detail.delivery_cravez ? asyncResponse.orders_detail.delivery_cravez : 0,
					delivery_restaurant : asyncResponse.orders_detail.delivery_restaurant ? asyncResponse.orders_detail.delivery_restaurant : 0,
					restaurant_list 	: asyncResponse?.dropdown_list?.[0] || "",
					cancel_reason_list  : asyncResponse?.dropdown_list?.[1] || "",
					driver_list 		: asyncResponse?.dropdown_list?.[2] || "",
					export_count 		: this.exportNumber,
					offer_id            : offerId,
					delivery_type       : deliveryType,
					businessRule  		: businessRule,
					filter_restaurant	: selectRestaurant,
					filter_branch		: selectBranch,
					filter_start_date	: fromDate,
					filter_to_date		: toDate,
					filter_cuisine		: cuisineId,
					unique_order_id		: uniqueOrderId,
					sourceList          : asyncResponse.source_list
				});
			});
		}
	};//End getOrdersList()

	/**
	 * Function to get order count
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 *
	 * @return render/json
	 */
	async getOrderCounts  (req, res, next){
		return new Promise(async resolve=>{
			let isTeamHead		= (req.session.user.team_head) ? req.session.user.team_head :false;
			let authUserRoleId	= req.session.user.user_role_id;
			let fromDate  		= (req.body.from_date) ? req.body.from_date	: "";
			let toDate 	  		= (req.body.to_date)   ? req.body.to_date   : "";		

			/** Set conditions */
			let countConditions = {};

			/** Conditions for order date */
			if (fromDate != "" && toDate != "") {
				countConditions.order_date = { $gte: Helper.newDate(fromDate), $lte: Helper.newDate(toDate) };
			}

			if(authUserRoleId == Constants.CALL_CENTER_TEAM && !isTeamHead){
				let taskAssignments = await Helper.getConditionsBasedOnCallCenterRole(req,res,next);
				if(taskAssignments?.conditions.length){
					countConditions["$or"] = taskAssignments?.conditions;
				}
			}

			this.orderCollection.aggregate([
				{$match : countConditions},
				{$group: {
					_id : null,
					first_orders : {$sum : {
						$cond: [
							{$and: [
								{ $eq : ["$admin_status",Constants.ORDER_PENDING] },
								{ $eq : ["$is_first_order",true] },
							]},
							1, 0
						]}
					},
					duplicate_orders : {$sum : {
						$cond: [
							{$and: [
								{ $eq : ["$admin_status",Constants.ORDER_PENDING] },
								{ $eq : ["$is_duplicate_order",true] },
							]},
							1, 0
						]}
					},
					big_orders : {$sum : {
						$cond: [
							{$and: [
								{ $eq : ["$admin_status",Constants.ORDER_PENDING] },
								{ $eq : ["$is_big_order",true] },
							]},
							1, 0
						]}
					},
					order_rejected : {$sum : {
						$cond: [
							{$or: [
								{ $eq : ["$admin_status",Constants.ORDER_REJECTED ] },
								{ $eq : ["$admin_status",Constants.ORDER_REJECTED_BY_ADMIN] },
							]},
							1, 0
						]}
					},
					delayed_acceptance : {$sum : {
						$cond: [
							{$and: [
								{ $eq : ["$is_delayed_acceptance", true ] },
								{ $not : ["$confirm_status.is_delayed_acceptance" ] },
							]},
							1, 0
						]}
					},
					delayed_preparation : {$sum : {
						$cond: [
							{$and: [
								{ $eq : ["$is_delayed_preperation", true ] },
								{ $not : ["$confirm_status.is_delayed_preperation" ] },
							]},
							1, 0
						]}
					},
					delayed_pickup_by_customer : {$sum : {
						$cond: [
							{$and: [
								{ $eq : ["$is_delayed_picked_up_by_customer", true ] },
								{ $not : ["$confirm_status.is_delayed_picked_up_by_customer" ] },
							]},
							1, 0
						]}
					},
					delayed_pickup_by_captain : {$sum : {
						$cond: [
							{$and: [
								{ $eq : ["$is_delayed_pickup_by_captain", true ] },
								{ $not : ["$confirm_status.is_delayed_pickup_by_captain" ] },
							]},
							1, 0
						]}
					},
					delayed_pickup_by_restaurant : {$sum : {
						$cond: [
							{$and: [
								{ $eq : ["$is_delayed_pickup", true ] },
								{ $eq : ["$delivery_type", Constants.DELIVERY_BY_RESTAURANT ] },
								{ $not : ["$confirm_status.delayed_pickup_by_restaurant" ] },
							]},
							1, 0
						]}
					},
					vip_orders : {$sum : {
						$cond: [
							{$and: [
								{ $eq : ["$is_vip", true ] },
							]},
							1, 0
						]}
					},
					delayed_delivery : {$sum : {
						$cond: [
							{$and: [
								{ $eq : ["$is_delayed_delivery", true ] },
								{ $not : ["$confirm_status.is_delayed_delivery" ] },
							]},
							1, 0
						]}
					},
					delivery_cravez : {$sum : {
						$cond: [
							{$and: [
								{ $eq : ["$delivery_type", Constants.DELIVERY_BY_CRAVEZ ] },
							]},
							1, 0
						]}
					},
					delivery_restaurant : {$sum : {
						$cond: [
							{$and: [
								{ $eq : ["$delivery_type", Constants.DELIVERY_BY_RESTAURANT ] },
							]},
							1, 0
						]}
					},
				}}
			],{allowDiskUse: true}).toArray().then(result=>{
				/** Send response */
				result = result?.[0] || {};
				resolve({
					status						: Constants.STATUS_SUCCESS,
					first_orders 				: result?.first_orders || 0,
					duplicate_orders			: result?.duplicate_orders || 0,
					big_orders 					: result?.big_orders || 0,
					order_rejected 				: result?.order_rejected || 0,
					delayed_acceptance 			: result?.delayed_acceptance || 0,
					delayed_preparation 		: result?.delayed_preparation || 0,
					delayed_pickup_by_captain 	: result?.delayed_pickup_by_captain || 0,
					delayed_pickup_by_customer 	: result?.delayed_pickup_by_customer || 0,
					delayed_pickup_by_restaurant: result?.delayed_pickup_by_restaurant || 0,
					vip_orders 					: result?.vip_orders || 0,
					delayed_delivery 			: result?.delayed_delivery || 0,
					delivery_cravez 			: result?.delivery_cravez || 0,
					delivery_restaurant 		: result?.delivery_restaurant || 0,
				});
			}).catch(next);
		}).catch(next);
	};// end getOrderCounts

	/**
	 * Function for view order detail
	 *
	 * @param req As Request Data
	 * @param res As Response Data
	 *
	 * @return render
	 */
	async viewOrderDetails  (req, res, next){
		let type =	(req.params.type) ? req.params.type : '';

		/** Get order details **/
		req.breadcrumbs(BREADCRUMBS['admin/orders/view']);
		let orderRes = await this.getOrderDetails(req, res, next);
		
		if(orderRes.status != Constants.STATUS_SUCCESS){
			/** Send error response **/
			req.flash(Constants.STATUS_ERROR,orderRes.message);
			return res.redirect(Constants.WEBSITE_ADMIN_URL+"orders");
		}

		/** Render view page*/
		res.render('view',{
			type		 	:  type,
			result 		 	: 	orderRes.result,
			orderDetails 	: 	orderRes.orderDetails,
			modify_details 	: 	orderRes.modify_details,
		});
	};//End viewOrderDetails()

	/**
	 * Function to get order detail
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next 	As Callback argument to the middleware function
	 *
	 * @return json
	 */
	async getOrderDetails  (req, res, next){
		return new Promise(resolve=>{
			let orderId 	  = new ObjectId(req.params.id);
			/** Get order details **/
			asyncParallel({
				result :(callback)=>{
					/** Get detail of Order **/
					this.orderCollection.findOne({_id : new ObjectId(orderId) }).then(orderResult=>{
						if(!orderResult) return callback(null,null);

						let deliveryType=	(orderResult.delivery_type) ? orderResult.delivery_type : '';
						let restaurantId=	(orderResult.restaurant_id) ? orderResult.restaurant_id : '';
						let branchId	=	(orderResult.branch_id) 	? orderResult.branch_id 	: '';
						let userIds 	= 	[];
						if(orderResult.customer_id) userIds.push(orderResult.customer_id);
						if(orderResult.captain_id) userIds.push(orderResult.captain_id);
						if(orderResult.modified_by) userIds.push(orderResult.modified_by);
						if(orderResult.placed_by) userIds.push(orderResult.placed_by);
						orderResult.delivery_detail = (Constants.DELIVERY_BY[deliveryType])? {title: Constants.DELIVERY_BY[deliveryType]} :{};
						
						asyncParallel({
							user_detail : (orderCallback)=>{
								const users = this.db.collection(Tables.USERS);
								users.find({_id : {$in : Helper.arrayToObject(userIds)}},{projection : {_id: 1,full_name: 1,mobile_number:1}}).toArray().then(userResult=>{
									if(userResult.length <= 0) return orderCallback(null,null);

									let userList = {};
									userResult.forEach(user=>{
										userList[user._id] = { 'name' : user.full_name, 'mobile' :  user.mobile_number};
									});
									
									orderCallback(null,userList);								
								}).catch(next);
							},
							restaurant_detail :(orderCallback)=>{
								if(!restaurantId) return orderCallback(null,null);

								const restaurants = this.db.collection(Tables.RESTAURANTS);
								restaurants.findOne({_id : new ObjectId(restaurantId) },{projection: {_id:1,name:1}}).then(restResult=>{
									orderCallback(null, restResult);
								}).catch(next);
							},
							modify_order_details : (orderCallback)=>{
								/** Get modify order price **/
								this.orderModifyCollection.aggregate([
									{$match	: {unique_order_id : orderResult.unique_order_id}},
									{$sort : {created: Constants.SORT_ASC}},
									{$group	: {
										_id  :{
											unique_order_id   : "$unique_order_id"
										},
										unique_order_id    : {$first : "$unique_order_id"},
										modify_order_price : {$first : "$order_price"},
									}},
								]).toArray().then(modifyOrderResult=>{
									orderCallback(null, modifyOrderResult);
								}).catch(next);
							},
							restaurant_branch_detail :(orderCallback)=>{
								if(!restaurantId || !branchId) return orderCallback(null,null);

								/** Get restaurant branch details**/
								const restaurant_branches = this.db.collection(Tables.RESTAURANT_BRANCHES);
								restaurant_branches.findOne({
									_id : new ObjectId(branchId), restaurant_id : new ObjectId(restaurantId)
								},{projection: {
									_id:1,name:1
								}}).then(restaurantBranchResult=>{
									orderCallback(null, restaurantBranchResult);
								}).catch(next);
							},
							restaurant_branch_contact_number_details :(orderCallback)=>{
								if(!restaurantId || !branchId) return orderCallback(null,null);

								/** Get restaurant branch phone number details**/
								const restaurant_branch_phone_numbers = this.db.collection(Tables.RESTAURANT_BRANCH_PHONE_NUMBERS);
								restaurant_branch_phone_numbers.find({
									branch_id : new ObjectId(branchId), restaurant_id : new ObjectId(restaurantId)
								},{projection: {
									_id:1,country_code:1,value:1,attribute_id:1,contact_name:1
								}}).toArray().then(restaurantBranchContactNumberResult=>{
									if(restaurantBranchContactNumberResult.length <= 0) return orderCallback(null,null);

									/** Push attribute id in a array**/
									let attributeIds = [];
									restaurantBranchContactNumberResult.map(records=>{
										if(records.attribute_id) attributeIds.push(records.attribute_id);
									});

									/** Get attribute details**/
									const attributes = this.db.collection(Tables.ATTRIBUTES);
									attributes.find({ attribute_id : {$in : attributeIds}},{projection: {_id:1,attribute_id:1,title:1}}).toArray().then(attributesResult=>{
										if(attributesResult.length <= 0) return orderCallback(null,null);

										/** Insert attribute title in contact number details**/
										restaurantBranchContactNumberResult.map(branchRecords=>{
											attributesResult.map(attributeRecords=>{
												if(attributeRecords.attribute_id == branchRecords.attribute_id){
													branchRecords.attribute_title = attributeRecords.title;
												}
											});
										});
										orderCallback(null, restaurantBranchContactNumberResult);
									}).catch(next);
								}).catch(next);
							}
						},(childOrderErr, childOrderResponse)=>{
							if(childOrderErr) return callback(childOrderErr,{});

							let tmpUserDetails		=	(childOrderResponse.user_detail) ? childOrderResponse.user_detail :{};
							let customerName		=	(tmpUserDetails[orderResult.customer_id]) ? tmpUserDetails[orderResult.customer_id].name : '';
							let customerMobile		=	(tmpUserDetails[orderResult.customer_id]) ? tmpUserDetails[orderResult.customer_id].mobile : '';
							let captainName			=	(tmpUserDetails[orderResult.captain_id])  ? tmpUserDetails[orderResult.captain_id].name : '';
							let modifyOrderDetails 	= 	(childOrderResponse.modify_order_details && childOrderResponse.modify_order_details[0]) ? childOrderResponse.modify_order_details[0] : {};

							if(tmpUserDetails[orderResult.placed_by]){
								orderResult.placed_user_details	=	tmpUserDetails[orderResult.placed_by];
							}

							if(tmpUserDetails[orderResult.modified_by]){
								orderResult.modified_user_details	=	tmpUserDetails[orderResult.modified_by];
							}

							if(orderResult.customer_id) orderResult.customer_name	=	customerName;
							if(orderResult.customer_id) orderResult.customer_mobile	=	customerMobile;
							if(orderResult.captain_id) orderResult.captain_name		=	(captainName) ? captainName : orderResult.captain_name;

							let customerDetail   = (childOrderResponse && childOrderResponse.customer_detail)	?	childOrderResponse.customer_detail :{};
							let restaurantDetail = (childOrderResponse && childOrderResponse.restaurant_detail)	?	childOrderResponse.restaurant_detail :{};
							let restaurantBranchDetail = (childOrderResponse && childOrderResponse.restaurant_branch_detail)	?	childOrderResponse.restaurant_branch_detail :{};
							let restaurantBranchContactNumberDetail = (childOrderResponse && childOrderResponse.restaurant_branch_contact_number_details)	?	childOrderResponse.restaurant_branch_contact_number_details :[];

							orderResult.customer_detail 	= customerDetail;
							orderResult.restaurant_detail 	= restaurantDetail;
							orderResult.modify_order_price  = (modifyOrderDetails && modifyOrderDetails.modify_order_price) ? modifyOrderDetails.modify_order_price : "";
							orderResult.restaurant_branch_detail = restaurantBranchDetail;
							orderResult.restaurant_branch_contact_number_detail = restaurantBranchContactNumberDetail;

							/** Insert time passed in records **/
							let currentDate = Helper.newDate();
							let timePassed  = Helper.getDifferenceBetweenTwoDatesInMinute(orderResult.order_date,currentDate);
							orderResult.time_passed = (timePassed >0) ? parseInt(timePassed) :0;
							
							callback(null,orderResult);
						});
					});
				},
				order_detail :(callback)=>{
					/** Get detail of Orders **/
					this.orderDetailsCollection.findOne({ order_id : new ObjectId(orderId) }).then(detailResult=>{
						if(!detailResult) return callback(null,null);

						asyncParallel({
							branch_transfer :(childCallback)=>{
								if(!detailResult.branch_transfer_id) return childCallback(null,null);

								const restaurant_branches = this.db.collection(Tables.RESTAURANT_BRANCHES);
								restaurant_branches.findOne({
									_id : new ObjectId(detailResult.branch_transfer_id)
								},{projection:{
									name:1
								}}).then(transferResult=>{
									childCallback(null, transferResult);
								}).catch(next);
							},
							order_transfer :(childCallback)=>{
								if(!detailResult.order_transfer_id) return childCallback(null,null);

								const restaurant_branches = this.db.collection(Tables.RESTAURANT_BRANCHES);
								restaurant_branches.findOne({
									_id : new ObjectId(detailResult.order_transfer_id)
								},{projection:{
									name:1
								}}).then(transferResult=>{
									childCallback(null, transferResult);
								}).catch(next);
							},
							payment_type :(childCallback)=>{
								let paymentSlug	=	(detailResult.payment_method) ? detailResult.payment_method : '';
								const payment_methods = this.db.collection(Tables.PAYMENT_METHODS);
								payment_methods.findOne({
									slug : paymentSlug
								},{projection: {
									_id:1,title:1
								}}).then(slugResult=>{
									childCallback(null, slugResult);
								}).catch(next);
							},
							corporate_details :(childCallback)=>{
								/** Get corporate details **/
								let corporateId	=	(detailResult.corporate_id) ? new ObjectId(detailResult.corporate_id) : '';
								const corporate_tie_ups = this.db.collection(Tables.CORPORATE_TIE_UPS);
								corporate_tie_ups.findOne({
									_id : corporateId
								},{projection: {
									_id:1,corporate_name:1
								}}).then(corporateResult=>{
									childCallback(null, corporateResult);
								}).catch(next);
							},
							offer_details :(childCallback)=>{
								if(!detailResult.offer_id) return childCallback(null,{});
								/** Get offer details **/
								let offerId	 = (detailResult.offer_id) ? detailResult.offer_id : '';
								const offers = this.db.collection(Tables.OFFERS);
								offers.findOne({ _id : offerId},{projection: { _id:1,description:1}}).then(offerResult=>{
									childCallback(null, offerResult);
								}).catch(next);
							},
						},(childErr, childResponse)=>{
							if(childErr) return callback(childErr,{});

							let previousBranchName    = (childResponse.branch_transfer && childResponse.branch_transfer.name)	?	childResponse.branch_transfer.name :{};
							let previousTransferBranchName    = (childResponse.order_transfer && childResponse.order_transfer.name)	?	childResponse.order_transfer.name :{};
							let paymentTitle    = (childResponse.payment_type && childResponse.payment_type.title)	?	childResponse.payment_type.title :{};
							let corporateDetails= (childResponse.corporate_details)	? childResponse.corporate_details :{};
							let offerDetails    = (childResponse.offer_details)	    ? childResponse.offer_details     :{};

							detailResult.previous_branch_name 	  = previousBranchName;
							detailResult.previous_transfer_branch_name 	  = previousTransferBranchName;
							detailResult.payment_title 	  = paymentTitle;
							detailResult.corporate_name   = corporateDetails.corporate_name;
							detailResult.offer_description = offerDetails.description;
							callback(null,detailResult);
						});
					});
				},
				order_modified_detail :(callback)=>{
					this.orderModifyCollection.aggregate([
						{$match : {order_id : orderId}},
						{$lookup: {	/** Get order modify item details **/
							from 		:	Tables.ORDER_MODIFY_ITEM_LOGS,
							localField  :	"_id",
							foreignField:	"modify_log_id",
							as 		  	:	"modify_details"
						}},
						{$lookup: {	/** Get order modify by user details **/
							from 		:	Tables.USERS,
							localField  :	"modified_by_user_id",
							foreignField:	"_id",
							as 		  	:	"user_details"
						}},
						{$project : {
							_id:1, version: 1,user_name : {$arrayElemAt: ["$user_details.full_name",0]},modified:1,modify_details:1
						}},
					]).toArray().then(modifyResult=>{
						callback(null,modifyResult);
					}).catch(next);
				},
			},(err, response)=>{
				if(err) return next(err);

				/** send error response */
				if(!response.result || !response.order_detail){
					return resolve({ status: Constants.STATUS_ERROR, message: res.__("system.invalid_access"), response: response });
				}

				/** send success response */
				resolve({
					status			: Constants.STATUS_SUCCESS,
					result			: (response.result) ? response.result : {},
					orderDetails	: (response.order_detail) ? response.order_detail : {},
					modify_details	: (response.order_modified_detail) ? response.order_modified_detail : [],
				});
			});
		}).catch(next);
	};// End getOrderDetails()

	/**
	 * Function to get list of items
	 *
	 * @param req As Request Data
	 * @param res As Response Data
	 *
	 * @return render/json
	 */
	async listItems  (req, res, next){
		let orderId			=	(req.params.order_id) ? new ObjectId(req.params.order_id) : '';
		let limit			= 	(req.body.length)	? parseInt(req.body.length)	: Constants.ADMIN_LISTING_LIMIT;
		let skip			= 	(req.body.start) 	? parseInt(req.body.start)	: Constants.DEFAULT_SKIP;

		/** Configure Datatable conditions*/
		let dataTableConfig = await Helper.configDatatable(req,res,null);
		
		let commonConditions = {order_id: orderId};

		dataTableConfig.conditions = Object.assign(dataTableConfig.conditions,commonConditions);

		// Get list or count of order items
		let dbRes = await this.orderItemCollection.aggregate([
			{ $match: dataTableConfig.conditions },
			{$facet : {
				list : [
					{$sort: dataTableConfig.sort_conditions },
					{$skip: skip },
					{$limit: limit },
					{$project: {
						_id : 1, item_name : 1,qty : 1, price : 1, discounted_price : 1,net_amount:1,sub_total:1,item_type:1,unit_lists:1,dough_id:1,unit_id:1,selector_id:1,extra_items:1,note: 1
					}}
				],
				count: [
					{$count: "count"},
				],
			}}
		]).toArray();

		let result = dbRes?.[0]?.list ||[];

		let unitIds			=	[];
		let doughIds		=	[];
		let selectorIds		=	[];
		result.map(data=>{
			if(data.unit_id) unitIds.push(data.unit_id);
			if(data.dough_id) doughIds.push(data.dough_id);

			if(data.item_type == Constants.HALF_AND_HALF_ITEM || data.item_type == Constants.DEAL_ITEM ){
				if(data.unit_id) unitIds.push(data.unit_id);
				if(data.dough_id) doughIds.push(data.dough_id);
				if(data.unit_lists.length > 0){
					data.unit_lists.map(list=>{
						if(list.unit_id) unitIds.push(list.unit_id);
						if(list.dough_id) doughIds.push(list.dough_id);
						if(list.selector_id) selectorIds.push(list.selector_id);
					});
				}
			}
		});

		asyncParallel({
			unit_records : (childCallback)=>{
				if(unitIds.length <=0) return childCallback(null,{});

				const item_units_masters = this.db.collection(Tables.ITEM_UNITS_MASTERS);
				item_units_masters.find({_id : {$in : Helper.arrayToObject(unitIds)}},{projection : {_id: 1,name: 1}}).toArray().then(itemResult=>{
					if(itemResult.length <= 0) return childCallback(null,{});

					let itemList = {};
					itemResult.forEach(items=>{
						itemList[items._id] = items.name;
					});
					
					childCallback(null, itemList);
				}).catch(next);
			},
			dough_records : (childCallback)=>{
				if(doughIds.length <=0) return childCallback(null,{});

				const item_dough_units = this.db.collection(Tables.ITEM_DOUGH_UNITS);
				item_dough_units.aggregate([
					{$match: 	{
						_id		: {$in : Helper.arrayToObject(doughIds)}
					}},
					{$lookup: 	{
						from			: Tables.ITEM_UNITS_MASTERS,
						localField		: "item_unit_id",
						foreignField	: "_id",
						as				: "unit_details",
					}},
					{$project	: 	{
						unit_name: {$arrayElemAt:["$unit_details.name", 0] },
					}},
				]).toArray().then(doughResult=>{
					if(doughResult.length <= 0) return childCallback(null,{});

					let doughList = {};
					doughResult.map(doughs=>{
						doughList[doughs._id] = doughs.unit_name;
					});
					childCallback(null,doughList);
				}).catch(next);
			},
			selector_records : (childCallback)=>{
				if(selectorIds.length <=0) return childCallback(null,{});

				const item_selector_units = this.db.collection(Tables.ITEM_SELECTOR_UNITS);
				item_selector_units.aggregate([
					{$match: 	{
						_id		: {$in : Helper.arrayToObject(selectorIds)}
					}},
					{$lookup: 	{
						from			: Tables.ITEM_UNITS_MASTERS,
						localField		: "item_unit_id",
						foreignField	: "_id",
						as				: "unit_details",
					}},
					{$project	: 	{
						unit_name: {$arrayElemAt:["$unit_details.name", 0] },
					}},
				]).toArray().then(selectorResult=>{
					if(selectorResult.length <= 0) return childCallback(null,{});

					let selectorList = {};
					selectorResult.map(selectors=>{
						selectorList[selectors._id] = selectors.unit_name;
					});
					childCallback(null,selectorList);
				}).catch(next);
			},
		},(childErr, childResponse)=>{
			if(childErr) return next(childErr);

			let doughData		=	(childResponse.dough_records) ? childResponse.dough_records : {};
			let unitData		=	(childResponse.unit_records) ? childResponse.unit_records : {};
			let selectorData	=	(childResponse.selector_records) ? childResponse.selector_records : {};

			result.map(record=>{
				let tmpUnitId 	= 	record.unit_id;
				let tmpDoughId	=	record.dough_id;

				if(tmpUnitId){
					record.unit_name = (unitData[tmpUnitId]) ? unitData[tmpUnitId] :{};
				}
				if(tmpDoughId){
					record.dough_name= (doughData[tmpDoughId]) ? doughData[tmpDoughId] :{};
				}

				if(record.item_type==Constants.HALF_AND_HALF_ITEM || record.item_type== Constants.DEAL_ITEM){
					record.unit_lists.map(data=>{
						if(data.unit_id) 	tmpUnitId	=	data.unit_id;
						if(data.dough_id) 	tmpDoughId 	=	data.dough_id;

						let tmpSelectorId =	data.selector_id;


						data.unit_name = (unitData[tmpUnitId]) ? unitData[tmpUnitId] :{};
						data.dough_name = (doughData[tmpDoughId]) ? doughData[tmpDoughId] :{};
						data.selector_name = (selectorData[tmpSelectorId]) ? selectorData[tmpSelectorId] :{};
					});
				}
			});
	
			/** Send response **/
			res.send({
				status: Constants.STATUS_SUCCESS,
				draw: dataTableConfig.result_draw,
				data			:   result,
				recordsTotal	:	dbRes?.[0]?.count?.[0]?.count || 0,
				recordsFiltered	:  	dbRes?.[0]?.count?.[0]?.count || 0,
			}); 			
		});
	};//End listItems()

	/**
	 * Function to get list of order status logs
	 *
	 * @param req As Request Data
	 * @param res As Response Data
	 *
	 * @return render/json
	 */
	async listStatusLogs  (req, res, next){
		let orderId			=	(req.params.order_id) ? new ObjectId(req.params.order_id) : '';
		let limit			= 	(req.body.length)	? parseInt(req.body.length)	: Constants.ADMIN_LISTING_LIMIT;
		let skip			= 	(req.body.start) 	? parseInt(req.body.start)	: Constants.DEFAULT_SKIP;
		let driverLogs      =   (req.query.driver_logs) ? req.query.driver_logs : '';
		const collection	= 	this.db.collection(Tables.ORDER_STATUS_LOGS);

		if(!orderId) {
			return res.status(400).send({
				status: Constants.STATUS_ERROR, message :res.__("admin.system.invalid_access")
			});
		}

		/** Configure Datatable conditions*/
		let dataTableConfig = await Helper.configDatatable(req,res,null);
	
		let commonConditions = {order_id: orderId};

		/** Add driver status condition */
		if(driverLogs){
			commonConditions.status = {$in : Constants.DRIVER_ORDER_VIEW_STATUS_ARRAY};
		}else {
			commonConditions.status = {$nin : Constants.DRIVER_ORDER_VIEW_STATUS_ARRAY};
		}

		dataTableConfig.conditions = Object.assign(dataTableConfig.conditions,commonConditions);

		// Get list or count of order status logs
		let dbRes = await collection.aggregate([
			{ $match: dataTableConfig.conditions },
			{$facet : {
				list : [
					{$sort: dataTableConfig.sort_conditions },
					{$skip: skip },
					{$limit: limit },
					{$project: {
						_id : 1, status : 1,created : 1,is_modified:1, action_taken_by : 1,status_changed_from:1, assigned_by:1,submitted_by:1
					}}
				],
				count: [
					{$count: "count"},
				],
			}}
		]).toArray();

		let result = dbRes?.[0]?.list || [];
		let allUserIds = [];
		result.map(records=>{
			if(records.assigned_by) 	allUserIds.push(records.assigned_by);
			if(records.submitted_by) 	allUserIds.push(records.submitted_by);
			if(records.action_taken_by) allUserIds.push(records.action_taken_by);
		});

		asyncParallel({
			user_list : (subCallback)=>{
				if(allUserIds.length ==0) return  subCallback(null,{});

				const users	= 	this.db.collection(Tables.USERS);
				users.find({_id: {$in: allUserIds}},{projection:{_id:1, full_name:1, user_role_id:1}}).toArray().then(userResult=>{
					if(userResult.length ==0) return subCallback(null, {});

					let userObj = {};
					userResult.map(records=>{
						userObj[records._id] = records;
					});
					subCallback(null, userObj);
				}).catch(next);
			},
		},(subErr, subResponse)=>{
			if(subErr) return next(subErr);

			let userList = subResponse.user_list;
			result.map(records=>{
				let assignedBy 		= 	records.assigned_by;
				let actionTakenBy 	=	records.action_taken_by;
				let tmpStatus		=	records.status;
				let userName 		=	"";

				userName = (userList[actionTakenBy]) ? userList[actionTakenBy].full_name :"";
				if(assignedBy && userList[assignedBy] && String(actionTakenBy) != String(assignedBy) && tmpStatus == Constants.ORDER_DRIVER_ASSIGNED){
					let tmpName 	= 	userList[assignedBy].full_name;
					let tmpRoleId 	=	(userList[actionTakenBy]) ? userList[actionTakenBy].user_role_id :"";

					if(tmpRoleId == Constants.DRIVER && userName){
						tmpName += " ("+res.__("admin.orders.assign_to")+"- "+userName +" )"
					}

					userName = tmpName;
				}
				records.user_name = userName;
			});
			
			/** Send response **/
			res.send({
				status: Constants.STATUS_SUCCESS,
				draw: dataTableConfig.result_draw,
				data			:   result,
				recordsTotal	:	dbRes?.[0]?.count?.[0]?.count || 0,
				recordsFiltered	:  	dbRes?.[0]?.count?.[0]?.count || 0,
			}); 
		});
	};//End listStatusLogs()

	/**
	 * Function for accept order
	 *
	 * @param req 	As 	Request Data
     * @param res 	As 	Response Data
     * @param next 	As 	Callback argument to the middleware function
	 *
	 * @return render
	 */
	async acceptOrder  (req, res, next){
		try{
			let redirectUrl		= 	(req.query.redirect) 			?	req.query.redirect 				:"";
			let orderId 		= 	(req.params._id) 				?	new ObjectId(req.params._id)		:"";
			let authId			= 	(req.session.user._id) 			? 	req.session.user._id 			:"";
			let userType		= 	(req.session.user.user_type) 	?	req.session.user.user_type 		:"";
			let authRoleId		= 	(req.session.user.user_role_id) ? 	req.session.user.user_role_id 	:"";
			let redirectPathUrl	=	(redirectUrl)					?	"order_tracking"				:"orders";
	
			/** Get order details  **/
			let orderDetails = await this.orderCollection.findOne({
				_id 			:	new ObjectId(orderId),
				is_confirm 		: 	false,
			},{projection: {_id:1,order_status: 1,branch_id:1,customer_id:1,restaurant_id:1,is_schedule:1 }});
				
			/** Send error response **/
			if(!orderDetails){
				req.flash(Constants.STATUS_ERROR,res.__("admin.system.invalid_access"));
				return res.redirect(Constants.WEBSITE_ADMIN_URL+redirectPathUrl);
			}
	
			let branchId		=	(orderDetails.branch_id) 		?	orderDetails.branch_id 					:'';
			let customerId		=	(orderDetails.customer_id) 		? 	new ObjectId(orderDetails.customer_id) 		:'';
			let restauarntId	=	(orderDetails.restaurant_id)	? 	new ObjectId(orderDetails.restaurant_id)	:'';
			let tmpOrderStatus 	=	orderDetails.order_status
			let isSchedule 		=	orderDetails.is_schedule
	
			/** accept order  **/
			await orders.updateOne({
				_id : new ObjectId(orderId)
			},
			{$set : {
				is_confirm	: 	true,
				modified 	: 	Helper.getUtcDate()
			}});
	
			asyncParallel({
				mark_confirm: (callback) => {
					/** Save order logs */
					Helper.saveOrderStatusLogs(req,res,next,{
						updated_by 		: 	authId,
						user_role_id 	: 	authRoleId,
						status 			:	Constants.ORDER_CONFIRMED,
						order_status	:	Constants.ORDER_NOT_CONFIRMED,
						restaurant_id	:	restauarntId,
						order_id 		:	new ObjectId(orderId),
						branch_id		:	branchId,
						user_id			:	customerId,
						user_type		:	userType,
					}).then(()=>{
						callback(null);
					}).catch(next);
				},
				mark_submitted: (callback) => {
					if(tmpOrderStatus != Constants.ORDER_PENDING) return callback(null);

					/** Get order delivered time */
					const order_status_logs	= this.db.collection(Tables.ORDER_STATUS_LOGS);
					order_status_logs.countDocuments({
						order_id 	: 	new ObjectId(orderId),
						status 		: 	{$nin: [Constants.ORDER_PAYMENT_PENDING, Constants.ORDER_PAYMENT_FAILED,Constants.ORDER_SCHEDULED]},
					}).then(countResult=>{

						let tmpStatus = Constants.ORDER_SUBMITTED;
						if(isSchedule) tmpStatus = Constants.ORDER_SCHEDULED;
						if(countResult > 0) tmpStatus = Constants.ORDER_SUBMITTED;

						/** Save order logs */
						Helper.saveOrderStatusLogs(req,res,next,{
							updated_by 		: 	authId,
							user_role_id 	: 	authRoleId,
							status 			:	tmpStatus,
							order_status	:	Constants.ORDER_CONFIRMED,
							restaurant_id	:	restauarntId,
							order_id 		:	new ObjectId(orderId),
							branch_id		:	branchId,
							user_id			:	customerId,
							user_type		:	userType,
						}).then(()=>{
							callback(null);
						}).catch(next);
					}).catch(next);
				},
			}, (asyncErr) => {
				if(asyncErr) return next(asyncErr);

				/** Send success response **/
				req.flash(Constants.STATUS_SUCCESS,res.__("admin.orders.status_has_been_updated_successfully"));
				res.redirect(Constants.WEBSITE_ADMIN_URL+redirectPathUrl);

				/** save System logs */
				saveSystemLogs(req, res, {
					user_id				: req.session.user._id,
					parent_id			: orderId,
					activity_module		: Constants.SYSTEM_LOG_MODULE_ORDERS,
					activity_type		: Constants.ACTIVITY_TYPE_APPROVE,
					additional_details	: {}
				});
			});			
		}catch(err){
			return next(err);
		}
	};//End acceptOrder()

	/**
	 * Function for update order status
	 *
	 * @param req 	As 	Request Data
     * @param res 	As 	Response Data
     * @param next 	As 	Callback argument to the middleware function
	 *
	 * @return render
	 */
	async changeStatus  (req, res, next){
		try{
			let orderId = req.params._id;
			if(Helper.isPost(req)){
				/** Sanitize Data **/
				req.body	  		= 	Helper.sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
				let authId			= 	req.session.user._id;
				let userType		= 	req.session.user.user_type;
				let authRoleId		= 	req.session.user.user_role_id;
				let orderStatus		=	(req.body.order_status)		?	req.body.order_status 	:'';
				let cancelReasonId	=	(req.body.cancel_reason)	? 	new ObjectId(req.body.cancel_reason) :'';
	
				/** send error response */
				if(!orderId) return res.send({ status: Constants.STATUS_ERROR,message: res.__("system.invalid_access")});

				asyncParallel({
					cancel_reason_title :(orderCallback)=>{
						if(orderStatus != Constants.ORDER_CANCELLED || !cancelReasonId) return orderCallback(null,null);
	
						/** Get cancel reason title */
						const cancel_reasons = this.db.collection(Tables.CANCEL_REASONS);
						cancel_reasons.findOne({_id: cancelReasonId},{projection: {title:1}}).then(result=>{
							let reasonTitle = (result && result.title)?result.title[Constants.DEFAULT_LANGUAGE_CODE] :"";
							orderCallback(null, reasonTitle);
						}).catch(next);
					},
					order_details :(orderCallback)=>{
						/** Get order details */
						this.orderCollection.findOne({_id : new ObjectId(orderId),is_completed: {$ne: true} }).then(orderResult=>{
							orderCallback(null, orderResult);
						}).catch(next);
					},
				},async (asyncErr, asyncResponse)=>{
					if(asyncErr) return next(asyncErr)
	
					let cancelReasonTitle 	= 	asyncResponse.cancel_reason_title;
					let orderDetails 		= 	asyncResponse.order_details;
	
					/** send error response */
					if(!orderDetails) return res.send({ status: Constants.STATUS_ERROR, message: res.__("system.invalid_access")});
	
					let aghzeya			=	(orderDetails.aghzeya) 			?	orderDetails.aghzeya 			:false;
					let isConfirm		=	(orderDetails.is_confirm) 		? 	orderDetails.is_confirm 		:false;
					let customerId		=	(orderDetails.customer_id) 		? 	orderDetails.customer_id 		:"";
					let restaurantId	=	(orderDetails.restaurant_id) 	? 	orderDetails.restaurant_id 		:"";
					let uniqueOrderId	=	(orderDetails.unique_order_id) 	? 	orderDetails.unique_order_id 	:"";
					let tmpDbStatus		= 	(orderDetails.admin_status) 	? 	orderDetails.admin_status 		: "";
					let aghzeyaBillNo	= 	(orderDetails.aghzeya_bill_no)	? 	orderDetails.aghzeya_bill_no 	:"";
					let lastOrderStatus = 	orderDetails.order_status;
					let isSchedule 		= 	orderDetails.is_schedule;
					let scheduledToSubmitTime = orderDetails.scheduled_to_submit_time;
					let gfcCancelRetry 	= 	orderDetails.gfc_cancel_retry;
					let isModified 		= 	orderDetails.is_modified;
					let statusLevel  	=	Constants.UPDATE_ORDER_STATUS?.[orderStatus]?.level ||"";
					let oldStatusLevel	=	Constants.UPDATE_ORDER_STATUS?.[lastOrderStatus]?.level ||"";
					let simphonyCheckRef=	(orderDetails.simphonyCheckRef)		? 	orderDetails.simphonyCheckRef :"";
					let isOrderModified =	(aghzeyaBillNo || simphonyCheckRef) ?	true :false;
					let currentStatus	=	(orderDetails.order_status) ? 	orderDetails.order_status :'';
					let branchId		=	(orderDetails.branch_id) 	? 	orderDetails.branch_id 	  :'';
					let restauarntId	=	(orderDetails.restaurant_id)? 	orderDetails.restaurant_id:'';
	
					/** send error response */
					if(oldStatusLevel >= statusLevel) return res.send({status: Constants.STATUS_ERROR, message :res.__("admin.system.something_going_wrong_please_try_again") });

					if(orderStatus == Constants.ORDER_SUBMITTED || orderStatus == Constants.ORDER_PREPARING){
						/** Set update data */
						let updatedData = {modified: Helper.getUtcDate()};
	
						/** when schedule order mark to submitted */
						if(isSchedule && !scheduledToSubmitTime){
							isSchedule = false;

							updatedData.order_date					=	Helper.getUtcDate();
							updatedData.scheduled_date				=	Helper.getUtcDate();
							updatedData.scheduled_to_submit_time	=	Helper.getUtcDate();
							updatedData.scheduled_to_submit_manually=	Helper.getUtcDate();
						}

						/** when update status payment pennding / rejected to submitted */
						if(lastOrderStatus == Constants.ORDER_PAYMENT_PENDING || lastOrderStatus == Constants.ORDER_PAYMENT_FAILED){
							if(!isModified || (isModified && !aghzeyaBillNo && !simphonyCheckRef)){
								updatedData.order_date 			=	Helper.getUtcDate();
								updatedData.previous_order_date =	orderDetails.order_date;
							}

							if(isModified){
								updatedData.paid_amount			=	orderDetails.order_price;
								updatedData.outstanding_payment	=	ConstantsPAID;
								updatedData.modified_payment_status_update_manually	= Helper.getUtcDate();
							}

							updatedData.payment_status_update_manually	=	Helper.getUtcDate();
							updatedData.is_online_payment_received		=	true;
						}

						await this.orderCollection.updateOne({_id: new ObjectId(orderId) },{$set: updatedData});

						let placeRes = await this.placeOrderModule.callAfterPlaceOrder(req,res,next,{
							order_id 			:	orderId,
							is_aghzeya 			: 	aghzeya,
							admin_id 			: 	authId,
							customer_id 		: 	customerId,
							current_status 		: 	tmpDbStatus,
							is_schedule 		: 	isSchedule,
							is_confirm 			: 	isConfirm,
							is_modify 			: 	isOrderModified,
							restaurant_id 		: 	restaurantId,
							unique_order_id		: 	uniqueOrderId,
							not_update_status	: 	true,
							simphony			: 	orderDetails.simphony || false,
						});

						if(placeRes && placeRes.status != Constants.STATUS_SUCCESS){
							return res.send(placeRes);
						}						
					}
					
					if(orderStatus == Constants.ORDER_CANCELLED || orderStatus == Constants.ORDER_REJECTED_BY_ADMIN){
						let updateData = { tmp_new_status: orderStatus};
						if(req.body.rejection_reason) updateData['tmp_rejection_reason'] = req.body.rejection_reason;
						if(cancelReasonTitle) updateData['tmp_rejection_reason'] = cancelReasonTitle;

						/** Update order details */
						await this.orderCollection.updateOne({_id: new ObjectId(orderId) },{$set: updateData});

						/** Send cancel request to aghzeya api. if aghzeya api is cancel this order then order cancel in our system other wise not */
						let cancelledResponse = await this.markAghzeyaOrderToCancelled(req,res,next,{
							order_id		: 	orderId,
							restaurant_id	: 	orderDetails.restaurant_id,
							reason_id		:	cancelReasonId,
							not_update_retry_count:	(gfcCancelRetry < Constants.MAX_GFC_PUSH_LIMIT) ? true :false,
						});

						if(cancelledResponse && cancelledResponse.status != Constants.STATUS_SUCCESS){
							return res.send(cancelledResponse);
						}
					}					

					/** Set update data  **/
					let dataToBeUpdated	=	{
						order_status	: 	orderStatus,
						modified 		: 	Helper.getUtcDate()
					};

					if(req.body.rejection_reason) dataToBeUpdated['rejection_reason']	=	req.body.rejection_reason;
					if(cancelReasonId) dataToBeUpdated['cancel_reason_id'] =	new ObjectId(cancelReasonId);

					if(orderStatus == Constants.ORDER_CANCELLED){
						dataToBeUpdated.cancelled_user_role_id = authRoleId;
						if(cancelReasonTitle) dataToBeUpdated.rejection_reason = cancelReasonTitle;
					}

					/** update order status */
					await this.orderCollection.updateOne({_id: new ObjectId(orderId) },{$set: dataToBeUpdated});

					/** Save order logs */
					await Helper.saveOrderStatusLogs(req,res,next,{
						updated_by 		: 	authId	,
						user_role_id 	: 	authRoleId,
						status 			:	orderStatus,
						order_status	:	currentStatus,
						restaurant_id	:	restauarntId,
						order_id 		:	new ObjectId(orderId),
						branch_id		:	branchId,
						user_id			:	customerId,
						user_type		:	userType,
						is_admin        :   true
					});

					/** Send success response */
					req.flash(Constants.STATUS_SUCCESS,res.__("admin.orders.status_has_been_updated_successfully"));
					res.send({
						status	: Constants.STATUS_SUCCESS,
						redirect_url : Constants.WEBSITE_ADMIN_URL+"orders",
					});

					/** save System logs */
					saveSystemLogs(req, res, {
						user_id				: req.session.user._id,
						parent_id			: orderId,
						activity_module		: Constants.SYSTEM_LOG_MODULE_ORDERS,
						activity_type		: Constants.ACTIVITY_TYPE_STATUS_UPDATE,
						additional_details	: {}
					});
				});
			}else{
				/** Get detail of Order **/
				let orderResult = await this.orderCollection.aggregate([
					{$match	: { _id: new ObjectId(orderId) }},
					{$lookup: {
						"from" 			: 	Tables.RESTAURANTS,
						"localField" 	:	"restaurant_id",
						"foreignField"	: 	"_id",
						"as" 			: 	"rest_details"
					}},
					{$project:{ 
						_id:1,admin_status:1, restaurant_id: 1,
						aghzeya_restaurant_id: {$arrayElemAt: ["$rest_details.aghzeya_restaurant_id",0]}, 
					}}
				]).toArray();

				/** Send error response **/
				if(orderResult.length == 0){
					return res.status(400).send({
						status: Constants.STATUS_ERROR, message :res.__("admin.system.invalid_access")
					});
				}

				orderResult 			= 	orderResult[0];
				let restaurantId		=	orderResult.restaurant_id;
				let aghzeyaRestaurantId	=	orderResult.aghzeya_restaurant_id;
				asyncParallel({
					aghzeya_reasons : (callback)=>{
						if(!aghzeyaRestaurantId) return callback(null, null);

						/** Get cancel reason list */
						const aghzeya_restaurant_cancel_reasons	= this.db.collection(Tables.AGHZEYA_RESTAURANT_CANCEL_REASONS);
						aghzeya_restaurant_cancel_reasons.distinct("cancel_reason_id",{
							restaurant_id : restaurantId,
							$and: [
								{cancel_reason_id: {$exists: true}},
								{cancel_reason_id: {$nin: ["",null]}},
							]
						}).then(result=>{
							callback(null, result);
						}).catch(next);
					},
				},async (asyncErr, asyncResponse)=> {
					if(asyncErr) return next(asyncErr);

					/** Set reason conditions  **/
					let aghzeyaReasons 	= 	asyncResponse.aghzeya_reasons;
					let conditions 		=	{ status : Constants.ACTIVE };
					if(aghzeyaReasons) conditions._id = {$in: aghzeyaReasons}

					/**Get cancel reason dropdown list **/
					let dropDownResponse = await Helper.getDropdownList(req,res, next,{
						collections :[
							{
								collection : Tables.CANCEL_REASONS,
								columns    : ["_id",["title",Constants.DEFAULT_LANGUAGE_CODE]],
								conditions : conditions
							},
						],
					});

					/** Render change status page **/
					res.render('change_status',{
						layout			   : false,
						order_result	   : orderResult,
						cancel_reason_list : dropDownResponse?.final_html_data?.[0] || ""
					});
				});
			}
		}catch(err){
			return next(err);
		}
	};//End changeStatus()

	/**
	 * Function for requeue order
	 *
	 * @param req 	As 	Request Data
     * @param res 	As 	Response Data
     * @param next 	As 	Callback argument to the middleware function
	 *
	 * @return render
	 */
	async requeueOrder  (req, res, next){
		try{
			let orderId 		= 	(req.params._id) ? req.params._id :"";
			let redirectUrl		= 	(req.query.redirect) ? req.query.redirect :"";

			/** Update order queue time **/
			const orderResult = await this.orderCollection.findOne({
				_id : new ObjectId(orderId)
			},{projection: { _id:1,number_of_queue:1,queue_time:1}});

			if(!orderResult) {
				req.flash(Constants.STATUS_ERROR,res.__("admin.system.invalid_access"));
				return res.redirect(Constants.WEBSITE_ADMIN_URL+"orders");
			}

			let noOfQueue =	(orderResult.number_of_queue) ? orderResult.number_of_queue : 0;
			
			await this.orderCollection.updateOne({
				_id : new ObjectId(orderId)
			},{
				$set : {
					queue_time		: Helper.addDaysToDate(Constants.QUEUE_TIME_ORDER[noOfQueue]/Constants.MINUTES_IN_A_HOUR),
				},
				$inc :{
					number_of_queue : 1
				}
			});
				
			/** Send success response **/
			req.flash(Constants.STATUS_SUCCESS,res.__("admin.orders.order_has_been_requeued_successfully"));
			res.redirect(Constants.WEBSITE_ADMIN_URL+(redirectUrl && "order_tracking" || "orders"));
		}catch(err){
			return next(err);
		}		
	};//End requeueOrder()

	/**
	 * Function to reject order request
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 *
	 * @return render/json
	*/
	async rejectOrderRequest  (req, res, next){		
		/** Sanitize Data **/
		req.body	  		= Helper.sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
		let orderId 		= (req.body.order_id) 				?	req.body.order_id 				:"";
		let authId 	  		= (req.session.user._id) 			? 	req.session.user._id 			:"";
		let authRoleId		= (req.session.user.user_role_id) 	? 	req.session.user.user_role_id 	:"";
		let userType		= (req.session.user.user_type) 		? 	req.session.user.user_type 		:"";
		let rejectionReason = (req.body.rejection_reason) 		? 	req.body.rejection_reason 		:"";

		/** send error response */
		if(!orderId) return res.send({status: Constants.STATUS_ERROR, message: res.__("admin.system.invalid_access")});

		/** Get order details */
		const orderDetails = await this.orderCollection.findOne({
			_id 		: 	new ObjectId(orderId),
			is_confirm 	:	false,
		},{projection: {_id:1,order_status:1,customer_id:1,restaurant_id:1}});
		
		/** Send error response */
		if(!orderDetails) return res.send({status: Constants.STATUS_ERROR, message: res.__("admin.system.invalid_access") });

		asyncParallel({
			mark_cancelled :(subCallback)=>{
				/**
				* Send cancel request to aghzeya api. if aghzeya api is cancel this order then order cancel in our system other wise not
				*/
				this.markAghzeyaOrderToCancelled(req,res,next,{
					order_id		: 	orderId,
					restaurant_id	: 	orderDetails.restaurant_id,
				}).then(cancelledResponse=>{
					subCallback(null, cancelledResponse);
				}).catch(next);
			},
			update_order :(subCallback)=>{
				/** Update order details */
				this.orderCollection.updateOne(
					{_id: new ObjectId(orderId) },
					{$set: {
						tmp_rejection_reason: rejectionReason, 
						tmp_new_status: Constants.ORDER_REJECTED_BY_ADMIN 
					}}
				).then(updateResult=>{
					subCallback(null, updateResult);
				}).catch(next);
			},
		},async(asyncErr, asyncResponse)=>{
			if(asyncErr) return next(asyncErr);

			/** Send error response */
			if(asyncResponse.mark_cancelled && asyncResponse.mark_cancelled.status != Constants.STATUS_SUCCESS){
				return res.send(asyncResponse.mark_cancelled);
			}

			/** Update order details */
			await this.orderCollection.updateOne({
				_id :new ObjectId(orderId),
			},
			{$set : {
				is_confirm 			: 	true,
				order_status		: 	Constants.ORDER_REJECTED_BY_ADMIN,
				rejection_reason	:	rejectionReason,
			}});

			/** Save order logs */
			await Helper.saveOrderStatusLogs(req,res,next,{
				updated_by 		: 	authId,
				user_id			:	orderDetails.customer_id,
				user_role_id 	: 	authRoleId,
				restaurant_id 	: 	orderDetails.restaurant_id,
				status 			:	Constants.ORDER_REJECTED_BY_ADMIN,
				order_status	:	orderDetails.order_status,
				order_id 		:	orderId,
				user_type		:	userType,
			})

			/** Send success response */
			req.flash(Constants.STATUS_SUCCESS,res.__("admin.orders.status_has_been_updated_successfully"));
			res.send({
				status	: Constants.STATUS_SUCCESS,
				redirect_url : Constants.WEBSITE_ADMIN_URL+"orders",
			});

			/** Save system logs */
			saveSystemLogs(req, res, {
				user_id				: req.session.user._id,
				parent_id			: orderId,
				activity_module		: Constants.SYSTEM_LOG_MODULE_ORDERS,
				activity_type		: Constants.ACTIVITY_TYPE_REJECT,
				additional_details	: {status:	Constants.ORDER_REJECTED_BY_ADMIN}
			});
		});
	};//End rejectOrderRequest()

	/**
	 * Function for get branch list
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 * @param next 	As Callback argument to the middleware function
	 *
	 * @return null
	 */
	async branchList  (req, res, next){
		try{
			let restaurantIds = req.body.restaurant_id;

			/** Send error response */
			if(!restaurantIds) return res.send({status: Constants.STATUS_ERROR, message :res.__("admin.system.something_going_wrong_please_try_again") });

			if(restaurantIds.constructor !== Array)	restaurantIds = [restaurantIds];
			restaurantIds = Helper.arrayToObject(restaurantIds);

			/**Get branch list **/
			let dropDownResponse = await Helper.getDropdownList(req,res, next,{
				collections :[
					{
						collection : Tables.RESTAURANT_BRANCHES,
						columns    : ["_id",["name",Constants.DEFAULT_LANGUAGE_CODE]],
						conditions : {
							restaurant_id : {$in: restaurantIds},
						},
					},
				]
			});

			res.send({
				status       : Constants.STATUS_SUCCESS,
				branch_list  : dropDownResponse?.final_html_data?.[0] || ""
			});
		}catch(err){
			return next(err);
		}		
	};//End branchList()

	/**
	 * Function to get location
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 *
	 * @return render/json
	 */
	async getLocation  (req,res, next){
		try{
			let captainId	=	(req.body.user_id) 	? 	new ObjectId(req.body.user_id) 	:'';
			let orderId		=	(req.body.order_id) ?	new ObjectId(req.body.order_id) :'';

			if(!orderId)return res.send({status: Constants.STATUS_SUCCESS, result: {captain_detail: {}, order_detail: {}, order_status:""} });

			asyncParallel({
				captain_detail :(locationCallback)=>{
					if(!captainId) return locationCallback(null,null);

					/** Set condition for captains **/
					let conditions = clone(Constants.DRIVER_COMMON_CONDITIONS);
					conditions	=	{
						_id			 : new ObjectId(captainId),
						is_available : Constants.AVAILABLE
					}
	
					/** Get captain details **/
					const users  = this.db.collection(Tables.USERS);
					users.findOne(conditions,{projection: {_id:1,longitude:1,latitude:1,full_name:1,mobile_number:1}}).then(result=>{
						locationCallback(null,result);
					}).catch(next);
				},
				order_detail :(locationCallback)=>{
					/** Get order details **/
					this.orderDetailsCollection.findOne({order_id : new ObjectId(orderId)},{projection: {_id:1,restaurant_address:1,customer_address:1,customer_latitude:1,customer_longitude:1,restaurant_latitude:1,restaurant_longitude:1}}).then(result=>{
						locationCallback(null,result);
					}).catch(next);
				},
				order_data :(locationCallback)=>{
					/** Get order details **/
					this.orderCollection.findOne({_id : new ObjectId(orderId)},{projection: {order_status:1}}).then(result=>{
						locationCallback(null,result);
					}).catch(next);
				},
			},(asyncErr, asyncResponse)=>{
				if(asyncErr) return next(asyncErr);
	
				let captainDetail	=	(asyncResponse.captain_detail) ? asyncResponse.captain_detail : {};
				let orderDetail		=	(asyncResponse.order_detail) ? asyncResponse.order_detail : {};
				let orderStatus		=	(asyncResponse.order_data && asyncResponse.order_data.order_status) ? asyncResponse.order_data.order_status : '';
			
				/** Send response **/
				res.send({
					status: Constants.STATUS_SUCCESS, 
					result: {
						captain_detail	:	captainDetail,
						order_detail	:	orderDetail,
						order_status	:	orderStatus
					} 
				});
			});
		}catch(e){
			return next(e);
		}
	};//End getLocation()

	/**
	 * Function to reschedule order
	 *
	 * @param req 	As 	Request Data
     * @param res 	As 	Response Data
     * @param next 	As 	Callback argument to the middleware function
	 *
	 * @return render
	 */
	async rescheduleOrder  (req, res, next){
		let redirectUrl		= 	(req.query.redirect) ? req.query.redirect :"";
		let orderId 		= 	(req.params._id) ? req.params._id :"";
		let userType		= 	(req.session.user && req.session.user.user_type) ? req.session.user.user_type :"";
		let authId			= 	(req.session.user && req.session.user._id) ? req.session.user._id :"";
		let authRoleId		= 	(req.session.user && req.session.user.user_role_id) ? req.session.user.user_role_id :"";

		/** reschedule order  **/
		let result = await this.orderCollection.findOneAndUpdate({
			_id : new ObjectId(orderId)
		},
		{$set : {
			order_status 	: 	Constants.ORDER_PENDING,
			modified 		: 	Helper.getUtcDate()
		}},{projection :{_id:1,order_status: 1,branch_id:1,customer_id:1,restaurant_id:1}});		

		let orderDetails 	= 	result || {};
		let currentStatus	=	(orderDetails.order_status) ? orderDetails.order_status : '';
		let branchId		=	(orderDetails.branch_id) ? orderDetails.branch_id : '';
		let customerId		=	(orderDetails.customer_id) ? new ObjectId(orderDetails.customer_id) : '';
		let restauarntId	=	(orderDetails.restaurant_id) ? new ObjectId(orderDetails.restaurant_id) : '';

		/** save System logs */
		saveSystemLogs(req, res, {
			user_id				: req.session.user._id,
			parent_id			: orderId,
			activity_module		: Constants.SYSTEM_LOG_MODULE_ORDERS,
			activity_type		: Constants.ACTIVITY_TYPE_RESCHEDULE,
			additional_details	: {}
		});

		/** Save order logs */
		await Helper.saveOrderStatusLogs(req,res,next,{
			updated_by 		: 	authId	,
			user_role_id 	: 	authRoleId,
			status 			:	Constants.ORDER_PENDING,
			order_status	:	currentStatus,
			restaurant_id	:	restauarntId,
			order_id 		:	new ObjectId(orderId),
			branch_id		:	branchId,
			user_id			:	customerId,
			user_type		:	userType,
		})
		/** Send success response **/
		req.flash(Constants.STATUS_SUCCESS,res.__("admin.orders.order_has_been_rescheduled_successfully"));
		res.redirect(Constants.WEBSITE_ADMIN_URL+(redirectUrl && "order_tracking" || "orders"));
	};//End rescheduleOrder()

	/**
	 * Function to refund order amount
	 *
	 * @param req 	As 	Request Data
     * @param res 	As 	Response Data
     * @param next 	As 	Callback argument to the middleware function
	 *
	 * @return render
	 */
	async orderRefundAmount  (req, res, next){
		try{
			let orderId 		= (req.params.id) ? new ObjectId(req.params.id) : "";
			let authRoleId		= (req.session.user.user_role_id)	? req.session.user.user_role_id :"";
			let teamHead		= req.session.user.team_head	? req.session.user.team_head 	:false;

			if(Helper.isPost(req)){
				req.body	  			= 	Helper.sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
				let totalRefundAmount	= 	(req.body.refund_amount) 	? 	req.body.refund_amount 	:'';
				let orderAmount			= 	(req.body.order_amount) 	?	req.body.order_amount 	:'';
				let refundType			=	(req.body.refund_type) 		?	req.body.refund_type 	:'';
							
				let refundPercentage	=	'';
				if([Constants.CRAVEZ].indexOf(authRoleId) !== -1){
					refundPercentage = res.locals.settings["Refund_Permission.admin_refund_limit"];
					if(refundType == Constants.COMPENSATION) refundPercentage = res.locals.settings["Compensation_Permission.admin_compensate_limit"];
				}else if(teamHead == true){
					refundPercentage = res.locals.settings['Refund_Permission.tl_refund_limit'];
					if(refundType == Constants.COMPENSATION) refundPercentage = res.locals.settings["Compensation_Permission.tl_compensate_limit"];
				}else{
					refundPercentage = res.locals.settings['Refund_Permission.agent_refund_limit'];
					if(refundType == Constants.COMPENSATION) refundPercentage = res.locals.settings["Compensation_Permission.agent_compensate_limit"];
				}

				let amountToRefund	=	(refundPercentage/100)* parseFloat(orderAmount);
				if(totalRefundAmount > amountToRefund){
					return res.send({status: Constants.STATUS_ERROR, message: [{ 'param': 'refund_amount', 'msg': res.__("admin.orders.please_enter_valid_refund_amount")}]});
				}

				/**Get order details */
				let orderResult = this.orderCollection.findOne({
					_id : 	orderId,
					$or	:	[
						{refund_amount_status : {$exists: false}},
						{refund_amount_status : false},
					]
				},{projection: {_id:1,order_price:1,paid_amount:1,customer_id:1,device_id:1,is_guest:1,unique_order_id:1}});

				/** Send error response */
				if(!orderResult){
					return res.send({status: Constants.STATUS_ERROR, message: res.__("admin.system.invalid_access") });
				}

				let orderUserId 		= (orderResult.customer_id) 	? orderResult.customer_id 	: "";
				let orderDeviceId 		= (orderResult.device_id) 		? orderResult.device_id : "";
				let orderByGuest 		= (orderResult.is_guest) 		? orderResult.is_guest 	: false;
				let uniqueOrderId		= (orderResult.unique_order_id) ? orderResult.unique_order_id :'';
				let totalPaidAmount 	= (orderResult.paid_amount) 	? orderResult.paid_amount : orderResult.order_price;
				let walletType 			= (refundType == Constants.COMPENSATION) ? Constants.COMPENSATION_AMOUNT :Constants.REFUND_AMOUNT;

				/** Call refund amount */
				await Helper.callRefundAmount(req,res,next,{
					order_id				: 	orderId,
					user_id 				: 	orderUserId,
					device_id 				: 	orderDeviceId,
					is_guest				:	orderByGuest,
					total_refund			:	parseFloat(totalRefundAmount),
					total_amount			:	parseFloat(totalPaidAmount),
					unique_order_id			:	uniqueOrderId,
					refund_activity_type	:	Constants.DIRECT_REFUND,
					wallet_type				:	walletType,
				});

				/** Update order details */
				await this.orderCollection.updateOne({
					_id: orderId
				},
				{$set: {
					refund_amount_status	:	true,
					refund_amount			:	parseFloat(totalRefundAmount),
					refund_type             :   refundType,
					refund_reason			:   (req.body.refund_reason) ? req.body.refund_reason : "",
					order_caused_by_whom    :   req.body.caused_by
				}});

				if(req.body.caused_by == Constants.CAUSED_BY_RESTAURANT){
					await Helper.calculateOrderPayout(req,res,next,{order_id: orderId });
				}

				req.flash(Constants.STATUS_SUCCESS,res.__('orders.amount_refund_request_submitted'));
				res.send({status: Constants.STATUS_SUCCESS});
			}else{
				let orderResult = await this.orderCollection.findOne({_id : orderId},{projection: {_id:1,order_price:1,paid_amount:1,admin_status:1}});
				
				if(!orderResult){
					return res.status(400).send({ status: Constants.STATUS_ERROR,message: res.__("admin.system.invalid_access") });
				}

				let orderAmount	=	(orderResult.paid_amount) ? orderResult.paid_amount : orderResult.order_price ;
				res.render('refund_amount',{
					layout		 : false,
					order_amount : orderAmount,
					order_id	 : orderId,
					order_status : orderResult.admin_status
				});
			}			
		}catch(err){
			return next(err);
		}		
	};//End orderRefundAmount()

	/**
	 * Function to get order count on refresh
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 *
	 * @return render/json
	 */
	async getOrderRules  (req, res, next){
		try{
			let response = await this.getOrderCounts(req,res,next);
			res.send({result:response || {} });	
		}catch(err){
			return next(err);
		}
	};// End getOrderData

	/**
	 * Function to get list of refund and compensation
	 *
	 * @param req As Request Data
	 * @param res As Response Data
	 *
	 * @return render/json
	 */
	async refundCompensationList  (req, res, next){
		let orderId		 =	(req.params.order_id) ? new ObjectId(req.params.order_id) : '';
		let limit		 = 	(req.body.length)	  ? parseInt(req.body.length)	  : Constants.ADMIN_LISTING_LIMIT;
		let skip		 = 	(req.body.start) 	  ? parseInt(req.body.start)	  : Constants.DEFAULT_SKIP;
		
		/** Configure Datatable conditions*/
		let dataTableConfig = await Helper.configDatatable(req,res,null);

		let commonConditions =	{
			_id			  :	orderId,
			refund_amount : {$exists : true}
		};

		dataTableConfig.conditions = Object.assign(dataTableConfig.conditions,commonConditions);

		// Get list or count of refund and compensation
		let dbRes = await this.orderCollection.aggregate([
			{ $match: dataTableConfig.conditions },
			{$facet : {
				list : [
					{$sort: dataTableConfig.sort_conditions },
					{$skip: skip },
					{$limit: limit },
					{$project: {
						_id:1,refund_amount:1,refund_amount_status:1,refund_type:1,paid_amount:1,order_price:1,refund_reason:1,order_caused_by_whom:1
					}}
				],
				count: [
					{$count: "count"},
				],
			}}
		]).toArray();

		/** Send response **/
		res.send({
			status: Constants.STATUS_SUCCESS,
			draw: dataTableConfig.result_draw,
			data			:   dbRes?.[0]?.list ||[],
			recordsTotal	:	dbRes?.[0]?.count?.[0]?.count || 0,
			recordsFiltered	:  	dbRes?.[0]?.count?.[0]?.count || 0,
		}); 
	};//End refundCompensationList()

	/**
	 *  Function for export order records
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 * @param next 	As 	Callback argument to the middleware function
	 *
	 * @return null
    */
	async exportData   (req, res, next){
		try{
			let exportType	= (req.params.export_type) 	? 	req.params.export_type	:"";
			let exportCount = (req.params.export_count) ? 	req.params.export_count	:0;

			/** conditions **/
			let filterCondition = 	this.exportFilterConditions?.[exportCount] || {};
			let sortConditions	= 	this.exportSortConditions?.[exportCount] || this.exportSortConditions?.[0] || {};
			let conditions		= 	(exportType == Constants.EXPORT_FILTERED)? 	filterCondition :this.exportCommonConditions;
			
			const aghzeya_restaurant_sources = this.db.collection(Tables.AGHZEYA_RESTAURANT_SOURCES);
			let srcResult = await aghzeya_restaurant_sources.find({},{projection : {_id:1,restaurant_id:1,name:1,aghzeya_source_id:1}}).toArray();			

			let resSrcObj = {};
			let srcObj = {};
			if(srcResult && srcResult.length>0){
				srcResult.map(val=>{
					let tmpName = val.name && val.name[Constants.DEFAULT_LANGUAGE_CODE] ? val.name[Constants.DEFAULT_LANGUAGE_CODE] :"";

					srcObj[val.aghzeya_source_id] 	= tmpName;

					if(!resSrcObj[val.restaurant_id]) resSrcObj[val.restaurant_id] = {};
					resSrcObj[val.restaurant_id][val.aghzeya_source_id] = tmpName;
				});
			}

			/** Get order details **/
			let tmpCursor = await this.orderCollection.aggregate([
				{$match : conditions},
				{$project : {
					_id:1,is_confirm:1,invoice_number:1,unique_order_id:1,order_date:1,last_status_updated_on:1,restaurant_name:1,order_price:1,admin_status:1,net_amount:1,is_modified:1,order_status:1,first_name: 1,last_name: 1,customer_latitude: 1, customer_longitude: 1,mobile_number: 1,discount_price: 1,delivery_duration: 1,remaining_delivery_duration: 1, delivery_type:1,payment_method:1,rejection_reason:1,cancelled_user_role_id:1,request_note:1,partners:1, "customer_address_detail.first_name": 1, "customer_address_detail.mobile_number": 1, "customer_address_detail.address_type": 1, "customer_address_detail.block_name": 1, "customer_address_detail.street": 1, "customer_address_detail.area_name": 1, "customer_address_detail.city_name": 1,source_name:1,source:1,restaurant_id:1,
				}},
			],{ allowDiskUse: true }).toArray();

			let commonColls	= [
				res.__("admin.orders.client_mobile_number"),
				res.__("admin.orders.invoice_number"),
				res.__("admin.orders.order_id"),
				res.__("admin.orders.restaurant_name"),
				res.__("admin.orders.order_date"),
				res.__("admin.orders.order_status"),
				res.__("admin.orders.client_first_name"),
				res.__("admin.orders.client_last_name"),
				res.__("admin.orders.last_status_updated_on"),
				res.__("admin.orders.total_order_amount"),
				res.__("admin.orders.net_order_amount"),
				res.__("admin.orders.discount_value"),
				res.__("admin.orders.delivery_duration"),
				res.__("admin.orders.notes"),
				res.__("admin.orders.time_passed"),
				res.__("admin.orders.delivery_by"),
				res.__("admin.orders.partner_name"),
				res.__("admin.orders.rejection_reason"),
				res.__("admin.orders.delivery_address"),
				res.__("admin.orders.payment_method"),
				res.__("admin.orders.delivery_latitude"),
				res.__("admin.orders.delivery_longitude"),
				res.__("admin.orders.source_name")
			];

			let fileData = [];
			for (const records of tmpCursor) {
				let tmpSource 	=	records.source;
				let tmpRestId 	=	records.restaurant_id;
				let sourceName 	=	(resSrcObj[tmpRestId] && resSrcObj[tmpRestId][tmpSource]) ? resSrcObj[tmpRestId][tmpSource] : (srcObj[tmpSource] ? srcObj[tmpSource].name : "");
				let deliveryDuration 		  = (records.delivery_duration)		      ? records.delivery_duration 		    :0;
				let remainingDeliveryDuration = (records.remaining_delivery_duration) ? records.remaining_delivery_duration :0;
				let timePassed 				  = deliveryDuration-remainingDeliveryDuration;
				let customerAddress = (records.customer_address_detail) ? records.customer_address_detail :{};
				let addFirstName 	= customerAddress.first_name  ? customerAddress.first_name : "";
				let addLastName 	= customerAddress.last_name  ? customerAddress.last_name : "";
				let fullName 		= addFirstName+(addLastName ? " "+addLastName :"");
				let mobileNumber 	= (customerAddress.mobile_number )  ? customerAddress.mobile_number 					: "";
				let addressType 	= (customerAddress.address_type ) 	? customerAddress.address_type 						: "";
				let blockName 		= (customerAddress.block_name ) 	? customerAddress.block_name[Constants.DEFAULT_LANGUAGE_CODE] : "";
				let street 			= (customerAddress.street ) 		? customerAddress.street 							: "";
				let areaName 		= (customerAddress.area_name ) 		? customerAddress.area_name[Constants.DEFAULT_LANGUAGE_CODE]  : "";
				let cityName 		= (customerAddress.city_name ) 		? customerAddress.city_name[Constants.DEFAULT_LANGUAGE_CODE]  : "";
				let orderStatus 	= (records.admin_status && Constants.ORDER_STATUS_TYPES[records.admin_status]) ? Constants.ORDER_STATUS_TYPES[records.admin_status].status_name : "";
				let confirmStatus 	= (records.is_confirm == false) ? res.__('admin.orders.not_confirmed') : "";
				let modifiedStatus 	= (records.is_modified && records.admin_status == Constants.ORDER_PENDING) ? res.__('admin.orders.modified_order') : "";

				fileData.push([
					(records.mobile_number)	? records.mobile_number :"",
					(records.invoice_number)	? records.invoice_number 			:"",
					(records.unique_order_id)	? records.unique_order_id			:"",
					(records.restaurant_name)	? records.restaurant_name[Constants.DEFAULT_LANGUAGE_CODE] 	 :"",
					(records.order_date)		? Helper.newDate(records.order_date,Constants.AM_PM_FORMAT_WITH_DATE) :"",
					(orderStatus && confirmStatus && modifiedStatus) ? orderStatus+", "+confirmStatus+", "+modifiedStatus : orderStatus,
					(records.first_name) ? records.first_name : "",
					(records.last_name) ? records.last_name : "",
					(records.last_status_updated_on) ? 	Helper.newDate(records.last_status_updated_on,Constants.AM_PM_FORMAT_WITH_DATE) :"",
					(records.order_price)    ? Helper.currencyFormat(records.order_price)    : Helper.currencyFormat(0),
					(records.net_amount)  	 ? Helper.currencyFormat(records.net_amount)     : Helper.currencyFormat(0),
					(records.discount_price) ? Helper.currencyFormat(records.discount_price) : Helper.currencyFormat(0),
					deliveryDuration+" "+res.__('admin.orders.min'),
					(records.request_note) ? records.request_note : "",
					(!isNaN(timePassed))   ? timePassed+" "+res.__('admin.orders.min') : 0+" "+res.__('admin.orders.min'),
					(records.delivery_type)    ? Constants.DELIVERY_BY[records.delivery_type] : "",
					(records.partners)         ? Constants.PARTNERS[records.partners]         : "",
					(records.rejection_reason) ? records.rejection_reason           : "",
					(fullName) ? fullName+", "+mobileNumber+", "+addressType+", "+blockName+", "+street+", "+areaName+", "+cityName : "",
					(records.payment_method ) 		? 	Constants.PAYMENT_METHODS[records.payment_method] : '',
					(records.customer_latitude )	? 	records.customer_latitude 	:"",
					(records.customer_longitude )	? 	records.customer_longitude 	:"",
					sourceName,
				]);
			};

			/**  Function to export data in excel format **/
			Helper.exportToExcel(req,res,{
				file_prefix 		: "OrderReport",
				heading_columns		: commonColls,
				export_data			: fileData
			});
		}catch(err){
			return next(err);
		}		
	};// end exportData()

	/**
	 * Function for get area list
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 * @param next 	As Callback argument to the middleware function
	 *
	 * @return render/json
	 */
	async getAreaList  (req, res, next){
		let cityId	= (req.body.city_id) ? req.body.city_id :"";

		/** Send error response */
		if(!cityId) return res.send({ status: Constants.STATUS_ERROR, message: res.__("system.something_going_wrong_please_try_again") });

		/** Get area list */
		let response = await Helper.getAreaList(req,res,next,req.body);

		/** Send response  */
		res.send({status : Constants.STATUS_SUCCESS, result : response});
	};//End Helper.getAreaList()

	/**
	 * Function for get block list
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 * @param next 	As Callback argument to the middleware function
	 *
	 * @return render/json
	 */
	async getBlockList   (req, res, next){
		let areaId	= (req.body.area_id) ? req.body.area_id :"";

		/** Send error response */
		if(!areaId) return res.send({ status: Constants.STATUS_ERROR, message: res.__("system.something_going_wrong_please_try_again") });

		/** Get area list */
		let response = await Helper.getBlockList(req,res,next,req.body);

		/** Send response  */
		res.send({status : Constants.STATUS_SUCCESS, result : response});
	};//End getBlockList()

	/**
	 * Function for add address
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 * @param next 	As Callback argument to the middleware function
	 *
	 * @return render/json
	 */
	async addAddress  (req, res, next){
		try{
			let addressId	=	(req.params.id)	 	 	? 	new ObjectId(req.params.id) 	  :new ObjectId();
			let orderId		=	(req.params.order_id) 	?	new ObjectId(req.params.order_id) :"";

			if(Helper.isPost(req)){
				/** Sanitize Data **/
				req.body 			= 	Helper.sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
				let latitude 		=	(req.body.latitude) 		?	req.body.latitude	:0;
				let longitude 		=	(req.body.longitude)		?	req.body.longitude	:0;
				let cityId	 		=	(req.body.city_id)			?	new ObjectId(req.body.city_id)		:'';
				let areaId	 		=	(req.body.area_id)			?	new ObjectId(req.body.area_id)		:'';
				let blockId	 		=	(req.body.block_id)			?	new ObjectId(req.body.block_id)		:'';
				let venue	 		=	(req.body.venue)			?	req.body.venue					:'';
				let updateAddress 	=	(req.body.update_in_customer_address)	?	true				:"";

				/** Apply validation */
				let validationResponse = await Helper.applyValidationInterCallFunction(req, res, next, addEditAddressValidation);
				if(validationResponse.status != Constants.STATUS_SUCCESS) return validationResponse;

				const cities 		= 	this.db.collection(Tables.CITIES);
				const areas 		= 	this.db.collection(Tables.AREAS);
				const area_blocks 	= 	this.db.collection(Tables.AREA_BLOCKS);
				asyncParallel({
					order_data : (callback)=>{
						/** Get order details */
						this.orderCollection.findOne({_id : orderId},{projection:{first_name:1,last_name:1,customer_id:1,branch_id:1,restaurant_id:1,delivery_fee:1,captain_id:1,unique_order_id:1,delivery_status:1,assigned_captain:1}}).then(orderResult=>{
							callback(null,orderResult);
						}).catch(next);
					},
					order_subdetails : (callback) => {
						this.orderDetailsCollection.findOne({order_id : orderId},{projection : { _id:1,delivery_area_id:1,corporate_delivery_fees:1,composite_delivery_fees:1,offer_delivery_fees:1 }}).then(result=>{
							callback(null,result);
						}).catch(next);
					},
					city_details: (callback)=>{
						/** Get city names */
						cities.findOne({_id : cityId },{projection : {_id: 1,name: 1}}).then(cityResult=>{
							callback(null,cityResult);
						}).catch(next);
					},
					area_details: (callback)=>{
						/** Get area names */
						areas.findOne({_id : areaId},{projection : {_id: 1,name: 1}}).then(areaResult=>{
							callback(null,areaResult);
						}).catch(next);
					},
					block_details: (callback)=>{
						/** Get block names */
						area_blocks.findOne({_id : blockId},{projection : {_id: 1,name: 1}}).then(blockResult=>{
							callback(null,blockResult);
						}).catch(next);
					},
				}, async (err, response)=>{
					if(err) return next(err);

					if(!response.order_data || !response.order_subdetails || !response.city_details || !response.area_details || !response.block_details){
						return res.send({status: Constants.STATUS_ERROR, message :res.__("admin.system.something_going_wrong_please_try_again"), response: response });
					}

					let orderData			=	response.order_data;
					let orderSubdetails		= 	response.order_subdetails;
					let oldAreaId			= 	orderSubdetails.delivery_area_id;
					let oldDeliveryFees		= 	orderData.delivery_fee;
					let cityDetail			=	response.city_details;
					let areaDetail			=	response.area_details;
					let blockDetail			=	response.block_details;
					let userId				=	(orderData.customer_id) 	? 	orderData.customer_id 	:'';
					let firstName			=	(orderData.first_name) 		? 	orderData.first_name 	:'';
					let lastName			=	(orderData.last_name) 		? 	orderData.last_name 	:'';
					let branchId			=	(orderData.branch_id) 		? 	orderData.branch_id 	:'';
					let restId				=	(orderData.restaurant_id) 	? 	orderData.restaurant_id	:'';
					let captainId			=	orderData.captain_id		?	orderData.captain_id	:(orderData.assigned_captain ? orderData.assigned_captain :"");
					let uniqueOrderId		=	orderData.unique_order_id;
					let corporateDelFees	= 	orderData.corporate_delivery_fees;
					let compositeDelFees	= 	orderData.composite_delivery_fees;
					let offerDeliveryFees	= 	orderData.offer_delivery_fees;
					latitude				=	(latitude) 	? parseFloat(latitude) 	:0;
					longitude				=	(longitude) ? parseFloat(longitude) :0;

					/** Check branch delivered selected area or not */
					req.body.restaurant_id 	=	restId;
					req.body.branch_id 		=	branchId;
					let addressRes = await this.cartAPI.checkDeliveryAddress(req, res, next);

					let validAddress 	=	(addressRes.is_delivery) 		? 	addressRes.is_delivery 		:false;
					let braAreaDetails	=	(addressRes.area_details) 		? 	addressRes.area_details 	:{};
					let newDeliveryFees	=	(braAreaDetails.delivery_fees)	? 	braAreaDetails.delivery_fees:0;
					if(!validAddress){
						return res.send({status: Constants.STATUS_ERROR, message: res.__("admin.orders.please_select_valid_address")});
					}

					if(String(oldAreaId) != String(areaId) && !corporateDelFees && !compositeDelFees && !offerDeliveryFees){
						if(newDeliveryFees != oldDeliveryFees){
							return res.send({status: Constants.STATUS_ERROR, message :res.__("admin.orders.not_allow_for_different_delivery_fees") });
						}
					}

					/** Update address in customer address collection */
					if(updateAddress){
						req.body.id			=	addressId;
						req.body.user_id	=	userId;
						let addressResponse = await this.customerAddressAPI.addEditAddress(req, res,next);

						if(addressResponse.status != Constants.STATUS_SUCCESS) return res.send(addressResponse);
					}

					/** Set update data */
					let updateData	=	{
						delivery_area_id		:	areaId,
						customer_address		:	venue,
						customer_latitude		:	latitude,
						customer_longitude		:	longitude,
						customer_long_lat		:	[longitude,latitude],
						customer_address_detail :	{
							city_id					: 	cityId,
							area_id					:	areaId,
							block_id				: 	blockId,
							first_name				:	firstName,
							last_name				:	lastName,
							country					:	Constants.COUNTRY_NAME,
							latitude				:	latitude,
							longitude				:	longitude,
							city_name				:	cityDetail.name,
							area_name				:	areaDetail.name,
							block_name				:	blockDetail.name,
							additional_directions	:	(req.body.additional_directions)?	req.body.additional_directions	:'',
							building_number 		: 	(req.body.building_number)		?	req.body.building_number		:'',
							flat_number				:	(req.body.flat_number)			?	req.body.flat_number			:'',
							floor_number			:	(req.body.floor_number)			?	req.body.floor_number			:'',
							jadda					:	(req.body.jadda)				?	req.body.jadda					:'',
							street					:	(req.body.street)				?	req.body.street					:'',
							venue					:	(req.body.venue)				?	req.body.venue					:'',
						},
					};

					if(newDeliveryFees){
						if(corporateDelFees) updateData.corporate_delivery_fees = newDeliveryFees;
						if(compositeDelFees) updateData.composite_delivery_fees = newDeliveryFees;
						if(offerDeliveryFees)updateData.offer_delivery_fees 	= newDeliveryFees;
					}

					/** Update address details in orders */
					await this.orderDetailsCollection.updateOne({order_id: orderId},{$set: updateData});

					/** Send success response */
					req.flash(Constants.STATUS_SUCCESS,res.__("admin.orders.customer_address_has_been_updated_successfully"));
					res.send({status: Constants.STATUS_SUCCESS, message: res.__("admin.orders.customer_address_has_been_updated_successfully") });

					/** Notification to driver for address changed */
					if(captainId){
						let deliveryStatus 	=	orderData.delivery_status;
						let tmpStatus 		= 	(!orderData.captain_id) ? Constants.ORDER_DRIVER_ASSIGNED :"";
						if(orderData.captain_id && deliveryStatus){
							if([Constants.ORDER_DRIVER_ACCEPTED, Constants.ORDER_DRIVER_ARRIVED_AT_RESTAURANT].indexOf(deliveryStatus) >=0) tmpStatus = Constants.ORDER_DRIVER_ACCEPTED;
							if([Constants.ORDER_DRIVER_WAY_TO_CUSTOMER, Constants.ORDER_DRIVER_ARRIVED_AT_CUSTOMER_LOCATION].indexOf(deliveryStatus) >=0) tmpStatus = Constants.ORDER_DRIVER_WAY_TO_CUSTOMER;
						}

						sendMailToUsers(req,res,{
							event_type 		:	Constants.NOTIFICATION_TO_DRIVER_ORDER_ADDRESSED_CHANGED,
							order_id		: 	orderId,
							unique_order_id	: 	uniqueOrderId,
							driver_id		: 	captainId,
							extra_parameters: 	{status: tmpStatus},
						});
					}

					/** save System logs */
					saveSystemLogs(req, res, {
						user_id				: req.session.user._id,
						parent_id			: orderId,
						activity_module		: Constants.SYSTEM_LOG_MODULE_ORDERS,
						activity_type		: Constants.ACTIVITY_TYPE_UPDATE_ORDER_ADDRESS,
						additional_details	: {
							new_area_id: areaId,
							old_area_id: oldAreaId,
							new_delivery_fees		:	newDeliveryFees,
							old_delivery_fees		: 	oldDeliveryFees,
							corporate_delivery_fees	: 	corporateDelFees,
							composite_delivery_fees	: 	compositeDelFees,
							offer_delivery_fees		: 	offerDeliveryFees,
						}
					});			
				});
			}else{
				let orderDetails = await this.orderDetailsCollection.findOne({order_id: new ObjectId(orderId)},{projection:{customer_address_id:1,customer_address_detail:1}});

				if(!orderDetails){
					return res.status(400).send({ status: Constants.STATUS_ERROR,message: res.__("admin.system.invalid_access") });
				}
				
				let customerAddressId =	orderDetails?.customer_address_id ||'';
				let orderAddress =	orderDetails?.customer_address_detail || {};
				let cityId	 = orderAddress?.city_id || '';
				let areaId	 = orderAddress?.area_id || '';
				let blockId	 = orderAddress?.block_id || '';
				
				/** Get city list  */
				let cityList = await Helper.getCityList(req,res,next,{city_id: cityId});
				
				/** Get area list  */
				let areaList = "";
				if(cityId) areaList = await Helper.getAreaList(req,res,next,{city_id: cityId, area_id: areaId});
				
				/** Get area block list  */
				let blockList = "";
				if(areaId) blockList =  await Helper.getBlockList(req,res,next,{area_id: areaId, block_id: blockId});
			
				/** render add page **/
				res.render('add',{
					layout		: false,
					city_list 	: cityList,
					area_list 	: areaList,
					block_list 	: blockList,
					order_id	: orderId,
					result		: orderAddress,
					customer_address_id	: customerAddressId,
				});
			}
		}catch(err){
			return next(err);
		}	
	};//End addAddress

	/**
	 * Function for update order status
	 *
	 * @param req 	As 	Request Data
     * @param res 	As 	Response Data
     * @param next 	As 	Callback argument to the middleware function
	 *
	 * @return render
	 */
	async confirmStatus  (req, res, next){
		let orderId = req.params.order_id;
		if(Helper.isPost(req)){
			/** Sanitize Data **/
			req.body	= Helper.sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
			let authId	= req.session.user._id;
			let confirmStatus = (req.body.confirm_status.constructor === Array) ? req.body.confirm_status : [req.body.confirm_status];

			let dataToBeUpdated = [];
			confirmStatus.map(key=>{
				let tmpRecord = {update_by : new ObjectId(authId), updated_on : Helper.getUtcDate()};
				tmpRecord[key]= true;
				dataToBeUpdated.push(tmpRecord);
			});

			await this.orderCollection.updateOne({
				_id : new ObjectId(orderId)
			},
			{
				$set : {modified	: Helper.getUtcDate()},
				$addToSet :{confirm_status	: {$each : dataToBeUpdated}},
			});

			/** Send success response */
			req.flash(Constants.STATUS_SUCCESS,res.__("admin.orders.status_has_been_confirmed_successfully"));
			res.send({
				status	: Constants.STATUS_SUCCESS,
				redirect_url : Constants.WEBSITE_ADMIN_URL+"orders_tracking",
			});

			/** save System logs */
			saveSystemLogs(req, res, {
				user_id				: req.session.user._id,
				parent_id			: orderId,
				activity_module		: Constants.SYSTEM_LOG_MODULE_ORDERS,
				activity_type		: Constants.ACTIVITY_TYPE_STATUS_UPDATE,
				additional_details	: {}
			});
		}else{
			/** Get detail of Order **/
			let orderResult = await this.orderCollection.findOne({
				_id : new ObjectId(orderId)
			},{projection: {
				_id:1,is_delayed_acceptance:1,is_delayed_picked_up_by_customer:1,is_delayed_pickup:1,delivery_type : 1,is_delayed_pickup_by_captain:1,is_delayed_preperation:1,is_delayed_delivery:1,confirm_status:1
			}});

			/** Send error response */
			if(!orderResult) return res.status(400).send({ status: Constants.STATUS_ERROR,message: res.__("admin.system.invalid_access") });
				
			let confirmedStatusObj = {};
			if(orderResult.confirm_status && orderResult.confirm_status.length > 0){
				orderResult.confirm_status.map(record=>{
					Object.keys(record).map(recordKeys=>{
						if(recordKeys == "is_delayed_pickup" && orderResult.delivery_type == Constants.DELIVERY_BY_RESTAURANT){
							recordKeys = "delayed_pickup_by_restaurant";
						}
						if(ORDERS_RULES_STATUS[recordKeys]) confirmedStatusObj[recordKeys] = true;
					});
				});
			}

			let isValid = false;
			Object.keys(Constants.ORDERS_RULES_STATUS).map(delayStatus=>{
				let tmpStatusKey = delayStatus;
				if(tmpStatusKey == "delayed_pickup_by_restaurant" && orderResult.delivery_type == Constants.DELIVERY_BY_RESTAURANT){
					tmpStatusKey = "is_delayed_pickup";
				}
				if(orderResult[tmpStatusKey] && !confirmedStatusObj[delayStatus]) isValid = true;
			});

			if(!isValid) return res.status(400).send({ status: Constants.STATUS_ERROR,message: res.__("admin.orders.no_status_to_confirm") });

			/** Render confirm status page */
			res.render('confirm_status',{
				layout				: false,
				result				: orderResult,
				confirmed_statuses	: confirmedStatusObj
			});
		}
	};//End confirmStatus()

	/**
	 * Function for order transfer
	 *
	 * @param req 	As 	Request Data
     * @param res 	As 	Response Data
     * @param next 	As 	Callback argument to the middleware function
	 *
	 * @return render
	 */
	async updateBranch (req, res, next){
		let orderId = new ObjectId(req.params.order_id);
		if(Helper.isPost(req)){
			/** Sanitize Data **/
			req.body			 =	Helper.sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
			let transferBranchId = 	(req.body.transfer_branch_id) ? new ObjectId(req.body.transfer_branch_id) :"";

			/**Function use to update branch for order transfer */
			let response = await this.updateBranchForOrderTransfer(req,res,next,{
				order_id			:	orderId,
				transfer_branch_id	: 	transferBranchId,
				updated_by   		: 	req.session.user._id,
				updated_by_role_id  :	req.session.user.user_role_id,
			});

			/**Send success response */
			if(response?.status == Constants.STATUS_SUCCESS){
				if(response?.tmp_status && response?.message) req.flash(response?.tmp_status,response?.message);
				if(response?.new_order_id) response.redirect_url = Constants.WEBSITE_ADMIN_URL+"orders/view/"+response?.new_order_id;
				else response.redirect_url = Constants.WEBSITE_ADMIN_URL+"orders";
			}
			res.send(response);
		}else{
			/** Get detail of Order **/
			let orderResult = await this.orderCollection.findOne({_id : orderId },{projection: {_id:1,branch_id: 1,restaurant_id:1}});

			/** send error response */
			if(!orderResult) return res.status(400).send({status: Constants.STATUS_ERROR, message :res.__("admin.system.invalid_access") });

			/**Get dropdown list **/
			let dropDownResponse = await Helper.getDropdownList(req,res, next,{
				collections :[
					{
						collection : Tables.RESTAURANT_BRANCHES,
						columns    : ["_id",["name",Constants.DEFAULT_LANGUAGE_CODE]],
						conditions : {
							restaurant_id 	: orderResult.restaurant_id,
							is_active	  	: Constants.ACTIVE,
							_id				: {$ne : orderResult.branch_id }
						},
					}
				],
			});

			/** send error response */
			if(dropDownResponse.status != Constants.STATUS_SUCCESS) return res.status(400).send(dropDownResponse);
			
			/** Render order transfer page  */
			res.render('order_transfer',{
				layout		: 	false,
				branch_list	:	dropDownResponse?.final_html_data?.[0] || "",
				order_id	: 	orderId,
			});
		}
	};//End updateBranch()

	/**
	 * Function used to update branch order transfer
	 *
	 * @param req 	As 	Request Data
     * @param res 	As 	Response Data
     * @param next 	As 	Callback argument to the middleware function
	 *
	 * @return render
	 */
	async updateBranchForOrderTransfer  (req,res,next,options){
		return new Promise(async resolve=>{
			try{
				let authId				= 	(options.updated_by) 			?	options.updated_by 				:"";
				let authRoleId			= 	(options.updated_by_role_id)	? 	options.updated_by_role_id		:"";
				let authUserName		= 	(options.updated_by_user_name)	? 	options.updated_by_user_name	:"";
				let orderId				= 	(options.order_id) 			 	? 	new ObjectId(options.order_id)		:"";
				let transferBranchId	= 	(options.transfer_branch_id) 	?	new ObjectId(options.transfer_branch_id) :"";

				/** Send error response */
				if(!transferBranchId || !orderId || !authId || !authRoleId) return resolve({status: Constants.STATUS_ERROR, message: res.__("system.missing_parameters") });

				/** Get order details */
				let orderResult = await this.orderCollection.findOne({_id: orderId},{projection: {_id:0,main_order_id:0}});

				/** send error response */
				if(!orderResult) return resolve({ status: Constants.STATUS_ERROR,message: res.__("system.invalid_access"),});

				let userId			=	orderResult.customer_id;
				let mobileNumber	=	orderResult.mobile_number;
				let restaurantId	=	orderResult.restaurant_id;
				let orderStatus 	=	orderResult.order_status;
				let isSchedule 		=	orderResult.is_schedule;
				let isConfirm 		=	orderResult.is_confirm;
				let cancelReasonId	=	clone(Constants.CANCELLED_ORDER_TRANSFER);
				let transferFromId	=	orderResult.branch_id;
				let scheduledToSubmitTime=	orderResult.scheduled_to_submit_time;

				asyncParallel({
					order_detail: (parentCallback)=>{
						/** Get order sub details */
						this.orderDetailsCollection.findOne({order_id : orderId },{projection : {_id: 0, order_id: 0}}).then(detailResult=>{
							parentCallback(null,detailResult);
						}).catch(next);
					},
					order_items: (parentCallback)=>{
						/** Get order item details */
						this.orderItemCollection.find({ order_id : orderId },{projection : {_id : 0, order_id:0}}).toArray().then(itemResult=>{
							parentCallback(null,itemResult);
						}).catch(next);
					},
					unique_order_id: (parentCallback)=>{
						/** Get order count  */
						let currentDate = Helper.newDate(Helper.newDate("",Constants.CURRENTDATE_START_DATE_FORMAT));
						const unique_order_ids = this.db.collection(Tables.UNIQUE_ORDER_IDS);
						unique_order_ids.findOneAndUpdate({
							order_date: {$gte: currentDate},
						},
						{
							$inc : {
								order_count: 1
							},
							$setOnInsert: {
								order_date : currentDate,
							}
						},{upsert:true, projection :{order_count: 1}}).then(orderCount=>{
							orderCount = (orderCount?.order_count || 0)+1;

							/** get order unqiue id **/
							Helper.getUniqueId(req,res,next,{
								type 		: "orders",
								order_count : orderCount,
							}).then(uniqueIdResponse=>{
								parentCallback(null,uniqueIdResponse.result);
							}).catch(next);
						}).catch(next);
					},
					invoice_number : (parentCallback)=>{
						/** get invoice unqiue number **/
						Helper.getUniqueId(req,res,next,{type: "order_invoice_number", client_number: mobileNumber }).then(uniqueIdResponse=>{
							parentCallback(null,uniqueIdResponse.result);
						}).catch(next);
					},
					transaction_id : (parentCallback)=>{
						return parentCallback(null, String(new ObjectId()));
					},
					cancel_reason_title :(parentCallback)=>{
						/** Get cancel reason title */
						const cancel_reasons = this.db.collection(Tables.CANCEL_REASONS);
						cancel_reasons.findOne({_id: new ObjectId(cancelReasonId)},{projection: {title:1}}).then(resResult=>{
							let reasonTitle = resResult?.title?.[Constants.DEFAULT_LANGUAGE_CODE] || "";
							parentCallback(null, reasonTitle);
						}).catch(next);
					},
					rest_details :(callback)=>{
						/** Get restaurant details  */
						const restaurants	=	this.db.collection(Tables.RESTAURANTS);
						restaurants.findOne({_id: restaurantId },{projection: {_id:1, aghzeya_restaurant_id: 1 }}).then(result=>{
							callback(null, result);
						}).catch(next);
					},
					branch_details: (callback)=>{
						/** Get restaurant branch details  */
						const restaurant_branches =	this.db.collection(Tables.RESTAURANT_BRANCHES);
						restaurant_branches.findOne({_id: transferBranchId },{projection: {latitude:1, longitude:1, long_lat:1, area_id:1 }}).then(result=>{
							callback(null, result);
						}).catch(next);
					},
				},(err, response)=>{
					if(err) return next(err);

					/** send error response */
					if(!response.order_detail || response.order_items.length == 0 || !response.rest_details || !response.branch_details){
						return resolve({ status: Constants.STATUS_ERROR,message: res.__("system.invalid_access") });
					}

					asyncParallel({
						mark_cancelled :(subCallback)=>{
							/** Send cancel request to aghzeya api. if aghzeya api is cancel this order then order cancel in our system other wise not */
							this.markAghzeyaOrderToCancelled(req,res,next,{
								order_id			: 	orderId,
								restaurant_id		: 	restaurantId,
								reason_id			:	cancelReasonId,
								cancelled_user_name	:	authUserName,
							}).then(cancelledResponse=>{
								subCallback(null, cancelledResponse);
							}).catch(next);
						},
					},async (_, asyncSubResponse)=>{

						/** Send error response */
						if(asyncSubResponse.mark_cancelled && asyncSubResponse.mark_cancelled.status != Constants.STATUS_SUCCESS){

							await this.orderCollection.updateOne({_id : orderId},{$set : {cancel_transfer_branch_id: transferBranchId}});

							/** Send response */
							return resolve(asyncSubResponse.mark_cancelled);
						}else{
							let restDetails 		= 	response.rest_details;
							let aghzeyaRestId 		=	restDetails.aghzeya_restaurant_id;
							let uniqueOrderId		=	response.unique_order_id;
							let mainOrderId			=	String(new ObjectId());
							let invoiceNumber		=	response.invoice_number;
							let transactionId		=	response.transaction_id;
							let orderItems			=	response.order_items;
							let cancelReasonTitle 	=	response.cancel_reason_title;
							let orderDetailResult	=	response.order_detail;
							let newOrderStatus		=	(isConfirm) ? Constants.ORDER_SUBMITTED :Constants.ORDER_PENDING;
							let branchDetails 		= 	response.branch_details;
							let orderSendToApi		=	true;

							if(isSchedule && !scheduledToSubmitTime){
								orderSendToApi = false;
								newOrderStatus = Constants.ORDER_SCHEDULED;
							}

							if(orderStatus == Constants.ORDER_PAYMENT_PENDING || orderStatus == Constants.ORDER_PAYMENT_FAILED){
								orderSendToApi = false;
								newOrderStatus = orderStatus;
							}

							let newOrderId				=	new ObjectId();
							orderResult.captain_id		=	"";
							orderResult.branch_id		=	new ObjectId(transferBranchId);
							orderResult.order_status	=	newOrderStatus;
							orderResult.main_order_id	=	mainOrderId;
							orderResult.unique_order_id	=	uniqueOrderId;
							orderResult.invoice_number	=	invoiceNumber;
							orderResult.transaction_id	=	transactionId;
							orderResult.branch_area_id	=	branchDetails.area_id;

							if(orderResult.assigned_captain) delete orderResult.assigned_captain;
							if(orderResult.assignment_type)  delete orderResult.assignment_type;
							if(orderResult.time_of_arrival)  delete orderResult.time_of_arrival;
							if(orderResult.delivery_status)  delete orderResult.delivery_status;
							if(orderResult.driver_status)	 delete orderResult.driver_status;
							if(orderResult.aghzeya_bill_no)	 delete orderResult.aghzeya_bill_no;
							if(orderResult.simphonyCheckRef) delete orderResult.simphonyCheckRef;
							if(orderResult.order_estimate_time)	 	   	delete orderResult.order_estimate_time;
							if(orderResult.aghzeya_transaction_no)	   	delete orderResult.aghzeya_transaction_no;
							if(orderResult.assigned_captain_status)    	delete orderResult.assigned_captain_status;
							if(orderResult.cancel_transfer_branch_id)  	delete orderResult.cancel_transfer_branch_id;
							if(orderResult.order_assignment_start_time)	delete orderResult.order_assignment_start_time;
							if(orderResult.order_estimate_time)			delete orderResult.order_estimate_time;
							if(orderResult.gfc_cancel_retry)  			delete orderResult.gfc_cancel_retry;
							if(orderResult.gfc_push_retry)  			delete orderResult.gfc_push_retry;
							if(orderResult.gfc_modified_push_retry)  	delete orderResult.gfc_modified_push_retry;
							if(orderResult.tmp_cancel_reason_id)		delete orderResult.tmp_cancel_reason_id;
							if(orderResult.dhub_push_retry)  			delete orderResult.dhub_push_retry;
							if(orderResult.dhub_order_id)  				delete orderResult.dhub_order_id;
							if(orderResult.dhub_process_time)  			delete orderResult.dhub_process_time;
							if(orderResult.push_cancel_gfc_process_time)delete orderResult.push_cancel_gfc_process_time;
							if(typeof orderResult.cravez_payout != undefined)  		delete orderResult.cravez_payout;
							if(typeof orderResult.payout_percentage != undefined)  	delete orderResult.payout_percentage;
							if(typeof orderResult.restaurant_payout != undefined)  	delete orderResult.restaurant_payout;

							asyncParallel({
								previous_order_data : (callback)=>{
									/** Cancel old order  */
									this.orderCollection.updateOne({
										_id : orderId
									},
									{
										$set : {
											order_status			: 	Constants.ORDER_CANCELLED,
											rejection_reason		: 	cancelReasonTitle,
											cancel_reason_id		: 	new ObjectId(cancelReasonId),
											cancelled_user_role_id	: 	authRoleId,
											modified 				: 	Helper.getUtcDate()
										},
										$unset : {
											cancel_transfer_branch_id: 	1
										},
									}).then(()=>{
										callback(null);
									}).catch(next);
								},
								new_order : (callback)=>{
									/** Save order details   */
									this.orderCollection.updateOne({_id: newOrderId },{$set: orderResult},{upsert: true}).then(()=>{
										callback(null);
									}).catch(next);
								},
								insert_order_detail : (childCallback)=>{
									let braLatitude		= 	(branchDetails.latitude)	?	branchDetails.latitude	:0;
									let braLongitude	= 	(branchDetails.longitude)	?	branchDetails.longitude	:0;

									orderDetailResult.order_transfer_id		= 	new ObjectId(transferFromId);
									orderDetailResult.order_id				= 	newOrderId;
									orderDetailResult.unique_order_id		=	uniqueOrderId;
									orderDetailResult.transaction_id		=	transactionId;
									orderDetailResult.restaurant_latitude	=	braLatitude;
									orderDetailResult.restaurant_longitude	=	braLongitude;
									orderDetailResult.restaurant_long_lat	=	[braLongitude, braLatitude];

									/** Save order sub details */
									this.orderDetailsCollection.insertOne(orderDetailResult).then(()=>{
										childCallback(null);
									}).catch(next);
								},
								order_items : (childCallback)=>{
									/** Add order id */
									orderItems.map(data => {
										data.order_id	=	new ObjectId(newOrderId);
									});

									/** Save order items */
									this.orderItemCollection.insertMany(orderItems).then(()=>{
										childCallback(null);
									}).catch(next);
								},
								branh_transfer_log : (childCallback)=>{
									const branch_transfer_logs	=	this.db.collection(Tables.BRANCH_TRANSFER_LOGS);
									branch_transfer_logs.insertOne({
										order_id 		: 	new ObjectId(orderId),
										new_order_id	: 	newOrderId,
										from_branch 	: 	new ObjectId(transferFromId),
										to_branch		:	new ObjectId(transferBranchId),
										order_transfer 	: 	true,
										order_transfer_by : new ObjectId(authId),
										time 			: 	Helper.getUtcDate()
									}).then(()=>{
										childCallback(null);
									}).catch(next);
								},
								update_old_order_status : (childCallback)=>{
									childCallback(null);

									/** Save old order status logs */
									Helper.saveOrderStatusLogs(req,res,next,{
										order_id 		: 	orderId,
										user_id			:	userId,
										updated_by 		: 	authId,
										user_role_id	:	Constants.CUSTOMER,
										user_type		:	Constants.USER_TYPE_CUSTOMER,
										status 			:	Constants.ORDER_CANCELLED,
										order_status 	:	orderStatus,
										changed_by_admin:	true,
										notSendNotification: true,
										restaurant_id	:	restaurantId
									});
								},
							},async (err)=>{
								if(err) return next(err);

								/** Push To Third api */
								let placeRes = await this.placeOrderModule.callAfterPlaceOrder(req,res,next,{
									order_id 		:	newOrderId,
									admin_id 		: 	authId,
									customer_id 	: 	userId,
									is_aghzeya 		: 	(aghzeyaRestId) 	? 	true :false,
									is_schedule 	: 	(!orderSendToApi)	?	true :false,
									is_confirm 		: 	isConfirm,
									updated_status 	: 	newOrderStatus,
									current_status 	: 	newOrderStatus,
									restaurant_id 	: 	restaurantId,
									unique_order_id	: 	uniqueOrderId,
									simphony		: 	orderResult.simphony || false,
									is_modify		: 	false
								});								

								/** Send success response */
								let tmpMessage = (placeRes.status != Constants.STATUS_SUCCESS) ? placeRes.message : res.__("admin.orders.branch_has_been_transferred_successfully");
								resolve({
									status		: Constants.STATUS_SUCCESS,
									message 	: tmpMessage,
									new_order_id: newOrderId,
									tmp_status  : placeRes.status
								});

								/** Calculate payout */
								Helper.calculateOrderPayout(req,res,next,{order_id: newOrderId });
							});
						}
					});
				});
			}catch(err){
				return next(err);
			}
		}).catch(next);
	};//End updateBranchForOrderTransfer()

	/**
	 * Function for resend order payment link
	 *
	 * @param req 	As 	Request Data
     * @param res 	As 	Response Data
     * @param next 	As 	Callback argument to the middleware function
	 *
	 * @return render
	 */
	async resendLink  (req, res, next){
		let orderId = new ObjectId(req.params.order_id);

		/** Get order details */
		let orderResult = await this.orderCollection.aggregate([
			{$match	: {
				_id : orderId,
				$or : [
					{order_unpaid_amount: {$exists: false}},
					{order_unpaid_amount: {$gt: 0}},
				]
			}},
			{$lookup: {	/** Get user details **/
				from 		:	Tables.USERS,
				localField  :	"customer_id",
				foreignField:	"_id",
				as 		  	:	"user_details"
			}},
			{$project : {
				customer_id:1,restaurant_id:1,order_price:1,full_name: {$arrayElemAt: ["$user_details.full_name",0]},email: {$arrayElemAt: ["$user_details.email",0]},mobile_number: {$arrayElemAt: ["$user_details.mobile_number",0]},cust_tele2: {$arrayElemAt: ["$user_details.cust_tele2",0]},phone_country_code: {$arrayElemAt: ["$user_details.phone_country_code",0]},unique_order_id:1, order_unpaid_amount: 1, is_modified: 1
			}},
		]).toArray();

		if(!orderResult || orderResult.length <=0){
			/** Send error response */
			req.flash(Constants.STATUS_ERROR, res.__("admin.system.invalid_access") );
			return res.redirect(Constants.WEBSITE_ADMIN_URL+"orders");
		}

		let orderDetails 		= 	orderResult[0] || {};
		let orderRestaurantId  	=	orderDetails?.restaurant_id || "";

		const restaurant_payment_settings = this.db.collection(Tables.RESTAURANT_PAYMENT_SETTINGS);
		let upaymentSettings = await restaurant_payment_settings.findOne({ restaurant_id: orderRestaurantId }, { projection: { uInterface_base_url: 1, uInterface_api_key: 1, uInterface_username: 1, uInterface_password: 1, uInterface_authorization_key: 1, uInterface_merchant_id: 1, uInterface_test_mode: 1, uInterface_whitelabled: 1, default_credential: 1 } });

		let getwayPriority 		= (res.locals.settings["Payment.payment_geteway_priority"])?	res.locals.settings["Payment.payment_geteway_priority"] :Constants.MYFATOORAH_PAYMENT_GATEWAY;
		let myfatoorahBaseURL	= 	(res.locals.settings["Payment.myfatoorah_base_url"])	?	res.locals.settings["Payment.myfatoorah_base_url"]	:'';
		let myfatoorahToken		=	(res.locals.settings["Payment.myfatoorah_token"]) 		? 	res.locals.settings["Payment.myfatoorah_token"] 	:'';
		let uInterfaceApiKey	=	(res.locals.settings["Payment.uInterface_api_key"])		? 	res.locals.settings["Payment.uInterface_api_key"]	:'';
		let uInterfaceMerchantId=	(res.locals.settings["Payment.uInterface_merchant_id"])	? 	res.locals.settings["Payment.uInterface_merchant_id"]:'';
		let uInterfaceUsername	=	(res.locals.settings["Payment.uInterface_username"]) 	? 	res.locals.settings["Payment.uInterface_username"] 	:'';
		let uInterfacePassword	=	(res.locals.settings["Payment.uInterface_password"]) 	? 	res.locals.settings["Payment.uInterface_password"] 	:'';
		let uInterfaceTestMode	=	(res.locals.settings["Payment.uInterface_test_mode"]) 	? 	res.locals.settings["Payment.uInterface_test_mode"] :0;
		let uInterfaceBaseUrl	=	(res.locals.settings["Payment.uInterface_base_url"]) 	? 	res.locals.settings["Payment.uInterface_base_url"] 	:'';
		let uInterfaceWhitelabled=	(res.locals.settings["Payment.uInterface_whitelabled"]) ? 	res.locals.settings["Payment.uInterface_whitelabled"]:0;
		let uInterfaceAuthorizationKey=	(res.locals.settings["Payment.uInterface_authorization_key"]) ?	res.locals.settings["Payment.uInterface_authorization_key"] :'';
		let linkExpiryMinute	=	(res.locals.settings["Payment.payment_link_expiry_time"]) ?	parseInt(res.locals.settings["Payment.payment_link_expiry_time"]) :0;
		let paymentExpireTime 	=	Helper.addMinute(linkExpiryMinute);

		/** Override payment settings if restaurant has credential */
		if (upaymentSettings && !upaymentSettings.default_credential) {
			uInterfaceApiKey 		= upaymentSettings.uInterface_api_key;
			uInterfaceMerchantId 	= upaymentSettings.uInterface_merchant_id;
			uInterfaceUsername 		= upaymentSettings.uInterface_username;
			uInterfacePassword 		= upaymentSettings.uInterface_password;
			uInterfaceTestMode 		= upaymentSettings.uInterface_test_mode;
			uInterfaceBaseUrl 		= upaymentSettings.uInterface_base_url;
			uInterfaceWhitelabled 	= upaymentSettings.uInterface_whitelabled;
			uInterfaceAuthorizationKey = upaymentSettings.uInterface_authorization_key;
		}

		let uniqueOrderId	=	orderDetails?.unique_order_id || "";
		let orderPrice		=	orderDetails?.order_price || 0;
		let customerName	=	orderDetails?.full_name || "";
		let customerEmail	=	orderDetails?.email || "";
		let mobileNumber	=	orderDetails?.mobile_number || "";
		let secondaryNumber	=	orderDetails?.cust_tele2 || "";
		let paymentMethod	=	orderDetails?.payment_method || "";
		let customerId		=	orderDetails?.customer_id || "";
		let restaurantId	=	orderDetails?.restaurant_id || "";
		let phoneCountryCode=	orderDetails?.phone_country_code || "";
		let isModified		=	orderDetails?.is_modified || false;
		let orderUnpaidAmount=	orderDetails?.order_unpaid_amount || orderPrice;
		let itemList 		=	[{
			"ItemName"	:	'Order #'+uniqueOrderId,
			"Quantity"	: 	1,
			"UnitPrice"	: 	orderUnpaidAmount
		}];

		let checkNumberValidRes = await Helper.checkNumberValid(req,res,next,{mobile_number :mobileNumber, cust_tele2 :secondaryNumber,payment_method:paymentMethod});
		
		if(checkNumberValidRes.status != Constants.STATUS_SUCCESS){
			/** Send error response */
			req.flash(Constants.STATUS_ERROR, res.__("admin.place_order.you_cant_make_payment") );
			return res.redirect(Constants.WEBSITE_ADMIN_URL+"orders");
		}
		mobileNumber		=	checkNumberValidRes.mobile_number;		
		let requestOptions 	=	{};
		if(getwayPriority == Constants.MYFATOORAH_PAYMENT_GATEWAY){
			let successURL = Constants.WEBSITE_ADMIN_URL+"place_order/payment_success/"+orderId+'/'+customerId+'/'+restaurantId;
			let failureURL = Constants.WEBSITE_ADMIN_URL+"place_order/payment_failure/"+orderId+'/'+customerId+'/'+restaurantId;
			if(isModified){
				successURL = Constants.WEBSITE_RESTAURANT_URL+"modify_orders/modify_success/"+orderId;
			}

			let body	=	{
				"CustomerName"		: 	customerName,
				"NotificationOption": 	customerEmail ? "ALL" : "SMS",
				"MobileCountryCode"	:	phoneCountryCode,
				"CustomerMobile"	: 	mobileNumber,
				"InvoiceValue"		: 	orderUnpaidAmount,
				"DisplayCurrencyIso":	Constants.PAYMENT_GATEWAY_CURRENCY_CODE,
				"CallBackUrl"		: 	successURL,
				"ErrorUrl"			:	failureURL,
				"Language"			:	Constants.ENGLISH_LANGUAGE_CODE,
				"CustomerReference" :	"ref 1",
				"CustomerCivilId"	:	12345678,
				"UserDefinedField"	: 	"Custom field",
				"ExpiryDate"		:	paymentExpireTime,
				"CustomerAddress" 	:	{
					"Block":"", "Street":"", "HouseBuildingNo":"", "Address":"", "AddressInstructions":""
				},
				"InvoiceItems": itemList
			};
			if(customerEmail) body['CustomerEmail'] = customerEmail;

			requestOptions= {
				method: 'post',
				maxBodyLength: Infinity,
				url: myfatoorahBaseURL+'/v2/SendPayment',
				headers: {
					'Authorization': myfatoorahToken,
					'Accept': 'application/json',
					'Content-Type': 'application/json'
				},
				data: body
			};
		}else{
			let tmpPaymentMethod =	(paymentMethod == Constants.CREDIT_PAYMENT)	? Constants.PAYMENT_GATEWAY_CREDIT_CARD :Constants.PAYMENT_GATEWAY_KNET;
			let successURL = Constants.WEBSITE_ADMIN_URL+"place_order/ui_payment_success/"+orderId+'/'+customerId+'/'+restaurantId;
			let failureURL = Constants.WEBSITE_ADMIN_URL+"place_order/ui_payment_failure/"+orderId+'/'+customerId+'/'+restaurantId;
			let webHookUrl = Constants.WEBSITE_ADMIN_URL+"place_order/ui_payment_response/"+orderId+'/'+customerId+'/'+restaurantId;
			if(isModified){
				successURL =	Constants.WEBSITE_RESTAURANT_URL+"modify_orders/ui_modify_success/"+orderId;
				webHookUrl =	Constants.WEBSITE_RESTAURANT_URL+"modify_orders/ui_modify_response/"+orderId;
			}

			let tmpApiKey	 	 =  await bcrypt(uInterfaceApiKey, 10);
			uInterfaceTestMode	 =  parseInt(uInterfaceTestMode);
			if(uInterfaceTestMode){
				webHookUrl	=	Constants.WEBSITE_URL + "payment/success";
				tmpApiKey	= 	uInterfaceApiKey;
			}else{
				successURL	=	Constants.WEBSITE_URL + "payment/success";
				failureURL 	= 	Constants.WEBSITE_URL + "payment/failure";
			}

			let body			 =	{
				"merchant_id"    :   uInterfaceMerchantId,
				"username"       :   uInterfaceUsername,
				"password"       :   uInterfacePassword,
				"api_key"        :   tmpApiKey,
				"order_id"       :   uniqueOrderId,
				"total_price"    :   orderUnpaidAmount,
				"CurrencyCode"   :   Constants.PAYMENT_GATEWAY_CURRENCY_CODE,
				"CstFName"       :   customerName,
				"CstEmail"       :   customerEmail,
				"CstMobile"      :   mobileNumber,
				"success_url"    :   successURL,
				"error_url"    	 :   failureURL,
				"test_mode"      :   parseInt(uInterfaceTestMode),
				"whitelabled"    :   (uInterfaceWhitelabled > 0) ? true : false,
				"payment_gateway":   tmpPaymentMethod,
				"ProductName"    :   JSON.stringify([itemList[0].ItemName]),
				"ProductQty"     :   JSON.stringify([itemList[0].Quantity]),
				"ProductPrice"   :   JSON.stringify([itemList[0].UnitPrice]),
				"reference"      :   uniqueOrderId,
				"notifyURL"      :   webHookUrl
			};

			requestOptions = {
				method: 'post',
				maxBodyLength: Infinity,
				url: uInterfaceBaseUrl,
				headers: {
					'Authorization': `Bearer ${uInterfaceAuthorizationKey}`,
					'Accept': 'application/json',
					'Content-Type': 'application/json'
				},
				data: body
			};
		}

		/** Save Payment gateway logs */
		let tmpLogId 		= 	new ObjectId();
		let tmpExtraPerms 	=	{before_request_time: Helper.getUtcDate()};
		await savePaymentGatewayLogs(req,res,next,{
			log_id	 	:	tmpLogId,
			order_id 	:	orderId,
			request	 	: 	requestOptions,
			response	: 	{},
			type		: 	getwayPriority,
			event		: 	"resend_link",
			extra_perms	: 	tmpExtraPerms,
		});

		/** Request to payment gateway  */
		axios(requestOptions).then(async (axiosRes) => {
			let body = axiosRes?.data || null;

			/** Save Payment gateway logs */
			tmpExtraPerms.after_response_time = Helper.getUtcDate();
			savePaymentGatewayLogs(req,res,next,{
				log_id	 	:	tmpLogId,
				order_id 	:	orderId,
				request	 	: 	requestOptions,
				response	: 	body,
				type		: 	getwayPriority,
				event		: 	"resend_link",
				extra_perms	: 	tmpExtraPerms,
			});

			if(!body || body.constructor != Object){
				req.flash(Constants.STATUS_ERROR, res.__('order.some_issue_payment_please_resend_link') );
				return res.redirect(Constants.WEBSITE_ADMIN_URL+"orders");
			}

			let status 	= Constants.STATUS_SUCCESS;
			let message = res.__("admin.orders.payment_link_has_been_sent_successfully");
			if(getwayPriority == Constants.MYFATOORAH_PAYMENT_GATEWAY && !body.IsSuccess){
				message = body.message;
				status 	= Constants.STATUS_ERROR;
			}else if(body.status != Constants.STATUS_SUCCESS){
				message = body.error_msg;
				status 	= Constants.STATUS_ERROR;
			}

			/** Update order details */
			await this.orderCollection.updateOne({
				_id: orderId
			},
			{$set : {
				resend_invoice_response		:	body,
				payment_link_expire_time	: 	Helper.getUtcDate(paymentExpireTime)
			}});

			/** Send success response */
			req.flash(status, message );
			res.redirect(Constants.WEBSITE_ADMIN_URL+"orders");

			if(getwayPriority == Constants.UINTERFACE_PAYMENT_GATEWAY && res.locals.settings["Payment.payment_link_receiver_email"]){
				if(body.sms || body.paymentURL){
					/*************** Send Payment Link Mail  ***************/
						let paymentContent = (body.paymentURL) ? body.paymentURL :body.sms;
						sendMail(req,res,{
							to 			: 	res.locals.settings["Payment.payment_link_receiver_email"],
							action 		: 	"uinterface_order_payment_link",
							rep_array	:	[uniqueOrderId, paymentContent]
						});
					/*************** Send Payment Link Mail  ***************/
				}
			}
		}).catch(error=>{

			/** Save Payment gateway logs */
			tmpExtraPerms.catch_response_time = Helper.getUtcDate();
			savePaymentGatewayLogs(req,res,next,{
				log_id	 	:	tmpLogId,
				order_id 	:	orderId,
				request	 	: 	requestOptions,
				response	: 	String(error),
				type		: 	getwayPriority,
				event		: 	"resend_link",
				extra_perms	: 	tmpExtraPerms,
			});

			/** Send error response */
			req.flash(Constants.STATUS_ERROR, res.__('order.some_issue_payment_please_resend_link') );
			return res.redirect(Constants.WEBSITE_ADMIN_URL+"orders");
		});		
	};//End resendLink()

	/**
	 * Function for revert order deliverd to cancel or cancel to deliverd
	 *
	 * @param req 	As 	Request Data
     * @param res 	As 	Response Data
     * @param next 	As 	Callback argument to the middleware function
	 *
	 * @return render
	 */
	async orderRevert  (req, res, next){
		try{
			let orderId = new ObjectId(req.params.order_id);
			let postData= Helper.isPost(req);

			/** Get detail of Order **/
			const orderResult = await this.orderCollection.aggregate([
				{$match : {
					_id 		:	orderId,
					admin_status: 	{$in: [ Constants.ORDER_CANCELLED, Constants.ORDER_DELIVERED ]}
				}},
				{$lookup: {	/** Get users details **/
					from 		:	Tables.USERS,
					localField  :	"customer_id",
					foreignField:	"_id",
					as 		  	:	"user_details"
				}},
				{$addFields : {
					customer_wallet_amount: {$arrayElemAt: ["$user_details.total_amount",0]},
				}},
			]).toArray();

			/** Send error response */
			if(!orderResult || orderResult.length <=0) {
				if(postData){
					return res.send({status:Constants.STATUS_ERROR, message: res.__("admin.system.invalid_access")});
				}

				req.flash(Constants.STATUS_ERROR,res.__("admin.system.invalid_access"));
				return res.redirect(Constants.WEBSITE_ADMIN_URL+"orders");
			}

			orderResult				=	orderResult[0];
			let orderStatus 		= 	orderResult.admin_status;
			let isMarkedCancelled	=	(orderStatus == Constants.ORDER_DELIVERED) ? true :false;
			let isMarkedDelivered	=	(orderStatus == Constants.ORDER_CANCELLED) ? true :false;

			if(Helper.isPost(req) || isMarkedDelivered){
				let isGuest 		= 	orderResult.is_guest;
				let customerId 		= 	orderResult.customer_id;
				let orderPrice 		= 	orderResult.order_price;
				let branchId		= 	orderResult.branch_id;
				let uniqueOrderId	= 	orderResult.unique_order_id;
				let restaurantId	= 	orderResult.restaurant_id;
				let walletAmount	= 	(!isGuest && orderResult.customer_wallet_amount) ? orderResult.customer_wallet_amount :0;
				let paymentMethod 	= 	orderResult.payment_method;
				let authId			= 	new ObjectId(req.session.user._id);
				let authUserType	= 	req.session.user.user_type;
				let authRoleId		= 	req.session.user.user_role_id;
				let updatedRole 	=	(authRoleId == Constants.FLEET) ? Constants.FLEET :Constants.CRAVEZ;
				let updatedStatus 	= 	(orderStatus == Constants.ORDER_CANCELLED)? Constants.ORDER_DELIVERED :Constants.ORDER_CANCELLED;
				let cancelReasonId	=	(req.body.cancel_reason) ? new ObjectId(req.body.cancel_reason) :'';
				let debitedAmount	=	0;
				let remainingAmount	=	0;

				if(isMarkedDelivered && paymentMethod != Constants.CASH_PAYMENT){
					remainingAmount = orderPrice;
					if(orderPrice >0 && walletAmount >0){
						debitedAmount  =	(walletAmount >= remainingAmount) ? remainingAmount :walletAmount;
						remainingAmount =	remainingAmount-debitedAmount;
					}
				}

				if(isMarkedCancelled && !cancelReasonId){
					return res.send({status: Constants.STATUS_ERROR, message: [
						{param: 'cancel_reason', 'msg': res.__("admin.orders.please_select_cancel_reason") }
					]});
				}

				asyncParallel({
					reason_title :(reasonCallback)=>{
						if(!cancelReasonId) return reasonCallback(null,null);

						/** Get cancel reason title */
						const cancel_reasons = this.db.collection(Tables.CANCEL_REASONS);
						cancel_reasons.findOne({_id: cancelReasonId},{projection:{title:1}}).then(result=>{
							let resTitle=(result && result.title)?result.title[Constants.DEFAULT_LANGUAGE_CODE]:"";
							reasonCallback(null, resTitle);
						}).catch(next);
					},
					mark_cancelled :(reasonCallback)=>{
						if(!isMarkedCancelled) return reasonCallback(null,null);

						/** Send cancel request to aghzeya api. if aghzeya api is cancel this order then order cancel in our system other wise not */
						this.markAghzeyaOrderToCancelled(req,res,next,{
							order_id		: 	orderId,
							restaurant_id	: 	orderResult.restaurant_id,
							reason_id		:	cancelReasonId
						}).then(cancelledResponse=>{
							reasonCallback(null,cancelledResponse);
						}).catch(next);
					},
				},async (asyncErr, asyncResponse)=>{
					if(asyncErr) return next(asyncErr);

					/** Send error response */
					if(asyncResponse.mark_cancelled && asyncResponse.mark_cancelled.status != Constants.STATUS_SUCCESS){
						if(postData){
							return res.send({status:Constants.STATUS_ERROR, message:  asyncResponse.mark_cancelled.message });
						}

						req.flash(Constants.STATUS_ERROR, asyncResponse.mark_cancelled.message  );
						return res.redirect(Constants.WEBSITE_ADMIN_URL+"orders");
					}

					/** Set update data */
					let updateableData	=	{
						$set : {
							order_status		: 	updatedStatus,
							order_revert_by		: 	authId,
							order_revert_date	: 	Helper.getUtcDate(),
							modified 			: 	Helper.getUtcDate(),
						}
					};

					if(isMarkedCancelled){
						updateableData["$set"].rejection_reason 		= 	asyncResponse.reason_title;
						updateableData["$set"].cancel_reason_id 		= 	cancelReasonId;
						updateableData["$set"].cancelled_user_role_id	=	authRoleId;
						updateableData["$unset"] =	{ revert_outstanding_amount: 1, revert_outstanding_paid: 1 };
					}else{
						if(debitedAmount >0){
							updateableData["$set"].amount_debited_by_wallet = debitedAmount;
						}
						if(remainingAmount >0){
							updateableData["$set"].revert_outstanding_paid 	 = false;
							updateableData["$set"].revert_outstanding_amount = remainingAmount;
						}
						updateableData["$unset"] = {
							cancel_reason_id 		: 1,
							rejection_reason 		: 1,
							cancelled_user_role_id 	: 1,
						};
					}

					/** Update order details */
					await this.orderCollection.updateOne({_id: orderId},updateableData);

					asyncParallel({
						update_wallet :(childCallback)=>{
							if(isGuest || !isMarkedDelivered || debitedAmount <=0){
								return childCallback(null);
							}

							/** Update wallet details */
							Helper.updateWalletBalance(req,res,next,{
								user_id      	: customerId,
								amount       	: debitedAmount,
								transaction_type: Constants.DEBIT,
								not_add_points	: true,
								is_used_points	: true,
								extra_parameters:{
									order_id 		: orderId,
									branch_id 		: branchId,
									restaurant_id 	: restaurantId,
									order_place 	: true,
								}
							}).then(response=>{
								if(response.status != Constants.STATUS_SUCCESS) return childCallback(response);

								childCallback(null);
							}).catch(next);
						},
						update_user_details :(childCallback)=>{
							if(isGuest || !isMarkedDelivered || remainingAmount <=0 || !customerId){
								return childCallback(null);
							}

							/** Update user details */
							const users = this.db.collection(Tables.USERS);
							users.updateOne({
								_id: customerId
							},
							{
								$set :{
									modified : 	Helper.getUtcDate(),
								},
								$addToSet: {
									revert_orders : {
										order_id 			: 	orderId,
										unique_order_id 	: 	uniqueOrderId,
										outstanding_amount 	:	remainingAmount,
										revert_time 		:	Helper.getUtcDate(),
									}
								}
							}).then(()=>{
								childCallback(null);
							}).catch(next);
						},
						save_order_logs :(childCallback)=>{
							/** Save order logs */
							Helper.saveOrderStatusLogs(req,res,next,{
								updated_by 		: 	authId,
								user_role_id 	: 	authRoleId,
								status 			:	updatedStatus,
								order_status	:	orderStatus,
								restaurant_id	:	restaurantId,
								order_id 		:	orderId,
								branch_id		:	branchId,
								user_id			:	customerId,
								user_type		:	authUserType,
							}).then(()=>{
								childCallback(null);
							}).catch(next);
						},
						generate_tickets :(childCallback)=>{
							/** Generate ticket  */
							Helper.generateTicket(req,res,next,{
								order_id 		: 	orderId,
								message_params 	: 	[uniqueOrderId],
								type 			:	(isMarkedCancelled) ? Constants.AUTOMATED_TICKET_FOR_ORDER_MARKED_TO_CANCELLED :Constants.AUTOMATED_TICKET_FOR_ORDER_MARKED_TO_DELIVERED,
							}).then(()=>{
								childCallback(null);
							});
						},
					},(asyncErr)=>{
						if(asyncErr) return next(asyncErr)

						/** Send success response */
						let msg = (isMarkedDelivered) ? res.__("admin.orders.order_has_been_marked_delivered") :res.__("admin.orders.order_has_been_marked_cancelled")
						req.flash(Constants.STATUS_SUCCESS,msg);
						if(postData){
							return res.send({status:Constants.STATUS_SUCCESS, message: msg });
						}
						res.redirect(Constants.WEBSITE_ADMIN_URL+"orders");
					});
				});
			}else{
				/**Get cancel reason dropdown list **/
				let dropDownResponse = await Helper.getDropdownList(req,res, next, {
					collections :[{
						collection : "cancel_reasons",
						columns    : ["_id",["title",Constants.DEFAULT_LANGUAGE_CODE]],
						conditions : { status : Constants.ACTIVE},
					}],
				});

				/** Send error response */
				if(dropDownResponse.status != Constants.STATUS_SUCCESS){
					return res.status(400).send(dropDownResponse);
				}

				/** Render order revert page  */
				res.render('order_revert',{
					layout			   : false,
					order_result	   : orderResult,
					cancel_reason_list : dropDownResponse?.final_html_data?.[0] || ""
				});
			}
		}catch(error){
			return next(error);
		}
	};//End orderRevert()

	/**
	 * Function for send cancel request to aghzeya api
	 *
	 * @param req 	As 	Request Data
     * @param res 	As 	Response Data
     * @param next 	As 	Callback argument to the middleware function
	 *
	 * @return json
	 */
	async markAghzeyaOrderToCancelled (req,res,next,options){
		return new Promise(resolve=>{
			let orderId			=	(options.order_id)		?	new ObjectId(options.order_id)		:"";
			let restaurantId	=	(options.restaurant_id)	?	new ObjectId(options.restaurant_id)	:"";
			let cancelReasonId	=	(options.reason_id)		?	options.reason_id				:"";
			let isCron          =	(options.is_cron)		?	options.is_cron	        		:false;
			let authUserName	= 	(req.session.user) 		? 	req.session.user.full_name		:"";
			let notUpdateRetryCount	=	(options.not_update_retry_count) ?	options.not_update_retry_count :"";

			/** Send error response */
			if(!orderId || !restaurantId) return resolve({status:Constants.STATUS_ERROR, message:res.__("system.missing_parameters")});

			asyncParallel({
				rest_details :(callback)=>{
					/** Get restaurant details  */
					const restaurants	=	this.db.collection(Tables.RESTAURANTS);
					restaurants.findOne({_id: restaurantId },{projection: {_id:1, aghzeya_restaurant_id: 1 }}).then(result=>{
						callback(null, result);
					}).catch(next);
				},
				order_details :(callback)=>{
					/** Get order details  */
					this.orderCollection.findOne({
						_id				:	orderId,
						is_completed	: 	{$ne: true},
					}).then(result=>{
						callback(null, result);
					}).catch(next);
				},
			},(asyncErr, asyncRes)=>{
				if(asyncErr) return next(asyncErr);

				/** Send success response */
				if(!asyncRes.order_details) return resolve({status: Constants.STATUS_ERROR, message: res.__("system.invalid_access") });

				let orderDetails 	=	asyncRes.order_details 	?	asyncRes.order_details 	:{};
				let simphony 		= 	orderDetails.simphony	? 	orderDetails.simphony	:false;
				let dhubOrderId 	= 	orderDetails.dhub_order_id;
				let simphonyCheckRef= 	orderDetails.simphonyCheckRef;
				let aghzeyaBillNo	= 	orderDetails.aghzeya_bill_no;

				/** Send success response not push on API */
				if(!dhubOrderId && !simphonyCheckRef && !aghzeyaBillNo) return resolve({status: Constants.STATUS_SUCCESS });

				asyncParallel({
					cancel_at_order_place :(subCallback)=>{
						if(!simphonyCheckRef && !aghzeyaBillNo) return subCallback(null);

						let reqUrl = Constants.WEBSITE_URL+'aghzeya_api/aghzeya_cancel_order/'+orderId;
						if(simphony) reqUrl = process.env.SIMPHONY_SERVER_URL+'simphony-api/delete-order/'+orderId;

						/** To cancel order  */
						axios({
							method: 'GET',
							url: reqUrl,
							headers: {
							  'Content-Type': 'application/json'
							},
							data: {
							  is_cron: isCron,
							  cancelled_by: authUserName,
							  cancelled_reason: cancelReasonId,
							  not_update_retry_count: notUpdateRetryCount
							},
							httpsAgent: new https.Agent({ rejectUnauthorized: false })
						}).then(response=>{
							subCallback(null, response?.data || null);
						}).catch(next);
					},
					cancel_at_dhub :(subCallback)=>{
						if(!dhubOrderId) return subCallback(null);

						this.pushOrderToDhubAsCanceled(req,res,next,orderId).then(()=>{
							subCallback(null);
						}).catch(next);
					},
				},(_,asyncAPIRes)=>{

					if(asyncAPIRes.cancel_at_order_place) return resolve(asyncAPIRes.cancel_at_order_place);

					resolve({status: Constants.STATUS_SUCCESS });
				});
			});
		}).catch(next);
	};//End markAghzeyaOrderToCancelled()

	/**
	 * Function to submit order
	 *
	 * @param req 	As 	Request Data
     * @param res 	As 	Response Data
     * @param next 	As 	Callback argument to the middleware function
	 *
	 * @return render
	 */
	 async submitOrder  (req, res, next){
		let isRedirect 	=	req.query.is_redirect;
		let orderId 	=	new ObjectId(req.params.order_id);
		let authId		= 	(req.session.user)	?	req.session.user._id	:"";
		let redirectUrl =	Constants.WEBSITE_ADMIN_URL+"orders"+(isRedirect && '/view/'+orderId || "")

		asyncParallel({
			order_detail : (callback)=>{
				/** Get orders list */
				this.orderCollection.findOne({
					_id						:	orderId,
					is_schedule				: 	true,
					is_completed			: 	{$ne: true},
					scheduled_to_submit_time: 	{$exists : false },
				}).then(orderResult=>{
					callback(null, orderResult);
				}).catch(next);
			},
			user_details : (callback)=>{
				/** Get user details */
				const users = this.db.collection(Tables.USERS);
				users.findOne({user_role_id : Constants.CRAVEZ },{projection:{_id:1}}).then(result=>{
					callback(null, result);
				}).catch(next);
			},
		},async (asyncErr,asyncResponse)=>{
			if(asyncErr) return next(asyncErr);

			if(!asyncResponse.order_detail){
				/** Send error response */
				req.flash(Constants.STATUS_ERROR, res.__("admin.system.invalid_access") );
				return res.redirect(redirectUrl);
			}

			let orderDetails		=	asyncResponse.order_detail;
			let aghzeya				=	orderDetails.aghzeya;
			let isConfirm			=	orderDetails.is_confirm;
			let customerId			=	orderDetails.customer_id;
			let restaurantId		=	orderDetails.restaurant_id;
			let uniqueOrderId		=	orderDetails.unique_order_id;
			let tmpDbStatus			= 	orderDetails.admin_status;
			let aghzeyaBillNo		= 	orderDetails.aghzeya_bill_no;
			let simphonyCheckRef	=	orderDetails.simphonyCheckRef;
			let isOrderModified 	=	aghzeyaBillNo || simphonyCheckRef ? true :false;

			/** Update order details */
			await this.orderCollection.updateOne({
				_id: orderId
			},
			{$set :{
				order_date 					: 	Helper.getUtcDate(),
				scheduled_date 				: 	Helper.getUtcDate(),
				scheduled_to_submit_time	: 	Helper.getUtcDate(),
				scheduled_to_submit_manually: 	Helper.getUtcDate(),
			}});

			let placeRes = await this.placeOrderModule.callAfterPlaceOrder(req,res,next,{
				order_id 			:	orderId,
				is_aghzeya 			: 	aghzeya,
				admin_id 			: 	authId,
				customer_id 		: 	customerId,
				current_status 		: 	tmpDbStatus,
				is_schedule 		: 	false,
				is_confirm 			: 	isConfirm,
				is_modify 			: 	isOrderModified,
				restaurant_id 		: 	restaurantId,
				unique_order_id		: 	uniqueOrderId,
				not_update_status	: 	(tmpDbStatus != Constants.ORDER_SCHEDULED) ? true :false,
				simphony			: 	orderDetails.simphony || false,
			});

			/** Send response */
			let tmpMessage = (placeRes.status != Constants.STATUS_SUCCESS) ? placeRes.message :res.__('admin.order.submitted_successfully');
			req.flash(placeRes.status, tmpMessage);
			res.redirect(redirectUrl);
		});
	};//End submitOrder()

	/**
	 * Function to resend order
	 *
	 * @param req 	As 	Request Data
	 * @param res 	As 	Response Data
	 * @param next 	As 	Callback argument to the middleware function
	 *
	 * @return render
	 */
	async resendOrder  (req, res, next){
		let isRedirect 	=	req.query.is_redirect;
		let orderId 	=	new ObjectId(req.params.order_id);
		let authId		=	(req.session.user._id)	? req.session.user._id	:"";
		let redirectUrl =	Constants.WEBSITE_ADMIN_URL+"orders"+(isRedirect && '/view/'+orderId || "");

		let orderDetails = await this.orderCollection.findOne({
			_id				:	orderId,
			admin_status	: 	Constants.ORDER_REJECTED_BY_ADMIN,
			aghzeya			: 	true,
			$or 			:	[
				{gfc_push_retry: {$gte: Constants.MAX_GFC_PUSH_LIMIT }},
				{gfc_modified_push_retry: {$gte: Constants.MAX_GFC_PUSH_LIMIT }},
			]
		});

		if(!orderDetails){
			/** Send error response */
			req.flash(Constants.STATUS_ERROR, res.__("admin.system.invalid_access") );
			return res.redirect(redirectUrl);
		}

		let orderDate			=	orderDetails.order_date;
		let isModified			=	(orderDetails.is_modified) 			? 	orderDetails.is_modified 	 :false;
		let billNo				=	(orderDetails.aghzeya_bill_no) 		?	orderDetails.aghzeya_bill_no :"";
		let simphonyCheckRef	=	(orderDetails.simphonyCheckRef)		?	orderDetails.simphonyCheckRef:"";
		let isOrderModified 	=	billNo || simphonyCheckRef 	? 	true :false;

		/** Set order update data */
		let updateData = {$set: {modified: Helper.getUtcDate() } };

		if(!isModified || !billNo){
			updateData["$set"].order_date 			= Helper.getUtcDate();
			updateData["$set"].previous_order_date 	= orderDate;

			updateData["$push"] = {
				resend_order_date_logs: {
					resend_on 	:	Helper.getUtcDate(),
					order_date	: 	orderDate,
					updated_by	: 	new ObjectId(authId),
				}
			};

			if(orderDetails.is_schedule){
				updateData["$set"].scheduled_date 				= Helper.getUtcDate();
				updateData["$set"].scheduled_to_submit_manually = Helper.getUtcDate();
			}
		}

		/** Update order details */
		await this.orderCollection.updateOne({_id: orderId},updateData);

		/** Send request to place order on third party */
		let tmpResponse  = 	await this.placeOrderModule.callAfterPlaceOrder(req,res,next,{
			order_id 			:	orderId,
			is_aghzeya 			: 	orderDetails.aghzeya,
			admin_id 			: 	authId,
			submitted_by 		: 	authId,
			customer_id 		: 	orderDetails.customer_id,
			current_status 		: 	orderDetails.order_status,
			is_schedule 		: 	false,
			is_confirm 			: 	orderDetails.is_confirm,
			restaurant_id 		: 	orderDetails.restaurant_id,
			unique_order_id		: 	orderDetails.unique_order_id,
			device_id			: 	orderDetails.device_id,
			is_modify			: 	isOrderModified,
			simphony			: 	orderDetails.simphony || false,
		});

		/** Send response */
		let resMsg = (tmpResponse.status != Constants.STATUS_SUCCESS) ? tmpResponse.message :res.__('admin.order.order_has_been_sent_successfully');
		req.flash(tmpResponse.status, resMsg);
		res.redirect(redirectUrl);
	};//End resendOrder()

	/**
	 * Function to resend cancle order
	 *
	 * @param req 	As 	Request Data
	 * @param res 	As 	Response Data
	 * @param next 	As 	Callback argument to the middleware function
	 *
	 * @return render
	 */
	async resendCancleOrder  (req, res, next){
		let isRedirect 	=	req.query.is_redirect;
		let orderId 	=	new ObjectId(req.params.order_id);
		let authDetails	= 	(req.session.user)	? req.session.user	:"";
		let redirectUrl =	Constants.WEBSITE_ADMIN_URL+"orders"+(isRedirect && '/view/'+orderId || "");

		let orderDetails = await this.orderCollection.findOne({
			_id			:	orderId,
			aghzeya		: 	true,
			admin_status: 	{$ne: Constants.ORDER_CANCELLED},
			$and		:	[
				{gfc_cancel_retry	:	{$gte: Constants.MAX_GFC_PUSH_LIMIT }},
				{is_completed		: 	{$exists: false}},
				{is_completed		: 	{$ne: true}}
			]
		});

		/** Send error response */
		if(!orderDetails){
			req.flash(Constants.STATUS_ERROR, res.__("admin.system.invalid_access") );
			return res.redirect(redirectUrl);
		}	

		/** Mark Order to cancel GFC or our system */
		let cancelRes = await this.pushOrderToGfcAsCanceled(req,res,next,{
			order_details	: 	orderDetails,
			user_details	: 	authDetails
		});

		let resMsg 	= 	(cancelRes.status != Constants.STATUS_SUCCESS && cancelRes.message) ? cancelRes.message :res.__('admin.orders.order_has_been_marked_cancelled_successfully');
		req.flash(cancelRes.status, resMsg);
		res.redirect(redirectUrl);
	};//End resendCancleOrder()

	/**
	 * Function to resend cancle order
	 *
	 * @param req 	As 	Request Data
	 * @param res 	As 	Response Data
	 * @param next 	As 	Callback argument to the middleware function
	 *
	 * @return render
	 */
	async pushOrderToGfcAsCanceled (req,res,next,options){
		return new Promise(async resolve=>{
			let orderDetails	=	(options.order_details)		?	options.order_details	:"";
			let userDetails     =	(options.user_details)		?	options.user_details	:"";
			let isCron          =	(options.is_cron)		    ?	options.is_cron	        :false;

			/** Send error response */
			if(!userDetails || !orderDetails) return resolve({status:Constants.STATUS_ERROR, message:res.__("system.missing_parameters"), options : options });

			let orderId			    =	orderDetails._id;
			let userId			    =	userDetails._id;
			let userType			=	userDetails.user_type;
			let userRoleId			=	userDetails.user_role_id;
			let restaurantId	    =	orderDetails.restaurant_id;
			let cancelReasonId	    =	orderDetails.tmp_cancel_reason_id;
			let currentStatus	    =	orderDetails.admin_status;
			let tmpRejectionReason	=	orderDetails.tmp_rejection_reason;
			let branchId	    	=	orderDetails.branch_id;
			let customerId		    =	orderDetails.customer_id;
			let newStatus		    =	(orderDetails.tmp_new_status) ? orderDetails.tmp_new_status :Constants.ORDER_CANCELLED;

			/** Send cancel request to aghzeya api. if aghzeya api is cancel this order then order cancel in our system other wise not */
			let cancelRes = await this.markAghzeyaOrderToCancelled(req,res,next,{
				order_id: orderId, 
				restaurant_id: restaurantId, 
				reason_id: cancelReasonId, 
				is_cron: isCron
			});

			/** Send error response */
			if(cancelRes.status != Constants.STATUS_SUCCESS) return resolve(cancelRes);

			/** Set update data  **/
			let dataToBeUpdated	=	{
				order_status	: 	newStatus,
				rejection_reason: 	tmpRejectionReason,
				modified 		: 	Helper.getUtcDate()
			};

			if(cancelReasonId) dataToBeUpdated['cancel_reason_id'] = cancelReasonId;

			if(newStatus == Constants.ORDER_CANCELLED){
				dataToBeUpdated.cancelled_user_role_id = userRoleId;
			}

			/** update order status */
			await this.orderCollection.updateOne({_id: orderId },{$set: dataToBeUpdated});

			/** Save order logs */
			await Helper.saveOrderStatusLogs(req,res,next,{
				updated_by 		: 	userId	,
				user_role_id 	: 	userRoleId,
				status 			:	newStatus,
				order_status	:	currentStatus,
				restaurant_id	:	restaurantId,
				order_id 		:	orderId,
				branch_id		:	branchId,
				user_id			:	customerId,
				user_type		:	userType,
				is_admin        :   true
			});

			/** Send success response */
			resolve({status: Constants.STATUS_SUCCESS});

			/** save System logs */
			saveSystemLogs(req, res, {
				user_id				: userId,
				parent_id			: orderId,
				activity_module		: Constants.SYSTEM_LOG_MODULE_ORDERS,
				activity_type		: Constants.ACTIVITY_TYPE_STATUS_UPDATE,
				additional_details	: (isCron) ? {is_auto_cron: Helper.getUtcDate(), status: newStatus } :{is_user: Helper.getUtcDate(), status: newStatus }
			});
		}).catch(next);
	};//End pushOrderToGfcAsCanceled()

	/**
	 * Function to get list of google api count
	 *
	 * @param req As Request Data
	 * @param res As Response Data
	 *
	 * @return render/json
	 */
	 async getGoogleCountList   (req, res, next){
		if(Helper.isPost(req)){
			let limit     = (req.body.length) 		? parseInt(req.body.length) : Constants.ADMIN_LISTING_LIMIT;
			let skip      = (req.body.start)  		? parseInt(req.body.start)  : Constants.DEFAULT_SKIP;
			let fromDate  = (req.body.fromDate) 	? req.body.fromDate 		: "";
			let toDate 	  = (req.body.toDate)   	? req.body.toDate     		: "";
			const collection = this.db.collection(Tables.GOOGLE_API_COUNT_LOGS);

			/** Configure Datatable conditions*/
			let dataTableConfig = await Helper.configDatatable(req,res,null);

			/** Condition for order date */
			if(fromDate != "" && toDate != "") dataTableConfig.conditions["order_date"] = {$gte : Helper.newDate(fromDate), $lte : Helper.newDate(toDate) };

			/** Get list or count of google api used count logs  */
			let dbRes = await collection.aggregate([
				{ $match: dataTableConfig.conditions },
				{$facet : {
					list : [
						{$sort: dataTableConfig.sort_conditions },
						{$skip: skip },
						{$limit: limit },
						{$project: {
							_id:1, order_id:1, unique_order_id:1, assignment_type:1, order_count:1, order_date: 1,
						}}
					],
					count: [
						{$count: "count"},
					],
				}}
			]).toArray();

			/** Send response **/
			res.send({
				status: Constants.STATUS_SUCCESS,
				draw: dataTableConfig.result_draw,
				data			:   dbRes?.[0]?.list ||[],
				recordsTotal	:	dbRes?.[0]?.count?.[0]?.count || 0,
				recordsFiltered	:  	dbRes?.[0]?.count?.[0]?.count || 0,
			}); 
		}else{
			/** render listing page **/
			req.breadcrumbs(BREADCRUMBS['admin/google_order_count_list']);
			res.render('google_count_list');
		}
	};//End getGoogleCountList()

	/**
	 *  Function for export google api count report
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 * @param next 	As 	Callback argument to the middleware function
	 *
	 * @return null
    */
	async exportGoogleApiCount  (req, res, next){
		let fromDate     	= (req.query.from_date) 	? req.query.from_date 		: "";
		let toDate 	  	 	= (req.query.to_date)   	? req.query.to_date   		: "";
		let sortingField  	= (req.query.sort_field) 	? req.query.sort_field   	: "_id";
		let sortingDir 	 	= (req.query.sort_dir) 		? req.query.sort_dir   		: "";
		let sortOrder		= (sortingDir == 'asc') 	? Constants.SORT_ASC 		: Constants.SORT_DESC;
		let orderId 		= (req.query.order_id) 		? req.query.order_id 		: "";

		let sortConditions		= {};
		sortConditions[sortingField] = sortOrder;

		let exportConditions	= {};
		if(fromDate != "" && toDate != "") exportConditions["order_date"] = {$gte : Helper.newDate(fromDate), $lte : Helper.newDate(toDate) };
		if(orderId) exportConditions.unique_order_id = { $regex: orderId, $options: 'i' };

		/** Get order details **/
		const google_api_count_logs = this.db.collection(Tables.GOOGLE_API_COUNT_LOGS);
		let findResult = await google_api_count_logs.aggregate([
			{$match	: exportConditions},
			{$sort 	: sortConditions},
			{$project : {
				_id:1, order_id:1, unique_order_id:1, assignment_type:1, order_count:1, order_date: 1
			}},
		]).toArray();

		/** Define excel heading label **/
		let commonColls		= 	[
			res.__("admin.orders.order_id"),
			res.__("admin.orders.order_date"),
			res.__("admin.orders.process_type"),
			res.__("admin.orders.count_of_hits"),
		];

		let temp = [];
		if(findResult && findResult.length > 0){
			let totalOrderCount = 0;
			findResult.map(records=>{
				let buffer =	[
					(records.unique_order_id) 	? records.unique_order_id   :"",
					(records.order_date)		? Helper.newDate(records.order_date,Constants.DATE_FORMAT_EXPORT) :"",
					(records.assignment_type) 	? Constants.ASSIGNMENT_TYPE[records.assignment_type] : "",
					(records.order_count)    	? (records.order_count) :""
				];
				temp.push(buffer);

				totalOrderCount += records.order_count
			});
			let totalRow = [
				res.__("admin.order.grand_total"),
				"",
				"",
				totalOrderCount,
			];
			temp.push(totalRow);
		}

		/**  Function to export data in excel format **/
		Helper.exportToExcel(req,res,{
			file_prefix 		: "GoogleApiCountReport",
			heading_columns		: commonColls,
			export_data			: temp
		});
	};// end exportGoogleApiCount()

	/**
	 *  Function for print order
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 * @param next 	As 	Callback argument to the middleware function
	 *
	 * @return null
    */
	async printOrder  (req, res, next){
		try{
			let orderId =	new ObjectId(req.params.order_id);

			/** Get orders details */
			let orderResult = await this.orderCollection.findOne({
				_id	:	orderId,
				$or :	[
					{aghzeya: true},
					{simphony: true},
				]
			});

			/** Send error response */
			if(!orderResult){
				req.flash(Constants.STATUS_ERROR,res.__("system.invalid_access"));
				return res.redirect(Constants.WEBSITE_ADMIN_URL+"orders");
			}

			if(orderResult.simphony){
				/** To Print order  */
				axios({
					method: 'GET',
					url: process.env.SIMPHONY_SERVER_URL+'simphony-api/print-order/'+orderId,
					headers: {
					'Content-Type': 'application/json'
					},
					httpsAgent: new https.Agent({ rejectUnauthorized: false })
				}).then(response=>{

					/** Send success response */
					let status 	=	response?.data?.status || Constants.STATUS_ERROR;
					let msg 	=	response?.data?.message || "";
					if(msg) req.flash(status,msg);
					res.redirect(Constants.WEBSITE_ADMIN_URL+"orders");
				}).catch(next);
			}else{
				soap.createClient(Constants.AGHZEYA_API_URL, async (err, client)=>{

					let response = await this.aghzeyaModule.printAghzeyaOrder(req,res,next,client);

					req.flash(response.status,response.message);
					res.redirect(Constants.WEBSITE_ADMIN_URL+"orders");
				});
			}
		}catch(e){
			return next(e);
		}		
	};// end printOrder()

	/**
	 * Function to resend order to dhub
	 *
	 * @param req 	As 	Request Data
	 * @param res 	As 	Response Data
	 * @param next 	As 	Callback argument to the middleware function
	 *
	 * @return render
	 */
	async resendOrderDhub  (req, res, next){
		try{
			let orderId 	=	new ObjectId(req.params.order_id);
			let authId		=	(req.session.user._id)	? req.session.user._id	:"";
			let redirectUrl =	Constants.WEBSITE_ADMIN_URL+"orders"+(req.query.is_redirect && '/view/'+orderId || "");


			let orderDetails = await this.orderCollection.findOne({
				_id				:	orderId,
				is_completed	:	{$ne: true},
				dhub_push_retry	:	{$gte: Constants.MAX_GFC_PUSH_LIMIT},
			});

			/** Send error response */
			if(!orderDetails){
				req.flash(Constants.STATUS_ERROR, res.__("admin.system.invalid_access") );
				return res.redirect(redirectUrl);
			}	

			/** Set order update data */
			let updateData = {
				$set: {
					modified: Helper.getUtcDate()
				},
				$push: {
					dhub_resend_order_logs: {
						send_at	:	Helper.getUtcDate(),
						send_by	: 	new ObjectId(authId),
					}
				}
			};

			/** Update order details */
			await this.orderCollection.updateOne({_id: orderId},updateData);

			let tmpResponse = 	await this.pushOrderAtDhub(req,res,next,orderId);
			let resStatus 	= 	tmpResponse?.status || Constants.STATUS_ERROR;
			let resMsg 		= 	res.__('admin.order.order_has_been_sent_successfully');
			if(resStatus != Constants.STATUS_SUCCESS) resMsg =  tmpResponse?.message || res.__("admin.system.something_going_wrong_please_try_again");

			req.flash(resStatus, resMsg);
			res.redirect(redirectUrl);
		}catch(e){
			return next(e);
		}
	};//End resendOrder()

	/**
	 * Function for push order to dhub
	 *
	 * @param req 	As 	Request Data
     * @param res 	As 	Response Data
     * @param next 	As 	Callback argument to the middleware function
	 *
	 * @return json
	 */
	async pushOrderAtDhub (req,res,next,orderId){
		return new Promise(resolve=>{
			/** Send error response */
			if(!orderId) return resolve({status:Constants.STATUS_ERROR, message: res.__("admin.system.something_going_wrong_please_try_again") });

			try{
				axios({
					method: 'GET',
					url: process.env.SIMPHONY_SERVER_URL+'dhub-api/create-delivery-job/'+orderId,
					headers: {
					'Content-Type': 'application/json'
					},
					httpsAgent: new https.Agent({ rejectUnauthorized: false })
				}).then(response=>{
					resolve(response?.data || {});
				}).catch(next);
			}catch(e){
				return resolve({status:Constants.STATUS_ERROR, message: res.__("admin.system.something_going_wrong_please_try_again") });
			}
		}).catch(next);
	};//End pushOrderAtDhub()

	/**
	 * Function to resend cancel order to Dhub
	 *
	 * @param req 	As 	Request Data
	 * @param res 	As 	Response Data
	 * @param next 	As 	Callback argument to the middleware function
	 *
	 * @return render
	 */
	async resendCancelOrderDhub  (req, res, next){
		try{
			let orderId 	=	new ObjectId(req.params.order_id);
			let redirectUrl =	Constants.WEBSITE_ADMIN_URL+"orders"+(req.query.is_redirect && '/view/'+orderId || "");
	
			/** Mark Order to cancel Dhub or our system */
			let cancelRes = await this.pushOrderToDhubAsCanceled(req,res,next,orderId);

			let resStatus 	= 	cancelRes && cancelRes.status ? cancelRes.status :Constants.STATUS_ERROR;
			let resMsg 		= 	res.__('admin.orders.order_has_been_marked_cancelled_successfully');
			if(resStatus != Constants.STATUS_SUCCESS) resMsg =  cancelRes && cancelRes.message ? cancelRes.message : res.__("admin.system.something_going_wrong_please_try_again");

			req.flash(resStatus, resMsg);
			res.redirect(redirectUrl);
		}catch(e){
			return next(e);
		}
	};//End resendCancelOrderDhub()

	/**
	 * Function to resend cancle order request to dhub
	 *
	 * @param req 	As 	Request Data
	 * @param res 	As 	Response Data
	 * @param next 	As 	Callback argument to the middleware function
	 *
	 * @return render
	 */
	async pushOrderToDhubAsCanceled  (req,res,next,orderId){
		return new Promise(async resolve=>{

			/** Send error response */
			if(!orderId) return resolve({status:Constants.STATUS_ERROR, message:res.__("system.invalid_access")});

			/** Get order details */
			let result = await this.orderCollection.findOne({_id: new ObjectId(orderId), dhub_order_id: {$exists: true} });

			/** Send error response */
			if(!result) return resolve({ status: Constants.STATUS_ERROR, message: res.__("system.invalid_access") });

			/** Send success response */
			if(result.dhub_order_cancel_time) return resolve({status: Constants.STATUS_SUCCESS });

			try{
				axios({
					method: 'GET',
					url: process.env.SIMPHONY_SERVER_URL+'dhub-api/cancel-order/'+orderId,
					headers: {
					'Content-Type': 'application/json'
					},
					httpsAgent: new https.Agent({ rejectUnauthorized: false })
				}).then(response=>{
					resolve(response?.data || {});
				}).catch(next);
			}catch(e){return next(e);}
		}).catch(next);
	};//End pushOrderToDhubAsCanceled()
};
