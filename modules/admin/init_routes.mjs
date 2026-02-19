import { Router } from 'express';
import * as Constants from "../../config/global_constant.mjs";

export default async function getAdminRouter({ db, checkLoggedInAdmin, isLoggedIn }) {
    const router = Router();

    // List all your admin modules here (folder names)
    const adminModules = [
        "users",
        "admin_modules",
        "admin_permissions",
        "admin_role",
        "area_blocks",
        "areas",
        "assignment_slabs",
        "attribute_management",
        "attributes",
        "branch_offer_link",
        "cancel_reason",
        "captain_assigned",
        "category",
        "cities",
        "cms",
        "contact",
        "corporate_tie_ups",
        "cuisine_priorities",
        "cuisines",
        "driver_breaks",
        "driver_excuses",
        "driver_in_out_shifts",
        "driver_leave_management",
        "email_actions",
        "fleet_area_assignment",
        "fleet_zone_assignment",
        "hubs",
        "leave_management",
        "master",
        "shift_setup",
        "team_breaks",
        "task_assignment",
        "overtime_request",
        "overtime_captain_request",
        "driver_shifts",
        "settings",
        "user_management",
        "payment_transaction",
        "ticket_management",
        "zones",
        "voc_management",
        "add_in_wallet",
        "survey_management",
        "notification_type",
        "notifications",
        "faq",
        "email_template",
        "email_logs",
        "hub_activity_history",
        "text_setting",
        "place_order",
        'orders',
        'offer_management',
        'push_notifications',
        'order_tracking',
        'captain_tracking',
        'restaurants',
        'restaurant_enquiries',
        'import_managers',
        'super_packages',
        'system_logs',
        'screen_visit_logs',
        'slider_management',
        'pn_logs',
        'manage_vehicles',
        'order_assignment',
        'restaurant_cuisine',
        'avaya_reports',
        'sales_reports',
        'quality_category',
        'quality_category1',

        // Reports Modules
        'report/abandonedCart',
        'report/agentPerformance',
        'report/manualWalletRefund',
        'report/payment',
        'report/orderCount',
        'report/customer',
        'report'
    ];

    try {
        // Dynamically import and initialize each module's routes
        for (const key of adminModules) {
            const tmpRoutes = await import(Constants.WEBSITE_ADMIN_MODULES_PATH + `${key}/routes.mjs`);
            tmpRoutes.default(router, { db, checkLoggedInAdmin, isLoggedIn });
        }    
    } catch (error) {
        console.log("error ===>", error);
    }
    

    // 404 handler for all unmatched admin routes
    router.use((req, res) => {
        let layout404 = Constants.WEBSITE_ADMIN_LAYOUT_PATH + "404";
        if (res.locals.auth && res.locals.auth._id) {
            layout404 = Constants.WEBSITE_ADMIN_LAYOUT_PATH + "default";
        }
        req.rendering.views = Constants.WEBSITE_ADMIN_MODULES_PATH + "elements/";
        req.rendering.layout = layout404;
        res.render("404");
    });

    return router;
}