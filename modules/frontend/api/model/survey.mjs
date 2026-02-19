import { ObjectId } from 'mongodb';
import * as Constants from "../../../../config/global_constant.mjs";
import Tables from '../../../../config/database_tables.mjs';
import { sanitizeData, getUtcDate, newDate } from "../../../../utils/index.mjs";

class Survey {
    constructor(db) {
        this.db = db;
        this.surveyManagementsDb = db.collection(Tables.SURVEY_MANAGEMENTS);
        this.surveyQuestionsDb = db.collection(Tables.SURVEY_QUESTIONS);
        this.surveyResponsesDb = db.collection(Tables.SURVEY_RESPONSES);
        this.surveyAttemptsDb = db.collection(Tables.SURVEY_ATTEMPTS);
    }

    /**
     * Function for get survey question list
     *
     * @param req As Request Data
     * @param res As Response Data
     * @param next	As 	Callback argument to the middleware function
     *
     * @return render/json
     */
    async getSurveyQuestionList(req, res, next) {
        try {
            /** Sanitize Data **/
            req.body = sanitizeData(req.body, Constants.NOT_ALLOWED_TAGS_XSS_WITHOUT_IFRAME);
            let screenType = (req.body.screen_type) ? req.body.screen_type : "";

            /** Send error response */
            if(!screenType) {
                return {
                    status: Constants.STATUS_ERROR, 
                    message: res.__("system.missing_parameters")
                };
            }

            /**For check screen type */
            if(!Constants.INSTANCE[screenType]) {
                return {
                    status: Constants.STATUS_ERROR, 
                    message: res.__("admin.system.invalid_access")
                };
            }
            
            let startDate = newDate(newDate("", Constants.CURRENTDATE_START_DATE_FORMAT));
            let endDate = newDate(newDate("", Constants.CURRENTDATE_END_DATE_FORMAT));

            /** Set survey conditions */
            let surveyConditions = { instance: screenType };
            
            /** Set survey conditions for start date and end date */
            surveyConditions["$or"] = [
                {
                    $and: [
                        { start_on: {$gte: newDate(startDate)} },
                        { end_on: {$lte: newDate(endDate)} }
                    ]
                },
                {
                    $and: [
                        { end_on: {$gte: newDate(startDate)} },
                        { start_on: {$lte: newDate(endDate)} }
                    ]
                }
            ];

            /** For get survey ids */
            const surveyIds = await this.surveyManagementsDb.distinct("_id", surveyConditions);
            
            /** Send response **/
            if(surveyIds.length <= 0) {
                return {
                    status: Constants.STATUS_SUCCESS, 
                    questions: []
                };
            }

            /** Get survey question list */
            const surveyResult = await this.surveyQuestionsDb.find(
                {survey_id: {$in: surveyIds}},
                {projection: {_id: 1, "options.option": 1, "options.option_id": 1, question: 1, type: 1, survey_id: 1}}
            ).toArray();

            /** Send response **/
            return {
                status: Constants.STATUS_SUCCESS,
                questions: surveyResult
            };
        } catch (error) {
            next(error);
        }
    }

    /**
     * Function to save survey responses
     *
     * @param req 	As 	Request Data
     * @param res 	As 	Response Data
     * @param next	As	Callback argument to the middleware function
     *
     * @return render/json
     */
    async saveSurveyResponses(req, res, next) {
        try {
            /** Sanitize Data **/
            req.body = sanitizeData(req.body, Constants.NOT_ALLOWED_TAGS_XSS_WITHOUT_IFRAME);
            let userId = (req.body.user_id) ? new ObjectId(req.body.user_id) : "";
            let questionList = (req.body.question_list) ? req.body.question_list : [];

            /** Send error response */
            if(!userId || !questionList || questionList.length <= 0) {
                return {
                    status: Constants.STATUS_ERROR, 
                    message: res.__("system.missing_parameters")
                };
            }

            let responseSaveData = [];
            let notGiveAnyAnswer = true;
            let userAttemptData = {};

            questionList.map((records) => {
                if((records.selected_option && records.selected_option.length > 0) || records.answer) {
                    notGiveAnyAnswer = false;
                }

                let tempObject = {
                    user_id: userId,
                    survey_id: (records.survey_id) ? new ObjectId(records.survey_id) : "",
                    type: (records.type) ? records.type : "",
                    question: (records.question) ? records.question : "",
                    created: getUtcDate()
                };
                
                if(records.type == Constants.INPUT_QUESTION_TYPE) {
                    tempObject.answer = (records.answer) ? records.answer : "";
                }

                if(records.type == Constants.SINGLE_QUESTION_TYPE || records.type == Constants.MULTIPLE_QUESTION_TYPE) {
                    tempObject.selected_option = (records.selected_option) ? records.selected_option : [];
                }

                userAttemptData = {
                    survey_id: (records.survey_id) ? new ObjectId(records.survey_id) : ""
                };

                let options = [];
                records.options.map(optionRecords => {
                    options.push({ option: optionRecords.option });
                    tempObject.options = options;
                });

                responseSaveData.push(tempObject);
            });

            /** Send error response */
            if(notGiveAnyAnswer) {
                return {
                    status: Constants.STATUS_ERROR, 
                    message: res.__("survey.please_give_me_at_least_one_answer")
                };
            }

            /** Save survey response data */
            await this.surveyResponsesDb.insertMany(responseSaveData,{forceServerObjectId: true});

            /** Set user attempts data */
            req.body.is_attempt = true;
            req.body.survey_id  = userAttemptData.survey_id;
            const attemptRes = await this.userAttempts(req, res, next);

            /** Send error response */
            if(attemptRes?.status == Constants.STATUS_ERROR)  return attemptRes;
            
            /** Send success response **/
            return {
                status: Constants.STATUS_SUCCESS,
                message: res.__("survey.survey_response_has_been_added_successfully")
            };
        } catch (error) {
            next(error);
        }
    }

    /**
     * Function to user attempts
     *
     * @param req 	As 	Request Data
     * @param res 	As 	Response Data
     * @param next	As	Callback argument to the middleware function
     *
     * @return render/json
     */
    async userAttempts(req, res, next) {
        try {
            /** Sanitize Data **/
            req.body = sanitizeData(req.body, Constants.NOT_ALLOWED_TAGS_XSS_WITHOUT_IFRAME);
            let userId = (req.body.user_id) ? new ObjectId(req.body.user_id) : "";
            let surveyId = (req.body.survey_id) ? new ObjectId(req.body.survey_id) : "";
            let isAttempt = (req.body.is_attempt) ? JSON.parse(req.body.is_attempt) : false;
            
            /** Send error response */
            if(!userId || !surveyId || !isAttempt) {
                return {
                    status: Constants.STATUS_ERROR, 
                    message: res.__("system.missing_parameters")
                };
            }

            /** Save user attempts **/
            await this.surveyAttemptsDb.insertOne({
                user_id: userId,
                survey_id: surveyId,
                is_attempt: isAttempt ? true : false,
                created: getUtcDate()
            });

            /** Send success response **/
            return {
                status: Constants.STATUS_SUCCESS,
                message: res.__("survey.user_attempt_has_been_added_successfully")
            };
        } catch (error) {
            next(error);
        }
    }
}

export default Survey; 