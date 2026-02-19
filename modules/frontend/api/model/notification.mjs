import { ObjectId } from 'mongodb';
import * as Constants from "../../../../config/global_constant.mjs";
import Tables from '../../../../config/database_tables.mjs';

export default class Notification {

	constructor(db) {
		this.db = db;
	}

	/**
	 * Function for get notifications counter
	 *
	 * @param req As Request Data
	 * @param res As Response Data
	 * @param next	As 	Callback argument to the middleware function
	 *
	 * @return render/json
	 */
	async getNotificationsCounter(req, res,next){
		return new Promise(async resolve=>{
			let userId			= req?.body?.user_id || "";
			let restaurantId	= req?.body?.restaurant_id || "";

			/** Send success response */
			if(!userId) return resolve({status: Constants.STATUS_SUCCESS, counter: 0});

			/** Set conditions */
			let conditions ={
				is_seen	: Constants.NOT_SEEN,
				is_read	: Constants.NOT_READ
			};

			if(restaurantId){
				conditions["$or"] = [
					{user_id		:	new ObjectId(userId)},
					{restaurant_id	:	new ObjectId(restaurantId)}
				];
			}else{
				conditions.user_id = new ObjectId(userId);
			}
			
			/** Get notifications counter */
			const notifications = this.db.collection(Tables.NOTIFICATIONS);
			let countResult = await notifications.countDocuments(conditions);
				
			/** Send success response */
			resolve({
				status 	: Constants.STATUS_SUCCESS,
				counter	: countResult || 0
			});			
		}).catch(next);
	};//End getNotificationsCounter()

	/**
	 * Function for get notifications
	 *
	 * @param req As Request Data
	 * @param res As Response Data
	 * @param next	As 	Callback argument to the middleware function
	 *
	 * @return render/json
	 */
	async getNotifications(req, res,next){
		return new Promise(async resolve=>{
			let defalutLimit	= res?.locals?.settings?.['Site.front_record_limit'] > 0 ? parseInt(res.locals.settings['Site.front_record_limit']) :Constants.FRONT_LISTING_LIMIT;
			let	skip 			= req?.body?.skip  ? parseInt(req.body.skip)	:Constants.DEFAULT_SKIP;
			let	limit 			= req?.body?.limit ? parseInt(req.body.limit)	:defalutLimit;
			let userId			= req?.body?.user_id || "";
			let restaurantId	= req?.body?.restaurant_id || "";

			/** Send error response */
			if(!userId) return resolve({status: Constants.STATUS_ERROR, message: res.__("system.missing_parameters")});

			/** Set conditions */
			let conditions = {user_id: new ObjectId(userId)};
			if(restaurantId){
				conditions = {$or: [
					{user_id	  :	new ObjectId(userId)},
					{restaurant_id:	new ObjectId(restaurantId)}
				]};
			}

			/** Get notifications list or count **/
			const notifications = this.db.collection(Tables.NOTIFICATIONS);
			let dbRes = await notifications.aggregate([
				{$match	: conditions},
				{$facet : {
					list : [
						{$sort: {_id: Constants.SORT_DESC}},
						{$skip: skip },
						{$limit: limit },                            
						{$project :{
							message:1,is_seen:1,title:1,is_read:1,created:1,notification_type:1,extra_parameters:1,user_role_id:1,parent_table_id:1,title_descriptions:1,message_descriptions:1,
						}},
					],
					count: [
						{$count: "count"},
					],
				}}
			]).toArray();

			/** Send response **/
			resolve({
				status			: Constants.STATUS_SUCCESS,
				limit			: limit,
				result			: dbRes?.[0]?.list ||[],
				recordsTotal	: dbRes?.[0]?.count?.[0]?.count || 0,
				recordsSkipTotal: dbRes?.[0]?.count?.[0]?.count || 0,
			});

			/** Update read or seen status for all notifications **/
			if(skip == Constants.DEFAULT_SKIP){
				notifications.updateMany(conditions,{$set:{is_read:Constants.READ,is_seen:Constants.SEEN}}).then(()=>{}).catch(()=>{});
			}
		}).catch(next);
	};//End getNotifications()
}
