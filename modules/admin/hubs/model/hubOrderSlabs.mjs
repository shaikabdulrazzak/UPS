import { ObjectId } from 'mongodb';
import * as Constants from '../../../../config/global_constant.mjs';
import Tables from '../../../../config/database_tables.mjs';
import { isPost, getDropdownList, getUtcDate, arrayToObject, sanitizeData } from '../../../../utils/index.mjs';
import Hubs from './hubs.mjs';

// Model for Hub order slabs
class HubOrderSlabs {
    constructor(db) {
        this.db             =   db;
        this.hubModule      =   new Hubs(db);
        this.collectionDb   =   db.collection(Tables.HUB_ORDER_SLABS); // Use constant for collection name
    }   

    /**
	 * Function for getting hub order slabs list
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 * @param next 	As Callback argument to the middleware function
	 *
	 * @return render/json
	 *
	 */
	async orderSlabs(req, res, next) {
		try {
			let hubId = req.params.id ? new ObjectId(req.params.id) : "";

			/**Get branch ids on the basis of hub_id */
            let hubRes = await this.hubModule._getHubDetails(req, res, next);
            if(hubRes.status != Constants.STATUS_SUCCESS) return res.status(400).send(hubRes);

            let hubData         =   hubRes?.result || {};
            let hubBranchIds    =   hubData?.branches || [];
            let branchId        =   hubData?.branches?.[0] || "";
            if(branchId.constructor != Array) branchId = [branchId];

			/**Get branch list **/
			let dropDownResponse = await getDropdownList(req, res, next, {
				collections: [{
					collection: Tables.RESTAURANT_BRANCHES,
					columns: ["_id", ["name", Constants.DEFAULT_LANGUAGE_CODE]],
					selected: branchId,
					conditions: {
						_id: { $in: arrayToObject(hubBranchIds) },
						is_active: Constants.ACTIVE
					},
				}]
			});

			/** Send error response **/
			if (dropDownResponse.status != Constants.STATUS_SUCCESS) return res.status(400).send(dropDownResponse);

			/** render order list page */
			res.render('order_list', {
				layout: false,
				hub_id: hubId,
				result: {},
				branch_list: dropDownResponse?.final_html_data?.["0"] || ""
			});
		} catch (err) {
			return next(err);
		}
	}

