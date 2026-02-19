import { ObjectId } from 'mongodb';
import { parallel as asyncParallel, eachOfSeries } from 'async';
import * as Constants from "../../../../config/global_constant.mjs";
import Tables from '../../../../config/database_tables.mjs';
import { isPost, getRestaurantId, sanitizeData, getUtcDate} from "../../../../utils/index.mjs";
import { saveUserActivity } from "../../../../services/index.mjs";

export default class AssignmentSlabs {

    constructor(db) {
        this.db = db;
    }

    /**
	 * Function to add assignment slab
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 *
	 * @return render/json
	 */
	async addPendingBranchAssignment (req,res,next){
        try{
            let slug 		=	req?.params?.slug || "";
            let branchId	=	req?.params?.id || "";

            if(isPost(req)){
                req.body 			= 	sanitizeData(req.body, Constants.NOT_ALLOWED_TAGS_XSS);
                let slabData		=	req?.body?.slab_data || "";
                let bikeMaxDistance	=	res?.locals?.settings?.["Order_Assignment.bike_max_distance"] || 0;
                let carMaxDistance	=	res?.locals?.settings?.["Order_Assignment.car_max_distance"] || 0;
                let authUserId 		=	req?.session?.user?._id || "";
                let errors 			= 	[];
                let isFound			=	false;
                let dataToBeSaved	=	[];
                let uniqueSlab		=	{};
                if(slabData?.length > 0) {
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
                        if(data.min_distance && data.max_distance && errors?.length == 0){
                            dataToBeSaved.push({
                                min_distance	:	data.min_distance,
                                max_distance	:	data.max_distance,
                                order			:	data.order,
                                assignment_id   :   data.assignment_id
                            });
                        }
                    });
                }
                if(!isFound) errors.push({'param':'slab_data_0_min_distance','msg':res.__("pending_branch_assignment.assignment_slabs.enter_atleast_one")});

                /** Send error response */
                if(errors?.length > 0) return res.send({status: Constants.STATUS_ERROR, message: errors});

                /** Get restaurant id **/
                let restaurantId =  await getRestaurantId(req,res,next,{slug:slug});

                let collection = this.db.collection(Tables.TMP_RESTAURANT_BRANCH_ASSIGNMENT_SLABS);
                let parentIdObject	=	{};
                asyncParallel({
                    assignment_slabs_update_details : (parentCallback)=>{
                        collection.deleteMany({branch_id : branchId}).then(()=> {

                            eachOfSeries(dataToBeSaved,(data, firstKey, childCallback)=>{
                                let assignmentId = (data?.assignment_id) ? new ObjectId(data?.assignment_id) : new ObjectId();
                                parentIdObject[String(assignmentId)] = assignmentId;
                                
                                /** Save assignment slabs details */
                                collection.updateOne({
                                    _id             :   assignmentId,
                                    branch_id	  	:	new ObjectId(branchId),
                                    restaurant_id	: 	new ObjectId(restaurantId)
                                },{
                                    $set : {
                                        min_distance	:	parseFloat(data.min_distance),
                                        max_distance	:	parseFloat(data.max_distance),
                                        order			:	parseInt(data.order),
                                        modified		:	getUtcDate()
                                    },
                                    $setOnInsert : {
                                        added_by	: new ObjectId(authUserId),
                                        created		: getUtcDate()
                                    }
                                },{upsert: true}).then(()=> {
                                    parentCallback(null);
                                }).catch(next);
                            },(childErr)=>{
                               
                                parentCallback(childErr);
                                
                                /** Save user activities **/
                                saveUserActivity(req,res,{
                                    user_id 		:	authUserId,
                                    parent_type 	:	Tables.RESTAURANT_BRANCH_ASSIGNMENT_SLABS,
                                    parent_id 		: 	Object.values(parentIdObject) || [],
                                    activity_type	:	Constants.ACTIVITY_ADD_EDIT_DETAILS,
                                    additional_details:	{
                                        restaurant_id: restaurantId, 
                                        branch_id:branchId,
                                        channel_id: req?.session?.user?.channel_id || ""
                                    },
                                });
                            });
                        });
                    },
                },(err)=>{
                    if(err) return next(err);

                    /** Send success response */
                    let message =res.__("pending_branch_assignment.assignment_slabs.slabs_has_been_updated_successfully.");
                    res.send({status: Constants.STATUS_SUCCESS, message: message });
                });
            }else{
                /** Get restaurant branch assignment slabs list */
                const restaurant_branch_assignment_slabs 	=	this.db.collection(Tables.TMP_RESTAURANT_BRANCH_ASSIGNMENT_SLABS);
                let result = await restaurant_branch_assignment_slabs.find({branch_id: new ObjectId(branchId)},{projection:{min_distance:1,max_distance:1,order:1}}).sort({order:Constants.SORT_ASC}).toArray();

                /** Render add  page */
                res.render('pending_branch_assignment',{
                    layout    : false,
                    result    : result,
                    branch_id : branchId,
                    slug      : slug
                });
            }
        }catch(err){
            next(err);
        }
	};// end addPendingBranchAssignment
}