import { body } from 'express-validator';
import {cleanRegex} from "../../../utils/index.mjs";
import { ObjectId } from 'mongodb';
import Tables from '../../../config/database_tables.mjs';
import { getDb } from '../../../config/connection.mjs';
import * as Constants from "../../../config/global_constant.mjs";

const addEditValidation = [
    body('title_english')
        .notEmpty()
        .withMessage((value, { req }) => req.__("admin.cancel_reason.please_enter_title_in_english"))
        .custom(async (value, { req }) => {
            const db = getDb();
            const reasonId = req.params.id ? new ObjectId(req.params.id) : null;
            const existing = await db.collection(Tables.CANCEL_REASONS).findOne({
                _id: { $ne: reasonId },
                "title.en": { $regex: '^' + cleanRegex(value) + '$', $options: 'i' }
            }, { projection: { _id: 1 } });
            if (existing) {
                return Promise.reject(req.__("admin.cancel_reason.enter_title_english_is_already_exists"));
            }
            return true;
        }),
    body('title_arabic')
        .notEmpty()
        .withMessage((value, { req }) => req.__("admin.cancel_reason.please_enter_title_in_arabic"))
        .custom(async (value, { req }) => {
            const db = getDb();
            const reasonId = req.params.id ? new ObjectId(req.params.id) : null;
            const existing = await db.collection(Tables.CANCEL_REASONS).findOne({
                _id: { $ne: reasonId },
                "title.ar": { $regex: '^' + cleanRegex(value) + '$', $options: 'i' }
            }, { projection: { _id: 1 } });
            if (existing) {
                return Promise.reject(req.__("admin.cancel_reason.enter_title_arabic_is_already_exists"));
            }
            return true;
        })
];

export {
    addEditValidation
};