import { ObjectId } from 'mongodb';
import * as Constants from '../../../../config/global_constant.mjs';
import Tables from '../../../../config/database_tables.mjs';
import { isPost, getDropdownList, getUtcDate, arrayToObject, sanitizeData, configDatatable } from '../../../../utils/index.mjs';
import { saveSystemLogs } from '../../../../services/index.mjs';
import Hubs from './hubs.mjs';

// Model for Hub branches
class HubBranches {
    constructor(db) {
        this.db             =   db;
        this.hubModule      =   new Hubs(db);
        this.collectionDb   =   db.collection(Tables.HUB_BRANCH_LINKING); // Use constant for collection name
    }   

    /**
	 * Function for get branch link list
	 *
	 * @param req As Request Data
	 * @param res As Response Data
	 *
	 * @return render
	 */
	async getBranchLinkingList(req, res, next){
        try{
            let hubId	=	req.params.id;    
            if(isPost(req)){
                let limit			= 	(req.body.length)	   ? parseInt(req.body.length)    :Constants.ADMIN_LISTING_LIMIT;
                let skip			= 	(req.body.start) 	   ? parseInt(req.body.start) 	  :Constants.DEFAULT_SKIP;
                let branchIds     	=	(req.body.branch_ids)  ? req.body.branch_ids          :"";
                
                /** Configure Datatable conditions*/
                let dataTableConfig = await configDatatable(req,res,null);
    
                /** Set common condition */
                let commonConditions = {hub_id: new ObjectId(hubId), is_deleted: Constants.NOT_DELETED};

                /** condition for branch */
                if(branchIds){
                    if(branchIds.constructor !== Array)  branchIds = [branchIds];
                    commonConditions["branch_ids"] = {$in : arrayToObject(branchIds)};
                };

                dataTableConfig.conditions = Object.assign(commonConditions, dataTableConfig.conditions);

                /** Get Hub branch linking list **/
                let dbRes = await this.collectionDb.aggregate([
                    { $match: dataTableConfig.conditions },
                    {$facet : {
                        list : [
                            {$sort: dataTableConfig.sort_conditions },
                            {$skip: skip },
                            {$limit: limit },
                            {$lookup:	{
                                from     : Tables.RESTAURANT_BRANCHES,
                                let      : {brancheIds : "$branch_ids"},
                                pipeline : [
                                    {$match : {
                                        $expr: {
                                            $and : [
                                                {$in: ["$_id", "$$brancheIds"]},
                                            ]
                                        },
                                    }},
                                    {$group : {
                                        _id: null,
                                        branch_list : {$push:  "$name."+Constants.DEFAULT_LANGUAGE_CODE }
                                    }},
                                ],
                                as:	"branch_list"
                            }},
                            {$project : {_id : 1,name : 1, branch_list : {$arrayElemAt : ["$branch_list.branch_list",0]}}}
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
                /**Get hub details */
                let hubRes = await this.hubModule._getHubDetails(req, res, next);

                /** Send error response */
                if(hubRes.status != Constants.STATUS_SUCCESS) return res.status(400).send(hubRes);

                    
                let hubData         =   hubRes?.result || {};
                let hubBranchIds    =   hubData?.branches || [];
                
                /**Get branch list **/
                let dropDownRes = await getDropdownList(req,res, next,{
                        collections :[{
                            collection : Tables.RESTAURANT_BRANCHES,
                            columns    : ["_id",["name",Constants.DEFAULT_LANGUAGE_CODE]],
                            conditions : {
                                _id       : {$in : arrayToObject(hubBranchIds)},
                                is_active : Constants.ACTIVE
                            },
                        }]
                    });
                
                /** Send error response **/
                if(dropDownRes.status != Constants.STATUS_SUCCESS) return res.status(400).send(dropDownRes);
                    
                /**  Render branch link list page **/
                res.render('branch_linking',{
                    layout		: false,
                    hub_id      : hubId,
                    branch_list	: dropDownRes?.final_html_data?.["0"] ||""
                });                   
            }
        }catch(e){return next(e);}
	};//End getBranchLinkingList()

    /**
     * Add or edit branch link
     */
    async addEditBranchLink(req, res, next) {
        try {
            let isEditable      =   !!req.params.id;
            let hubId           =   req.params.hub_id ? new ObjectId(req.params.hub_id) : new ObjectId();
            let branchLinkId    =   req.params.id ? new ObjectId(req.params.id) : new ObjectId();

            /**Collection names */
            const hubs = this.db.collection(Tables.HUBS);
            const restaurant_branches = this.db.collection(Tables.RESTAURANT_BRANCHES);

            if (isPost(req)) {
                /** Sanitize Data **/
                req.body = sanitizeData(req.body, Constants.NOT_ALLOWED_TAGS_XSS);

                let nameEnglish = req.body.name_english ? req.body.name_english : "";
                let nameArabic = req.body.name_arabic ? req.body.name_arabic : "";
                let branchIds = (req.body.branch_ids instanceof Array) ? arrayToObject(req.body.branch_ids) : [new ObjectId(req.body.branch_ids)];

                try {
                    let hubDetail = await hubs.findOne({ _id: hubId }, { projection: { _id: 1, name: 1 } });

                    /** Send error response */
                    if(!hubDetail) return res.send({
                        status : Constants.STATUS_ERROR,
                        message: res.__("admin.system.something_going_wrong_please_try_again")   
                    });

                    let oldLinkDetail = null;
                    if (isEditable) {
                        let branchLinkResponse = await this._getBranchLinkDetails(req, res, next);
                        oldLinkDetail = branchLinkResponse?.result || null;
                    }

                    let oldBranchIds = (oldLinkDetail && oldLinkDetail.branch_ids?.length > 0) ? oldLinkDetail.branch_ids : [];

                    // Get old branch names
                    let oldBranchNames = { en: [], ar: [] };
                    if (isEditable && oldBranchIds.length > 0) {
                        let oldBranchResult = await restaurant_branches.find({ _id: { $in: arrayToObject(oldBranchIds) } }, { projection: { _id: 1, name: 1 } }).toArray();
                        oldBranchResult.forEach(val => {
                            oldBranchNames.en.push(val.name.en);
                            oldBranchNames.ar.push(val.name.ar);
                        });
                        oldBranchNames = {
                            en: oldBranchNames.en.join(', '),
                            ar: oldBranchNames.ar.join(', ')
                        };
                    }

                    // Get new branch names
                    let branchResult = await restaurant_branches.find({ _id: { $in: arrayToObject(branchIds) } }, { projection: { _id: 1, name: 1 } }).toArray();
                    let branchNamesEn = [];
                    let branchNamesAr = [];
                    branchResult.forEach(val => {
                        branchNamesEn.push(val.name.en);
                        branchNamesAr.push(val.name.ar);
                    });
                    let branchNames = {
                        en: branchNamesEn.join(', '),
                        ar: branchNamesAr.join(', ')
                    };

                    /** set data in object **/
                    let updateData = {
                        name: {
                            ar: nameArabic,
                            en: nameEnglish
                        },
                        branch_ids: arrayToObject(branchIds),
                        modified: getUtcDate()
                    };

                    /** Save hub branch linking details **/
                    await this.collectionDb.updateOne({
                        _id: branchLinkId
                    }, {
                        $set: updateData,
                        $setOnInsert: {
                            added_by: new ObjectId(req.session.user._id),
                            hub_id: hubId,
                            is_active: Constants.ACTIVE,
                            is_deleted: Constants.NOT_DELETED,
                            created: getUtcDate()
                        }
                    }, { upsert: true });

                    /** save System logs */
                    saveSystemLogs(req, res, {
                        user_id: req.session.user._id,
                        parent_id: hubId,
                        activity_module: Constants.SYSTEM_LOG_MODULE_HUBS,
                        activity_type: Constants.ACTIVITY_TYPE_ADD_EDIT,
                        additional_details: {}
                    }).then(() => { });

                    /** save hub history data */
                    await this.hubModule.saveHubHistoryData(req, res, {
                        user_id: new ObjectId(req.session.user._id),
                        hub_id: new ObjectId(hubId),
                        action: isEditable ? Constants.UPDATE_BRANCH_LINK : Constants.BRANCH_LINK_CREATION,
                        name: (hubDetail?.name) ? hubDetail.name : "",
                        old_link_name: (isEditable) ? ((oldLinkDetail && oldLinkDetail.name) ? oldLinkDetail.name : "") : "",
                        old_branch_ids: (isEditable) ? arrayToObject(oldBranchIds) : [],
                        old_values: (isEditable) ? oldBranchNames : "",
                        new_link_name: { ar: nameArabic, en: nameEnglish },
                        new_branch_ids: arrayToObject(branchIds),
                        new_values: branchNames
                    });

                    /** Send success response **/
                    let message = (isEditable) ? res.__("admin.hubs.branch_link_has_been_updated_successfully") : res.__("admin.hubs.branch_link_has_been_added_successfully");
                    if (!isEditable) req.flash(Constants.STATUS_SUCCESS, message);
                    res.send({
                        status: Constants.STATUS_SUCCESS,
                        redirect_url: Constants.WEBSITE_ADMIN_URL + "hubs/view/" + hubId + "/branch_linking",
                        message: message,
                        current_id: hubId
                    });

                } catch (err) {
                    return next(err);
                }
            } else {
                let response = {};
                if (isEditable) {
                    /** Get hub branch linking details **/
                    response = await this._getBranchLinkDetails(req, res, next);
                    /** Send error response **/
                    if (response.status != Constants.STATUS_SUCCESS) return res.status(400).send(response);
                }
                let result = (response.result) ? response.result : {};
                let branchIds = (result.branch_ids) ? arrayToObject(result.branch_ids) : [];

                try {
                    /**Get already linked branches */
                    let linkCondition = { hub_id: hubId, is_deleted: Constants.NOT_DELETED };
                    if (isEditable) linkCondition._id = { $ne: branchLinkId };

                    let linkedBranches = await this.collectionDb.distinct("branch_ids", linkCondition);

                    /**Get linked branches with hub */
                    let branchResult = await hubs.findOne({ _id: new ObjectId(hubId) }, { projection: { _id: 1, branches: 1 } });
                    if (!branchResult) {
                        return res.status(400).send({ status: Constants.STATUS_ERROR, message: "Hub not found" });
                    }

                    let hubBranchIds = branchResult.branches ? branchResult.branches : [];

                    /** Set dropdown options for hub list **/
                    let options = {
                        collections: [{
                            collection: Tables.RESTAURANT_BRANCHES,
                            columns: ["_id", ["name", Constants.DEFAULT_LANGUAGE_CODE]],
                            conditions: {
                                $and: [{ _id: { $in: arrayToObject(hubBranchIds) } }, { _id: { $nin: arrayToObject(linkedBranches) } }],
                                is_active: Constants.ACTIVE
                            },
                            selected: branchIds
                        }]
                    };

                    /**Get branch list **/
                    let dropDownResponse = await getDropdownList(req, res, next, options);
                    /** Send error response **/
                    if (dropDownResponse.status != Constants.STATUS_SUCCESS) return res.status(400).send(dropDownResponse);

                    /** Render edit page  **/
                    res.render('add_edit_branch_link', {
                        layout: false,
                        result: result,
                        is_editable: isEditable,
                        hub_id: hubId,
                        branch_list: dropDownResponse?.final_html_data?.["0"] || ""
                    });

                } catch (err) {
                    return next(err);
                }
            }
        } catch (err) {
            return next(err);
        }
    }

    /**
     * Function to get branch link details (private helper)
     *
     * @param req	As Request Data
     * @param res	As Response Data
     * @param next 	As Callback argument to the middleware function
     *
     * @return json
     */
    async _getBranchLinkDetails(req, res, next) {
        try {
            const result = await this.collectionDb.findOne({ _id: new ObjectId(req.params.id), is_deleted: Constants.NOT_DELETED });
            if(!result) return { status: Constants.STATUS_ERROR, message: res.__("admin.system.invalid_access") };
            return { status: Constants.STATUS_SUCCESS, result };
        } catch (err) {
            next(err);
        }
    }

    /**
     * Function for deleting hub branch link details
     *
     * @param req 	As Request Data
     * @param res 	As Response Data
     * @param next 	As Callback argument to the middleware function
     *
     * @return render/json
     */
    async deleteHubBranchLink(req, res, next) {
        try {
            let linkId = req.params.id ? new ObjectId(req.params.id) : "";
            let hubId = req.params.hub_id ? new ObjectId(req.params.hub_id) : "";
            const hub_branch_linking = this.db.collection(Tables.HUB_BRANCH_LINKING);

            try {
                /** Get hub branch link name for logs */
                let linkingRes = await this._getBranchLinkDetails(req, res, next);
                let linkingDetail = linkingRes?.result || {};

                /** Send error response */
                if(linkingRes.status != Constants.STATUS_SUCCESS){
                    req.flash(Constants.STATUS_ERROR, linkingRes.message);
                    return res.redirect(Constants.WEBSITE_ADMIN_URL + "hubs/view/" + hubId + "/branch_linking");
                }
                
                /** Get hub detail */
                const hubs = this.db.collection(Tables.HUBS);
                let hubDetail = await hubs.findOne({ _id: hubId }, { projection: { _id: 1, name: 1 } });

                /** Send error response */
                if(!hubDetail){
                    req.flash(Constants.STATUS_ERROR, res.__("admin.system.something_going_wrong_please_try_again"));
                    return res.redirect(Constants.WEBSITE_ADMIN_URL + "hubs/view/" + hubId + "/branch_linking");
                }

                /** Delete hub branch link */
                await hub_branch_linking.updateOne({
                    _id: linkId,
                }, {
                    $set: {
                        is_deleted: Constants.DELETED,
                        deleted_at: getUtcDate(),
                        modified: getUtcDate(),
                        deleted_by: new ObjectId(req.session.user._id)
                    }
                });

                /** Send success response **/
                req.flash(Constants.STATUS_SUCCESS, res.__("admin.hubs.hub_branch_link_details_deleted_successfully"));
                res.redirect(Constants.WEBSITE_ADMIN_URL + "hubs/view/" + hubId + "/branch_linking");

                /** Save system logs */
                saveSystemLogs(req, res, {
                    user_id: req.session.user._id,
                    parent_id: linkId,
                    activity_module: Constants.SYSTEM_LOG_MODULE_HUBS,
                    activity_type: Constants.ACTIVITY_TYPE_DELETE,
                    additional_details: {}
                }).then(() => { });

                /** save hub history data */
                this.hubModule.saveHubHistoryData(req, res, {
                    user_id: new ObjectId(req.session.user._id),
                    hub_id: hubId,
                    action: Constants.DELETE_BRANCH_LINK,
                    name: (hubDetail && hubDetail.name) ? hubDetail.name : "",
                    link_name: (linkingDetail?.name) ? linkingDetail.name : "",
                });
            } catch (err) {
                return next(err);
            }
        } catch (err) {
            return next(err);
        }
    }
}
export default HubBranches;
