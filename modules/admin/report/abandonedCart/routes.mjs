import { fileURLToPath } from 'url';
import { dirname } from 'path';

import abandonedCartReportModel from "./model/abandoned_cart_report.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Configure abandoned cart report routes
 * @param {Object} router - Express router instance
 * @param {Object} options - Configuration options
 * @param {Object} options.db - Database connection instance
 * @param {Function} options.checkLoggedInAdmin - Middleware to check admin authentication
 */
export default function configure(router, { db, checkLoggedInAdmin }) {
    const modulePath = '/report/abandoned_cart_report';
    const abandonedCartReportModule =   new abandonedCartReportModel(db);

	/** Set current view folder **/
	router.use(modulePath, (req, res, next) => {
		req.rendering.views	= __dirname + "/views";
		next();
	});

    /** Routing is used to get abandoned_cart_report **/
	router.all(modulePath, checkLoggedInAdmin, (req, res, next) => {
		abandonedCartReportModule.getAbandonedCartReportList(req, res, next);
	});

	/** Routing is used to export abandoned_cart_report**/
	router.get(modulePath + "/export_data", checkLoggedInAdmin, (req, res, next) => {
		abandonedCartReportModule.abandonedCartReportExport(req, res, next);
	});
} 