import { fileURLToPath } from 'url';
import { dirname } from 'path';

import customerOrder from "./model/customer_order.mjs";
import customerReportServer from "./model/customer_report_server.mjs";
import restaurantOrdersCount from "./model/restaurant_orders_count_report.mjs";
import agentPerformanceReport2 from "./model/agent_performance_report_2.mjs";
import allOrderCustomerGuestReport from "./model/all_order_customer_guest_report.mjs";
import areaAnalysisReport from "./model/area_analysis_report.mjs";
import areaPerformanceHalfYearlyReport from "./model/area_performance_half_yearly_report.mjs";
import areaPerformanceReport from "./model/area_performance_report.mjs";
import areaSalesShareReport from "./model/area_sales_share_report.mjs";
import areasContributionHalfYearlyComparisonReport from "./model/areas_contribution_half_yearly_comparison_report.mjs";
import areasContributionReport from "./model/areas_contribution_report.mjs";
import averageBasketSizeChangeReport from "./model/average_basket_size_change_report.mjs";
import averageCustomerOrderValueReport from "./model/average_customer_order_value_report.mjs";
import averageDailyNumberOfOrders from "./model/average_daily_number_of_orders.mjs";
import averageUnitSoldReport from "./model/average_unit_sold_report.mjs";
import cuisineSalesShareReport from "./model/cuisine_sales_share_report.mjs";
import customerAddressesReport from "./model/customer_addresses_report.mjs";
import customerChurnReport from "./model/customer_churn_report.mjs";
import customerSegmentationReport from "./model/customer_segmentation_report.mjs";
import customReports from "./model/custom_reports.mjs";
import deliveryFeesRevenueReport from "./model/delivery_fees_revenue_report.mjs";
import deliveryTimeAnalysisReport from "./model/delivery_time_analysis_report.mjs";
import driverPetrolConsumptionReport from "./model/driver_petrol_consumption_report.mjs";
import driverProductivityReport from "./model/driver_productivity_report.mjs";
import driversCompliantReport from "./model/drivers_compliant_report.mjs";
import driversReport from "./model/drivers_report.mjs";
import favouriteCuisineReport from "./model/favourite_cuisine_report.mjs";
import favouriteRestaurantReport from "./model/favourite_restaurant_report.mjs";
import biAnalyticsReport from "./model/bi_analytics_report.mjs";
import cancelledOrdersContributionReport from "./model/cancelled_orders_contribution_report.mjs";
import captainWiseProcessedOrders from "./model/captain_wise_processed_orders.mjs";
import captainWorkingHoursReport from "./model/captain_working_hours_report.mjs";
import cravezOrdersHalfYearlyComparisonReport from "./model/cravez_orders_half_yearly_comparison_report.mjs";
import cravezOrdersReport from "./model/cravez_orders_report.mjs";
import cravezSalesInvoiceReport from "./model/cravez_sales_invoice_report.mjs";
import monthlyCustomerBreakdownReport from "./model/monthly_customer_breakdown_report.mjs";
import mostSellingItems from "./model/most_selling_items.mjs";
import mostSellingItemsWithRelations from "./model/most_selling_items_with_relations.mjs";
import numberOfCustomersFirstOrder from "./model/number_of_customers_first_order.mjs";
import offerOnlyCustomerReport from "./model/offer_only_customer_report.mjs";
import operationReport from "./model/operation_report.mjs";
import orderFrequencyReport from "./model/order_frequency_report.mjs";
import orderPaymentCancel from "./model/order_payment_cancel.mjs";
import orderPaymentMethodsReport from "./model/order_payment_methods_report.mjs";
import ordersPerGovernorate from "./model/orders_per_governorate.mjs";
import orderValueReport from "./model/order_value_report.mjs";
import redeemEveryOfferReport from "./model/redeem_every_offer_report.mjs";
import restaurantBusyReport from "./model/restaurant_busy_report.mjs";
import restaurantComplaints from "./model/restaurant_complaints.mjs";
import restaurantOpenCloseReport from "./model/restaurant_open_close_report.mjs";
import restaurantOrderRateReport from "./model/restaurant_order_rate_report.mjs";
import restaurantPerformanceHalfYearlyReport from "./model/restaurant_performance_half_yearly_report.mjs";
import restaurantPerformanceReport from "./model/restaurant_performance_report.mjs";
import restaurantSalesReport from "./model/restaurant_sales_report.mjs";
import restaurantsOrderSummary from "./model/restaurants_order_summary.mjs";
import restaurantsRankingManagement from "./model/restaurants_ranking_management.mjs";
import revenueCommissionReport from "./model/revenue_commission_report.mjs";
import salesReport from "./model/sales_report.mjs";
import salesStaffPortfolioReport from "./model/sales_staff_portfolio_report.mjs";
import settledPayments from "./model/settled_payments.mjs";
import topSellingItems from "./model/top_selling_items.mjs";
import topSellingRestaurants from "./model/top_selling_restaurants.mjs";
import transmissionTimeReport from "./model/transmission_time_report.mjs";
import transmissionTimeReportOne from "./model/transmission_time_report_one.mjs";
import unsettledPayments from "./model/unsettled_payments.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Configure report routes
 * @param {Object} router - Express router instance
 * @param {Object} options - Configuration options
 * @param {Object} options.db - Database connection instance
 * @param {Function} options.checkLoggedInAdmin - Middleware to check admin authentication
 */
