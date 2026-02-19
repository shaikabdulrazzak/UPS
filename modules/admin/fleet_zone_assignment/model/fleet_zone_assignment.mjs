import { ObjectId } from 'mongodb';
import * as Constants from '../../../../config/global_constant.mjs';
import Tables from '../../../../config/database_tables.mjs';
import { isPost, getDropdownList, getUtcDate, arrayToObject, newDate, getDateRange } from '../../../../utils/index.mjs';
import BREADCRUMBS from '../../../../breadcrumbs.mjs';
import { saveSystemLogs } from '../../../../services/index.mjs';
import clone from 'clone';
import {parallel as asyncParallel,  each as  asyncEach} from 'async';

// Model for Fleet Area Assignment
class FleetAreaAssignment {
    constructor(db) {
        this.db = db;
        this.collectionDb = db.collection(Tables.FLEET_AREAS); // Use constant for collection name
    }

    /**
     * Get fleet area assignment list (GET and POST)
     */
    async getAreaList(req, res, next) {
        try {
            const authUserRoleId = req.session.user.user_role_id;
            if (isPost(req)) {
                const fromDate = req.body.from_date || '';
                const toDate = req.body.to_date || '';
                const userId = req.body.user_id || '';
                // Get fleet assignment details
                const response = await this.fleetAreaDetails(req, res, next, { from_date: fromDate, to_date: toDate, user_id: userId });
                if (response.status !== Constants.STATUS_SUCCESS) {
                    return res.send({
                        status: Constants.STATUS_ERROR,
                        message: res.__('admin.system.invalid_access')
                    });
                }
                // Render assignment page
                return res.render('assign_area', {
                    layout: false,
                    user_data: response.user_data,
                    fleet_availablity: response.fleet_availablity,
                    choose_date: response.choose_date,
                    from_date: fromDate,
                    to_date: toDate,
                    parent_id: userId
                });
            } else {
                asyncParallel({
                    user_list: (callback) => {
                        if (authUserRoleId !== Constants.CRAVEZ) return callback(null, '');
                        let userConditions = clone(Constants.ADMIN_USER_COMMON_CONDITIONS);
                        userConditions.team_head = true;
                        userConditions.user_role_id = Constants.FLEET;
                        let options = {
                            collections: [{
                                collection: Tables.USERS,
                                columns: ['_id', 'full_name'],
                                conditions: userConditions
                            }]
                        };
                        getDropdownList(req, res, next, options).then(dropdownResponse => {
                            if (dropdownResponse.status !== Constants.STATUS_SUCCESS) return callback(dropdownResponse.message, '');
                            callback(null, dropdownResponse.final_html_data[0]);
                        }).catch(next);
                    },
                }, (err, response) => {
                    if (err) {
                        req.flash(Constants.STATUS_ERROR, err);
                        return res.redirect(Constants.WEBSITE_ADMIN_URL + 'dashboard');
                    }
                    req.breadcrumbs(BREADCRUMBS['admin/fleet_zone_assignment/list']);
                    res.render('list', {
                        user_list: response.user_list
                    });
                });
            }
        } catch (error) {
            next(error);
        }
    }

