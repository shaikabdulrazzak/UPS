import { ObjectId } from 'mongodb';

import * as Constants from "../../../../config/global_constant.mjs";
import Tables from "../../../../config/database_tables.mjs";
import { isPost, getUtcDate, configDatatable, sanitizeData, getDropdownList, getUniqueId, arrayToObject } from "../../../../utils/index.mjs";
import { saveSystemLogs } from "../../../../services/index.mjs";
import BREADCRUMBS from '../../../../breadcrumbs.mjs';

export default class Zone {
    constructor(db) {
        this.db = db;
        this.zonesCollection = db.collection(Tables.ZONES);
    }

    /**
     * Function to get zone list
     *
     * @param req	As Request Data
     * @param res	As Response Data
     * @param next 	As Callback argument to the middleware function
     *
     * @return render/json
     */
    async getZonesList(req, res, next) {
        try {
            if (isPost(req)) {
                const limit = (req.body.length) ? parseInt(req.body.length) : Constants.ADMIN_LISTING_LIMIT;
                const skip = (req.body.start) ? parseInt(req.body.start) : Constants.DEFAULT_SKIP;
                const hubIds = (req.body.hub_ids) ? req.body.hub_ids : '';

                const commonCondition = { is_deleted: Constants.NOT_DELETED, is_active: Constants.ACTIVE };
                
                /** Configure Datatable conditions */
                const dataTableConfig = await configDatatable(req, res, null);
                dataTableConfig.conditions = Object.assign(dataTableConfig.conditions, commonCondition);

                /** Set hub condition **/
                if (hubIds) {
                    dataTableConfig.conditions['hub_ids'] = { $in: arrayToObject(hubIds) };
                }

                // Get list or count of zones 
                let dbRes = await this.zonesCollection.aggregate([
                    { $match: dataTableConfig.conditions },
                    {$facet : {
                        list : [
                            {$sort: dataTableConfig.sort_conditions },
                            {$skip: skip },
                            {$limit: limit },
                            {$lookup: {
                                from: Tables.HUBS,
                                let: { hubIds: "$hub_ids" },
                                pipeline: [
                                    {
                                        $match: {
                                            $expr: {
                                                $and: [
                                                    { $in: ["$_id", "$$hubIds"] }
                                                ]
                                            }
                                        }
                                    },
                                    {
                                        $group: {
                                            _id: null,
                                            names: { $push: "$name." + Constants.DEFAULT_LANGUAGE_CODE }
                                        }
                                    }
                                ],
                                as: "hub_data"
                            }},
                            {$project: {
                                _id: 1,
                                name: 1,
                                is_active: 1,
                                zone_id: 1,
                                hub_data: { $arrayElemAt: ["$hub_data.names", 0] }
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
            } else {
                /** Get dropdown options for hub list **/
                const response = await getDropdownList(req, res, next, {
                    collections: [{
                        collection: Tables.HUBS,
                        columns: ["_id", ["name", Constants.DEFAULT_LANGUAGE_CODE]]
                    }]
                });

                if (response.status != Constants.STATUS_SUCCESS) {
                    /** Send error response **/
                    req.flash(Constants.STATUS_ERROR, response.message);
                    return res.redirect(Constants.WEBSITE_ADMIN_URL + "dashboard");
                }

                /** render zone listing page **/
                req.breadcrumbs(BREADCRUMBS['admin/zones/list']);
                res.render('list', {
                    hub_list: response?.final_html_data?.[0] || ""
                });
            }
        } catch (error) {
            next(error);
        }
    }

    /**
     * Function to get zone detail
     *
     * @param req	As Request Data
     * @param res	As Response Data
     * @param next 	As Callback argument to the middleware function
     *
     * @return json
     */
    async getZoneDetails(req, res, next) {
        try {
            const zoneId = req.params.id || "";

            /** Get zone details **/
            const result = await this.zonesCollection.findOne({
                _id: new ObjectId(zoneId)
            }, {
                projection: { _id: 1, name: 1, hub_ids: 1 }
            });

            /** Send error response */
            if (!result) {
                return {
                    status: Constants.STATUS_ERROR,
                    message: res.__("admin.system.invalid_access")
                };
            }

            /** Send success response **/
            return {
                status: Constants.STATUS_SUCCESS,
                result: result
            };
        } catch (error) {
            throw error;
        }
    }

    /**
     * Function for add or update zone
     *
     * @param req 	As Request Data
     * @param res 	As Response Data
     * @param next 	As Callback argument to the middleware function
     *
     * @return render/json
     */
    async addEditZone(req, res, next) {
        try {
            const isEditable = (req.params.id) ? true : false;
            const zoneId = (req.params.id) ? new ObjectId(req.params.id) : new ObjectId();

            if (isPost(req)) {
                /** Sanitize Data **/
                req.body = sanitizeData(req.body, Constants.NOT_ALLOWED_TAGS_XSS);

                const nameEnglish = req.body.name_english ? req.body.name_english : "";
                const nameArabic = req.body.name_arabic ? req.body.name_arabic : "";
                const hubIds = (req.body.hub_ids instanceof Array) ? arrayToObject(req.body.hub_ids) : [new ObjectId(req.body.hub_ids)];

                let zoneUniqueId = "";
                if (!isEditable) {
                    /** get zone unique id **/
                    const uniqueIdResponse = await getUniqueId(req, res, next, { type: "zones" });
                    zoneUniqueId = uniqueIdResponse.result;
                }

                /** set data in object **/
                const updateData = {
                    name: {
                        ar: nameArabic,
                        en: nameEnglish
                    },
                    hub_ids: arrayToObject(hubIds),
                    modified: getUtcDate()
                };

                /** Save zone details **/
                await this.zonesCollection.updateOne({
                    _id: zoneId
                }, {
                    $set: updateData,
                    $setOnInsert: {
                        added_by: req.session.user._id,
                        zone_id: zoneUniqueId,
                        is_active: Constants.ACTIVE,
                        is_deleted: Constants.NOT_DELETED,
                        created: getUtcDate()
                    }
                }, { upsert: true });

                /** save System logs */
                await saveSystemLogs(req, res, {
                    user_id: req.session.user._id,
                    parent_id: zoneId,
                    activity_module: Constants.SYSTEM_LOG_MODULE_ZONES,
                    activity_type: Constants.ACTIVITY_TYPE_ADD_EDIT,
                    additional_details: {}
                });

                /** Send success response **/
                const message = (isEditable) ? 
                    res.__("admin.zones.zone_has_been_updated_successfully") : 
                    res.__("admin.zones.zone_has_been_added_successfully");
                
                if (!isEditable) {
                    req.flash(Constants.STATUS_SUCCESS, message);
                }
                
                res.send({
                    status: Constants.STATUS_SUCCESS,
                    redirect_url: Constants.WEBSITE_ADMIN_URL + "zones",
                    message: message,
                    current_id: zoneId
                });
            } else {
                let response = {};
                if (isEditable) {
                    /** Get zone details **/
                    response = await this.getZoneDetails(req, res, next);

                    /** Send error response **/
                    if (response.status != Constants.STATUS_SUCCESS) return res.status(400).send(response);
                }

                const result = (response.result) ? response.result : {};
                const hubIds = (result.hub_ids) ? arrayToObject(result.hub_ids) : [];

                /** Get all hub ids except current zone hub link ids */
                const zoneResult = await this.zonesCollection.aggregate([
                    {$match: {
                        _id: { $ne: zoneId },
                        is_deleted: Constants.NOT_DELETED,
                        is_active: Constants.ACTIVE
                    }},
                    {$unwind: '$hub_ids' },
                    {
                        $group: {
                            _id: 'hub_ids',
                            hub_ids: { $addToSet: '$hub_ids' }
                        }
                    }
                ]).toArray();

                const excludeHubIds = (zoneResult.length > 0 && zoneResult[0].hub_ids) ? zoneResult[0].hub_ids : [];

                /** Get zone list **/
                const dropDownResponse = await getDropdownList(req, res, next, {
                    collections: [{
                        collection: Tables.HUBS,
                        columns: ["_id", ["name", Constants.DEFAULT_LANGUAGE_CODE]],
                        conditions: {
                            _id: { $nin: excludeHubIds },
                            is_deleted: Constants.NOT_DELETED,
                            is_active: Constants.ACTIVE
                        },
                        selected: hubIds
                    }]
                });
                
                /** Send error response **/
                if (dropDownResponse.status != Constants.STATUS_SUCCESS) return res.status(400).send(dropDownResponse);
                
                /** Render edit page  **/
                const breadcrumbs = (isEditable) ? 'admin/zones/edit' : 'admin/zones/add';
                req.breadcrumbs(BREADCRUMBS[breadcrumbs]);
                res.render('add_edit', {
                    layout: false,
                    result: result,
                    is_editable: isEditable,
                    hub_list: dropDownResponse?.final_html_data?.[0] || ""
                });
            }
        } catch (error) {
            next(error);
        }
    }

    /**
     * Function for delete zone
     *
     * @param req As Request Data
     * @param res As Response Data
     *
     * @return null
     */
    async deleteZone(req, res, next) {
        try {
            /** Delete zone */
            await this.zonesCollection.updateOne({
                _id: new ObjectId(req.params.id)
            }, {
                $set: {
                    is_deleted: Constants.DELETED,
                    deleted_at: getUtcDate(),
                    modified: getUtcDate(),
                    deleted_by: new ObjectId(req.session.user._id)
                }
            });

            /** Send success response **/
            req.flash(Constants.STATUS_SUCCESS, res.__("admin.zones.zone_deleted_successfully"));
            res.redirect(Constants.WEBSITE_ADMIN_URL + "zones");

            /** Save system logs */
            await saveSystemLogs(req, res, {
                user_id: req.session.user._id,
                parent_id: req.params.id,
                activity_module: Constants.SYSTEM_LOG_MODULE_ZONES,
                activity_type: Constants.ACTIVITY_TYPE_DELETE,
                additional_details: {}
            });
        } catch (error) {
            next(error);
        }
    }
} 