import { ObjectId } from 'mongodb';
import * as Constants from '../../../../config/global_constant.mjs';
import Tables from '../../../../config/database_tables.mjs';
import { isPost, getDropdownList, getUtcDate, arrayToObject, newDate, sanitizeData, configDatatable } from '../../../../utils/index.mjs';
import BREADCRUMBS from '../../../../breadcrumbs.mjs';
import { saveSystemLogs } from '../../../../services/index.mjs';
import { parallel as asyncParallel, each as asyncEach } from 'async';

// Model for Hubs
class Hubs {
    constructor(db) {
        this.db = db;
        this.collectionDb = db.collection(Tables.HUBS); // Use constant for collection name
    }

    /**
     * Get hubs list (with datatable support)
     */
    async getHubsList(req, res, next) {
        const { ADMIN_LISTING_LIMIT, DEFAULT_SKIP, NOT_DELETED, STATUS_SUCCESS, STATUS_ERROR, DEFAULT_LANGUAGE_CODE } = Constants;
        const collection = this.collectionDb;
        if (isPost(req)) {
            let limit = req.body.length ? parseInt(req.body.length) : ADMIN_LISTING_LIMIT;
            let skip = req.body.start ? parseInt(req.body.start) : DEFAULT_SKIP;
            let branchId = req.body.branch_id ? new ObjectId(req.body.branch_id) : "";
            let commonConditions = { is_deleted: NOT_DELETED };
            if (branchId) {
                if (branchId.constructor !== Array) branchId = [branchId];
                commonConditions.branches = { $in: arrayToObject(branchId) };
            }
            const dataTableConfig = await configDatatable(req, res, null);
            dataTableConfig.conditions = Object.assign(commonConditions, dataTableConfig.conditions);

            let dbRes = await this.collectionDb.aggregate([
                { $match: dataTableConfig.conditions },
                {
                    $facet : {
                        list : [
                            {$sort: dataTableConfig.sort_conditions },
                            {$skip: skip },
                            {$limit: limit },
                            {
                                $lookup: {
                                    from: Tables.RESTAURANT_BRANCHES,
                                    let: { brancheIds: "$branches" },
                                    pipeline: [
                                        {
                                            $match: {
                                                $expr: {
                                                    $and: [
                                                        { $in: ["$_id", "$$brancheIds"] },
                                                    ]
                                                },
                                            }
                                        },
                                        {
                                            $group: {
                                                _id: null,
                                                branch_list: { $push: `$name.${DEFAULT_LANGUAGE_CODE}` }
                                            }
                                        },
                                    ],
                                    as: "branch_list"
                                }
                            },
                            {
                                $project: {
                                    _id: 1,
                                    name: 1,
                                    branches: 1,
                                    branch_list: { $arrayElemAt: ["$branch_list.branch_list", 0] }
                                }
                            }
                        ],
                        count: [
                            {$count: "count"},
                        ],
                    }
                }
            ]).toArray();

            /** Send response **/
            res.send({
                status: Constants.STATUS_SUCCESS,
                draw: dataTableConfig.result_draw,
                data			:   dbRes?.[0]?.list ||[],
                recordsTotal	:	dbRes?.[0]?.count?.[0]?.count || 0,
                recordsFiltered	:  	dbRes?.[0]?.count?.[0]?.count || 0,
            }); 
        } else {
            // get dropdown options for branch list
            let response = await getDropdownList(req, res, next, {
                collections: [{
                    collection: Tables.RESTAURANT_BRANCHES,
                    columns: ["_id", ["name", DEFAULT_LANGUAGE_CODE]]
                }]
            });
            if (response.status !== STATUS_SUCCESS) {
                req.flash(STATUS_ERROR, response.message);
                return res.redirect(Constants.WEBSITE_ADMIN_URL + "dashboard");
            }
            req.breadcrumbs(BREADCRUMBS["admin/hubs/list"]);
            res.render('list', { branch_list: response.final_html_data["0"] });
        }
    }

    /**
     * Get hub details 
     */
    async _getHubDetails(req, res, next) {
        try {
            const result = await this.collectionDb.findOne({ _id: new ObjectId(req.params.id), is_deleted: Constants.NOT_DELETED });
            if (!result) return { status: Constants.STATUS_ERROR, message: res.__("admin.system.invalid_access") };
            return { status: Constants.STATUS_SUCCESS, result };
        } catch (err) {
            next(err);
        }
    }

