
import assignmentSlab from "./model/branch_assignment_slab.mjs";

/**
 * Configure branch assignment slab routes
 * @param {Object} router - Express router instance
 * @param {Object} options - Configuration options
 * @param {Object} options.db - Database connection instance
 * @param {Function} options.checkLoggedInAdmin - Middleware to check admin authentication
 */
export default function configure(router, { db, checkRestaurantLoggedIn }) {
    const modulePath =   "/:slug/branches";
    const assignmentSlabModule = new assignmentSlab(db);

    /** Routing is used to add branch slabs audit **/
	router.all(modulePath+"/assignment_slabs_audit/:id",checkRestaurantLoggedIn,(req, res, next) => {
		assignmentSlabModule.getAssignmentSlabsAudit(req,res,next);
	});

    /** Routing is used to add branch assignment **/
	router.all(modulePath+"/assignment/:id",checkRestaurantLoggedIn,(req, res, next) => {
		assignmentSlabModule.addBranchAssignment(req,res,next);
	});
} 