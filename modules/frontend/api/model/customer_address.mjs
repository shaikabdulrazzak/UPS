import { ObjectId } from 'mongodb';

import * as Constants from '../../../../config/global_constant.mjs';
import Tables from '../../../../config/database_tables.mjs';
import { sanitizeData, getUtcDate, applyValidationInterCallFunction } from '../../../../utils/index.mjs';
import {addEditAddressValidation} from '../validations/addressValidations.mjs';
import registrationModal from './registration.mjs';

class CustomerAddress {
    constructor(db) {
        this.db = db;
        this.registrationAPI = new registrationModal(db);
        this.addressesCollection = db.collection(Tables.CUSTOMER_ADDRESSES);
    }

    /**
     * Function for get address list
     *
     * @param req As Request Data
     * @param res As Response Data
     * @param next As Callback argument to the middleware function
     *
     * @return json
     */
    async getAddressList(req, res, next) {
        try {
            let userId = (req.body.user_id) ? new ObjectId(req.body.user_id) : "";
            let deviceId = (req.body.device_id) ? req.body.device_id : "";
            let restaurantId = (req.body.restaurant_id) ? new ObjectId(req.body.restaurant_id) : "";

            /** Send error response */
            if (!userId && !deviceId) {
                return { status: Constants.STATUS_ERROR, message: res.__("system.missing_parameters") };
            }

            /** Set Conditions  */
            let addressConditions = { $or: [{ invalid_address: false }, { invalid_address: { $exists: false } }] };
            if (userId) {
                addressConditions.user_id = userId;
            } else {
                addressConditions.device_id = deviceId;
            }

            if (restaurantId) {
                addressConditions["$and"] = [{
                    $or: [
                        { restaurant_id: restaurantId },
                        { restaurant_id: { $exists: false } },
                    ]
                }];
            }

            /** Get address list  **/
            const result = await this.addressesCollection.aggregate([
                {$match: addressConditions },
                {$sort: {created: Constants.SORT_DESC}},
                {$lookup: {	/** Get order details **/
                    from 		:	Tables.CITIES,
                    localField  :	"city_id",
                    foreignField:	"_id",
                    as 		  	:	'city_details'
                }},
                {$lookup: {	/** Get order details **/
                    from 		:	Tables.AREAS,
                    localField  :	"area_id",
                    foreignField:	"_id",
                    as 		  	:	'area_details'
                }},
                {$lookup: {	/** Get order details **/
                    from 		:	Tables.AREA_BLOCKS,
                    localField  :	"block_id",
                    foreignField:	"_id",
                    as 		  	:	'block_details'
                }},
                {$addFields : {
                    city_name : {$arrayElemAt: ["$city_details.name", 0]},
                    area_name : {$arrayElemAt: ["$area_details.name", 0]},
                    block_name : {$arrayElemAt: ["$block_details.name", 0]},
                }},
                {$project : {
                    modified: 0, created: 0, long_lat: 0, block_details: 0, area_details: 0, city_details: 0,
                }},
            ]).toArray();

            /** Send response **/
            return {
                status: Constants.STATUS_SUCCESS,
                result: result,
            };
        } catch (error) {
            next(error);
        }
    } // End getAddressList()

    /**
     * Function to add/edit customer address
     *
     * @param req As Request Data
     * @param res As Response Data
     * @param next As Callback argument to the middleware function
     *
     * @return json
     */
    async addEditAddress(req, res, next) {
        try {
            /** Sanitize Data **/
            req.body = sanitizeData(req.body, Constants.NOT_ALLOWED_TAGS_XSS_WITHOUT_IFRAME);
            let isEditable = (req.body.id) ? true : false;
            let addressId = (req.body.id) ? new ObjectId(req.body.id) : new ObjectId();
            let deviceId = (req.body.device_id) ? req.body.device_id : "";
            let userId = (req.body.user_id) ? new ObjectId(req.body.user_id) : "";
            let latitude = (req.body.latitude) ? parseFloat(req.body.latitude) : "";
            let longitude = (req.body.longitude) ? parseFloat(req.body.longitude) : "";
            let areaId = (req.body.area_id) ? new ObjectId(req.body.area_id) : "";
            let blockId = (req.body.block_id) ? new ObjectId(req.body.block_id) : "";
            let street = (req.body.street) ? req.body.street : "";
            let cityId = (req.body.city_id) ? new ObjectId(req.body.city_id) : "";
            let venue = (req.body.venue) ? req.body.venue : "";
            let isDefault = (req.body.is_default) ? JSON.parse(req.body.is_default) : false;
            let additionalDirections = (req.body.additional_directions) ? req.body.additional_directions : "";
            let jadda = (req.body.jadda) ? req.body.jadda : "";

            /** Send error response */
            if (!userId && !deviceId) {
                return { status: Constants.STATUS_ERROR, message: res.__("system.missing_parameters") };
            }

            /** Apply validation */
            let validationResponse = await applyValidationInterCallFunction(req, res, next, addEditAddressValidation);
            if(validationResponse.status != Constants.STATUS_SUCCESS) return validationResponse;

            /** Get user details **/
            let userResponse = await this.registrationAPI.getUserData(req, res, next, {
                conditions: {
                    _id:    new ObjectId(userId),
                    user_type: Constants.USER_TYPE_OTHER,
                    is_deleted: Constants.NOT_DELETED,
                },
                fields: { first_name: 1, last_name: 1, mobile_number: 1 }
            });

            if (userResponse.status != Constants.STATUS_SUCCESS) return next(userResponse.message);
            let resultData = userResponse?.result || "";

            /** Send error response */
            if (!resultData) return { status: Constants.STATUS_ERROR, message: res.__("system.invalid_access") };
            
            /** Save address data **/
            await this.addressesCollection.updateOne({
                _id: addressId
            }, {
                $set: {
                    first_name: resultData.first_name,
                    last_name: resultData.last_name,
                    mobile_number: resultData.mobile_number,
                    latitude: latitude,
                    longitude: longitude,
                    long_lat: [longitude, latitude],
                    area_id: areaId,
                    block_id: blockId,
                    city_id: cityId,
                    street: street,
                    venue: venue,
                    is_default: isDefault,
                    modified: getUtcDate(),
                    additional_directions: additionalDirections,
                    jadda: jadda,
                    building_number: req.body.building_number,
                    floor_number: req.body.floor_number,
                    flat_number: req.body.flat_number,
                    country: Constants.COUNTRY_NAME
                },
                $setOnInsert: {
                    user_id: userId,
                    device_id: (!userId) ? deviceId : "",
                    created: getUtcDate(),
                }
            }, { upsert: true });

            // Remove default from other addresses if this is set as default
            if (isDefault) {
                let addressConditions = {
                    _id: { $ne: addressId },
                };

                if (userId) {
                    addressConditions.user_id = userId;
                } else {
                    addressConditions.device_id = deviceId;
                }

                /** Update address details */
                await this.addressesCollection.updateMany(addressConditions, {
                    $set: {
                        is_default: false,
                        modified: getUtcDate()
                    }
                });
            }

            /** Send success response **/
            return {
                status: Constants.STATUS_SUCCESS,
                message: (isEditable) ? res.__("customer_address.customer_address_has_been_updated_successfully") : res.__("customer_address.customer_address_has_been_added_successfully"),
                address_id: addressId
            };
        } catch (error) {
            next(error);
        }
    } // End addEditAddress()