    /**
     * Add or update hubs
     */
    async addEditHubs(req, res, next) {
        try {
            const hubs = this.collectionDb;
            const isEditable = !!req.params.id;
            const hubId = req.params.id ? new ObjectId(req.params.id) : new ObjectId();
            if (isPost(req)) {
                req.body = sanitizeData(req.body, Constants.NOT_ALLOWED_TAGS_XSS);
                let isTeamHead      =   req.session.user.team_head ? req.session.user.team_head : false;
                let branches        =   req.body.branches ? req.body.branches : [];
                let nameEnglish     =   req.body.name_english ? req.body.name_english : "";
                let nameArabic      =   req.body.name_arabic ? req.body.name_arabic : "";
                let authUserRoleId  =   req.session.user.user_role_id;
                let authId          =   (isTeamHead || authUserRoleId == Constants.CRAVEZ || (!isTeamHead && !req.session.user.parent_id)) ? req.session.user._id : req.session.user.parent_id;
               
                if (branches.constructor !== Array) branches = [branches];

                let oldHubDetail = {};
                if(isEditable){
                    let hubData =   await this._getHubDetails(req, res, next);
                    oldHubDetail =   hubData?.result || {};

                    /** Send error response */
                    if(hubData?.status != Constants.STATUS_SUCCESS) return res.send({
                        status : Constants.STATUS_ERROR,
                        message: res.__("admin.system.something_going_wrong_please_try_again")   
                    });
                }
                
                let oldBranches  =  oldHubDetail?.branches || [];

                /** Set branch conditions */
                let braConditions = {_id: { $in: arrayToObject(branches) }};
                if(oldBranches?.length) braConditions =  {_id: { $in: arrayToObject([...branches, ...oldBranches]) }}

                const restaurant_branches = this.db.collection(Tables.RESTAURANT_BRANCHES);
                let braList = await restaurant_branches.find(braConditions, { projection: { _id: 1, name: 1 } }).toArray();

                /** Send error response */
                if(!braList.length) return res.send({
                    status : Constants.STATUS_ERROR,
                    message: res.__("admin.system.something_going_wrong_please_try_again")   
                });

                let branchNames     =   {};
                let oldBranchNames  =   {};
                braList.forEach(element => {
                    let cBraId      = String(element?._id || "");
                    let cBraEnName  = element?.name?.en || "";
                    let cBraArName  = element?.name?.ar || "";

                    if(oldBranches?.length) oldBranches.forEach(oBraId => {
                        if(String(oBraId) == cBraId){
                            if(!oldBranchNames.en)  oldBranchNames.en = [];
                            if(!oldBranchNames.ar)  oldBranchNames.ar = [];
                            
                            oldBranchNames.en.push(cBraEnName);
                            oldBranchNames.ar.push(cBraArName);
                        }
                    });

                    if(branches?.length) branches.forEach(sBraId => {
                        if(String(sBraId) == cBraId){
                            if(!branchNames.en)  branchNames.en = [];
                            if(!branchNames.ar)  branchNames.ar = [];
                            
                            branchNames.en.push(cBraEnName);
                            branchNames.ar.push(cBraArName);
                        }
                    });
                });

                /** Name convert into string */
                if(branchNames?.en)     branchNames.en     = branchNames?.en.join(", ");
                if(branchNames?.ar)     branchNames.ar     = branchNames?.ar.join(", ");
                if(oldBranchNames?.en)  oldBranchNames.en  = oldBranchNames?.en.join(", ");
                if(oldBranchNames?.ar)  oldBranchNames.ar  = oldBranchNames?.ar.join(", ");

                /** Save / update hubs details */
                await hubs.updateOne({
                    _id: hubId
                }, {
                    $set: {
                        name: { ar: nameArabic, en: nameEnglish },
                        branches: arrayToObject(branches),
                        modified: getUtcDate()
                    },
                    $setOnInsert: {
                        is_active   :   Constants.ACTIVE,
                        is_deleted  :   Constants.NOT_DELETED,
                        added_by    :   new ObjectId(authId),
                        created     :   getUtcDate()
                    }
                }, { upsert: true });
                    
                    
                let message = isEditable ? res.__("admin.hubs.hubs_has_been_updated_successfully") : res.__("admin.hubs.hubs_has_been_added_successfully");
                if (!isEditable) req.flash(Constants.STATUS_SUCCESS, message);
                res.send({
                    status: Constants.STATUS_SUCCESS,
                    redirect_url: Constants.WEBSITE_ADMIN_URL + "hubs",
                    message: message,
                    current_id: hubId
                });

                saveSystemLogs(req, res, {
                    user_id: req.session.user._id,
                    parent_id: hubId,
                    activity_module: Constants.SYSTEM_LOG_MODULE_HUBS,
                    activity_type: Constants.ACTIVITY_TYPE_ADD_EDIT,
                    additional_details: {}
                }).then(() => { });

                this.saveHubHistoryData(req, res, {
                    user_id: new ObjectId(req.session.user._id),
                    hub_id: new ObjectId(hubId),
                    name: { ar: nameArabic, en: nameEnglish },
                    action: isEditable ? Constants.UPDATE_HUB : Constants.HUB_CREATION,
                    old_hub_name: isEditable ? ((oldHubDetail && oldHubDetail.name) ? oldHubDetail.name : "") : "",
                    old_branch_ids: isEditable ? arrayToObject(oldBranches) : [],
                    old_values: isEditable ? oldBranchNames : "",
                    new_hub_name: { ar: nameArabic, en: nameEnglish },
                    new_branch_ids: arrayToObject(branches),
                    new_values: branchNames
                }).then({});              
            } else {
                /** Get last mapped branch ids list */
                const hubBranchIds = await this.collectionDb.distinct('branches', { is_deleted: Constants.NOT_DELETED, _id: { $ne: hubId } });

                let hubDetails = {};
                if(isEditable){
                    let hubData =   await this._getHubDetails(req, res, next);
                    hubDetails  =   hubData?.result || {};

                    /** Send error response */
                    if(hubData?.status != Constants.STATUS_SUCCESS) return res.status(400).send(hubData);
                }   
                    
                let branchIds   =   (hubDetails.branches) ? hubDetails.branches : [];     
                let dropRes     =   await getDropdownList(req, res, next, {
                    collections: [{
                        collection  :   Tables.RESTAURANT_BRANCHES,
                        columns     :   ["_id", ["name", Constants.DEFAULT_LANGUAGE_CODE]],
                        selected    :   branchIds,
                        conditions  :   {_id: { $nin: arrayToObject(hubBranchIds) }, is_active: Constants.ACTIVE }
                    }]
                });

                /** Send error response */
                if(dropRes?.status != Constants.STATUS_SUCCESS) return res.status(400).send(dropRes);

                /** Render add/edit html page */
                req.breadcrumbs(BREADCRUMBS[`admin/hubs/${isEditable && 'edit' || 'add'}`]);
                res.render('add_edit', {
                    layout: false,
                    data: hubDetails,
                    isEditable: isEditable,
                    branch_list: dropRes?.final_html_data?.["0"] || ""
                });                    
            }
        } catch (error) {
            next(error);
        }
    }

