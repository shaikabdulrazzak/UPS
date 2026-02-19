import { body } from 'express-validator';

// Validation rules for add/edit corporate tie up
const addEditValidation = [
    body('corporate_name_in_english')
        .notEmpty()
        .withMessage((value, { req }) => req.__('admin.corporate_tie_ups.please_enter_corporate_name_in_english')),
    body('corporate_name_in_arabic')
        .notEmpty()
        .withMessage((value, { req }) => req.__('admin.corporate_tie_ups.please_enter_corporate_name_in_arabic')),
    body('min_order_amount').custom((value, { req }) => {
        if (req.body.free_delivery && (!req.body.min_order_amount || isNaN(req.body.min_order_amount) || req.body.min_order_amount <= 0)) {
            throw new Error(`min_order_amount|${req.__('admin.corporate_tie_ups.please_enter_valid_min_order_amount')}`);
        }
        return true;
    })
];

export {
    addEditValidation
}; 