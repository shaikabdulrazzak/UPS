import { fileURLToPath } from 'url';
import { dirname } from 'path';
import HubActivityHistory from "./model/hub_activity_history.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Configure hub activity history routes
 * @param {Object} router - Express router instance
 * @param {Object} options - Configuration options
 * @param {Object} options.db - Database connection instance
 * @param {Function} options.checkLoggedInAdmin - Middleware to check admin authentication
 */
export default function configure(router, { db, checkLoggedInAdmin }) {
    const modulePath = '/hub_activity_history';
    const hubActivityHistoryModule = new HubActivityHistory(db);

    // Set views for all /hub_activity_history* routes
    router.use(modulePath, (req, res, next) => {
        req.rendering.views = __dirname + "/views";
        next();
    });

    router.all(modulePath, checkLoggedInAdmin, (req, res, next) => {
        hubActivityHistoryModule.getHubActivityHistoryList(req, res, next);
    });

    router.all(modulePath+"/export_data/:export_count/:export_type", checkLoggedInAdmin, (req, res, next) => {
        hubActivityHistoryModule.exportHubActivityHistoryData(req, res, next);
    });
} 