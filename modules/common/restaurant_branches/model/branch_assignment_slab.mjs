import { ObjectId } from 'mongodb';
import { parallel as asyncParallel, eachOfSeries } from 'async';
import * as Constants from "../../../../config/global_constant.mjs";
import Tables from '../../../../config/database_tables.mjs';
import { isPost, getRestaurantId, configDatatable, sanitizeData, isAdmin, getUtcDate, copyFromParentTable} from "../../../../utils/index.mjs";
import { saveUserActivity, restaurantAssignmentLogs } from "../../../../services/index.mjs";
import BREADCRUMBS from '../../../../breadcrumbs.mjs';

export default class AssignmentSlabs {

    constructor(db) {
        this.db = db;
    }

    /**
     * Function to get assignment slab audit list
     *
     * @param req 	As Request Data
     * @param res 	As Response Data
     *
     * @return render/json
     */
    async getAssignmentSlabsAudit (req,res,next){
        let slug 	     =	req.params.slug;
        let branchId	 =	req.params.id;
        let authRoleId	 =	(req.session.user.user_role_id)	? req.session.user.user_role_id :"";

        if(isPost(req)){
            let limit    = (req.body.length) ? parseInt(req.body.length) : Constants.ADMIN_LISTING_LIMIT;
            let skip     = (req.body.start)  ? parseInt(req.body.start)  : Constants.DEFAULT_SKIP;
            const collection = this.db.collection(Tables.RESTAURANT_BRANCH_ASSIGNMENT_SLABS_LOGS);
        
            /** Get restaurant id **/
            let restaurantId = await getRestaurantId(req,res,next,{slug:slug});
            
            let commonConditions = {
                branch_id	   : new ObjectId(branchId),
                restaurant_id  : new ObjectId(restaurantId)
            }

            /** Configure Datatable conditions*/
            const dataTableConfig = await configDatatable(req, res, null);

            dataTableConfig.conditions = Object.assign(dataTableConfig.conditions, commonConditions);

            // Get list or count of assignment slabs logs 
            let dbRes = await collection.aggregate([
                { $match: dataTableConfig.conditions },
                {$facet : {
                    list : [
                        {$sort: dataTableConfig.sort_conditions },
                        {$skip: skip },
                        {$limit: limit },
                        {$lookup: {	/** Get user details **/
                            "from" 		  :	Tables.USERS,
                            "localField"  :	"user_id",
                            "foreignField":	"_id",
                            "as" 		  :	"user_details"
                        }},
                        {$lookup: {	/** Get restaurant details **/
                            "from" 		  :	Tables.RESTAURANTS,
                            "localField"  :	"restaurant_id",
                            "foreignField":	"_id",
                            "as" 		  :	"restaurant_details"
                        }},
                        {$project : {
                            _id: 1,restaurant_id:1,user_id:1,slabs:1, created:1,
                            user_name: {$arrayElemAt: ["$user_details.full_name",0]}, 
                            restaurant_name: {$arrayElemAt: ["$restaurant_details.name."+Constants.DEFAULT_LANGUAGE_CODE ,0]},
                        }}
                    ],
                    count: [
                        {$count: "count"},
                    ],
                }}
            ]).toArray();

            /** Send response **/
            res.send({
                status: Constants.STATUS_SUCCESS,
                draw: dataTableConfig.result_draw,
                data			:   dbRes?.[0]?.list ||[],
                recordsTotal	:	dbRes?.[0]?.count?.[0]?.count || 0,
                recordsFiltered	:  	dbRes?.[0]?.count?.[0]?.count || 0,
            });        
        }else{
            res.render('branch_assignment_slab',{
                layout	      : false,
                branch_id     : branchId,
                user_role_id  : authRoleId,
            });
        }
    }// end getAssignmentSlabsAudit

