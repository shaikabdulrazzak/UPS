import { ObjectId } from 'mongodb';
import * as Constants from "../../../../config/global_constant.mjs";
import Tables from '../../../../config/database_tables.mjs';
import { sanitizeData, getUtcDate, currencyFormat, applyValidationInterCallFunction, saveOrderStatusLogs } from "../../../../utils/index.mjs";
import { assignCaptainValidation, rejectOrderRequestValidation } from '../validations/restaurantPortalValidations.mjs';

class RestaurantPortal {
    constructor(db) {
        this.db = db;
        this.ordersDb = db.collection(Tables.ORDERS);
        this.usersDb = db.collection(Tables.USERS);
        this.driverVehiclesDb = db.collection(Tables.DRIVER_VEHICLES);
        this.tmpRestaurantMenusDb = db.collection(Tables.TMP_RESTAURANT_MENUS);
        this.restaurantMenusDb = db.collection(Tables.RESTAURANT_MENUS);
        this.itemsDb = db.collection(Tables.ITEMS);
        this.tmpItemsDb = db.collection(Tables.TMP_ITEMS);
    }

    /**
     * Function to assign captain to order
     *
     * @param req 	As Request Data
     * @param res 	As Response Data
     *
     * @return render/json
    */
    async assignCaptain(req, res, next) {
        try {
            /** Sanitize Data **/
            req.body = sanitizeData(req.body, Constants.NOT_ALLOWED_TAGS_XSS);
            let orderId = (req.body.order_id) ? req.body.order_id : "";
            let authId = (req.body.user_id) ? req.body.user_id : "";
            let authRoleId = (req.body.user_role_id) ? req.body.user_role_id : "";
            let userType = (req.body.user_type) ? req.body.user_type : "";
            let captainName = (req.body.captain_name) ? req.body.captain_name : "";
            let captainMobile = (req.body.captain_number) ? req.body.captain_number : "";

            /** send error response */
            if(!userType || !authId || !authRoleId || !orderId) {
                return {
                    status: Constants.STATUS_ERROR,
                    message: res.__("system.missing_parameters"),
                    missing_fields: ["user_type", "order_captain_id", "user_id", "user_role_id"]
                };
            }

            /** Apply validation */
            let validationResponse = await applyValidationInterCallFunction(req, res, next, assignCaptainValidation);
            if(validationResponse.status != Constants.STATUS_SUCCESS) return validationResponse;

            /* Assign captain to orders */
            const updateResult = await this.ordersDb.findOneAndUpdate(
                { _id: new ObjectId(orderId) },
                {
                    $set: {
                        order_status: Constants.ORDER_ON_THE_WAY,
                        captain_name: captainName,
                        captain_number: captainMobile,
                    }
                },
                { projection: {_id: 1, order_status: 1, customer_id: 1} }
            );

            let orderDetails = updateResult || {};
            let orderIdObj  = (orderDetails._id) ? new ObjectId(orderDetails._id) : '';
            let orderStatus = (orderDetails.order_status) ? orderDetails.order_status : '';
            let customerId  = (orderDetails.customer_id) ? new ObjectId(orderDetails.customer_id) : '';

            /** Save order logs */
            await saveOrderStatusLogs(req, res, next, {
                updated_by: authId,
                captain_name: captainName,
                user_id: customerId,
                user_role_id: authRoleId,
                status: Constants.ORDER_ON_THE_WAY,
                order_status: orderStatus,
                order_id: orderIdObj,
                user_type: userType,
            });

            /** Send success response */
            return {
                status: Constants.STATUS_SUCCESS,
                message: res.__("orders.status_has_been_updated_successfully"),
                order_status: orderStatus
            };
        } catch (error) {
            next(error);
        }
    }

