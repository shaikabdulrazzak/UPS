import { fileURLToPath } from 'url';
import { dirname } from 'path';
import Orders from "./model/orders.mjs";
import { changeStatusValidation, refundAmountValidation, rejectOrderValidation, confirmStatusValidation, updateBranchValidation } from "./validations.mjs";
import { validateRequest } from "../../../utils/index.mjs";

import { ObjectId } from 'mongodb';
import Tables from '../../../config/database_tables.mjs';
import * as Helper from "../../../utils/index.mjs";
import * as Constants from "../../../config/global_constant.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Configure orders routes
 * @param {Object} router - Express router instance
 * @param {Object} options - Configuration options
 * @param {Object} options.db - Database connection instance
 * @param {Function} options.checkLoggedInAdmin - Middleware to check admin authentication
 */
export default function configure(router, { db, checkLoggedInAdmin }) {
    const modulePath = '/orders';
    const countModulePath = '/google_count_list';
    const ordersModule = new Orders(db);

    // Set views for all /orders* routes
    router.use([modulePath, countModulePath], (req, res, next) => {
        req.rendering.views = __dirname + "/views";
        next();
    });

    // Get orders list
    router.all(modulePath, checkLoggedInAdmin, (req, res, next) => {
        ordersModule.getOrdersList(req, res, next);
    });

    // Accept order
    router.all(modulePath + '/accept_status/:_id', checkLoggedInAdmin, (req, res, next) => {
        ordersModule.acceptOrder(req, res, next);
    });

    // Edit address
    router.all(modulePath + "/edit_address/:order_id/:id", checkLoggedInAdmin, (req, res, next) => {
        ordersModule.addAddress(req, res, next);
    });

    // Export data
    router.get(modulePath + "/export_data/:export_count/:export_type", (req, res, next) => {
        ordersModule.exportData(req, res, next);
    });

    // Change status
    router.all(modulePath + '/change_status/:_id', checkLoggedInAdmin, changeStatusValidation, validateRequest, (req, res, next) => {
        ordersModule.changeStatus(req, res, next);
    });

    // Requeue order
    router.all(modulePath + '/requeue/:_id', checkLoggedInAdmin, (req, res, next) => {
        ordersModule.requeueOrder(req, res, next);
    });

    // Reschedule order
    router.all(modulePath + '/reschedule/:_id', checkLoggedInAdmin, (req, res, next) => {
        ordersModule.rescheduleOrder(req, res, next);
    });

    // Refund amount
    router.all(modulePath + '/refund_amount/:id', checkLoggedInAdmin, refundAmountValidation, validateRequest, (req, res, next) => {
        ordersModule.orderRefundAmount(req, res, next);
    });

    // Reject order status
    router.post(modulePath + '/reject_order_status', checkLoggedInAdmin, rejectOrderValidation, validateRequest, (req, res, next) => {
        ordersModule.rejectOrderRequest(req, res, next);
    });

    // View order details
    router.all(modulePath + '/view/:id', checkLoggedInAdmin, (req, res, next) => {
        ordersModule.viewOrderDetails(req, res, next);
    });

    router.all(modulePath + '/view/:id/:type', checkLoggedInAdmin, (req, res, next) => {
        ordersModule.viewOrderDetails(req, res, next);
    });

    // List items
    router.post(modulePath + '/list_items/:order_id', checkLoggedInAdmin, (req, res, next) => {
        ordersModule.listItems(req, res, next);
    });

    // Status logs
    router.post(modulePath + '/status_logs/:order_id', checkLoggedInAdmin, (req, res, next) => {
        ordersModule.listStatusLogs(req, res, next);
    });

    // Branch list
    router.post(modulePath + "/branch_list", checkLoggedInAdmin, (req, res, next) => {
        ordersModule.branchList(req, res, next);
    });

    // Get location
    router.post(modulePath + "/get_location", checkLoggedInAdmin, (req, res, next) => {
        ordersModule.getLocation(req, res, next);
    });

    // Get order rules
    router.post(modulePath + "/get_order_rules", checkLoggedInAdmin, (req, res, next) => {
        ordersModule.getOrderRules(req, res, next);
    });

    // Refund details
    router.post(modulePath + '/refund_details/:order_id', checkLoggedInAdmin, (req, res, next) => {
        ordersModule.refundCompensationList(req, res, next);
    });

    // Get block list
    router.post(modulePath + "/get_block_list", checkLoggedInAdmin, (req, res, next) => {
        ordersModule.getBlockList(req, res, next);
    });

    // Get area list
    router.post(modulePath + "/get_area_list", checkLoggedInAdmin, (req, res, next) => {
        ordersModule.getAreaList(req, res, next);
    });

    // Confirm status
    router.all(modulePath + "/confirm_order_status/:order_id", checkLoggedInAdmin, confirmStatusValidation, validateRequest, (req, res, next) => {
        ordersModule.confirmStatus(req, res, next);
    });

    // Order revert
    router.all(modulePath + "/order_revert/:order_id", checkLoggedInAdmin, (req, res, next) => {
        ordersModule.orderRevert(req, res, next);
    });

    // Update branch
    router.all(modulePath + "/update_branch/:order_id", checkLoggedInAdmin, updateBranchValidation, validateRequest, (req, res, next) => {
        ordersModule.updateBranch(req, res, next);
    });

    // Resend link
    router.all(modulePath + "/resend_link/:order_id", checkLoggedInAdmin, (req, res, next) => {
        ordersModule.resendLink(req, res, next);
    });

    // Submit order
    router.all(modulePath + "/submit_order/:order_id", checkLoggedInAdmin, (req, res, next) => {
        ordersModule.submitOrder(req, res, next);
    });

    // Resend order
    router.all(modulePath + "/resend_order/:order_id", checkLoggedInAdmin, (req, res, next) => {
        ordersModule.resendOrder(req, res, next);
    });

    // Resend cancel order
    router.all(modulePath + "/resend_cancle_order/:order_id", checkLoggedInAdmin, (req, res, next) => {
        ordersModule.resendCancleOrder(req, res, next);
    });

    // Google count list
    router.all(countModulePath, checkLoggedInAdmin, (req, res, next) => {
        ordersModule.getGoogleCountList(req, res, next);
    });

    // Export google API count
    router.get(countModulePath + "/export_data", checkLoggedInAdmin, (req, res, next) => {
        ordersModule.exportGoogleApiCount(req, res, next);
    });

    // Print order
    router.all(modulePath + "/aghzeya_print_order/:restaurant_id/:order_id", checkLoggedInAdmin, (req, res, next) => {
        ordersModule.printOrder(req, res, next);
    });

    // Resend order to dhub
    router.get(modulePath + "/resend_order_dhub/:order_id", checkLoggedInAdmin, (req, res, next) => {
        ordersModule.resendOrderDhub(req, res, next);
    });

    // Resend cancel order to dhub
    router.get(modulePath + "/resend_dhub_order_cancel_request/:order_id", checkLoggedInAdmin, (req, res, next) => {
        ordersModule.resendCancelOrderDhub(req, res, next);
    }); 

    // Get order XML
    router.get(modulePath + '/get_order_xml/:method_name/:order_id', async (req, res, next) => {
        try{
            let uniqueOrderId	=	req.params.order_id;
            let methodName 		= 	req.params.method_name;
    
            /** Get orders details */
            const orders = db.collection(Tables.ORDERS);
            let orderResult = await orders.findOne({unique_order_id: uniqueOrderId })
            
            /** Send error response */
            if(!orderResult) {
                return res.send({
                    result 	:	orderResult,
                    message	:	"order not found",
                });
            }

            let odId 	=	orderResult._id;
            let odDate 	=	orderResult.created ? orderResult.created :Helper.newDate();
            let seDate 	=	Helper.newDate(Helper.addOrSubtractDurationToDate({type : 'day',duration: 2, date: odDate, subtract: true}));

            /** Set conditions */
            let condition = {created: {$gte: seDate}, method_name: methodName};
            if(methodName == "of_get_order_status"){
                condition["$or"] = [
                    {'extra_perms.order_id' : odId},
                    {'extra_perms.order_list.order_id' : odId},
                ]
            }else{
                condition['extra_perms.order_id'] = odId;
            }

            if(methodName == 'of_print_order' && uniqueOrderId){
                condition = {
                    created: {$gte: seDate},
                    method_name: methodName,
                    $or : [
                        {"request.gen_order_id"	: uniqueOrderId},
                        {"extra_perms.unique_order_id": uniqueOrderId},
                    ]
                };
            }

            /** Get Kfg log details */
            const kfg_request_response = db.collection(Tables.KFG_REQUEST_RESPONSE);
            let result = await kfg_request_response.find(condition).sort({_id: Constants.SORT_DESC}).toArray();

            if(result && result.length){
                result.map(records=>{
                    if(records.created)	 records.formatted_created = Helper.newDate(records.created,Constants.AM_PM_FORMAT_WITH_DATE);
                    if(records.modified) records.formatted_modified = Helper.newDate(records.modified,Constants.AM_PM_FORMAT_WITH_DATE);
                });
            }

            /** Send response */
            res.send({result});
        }catch(err){
            next(err);
        }       
    });

    // Get aghzeya logs
    router.get([modulePath+'/get_aghzeya_logs/:method_name', modulePath+'/get_aghzeya_logs/:method_name/:rest_id'], async(req, res, next) => {
        try{
            let methodName 	= 	req.params.method_name;
            let restId		=	req.params.rest_id;
            let fromDate	=	req.query.from_date;

            let conditions = {method_name:	methodName};
            if(restId){
                conditions["$or"] = [
                    {'request.resturant_id': restId},
                    {'request': new RegExp('resturant_id>'+restId, "i")},
                ];
            }
            if(fromDate){
                fromDate  			= 	Helper.newDate(fromDate+" "+Constants.START_DATE_TIME_FORMAT);
                conditions.created	=	{$gte:	Helper.newDate(fromDate)};
            }

            const kfg_request_response = db.collection(Tables.KFG_REQUEST_RESPONSE);
            let result = await kfg_request_response.find(conditions).sort({_id: Constants.SORT_DESC}).toArray();

            if(result && result.length){
                result.map(records=>{
                    if(records.created)	 records.formatted_created = Helper.newDate(records.created,Constants.AM_PM_FORMAT_WITH_DATE);
                    if(records.modified) records.formatted_modified = Helper.newDate(records.modified,Constants.AM_PM_FORMAT_WITH_DATE);
                });
            }

            /** Send response */
            res.send({result});
        }catch(err){
            next(err);
        }
    });

    // Payment gateway logs
    router.get(modulePath + '/payment_gateway_logs/:order_id', async (req, res, next) => {
        try{
            let uniqueOrderId	=	req.params.order_id;

            /** Get orders details */
            const orders = db.collection(Tables.ORDERS);
            let result = await orders.findOne({unique_order_id: uniqueOrderId });
            
            /** Send error response */
            if(!result) {
                return res.send({
                    result 	:	result,
                    message	:	"order not found",
                });
            }

            /** Get logs details */
            const payment_gateway_logs = db.collection(Tables.PAYMENT_GATEWAY_LOGS);
            let logData = await payment_gateway_logs.find({order_id: result._id }).sort({_id: Constants.SORT_DESC}).toArray();

            if(logData && logData.length){
                logData.map(records=>{
                    if(records.created)	 records.formatted_created = Helper.newDate(records.created,Constants.AM_PM_FORMAT_WITH_DATE);
                    if(records.modified) records.formatted_modified = Helper.newDate(records.modified,Constants.AM_PM_FORMAT_WITH_DATE);
                });
            }

            /** Send response */
            res.send({result: logData});
        }catch(err){
            next(err);
        }
    });

    // Get dhub logs
    router.get([
        modulePath+'/get_dhub_logs/:target_id', 
        modulePath+'/get_dhub_logs/:target_id/:method_name', 
        modulePath+'/dhub_order_logs/:method_name/:order_number'
    ], async (req, res, next) => {
        try{
            let orderNumber	=	req.params.order_number ?	req.params.order_number 		:"";
            let targetId	=	req.params.target_id 	?	new ObjectId(req.params.target_id) 	:"";
            let methodName 	= 	req.params.method_name;
            
            if(orderNumber){
                const orders = db.collection(Tables.ORDERS);
                let orderResult = await orders.findOne({unique_order_id: orderNumber });
                if(orderResult && orderResult._id) targetId = orderResult._id;
            }

            /** Set conditions */
            let condition = {
                method_name : {$in: [
                    'CreateOffice',
                    'CreateBranch',
                    'validateDeliveryJob',
                    'CreateDeliveryJob',
                    'cancel_delivery_order',
                ]},
                $or: [
                    {'extra_perms.orderId'  : targetId},
                    {'extra_perms.order_id' : targetId},
                    {'extra_perms.branch_id': targetId},
                    {'extra_perms.restaurant_id' : targetId},
                ]
            };

            if(methodName) condition["$and"] = [{method_name: methodName}]

            /** Get Kfg log details */
            const kfg_request_response = db.collection(Tables.KFG_REQUEST_RESPONSE);
            let result = await kfg_request_response.find(condition).sort({_id: Constants.SORT_DESC}).toArray();

            if(result && result.length){
                result.map(records=>{
                    if(records.created)	 records.formatted_created = Helper.newDate(records.created,Constants.AM_PM_FORMAT_WITH_DATE);
                    if(records.modified) records.formatted_modified = Helper.newDate(records.modified,Constants.AM_PM_FORMAT_WITH_DATE);
                });
            }

            /** Send response */
            res.send({result});
        }catch(err){
            next(err);
        }
    });
} 