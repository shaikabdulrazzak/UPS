import { fileURLToPath } from 'url';
import { dirname } from 'path';
import Hubs from "./model/hubs.mjs";
import HubBranches from "./model/hubBranches.mjs";
import HubLinkArea from "./model/hubLinkArea.mjs";
import HubOrderSlabs from "./model/hubOrderSlabs.mjs";
import { addEditValidation, parametersValidation, branchLinkValidation, orderSlabsValidation } from "./validations.mjs";
import { validateRequest } from "../../../utils/index.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Configure hubs routes
 * @param {Object} router - Express router instance
 * @param {Object} options - Configuration options
 * @param {Object} options.db - Database connection instance
 * @param {Function} options.checkLoggedInAdmin - Middleware to check admin authentication
 */
export default function configure(router, { db, checkLoggedInAdmin }) {
    const modulePath = '/hubs';
    const hubsModule        =   new Hubs(db);
    const hubBranchModule   =   new HubBranches(db);
    const hubLinkAreaModule =   new HubLinkArea(db);
    const hubOrderSlabsModule =   new HubOrderSlabs(db);

    // Set views for all /hubs* routes
    router.use(modulePath, (req, res, next) => {
        req.rendering.views = __dirname + "/views";
        next();
    });

    // Hubs list
    router.all(modulePath, checkLoggedInAdmin, (req, res, next) => {
        hubsModule.getHubsList(req, res, next);
    });

    // Add hub
    router.all(modulePath + "/add", checkLoggedInAdmin, addEditValidation, validateRequest, (req, res, next) => {
        hubsModule.addEditHubs(req, res, next);
    });

    // Edit hub
    router.all(modulePath + "/edit/:id", checkLoggedInAdmin, addEditValidation, validateRequest, (req, res, next) => {
        hubsModule.addEditHubs(req, res, next);
    });

    // Delete hub
    router.all(modulePath + "/delete/:id", checkLoggedInAdmin, (req, res, next) => {
        hubsModule.deleteHub(req, res, next);
    });

    // View config details
    router.get(modulePath + "/view/:id", checkLoggedInAdmin, (req, res, next) => {
        hubsModule.viewConfigDetails(req, res, next);
    });

    // View config details
    router.get(modulePath + "/view/:id/:type", checkLoggedInAdmin, (req, res, next) => {
        hubsModule.viewConfigDetails(req, res, next);
    });

    // Linked areas
    router.all(modulePath + "/linked_areas/:id", checkLoggedInAdmin, (req, res, next) => {
        hubLinkAreaModule.getLinkedAreas(req, res, next);
    });

    // Export linked areas
    router.all(modulePath + "/export_linked_areas/:hub_id/:branch_id", checkLoggedInAdmin, (req, res, next) => {
        hubLinkAreaModule.exportLinkedAreas(req, res, next);
    });

    // Update linked areas status
    router.all(modulePath + "/update_linked_areas_status", checkLoggedInAdmin, (req, res, next) => {
        hubLinkAreaModule.updateLinkedAreaStatus(req, res, next);
    });  

    // Add parameters
    router.all(modulePath + "/parameters/:id", checkLoggedInAdmin, parametersValidation, validateRequest, (req, res, next) => {
        hubsModule.addParameters(req, res, next);
    });

    // Branch linking list
    router.all(modulePath + "/branch_linking/:id", checkLoggedInAdmin, (req, res, next) => {
        hubBranchModule.getBranchLinkingList(req, res, next);
    });

    // Add/edit branch link
    router.all(modulePath + "/add_branch_linking/:hub_id", checkLoggedInAdmin, branchLinkValidation, validateRequest, (req, res, next) => {
        hubBranchModule.addEditBranchLink(req, res, next);
    });

    // Add/edit branch link
    router.all(modulePath + "/add_branch_linking/:hub_id/:id", checkLoggedInAdmin, branchLinkValidation, validateRequest, (req, res, next) => {
        hubBranchModule.addEditBranchLink(req, res, next);
    });

    // Delete hub branch link
    router.all(modulePath + "/delete_link/:hub_id/:id", checkLoggedInAdmin, (req, res, next) => {
        hubBranchModule.deleteHubBranchLink(req, res, next);
    });

    // Order slabs
    router.all(modulePath + "/order_slabs/:id", checkLoggedInAdmin, (req, res, next) => {
        hubOrderSlabsModule.orderSlabs(req, res, next);
    });

    // Add/edit order slabs
    router.all(modulePath + "/order_slabs/:hub_id/:id", checkLoggedInAdmin, orderSlabsValidation, validateRequest, (req, res, next) => {
        hubOrderSlabsModule.addEditOrderSlabs(req, res, next);
    });

    // Active branch list
    router.all(modulePath + "/active_branch_list", checkLoggedInAdmin, (req, res, next) => {
        hubsModule.activeBranchList(req, res, next);
    });

    // Restaurant branch dropdown
    router.all(modulePath + "/restaurant_branch_dropdown", checkLoggedInAdmin, (req, res, next) => {
        hubsModule.branchDropdown(req, res, next);
    });
} 