import { fileURLToPath } from 'url';
import { dirname } from 'path';
import OrderCron from "./model/orderCron.mjs";
import BranchCron from "./model/branchCron.mjs";
import ReportCron from "./model/reportCron.mjs";
import MainCron   from "./model/cron.mjs";
import DriverCron   from "./model/driverCron.mjs";
import LeaveCron   from "./model/leaveCron.mjs";
import Tables from '../../../config/database_tables.mjs';
import * as Constants from '../../../config/global_constant.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Configure crons routes
 * @param {Object} router - Express router instance
 * @param {Object} options - Configuration options
 * @param {Object} options.db - Database connection instance
 */
export default function configure(router, { db }) {
    const modulePath = '/crons';
    const orderCronModule       =   new OrderCron(db);
    const branchCronModule      =   new BranchCron(db);
    const reportCronModule      =   new ReportCron(db);
    const mainCronModule        =   new MainCron(db);
	const driverCronModule      =   new DriverCron(db);
	const leaveCronModule       =   new LeaveCron(db);

    // Set views for all /crons* routes
    router.use(modulePath, (req, res, next) => {
        req.rendering.views = __dirname + "/views";
        next();
    });


	/*************************************************** Leaves Crons *******************************************************/

	/** Routing is used to update user leave **/
	router.get(modulePath+"/update_user_leave",(req, res,next)=>{
		leaveCronModule.updateUserLeave(req, res,next);
	});

	/** Routing is used to lapse user leave **/
	router.get(modulePath+"/lapse_user_leave",(req, res,next)=>{
		leaveCronModule.lapseUserLeave(req, res,next);
	});

	/*************************************************** Driver Crons *******************************************************/
	
	/** Routing is used to update user leave **/
	router.get([
		modulePath+"/mark_driver_outshift",
		modulePath+"/mark_driver_outshift/:days"
	],(req, res,next)=>{
		driverCronModule.markDriverOutShift(req, res,next);
	});

	/** Routing is used to start driver excuses **/
	router.get(modulePath+"/start_driver_excuses",(req, res,next)=>{
		driverCronModule.startDriverExcuses(req, res,next);
	});

	/** Routing is used to update driver available status **/
	router.get(modulePath+"/update_driver_available_status",(req, res,next)=>{
		driverCronModule.updateDriverAvailableStatus(req, res,next);
	});

	/** Routing is used to update driver free time or  order prepare remaining time **/
	router.get(modulePath+"/update_captain_free_order_prepare_time",(req, res,next)=>{
		driverCronModule.updateCaptainFreeTime(req, res,next);
	});

	/** Routing is used to auto end break **/
	router.get(modulePath+"/auto_end_break",(req, res,next)=>{
		driverCronModule.autoEndBreak(req,res,next);
	});

	/** Routing is used to send_shift_join_pn**/
	router.get(modulePath+"/send_shift_join_pn",(req, res,next)=>{
		driverCronModule.sendShiftJoinPN(req,res,next);
	});

	/** Routing is used to save driver petrol consumption**/
	router.get([
		modulePath+"/save_driver_petrol_consumption",
		modulePath+"/save_driver_petrol_consumption/:days"
	],(req, res,next)=>{
		driverCronModule.saveDriverPetrolConsumption(req,res,next);
	});

	/*************************************************** Branch Crons *******************************************************/
	
	/** Routing is used to save open branch  list **/
	router.get([
		modulePath+"/save_open_branchs",
		modulePath+"/save_open_branchs/:today"
	],(req, res,next)=>{
		branchCronModule.saveOpenBranchList(req, res,next);
	});

	/** Routing is used to save branch open status **/
	router.get(modulePath+"/save_branch_open_status",(req, res,next)=>{
		branchCronModule.saveBranchOpenStatus(req, res,next);
	});

	/** Routing is used to mark menu active **/
	router.get(modulePath+"/mark_menu_active",(req, res,next)=>{
		branchCronModule.markMenuActive(req, res,next);
	});

	/*************************************************** Report Crons *******************************************************/

	/** Routing is used to get report of customer order **/
	router.get([
		modulePath+"/report_customer_order_value",
		modulePath+"/report_customer_order_value/:days"
	],(req, res,next)=>{
		reportCronModule.getReportCustomerOrderValue(req, res,next);
	});

	/** Routing is used to update agent performance **/
	router.get([
		modulePath+"/agent_performance_migrate",
		modulePath+"/agent_performance_migrate/:date"
	],(req, res,next)=>{
		reportCronModule.agentPerformance(req, res,next);
	});

	/** Routing is used to get daily agent performance **/
	router.get(modulePath+"/daily_performance/:date",(req, res,next)=>{
		reportCronModule.calculateDailyStats(req, res,next);
	});

	/** Routing is used to get monthly agent performance **/
	router.get(modulePath+"/weekly_quality",(req, res,next)=>{
		reportCronModule.weeklyQualityStats(req, res,next);
	});

	/** Routing is used to get avaya data **/
	router.get(modulePath+"/get_avaya_data/:date",(req, res,next)=>{
		reportCronModule.getAvayaData(req, res,next);
	});

	/** Routing is used to get bulk avaya data **/
	router.all([
		modulePath+"/avaya_data_bulk_upload", 
		modulePath+"/avaya_data_bulk_upload/:days"
	],(req, res,next)=>{
		reportCronModule.getBulkAvayaData(req, res,next);
	});

	/** Routing is used to save_branch_wise_orders**/
	router.get([
		modulePath+"/save_branch_wise_processed_orders",
		modulePath+"/save_branch_wise_processed_orders/:days"
	],(req, res,next)=>{
		reportCronModule.saveRestaurnatWiseOrders(req,res,next);
	});

	/** Routing is used to save order cuisine report **/
	router.get([
		modulePath+"/save_order_cuisine_report",
		modulePath+"/save_order_cuisine_report/:days"
	],(req, res,next)=>{
		reportCronModule.saveOrderCuisineReport(req, res,next);
	});

	/** Routing is used to save_operation_report**/
	router.get([
		modulePath+"/save_operation_report",
		modulePath+"/save_operation_report/:days"
	],(req, res,next)=>{
		reportCronModule.saveOperationReport(req,res,next);
	});

	/** Routing is used to customer breakdown report**/
	router.get([
		modulePath+"/save_customer_breakdown_report",
		modulePath+"/save_customer_breakdown_report/:year",
		modulePath+"/save_customer_breakdown_report/:year/:month"
	],(req, res,next)=>{
		reportCronModule.saveCustomerBreakdownReport(req,res,next);
	});

	/** Routing is used to save_driver_wise_orders**/
	router.get([
		modulePath+"/save_captain_wise_processed_orders",
		modulePath+"/save_captain_wise_processed_orders/:days"
	],(req, res,next)=>{
		reportCronModule.saveCaptainWiseOrders(req,res,next);
	});

	/** Routing is used to save average basket suze report**/
	router.get([
		modulePath+"/save_avg_basket_size_report",
		modulePath+"/save_avg_basket_size_report/:days"
	],(req, res,next)=>{
		reportCronModule.saveAverageBasketSizeReport(req, res, next);
	});

	/** Routing is used to save_customer order stats report**/
	router.get([
		modulePath+"/save_customer_order_stats_report",
		modulePath+"/save_customer_order_stats_report/:days"
	],(req, res,next)=>{
		reportCronModule.saveCustomerOrderStatsReport(req,res,next);
	});

	// /*************************************************** Order Crons *******************************************************/

	/** Routing is used to update order scheduled **/
	router.get(modulePath+"/order_scheduled",(req, res,next)=>{
		orderCronModule.orderScheduled(req, res,next);
	});

	/** Routing is used to update order canceled **/
	router.get(modulePath+"/order_canceled",(req, res,next)=>{
		orderCronModule.orderCanceled(req, res,next);
	});

	/** Routing is used to update order delivery preparation time **/
	router.get(modulePath+"/update_order_delivery_preparation_time",(req, res,next)=>{
		orderCronModule.updateOrderDeliveryPreparationTime(req, res,next);
	});

	/** Routing is used to assign captain **/
	router.get(modulePath+"/assign_captain",(req, res,next)=>{
		orderCronModule.assignCaptain(req, res,next);
	});

	/** Routing is used to auto close open orders  **/
	router.get([
		modulePath+"/auto_close_orders",
		modulePath+"/auto_close_orders/:minutes",
		modulePath+"/auto_close_orders/:minutes/:auto_close"
	],(req, res,next)=>{
		orderCronModule.autoCloseOrders(req, res,next);
	});

	/** Routing is used to update order rules status **/
	router.get(modulePath+"/update_order_rules_status",(req, res,next)=>{
		orderCronModule.updateOrderRulesStatus(req, res,next);
	});

	/** Routing is used to update order assignment logs **/
	router.get(modulePath+"/cancel_driver_assignment_request",(req, res,next)=>{
		orderCronModule.updateOrderAssignmentLogs(req, res,next);
	});

	/** Routing is used to send order remind notification to users **/
	router.get(modulePath+"/send_order_remind_notification",(req, res,next)=>{
		orderCronModule.sendOrderRemindNotification(req, res,next);
	});

	/** Routing is used to write settings file**/
	router.get(modulePath+"/update_order_modified",(req, res,next)=>{
		orderCronModule.updateModifyOrder(req,res,next);
	});

	/** Routing is used to update order canceled **/
	router.get(modulePath+"/update_expire_payment_status",(req, res,next)=>{
		orderCronModule.updateExpirePaymentOrderStatus(req, res,next);
	});

	/** Routing is used to push rejected order to gfc **/
	router.get(modulePath + "/push_rejected_order_to_gfc", (req, res, next) => {
		orderCronModule.pushRejectedOrderToGfc(req, res, next);
	});

	/** Routing is used to push rejected order to gfc **/
	router.get(modulePath + "/push_cancle_order_to_gfc", (req, res, next) => {
		orderCronModule.pushCancleOrderToGfc(req, res, next);
	});

	/** Routing is used to send_order_delayed_voc**/
	router.get(modulePath+"/send_order_delayed_voc",(req, res,next)=>{
		orderCronModule.sendAutomaticOrdersVocPN(req,res,next);
	});

	/** Routing is used to push the order to dhub **/
	router.get(modulePath+"/push-order-dhub",(req, res,next)=>{
		orderCronModule.pushOrderToDhub(req, res,next);
	});

	/** Routing is used to push the order to dhub **/
	router.get(modulePath+"/resend-cancel-request-dhub",(req, res,next)=>{
		orderCronModule.pushCancelOrderToDhub(req, res,next);
	});

	/** Routing is used to update user leave **/
	router.get(modulePath+"/update_order_status_preparing_to_ready_to_pickup",(req, res,next)=>{
		orderCronModule.updateOrderStatusPreparingToReadyToPick(req, res,next);
	});

	/*************************************************** Normal Crons *******************************************************/

	/** Routing is used to send scheduled email/sms/notification **/
	router.get(modulePath+"/send_scheduled_notifications",(req, res,next)=>{
		mainCronModule.sendScheduledNotifications(req, res,next);
	});

	/** Routing is used to update offer status **/
	router.get(modulePath+"/update_offer_status",(req, res,next)=>{
		mainCronModule.updateOfferStatus(req, res,next);
	});

	/** Routing is used to update wallat user log**/
	router.get(modulePath+"/update_wallet_logs",(req, res,next)=>{
		mainCronModule.updateWalletLogs(req, res,next);
	});

	/** Routing is used to update remianing package days **/
	router.get(modulePath+"/update_package_days",(req, res,next)=>{
		mainCronModule.updatePackageDays(req, res,next);
	});

	/** Routing is used to get refund customer payment **/
	router.get(modulePath+"/refund_customer_payment",(req, res,next)=>{
		mainCronModule.paymentRefund(req, res,next);
	});

	/** Routing is used to mark menu active **/
	router.get(modulePath+"/remove_modified_order_from_cart",(req, res,next)=>{
		mainCronModule.removeModifiedOrderFromCart(req, res,next);
	});

	/** Routing is used to abandon cart notification **/
	router.get(modulePath+"/abandon_cart_notification",(req, res,next)=>{
		mainCronModule.abandonCartNotification(req, res,next);
	});
	
	/** Routing is used to send pn **/
	router.get(modulePath+"/send_scheduled_push_notifications",(req, res,next)=>{
		mainCronModule.sendScheduledPNs(req, res,next);
	});

	/** Routing is used to write settings file**/
	router.get(modulePath+"/write_settings_file",(req, res,next)=>{
		mainCronModule.writeSettingsFile(req,res,next);
	});

	/** Routing is used to remove kfg request and responses **/
	router.get(modulePath+"/delete_gfc_request_response/:days",(req, res,next)=>{
		mainCronModule.deleteGfcRequestResponse(req, res,next);
	});

	/** Routing is used to remove order assignement log step **/
	router.get(modulePath+"/remove_order_assignement_log_step/:days",(req, res,next)=>{
		mainCronModule.deleteOrderAssignmentLogs(req, res,next);
	});




	/*****************************Test Purposes Crons Routes ************************************************/

	/** Routing is used to update aghzeya order status **/
	router.all(modulePath + "/success_test", (req, res, next) => {
		res.send({
			page	: "success_test",
			body	: req.body,
			params	: req.params,
			query	: req.query,
		})
	});

	router.all(modulePath + "/error_test", (req, res, next) => {
		res.send({
			page	: "error",
			body	: req.body,
			params	: req.params,
			query	: req.query,
		})
	});

	/** Routing is used to save branch open status **/
	router.get(modulePath+"/order_assignment_details/:order_id",async (req, res,next)=>{
		try{

			const orders = db.collection(Tables.ORDERS);
			const orderDetails = await orders.findOne({unique_order_id: req.params.order_id },{projection:{_id:1}});

			if(!orderDetails) return res.send({message: "no order details found "});

			const order_assignment_log_steps = db.collection(Tables.ORDER_ASSIGNMENT_LOG_STEPS);
			const result = await order_assignment_log_steps.find({order_id: orderDetails._id },{projection:	{_id:0 }}).sort({created : Constants.SORT_DESC}).toArray();

			res.send({ result : result});
		}catch(error){
			res.send({
				status: "error",
				message: error.message,				
			})
		}
	});






}