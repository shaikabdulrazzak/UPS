import { body } from 'express-validator';
import * as Constants from '../../../../config/global_constant.mjs';

// Transfer balance validation rules
const transferBalanceValidation = (req) => [
    body('mobile_number')
        .notEmpty()
            .withMessage(() => {
                return req.__('user.please_enter_mobile_number');
            })
        .isNumeric()
            .withMessage(() => {
                return req.__('user.invalid_mobile_number');
            })
        .isLength(Constants.MOBILE_LENGTH_VALIDATION)
            .withMessage(() => {
                return req.__('user.invalid_mobile_number');
            }),
     body('confirm_mobile_number')
        .notEmpty()
            .withMessage(() => {
                return req.__('user.please_enter_confirm_mobile_number');
            })
        .custom(value => {
            if(value && req.body.mobile_number && value != req.body.mobile_number){
                return Promise.reject(req.__('user_wallet.mobile_number_should_be_matched'));
            }
            return true;
        })
];


export {
    transferBalanceValidation
};