    /**
     * Save hub history data (private helper)
     */
    async saveHubHistoryData(req, res, options) {
        try {
            let insertData = { ...options, created: getUtcDate() };
            const hub_activity_histories = this.db.collection(Tables.HUB_ACTIVITY_HISTORIES);
            await hub_activity_histories.insertOne(insertData);
            return { status: Constants.STATUS_SUCCESS };
        } catch (err) {
            return { status: Constants.STATUS_ERROR, message: res.__("admin.system.something_going_wrong_please_try_again") };
        }
    }

    /**
     * Delete hub and related data
     */
    async deleteHub(req, res, next) {
        const authId =  new ObjectId(req.session.user._id);
        const hubId  =  new ObjectId(req.params.id);
        const currentStartDate = newDate(newDate("", Constants.CURRENTDATE_START_DATE_FORMAT));
       
        const hubs = this.collectionDb;
        const hub_order_slabs = this.db.collection(Tables.HUB_ORDER_SLABS);
        const hub_linked_areas = this.db.collection(Tables.HUB_LINKED_AREAS);
        const hub_branch_linking = this.db.collection(Tables.HUB_BRANCH_LINKING);
        const driver_availabilities = this.db.collection(Tables.DRIVER_AVAILABILITIES);

        /** Get hub details */
        let hubData =   await this._getHubDetails(req, res, next);
        
        /** Send error response */
        if(hubData?.status != Constants.STATUS_SUCCESS){
            req.flash(Constants.STATUS_ERROR, res.__("admin.system.invalid_access"));
            return res.redirect(Constants.WEBSITE_ADMIN_URL + "hubs");
        }

        /** Chec driver availabilities */
        let driverShifts = await driver_availabilities.aggregate([
            {$match: { date: { $gte: currentStartDate }, hubs_ids: { $in: [hubId] } } },
            {$lookup: {
                from: Tables.SHIFTS,
                localField: "shift_id",
                foreignField: "_id",
                as: "shift_details",
            }},
            { $addFields: { shift_details: { $arrayElemAt: ["$shift_details", 0] } } },
        ]).toArray();        
        
        let hubResult = hubData.result;
        let updateData = {
            is_deleted  : Constants.DELETED,
            deleted_by  : authId,
            deleted_at  : getUtcDate(),
            modified    : getUtcDate(),
        };

        asyncParallel({
            hubs: (callback) => {
                hubs.updateOne({ _id: hubId }, { $set: updateData }).then(()=>{
                    callback(null);
                }).catch(callback);
            },
            linked_branch: (callback) => {
                hub_branch_linking.updateMany({ hub_id: hubId }, { $set: updateData }).then(()=>{
                    callback(null);
                }).catch(callback);
            },
            linked_area: (callback) => {
                hub_linked_areas.updateMany({ hub_id: hubId }, { $set: updateData }).then(()=>{
                    callback(null);
                }).catch(callback);
            },
            hub_order_slab: (callback) => {
                hub_order_slabs.updateMany({ hub_id: hubId }, { $set: updateData }).then(()=>{
                    callback(null);
                }).catch(callback);
            },
            driver_shift: (callback) => {

                let currentTime = parseFloat(newDate('', Constants.SHIFT_TIME_FORMAT));
                let currentDate = newDate(newDate("", Constants.DATABASE_DATE_FORMAT));
                asyncEach(driverShifts, (records, eachCallback) => {
                    let deShiftId = records._id;
                    let drShiftDate = newDate(newDate(records.date, Constants.DATABASE_DATE_FORMAT));
                    let drHubs = records.hubs_ids;
                    let leaveType = records.leave_type;
                    let shiftDetails = records.shift_details ? records.shift_details : {};
                    let shiftStartTime = shiftDetails.start_time;
                    let singleHub = (drHubs.length == 1) ? true : false;
                    let updatedData = { $set: { modified: getUtcDate() } };
                    let isDeleteAble = false;
                    if (singleHub) {
                        if (leaveType) {
                            updatedData["$unset"] = { shift_id: 1, hubs_ids: 1 };
                        } else if ((drShiftDate == currentDate && shiftStartTime > currentTime) || (drShiftDate > currentDate)) {
                            isDeleteAble = true
                        }
                    } else {
                        if ((newDate(drShiftDate, Constants.DATABASE_DATE_FORMAT) == newDate(currentDate, Constants.DATABASE_DATE_FORMAT) && shiftStartTime > currentTime) || (drShiftDate > currentDate)) {
                            updatedData["$pull"] = { hubs_ids: { $in: [hubId] } };
                        }
                    }

                    asyncParallel({
                        delete_shift: (subCallback) => {
                            if (!isDeleteAble) return subCallback(null);

                            driver_availabilities.deleteOne({ _id: deShiftId }).then(()=>{
                                subCallback(null);
                            }).catch(subCallback);
                        },
                        update_shift: (subCallback) => {
                            if (Object.keys(updatedData).length == 1) return subCallback(null);
                            
                            driver_availabilities.updateOne({ _id: deShiftId }, updatedData).then(()=>{
                                subCallback(null);
                            }).catch(subCallback);
                        },
                    }, (asyncSubErr) => {
                        eachCallback(asyncSubErr);
                    });
                }, (asyncErr) => {
                    callback(asyncErr);
                });
            },
        }, (asyncErr) => {
            if (asyncErr) return next(asyncErr);

            req.flash(Constants.STATUS_SUCCESS, res.__("admin.hubs.hub_details_deleted_successfully"));
            res.redirect(Constants.WEBSITE_ADMIN_URL + "hubs");
            
            saveSystemLogs(req, res, {
                user_id: req.session.user._id,
                parent_id: req.params.id,
                activity_module: Constants.SYSTEM_LOG_MODULE_HUBS,
                activity_type: Constants.ACTIVITY_TYPE_DELETE,
                additional_details: {}
            }).then(() => { });
            
            this.saveHubHistoryData(req, res, {
                user_id: new ObjectId(req.session.user._id),
                hub_id: hubId,
                action: Constants.DELETE_HUB,
                name: hubResult.name,
            }).then({ });
        });        
    }
     
