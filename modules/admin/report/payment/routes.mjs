import { fileURLToPath } from 'url';
import { dirname } from 'path';
import paymentReportModel from "./model/payment_report.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Configure payment report routes
 * @param {Object} router - Express router instance
 * @param {Object} options - Configuration options
 * @param {Object} options.db - Database connection instance
 * @param {Function} options.checkLoggedInAdmin - Middleware to check admin authentication
 */
export default function configure(router, { db, checkLoggedInAdmin }) {
    const modulePath = '/report/payment_report';
    const reportModule =   new paymentReportModel(db);

	/** Set current view folder **/
	router.use(modulePath, (req, res, next) => {
		req.rendering.views	= __dirname + "/views";
		next();
	});

	/** Routing is used to get payment status report list **/
	router.all(modulePath,checkLoggedInAdmin,(req, res,next) => {
		reportModule.getPaymentReportList(req, res,next);
	});

	/** Routing is used to update  export payment details **/
	router.get(modulePath+"/export_data",checkLoggedInAdmin,(req, res,next)=>{
		reportModule.exportData(req,res,next);
	});
} 