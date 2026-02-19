import { fileURLToPath } from 'url';
import { dirname } from 'path';
import Orders from "./model/orders.mjs";
import * as Constants from "../../../config/global_constant.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Configure cuisines routes
 * @param {Object} router - Express router instance
 * @param {Object} options - Configuration options
 * @param {Object} options.db - Database connection instance
 * @param {Function} options.checkLoggedIn - Middleware to check user authentication
 */
export default function configure(router, { db, checkLoggedIn }) {
    const modulePath = Constants.FRONT_END_NAME + "orders";
    const ordersModule = new Orders(db);

    // Set views for all /cuisines* routes
    router.use(modulePath, (req, res, next) => {
        req.rendering.views = __dirname + "/views";
        next();
    });

    /** Routing is used to assign captain to orders **/
    router.all(modulePath+'/assign_captain',checkLoggedIn,(req, res, next) => { 
        ordersModule.assignCaptain(req, res,next);
    });

    /** Routing is used to reject status of orders **/
    router.all(modulePath+'/reject_order_status',checkLoggedIn,(req, res, next) => {
        ordersModule.rejectOrderRequest(req, res,next);
    });

    /** Routing is used to get not confirm order id **/
    router.post(modulePath+'/get_not_confirm_order_id',checkLoggedIn,(req, res, next) => {
        ordersModule.getNotConfirmOrderId(req, res,next);
    });

    /** Routing is used to list new orders **/
    router.all(modulePath+"/:order_status",checkLoggedIn,(req, res,next) => {
        ordersModule.getOrders(req, res,next);
    });

    /** Routing is used to get order detail **/
    router.all(modulePath+"/view/:id",checkLoggedIn,(req, res,next) => {
        ordersModule.viewOrderDetails(req, res,next);
    });

    /** Routing is used to get list of items **/
    router.post(modulePath+'/list_items/:order_id',checkLoggedIn,(req, res, next) => {
        ordersModule.listItems(req, res,next);
    });

    /** Routing is used to update status of orders **/
    router.all(modulePath+'/update_order_status/:id/:order_status',checkLoggedIn,(req, res, next) => {
        ordersModule.updateOrderStatus(req, res,next);
    });

    /** Routing is used to print receipt **/
    router.get(modulePath+'/print/:order_id',checkLoggedIn,(req, res, next) => {  
        ordersModule.printOrder(req, res,next);
    });
}