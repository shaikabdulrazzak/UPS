import { fileURLToPath } from 'url';
import { dirname } from 'path';
import OfferManagement from "./model/offer_management.mjs";
import { addEditValidation } from "./validations.mjs";
import { validateRequest } from "../../../utils/index.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Configure offer management routes
 * @param {Object} router - Express router instance
 * @param {Object} options - Configuration options
 * @param {Object} options.db - Database connection instance
 * @param {Function} options.checkLoggedInAdmin - Middleware to check admin authentication
 */
export default function configure(router, { db, checkLoggedInAdmin }) {
    const modulePath = '/offer_management';
    const offerManagementModule = new OfferManagement(db);

    // Set views for all /offer_management* routes
    router.use(modulePath, (req, res, next) => {
        req.rendering.views = __dirname + "/views";
        next();
    });

    router.all(modulePath, checkLoggedInAdmin, (req, res, next) => {
        offerManagementModule.getOffersList(req, res, next);
    });

    router.all(modulePath+"/add", checkLoggedInAdmin, addEditValidation, validateRequest, (req, res, next) => {
        offerManagementModule.addEditOffer(req, res, next);
    });

    router.all(modulePath+"/edit/:id", checkLoggedInAdmin, addEditValidation, validateRequest, (req, res, next) => {
        offerManagementModule.addEditOffer(req, res, next);
    });

    router.post(modulePath+"/branch_list", checkLoggedInAdmin, (req, res, next) => {
        offerManagementModule.branchList(req, res, next);
    });

    router.get(modulePath+"/update-status/:id/:status", checkLoggedInAdmin, (req, res, next) => {
        offerManagementModule.updateOfferStatus(req, res, next);
    });

    router.post(modulePath+"/category_list", checkLoggedInAdmin, (req, res, next) => {
        offerManagementModule.categoryList(req, res, next);
    });

    router.post(modulePath+"/cuisine_list", checkLoggedInAdmin, (req, res, next) => {
        offerManagementModule.cuisineList(req, res, next);
    });

    router.post(modulePath+"/item_list", checkLoggedInAdmin, (req, res, next) => {
        offerManagementModule.itemList(req, res, next);
    });

    router.post(modulePath+"/restaurant_list", checkLoggedInAdmin, (req, res, next) => {
        offerManagementModule.restaurantList(req, res, next);
    });

    router.post(modulePath + "/get_users", checkLoggedInAdmin, (req, res, next) => {
        offerManagementModule.getUsersList(req, res, next);
    });
} 