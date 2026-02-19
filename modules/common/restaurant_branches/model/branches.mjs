import { ObjectId } from 'mongodb';
import { parallel as asyncParallel } from 'async';
import * as Constants from "../../../../config/global_constant.mjs";
import Tables from '../../../../config/database_tables.mjs';
import { getRestaurantId, getUtcDate, isAdmin, isPost, sanitizeData, getCityList, getAreaList, getBlockList, saveRestaurantBranchLogs, configDatatable, getDropdownList, getRestaurantDetails, arrayToObject, getUniqueId} from "../../../../utils/index.mjs";
import { saveUserActivity} from "../../../../services/index.mjs";

export default class CommonBranches{
    constructor(db) {
        this.db = db;
    }

	/**
	 * Function to get branch list
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 *
	 * @return render/json
	 */
	async getBranchList(req,res,next){
		let slug     = req?.params?.slug || "";
		let cuisine  = req?.query?.cuisine || "";

		if(isPost(req)){
			let limit			= (req.body.length)	? parseInt(req.body.length) : Constants.ADMIN_LISTING_LIMIT;
			let skip			= (req.body.start)	? parseInt(req.body.start)  : Constants.DEFAULT_SKIP;
			const collection	= this.db.collection(Tables.RESTAURANT_BRANCHES);
            let cuisineBranchIds= [];

			if(cuisine){
				const restaurant_branch_cuisines = this.db.collection(Tables.RESTAURANT_BRANCH_CUISINES);
				cuisineBranchIds = await restaurant_branch_cuisines.distinct("branch_id",{cuisine_id : new ObjectId(cuisine)});
			}

			/** Set common conditions */
			let commonConditions= {restaurant_slug :slug};
			if(cuisine) commonConditions._id = {$in : cuisineBranchIds};

			/** Configure Datatable conditions*/
			const dataTableConfig = await configDatatable(req, res, null);		

			/* assign in a single object */
			dataTableConfig.conditions = Object.assign(dataTableConfig.conditions,commonConditions);

			// Get list or count of restaurant branches
			let dbRes = await collection.aggregate([
				{ $match: dataTableConfig.conditions },
				{$facet : {
					list : [
						{$sort: dataTableConfig.sort_conditions },
						{$skip: skip},
						{$limit: limit},
						{$project: {
							_id:1,name:1,address:1, branch_number:1, branch_status:1, is_active: 1,restaurant_id:1,delivery_vehicle_type:1,auto_assignment_start_after:1
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
			/** Get restaurant details */
			let restResponse = await getRestaurantDetails(req,res,next,{slug:slug});

			if(restResponse.status != Constants.STATUS_SUCCESS) return res.status(400).send(restResponse);

			let agheyaExist		=	restResponse?.result?.aghzeya_restaurant_id && true || false;
			let talabatExist	=	restResponse?.result?.talabat_restaurant_id && true || false;			
			res.render('list',{
				layout  		: false,
				slug    		: slug,
				cuisine 		: cuisine,
				aghzeya_status	: agheyaExist,
				is_admin		: isAdmin(req,res) || false,
				talabat_status	: talabatExist
			});
		}
	};//End getBranchList

	/**
	 * Function to get Branch detail
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next 	As Callback argument to the middleware function
	 *
	 * @return json
	 */
	async getBranchDetails(req,res,next){
		return new Promise(async resolve=>{
			let branchId 	= req?.params?.id || "";
			let slug		= req?.params?.slug || "";

			/** Get Branch details **/
			const restaurant_branches = this.db.collection(Tables.RESTAURANT_BRANCHES);
			let result = await restaurant_branches.findOne({
				_id     		: new ObjectId(branchId),
				restaurant_slug	: slug
			},
			{projection: {
				_id: 1, name: 1, address: 1, delivery_vehicle_type:1,auto_assignment_start_after:1, branch_number: 1, city_id: 1, area_id: 1, street: 1, block: 1, build_no: 1, description: 1, longitude: 1, latitude: 1, status: 1, is_exclude_phone_number_sync: 1, is_exclude_branch_details_sync:1,aghzeya:1
			}});

			/** Send error response */
			if(!result) return resolve({ status: Constants.STATUS_ERROR , message : res.__("system.invalid_access")});

			/** Send success response **/
			resolve({status: Constants.STATUS_SUCCESS, result: result});
		}).catch(next);
	};// End getBranchDetails

	/**
	 * Function for add or update branch details
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 * @param next 	As Callback argument to the middleware function
	 *
	 * @return render/json
	 */
	async addEditBranch(req,res,next){
		let slug  	= req?.params?.slug || "";
		let userId 	= req?.session?.user?._id || "";
		if(isPost(req)){
			/** Sanitize Data **/
			let isEditable	= 	(req.params.id)	? true 	: false;
			req.body 		= 	sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
			let branchId	= 	(req.params.id)			? 	new ObjectId(req.params.id) : new ObjectId();
			let branchNumber=	(req.body.branch_number)?	req.body.branch_number	:"";
			let deliveryVehicleType		=	(req.body.delivery_vehicle_type) 	  	?	req.body.delivery_vehicle_type			:"";
			let autoAssignmentStartAfter=	(req.body.auto_assignment_start_after) 	?	req.body.auto_assignment_start_after	:"";
			let nameEng	= (req.body.name_in_english) ? req.body.name_in_english : "";
			let nameArb	= (req.body.name_in_arabic)	 ? req.body.name_in_arabic	: "";

			asyncParallel({
				unique_branch_id : (callback)=>{
					if(branchNumber) return callback(null,branchNumber);
					if(isEditable) 	 return callback(null,null);

					/** Get branch unique id **/
					getUniqueId(req,res,next,{type:"restaurant_branches"}).then(response=>{
						if(response.status !== Constants.STATUS_SUCCESS) return callback(response);
						callback(null,response?.result || "");
					}).catch(next);
				},
				restaurant_id : (callback)=>{
					/** Get restaurant id **/
					getRestaurantId(req,res,next,{slug:slug}).then(restaurantId=>{
						callback(null,restaurantId);
					}).catch(next);
				}
			},(asyncErr,asyncResponse)=>{
				if(asyncErr) return next(asyncErr);

				if(!asyncResponse.restaurant_id){
					return res.send({status: Constants.STATUS_ERROR, message: res.__("system.something_going_wrong_please_try_again")});
				}

				let restaurantId=	asyncResponse.restaurant_id;
				let latitude	=	req.body.latitude;
				let longitude	=	req.body.longitude;

				/** Set update data */
				let updateData = {
					$set : {
						name : {
							en 	: nameEng,
							ar 	: nameArb,
						},
						city_id		: 	new ObjectId(req.body.city_id),
						area_id		: 	new ObjectId(req.body.area_id),
						block		: 	(req.body.block) 		? 	new ObjectId(req.body.block):"",
						street		: 	(req.body.street) 		?	req.body.street 		:"",
						build_no	: 	(req.body.build_no) 	? 	req.body.build_no 		:"",
						description	: 	(req.body.description) 	? 	req.body.description	:"",
						address		: 	req.body.address,
						status		: 	Constants.PENDING,
						is_active	: 	Constants.ACTIVE,
						modified 	:	getUtcDate(),
						longitude	:   parseFloat(longitude),
						latitude	:   parseFloat(latitude),
						long_lat	:   [parseFloat(longitude),parseFloat(latitude)],
						delivery_vehicle_type : (deliveryVehicleType) ? deliveryVehicleType : [],
						is_exclude_phone_number_sync	:   (req.body.exclude_phone_number) ? parseInt(req.body.exclude_phone_number)	: 0,
						is_exclude_branch_details_sync	:   (req.body.exclude_branch_details) ? parseInt(req.body.exclude_branch_details) : 0,
						auto_assignment_start_after		:   (autoAssignmentStartAfter) ? parseFloat(autoAssignmentStartAfter) : "",
					},
					$setOnInsert: {
						created 		:	getUtcDate(),
						branch_status	: 	Constants.OPEN,
						restaurant_id	: 	restaurantId,
						restaurant_slug	: 	slug,
						added_by		: 	new ObjectId(userId),
						channel_id		:	req.session.user.channel_id,
						branch_number	: 	asyncResponse?.unique_branch_id || "",
					}
				};

				let collection = this.db.collection(Tables.TMP_RESTAURANT_BRANCHES);
				let updateConditions = {branch_id: branchId};

				/** For admin only */
				if(isAdmin(req,res)){
					/** In case of adding new branch */
					if(!isEditable){
						updateData["$set"].admin_id 			= new ObjectId(userId);
						updateData["$set"].submit_for_approval 	= false;
						updateData["$set"].status 				= Constants.PENDING;
						updateData["$setOnInsert"].rating 		= 0;
					}else{
						collection = this.db.collection(Tables.RESTAURANT_BRANCHES);
						updateConditions = {_id : branchId};
					}
				}else{
					/** For Restaurant only */
					updateData["$set"]["submit_for_approval"] 	= 	false;
					updateData["$set"]["status"] 				= 	Constants.PENDING;
					updateData["$set"]["user_id"] 				=	new ObjectId(userId);
					if(isEditable) updateData["$set"]["for_reapproval"] = true;
				}

				/** save/update details */
				collection.updateOne(updateConditions,updateData,{upsert: true}).then(()=> {

					/**success response  message**/
					let message = (isEditable) ? res.__("branch.branch_has_been_updated_successfully") :res.__("branch.branch_has_been_added_successfully");
					if(!isAdmin(req,res) && isEditable){
						message = res.__("branch.branch_update_message_for_restaurant");
					}

					/* Set flash message */
					if(!isEditable) req.flash(Constants.STATUS_SUCCESS,message);
					
					/** Send success response */
					res.send({
						status		:	Constants.STATUS_SUCCESS,
						branch_id	: 	branchId,
						message		:	message,
					});

					/** Save user activities **/
					saveUserActivity(req,res,{
						user_id 		:	userId,
						parent_type 	:	Tables.RESTAURANT_BRANCHES,
						parent_id 		: 	branchId,
						activity_type	:	Constants.ACTIVITY_ADD_EDIT_DETAILS,
						additional_details:	{
							restaurant_id: new ObjectId(restaurantId), 
							is_editable : isEditable,
							channel_id	: req.session.user.channel_id
						}
					});

					if(isEditable && isAdmin(req,res)){
						/** Update area id in orders */
						const orders =	this.db.collection(Tables.ORDERS);
						orders.updateMany({branch_id: branchId},{$set : {branch_area_id: new ObjectId(req.body.area_id) }}).then(()=>{ }).catch(next);
					}

					if(!isEditable){
						/** Save logs */
						let authRoleId	= (req.session.user && req.session.user.user_role_id) ? req.session.user.user_role_id :"";
						saveRestaurantBranchLogs(req,res,next,{
							user_id 		: userId,
							user_role 		: authRoleId,
							branch_id 		: branchId,
							restaurant_id 	: restaurantId,
							action			: Constants.PENDING,
							channel_id		: req.session.user.channel_id
						});
					}
				});
			});
		}else{
			/** Get city list **/
			let cityList = await getCityList(req,res,next,null);

			/** Render add-edit page  **/
			res.render('add',{
				layout 		: 	false,
				city_list 	:	cityList,
			});
		}
	};//End addEditBranch

	/**
	 * Function for get area list
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 * @param next 	As Callback argument to the middleware function
	 *
	 * @return render/json
	 */
	async getAreaList(req,res,next){
		let cityId	= req?.body?.city_id || "";

		/** Send error response */
		if(!cityId) return res.send({ status: Constants.STATUS_ERROR, message: res.__("system.something_going_wrong_please_try_again") });

		/** Get area list */
		let response = await getAreaList(req,res,next,req.body);

		/** Send response  */
		res.send({
			status : response?.status || Constants.STATUS_SUCCESS,
			result : response,
		});
	};//End getAreaList

	/**
	 * Function for get block list
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 * @param next 	As Callback argument to the middleware function
	 *
	 * @return render/json
	 */
	async getBlockList(req,res,next){
		let areaId	= req?.body?.area_id || "";

		/** Send error response */
		if(!areaId) return res.send({ status: Constants.STATUS_ERROR, message: res.__("system.something_going_wrong_please_try_again") });

		/** Get area list */
		let response = await getBlockList(req,res,next,req.body);

		/** Send response  */
		res.send({
			status : response?.status || Constants.STATUS_SUCCESS,
			result : response,
		});
	};//End getBlockList

	/**
	 * Function for view branch detail
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 * @param next 	As Callback argument to the middleware function
	 *
	 * @return render/json
	 */
	async viewBranchDetail(req,res,next){
		let slug 		= req?.params?.slug || "";
		let branchId 	= req?.params?.id || "";

		/** Get branch details **/
		let branchResponse = await this.getBranchDetails(req, res, next);
		if(branchResponse.status != Constants.STATUS_SUCCESS) return res.status(400).send(branchResponse);

		asyncParallel({
			restaurant_details : (callback)=>{
				/** Get restaurant details **/
				getRestaurantDetails(req, res, next, {slug: slug}).then(response=>{
					if(response.status != Constants.STATUS_SUCCESS) return callback(response);
					callback(null,response.result);
				}).catch(next);
			},
			tmp_branch_details :(callback)=>{
				/** Get temp Branch details **/
				const tmp_restaurant_branches = this.db.collection(Tables.TMP_RESTAURANT_BRANCHES);
				tmp_restaurant_branches.findOne({
					branch_id 		: new ObjectId(branchId),
					restaurant_slug	: slug
				},
				{projection: {
					_id:1,submit_for_approval:1
				}}).then(tmpBranchDetails=>{
					callback(null,tmpBranchDetails);
				}).catch(next);
			},
			customized_area_count :(callback)=>{
				/**Get customized area count */
				const restaurant_branch_areas = this.db.collection(Tables.RESTAURANT_BRANCH_AREAS);
				restaurant_branch_areas.countDocuments({
					branch_id: new ObjectId(branchId),
					delivery_vehicle_type: {$exists :true,$ne: []}
				}).then(result=>{
					callback(null,result);
				}).catch(next);
			}
		},(err,asyncResponse)=>{
			if(err) return next(err);

			/** Render view page **/
			res.render('view',{
				layout				: false,
				slug				: slug,
				branch_details		: branchResponse?.result || {},
				restaurant_details	: asyncResponse?.restaurant_details || {},
				tmp_branch_details	: asyncResponse?.tmp_branch_details || {},
				customized_area_count : asyncResponse?.customized_area_count || 0
			});
		});
	};//End viewBranchDetail()

	/**
	 * Function for view branch detail form
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 * @param next 	As Callback argument to the middleware function
	 *
	 * @return render/json
	 */
	async branchDetailForm(req,res,next){
		let slug = req?.params?.slug || "";

		/** Get Branch details **/
		let branchResponse  =	await this.getBranchDetails(req, res, next);
		if(branchResponse.status != Constants.STATUS_SUCCESS) return res.status(400).send(branchResponse);

		/** Get city list **/
		let cityId = (branchResponse?.result?.city_id) ?	branchResponse.result.city_id	:"";
		let cityList = await getCityList(req,res,next,{city_id: cityId});

		/** Render add-edit page **/
		res.render('branch_detail',{
			layout		: false,
			result		: branchResponse?.result || {},
			city_list	: cityList,
			slug        : slug
		});
	};//End branchDetailForm

	/**
	 * Function for update branch status
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 * @param next 	As Callback argument to the middleware function
	 *
	 * @return void
	 */
	async updateBranchStatus(req,res,next){
		let status	 	= 	req?.body?.status || 0;
		let branchIds	=	req?.body?.branch_ids?.split(",") || [];

		/** Send error response **/
		if(branchIds.length < 1 || !status) return res.send({ status: Constants.STATUS_ERROR, message: res.__("system.something_going_wrong_please_try_again") });

		/** Convert into object ids */
		branchIds = arrayToObject(branchIds);

		/** Set update data */
		let updateData = {modified: getUtcDate()};

		if(status == Constants.BRANCH_ACTIVE || status == Constants.BRANCH_DEACTIVE){
			updateData.is_active = (status == Constants.BRANCH_ACTIVE) 	?	Constants.ACTIVE 	:Constants.DEACTIVE;
		}
		if(status == Constants.BRANCH_BUSY || status == Constants.BRANCH_OPEN){
			updateData.branch_status = (status == Constants.BRANCH_OPEN) ? 	Constants.OPEN 	:Constants.BUSY;
		}

		/** Update branch status */
		const restaurant_branches = this.db.collection(Tables.RESTAURANT_BRANCHES);
		await restaurant_branches.updateMany({ _id: {$in: branchIds} }, {$set: updateData});

		/* success response*/
		res.send({
			status : Constants.STATUS_SUCCESS,
			message: res.__("branch.branch_status_has_been_updated_successfully"),
		});

		if(status == Constants.BRANCH_BUSY || status == Constants.BRANCH_OPEN){
			branchIds.forEach(async bid=>{
				await this.saveBranchBusyStatusLogs(req,res,next,{status: status, branch_id: bid});
			});
		}

		/** Save user activities **/
		let additionalDetails = {channel_id	: req?.session?.user?.channel_id || ""};
		if(status == Constants.BRANCH_ACTIVE || status == Constants.BRANCH_DEACTIVE){
			additionalDetails.is_active = (status == Constants.BRANCH_ACTIVE) ? Constants.ACTIVE : Constants.DEACTIVE;	
		}
		if(status == Constants.BRANCH_BUSY || status == Constants.BRANCH_OPEN){
			additionalDetails.branch_status = (status == Constants.BRANCH_OPEN) ? Constants.OPEN : Constants.BUSY;
		}
		saveUserActivity(req,res,{
			user_id 		:	req?.session?.user?._id || "",
			parent_type 	:	Tables.RESTAURANT_BRANCHES,
			parent_id 		: 	branchIds,
			activity_type	:	Constants.ACTIVITY_UPDATE_STATUS,
			additional_details: additionalDetails,
		});
	};//End updateBranchStatus

	/**
	* Function for branch transfer
	*
	* @param req 	As Request Data
	* @param res 	As Response Data
	* @param next 	As Callback argument to the middleware function
	*
	* @return null
	*/
	async transferBranch(req, res, next){
		let restaurantSlug	= req?.params?.slug || "";
		let branchId	= req?.params?.branch_id || "";

		const restaurant_branch_transfers	=	this.db.collection(Tables.RESTAURANT_BRANCH_TRANSFERS);
		if(isPost(req)){
			/** Sanitize Data **/
			req.body = sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
			let fromTime	= req?.body?.calendar_from || "";
			let toTime 		= req?.body?.calendar_to || "";

			/** Set updateable data */
			let updateAbleData = {
				transfer_to  	:	new ObjectId(req.body.branch_id),
				date_from		:	getUtcDate(fromTime),
				date_to			:	getUtcDate(toTime),
			};

			restaurant_branch_transfers.updateOne({
				transfer_from : new ObjectId(branchId)
			},{
				$set : updateAbleData
			},{upsert: true}).then(()=> {

				/** Send success response **/
				let message = res.__("restaurants.branch_has_been_transferred_successfully");
				req.flash(Constants.STATUS_SUCCESS,message);
				res.send({status: Constants.STATUS_SUCCESS, message: message});
			}).catch(next);
		}else{
			let result = await restaurant_branch_transfers.findOne({transfer_from : new ObjectId(branchId)},{projection: {transfer_to:1,date_from:1,date_to:1}});

			let transferTo	=	result?.transfer_to || '';
			let calendarFrom=	result?.date_from || '';
			let calendarTo	=	result?.date_to || '';

			/**Get dropdown list **/
			let dropDownResponse = await getDropdownList(req,res, next,{
				collections :[
					{
						collection : Tables.RESTAURANT_BRANCHES,
						columns    : ["_id",["name",Constants.DEFAULT_LANGUAGE_CODE]],
						conditions : {
							is_active	  	: Constants.ACTIVE,
							restaurant_slug : restaurantSlug,
							_id				: {$ne : new ObjectId(branchId)}
						},
						selected : [transferTo]
					}
				],
			});

			/** Send error response **/
			if(dropDownResponse?.status != Constants.STATUS_SUCCESS)  return res.status(400).send(dropDownResponse);

			res.render('branch_transfer',{
				layout			:	false,
				branch_list		:	dropDownResponse?.final_html_data?.[0] || [],
				branch_id		:	branchId,
				from			: 	calendarFrom,
				to				: 	calendarTo
			});
		}
	};//End transferBranch

	async saveBranchBusyStatusLogs(req,res,next,options){
		return new Promise(resolve=>{
			let branchId		= (options.branch_id)   ? new ObjectId(options.branch_id) : "";
			let branchStatus	= (options.status == Constants.BRANCH_BUSY)	? Constants.BRANCH_BUSY	: Constants.BRANCH_OPEN;

			let dataToBeUpdate =  {
				status		: 	parseInt(branchStatus),
				modified	:	getUtcDate(),
			};

			if(branchStatus == Constants.BRANCH_BUSY){
				dataToBeUpdate.busy_status_time = getUtcDate();
			}
			if(branchStatus == Constants.BRANCH_OPEN){
				dataToBeUpdate.available_time = getUtcDate();
			}

			const restaurant_branches = this.db.collection(Tables.RESTAURANT_BRANCHES);
			restaurant_branches.findOne({_id : new ObjectId(branchId)},{projection:{restaurant_id : 1}}).then(result=>{

				let restaurantId = new ObjectId(result.restaurant_id);

				const branch_busy_status_logs = this.db.collection(Tables.BRANCH_BUSY_STATUS_LOGS);
				branch_busy_status_logs.updateOne({
					branch_id 	: branchId,
					status		: Constants.BRANCH_BUSY
				},
				{
					$set :	dataToBeUpdate,
					$setOnInsert: {
						restaurant_id : restaurantId,
						created	: getUtcDate(),
					}
				},{upsert : true}).then(()=>{

					/** Send success response **/
					resolve({status: Constants.STATUS_SUCCESS});
				}).catch(next);
			}).catch(next);
		}).catch(next);
	};// End saveBranchBusyStatusLogs
}