    /**
     * Function to delete customer address
     *
     * @param req As Request Data
     * @param res As Response Data
     * @param next As Callback argument to the middleware function
     *
     * @return json
     */
    async deleteAddress(req, res, next) {
        try {
            let addressId = (req.body.id) ? new ObjectId(req.body.id) : '';
            let userId = (req.body.user_id) ? new ObjectId(req.body.user_id) : '';
            let deviceId = (req.body.device_id) ? req.body.device_id : "";

            /** Send error response */
            if ((!userId && !deviceId) || !addressId) {
                return { status: Constants.STATUS_ERROR, message: res.__("system.missing_parameters") };
            }

            /** Set address conditions */
            let addressConditions = {_id: addressId};
            if(userId) addressConditions.user_id = userId;
            else addressConditions.device_id = deviceId;

            /** Get address details */
            const findResult = await this.addressesCollection.findOne(addressConditions, {projection: { _id: 1 }});

            /** Send error response */
            if (!findResult) return { status: Constants.STATUS_ERROR, message: res.__("system.invalid_access") };

            /** Delete address */
            await this.addressesCollection.deleteOne(addressConditions);

            /** Send success response */
            return { status: Constants.STATUS_SUCCESS, message: res.__("customer_address.customer_address_has_been_deleted_successfully") };
           
        } catch (error) {
            next(error);
        }
    } // End deleteAddress()

    /**
     * Function to get customer address details
     *
     * @param req As Request Data
     * @param res As Response Data
     * @param next As Callback argument to the middleware function
     *
     * @return json
     */
    async getAddressDetails(req, res, next) {
        try {
            let addressId = (req.body.address_id) ? new ObjectId(req.body.address_id) : '';
            let userId  = (req.body.user_id) ? new ObjectId(req.body.user_id) : '';
            let deviceId = (req.body.device_id) ? req.body.device_id : "";

            /** Send error response */
            if ((!userId && !deviceId) || !addressId) {
                return { status: Constants.STATUS_ERROR, message: res.__("system.missing_parameters") };
            }

            /** Set address conditions */
            let addressConditions = {_id: addressId};
            if (userId) addressConditions.user_id = userId;
            else if (deviceId) addressConditions.device_id = deviceId;

            const result = await this.addressesCollection.aggregate([
                {$match: addressConditions },
                {$lookup: {	/** Get order details **/
                    from 		:	Tables.CITIES,
                    localField  :	"city_id",
                    foreignField:	"_id",
                    as 		  	:	'city_details'
                }},
                {$lookup: {	/** Get order details **/
                    from 		:	Tables.AREAS,
                    localField  :	"area_id",
                    foreignField:	"_id",
                    as 		  	:	'area_details'
                }},
                {$lookup: {	/** Get order details **/
                    from 		:	Tables.AREA_BLOCKS,
                    localField  :	"block_id",
                    foreignField:	"_id",
                    as 		  	:	'block_details'
                }},
                {$addFields : {
                    city_name : {$arrayElemAt: ["$city_details.name", 0]},
                    area_name : {$arrayElemAt: ["$area_details.name", 0]},
                    block_name : {$arrayElemAt: ["$block_details.name", 0]},
                }},
                {$project : {
                    modified: 0, created: 0, long_lat: 0, block_details: 0, area_details: 0, city_details: 0,
                }},
            ]).toArray();

            /** Send error response */
            if (!result?.length) {
                return { status: Constants.STATUS_ERROR, message: res.__("system.invalid_access") };
            }

            /** Send success response **/
            return { status: Constants.STATUS_SUCCESS, result: result?.[0] || {} };
        } catch (error) {
            next(error);
        }
    } // End getAddressDetails()
}
export default CustomerAddress; 