import { ObjectId } from 'mongodb';
import clone from 'clone';
import {parallel as asyncParallel} from 'async';
import * as Constants from "../../../../config/global_constant.mjs";
import Tables from '../../../../config/database_tables.mjs';
import { isPost, getUtcDate, configDatatable, arrayToObject, newDate,getAreaIdsBasedOnFleetRole, getConditionsBasedOnCallCenterRole, getAllDriverIdsWhoHaveShift, getDropdownList, getDifferenceBetweenTwoDatesInMinute, saveOrderStatusLogs, sanitizeData, sortByKey} from "../../../../utils/index.mjs";
import assignmentModule from '../../../../modules/frontend/api/model/assignment.mjs';
import BREADCRUMBS from '../../../../breadcrumbs.mjs';
import { insertNotifications, saveSystemLogs } from "../../../../services/index.mjs";

class OrderTracking {
    constructor(db) {
        this.db = db;
        this.collectionDb = db.collection(Tables.ORDERS);

        this.assignmentModel = new assignmentModule(db);
    }

    /**
     * Function to get order tracking list
     *
     * @param req 	As Request Data
     * @param res 	As Response Data
     * @param next 	As Callback argument to the middleware function
     *
     * @return render/json
     */
    async getOrderTrackingList(req, res, next) {
        try {
            let isTeamHead		= (req.session.user.team_head) ? req.session.user.team_head :false;
            let authUserRoleId	= req.session.user.user_role_id;
            let orderType		= (req.query.order_type) ? req.query.order_type : '';
            let excludedStatus	= [Constants.ORDER_REJECTED,Constants.ORDER_REJECTED_BY_ADMIN,Constants.ORDER_DELIVERED,Constants.ORDER_CANCELLED];

            /** Get fleet area ids */
            let fleetAreaIds = [];
            if(authUserRoleId == Constants.FLEET && !isTeamHead){
                fleetAreaIds = await getAreaIdsBasedOnFleetRole(req, res, next);
            } 
            
            let businessRule 		= 	null;
            let businessConditions 	=	null;
            if(authUserRoleId == Constants.CALL_CENTER_TEAM && !isTeamHead){
                let taskAssignments = await getConditionsBasedOnCallCenterRole(req,res,next);
                businessRule 		= taskAssignments?.rules || {};
                businessConditions 	= taskAssignments?.conditions || [];
            }

            /** Set conditions */
            let commonConditions = {};

            /** Add fleet conditions */
            if(authUserRoleId == Constants.FLEET && !isTeamHead){
                commonConditions.branch_area_id = {$in : arrayToObject(fleetAreaIds)};
            }

            if(isPost(req)){
                let limit 	  = (req.body.length)   ? parseInt(req.body.length) :ADMIN_LISTING_LIMIT;
                let skip 	  = (req.body.start)    ? parseInt(req.body.start)  :DEFAULT_SKIP;
                let fromDate  = (req.body.fromDate) ? req.body.fromDate 		: "";
                let toDate 	  = (req.body.toDate)   ? req.body.toDate 		    : "";
                let deliveryType = (req.body.delivery_type)   ? req.body.delivery_type   : "";
                let restaurantId = (req.body.restaurant_id)   ? req.body.restaurant_id 	 : '';
                let isOrderAssigned = (req.body.is_order_assigned)? req.body.is_order_assigned: "";
                let captainId 	= (req.body.captain_id)		  ? req.body.captain_id		  : "";
                let status			= (req.body.status) ? req.body.status : '';

                /** Configure Datatable conditions*/
                let dataTableConfig = await configDatatable(req, res, null);            
                
                if(authUserRoleId == Constants.CALL_CENTER_TEAM && !isTeamHead){
                    if(businessConditions && businessConditions.length > 0){
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
                    });
                }

                if(orderType){
                    switch(orderType){
                        case "first_orders":
                            if(!commonConditions["$and"]) commonConditions["$and"] = [];
                            commonConditions["$and"].push({
                                is_first_order 	: 	true,
                                admin_status 	:	Constants.ORDER_PENDING
                            });
                        break;
                        case "duplicate_orders":
                            if(!commonConditions["$and"]) commonConditions["$and"] = [];
                            commonConditions["$and"].push({
                                is_duplicate_order 	: 	true,
                                admin_status 	:	Constants.ORDER_PENDING
                            });
                        break;
                        case "big_orders":
                            if(!commonConditions["$and"]) commonConditions["$and"] = [];
                            commonConditions["$and"].push({
                                is_big_order 	: 	true,
                                admin_status 	:	Constants.ORDER_PENDING
                            });
                        break;
                        case "order_rejected":
                            commonConditions['admin_status']	=	{$in : [Constants.ORDER_REJECTED,Constants.ORDER_REJECTED_BY_ADMIN]};
                        break;
                        case "delayed_acceptance":
                            commonConditions['is_delayed_acceptance']	= true;
                            commonConditions.admin_status	 = {$nin : excludedStatus};
                            commonConditions["confirm_status.is_delayed_acceptance"] = {$exists :false};
                        break;
                        case "delayed_preparation":
                            commonConditions['is_delayed_preperation'] = true;
                            commonConditions.admin_status	= {$nin : excludedStatus};
                            commonConditions["confirm_status.is_delayed_preperation"] = {$exists :false};
                        break;
                        case "delayed_pickup_by_captain":
                            commonConditions['is_delayed_pickup_by_captain'] = true;
                            commonConditions.admin_status	= {$nin : excludedStatus};
                            commonConditions["confirm_status.is_delayed_pickup_by_captain"] = {$exists :false};
                        break;
                        case "delayed_pickup_by_customer":
                            commonConditions['is_delayed_picked_up_by_customer'] = true;
                            commonConditions.admin_status	= {$nin : excludedStatus};
                            commonConditions["confirm_status.is_delayed_picked_up_by_customer"] = {$exists :false};
                        break;
                        case "delayed_pickup_by_restaurant":
                            commonConditions['is_delayed_pickup'] = true;
                            commonConditions['delivery_type'] 	  = Constants.DELIVERY_BY_RESTAURANT;
                            commonConditions.admin_status		  = {$nin : excludedStatus};
                            commonConditions["confirm_status.delayed_pickup_by_restaurant"] = {$exists :false};
                        break;
                        case "vip_orders":
                            commonConditions['is_vip'] = true;
                            commonConditions.admin_status	= {$nin : excludedStatus};
                        break;
                        case "delayed_delivery":
                            commonConditions['is_delayed_delivery'] = true;
                            commonConditions.admin_status	= {$nin : excludedStatus};
                            commonConditions["confirm_status.is_delayed_delivery"] = {$exists :false};
                        break;
                        case "delivery_cravez":
                            commonConditions['delivery_type'] = Constants.DELIVERY_BY_CRAVEZ;
                            commonConditions.admin_status	= {$nin : excludedStatus};
                        break;
                        case "delivery_restaurant":
                            commonConditions['delivery_type'] = Constants.DELIVERY_BY_RESTAURANT;
                            commonConditions.admin_status	= {$nin : excludedStatus};
                        break;
                        case "way_to_customer":
                            if(!commonConditions["$and"]) commonConditions["$and"] = [];
                            commonConditions["$and"].push(
                                {delivery_status : Constants.ORDER_DRIVER_WAY_TO_CUSTOMER},
                                {is_completed : {$ne: true}},
                            );
                        break;
                        case "way_to_restaurant":
                            commonConditions['delivery_status'] = Constants.ORDER_DRIVER_ACCEPTED;
                        break;
                        case "delivered":
                            commonConditions['admin_status'] = Constants.ORDER_DELIVERED;
                        break;
                        case "not_assigned":
                            commonConditions['is_completed']	= {$exists: false};
                            commonConditions.admin_status	    = {$nin : excludedStatus};
                            if(!commonConditions["$and"]) commonConditions["$and"] = [];
                            commonConditions['$and'].push(
                                {is_completed: {$ne: true }},
                                {admin_status: {$nin: [Constants.ORDER_PAYMENT_PENDING, Constants.ORDER_PAYMENT_FAILED] }},
                                {$or:[
                                    {delivery_type:	Constants.DELIVERY_BY_CRAVEZ, captain_id:	"", assigned_captain : {$exists: false }},
                                    {delivery_type:	Constants.DELIVERY_BY_RESTAURANT, captain_name: {$exists: false} },
                                ]}
                            );
                        break;
                    }
                }

                /** Conditions for delivery by */
                if(deliveryType){
                    if(deliveryType.constructor !== Array)  deliveryType = [deliveryType];

                    let deliveryByConditions = [];
                    deliveryType.map(key=>{
                        deliveryByConditions.push({delivery_type : key });
                    });
                    if(!dataTableConfig.conditions['$and']) dataTableConfig.conditions['$and'] =[];
                    dataTableConfig.conditions['$and'].push({$or: deliveryByConditions});
                }

                /** Conditions for restaurants */
                if(restaurantId){
                    if(restaurantId.constructor !== Array)  restaurantId = [restaurantId];
                    restaurantId = arrayToObject(restaurantId);

                    if(!dataTableConfig.conditions['$and']) dataTableConfig.conditions['$and'] =[];
                    dataTableConfig.conditions['$and'].push({restaurant_id : {$in : restaurantId}});
                }

                /** Conditions for order assigned or not */
                if(isOrderAssigned){
                    if(!dataTableConfig.conditions['$and']) dataTableConfig.conditions['$and'] =[];

                    if(isOrderAssigned == Constants.ORDER_ASSIGNED){
                        dataTableConfig.conditions['$and'].push({$or: [
                            {captain_name	: {$exists: true, $ne: ""}}, // when restaurant delivered
                            {$or: [ 
                                {assigned_captain : {$ne: null} },
                                {captain_id	  	  : {$ne : ""} },
                            ]},// when cravez delivered
                        ]});
                    }else{
                        dataTableConfig.conditions['is_completed']	= {$exists: false};
                        dataTableConfig.conditions.admin_status	    = {$nin: excludedStatus};

                        dataTableConfig.conditions['$and'].push(
                            {is_completed: {$ne: true }},
                            {admin_status: {$nin: [Constants.ORDER_PAYMENT_PENDING, Constants.ORDER_PAYMENT_FAILED] }},
                            {$or:[
                                {delivery_type:	Constants.DELIVERY_BY_CRAVEZ, captain_id: "", assigned_captain : {$exists: false }},
                                {delivery_type:	Constants.DELIVERY_BY_RESTAURANT, captain_name: {$exists: false} },
                            ]}
                        );
                    }
                }

                /** Conditions for captain id */
                if(captainId){
                    if(!dataTableConfig.conditions['$and']) dataTableConfig.conditions['$and'] =[];
                    dataTableConfig.conditions['$and'].push({captain_id: new ObjectId(captainId)});
                }

                /** Conditions for order date */
                let dateConditions = {};
                if (fromDate != "" && toDate != "") {
                    dateConditions["order_date"] = {$gte : newDate(fromDate), $lte : newDate(toDate)};
                }

                dataTableConfig.conditions = Object.assign(dateConditions,dataTableConfig.conditions,commonConditions);

                // Get list or count of orders 
                let dbRes = await this.collectionDb.aggregate([
                    { $match: dataTableConfig.conditions },
                    {$facet : {
                        list : [
                            {$sort: dataTableConfig.sort_conditions },
                            {$skip: skip },
                            {$limit: limit },
                            {$project: {
                                _id:1, customer_id:1,is_confirm:1,number_of_queue:1,queue_time:1,invoice_number:1,unique_order_id:1,order_date:1,last_status_updated_on:1,restaurant_name:1,area_name:1,order_price:1,infinity_service:1,admin_status:1,modified:1,net_amount:1, is_first_order: 1, is_duplicate_order:1,is_completed:1,is_modified:1,captain_id:1,delivery_type:1,order_status:1,area_id:1,delivery_status:1,package_id:1, full_name: 1,mobile_number: 1,branch_id:1,restaurant_id:1,queue_sort: { $cond: [{$eq : ["$queue_time",""]},1,0]},is_big_order:1,is_delayed_acceptance:1,is_delayed_preperation:1,is_delayed_pickup_by_captain:1,is_delayed_picked_up_by_customer:1,is_delayed_pickup:1,is_vip:1,is_delayed_delivery:1,delivery_status:1,captain_name:1,captain_number:1,assigned_captain:1,assignment_type:1,amount_debited_by_wallet:1, previous_assigned_captains: 1,aghzeya_bill_no: 1
                            }}
                        ],
                        count: [
                            {$count: "count"},
                        ],
                    }}
                ]).toArray();

                /** Push captain id, delivery by id and order id in array */
                let result          = dbRes?.[0]?.list || [];
                let deliveryByIds	= [];
                let captainIds		= [];
                let orderIds		= [];
                let uniqueOrderIds  = [];
                let allBranchIds  	= [];
                if(result?.length) result.map(record=>{
                    if(record._id) orderIds.push(record._id);
                    if(record.branch_id) allBranchIds.push(record.branch_id);
                    if(record.captain_id) captainIds.push(record.captain_id);
                    if(record.delivery_type) deliveryByIds.push(record.delivery_type);
                    if(record.unique_order_id) uniqueOrderIds.push(record.unique_order_id);
                });

                asyncParallel({
                    order_detail : (childCallback)=>{
                        if(orderIds.length ==0) return childCallback(null,{});

                        const order_details = this.db.collection(Tables.ORDER_DETAILS);
                        order_details.find({
                            order_id : {$in : arrayToObject(orderIds)}
                        },{projection : {
                            order_id: 1,discount_price: 1,elapsed_time:1,customer_latitude:1,customer_longitude:1,delivery_area_id:1,customer_address_id: 1
                        }}).toArray().then(orderResult=>{
                            let orderList = {};
                            orderResult.map(order=>{
                                orderList[order.order_id] = {
                                    discount_price 		: order.discount_price,
                                    elapsed_time   		: order.elapsed_time,
                                    customer_latitude   : order.customer_latitude,
                                    customer_longitude  : order.customer_longitude,
                                    delivery_area_id  	: order.delivery_area_id,
                                    customer_address_id : order.customer_address_id
                                };
                            });
                            childCallback(null,orderList);
                        }).catch(next);
                    },
                    user_detail : (childCallback)=>{
                        if(captainIds.length ==0) return childCallback(null,{});

                        const users = this.db.collection(Tables.USERS);
                        users.find({
                            _id : {$in : arrayToObject(captainIds)}
                        },{projection : {_id: 1,full_name: 1}}).toArray().then(userResult=>{
                            let userList = {};
                            userResult.map(user=>{
                                userList[user._id] = user.full_name ;
                            });
                            childCallback(null,userList);
                        }).catch(next);
                    },
                    delivery_detail : (childCallback)=>{
                        if(deliveryByIds.length ==0) return childCallback(null,{});

                        const delivery_methods = this.db.collection(Tables.DELIVERY_METHODS);
                        delivery_methods.find({
                            slug : {$in : deliveryByIds}
                        },{projection : {slug: 1,title: 1}}).toArray().then(deliveryResult=>{

                            let deliveryList = {};
                            deliveryResult.map(delivery=>{
                                deliveryList[delivery.slug] = delivery.title;
                            });
                            childCallback(null,deliveryList);
                        }).catch(next);
                    },
                    delivery_areas : (childCallback)=>{
                        if(result.length ==0) return childCallback(null,{});

                        const areas = this.db.collection(Tables.AREAS);
                        areas.find({},{projection: {_id:1,name:1}}).toArray().then(areaResult=>{
                            let deliveryAreaList = {};
                            areaResult.map(area=>{
                                deliveryAreaList[area._id] = area.name;
                            });
                            childCallback(null,deliveryAreaList);
                        }).catch(next);
                    },
                    modify_order_details : (childCallback)=>{
                        if(uniqueOrderIds.length ==0) return childCallback(null,{});

                        /** Get modify order price **/
                        const order_modify_logs = this.db.collection(Tables.ORDER_MODIFY_LOGS);
                        order_modify_logs.aggregate([
                            {$match	: {unique_order_id : {$in : uniqueOrderIds}}},
                            {$sort : {created: Constants.SORT_ASC}},
                            {$group	: {
                                _id  :{
                                    unique_order_id: "$unique_order_id"
                                },
                                unique_order_id    : {$first : "$unique_order_id"},
                                modify_order_price : {$first : "$order_price"},
                            }},
                        ]).toArray().then(findResult=>{
                            childCallback(null,findResult);
                        }).catch(next);
                    },
                    branch_list : (childCallback)=>{
                        if(allBranchIds.length ==0) return childCallback(null,{});

                        /** Get branch details **/
                        const restaurant_branches = this.db.collection(Tables.RESTAURANT_BRANCHES);
                        restaurant_branches.find({_id : {$in: allBranchIds}},{projection: {_id:1, area_id:1,name:1}}).toArray().then(branchResult=>{

                            let tmpBranchObj = {};
                            branchResult.map(records=>{
                                tmpBranchObj[records._id] = records;
                            });
                            childCallback(null,tmpBranchObj);
                        }).catch(next);
                    }
                },(childErr, childResponse)=>{
                    if(childErr) return next(childErr);

                    let modifyOrderResult = childResponse?.modify_order_details || [];
                    let tmpBranchList= childResponse?.branch_list || {};
                    if(result?.length) result.map(record=>{
                        let tmpOrderDetails	=	childResponse?.order_detail?.[record._id] || {};
                        let deliveryAreaId 	=   tmpOrderDetails?.delivery_area_id || "";

                        let branchAreaId    =   tmpBranchList?.[record.branch_id]?.area_id  || "";
                        let branchName 	    =   tmpBranchList?.[record.branch_id]?.name	    || "";
                        
                        record.branch_restaurant_name = branchName;
                        record.area_name = childResponse?.delivery_areas?.[branchAreaId] || {};

                        if(record.delivery_type == Constants.DELIVERY_BY_CRAVEZ && record?.captain_id){
                            record.captain_name  = childResponse?.user_detail?.[record.captain_id] || "";
                        }

                        record.delivery_by          =   childResponse?.delivery_detail?.[record.delivery_type] || "";
                        record.delivery_area_name   =   childResponse?.delivery_areas?.[deliveryAreaId] || "";
                        record.discount_price       =   tmpOrderDetails?.discount_price || "";
                        record.elapsed_time         =   tmpOrderDetails?.elapsed_time || "";
                        record.customer_longitude   =   tmpOrderDetails?.customer_longitude || "";
                        record.customer_latitude    =   tmpOrderDetails?.customer_latitude || "";
                        record.customer_address_id  =   tmpOrderDetails?.customer_address_id || "";

                        /** Insert modify order price in records **/
                        modifyOrderResult.map(orderRecords=>{
                            if(record.unique_order_id == orderRecords.unique_order_id){
                                record.modify_order_price = orderRecords.modify_order_price
                            }
                        });

                        /** Insert time passed in records **/
                        let currentDate = newDate();
                        let timePassed  = getDifferenceBetweenTwoDatesInMinute(record.order_date,currentDate);
                        record.time_passed = (timePassed >0) ? parseInt(timePassed) :0;
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
            }else{
                asyncParallel({
                    driver_details:(childCallback)=>{
                        if(authUserRoleId != Constants.FLEET ) return childCallback(null,null);

                        /** Get driver ids */
                        getAllDriverIdsWhoHaveShift(req,res,next,{area_ids: fleetAreaIds}).then(shiftRes=>{
                            childCallback(null, shiftRes?.driver_ids || []);						
                        }).catch(next);	
                    },
                    all_driver_shift:(childCallback)=>{
                        if(authUserRoleId != Constants.FLEET || isTeamHead) return childCallback(null,null);
                        
                        /** get driver ids */
                        getAllDriverIdsWhoHaveShift(req,res,next).then(response=>{
                            return childCallback(null, response?.driver_ids || []);
                        }).catch(next);
                    },
                },(asyncChildErr, asyncChildResponse)=>{
                    if(asyncChildErr) return next(asyncChildErr);

                    /** Set  captain conditions */
                    let driverIds=(asyncChildResponse.driver_details)?asyncChildResponse.driver_details:[];
                    let captainConditions 	= 	clone(Constants.DRIVER_COMMON_CONDITIONS);

                    if(authUserRoleId == Constants.FLEET){
                        let allDriverShift 	=	(asyncChildResponse.all_driver_shift) ? 	asyncChildResponse.all_driver_shift 	:[];
                        if(!isTeamHead || driverIds.length >0){							
                            if(!captainConditions["$or"])  captainConditions["$or"] = [];
                            captainConditions["$or"].push({_id: {$in : driverIds}});
                            captainConditions["$or"].push({_id: {$nin : allDriverShift}, force_active: Constants.FORCE_ACTIVE, is_available: Constants.ACTIVE});
                        }
                    }

                    /** Set area conditions **/
                    let areaConditions 		 = clone(commonConditions);
                    areaConditions.is_active = Constants.ACTIVE;

                    /**Set driver conditions */
                    let driverConditions = clone(captainConditions);

                    asyncParallel({
                        dropdown_list : (callback)=>{
                            /**Get dropdown list **/
                            getDropdownList(req,res, next,{
                                collections :[
                                    {
                                        collection : Tables.RESTAURANTS,
                                        columns    : ["_id",["name",Constants.DEFAULT_LANGUAGE_CODE]],
                                        conditions : {status : Constants.ACTIVE ,is_deleted : Constants.NOT_DELETED},
                                    },
                                    {
                                        collection 	: Tables.AREAS,
                                        columns    	: ["_id",["name",Constants.DEFAULT_LANGUAGE_CODE]],
                                        conditions 	: areaConditions
                                    },
                                    {
                                        collection 	: Tables.USERS,
                                        columns    	: ["_id","full_name"],
                                        conditions 	: driverConditions,
                                        sort_conditions : {is_available : Constants.SORT_DESC,full_name: Constants.SORT_ASC}
                                    }
                                ],
                            }).then(dropDownResponse=> {
                                callback(null,dropDownResponse?.final_html_data || {});
                            }).catch(next);
                        }                      
                    },(asyncErr, asyncRes)=>{
                        if(asyncErr) return next(asyncErr);

                        let queryFromDate	= (req.query.from_date) ? req.query.from_date : "";
                        let queryToDate		= (req.query.to_date) ? req.query.to_date : "";

                        /** render order tracking page **/
                        req.breadcrumbs(BREADCRUMBS['admin/order_tracking/order_tracking']);
                        res.render('order_tracking',{
                            order_type          :   orderType,                            
                            restaurant_list     :   asyncRes?.dropdown_list?.[0] || "",
                            area_list 		    :   asyncRes?.dropdown_list?.[1] || "",
                            driver_list  	    :   asyncRes?.dropdown_list?.[2] || "",
                            businessRule  		:   businessRule,
                            filter_from_date	:   queryFromDate,
                            filter_to_date		:   queryToDate,
                        });
                    });
                });
            }
        } catch (error) {
            next(error);
        }
    }

    /**
	 * Function to get order count
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 *
	 * @return render/json
	 */
	async getOrderCounts(req,res,next){
		try {
			let isTeamHead		= (req.session.user.team_head) ? req.session.user.team_head :false;
			let authUserRoleId	= req.session.user.user_role_id;
			let fromDate  		= (req.body.from_date) ? req.body.from_date	: "";
			let toDate 	  		= (req.body.to_date)   ? req.body.to_date   : "";

            /** Get fleet area ids */
            let fleetAreaIds = [];
            if(authUserRoleId == Constants.FLEET && !isTeamHead){
                fleetAreaIds = await getAreaIdsBasedOnFleetRole(req, res, next);
            } 
            
            let businessRule 		= 	null;
            let businessConditions 	=	null;
            if(authUserRoleId == Constants.CALL_CENTER_TEAM && !isTeamHead){
                let taskAssignments = await getConditionsBasedOnCallCenterRole(req,res,next);
                businessRule 		= taskAssignments?.rules || {};
                businessConditions 	= taskAssignments?.conditions || [];
            }

            /** Set conditions */
            let commonConditions = {};

            /** Conditions for order date */
            if (fromDate != "" && toDate != "") {
                commonConditions.order_date = {$gte: newDate(fromDate), $lte: newDate(toDate)};
            }

            /** Add fleet conditions */
            if(authUserRoleId == Constants.FLEET && !isTeamHead){
                commonConditions.branch_area_id = {$in : arrayToObject(fleetAreaIds)};
            }

            if(authUserRoleId == Constants.CALL_CENTER_TEAM && !isTeamHead){
                if(commonConditions.length >0) commonConditions["$or"] = businessConditions;                
            }

            let countConditions = clone(commonConditions);
            let excludedStatus	= [Constants.ORDER_REJECTED,Constants.ORDER_REJECTED_BY_ADMIN,Constants.ORDER_DELIVERED,Constants.ORDER_CANCELLED];

            /** Get order count stats */
            let result = await this.collectionDb.aggregate([
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
                                { "$not": { "$in": ["$admin_status", excludedStatus ] }},
                                { $eq : ["$is_delayed_acceptance", true ] },
                                { $not : ["$confirm_status.is_delayed_acceptance" ] },
                            ]},
                            1, 0
                        ]}
                    },
                    delayed_preparation : {$sum : {
                        $cond: [
                            {$and: [
                                { "$not": { "$in": ["$admin_status", excludedStatus ] }},
                                { $eq : ["$is_delayed_preperation", true ] },
                                { $not : ["$confirm_status.is_delayed_preperation" ] },
                            ]},
                            1, 0
                        ]}
                    },
                    delayed_pickup_by_captain : {$sum : {
                        $cond: [
                            {$and: [
                                { "$not": { "$in": ["$admin_status", excludedStatus ] }},
                                { $eq : ["$is_delayed_pickup_by_captain", true ] },
                                { $not : ["$confirm_status.is_delayed_pickup_by_captain" ] },
                            ]},
                            1, 0
                        ]}
                    },
                    delayed_pickup_by_customer : {$sum : {
                        $cond: [
                            {$and: [
                                { "$not": { "$in": ["$admin_status", excludedStatus ] }},
                                { $eq : ["$is_delayed_picked_up_by_customer", true ] },
                                { $not : ["$confirm_status.is_delayed_picked_up_by_customer" ] },
                            ]},
                            1, 0
                        ]}
                    },
                    delayed_pickup_by_restaurant : {$sum : {
                        $cond: [
                            {$and: [
                                { "$not": { "$in": ["$admin_status", excludedStatus ] }},
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
                                { "$not": { "$in": ["$admin_status", excludedStatus ] }},
                                { $eq : ["$is_vip", true ] },
                            ]},
                            1, 0
                        ]}
                    },
                    delayed_delivery : {$sum : {
                        $cond: [
                            {$and: [
                                { "$not": { "$in": ["$admin_status", excludedStatus ] }},
                                { $eq : ["$is_delayed_delivery", true ] },
                                { $not : ["$confirm_status.is_delayed_delivery" ] },
                            ]},
                            1, 0
                        ]}
                    },
                    delivery_cravez : {$sum : {
                        $cond: [
                            {$and: [
                                { "$not": { "$in": ["$admin_status", excludedStatus ] }},
                                { $eq : ["$delivery_type", Constants.DELIVERY_BY_CRAVEZ ] },
                            ]},
                            1, 0
                        ]}
                    },
                    delivery_restaurant : {$sum : {
                        $cond: [
                            {$and: [
                                { "$not": { "$in": ["$admin_status", excludedStatus ] }},
                                { $eq : ["$delivery_type", Constants.DELIVERY_BY_RESTAURANT ] },
                            ]},
                            1, 0
                        ]}
                    },
                    way_to_customer : {$sum : {
                        $cond: [
                            {$and: [
                                { $eq : ["$delivery_status", Constants.ORDER_DRIVER_WAY_TO_CUSTOMER ] },
                                { $ne : ["$is_completed", true ] },
                            ]},
                            1, 0
                        ]}
                    },
                    way_to_restaurant : {$sum : {
                        $cond: [
                            {$and: [
                                { $eq : ["$delivery_status", Constants.ORDER_DRIVER_ACCEPTED ] },
                            ]},
                            1, 0
                        ]}
                    },
                    order_delivered : {$sum : {
                        $cond: [
                            {$and: [
                                { $eq : ["$admin_status", Constants.ORDER_DELIVERED ] },
                            ]},
                            1, 0
                        ]}
                    },
                    order_not_assigned : {$sum : {
                        $cond: [
                            {$and: [
                                { $not: { $in: ["$admin_status", excludedStatus ] }},
                                { $not : ["$is_completed" ] },
                                { $or :  [
                                    {$and: [
                                        { $eq : ["$delivery_type", Constants.DELIVERY_BY_CRAVEZ ] },
                                        { $eq : ["$captain_id", "" ] },
                                        { $not : ["$assigned_captain"] },
                                    ]},
                                    {$and: [
                                        { $eq : ["$delivery_type", Constants.DELIVERY_BY_RESTAURANT ] },
                                        { $not : ["$captain_name" ] },
                                    ]}
                                ]},
                            ]},
                            1, 0
                        ]}
                    },
                }}
            ],{allowDiskUse: true }).toArray();

            /** Send response */
            result = (result && result[0]) ? result[0] :{};
            return {
                status				: 	Constants.STATUS_SUCCESS,
                first_orders 		: 	result?.first_orders 	  	|| 0,
                duplicate_orders	: 	result?.duplicate_orders 	|| 0,
                big_orders 			: 	result?.big_orders 	  		|| 0,
                order_rejected 		: 	result?.order_rejected   	|| 0,
                delayed_acceptance 	: 	result?.delayed_acceptance  || 0,
                delayed_preparation : 	result?.delayed_preparation || 0,
                vip_orders 			: 	result?.vip_orders 	     	|| 0,
                delayed_delivery 	: 	result?.delayed_delivery 	|| 0,
                delivery_cravez 	: 	result?.delivery_cravez  	|| 0,
                delivery_restaurant : 	result?.delivery_restaurant	|| 0,
                way_to_customer 	: 	result?.way_to_customer 	|| 0,
                way_to_restaurant 	: 	result?.way_to_restaurant 	|| 0,
                order_delivered 	: 	result?.order_delivered     || 0,
                order_not_assigned	:	result?.order_not_assigned 	|| 0,
                delayed_pickup_by_captain 	: result?.delayed_pickup_by_captain    ||0,
                delayed_pickup_by_customer 	: result?.delayed_pickup_by_customer   ||0,
                delayed_pickup_by_restaurant: result?.delayed_pickup_by_restaurant ||0,
            };
		} catch (error) {
			next(error);
		}
	};// end getOrderCounts

	/**
	 * Function to get order count on refresh
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 *
	 * @return render/json
	 */
	async getOrderData(req,res,next){
		try {
			let response = await this.getOrderCounts(req,res,next);			
			res.send(response);
		} catch (error) {
			next(error);
		}
	};// End getOrderData

    /**
     * Function to get order location
     *
     * @param req 	As Request Data
     * @param res 	As Response Data
     * @param next 	As Callback argument to the middleware function
     *
     * @return json
     */
    async getOrderLocation(req, res, next) {
        try {
            let refresh			= (req.query.refresh) ? req.query.refresh : '';
            let orderIds		= (req.body.order_ids) ? req.body.order_ids : [];

            asyncParallel({
                order_detail :(callback)=>{
                    /** Get order details **/
                    const order_details  = this.db.collection(Tables.ORDER_DETAILS);
                    order_details.find({order_id : {$in : arrayToObject(orderIds)}},{projection: {_id:1,order_id:1,restaurant_address:1,customer_address:1,customer_latitude:1,customer_longitude:1,restaurant_latitude:1,restaurant_longitude:1}}).toArray().then(orderDetailResult=>{
                        callback(null,orderDetailResult);
                    }).catch(next);
                },
                order_data :(callback)=>{
                    /** Get order details **/
                    this.collectionDb.find({_id : {$in : arrayToObject(orderIds)}},{projection: {_id:1,order_status:1,captain_id:1,unique_order_id:1}}).toArray().then(orderResult=>{
                        callback(null,orderResult);
                    }).catch(next);
                },
            },(asyncErr, asyncResponse)=>{
                if(asyncErr) return next(asyncErr);

                let orderDetail	=	(asyncResponse.order_detail) ? asyncResponse.order_detail : [];
                let orderData	=	(asyncResponse.order_data) ? asyncResponse.order_data : [];

                let captainIds = [];
                orderData.map(records=>{
                    if(records.captain_id) captainIds.push(records.captain_id);
                });
                captainIds = arrayToObject(captainIds);

                /** Get captain details **/
                const users  = this.db.collection(Tables.USERS);
                users.find({_id : {$in : captainIds}},{projection: {_id:1,longitude:1,latitude:1,full_name:1,mobile_number:1,order_status:1}}).toArray().then(userResult=>{

                    orderData.map(orderRecords=>{
                        orderDetail.map(detail=>{
                            if(String(orderRecords._id) == String(detail.order_id)){
                                orderRecords.customer_address = detail.customer_address;
                                orderRecords.customer_latitude = detail.customer_latitude;
                                orderRecords.customer_longitude = detail.customer_longitude;
                                orderRecords.restaurant_address = detail.restaurant_address;
                                orderRecords.restaurant_latitude = detail.restaurant_latitude;
                                orderRecords.restaurant_longitude = detail.restaurant_longitude;
                            }
                        });

                        userResult.map(userRecords=>{
                            if(String(orderRecords.captain_id) == String(userRecords._id)){
                                orderRecords.captain_status = userRecords.order_status;
                                orderRecords.latitude = userRecords.latitude;
                                orderRecords.longitude = userRecords.longitude;
                                orderRecords.full_name = userRecords.full_name;
                                orderRecords.mobile_number = userRecords.mobile_number;
                            }
                        });
                    });

                    if(refresh){
                        res.send({ status: Constants.STATUS_SUCCESS, result	: orderData });
                    }else{
                        /** Send response **/
                        res.render('view_map',{
                            status	: Constants.STATUS_SUCCESS,
                            result	: orderData,
                            order_ids: orderIds,
                            layout  : false
                        });
                    }
                });
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Function to get assign captain list
     *
     * @param req 	As Request Data
     * @param res 	As Response Data
     * @param next 	As Callback argument to the middleware function
     *
     * @return render
     */
    async assignCaptainList(req, res, next) {
        try {
            let authUserRoleId	= 	req.session.user.user_role_id;
            let orderId			= 	new ObjectId(req.params.order_id);
            let isTeamHead		=	(req.session.user.team_head) 	? req.session.user.team_head	:false;
            
            /** Get fleet area ids */
            let fleetAreaIds = [];
            if(authUserRoleId == Constants.FLEET && !isTeamHead){
                fleetAreaIds = await getAreaIdsBasedOnFleetRole(req, res, next);
            } 

            asyncParallel({
                order_details:(callback)=>{
                    /** Get order details  */
                    this.collectionDb.aggregate([
                        {$match: {
                            _id 			: 	orderId,
                            is_confirm 		: 	true,
                            delivery_type 	: 	Constants.DELIVERY_BY_CRAVEZ,
                            $and 			:	[
                                {is_completed: {$exists  :false }},
                                {is_completed: {$ne 	 :true }},
                            ]
                        }},
                        {$lookup: {	/** Get branch details **/
                            from 		:	Tables.RESTAURANT_BRANCHES,
                            localField  :	"branch_id",
                            foreignField:	"_id",
                            as 		  	:	"branch_details"
                        }},
                        {$project: {
                            _id:1,branch_id:1,restaurant_id:1,area_id:1, branch_area_id: {$arrayElemAt: ["$branch_details.area_id",0]}
                        }},
                    ]).toArray().then(orderResult=>{
                        callback(null, orderResult?.[0] || null);
                    }).catch(next);
                },
            },(asyncErr, asyncResponse)=>{
                if(asyncErr) return next(asyncErr);

                /** Send error response */
                if(!asyncResponse.order_details){
                    return res.status(400).send({ status: Constants.STATUS_ERROR,message: res.__("admin.system.invalid_access") });
                }

                /** Set area conditions */
                let orderDetils 	=	asyncResponse.order_details;
                let deliveryAreaId	= 	orderDetils.branch_area_id;

                /** Set area conditions */
                let areaConditions 	= 	{is_active: Constants.ACTIVE};

                /** Add fleet conditions */
                if(authUserRoleId == Constants.FLEET && !isTeamHead){
                    areaConditions= {...{_id: {$in: arrayToObject(fleetAreaIds)}}, ...areaConditions};
                }
                asyncParallel({
                    total_captains:(childCallback)=>{
                        /** Get driver ids */
                        const driver_in_out_shifts	= this.db.collection(Tables.DRIVER_IN_OUT_SHIFTS);
                        driver_in_out_shifts.distinct("driver_id",{type : Constants.IN_SHIFT}).then(driverIds=>{
                            let driverdCount = (driverIds) ? driverIds.length :0;
                            childCallback(null,driverdCount);
                        }).catch(next);
                    },
                    area_list:(childCallback)=>{
                        /**Get dropdown list **/
                        getDropdownList(req,res, next,{
                            collections :[{
                                collection 	: Tables.AREAS,
                                columns    	: ["_id",["name",Constants.DEFAULT_LANGUAGE_CODE]],
                                conditions 	: areaConditions,
                            }],
                        }).then(dropDownResponse=> {
                            childCallback(null, dropDownResponse?.final_html_data?.[0] || "");
                        }).catch(next);
                    },
                },(err, response)=>{
                    if(err) return next(err);

                    /** render assign captain page **/
                    res.render('assign_captain',{
                        layout			:	false,
                        order_id		: 	orderId,
                        area_list		: 	response.area_list,
                        total_captains	: 	response?.total_captains || Constants.ADMIN_LISTING_LIMIT,
                        branch_area_id	: 	deliveryAreaId,
                    });
                });
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Function to get captain list
     *
     * @param req 	As Request Data
     * @param res 	As Response Data
     * @param next 	As Callback argument to the middleware function
     *
     * @return json
     */
    async getCaptainList(req, res, next) {
        try {
            let authUserRoleId		= 	req.session.user.user_role_id;
            let isTeamHead			= 	(req.session.user.team_head) ? req.session.user.team_head :false;
            let limit 				= 	(req.body.length) 		?	parseInt(req.body.length) 	:Constants.ADMIN_LISTING_LIMIT;
            let skip 				= 	(req.body.start)   		? 	parseInt(req.body.start)  	:Constants.DEFAULT_SKIP;
            let areaId 				= 	(req.body.area_id)   	?	req.body.area_id		 	:"";
            let orderId 			= 	(req.body.order_id)   	?	new ObjectId(req.body.order_id) :"";
            let fullName 			= 	(req.body.full_name)	?	req.body.full_name 			:"";
            let driverOrderStatus	=	(req.body.driver_order_status) ? req.body.driver_order_status :[];
            let totalRecord			=	(req.body.total_record)  ?	req.body.total_record 		:Constants.ADMIN_LISTING_LIMIT;
            let allActiveDrivers	=	(req.body.all_active_drivers) ? req.body.all_active_drivers :"";
            if(areaId && areaId.constructor != Array) areaId = [areaId];
            if(driverOrderStatus && driverOrderStatus.constructor != Array) driverOrderStatus = [driverOrderStatus];

            /** Get fleet area ids */
            let fleetAreaIds = [];
            if(authUserRoleId == Constants.FLEET && !isTeamHead){
                fleetAreaIds = await getAreaIdsBasedOnFleetRole(req, res, next);
            } 

            asyncParallel({
                order_details:(callback)=>{
                    /** Get order details  */
                    const order_details = this.db.collection(Tables.ORDER_DETAILS);
                    order_details.findOne({order_id: orderId },{projection: {restaurant_longitude:1,restaurant_latitude:1,delivery_area_id:1}}).then(orderResult=>{
                        callback(null, orderResult);
                    }).catch(next);
                },
                orders:(callback)=>{
                    /** Get order details  */
                    this.collectionDb.aggregate([
                        {$match: {_id: orderId}},
                        {$lookup: {	/** Get resturant details **/
                            from 		:	Tables.RESTAURANTS,
                            localField  :	"restaurant_id",
                            foreignField:	"_id",
                            as 		  	:	"restaurant_details"
                        }},
                        {$lookup: {	/** Get branch details **/
                            from 		:	Tables.RESTAURANT_BRANCHES,
                            localField  :	"branch_id",
                            foreignField:	"_id",
                            as 		  	:	"branch_details"
                        }},
                        {$project: {
                            assigned_captain:1, branch_id:1,restaurant_id:1,area_id:1,
                            delivery_vehicle_type: {$arrayElemAt: ["$branch_details.delivery_vehicle_type",0]},
                            restaurant_vehicle_type: {$arrayElemAt: ["$restaurant_details.delivery_vehicle_type",0]},
                        }},
                    ]).toArray().then(orderResult=>{
                        callback(null, orderResult?.[0] || {});
                    }).catch(next);
                },
                all_driver_shift:(callback)=>{
                    /** get driver ids */
                    getAllDriverIdsWhoHaveShift(req,res,next).then(response=>{
                        return callback(null,response?.driver_ids || []);
                    }).catch(next);
                },
            },(asyncErr, asyncResponse)=>{
                if(asyncErr) return next(asyncErr);

                let orderData 			 = 	(asyncResponse.orders) 				? 	asyncResponse.orders				:{};
                let orderDetails 		 =	(asyncResponse.order_details) 		? 	asyncResponse.order_details			:{};
                let deliveryAreaId 		 =	(orderDetails.delivery_area_id) 	? 	orderDetails.delivery_area_id		:"";
                let assignedCaptain 	 =	(orderData.assigned_captain) 		?	orderData.assigned_captain			:"";
                let restaurantVehicleType=	(orderData.restaurant_vehicle_type)	?	orderData.restaurant_vehicle_type 	:[];
                let branchVehicleType	 =	(orderData.delivery_vehicle_type)	? 	orderData.delivery_vehicle_type   	:[];
                let restaurantId	 	 =	(orderData.restaurant_id) 			?	orderData.restaurant_id   			:"";
                let branchId	 		 =	(orderData.branch_id) 				?	orderData.branch_id   				:"";

                asyncParallel({
                    branch_area:(childCallback)=>{
                        if(allActiveDrivers) return childCallback(null,{});

                        /** Get branch area wise vehicles */
                        const restaurant_branch_areas = this.db.collection(Tables.RESTAURANT_BRANCH_AREAS);
                        restaurant_branch_areas.findOne({
                            branch_id		:	branchId,
                            area_id			: 	deliveryAreaId,
                            restaurant_id	: 	restaurantId,
                        },{projection: {delivery_vehicle_type:1,driver_selection_type:1}}).then(areasResult=>{
                            childCallback(null,areasResult);
                        }).catch(next);
                    },
                },async (asyncErr, asyncChildResponse)=>{
                    if(asyncErr) return next(asyncErr);

                    let branchAreaDetails	=	asyncChildResponse?.branch_area || {};
                    let areaVehicleType	    =	branchAreaDetails?.delivery_vehicle_type || [];
                    let driverSelectionType	=	branchAreaDetails?.driver_selection_type || "";

                    if(branchVehicleType && branchVehicleType.constructor != Array) branchVehicleType = [branchVehicleType];
                    if(restaurantVehicleType && restaurantVehicleType.constructor != Array) restaurantVehicleType = [restaurantVehicleType];
                    if(areaVehicleType && areaVehicleType.constructor != Array) areaVehicleType = [areaVehicleType];

                    /** Manage condition for branch/restaurant vechile type **/
                    let vehicleType = (areaVehicleType.length > 0) ? areaVehicleType : ((branchVehicleType.length > 0) ? branchVehicleType  : restaurantVehicleType);

                    /** Configure Datatable conditions*/
                    let dataTableConfig = await configDatatable(req,res,null);                        

                    /** Add fleet conditions */
                    let tmpOptions 		=	{};
                    let allDriverShift 	=	asyncResponse?.all_driver_shift || [];
                    if(authUserRoleId == Constants.FLEET && !isTeamHead) tmpOptions.area_ids = fleetAreaIds;
                    
                    /** Add area conditions */
                    if(areaId && areaId.length >0){
                        if(!tmpOptions.area_ids) tmpOptions.area_ids = [];
                        tmpOptions.area_ids = tmpOptions.area_ids.concat(areaId);
                    }

                    /** Get driver ids */
                    let shiftRes = await getAllDriverIdsWhoHaveShift(req,res,next,tmpOptions);
                    let driverIds = shiftRes?.driver_ids || [];

                    /** Set common conditions */
                    let drvrConditions  = {
                        $or: [
                            {_id: {$in:  driverIds}},
                            {_id: {$nin: allDriverShift}, force_active: Constants.FORCE_ACTIVE},
                        ]
                    };
                    let commonConditions = {...drvrConditions, ...Constants.DRIVER_ASSIGNMENT_CONDITIONS };

                    /** Set vechial conditions */
                    if(!allActiveDrivers && driverSelectionType != Constants.PRIORITY){
                        commonConditions.vehicle_type = {$in: vehicleType};
                    }

                    if(driverOrderStatus.length > 0){
                        if(!dataTableConfig.conditions["$or"]) dataTableConfig.conditions["$or"] = [];
                        dataTableConfig.conditions["$or"].push({order_status: {$in: driverOrderStatus}});
                        dataTableConfig.conditions["$or"].push({"orders.status": {$in: driverOrderStatus}} );
                        if(driverOrderStatus.indexOf(Constants.ORDER_DRIVER_FREE) !== -1){
                            dataTableConfig.conditions["$or"].push({order_status : {$exists: false}});
                        }
                    }

                    if(fullName && fullName!=''){
                        try{
                            fullName = cleanRegex(fullName);
                            dataTableConfig.conditions.full_name = new RegExp(fullName, "i");
                        }catch(e){
                            dataTableConfig.conditions.full_name = fullName;
                        }
                    }

                    /** Revert sorting when sort by google distane */
                    let sortStatus = "";
                    if(dataTableConfig.sort_conditions.distance_in_minutes){
                        sortStatus = dataTableConfig.sort_conditions.distance_in_minutes;
                        dataTableConfig.sort_conditions = {_id: Constants.SORT_DESC};
                        limit	=	(totalRecord) ?	parseInt(totalRecord) 	:Constants.ADMIN_LISTING_LIMIT;
                        skip	=	Constants.DEFAULT_SKIP;
                        if(Object.keys(dataTableConfig.conditions).length ==0){
                            limit = (limit > Constants.ADMIN_LISTING_LIMIT) ? limit : Constants.ADMIN_LISTING_LIMIT;
                        }
                    }

                    dataTableConfig.conditions = {...commonConditions, ...dataTableConfig.conditions };
                    const collection  = this.db.collection(Tables.USERS);
                    asyncParallel({
                        records:(callback)=>{
                            /** Get list of driver  **/
                            collection.find(dataTableConfig.conditions,{projection: {_id:1,full_name:1,is_available :1,active_orders :1,latitude:1,longitude:1,orders:{ $elemMatch: { order_id: orderId } },active:1, order_status: 1}}).collation(Constants.COLLATION_VALUE).sort(dataTableConfig.sort_conditions).limit(limit).skip(skip).toArray().then(result=>{
                                if(result.length <=0 || (!orderDetails.restaurant_latitude || !orderDetails.restaurant_longitude)) return  callback(null, result);
                                    
                                result.map(records=>{
                                    let driverName = records.full_name+'<span class="required">* </span>';
                                    if(allDriverShift.length >0){
                                        allDriverShift.map(tmpId=>{
                                            if(String(records._id) == String(tmpId)){
                                                driverName = records.full_name;
                                            }
                                        });
                                    }
                                    records.full_name = driverName;
                                });
                                
                                this.assignmentModel.getDistanceBetweenLocations(req,res,next,{
                                    locations			: 	result,
                                    order_id			: 	orderId,
                                    assignment_type		:	Constants.MANUAL_ASSIGNMENT,
                                    pickup_latitude  	: 	orderDetails?.restaurant_latitude   || 0,
                                    pickup_longitude 	: 	orderDetails?.restaurant_longitude  || 0,
                                }).then((locationResponse)=>{
                                    if(locationResponse.status!= Constants.STATUS_SUCCESS) return  callback(locationResponse, result);

                                    if(sortStatus){
                                        let sortKeys 		= 	["invalid"];
                                        let distanceField 	=	"distance_in_minutes";
                                        if(sortStatus == Constants.SORT_DESC) distanceField = "-"+distanceField;
                                        sortKeys.push(distanceField);
                                        locationResponse.locations = locationResponse.locations.sort(sortByKey(sortKeys));
                                    }
                                    callback(null, locationResponse.locations);
                                }).catch(next);
                            });
                        },
                        total_records:(callback)=>{
                            /** Get total number of records in users collection **/
                            collection.countDocuments(commonConditions).then(countResult=>{
                                callback(null, countResult);
                            }).catch(next);
                        },
                        filter_records:(callback)=>{
                            /** Get filtered records in users collection **/
                            collection.countDocuments(dataTableConfig.conditions).then(filterContResult=>{
                                callback(null, filterContResult);
                            }).catch(next);
                        }
                    },(err, response)=>{

                        /** Send response **/
                        res.send({
                            status			: (!err) ? Constants.STATUS_SUCCESS : Constants.STATUS_ERROR,
                            assigned_captain: assignedCaptain,
                            draw			: dataTableConfig.result_draw,
                            data			: response?.records || [],
                            recordsFiltered	: response?.filter_records || 0,
                            recordsTotal	: response?.total_records || 0,
                            conditions	    : dataTableConfig.conditions,
                        });
                    });
                });
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Function to get floor status list
     *
     * @param req 	As Request Data
     * @param res 	As Response Data
     * @param next 	As Callback argument to the middleware function
     *
     * @return json
     */
    async getFloorStatusList(req, res, next) {
        try {
            let authUserRoleId	= 	req.session.user.user_role_id;
            let isTeamHead		= 	(req.session.user.team_head) ? req.session.user.team_head :false;
            let areaId 			=	(req.body.area_id)	?	new ObjectId(req.body.area_id) 	:"";

            /** Get fleet area ids */
            let fleetAreaIds = [];
            if(authUserRoleId == Constants.FLEET && !isTeamHead){
                fleetAreaIds = await getAreaIdsBasedOnFleetRole(req, res, next);
            } 

            let allDriverRes = await getAllDriverIdsWhoHaveShift(req,res,next);
            let allDriverShift = allDriverRes?.driver_ids || [];    
    
            /** Add fleet conditions */
            let tmpOptions =	{};
            if(authUserRoleId == Constants.FLEET && !isTeamHead){
                tmpOptions.area_ids = fleetAreaIds;
            }

            /** Add area conditions */
            if(areaId){
                if(!tmpOptions.area_ids) tmpOptions.area_ids = [];
                tmpOptions.area_ids.push(areaId);
            }

            /** Get driver ids */
            let areaWiseDriverRes = await getAllDriverIdsWhoHaveShift(req,res,next,tmpOptions);
            let areaWiseDriverIds = areaWiseDriverRes?.driver_ids || [];
            
            /** Set common conditions */
            let commonConditions =	{
                ...Constants.DRIVER_COMMON_CONDITIONS, 
                ...{$or: [ 
                    {_id: {$in: arrayToObject(areaWiseDriverIds)}}, 
                    {
                        _id: {$nin: arrayToObject(allDriverShift)}, 
                        force_active: Constants.FORCE_ACTIVE 
                    } 
                ]},
                is_available : Constants.AVAILABLE,
                vehicle_type : {$exists: true},
            };

            /** Get captain list */
            const users	= this.db.collection(Tables.USERS);
            let driverStats = await users.aggregate([
                {$match: commonConditions},
                {$addFields: {
                    order_status :  {$ifNull: ['$order_status', Constants.ORDER_DRIVER_FREE] } ,
                }},
                {$unwind: {path: "$orders", preserveNullAndEmptyArrays: true }},
                {$group : {
                    _id 		 	: "$_id",
                    vehicle_type 	: {$first: "$vehicle_type"},
                    order_status 	: {$first: "$order_status"},
                    orders		 	: {$push: "$orders"},
                    assigned_captain: {$sum: {
                        $cond: [
                            {$or: [
                                { $eq : ["$orders.status",Constants.ORDER_DRIVER_ASSIGNED] },
                            ]},
                            1,0
                        ]}
                    },
                    way_to_restaurant_captain: {$sum: {
                        $cond: [
                            {$or: [
                                { $eq : ["$orders.status",Constants.ORDER_DRIVER_ACCEPTED] },
                            ]},
                            1,0
                        ]}
                    },
                    arrived_at_restaurant_captain: {$sum: {
                        $cond: [
                            {$or: [
                                { $eq : ["$orders.status",Constants.ORDER_DRIVER_ARRIVED_AT_RESTAURANT] },
                            ]},
                            1,0
                        ]}
                    },
                    way_to_customer_captain: {$sum: {
                        $cond: [
                            {$or: [
                                { $eq : ["$orders.status",Constants.ORDER_DRIVER_WAY_TO_CUSTOMER] },
                            ]},
                            1,0
                        ]}
                    },
                    arrived_at_customer_captain: {$sum: {
                        $cond: [
                            {$or: [
                                { $eq : ["$orders.status",Constants.ORDER_DRIVER_ARRIVED_AT_CUSTOMER_LOCATION] },
                            ]},
                            1,0
                        ]}
                    },
                }},
                {$group : {
                    _id : null,
                    total_captain : {$sum : 1},
                    total_captain_with_bike : {$sum : {
                        $cond: [
                            {$and: [
                                { $eq : ["$vehicle_type",Constants.VEHICLE_TYPE_BIKE] },
                            ]},
                            1,0
                        ]}
                    },
                    total_captain_with_car : {$sum : {
                        $cond: [
                            {$and: [
                                { $eq : ["$vehicle_type",Constants.VEHICLE_TYPE_CAR] },
                            ]},
                            1,0
                        ]}
                    },
                    free_captain : {$sum : {
                        $cond: [
                            {$or: [
                                /* For not exists */
                                { $not: { $gt: ['$order_status', null]} },
                                { $eq : ["$order_status",Constants.ORDER_DRIVER_FREE] },
                            ]},
                            1,0
                        ]}
                    },
                    free_captain_with_bike : {$sum : {
                        $cond: [
                            {$and: [
                                { $eq : ["$vehicle_type",Constants.VEHICLE_TYPE_BIKE] },
                                {
                                    $or: [
                                        { $not: { $gt: ['$order_status', null]} },
                                        { $eq : ["$order_status",Constants.ORDER_DRIVER_FREE] },
                                    ]
                                }
                            ]},
                            1,0
                        ]}
                    },
                    free_captain_with_car : {$sum : {
                        $cond: [
                            {$and: [
                                { $eq : ["$vehicle_type",Constants.VEHICLE_TYPE_CAR] },
                                {
                                    $or: [
                                        { $not: { $gt: ['$order_status', null]} },
                                        { $eq : ["$order_status",Constants.ORDER_DRIVER_FREE] },
                                    ]
                                }
                            ]},
                            1,0
                        ]}
                    },
                    assigned_captain : {$sum : "$assigned_captain"},
                    assigned_captain_with_bike : {$sum : {
                        $cond: [
                            {$and: [
                                {$eq: ["$vehicle_type",Constants.VEHICLE_TYPE_BIKE] },
                            ]},
                            "$assigned_captain",0
                        ]}
                    },
                    assigned_captain_with_car : {$sum : {
                        $cond: [
                            {$and: [
                                {$eq: ["$vehicle_type",Constants.VEHICLE_TYPE_CAR] },
                            ]},
                            "$assigned_captain",0
                        ]}
                    },
                    way_to_restaurant : {$sum : "$way_to_restaurant_captain"},
                    way_to_restaurant_with_bike : {$sum : {
                        $cond: [
                            {$and: [
                                {$eq: ["$vehicle_type",Constants.VEHICLE_TYPE_BIKE] },
                            ]},
                            "$way_to_restaurant_captain",0
                        ]}
                    },
                    way_to_restaurant_with_car : {$sum : {
                        $cond: [
                            {$and: [
                                {$eq: ["$vehicle_type",Constants.VEHICLE_TYPE_CAR] },
                            ]},
                            "$way_to_restaurant_captain",0
                        ]}
                    },
                    arrived_at_restaurant : {$sum : "$arrived_at_restaurant_captain"},
                    arrived_at_restaurant_with_bike : {$sum : {
                        $cond: [
                            {$and: [
                                {$eq: ["$vehicle_type",Constants.VEHICLE_TYPE_BIKE] },
                            ]},
                            "$arrived_at_restaurant_captain",0
                        ]}
                    },
                    arrived_at_restaurant_with_car : {$sum : {
                        $cond: [
                            {$and: [
                                {$eq: ["$vehicle_type",Constants.VEHICLE_TYPE_CAR] },
                            ]},
                            "$arrived_at_restaurant_captain",0
                        ]}
                    },
                    way_to_customer : {$sum : "$way_to_customer_captain"},
                    way_to_customer_with_bike : {$sum : {
                        $cond: [
                            {$and: [
                                {$eq: ["$vehicle_type",Constants.VEHICLE_TYPE_BIKE] },
                            ]},
                            "$way_to_customer_captain",0
                        ]}
                    },
                    way_to_customer_with_car : {$sum : {
                        $cond: [
                            {$and: [
                                {$eq: ["$vehicle_type",Constants.VEHICLE_TYPE_CAR] },
                            ]},
                            "$way_to_customer_captain",0
                        ]}
                    },
                    arrived_at_customer : {$sum : "$arrived_at_customer_captain"},
                    arrived_at_customer_with_bike : {$sum : {
                        $cond: [
                            {$and: [
                                {$eq: ["$vehicle_type",Constants.VEHICLE_TYPE_BIKE] },
                            ]},
                            "$arrived_at_customer_captain",0
                        ]}
                    },
                    arrived_at_customer_with_car : {$sum : {
                        $cond: [
                            {$and: [
                                {$eq: ["$vehicle_type",Constants.VEHICLE_TYPE_CAR] },
                            ]},
                            "$arrived_at_customer_captain",0
                        ]}
                    },
                }},
            ]).toArray();

            let captainDetails = driverStats?.[0] || {};
            let finalArray = [
                {
                    status_label : res.__("admin.order_tracking.total_captains"),
                    total_captain    : captainDetails.total_captain || 0,
                    captain_with_car : captainDetails.total_captain_with_car || 0,
                    captain_with_bike: captainDetails.total_captain_with_bike || 0,
                },
                {
                    status_label : res.__("admin.order_tracking.total_free_captains"),
                    total_captain : captainDetails.free_captain || 0,
                    captain_with_car : captainDetails.free_captain_with_car || 0,
                    captain_with_bike: captainDetails.free_captain_with_bike || 0,
                },
                {
                    status_label : res.__("admin.order_tracking.assigned_captains"),
                    total_captain : captainDetails.assigned_captain || 0,
                    captain_with_car : captainDetails.assigned_captain_with_car || 0,
                    captain_with_bike: captainDetails.assigned_captain_with_bike || 0,
                },
                {
                    status_label : res.__("admin.order_tracking.way_to_restaurant"),
                    total_captain : captainDetails.way_to_restaurant || 0,
                    captain_with_car : captainDetails.way_to_restaurant_with_car || 0,
                    captain_with_bike: captainDetails.way_to_restaurant_with_bike || 0,
                },
                {
                    status_label : res.__("admin.order_tracking.arrived_at_restaurant"),
                    total_captain : captainDetails.arrived_at_restaurant || 0,
                    captain_with_car : captainDetails.arrived_at_restaurant_with_car || 0,
                    captain_with_bike: captainDetails.arrived_at_restaurant_with_bike || 0,
                },
                {
                    status_label : res.__("admin.order_tracking.way_to_customer"),
                    total_captain : captainDetails.way_to_customer || 0,
                    captain_with_car : captainDetails.way_to_customer_with_car || 0,
                    captain_with_bike: captainDetails.way_to_customer_with_bike || 0,
                },
                {
                    status_label : res.__("admin.order_tracking.captain_arrived_at_customer_location"),
                    total_captain : captainDetails.arrived_at_customer || 0,
                    captain_with_car : captainDetails.arrived_at_customer_with_car || 0,
                    captain_with_bike: captainDetails.arrived_at_customer_with_bike || 0,
                }
            ];

            res.send({
                status			: Constants.STATUS_SUCCESS,
                draw			: 0,
                data			: finalArray,
                recordsFiltered	: finalArray.length,
                recordsTotal	: finalArray.length,
            });           
        } catch (error) {
            next(error);
        }
    }

    /**
	 * Function to assign order to captain
	 * Common for order tracking and captan tracking module
	 *
	 * @param req 		As Request Data
	 * @param res 		As Response Data
	 * @param next		As Callback argument to the middleware function
	 * @param options	As options
	 *
	 * @return response
	 */
	async assignOrderToCaptain (req,res,next,options){
		return new Promise(resolve=>{
			let orderId 			= (options.order_id) ? new ObjectId(options.order_id) : '';
			let captainId 			= (options.captain_id) ? new ObjectId(options.captain_id) : '';
			let distanceInMinutes 	= (options.distance_in_minutes) ? parseInt(options.distance_in_minutes) : 0;
			let authId 				= (options.user_id) ? new ObjectId(options.user_id) : '';
			let authRoleId 			= (options.user_role_id) ? options.user_role_id : '';

			if(!orderId || !authId || !authRoleId || !captainId) return resolve({status: Constants.STATUS_ERROR, message: res.__("system.missing_parameters")});

			asyncParallel({
				order_details:(callback)=>{
					/** Get order details  */
					this.collectionDb.findOne({
						_id 			: 	orderId,
						is_confirm 		: 	true,
						delivery_type 	: 	Constants.DELIVERY_BY_CRAVEZ,
						$and 			:	[
							{is_completed: {$exists  :false }},
							{is_completed: {$ne 	 :true }},
						]
					},{projection: {restaurant_id:1,branch_id:1,area_id:1,customer_id:1,order_assignment_process_time:1}}).then(orderResult=>{
						callback(null, orderResult);
					}).catch(next);
				},
				order_sub_details:(callback)=>{
					/** Get order details  */
					const order_details = this.db.collection(Tables.ORDER_DETAILS);
					order_details.findOne({
						order_id: orderId
					},{projection: {restaurant_longitude:1,restaurant_latitude:1,delivery_area_id:1}}).then(orderResult=>{
						callback(null, orderResult);
					}).catch(next);
				},
			},(asyncErr, asyncResponse)=>{
				if(asyncErr) return next(asyncErr);

				/** Send error response */
				if(!asyncResponse.order_details || !asyncResponse.order_sub_details){
					return resolve({status: Constants.STATUS_ERROR, message: res.__("admin.system.invalid_access") });
				}

				let orderDetails 	= asyncResponse.order_details;
				let orderSubDetails = asyncResponse.order_sub_details;
				
				/** Send error response */
				if(orderDetails.order_assignment_process_time){
					return resolve({status: Constants.STATUS_ERROR, message: res.__("admin.orders.already_assignment_process_running") });
				}

				/** Assign order to captain */
				this.assignmentModel.assignCaptainForOrder(req,res,next,{
					order_id 				:	orderId,
					assigned_by 			: 	authId,
					assigned_role_by		: 	authRoleId,
					captain_id 				: 	captainId,
					assignment_type 		: 	Constants.MANUAL_ASSIGNMENT,
					customer_id				:	orderDetails.customer_id,
					restaurant_id 			: 	orderDetails.restaurant_id,
					branch_id 				: 	orderDetails.branch_id,
					area_id 				: 	orderDetails.area_id,
					delivery_area_id 		: 	orderSubDetails.delivery_area_id,
					restaurant_latitude 	: 	orderSubDetails.restaurant_latitude,
					restaurant_longitude 	: 	orderSubDetails.restaurant_longitude,
					time_of_arrival         :   distanceInMinutes
				}).then(response=>{
					if(response.status != Constants.STATUS_SUCCESS){
						let msg = response.message;
						if(response.captain_max_order_limit_or_unavailable){
							msg =res.__("admin.order_tracking.captain_max_limit_reached");
						}
						return resolve({status: Constants.STATUS_ERROR, message: msg });
					}

                    /** Send success response */
					return resolve({status: Constants.STATUS_SUCCESS, message: res.__("admin.order_tracking.captain_assigned_successfully")});
				}).catch(next);
			});
	    }).catch(next);
	}//End assignOrderToCaptain()

    /**
	 * Function to order assign to captain
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	 */
	async orderAssignToCaptain (req,res,next){
		/** Order assignment process **/
		this.assignOrderToCaptain(req, res, next, {
			order_id 			: new ObjectId(req.params.order_id),
			captain_id 			: new ObjectId(req.params.captain_id),
			distance_in_minutes : parseInt(req.params.distance_in_minutes),
			user_id 			: req.session.user._id,
			user_role_id 		: req.session.user.user_role_id,
		}).then(assRespnose=>{
			if(assRespnose.status==Constants.STATUS_ERROR) return res.send(assRespnose);

			/** Send response */
			req.flash(assRespnose.status,assRespnose.message);
			res.send({status: assRespnose.status });
		}).catch(next);
	}// end orderAssignToCaptain()

    /**
     * Function to get driver location
     *
     * @param req 	As Request Data
     * @param res 	As Response Data
     * @param next 	As Callback argument to the middleware function
     *
     * @return json
     */
    async getDriverLocation(req, res, next) {
        try {
            let orderId		= 	(req.body.order_id)	  ? new ObjectId(req.body.order_id)	  :"";
            let captainId	=	(req.body.captain_id) ? new ObjectId(req.body.captain_id) :"";

            /** Send error response */
            if(!captainId || !orderId){
                return res.send({ status: Constants.STATUS_ERROR, message: res.__("admin.system.invalid_access") });
            }

            asyncParallel({
                captain_detail :(locationCallback)=>{
                    /** Set condition for captains **/
                    let conditions = {...{_id: captainId }, ...Constants.DRIVER_COMMON_CONDITIONS};

                    /** Get captain details **/
                    const users  = this.db.collection(Tables.USERS);
                    users.findOne(conditions,{projection: {_id:1,longitude:1,latitude:1,full_name:1,mobile_number:1}}).then(captainResult=>{
                        locationCallback(null,captainResult);
                    }).catch(next);
                },
                order_detail :(locationCallback)=>{
                    /** Get order details **/
                    const order_details  = this.db.collection(Tables.ORDER_DETAILS);
                    order_details.findOne({order_id : orderId},{projection: {_id:1,unique_order_id:1, restaurant_address:1,customer_address:1,customer_latitude:1,customer_longitude:1,restaurant_latitude:1,restaurant_longitude:1}}).then(orderDetailResult=>{
                        locationCallback(null,orderDetailResult);
                    }).catch(next);
                },
            },(asyncErr, asyncResponse)=>{
                if(asyncErr) return next(asyncErr);

                /** Send error response */
                if(!asyncResponse.captain_detail || !asyncResponse.order_detail){
                    return res.send({ status: Constants.STATUS_ERROR, message: res.__("admin.system.invalid_access") });
                }

                /** Send success response **/
                res.send({
                    status	: Constants.STATUS_SUCCESS,
                    result	: {
                        captain_detail	:	asyncResponse.captain_detail,
                        order_detail	:	asyncResponse.order_detail,
                    }
                });
            });
        } catch (error) {
            next(error);
        }
    }

    /**
	 * Function to undo order assignment process
	 * Common for order tracking & captain tracking module
	 *
	 * @param req		As Request Data
	 * @param res		As Response Data
	 * @param next		As Callback argument to the middleware function
	 * @param options	As options
	 *
	 * @return response
	 */
	async undoOrderAssignment(req,res,next,options){
		return new Promise(async resolve=>{
			let orderId		= (options.order_id) ? new ObjectId(options.order_id) : '';
			let authId		= (options.user_id) ? new ObjectId(options.user_id) : '';
			let authRoleId	= (options.user_role_id) ? options.user_role_id : '';

			if(!orderId || !authId || !authRoleId) return resolve({status: Constants.STATUS_ERROR, message: res.__("system.missing_parameters")});

			/** Set order conditions */
			let conditions = {
				_id 			: 	orderId,
				is_confirm 		: 	true,
				delivery_type 	: 	Constants.DELIVERY_BY_CRAVEZ,
				$and 			:	[
					{is_completed: {$exists  :false }},
					{is_completed: {$ne 	 :true }},
					{$or: [
						{assigned_captain_status: {$ne :"" }},
						{captain_id: {$ne :"" }},
					]}
				]
			};

			/** Get order details  */
			let result = await this.collectionDb.findOne(conditions,{projection:{_id: 1,assigned_captain: 1,captain_id: 1, assigned_captain_status: 1, delivery_status: 1, unique_order_id: 1}});

            /** Send error response */
            if(!result) return resolve({status: Constants.STATUS_ERROR, message: res.__("admin.system.invalid_access")});

            let captainId 		= 	result.captain_id;
            let deliveryStatus 	=	result.delivery_status;
            let assignedCaptain =	result.assigned_captain;
            let assignedStatus 	=	result.assigned_captain_status;
            let orderUniqueId   = 	result.unique_order_id;

            if(!captainId) 		captainId 		= 	assignedCaptain;
            if(!deliveryStatus) deliveryStatus 	=	assignedStatus;

            asyncParallel({
                update_order_assignment : (callback)=>{
                    const order_assignment_logs = this.db.collection(Tables.ORDER_ASSIGNMENT_LOGS);
                    order_assignment_logs.updateMany({
                        order_id	: orderId,
                        captain_id	: captainId,
                    },
                    {$set: {
                        current_status 	: 	Constants.ORDER_DRIVER_UNDO_ASSIGNED,
                        is_undo_assign 	: 	true,
                        modified 		:	getUtcDate()
                    }}).then(()=>{
                        callback(null);

                        /** Save order status logs */
                        saveOrderStatusLogs(req,res,next,{
                            updated_by		:	authId,
                            user_id			:	captainId,
                            status 			:	Constants.ORDER_DRIVER_UNDO_ASSIGNED,
                            order_status	:	deliveryStatus,
                            order_id 		:	orderId,
                        });
                    }).catch(next);
                },
                update_order : (callback)=>{
                    /** Update order details */
                    this.collectionDb.updateOne({
                        _id	: orderId,
                    },
                    {$addToSet: {
                        previous_assigned_captains : {
                            driver_id : captainId,
                            assign_by : authId,
                            assign_on :	getUtcDate(),
                        }
                    }}).then(()=>{
                        callback(null);
                    }).catch(next);
                },
            },(asyncErr)=>{
                if(asyncErr) return next(asyncErr);

                /** Send success response **/
                resolve({status: Constants.STATUS_SUCCESS, message: res.__("admin.order_tracking.undo_assigned_successfully")});

                /** Send notification to driver */
                insertNotifications(req,res,{
                    notification_data : {
                        notification_type : Constants.NOTIFICATION_TO_DRIVER_ORDER_UNDO_ASSIGNED,
                        message_params 	  : [orderUniqueId],
                        parent_table_id   : orderId,
                        user_id 		  : authId,
                        user_role_id 	  : authRoleId,
                        user_ids 		  : [captainId],
                        role_id 		  : Constants.DRIVER,
                        extra_parameters  :	{
                            driver_id 	:	captainId,
                            order_id	: 	orderId,
                        }
                    }
                });
            });
		}).catch(next);
	};//End undoOrderAssignment()

    /**
     * Function to order undo assign
     *
     * @param req 	As Request Data
     * @param res 	As Response Data
     * @param next 	As Callback argument to the middleware function
     *
     * @return null
     */
    async orderUndoAssign(req, res, next) {
        try {
            /** Undo order assignment **/
            let assRespnose = await this.undoOrderAssignment(req, res, next, {
                order_id 	: new ObjectId(req.params.order_id),
                user_id 	: new ObjectId(req.session.user._id),
                user_role_id: req.session.user.user_role_id,
            });

            /** Send response */
            req.flash(assRespnose.status,assRespnose.message);
            res.redirect(Constants.WEBSITE_ADMIN_URL+"order_tracking");
        } catch (error) {
            next(error);
        }
    }

    /**
     * Function to confirm status
     *
     * @param req 	As Request Data
     * @param res 	As Response Data
     * @param next 	As Callback argument to the middleware function
     *
     * @return render/json
     */
    async confirmStatus(req, res, next) {
        try {
            let orderId = req.params.order_id;
            if(isPost(req)){
                /** Sanitize Data **/
                req.body	= sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
                let authId	= req.session.user._id;

                /** send error response */
                if(!orderId) return res.send({ status: Constants.STATUS_ERROR,message: res.__("system.invalid_access")});

                if(!req.body.confirm_status){
					return res.send({status: Constants.STATUS_ERROR, message: [
						{param: 'confirm_status', 'msg': res.__("admin.orders.please_select_confirm_status") }
					]});
				}

                let confirmStatus = (req.body.confirm_status.constructor === Array) ? req.body.confirm_status : [req.body.confirm_status];
                let dataToBeUpdated = [];
                confirmStatus.map(key=>{
                    let tmpRecord = {update_by : new ObjectId(authId), updated_on : getUtcDate()};
                    tmpRecord[key]= true;
                    dataToBeUpdated.push(tmpRecord);
                });

                await this.collectionDb.updateOne({
                    _id : new ObjectId(orderId)
                },
                {
                    $set : {modified	: getUtcDate()},
                    $addToSet :{confirm_status	: {$each : dataToBeUpdated}},
                }); 
                /** Send success response */
                req.flash(Constants.STATUS_SUCCESS,res.__("admin.orders.status_has_been_confirmed_successfully"));
                res.send({
                    status	: Constants.STATUS_SUCCESS,
                    redirect_url : Constants.WEBSITE_ADMIN_URL+"order_tracking",
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
                let orderResult = await this.collectionDb.findOne({
                    _id : new ObjectId(orderId)
                },{projection: {
                    _id:1,is_delayed_acceptance:1,is_delayed_picked_up_by_customer:1,is_delayed_pickup:1,delivery_type : 1,is_delayed_pickup_by_captain:1,is_delayed_preperation:1,is_delayed_delivery:1,confirm_status:1
                }});

                /** send error response */
                if(!orderResult) return res.status(400).send({ status: Constants.STATUS_ERROR,message: res.__("system.invalid_access") });
                
                let confirmedStatusObj = {};
                if(orderResult.confirm_status && orderResult.confirm_status.length > 0){
                    orderResult.confirm_status.map(record=>{
                        Object.keys(record).map(recordKeys=>{
                            if(recordKeys == "is_delayed_pickup" && orderResult.delivery_type == Constants.DELIVERY_BY_RESTAURANT){
                                recordKeys = "delayed_pickup_by_restaurant";
                            }
                            if(Constants.ORDERS_RULES_STATUS[recordKeys]) confirmedStatusObj[recordKeys] = true;
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

                /** Send success response */
                res.render('confirm_status',{
                    layout				: false,
                    result				: orderResult,
                    confirmed_statuses	: confirmedStatusObj
                });
            }
        } catch (error) {
            next(error);
        }
    }
}
export default OrderTracking; 