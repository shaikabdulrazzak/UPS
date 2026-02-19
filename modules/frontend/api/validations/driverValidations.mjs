import { body } from 'express-validator';
import * as Constants from '../../../../config/global_constant.mjs';

// driver fueling validation rules
export const fuelingValidation = (req) => [
    body('kilometers')
        .notEmpty()
            .withMessage(() => {
                return req.__('driver_break.please_enter_kilometers');
            })
        .isNumeric()
            .withMessage(() => {
                return req.__('driver_break.please_enter_valid_kilometers');
            }),
     body('amount')
        .notEmpty()
            .withMessage(() => {
                return req.__('driver_break.please_enter_amount');
            })
        .isFloat()
            .withMessage(() => {
                return req.__('driver_break.please_enter_valid_amount');
            })
        .custom(value => {
            if(value && (isNaN(value) || value < 0)){
                return Promise.reject(req.__('driver_break.please_enter_valid_amount'));
            }
            return true;
        })
];

// driver service validation rules
export const serviceValidation = (req) => [
    body('kilometers')
        .notEmpty()
            .withMessage(() => {
                return req.__('driver_break.please_enter_kilometers');
            })
        .isNumeric()
            .withMessage(() => {
                return req.__('driver_break.please_enter_valid_kilometers');
            }),
     body('next_service_date')
        .notEmpty()
            .withMessage(() => {
                return req.__('driver_break.please_select_next_service_date');
            })
];

// driver in-out shift validation rules
export const inOutShiftValidation = (req) => [
    body('km')
        .notEmpty()
            .withMessage(() => {
                return req.__('driver_break.please_enter_kilometers');
            })
        .isNumeric()
            .withMessage(() => {
                return req.__('driver_break.please_enter_valid_kilometers');
            })
        .custom(value => {
            if(value && (isNaN(value) || value < 0)){
                return Promise.reject(req.__('driver_shifts.km_should_be_greater_than_zero'));
            }
            return true;
        }),
    body('latitude')
        .custom(value => {
            if(!value|| !req.body.longitude){
                return Promise.reject(req.__('driver_break.whoops_its_seems_we_are_not_able_to_get_your_location'));
            }
            return true;
        })
];

// driver excuse validation rules
export const excuseValidation = (req) => [
    body('from')
        .notEmpty()
            .withMessage(() => {
                return req.__('driver_excuses.please_select_from_date');
            }),
    body('to')
        .notEmpty()
            .withMessage(() => {
                return req.__('driver_excuses.please_select_to_time');
            }),
    body('date')
        .notEmpty()
            .withMessage(() => {
                return req.__('driver_excuses.please_select_date');
            })
];
