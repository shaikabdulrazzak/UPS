import { body } from 'express-validator';
import * as Constants from '../../../../config/global_constant.mjs';

// update profile validation rules
export const updateProfileValidation = (req) => [
    body('name_in_english')
        .notEmpty()
            .withMessage(() => {
                return req.__('user.please_enter_restaurant_name_in_english');
            }),
    body('name_in_arabic')
        .notEmpty()
            .withMessage(() => {
                return req.__('user.please_enter_restaurant_name_in_arabic');
            }),
    body('email_address')
        .notEmpty()
            .withMessage(() => {
                return req.__('user.please_enter_email');
            })
        .isEmail()
            .withMessage(() => {
                return req.__('user.please_enter_valid_email_address');
            }),
    body('restaurant_address')
        .notEmpty()
            .withMessage(() => {
                return req.__('user.please_enter_restaurant_address');
            }),
    body('restaurant_description')
        .notEmpty()
            .withMessage(() => {
                return req.__('user.please_enter_restaurant_description');
                }),
    body('mobile_number')
        .notEmpty()
            .withMessage(() => {
                return req.__('user.please_enter_mobile_number');
            })
        .isNumeric()
            .withMessage(() => {
                return req.__('user.invalid_mobile_number');
            })        
        .isLength(Constants.MOBILE_LENGTH_VALIDATION )
            .withMessage(() => {
                return req.__('user.invalid_mobile_number');
            }),
    body('contact_person_name')
        .notEmpty()
            .withMessage(() => {
                return req.__('user.please_enter_contact_person_name');
            }),
    body('account_manager_name')
        .notEmpty()
            .withMessage(() => {
                return req.__('user.please_enter_account_manager_name');
            }),
];

// change password validation rules
export const changePasswordValidation = (req) => [
    body('old_password')
        .notEmpty()
            .withMessage(() => {
                return req.__('user.please_enter_old_password');
            }),
    body('password')
        .notEmpty()
            .withMessage(() => {
                return req.__('user.please_enter_password');
            })
        .isLength(Constants.PASSWORD_LENGTH_VALIDATION)
            .withMessage(() => {
                return req.__('user.password_length_should_be_minimum_6_character');
            }),
    body('confirm_password')
        .notEmpty()
            .withMessage(() => {
                return req.__('user.please_enter_confirm_password');
            })
        .isLength(Constants.PASSWORD_LENGTH_VALIDATION)
            .withMessage(() => {
                return req.__('user.confirm_password_length_should_be_minimum_6_character');
            })
        .custom((value, { req }) => value === req.body.password)
            .withMessage(() => {
                return req.__('user.confirm_password_should_be_same_as_password');
            }),
];

// driver edit profile validation rules
export const driverEditProfileValidation = (req) => [
    body('first_name')
        .notEmpty()
            .withMessage(() => {
                return req.__('user.please_enter_first_name');
            }),
    body('last_name')
        .notEmpty()
            .withMessage(() => {
                return req.__('user.please_enter_last_name');
            })
];

// customer edit profile validation rules
export const customerEditProfileValidation = (req) => [
    body('first_name')
        .notEmpty()
            .withMessage(() => {
                return req.__('admin.user_management.please_enter_first_name');
            }),
    body('last_name')
        .notEmpty()
            .withMessage(() => {
                return req.__('admin.user_management.please_enter_last_name');
            }),
    body('gender')
        .notEmpty()
            .withMessage(() => {
                return req.__('admin.user_management.please_select_gender');
            }),
    body('date_of_birth')
        .notEmpty()
            .withMessage(() => {
                return req.__('admin.user_management.please_select_date_of_birth');
            })
];

// send otp to mobile validation rules
export const sendOtpToMobileValidation = (req) => [
    body('mobile_number')
        .notEmpty()
            .withMessage(() => {
                return req.__('user.please_enter_mobile_number');
            })
        .isNumeric()
            .withMessage(() => {
                return req.__('user.invalid_mobile_number');
            })        
        .isLength(Constants.MOBILE_LENGTH_VALIDATION )
            .withMessage(() => {
                return req.__('user.invalid_mobile_number');
            })
];

// update mobile number validation rules
export const updateMobileNumberValidation = (req) => [
    body('mobile_number')
        .notEmpty()
            .withMessage(() => {
                return req.__('user.please_enter_mobile_number');
            })
        .isNumeric()
            .withMessage(() => {
                return req.__('user.invalid_mobile_number');
            })        
        .isLength(Constants.MOBILE_LENGTH_VALIDATION )
            .withMessage(() => {
                return req.__('user.invalid_mobile_number');
            }),
    body('otp')
        .notEmpty()
            .withMessage(() => {
                return req.__('user.please_enter_otp');
            })
];

// send otp to email validation rules
export const sendOtpToEmailValidation = (req) => [
    body('email')
        .notEmpty()
            .withMessage(() => {
                return req.__('user.please_enter_email');
            })
        .isEmail()
            .withMessage(() => {
                return req.__('user.please_enter_valid_email_address');
            }),
];

// update email address validation rules
export const updateEmailAddressValidation = (req) => [
    body('email')
        .notEmpty()
            .withMessage(() => {
                return req.__('user.please_enter_email');
            })
        .isEmail()
            .withMessage(() => {
                return req.__('user.please_enter_valid_email_address');
            }),
    body('otp')
        .notEmpty()
            .withMessage(() => {
                return req.__('user.please_enter_otp');
            })
];

