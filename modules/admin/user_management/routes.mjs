import { fileURLToPath } from 'url';
import { dirname } from 'path';
import UserManagement from "./model/user_management.mjs";
import DriverManagement from "./model/driver_management.mjs";
import ManageVehicle from "./model/manage_vehicle.mjs";
import { addEditDriverValidation, addEditCustomerValidation, addEditVehicleValidation, addWalletAmountValidation, assignVehicleValidation, assignCategoryToCustomerValidation } from "./validations.mjs";
import { validateRequest } from "../../../utils/index.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Configure user management routes
 * @param {Object} router - Express router instance
 * @param {Object} options - Configuration options
 * @param {Object} options.db - Database connection instance
 * @param {Function} options.checkLoggedInAdmin - Middleware to check admin authentication
 */
export default function configure(router, { db, checkLoggedInAdmin }) {
    const modulePath = '/user_management';
    const userManagementModule      =   new UserManagement(db);
    const driverManagementModule    =   new DriverManagement(db);
    const manageVehicleModule       =   new ManageVehicle(db);


    // Set views for all /user_management* routes
    router.use(modulePath, (req, res, next) => {
        req.rendering.views = __dirname + "/views";
        next();
    });


    /*************************** Driver management routes ********************************/

    router.all(modulePath + "/list_driver", checkLoggedInAdmin, (req, res, next) => {
        driverManagementModule.listDriver(req, res, next);
    });

    router.all(modulePath + "/add_driver", checkLoggedInAdmin, addEditDriverValidation, validateRequest, (req, res, next) => {
        driverManagementModule.addEditDriver(req, res, next);
    });

    router.all(modulePath + "/edit_driver/:id", checkLoggedInAdmin, addEditDriverValidation, validateRequest, (req, res, next) => {
        driverManagementModule.addEditDriver(req, res, next);
    });

    router.all(modulePath + "/delete_driver/:id", checkLoggedInAdmin, (req, res, next) => {
        driverManagementModule.deleteDriver(req, res, next);
    });

    router.get(modulePath + "/view_driver/:id", checkLoggedInAdmin, (req, res, next) => {
        driverManagementModule.viewDriverDetails(req, res, next);
    });

    router.all(modulePath + "/update-driver-status/:id/:status", checkLoggedInAdmin, (req, res, next) => {
        driverManagementModule.updateDriverStatus(req, res, next);
    });

    router.post(modulePath + "/driver_locations/:id", checkLoggedInAdmin, (req, res, next) => {
        driverManagementModule.driverLocationList(req, res, next);
    });

    router.post(modulePath + "/update-multiple-driver-details", checkLoggedInAdmin, (req, res, next) => {
        driverManagementModule.updateMultipleDriverDetails(req, res, next);
    });    

    /************************************************ Driver Vehicle management routes *******************************************************/
    
    router.all(modulePath + "/manage_vehicle/:driver_id", checkLoggedInAdmin, (req, res, next) => {
        manageVehicleModule.getManageVehicleList(req, res, next);
    });

    router.all(modulePath + "/manage_vehicle/:driver_id/add_vehicle", checkLoggedInAdmin, addEditVehicleValidation, validateRequest, (req, res, next) => {
        manageVehicleModule.addEditVehicle(req, res, next);
    });

    router.all(modulePath + "/manage_vehicle/:driver_id/edit_vehicle/:id", checkLoggedInAdmin, addEditVehicleValidation, validateRequest, (req, res, next) => {
        manageVehicleModule.addEditVehicle(req, res, next);
    });

    router.all(modulePath + "/manage_vehicle/:driver_id/assign_vehicle", checkLoggedInAdmin, assignVehicleValidation, validateRequest, (req, res, next) => {
        manageVehicleModule.assignVehicleToDriver(req, res, next);
    });

    router.all(modulePath + "/manage_vehicle/:driver_id/export_data/:export_count/:export_type", checkLoggedInAdmin, (req, res, next) => {
        manageVehicleModule.exportData(req, res, next);
    });


    /************************************************ Customer management routes *******************************************************/

    router.all(modulePath + "/list_customer", checkLoggedInAdmin, (req, res, next) => {
        userManagementModule.listCustomer(req, res, next);
    });

    router.get(modulePath + "/load_map", checkLoggedInAdmin, (req, res, next) => {
        userManagementModule.loadMap(req, res, next);
    });
    
    router.all(modulePath + "/reclaim/:id", checkLoggedInAdmin, (req, res, next) => {
        userManagementModule.reclaim(req, res, next);
    });

    router.all(modulePath + "/add_customer", checkLoggedInAdmin, addEditCustomerValidation, validateRequest, (req, res, next) => {
        userManagementModule.addEditCustomer(req, res, next);
    });

    router.all(modulePath + "/edit_customer/:id", checkLoggedInAdmin, addEditCustomerValidation, validateRequest, (req, res, next) => {
        userManagementModule.addEditCustomer(req, res, next);
    });

    router.all(modulePath + "/delete_customer/:id", checkLoggedInAdmin, (req, res, next) => {
        userManagementModule.deleteCustomer(req, res, next);
    });

    router.all(modulePath + "/assign_category/:id", checkLoggedInAdmin, assignCategoryToCustomerValidation, validateRequest, (req, res, next) => {
        userManagementModule.assignCategoryToCustomer(req, res, next);
    });

    router.get(modulePath + "/view_customer/:id", checkLoggedInAdmin, (req, res, next) => {
        userManagementModule.viewCustomerDetails(req, res, next);
    });

    router.get(modulePath + "/view_customer/:id/:type", checkLoggedInAdmin, (req, res, next) => {
        userManagementModule.viewCustomerDetails(req, res, next);
    });

    router.get(modulePath + "/view_address/:id/:user_id", checkLoggedInAdmin, (req, res, next) => {
        userManagementModule.viewAddressDetails(req, res, next);
    });

    router.all(modulePath + "/customer_order_list/:id", checkLoggedInAdmin, (req, res, next) => {
        userManagementModule.getCustomerOrderList(req, res, next);
    });

    router.all(modulePath + "/customer_address_list/:id", checkLoggedInAdmin, (req, res, next) => {
        userManagementModule.getCustomerAddressList(req, res, next);
    });

    router.post(modulePath + "/customer_verification_process/:id", checkLoggedInAdmin, (req, res, next) => {
        userManagementModule.verifyCustomer(req, res, next);
    });

    router.all(modulePath + "/customer_package_list/:id", checkLoggedInAdmin, (req, res, next) => {
        userManagementModule.getPackagesList(req, res, next);
    });

    router.all(modulePath + "/refund_detail/:id", checkLoggedInAdmin, (req, res, next) => {
        userManagementModule.getRefundList(req, res, next);
    });

    router.all(modulePath + "/update-customer-status/:id/:status", checkLoggedInAdmin, (req, res, next) => {
        userManagementModule.updateCustomerStatus(req, res, next);
    });   

    router.get(modulePath + "/update-customer-black-list/:id/:status", checkLoggedInAdmin, (req, res, next) => {
        userManagementModule.updateBlackListStatus(req, res, next);
    });

    router.all(modulePath + "/customer_account_list/:id", checkLoggedInAdmin, (req, res, next) => {
        userManagementModule.getCustomerAccountList(req, res, next);
    });

    router.get(modulePath + "/customer_wallet_details/:id", checkLoggedInAdmin, (req, res, next) => {
        userManagementModule.customerWalletDetails(req, res, next);
    });

    router.all(modulePath + "/add_wallet_amount/:id", checkLoggedInAdmin, addWalletAmountValidation, validateRequest, (req, res, next) => {
        userManagementModule.addWalletAmount(req, res, next);
    });

    router.all(modulePath + "/customer_wallet_transaction_list/:id", checkLoggedInAdmin, (req, res, next) => {
        userManagementModule.getCustomerWalletTransactionAndRewardPointsList(req, res, next);
    });

    router.all(modulePath + "/customer_verification_list/:id", checkLoggedInAdmin, (req, res, next) => {
        userManagementModule.getCustomerVerificationList(req, res, next);
    });

    router.all(modulePath + "/customer_reward_points_list/:id/:type", checkLoggedInAdmin, (req, res, next) => {
        userManagementModule.getCustomerWalletTransactionAndRewardPointsList(req, res, next);
    });

    router.all(modulePath + "/add_address/:user_id", checkLoggedInAdmin,  (req, res, next) => {
        userManagementModule.addEditCustomerAddress(req, res, next);
    });

    router.all(modulePath + "/add_address/:user_id/:id", checkLoggedInAdmin,(req, res, next) => {
        userManagementModule.addEditCustomerAddress(req, res, next);
    });

    router.post(modulePath + "/get_block_list", checkLoggedInAdmin, (req, res, next) => {
        userManagementModule.getBlockList(req, res, next);
    });

    router.post(modulePath + "/get_area_list", checkLoggedInAdmin, (req, res, next) => {
        userManagementModule.getAreaList(req, res, next);
    });

    router.get(modulePath + "/pay_outstanding/:id", checkLoggedInAdmin, (req, res, next) => {
        userManagementModule.payOutstanding(req, res, next);
    });    
} 