    /**
     * For view config details
     */
    async viewConfigDetails(req, res, next) {
        /** Get hub details */
        let hubData = await this._getHubDetails(req, res, next);
        
        /** Send error response */
        if(hubData?.status != Constants.STATUS_SUCCESS){
            req.flash(Constants.STATUS_ERROR, res.__("admin.system.invalid_access"));
            return res.redirect(Constants.WEBSITE_ADMIN_URL + "hubs");
        }

        /** Render view page*/
        req.breadcrumbs(BREADCRUMBS['admin/hubs/view']);
        res.render('view',{
            type		: 	req.params.type,
            hub_details : 	hubData.result,
        });
    }

    /**
     * Function for add parameters
     *
     * @param req As Request Data
     * @param res As Response Data
     *
     * @return render
     */
    async addParameters(req, res, next) {
        try {
            let hubId = new ObjectId(req.params.id);
            if (isPost(req)) {
                /** Sanitize Data **/
                req.body = sanitizeData(req.body, Constants.NOT_ALLOWED_TAGS_XSS);
                let parameterStatus = req.body.parameters_status ? req.body.parameters_status : 0;
                let maxOrder = req.body.max_order ? req.body.max_order : "";
                let unassignedOrder = req.body.unassigned_order ? req.body.unassigned_order : "";
                let maxUnassignedOrder = req.body.max_unassigned_order ? req.body.max_unassigned_order : "";
                let noOfUnassignedStatus = req.body.no_of_unassigned_status ? req.body.no_of_unassigned_status : 0;
                let maxNoOfUnassignedStatus = req.body.max_no_of_unassigned_status ? req.body.max_no_of_unassigned_status : 0;
                let urgentMaxUnassignedOrder = req.body.urgent_max_unassigned_order ? req.body.urgent_max_unassigned_order : "";
                let urgentMaxNoOfUnassignedStatus = req.body.urgent_max_no_of_unassigned_status ? req.body.urgent_max_no_of_unassigned_status : 0;
                let assignedBufferTime = req.body.assigned_buffer_time ? req.body.assigned_buffer_time : "";
                let assignedMaxBufferTime = req.body.assigned_max_buffer_time ? req.body.assigned_max_buffer_time : "";
                
                let hubResponse = await this._getHubDetails(req, res, next);

                /** Send error response */
                if(hubResponse?.status != Constants.STATUS_SUCCESS) return res.send({
                    status : Constants.STATUS_ERROR,
                    message: res.__("admin.system.something_going_wrong_please_try_again")   
                });

                let olData      = (hubResponse && hubResponse.result) ? hubResponse.result : {};
                let newValues   = [
                    res.__("admin.hubs.parameters_status") + ' - ' + ((Constants.HUB_PARAMETER_DROPDOWN[parameterStatus]) ? Constants.HUB_PARAMETER_DROPDOWN[parameterStatus] : Constants.HUB_PARAMETER_DROPDOWN[Constants.OFF]),
                    res.__("admin.hubs.max_no_of_order_assigned_to_captain") + ' - ' + ((maxOrder || parseInt(maxOrder) == 0) ? maxOrder : "N/A"),
                    res.__("admin.hubs.no_of_order_unassigned") + ' - ' + ((unassignedOrder || parseInt(unassignedOrder) == 0) ? unassignedOrder : "N/A"),
                    res.__("admin.hubs.no_of_order_unassigned_status") + ' - ' + ((Constants.HUB_PARAMETER_DROPDOWN[noOfUnassignedStatus]) ? Constants.HUB_PARAMETER_DROPDOWN[noOfUnassignedStatus] : ""),
                    res.__("admin.hubs.max_no_of_order_unassigned") + ' - ' + ((maxUnassignedOrder || parseInt(maxUnassignedOrder) == 0) ? maxUnassignedOrder : "N/A"),
                    res.__("admin.hubs.max_no_of_order_unassigned_status") + ' - ' + ((Constants.HUB_PARAMETER_DROPDOWN[maxNoOfUnassignedStatus]) ? Constants.HUB_PARAMETER_DROPDOWN[maxNoOfUnassignedStatus] : ""),
                    res.__("admin.hubs.urgent_max_no_of_unassigned_order") + ' - ' + ((urgentMaxUnassignedOrder || parseInt(urgentMaxUnassignedOrder) == 0) ? urgentMaxUnassignedOrder : "N/A"),
                    res.__("admin.hubs.urgent_max_no_of_unassigned_order_status") + ' - ' + ((Constants.HUB_PARAMETER_DROPDOWN[urgentMaxNoOfUnassignedStatus]) ? Constants.HUB_PARAMETER_DROPDOWN[urgentMaxNoOfUnassignedStatus] : ""),
                    res.__("admin.hubs.assigned_buffer_time") + ' - ' + ((assignedBufferTime || parseInt(assignedBufferTime) == 0) ? assignedBufferTime : "N/A"),
                    res.__("admin.hubs.assigned_max_buffer_time") + ' - ' + ((assignedMaxBufferTime || parseInt(assignedMaxBufferTime) == 0) ? assignedMaxBufferTime : "N/A"),
                ];

                let oldValues = [
                    res.__("admin.hubs.parameters_status") + ' - ' + ((olData.parameter_status && Constants.HUB_PARAMETER_DROPDOWN[olData.parameter_status]) ? Constants.HUB_PARAMETER_DROPDOWN[olData.parameter_status] : Constants.HUB_PARAMETER_DROPDOWN[Constants.OFF]),
                    res.__("admin.hubs.max_no_of_order_assigned_to_captain") + ' - ' + ((olData.max_no_of_order_assigned || olData.max_no_of_order_assigned == 0) ? olData.max_no_of_order_assigned : 'N/A'),
                    res.__("admin.hubs.no_of_order_unassigned") + ' - ' + ((olData.no_of_unassigned_order || olData.no_of_unassigned_order == 0) ? olData.no_of_unassigned_order : 'N/A'),
                    res.__("admin.hubs.no_of_order_unassigned_status") + ' - ' + ((olData.no_of_unassigned_status && Constants.HUB_PARAMETER_DROPDOWN[olData.no_of_unassigned_status]) ? Constants.HUB_PARAMETER_DROPDOWN[olData.no_of_unassigned_status] : ""),
                    res.__("admin.hubs.max_no_of_order_unassigned") + ' - ' + ((olData.max_no_of_unassigned_order || olData.max_no_of_unassigned_order == 0) ? olData.max_no_of_unassigned_order : 'N/A'),
                    res.__("admin.hubs.max_no_of_order_unassigned_status") + ' - ' + ((olData.max_no_of_unassigned_status && Constants.HUB_PARAMETER_DROPDOWN[olData.max_no_of_unassigned_status]) ? Constants.HUB_PARAMETER_DROPDOWN[olData.max_no_of_unassigned_status] : ""),
                    res.__("admin.hubs.urgent_max_no_of_unassigned_order") + ' - ' + ((olData.urgent_max_no_of_unassigned_order || olData.urgent_max_no_of_unassigned_order == 0) ? olData.urgent_max_no_of_unassigned_order : 'N/A'),
                    res.__("admin.hubs.urgent_max_no_of_unassigned_order_status") + ' - ' + ((olData.urgent_max_no_of_unassigned_status && Constants.HUB_PARAMETER_DROPDOWN[olData.urgent_max_no_of_unassigned_status]) ? Constants.HUB_PARAMETER_DROPDOWN[olData.urgent_max_no_of_unassigned_status] : ""),
                    res.__("admin.hubs.assigned_buffer_time") + ' - ' + ((olData.assigned_buffer_time || olData.assigned_buffer_time == 0) ? olData.assigned_buffer_time : 'N/A'),
                    res.__("admin.hubs.assigned_max_buffer_time") + ' - ' + ((olData.assigned_max_buffer_time || olData.assigned_max_buffer_time == 0) ? olData.assigned_max_buffer_time : 'N/A'),
                ];

                /**Update parameters details */
                await this.collectionDb.updateOne({ _id: hubId }, {
                    $set: {
                        parameter_status: (parameterStatus) ? parseInt(parameterStatus) : "",
                        max_no_of_order_assigned: (maxOrder) ? parseInt(maxOrder) : "",
                        no_of_unassigned_order: (unassignedOrder) ? parseInt(unassignedOrder) : "",
                        no_of_unassigned_status: parseInt(noOfUnassignedStatus),
                        max_no_of_unassigned_order: (maxUnassignedOrder) ? parseInt(maxUnassignedOrder) : "",
                        max_no_of_unassigned_status: parseInt(maxNoOfUnassignedStatus),
                        urgent_max_no_of_unassigned_order: (urgentMaxUnassignedOrder) ? parseInt(urgentMaxUnassignedOrder) : "",
                        urgent_max_no_of_unassigned_status: parseInt(urgentMaxNoOfUnassignedStatus),
                        assigned_buffer_time: (assignedBufferTime) ? parseInt(assignedBufferTime) : "",
                        assigned_max_buffer_time: (assignedMaxBufferTime) ? parseInt(assignedMaxBufferTime) : "",
                        modified: getUtcDate(),
                    }
                });

                /** Send success response */
                res.send({
                    status: Constants.STATUS_SUCCESS,
                    message: res.__("admin.hubs.parameters_has_been_updated_successfully"),
                });

                /** save hub history data */
                this.saveHubHistoryData(req, res, {
                    user_id: new ObjectId(req.session.user._id),
                    hub_id: hubId,
                    action: Constants.UPDATE_PARAMETERS,
                    name: (olData.name) ? olData.name : "",
                    old_values: (olData.parameter_status || parseInt(olData.parameter_status) == 0) ? oldValues : [],
                    new_values: newValues
                });
            } else {
                let response = await this._getHubDetails(req, res, next);
                if (response.status != Constants.STATUS_SUCCESS) return res.status(400).send({status: Constants.STATUS_ERROR, message: response.message });

                /** Render parameters page*/
                res.render('parameters', {
                    layout: false,
                    result: response.result
                });
            }
        } catch (err) {
            return next(err);
        }
    }  
    
