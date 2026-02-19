import { ObjectId } from 'mongodb';
import { isPost, sanitizeData, getUtcDate, getUniqueId, configDatatable } from "../../../../utils/index.mjs";
import * as Constants from "../../../../config/global_constant.mjs";
import Tables from '../../../../config/database_tables.mjs';
import BREADCRUMBS from '../../../../breadcrumbs.mjs';
import { saveSystemLogs} from "../../../../services/index.mjs";

class CancelReason {
    constructor(db) {
        this.db = db;
        this.collectionDb = db.collection(Tables.CANCEL_REASONS);
    }

    async getCancelReasonList(req, res, next) {
        try {
            if (isPost(req)) {
                let limit = (req.body.length) ? parseInt(req.body.length) : Constants.ADMIN_LISTING_LIMIT;
                let skip = (req.body.start) ? parseInt(req.body.start) : Constants.DEFAULT_SKIP;
                const collection = this.collectionDb;

                // Configure Datatable conditions
                const dataTableConfig = await configDatatable(req, res, null);

                // Get reason list and counts
                const dbRes = await collection.aggregate([
                    { $match: dataTableConfig.conditions },
                    {
                        $facet: {
                            reason_list: [
                                { $project: { _id: 1, status: 1, title: 1, reason_id: 1, not_editable: 1, not_deletable: 1 } },
                                { $sort: dataTableConfig.sort_conditions },
                                { $skip: skip },
                                { $limit: limit },
                            ],
                            count: [
                                { $count: "count" }
                            ]
                        }
                    }
                ]).toArray();

                res.send({
                    status: Constants.STATUS_SUCCESS,
                    draw: dataTableConfig.result_draw,
                    data: dbRes?.[0]?.reason_list || [],
                    recordsTotal: dbRes?.[0]?.count?.[0]?.count || 0,
                    recordsFiltered: dbRes?.[0]?.count?.[0]?.count || 0
                });
            } else {
                req.breadcrumbs(BREADCRUMBS['admin/cancel_reason/list']);
                res.render('list');
            }
        } catch (err) {
            next(err);
        }
    }

    async getCancelReasonDetails(req, res, next) {
        try {
            const result = await this.collectionDb.findOne({ _id: new ObjectId(req.params.id) }, {
                projection: { _id: 1, title: 1, status: 1, reason_id: 1 }
            });
            if (!result) {
                return { status: Constants.STATUS_ERROR, message: res.__("admin.system.invalid_access") };
            }
            return { status: Constants.STATUS_SUCCESS, result };
        } catch (err) {
            next(err);
        }
    }

