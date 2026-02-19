import { Router } from 'express';
import * as Constants from "../../config/global_constant.mjs";

export default async function getRestaurantRouter({ db, isLoggedIn, csrfRouteMiddleware, checkLoggedIn }) {
    const router = Router();

    // List all restaurant modules here (folder names)
    const restaurantModules = [
        "users",
        "cuisine_priorities",
        "import_managers",
        "cuisines",
        "notifications",
        "restaurants",
        "ticket_management",
        "user_permissions",
        "reports",
        "orders"
    ];

    try {
        // Dynamically import and initialize each module's routes
        for (const key of restaurantModules) {
            const tmpRoutes = await import(Constants.WEBSITE_MODULES_PATH + `${key}/routes.mjs`);
            tmpRoutes.default(router, { db, isLoggedIn, csrfRouteMiddleware, checkLoggedIn });
        }    
    } catch (error) {
        console.log("error ===>", error);
    }
    

    // 404 handler for all unmatched restaurant routes
    router.use((req, res) => {
        let layout404 = Constants.WEBSITE_LAYOUT_PATH + "404";
        if (res.locals.auth && res.locals.auth._id) {
            layout404 = Constants.WEBSITE_LAYOUT_PATH + "default";
        }
        req.rendering.views = Constants.WEBSITE_MODULES_PATH + "elements/";
        req.rendering.layout = layout404;
        res.render("404");
    });

    return router;
}