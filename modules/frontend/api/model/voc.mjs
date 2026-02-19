import { ObjectId } from 'mongodb';
import { parallel as asyncParallel } from 'async';

import * as Constants from '../../../../config/global_constant.mjs';
import Tables from '../../../../config/database_tables.mjs';
import { sanitizeData, getUserVocQuestionList } from '../../../../utils/index.mjs';

export default class Voc {
    constructor(db) {
        this.db = db;
        this.ordersCollection = db.collection(Tables.ORDERS);
        this.vocResponsesCollection = db.collection(Tables.VOC_RESPONSES);
    }

	/**
	 * Function for get voc question list
	 *
	 * @param req As Request Data
	 * @param res As Response Data
	 * @param next	As 	Callback argument to the middleware function
	 *
	 * @return render/json
	 */
	async getVocQuestionList(req, res,next){
		/** Sanitize Data **/
		req.body	=	sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS_WITHOUT_IFRAME);
		let vocFor	= 	req?.body?.voc_for || "";
		let type	= 	req?.body?.type || "";

		/** Send error response */
		if(!vocFor || !type) return {status: Constants.STATUS_ERROR, message: res.__("system.missing_parameters")};

		/** Set options  */
		let vocOptions = {
			type 		: type,
			user_type 	: vocFor,
		};

		/** Get voc question list */
		let vocResponse = await getUserVocQuestionList(req,res,next,vocOptions);
		return vocResponse;
	};//End getVocQuestionList()

	/**
	 * Function to save voc responses
	 *
	 * @param req 	As 	Request Data
	 * @param res 	As 	Response Data
	 * @param next	As	Callback argument to the middleware function
	 *
	 * @return render/json
	 */
	async saveVocResponses(req,res,next){
		/** Sanitize Data **/
		req.body			=	sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS_WITHOUT_IFRAME);
		let userType		=	req?.body?.user_type || "";
		let type			=	req?.body?.type || "";
		let deviceId		=	req?.body?.device_id || "";
		let questionList	=	req?.body?.question_list || [];
		let userId			=	req?.body?.user_id ? new ObjectId(req?.body?.user_id) : "";
		let orderId			=	req?.body?.order_id ? new ObjectId(req?.body?.order_id) : "";

		/** Send error response */
		if((!userId && !deviceId) || !userType || !type || !orderId || !questionList || questionList.length<=0){
			return {status: Constants.STATUS_ERROR, message: res.__("system.missing_parameters")};
		}
		
		userType = (userType == Constants.USER_TYPE_CUSTOMER || userType == Constants.VOC_FOR_CLIENT) ? Constants.VOC_FOR_CLIENT : Constants.VOC_FOR_CAPTAIN;
		let responseSaveData	= 	[];
		let notGiveAnyAnswer	= 	true;
		questionList.map((records)=>{
			if(records.answer) notGiveAnyAnswer= false;

			if(!records.is_skip){
				errorObject[records.question_id] =	res.__('voc.please_enter_answer');
			}

			responseSaveData.push({
				user_type	:	userType,
				type		:	type,
				user_id		:	userId,
				device_id	:	deviceId,
				order_id	:	orderId,
				question_id	:	(records.question_id)	? new ObjectId(records.question_id)	:"",
				answer_id	:	(records.answer_id)		? new ObjectId(records.answer_id)	:"",
				question	:	(records.question)		? records.question				:"",
				answer		:	(records.answer)		? records.answer				:"",
				is_skip		:	(records.is_skip)		? parseInt(records.is_skip)		:""
			});
		});

		/** Send error response */
		if(notGiveAnyAnswer) return {status: Constants.STATUS_ERROR, message: res.__("voc.please_give_me_onr") };
		if(Object.keys(errorObject).length > 0){
			let tmpArry = Object.keys(errorObject).map(key=> { return { param: key, msg: errorObject[key] } });
			return {status: Constants.STATUS_ERROR, message: tmpArry};
		}

		asyncParallel({
			update_order : (callback)=>{
				this.ordersCollection.updateOne({
					_id : new ObjectId(orderId)
				},
				{$set:{
					delay_voc_status : Constants.VOC_SUBMITTED,
				}}).then(() => {
					callback(null,null);
				}).catch(next);									
			},
			insert_data : (callback)=>{
				/** Save voc response data **/
				this.vocResponsesCollection.insertMany(responseSaveData,{forceServerObjectId: true}).then(() => {
					callback(null,null);
				}).catch(next);					
			},
		},(asyncErr)=>{
			if(asyncErr) return next(asyncErr);
			
			this.ordersCollection.find({
				customer_id : new ObjectId(userId),
				delay_voc_status: Constants.PENDING,
			},{projection : {_id:1}}).sort({voc_sent_time : Constants.SORT_DESC}).limit(1).toArray().then(result=>{
				
				
				/** Send success response **/
				return {
					status		: 	Constants.STATUS_SUCCESS,
					voc_order_id: 	result?.[0]?._id || "",
					message		:	res.__("voc.voc_response_has_been_added_successfully")
				};
			}).catch(next);
		});
	};//End saveVocResponses()
}
