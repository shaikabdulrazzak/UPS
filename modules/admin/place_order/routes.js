/** Model file path for current plugin **/
const modelPath					= __dirname+"/model/place_order";
const modulePath				= "/"+ADMIN_NAME+"/place_order";
const orderManagement			= require(modelPath);

/** Set current view folder **/
app.use(modulePath,(req, res, next) => {
	req.rendering.views	=	__dirname + "/views";
	next();
});

/** Routing is used for change language */
app.get(modulePath+"/change_language/:lng_code",(req, res,next)=>{
	if(req.params.lng_code){
		let tmpLngId 	= (req.params.lng_code == ENGLISH_LANGUAGE_CODE) ? ENGLISH_LANGUAGE_MONGO_ID :ARABIC_LANGUAGE_MONGO_ID;
		req.session.item_display_lng_id 	 	= 	tmpLngId;
		req.session.item_display_lng_code	=	LANGUAGE_CODES[tmpLngId];
	}
	let backURL = req.header('Referer') || WEBSITE_ADMIN_URL;
	res.redirect(backURL);
});

/** Routing is used to show success page **/
app.all(FRONT_END_NAME+"payment/:action",(req, res, next) => {
	req.rendering.views     = 	__dirname + "/views";
	req.rendering.layout    = 	WEBSITE_LAYOUT_PATH+"before_login";
	orderManagement.success_failure(req, res, next);
});

/** Routing is used to update cart quanityt **/
app.post(modulePath+"/update_cart_qty",checkLoggedInAdmin,(req, res, next) => {
	orderManagement.updateCartQty(req, res, next);
});

/** Routing is used to open add new items page **/
app.post(modulePath+"/update_deal_items",checkLoggedInAdmin,(req, res, next) => {
	orderManagement.updateDealItems(req, res, next);
});

/** Routing is used to save payment success response **/
app.all(modulePath+"/payment_success/:order_id/:user_id/:restaurant_id",(req, res, next) => {
	orderManagement.paymentSuccess(req,res,next);
});

/** Routing is used to save payment failure response **/
app.all(modulePath+"/payment_failure/:order_id/:user_id/:restaurant_id",(req, res, next) => {
	orderManagement.paymentFailure(req,res,next);
});

/** Routing is used to save payment success response **/
app.all(modulePath+"/ui_payment_success/:order_id/:user_id/:restaurant_id",(req, res, next) => {
	/** Save Payment gateway logs */
	savePaymentGatewayLogs(req,res,next,{
		order_id 	:	req.params.order_id,
		request	 	: 	{},
		response	: 	{
			query 	: req.query,
			body	: req.body,
		},
		type		: 	UINTERFACE_PAYMENT_GATEWAY,
		event		: 	"payment_success_response",
	}).then(()=>{});

	orderManagement.saveUiPaymentResponse(req,res,next,req.query).then(response=>{
		if(response.status != STATUS_SUCCESS){
			req.flash(STATUS_ERROR, response.message);
			return res.redirect(WEBSITE_URL + "payment/failure");
		}

		res.redirect(WEBSITE_URL + "payment/success");
	}).catch(next);
});

/** Routing is used to save payment failure response **/
app.all(modulePath+"/ui_payment_failure/:order_id/:user_id/:restaurant_id",(req, res, next) => {
	/** Save Payment gateway logs */
	savePaymentGatewayLogs(req,res,next,{
		order_id 	:	req.params.order_id,
		request	 	: 	{},
		response	: 	{
			query 	: req.query,
			body	: req.body,
		},
		type		: 	UINTERFACE_PAYMENT_GATEWAY,
		event		: 	"payment_error_response"
	}).then(()=>{});

	orderManagement.saveUiPaymentResponse(req,res,next,req.query).then(response=>{
		if(response.message) req.flash(STATUS_ERROR, response.message);
		res.redirect(WEBSITE_URL + "payment/failure");
	}).catch(next);
});

