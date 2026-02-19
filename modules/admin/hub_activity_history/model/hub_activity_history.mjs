import * as Constants from "../../../../config/global_constant.mjs";
import Tables from '../../../../config/database_tables.mjs';
import { isPost, configDatatable, newDate, exportToExcel } from "../../../../utils/index.mjs";
import BREADCRUMBS from '../../../../breadcrumbs.mjs';

class HubActivityHistory {
    constructor(db) {
        this.db = db;
        this.collectionDb = db.collection(Tables.HUB_ACTIVITY_HISTORIES);
        
        // Export tracking variables
        this.exportNumber = 0;
        this.exportFilterConditions = {};
        this.exportSortConditions = {};
        this.exportCommonConditions = {};
        this.exportSortConditions[this.exportNumber] = {_id: Constants.SORT_DESC};
    }

    /**
     * Function to get hub activity history list
     *
     * @param req	As Request Data
     * @param res	As Response Data
     * @param next 	As Callback argument to the middleware function
     *
     * @return render/json
     */
    async getHubActivityHistoryList(req, res, next) {
        try {
            if(isPost(req)){
                let limit = (req.body.length) ? parseInt(req.body.length) : Constants.ADMIN_LISTING_LIMIT;
                let skip = (req.body.start) ? parseInt(req.body.start) : Constants.DEFAULT_SKIP;
                let exportCount = (req.body.export_count) ? req.body.export_count : 0;
                let fromDate = (req.body.fromDate) ? req.body.fromDate : "";
                let toDate = (req.body.toDate) ? req.body.toDate : "";
                
                let commonConditions = {};

                /** Configure Datatable conditions*/
                const dataTableConfig = await configDatatable(req, res, null);
                dataTableConfig.conditions = Object.assign(dataTableConfig.conditions, commonConditions);

                /** Condition for date */
                if (fromDate != "" && toDate != "") {
                    dataTableConfig.conditions["created"] = {
                        $gte: newDate(fromDate),
                        $lte: newDate(toDate),
                    };
                }

                /** Set conditions for export report **/
                this.exportCommonConditions = commonConditions;
                this.exportFilterConditions[exportCount] = dataTableConfig.conditions;
                this.exportSortConditions[exportCount] = dataTableConfig.sort_conditions;

                // Get list and counts using aggregation with $facet
                let dbRes = await this.collectionDb.aggregate([
                    {$match: dataTableConfig.conditions},                    
                    {$facet: {
                        list: [
                            {$sort: dataTableConfig.sort_conditions},
                            {$skip: skip},
                            {$limit: limit},
                            {$lookup: {
                                from: Tables.USERS,
                                localField: "user_id",
                                foreignField: "_id",
                                as: "user_details",
                            }},
                            {$project: {
                                _id: 1,
                                old_value: 1, 
                                name: 1, 
                                action: 1,
                                old_values: 1,
                                new_values: 1, 
                                new_hub_name: 1,
                                old_hub_name: 1,
                                new_link_name: 1,
                                old_link_name: 1,
                                branch_name: 1,
                                created: 1, 
                                user_name: {$arrayElemAt: ["$user_details.full_name", 0]}
                            }},
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
                    data: dbRes?.[0]?.list || [],
                    recordsTotal: dbRes?.[0]?.count?.[0]?.count || 0,
                    recordsFiltered: dbRes?.[0]?.count?.[0]?.count || 0,
                });
            } else {
                this.exportNumber++;
                req.breadcrumbs(BREADCRUMBS["admin/hub_activity_history/list"]);
                res.render('list', {export_count: this.exportNumber});
            }
        } catch (error) {
            next(error);
        }
    }

    /**
     * Function for export hub activity history data
     *
     * @param req 	As Request Data
     * @param res 	As Response Data
     * @param next 	As Callback argument to the middleware function
     *
     * @return render/json
     */
    async exportHubActivityHistoryData(req, res, next) {
        try {
            let exportType = (req.params.export_type) ? req.params.export_type : "";
            let exportCount = (req.params.export_count) ? req.params.export_count : 0;

            /** conditions **/
            let filterCondition = this.exportFilterConditions?.[exportCount] || {};
            let sortConditions = this.exportSortConditions?.[exportCount] || (this.exportSortConditions?.[0] || {_id: Constants.SORT_DESC});
            let conditions = (exportType == Constants.EXPORT_FILTERED) ? filterCondition : this.exportCommonConditions;

            /** Get hub activity history details **/
            const result = await this.collectionDb.aggregate([
                {$match: conditions},
                {$sort: sortConditions},
                {$lookup: {
                    from: Tables.USERS,
                    localField: "user_id",
                    foreignField: "_id",
                    as: "user_details",
                }},
                {$project: {
                    _id: 1,
                    old_value: 1, 
                    name: 1, 
                    action: 1,
                    old_values: 1,
                    new_values: 1, 
                    new_hub_name: 1,
                    old_hub_name: 1,
                    new_link_name: 1,
                    old_link_name: 1,
                    branch_name: 1,
                    created: 1, 
                    user_name: {$arrayElemAt: ["$user_details.full_name", 0]}
                }}
            ]).toArray();

            let commonColls = [
                res.__("admin.hub_activity_history.hub_name"),
                res.__("admin.hub_activity_history.action"),
                res.__("admin.hub_activity_history.old_values"),
                res.__("admin.hub_activity_history.new_values"),
                res.__("admin.hub_activity_history.user"),
                res.__("admin.hub_activity_history.action_date")
            ];

            let temp = [];
            if(result && result.length > 0){
                result.map(records => {
                    let action = (records.action) ? records.action : '';
                    let oldValue = "";

                    /** Get old values **/
                    switch(action){
                        case Constants.DELETE_HUB:
                        case Constants.DELETE_BRANCH_LINK:
                            oldValue = "";
                            break;
                        case Constants.HUB_CREATION:
                        case Constants.UPDATE_HUB:
                            let hubNameEn = (records.old_hub_name && records.old_hub_name.en) ? res.__('admin.hub_activity_history.hub_name_en') + " : " + records.old_hub_name.en + ", " : "";
                            let hubNameAr = (records.old_hub_name && records.old_hub_name.ar) ? res.__('admin.hub_activity_history.hub_name_ar') + " : " + records.old_hub_name.ar : "";
                            oldValue = hubNameEn + hubNameAr;
                            break;
                        case Constants.BRANCH_LINK_CREATION:
                        case Constants.UPDATE_BRANCH_LINK:
                            let linkNameEn = (records.old_link_name && records.old_link_name.en) ? res.__('admin.hub_activity_history.link_name_en') + " : " + records.old_link_name.en + ", " : "";
                            let linkNameAr = (records.old_link_name && records.old_link_name.ar) ? res.__('admin.hub_activity_history.link_name_ar') + " : " + records.old_link_name.ar + ", " : "";
                            let branchName = (records.old_values && records.old_values.en) ? res.__('admin.hub_activity_history.branches') + " : " + records.old_values.en : "";
                            oldValue = linkNameEn + linkNameAr + branchName;
                            break;
                        case Constants.AREA_LINKING:
                            oldValue = (records.old_values) ? records.old_values : "";
                            break;
                        case Constants.UPDATE_PARAMETERS:
                            oldValue = (records.old_values.length > 0) ? records.old_values.join(', ') : "";
                            break;
                        case Constants.UPDATE_ORDER_SLABS:
                            let branchNameEn = (records.branch_name && records.branch_name.en) ? res.__('admin.hub_activity_history.branch_name_en') + " : " + records.branch_name.en + ", " : "";
                            let branchNameAr = (records.branch_name && records.branch_name.ar) ? res.__('admin.hub_activity_history.link_name_ar') + " : " + records.branch_name.ar + ", " : "";
                            let oldValues = (records.old_values.length > 0) ? records.old_values.join(', ') : "";
                            oldValue = branchNameEn + branchNameAr + oldValues;
                            break;
                    }

                    /** Get new values **/
                    let newValue = "";
                    switch(action){
                        case Constants.DELETE_HUB:
                        case Constants.DELETE_BRANCH_LINK:
                            newValue = "";
                            break;
                        case Constants.HUB_CREATION:
                        case Constants.UPDATE_HUB:
                            let hubNameEn = (records.new_hub_name && records.new_hub_name.en) ? res.__('admin.hub_activity_history.hub_name_en') + " : " + records.new_hub_name.en + ", " : "";
                            let hubNameAr = (records.new_hub_name && records.new_hub_name.ar) ? res.__('admin.hub_activity_history.hub_name_ar') + " : " + records.new_hub_name.ar : "";
                            newValue = hubNameEn + hubNameAr;
                            break;
                        case Constants.BRANCH_LINK_CREATION:
                        case Constants.UPDATE_BRANCH_LINK:
                            let linkNameEn = (records.new_link_name && records.new_link_name.en) ? res.__('admin.hub_activity_history.link_name_en') + " : " + records.new_link_name.en + ", " : "";
                            let linkNameAr = (records.new_link_name && records.new_link_name.ar) ? res.__('admin.hub_activity_history.link_name_ar') + " : " + records.new_link_name.ar + ", " : "";
                            let branchName = (records.new_values && records.new_values.en) ? res.__('admin.hub_activity_history.branches') + " : " + records.new_values.en : "";
                            newValue = linkNameEn + linkNameAr + branchName;
                            break;
                        case Constants.AREA_LINKING:
                            newValue = (records.new_values) ? records.new_values : "";
                            break;
                        case Constants.UPDATE_PARAMETERS:
                            newValue = (records.new_values.length > 0) ? records.new_values.join(', ') : "";
                            break;
                        case Constants.UPDATE_ORDER_SLABS:
                            let branchNameEn = (records.branch_name && records.branch_name.en) ? res.__('admin.hub_activity_history.branch_name_en') + " : " + records.branch_name.en + ", " : "";
                            let branchNameAr = (records.branch_name && records.branch_name.ar) ? res.__('admin.hub_activity_history.link_name_ar') + " : " + records.branch_name.ar + ", " : "";
                            let newValues = (records.new_values.length > 0) ? records.new_values.join(', ') : "";
                            newValue = branchNameEn + branchNameAr + newValues;
                            break;
                    }

                    let buffer = [
                        (records.name) ? records.name[Constants.DEFAULT_LANGUAGE_CODE] : "",
                        (records.action) ? Constants.HUB_ACTION[records.action] : "",
                        (oldValue) ? oldValue : "",
                        (newValue) ? newValue : "",
                        (records.user_name) ? records.user_name : "",
                        (records.created) ? newDate(records.created, Constants.AM_PM_FORMAT_WITH_DATE) : "",
                    ];
                    temp.push(buffer);
                });
            }

            /** Function to export data in excel format **/
            exportToExcel(req, res, {
                file_prefix: "HubActivityHistoryReport",
                heading_columns: commonColls,
                export_data: temp
            });
        } catch (error) {
            next(error);
        }
    }
}

export default HubActivityHistory; 