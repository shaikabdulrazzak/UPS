import { Router } from 'express';

export default async function getAPIRouter({ db}) {
    const router = Router();

    // List all your admin modules here (folder names)
    const adminModules = [
        "customerAddressRoutes",
        "driverRoutes",
    ];

    try {
        // Dynamically import and initialize each module's routes
        for (const key of adminModules) {
            const tmpRoutes = await import(`./${key}.mjs`);
            tmpRoutes.default(router, { db });
        }    
    } catch (error) {
        console.log("error ===>", error);
    }

    return router;
}