    /**
     * Function to get captain info
     *
     * @param req	As Request Data
     * @param res	As Response Data
     * @param next	As Callback argument to the middleware function
     *
     * @return json
     **/
    async getCaptainInfo(req, res, next) {
        try {
            /** Sanitize Data **/
            req.body = sanitizeData(req.body, Constants.NOT_ALLOWED_TAGS_XSS);
            let orderId = (req.body.order_id) ? new ObjectId(req.body.order_id) : "";

            /** Send error response **/
            if(!orderId) {
                return { status: Constants.STATUS_ERROR, message: res.__("system.missing_parameters") };
            }

            /** Get captain id **/
            const orderResult = await this.ordersDb.findOne(
                { _id: orderId },
                { projection: {captain_id: 1, order_date: 1} }
            );

            /** Send error response **/
            if(!orderResult) {
                return { status: Constants.STATUS_ERROR, message: res.__("system.invalid_access") };
            }

            /** Send error response **/
            if(!orderResult.captain_id) {
                return { status: Constants.STATUS_ERROR, message: res.__("orders.captain_not_assigned") };
            }

            let captainId = new ObjectId(orderResult.captain_id);

            /** Get captain details **/
            const userResult = await this.usersDb.findOne(
                { _id: captainId },
                { projection: { _id: 1, full_name: 1, vehicle_id: 1} }
            );

            /** Send error response **/
            if(!userResult) {
                return { status: Constants.STATUS_ERROR, message: res.__("system.invalid_access") };
            }

            let vehicleId = new ObjectId(userResult.vehicle_id);

            /** Get vehicle details **/
            const vehicleResult = await this.driverVehiclesDb.findOne(
                { _id: vehicleId },
                { projection: {plate_number: 1, vehicle_type: 1} }
            );

            /** Send error response **/
            if(!vehicleResult) {
                return { status: Constants.STATUS_ERROR, message: res.__("system.invalid_access") };
            }

            /** Insert result in a object**/
            let finalResult = {
                captain_id: userResult._id,
                captain_name: userResult.full_name,
                vehicle_number: vehicleResult.plate_number,
                time_of_arrival: orderResult.order_date,
                vehicle_type: Constants.VEHICLE_TYPE[vehicleResult.vehicle_type]
            };

            /**Send success response */
            return { status: Constants.STATUS_SUCCESS, captain_info: finalResult };
        } catch (error) {
            next(error);
        }
    }

    /**
     * Function for update order status
     *
     * @param req 	As 	Request Data
     * @param res 	As 	Response Data
     * @param next 	As 	Callback argument to the middleware function
     *
     * @return render
     */
    async updateOrderStatus(req, res, next) {
        try {
            /** Sanitize Data **/
            req.body = sanitizeData(req.body, Constants.NOT_ALLOWED_TAGS_XSS);
            let orderId = (req.body.order_id) ? req.body.order_id : "";
            let orderStatus = (req.body.order_status) ? req.body.order_status : "";
            let authId = (req.body.user_id) ? req.body.user_id : "";
            let restaurantId = (req.body.restaurant_id) ? req.body.restaurant_id : "";
            let userType = (req.body.user_type) ? req.body.user_type : "";
            let authRoleId = (req.body.user_role_id) ? req.body.user_role_id : "";

            /** Send error response **/
            if(!userType || !restaurantId || !authId || !authRoleId || !orderId || !orderStatus) {
                return {
                    status: Constants.STATUS_ERROR,
                    message: res.__("system.missing_parameters"),
                    missing_fields: ["user_type", "order_id", "user_id", "user_role_id", "restaurant_id", "order_status"]
                };
            }

            /** Send error response **/
            if(!Constants.RESTAURANT_ORDER_STATUS_TYPES?.[orderStatus]) {
                return { status: Constants.STATUS_ERROR, message: res.__("system.invalid_access") };
            }

            /** find order  status **/
            const orderResult = await this.ordersDb.findOne(
                {_id: new ObjectId(orderId)},
                {_id: 1, unique_order_id: 1, customer_id: 1, branch_id: 1}
            );

            if(!orderResult) {
                return { status: Constants.STATUS_ERROR, message: res.__("system.invalid_access") };
            }

            let branchId = (orderResult.branch_id) ? orderResult.branch_id : '';
            let customerId = (orderResult.customer_id) ? new ObjectId(orderResult.customer_id) : '';

            /** Update order status **/
            const result = await this.ordersDb.findOneAndUpdate(
                { _id: new ObjectId(orderId) },
                {
                    $set: {
                        order_status: orderStatus,
                        modified: getUtcDate()
                    }
                },
                { projection: {_id: 1, order_status: 1} }
            );

            let orderDetails = result || {};
            let currentStatus = (orderDetails.order_status) ? orderDetails.order_status : '';

            /** Save order logs */
            await saveOrderStatusLogs(req, res, next, {
                updated_by: authId,
                user_role_id: authRoleId,
                status: orderStatus,
                order_status: currentStatus,
                restaurant_id: restaurantId,
                order_id: orderId,
                branch_id: branchId,
                user_id: customerId,
                user_type: userType,
            });

            /** Update order details */
            await this.ordersDb.updateOne(
                {_id: new ObjectId(orderId)},
                {$unset: {is_confirm_process: 1}}
            );

            /** Send success response **/
            return {
                status: Constants.STATUS_SUCCESS,
                message: res.__("orders.status_has_been_updated_successfully"),
                current_status: currentStatus
            };
        } catch (error) {
            next(error);
        }
    }

