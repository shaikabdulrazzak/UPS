import { fileURLToPath } from 'url';
import { ObjectId } from 'mongodb';
import { dirname } from 'path';
import clone from 'clone';
import adminPlaceOrder from "./model/place_order.mjs";
import * as Constants from "../../../config/global_constant.mjs";
import { savePaymentGatewayLogs} from "./../../../services/index.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Configure place order routes
 * @param {Object} router - Express router instance
 * @param {Object} options - Configuration options
 * @param {Object} options.db - Database connection instance
 * @param {Function} options.checkLoggedInAdmin - Middleware to check admin authentication
 */
export default function configure(router, { db, checkLoggedInAdmin }) {
    const modulePath        =   '/place_order' ;
    const placeOrderModule  =   new adminPlaceOrder(db);

    // Set views for all /place order* routes
    router.use(modulePath, (req, res, next) => {
        req.rendering.views = __dirname + "/views";
        next();
    });

    /** Routing is used for change language */
    router.get(modulePath+"/change_language/:lng_code",(req, res,next)=>{
        if(req.params.lng_code){
            let tmpLngId 	= (req.params.lng_code == Constants.ENGLISH_LANGUAGE_CODE) ? Constants.ENGLISH_LANGUAGE_MONGO_ID :Constants.ARABIC_LANGUAGE_MONGO_ID;
            req.session.item_display_lng_id 	= 	tmpLngId;
            req.session.item_display_lng_code	=	Constants.LANGUAGE_CODES[tmpLngId];
        }
        let backURL = req.header('Referer') || Constants.WEBSITE_ADMIN_URL;
        res.redirect(backURL);
    });

    /** Routing is used to show success page **/
    // router.all(FRONT_END_NAME+"payment/:action",(req, res, next) => {
    //     req.rendering.views     = 	__dirname + "/views";
    //     req.rendering.layout    = 	Constants.WEBSITE_LAYOUT_PATH+"before_login";
    //     placeOrderModule.success_failure(req, res, next);
    // });

    /** Routing is used to update cart quantity **/
    router.post(modulePath+"/update_cart_qty",checkLoggedInAdmin,(req, res, next) => {
        placeOrderModule.updateCartQty(req, res, next);
    });

    /** Routing is used to open add new items page **/
    router.post(modulePath+"/update_deal_items",checkLoggedInAdmin,(req, res, next) => {
        placeOrderModule.updateDealItems(req, res, next);
    });

    /** Routing is used to save payment success response **/
    router.all(modulePath+"/payment_success/:order_id/:user_id/:restaurant_id",(req, res, next) => {
        placeOrderModule.paymentSuccess(req,res,next);
    });

    /** Routing is used to save payment failure response **/
    router.all(modulePath+"/payment_failure/:order_id/:user_id/:restaurant_id",(req, res, next) => {
        placeOrderModule.paymentFailure(req,res,next);
    });

    /** Routing is used to save payment success response **/
    router.all(modulePath+"/ui_payment_success/:order_id/:user_id/:restaurant_id",(req, res, next) => {
        /** Save Payment gateway logs */
        savePaymentGatewayLogs(req,res,next,{
            order_id 	:	req.params.order_id,
            request	 	: 	{},
            response	: 	{
                query 	: req.query,
                body	: req.body,
            },
            type		: 	Constants.UINTERFACE_PAYMENT_GATEWAY,
            event		: 	"payment_success_response",
        }).then(()=>{});

        placeOrderModule.saveUiPaymentResponse(req,res,next,req.query).then(response=>{
            if(response.status != Constants.STATUS_SUCCESS){
                req.flash(Constants.STATUS_ERROR, response.message);
                return res.redirect(Constants.WEBSITE_URL + "payment/failure");
            }

            res.redirect(Constants.WEBSITE_URL + "payment/success");
        }).catch(next);
    });

    /** Routing is used to save payment failure response **/
    router.all(modulePath+"/ui_payment_failure/:order_id/:user_id/:restaurant_id",(req, res, next) => {
        /** Save Payment gateway logs */
        savePaymentGatewayLogs(req,res,next,{
            order_id 	:	req.params.order_id,
            request	 	: 	{},
            response	: 	{
                query 	: req.query,
                body	: req.body,
            },
            type		: 	Constants.UINTERFACE_PAYMENT_GATEWAY,
            event		: 	"payment_error_response"
        }).then(()=>{});

        placeOrderModule.saveUiPaymentResponse(req,res,next,req.query).then(response=>{
            if(response.message) req.flash(Constants.STATUS_ERROR, response.message);
            res.redirect(Constants.WEBSITE_URL + "payment/failure");
        }).catch(next);
    });

    /** Routing is used to save payment response **/
    router.all(modulePath+"/ui_payment_response/:order_id/:user_id/:restaurant_id",(req, res, next) => {
        /** Save Payment gateway logs */
        let orderId 		=	req.params.order_id;
        let reqQuery 		=	clone(req.query);
        let reqBody 		=	clone(req.body);
        let logId 			= 	new ObjectId();
        let currentStatus 	= 	(reqBody && reqBody.Result) ? reqBody.Result :"";
        savePaymentGatewayLogs(req,res,next,{
            log_id	 	:	logId,
            order_id 	:	orderId,
            request	 	: 	{},
            response	: 	{
                query 	: 	reqQuery,
                body	: 	reqBody,
            },
            type		: 	Constants.UINTERFACE_PAYMENT_GATEWAY,
            event		: 	"payment_response",
        }).then(()=>{});

        placeOrderModule.saveUiPaymentResponse(req,res,next,req.body).then(response=>{
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
                event		: 	"payment_response",
            }).then(()=>{});

            res.send(crvResponse);
        }).catch(next);
    });

    /** Routing is used to apply coupon **/
    router.post(modulePath+"/apply_coupon",checkLoggedInAdmin,(req, res, next) => {
        placeOrderModule.applyCoupon(req,res,next);
    });

    /** Routing is used to place order **/
    router.post(modulePath+"/place_order",checkLoggedInAdmin,(req, res, next) => {
        placeOrderModule.placeOrder(req,res,next);
    });

    /** Routing is used to get payment methods **/
    router.post(modulePath+"/get_payment_method",checkLoggedInAdmin,(req, res, next) => {
        placeOrderModule.getPaymentMethods(req,res,next);
    });

    /** Routing is used to get block list **/
    router.post(modulePath+"/get_block_list",checkLoggedInAdmin,(req, res, next) => {
        placeOrderModule.getBlockList(req,res,next);
    });

    /** Routing is used to get area list **/
    router.post(modulePath+"/get_area_list",checkLoggedInAdmin,(req, res, next) => {
        placeOrderModule.getAreaList(req,res,next);
    });

    /** Routing is used to submit address form **/
    router.all(modulePath+"/submit_address/:user_id",checkLoggedInAdmin,(req, res, next)=>{
        placeOrderModule.submitAddress(req, res, next);
    });

    /** Routing is used to submit address form **/
    router.all(modulePath+"/submit_address/:user_id/:id",checkLoggedInAdmin,(req, res, next)=>{
        placeOrderModule.submitAddress(req, res, next);
    });

    /** Routing is used to view add/edit address form **/
    router.all(modulePath+"/add_address",checkLoggedInAdmin,(req, res, next)=>{
        placeOrderModule.CustomerAddress(req, res, next);
    });

    /** Routing is used to view add/edit address form **/
    router.all(modulePath+"/add_address/:id",checkLoggedInAdmin,(req, res, next)=>{
        placeOrderModule.CustomerAddress(req, res, next);
    });

    /** Routing is used to checkout the cart **/
    router.post(modulePath+"/checkout",checkLoggedInAdmin,(req, res, next) => {
        placeOrderModule.checkout(req, res, next);
    });

    /** Routing is used to delete cart item in cart using ajax **/
    router.post(modulePath+"/delete_item_cart",checkLoggedInAdmin,(req, res, next) => {
        placeOrderModule.deleteItemCart(req, res, next);
    });

    /** Routing is used to get list of cart **/
    router.post(modulePath+'/my_cart',checkLoggedInAdmin,(req, res, next) => {
        placeOrderModule.myCart(req, res,next);
    });

    /** Routing is used to open add new items page **/
    router.post(modulePath+"/update_new_items",checkLoggedInAdmin,(req, res, next) => {
        placeOrderModule.updateNewItemsInCart(req, res, next);
    });

    /** Routing is used to get choice item **/
    router.post(modulePath+"/get_choice_item",checkLoggedInAdmin,(req, res, next) => {
        placeOrderModule.getChoiceItem(req, res, next);
    });

    /** Routing is used to make order **/
    router.all(modulePath+"/make_order",checkLoggedInAdmin,(req, res, next) => {
        placeOrderModule.getResturantItemDetails(req,res,next);
    });

    /** Routing is used to get list of items **/
    router.all(modulePath+"/item_list",checkLoggedInAdmin,(req, res, next) => {
        placeOrderModule.getCategoryListWithItem(req,res,next);
    });

    /** Routing is used to get list of items with category **/
    router.all(modulePath+"/item_detail/:restaurant_id/:branch_id",checkLoggedInAdmin,(req, res, next) => {
        placeOrderModule.getResturantItemDetails(req,res,next);
    });

    /** Routing is used to edit note **/
    router.all(modulePath + "/edit_note/:cart_id", checkLoggedInAdmin, (req, res, next) => {
        placeOrderModule.editItemNote(req, res, next);
    });

    /** Routing is used to get order food form **/
    router.post(modulePath+"/reorder_list",checkLoggedInAdmin,(req, res, next) => {
        placeOrderModule.getPreviousOrderList(req,res,next);
    });

    /** Routing is used to get list of status_logs **/
    router.all(modulePath+'/add_reorder_item_cart/:order_id',checkLoggedInAdmin,(req, res, next) => {
        placeOrderModule.reorderItemsCart(req, res,next);
    });

    /** Routing is used to get order food form **/
    router.all(modulePath+"/:id",checkLoggedInAdmin,(req, res, next) => {
        placeOrderModule.selectArea(req,res,next);
    });

    /** Routing is used to get order food form **/
    router.all(modulePath+"/:id/:skip",checkLoggedInAdmin,(req, res, next) => {
        placeOrderModule.selectArea(req,res,next);
    });
}