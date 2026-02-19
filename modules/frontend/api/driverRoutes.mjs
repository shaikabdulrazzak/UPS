import DriverBreaks from "./model/driver_breaks.mjs";
import DriverExcuse from "./model/driver_excuse.mjs";
import DriverOvertimeRequest from "./model/driver_overtime_request.mjs";
import { authenticateAPIPublicRequest } from "../../../middleware/middleware.mjs";
import * as Constants from "../../../config/global_constant.mjs";
import { sendApiResponse } from "../../../utils/index.mjs";

/**
 * Configure customer address routes
 * @param {Object} router - Express router instance
 * @param {Object} options - Configuration options
 * @param {Object} options.db - Database connection instance
 */
export default function configure(router, { db }) {
    const modulePath = Constants.FRONT_END_NAME+'api/captain';
    const driverBreaksModule   =  new DriverBreaks(db);
    const driverExcuseModule   =  new DriverExcuse(db);
    const driverOvertimeRequestModule   =  new DriverOvertimeRequest(db);

    router.post(modulePath + "/breaks", authenticateAPIPublicRequest, async (req, res, next) => {
        let apiResponse = await driverBreaksModule.getBreaks(req, res, next);
        sendApiResponse(req, res, next, apiResponse);
    });

    router.post(modulePath + "/update-breaks", authenticateAPIPublicRequest, async (req, res, next) => {
        let apiResponse = await driverBreaksModule.updateDriverBreaks(req, res, next);
        sendApiResponse(req, res, next, apiResponse);
    });    

    router.post(modulePath + "/shifts", authenticateAPIPublicRequest, async (req, res, next) => {
        let apiResponse = await driverBreaksModule.getInOutShifts(req, res, next);
        sendApiResponse(req, res, next, apiResponse);
    });

    router.post(modulePath + "/update-shift-in-out", authenticateAPIPublicRequest, async (req, res, next) => {
        let apiResponse = await driverBreaksModule.updateInOutShifts(req, res, next);
        console.log('apiResponse ---------- ',apiResponse);
        sendApiResponse(req, res, next, apiResponse);
    });

    router.post(modulePath + "/add-service", authenticateAPIPublicRequest, async (req, res, next) => {
        let apiResponse = await driverBreaksModule.driverService(req, res, next);
        sendApiResponse(req, res, next, apiResponse);
    });

    router.post(modulePath + "/add-fueling", authenticateAPIPublicRequest, async (req, res, next) => {
        let apiResponse = await driverBreaksModule.driverFueling(req, res, next);
        sendApiResponse(req, res, next, apiResponse);
    });

    router.post(modulePath + "/excuses", authenticateAPIPublicRequest, async (req, res, next) => {
        let apiResponse = await driverExcuseModule.getDriverExcuses(req, res, next);
        sendApiResponse(req, res, next, apiResponse);
    });

    router.post(modulePath + "/add-excuse", authenticateAPIPublicRequest, async (req, res, next) => {
        let apiResponse = await driverExcuseModule.postDriverExcuse(req, res, next);
        sendApiResponse(req, res, next, apiResponse);
    });

    router.post(modulePath + "/overtime-requests", authenticateAPIPublicRequest, async (req, res, next) => {
        let apiResponse = await driverOvertimeRequestModule.getOvertimeRequestList(req, res, next);
        sendApiResponse(req, res, next, apiResponse);
    });    
}