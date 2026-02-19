import { body } from 'express-validator';

// Validation rules for assigning fleet area
const assignAreaValidation = [
    body('user_name')
        .notEmpty()
        .withMessage((value, { req }) => req.__('admin.fleet_zone_assignment.please_enter_user_name')),
    body('zone_id')
        .notEmpty()
        .withMessage((value, { req }) => req.__('admin.fleet_zone_assignment.please_select_zone')),
    body('date')
        .custom((value, { req, res, next, location, path }) => {
            if(!req.body.from_date || !req.body.to_date){
                return Promise.reject(req.__('admin.fleet_area_assignment.please_select_date', { value, location, path }));
            } else {
                return true;
            }
        })
];

export { assignAreaValidation }; 