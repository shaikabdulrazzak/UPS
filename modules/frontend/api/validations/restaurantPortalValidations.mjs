import { body } from 'express-validator';
import * as Constants from '../../../../config/global_constant.mjs';

// Assign captain validation rules
const assignCaptainValidation = (req) => [
    body('captain_name')
        .notEmpty()
            .withMessage(() => {
                return req.__('orders.please_enter_captain_name');
            }),
    body('captain_number')
        .notEmpty()
            .withMessage(() => {
                return req.__('orders.please_enter_captain_number');
            })
        .isNumeric()
            .withMessage(() => {
                return req.__('orders.invalid_phone_number');
            })
        .isLength(Constants.MOBILE_LENGTH_VALIDATION)
            .withMessage(() => {
                return req.__('orders.invalid_phone_number');
            })
];

// Assign captain validation rules
const rejectOrderRequestValidation = (req) => [
    body('rejection_reason')
        .notEmpty()
            .withMessage(() => {
                return req.__('orders.please_enter_rejection_condition');
            }),
];


export {
    assignCaptainValidation,
    rejectOrderRequestValidation
};