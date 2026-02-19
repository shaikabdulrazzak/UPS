import { fileURLToPath } from 'url';
import { dirname } from 'path';
import CancelReason from "./model/cancel_reason.mjs";
import { addEditValidation } from "./validations.mjs";
import {validateRequest } from "../../../utils/index.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default function configure(router, { db, checkLoggedInAdmin }) {
    const modulePath = '/cancel_reason';
    const cancelReasonModule = new CancelReason(db);

    // Set views for all /cancel_reason* routes
    router.use(modulePath, (req, res, next) => {
        req.rendering.views = __dirname + "/views";
        next();
    });

    router.all(modulePath, checkLoggedInAdmin, (req, res, next) => {
        cancelReasonModule.getCancelReasonList(req, res, next);
    });

    router.all(modulePath + "/add", checkLoggedInAdmin, addEditValidation, validateRequest, (req, res, next) => {
        cancelReasonModule.addEditCancelReason(req, res, next);
    });

    router.all(modulePath + "/edit/:id", checkLoggedInAdmin, addEditValidation, validateRequest, (req, res, next) => {
        cancelReasonModule.addEditCancelReason(req, res, next);
    });

    router.all(modulePath + "/update-status/:id/:status", checkLoggedInAdmin, (req, res, next) => {
        cancelReasonModule.updateCancelReasonStatus(req, res, next);
    });

    router.all(modulePath + "/delete/:id", checkLoggedInAdmin, (req, res, next) => {
        cancelReasonModule.deleteReason(req, res, next);
    });

    router.all(modulePath + "/update_flags/:type/:id/:action", checkLoggedInAdmin, (req, res, next) => {
        cancelReasonModule.updateFlags(req, res, next);
    });
} 