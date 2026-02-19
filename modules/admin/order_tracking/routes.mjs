import { fileURLToPath } from 'url';
import { dirname } from 'path';
import orderTracking from "./model/order_tracking.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Configure order tracking routes
 * @param {Object} router - Express router instance
 * @param {Object} options - Configuration options
 * @param {Object} options.db - Database connection instance
 * @param {Function} options.checkLoggedInAdmin - Middleware to check admin authentication
 */
export default function configure(router, { db, checkLoggedInAdmin }) {
    const modulePath = '/order_tracking';
    const orderTrackingModule = new orderTracking(db);

    // Set views for all /order_tracking* routes
    router.use(modulePath, (req, res, next) => {
        req.rendering.views = __dirname + "/views";
        next();
    });

    // Get order tracking list
    router.all(modulePath, checkLoggedInAdmin, (req, res, next) => {
        orderTrackingModule.getOrderTrackingList(req, res, next);
    });

    // Get order location using ajax
    router.post(modulePath+"/get_order_location", checkLoggedInAdmin, (req, res, next) => {
        orderTrackingModule.getOrderLocation(req, res, next);
    });

    // Get assign captain list
    router.get(modulePath+"/assign_captain_list/:order_id", checkLoggedInAdmin, (req, res, next) => {
        orderTrackingModule.assignCaptainList(req, res, next);
    });

    // Get order undo assign
    router.get(modulePath+"/order_undo_assign/:order_id", checkLoggedInAdmin, (req, res, next) => {
        orderTrackingModule.orderUndoAssign(req, res, next);
    });

    // Get captain list
    router.post(modulePath+"/get_captain_list", checkLoggedInAdmin, (req, res, next) => {
        orderTrackingModule.getCaptainList(req, res, next);
    });

    // Get floor status list
    router.post(modulePath+"/get_floor_status_list", checkLoggedInAdmin, (req, res, next) => {
        orderTrackingModule.getFloorStatusList(req, res, next);
    });

    // Order assign to captain
    router.post(modulePath+"/order_assign_to_captain/:order_id/:captain_id/:distance_in_minutes", checkLoggedInAdmin, (req, res, next) => {
        orderTrackingModule.orderAssignToCaptain(req, res, next);
    });

    // Get captain location
    router.post(modulePath+"/get_driver_location", checkLoggedInAdmin, (req, res, next) => {
        orderTrackingModule.getDriverLocation(req, res, next);
    });

    // Get order count
    router.post(modulePath+"/get_order_data", checkLoggedInAdmin, (req, res, next) => {
        orderTrackingModule.getOrderData(req, res, next);
    });

    // Confirm status
    router.all(modulePath+"/confirm_order_status/:order_id", checkLoggedInAdmin, (req, res, next) => {
        orderTrackingModule.confirmStatus(req, res, next);
    });
} 