/** Routing is used to save payment response **/
app.all(modulePath+"/ui_payment_response/:order_id/:user_id/:restaurant_id",(req, res, next) => {
	/** Save Payment gateway logs */
	const clone 		=	require("clone");
	let orderId 		=	req.params.order_id;
	let reqQuery 		=	clone(req.query);
	let reqBody 		=	clone(req.body);
	let logId 			= 	ObjectId();
	let currentStatus 	= 	(reqBody && reqBody.Result) ? reqBody.Result :"";
	savePaymentGatewayLogs(req,res,next,{
		log_id	 	:	logId,
		order_id 	:	orderId,
		request	 	: 	{},
		response	: 	{
			query 	: 	reqQuery,
			body	: 	reqBody,
		},
		type		: 	UINTERFACE_PAYMENT_GATEWAY,
		event		: 	"payment_response",
	}).then(()=>{});

	orderManagement.saveUiPaymentResponse(req,res,next,req.body).then(response=>{
		/** Set response */
		let crvResponse = {
			status			: 	(currentStatus == "NOT CAPTURED" || currentStatus == "ERROR") ? false :STATUS_SUCCESS,
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
			type		: 	UINTERFACE_PAYMENT_GATEWAY,
			event		: 	"payment_response",
		}).then(()=>{});

		res.send(crvResponse);
	}).catch(next);
});

/** Routing is used to apply coupon **/
app.post(modulePath+"/apply_coupon",checkLoggedInAdmin,(req, res, next) => {
	orderManagement.applyCoupon(req,res,next);
});

/** Routing is used to place order **/
app.post(modulePath+"/place_order",checkLoggedInAdmin,(req, res, next) => {
	orderManagement.placeOrder(req,res,next);
});

/** Routing is used to get payment methods **/
app.post(modulePath+"/get_payment_method",checkLoggedInAdmin,(req, res, next) => {
	orderManagement.getPaymentMethods(req,res,next);
});

/** Routing is used to get block list **/
app.post(modulePath+"/get_block_list",checkLoggedInAdmin,(req, res, next) => {
	orderManagement.getBlockList(req,res,next);
});

/** Routing is used to get area list **/
app.post(modulePath+"/get_area_list",checkLoggedInAdmin,(req, res, next) => {
	orderManagement.getAreaList(req,res,next);
});

/** Routing is used to submit address form **/
app.all(modulePath+"/submit_address/:user_id/:id?",checkLoggedInAdmin,(req, res, next)=>{
	orderManagement.submitAddress(req, res, next);
});

/** Routing is used to view add/edit address form **/
app.all(modulePath+"/add_address/:id?",checkLoggedInAdmin,(req, res, next)=>{
	orderManagement.CustomerAddress(req, res, next);
});

/** Routing is used to checkout the cart **/
app.post(modulePath+"/checkout",checkLoggedInAdmin,(req, res, next) => {
   	orderManagement.checkout(req, res, next);
});

/** Routing is used to delete cart item in cart using ajax **/
app.post(modulePath+"/delete_item_cart",checkLoggedInAdmin,(req, res, next) => {
   	orderManagement.deleteItemCart(req, res, next);
});

/** Routing is used to get list of cart **/
app.post(modulePath+'/my_cart',checkLoggedInAdmin,(req, res, next) => {
    orderManagement.myCart(req, res,next);
});

/** Routing is used to open add new items page **/
app.post(modulePath+"/update_new_items",checkLoggedInAdmin,(req, res, next) => {
	orderManagement.updateNewItemsInCart(req, res, next);
});

/** Routing is used to get choice item **/
app.post(modulePath+"/get_choice_item",checkLoggedInAdmin,(req, res, next) => {
	orderManagement.getChoiceItem(req, res, next);
});

/** Routing is used to make order **/
app.all(modulePath+"/make_order",checkLoggedInAdmin,(req, res, next) => {
	orderManagement.getResturantItemDetails(req,res,next);
});

/** Routing is used to get list of items **/
app.all(modulePath+"/item_list",checkLoggedInAdmin,(req, res, next) => {
	orderManagement.getCategoryListWithItem(req,res,next);
});

/** Routing is used to get list of items with category **/
app.all(modulePath+"/item_detail/:restaurant_id/:branch_id",checkLoggedInAdmin,(req, res, next) => {
	orderManagement.getResturantItemDetails(req,res,next);
});

/** Routing is used to edit note **/
app.all(modulePath + "/edit_note/:cart_id", checkLoggedInAdmin, (req, res, next) => {
	orderManagement.editItemNote(req, res, next);
});

/** Routing is used to get order food form **/
app.post(modulePath+"/reorder_list",checkLoggedInAdmin,(req, res, next) => {
	orderManagement.getPreviousOrderList(req,res,next);
});

/** Routing is used to get list of status_logs **/
app.all(modulePath+'/add_reorder_item_cart/:order_id',checkLoggedInAdmin,(req, res, next) => {
	orderManagement.reorderItemsCart(req, res,next);
});

/** Routing is used to get order food form **/
app.all(modulePath+"/:id/:skip?",checkLoggedInAdmin,(req, res, next) => {
	orderManagement.selectArea(req,res,next);
});