    /**
	 * Function to add assignment slab
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 *
	 * @return render/json
	 */
	async addBranchAssignment (req,res,next){
        try{
            let restSlug 	=	req.params.slug;
            let branchId	=	req.params.id;
            if(isPost(req)){
                req.body 			= 	sanitizeData(req.body, Constants.NOT_ALLOWED_TAGS_XSS);
                let bikeMaxDistance	=	res.locals.settings["Order_Assignment.bike_max_distance"];
                let carMaxDistance	=	res.locals.settings["Order_Assignment.car_max_distance"];
                let slabData		=	(req.body.slab_data) ? req.body.slab_data :"";
                let authUserId 		=	req.session.user._id;
                let errors 			= 	[];
                let isFound			=	false;
                let dataToBeSaved	=	[];
                let uniqueSlab		=	{};
    
                if(slabData && slabData.length > 0) {
                    slabData.map((data, index)=>{
                        if(!data.min_distance && data.max_distance) {
                            errors.push({'param':'slab_data'+'_'+index+'_min_distance','msg':res.__("branch_assignment.assignment_slabs.please_enter_min")});
                        } else if(data.min_distance && !Constants.VALID_FLOAT_REGEX.test(data.min_distance) || data.min_distance < 0) {
                            errors.push({'param':'slab_data'+'_'+index+'_min_distance','msg':res.__("branch_assignment.assignment_slabs.invalid_min")});
                        }
                        if(!data.max_distance && data.min_distance) {
                            errors.push({'param':'slab_data'+'_'+index+'_max_distance','msg':res.__("branch_assignment.assignment_slabs.please_enter_max")});
                        } else if(data.max_distance && (!Constants.VALID_FLOAT_REGEX.test(data.max_distance) || data.max_distance <= 0)) {
                            errors.push({'param':'slab_data'+'_'+index+'_max_distance','msg':res.__("branch_assignment.assignment_slabs.invalid_max")});
                        }
                        if(data.min_distance && data.max_distance && parseFloat(data.max_distance) <= parseFloat(data.min_distance)){
                            errors.push({'param':'slab_data'+'_'+index+'_max_distance','msg':res.__("branch_assignment.assignment_slabs.max_should_be_greater")});
                        }
                        if(data.max_distance && parseFloat(data.max_distance) > parseFloat(bikeMaxDistance) && parseFloat(data.max_distance) > parseFloat(carMaxDistance)){
                            errors.push({'param':'slab_data'+'_'+index+'_max_distance','msg':res.__("branch_assignment.assignment_slabs.max_distance_should_not_greater_order_assignment_distance")});
                        }
    
                        if(data.min_distance && data.max_distance){
                            let tmpString = data.min_distance+"_"+data.max_distance;
                            if(uniqueSlab[tmpString]){
                                errors.push({'param':'slab_data'+'_'+index+'_min_distance','msg':res.__("branch_assignment.assignment_slabs.slab_must_be_unique")});
                            }else{
                                uniqueSlab[tmpString] = true;
                            }
                        }
                        if(data.min_distance || data.max_distance) isFound	=	true;
                        if(data.min_distance && data.max_distance && errors.length == 0){
                            dataToBeSaved.push({
                                min_distance	:	data.min_distance,
                                max_distance	:	data.max_distance,
                                order			:	data.order,
                                assignment_id   :   data.assignment_id
                            });
                        }
                    });
                }

                
                if(!isFound) errors.push({'param':'slab_data_0_min_distance','msg':res.__("branch_assignment.assignment_slabs.enter_atleast_one")});
    
                /** Send error response */
                if(errors.length > 0) return res.send({status: Constants.STATUS_ERROR, message: errors});
    
                /** Get restaurant id **/
                let restaurantId =  await getRestaurantId(req,res,next,{slug:restSlug});
                
                let collection      = this.db.collection(Tables.TMP_RESTAURANT_BRANCH_ASSIGNMENT_SLABS);
                let parentIdObject	= {};
                asyncParallel({
                    restaurant_branch_assignment_slabs_logs: (callback)=>{
                        if(!isAdmin(req,res)) return callback(null,null);
                        
                        /** Save restaurant assignment logs */
                        restaurantAssignmentLogs(req,res,next, {
                            slab_data      :  slabData,
                            branch_id      :  new ObjectId(branchId),
                            restaurant_id  :  new ObjectId(restaurantId),
                            user_id        :  new ObjectId(authUserId),
                        }).then(response=>{
                            if(response.status != Constants.STATUS_SUCCESS) return  callback(response);
                            callback(null);
                        }).catch(next);
                    },
                    assignment_slabs_update_details : (parentCallback)=>{
                        /** For admin only */
                        if(isAdmin(req,res)) collection = this.db.collection(Tables.RESTAURANT_BRANCH_ASSIGNMENT_SLABS);
    
                        collection.deleteMany({branch_id : new ObjectId(branchId)}).then(()=> {
                           
                            eachOfSeries(dataToBeSaved,(data, firstKey, childCallback)=>{
                                let assignmentId = (data.assignment_id) ? new ObjectId(data.assignment_id): new ObjectId();
                                parentIdObject[String(assignmentId)] = assignmentId;
    
                                /** Save assignment slabs details */
                                collection.updateOne({
                                    _id             :   assignmentId,
                                    branch_id	  	:	new ObjectId(branchId),
                                    restaurant_id	: 	new ObjectId(restaurantId),
                                },{
                                    $set : {
                                        min_distance: parseFloat(data.min_distance),
                                        max_distance: parseFloat(data.max_distance),
                                        order		: parseInt(data.order),
                                        modified	: getUtcDate()
                                    },
                                    $setOnInsert: {
                                        added_by: new ObjectId(authUserId),
                                        created	: getUtcDate()
                                    }
                                },{upsert: true}).then(()=>{
                                    childCallback(null);
                                }).catch(next);
                            },(childErr)=>{
                                if(childErr) return parentCallback(childErr);

                                parentCallback(null);
    
                                /** Save user activities **/
                                saveUserActivity(req,res,{
                                    user_id 		  :	authUserId,
                                    parent_type 	  :	Tables.RESTAURANT_BRANCH_ASSIGNMENT_SLABS,
                                    parent_id 		  : Object.values(parentIdObject),
                                    activity_type	  :	Constants.ACTIVITY_ADD_EDIT_DETAILS,
                                    additional_details:	{
                                        restaurant_id: new ObjectId(restaurantId), 
                                        branch_id:new ObjectId( branchId), 
                                        channel_id: req.session.user.channel_id
                                    },
                                }).then(()=>{}).catch(next);
                            });                            
                        }).catch(next);
                    },
                    tmp_branch_update_details : (callback)=>{
                        if(isAdmin(req,res)) return callback(null);
    
                        /** Copy data  tmp restaurant branches to  restaurant branches collections*/
                        copyFromParentTable(req,res,next,{
                            type : "insert_in_tmp_restaurant_branches",
                            parent_table : {
                                name 			:	Tables.RESTAURANT_BRANCHES,
                                fields 			: 	{ modified: 0,_id: 0},
                                conditions 		: 	{_id: new ObjectId(branchId), restaurant_id:  new ObjectId(restaurantId)},
                                remove_original : 	false
                            },
                            child_table : {
                                name 		      : Tables.TMP_RESTAURANT_BRANCHES,
                                conditions	      :	{restaurant_id: new ObjectId(restaurantId), branch_id: new ObjectId(branchId)},
                                additional_fields : {submit_for_approval : false, for_reapproval : true, user_id : new ObjectId(authUserId), status: Constants.PENDING},
                            }
                        }).then(response=>{
                            if(response.status != Constants.STATUS_SUCCESS) return  callback(response);
                            callback(null);
                        }).catch(next);
                    },
    
                },(err)=>{
                    if(err) return next(err);

                    /** Send success response **/
                    let message = res.__("branch_assignment.assignment_slabs.slabs_has_been_updated_successfully_you_can_see_updated_details_in_pending_branches_section");
                    if(isAdmin(req,res)) message = res.__("branch_assignment.assignment_slabs.slabs_has_been_updated_successfully");
                    res.send({status: Constants.STATUS_SUCCESS, message: message, branch_id: branchId });
                });
            }else{
                /** Get restaurant branch assignment slabs list */
                let collection 	=	this.db.collection(Tables.RESTAURANT_BRANCH_ASSIGNMENT_SLABS);
                let result = await collection.find({branch_id: new ObjectId(branchId)},{projection:{min_distance:1,max_distance:1,order:1}}).sort({order:Constants.SORT_ASC}).toArray();

                /** Render add  page */
                req.breadcrumbs(BREADCRUMBS['admin/assignment_slabs/list']);
                res.render('branch_assignment',{
                    layout      : false,
                    result      : result,
                    slug	    : restSlug,
                    branch_id   : branchId
                });
            }
        }catch(err){
            next(err);
        }

	};// end addBranchAssignment
}