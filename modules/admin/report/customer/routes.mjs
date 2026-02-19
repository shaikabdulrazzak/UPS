import { fileURLToPath } from 'url';
import { dirname } from 'path';
import reportModel from "./model/customer_report.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Configure customer report routes
 * @param {Object} router - Express router instance
 * @param {Object} options - Configuration options
 * @param {Object} options.db - Database connection instance
 * @param {Function} options.checkLoggedInAdmin - Middleware to check admin authentication
 */
export default function configure(router, { db, checkLoggedInAdmin }) {
    const modulePath = '/report/customer_report';
    const reportModule =   new reportModel(db);

	/** Set current view folder **/
	router.use(modulePath, (req, res, next) => {
		req.rendering.views	= __dirname + "/views";
		next();
	});

	/** Routing is used to get customer report list **/
	router.all(modulePath,checkLoggedInAdmin,(req, res, next) => {
		reportModule.getCustomerReportList(req, res, next);
	});

	/** Routing is used to export customer report list **/
	router.all(modulePath + "/export_data", checkLoggedInAdmin, (req, res, next) => {
		reportModule.exportCustomerReport(req, res, next);
	});
} 