export default function configure(router, { db, checkLoggedInAdmin }) {
    const modulePath = '/report';
    const customerOrderModule =   new customerOrder(db);
	const customerReportServerModule =   new customerReportServer(db);
	const restaurantOrdersCountModule =   new restaurantOrdersCount(db);
	const agentPerformanceReport2Module =   new agentPerformanceReport2(db);
	const allOrderCustomerGuestReportModule =   new allOrderCustomerGuestReport(db);
	const areaAnalysisReportModule =   new areaAnalysisReport(db);
	const areaPerformanceHalfYearlyReportModule =   new areaPerformanceHalfYearlyReport(db);
	const areaPerformanceReportModule =   new areaPerformanceReport(db);
	const areaSalesShareReportModule =   new areaSalesShareReport(db);
	const areasContributionHalfYearlyComparisonReportModule =   new areasContributionHalfYearlyComparisonReport(db);
	const areasContributionReportModule =   new areasContributionReport(db);
	const averageBasketSizeChangeReportModule =   new averageBasketSizeChangeReport(db);
	const averageCustomerOrderValueReportModule =   new averageCustomerOrderValueReport(db);
	const averageDailyNumberOfOrdersModule =   new averageDailyNumberOfOrders(db);
	const averageUnitSoldReportModule =   new averageUnitSoldReport(db);
	const cuisineSalesShareReportModule =   new cuisineSalesShareReport(db);
	const customerAddressesReportModule =   new customerAddressesReport(db);
	const customerChurnReportModule =   new customerChurnReport(db);
	const customerSegmentationReportModule =   new customerSegmentationReport(db);
	const customReportsModule =   new customReports(db);
	const deliveryFeesRevenueReportModule =   new deliveryFeesRevenueReport(db);
	const deliveryTimeAnalysisReportModule =   new deliveryTimeAnalysisReport(db);
	const driverPetrolConsumptionReportModule =   new driverPetrolConsumptionReport(db);
	const driverProductivityReportModule =   new driverProductivityReport(db);
	const driversCompliantReportModule =   new driversCompliantReport(db);
	const driversReportModule =   new driversReport(db);
	const favouriteCuisineReportModule =   new favouriteCuisineReport(db);
	const favouriteRestaurantReportModule =   new favouriteRestaurantReport(db);
	const biAnalyticsReportModule =   new biAnalyticsReport(db);
	const cancelledOrdersContributionReportModule =   new cancelledOrdersContributionReport(db);
	const captainWiseProcessedOrdersModule =   new captainWiseProcessedOrders(db);
	const captainWorkingHoursReportModule =   new captainWorkingHoursReport(db);
	const cravezOrdersHalfYearlyComparisonReportModule =   new cravezOrdersHalfYearlyComparisonReport(db);
	const cravezOrdersReportModule =   new cravezOrdersReport(db);
	const cravezSalesInvoiceReportModule =   new cravezSalesInvoiceReport(db);
	const monthlyCustomerBreakdownReportModule =   new monthlyCustomerBreakdownReport(db);
	const mostSellingItemsModule =   new mostSellingItems(db);
	const mostSellingItemsWithRelationsModule =   new mostSellingItemsWithRelations(db);
	const numberOfCustomersFirstOrderModule =   new numberOfCustomersFirstOrder(db);
	const offerOnlyCustomerReportModule =   new offerOnlyCustomerReport(db);
	const operationReportModule =   new operationReport(db);
	const orderFrequencyReportModule =   new orderFrequencyReport(db);
	const orderPaymentCancelModule =   new orderPaymentCancel(db);
	const orderPaymentMethodsReportModule =   new orderPaymentMethodsReport(db);
	const ordersPerGovernorateModule =   new ordersPerGovernorate(db);
	const orderValueReportModule =   new orderValueReport(db);
	const redeemEveryOfferReportModule =   new redeemEveryOfferReport(db);
	const restaurantBusyReportModule =   new restaurantBusyReport(db);
	const restaurantComplaintsModule =   new restaurantComplaints(db);
	const restaurantOpenCloseReportModule =   new restaurantOpenCloseReport(db);
	const restaurantOrderRateReportModule =   new restaurantOrderRateReport(db);
	const restaurantPerformanceHalfYearlyReportModule =   new restaurantPerformanceHalfYearlyReport(db);
	const restaurantPerformanceReportModule =   new restaurantPerformanceReport(db);
	const restaurantSalesReportModule =   new restaurantSalesReport(db);
	const restaurantsOrderSummaryModule =   new restaurantsOrderSummary(db);
	const restaurantsRankingManagementModule =   new restaurantsRankingManagement(db);
	const revenueCommissionReportModule =   new revenueCommissionReport(db);
	const salesReportModule =   new salesReport(db);
	const salesStaffPortfolioReportModule =   new salesStaffPortfolioReport(db);
	const settledPaymentsModule =   new settledPayments(db);
	const topSellingItemsModule =   new topSellingItems(db);
	const topSellingRestaurantsModule =   new topSellingRestaurants(db);
	const transmissionTimeReportModule =   new transmissionTimeReport(db);
	const transmissionTimeReportOneModule =   new transmissionTimeReportOne(db);
	const unsettledPaymentsModule =   new unsettledPayments(db);

	// Set views for all /report* routes
    router.use(modulePath, (req, res, next) => {
        req.rendering.views = __dirname + "/views";
        next();
    });

	/** Routing is used to get customer order report list **/
	router.all(modulePath+"/customer_order",checkLoggedInAdmin,(req, res,next) => {
		customerOrderModule.getCustomerOrderReportList(req, res,next);
	});

	/** Routing is used to get branch  list **/
	router.post(modulePath+"/customer_order/branch_list",checkLoggedInAdmin,(req, res,next) => {
		customerOrderModule.branchList(req, res,next);
	});

	/** Routing is used to export customer order report **/
	router.get(modulePath+"/customer_order/export_data",checkLoggedInAdmin,(req, res,next) => {
		customerOrderModule.customerOrderExportData(req, res,next);
	});

	/** Routing is used to get customer_report_server list **/
	router.all(modulePath+"/customer_report_server",checkLoggedInAdmin,(req, res) => {
		customerReportServerModule.getCustomerReportServerList(req, res);
	});

	/** Routing is used to export customer_report_server list **/
	router.all(modulePath + "/customer_report_server/export_data", checkLoggedInAdmin, (req, res) => {
		customerReportServerModule.exportCustomerReportServer(req, res);
	});

	// /** Routing is used to get restaurant orders count report list **/
	router.get(modulePath+"/restaurant_orders_report",checkLoggedInAdmin,(req, res, next) => {
		restaurantOrdersCountModule.getRestaurantOrdersCountList(req, res, next);
	});

	/** Routing is used to get restaurant orders count report list **/
	router.all(modulePath+"/append_restaurant_orders_report/:from_date/:to_date/:restaurant_id",checkLoggedInAdmin,(req, res, next) => {
		restaurantOrdersCountModule.appendRestaurantOrdersCountList(req, res, next);
	});

	/** Routing is used to get restaurant orders count report list **/
	router.all(modulePath+"/append_restaurant_orders_report/:from_date/:to_date/:restaurant_id/:branch_id",checkLoggedInAdmin,(req, res, next) => {
		restaurantOrdersCountModule.appendRestaurantOrdersCountList(req, res, next);
	});

	/** Routing is used to export restaurant orders count report **/
	router.get(modulePath+"/restaurant_orders_report/export_data/:from_date/:to_date",checkLoggedInAdmin,(req, res, next) => {
		restaurantOrdersCountModule.restaurantOrderExportData(req, res, next);
	});

	/** Routing is used to export restaurant orders count report **/
	router.get(modulePath+"/restaurant_orders_report/export_data/:from_date/:to_date/:restaurant_id",checkLoggedInAdmin,(req, res, next) => {
		restaurantOrdersCountModule.restaurantOrderExportData(req, res, next);
	});

	/** Routing is used to export restaurant orders count report **/
	router.get(modulePath+"/restaurant_orders_report/export_data/:from_date/:to_date/:restaurant_id/:branch_id",checkLoggedInAdmin,(req, res, next) => {
		restaurantOrdersCountModule.restaurantOrderExportData(req, res, next);
	});

	/** Routing is used to get unsettled payments list **/
	router.all(modulePath+"/unsettled_payment",checkLoggedInAdmin,(req, res,next) => {
		unsettledPaymentsModule.getUnsettledPaymentsList(req, res,next);
	});

	/** Routing is used to pay unsettled payment **/
	router.all(modulePath+"/unsettled_payment/pay/:restaurant_id",checkLoggedInAdmin,(req, res,next) => {
		unsettledPaymentsModule.proceedUnsettledPayments(req, res,next);
	});

	/** Routing is used to get order logs list **/
	router.all(modulePath+"/settled_payment/order_details/:restaurant_id",checkLoggedInAdmin,(req, res,next) => {
		unsettledPaymentsModule.getOrderDetailsList(req, res,next, true);
	});

	/** Routing is used to get order logs list **/
	router.all(modulePath+"/unsettled_payment/order_details/:restaurant_id",checkLoggedInAdmin,(req, res,next) => {
		unsettledPaymentsModule.getOrderDetailsList(req, res,next);
	});

	/** Routing is used to get payment history list **/
	router.all(modulePath+"/unsettled_payment/payment_history/:restaurant_id",checkLoggedInAdmin,(req, res,next) => {
		unsettledPaymentsModule.getPaymentHistoryList(req, res,next);
	});

	/** Routing is used to get branch list **/
	router.post(modulePath+"/branch_list",checkLoggedInAdmin,(req, res,next) => {
		unsettledPaymentsModule.unsettledBranchList(req, res,next);
	});

	/** Routing is used to update  export order details **/
	router.all(modulePath+"/export_data",checkLoggedInAdmin,(req, res,next)=>{
		unsettledPaymentsModule.orderExportData(req,res,next);
	});

	/** Routing is used to update  export order details **/
	router.all(modulePath+"/unsettled_export_data/export_data",checkLoggedInAdmin,(req, res,next)=>{
		unsettledPaymentsModule.unsettledExportData(req,res,next);
	});

	/** Routing is used to get settled payments list **/
	router.all(modulePath+"/settled_payments",checkLoggedInAdmin,(req, res,next) => {
		settledPaymentsModule.getSettledPaymentsList(req, res,next);
	});

	/** Routing is used to update  export order details **/
	router.all(modulePath+"/settled_export_data/export_data",checkLoggedInAdmin,(req, res,next)=>{
		settledPaymentsModule.settledExportData(req,res,next);
	});

	/** Routing is used to get average daily number of orders report **/
	router.all(modulePath+"/average_daily_number_of_orders",checkLoggedInAdmin,(req, res,next) => {
		averageDailyNumberOfOrdersModule.getAverageDailyNumberOfOrdersList(req, res,next);
	});

	/** Routing is used to export average daily number of orders report **/
	router.get(modulePath+"/average_daily_number_of_orders/export_data",checkLoggedInAdmin,(req, res, next) => {
		averageDailyNumberOfOrdersModule.averageDailyNumberOfOrdersExportData(req, res, next);
	});

	/** Routing is used to get order value report **/
	router.all(modulePath+"/order_value_report",checkLoggedInAdmin,(req, res,next) => {
		orderValueReportModule.getOrderValueList(req, res,next);
	});

	/** Routing is used to append order value report **/
	router.get(modulePath+"/order_value_report/export_data",checkLoggedInAdmin,(req, res, next) => {
		orderValueReportModule.orderValueExportData(req, res, next);
	});

	/** Routing is used to get top selling items report **/
	router.all(modulePath+"/top_selling_items",checkLoggedInAdmin,(req, res,next) => {
		topSellingItemsModule.getTopSellingItemsList(req, res,next);
	});

	/** Routing is used to export top selling items report **/
	router.get(modulePath+"/top_selling_items/export_data",checkLoggedInAdmin,(req, res, next) => {
		topSellingItemsModule.topSellingItemsExportData(req, res, next);
	});

	/** Routing is used to get most selling items report **/
	router.all(modulePath+"/most_selling_items",checkLoggedInAdmin,(req, res,next) => {
		mostSellingItemsModule.getMostSellingItemsList(req, res,next);
	});

	/** Routing is used to export most selling items report **/
	router.get(modulePath+"/most_selling_items/export_data",checkLoggedInAdmin,(req, res, next) => {
		mostSellingItemsModule.mostSellingItemsExportData(req, res, next);
	});

	/** Routing is used to get average_unit_sold_mom report **/
	router.all(modulePath+"/average_unit_sold_report",checkLoggedInAdmin,(req, res,next) => {
		averageUnitSoldReportModule.avgUnitSoldMoM(req, res,next);
	});

	/** Routing is used to export average_unit_sold_mom report **/
	router.get(modulePath+"/average_unit_sold_report/export_data",checkLoggedInAdmin,(req, res, next) => {
		averageUnitSoldReportModule.avgUnitSoldMoMExport(req, res, next);
	});

	/** Routing is used to get average_unit_sold_mom report **/
	router.all(modulePath + "/average_basket_size_change_report", checkLoggedInAdmin, (req, res, next) => {
		averageBasketSizeChangeReportModule.avgBasketSizeChangeReport(req, res, next);
	});

	/** Routing is used to export average_unit_sold_mom report **/
	router.get(modulePath + "/average_basket_size_change_report/export_data", checkLoggedInAdmin, (req, res, next) => {
		averageBasketSizeChangeReportModule.avgBasketSizeChangeExport(req, res, next);
	});

	/** Routing is used to get number of customers who made first order from cravez list **/
	router.all(modulePath+"/number_of_customers",checkLoggedInAdmin,(req, res,next) => {
		numberOfCustomersFirstOrderModule.getNumberOfCustomersList(req, res,next);
	});

	/** Routing is used to export number of customers who made first order from cravez list **/
	router.get(modulePath+"/number_of_customers/export_data",checkLoggedInAdmin,(req, res,next) => {
		numberOfCustomersFirstOrderModule.numberOfCustomersExportData(req, res,next);
	});

	/** Routing is used to get favourite restaurant list **/
	router.all(modulePath+"/favourite_restaurant_report",checkLoggedInAdmin,(req, res,next) => {
		favouriteRestaurantReportModule.getFavouriteRestaurantList(req, res,next);
	});

	/** Routing is used to export favourite restaurant list **/
	router.get(modulePath+"/favourite_restaurant_report/export_data",checkLoggedInAdmin,(req, res,next) => {
		favouriteRestaurantReportModule.favouriteRestaurantExport(req, res,next);
	});

	/** Routing is used to get favourite cuisine list **/
	router.all(modulePath+"/favourite_cuisine_report",checkLoggedInAdmin,(req, res,next) => {
		favouriteCuisineReportModule.getFavouriteCuisineList(req, res,next);
	});

	/** Routing is used to export favourite cuisine list **/
	router.get(modulePath+"/favourite_cuisine_report/export_data",checkLoggedInAdmin,(req, res,next) => {
		favouriteCuisineReportModule.favouriteCuisineExport(req, res,next);
	});

	/** Routing is used to get order payment cancel list **/
	router.all(modulePath+"/order_payment_cancel",checkLoggedInAdmin,(req, res,next) => {
		orderPaymentCancelModule.getOrderPaymentCancelList(req, res,next);
	});

	/** Routing is used to export order payment cancel list **/
	router.all(modulePath + "/order_payment_cancel/export_data", checkLoggedInAdmin, (req, res, next) => {
		orderPaymentCancelModule.exportOrderPaymentCancel(req, res, next);
	});	

	/** Routing is used to get driver petrol consumption report list **/
	router.all(modulePath+"/driver_petrol_consumption_report",checkLoggedInAdmin,(req, res,next) => {
		driverPetrolConsumptionReportModule.getDriverPetrolConsumptionReportList(req, res,next);
	});

	/** Routing is used to get driver petrol consumption report details **/
	router.all(modulePath+"/driver_petrol_consumption_detail/:driver_id/:vehicle_type",checkLoggedInAdmin,(req, res,next) => {
		driverPetrolConsumptionReportModule.driverPetrolConsumptionDetails(req, res,next);
	});

	/** Routing is used to update  export petrol consumption list **/
	router.all(modulePath+"/petrol_consumption_list_export/export_data",checkLoggedInAdmin,(req, res,next)=>{
		driverPetrolConsumptionReportModule.petrolConsumListExport(req,res,next);
	});

	/** Routing is used to update  export petrol consumption details **/
	router.all(modulePath+"/petrol_consumption_detail_export/export_data",checkLoggedInAdmin,(req, res,next)=>{
		driverPetrolConsumptionReportModule.petrolConsumDetailExport(req,res,next);
	});

	/** Routing is used to get captain_wise_processed_orders list **/
	router.all(modulePath+"/captain_wise_order_report",checkLoggedInAdmin,(req, res,next) => {
		captainWiseProcessedOrdersModule.getCaptainOrdersReportList(req, res,next);
	});

	/** Routing is used to update  export captain_wise_processed_orders **/
	router.all(modulePath +"/captain_wise_order_report/export_data",checkLoggedInAdmin,(req, res,next)=>{
		captainWiseProcessedOrdersModule.captianOrderExport(req,res,next);
	});

	/** Routing is used to get restaurant_order_rate_report list **/
	router.all(modulePath+"/restaurant_order_rate_report",checkLoggedInAdmin,(req, res,next) => {
		restaurantOrderRateReportModule.getBranchOrdersReportList(req, res,next);
	});

	/** Routing is used to update export restaurant_order_rate_report **/
	router.all(modulePath+"/restaurant_order_rate_report/export_data",checkLoggedInAdmin,(req, res,next)=>{
		restaurantOrderRateReportModule.restaurantOrderRateExport(req,res,next);
	});

	/** Routing is used to get restaurant_branch_dropdown list **/
	router.all(modulePath+"/restaurant_branch_dropdown",checkLoggedInAdmin,(req, res,next) => {
		restaurantOrderRateReportModule.branchDropdown(req, res,next);
	});

	/** Routing is used to get restaurant_area_dropdown list **/
	router.all(modulePath+"/restaurant_area_dropdown",checkLoggedInAdmin,(req, res,next) => {
		restaurantOrderRateReportModule.areaDropdown(req, res,next);
	});

	/** Routing is used to get delivery fees revenue list **/
	router.all(modulePath+"/delivery_fees_revenue_report",checkLoggedInAdmin,(req, res,next) => {
		deliveryFeesRevenueReportModule.getDeliveryFeesReportList(req, res,next);
	});

	/** Routing is used to update export restaurant_order_rate_report **/
	router.all(modulePath+"/delivery_fees_revenue_report/export_data",checkLoggedInAdmin,(req, res,next)=>{
		deliveryFeesRevenueReportModule.getDeliveryFeesRevenueReportExport(req,res,next);
	});

	/** Routing is used to get city_area_dropdown list **/
	router.all(modulePath+"/city_area_dropdown",checkLoggedInAdmin,(req, res,next) => {
		deliveryFeesRevenueReportModule.cityAreaDropdown(req, res,next);
	});

	/** Routing is used to get restaurant_order_rate_report list **/
	router.all(modulePath+"/all_order_customer_guest_report",checkLoggedInAdmin,(req, res,next) => {
		allOrderCustomerGuestReportModule.getAllOrdersReportList(req, res,next);
	});

	/** Routing is used to get all_order_customer_guest_report export **/
	router.all(modulePath+"/all_order_customer_guest_report/export_data",checkLoggedInAdmin,(req, res,next) => {
		allOrderCustomerGuestReportModule.getAllOrdersReportExport(req, res,next);
	});

	/** Routing is used to get sales report list **/
	router.all(modulePath+"/sales_report",checkLoggedInAdmin,(req, res,next) => {
		salesReportModule.getSalesReportList(req, res,next);
	});

	/** Routing is used to get sales report export **/
	router.all(modulePath+"/sales_report/export_data",checkLoggedInAdmin,(req, res,next) => {
		salesReportModule.getSalesReportExport(req, res,next);
	});

	/** Routing is used to get transmission time report list **/
	router.all(modulePath+"/transmission_time_report",checkLoggedInAdmin,(req, res,next) => {
		transmissionTimeReportModule.getTransmissionTimeReportList(req, res,next);
	});

	/** Routing is used to get transmission time report export **/
	router.all(modulePath+"/transmission_time_report/export_data",checkLoggedInAdmin,(req, res,next) => {
		transmissionTimeReportModule.getTransmissionTimeReportExport(req, res,next);
	});

	/** Routing is used to get transmission time report list **/
	router.all(modulePath+"/transmission_time_report_one", checkLoggedInAdmin, (req, res, next) => {
		transmissionTimeReportOneModule.getTransmissionTimeReportOneList(req, res, next);
	});

	/** Routing is used to get transmission time report export **/
	router.all(modulePath + "/transmission_time_report_one/export_data", checkLoggedInAdmin, (req, res, next) => {
		transmissionTimeReportOneModule.getTransmissionTimeReportOneExport(req, res, next);
	});

	/** Routing is used to get operation report list **/
	router.all(modulePath+"/operation_report",checkLoggedInAdmin,(req, res,next) => {
		operationReportModule.getOperationReportList(req, res,next);
	});

	/** Routing is used to get operation report export **/
	router.all(modulePath+"/operation_report/export_data",checkLoggedInAdmin,(req, res,next) => {
		operationReportModule.getOperationReportExport(req, res,next);
	});

	/** Routing is used to get revenue commission list **/
	router.all(modulePath+"/revenue_commission_report",checkLoggedInAdmin,(req, res,next) => {
		revenueCommissionReportModule.getRevenueCommissionList(req, res,next);
	});

	/** Routing is used to update export Revenue Commission **/
	router.all(modulePath+"/revenue_commission_report/export_data",checkLoggedInAdmin,(req, res,next)=>{
		revenueCommissionReportModule.getRevenueCommissionReportExport(req,res,next);
	});

	/** Routing is used to get average daily number of orders report **/
	router.all(modulePath+"/orders_per_governorate",checkLoggedInAdmin,(req, res,next) => {
		ordersPerGovernorateModule.getOrdersPerGovernorate(req, res,next);
	});

	/** Routing is used to export average daily number of orders report **/
	router.get(modulePath+"/orders_per_governorate/export_data",checkLoggedInAdmin,(req, res, next) => {
		ordersPerGovernorateModule.exportGetOrdersPerGovernorate(req, res, next);
	});

	/** Routing is used to get offer only customer report **/
	router.all(modulePath+"/offer_only_customer_report",checkLoggedInAdmin,(req, res,next) => {
		offerOnlyCustomerReportModule.getOfferOnlyCustomers(req, res,next);
	});

	/** Routing is used to export offer only customer report**/
	router.get(modulePath+"/offer_only_customer_report/export_data",checkLoggedInAdmin,(req, res, next) => {
		offerOnlyCustomerReportModule.offerOnlyCustomersExport(req, res, next);
	});

	/** Routing is used to get cuisine sales share report report **/
	router.all(modulePath+"/cuisine_sales_share_report",checkLoggedInAdmin,(req, res,next) => {
		cuisineSalesShareReportModule.getCuisineSalesReport(req, res,next);
	});

	/** Routing is used to export cuisine sales share report report**/
	router.get(modulePath +"/cuisine_sales_share_report/export_data",checkLoggedInAdmin,(req, res, next) => {
		cuisineSalesShareReportModule.cuisineSalesShareExport(req, res, next);
	});

	/** Routing is used to get cuisine segmentation report report **/
	router.all(modulePath+"/customer_segmentation_report",checkLoggedInAdmin,(req, res,next) => {
		customerSegmentationReportModule.getCustomerSegmentationReport(req, res,next);
	});

	/** Routing is used to export cuisine segmentation report report**/
	router.get(modulePath +"/customer_segmentation_report/export_data",checkLoggedInAdmin,(req, res, next) => {
		customerSegmentationReportModule.customerSegmentationExport(req, res, next);
	});

	/** Routing is used to get area list list **/
	router.all(modulePath+"/get_area_list",checkLoggedInAdmin,(req, res,next) => {
		customerSegmentationReportModule.getCityAreas(req, res,next);
	});

	/** Routing is used to get customer_churn_report report **/
	router.all(modulePath+"/customer_churn_report",checkLoggedInAdmin,(req, res,next) => {
		customerChurnReportModule.getCustomerChurnReport(req, res,next);
	});

	/** Routing is used to export customer_churn_report**/
	router.get(modulePath+"/customer_churn_report/export_data",checkLoggedInAdmin,(req, res, next) => {
		customerChurnReportModule.churnReportExport(req, res, next);
	});

	/** Routing is used to get order_frequency_report report **/
	router.all(modulePath+"/order_frequency_report",checkLoggedInAdmin,(req, res,next) => {
		orderFrequencyReportModule.getOrderFrequencyReport(req, res,next);
	});

	/** Routing is used to export order_frequency_report**/
	router.get(modulePath+"/order_frequency_report/export_data",checkLoggedInAdmin,(req, res, next) => {
		orderFrequencyReportModule.orderFrequencyExport(req, res, next);
	});

	/** Routing is used to get custom_reports report **/
	router.all(modulePath+"/custom_reports",checkLoggedInAdmin,(req, res,next) => {
		customReportsModule.getCustomReports(req, res,next);
	});

	/** Routing is used to export custom_reports**/
	router.get(modulePath +"/custom_reports/export_data",checkLoggedInAdmin,(req, res, next) => {
		customReportsModule.customReportsExport(req, res, next);
	});	


	/** Routing is used to get top selling restaurants report **/
	router.all(modulePath+"/top_selling_restaurants",checkLoggedInAdmin,(req, res,next) => {
		topSellingRestaurantsModule.getTopsellingRestaurantList(req, res,next);
	});

	/** Routing is used to export top selling restaurants **/
	router.get(modulePath+"/top_selling_restaurants/export_data",checkLoggedInAdmin,(req, res, next) => {
		topSellingRestaurantsModule.exportTopsellingRestaurants(req, res, next);
	});
	

	/** Routing is used to get restaurants ranking report **/
	router.all(modulePath + "/restaurants_ranking_management", checkLoggedInAdmin, (req, res, next) => {
		restaurantsRankingManagementModule.getRestaurantsRankingList(req, res, next);
	});

	/** Routing is used to export restaurants ranking  **/
	router.get(modulePath + "/restaurants_ranking_management/export_data", checkLoggedInAdmin, (req, res, next) => {
		restaurantsRankingManagementModule.exportRestaurantsRanking(req, res, next);
	});

	/** Routing is used to get area sales share report **/
	router.all(modulePath + "/area_sales_share_report", checkLoggedInAdmin, (req, res, next) => {
		areaSalesShareReportModule.getAreaSalesShareList(req, res, next);
	});

	/** Routing is used to export area sales share  **/
	router.get(modulePath + "/area_sales_share_report/export_data", checkLoggedInAdmin, (req, res, next) => {
		areaSalesShareReportModule.exportAreaSalesShare(req, res, next);
	});

	/** Routing is used to get restaurants order report **/
	router.all(modulePath + "/restaurants_order_summary", checkLoggedInAdmin, (req, res, next) => {
		restaurantsOrderSummaryModule.getRestaurantsOrderList(req, res, next);
	});

	/** Routing is used to export restaurants order **/
	router.get(modulePath + "/restaurants_order_summary/export_data", checkLoggedInAdmin, (req, res, next) => {
		restaurantsOrderSummaryModule.exportRestaurantsOrder(req, res, next);
	});

	/** Routing is used to get restaurants order report **/
	router.all(modulePath + "/restaurants_order_summary/previous_data", checkLoggedInAdmin, (req, res, next) => {
		restaurantsOrderSummaryModule.getPreviousDateData(req, res, next);
	});

	/** Routing is used to get cancelled orders contribution report **/
	router.all(modulePath + "/cancelled_orders_contribution_report", checkLoggedInAdmin, (req, res, next) => {
		cancelledOrdersContributionReportModule.getCancelledOrdersContributionList(req, res, next);
	});

	/** Routing is used to export cancelled orders contribution report**/
	router.get(modulePath + "/cancelled_orders_contribution_report/export_data", checkLoggedInAdmin, (req, res, next) => {
		cancelledOrdersContributionReportModule.cancelledOrdersContributionExportData(req, res, next);
	});

	/** Routing is used to get monthly customer breakdown report **/
	router.all(modulePath + "/monthly_customer_breakdown_report", checkLoggedInAdmin, (req, res, next) => {
		monthlyCustomerBreakdownReportModule.getCustomerBreakdownReport(req, res, next);
	});

	/** Routing is used to export monthly customer breakdown report**/
	router.get(modulePath + "/monthly_customer_breakdown_report/export_data", checkLoggedInAdmin, (req, res, next) => {
		monthlyCustomerBreakdownReportModule.exportCustomerBreakdownReport(req, res, next);
	});
	
	/** Routing is used to get average customer order value report **/
	router.all(modulePath + "/average_customer_order_value_report", checkLoggedInAdmin, (req, res, next) => {
		averageCustomerOrderValueReportModule.getAvgCustomerOrderValueList(req, res, next);
	});

	/** Routing is used to export average customer order value report**/
	router.get(modulePath + "/average_customer_order_value_report/export_data", checkLoggedInAdmin, (req, res, next) => {
		averageCustomerOrderValueReportModule.avgCustomerOrderValueReportExport(req, res, next);
	});

	/** Routing is used to get aredeem_every_offer_report **/
	router.all(modulePath + "/redeem_every_offer_report", checkLoggedInAdmin, (req, res, next) => {
		redeemEveryOfferReportModule.getRedeemEveryOfferReport(req, res, next);
	});

	/** Routing is used to export redeem_every_offer_report**/
	router.get(modulePath + "/redeem_every_offer_report/export_data", checkLoggedInAdmin, (req, res, next) => {
		redeemEveryOfferReportModule.redeemEveryOfferReportExport(req, res, next);
	});

	/** Routing is used to get delivery_time_analysis_report **/
	router.all(modulePath + "/delivery_time_analysis_report", checkLoggedInAdmin, (req, res, next) => {
		deliveryTimeAnalysisReportModule.getDeliveryTimeAnalysisReportList(req, res, next);
	});

	/** Routing is used to export delivery_time_analysis_report**/
	router.get(modulePath + "/delivery_time_analysis_report/export_data", checkLoggedInAdmin, (req, res, next) => {
		deliveryTimeAnalysisReportModule.getDeliveryTimeAnalysisReportExport(req, res, next);
	});

	/** Routing is used to get driver_productivity_report **/
	router.all(modulePath + "/driver_productivity_report", checkLoggedInAdmin, (req, res, next) => {
		driverProductivityReportModule.getDriverProductivityReportList(req, res, next);
	});

	/** Routing is used to export driver_productivity_report**/
	router.get(modulePath + "/driver_productivity_report/export_data", checkLoggedInAdmin, (req, res, next) => {
		driverProductivityReportModule.getDriverProductivityReportExport(req, res, next);
	});

	/** Routing is used to get area_analysis_report **/
	router.all(modulePath + "/area_analysis_report", checkLoggedInAdmin, (req, res, next) => {
		areaAnalysisReportModule.getAreaAnalysisReportList(req, res, next);
	});

	/** Routing is used to export area_analysis_report**/
	router.get(modulePath + "/area_analysis_report/export_data", checkLoggedInAdmin, (req, res, next) => {
		areaAnalysisReportModule.areaAnalysisReportExport(req, res, next);
	});

	/** Routing is used to get captain_working_hours_report **/
	router.all(modulePath + "/captain_working_hours_report", checkLoggedInAdmin, (req, res, next) => {
		captainWorkingHoursReportModule.getCaptainWorkingHoursReportList(req, res, next);
	});

	/** Routing is used to export captain_working_hours_report**/
	router.get(modulePath + "/captain_working_hours_report/export_data", checkLoggedInAdmin, (req, res, next) => {
		captainWorkingHoursReportModule.captainWorkingHoursReportExport(req, res, next);
	});

	/** Routing is used to get drivers_compliant_report **/
	router.all(modulePath + "/drivers_compliant_report", checkLoggedInAdmin, (req, res, next) => {
		driversCompliantReportModule.getDriversCompliantReportList(req, res, next);
	});

	/** Routing is used to export drivers_compliant_report**/
	router.get(modulePath + "/drivers_compliant_report/export_data", checkLoggedInAdmin, (req, res, next) => {
		driversCompliantReportModule.driversCompliantReportExport(req, res, next);
	});

	/** Routing is used to get drivers_report **/
	router.all(modulePath + "/drivers_report", checkLoggedInAdmin, (req, res, next) => {
		driversReportModule.getDriversReportList(req, res, next);
	});

	/** Routing is used to export drivers_report**/
	router.get(modulePath + "/drivers_report/export_data", checkLoggedInAdmin, (req, res, next) => {
		driversReportModule.driversReportExport(req, res, next);
	});

	/** Routing is used to get restaurant_performance_report **/
	router.all(modulePath + "/restaurant_performance_report", checkLoggedInAdmin, (req, res, next) => {
		restaurantPerformanceReportModule.getRestaurantPerformanceList(req, res, next);
	});

	/** Routing is used to export restaurant_performance_report**/
	router.get(modulePath + "/restaurant_performance_report/export_data", checkLoggedInAdmin, (req, res, next) => {
		restaurantPerformanceReportModule.restaurantPerformanceReportExport(req, res, next);
	});

	/** Routing is used to get area_performance_report **/
	router.all(modulePath + "/area_performance_report", checkLoggedInAdmin, (req, res, next) => {
		areaPerformanceReportModule.getAreaPerformanceList(req, res, next);
	});

	/** Routing is used to export area_performance_report**/
	router.get(modulePath + "/area_performance_report/export_data", checkLoggedInAdmin, (req, res, next) => {
		areaPerformanceReportModule.areaPerformanceReportExport(req, res, next);
	});

	/** Routing is used to get areas_contribution_report **/
	router.all(modulePath + "/areas_contribution_report", checkLoggedInAdmin, (req, res, next) => {
		areasContributionReportModule.getAreasContributionList(req, res, next);
	});

	/** Routing is used to export areas_contribution_report**/
	router.get(modulePath + "/areas_contribution_report/export_data", checkLoggedInAdmin, (req, res, next) => {
		areasContributionReportModule.areasContributionReportExport(req, res, next);
	});
	
	/** Routing is used to get cravez_orders_report **/
	router.all(modulePath + "/cravez_orders_report", checkLoggedInAdmin, (req, res, next) => {
		cravezOrdersReportModule.getCravezOrdersList(req, res, next);
	});

	/** Routing is used to export cravez_orders_report**/
	router.get(modulePath + "/cravez_orders_report/export_data", checkLoggedInAdmin, (req, res, next) => {
		cravezOrdersReportModule.cravezOrdersReportExport(req, res, next);
	});	
	
	/** Routing is used to get restaurant_busy_report **/
	router.all(modulePath + "/restaurant_busy_report", checkLoggedInAdmin, (req, res, next) => {
		restaurantBusyReportModule.getBusyReportList(req, res, next);
	});

	/** Routing is used to export restaurant_busy_report**/
	router.get(modulePath + "/restaurant_busy_report/export_data", checkLoggedInAdmin, (req, res, next) => {
		restaurantBusyReportModule.exportBusyReport(req, res, next);
	});
	
	/** Routing is used to get area_performance_half_yearly_report **/
	router.all(modulePath + "/area_performance_half_yearly_report", checkLoggedInAdmin, (req, res, next) => {
		areaPerformanceHalfYearlyReportModule.getAreaPerformanceHalfYearlyList(req, res, next);
	});

	/** Routing is used to export area_performance_half_yearly_report**/
	router.get(modulePath + "/area_performance_half_yearly_report/export_data", checkLoggedInAdmin, (req, res, next) => {
		areaPerformanceHalfYearlyReportModule.areaPerformanceHalfYearlyReportExport(req, res, next);
	});
	
	/** Routing is used to get restaurant_performance_half_yearly_report **/
	router.all(modulePath + "/restaurant_performance_half_yearly_report", checkLoggedInAdmin, (req, res, next) => {
		restaurantPerformanceHalfYearlyReportModule.getRestaurantPerformanceHalfYearlyList(req, res, next);
	});

	/** Routing is used to export restaurant_performance_half_yearly_report**/
	router.get(modulePath + "/restaurant_performance_half_yearly_report/export_data", checkLoggedInAdmin, (req, res, next) => {
		restaurantPerformanceHalfYearlyReportModule.restaurantPerformanceHalfYearlyReportExport(req, res, next);
	});

	/** Routing is used to get areas_contribution half yearly report **/
	router.all(modulePath + "/areas_contribution_half_yearly_report", checkLoggedInAdmin, (req, res, next) => {
		areasContributionHalfYearlyComparisonReportModule.getAreasContributionHalfYearlyList(req, res, next);
	});

	/** Routing is used to export areas_contribution half yearly report**/
	router.get(modulePath + "/areas_contribution_half_yearly_report/export_data", checkLoggedInAdmin, (req, res, next) => {
		areasContributionHalfYearlyComparisonReportModule.areasContributionHalfYearlyReportExport(req, res, next);
	});	

	/** Routing is used to get cravez_orders half yearly report **/
	router.all(modulePath + "/cravez_orders_half_yearly_report", checkLoggedInAdmin, (req, res, next) => {
		cravezOrdersHalfYearlyComparisonReportModule.getCravezOrdersHalfYearlyList(req, res, next);
	});

	/** Routing is used to export cravez_orders half yearly report**/
	router.get(modulePath + "/cravez_orders_half_yearly_report/export_data", checkLoggedInAdmin, (req, res, next) => {
		cravezOrdersHalfYearlyComparisonReportModule.cravezOrdersHalfYearlyReportExport(req, res, next);
	});
	
	/** Routing is used to get restaurant_open_close_report **/
	router.all(modulePath + "/restaurant_open_close_report", checkLoggedInAdmin, (req, res, next) => {
		restaurantOpenCloseReportModule.getRestaurantOpenCloseReportList(req, res, next);
	});

	/** Routing is used to export restaurant_open_close_report**/
	router.get(modulePath + "/restaurant_open_close_report/export_data", checkLoggedInAdmin, (req, res, next) => {
		restaurantOpenCloseReportModule.restaurantOpenCloseReportExport(req, res, next);
	});

	/** Routing is used to get bi_analytics_report **/
	router.all(modulePath + "/bi_analytics_report", checkLoggedInAdmin, (req, res, next) => {
		biAnalyticsReportModule.getAnalyticsReportList(req, res, next);
	});

	/** Routing is used to export bi_analytics_report**/
	router.get(modulePath + "/bi_analytics_report/get_item_list", checkLoggedInAdmin, (req, res, next) => {
		biAnalyticsReportModule.getItemList(req, res, next);
	});

	/** Routing is used to get sales_staff_portfolio_report **/
	router.all(modulePath + "/sales_staff_portfolio_report", checkLoggedInAdmin, (req, res, next) => {
		salesStaffPortfolioReportModule.getSalesStaffPortfolioList(req, res, next);
	});
	
	/** Routing is used to export sales_staff_portfolio_report**/
	router.get(modulePath + "/sales_staff_portfolio_report/export_data", checkLoggedInAdmin, (req, res, next) => {
		salesStaffPortfolioReportModule.salesStaffPortfolioReportExport(req, res, next);
	});

	/** Routing is used to get most_selling_items_with_relation **/
	router.all(modulePath + "/rest_most_selling_item_with_relations", checkLoggedInAdmin, (req, res, next) => {
		mostSellingItemsWithRelationsModule.getMostSellingItemsRelation(req, res, next);
	});

	/** Routing is used to export most_selling_items_with_relation**/
	router.get(modulePath + "/rest_most_selling_item_with_relations/export_data", checkLoggedInAdmin, (req, res, next) => {
		mostSellingItemsWithRelationsModule.ExportMostSellingItemsRelation(req, res, next);
	});

	/** Routing is used to get order_payment_methods_report **/
	router.all(modulePath + "/order_payment_methods_report", checkLoggedInAdmin, (req, res, next) => {
		orderPaymentMethodsReportModule.getOrderPaymentMethodsReportList(req, res, next);
	});

	/** Routing is used to export order_payment_methods_report**/
	router.get(modulePath + "/order_payment_methods_report/export_data", checkLoggedInAdmin, (req, res, next) => {
		orderPaymentMethodsReportModule.orderPaymentMethodsReportExport(req, res, next);
	});

	/** Routing is used to get cravez_sales_invoice_report **/
	router.all(modulePath + "/cravez_sales_invoice_report", checkLoggedInAdmin, (req, res, next) => {
		cravezSalesInvoiceReportModule.getCravezSalesInvoiceReportList(req, res, next);
	});

	/** Routing is used to export cravez_sales_invoice_report**/
	router.get(modulePath + "/cravez_sales_invoice_report/export_data", checkLoggedInAdmin, (req, res, next) => {
		cravezSalesInvoiceReportModule.cravezSalesInvoiceReportExport(req, res, next);
	});

	/** Routing is used to get restaurant_sales_report **/
	router.all(modulePath + "/restaurant_sales_report", checkLoggedInAdmin, (req, res, next) => {
		restaurantSalesReportModule.getRestaurantSalesReportList(req, res, next);
	});

	/** Routing is used to export restaurant_sales_report **/
	router.get(modulePath + "/restaurant_sales_report/export_data", checkLoggedInAdmin, (req, res, next) => {
		restaurantSalesReportModule.getRestaurantSalesReportExport(req, res, next);
	});

	/** Routing is used to get restaurant_complaints list **/
	router.all(modulePath + "/restaurant_complaints", checkLoggedInAdmin, (req, res, next) => {
		restaurantComplaintsModule.getRestaurantComplaintReportList(req, res, next);
	});

	/** Routing is used to export restaurant_complaints **/
	router.get(modulePath + "/restaurant_complaints/export_data/:export_count/:export_type", checkLoggedInAdmin, (req, res, next) => {
		restaurantComplaintsModule.restaurantComplaintReportExport(req, res, next);
	});

	/** Routing is used to update extra item order**/
	router.all(modulePath + "/restaurant_complaints/view_messages/:id", checkLoggedInAdmin, (req, res, next) => {
		restaurantComplaintsModule.viewMessages(req, res, next);
	});

	/** Routing is used to get agent performance report 2**/
	router.all(modulePath + "/agentperformance_2", checkLoggedInAdmin, (req, res, next) => {
		agentPerformanceReport2Module.getAgentPerformanceList2(req, res, next);
	});

	/** Routing is used to export agent performance report 2**/
	router.get(modulePath + "/agentperformance_2/export_data", checkLoggedInAdmin, (req, res, next) => {
		agentPerformanceReport2Module.agentPerformance2ExportData(req, res, next);
	});
	
	/** Routing is used to get customer adsress report list **/
	router.all(modulePath+"/customer_address",checkLoggedInAdmin,(req, res,next) => {
		customerAddressesReportModule.getCustomerAddressReportList(req, res,next);
	});

	/** Routing is used to export customer address  list **/
	router.all(modulePath + "/customer_address/export_data/:export_count", checkLoggedInAdmin, (req, res) => {
		customerAddressesReportModule.exportCustomerAddressReport(req, res);
	});	
} 