    /**
     * Function for getting active branch list
     *
     * @param req 	As Request Data
     * @param res 	As Response Data
     * @param next 	As Callback argument to the middleware function
     *
     * @return render/json
     */
    async activeBranchList(req, res, next) {
        try {
            if (isPost(req)) {
                let limit = req.body.length ? parseInt(req.body.length) : Constants.ADMIN_LISTING_LIMIT;
                let skip = req.body.start ? parseInt(req.body.start) : Constants.DEFAULT_SKIP;
                let branchIds = req.body.branch_ids ? req.body.branch_ids : "";
                let restaurantIds = req.body.restaurant_ids ? req.body.restaurant_ids : "";
                const collection = this.db.collection(Tables.RESTAURANT_BRANCHES);

                /** Set common conditions */
                let commonConditions = { is_active: Constants.ACTIVE };

                /** Configure Datatable conditions*/
                let dataTableConfig = await configDatatable(req, res, null);

                /** Get hub branch list */
                const hubs = this.db.collection(Tables.HUBS);
                let hubBranchIds = await hubs.distinct('branches', { is_deleted: Constants.NOT_DELETED });

                commonConditions["_id"] = { $nin: arrayToObject(hubBranchIds) };

                if (branchIds) {
                    if (branchIds.constructor !== Array) branchIds = [branchIds];
                    commonConditions["$and"] = [{ _id: { $in: arrayToObject(branchIds) } }];
                }

                if (restaurantIds) {
                    if (restaurantIds.constructor !== Array) restaurantIds = [restaurantIds];
                    commonConditions["restaurant_id"] = { $in: arrayToObject(restaurantIds) };
                }

                dataTableConfig.conditions = Object.assign(commonConditions, dataTableConfig.conditions);

                try {
                    /** Get Hubs list **/
                    let records = await collection.aggregate([
                        { $match: dataTableConfig.conditions },
                        { $sort: dataTableConfig.sort_conditions },
                        { $skip: skip },
                        { $limit: limit },
                        {
                            $lookup: {
                                from: Tables.RESTAURANTS,
                                localField: "restaurant_id",
                                foreignField: "_id",
                                as: "restaurant_detail"
                            }
                        },
                        {
                            $project: {
                                _id: 1,
                                name: 1,
                                branches: 1,
                                restaurant_name: { $arrayElemAt: ["$restaurant_detail.name." + Constants.DEFAULT_LANGUAGE_CODE, 0] }
                            }
                        }
                    ]).toArray();

                    /** Get filtered records counting in zone **/
                    let filterRecords = await collection.aggregate([
                        { $match: dataTableConfig.conditions },
                        {
                            $lookup: {
                                from: Tables.RESTAURANTS,
                                localField: "restaurant_id",
                                foreignField: "_id",
                                as: "restaurant_detail"
                            }
                        },
                        { $project: { _id: 1, name: 1, branches: 1 } }
                    ]).toArray();

                    let filterCount = filterRecords.length > 0 ? filterRecords.length : 0;

                    /** Send response **/
                    res.send({
                        status: Constants.STATUS_SUCCESS,
                        draw: dataTableConfig.result_draw,
                        data: records,
                        recordsFiltered: filterCount,
                        recordsTotal: filterCount
                    });

                } catch (err) {
                    return next(err);
                }
            } else {
                req.breadcrumbs(BREADCRUMBS["admin/hubs/branches"]);

                /** get dropdown options for restaurant list **/
                let response = await getDropdownList(req, res, next, {
                    collections: [{
                        collection: Tables.RESTAURANTS,
                        columns: ["_id", ["name", Constants.DEFAULT_LANGUAGE_CODE]]
                    }]
                });

                if (response.status != Constants.STATUS_SUCCESS) {
                    /** Send error response **/
                    req.flash(Constants.STATUS_ERROR, response.message);
                    return res.redirect(Constants.WEBSITE_ADMIN_URL + "hubs");
                }

                /** Render listing page  */
                res.render('active_branch_list', { restaurant_list: response.final_html_data["0"] });
            }
        } catch (err) {
            return next(err);
        }
    }

