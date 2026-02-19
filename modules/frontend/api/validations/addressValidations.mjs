import { body } from 'express-validator';
import { ObjectId } from 'mongodb';

// Customer address add/edit validation rules
const addEditAddressValidation = (req) => [
    body('city_id')
        .notEmpty()
        .withMessage(() => {
            return req.__('customer_address.please_select_city');
        })
        .custom(value => {
            if(value && !ObjectId.isValid(value)){
                return Promise.reject(req.__('customer_address.please_select_city'));
            }
            return true;
        }),
    body('area_id')
        .notEmpty()
        .withMessage(() => {
            return req.__('customer_address.please_select_area');
        })
        .custom(value => {
            if(value && !ObjectId.isValid(value)){
                return Promise.reject(req.__('customer_address.please_select_area'));
            }
            return true;
        }),
    body('block_id')
        .notEmpty()
        .withMessage(() => {
            return req.__('customer_address.please_select_block');
        })
        .custom(value => {
            if(value && !ObjectId.isValid(value)){
                return Promise.reject(req.__('customer_address.please_select_block'));
            }
            return true;
        }),
    body('street')
        .notEmpty()
        .withMessage(() => {
            return req.__('customer_address.please_enter_street');
        }),
    body('building_number')
        .notEmpty()
        .withMessage(() => {
            return req.__('customer_address.please_enter_building_number');
        }),
    body('latitude')
        .notEmpty()
        .withMessage(() => {
            return req.__('customer_address.please_enter_latitude');
        })
        .isFloat()
        .withMessage(() => {
            return req.__('customer_address.please_enter_valid_latitude');
        }),
    body('longitude')
        .notEmpty()
        .withMessage(() => {
            return req.__('customer_address.please_enter_longitude');
        })
        .isFloat()
        .withMessage(() => {
            return req.__('customer_address.please_enter_valid_longitude');
        })
];

export {addEditAddressValidation}; 