    async addEditCancelReason(req, res, next) {
        try {
            let isEditable = (req.params.id) ? true : false;
            let reasonId = (req.params.id) ? new ObjectId(req.params.id) : new ObjectId();
            let authId = (req.session.user._id) ? req.session.user._id : "";

            if (isPost(req)) {
                req.body = sanitizeData(req.body, Constants.NOT_ALLOWED_TAGS_XSS);
                let titleEnglish = req.body.title_english || "";
                let titleArabic = req.body.title_arabic || "";

                // Get unique id for new reason
                let reasonUniqueId = null;
                if (!isEditable) {
                    const uniqueIdResponse = await getUniqueId(req, res, next, { type: "cancel_reasons" });
                    reasonUniqueId = uniqueIdResponse.result;
                }

                // Save reason details
                await this.collectionDb.updateOne({ _id: reasonId }, {
                    $set: {
                        title: {
                            ar: titleArabic,
                            en: titleEnglish
                        },
                        updated_by: new ObjectId(authId),
                        modified: getUtcDate()
                    },
                    $setOnInsert: {
                        status: Constants.ACTIVE,
                        reason_id: reasonUniqueId,
                        created: getUtcDate()
                    }
                }, { upsert: true });

                let message = (isEditable) ? res.__("admin.cancel_reason.reason_has_been_updated_successfully") : res.__("admin.cancel_reason.cancel_reason_has_been_added_successfully");
                if (!isEditable) req.flash(Constants.STATUS_SUCCESS, message);
                res.send({
                    status: Constants.STATUS_SUCCESS,
                    redirect_url: Constants.WEBSITE_ADMIN_URL + "cancel_reason",
                    message: message,
                    current_id: reasonId
                });

                // Save System logs
                saveSystemLogs(req, res, {
                    user_id: new ObjectId(authId),
                    parent_id: reasonId,
                    activity_module: Constants.SYSTEM_LOG_MODULE_CANCEL_REASON,
                    activity_type: Constants.ACTIVITY_TYPE_ADD_EDIT,
                    additional_details: {}
                });
            } else {
                let response = {};
                if (isEditable) {
                    response = await this.getCancelReasonDetails(req, res, next);
                    if (response.status !== Constants.STATUS_SUCCESS) {
                        return res.status(400).send({ status: Constants.STATUS_ERROR, message: response.message });
                    }
                }
                let result = (response.result) ? response.result : {};
                let breadcrumbs = (isEditable) ? 'admin/cancel_reason/edit' : 'admin/cancel_reason/add';
                req.breadcrumbs(BREADCRUMBS[breadcrumbs]);
                res.render('add_edit', {
                    layout: false,
                    result: result,
                    is_editable: isEditable,
                });
            }
        } catch (err) {
            next(err);
        }
    }

    async updateCancelReasonStatus(req, res, next) {
        try {
            let reasonId = req.params.id;
            let reasonStatus = (req.params.status == Constants.ACTIVE) ? Constants.DEACTIVE : Constants.ACTIVE;
            await this.collectionDb.updateOne({
                _id: new ObjectId(reasonId)
            }, {
                $set: {
                    status: reasonStatus,
                    modified: getUtcDate()
                }
            });
            req.flash(Constants.STATUS_SUCCESS, res.__("admin.cancel_reason.cancel_reason_status_has_been_updated_successfully"));
            res.redirect(Constants.WEBSITE_ADMIN_URL + "cancel_reason");
            saveSystemLogs(req, res, {
                user_id: req.session.user._id,
                parent_id: reasonId,
                activity_module: Constants.SYSTEM_LOG_MODULE_CANCEL_REASON,
                activity_type: Constants.ACTIVITY_TYPE_STATUS_UPDATE,
                additional_details: { status: reasonStatus }
            });
        } catch (err) {
            next(err);
        }
    }

    async deleteReason(req, res, next) {
        try {
            let reasonId = new ObjectId(req.params.id);
            await this.collectionDb.deleteOne({ _id: reasonId });
            req.flash(Constants.STATUS_SUCCESS, res.__("admin.cancel_reason.reason_deleted_successfully"));
            res.redirect(Constants.WEBSITE_ADMIN_URL + "cancel_reason");
            saveSystemLogs(req, res, {
                user_id: req.session.user._id,
                parent_id: reasonId,
                activity_module: Constants.SYSTEM_LOG_MODULE_CANCEL_REASON,
                activity_type: Constants.ACTIVITY_TYPE_DELETE,
            });
        } catch (err) {
            next(err);
        }
    }

    async updateFlags(req, res, next) {
        try {
            let type = req.params.type;
            let id = req.params.id;
            let action = JSON.parse(req.params.action);
            let flagType = (type == "edit") ? "not_editable" : "not_deletable";
            let updateData = { "$set": {}, "$unset": {} };
            if (action) {
                updateData["$set"][flagType] = action;
            } else {
                updateData["$unset"][flagType] = 1;
            }
            await this.collectionDb.updateOne({ _id: new ObjectId(id) }, updateData);
            res.send({ status: Constants.STATUS_SUCCESS });
        } catch (err) {
            next(err);
        }
    }
}

export default CancelReason; 