import { body } from 'express-validator';
import * as Constants from "../../../config/global_constant.mjs";

// Add permission validation rules
const addPermissionValidation = [
    body('branch_manager')
        .notEmpty()
        .withMessage((value, { req }) => {
            return req.__('admin.restaurants.please_enter_branch_permission');
        }),
    body('branch_employee')
        .notEmpty()
        .withMessage((value, { req }) => {
            return req.__('admin.restaurants.please_select_employee_permission');
        })
];

// Payment settings validation rules
const paymentSettingsValidation = [
    body('uInterface_base_url')
        .notEmpty()
        .withMessage((value, { req }) => {
            return req.__('admin.restaurants.please_enter_uInterface_base_url');
        }),
    body('uInterface_api_key')
        .notEmpty()
        .withMessage((value, { req }) => {
            return req.__('admin.restaurants.please_enter_uInterface_api_key');
        }),
    body('uInterface_username')
        .notEmpty()
        .withMessage((value, { req }) => {
            return req.__('admin.restaurants.please_enter_uInterface_username');
        }),
    body('uInterface_password')
        .notEmpty()
        .withMessage((value, { req }) => {
            return req.__('admin.restaurants.please_enter_uInterface_password');
        }),
    body('uInterface_authorization_key')
        .notEmpty()
        .withMessage((value, { req }) => {
            return req.__('admin.restaurants.please_enter_uInterface_authorization_key');
        }),
    body('uInterface_merchant_id')
        .notEmpty()
        .withMessage((value, { req }) => {
            return req.__('admin.restaurants.please_enter_uInterface_merchant_id');
        })
];

export {
    addPermissionValidation,
    paymentSettingsValidation
}; 