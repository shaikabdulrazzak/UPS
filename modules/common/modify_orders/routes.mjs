import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { ObjectId } from 'mongodb';
import clone from "clone";
import modifyOrders from "./model/modify_orders.mjs";
import {savePaymentGatewayLogs} from "../../../services/index.mjs";
import * as Constants from "../../../config/global_constant.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Configure modify orders routes
 * @param {Object} router - Express router instance
 * @param {Object} options - Configuration options
 * @param {Object} options.db - Database connection instance
 * @param {Function} options.checkLoggedInAdmin - Middleware to check admin authentication
 */
export default function configure(router, { db, checkRestaurantLoggedIn }) {
    const modulePath =   "/"+Constants.RESTAURANT_NAME+"/modify_orders";
    const modifyOrdersModule = new modifyOrders(db);

    // Set views for all /modify_orders* routes
    router.use(modulePath, (req, res, next) => {
        req.rendering.views = __dirname + "/views";
        res.locals.list_url = Constants.WEBSITE_RESTAURANT_URL+"modify_orders";
        next();
    });

    /** Routing is used to save payment success response **/
    router.all(modulePath+"/modify_success/:order_id",(req, res, next) => {
        modifyOrdersModule.modifyOrderSuccess(req, res, next);
    });

    /** Routing is used to update cart quanityt **/
    router.post(modulePath+"/update_cart_qty",checkRestaurantLoggedIn,(req, res, next) => {
        modifyOrdersModule.updateCartQty(req, res, next);
    });

    /** Routing is used to assign driver **/
    router.all(modulePath + "/edit_note/:cart_id", checkRestaurantLoggedIn, (req, res, next) => {
        modifyOrdersModule.editItemNote(req, res, next);
    });

    /** Routing is used to save payment success response **/
    router.all(modulePath+"/ui_modify_success/:order_id",(req, res, next) => {
        /** Save Payment gateway logs */
        savePaymentGatewayLogs(req,res,next,{
            order_id 	:	req.params.order_id,
            request	 	: 	{},
            response	: 	{
                query 	: req?.query || {},
                body	: req?.body || {},
            },
            type		: 	Constants.UINTERFACE_PAYMENT_GATEWAY,
            event		: 	"modify_order_success_response",
        }).then(()=>{});

        modifyOrdersModule.saveUiPaymentResponse(req,res,next,req.query).then(response=>{
            if(response.status != Constants.STATUS_SUCCESS){
                req.flash(Constants.STATUS_ERROR, response.message);
                return res.redirect(Constants.WEBSITE_URL + "payment/failure");
            }

            res.redirect(Constants.WEBSITE_URL + "payment/success");
        }).catch(next);
    });

    /** Routing is used to save payment success response **/
    router.all(modulePath+"/ui_modify_response/:order_id",async (req, res, next) => {
        /** Save Payment gateway logs */
        let orderId 		=	req?.params?.order_id || "";
        let reqQuery 		=	clone(req?.query || {});
        let reqBody 		=	clone(req?.body || {});
        let logId 			= 	new ObjectId();
        let currentStatus 	= 	(reqBody && reqBody.Result) ? reqBody.Result :"";
        await savePaymentGatewayLogs(req,res,next,{
            log_id	 	:	logId,
            order_id 	:	orderId,
            request	 	: 	{},
            response	: 	{
                query 	: 	reqQuery,
                body	: 	reqBody,
            },
            type		: 	Constants.UINTERFACE_PAYMENT_GATEWAY,
            event		: 	"modify_payment_response",
        }).then(()=>{});

        modifyOrdersModule.saveUiPaymentResponse(req,res,next,req.body).then(response=>{
            /** Set response */
            let crvResponse = {
                status			: 	(currentStatus == "NOT CAPTURED" || currentStatus == "ERROR") ? false :Constants.STATUS_SUCCESS,
                transaction_id	: 	(response.transaction_id) 	?	response.transaction_id :"",
                mobile_number	:	(response.mobile_number)	?	response.mobile_number 	:"",
                invoice_number	:	(response.invoice_number)	? 	response.invoice_number	:"",
            };

            /** Save Payment gateway logs */
            savePaymentGatewayLogs(req,res,next,{
                log_id	 	:	logId,
                order_id 	:	orderId,
                request	 	: 	{},
                response	: 	{
                    query 	: 	reqQuery,
                    body	: 	reqBody,
                    system_repsonse: response,
                },
                crv_response: 	crvResponse,
                type		: 	Constants.UINTERFACE_PAYMENT_GATEWAY,
                event		: 	"modify_payment_response",
            }).then(()=>{});

            res.send(crvResponse);
        }).catch(next);
    });

    /** Routing is used to open modify items quantity order page **/
    router.all(modulePath+"/change_quantity/:order_id/:item_id",checkRestaurantLoggedIn,(req, res, next) => {
        modifyOrdersModule.changeQuantity(req, res, next);
    });

    /** Routing is used to open modify items quantity order page **/
    router.all(modulePath+"/change_quantity/:order_id/:item_id/:extra_param",checkRestaurantLoggedIn,(req, res, next) => {
        modifyOrdersModule.changeQuantity(req, res, next);
    });

    /** Routing is used to open modify items quantity order page **/
    router.all(modulePath+"/change_quantity/:order_id/:item_id/:extra_param/:cart_id",checkRestaurantLoggedIn,(req, res, next) => {
        modifyOrdersModule.changeQuantity(req, res, next);
    });

    /** Routing is used to open add new items page **/
    router.all(modulePath+"/add_items/:order_id",checkRestaurantLoggedIn,(req, res, next) => {
        modifyOrdersModule.addNewItems(req, res, next);
    });

    /** Routing is used to open add new items page **/
    router.post(modulePath+"/get_choice_item",checkRestaurantLoggedIn,(req, res, next) => {
        modifyOrdersModule.getChoiceItem(req, res, next);
    });

    /** Routing is used to open add new items page **/
    router.post(modulePath+"/update_new_items",checkRestaurantLoggedIn,(req, res, next) => {
        modifyOrdersModule.updateNewItemsInCart(req, res, next);
    });

    /** Routing is used to open add new items page **/
    router.post(modulePath+"/update_deal_items",checkRestaurantLoggedIn,(req, res, next) => {
        modifyOrdersModule.updateDealItems(req, res, next);
    });

    /** Routing is used to delete cart item in cart using ajax **/
    router.post(modulePath+"/delete_item_cart",checkRestaurantLoggedIn,(req, res, next) => {
        modifyOrdersModule.deleteItemCart(req, res, next);
    });

    /** Routing is used to get list of status_logs **/
    router.post(modulePath+'/add_multiple_item_cart/:order_id',checkRestaurantLoggedIn,(req, res, next) => {
        modifyOrdersModule.addItemsCart(req, res,next);
    });

    /** Routing is used to get list of status_logs **/
    router.post(modulePath+'/my_cart/:order_id',checkRestaurantLoggedIn,(req, res, next) => {
        modifyOrdersModule.myCart(req, res,next);
    });

    /** Routing is used to check offer code **/
    router.post(modulePath+'/apply_coupon',checkRestaurantLoggedIn,(req, res, next) => {
        modifyOrdersModule.applyCoupon(req, res,next);
    });

    /** Routing is used to open add new items page **/
    router.post(modulePath+"/place_order",checkRestaurantLoggedIn,(req, res, next) => {
        modifyOrdersModule.placeOrders(req, res, next);
    });   
} 