	/**
	 * Function for add and edit order slabs details
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 * @param next 	As Callback argument to the middleware function
	 *
	 * @return render/json
	 */
	async addEditOrderSlabs(req, res, next) {
		try {
			let hubId = req.params.hub_id ? new ObjectId(req.params.hub_id) : "";
			let branchId = req.params.id ? new ObjectId(req.params.id) : "";

			if (isPost(req)) {
				/** Sanitize Data **/
				req.body = sanitizeData(req.body, Constants.NOT_ALLOWED_TAGS_XSS);

				let orderStatus = req.body.order_status ? req.body.order_status : "";
				let firstOrderMin = req.body.first_order_min ? req.body.first_order_min : "";
				let firstOrderMax = req.body.first_order_max ? req.body.first_order_max : "";
				let secondOrderMin = req.body.second_order_min ? req.body.second_order_min : "";
				let secondOrderMax = req.body.second_order_max ? req.body.second_order_max : "";
				let thirdOrderMin = req.body.third_order_min ? req.body.third_order_min : "";
				let thirdOrderMax = req.body.third_order_max ? req.body.third_order_max : "";
				let fourthOrderMin = req.body.fourth_order_min ? req.body.fourth_order_min : "";
				let fourthOrderMax = req.body.fourth_order_max ? req.body.fourth_order_max : "";
				let exceedingOrderSlabs = req.body.exceeding_order_slabs ? req.body.exceeding_order_slabs : "";
				let maxExceedingOrderSlabs = req.body.max_exceeding_order_slabs ? req.body.max_exceeding_order_slabs : "";
				
				try {
					/** Get hub order slabs */
					let slabDetail = await this.collectionDb.findOne({ hub_id: hubId, branch_id: branchId });
					
					/** Get hub detail */
					const hubs = this.db.collection(Tables.HUBS);
					let hubDetail = await hubs.findOne({ _id: hubId }, { projection: { _id: 1, name: 1 } });
					
					/** Get branch detail */
					const restaurant_branches = this.db.collection(Tables.RESTAURANT_BRANCHES);
					let branchDetail = await restaurant_branches.findOne({ _id: new ObjectId(branchId) }, { projection: { _id: 1, name: 1 } });

					slabDetail = slabDetail || {};
					hubDetail = hubDetail || '';
					branchDetail = branchDetail || '';

					/* Data for save history logs */
					let oldValues = [
						res.__("admin.hubs.order_slab_status") + ' - ' + (((slabDetail.status || parseInt(slabDetail.status) == 0) && Constants.HUB_PARAMETER_DROPDOWN[slabDetail.status]) ? Constants.HUB_PARAMETER_DROPDOWN[slabDetail.status] : ""),
						res.__("admin.hubs.around_first_order") + ' - Min: ' + ((slabDetail.first_order || (slabDetail.first_order && parseInt(slabDetail.first_order.min) == 0)) ? slabDetail.first_order.min : 'N/A'),
						res.__("admin.hubs.around_first_order") + ' - Max: ' + ((slabDetail.first_order || (slabDetail.first_order && parseInt(slabDetail.first_order.max) == 0)) ? slabDetail.first_order.max : 'N/A'),
						res.__("admin.hubs.around_second_order") + ' - Min: ' + ((slabDetail.second_order || (slabDetail.second_order && parseInt(slabDetail.second_order.min) == 0)) ? slabDetail.second_order.min : 'N/A'),
						res.__("admin.hubs.around_second_order") + ' - Max: ' + ((slabDetail.second_order || (slabDetail.second_order && parseInt(slabDetail.second_order.max) == 0)) ? slabDetail.second_order.max : 'N/A'),
						res.__("admin.hubs.around_third_order") + ' - Min: ' + ((slabDetail.third_order || (slabDetail.third_order && parseInt(slabDetail.third_order.min) == 0)) ? slabDetail.third_order.min : 'N/A'),
						res.__("admin.hubs.around_third_order") + ' - Max: ' + ((slabDetail.third_order || (slabDetail.third_order && parseInt(slabDetail.third_order.max) == 0)) ? slabDetail.third_order.max : 'N/A'),
						res.__("admin.hubs.around_fourth_order_and_above") + ' - Min: ' + ((slabDetail.fourth_order_and_above || (slabDetail.fourth_order_and_above && parseInt(slabDetail.fourth_order_and_above.min) == 0)) ? slabDetail.fourth_order_and_above.min : 'N/A'),
						res.__("admin.hubs.around_fourth_order_and_above") + ' - Max: ' + ((slabDetail.fourth_order_and_above || (slabDetail.fourth_order_and_above && parseInt(slabDetail.fourth_order_and_above.max) == 0)) ? slabDetail.fourth_order_and_above.max : 'N/A'),
						res.__("admin.hubs.exceeding_order_slabs") + ' - ' + ((slabDetail.exceeding_order_slab || parseInt(slabDetail.exceeding_order_slab) == 0) ? slabDetail.exceeding_order_slab : 'N/A'),
						res.__("admin.hubs.max_exceeding_order_slabs") + ' - ' + ((slabDetail.max_exceeding_order_slab || parseInt(slabDetail.max_exceeding_order_slab) == 0) ? slabDetail.max_exceeding_order_slab : 'N/A')
					];

					let newValues = [
						res.__("admin.hubs.order_slab_status") + ' - ' + (((orderStatus || parseInt(orderStatus) == 0) && Constants.HUB_PARAMETER_DROPDOWN[orderStatus]) ? Constants.HUB_PARAMETER_DROPDOWN[orderStatus] : ""),
						res.__("admin.hubs.around_first_order") + ' - Min: ' + ((firstOrderMin || parseInt(firstOrderMin) == 0) ? firstOrderMin : 'N/A'),
						res.__("admin.hubs.around_first_order") + ' - Max: ' + ((firstOrderMax || parseInt(firstOrderMax) == 0) ? firstOrderMax : 'N/A'),
						res.__("admin.hubs.around_second_order") + ' - Min: ' + ((secondOrderMin || parseInt(secondOrderMin) == 0) ? secondOrderMin : 'N/A'),
						res.__("admin.hubs.around_second_order") + ' - Max: ' + ((secondOrderMax || parseInt(secondOrderMax) == 0) ? secondOrderMax : 'N/A'),
						res.__("admin.hubs.around_third_order") + ' - Min: ' + ((thirdOrderMin || parseInt(thirdOrderMin) == 0) ? thirdOrderMin : 'N/A'),
						res.__("admin.hubs.around_third_order") + ' - Max: ' + ((thirdOrderMax || parseInt(thirdOrderMax) == 0) ? thirdOrderMax : 'N/A'),
						res.__("admin.hubs.around_fourth_order_and_above") + ' - Min: ' + ((fourthOrderMin || parseInt(fourthOrderMin) == 0) ? fourthOrderMin : 'N/A'),
						res.__("admin.hubs.around_fourth_order_and_above") + ' - Max: ' + ((fourthOrderMax || parseInt(fourthOrderMax) == 0) ? fourthOrderMax : 'N/A'),
						res.__("admin.hubs.exceeding_order_slabs") + ' - ' + ((exceedingOrderSlabs || parseInt(exceedingOrderSlabs) == 0) ? exceedingOrderSlabs : 'N/A'),
						res.__("admin.hubs.max_exceeding_order_slabs") + ' - ' + ((maxExceedingOrderSlabs || parseInt(maxExceedingOrderSlabs) == 0) ? maxExceedingOrderSlabs : 'N/A')
					];

					/** Update order slab details */
					await this.collectionDb.updateOne({
						hub_id: hubId,
						branch_id: branchId
					}, {
						$set: {
							status: parseInt(orderStatus),
							first_order: {
								min: firstOrderMin ? parseInt(firstOrderMin) : "",
								max: firstOrderMax ? parseInt(firstOrderMax) : ""
							},
							second_order: {
								min: secondOrderMin ? parseInt(secondOrderMin) : "",
								max: secondOrderMax ? parseInt(secondOrderMax) : ""
							},
							third_order: {
								min: thirdOrderMin ? parseInt(thirdOrderMin) : "",
								max: thirdOrderMax ? parseInt(thirdOrderMax) : ""
							},
							fourth_order_and_above: {
								min: fourthOrderMin ? parseInt(fourthOrderMin) : "",
								max: fourthOrderMax ? parseInt(fourthOrderMax) : ""
							},
							exceeding_order_slab: exceedingOrderSlabs ? parseInt(exceedingOrderSlabs) : "",
							max_exceeding_order_slab: maxExceedingOrderSlabs ? parseInt(maxExceedingOrderSlabs) : "",
							modified: getUtcDate(),
						},
						$setOnInsert: {
							created: getUtcDate()
						}
					}, { upsert: true });

					/** Save hub history data */
					this.hubModule.saveHubHistoryData(req, res, {
						user_id: new ObjectId(req.session.user._id),
						hub_id: new ObjectId(hubId),
						action: Constants.UPDATE_ORDER_SLABS,
						name: (hubDetail && hubDetail.name) ? hubDetail.name : "",
						branch_name: (branchDetail && branchDetail.name) ? branchDetail.name : "",
						old_values: (Object.keys(slabDetail).length > 0) ? oldValues : "",
						new_values: newValues
					});

					/** Success response message**/
					let message = res.__("admin.hubs.order_slab_has_been_updated_successfully");
					if (!branchId) req.flash(Constants.STATUS_SUCCESS, message);
					res.send({
						status: Constants.STATUS_SUCCESS,
						message: message,
					});
				} catch (err) {
					return next(err);
				}
			} else {
				/** Get order slab details **/
				let response = await this._getOrderDetails(req, res, next);

				/**Get hub branch linked ids */
				res.render('order_slabs', {
					layout: false,
					hub_id: hubId,
					branch_id: branchId,
					result: response?.result || {}
				});
			}
		} catch (err) {
			return next(err);
		}
	}

	/**
	 * Function to get order slab details
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next 	As Callback argument to the middleware function
	 *
	 * @return json
	 */
	async _getOrderDetails(req, res, next) {
		try {
			let branchId = req.params.id ? new ObjectId(req.params.id) : "";

			/** Get hub order slabs details **/
			let result = await this.collectionDb.findOne({branch_id: branchId});

			/** Send success response **/
			return {
				status: Constants.STATUS_SUCCESS,
				result: result
			};
		} catch (err) {
			return next(err);
		}
	}
}
export default HubOrderSlabs;
