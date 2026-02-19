import { fileURLToPath } from 'url';
import { dirname } from 'path';
import FleetAreaAssignment from "./model/fleet_zone_assignment.mjs";
import { assignAreaValidation } from "./validations.mjs";
import { validateRequest } from "../../../utils/index.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Configure fleet area assignment routes
 * @param {Object} router - Express router instance
 * @param {Object} options - Configuration options
 * @param {Object} options.db - Database connection instance
 * @param {Function} options.checkLoggedInAdmin - Middleware to check admin authentication
 */
export default function configure(router, { db, checkLoggedInAdmin }) {
    const modulePath = '/fleet_zone_assignment';
    const fleetAreaAssignmentModule = new FleetAreaAssignment(db);

    // Set views for all /fleet_zone_assignment* routes
    router.use(modulePath, (req, res, next) => {
        req.rendering.views = __dirname + "/views";
        next();
    });

    router.all(modulePath, checkLoggedInAdmin, (req, res, next) => {
        fleetAreaAssignmentModule.getAreaList(req, res, next);
    });

    router.all(modulePath + "/add", checkLoggedInAdmin, assignAreaValidation, validateRequest, (req, res, next) => {
        fleetAreaAssignmentModule.assignArea(req, res, next);
    });

    router.all(modulePath + "/edit/:id", checkLoggedInAdmin, assignAreaValidation, validateRequest, (req, res, next) => {
        fleetAreaAssignmentModule.assignArea(req, res, next);
    });
} 