
import Tables from './../config/database_tables.mjs';
import { getDb } from '../config/connection.mjs';
import * as Constants from "../config/global_constant.mjs";
import { getDropdownList } from './selectBoxHelper.mjs';

/**
 * Function to get restaturant id using slug
 *
 * @param req		As 	Request Data
 * @param res		As 	Response Data
 * @param options	As	Data object
 *
 * @return message
 */
export const getRestaurantId = (req,res,next,options)=>{
	return new Promise(async resolve=>{
		let slug = options?.slug || "";
		if(!slug) return resolve("");

		/** Get restaurant id by slug */
		const dbInstance   = getDb();
		const restaurants  = dbInstance.collection(Tables.RESTAURANTS);
		let restaurantData = await restaurants.findOne({slug: slug},{projection:{_id:1}});

		/** Send response */
		resolve(restaurantData?._id || "");
	}).catch(next);
}//getRestaurantId()

/**
 * Function to get restaturant details using slug
 *
 * @param req		As 	Request Data
 * @param res		As 	Response Data
 * @param options	As	Data object
 *
 * @return message
 */
export const getRestaurantDetails = (req,res,next,options)=>{
	return new Promise(async resolve=>{
		let slug = options?.slug || "";
		if(!slug) return resolve({status : Constants.STATUS_ERROR, message: res.__("system.invalid_access")});
		
		/** Get restaurant details by slug */
		const restaurants = getDb().collection(Tables.RESTAURANTS);
		let result = await restaurants.findOne({slug : slug},{projection:{_id:1,name :1,restaurant_number:1,default_name:1,aghzeya_restaurant_id:1,slug:1,talabat_restaurant_id:1 }});

		/** Send response */
		if(!result) return resolve({status : Constants.STATUS_ERROR,message : res.__("system.invalid_access")});
		resolve({status : Constants.STATUS_SUCCESS, result : result});
	}).catch(next);
}//getRestaurantDetails()

/**
 * Function for get restaurant html list for select box
 *
 * @param defaultLanguage	As Default Language
 *
 * @return json
 */
export const getRestaurantDropdowns = (req,res,next,options={}) =>{
	return new Promise(async resolve=>{
		let slug = options?.slug || "";

		/** get dropdown options for restaurant list **/
		let response  =	await getDropdownList(req,res,next,{
			collections :[{
				collection : Tables.RESTAURANTS,
				conditions : {
					is_deleted: Constants.NOT_DELETED,
				},
				selected   : [slug],
				columns    : ["slug","default_name"]
			}]
		});

		/** Send response */
		resolve(response?.final_html_data?.[0] || "");
	}).catch(next);
}//End getRestaurantDropdowns()