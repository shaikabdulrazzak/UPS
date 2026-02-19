import { fileURLToPath } from 'url';
import { dirname } from 'path';
import agentPerformanceReportModel from "./model/agent_performance_report.js";

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
    const modulePath = '/report/agent_performance';
    const reportModule =   new agentPerformanceReportModel(db);

	/** Set current view folder **/
	router.use(modulePath, (req, res, next) => {
		req.rendering.views	= __dirname + "/views";
		next();
	});

	/** Routing is used to get agent performance report **/
	router.all(modulePath,checkLoggedInAdmin,(req, res,next) => {
		reportModule.getAgentPerformanceList(req, res,next);
	});

    /** Routing is used to export agent performance report **/
	router.get(modulePath+"/export_data",checkLoggedInAdmin,(req, res, next) => {
		reportModule.agentPerformanceExportData(req, res, next);
	});

	/** Routing is used to get restaurant_item_dropdown list **/
	router.all("/report/restaurant_item_dropdown",checkLoggedInAdmin,(req, res,next) => {
		reportModule.itemDropdown(req, res,next);
	});	
} 