import { fileURLToPath } from 'url';
import { dirname } from 'path';
import orderCountReportModel from "./model/order_count_report.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Configure order count report routes
 * @param {Object} router - Express router instance
 * @param {Object} options - Configuration options
 * @param {Object} options.db - Database connection instance
 * @param {Function} options.checkLoggedInAdmin - Middleware to check admin authentication
 */
export default function configure(router, { db, checkLoggedInAdmin }) {
    const modulePath = '/report/order_count_report';
    const reportModule =   new orderCountReportModel(db);

	/** Set current view folder **/
	router.use(modulePath, (req, res, next) => {
		req.rendering.views	= __dirname + "/views";
		next();
	});

	/** Routing is used to get order count report **/
	router.all(modulePath,checkLoggedInAdmin,(req, res,next) => {
		reportModule.getOrderCountList(req, res,next);
	});


	/** Routing is used to export order count report **/
	router.get(modulePath+"/export_data",checkLoggedInAdmin,(req, res, next) => {
		reportModule.orderCountExportData(req, res, next);
	});
} 