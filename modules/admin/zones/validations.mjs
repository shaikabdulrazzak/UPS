import { body } from 'express-validator';

/**
 * Validation for add/edit zone
 */
export const addEditZoneValidation = [
    body('hub_ids')
        .notEmpty()
            .withMessage((value, { req }) => {
                return req.__('admin.zones.please_select_hub')
            }),
    body('name_english')
        .notEmpty()
            .withMessage((value, { req }) => {
                return req.__('admin.zones.please_enter_zone_name_in_english')
            }),
    body('name_arabic')
        .notEmpty()
            .withMessage((value, { req }) => {
                return req.__('admin.zones.please_enter_zone_name_in_arabic')
            })
];