    /**
     * Function to reject order request
     *
     * @param req 	As  Request Data
     * @param res 	As  Response Data
     * @param next 	As 	Callback argument to the middleware function
     *
     * @return render/json
    */
    async rejectOrderRequest(req, res, next) {
        try {
            /** Sanitize Data **/
            req.body = sanitizeData(req.body, Constants.NOT_ALLOWED_TAGS_XSS);
            let orderId = (req.body.order_id) ? req.body.order_id : "";
            let authId = (req.body.user_id) ? req.body.user_id : "";
            let authRoleId = (req.body.user_role_id) ? req.body.user_role_id : "";
            let userType = (req.body.user_type) ? req.body.user_type : "";
            let rejectionReason = (req.body.rejection_reason) ? req.body.rejection_reason : "";

            /** send error response */
            if(!orderId || !authId || !authRoleId || !userType) {
                return {
                    status: Constants.STATUS_ERROR,
                    message: res.__("system.missing_parameters"),
                    missing_fields: ["user_type", "order_id", "user_id", "user_role_id"]
                };
            }

            /** Apply validation */
            let validationResponse = await applyValidationInterCallFunction(req, res, next, rejectOrderRequestValidation);
            if(validationResponse.status != Constants.STATUS_SUCCESS) return validationResponse;

            /* set rejected status in orders */
            const updateResult = await this.ordersDb.findOneAndUpdate(
                { _id: new ObjectId(orderId) },
                {
                    $set: {
                        order_status: Constants.ORDER_REJECTED,
                        rejection_reason: rejectionReason,
                    }
                },
                { projection: {_id: 1, order_status: 1, customer_id: 1} }
            );

            let orderDetails= updateResult || {};
            let orderIdObj  = (orderDetails._id) ? new ObjectId(orderDetails._id) : '';
            let orderStatus = (orderDetails.order_status) ? orderDetails.order_status : '';
            let customerId  = (orderDetails.customer_id) ? new ObjectId(orderDetails.customer_id) : '';

            /** Save order logs */
            await saveOrderStatusLogs(req, res, next, {
                send_notification_call_center: true,
                updated_by: authId,
                user_id: customerId,
                user_role_id: authRoleId,
                status: Constants.ORDER_REJECTED,
                order_status: orderStatus,
                order_id: orderIdObj,
                user_type: userType,
            });

            /** Send success response */
            return {
                status: Constants.STATUS_SUCCESS,
                message: res.__("orders.status_has_been_updated_successfully"),
                order_status: orderStatus
            };
        } catch (error) {
            next(error);
        }
    }