    /**
     * Get fleet area assignment details (for a date range and user)
     */
    async fleetAreaDetails(req, res, next, options) {
        try {
            const isTeamHead = req.session.user.team_head || false;
            const authUserRoleId= req.session.user.user_role_id;
            const authId    =   isTeamHead ? req.session.user._id : req.session.user.parent_id;
            const fromDate  =   newDate(options.from_date,Constants.CURRENTDATE_START_DATE_FORMAT);
            const toDate    =   newDate(options.to_date , Constants.CURRENTDATE_END_DATE_FORMAT);
            const userId    =   options.user_id || '';
          
            /** Set conditions */
            let commonConditions = { date: { $gte: newDate(fromDate), $lte: newDate(toDate) } };
            if (authUserRoleId !== Constants.CRAVEZ) commonConditions.parent_id = new ObjectId(authId);
            if (userId) commonConditions.parent_id = new ObjectId(userId);

            let fleetData = [];
            if(authUserRoleId !== Constants.CRAVEZ || userId){
                fleetData = await this.collectionDb.aggregate([
                    {$match: commonConditions },
                    {$lookup: {
                        from: Tables.USERS,
                        localField: "user_id",
                        foreignField: "_id",
                        as: "user_detail",
                    }},
                    { $addFields: {
                        zone_ids: { $ifNull: ["$zone_ids", []] }
                    }},
                    {$lookup: {
                        from: Tables.ZONES,
                        let: { zonesIds: "$zone_ids" },
                        pipeline: [
                            { $match: {
                                $expr: {
                                    $and: [
                                        { $in: ["$_id", "$$zonesIds"] },
                                    ],
                                },
                            }},
                            { $lookup: {
                                from: Tables.HUBS,
                                let: { hubIds: "$hub_ids" },
                                pipeline: [
                                    { $match: {
                                        $expr: {
                                            $and: [
                                                { $in: ["$_id", "$$hubIds"] },
                                            ],
                                        },
                                    }},
                                    { $group: {
                                        _id: null,
                                        hubs_list: { $push: `$name.${Constants.DEFAULT_LANGUAGE_CODE}` }
                                    }},
                                ],
                                as: "hubdetails"
                            }},
                            { $group: {
                                _id: null,
                                zone_names: { $push: `$name.${Constants.DEFAULT_LANGUAGE_CODE}` },
                                hubs_name: { $push: { $arrayElemAt: ["$hubdetails.hubs_list", 0] } }
                            }},
                            { $addFields: {
                                hubs_name: {
                                    $reduce: {
                                        input: "$hubs_name",
                                        initialValue: [],
                                        in: { $concatArrays: ["$$value", "$$this"] }
                                    }
                                }
                            }},
                        ],
                        as: "hub_data"
                    }},
                    {$project: {
                        _id: 1, date: 1, user_id: 1, city_id: 1, area_ids: 1,
                        hubs_name: { $arrayElemAt: ["$hub_data.hubs_name", 0] },
                        user_name: { $arrayElemAt: ["$user_detail.full_name", 0] },
                        zone_data: { $arrayElemAt: ["$hub_data.zone_names", 0] },
                    }},
                ]).toArray();
            }

            // Build the result structure
            let userFleets = [];
            const dates = getDateRange(new Date(fromDate), new Date(toDate));
            let chooseDate = [];
            dates.forEach((assignmentDate) => {
                let date = newDate(assignmentDate, Constants.DATABASE_DATE_FORMAT);
                chooseDate.push(date);
                fleetData.forEach((fleetTime) => {
                    let dbDate = newDate(fleetTime.date, Constants.DATABASE_DATE_FORMAT);
                    let areaDataId = fleetTime._id ? fleetTime._id : "";
                    let userId = fleetTime.user_id ? String(fleetTime.user_id) : "";
                    if (date === dbDate) {
                        if (!userFleets[userId]) userFleets[userId] = {};
                        if (userFleets[userId]) {
                            userFleets[userId].name = fleetTime.user_name;
                            userFleets[userId].user_email = fleetTime.user_email;
                        }
                        if (userFleets[userId]) userFleets[userId][dbDate] = {
                            zone: fleetTime.zone_data,
                            hubs: fleetTime.hubs_name,
                            status: fleetTime.status,
                            id: areaDataId
                        };
                    }
                });
            });
            return {
                fleet_availablity: userFleets,
                choose_date: chooseDate,
                status: Constants.STATUS_SUCCESS,
            };
        } catch (error) {
            next(error);
        }
    }