    /**
     * Function for get branch list
     *
     * @param req 	As Request Data
     * @param res 	As Response Data
     * @param next 	As Callback argument to the middleware function
     *
     * @return null
     */
    async branchDropdown (req,res,next){
        let restaurantIds = req.body.restaurant_ids;
        if(restaurantIds.constructor != Array) restaurantIds = [restaurantIds];

        /** Send success response */
        if(restaurantIds.length == 0) return res.send({status: Constants.STATUS_SUCCESS, branch_list: "" });

        /** Get branch ids */
        let branchIds = await this.collectionDb.distinct('branches',{is_deleted: Constants.NOT_DELETED});

        /** Get restaurant branches */
        let restaurant_branches = this.db.collection(Tables.RESTAURANT_BRANCHES);
        let dbRes = await restaurant_branches.aggregate([
            {$match : {
                restaurant_id 	:	{$in : arrayToObject(restaurantIds)},
                _id           	: 	{$nin: arrayToObject(branchIds)},
                is_active		: 	Constants.ACTIVE
            }},
            {$group: {
                _id 		:	"$restaurant_id",
                branch_list :	{$push: {
                    _id 	: 	"$_id",
                    name 	:	"$name."+Constants.DEFAULT_LANGUAGE_CODE,
                }}
            }},
            {$lookup: {
                from        : Tables.RESTAURANTS,
                localField  : "_id",
                foreignField: "_id",
                as          : "restaurant_details",
            }},
            {$project : {
                _id:1,branch_list:1,restaurant_name: {$arrayElemAt : ["$restaurant_details.name",0]}
            }}            
        ]).toArray();

        let branchList = "";
        if(dbRes?.length){
            dbRes.map(records=>{
                if(records.branch_list && records.branch_list.length >0){
                    branchList += "<optgroup label='"+records.restaurant_name[Constants.DEFAULT_LANGUAGE_CODE]+"'>";
                    records.branch_list.map(data=>{
                        if(data._id && data.name){
                            branchList += '<option value="'+data._id+'" >'+data.name+'</option>';
                        }
                    });
                    branchList += "</optgroup>";
                }
            });
        }

        /** Send success response */
        res.send({status: Constants.STATUS_SUCCESS, branch_list: branchList});
    };//End branchDropdown()
}
export default Hubs; 