    /**
     * Function to get restaurant dashboard
     *
     * @param req	As Request Data
     * @param res	As Response Data
     * @param next	As Callback argument to the middleware function
     *
     * @return json
     **/
    async restaurantDashboard(req, res, next) {
        try {
            /** Sanitize Data **/
            req.body = sanitizeData(req.body, Constants.NOT_ALLOWED_TAGS_XSS);
            let restaurantId = (req.body.restaurant_id) ? new ObjectId(req.body.restaurant_id) : "";
            let branchId = (req.body.branch_id) ? new ObjectId(req.body.branch_id) : "";

            if(!restaurantId) {
                return { status: Constants.STATUS_ERROR, message: res.__("system.missing_parameters") };
            }

            // Execute all queries in parallel
            const [
                totalOrdersDelivered,
                totalOrdersCancelled,
                totalMenuRejected,
                totalOrdersRejected,
                totalMenus,
                totalItems,
                totalMenuPending,
                totalItemPending,
                totalItemRejected,
                totalRestaurantPayout
            ] = await Promise.all([
                // Total orders delivered
                this.ordersDb.countDocuments({
                    restaurant_id: restaurantId,
                    restaurant_status: Constants.ORDER_DELIVERED,
                    is_confirm: true,
                    ...(branchId && { branch_id: branchId })
                }),

                // Total orders cancelled
                this.ordersDb.countDocuments({
                    restaurant_id: restaurantId,
                    restaurant_status: Constants.ORDER_CANCELLED,
                    is_confirm: true,
                    ...(branchId && { branch_id: branchId })
                }),

                // Total menu rejected
                this.tmpRestaurantMenusDb.countDocuments({
                    restaurant_id: restaurantId,
                    status: Constants.REJECTED
                }),

                // Total orders rejected
                this.ordersDb.countDocuments({
                    restaurant_id: restaurantId,
                    restaurant_status: Constants.ORDER_REJECTED,
                    is_confirm: true,
                    ...(branchId && { branch_id: branchId })
                }),

                // Total menus
                this.restaurantMenusDb.countDocuments({
                    restaurant_id: restaurantId
                }),

                // Total items
                this.itemsDb.countDocuments({
                    restaurant_id: restaurantId
                }),

                // Total menu pending
                this.tmpRestaurantMenusDb.countDocuments({
                    restaurant_id: restaurantId,
                    status: Constants.PENDING
                }),

                // Total items pending
                this.tmpItemsDb.countDocuments({
                    restaurant_id: restaurantId,
                    status: Constants.PENDING
                }),

                // Total items rejected
                this.tmpItemsDb.countDocuments({
                    restaurant_id: restaurantId,
                    status: Constants.REJECTED
                }),

                // Total restaurant payout
                this.ordersDb.aggregate([
                    { $match: {
                        restaurant_id: restaurantId,
                        ...(branchId && { branch_id: branchId })
                    }},
                    { $group: {
                        _id: { restaurant_id: "$restaurant_id"},
                        restaurant_payout: { $sum: "$restaurant_payout"},
                    }}
                ]).toArray()
            ]);

            /** Send success response */
            return {
                status: Constants.STATUS_SUCCESS,
                total_orders_delivered: totalOrdersDelivered,
                total_cancelled_order: totalOrdersCancelled,
                menus_rejected: totalMenuRejected,
                total_rejected_orders: totalOrdersRejected,
                total_menus: totalMenus,
                total_items: totalItems,
                pending_menus: totalMenuPending,
                pending_items: totalItemPending,
                items_rejected: totalItemRejected,
                restaurant_revenue: totalRestaurantPayout && totalRestaurantPayout[0] && totalRestaurantPayout[0].restaurant_payout ?
                    currencyFormat(totalRestaurantPayout[0].restaurant_payout) : currencyFormat(0)
            };
        } catch (error) {
            next(error);
        }
    }
}

export default RestaurantPortal;