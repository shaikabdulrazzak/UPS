import { fileURLToPath } from 'url';
import { dirname } from 'path';
import restaurants from "./model/restaurants.mjs";
// import pendingBranchModel from "../../common_modules/restaurant_pending_branches/model/pending_branches.mjs";
import { addPermissionValidation, paymentSettingsValidation } from "./validations.mjs";
import { validateRequest } from "../../../utils/index.mjs";
import {eachOfSeries} from "async";
import * as Constants from "../../../config/global_constant.mjs";
import BREADCRUMBS from '../../../breadcrumbs.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Configure restaurants routes
 * @param {Object} router - Express router instance
 * @param {Object} options - Configuration options
 * @param {Object} options.db - Database connection instance
 * @param {Function} options.checkLoggedInAdmin - Middleware to check admin authentication
 */
export default function configure(router, { db, checkLoggedInAdmin }) {
    const restPendingBranchModulePath = '/restaurant_pending_branches';
    const restItemModulePath = '/restaurant_item';
    const restCatModulePath = '/restaurant_category';
    const restMenuModulePath = '/restaurant_menu';
    const restModulePath    = '/restaurants'; 
    const restaurantsModule = new restaurants(db);
    // const pendingBranchModule = new pendingBranchModel(db);

    // Set views for all /restaurants* routes
    router.use([restModulePath, restCatModulePath, restMenuModulePath, restItemModulePath, restPendingBranchModulePath], (req, res, next) => {
        req.rendering.views = __dirname + "/views";

        /** Set query in local variable */
        let finalQuery = (req._parsedUrl && req._parsedUrl.search) ? req._parsedUrl.search : "";
        res.locals.finalQuery = finalQuery;
        next();
    });

    /** Routing is used to get restarurant pending categories **/
    router.get(restCatModulePath,checkLoggedInAdmin,(req,res,next) => {
        let paramQuery 	=	req?.query || "";
        let finalQuery	=	"";
        if(paramQuery && Object.keys(paramQuery).length > 0){
            Object.keys(paramQuery).map(key=>{
                if(!finalQuery) finalQuery = "?";
                finalQuery += "&"+key+"="+paramQuery[key];
            });
        }

        req.breadcrumbs(BREADCRUMBS['admin/restaurants/pending_category']);
        res.render("restaurant_list",{
            link: Constants.WEBSITE_RESTAURANT_URL+"pending_category"+finalQuery
        });
    });

    /** Routing is used to get restarurant pending menus **/
    router.get(restMenuModulePath,checkLoggedInAdmin,(req,res,next) => {
        let paramQuery 	=	req?.query || "";
        let finalQuery	=	"";
        if(paramQuery && Object.keys(paramQuery).length > 0){
            Object.keys(paramQuery).map(key=>{
                if(!finalQuery) finalQuery = "?";
                finalQuery += "&"+key+"="+paramQuery[key];
            });
        }

        req.breadcrumbs(BREADCRUMBS['admin/restaurants/pending_menu']);
        res.render("restaurant_list",{
            link: Constants.WEBSITE_RESTAURANT_URL+"pending_menu"+finalQuery
        });
    });

    /** Routing is used to get restarurant pending items **/
    router.get(restItemModulePath,checkLoggedInAdmin,(req,res,next) => {
        let paramQuery 	=	req?.query || "";
        let finalQuery	=	"";
        if(paramQuery && Object.keys(paramQuery).length > 0){
            Object.keys(paramQuery).map(key=>{
                if(!finalQuery) finalQuery = "?";
                finalQuery += "&"+key+"="+paramQuery[key];
            });
        }

        req.breadcrumbs(BREADCRUMBS['admin/restaurants/pending_item']);
        res.render("restaurant_list",{
            link: Constants.WEBSITE_RESTAURANT_URL+"pending_item"+finalQuery
        });
    });

    /** Routing is used to get restarurant list **/
    router.get(restModulePath+"/:slug/send_credentials",checkLoggedInAdmin,(req,res,next) => {
        restaurantsModule.sendLoginCredentials(req,res,next);
    });

    /** Routing is used to add permission **/
    router.all(restModulePath+"/:slug/add_permission",checkLoggedInAdmin,addPermissionValidation,validateRequest,(req,res,next) => {
        restaurantsModule.addPermission(req,res,next);
    });

    /** Routing is used to async with api **/
    router.all(restModulePath+"/:slug/async_with_api",checkLoggedInAdmin,(req,res,next) => {
        restaurantsModule.asyncWithApi(req,res,next);
    });

    /** Routing is used to async with api **/
    router.all(restModulePath+"/:slug/async_with_api_payment_source",checkLoggedInAdmin,(req,res,next) => {
        req.params.only_payment_source = true;
        restaurantsModule.asyncWithApi(req,res,next);
    });

    /** Routing is used to async with dhub api **/
    router.all(restModulePath+"/:slug/async_with_dhub",checkLoggedInAdmin,(req,res,next) => {
        restaurantsModule.asyncWithDhubApi(req,res,next);
    });

    /** Routing is used to add payment settings **/
    router.all(restModulePath + "/:slug/payment_settings", checkLoggedInAdmin,paymentSettingsValidation, validateRequest,(req, res, next)=>{
        restaurantsModule.paymentSettings(req, res, next);
    });   

    /** Routing is used to get restarurant list **/
    router.get(restModulePath,checkLoggedInAdmin,(req,res,next) => {
        restaurantsModule.restaurantListing(req,res,next);
    });

    /** Routing is used to get restarurant list **/
    router.get(restModulePath+"/:slug",checkLoggedInAdmin,(req,res,next) => {
        restaurantsModule.restaurantListing(req,res,next);
    });

    /** Routing is used to get restarurant list **/
    router.get(restModulePath+"/:slug/:type",checkLoggedInAdmin,(req,res,next) => {
        restaurantsModule.restaurantListing(req,res,next);
    });

    /** Routing is used to get restarurant list **/
    router.get(restModulePath+"/:slug/:type/:id",checkLoggedInAdmin,(req,res,next) => {
        restaurantsModule.restaurantListing(req,res,next);
    });

    /** Routing is used to get pending restaurant branch list **/
    router.all(restPendingBranchModulePath,checkLoggedInAdmin,(req, res,next) => {
        restaurantsModule.pendingBranchList(req, res,next);
    });

    /** Routing is used to update restaurant branch status **/
    // router.post(restPendingBranchModulePath+"/update_branch_status",checkLoggedInAdmin,(req, res,next) => {
    //     let status 		= 	(req.body.status)		?	req.body.status					:"";
    //     let branchIds	=	(req.body.branch_ids)	?	req.body.branch_ids.split(",")	:"";

    //     /** Send error response */
    //     if(!status || !branchIds) return res.send({ status: Constants.STATUS_ERROR, message : res.__("system.invalid_access") });

    //     /**
    //      * function name is variable that holds a function accorindg to status
    //      * if Status is In Review markBranchInReview function called
    //      * if Status is Approved approveBranchPendingRequest function called
    //      * if Status is reject then rejectBranchRequest function called
    //      */
    //     let functionName = (status == Constants.IN_REVIEW) ?  markBranchInReview :((status == Constants.APPROVED) ? approveBranchPendingRequest :rejectBranchRequest);

    //     eachOfSeries(branchIds,(branchId, key, seriesCallback)=>{
    //         req.params.id 		= 	branchId;
    //         req.body.branch_id	=	branchId;
    //         pendingBranchModule[functionName](req,res,next).then(response=>{
    //             if(response.status != Constants.STATUS_SUCCESS) return seriesCallback(response.message);

    //             seriesCallback(null);
    //         }).catch(next);
    //     },eachErr=>{
    //         if(eachErr) return res.send({status: Constants.STATUS_ERROR, message: eachErr});

    //         /** Send success response */
    //         let message = (status == Constants.IN_REVIEW) ?  res.__("admin.restaurant_pending_branches.status_has_been_updated_successfully") :((status == Constants.APPROVED) ? res.__("pending_branches.branch_approved_successfully") :res.__("pending_branches.restaurant_enquiry_has_been_rejected"));
    //         res.send({
    //             status	: Constants.STATUS_SUCCESS,
    //             message : message
    //         });
    //     });
    // });
} 