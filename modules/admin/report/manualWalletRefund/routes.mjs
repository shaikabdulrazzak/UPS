import { fileURLToPath } from 'url';
import { dirname } from 'path';
import manualWalletRefundReportModel from "./model/manual_wallet_refund_report.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Configure agent performance report routes
 * @param {Object} router - Express router instance
 * @param {Object} options - Configuration options
 * @param {Object} options.db - Database connection instance
 * @param {Function} options.checkLoggedInAdmin - Middleware to check admin authentication
 */
export default function configure(router, { db, checkLoggedInAdmin }) {
	const reportModulePath   = '/report';
    const modulePath   = reportModulePath+'/manual_wallet_refund_report';
    const reportModule =   new manualWalletRefundReportModel(db);

	/** Set current view folder **/
	router.use([modulePath, reportModulePath], (req, res, next) => {
		req.rendering.views	= __dirname + "/views";
		next();
	});

	/** Routing is used to get manual wallet refund report **/
	router.all(modulePath,checkLoggedInAdmin,(req, res,next) => {
		reportModule.getManualWalletRefundList(req, res,next);
	});

	/** Routing is used to append manual wallet refund report **/
	router.all(reportModulePath+"/append_manual_wallet_refund_report/:from_date/:to_date/:restaurant_id",checkLoggedInAdmin,(req, res,next) => {
		reportModule.appendManualWalletRefundList(req, res,next);
	});

	/** Routing is used to append manual wallet refund report **/
	router.all(reportModulePath+"/append_manual_wallet_refund_report/:from_date/:to_date/:restaurant_id/:branch_id",checkLoggedInAdmin,(req, res,next) => {
		reportModule.appendManualWalletRefundList(req, res,next);
	});

    /** Routing is used to export manual wallet refund report **/
	router.get(modulePath+"/export_data/:from_date/:to_date",checkLoggedInAdmin,(req, res, next) => {
		reportModule.manualWalletRefundExportData(req, res, next);
	});

	/** Routing is used to export manual wallet refund report **/
	router.get(modulePath+"/export_data/:from_date/:to_date/:restaurant_id",checkLoggedInAdmin,(req, res, next) => {
		reportModule.manualWalletRefundExportData(req, res, next);
	});

	/** Routing is used to export manual wallet refund report **/
	router.get(modulePath+"/export_data/:from_date/:to_date/:restaurant_id/:branch_id",checkLoggedInAdmin,(req, res, next) => {
		reportModule.manualWalletRefundExportData(req, res, next);
	});
} 