    /**
     * Add or edit fleet area assignment
     */
    async assignArea(req, res, next) {
        const editable = !!req.params.id;
        const fleetAreaId = req.params.id ? new ObjectId(req.params.id) : new ObjectId();
        const isTeamHead = req.session.user.team_head ? req.session.user.team_head : false;
        const authUserRoleId = req.session.user.user_role_id;
        const authId = (isTeamHead || authUserRoleId === Constants.CRAVEZ) ? req.session.user._id : req.session.user.parent_id;
        const addedBy = (req.session.user && req.session.user._id) ? req.session.user._id : "";

        try {
            if (isPost(req)) {
                // Data is already validated and sanitized by express-validator and sanitizeData middleware
                const fromDate = req.body.from_date || "";
                const toDate = req.body.to_date || "";
                let areaArray = [];
                let areaUser = req.body.user_name ? req.body.user_name : [];
                let zoneIds = req.body.zone_id ? req.body.zone_id : [];

                // Ensure arrays
                if (!Array.isArray(areaUser)) areaUser = [areaUser];
                if (!Array.isArray(zoneIds)) zoneIds = [zoneIds];

                // Get date range
                const dates = getDateRange(new Date(fromDate), new Date(toDate));
                let chooseDate = "";
                dates.forEach((assignmentDate) => {
                    chooseDate = newDate(assignmentDate, Constants.DATABASE_DATE_FORMAT);
                    areaUser.forEach((areaUserId) => {
                        areaArray.push({
                            user_id: new ObjectId(areaUserId),
                            zone_ids: arrayToObject(zoneIds),
                            parent_id: new ObjectId(authId),
                            added_by: new ObjectId(addedBy),
                            date: getUtcDate(chooseDate + " " + Constants.END_DATE_TIME_FORMAT),
                            created: getUtcDate()
                        });
                    });
                });

                // Upsert each zone assignment
                for (const records of areaArray) {
                    await this.collectionDb.updateOne(
                        {
                            date: records.date,
                            parent_id: records.parent_id,
                            user_id: records.user_id,
                        },
                        {
                            $set: {
                                zone_ids: records.zone_ids,
                            },
                            $setOnInsert: {
                                added_by: records.added_by,
                                created: getUtcDate(),
                            },
                        },
                        { upsert: true }
                    );
                }

                // Send success response
                const message = editable
                    ? res.__("admin.fleet_zone_assignment.zone_has_been_updated_successfully")
                    : res.__("admin.fleet_zone_assignment.zone_has_been_assigned_successfully");
                res.send({
                    status: Constants.STATUS_SUCCESS,
                    redirect_url: Constants.WEBSITE_ADMIN_URL + "fleet_area_assignment",
                    message: message,
                });

                // Save system logs
                await saveSystemLogs(req, res, {
                    user_id: authId,
                    parent_id: fleetAreaId,
                    activity_module: Constants.SYSTEM_LOG_MODULE_FLEET_AREA_ASSIGNMENT,
                    activity_type: Constants.ACTIVITY_TYPE_ASSIGN,
                    additional_details: {}
                });
            } else {
                // Render add/edit form
                let areaResponse = {};
                if (editable) {
                    areaResponse = await this.getAreaDetails(req, res, next);
                    if (areaResponse.status !== Constants.STATUS_SUCCESS) {
                        req.flash(Constants.STATUS_ERROR, areaResponse.message);
                        return res.redirect(Constants.WEBSITE_ADMIN_URL + "fleet_area_assignment");
                    }
                }

                await new Promise((resolve, reject) => {
                    asyncParallel({
                        members: (callback) => {
                            let selectedUser = (areaResponse.result && areaResponse.result.user_id) ? areaResponse.result.user_id : '';
                            let selectedzones = (areaResponse.result && areaResponse.result.zone_ids) ? areaResponse.result.zone_ids : [];
                            let conditions = clone(Constants.ADMIN_USER_COMMON_CONDITIONS);
                            conditions.parent_id = new ObjectId(authId);
                            let options = {
                                collections: [
                                    {
                                        collection: Tables.USERS,
                                        columns: ["_id", "full_name"],
                                        selected: [selectedUser],
                                        conditions: conditions
                                    },
                                    {
                                        collection: Tables.ZONES,
                                        columns: ["_id", ["name", Constants.DEFAULT_LANGUAGE_CODE]],
                                        selected: selectedzones,
                                        conditions: { is_deleted: Constants.NOT_DELETED },
                                    },
                                ]
                            };
                            getDropdownList(req, res, next, options).then(response => {
                                callback(null, response);
                            });
                        },
                    }, (err, response) => {
                        if (err) return reject(err);
                        let usersList = (response.members && response.members.final_html_data["0"]) ? response.members.final_html_data["0"] : '';
                        let zonesList = (response.members && response.members.final_html_data["1"]) ? response.members.final_html_data["1"] : '';
                        res.render('add_edit', {
                            result: (areaResponse.result) ? areaResponse.result : {},
                            is_editable: editable,
                            users_list: usersList,
                            zones: zonesList,
                            layout: false
                        });
                        resolve();
                    });
                });
            }
        } catch (error) {
            next(error);
        }
    }

    /**
     * Get details for a single fleet area assignment (for edit)
     */
    async getAreaDetails(req, res, next) {
        try {
            const isTeamHead = req.session.user.team_head || false;
            const authUserRoleId = req.session.user.user_role_id;
            const authId = (isTeamHead || authUserRoleId === Constants.CRAVEZ) ? req.session.user._id : req.session.user.parent_id;
            const areaId = req.params.id || '';
            const result = await this.collectionDb.findOne({
                _id: new ObjectId(areaId),
                parent_id: new ObjectId(authId),
            }, { projection: { _id:1,date:1,user_id:1,zone_ids:1 } });
            
            if (!result) {
                return { status: Constants.STATUS_ERROR, message: res.__('admin.system.invalid_access') };
            }
            return { status: Constants.STATUS_SUCCESS, result };
        } catch (err) {
            next(err);
        }
    }
}

export default FleetAreaAssignment; 