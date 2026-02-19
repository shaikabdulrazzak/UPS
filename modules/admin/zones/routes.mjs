import { fileURLToPath } from 'url';
import { dirname } from 'path';
import Zone from "./model/zone.mjs";
import { addEditZoneValidation } from "./validations.mjs";
import { validateRequest } from "../../../utils/index.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Configure Zones routes
 * @param {Object} router - Express router instance
 * @param {Object} options - Configuration options
 * @param {Object} options.db - Database connection instance
 * @param {Function} options.checkLoggedInAdmin - Middleware to check admin authentication
 */
export default function configure(router, { db, checkLoggedInAdmin }) {
    const modulePath = '/zones';
    const zoneModule = new Zone(db);

    // Set views for all /zones* routes
    router.use(modulePath, (req, res, next) => {
        req.rendering.views = __dirname + "/views";
        next();
    });

    /** Routing is used to get zones list **/
    router.all(modulePath, checkLoggedInAdmin, (req, res, next) => {
        zoneModule.getZonesList(req, res, next);
    });

    /** Routing is used to add zone **/
    router.all(modulePath + "/add", checkLoggedInAdmin, addEditZoneValidation, validateRequest, (req, res, next) => {
        zoneModule.addEditZone(req, res, next);
    });

    /** Routing is used to edit zone **/
    router.all(modulePath + "/edit/:id", checkLoggedInAdmin, addEditZoneValidation, validateRequest, (req, res, next) => {
        zoneModule.addEditZone(req, res, next);
    });

    /** Routing is used to delete zone **/
    router.all(modulePath + "/delete_zone/:id", checkLoggedInAdmin,(req, res, next) => {
        zoneModule.deleteZone(req, res, next);
    });
} 