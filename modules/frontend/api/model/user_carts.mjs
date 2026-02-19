import { ObjectId } from 'mongodb';
import clone from 'clone';
import {parallel as asyncParallel, each as asyncEach, forEachOf as asyncForEachOf} from 'async';
import * as Constants from "../../../../config/global_constant.mjs";
import Tables from '../../../../config/database_tables.mjs';
import { sanitizeData, getUtcDate, newDate, subtractDate, round, getWalletBalance, getDifferenceBetweenTwoDatesInMinute } from "../../../../utils/index.mjs";

class UserCarts {
    constructor(db) {
        this.db = db;
        this.userCartDb = db.collection(Tables.USER_CARTS);
        this.usersDb = db.collection(Tables.USERS);
		this.areasDb = db.collection(Tables.AREAS);

        this.restaurantsDb 			= 	db.collection(Tables.RESTAURANTS);
        this.restaurantBranchesDb 	=	db.collection(Tables.RESTAURANT_BRANCHES);
        this.restaurantBranchAreasDb= 	db.collection(Tables.RESTAURANT_BRANCH_AREAS);
        this.restaurantCategoriesDb	= 	db.collection(Tables.RESTAURANT_CATEGORIES);
        this.restaurantBranchAttributesDb= 	db.collection(Tables.RESTAURANT_BRANCH_ATTRIBUTES);

		this.itemsDb = db.collection(Tables.ITEMS);
        this.itemUnitsDb = db.collection(Tables.ITEM_UNITS);
        this.itemDoughUnitsDb = db.collection(Tables.ITEM_DOUGH_UNITS);
        this.itemGroupExtrasDb = db.collection(Tables.ITEM_GROUP_EXTRAS);
        this.itemExtraMastersDb = db.collection(Tables.ITEM_EXTRA_MASTERS);
        this.itemSelectorUnitsDb = db.collection(Tables.ITEM_SELECTOR_UNITS);
        this.itemChoicesGroupsDb = db.collection(Tables.ITEM_CHOICES_GROUPS);


        this.ordersDb = db.collection(Tables.ORDERS);
        this.oderItemDb = db.collection(Tables.ORDER_ITEMS);

		this.tmpOfferLogsDb = db.collection(Tables.TMP_OFFER_LOGS);
		this.offerLogsDb = db.collection(Tables.OFFER_LOGS);
		this.offersDb = db.collection(Tables.OFFERS);
		this.offerItemsDb = db.collection(Tables.OFFER_ITEMS);
		this.offerUsedDb = db.collection(Tables.OFFER_USED);
	}

	/**
	 * Function to update cart
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	**/
	async updateCart(req, res, next) {
		return new Promise(resolve=>{
			/** Sanitize Data **/
			req.body 		= sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
			let areaId		= (req.body.area_id)	    ? new ObjectId(req.body.area_id)		:"";
			let cartId  	= (req.body.cart_id) 		? new ObjectId(req.body.cart_id) 		:"";
			let userId  	= (req.body.user_id) 		? new ObjectId(req.body.user_id) 		:"";
			let deviceId	= (req.body.device_id) 		? req.body.device_id 		 			:"";
			let restaurantId= (req.body.restaurant_id) 	? new ObjectId(req.body.restaurant_id)	:"";
			let branchId	= (req.body.branch_id)	    ? new ObjectId(req.body.branch_id)		:"";
			let qty			= (req.body.qty)	    	? parseInt(req.body.qty)				:1;
			let itemId		= (req.body.item_id)		? new ObjectId(req.body.item_id)		:"";
			let unitId		= (req.body.unit_id)		? new ObjectId(req.body.unit_id)		:"";
			let itemUnitId	= (req.body.item_unit_id)	? new ObjectId(req.body.item_unit_id)	:"";
			let doughId		= (req.body.dough_id)		? new ObjectId(req.body.dough_id)		:"";
			let selectorId	= (req.body.selector_id)	? new ObjectId(req.body.selector_id)	:"";
			let itemType	= (req.body.item_type)		? req.body.item_type					:"";
			let offerId		= (req.body.offer_id)		? new ObjectId(req.body.offer_id)		:"";
			let extraItems	= (req.body.extra_items)	? req.body.extra_items					:[];
			let unitLists	= (req.body.unit_lists)		? req.body.unit_lists					:[];
			let note		= (req.body.note)			? req.body.note							:"";
			let orderId		= (req.body.order_id)		? new ObjectId(req.body.order_id)		:"";
			let isAdmin		= (req.body.is_admin)		? JSON.parse(req.body.is_admin)			:false;
			let modifyOrder	= (req.body.modify_order)	? JSON.parse(req.body.modify_order)		:false;
			let maxModifiedTime	= (req.body.max_modified_time) ? req.body.max_modified_time		:"";
			let addByAdmin	= (req.body.add_by_admin) ? req.body.add_by_admin	:false;

			/** Check extra items */
			let missingParameter = false;
			if(extraItems.length>0){
				extraItems.map(extraItem=>{
					if(!extraItem.group_id || !extraItem.extra_item_ids || extraItem.extra_item_ids.length <=0) missingParameter = true;

					if(extraItem.extra_item_ids && extraItem.extra_item_ids.length >0){
						extraItem.extra_item_ids.map(records=>{
							if(!records.extra_item_id || !records.extra_group_item_id) missingParameter = true;

							if(extraItem.group_id) extraItem.group_id	    = new ObjectId(extraItem.group_id);

							if(records.extra_item_id) records.extra_item_id = new ObjectId(records.extra_item_id);

							if(records.extra_group_item_id) records.extra_group_item_id =  new ObjectId(records.extra_group_item_id);
						});
					}
				});
			}

			/** Check deal extra items */
			let doughMissingParameter 	 = false;
			let selectorMissingParameter = false;
			let pizzaMissingParameter 	 = false;
			if(itemType == Constants.DEAL_ITEM || itemType == Constants.HALF_AND_HALF_ITEM){
				let isDealItem = (itemType == Constants.DEAL_ITEM) 			? true :false;
				let isHalfItem = (itemType == Constants.HALF_AND_HALF_ITEM) 	? true :false;
				if(isHalfItem && unitLists.length <=0) pizzaMissingParameter = true;

				if(isHalfItem && (!unitId || !doughId || !itemUnitId)) doughMissingParameter = true;

				if(!pizzaMissingParameter){
					unitLists.map(data=>{
						if(isHalfItem && !data.selector_id) selectorMissingParameter= true;

						if(isHalfItem && (!data.extra_items || data.extra_items.length <=0)){
							pizzaMissingParameter = true;
						}

						if(!pizzaMissingParameter && data.extra_items && data.extra_items.length>0){
							data.extra_items.map(extraItem=>{
								if(!extraItem.group_id || !extraItem.extra_item_ids || extraItem.extra_item_ids.length <=0) pizzaMissingParameter = true;

								if(extraItem.extra_item_ids && extraItem.extra_item_ids.length >0){
									extraItem.extra_item_ids.map(records=>{
										if(!records.extra_item_id || !records.extra_group_item_id) pizzaMissingParameter = true;

										if(extraItem.group_id) extraItem.group_id	    = new ObjectId(extraItem.group_id);

										if(records.extra_item_id) records.extra_item_id = new ObjectId(records.extra_item_id);

										if(records.extra_group_item_id) records.extra_group_item_id =  new ObjectId(records.extra_group_item_id);
									});
								}
							});
						}

						/** Convert into object id */
						if(data.unit_id) 		data.unit_id 		=	new ObjectId(data.unit_id);
						if(data.dough_id) 		data.dough_id 		=	new ObjectId(data.dough_id);
						if(data.item_unit_id)	data.item_unit_id 	= 	new ObjectId(data.item_unit_id);
						if(data.selector_id) 	data.selector_id 	= 	new ObjectId(data.selector_id);
					});
				}
			}

			/** Send error response **/
			if(missingParameter || (!userId && !deviceId) || !restaurantId || !branchId || !itemId || (!itemUnitId && (doughId || selectorId))){
				return resolve({status : Constants.STATUS_ERROR, message : res.__("system.missing_parameters")});
			}

			/** Send error response **/
			if(doughMissingParameter) return resolve({status : Constants.STATUS_ERROR, message : res.__("user_carts.you_should_select_dough") });
			if(selectorMissingParameter) return resolve({status : Constants.STATUS_ERROR, message : res.__("user_carts.you_should_select_selector") });
			if(pizzaMissingParameter) return resolve({status : Constants.STATUS_ERROR, message : res.__("user_carts.you_should_select_extras") });

			asyncParallel({
				check_item : (callback)=>{
					if(!unitId) return callback(null,1);

					/** Find user record using user id **/
					this.oderItemDb.countDocuments({
						_id 		: itemId,
						order_id	: orderId,
					}).then(result =>{
						callback(null,result);
					}).catch(next);
				},
				user_details : (callback)=>{
					if(!userId) return callback(null,1);

					/** Find user record using user id **/
					this.usersDb.countDocuments({
						_id 		: userId,
						is_deleted  : Constants.NOT_DELETED,
						active      : Constants.ACTIVE
					}).then(result =>{
						callback(null,result);
					}).catch(next);
				},
				restaurant_details : (callback)=>{
					/** Find restaurant record using restaurant id **/
					this.restaurantsDb.countDocuments({
						_id 	   	: restaurantId,
						is_deleted	: Constants.NOT_DELETED,
						status		: Constants.ACTIVE
					}).then(result =>{
						callback(null,result);
					}).catch(next);
				},
				branch_details : (callback)=>{
					/** Find branch record using branch id **/
					this.restaurantBranchesDb.countDocuments({
						_id 		  : branchId,
						restaurant_id : restaurantId,
						is_active	  : Constants.ACTIVE
					}).then(result =>{
						callback(null,result);
					}).catch(next);
                },
                area_details : (callback)=>{
					if(modifyOrder || !areaId) return callback(null,1);

                    /** Get branch area details **/
                    this.restaurantBranchAreasDb.countDocuments({
						restaurant_id	: restaurantId,
                        branch_id 		: branchId,
						area_id 		: areaId,
                    }).then(result =>{
						callback(null,result);
					}).catch(next);
                },
				item_details : (callback)=>{
					/** Find item record using item id**/
					this.itemsDb.countDocuments({
						_id 		  : itemId,
						restaurant_id : restaurantId,
						is_active	  : Constants.ACTIVE
					}).then(result =>{
						callback(null,result);
					}).catch(next);
				},
				unit_details : (callback)=>{
					if(!unitId) return callback(null,1);

					/** Find item unit record using unit id**/
					this.itemUnitsDb.countDocuments({
						item_unit_id : unitId,
						item_id 	 : itemId,
						status	     : Constants.ACTIVE
					}).then(result =>{
						callback(null,result);
					}).catch(next);
				},
				dough_details : (callback)=>{
					if(!doughId) return callback(null,1);

					/** Find item dough units record using dough id **/
					this.itemDoughUnitsDb.countDocuments({
						_id			 : doughId,
						parents 	 : { $in: [itemUnitId]},
						item_id 	 : itemId,
						restaurant_id: restaurantId,
						status		 : Constants.ACTIVE
					}).then(result =>{
						callback(null,result);
					}).catch(next);
				},
				selector_details : (callback)=>{
					if(!selectorId) return callback(null,1);

					/** Find item selector units record using selector id **/
					this.itemSelectorUnitsDb.countDocuments({
						_id			       : selectorId,
						parents 	       : { $in: [itemUnitId]},
						item_id 	 	   : itemId,
						restaurant_id	   : restaurantId,
						status		 	   : Constants.ACTIVE,
						dough_type_parents : { $in: [doughId]},
					}).then(result =>{
						callback(null,result);
					}).catch(next);
				},
				extra_items_details : (callback)=>{
					let isCorrectGroup = true;
					if(!extraItems || extraItems.length <= 0 ) return callback(null,isCorrectGroup);

					/** Find extra items multiple record **/
					asyncEach(extraItems, (records, eachCallback)=> {

						asyncParallel({
							group_id: (groupCallback)=>{
								/** Find item choices groups record using group id **/
								this.itemChoicesGroupsDb.countDocuments({
									_id			  : records.group_id,
									item_id 	  : itemId,
									restaurant_id : restaurantId
								}).then(itemChoicesGroupsResult =>{
									groupCallback(null,itemChoicesGroupsResult);
								}).catch(next);
							},
							extra_item_details: (extraItemCallback)=>{
								asyncEach(records.extra_item_ids, (extraItemRecords, childEachCallback)=> {
									asyncParallel({
										extra_item_id: (childCallback)=>{
											/** Find item extra items record using extra item id **/
											this.itemExtraMastersDb.countDocuments({
												_id			 : extraItemRecords.extra_item_id,
												item_id 	 : itemId,
												restaurant_id: restaurantId
											}).then(itemExtraMastersResult =>{
												childCallback(null,itemExtraMastersResult);
											}).catch(next);
										},
										extra_group_item_id: (childCallback)=>{
											/** Find item group extras record using extra group item id **/
											this.itemGroupExtrasDb.countDocuments({
												_id				: extraItemRecords.extra_group_item_id,
												group_id		: records.group_id,
												item_extra_id	: extraItemRecords.extra_item_id,
												item_id 		: itemId
											}).then(itemGroupExtrasResult =>{
												childCallback(null,itemGroupExtrasResult);
											}).catch(next);
										},
									},(childAsyncErr,childAsyncResponse)=>{
										if(!childAsyncErr && (!childAsyncResponse.extra_item_id || !childAsyncResponse.extra_group_item_id)) isCorrectGroup = false;

										childEachCallback(childAsyncErr);
									});
								},(childEachErr)=> {
									extraItemCallback(childEachErr,null);
								});
							},
						},(asyncGroupErr,asyncGroupResponse)=>{
							if(!asyncGroupErr && !asyncGroupResponse.group_id) isCorrectGroup = false;

							eachCallback(asyncGroupErr);
						});
					},(eachErr)=> {
						callback(eachErr,isCorrectGroup);
					});
				},
				offer_details : (callback)=>{
					callback(null,1);
				},
				cart_details : (callback)=>{
					if(cartId || !isAdmin) return callback(null,null);

					/** Set cart conditions */
					let cartConditions = {};
					if(userId){
						cartConditions.customer_id  = userId;
					}else{
						cartConditions.device_id 	= deviceId;
					}
					cartConditions.restaurant_id=	restaurantId;
					cartConditions.branch_id  	= 	branchId;
					cartConditions.item_id  	= 	itemId;

					/** Get cart details */
					this.userCartDb.findOne(cartConditions,{projection: {_id: 1,}}).then(cartResult => {
						if(cartResult) cartId = cartResult._id;
						callback(null,cartResult);
					}).catch(next);
				},
				cart_item_details : (callback)=>{
					if(!cartId || !orderId) return callback(null,null);

					/** Get cart details */
					this.userCartDb.findOne({_id: cartId},{projection: {extra_items: 1,}}).then(cartItemResult => {
						if(!cartItemResult || !cartItemResult.extra_items || cartItemResult.extra_items.length ==0){
							return  callback(null,null);
						}

						let cartExtraItemObject	=	{};
						cartItemResult.extra_items.map(data => {
							if(data.extra_item_ids && data.extra_item_ids.length > 0){
								if(!cartExtraItemObject[data.group_id]) cartExtraItemObject[data.group_id] = {};
								data.extra_item_ids.map(items => {
									cartExtraItemObject[data.group_id][items.extra_group_item_id] = true;
								});
							}
						});
						callback(null,cartExtraItemObject);
					});
				},
				all_extra_details : (callback)=>{
					/** Set conditions */
					let itemGroupConditions = {
						item_id				: 	itemId,
						is_auto_selected	:	{$exists : false},
						$or 				:	[
							{$or:	[
								{unit_id : {$exists: false} },
								{unit_id : ""},
							]}
						]
					};

					if(unitId)  itemGroupConditions["$or"].push({unit_id : unitId});

					/** Get link group list  */
					this.itemGroupExtrasDb.aggregate([
						{$match:	itemGroupConditions},
						{$lookup:	{
							from     : Tables.ITEM_UNITS,
							let      : {unitId : "$unit_id"},
							pipeline : [
								{$match : {
									$expr: {
										$and : [
											{$eq: ["$item_unit_id", "$$unitId"]},
											{$eq: ["$item_id", itemId]},
										]
									}
								}},
							],
							as:	"units_list"
						}},
						{$match : {
							$or : [
								{"units_list.0" 	: {$exists: false}},
								{"units_list.status": Constants.ACTIVE},
							]
						}},
						{$lookup:	{
							from     : Tables.ITEM_EXTRA_MASTERS,
							let      : {itemExtraId : "$item_extra_id"},
							pipeline : [
								{$match : {
									$expr: {
										$and : [
											{$eq: ["$_id", "$$itemExtraId"]},
											{$eq: ["$is_active", Constants.ACTIVE]},
										]
									}
								}},
							],
							as:	"extra_item_detail"
						}},
						{$match: {
							"extra_item_detail._id" : {$exists: true}
						}},
						{$group: {
							_id 		: 	null,
							group_id	:	{$push: "$group_id"},
						}},
					]).toArray().then(groupExResult=>{
						if(groupExResult.length<=0) return  callback(null,null);

						/** Get link group min or max extra count  */
						let tmpGroupIds =(groupExResult && groupExResult[0])?groupExResult[0].group_id :[];
						this.itemChoicesGroupsDb.find({
							_id 	: {$in: tmpGroupIds},
							item_id : itemId
						},{projection: {max_quantity: 1, min_quantity: 1}}).toArray().then(groupResult=>{
							if(groupResult.length<=0) return  callback(null,null);

							let extraItemObj 		= {};
							let extraItemMaxObj 	= {};
							let extraRequiredCount 	= 0;
							groupResult.map(records=>{
								if(records.min_quantity > 0){
									extraItemObj[records._id]		=	records.min_quantity;
									extraItemMaxObj[records._id]	=	records.max_quantity;
									extraRequiredCount				+=	records.min_quantity;
								};
							});

							callback(null,{
								required_group_details 		:	extraItemObj,
								required_max_group_details 	:	extraItemMaxObj,
								required_extra_count 		:	extraRequiredCount,
							});
						});
					});
				},
				valid_conditions_item : (callback)=>{
					/** Find item  details **/
					this.itemsDb.findOne({
						_id 		  : itemId,
						restaurant_id : restaurantId,
						is_active	  : Constants.ACTIVE
					},{projection: {item_type: 1, no_of_components: 1, no_of_duplicate: 1 }}).then(itemResult=>{
						if(!itemResult) return callback(null,true);

						let tmpItemType 	= 	itemResult.item_type;
						let noOfComponents 	= 	itemResult.no_of_components;
						let noOfDuplicate 	=	itemResult.no_of_duplicate;

						if(tmpItemType != Constants.DEAL_ITEM && tmpItemType != Constants.HALF_AND_HALF_ITEM){
							return callback(null,true);
						}

						itemType		=	tmpItemType;
						let isDealItem	=	(tmpItemType == Constants.DEAL_ITEM) 		  ? true :false;
						let isHalfItem 	= 	(tmpItemType == Constants.HALF_AND_HALF_ITEM) ? true :false;

						if(isDealItem && !noOfComponents) return callback(null,true);

						if(unitLists.length<=0 || ((isHalfItem && unitLists.length < noOfDuplicate) && (isDealItem && unitLists.length < noOfComponents))){
							return callback(null,false);
						}

						let validAllOverItem = 	true;
						let validItemGroup	 = 	true;
						asyncEach(unitLists, (data, eachCallback)=> {
							let tmpUnitId 		= 	(data.unit_id) 		?	new ObjectId(data.unit_id)     :"";
							let tmpDoughId 		=	(data.dough_id) 	? 	new ObjectId(data.dough_id)    :"";
							let tmpItemUnitId 	= 	(data.item_unit_id) ? 	new ObjectId(data.item_unit_id):"";
							let tmpSelectorId 	= 	(data.selector_id) 	? 	new ObjectId(data.selector_id) :"";

							asyncParallel({
								valid_unit : (firstParallelCallback)=>{
									if(isHalfItem) return firstParallelCallback(null,true);

									/** Find item unit record using unit id**/
									this.itemUnitsDb.countDocuments({
										item_unit_id : tmpUnitId,
										item_id 	 : itemId,
										status	     : Constants.ACTIVE
									}).then(unitResult=>{
										firstParallelCallback(null,unitResult);
									}).catch(next);
								},
								valid_dough: (firstParallelCallback)=>{
									if(isHalfItem) return firstParallelCallback(null,true);

									/** Find item dough units record using dough id **/
									this.itemDoughUnitsDb.countDocuments({
										_id			 : tmpDoughId,
										parents 	 : { $in: [tmpItemUnitId]},
										item_id 	 : itemId,
										restaurant_id: restaurantId,
										status		 : Constants.ACTIVE
									}).then(doughResult=>{
										firstParallelCallback(null,doughResult);
									}).catch(next);
								},
								valid_selector: (firstParallelCallback)=>{
									let selectorItemUnitId	= (isHalfItem) ? itemUnitId	:tmpItemUnitId;
									let selectorDoughId 	= (isHalfItem) ? doughId 	:tmpDoughId;

									/** Find item selector units record using selector id **/
									this.itemSelectorUnitsDb.countDocuments({
										_id			       : tmpSelectorId,
										parents 	       : {$in: [selectorItemUnitId]},
										item_id 	 	   : itemId,
										restaurant_id	   : restaurantId,
										status		 	   : Constants.ACTIVE,
										dough_type_parents : {$in: [selectorDoughId]},
									}).then(selectorResult=>{
										firstParallelCallback(null,selectorResult);
									}).catch(next);
								},
							},(asyncFirstErr,asyncFirstResponse)=>{
								if(asyncFirstErr) return eachCallback(asyncFirstErr);

								if(!asyncFirstResponse.valid_unit || !asyncFirstResponse.valid_dough || !asyncFirstResponse.valid_selector){
									validAllOverItem = false;
								}

								if(!validAllOverItem || !data.extra_items || data.extra_items.length <=0) return eachCallback(null);

								asyncEach(data.extra_items, (records, eachSubCallback)=> {
									let groupId = (records.group_id) ? new ObjectId(records.group_id) :"";

									asyncParallel({
										group_id: (groupCallback)=>{
											/** Find item choices groups record using group id **/
											this.itemChoicesGroupsDb.countDocuments({
												_id			  : groupId,
												item_id 	  : itemId,
												restaurant_id : restaurantId
											}).then(groupsResult=>{
												groupCallback(null,groupsResult);
											}).catch(next);
										},
										extra_item_details: (extraItemCallback)=>{
											asyncEach(records.extra_item_ids, (extraItemRecords, childEachCallback)=> {
												let extraItemId  = (extraItemRecords.extra_item_id) ? new ObjectId(extraItemRecords.extra_item_id) :"";
												let extraGroupId = (extraItemRecords.extra_group_item_id) ? new ObjectId(extraItemRecords.extra_group_item_id) :"";

												asyncParallel({
													extra_item_id: (childCallback)=>{
														/** Find item extra items record using extra item id **/
														this.itemExtraMastersDb.countDocuments({
															_id			 : extraItemId,
															item_id 	 : itemId,
															restaurant_id: restaurantId
														}).then(extraResult=>{
															childCallback(null,extraResult);
														}).catch(next);
													},
													extra_group_item_id: (childCallback)=>{
														/** Find item group extras record using extra group item id **/
														this.itemGroupExtrasDb.countDocuments({
															_id				: extraGroupId,
															group_id		: groupId,
															item_extra_id	: extraItemId,
															item_id 		: itemId
														}).then(groupExtraResult=>{
															childCallback(null,groupExtraResult);
														}).catch(next);
													},
												},(childErr,childResponse)=>{
													if(childErr) return childEachCallback(childErr);

													if(!childResponse.extra_item_id || !childResponse.extra_group_item_id){
														validItemGroup = false;
													}
													childEachCallback(null);
												});
											},(childEachErr)=> {
												extraItemCallback(childEachErr,null);
											});
										},
									},(asyncGroupErr,asyncGroupResponse)=>{
										if(asyncGroupErr) return eachSubCallback(childErr);

										if(!asyncGroupResponse.group_id) validItemGroup = false;

										eachSubCallback(null);
									});
								},(eachSubErr)=> {
									eachCallback(eachSubErr);
								});
							});
						},(eachErr)=> {
							let isValid =  (validAllOverItem && validItemGroup) ? true:false;
							callback(eachErr,isValid);
						});
					}).catch(next);
				},
				delete_other_restaurant_modified_orders : (callback)=>{
					/** Set cart conditions */
					let cartConditions = {};
					if(userId){
						cartConditions.customer_id  = userId;
					}else{
						cartConditions.device_id 	= deviceId;
					}
					cartConditions.restaurant_id	= 	{$ne : restaurantId};
					cartConditions.order_id	 		=	{$exists : true};

					/** Delete other restaurant modified order items */
					this.userCartDb.deleteMany(cartConditions).then(()=>{
						callback(null);
					}).catch(next);
				},
				delete_other_restaurant_items_cart : (callback)=>{
					/** Set cart conditions */
					let cartConditions = {};
					if(userId){
						cartConditions.customer_id  =	userId;
					}else{
						cartConditions.device_id 	=	deviceId;
					}
					cartConditions.restaurant_id	= 	{$ne : restaurantId};

					/** Delete other restaurant modified order items */
					this.userCartDb.deleteMany(cartConditions).then(()=>{
						callback(null);
					}).catch(next);
				},
				guest_have_modified_order : (callback)=>{
					if(userId || orderId) return callback(null,false);

					/** Set cart conditions */
					let cartConditions = {};
					if(userId){
						cartConditions.customer_id  =	userId;
					}else{
						cartConditions.device_id 	=	deviceId;
					}
					cartConditions.restaurant_id	= 	restaurantId;
					cartConditions.order_id			= 	{$exists: true};

					this.userCartDb.countDocuments(cartConditions).then(orderCount=>{
						callback(null,orderCount);
					}).catch(next);
				},
				autoselect_combo_items : (callback)=>{
					/** Find item  details **/
					this.itemsDb.findOne({
						_id 		  : itemId,
						is_active	  : Constants.ACTIVE,
						item_type	  : Constants.COMBO_ITEM,
						restaurant_id : restaurantId,
					},{projection: {_id: 1}}).then(itemResult=>{
						if(!itemResult) return callback(null,itemResult);

						asyncParallel({
							unit_id : (childCallback)=>{
								if(unitId) return childCallback(null,unitId);

								/** Get unit details */
								this.itemUnitsDb.findOne({
									item_id 		 : itemId,
									is_auto_selected : true
								},{projection: {_id: 1,item_unit_id: 1}}).then(unitResult=>{
									childCallback(null,unitResult?.item_unit_id ||"");
								}).catch(next);
							},
						},(childErr, childResponse)=>{
							if(childErr || !childResponse.unit_id) return callback(childErr,null);

							let tmpUnitId = childResponse.unit_id;

							/** Get extra items */
							this.itemGroupExtrasDb.aggregate([
								{$match: 	{
									item_id 		 	: 	itemId,
									unit_id 			: 	tmpUnitId,
									is_auto_selected 	:	true
								}},
								{$lookup: {
									from 		: 	Tables.ITEM_EXTRA_MASTERS,
									localField 	:	"item_extra_id",
									foreignField: 	"_id",
									as 			: 	"extra_item_detail"
								}},
								{$addFields : {
									extra_fees : {$ifNull: [ "$extra_fees", {$arrayElemAt: ["$extra_item_detail.extra_fees",0]} ] },
								}},
								{$sort  : {group_id: Constants.SORT_ASC, extra_fees: Constants.SORT_ASC }},
								{$group	: {
									_id			 		: "$group_id",
									group_id			: {$first : "$group_id"},
									item_extra_id		: {$first : "$item_extra_id"},
									extra_group_item_id	: {$first : "$_id"},
								}},
							]).toArray().then(exItemResult=>{
								if(exItemResult.length <=0) return callback(null,null);

								let tmpExList = {};
								exItemResult.map(tmpData =>{
									let tmpGroupId 		= 	tmpData.group_id;
									let tmpGroupExId 	= 	tmpData.extra_group_item_id;
									let tmpItemExtraId 	=	tmpData.item_extra_id;

									if(!tmpExList[tmpGroupId]){
										tmpExList[tmpGroupId] = {
											group_id 		: tmpGroupId,
											extra_item_ids	: []
										};
									}

									tmpExList[tmpGroupId].extra_item_ids.push({
										extra_item_id 		: tmpItemExtraId,
										extra_group_item_id : tmpGroupExId,
									});
								});

								return callback(null,{
									unit_id 	: tmpUnitId,
									extra_items : Object.values(tmpExList)
								});
							}).catch(next);
						});
					});
				},
			},(asyncErr, asyncResponse)=>{
				if(asyncErr) return next(asyncErr);

				let validConditionsItem = (asyncResponse.valid_conditions_item) ? asyncResponse.valid_conditions_item : false;
				let userDetails 		= (asyncResponse.user_details) 		 ? asyncResponse.user_details 	    :0;
				let restaurantDetails 	= (asyncResponse.restaurant_details) ? asyncResponse.restaurant_details :0;
				let branchDetails 	 	= (asyncResponse.branch_details) 	 ? asyncResponse.branch_details 	:0;
				let areaDetails 	 	= (asyncResponse.area_details) 	 	 ? asyncResponse.area_details 		:0;
				let itemDetails 		= (asyncResponse.item_details) 		 ? asyncResponse.item_details 	    :0;
				let unitDetails		 	= (asyncResponse.unit_details) 		 ? asyncResponse.unit_details 	    :0;
				let doughDetails 	 	= (asyncResponse.dough_details) 	 ? asyncResponse.dough_details 	    :0;
				let selectorDetails 	= (asyncResponse.selector_details) 	 ? asyncResponse.selector_details   :0;
				let offerDetails 	 	= (asyncResponse.offer_details) 	 ? asyncResponse.offer_details      :0;
				let extraItemsDetails 	= (asyncResponse.extra_items_details)? asyncResponse.extra_items_details:false;
				let allExtraDetails 	= (asyncResponse.all_extra_details)	? asyncResponse.all_extra_details	:"";
				let cartItemDetails 	= (asyncResponse.cart_item_details)	? asyncResponse.cart_item_details	:"";
				let checkItem 			= (asyncResponse.check_item)		? asyncResponse.check_item			:0;

				/** Send error response if user id,restaurant id, branch id, item id, unit id, dough id, selector id, offer id is not valid **/
				if(!validConditionsItem || userDetails == 0 || restaurantDetails == 0 || branchDetails == 0 || areaDetails ==0 || itemDetails == 0 || unitDetails == 0 || doughDetails == 0 || selectorDetails == 0 || offerDetails == 0 || !extraItemsDetails){
					let returnResponse = {
						status 	: 	Constants.STATUS_ERROR,
						message	:	res.__("system.something_going_wrong_please_try_again")
					};

					if(userDetails == 0) 		returnResponse.valid_user_id 		= true;
					if(restaurantDetails == 0) 	returnResponse.valid_restaurant_id 	= true;
					if(branchDetails == 0)		returnResponse.valid_branch_id 		= true;
					if(itemDetails == 0) 		returnResponse.valid_item_id 		= true;
					if(unitDetails == 0) 		returnResponse.valid_unit_id 		= true;
					if(doughDetails == 0)	 	returnResponse.valid_dough_id 		= true;
					if(selectorDetails == 0) 	returnResponse.valid_selector_id 	= true;
					if(offerDetails == 0) 		returnResponse.valid_offer_id 		= true;
					if(areaDetails == 0) 		returnResponse.valid_area_id 		= true;
					if(!extraItemsDetails) 		returnResponse.valid_extra_item 	= true;
					if(!validConditionsItem) 	returnResponse.valid_conditions_item = true;

					return resolve(returnResponse);
				}

				/** Send error response */
				if(allExtraDetails && allExtraDetails.required_extra_count && allExtraDetails.required_extra_count >0){
					if(extraItems.length <=0 && unitLists.length <=0){
						return resolve({
							status 	: 	Constants.STATUS_ERROR,
							message	:	res.__("user_carts.you_should_select_extras")
						});
					}

					let requiredGroupDetails	= 	allExtraDetails.required_group_details;
					let requiredMaxGroupDetails	= 	allExtraDetails.required_max_group_details;
					let requiredExtraCount 		=	allExtraDetails.required_extra_count;
					let selectedExtraCount		= 	0;

					let maxReachedObj = {};
					if(extraItems.length >0){
						extraItems.map(records=>{
							let tmpGroupId 			=	records.group_id;
							let simphony 			=	records.simphony;
							let tmpSelectedCount	= 	records.extra_item_ids.length;

							if(simphony){
								let tmpCount = 0;
								records.extra_item_ids.forEach(element=>{
									if(element.qty){
										element.qty =	parseInt(element.qty);
										tmpCount 	+= 	element.qty;
									}
								});

								tmpSelectedCount = tmpCount;
							}

							if(requiredGroupDetails[tmpGroupId]){
								if(tmpSelectedCount > requiredGroupDetails[tmpGroupId]){

									if(tmpSelectedCount > requiredMaxGroupDetails[tmpGroupId]) maxReachedObj[tmpGroupId] = tmpGroupId;

									selectedExtraCount += requiredGroupDetails[tmpGroupId]
								}else{
									selectedExtraCount += tmpSelectedCount;
								}
							}
						});
					}

					if(unitLists.length >0){
						unitLists.map(data=>{
							if(data.extra_items && data.extra_items.length >0){
								data.extra_items.map(records=>{
									let tmpGroupId = records.group_id;
									if(requiredGroupDetails[tmpGroupId]){
										if(records.extra_item_ids.length > requiredGroupDetails[tmpGroupId]){
											selectedExtraCount += requiredGroupDetails[tmpGroupId]
										}else{
											selectedExtraCount += records.extra_item_ids.length;
										}
									}
								});
							}
						});
					}

					if(maxReachedObj &&  Object.keys(maxReachedObj).length){
						let tmpMsg = [];

						Object.keys(maxReachedObj).forEach(key=>{
							tmpMsg.push({param: `extra_items_${key}`, msg:res.__("admin.order.please_select_extra_items_max")});
						});

						return resolve({status:	Constants.STATUS_ERROR, message: tmpMsg});
					}

					if(requiredExtraCount > selectedExtraCount){
						return resolve({
							status 	: 	Constants.STATUS_ERROR,
							message	:	res.__("user_carts.you_should_select_extras")
						});
					}
				}

				/** Add auto select extra item (only in kfg combo items)  */
				if(asyncResponse.autoselect_combo_items){
					unitId 		= 	asyncResponse.autoselect_combo_items.unit_id;
					extraItems 	=	extraItems.concat(asyncResponse.autoselect_combo_items.extra_items);
				}

				if(cartId && orderId){
					if(extraItems.length >0 && cartItemDetails){
						extraItems.map(records=>{
							let tmpGroupId = records.group_id;
							if(records.extra_item_ids.length > 0){
								records.extra_item_ids.map(ids => {
									if(!cartItemDetails[tmpGroupId] || cartItemDetails[tmpGroupId][ids.extra_group_item_id]){
										addByAdmin=	true;
									}
								});
							}

							if(!addByAdmin && cartItemDetails[tmpGroupId] && records.extra_item_ids.length != Object.keys(cartItemDetails[tmpGroupId]).length){
								addByAdmin=	true;
							}
						});

						if(!addByAdmin && extraItems.length != Object.keys(cartItemDetails).length){
							addByAdmin=	true;
						}
					}else if(cartItemDetails || (!cartItemDetails && extraItems.length >0 )){
						addByAdmin=	true;
					}
				}

				/** Set update data */
				let updatedData = {
					qty				:	qty,
					restaurant_id	:	restaurantId,
                    branch_id		:	branchId,
                    area_id			:	areaId,
					item_id			:	itemId,
					item_type		:	itemType,
					note			:	note,
					extra_items		:	extraItems,
					unit_lists		:	unitLists,
					modified 		: 	getUtcDate()
				};

				if(unitId) 		updatedData.unit_id 	= unitId;
				if(doughId) 	updatedData.dough_id 	= doughId;
				if(selectorId) 	updatedData.selector_id = selectorId;
				if(offerId) 	updatedData.offer_id 	= offerId;
				if(itemUnitId) 	updatedData.item_unit_id= itemUnitId;
				if(orderId)		updatedData.order_id	= orderId;
				if(maxModifiedTime)	updatedData.max_modified_time 	= 	getUtcDate(maxModifiedTime);
				if(req.body.cart_id)  updatedData.cart_id  			= 	new ObjectId(req.body.cart_id);
				if(req.body.device_type)  updatedData.device_type  	= 	req.body.device_type;
				if(req.body.device_token) updatedData.device_token 	=	req.body.device_token;
				if(addByAdmin) updatedData.add_by_admin 	=	addByAdmin;

				if(userId){
					updatedData.customer_id  = userId;
				}else{
					updatedData.device_id 	 = deviceId;
				}
				if(!checkItem) updatedData['is_modified'] =	true;

				if(!cartId){
					cartId = new ObjectId();
					updatedData.last_qty = parseInt(qty);
				}

				/** Update cart details */
				this.userCartDb.updateOne({
					_id : new ObjectId(cartId)
				},
				{
					$set: updatedData,
					$setOnInsert: {
						created : getUtcDate(),
					}
				},{upsert: true}).then(()=>{

					asyncParallel({
						cart_details : (childCallback)=>{
							/** Get cart total */
							let cartOptions = {
								user_id 		: userId,
								device_id 		: deviceId,
								cart_total_only : true,
							};

							this.getUserCartList(req,res,next,cartOptions).then(cartResponse=>{
								if(cartResponse.status != Constants.STATUS_SUCCESS) return childCallback(cartResponse);
								childCallback(null,cartResponse);
							}).catch(next);
						},
						cart_count : (childCallback)=>{
							/** Get cart count */
							this.getCartCount(req,res,next).then(cartResponse=>{
								if(cartResponse.status != Constants.STATUS_SUCCESS) return childCallback(cartResponse);
								childCallback(null,cartResponse.count);
							}).catch(next);
						},
					},(asyncChildErr, asyncChildResponse)=>{
						if(asyncChildErr) return next(asyncChildErr);

						/** Send success response **/
						resolve({
							status			: Constants.STATUS_SUCCESS,
							cart_id 		: cartId,
							total_amount 	: asyncChildResponse.cart_details.grand_total,
							total_discount 	: asyncChildResponse.cart_details.total_discount,
							cart_count 		: asyncChildResponse.cart_count,
							message 		: res.__("user_carts.item_added_into_cart_successfully"),
						});
					});
				}).catch(next);
			});
        }).catch(next);
	};// end updateCart()

	/**
	 * Function to remove item form cart
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	**/
	async removeCartItems(req,res,next){
		return new Promise(async resolve=>{
			/** Sanitize Data **/
			req.body 		=	sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
            let cartId		= 	(req.body.cart_id) 			?	new ObjectId(req.body.cart_id) 			:"";
            let userId		= 	(req.body.user_id) 			?	new ObjectId(req.body.user_id) 			:"";
			let deviceId	= 	(req.body.device_id)		?	req.body.device_id						:"";
			let restaurantId= 	(req.body.restaurant_id) 	?	new ObjectId(req.body.restaurant_id)	:"";

			/** Send error response **/
			if((!userId && !deviceId) || (!cartId && !restaurantId)) return resolve({status: Constants.STATUS_ERROR, message: res.__("system.missing_parameters")});

			/** Set cart conditions */
			let cartConditions = {};
			if(userId){
				cartConditions.customer_id 	= 	userId;
			}else{
				cartConditions.device_id	=	deviceId;
			}

			if(cartId) 			cartConditions._id 				=	cartId;
			if(restaurantId) 	cartConditions.restaurant_id 	=	restaurantId;

			/** Get cart count  */
			let cartResult = await this.userCartDb.distinct("_id",cartConditions);

			/** Send error response */
			if(cartResult.length <= 0) return resolve({status: Constants.STATUS_ERROR, message: res.__("system.invalid_access") });

			asyncParallel({
				remove_cart : (callback)=>{
					/** Delete user cart */
					this.userCartDb.deleteMany({_id: {$in: cartResult}}).then(() =>{
						callback(null);
					}).catch(next);
				},
				check_offer : (callback)=>{
					let offerConditions ={
						cart_ids : {$in: cartResult}
					};

					if(userId){
						offerConditions.user_id 	=	userId;
					}else{
						offerConditions.device_id 	=	deviceId;
					}

					/** Check offer  */
					this.tmpOfferLogsDb.find(offerConditions,{projection: {cart_ids: 1}}).toArray().then(offerResult =>{
						if(offerResult.length <=0) return callback(null);

						let allCartIds = [];
						offerResult.map(records=>{
							allCartIds = allCartIds.concat(records.cart_ids);
						});

						asyncParallel({
							check_offer_logs : (subCallback)=>{
								this.offerLogsDb.find({
									cart_ids : {$in: allCartIds}
								},{projection: {cart_ids: 1, order_discount: 1, offer_id: 1}}).toArray().then(logResult =>{
									if(logResult.length <=0) return subCallback(null);

									let allLogIds 	= [];
									let totalAmount = 0;
									logResult.map(records=>{
										allLogIds.push(records._id);
										totalAmount += records.order_discount;

									});

									asyncParallel({
										remove_temp_offer_logs : (childCallback)=>{
											/** Delete logs  */
											this.tmpOfferLogsDb.deleteMany(offerConditions).then(() =>{
												childCallback(null);
											}).catch(next);
										},
										remove_offer_logs : (childCallback)=>{
											/** Delete logs  */
											this.offerLogsDb.deleteMany({
												_id : {$in: allLogIds}
											}).then(() =>{
												childCallback(null);
											}).catch(next);
										},
										update_offer : (childCallback)=>{

											/** Set conditions */
											let usedConditions = {
												offer_log_ids : {$in : allLogIds}
											}

											if(userId){
												usedConditions.user_id 	= 	userId;
											}else{
												usedConditions.device_id	=	deviceId;
											}

											/** Update  offer */
											this.offerUsedDb.updateMany(usedConditions,
											{
												$set: {
													modified : getUtcDate(),
												},
												$inc :{
													offer_used 		  : -1,
													total_amount_used : totalAmount*-1,
												},
												$pull :{
													offer_log_ids : {$in : allLogIds}
												}
											}).then(() =>{
												childCallback(null);
											}).catch(next);
										}
									},(childParallelErr)=>{
										subCallback(childParallelErr);
									});
								});
							},
							remove_all_offer : (subCallback)=>{
								if(restaurantId) return subCallback(null);

								/** Remove all cart offer */
								this.userCartDb.updateMany({
									_id : {$in : allCartIds}
								},
								{$set: {
									modified : getUtcDate(),
								},$unset :{
									offer_id : 1
								}}).then(() =>{
									subCallback(null);
								}).catch(next);
							}
						},(asyncSubErr)=>{
							callback(asyncSubErr);
						});
					}).catch(next);
				},
			},(asyncErr)=>{
				if(asyncErr) return next(asyncErr);

				/** Send success response */
				resolve({status: Constants.STATUS_SUCCESS, message: res.__("user_carts.item_has_deleted_from_cart_successfully") });
			});
        }).catch(next);
	};// end removeCartItems()

	/**
	 * Function to get cart item count
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	**/
	async getCartCount(req,res,next){
		return new Promise(resolve=>{
			/** Sanitize Data **/
			req.body 	=	sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
			let userId	= 	(req.body.user_id)	?	new ObjectId(req.body.user_id)	:"";
			let deviceId= 	(req.body.device_id)?	req.body.device_id				:"";

			/** Send error response **/
			if(!userId && !deviceId) return resolve({status: Constants.STATUS_ERROR, message:res.__("system.missing_parameters")});

			/** Set cart conditions */
			let conditions = {
				$or : [
					{max_modified_time : {$exists: false}},
					{max_modified_time : {$gte: newDate()}},
				]
			};
			if(userId){
				conditions.customer_id 	= 	userId;
			}else{
				conditions.device_id	=	deviceId;
			}

			/** Get cart count */
			this.userCartDb.aggregate([
				{$match : 	conditions},
				{$lookup:	{
					from     : Tables.ITEMS,
					let      : {itemId : "$item_id"},
					pipeline : [
						{$match : {
							$expr: {
								$and : [
									{$eq: ["$_id", "$$itemId"]},
									{$eq: ["$is_active", Constants.ACTIVE]},
								]
							}
						}},
						{$project : {_id: 1}},
					],
					as:	"item_details"
				}},
				{$match:{
					"item_details._id" : {$exists: true}
				}},
				{$count	: "count"},
			]).toArray().then(cartResult=>{

				/** Send success response */
				let cartCount = (cartResult && cartResult[0]) ? cartResult[0].count :0;
				resolve({status: Constants.STATUS_SUCCESS, count: cartCount });
			}).catch(next);
		}).catch(next);
	};// end getCartCount()

	/**
	 * Function to get cart item list
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	**/
	async getCartList(req,res,next){
		return new Promise(resolve=>{
			/** Sanitize Data **/
			req.body = sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);

			/** Get user cart list */
			let cartOptions 	= clone(req.body);
			cartOptions.is_cart = true;
			this.getUserCartList(req,res,next,cartOptions).then(response=>{
				resolve(response);
			}).catch(next);
        }).catch(next);
	};// end getCartList()

	/**
	 * Function to get cart item list
	 *
	 * @param req		As Request Data
	 * @param res		As Response Data
	 * @param next		As Callback argument to the middleware function
	 * @param options	As object data
	 *
	 * @return json
	**/
	async getUserCartList(req,res,next, options){
		return new Promise(resolve=>{
			let userId					= 	(options.user_id)					?	new ObjectId(options.user_id)		:"";
            let deviceId				= 	(options.device_id)	 				?	options.device_id					:"";
			let isCart					= 	(options.is_cart)					?	options.is_cart						:"";
			let isPlaceOrder			= 	(options.is_place_order)			?	options.is_place_order				:"";
			let isCheckOffer			= 	(options.is_check_offer)			?	options.is_check_offer				:"";
			let branchId				= 	(options.branch_id) 				?	new ObjectId(options.branch_id)		:"";
			let restaurantId			= 	(options.restaurant_id)				?	new ObjectId(options.restaurant_id)	:"";
			let modifiedOrderId			= 	(options.order_id)					?	new ObjectId(options.order_id)		:"";
			let isBranchAvailability	= 	(options.is_branch_availability)	?	options.is_branch_availability		:"";
			let pickupBranchList		= 	(options.pickup_branch_list)		?	options.pickup_branch_list			:{};
			let cartTotalOnly 			= 	(options.cart_total_only)			? 	options.cart_total_only				:false;
			let isPlaceModifiedOrder	=	(options.is_place_modified_order)	?	options.is_place_modified_order		:"";
			let scheduledBranchList 	= 	(options.scheduled_branch_list)		? 	options.scheduled_branch_list 		:{};

			/** Send error response **/
			if(!userId && !deviceId) return resolve({status: Constants.STATUS_ERROR, message:res.__("system.missing_parameters")});

			/** Set success response */
			let successResponse = {
				status: Constants.STATUS_SUCCESS, result: [], grand_total: 0, total_discount: 0, item_image_url: Constants.ITEMS_FILE_URL
			};

			if(isCart){
				successResponse.pick_restaurant_note = {
					en : (res.locals.settings["App.pick_restaurant_note"]) ? res.locals.settings["App.pick_restaurant_note"]	:"",
					ar : (res.locals.settings["App.pick_restaurant_note_in_arabic"]) ? res.locals.settings["App.pick_restaurant_note_in_arabic"] :"",
				};

				// successResponse.allow_delivery_in_multiple_order = (res.locals.settings["App.allow_delivery_in_multiple_order"]) ? res.locals.settings["App.allow_delivery_in_multiple_order"] :"";

				// successResponse.allow_pickup_in_multiple_order = (res.locals.settings["App.allow_pickup_in_multiple_order"]) ?	res.locals.settings["App.allow_pickup_in_multiple_order"]	:"";
			}

			asyncParallel({
				corporate_details : (parentCallback)=>{
					if(!userId || (!isCart && !isPlaceOrder)) return parentCallback(null,null);

					let userConditions 			=	clone(Constants.CUSTOMER_COMMON_CONDITIONS);
					userConditions._id 			= 	userId;
					userConditions.corporate_id = 	{$exists : true};

					/** Get users details **/
					this.usersDb.findOne(userConditions,{projection: {corporate_id: 1}}).then(userResult=> {
						if(!userResult) return parentCallback(null,userResult);

						/** Get corporate details */
						let corporateId = userResult.corporate_id;
						const corporate_tie_ups = 	this.db.collection(Tables.CORPORATE_TIE_UPS);
						corporate_tie_ups.findOne({
							_id : corporateId
						},{projection: {discounts:1, free_delivery:1,minimum_order_amount:1}}).then(corporateResult=> {
							parentCallback(null,corporateResult);
						}).catch(next);
					}).catch(next);
				},
				cart_list : (parentCallback)=>{
					/** Set cart conditions */
					let conditions = {};

					if(!isPlaceModifiedOrder){
						conditions = {
							$or : [
								{max_modified_time : {$exists: false}},
								{max_modified_time : {$gte: newDate()}},
							]
						};
					}

					if(userId){
						conditions.customer_id 	= 	userId;
					}else{
						conditions.device_id	=	deviceId;
					}

					if(isCheckOffer){
						conditions.branch_id	 = branchId;
						conditions.restaurant_id = restaurantId;
					}

					if(isBranchAvailability){
						conditions.restaurant_id = restaurantId;
					}

					this.userCartDb.aggregate([
						{$match : 	conditions},
						{$lookup:	{
							from     :Tables.ITEMS,
							let      : {itemId : "$item_id"},
							pipeline : [
								{$match : {
									$expr: {
										$and : [
											{$eq: ["$_id", "$$itemId"]},
											{$eq: ["$is_active", Constants.ACTIVE]},
										]
									}
								}},
								{$project : {_id: 1}},
							],
							as:	"item_details"
						}},
						{$match:{
							"item_details._id" : {$exists: true}
						}},
						{$sort		: {created: Constants.SORT_ASC}},
						{$project	: {modified: 0, item_details: 0}},
					]).toArray().then(cartResult=>{
						parentCallback(null,cartResult);
					}).catch(next);
				},
				package_details : (parentCallback)=>{
					if(!userId || (!isCart && !isPlaceOrder)) return parentCallback(null,null);

					let userConditions 			=	clone(Constants.CUSTOMER_COMMON_CONDITIONS);
					userConditions._id 			= 	userId;
					userConditions.package_id 	= 	{$exists : true};
					userConditions.package_status = Constants.PACKAGE_RUNNING;

					/** Get users details **/
					this.usersDb.findOne(userConditions,{projection: {package_id: 1, remaining_package_orders: 1}}).then(userResult=>{
						parentCallback(null,userResult);
					}).catch(next);
				},
				order_details : (callback)=>{
					if(!isPlaceModifiedOrder || !modifiedOrderId) return callback(null,null);

					/** Get order details **/
					this.ordersDb.findOne({
						_id : modifiedOrderId
					},{projection: {delivery_type: 1, is_schedule: 1, scheduled_to_submit_time: 1}}).then(orderResult=>{
						callback(null,orderResult);
					}).catch(next);
				},
				outstanding_details : (callback)=>{
					if(!userId || cartTotalOnly || isBranchAvailability || isPlaceModifiedOrder){
						return callback(null,{});
					}

					/** Get user outstanding order details **/
					this.usersDb.findOne({
						_id 			:	userId,
						revert_orders 	: 	{$exists: true}
					},{projection: { revert_orders: 1}}).then(userResult=>{
						let totalOutStanding 	= 	0;
						let outStandingOrderList	=	[];
						if(userResult && userResult.revert_orders && userResult.revert_orders.length >0){
							outStandingOrderList = userResult.revert_orders;
							userResult.revert_orders.map(records=>{
								if(records.outstanding_amount){
									totalOutStanding +=	records.outstanding_amount;
								}
							});

							successResponse.outstanding_order_amount 	= 	round(totalOutStanding);
							successResponse.outstanding_order_list 		=	outStandingOrderList;
						}
						callback(null,{
							outstanding_amount		:	totalOutStanding,
							outstanding_order_list	:	outStandingOrderList
						});
					}).catch(next);
				},
			},(parentParallelErr,parentParallelResponse)=>{
				if(parentParallelErr) return next(parentParallelErr);

				let cartResult 		 		=	parentParallelResponse.cart_list;
				let packageDetails 	 		= 	parentParallelResponse.package_details;
				let corporateDetails		= 	parentParallelResponse.corporate_details;
				let modifiedOrderDetails	=  	(parentParallelResponse.order_details) 	?	parentParallelResponse.order_details	:{};
				let modifiedDeliveryType	=  	(modifiedOrderDetails.delivery_type)	? 	modifiedOrderDetails.delivery_type 		:"";
				let modifiedOrderSchedule	=  	(modifiedOrderDetails.is_schedule && !modifiedOrderDetails.scheduled_to_submit_time) ? true :false;
				let packageId		 =	"";
				let packageCount	 =	0;
				let unLimitedPackage =	false;
				if(packageDetails){
					packageId 		= 	packageDetails.package_id;
					packageCount	=	packageDetails.remaining_package_orders;

					/** When package order count is empty */
					if(packageCount.length <=0) unLimitedPackage = true;
				}

				/** Send success response */
				if(cartResult.length < 0) return resolve(successResponse);

				let cartList 	= 	{};
				cartResult.map(data=>{
                    let restaurantId    =   data.restaurant_id;
					let branchId        =   data.branch_id;

					if(isPlaceOrder && pickupBranchList[restaurantId])  branchId = new ObjectId(pickupBranchList[restaurantId]);

					if(!cartList[restaurantId]) cartList[restaurantId] = {};
					if(!cartList[restaurantId][branchId]){
						cartList[restaurantId][branchId] = {
							restaurant_id	: 	restaurantId,
							branch_id		:	branchId,
							customer_id		:	data.customer_id,
							device_id		:	data.device_id,
							area_id		    :	data.area_id,
							offer_id		:	data.offer_id,
						};
					}

					if(data.order_id) cartList[restaurantId][branchId].order_id = data.order_id;

                    if(!cartList[restaurantId][branchId].item_list) cartList[restaurantId][branchId].item_list = [];

                    if(data.restaurant_id)  delete data.restaurant_id;
                    if(data.branch_id)      delete data.branch_id;
                    if(data.area_id)        delete data.area_id;
                    if(data.order_id)       delete data.order_id;
                    if(typeof data.device_id != typeof undefined) delete data.device_id;
                    if(typeof data.customer_id != typeof undefined) delete data.customer_id;

					cartList[restaurantId][branchId].item_list.push(data);
				});

				asyncForEachOf(cartList,(listData,tempBranchId,parentEachCallback)=>{
					asyncEach(cartList[tempBranchId], (records, eachCallback)=> {
						let restaurantId	=	records.restaurant_id;
						let branchId 		= 	records.branch_id;
						let areaId 	    	= 	records.area_id;
						let offerId 		= 	records.offer_id;
						let deliveryBy  	=   "";
						let scheduledBranchId = (scheduledBranchList[restaurantId] && scheduledBranchList[restaurantId][branchId]) ? scheduledBranchList[restaurantId][branchId] :"";

						if(isPlaceOrder && pickupBranchList[restaurantId])  deliveryBy = Constants.DELIVERY_BY_PICK_UP;
						if(isPlaceOrder && modifiedDeliveryType)  deliveryBy = modifiedDeliveryType;

						records.branch_available = true;
						asyncParallel({
							restaurant_details : (callback)=>{
								if(cartTotalOnly) return callback(null);

								/** Get restaurant details **/
								this.restaurantsDb.findOne({
									_id 		: restaurantId,
									status      : Constants.ACTIVE,
									is_deleted  : Constants.NOT_DELETED,
								},{projection: {name: 1, image: 1, concept_id: 1,landing_image:1,detail_image:1,simphony:1,auto_close_order_time:1}}).then(restaurantResult=>{
									if(restaurantResult){
										records.restaurant_name		  	=  	restaurantResult.name;
										records.restaurant_image	  	=  	restaurantResult.image;
										records.concept_id			  	=  	restaurantResult.concept_id;
										records.partners 			  	= 	(restaurantResult.concept_id) ? KFG_PARTNER :"";
										records.grid_image			  	= 	restaurantResult.landing_image;
										records.detail_image		  	=	restaurantResult.detail_image;
										records.simphony		  		=	restaurantResult.simphony;
										records.auto_close_order_time	=	restaurantResult.auto_close_order_time;
										records.aghzeya_restaurant_id	=	restaurantResult.aghzeya_restaurant_id;
									}else{
										records.branch_available =  false;
									}
									callback(null,restaurantResult);
								}).catch(next);
							},
							branch_details : (callback)=>{
								if(cartTotalOnly) return callback(null);

								/** Get restaurant details **/
								this.restaurantBranchesDb.aggregate([
									{$match: {
										_id 			:	branchId,
										is_active		: 	Constants.ACTIVE,
										restaurant_id	: 	restaurantId,
									}},
									{$lookup:	{
										from     : Tables.RESTAURANT_BRANCH_AREAS,
										let      : {restaurantId: "$restaurant_id", branchId : "$_id", areaId : "$area_id" },
										pipeline : [
											{$match : {
												$expr: {
													$and : [
														{$eq: ["$restaurant_id", "$$restaurantId"]},
														{$eq: ["$branch_id", "$$branchId"]},
														{$eq: ["$area_id", "$$areaId"]},
													]
												}
											}},
											{$project : { delivery_fees: 1, delivery_time:1, open:1,accept_pickup_orders:1,minimum_order_limit:1,accept_scheduling_orders:1, preparation_time: 1, delivery_by:1 }},
										],
										as	:	"area_details"
									}},
									{$project :{
										name: 1, address:1, branch_status:1, is_open:1, latitude:1,longitude:1,accepts_cashback_payment:1, area_id: 1, area_details: {$arrayElemAt: ["$area_details",0]},
									}},
								]).toArray().then(branchResult=>{
									if(branchResult && branchResult[0]){
										branchResult			=	branchResult[0];
										records.branch_name	    =  	branchResult.name;
										records.is_open	        =  	branchResult.is_open;
										records.branch_address	=  	branchResult.address;
										records.branch_status	=  	branchResult.branch_status;
										records.branch_area_id	=  	branchResult.area_id;

										if(isPlaceOrder){
											records.branch_latitude		=  branchResult.latitude;
											records.branch_longitude	=  branchResult.longitude;
											records.accepts_cashback_payment= branchResult.accepts_cashback_payment;
										}

										if(scheduledBranchId || modifiedOrderSchedule){
											records.is_open	        =  Constants.OPEN;
											records.branch_status	=  Constants.OPEN;
										}

										if(deliveryBy == Constants.DELIVERY_BY_PICK_UP){
											records.area_status	   				=	Constants.OPEN;
											records.delivery_fees				=  	0;
											records.delivery_by					= 	Constants.DELIVERY_BY_PICK_UP;
											records.delivery_time				=	(branchResult.area_details) ? 	branchResult.area_details.delivery_time 			:0;
											records.preparation_time			=	(branchResult.area_details) ? 	branchResult.area_details.preparation_time 			:0;
											records.minimum_order_limit			=	(branchResult.area_details) ? 	branchResult.area_details.minimum_order_limit 		:0;
											records.accept_pickup_orders		=	(branchResult.area_details) ?	branchResult.area_details.accept_pickup_orders 		:0;
											records.accept_scheduling_orders	=	(branchResult.area_details)	? 	branchResult.area_details.accept_scheduling_orders	:0;
										}
									}else{
										records.branch_available =  false;
									}
									callback(null,branchResult);
								}).catch(next);
							},
							area_details : (callback)=>{
								if(cartTotalOnly || deliveryBy == Constants.DELIVERY_BY_PICK_UP ) return callback(null);

								/** Get branch area details **/
								this.restaurantBranchAreasDb.findOne(
									{
										restaurant_id	: restaurantId,
										branch_id 		: branchId,
										area_id 		: areaId,
									},
									{projection: {delivery_fees: 1, delivery_time:1, open:1,accept_pickup_orders:1,minimum_order_limit:1,accept_scheduling_orders:1, preparation_time: 1, delivery_by:1}}
								).then(areaResult => {
									if(areaResult){
                                        records.area_status	    =  	(deliveryBy == Constants.DELIVERY_BY_PICK_UP) ? Constants.OPEN :areaResult.open;
										records.delivery_time	=  	(deliveryBy != Constants.DELIVERY_BY_PICK_UP) ? areaResult.delivery_time :0;
										records.delivery_fees	=  	(deliveryBy != Constants.DELIVERY_BY_PICK_UP) ? areaResult.delivery_fees :0;
										records.delivery_by		=  	(deliveryBy) ? deliveryBy :areaResult.delivery_by;
										records.preparation_time=	areaResult.preparation_time;
										records.minimum_order_limit		=  	areaResult.minimum_order_limit;
										records.accept_pickup_orders	=  	areaResult.accept_pickup_orders;
										records.accept_scheduling_orders=	areaResult.accept_scheduling_orders;
									}else{
										if(deliveryBy == Constants.DELIVERY_BY_PICK_UP){
											records.delivery_by		=  	deliveryBy;
											records.area_status		=	Constants.OPEN;
											records.delivery_fees	=  	0;
										}else{
											records.branch_available =  false;
										}
									}
									callback(null,areaResult);
								}).catch(next);
							},
							item_list : (callback)=>{
								asyncEach(records.item_list, (itemData, itemEachCallback)=> {
									let itemId 		= 	itemData.item_id;
									let unitId 		= 	itemData.unit_id;
									let doughId 	= 	itemData.dough_id;
									let selectorId 	=	itemData.selector_id;

                                    if(!itemData.extra_item_list) itemData.extra_item_list = {en:[],ar:[]};
                                    if(doughId && !itemData.dough_list) itemData.dough_list= {en:[],ar:[]};
                                    if(selectorId && !itemData.selector_list) itemData.selector_list = {en:[],ar:[]};
                                    if(unitId && !itemData.unit_list) itemData.unit_list = {en:[],ar:[]};

									itemData.item_available =  true;

									asyncParallel({
										item_details : (itemCallback)=>{
											/** Get item details **/
											this.itemsDb.findOne({
												_id 			: 	itemId,
												restaurant_id 	:	restaurantId,
												is_active      	:	Constants.ACTIVE,
											},{projection: {name: 1, image: 1, item_price: 1,category_ids: 1, discount_percentage: 1, discount_value: 1,grid_image:1,detail_image:1,simphony_item_id:1 }}).then(itemResult => {
												if(itemResult){
													let tmpCuisineId	=  itemResult.cuisine_id;
													let tmpCategoryIds	=  itemResult.category_ids;
													itemData.item_name	=  itemResult.name;
													itemData.item_image	=  itemResult.image;
													itemData.discount_value=  itemResult.discount_value;
													itemData.discount_percentage= itemResult.discount_percentage;
													itemData.grid_image		=	itemResult.grid_image;
													itemData.detail_image	=	itemResult.detail_image;
													itemData.is_simphony	=	itemResult.simphony_item_id;

													if(itemResult.item_price) itemData.item_price	=  itemResult.item_price;

													if(tmpCuisineId) itemData.cuisine_ids=  [tmpCuisineId];

													if(tmpCuisineId || (!isCheckOffer && !isPlaceOrder)){
														return itemCallback(null,itemResult);
													}

													/** Set category conditions  */
													let tmpCatConditions = {
														is_active : Constants.ACTIVE
													};

													if(tmpCategoryIds && tmpCategoryIds.length >0){
														tmpCatConditions._id = {$in: tmpCategoryIds};
													}

													/** Get cuisine id */
													this.restaurantCategoriesDb.distinct("cuisine_id",tmpCatConditions).then(cuisineResult=>{
														itemData.category_ids = itemResult.category_ids;
														if(cuisineResult) itemData.cuisine_ids = cuisineResult;

														itemCallback(null,itemResult);
													}).catch(next);
												}else{
													itemData.item_available =  false;
													itemCallback(null,itemResult);
												}
											}).catch(next);
										},
										unit_details : (unitCallback)=>{
											if(!unitId) return unitCallback(null,null);

											this.itemUnitsDb.aggregate([
												{$match: 	{
													item_id		: itemId,
													item_unit_id: unitId
												}},
												{$lookup: 	{
													from			: Tables.ITEM_UNITS_MASTERS,
													localField		: "item_unit_id",
													foreignField	: "_id",
													as				: "unit_details",
												}},
												{$project	: 	{
													price: 1, discount_type: 1, discount_value: 1, unit_name: {$arrayElemAt:["$unit_details.name", 0] },
												}},
											]).toArray().then(unitResult=>{
												if(unitResult && unitResult.length >0){
													if(unitResult[0].price) itemData.unit_price =  unitResult[0].price;

													itemData.unit_discount_type =  unitResult[0].discount_type;
													itemData.unit_discount_value=  unitResult[0].discount_value;
													itemData.unit_list.en.push(unitResult[0].unit_name.en);
													itemData.unit_list.ar.push(unitResult[0].unit_name.ar);
												}else{
													itemData.item_available =  false;
												}
												unitCallback(null,unitResult);
											}).catch(next);
										},
										dough_details : (unitCallback)=>{
											if(!doughId) return unitCallback(null,null);
											this.itemDoughUnitsDb.aggregate([
												{$match: 	{
													_id	: doughId
												}},
												{$lookup: 	{
													from			: Tables.ITEM_UNITS_MASTERS,
													localField		: "item_unit_id",
													foreignField	: "_id",
													as				: "unit_details",
												}},
												{$project	: 	{
													unit_name: {$arrayElemAt:["$unit_details.name", 0] },
												}},
											]).toArray().then(doughResult=>{
												if(doughResult && doughResult.length >0){
													itemData.dough_list.en.push(doughResult[0].unit_name.en);
													itemData.dough_list.ar.push(doughResult[0].unit_name.ar);
												}
												unitCallback(null,doughResult);
											}).catch(next);
										},
										selector_details : (unitCallback)=>{
											if(!selectorId) return unitCallback(null,null);
											this.itemSelectorUnitsDb.aggregate([
												{$match: 	{
													_id		: selectorId
												}},
												{$lookup: 	{
													from			: Tables.ITEM_UNITS_MASTERS,
													localField		: "item_unit_id",
													foreignField	: "_id",
													as				: "unit_details",
												}},
												{$project	: 	{
													unit_name: {$arrayElemAt:["$unit_details.name", 0] },
												}},
											]).toArray().then(selectorResult=>{
												if(selectorResult && selectorResult.length >0){
													itemData.selector_list.en.push(selectorResult[0].unit_name.en);
													itemData.selector_list.ar.push(selectorResult[0].unit_name.ar);
												}
												unitCallback(null,selectorResult);
											}).catch(next);
										},
										extra_item_list : (exItemCallback)=>{
											if(!itemData.extra_items || itemData.extra_items.length <= 0) return exItemCallback(null,null);

											asyncEach(itemData.extra_items, (exItemData, exItemEachCallback)=> {
												let groupId = exItemData.group_id;

												asyncParallel({
													extra_group_item_list : (groupCallback)=>{
														asyncEach(exItemData.extra_item_ids, (exItemData, groupExItemEachCallback)=> {
															let extraItemId = exItemData.extra_item_id;
															let groupItemId	= exItemData.extra_group_item_id;

															asyncParallel({
																extra_details : (extraItemCallback)=>{
																	/** Get extra item details **/
																	this.itemExtraMastersDb.aggregate([
																		{ $match : {
																			_id 	 : 	extraItemId,
																			item_id	 :	itemId,
																			$or : [
																				{is_active:	Constants.ACTIVE },
																				{is_auto_selected:true }
																			]}
																		},
																		{$lookup:	{
																			from     : Tables.ITEM_GROUP_EXTRAS,
																			let      : {itemExtraId : "$_id"},
																			pipeline : [
																				{$match : {
																					$expr: {
																						$and : [
																							{$eq: ["$item_extra_id", "$$itemExtraId"]},
																						]
																					}
																				}},
																				{$project: {
																					extra_fees: 1
																				}},
																			],
																			as:	"extra_item_detail"
																		}},
																		{$project: {name: 1, extra_fees: { $ifNull: [ {$arrayElemAt: ["$extra_item_detail.extra_fees",0]},"$extra_fees"  ] }}}
																	]).toArray().then(exItemResult=>{
																		if(exItemResult && exItemResult[0]){
																			exItemResult	=	exItemResult[0];

																			itemData.extra_item_list.en.push(exItemResult.name.en);
																			itemData.extra_item_list.ar.push(exItemResult.name.ar);
																			if(!itemData.extra_item_list.detail) itemData.extra_item_list.detail = [];
																			itemData.extra_item_list.detail.push({...exItemResult,...{qty: exItemData.qty || 1}});
																			if(isPlaceOrder){
																				exItemData.extra_item_name = exItemResult.name;
																			}

																			if(exItemResult.extra_fees){
																				exItemData.extra_fees = exItemResult.extra_fees;
																			}
																		}else{
																			itemData.item_available =  false;
																		}
																		extraItemCallback(null,exItemResult);
																	}).catch(next);
																},
																extra_group_details: (extraItemGroupCallback)=>{
																	/** Get group details **/
																	this.itemGroupExtrasDb.findOne({
																		_id 	: 	groupItemId,
																		item_id	:	itemId,
																		group_id: 	groupId,
																		item_extra_id : extraItemId,
																	},{projection: {extra_fees: 1}}).then(groupItemResult=>{
																		if(groupItemResult){
																			if(groupItemResult.extra_fees){
																				exItemData.extra_fees = groupItemResult.extra_fees;
																			}
																		}else{
																			itemData.item_available =  false;
																		}
																		extraItemGroupCallback(null,groupItemResult);
																	}).catch(next);
																},
															},(parallelExGroupErr)=>{
																groupExItemEachCallback(parallelExGroupErr);
															});

														},(asyncGroupExItemErr)=>{
															groupCallback(asyncGroupExItemErr);
														});
													},
												},(parallelErr)=>{
													exItemEachCallback(parallelErr);
												});
											},(asyncExItemErr)=>{
												exItemCallback(asyncExItemErr);
											});
										},
										unit_item_list : (exItemCallback)=>{
											if(!itemData.unit_lists || itemData.unit_lists.length <= 0) return exItemCallback(null,null);

											asyncEach(itemData.unit_lists, (data, eachCallback)=> {
												if(!data.extra_items || data.extra_items.length <=0) return eachCallback(null);

												let unitId 		= 	data.unit_id;
												let doughId 	= 	data.dough_id;
												let selectorId 	=	data.selector_id;

												if(!itemData.unit_dough_list) itemData.unit_dough_list = {en:[],ar:[]};
												if(!itemData.unit_selector_list) itemData.unit_selector_list = {en:[],ar:[]};
												if(!itemData.unit_item_list) itemData.unit_item_list = {en:[],ar:[]};

												asyncParallel({
													unit_details : (listCallback)=>{
														if(!unitId) return listCallback(null,null);

														this.itemUnitsDb.aggregate([
															{$match: 	{
																item_id		: itemId,
																item_unit_id: unitId
															}},
															{$lookup: 	{
																from			: Tables.ITEM_UNITS_MASTERS,
																localField		: "item_unit_id",
																foreignField	: "_id",
																as				: "unit_details",
															}},
															{$project	: 	{
																price: 1, unit_name: {$arrayElemAt:["$unit_details.name", 0] },
															}},
														]).toArray().then(unitResult=>{
															if(unitResult && unitResult.length >0){
																if(unitResult[0].price) itemData.unit_price =  unitResult[0].price;
																itemData.unit_item_list.en.push(unitResult[0].unit_name.en);
																itemData.unit_item_list.en.push(unitResult[0].unit_name.en);
															}else{
																itemData.item_available =  false;
															}
															listCallback(null,unitResult);
														}).catch(next);
													},
													dough_details : (listCallback)=>{
														if(!doughId) return listCallback(null,null);
														this.itemDoughUnitsDb.aggregate([
															{$match: 	{
																_id		: doughId
															}},
															{$lookup: 	{
																from			: Tables.ITEM_UNITS_MASTERS,
																localField		: "item_unit_id",
																foreignField	: "_id",
																as				: "unit_details",
															}},
															{$project	: 	{
																unit_name: {$arrayElemAt:["$unit_details.name", 0] },
															}},
														]).toArray().then(doughResult=>{
															if(doughResult && doughResult.length >0){
																itemData.unit_dough_list.en.push(doughResult[0].unit_name.en);
																itemData.unit_dough_list.ar.push(doughResult[0].unit_name.ar);
															}
															listCallback(null,doughResult);
														}).catch(next);
													},
													selector_details : (listCallback)=>{
														if(!selectorId) return listCallback(null,null);
														this.itemSelectorUnitsDb.aggregate([
															{$match: 	{
																_id		: selectorId
															}},
															{$lookup: 	{
																from			: Tables.ITEM_UNITS_MASTERS,
																localField		: "item_unit_id",
																foreignField	: "_id",
																as				: "unit_details",
															}},
															{$project	: 	{
																unit_name: {$arrayElemAt:["$unit_details.name", 0] },
															}},
														]).toArray().then(selectorResult=>{
															if(selectorResult && selectorResult.length >0){
																itemData.unit_selector_list.en.push(selectorResult[0].unit_name.en);
																itemData.unit_selector_list.ar.push(selectorResult[0].unit_name.ar);
															}
															listCallback(null,selectorResult);
														}).catch(next);
													},
													extra_group_item_list : (listCallback)=>{
														asyncEach(data.extra_items, (exItemData, exItemEachCallback)=> {
															let groupId = exItemData.group_id;

															asyncParallel({
																extra_group_item_list : (groupCallback)=>{
																	asyncEach(exItemData.extra_item_ids, (exItemData, groupExItemEachCallback)=> {
																		let extraItemId = exItemData.extra_item_id;
																		let groupItemId	= exItemData.extra_group_item_id;

																		asyncParallel({
																			extra_details : (extraItemCallback)=>{
																				/** Get extra item details **/
																				this.itemExtraMastersDb.aggregate([
																					{ $match : {
																						_id 	 : 	extraItemId,
																						item_id	 :	itemId,
																						$or : [
																							{is_active:	Constants.ACTIVE },
																							{is_auto_selected:true }
																						]}
																					},
																					{$lookup:	{
																						from	 : Tables.ITEM_GROUP_EXTRAS,
																						let      : {itemExtraId : "$_id"},
																						pipeline : [
																							{$match : {
																								$expr: {
																									$and : [
																										{$eq: ["$item_extra_id", "$$itemExtraId"]},
																									]
																								}
																							}},
																							{$project: {
																								extra_fees: 1
																							}},
																						],
																						as:	"extra_item_detail"
																					}},
																					{$project: {name: 1, extra_fees: { $ifNull: [ {$arrayElemAt: ["$extra_item_detail.extra_fees",0]},"$extra_fees"  ] }}}
																				]).toArray().then(exItemResult=>{
																					if(exItemResult && exItemResult[0]){
																						exItemResult	=	exItemResult[0];
																						itemData.extra_item_list.en.push(exItemResult.name.en);
																						itemData.extra_item_list.ar.push(exItemResult.name.ar);

																						// if(isPlaceOrder){
																							exItemData.extra_item_name = exItemResult.name;
																						// }

																						if(exItemResult.extra_fees){
																							exItemData.extra_fees = exItemResult.extra_fees;
																						}
																					}else{
																						itemData.item_available =  false;
																					}
																					extraItemCallback(null,exItemResult);
																				}).catch(next);
																			},
																			extra_group_details: (extraItemGroupCallback)=>{
																				/** Get group details **/
																				this.itemGroupExtrasDb.findOne({
																					_id 	: 	groupItemId,
																					item_id	:	itemId,
																					group_id: 	groupId,
																					item_extra_id : extraItemId,
																				},{projection: {extra_fees: 1}}).then(groupItemResult=>{
																					if(groupItemResult){
																						if(groupItemResult.extra_fees){
																							exItemData.extra_fees = groupItemResult.extra_fees;
																						}
																					}else{
																						itemData.item_available =  false;
																					}
																					extraItemGroupCallback(null,groupItemResult);
																				}).catch(next);
																			},
																		},(parallelExGroupErr)=>{
																			groupExItemEachCallback(parallelExGroupErr);
																		});
																	},(asyncGroupExItemErr)=>{
																		groupCallback(asyncGroupExItemErr);
																	});
																},
															},(parallelErr)=>{
																exItemEachCallback(parallelErr);
															});
														},(asyncExItemErr)=>{
															listCallback(asyncExItemErr);
														});
													}
												},(parallelErr)=>{
													eachCallback(parallelErr);
												});
											},(eachErr)=> {
												exItemCallback(eachErr);
											});
										},
									},(parallelErr)=>{
										itemEachCallback(parallelErr);
									});
								},(asyncItemErr)=>{
									callback(asyncItemErr);
								});
							},
							get_offer_details : (callback)=>{
								if(!offerId || isCheckOffer) return callback(null,null);

								/** Set offer option */
								let offerOptions = {
									restaurant_id 	: restaurantId,
									branch_id	 	: branchId,
									offer_id 		: offerId,
									user_id 		: userId,
									device_id 		: deviceId,
								};

								/** Check offer */
								this.checkUserOffer(req,res,next,offerOptions).then(response=>{
									if(response.status == Constants.STATUS_SUCCESS){
										records.offer_details =  response.result;
									}else{
										delete records.offer_id;
									}
									callback(null);
								}).catch(next);
							},
							get_eligible_offer: (callback)=>{
								if(!isCart || isPlaceOrder || isCheckOffer || cartTotalOnly) return callback(null);

								/** Eligible offer options  */
								let eligibleOfferOptions ={
									user_id	 	 : userId,
									device_id	 : deviceId,
									branch_id	 : branchId,
									restaurant_id: restaurantId,
									item_ids 	 : [],
								};


								records.item_list.map(tmpData=>{
									eligibleOfferOptions.item_ids.push(tmpData.item_id);
								});

								this.getEligibleOffer(req,res,next,eligibleOfferOptions).then(response=>{
									if(response.status == Constants.STATUS_SUCCESS){
										records.eligible_offer_list =  response.result;
									}
									callback(null);
								}).catch(next);

							},
							get_all_branch_list : (callback)=>{
								if(!isCart  || cartTotalOnly) return callback(null);

								/** Set sort conditions */
								let sortConditions ={};
								sortConditions["name."+Constants.DEFAULT_LANGUAGE_CODE] = Constants.SORT_ASC;

								/** Get restaurant all branch list */
								this.restaurantBranchesDb.find({
									is_active		: Constants.ACTIVE,
									restaurant_id	: restaurantId,
									is_open			: Constants.OPEN,
								},{projection: {_id:1, name: 1, address: 1}}).sort(sortConditions).toArray().then(branchResult=>{
									records.all_branch_list = (branchResult) ? branchResult :[];
									callback(null,branchResult);
								}).catch(next);
							},
							get_area_name: (callback)=>{
								if(!isPlaceOrder) return callback(null);

								/** Get area details **/
								this.areasDb.findOne({_id:areaId },{projection:{name: 1}}).then(areaResult=>{
									if(areaResult){
										records.area_name =  areaResult.name;
									}
									callback(null,areaResult);
								}).catch(next);
							},
							branch_attributes: (callback)=>{
								if(!isCart && !isPlaceOrder && !cartTotalOnly) return callback(null,null);

								/** Get branch attributes details **/
								this.restaurantBranchAttributesDb.find({
									branch_id		: branchId,
									restaurant_id 	: restaurantId,
									attribute_id	: {$in: [
										Constants.BRANCH_EXTRA_CHARGE_BY_VALUE_ATTRIBUTE_ID,
										Constants.BRANCH_DISCOUNT_BY_PERCENTAGE_ATTRIBUTE_ID,
										Constants.BRANCH_ADDITIONAL_TAX_ATTRIBUTE_ID,
										Constants.BRANCH_DISCOUNT_BY_VALUE_ATTRIBUTE_ID,
										Constants.BRANCH_EXTRA_CHARGE_PERCENTAGE_ATTRIBUTE_ID,
										Constants.BRANCH_OFFERS_DOUBLE_CASHBACK_ATTRIBUTE_ID,
									]},
								},{projection: {attribute_id:1, value: 1}}).toArray().then(attributeResult=>{
									if(attributeResult.length <=0) return callback(null,attributeResult);

									let attributeList =  {};
									attributeResult.map(attributeData=>{
										attributeList[attributeData.attribute_id] = attributeData.value;
									});

									records.attribute_list  =  attributeList;
									if(isPlaceOrder){
										records.is_double_cashback =  (attributeList?.[Constants.BRANCH_OFFERS_DOUBLE_CASHBACK_ATTRIBUTE_ID] == Constants.DOUBLE_CASHBACK) ? true :false;
									}
									callback(null,attributeList);
								}).catch(next);
							},
							order_details : (callback)=>{
								if(!records.order_id) return callback(null);

								/** Get order details **/
								this.ordersDb.findOne({
									_id : records.order_id
								},{projection: {order_price: 1, paid_amount: 1, unique_order_id:1,package_id:1, payment_method:1, delivery_type: 1}}).then(orderResult=>{
									if(orderResult){
										records.order_details = orderResult;
									}
									callback(null,orderResult);
								}).catch(next);
							},
						},(parallelErr)=>{
							eachCallback(parallelErr);
						});
					},(subEachErr)=> {
						parentEachCallback(subEachErr);
					});
				},(eachErr)=> {
					if(eachErr) return next(eachErr);

					let grandTotal 		=	0;
					let totalDiscount	=	0;
					let totalItemPrice 	=	0;
					let itemIdsArray 	=	[];
					let cuisineIdsArray	=	[];
					let categoryIdsArray=	[];
					let finalList 		= 	[];
					let itemSubTotal	= 	0;
					Object.keys(cartList).map(restaurantId=>{
						Object.keys(cartList[restaurantId]).map(branchId=>{
							let data 			= 	clone(cartList[restaurantId][branchId]);
							data.discount 		=	0;
							let offerItemList 	= 	{};
							let totalAmount		=	0;

							if(data.offer_details){
								data.discount	  = data.offer_details.discount;
								data.offer_code	  = data.offer_details.offer_code;
								if(isPlaceOrder){
									data.offer_type	  	= data.offer_details.offer_type;
									data.offer_discount = data.offer_details.discount;
								}

								if(data.offer_details.is_free_delivery && data.delivery_fees){
									if(isPlaceOrder) data.offer_delivery_fees = data.delivery_fees;
									data.delivery_fees 			= 0;
								}

								if(data.offer_details.item_list.length >0){
									data.offer_details.item_list.map(tmpRecords=>{
										offerItemList[tmpRecords.item_id] = tmpRecords.discount;
									});
								}
								/** Less discount */
								grandTotal 		-= data.offer_details.discount;
								totalAmount 	-= data.offer_details.discount;
								totalDiscount	+=	data.offer_details.discount
							}

							/** Add package details */
							if(data.delivery_by != Constants.DELIVERY_BY_PICK_UP && data.delivery_fees){
								if(packageId && (unLimitedPackage || packageCount >0)){
									data.package_delivery_fees  = data.delivery_fees;
									data.package_id  			= packageId;
									data.delivery_fees  		= 0;
									if(!unLimitedPackage) packageCount 	-= 1;
								}else if(data.order_details && data.order_details.package_id){
									data.package_id  	= data.order_details.package_id;
									data.delivery_fees  = 0;
								}
							}

							if(isPlaceOrder && data.delivery_by != Constants.DELIVERY_BY_PICK_UP && data.delivery_fees){
								grandTotal += parseFloat(data.delivery_fees);
								totalAmount += parseFloat(data.delivery_fees);
							}

							let totalItemAmount = 0;
							data.item_list.map(records=>{
								let qty		  	= 	(records.qty) 		 ? records.qty 		  :0;
								let itemPrice	= 	(records.item_price) ? records.item_price :0;
								let isSimphony	= 	records.is_simphony;

								if(itemPrice){
									let tmpPrice 		=	itemPrice;
									let percentage		=	records.discount_percentage;
									let discountValue	=	records.discount_value;

									if(discountValue){
										let tmpDiscount= (tmpPrice>=discountValue) ? discountValue :tmpPrice;

										records.strikethrough_price = tmpPrice;
										itemPrice = round(tmpPrice-tmpDiscount, Constants.CURRENCY_ROUND_PRECISION);
									}else if(percentage){
										let tmpDiscount = 	(tmpPrice*percentage)/100;

										records.strikethrough_price	= tmpPrice;
										itemPrice = round(tmpPrice-tmpDiscount, Constants.CURRENCY_ROUND_PRECISION);
									}
								}

								if(records.unit_id && records.unit_price >0){
									itemPrice	= 	(records.unit_price) ? records.unit_price :0;
									let discountType  =  (records.unit_discount_type) ? records.unit_discount_type :0;
									let discountValue = (records.unit_discount_value) ? records.unit_discount_value :0;

									let tmpPrice =	itemPrice;
									if(discountValue && discountType){
										if(discountType == Constants.DISCOUNT_BY_VALUE){
											let tmpDiscount= (tmpPrice>=discountValue) ? discountValue :tmpPrice;

											records.strikethrough_price = tmpPrice;
											itemPrice = round(tmpPrice-tmpDiscount,Constants.CURRENCY_ROUND_PRECISION);
										}else{
											let tmpDiscount = 	(tmpPrice*discountValue)/100;

											records.strikethrough_price= tmpPrice;
											itemPrice = round(tmpPrice-tmpDiscount,Constants.CURRENCY_ROUND_PRECISION);
										}
									}
								}

								if(records.item_type == Constants.HALF_AND_HALF_ITEM || records.item_type == Constants.PIZZA_VGROUP){
									itemPrice = 0;
								}

								/** Add item main price */
								records.item_main_price =	round(itemPrice, Constants.CURRENCY_ROUND_PRECISION);

								let simphonyTotalExIemPrice = 0;
								if(records.extra_items && records.extra_items.length >0){
									records.extra_items.map(extraData=>{

										extraData.extra_item_ids.map(itemData=>{
											let exPrice = (itemData.extra_fees) ? parseFloat(itemData.extra_fees) :0;

											if(isSimphony && itemData.qty) simphonyTotalExIemPrice += exPrice*itemData.qty;
											else itemPrice += exPrice;
										});
									});
								}

								if(records.unit_lists && records.unit_lists.length >0){
									records.unit_lists.map(tmpExtraItem=>{
										if(tmpExtraItem.extra_items && tmpExtraItem.extra_items.length >0){
											tmpExtraItem.extra_items.map(extraData=>{

												extraData.extra_item_ids.map(itemData=>{
													itemPrice += (itemData.extra_fees) ? parseFloat(itemData.extra_fees) :0;
												});
											});
										}
									});
								}

								if(!isPlaceOrder){
									if(typeof records.offer_id != typeof undefined) 	delete records.offer_id;
									if(typeof records.unit_id != typeof undefined)  	delete records.unit_id;
									if(typeof records.unit_price != typeof undefined)  	delete records.unit_price;
									if(typeof records.dough_id != typeof undefined) 	delete records.dough_id;
									if(typeof records.selector_id != typeof undefined) 	delete records.selector_id;
								}

								let itemDiscount	=	(offerItemList[records.item_id]) ? offerItemList[records.item_id] :0;
								let priceWithQty	=	round((itemPrice*qty)+simphonyTotalExIemPrice, Constants.CURRENCY_ROUND_PRECISION);
								records.total_extra_item_price=	simphonyTotalExIemPrice;
								records.discount  	= 	itemDiscount;
								records.sub_price  	= 	priceWithQty;
								records.item_price 	=	round(itemPrice, Constants.CURRENCY_ROUND_PRECISION);
								grandTotal 			+= 	priceWithQty;
								totalAmount			+= 	priceWithQty;
								totalItemAmount		+= 	priceWithQty;
								itemSubTotal		+=  priceWithQty;

								if(isCheckOffer){
									totalItemPrice +=	priceWithQty;

									itemIdsArray.push({
										item_id : records.item_id,
										price 	: round(priceWithQty, Constants.CURRENCY_ROUND_PRECISION),
									});

									if(records.category_ids && records.category_ids.length >0){
										categoryIdsArray = categoryIdsArray.concat(records.category_ids);
									}

									if(records.cuisine_ids && records.cuisine_ids.length >0){
										cuisineIdsArray = cuisineIdsArray.concat(records.cuisine_ids);
									}
								}
							});
							if(data.branch_status != Constants.OPEN || data.is_open != Constants.OPEN || data.area_status != Constants.OPEN){
                                data.branch_open    = Constants.CLOSE;
                                data.message        = res.__("user_carts.branch_not_available_this_area");
                            }else{
                                data.branch_open    = Constants.OPEN;
							}

							/** Add corporate offer */
							if(corporateDetails && (isPlaceOrder || isCart)){
								let corporateDiscounts 	= (corporateDetails.discounts) ? corporateDetails.discounts :[];
								let freeDelivery 		= (corporateDetails.free_delivery) ? corporateDetails.free_delivery :"";
								let minimumOrderAmount	= (corporateDetails.minimum_order_amount) ? corporateDetails.minimum_order_amount :0;

								if(freeDelivery && totalItemAmount >= minimumOrderAmount && data.delivery_fees){
									let tmpDeliveryFees				= data.delivery_fees;
									data.corporate_id  			  	= corporateDetails._id;
									data.corporate_delivery_fees  	= tmpDeliveryFees;
									grandTotal  					-= parseFloat(data.delivery_fees);
									totalAmount 					-= parseFloat(data.delivery_fees);
									data.delivery_fees 			  	 = 0;
								}

								if(corporateDiscounts.length >0  && totalItemAmount >0){
									let tmpDiscount 	= 0;
									let isAddDiscount   = false;
									let alreadyAddedDiscount = (data.discount)  ? data.discount:0;
									corporateDiscounts.map(discountData=>{
										if(!isAddDiscount){
											let minAmount = (discountData.min_order_amount) ? discountData.min_order_amount :0;
											let maxAmount = (discountData.max_order_amount) ? discountData.max_order_amount :0;
											let discountType = (discountData.discount_type) ? discountData.discount_type :0;
											let discountValue = (discountData.discount_value) ? discountData.discount_value :0;

											if(totalItemAmount >= minAmount && maxAmount >= totalItemAmount){
												isAddDiscount = true;
												if(discountType == Constants.DISCOUNT_BY_PERCENTAGE){
													tmpDiscount = round((totalItemAmount*discountValue)/100, Constants.CURRENCY_ROUND_PRECISION);
												}else{
													tmpDiscount = discountValue;
												}
											}
										}
									});

									if(tmpDiscount >0){
										totalDiscount		    -=   alreadyAddedDiscount;
										grandTotal		  		+=   alreadyAddedDiscount;
										totalAmount		   		+=   alreadyAddedDiscount;
										data.corporate_id  		=	corporateDetails._id;
										data.corporate_discount	= 	tmpDiscount;
										let completeDiscount    =	tmpDiscount+alreadyAddedDiscount;
										let finalDiscount	  	= 	(completeDiscount > totalItemAmount) ? totalItemAmount :completeDiscount;

										if(completeDiscount > totalItemAmount){
											data.corporate_discount = totalItemAmount-alreadyAddedDiscount;
										}

										data.discount	= 	 finalDiscount;
										totalDiscount	+=   finalDiscount;
										grandTotal 		-= 	 finalDiscount;
										totalAmount 	-= 	 finalDiscount;
									}
								}
							}

							/** Add branch discount */
							if(data.attribute_list && !data.corporate_discount && totalItemAmount >0){
								let branchDicountAdded 	  	= 	false;
								let branchExtraChargeAdded 	= 	false;
								let alreadyAddedDiscount	=	(data.discount)  ? data.discount:0;

								/** Add extra charge by value discount */
								if(!branchExtraChargeAdded && data.attribute_list[Constants.BRANCH_EXTRA_CHARGE_BY_VALUE_ATTRIBUTE_ID] && data.attribute_list[Constants.BRANCH_EXTRA_CHARGE_BY_VALUE_ATTRIBUTE_ID] >0){
									let extraCharge = parseFloat(data.attribute_list[Constants.BRANCH_EXTRA_CHARGE_BY_VALUE_ATTRIBUTE_ID]);

									if(extraCharge >0){
										data.branch_extra_charge		= 	extraCharge;
										data.branch_extra_charge_type	= 	Constants.BRANCH_EXTRA_CHARGE;

										branchExtraChargeAdded	= 	true;
										grandTotal 				+= 	 extraCharge;
										totalAmount 			+= 	 extraCharge;
									}
								}

								/** Add extra charge by percentage discount */
								if(!branchExtraChargeAdded && data.attribute_list[Constants.BRANCH_EXTRA_CHARGE_PERCENTAGE_ATTRIBUTE_ID]){
									let extraPercentage = parseFloat(data.attribute_list[Constants.BRANCH_EXTRA_CHARGE_PERCENTAGE_ATTRIBUTE_ID]);
									let extraCharge 	= round((totalItemAmount*extraPercentage)/100, Constants.CURRENCY_ROUND_PRECISION);

									if(extraCharge >0){
										data.branch_extra_charge		= 	extraCharge;
										data.branch_extra_charge_type	= 	Constants.BRANCH_EXTRA_CHARGE_PERCENTAGE;

										branchExtraChargeAdded	= 	true;
										grandTotal 				+= 	extraCharge;
										totalAmount 			+= 	extraCharge;
									}
								}

								/** Add discount by value*/
								if(!branchDicountAdded && data.attribute_list[Constants.BRANCH_DISCOUNT_BY_VALUE_ATTRIBUTE_ID]){
									let branchDiscount = parseFloat(data.attribute_list[Constants.BRANCH_DISCOUNT_BY_VALUE_ATTRIBUTE_ID]);
									let completeDiscount= branchDiscount+alreadyAddedDiscount;
									let finalDiscount	= (completeDiscount > totalItemAmount) ? totalItemAmount :completeDiscount;

									if(completeDiscount > totalItemAmount){
										branchDiscount  = totalItemAmount-alreadyAddedDiscount;
									}

									if(branchDiscount >0){
										data.branch_discount		= 	branchDiscount;
										data.branch_discount_type	= 	Constants.BRANCH_DISCOUNT_BY_VALUE;

										branchDicountAdded	= 	true;
										data.discount		+= 	 branchDiscount;
										totalDiscount		+=   branchDiscount;
										grandTotal 			-= 	 branchDiscount;
										totalAmount 		-= 	 branchDiscount;
									}
								}

								/** Add discount by percentage*/
								if(!branchDicountAdded && data.attribute_list[Constants.BRANCH_DISCOUNT_BY_PERCENTAGE_ATTRIBUTE_ID]){
									let branchPercentage = parseFloat(data.attribute_list[Constants.BRANCH_DISCOUNT_BY_PERCENTAGE_ATTRIBUTE_ID]);
									let branchDiscount 	= round((totalItemAmount*branchPercentage)/100, Constants.CURRENCY_ROUND_PRECISION);
									let completeDiscount= branchDiscount+alreadyAddedDiscount;
									let finalDiscount	= (completeDiscount > totalItemAmount) ? totalItemAmount :completeDiscount;

									if(completeDiscount > totalItemAmount){
										branchDiscount  = totalItemAmount-alreadyAddedDiscount;
									}

									if(branchDiscount >0){
										data.branch_discount		= 	branchDiscount;
										data.branch_discount_type	= 	Constants.BRANCH_DISCOUNT_BY_PERCENTAGE;

										branchDicountAdded	= 	true;
										data.discount		+= 	 branchDiscount;
										totalDiscount		+=   branchDiscount;
										grandTotal 			-= 	 branchDiscount;
										totalAmount 		-= 	 branchDiscount;
									}
								}
							}

							/** Add additional tax */
							data.additional_tax = 0;
							if(data.attribute_list && data.attribute_list[Constants.BRANCH_ADDITIONAL_TAX_ATTRIBUTE_ID] && data.attribute_list[Constants.BRANCH_ADDITIONAL_TAX_ATTRIBUTE_ID] >0){
								let additionalTax  = parseFloat(data.attribute_list[Constants.BRANCH_ADDITIONAL_TAX_ATTRIBUTE_ID]);

								let tmpItemAmount   = totalItemAmount-data.discount;
								if(tmpItemAmount >0){
									let finalAdditionalTax = round((tmpItemAmount*additionalTax)/100, Constants.CURRENCY_ROUND_PRECISION);

									data.additional_tax_percentage =  additionalTax;
									data.additional_tax =  finalAdditionalTax;
									totalAmount 		+= finalAdditionalTax;
									grandTotal 			+= finalAdditionalTax;
								}
							}

							if(data.attribute_list) delete data.attribute_list;

							if(isPlaceOrder) data.total_amount = round(totalAmount, Constants.CURRENCY_ROUND_PRECISION);

							finalList.push(data);
						});
					});

					/** Set response */
					successResponse.result 			= 	finalList;
					successResponse.grand_total 	= 	round(grandTotal, Constants.CURRENCY_ROUND_PRECISION);
					successResponse.item_sub_total 	= 	round(itemSubTotal, Constants.CURRENCY_ROUND_PRECISION);
					successResponse.total_discount 	=	round(totalDiscount, Constants.CURRENCY_ROUND_PRECISION);
					if(isCheckOffer){
						successResponse.item_ids 			= 	itemIdsArray;
						successResponse.category_ids 		= 	categoryIdsArray;
						successResponse.cuisine_ids	 		= 	cuisineIdsArray;
						successResponse.total_item_price 	=	round(totalItemPrice, Constants.CURRENCY_ROUND_PRECISION);
					}
					/** Send success response */
					resolve(successResponse);
				});
			});
        }).catch(next);
	};// end getUserCartList()

	/**
	 * Function to get eligible Offer
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	**/
	async getEligibleOffer(req,res,next, options){
		return new Promise(async resolve=>{
			let itemIds		= 	(options.item_ids)		?	options.item_ids				:[];
			let branchId	= 	(options.branch_id) 	?	new ObjectId(options.branch_id)		:"";
			let userId		= 	(options.user_id) 		?	new ObjectId(options.user_id)		:"";
			let deviceId	= 	(options.device_id)		?	options.device_id				:"";
			let restaurantId= 	(options.restaurant_id)	?	new ObjectId(options.restaurant_id)	:"";

			/** Send success response **/
			if((!userId && !deviceId) || !branchId || !restaurantId || itemIds.length <=0){
				return resolve({status: Constants.STATUS_SUCCESS, result: [] });
			}

			/** Get item category */
			let itemResult = await this.itemsDb.find({
				_id 		  : {$in : itemIds},
				restaurant_id :	restaurantId,
			},{projection: {category_ids: 1}});

			/** Send success response */
			if(itemResult.length <=0) return resolve({status: Constants.STATUS_SUCCESS, result: [] });

			let categoryIdsArray = [];
			itemResult.map(records=>{
				categoryIdsArray = categoryIdsArray.concat(records.category_ids);
			});

			asyncParallel({
				user_count : (callback)=>{
					if(!userId) return callback(null,null);

					/** Set user conditions */
					let userConditions 		= clone(Constants.CUSTOMER_COMMON_CONDITIONS);
					userConditions._id		= userId;
					userConditions.is_guest	= {$exists: false};
					userConditions.created	= {$gte: newDate(subtractDate(Constants.NEW_USER_DAYS*Constants.HOURS_IN_A_DAY))};

					/** Check user type **/
					this.usersDb.countDocuments(userConditions).then(userResult=>{
						callback(null,userResult);
					}).catch(next);
				},
				corporate_details : (callback)=>{
					if(!userId) return callback(null,null);

					/** Set user conditions */
					let userConditions 			= clone(Constants.CUSTOMER_COMMON_CONDITIONS);
					userConditions._id			= userId;
					userConditions.corporate_id	= {$exists: true};

					/** Check user corporate **/
					this.usersDb.findOne(userConditions,{projection:{corporate_id: 1}}).then(userResult=>{
						callback(null,userResult);
					}).catch(next);
				},
				cuisine_list : (callback)=>{
					/** Set cuisine conditions */
					let cuisineConditions 	= {
						restaurant_id : restaurantId
					};
					if(categoryIdsArray.length >0) cuisineConditions._id = {$in: categoryIdsArray};

					/** Get cuisine list **/
					this.restaurantCategoriesDb.distinct("cuisine_id",cuisineConditions).then(cuisineIds=>{
						callback(null,cuisineIds);
					}).catch(next);
				},
			},(asyncErr, response)=>{
				if(asyncErr) return next(asyncErr);

				let corporateDetails =  (response.corporate_details) ?response.corporate_details:{};
				let userCount 	=  	response.user_count;
				let cuisineList =	response.cuisine_list;
				let corporateId	=  	(corporateDetails.corporate_id) ?corporateDetails.corporate_id :"";
				let userType 	=	(deviceId && !userId) ? Constants.APPLICABLE_FOR_GUEST :((userCount >0) ?  Constants.APPLICABLE_FOR_NEW_USERS : Constants.APPLICABLE_FOR_REGISTERED_MEMBER);

				/** Set lookup conditions */
				let lookupConditions = {
					$and : [
						{$eq: ["$offer_id", "$$offerId"]},
					]
				};

				if(userId){
					lookupConditions["$and"].push({$eq: ["$user_id", userId ]});
				}else{
					lookupConditions["$and"].push({$eq: ["$device_id", deviceId ]});
				}

				/** Add offer conditions */
				let fromDate = newDate(newDate("",Constants.CURRENTDATE_START_DATE_FORMAT));
				let toDate   = newDate(newDate("",Constants.CURRENTDATE_END_DATE_FORMAT));
				let offerConditions = {
					display_offer	:  	true,
					is_active		:	Constants.ACTIVE,
					status			:	Constants.OFFER_PUBLISHED,
					$and			:	[
						{$or : [
							{"applicable_for.0": {$exists: false}},
							{applicable_for	   : {$in: [userType]}}
						]},
						{$or : [
							{"restaurant_ids.0" : {$exists: false}},
							{restaurant_ids	 	: {$in: [restaurantId]}}
						]},
						{$or : [
							{"branch_ids.0" : {$exists: false}},
							{branch_ids	 	: {$in: [branchId]}}
						]},
						{$or : [
							{"cuisine_ids.0" : {$exists: false}},
							{cuisine_ids	 : {$in: cuisineList}}
						]},
						{$or : [
							{$and :[
								{"item_ids.0" : {$exists: false}},
								{offer_type : {$ne: Constants.COMBO_OFFER}}
							]},
							{$and :[
								{item_ids : {$in: itemIds}},
								{item_offer_type: {$ne: Constants.ITEM_WISE_OFFER}}
							]},
						]},
						{$or : [
							{$and : [
								{ valid_from : {$gte : newDate(fromDate)} },
								{ valid_to   : {$lte : newDate(toDate)} }
							]},
							{$and : [
								{ valid_to 	 : {$gte : newDate(fromDate)} },
								{ valid_from : {$lte : newDate(toDate)} }
							]}
						]}
					]
				};

				if(categoryIdsArray.length >0){
					offerConditions["$and"].push({$or: [
						{"category_ids.0": {$exists: false}},
						{category_ids	 : {$in: categoryIdsArray}}
					]});
				}

				if(userId){
					offerConditions["$and"].push({$or: [
						{"user_ids.0": {$exists: false}},
						{user_ids	 : {$in: [userId]} }
					]});
				}

				if(corporateId){
					offerConditions["$and"].push({$or: [
						{"corporate_ids.0" : {$exists: false}},
						{corporate_ids	   : {$in: [corporateId]}}
					]});
				}else{
					offerConditions.offer_type = {$ne: Constants.CORPORATE_OFFER};
				}

				/** Get offer list */
				this.offersDb.aggregate([
					{$match : offerConditions},
					{$lookup:	{
						from 	 : Tables.OFFER_LOGS,
						let      : {offerId : "$_id"},
						pipeline : [
							{$match : {
								$expr: lookupConditions
							}},
							{$project : {_id: 1}},
						],
						as:	"offer_unique_redeem_details"
					}},
					{$lookup : {
						from 		 : Tables.OFFER_LOGS,
						localField 	 : "_id",
						foreignField : "offer_id",
						as 			 : "offer_redeem_details"
					}},
					{$addFields :{
						unique_redeem_count : {$size: "$offer_unique_redeem_details"},
						total_redeem_count  : {$size: "$offer_redeem_details"},
					}},
					{$match : {
						$expr: {
							$and : [
								{$or:[
									{$eq: ["$total_unique_redeem", ""]},
									{$gt: ["$total_unique_redeem", "$unique_redeem_count"]},
								]},
								{$or:[
									{$eq: ["$total_redeem", ""]},
									{$gt: ["$total_redeem", "$total_redeem_count"]},
								]},
							]
						}
					}},
					{$sort: {display_order: Constants.SORT_ASC, created: Constants.SORT_DESC}},
					{$project : { title: 1, description: 1, offer_code: 1, unique_redeem_count: 1, total_redeem_count: 1}},
				]).toArray().then(offerResult=>{

					/** Send success response */
					resolve({status: Constants.STATUS_SUCCESS, result: offerResult });
				}).catch(next);
			});
		}).catch(next);
	};// end getEligibleOffer()

	/**
	 * Function to get update user id
	 *
	 * @param req		As Request Data
	 * @param res		As Response Data
	 * @param next		As Callback argument to the middleware function
	 * @param options	As object data
	 *
	 * @return json
	**/
	async updateUserId(req,res,next,options){
		return new Promise(resolve=>{
			let userId	= 	(options.user_id)	?	new ObjectId(options.user_id)	:"";
            let deviceId= 	(options.device_id)	?	options.device_id			:"";

			/** Send error response **/
			if(!userId || !deviceId) return resolve({status: Constants.STATUS_ERROR, message:res.__("system.missing_parameters")});

			/** Update cart details */
			this.userCartDb.updateMany({
				device_id : deviceId
			},
			{$set: {
				device_id	: "",
				customer_id : userId,
				modified 	: getUtcDate(),
			}}).then(()=>{

				/** Send success response */
				resolve({status: Constants.STATUS_SUCCESS});
			}).catch(next);
        }).catch(next);
	};// end updateUserId()

	/**
	 * Function to update cart qty
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	**/
	async updateCartQty(req,res,next){
		return new Promise(async resolve=>{
			/** Sanitize Data **/
			req.body 	=	sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
			let userId	= 	(req.body.user_id)	?	new ObjectId(req.body.user_id)	:"";
            let cartId	= 	(req.body.cart_id)	?	new ObjectId(req.body.cart_id)	:"";
            let deviceId= 	(req.body.device_id)?	req.body.device_id			:"";
            let qty		= 	(req.body.qty)		?	parseInt(req.body.qty)		:0;

			/** Send error response **/
			if((!userId && !deviceId )|| !cartId) return resolve({status: Constants.STATUS_ERROR, message:res.__("system.missing_parameters")});

			/** Send error response **/
			if(isNaN(qty)) return resolve({status: Constants.STATUS_ERROR, message:res.__("user_carts.please_enter_valid_numeric_value")});

			qty	= parseInt(qty);

			if(qty <= 0){
				/** Remove cat item when qty is zero */
				let removeRes = await this.removeCartItems(req,res,next);

				/** Send error response */
				if(removeRes?.status != Constants.STATUS_SUCCESS) return resolve(removeRes);
			}else{
				/** Set cart conditions */
				let cartConditions = {
					_id : cartId,
				};

				if(userId){
					cartConditions.customer_id 	= 	userId;
				}else{
					cartConditions.device_id	=	deviceId;
				}

				/** Update cart item qty */
				await this.userCartDb.updateOne(cartConditions,
				{$set: {
					qty 	 : qty,
					modified : getUtcDate(),
				}});
			}

			asyncParallel({
				cart_details : (childCallback)=>{
					/** Get cart total */
					let cartOptions = {
						user_id 		: userId,
						device_id 		: deviceId,
						cart_total_only : true,
					};

					this.getUserCartList(req,res,next,cartOptions).then(cartResponse=>{
						if(cartResponse.status != Constants.STATUS_SUCCESS) return childCallback(cartResponse);
						childCallback(null,cartResponse);
					}).catch(next);
				},
				cart_count : (childCallback)=>{
					/** Get cart count */
					this.getCartCount(req,res,next).then(cartResponse=>{
						if(cartResponse.status != Constants.STATUS_SUCCESS) return childCallback(cartResponse);
						childCallback(null,cartResponse.count);
					}).catch(next);
				},
			},(asyncChildErr, asyncChildResponse)=>{
				if(asyncChildErr) return next(asyncChildErr);

				/** Send success response **/
				resolve({
					status			: Constants.STATUS_SUCCESS,
					total_amount 	: asyncChildResponse?.cart_details?.grand_total || 0,
					total_discount 	: asyncChildResponse?.cart_details?.total_discount || 0,
					cart_count 		: asyncChildResponse?.cart_count || 0,
					message 		: res.__("user_carts.qty_has_been_updated_successfully"),
				});
			});
		}).catch(next);
	};// end updateCartQty()

	/**
	 * Function to check offer
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	**/
	async checkUserOffer(req,res,next,options){
		return new Promise(resolve=>{
			let userId		= 	(options.user_id)		?	new ObjectId(options.user_id)		:"";
            let deviceId	= 	(options.device_id)		?	options.device_id				:"";
			let branchId	= 	(options.branch_id) 	?	new ObjectId(options.branch_id)		:"";
			let restaurantId= 	(options.restaurant_id)	?	new ObjectId(options.restaurant_id)	:"";
            let offerCode	= 	(options.offer_code)	?	options.offer_code				:"";
            let offerId		= 	(options.offer_id)		?	new ObjectId(options.offer_id)		:"";
			let orderId		= 	(options.order_id)		?	new ObjectId(options.order_id)		:"";
			let mainDeviceId= 	(options.main_device_id)?	options.main_device_id			:"";

			/** Send error response **/
			if((!userId && !deviceId )|| !branchId || !restaurantId || (!offerCode && !offerId)){
				return resolve({status: Constants.STATUS_ERROR, message:res.__("system.missing_parameters")});
			}

			asyncParallel({
				user_details : (callback)=>{
					if(!userId) return callback(null,null);

					/** Set user conditions */
					let userConditions 		= clone(Constants.CUSTOMER_COMMON_CONDITIONS);
					userConditions._id		= userId;
					userConditions.is_guest	= {$exists: false};
					userConditions.created	= {$gte: newDate(subtractDate(Constants.NEW_USER_DAYS*Constants.HOURS_IN_A_DAY))};

					/** Check user type **/
					this.usersDb.countDocuments(userConditions).then(userResult =>{
						callback(null,userResult);
					}).catch(next);
				},
				cart_list : (callback)=>{
					/** Set cart options */
					let cartOptions 			=	clone(options);
					cartOptions.is_check_offer	=	true;

					if(orderId && cartOptions.user_id) delete cartOptions.user_id;

					/** Get user cart list */
					this.getUserCartList(req,res,next,cartOptions).then(response=>{
						callback(null,response);
					}).catch(next);
				},
				user_offer_used : (callback)=>{
					if(offerId) return callback(null,{});

					/** Set offer conditions */
					let offerConditions = {};
					if(offerId) 	offerConditions.offer_id 	= offerId;
					if(offerCode) 	offerConditions.offer_code 	={$regex:'^'+offerCode+'$','$options':'i'};

					if(userId){
						offerConditions.user_id		= 	userId;
					}else if(orderId){
						offerConditions.device_id	=	mainDeviceId;
					}else{
						offerConditions.device_id	=	deviceId;
					}

					/** Check offer used or not by user in pervious **/
					this.offerUsedDb.findOne(offerConditions,{projection: {offer_used: 1, total_amount_used: 1}}).then(offerResult =>{
						callback(null,offerResult);
					}).catch(next);
				},
				offer_used_count : (callback)=>{
					/** Set offer conditions */
					let offerConditions = {};
					if(offerId) 	offerConditions.offer_id 	= offerId;
					if(offerCode) 	offerConditions.offer_code 	={$regex:'^'+offerCode+'$','$options':'i'};

					/** Get total offer used  count **/
					this.offerLogsDb.countDocuments(offerConditions).then(offerResult =>{
						callback(null,offerResult);
					}).catch(next);
				},
				order_details : (callback)=>{
					if(!orderId) return callback(null,null);

					/** Set offer conditions */
					let offerConditions = {};
					if(offerId) 	offerConditions.offer_id 	= offerId;
					if(offerCode) 	offerConditions.offer_code 	={$regex:'^'+offerCode+'$','$options':'i'};

					/** Get order details **/
					const order_details = this.db.collection(Tables.ORDER_DETAILS);
					order_details.findOne({order_id: orderId},{projection: {offer_code: 1}}).then(orderResult =>{
						callback(null,orderResult);
					}).catch(next);
				},
				user_corporate_details : (callback)=>{
					if(!userId) return callback(null,null);

					/** Set user conditions */
					let userConditions 			= clone(Constants.CUSTOMER_COMMON_CONDITIONS);
					userConditions._id			= userId;
					userConditions.corporate_id	= {$exists: true};

					/** Check user corporate **/
					this.usersDb.findOne(userConditions,{projection: {corporate_id: 1}}).then(userResult =>{
						callback(null,userResult);
					}).catch(next);
				},
				offer_details : (callback)=>{
					if(!offerCode) return callback(null,true);

					/** Check offer code valid or not **/
					this.offersDb.findOne({
						offer_code : {$regex:'^'+offerCode+'$','$options':'i'}
					},{projection: {_id: 1}}).then(offerResult =>{
						let isOfferValid = (offerResult && offerResult._id) ? true :false;
						callback(null,isOfferValid);
					}).catch(next);
				},
			},(asyncErr, asyncResponse)=>{
				if(asyncErr) return next(asyncErr);

				/** Send error response  */
				if(asyncResponse.cart_list.status != Constants.STATUS_SUCCESS || !asyncResponse.cart_list.result || asyncResponse.cart_list.result.length <=0){
					return resolve({status: Constants.STATUS_ERROR, message: res.__("system.something_going_wrong_please_try_again") });
				}

				/** Send error response  */
				if(offerCode && !asyncResponse.offer_details){
					return resolve({status: Constants.STATUS_ERROR, message: res.__("offers.entered_offer_code_not_valid") });
				}

				let corporateDetails	=  (asyncResponse.user_corporate_details) ? 	asyncResponse.user_corporate_details :{};
				let corporateId	=  (corporateDetails.corporate_id) ? corporateDetails.corporate_id :"";
				let orderDetails  		=  (asyncResponse.order_details) ? 	asyncResponse.order_details :{};
				let lastOrderOfferCode  =  (orderDetails.offer_code)	 ?	orderDetails.offer_code :"";
				let userDetails 		=  asyncResponse.user_details;
				let cartList 			=  asyncResponse.cart_list;
				let userOfferUsed 		=  (asyncResponse.user_offer_used) ? asyncResponse.user_offer_used :{};
				let itemListArray 		=  (cartList.item_ids)		?	cartList.item_ids		:[];
				let categoryIdsArray	=  (cartList.category_ids) 	? 	cartList.category_ids 	:[];
				let cuisineIdsArray		=  (cartList.cuisine_ids)	?	cartList.cuisine_ids	:[];
				let totalItemPrice 		=  cartList.total_item_price;
				let totalOfferUsed 		=  asyncResponse.offer_used_count;
				let userOfferUsedCount	=  (userOfferUsed.offer_used) ? userOfferUsed.offer_used :0;
				let itemIdsArray		=  [];
				let checkRedeem			=  true;

				/** This conditions user when admin order modify  */
				if(orderId && offerCode && offerCode == lastOrderOfferCode) checkRedeem = false;

				itemListArray.map(records=>{
					itemIdsArray.push(records.item_id);
				});

				/** Manage user type (guest, new user, registered user ) */
				let userType = (deviceId && !userId) ? Constants.APPLICABLE_FOR_GUEST :((userDetails >0) ?  Constants.APPLICABLE_FOR_NEW_USERS :Constants.APPLICABLE_FOR_REGISTERED_MEMBER);

				let fromDate = newDate(newDate("",Constants.CURRENTDATE_START_DATE_FORMAT));
				let toDate   = newDate(newDate("",Constants.CURRENTDATE_END_DATE_FORMAT));

				/** Add offer conditions */
				let offerConditions = {
					is_active	:	Constants.ACTIVE,
					status		:	Constants.OFFER_PUBLISHED,
					$and		:	[
						{$or : [
							{"applicable_for.0" : {$exists: false}},
							{applicable_for	   : {$in: [userType]}}
						]},
						{$or : [
							{"restaurant_ids.0" : {$exists: false}},
							{restaurant_ids	 	: {$in: [restaurantId]}}
						]},
						{$or : [
							{"branch_ids.0" : {$exists: false}},
							{branch_ids	 	: {$in: [branchId]}}
						]},
						{$or : [
							{"cuisine_ids.0" : {$exists: false}},
							{cuisine_ids	 : {$in: cuisineIdsArray}}
						]},
						{$or : [
							{$and :[
								{"item_ids.0" : {$exists: false}},
								{offer_type : {$ne: Constants.COMBO_OFFER}}
							]},
							{$and :[
								{item_ids : {$in: itemIdsArray}},
								{item_offer_type: {$ne: Constants.ITEM_WISE_OFFER}}
							]},
							{$and :[
								{"item_ids.0" : {$exists: false}},
								{item_offer_type: Constants.ITEM_WISE_OFFER}
							]},
						]},
						{$or : [
							{$and :[
								{min_amount : ""},
								{max_amount : ""}
							]},
							{$or :[
								{$and : [
									{min_amount : {$gte: totalItemPrice } },
									{max_amount : {$lte: totalItemPrice } }
								]},
								{$and : [
									{max_amount : {$gte: totalItemPrice } },
									{min_amount : {$lte: totalItemPrice } }
								]},
								{$and :[
									{max_amount : "" },
									{min_amount : {$gte: totalItemPrice } }
								]},
								{$and :[
									{min_amount : "" },
									{max_amount : {$lte: totalItemPrice } }
								]},
							]},
						]},
						{$or : [
							{$and : [
								{ valid_from : {$gte : newDate(fromDate)} },
								{ valid_to   : {$lte : newDate(toDate)} }
							]},
							{$and : [
								{ valid_to 	 : {$gte : newDate(fromDate)} },
								{ valid_from : {$lte : newDate(toDate)} }
							]}
						]}
					],
				};

				if(offerId) 	offerConditions._id 		= offerId;
				if(offerCode) 	offerConditions.offer_code 	= {$regex:'^'+offerCode+'$','$options':'i'};

				if(categoryIdsArray.length >0){
					offerConditions["$and"].push({$or: [
						{"category_ids.0": {$exists: false}},
						{category_ids	 : {$in: categoryIdsArray}}
					]});
				}

				if(userId){
					offerConditions["$and"].push({$or: [
						{"user_ids.0": {$exists: false}},
						{user_ids	 : {$in: [userId]} }
					]});
				}

				if(checkRedeem){
					/** Add conditions if user already used this offer  */
					if(userOfferUsedCount >0){
						offerConditions["$and"].push({$or:[
							{total_unique_redeem: "" },
							{total_unique_redeem: {$gt: userOfferUsedCount}},
						]});
					}

					/** Add conditions if this offer used count is greater than 1 */
					if(totalOfferUsed >0){
						offerConditions["$and"].push({$or:[
							{total_redeem: "" },
							{total_redeem: {$gt: totalOfferUsed	}},
						]});
					}
				}

				if(corporateId){
					offerConditions["$and"].push({$or: [
						{"corporate_ids.0" : {$exists: false}},
						{corporate_ids	   : {$in: [corporateId]}}
					]});
				}else{
					offerConditions.offer_type = {$ne: Constants.CORPORATE_OFFER};
				}

				/** Get offer details */
				this.offersDb.findOne(offerConditions,{projection: {item_ids: 1, item_offer_type: 1, minimum_items:1, offer_type: 1, offer_value: 1, redeem_type: 1, user_specific_redeem:1, global_redeem:1, discount_price:1, item_ids: 1, discount_type:1,offer_max_amount:1,multiple_redeem_type:1, offer_code:1, is_free_delivery:1}}).then(offerResult => {

					/** Send error response */
					if(!offerResult) return resolve({status: Constants.STATUS_ERROR, message: res.__("offers.this_offer_code_is_either_expired_or_not_active_yet") });

					let redeemType 	   = (offerResult.redeem_type) 		? offerResult.redeem_type	  :"";
					let itemOfferType  = (offerResult.item_offer_type)  ? offerResult.item_offer_type  :"";
					let minimumItems   = (offerResult.minimum_items) 	? offerResult.minimum_items   :0;
					let offerType      = (offerResult.offer_type) 		? offerResult.offer_type      :"";

					/** Check offer type is combo  or item offer type is general */
					if(offerType == Constants.COMBO_OFFER && itemOfferType == Constants.GENERAL_ITEM_OFFER){
						let matchedItems = 0;

						offerResult.item_ids.map(tempItemId=>{
							itemIdsArray.map(tmpId=>{
								if(String(tmpId) == String(tempItemId)) matchedItems++;
							});
						});

						/** Send error response */
						if(matchedItems < minimumItems){
							return resolve({status: Constants.STATUS_ERROR, message: res.__("offers.this_offer_code_is_either_expired_or_not_active_yet") });
						}
					}

					asyncParallel({
						item_list : (callback)=>{
							if(offerType != Constants.COMBO_OFFER || itemOfferType != Constants.ITEM_WISE_OFFER) return callback(null,null);

							/** Get offer details item wise */
							this.offerItemsDb.find({
								offer_id 	 	: offerResult._id,
								item_id 		: {$in: itemIdsArray},
								restaurant_id 	: restaurantId,
							},{projection: {price: 1, item_id: 1}}).toArray().then(itemOfferResult=>{
								callback(null, itemOfferResult);
							}).catch(next);
						},
					},(asyncSubErr, asyncSubResponse)=>{
						if(asyncSubErr) return next(asyncSubErr);

						/** Send error response */
						let offerItemList = asyncSubResponse.item_list;
						if(offerType == COMBO_OFFER && itemOfferType == ITEM_WISE_OFFER && (offerItemList.length <=0 || offerItemList.length < minimumItems)){
							return resolve({status:Constants.STATUS_ERROR, message:res.__("offers.this_offer_code_is_either_expired_or_not_active_yet") });
						}

						/** Calculate discount for combo offer */
						let totalDiscount = 0;
						let itemWiseOffer = [];
						if(offerType == Constants.COMBO_OFFER){
							if(itemOfferType == Constants.GENERAL_ITEM_OFFER){
								totalDiscount = offerResult.discount_price;
							}else if(itemOfferType == Constants.ITEM_WISE_OFFER) {
								offerItemList.map(records=>{
									itemListArray.map(data=>{
										if(String(data.item_id) == String(records.item_id)){
											let tmpPercentage   =  records.price;
											let tmpItemPrice 	=  data.price;
											let tmpDiscount 	=  round((tmpItemPrice*tmpPercentage)/100);

											if(totalDiscount >= totalItemPrice) tmpDiscount =0;

											totalDiscount += tmpDiscount;

											itemWiseOffer.push({
												item_id  : records.item_id,
												discount : tmpDiscount,
											});
										}
									});
								});
							}
						}

						/** Calculate discount for other offer type */
						if(offerType != Constants.COMBO_OFFER){
							let offerMaxAmount= (offerResult.offer_max_amount) ? offerResult.offer_max_amount :0;
							let offerValue 	= (offerResult.offer_value) ? offerResult.offer_value :0;
							let discountType= (offerResult.discount_type) ? offerResult.discount_type :"";

							if(discountType == Constants.DISCOUNT_TYPE_VALUE){
								totalDiscount = offerValue;
							}else{
								let tmpDiscount = round((totalItemPrice*offerValue)/100);
								totalDiscount	= (tmpDiscount > offerMaxAmount) ? offerMaxAmount :tmpDiscount;
							}
						}

						/** Check if total discount is more then item price */
						if(totalDiscount > totalItemPrice) totalDiscount = totalItemPrice;

						/** Send error response */
						if(totalDiscount ==0){
							return resolve({
								status : Constants.STATUS_ERROR,
								message:  res.__("offers.this_offer_code_is_either_expired_or_not_active_yet"),
							});
						}

						/** Send success response */
						resolve({
							status : Constants.STATUS_SUCCESS,
							result : {
								offer_id 	: offerResult._id,
								discount 	: totalDiscount,
								offer_type 	: offerType,
								order_price : totalItemPrice,
								item_list 	: itemWiseOffer,
								offer_code 	: offerResult.offer_code,
								is_free_delivery: offerResult.is_free_delivery,
								same_offer_code	: (!checkRedeem) ? true :false,
							},
						});
					});
				}).catch(next);
			});
		}).catch(next);
	};// end checkUserOffer()

	/**
	 * Function to get wallet balance
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	**/
	async getUserWalletBalance(req,res,next){
		return new Promise(async(resolve)=>{
			/** Sanitize Data **/
			req.body 	=	sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
			let userId	=	(req.body.user_id)	?	new ObjectId(req.body.user_id)	:"";

			/** Send error response **/
			if(!userId) return resolve({status:Constants.STATUS_ERROR, message:res.__("system.missing_parameters")});

			/** Get wallet balance */
			let response = await getWalletBalance(req,res,next,{user_id: userId});

			/** Send response */
			resolve({
				status 	: 	Constants.STATUS_SUCCESS,
				result	:	response,
				max_point_usage_percentage	:	(res.locals.settings["Points_system.max_point_usage"]) ?	parseFloat(res.locals.settings["Points_system.max_point_usage"])	:0,
				amount_per_points			:	(res.locals.settings["Points_system.amount_per_points"]) ?	parseFloat(res.locals.settings["Points_system.amount_per_points"])	:0,
				minimum_value_for_order		:	(res.locals.settings["Points_system.minimum_value_for_order"]) ?	parseFloat(res.locals.settings["Points_system.minimum_value_for_order"])	:0,
			});
		}).catch(next);
	};// end getUserWalletBalance()

	/**
	 * Function to check order schedule
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	**/
	async checkOrderSchedule(req,res,next){
		return new Promise(async resolve=>{
			/** Sanitize Data **/
			req.body 		=	sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
			let userId		= 	(req.body.user_id)			?	new ObjectId(req.body.user_id)		:"";
			let branchId	= 	(req.body.branch_id) 		?	new ObjectId(req.body.branch_id)	:"";
			let restaurantId= 	(req.body.restaurant_id)	?	new ObjectId(req.body.restaurant_id):"";
			let deviceId	= 	(req.body.device_id)		?	req.body.device_id				:"";
			let scheduledTime=	(req.body.scheduled_time)	?	req.body.scheduled_time			:"";

			/** Send error response **/
			if((!userId && !deviceId )|| !branchId || !restaurantId || !scheduledTime){
				return resolve({status: Constants.STATUS_ERROR, message: res.__("system.missing_parameters")});
			}

			/** Get total scheduled days form current date */
			let diffInMinute    	= 	getDifferenceBetweenTwoDatesInMinute(newDate(),scheduledTime);
			let totalScheduledDays 	=	parseInt(diffInMinute/(Constants.HOURS_IN_A_DAY*Constants.MINUTES_IN_A_HOUR));

			/** Set cart options */
			let cartOptions 					=	clone(req.body);
			cartOptions.is_branch_availability	=	true;

			/** Get user cart list */
			let response = await this.getUserCartList(req,res,next,cartOptions);

			/** Send response */
			if(response.status != Constants.STATUS_SUCCESS) return resolve(response);

			/** Send error response **/
			if(!response.result || response.result.length <=0){
				return resolve({
					status	: 	Constants.STATUS_ERROR,
					message	:	res.__("user_carts.cart_not_have_any_item")
				});
			}

			let cartList 	= 	response.result;
			let allItemList	=	{};
			let areaIdList	=	{};
			let scheduleDay = 	parseInt(newDate(scheduledTime,"i"));
			let scheduleTime= 	parseFloat(newDate(scheduledTime,Constants.TIME_FORMAT));
			cartList.map(records=>{
				records.item_list.map(data=>{
					allItemList[data.item_id] = data.item_id;
				});

				if(records.area_id) areaIdList[records.area_id] = records.area_id;
			});
			allItemList = 	Object.values(allItemList);
			areaIdList	=	Object.values(areaIdList);

			asyncParallel({
				items_availability : (callback)=>{
					/** Set availability item conditions **/
					let availabilityConditions = {
						item_id		:	{$in : allItemList},
						from_time	:	{$lte: scheduleTime},
						to_time		:	{$gte: scheduleTime},
					};

					/** Get availability item list **/
					const item_availability	= this.db.collection(Tables.ITEM_AVAILABILITY);
					item_availability.distinct( "item_id", availabilityConditions).then(availabilityResult=>{
						if(availabilityResult.length <=0 || availabilityResult.length < allItemList.length) return callback(null,false);

						/** Set linking item conditions **/
						let linkItemConditions = {
							item_id	:	{$in:  allItemList},
							$or : [
								{
									type : Constants.ITEM_NOT_LISTED_TO_SELECTED_BRANCH_LIST,
									branch_ids: { $nin: [ branchId] }
								},
								{
									type: Constants.ITEM_LISTED_TO_SELECTED_BRANCH_LIST,
									$or : [
										{branch_ids	: { $size: 0} },
										{branch_ids : { $in: [ branchId ] } }
									]
								}
							]
						};

						/** Get item linking list **/
						const item_linkings	= this.db.collection(Tables.ITEM_LINKINGS);
						item_linkings.distinct( "item_id", linkItemConditions).then(linkingResult=>{
							if(linkingResult.length <=0 || linkingResult.length < allItemList.length) return callback(null,false);

							/** Set item conditions **/
							let itemConditions = {
								_id				:	{$in: linkingResult},
								restaurant_id	:	restaurantId,
								is_active		:	Constants.ACTIVE,
							};

							/** Get item  list **/
							this.itemsDb.distinct("_id", itemConditions).then(itemResult=>{
								let itemAvailability = (itemResult && itemResult.length >0 && itemResult.length >= allItemList.length) ? true :false;
								callback(null, itemAvailability);
							}).catch(next);
						}).catch(next);
					}).catch(next);
				},
				branch_availability: (callback)=>{

					/** Add calendar conditions */
					let calendarConditions = {
						parent_id	:	"",
						branch_id	:	branchId,
						status		: 	Constants.OPEN,
						type		: 	Constants.DEFAULT_WEEK,
					};

					/** Get calendar details */
					const restaurant_branch_calendars	= this.db.collection(Tables.RESTAURANT_BRANCH_CALENDARS);
					restaurant_branch_calendars.aggregate([
						{$match : calendarConditions},
						{$lookup:	{
							from     : Tables.RESTAURANT_BRANCH_CALENDARS,
							let      : {parentId : "$_id", branchId : "$branch_id"},
							pipeline : [
								{$match : {
									$expr: {
										$and : [
											{$eq: ["$parent_id", "$$parentId"]},
											{$eq: ["$branch_id", "$$branchId"]},
											{$eq: ["$day", scheduleDay]},
										]
									}
								}},
								{$project : { to_hour: 1, to_minute: 1, from_hour: 1, from_minute: 1 }},
							],
							as	:	"exception_details"
						}},
						{$lookup:	{ /** Check this branch close or not today */
							from     : Tables.RESTAURANT_BRANCH_CALENDARS,
							let      : {branchId : "$branch_id"},
							pipeline : [
								{$match : {
									$expr: {
										$and : [
											{$eq: ["$branch_id", "$$branchId"]},
											{$eq: ["$day", scheduleDay]},
											{$eq: ["$status",Constants.CLOSE]},
											{$eq: ["$type", Constants.WEEK_DAY]},
										]
									}
								}},
							],
							as	:	"close_day_details"
						}},
						{$match: {
							close_day_details : {$size : 0}
						}}
					]).toArray().then(result=>{
						if(result.length <=0) return callback(null,false);

						let calendarDetails = result[0];
						let exceptionList	= (calendarDetails.exception_details) ? calendarDetails.exception_details:[];
						let openFromHour 	=	(calendarDetails.from_hour)	?	calendarDetails.from_hour		:"00";
						let openFromMinute 	=	(calendarDetails.from_minute)?	calendarDetails.from_minute	:"00";
						let openToHour 		=	(calendarDetails.to_hour)	?	calendarDetails.to_hour		:"00";
						let openToMinute 	=	(calendarDetails.to_minute)	?	calendarDetails.to_minute		:"00";

						if(String(openFromMinute).length ==1) 	openFromMinute 	= 	"0"+openFromMinute;
						if(String(openToMinute).length ==1) 	openToMinute	= 	"0"+openToMinute;

						let scheduleOpenTime=	newDate(scheduledTime,Constants.OPEN_TIME_FORMAT);
						scheduleOpenTime	=	parseFloat(scheduleOpenTime.replace(':','.'));
						let openFrom		=	parseFloat(openFromHour+"."+openFromMinute);
						let openTo			=	parseFloat(openToHour+"."+openToMinute);
						let openCount  		= 	0;
						let closeCount 		= 	0;

						if(openFrom <= scheduleOpenTime && openTo>scheduleOpenTime) openCount++;

						if(exceptionList.length>0){
							exceptionList.map(records=>{
								let exceptionFromHour 	=	(records.from_hour)	?	records.from_hour :"00";
								let exceptionFromMinute =	(records.from_minute)?	records.from_minute :"00";
								let exceptionToHour		=	(records.to_hour)	?	records.to_hour	 :"00";
								let exceptionToMinute 	=	(records.to_minute)	? records.to_minute :"00";

								if(String(exceptionFromMinute).length ==1){
									exceptionFromMinute 	= 	"0"+exceptionFromMinute;
								}
								if(String(exceptionToMinute).length ==1){
									exceptionToMinute	= 	"0"+exceptionToMinute;
								}

								let exceptionFrom	=	parseFloat(exceptionFromHour+"."+exceptionFromMinute);
								let exceptionTo		=	parseFloat(exceptionToHour+"."+exceptionToMinute);

								if(exceptionFrom <= scheduleOpenTime && exceptionTo>=scheduleOpenTime){
									closeCount++;
								}
							});
						}
						let branchAvailability = (openCount >=1 && closeCount<1) ? true :false;

						callback(null,branchAvailability);
					}).catch(next);
				},
				area_scheduling_availability: (callback)=>{
					if(areaIdList.length ==0) return callback(null, true);

					/** Get branch area details */
					this.restaurantBranchAreasDb.find({
						area_id					:	{$in: areaIdList},
						branch_id				:	branchId,
						restaurant_id			:	restaurantId,
						open					:	Constants.OPEN,
						accept_scheduling_orders:	Constants.ACCEPT
					},{projection: {_id: 1}}).toArray().then(areaResult=>{
						let acceptAreaIds 	= (areaResult) ? areaResult :[];
						let acceptScheduling= (acceptAreaIds.length == areaIdList.length) ? true : false;
						callback(null,acceptScheduling);
					}).catch(next);
				},
				attribute_details: (callback)=>{
					/** Get branch attribute details */
					this.restaurantBranchAttributesDb.findOne({
						branch_id	  :	branchId,
						attribute_id  :	Constants.MAXIMUM_DURATION_IN_DAYS_FOR_SCHEDULED_ORDERS_ATTRIBUTE_ID
					},{projection: {_id: 0,value:1}}).then(attributeResult=>{
						attributeResult = (attributeResult) ? attributeResult:{};
						callback(null, attributeResult);
					}).catch(next);
				},
			},(asyncErr, asyncResponse)=>{
				if(asyncErr) return next(asyncErr);

				let itemsAvailability 	= 	asyncResponse.items_availability;
				let branchAvailability	=	asyncResponse.branch_availability;
				let areaAvailability	=	asyncResponse.area_scheduling_availability;
				let attributeDetails 	= 	asyncResponse.attribute_details;
				let totalAllowDays 		=	attributeDetails.value ? parseFloat(attributeDetails.value) :"";

				/** Send error response **/
				if(totalAllowDays &&  totalAllowDays < totalScheduledDays){
					return resolve({
						status	: 	Constants.STATUS_ERROR,
						message	:	res.__("user_carts.branch_allow_max_schedule_day",totalAllowDays)
					});
				}

				/** Send success response */
				resolve({
					status 				: 	Constants.STATUS_SUCCESS,
					branch_available 	:	(branchAvailability && itemsAvailability && areaAvailability) ? true :false,
					items_availability 	:	itemsAvailability,
				});
			});
		}).catch(next);
	};// end checkOrderSchedule()

	/**
	 * Function to check order schedule
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	**/
	async checkScheduledOrderEligible(req,res,next){
		return new Promise(resolve=>{
			/** Sanitize Data **/
			req.body 		=	sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
			let userId		= 	(req.body.user_id)			?	new ObjectId(req.body.user_id)		:"";
			let branchId	= 	(req.body.branch_id) 		?	new ObjectId(req.body.branch_id)	:"";
			let restaurantId= 	(req.body.restaurant_id)	?	new ObjectId(req.body.restaurant_id):"";
			let deviceId	= 	(req.body.device_id)		?	req.body.device_id				:"";
			let scheduledTime=	(req.body.scheduled_time)	?	req.body.scheduled_time			:"";

			/** Send error response **/
			if((!userId && !deviceId )|| !branchId || !restaurantId || !scheduledTime){
				return resolve({status: Constants.STATUS_ERROR, message: res.__("system.missing_parameters")});
			}

			/** Get total scheduled days form current date */
			let scheduleDay 		= 	parseInt(newDate(scheduledTime,"i"));
			let diffInMinute    	= 	getDifferenceBetweenTwoDatesInMinute(newDate(),scheduledTime);
			let totalScheduledDays 	=	parseInt(diffInMinute/(Constants.HOURS_IN_A_DAY*Constants.MINUTES_IN_A_HOUR));
			asyncParallel({
				branch_availability: (callback)=>{

					/** Add calendar conditions */
					let calendarConditions = {
						parent_id	:	"",
						branch_id	:	branchId,
						status		: 	Constants.OPEN,
						type		: 	Constants.DEFAULT_WEEK,
					};

					/** Get calendar details */
					const restaurant_branch_calendars	= this.db.collection(Tables.RESTAURANT_BRANCH_CALENDARS);
					restaurant_branch_calendars.aggregate([
						{$match : calendarConditions},
						{$lookup:	{
							from     : Tables.RESTAURANT_BRANCH_CALENDARS,
							let      : {parentId : "$_id", branchId : "$branch_id"},
							pipeline : [
								{$match : {
									$expr: {
										$and : [
											{$eq: ["$parent_id", "$$parentId"]},
											{$eq: ["$branch_id", "$$branchId"]},
											{$eq: ["$day", scheduleDay]},
										]
									}
								}},
								{$project : { to_hour: 1, to_minute: 1, from_hour: 1, from_minute: 1 }},
							],
							as	:	"exception_details"
						}},
						{$lookup:	{ /** Check this branch close or not today */
							from     : Tables.RESTAURANT_BRANCH_CALENDARS,
							let      : {branchId : "$branch_id"},
							pipeline : [
								{$match : {
									$expr: {
										$and : [
											{$eq: ["$branch_id", "$$branchId"]},
											{$eq: ["$day", scheduleDay]},
											{$eq: ["$status",Constants.CLOSE]},
											{$eq: ["$type", Constants.WEEK_DAY]},
										]
									}
								}},
							],
							as	:	"close_day_details"
						}},
						{$match: {
							close_day_details : {$size : 0}
						}}
					]).toArray().then(result=>{
						if(result.length <=0) return callback(null,false);

						let calendarDetails = result[0];
						let exceptionList	= (calendarDetails.exception_details) ? calendarDetails.exception_details:[];
						let openFromHour 	=	(calendarDetails.from_hour)	?	calendarDetails.from_hour		:"00";
						let openFromMinute 	=	(calendarDetails.from_minute)?	calendarDetails.from_minute	:"00";
						let openToHour 		=	(calendarDetails.to_hour)	?	calendarDetails.to_hour		:"00";
						let openToMinute 	=	(calendarDetails.to_minute)	?	calendarDetails.to_minute		:"00";

						if(String(openFromMinute).length ==1) 	openFromMinute 	= 	"0"+openFromMinute;
						if(String(openToMinute).length ==1) 	openToMinute	= 	"0"+openToMinute;

						let scheduleOpenTime=	newDate(scheduledTime,Constants.OPEN_TIME_FORMAT);
						scheduleOpenTime	=	parseFloat(scheduleOpenTime.replace(':','.'));
						let openFrom		=	parseFloat(openFromHour+"."+openFromMinute);
						let openTo			=	parseFloat(openToHour+"."+openToMinute);
						let openCount  		= 	0;
						let closeCount 		= 	0;

						if(openFrom <= scheduleOpenTime && openTo>scheduleOpenTime) openCount++;

						if(exceptionList.length>0){
							exceptionList.map(records=>{
								let exceptionFromHour 	=	(records.from_hour)	?	records.from_hour :"00";
								let exceptionFromMinute =	(records.from_minute)?	records.from_minute :"00";
								let exceptionToHour		=	(records.to_hour)	?	records.to_hour	 :"00";
								let exceptionToMinute 	=	(records.to_minute)	? records.to_minute :"00";

								if(String(exceptionFromMinute).length ==1){
									exceptionFromMinute 	= 	"0"+exceptionFromMinute;
								}
								if(String(exceptionToMinute).length ==1){
									exceptionToMinute	= 	"0"+exceptionToMinute;
								}

								let exceptionFrom	=	parseFloat(exceptionFromHour+"."+exceptionFromMinute);
								let exceptionTo		=	parseFloat(exceptionToHour+"."+exceptionToMinute);

								if(exceptionFrom <= scheduleOpenTime && exceptionTo>=scheduleOpenTime){
									closeCount++;
								}
							});
						}
						let branchAvailability = (openCount >=1 && closeCount<1) ? true :false;

						callback(null,branchAvailability);
					});
				},
				attribute_details: (callback)=>{
					/** Get branch attribute details */
					this.restaurantBranchAttributesDb.findOne({
						branch_id	  :	branchId,
						attribute_id  :	Constants.MAXIMUM_DURATION_IN_DAYS_FOR_SCHEDULED_ORDERS_ATTRIBUTE_ID
					},{projection: {_id: 0,value:1}}).then(attributeResult=>{
						attributeResult = (attributeResult) ? attributeResult:{};
						callback(null, attributeResult);
					}).catch(next);
				},
			},(asyncErr, asyncResponse)=>{
				if(asyncErr) return next(asyncErr);

				let branchAvailability	=	asyncResponse.branch_availability;
				let attributeDetails 	= 	asyncResponse.attribute_details;
				let totalAllowDays 		= 	attributeDetails.value ? parseFloat(attributeDetails.value) :"";

				/** Send error response **/
				if(totalAllowDays &&  totalAllowDays < totalScheduledDays){
					return resolve({ status: Constants.STATUS_ERROR, message: res.__("user_carts.branch_allow_max_schedule_day",totalAllowDays) });
				}

				/** Send success response */
				resolve({
					status 				: 	Constants.STATUS_SUCCESS,
					branch_available 	:	branchAvailability
				});
			});
		}).catch(next);
	};// end checkScheduledOrderEligible()

	/**
	 * Function to check order pickup store
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	**/
	async checkOrderPickUpStore (req,res,next){
		return new Promise(async resolve=>{
			/** Sanitize Data **/
			req.body 		=	sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
			let userId		= 	(req.body.user_id)			?	new ObjectId(req.body.user_id)		:"";
			let branchId	= 	(req.body.branch_id) 		?	new ObjectId(req.body.branch_id)	:"";
			let restaurantId= 	(req.body.restaurant_id)	?	new ObjectId(req.body.restaurant_id):"";
			let deviceId	= 	(req.body.device_id)		?	req.body.device_id				:"";
			let scheduledTime= 	(req.body.scheduled_time)	?	req.body.scheduled_time			:newDate();

			/** Send error response **/
			if((!userId && !deviceId )|| !branchId || !restaurantId){
				return resolve({status: Constants.STATUS_ERROR, message: res.__("system.missing_parameters")});
			}

			/** Get total scheduled days form current date */
			let diffInMinute    	= 	getDifferenceBetweenTwoDatesInMinute(newDate(),scheduledTime);
			let totalScheduledDays 	=	parseInt(diffInMinute/(Constants.HOURS_IN_A_DAY*Constants.MINUTES_IN_A_HOUR));

			/** Set cart options */
			let cartOptions 					=	clone(req.body);
			cartOptions.is_branch_availability	=	true;

			/** Get user cart list */
			let response = await this.getUserCartList(req,res,next,cartOptions);

			if(response.status != Constants.STATUS_SUCCESS) return resolve(response);

			/** Send error response **/
			if(!response.result || response.result.length <=0){
				return resolve({
					status	: 	Constants.STATUS_ERROR,
					message	:	res.__("user_carts.cart_not_have_any_item")
				});
			}

			let cartList 	= 	response.result;
			let allItemList	=	{};
			let scheduleDay = 	parseInt(newDate(scheduledTime,"i"));
			let scheduleTime= 	parseFloat(newDate(scheduledTime,TIME_FORMAT));
			cartList.map(records=>{
				records.item_list.map(data=>{
					allItemList[data.item_id] = data.item_id;
				});
			});
			allItemList = Object.values(allItemList);

			asyncParallel({
				items_availability : (callback)=>{
					/** Set availability item conditions **/
					let availabilityConditions = {
						item_id		:	{$in : allItemList},
						from_time	:	{$lte: scheduleTime},
						to_time		:	{$gte: scheduleTime},
					};

					/** Get availability item list **/
					const item_availability	= this.db.collection(Tables.ITEM_AVAILABILITY);
					item_availability.distinct( "item_id", availabilityConditions).then(availabilityResult=>{
						if(availabilityResult.length <=0 || availabilityResult.length < allItemList.length) return callback(null,false);

						/** Set linking item conditions **/
						let linkItemConditions = {
							item_id	:	{$in:  allItemList},
							$or : [
								{
									type : Constants.ITEM_NOT_LISTED_TO_SELECTED_BRANCH_LIST,
									branch_ids: { $nin: [ branchId] }
								},
								{
									type: Constants.ITEM_LISTED_TO_SELECTED_BRANCH_LIST,
									$or : [
										{branch_ids	: { $size: 0} },
										{branch_ids : { $in: [ branchId ] } }
									]
								}
							]
						};

						/** Get item linking list **/
						const item_linkings	= this.db.collection(Tables.ITEM_LINKINGS);
						item_linkings.distinct( "item_id", linkItemConditions).then(linkingResult=>{
							if(linkingResult.length <=0 || linkingResult.length < allItemList.length) return callback(null,false);

							/** Set item conditions **/
							let itemConditions = {
								_id				:	{$in: linkingResult},
								restaurant_id	:	restaurantId,
								is_active		:	Constants.ACTIVE,
							};

							/** Get item  list **/
							this.itemsDb.distinct("_id", itemConditions).then(itemResult=>{
								let itemAvailability = (itemResult && itemResult.length >0 && itemResult.length >= allItemList.length) ? true :false;
								callback(null, itemAvailability);
							}).catch(next);
						}).catch(next);
					}).catch(next);
				},
				branch_availability: (callback)=>{

					/** Add calendar conditions */
					let calendarConditions = {
						parent_id	:	"",
						branch_id	:	branchId,
						status		: 	Constants.OPEN,
						type		: 	Constants.DEFAULT_WEEK,
					};

					/** Get calendar details */
					const restaurant_branch_calendars	= this.db.collection(Tables.RESTAURANT_BRANCH_CALENDARS);
					restaurant_branch_calendars.aggregate([
						{$match : calendarConditions},
						{$lookup:	{
							from     : Tables.RESTAURANT_BRANCH_CALENDARS,
							let      : {parentId : "$_id", branchId : "$branch_id"},
							pipeline : [
								{$match : {
									$expr: {
										$and : [
											{$eq: ["$parent_id", "$$parentId"]},
											{$eq: ["$branch_id", "$$branchId"]},
											{$eq: ["$day", scheduleDay]},
										]
									}
								}},
								{$project : { to_hour: 1, to_minute: 1, from_hour: 1, from_minute: 1 }},
							],
							as	:	"exception_details"
						}},
						{$lookup:	{ /** Check this branch close or not today */
							from     : Tables.RESTAURANT_BRANCH_CALENDARS,
							let      : {branchId : "$branch_id"},
							pipeline : [
								{$match : {
									$expr: {
										$and : [
											{$eq: ["$branch_id", "$$branchId"]},
											{$eq: ["$day", scheduleDay]},
											{$eq: ["$status",Constants.CLOSE]},
											{$eq: ["$type", Constants.WEEK_DAY]},
										]
									}
								}},
							],
							as	:	"close_day_details"
						}},
						{$match: {
							close_day_details : {$size : 0}
						}}
					]).toArray().then(result=>{
						if(result.length <=0) return callback(null,false);

						let calendarDetails = result[0];
						let exceptionList	= (calendarDetails.exception_details) ? calendarDetails.exception_details:[];
						let openFromHour 	=	(calendarDetails.from_hour)	?	calendarDetails.from_hour	:"00";
						let openFromMinute 	=	(calendarDetails.from_minute)?	calendarDetails.from_minute	:"00";
						let openToHour 		=	(calendarDetails.to_hour)	?	calendarDetails.to_hour		:"00";
						let openToMinute 	=	(calendarDetails.to_minute)	?	calendarDetails.to_minute	:"00";

						if(String(openFromMinute).length ==1) 	openFromMinute 	= 	"0"+openFromMinute;
						if(String(openToMinute).length ==1) 	openToMinute	= 	"0"+openToMinute;

						let scheduleOpenTime=	newDate(scheduledTime,Constants.OPEN_TIME_FORMAT);
						scheduleOpenTime	=	parseFloat(scheduleOpenTime.replace(':','.'));
						let openFrom		=	parseFloat(openFromHour+"."+openFromMinute);
						let openTo			=	parseFloat(openToHour+"."+openToMinute);
						let openCount  		= 	0;
						let closeCount 		= 	0;

						if(openFrom <= scheduleOpenTime && openTo>=scheduleOpenTime) openCount++;

						if(exceptionList.length>0){
							exceptionList.map(records=>{
								let exceptionFromHour 	=	(records.from_hour)	?	records.from_hour :"00";
								let exceptionFromMinute =	(records.from_minute)?	records.from_minute :"00";
								let exceptionToHour		=	(records.to_hour)	?	records.to_hour	 :"00";
								let exceptionToMinute 	=	(records.to_minute)	? records.to_minute :"00";

								if(String(exceptionFromMinute).length ==1){
									exceptionFromMinute 	= 	"0"+exceptionFromMinute;
								}
								if(String(exceptionToMinute).length ==1){
									exceptionToMinute	= 	"0"+exceptionToMinute;
								}

								let exceptionFrom	=	parseFloat(exceptionFromHour+"."+exceptionFromMinute);
								let exceptionTo		=	parseFloat(exceptionToHour+"."+exceptionToMinute);

								if(exceptionFrom <= scheduleOpenTime && exceptionTo>=scheduleOpenTime){
									closeCount++;
								}
							});
						}
						let branchAvailability = (openCount >=1 && closeCount<1) ? true :false;

						callback(null,branchAvailability);
					});
				},
				attribute_details: (callback)=>{
					/** Get branch attribute details */
					this.restaurantBranchAttributesDb.findOne({
						branch_id	  :	branchId,
						attribute_id  :	Constants.MAXIMUM_DURATION_IN_DAYS_FOR_SCHEDULED_ORDERS_ATTRIBUTE_ID
					},{projection: {_id: 0,value:1}}).then(attributeResult=>{
						attributeResult = (attributeResult) ? attributeResult:{};
						callback(null, attributeResult);
					}).catch(next);
				},
			},(asyncErr, asyncResponse)=>{
				if(asyncErr) return next(asyncErr);

				let itemsAvailability 	= 	asyncResponse.items_availability;
				let branchAvailability	=	asyncResponse.branch_availability;
				let attributeDetails 	= 	asyncResponse.attribute_details;
				let totalAllowDays 		= 	attributeDetails.value ? parseFloat(attributeDetails.value) :"";

				/** Send error response **/
				if(totalAllowDays &&  totalAllowDays < totalScheduledDays){
					return resolve({
						status	: 	Constants.STATUS_ERROR,
						message	:	res.__("user_carts.branch_allow_max_schedule_day",totalAllowDays)
					});
				}

				/** Send success response */
				resolve({
					status 				: 	Constants.STATUS_SUCCESS,
					item_available 		:	itemsAvailability,
					branch_available 	:	(branchAvailability && itemsAvailability) ? true :false,
				});
			});
		}).catch(next);
	};// end checkOrderPickUpStore()

	/**
	 * Function to check delivery address
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	**/
	async checkDeliveryAddress(req,res,next){
		return new Promise(resolve=>{
			/** Sanitize Data **/
			req.body 		=	sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
			let areaId		= 	(req.body.area_id)			?	new ObjectId(req.body.area_id)		:"";
			let branchId	= 	(req.body.branch_id) 		?	new ObjectId(req.body.branch_id)	:"";
			let restaurantId= 	(req.body.restaurant_id)	?	new ObjectId(req.body.restaurant_id):"";

			/** Send error response **/
			if(!branchId || !restaurantId || !areaId){
				return resolve({status: Constants.STATUS_ERROR, message: res.__("system.missing_parameters")});
			}

			asyncParallel({
				branch_availability: (callback)=>{
					/** Check branch this open */
					this.restaurantBranchesDb.findOne({
						_id 			: 	branchId,
						is_active 		: 	Constants.ACTIVE,
						branch_status 	: 	Constants.OPEN,
						restaurant_id 	: 	restaurantId,
					},{projection: {_id: 1}}).then(branchResult => {
						callback(null,branchResult);
					}).catch(next);
				},
				area_availability: (callback)=>{
					/** Check branch delivery this area */
					this.restaurantBranchAreasDb.findOne({
						open 			: 	Constants.OPEN,
						area_id 		: 	areaId,
						branch_id 		: 	branchId,
						restaurant_id 	: 	restaurantId,
					},{projection: {_id: 1, delivery_fees:1}}).then(areaResult => {
						callback(null,areaResult);
					}).catch(next);
				},
			},(asyncErr, asyncResponse)=>{
				if(asyncErr) return next(asyncErr);

				let branchAvailability	=	asyncResponse.branch_availability;
				let areaAvailability	=	asyncResponse.area_availability;

				/** Send success response */
				resolve({
					status 		: 	Constants.STATUS_SUCCESS,
					area_details:	areaAvailability,
					is_delivery	:	(branchAvailability  && areaAvailability) ? true :false,
					message		:	(!branchAvailability || !areaAvailability) ? res.__("user_carts.branch_not_provide_at_this_location") :""
				});
			});
		}).catch(next);
	};// end checkDeliveryAddress()

	/**
	 * Function to remove offer from cart
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	**/
	async removeOfferFromCart(req,res,next){
		return new Promise(async resolve=>{
			/** Sanitize Data **/
			req.body 		=	sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
			let deviceId	= 	(req.body.device_id)		?	req.body.device_id				:"";
			let userId		= 	(req.body.user_id)			?	new ObjectId(req.body.user_id)		:"";
			let branchId	= 	(req.body.branch_id) 		?	new ObjectId(req.body.branch_id)	:"";
			let restaurantId= 	(req.body.restaurant_id)	?	new ObjectId(req.body.restaurant_id):"";
			let offerId		= 	(req.body.offer_id)			?	new ObjectId(req.body.offer_id)		:"";

			/** Send error response **/
			if((!userId && !deviceId)|| !branchId || !restaurantId || !offerId){
				return resolve({status: Constants.STATUS_ERROR, message: res.__("system.missing_parameters")});
			}

			/** Set cart conditions */
			let cartConditions = {
				branch_id 		: branchId,
				restaurant_id 	: restaurantId,
				offer_id        : offerId
			};

			if(userId){
				cartConditions.customer_id 	= 	userId;
			}else{
				cartConditions.device_id	=	deviceId;
			}

			/** Find user cart details */
			let cartIds = await this.userCartDb.distinct("_id",cartConditions);

			/** Send error response **/
			if(cartIds.length <=0) return resolve({status: Constants.STATUS_ERROR, message: res.__("system.invalid_access")});

			asyncParallel({
				update_offer_logs : (parentCallback)=>{
					/** Get offer log details */
					this.offerLogsDb.findOne({
						cart_ids: 	{$in: cartIds}
					},{projection: {_id: 1,order_discount:1,offer_id:1}}).then(logResult => {
						if(!logResult) return parentCallback(null);

						let tmpLogId 	= logResult._id;
						let logDiscount = logResult.order_discount;
						let logOfferId 	= logResult.offer_id;

						/** Set offer used conditions */
						let offerUsedConditions = {
							offer_id : 	logOfferId,
						};

						if(userId){
							offerUsedConditions.user_id 	= 	userId;
						}else{
							offerUsedConditions.device_id	=	deviceId;
						}

						/** Update offer used */
						this.offerUsedDb.updateOne(offerUsedConditions,{
							$set :{
								modified: 	getUtcDate()
							},
							$inc :{
								offer_used 			: -1,
								total_amount_used 	: logDiscount*-1,
							},
							$pull :{
								offer_log_ids : tmpLogId,
							},
						}).then(() => {

							/** Delete logs */
							this.offerLogsDb.deleteOne({_id: tmpLogId }).then(() => {
								parentCallback();
							}).catch(next);
						}).catch(next);
					}).catch(next);
				},
				update_tmp_offer_logs : (parentCallback)=>{
					/** Delete logs */
					this.tmpOfferLogsDb.deleteMany({cart_ids: {$in: cartIds}}).then(() => {
						parentCallback(null);
					}).catch(next);
				},
				update_cart : (parentCallback)=>{
					/** Update carts */
					this.userCartDb.updateMany({
						_id: {$in: cartIds}
					},
					{$unset :{
						offer_id : 1,
					}}).then(() => {
						parentCallback(null);
					}).catch(next);
				},
			},(asyncParentErr)=>{
				if(asyncParentErr) return next(asyncParentErr);

				/** Send success response */
				resolve({
					status  : Constants.STATUS_SUCCESS,
					message	:	res.__("user_carts.offer_has_been_removed_successfully_from_cart")
				});
			});
		}).catch(next);
	};// end removeOfferFromCart()

	/**
	 * Function to check order pickup store
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	**/
	async checkPickUpStore(req,res,next){
		return new Promise(resolve=>{
			/** Sanitize Data **/
			req.body 		=	sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
			let userId		= 	(req.body.user_id)			?	new ObjectId(req.body.user_id)		:"";
			let branchId	= 	(req.body.branch_id) 		?	new ObjectId(req.body.branch_id)	:"";
			let restaurantId= 	(req.body.restaurant_id)	?	new ObjectId(req.body.restaurant_id):"";
			let deviceId	= 	(req.body.device_id)		?	req.body.device_id				:"";
			let scheduledTime= 	(req.body.scheduled_time)	?	req.body.scheduled_time			:newDate();

			/** Send error response **/
			if((!userId && !deviceId )|| !branchId || !restaurantId){
				return resolve({status: Constants.STATUS_ERROR, message: res.__("system.missing_parameters")});
			}

			/** Get total scheduled days form current date */
			let diffInMinute    	= 	getDifferenceBetweenTwoDatesInMinute(newDate(),scheduledTime);
			let totalScheduledDays 	=	parseInt(diffInMinute/(Constants.HOURS_IN_A_DAY*Constants.MINUTES_IN_A_HOUR));

			let scheduleDay = 	parseInt(newDate(scheduledTime,"i"));
			let scheduleTime= 	parseFloat(newDate(scheduledTime,Constants.TIME_FORMAT));
			asyncParallel({
				branch_availability: (callback)=>{

					/** Add calendar conditions */
					let calendarConditions = {
						parent_id	:	"",
						branch_id	:	branchId,
						status		: 	Constants.OPEN,
						type		: 	DEFAULT_WEEK,
					};

					/** Get calendar details */
					const restaurant_branch_calendars	= this.db.collection(Tables.RESTAURANT_BRANCH_CALENDARS);
					restaurant_branch_calendars.aggregate([
						{$match : calendarConditions},
						{$lookup:	{
							from     : Tables.RESTAURANT_BRANCH_CALENDARS,
							let      : {parentId : "$_id", branchId : "$branch_id"},
							pipeline : [
								{$match : {
									$expr: {
										$and : [
											{$eq: ["$parent_id", "$$parentId"]},
											{$eq: ["$branch_id", "$$branchId"]},
											{$eq: ["$day", scheduleDay]},
										]
									}
								}},
								{$project : { to_hour: 1, to_minute: 1, from_hour: 1, from_minute: 1 }},
							],
							as	:	"exception_details"
						}},
						{$lookup:	{ /** Check this branch close or not today */
							from     : Tables.RESTAURANT_BRANCH_CALENDARS,
							let      : {branchId : "$branch_id"},
							pipeline : [
								{$match : {
									$expr: {
										$and : [
											{$eq: ["$branch_id", "$$branchId"]},
											{$eq: ["$day", scheduleDay]},
											{$eq: ["$status",Constants.CLOSE]},
											{$eq: ["$type", Constants.WEEK_DAY]},
										]
									}
								}},
							],
							as	:	"close_day_details"
						}},
						{$match: {
							close_day_details : {$size : 0}
						}}
					]).toArray().then(result=>{
						if(result.length <=0) return callback(null,false);

						let calendarDetails = result[0];
						let exceptionList	= (calendarDetails.exception_details) ? calendarDetails.exception_details:[];
						let openFromHour 	=	(calendarDetails.from_hour)	?	calendarDetails.from_hour		:"00";
						let openFromMinute 	=	(calendarDetails.from_minute)?	calendarDetails.from_minute		:"00";
						let openToHour 		=	(calendarDetails.to_hour)	?	calendarDetails.to_hour			:"00";
						let openToMinute 	=	(calendarDetails.to_minute)	?	calendarDetails.to_minute		:"00";

						if(String(openFromMinute).length ==1) 	openFromMinute 	= 	"0"+openFromMinute;
						if(String(openToMinute).length ==1) 	openToMinute	= 	"0"+openToMinute;

						let scheduleOpenTime=	newDate(scheduledTime,Constants.OPEN_TIME_FORMAT);
						scheduleOpenTime	=	parseFloat(scheduleOpenTime.replace(':','.'));
						let openFrom		=	parseFloat(openFromHour+"."+openFromMinute);
						let openTo			=	parseFloat(openToHour+"."+openToMinute);
						let openCount  		= 	0;
						let closeCount 		= 	0;

						if(openFrom <= scheduleOpenTime && openTo>scheduleOpenTime) openCount++;

						if(exceptionList.length>0){
							exceptionList.map(records=>{
								let exceptionFromHour 	=	(records.from_hour)	?	records.from_hour 	:"00";
								let exceptionFromMinute =	(records.from_minute)?	records.from_minute :"00";
								let exceptionToHour		=	(records.to_hour)	?	records.to_hour	 	:"00";
								let exceptionToMinute 	=	(records.to_minute)	? 	records.to_minute 	:"00";

								if(String(exceptionFromMinute).length ==1){
									exceptionFromMinute 	= 	"0"+exceptionFromMinute;
								}
								if(String(exceptionToMinute).length ==1){
									exceptionToMinute	= 	"0"+exceptionToMinute;
								}

								let exceptionFrom	=	parseFloat(exceptionFromHour+"."+exceptionFromMinute);
								let exceptionTo		=	parseFloat(exceptionToHour+"."+exceptionToMinute);

								if(exceptionFrom <= scheduleOpenTime && exceptionTo>=scheduleOpenTime){
									closeCount++;
								}
							});
						}
						let branchAvailability = (openCount >=1 && closeCount<1) ? true :false;

						callback(null,branchAvailability);
					});
				},
				attribute_details: (callback)=>{
					/** Get branch attribute details */
					this.restaurantBranchAttributesDb.findOne({
						branch_id	  :	branchId,
						attribute_id  :	Constants.MAXIMUM_DURATION_IN_DAYS_FOR_SCHEDULED_ORDERS_ATTRIBUTE_ID
					},{projection: {_id: 0,value:1}}).then(attributeResult=>{
						attributeResult = (attributeResult) ? attributeResult:{};
						callback(null, attributeResult);
					}).catch(next);
				},
			},(asyncErr, asyncResponse)=>{
				if(asyncErr) return next(asyncErr);

				let branchAvailability	=	asyncResponse.branch_availability;
				let attributeDetails 	= 	asyncResponse.attribute_details;
				let totalAllowDays 	= attributeDetails.value ? parseFloat(attributeDetails.value) :"";

				/** Send error response **/
				if(totalAllowDays &&  totalAllowDays < totalScheduledDays){
					return resolve({
						status	: 	Constants.STATUS_ERROR,
						message	:	res.__("user_carts.branch_allow_max_schedule_day",totalAllowDays)
					});
				}

				/** Send success response */
				resolve({
					status 				: 	Constants.STATUS_SUCCESS,
					branch_available 	:	(branchAvailability) ? true :false
				});
			});
		}).catch(next);
	};// end checkPickUpStore()

	/**
	 * Function to check items availability
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	**/
	async checkItemsAvailability (req,res,next){
		return new Promise(resolve=>{
			/** Sanitize Data **/
			req.body 			=	sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
			let itemId			= 	(req.body.item_id)			?	new ObjectId(req.body.item_id)	:"";
			let scheduledTime	=	(req.body.scheduled_time)	?	req.body.scheduled_time			:getUtcDate();

			/** Send error response **/
			if(!itemId) return resolve({status: Constants.STATUS_ERROR, message: res.__("system.missing_parameters")});

			/** Get total scheduled days form current date */
			let scheduleTime = 	parseFloat(newDate(scheduledTime,TIME_FORMAT));
			asyncParallel({
				items_availability : (callback)=>{
					/** Set availability item conditions **/
					let availabilityConditions = {
						item_id		:	itemId,
						from_time	:	{$lte: scheduleTime},
						to_time		:	{$gte: scheduleTime},
					};

					/** Get availability item list **/
					const item_availability	= this.db.collection(Tables.ITEM_AVAILABILITY);
					item_availability.findOne(availabilityConditions,{projection: {_id: 1}}).then(availabilityResult => {
						if(!availabilityResult) return callback(null,false);

						/** Set item conditions **/
						let itemConditions = {
							_id				:	{$in: availabilityResult},
							restaurant_id	:	restaurantId,
							is_active		:	Constants.ACTIVE,
						};

						/** Get item  list **/
						this.itemsDb.findOne(itemConditions,{projection: {_id: 1}}).then(itemResult => {
							let itemAvailability = (itemResult) ? true :false;
							callback(null, itemAvailability);
						}).catch(next);
					}).catch(next);
				},
			},(asyncErr, asyncResponse)=>{
				if(asyncErr) return next(asyncErr);

				/** Send success response */
				resolve({
					status 				: 	Constants.STATUS_SUCCESS,
					items_availability 	:	asyncResponse.items_availability,
				});
			});
		}).catch(next);
	};// end checkItemsAvailability()

	/**
	 * Function to add unavailabel item
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	**/
	async addUnavailableItem(req,res,next){
		return new Promise(resolve=>{
			/** Sanitize Data **/
			req.body 			= sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
			let areaId  		= (req.body.area_id) 		? new ObjectId(req.body.area_id) 		:"";
			let cartId  		= (req.body.cart_id) 		? new ObjectId(req.body.cart_id) 		:"";
			let userId  		= (req.body.user_id) 		? new ObjectId(req.body.user_id) 		:"";
			let deviceId		= (req.body.device_id) 		? req.body.device_id 		 		:"";
			let restaurantId	= (req.body.restaurant_id) 	? new ObjectId(req.body.restaurant_id)	:"";
			let branchId		= (req.body.branch_id)	    ? new ObjectId(req.body.branch_id)		:"";
			let qty				= (req.body.qty)	    	? parseInt(req.body.qty)			:1;
			let itemId			= (req.body.item_id)		? new ObjectId(req.body.item_id)		:"";
			let unitId			= (req.body.unit_id)		? new ObjectId(req.body.unit_id)		:"";
			let itemUnitId		= (req.body.item_unit_id)	? new ObjectId(req.body.item_unit_id)	:"";
			let doughId			= (req.body.dough_id)		? new ObjectId(req.body.dough_id)		:"";
			let selectorId		= (req.body.selector_id)	? new ObjectId(req.body.selector_id)	:"";
			let itemType		= (req.body.item_type)		? req.body.item_type				:"";
			let offerId			= (req.body.offer_id)		? new ObjectId(req.body.offer_id)		:"";
			let extraItems		= (req.body.extra_items)	? req.body.extra_items				:[];
			let unitLists		= (req.body.unit_lists)		? req.body.unit_lists				:[];
			let note			= (req.body.note)			? req.body.note						:"";
			let orderId			= (req.body.order_id)		? new ObjectId(req.body.order_id)		:"";
			let isAdmin			= (req.body.is_admin)		? JSON.parse(req.body.is_admin)		:false;
			let modifyOrder		= (req.body.modify_order)	? JSON.parse(req.body.modify_order)	:false;
			let maxModifiedTime	= (req.body.max_modified_time) ? req.body.max_modified_time	:"";

			/** Update cart details */
			/** Set update data */
			let updatedData = {
				qty				:	qty,
				restaurant_id	:	restaurantId,
				branch_id		:	branchId,
				area_id			:	areaId,
				item_id			:	itemId,
				item_type		:	itemType,
				note			:	note,
				extra_items		:	extraItems,
				unit_lists		:	unitLists,
				modified 		: 	getUtcDate()
			};

			if(unitId) 		updatedData.unit_id 	= unitId;
			if(doughId) 	updatedData.dough_id 	= doughId;
			if(selectorId) 	updatedData.selector_id = selectorId;
			if(offerId) 	updatedData.offer_id 	= offerId;
			if(itemUnitId) 	updatedData.item_unit_id= itemUnitId;
			if(orderId)		updatedData.order_id	= orderId;
			if(maxModifiedTime)	updatedData.max_modified_time 	= 	getUtcDate(maxModifiedTime);
			if(req.body.device_type)  updatedData.device_type  	= 	req.body.device_type;
			if(req.body.device_token) updatedData.device_token 	=	req.body.device_token;

			if(userId){
				updatedData.customer_id  = userId;
			}
			if(!cartId) cartId = new ObjectId();

			this.usersDb.updateOne({
				_id : userId
			},
			{
				$push: {
					unavailable_data:updatedData,
				},
				$setOnInsert: {
					created : getUtcDate(),
				}
			},{upsert: true}).then(() => {

				/** Send success response **/
				resolve({
					status	: Constants.STATUS_SUCCESS,
					message : res.__("user_carts.item_added_into_cart_successfully"),
				});
			}).catch(next);
		}).catch(next);
	};// end addUnavailableItem()

	/**
	 * Function to get cart item list
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	**/
	async getUnavailableItemList(req,res,next){
		return new Promise(resolve=>{
			/** Sanitize Data **/
			req.body = sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
			/** Get user cart list */
			let cartOptions 	= clone(req.body);
			cartOptions.is_cart = true;
			this.getUserUnavailableItemList(req,res,next,cartOptions).then(response=>{
				resolve(response);
			}).catch(next);
        }).catch(next);
	};// end getUnavailableItemList()

	/**
	 * Function to get cart item list
	 *
	 * @param req		As Request Data
	 * @param res		As Response Data
	 * @param next		As Callback argument to the middleware function
	 * @param options	As object data
	 *
	 * @return json
	**/
	async getUserUnavailableItemList(req,res,next,options){
		return new Promise(resolve=>{
			let userId		= 	(options.user_id)	?	new ObjectId(options.user_id)	:"";
            let deviceId	= 	(options.device_id)	?	options.device_id			:"";

			/** Send error response **/
			if(!userId && !deviceId) return resolve({status: Constants.STATUS_ERROR, message:res.__("system.missing_parameters")});

			/** Set success response */
			let successResponse = {
				status: Constants.STATUS_SUCCESS, result: [], grand_total: 0, total_discount: 0, item_image_url: Constants.ITEMS_FILE_URL
			};

			asyncParallel({
				cart_list : (parentCallback)=>{
					/** Get users details **/
					this.usersDb.findOne({_id: userId},{projection: {unavailable_data: 1}}).then(userResult=> {
						userResult	=	(userResult && userResult.unavailable_data) ? userResult.unavailable_data:[];
						parentCallback(null,userResult);
					});
				},
			},(parentParallelErr,parentParallelResponse)=>{
				if(parentParallelErr) return next(parentParallelErr);

				let cartResult = (parentParallelResponse.cart_list) ? parentParallelResponse.cart_list :[];

				/** Send success response */
				if(cartResult.length < 0) return resolve(successResponse);

				let cartList 	= 	{};
				cartResult.map(data=>{
                    let restaurantId    =   data.restaurant_id;
					let branchId        =   data.branch_id;

					if(!cartList[restaurantId]) cartList[restaurantId] = {};
					if(!cartList[restaurantId][branchId]){
						cartList[restaurantId][branchId] = {
							restaurant_id	: 	restaurantId,
							branch_id		:	branchId,
							customer_id		:	data.customer_id,
							device_id		:	data.device_id,
							area_id		    :	data.area_id,
						};
					}

					if(!cartList[restaurantId][branchId].item_list) cartList[restaurantId][branchId].item_list = [];

                    if(data.restaurant_id)  delete data.restaurant_id;
                    if(data.branch_id)      delete data.branch_id;
                    if(data.area_id)        delete data.area_id;
                    if(typeof data.device_id != typeof undefined) delete data.device_id;
                    if(typeof data.customer_id != typeof undefined) delete data.customer_id;
					cartList[restaurantId][branchId].item_list.push(data);
				});

				asyncForEachOf(cartList,(listData,tempBranchId,parentEachCallback)=>{
					asyncEach(cartList[tempBranchId], (records, eachCallback)=> {

						asyncParallel({
							item_list : (callback)=>{
								asyncEach(records.item_list, (itemData, itemEachCallback)=> {
									let itemId 		= 	itemData.item_id;
									let unitId 		= 	itemData.unit_id;
									let doughId 	= 	itemData.dough_id;
									let selectorId 	=	itemData.selector_id;

                                    if(!itemData.extra_item_list) itemData.extra_item_list = {en:[],ar:[]};
                                    if(doughId && !itemData.dough_list) itemData.dough_list= {en:[],ar:[]};
                                    if(selectorId && !itemData.selector_list) itemData.selector_list = {en:[],ar:[]};
                                    if(unitId && !itemData.unit_list) itemData.unit_list = {en:[],ar:[]};

									itemData.item_available =  true;

									asyncParallel({
										item_details : (itemCallback)=>{
											/** Get item details **/
											this.itemsDb.findOne({
												_id 	   : 	itemId,
												is_active  :	Constants.ACTIVE,
											},{projection: {name: 1, image: 1, item_price: 1,category_ids: 1, discount_percentage: 1, discount_value: 1,grid_image:1,detail_image:1 }}).then(itemResult=> {
												if(itemResult){
													itemData.item_name	=  itemResult.name;
													itemData.item_image	=  itemResult.image;
													itemData.discount_value	=  itemResult.discount_value;
													itemData.discount_percentage= itemResult.discount_percentage;
													itemData.grid_image= itemResult.grid_image;
													itemData.detail_image= itemResult.detail_image;
													if(itemResult.item_price) itemData.item_price	=  itemResult.item_price;

													itemCallback(null,itemResult);
												}else{
													itemData.item_available =  false;
													itemCallback(null,itemResult);
												}
											}).catch(next);
										},
										unit_details : (unitCallback)=>{
											if(!unitId) return unitCallback(null,null);

											this.itemUnitsDb.aggregate([
												{$match: 	{
													item_id		: itemId,
													item_unit_id: unitId
												}},
												{$lookup: 	{
													from			: Tables.ITEM_UNITS_MASTERS,
													localField		: "item_unit_id",
													foreignField	: "_id",
													as				: "unit_details",
												}},
												{$project	: 	{
													price: 1, discount_type: 1, discount_value: 1, unit_name: {$arrayElemAt:["$unit_details.name", 0] },
												}},
											]).toArray().then(unitResult=>{
												if(unitResult && unitResult.length >0){
													if(unitResult[0].price) itemData.unit_price =  unitResult[0].price;

													itemData.unit_discount_type =  unitResult[0].discount_type;
													itemData.unit_discount_value=  unitResult[0].discount_value;
													itemData.unit_list.en.push(unitResult[0].unit_name.en);
													itemData.unit_list.ar.push(unitResult[0].unit_name.ar);
												}else{
													itemData.item_available =  false;
												}
												unitCallback(null,unitResult);
											}).catch(next);
										},
										dough_details : (unitCallback)=>{
											if(!doughId) return unitCallback(null,null);
											this.itemDoughUnitsDb.aggregate([
												{$match: 	{
													_id		: doughId
												}},
												{$lookup: 	{
													from			: Tables.ITEM_UNITS_MASTERS,
													localField		: "item_unit_id",
													foreignField	: "_id",
													as				: "unit_details",
												}},
												{$project	: 	{
													unit_name: {$arrayElemAt:["$unit_details.name", 0] },
												}},
											]).toArray().then(doughResult=>{
												if(doughResult && doughResult.length >0){
													itemData.dough_list.en.push(doughResult[0].unit_name.en);
													itemData.dough_list.ar.push(doughResult[0].unit_name.ar);
												}
												unitCallback(null,doughResult);
											}).catch(next);
										},
										selector_details : (unitCallback)=>{
											if(!selectorId) return unitCallback(null,null);
											this.itemSelectorUnitsDb.aggregate([
												{$match: 	{
													_id		: selectorId
												}},
												{$lookup: 	{
													from			: Tables.ITEM_UNITS_MASTERS,
													localField		: "item_unit_id",
													foreignField	: "_id",
													as				: "unit_details",
												}},
												{$project	: 	{
													unit_name: {$arrayElemAt:["$unit_details.name", 0] },
												}},
											]).toArray().then(selectorResult=>{
												if(selectorResult && selectorResult.length >0){
													itemData.selector_list.en.push(selectorResult[0].unit_name.en);
													itemData.selector_list.ar.push(selectorResult[0].unit_name.ar);
												}
												unitCallback(null,selectorResult);
											}).catch(next);
										},
										extra_item_list : (exItemCallback)=>{
											if(!itemData.extra_items || itemData.extra_items.length <= 0) return exItemCallback(null,null);

											asyncEach(itemData.extra_items, (exItemData, exItemEachCallback)=> {
												let groupId = exItemData.group_id;

												asyncParallel({
													extra_group_item_list : (groupCallback)=>{
														asyncEach(exItemData.extra_item_ids, (exItemData, groupExItemEachCallback)=> {
															let extraItemId = exItemData.extra_item_id;
															let groupItemId	= exItemData.extra_group_item_id;

															asyncParallel({
																extra_details : (extraItemCallback)=>{
																	/** Get extra item details **/
																	this.itemExtraMastersDb.aggregate([
																		{ $match : {
																			_id 	 : 	extraItemId,
																			item_id	 :	itemId,
																			$or : [
																				{is_active:	Constants.ACTIVE },
																				{is_auto_selected:true }
																			]}
																		},
																		{$lookup:	{
																			from	 : Tables.ITEM_GROUP_EXTRAS,
																			let      : {itemExtraId : "$_id"},
																			pipeline : [
																				{$match : {
																					$expr: {
																						$and : [
																							{$eq: ["$item_extra_id", "$$itemExtraId"]},
																						]
																					}
																				}},
																				{$project: {
																					extra_fees: 1
																				}},
																			],
																			as:	"extra_item_detail"
																		}},
																		{$project: {name: 1, extra_fees: { $ifNull: [ {$arrayElemAt: ["$extra_item_detail.extra_fees",0]},"$extra_fees"  ] }}}
																	]).toArray().then(exItemResult=>{
																		if(exItemResult && exItemResult[0]){
																			exItemResult	=	exItemResult[0];

																			itemData.extra_item_list.en.push(exItemResult.name.en);
																			itemData.extra_item_list.ar.push(exItemResult.name.ar);
																			if(!itemData.extra_item_list.detail) itemData.extra_item_list.detail = [];
																			itemData.extra_item_list.detail.push(exItemResult);
																			if(isPlaceOrder){
																				exItemData.extra_item_name = exItemResult.name;
																			}

																			if(exItemResult.extra_fees){
																				exItemData.extra_fees = exItemResult.extra_fees;
																			}
																		}else{
																			itemData.item_available =  false;
																		}
																		extraItemCallback(null,exItemResult);
																	}).catch(next);
																},
																extra_group_details: (extraItemGroupCallback)=>{
																	/** Get group details **/
																	this.itemGroupExtrasDb.findOne({
																		_id 	: 	groupItemId,
																		item_id	:	itemId,
																		group_id: 	groupId,
																		item_extra_id : extraItemId,
																	},{projection: {extra_fees: 1}}).then(groupItemResult=>{
																		if(groupItemResult){
																			if(groupItemResult.extra_fees){
																				exItemData.extra_fees = groupItemResult.extra_fees;
																			}
																		}else{
																			itemData.item_available =  false;
																		}
																		extraItemGroupCallback(null,groupItemResult);
																	}).catch(next);
																},
															},(parallelExGroupErr)=>{
																groupExItemEachCallback(parallelExGroupErr);
															});

														},(asyncGroupExItemErr)=>{
															groupCallback(asyncGroupExItemErr);
														});
													},
												},(parallelErr)=>{
													exItemEachCallback(parallelErr);
												});
											},(asyncExItemErr)=>{
												exItemCallback(asyncExItemErr);
											});
										},
										unit_item_list : (exItemCallback)=>{
											if(!itemData.unit_lists || itemData.unit_lists.length <= 0) return exItemCallback(null,null);

											asyncEach(itemData.unit_lists, (data, eachCallback)=> {
												if(!data.extra_items || data.extra_items.length <=0) return eachCallback(null);

												let unitId 		= 	data.unit_id;
												let doughId 	= 	data.dough_id;
												let selectorId 	=	data.selector_id;

												if(!itemData.unit_dough_list) itemData.unit_dough_list = {en:[],ar:[]};
												if(!itemData.unit_selector_list) itemData.unit_selector_list = {en:[],ar:[]};
												if(!itemData.unit_item_list) itemData.unit_item_list = {en:[],ar:[]};

												asyncParallel({
													unit_details : (listCallback)=>{
														if(!unitId) return listCallback(null,null);

														this.itemUnitsDb.aggregate([
															{$match: 	{
																item_id		: itemId,
																item_unit_id: unitId
															}},
															{$lookup: 	{
																from			: Tables.ITEM_UNITS_MASTERS,
																localField		: "item_unit_id",
																foreignField	: "_id",
																as				: "unit_details",
															}},
															{$project	: 	{
																price: 1, unit_name: {$arrayElemAt:["$unit_details.name", 0] },
															}},
														]).toArray().then(unitResult=>{
															if(unitResult && unitResult.length >0){
																if(unitResult[0].price) itemData.unit_price =  unitResult[0].price;
																itemData.unit_item_list.en.push(unitResult[0].unit_name.en);
																itemData.unit_item_list.en.push(unitResult[0].unit_name.en);
															}else{
																itemData.item_available =  false;
															}
															listCallback(null,unitResult);
														}).catch(next);
													},
													dough_details : (listCallback)=>{
														if(!doughId) return listCallback(null,null);
														this.itemDoughUnitsDb.aggregate([
															{$match: 	{
																_id		: doughId
															}},
															{$lookup: 	{
																from			: Tables.ITEM_UNITS_MASTERS,
																localField		: "item_unit_id",
																foreignField	: "_id",
																as				: "unit_details",
															}},
															{$project	: 	{
																unit_name: {$arrayElemAt:["$unit_details.name", 0] },
															}},
														]).toArray().then(doughResult=>{
															if(doughResult && doughResult.length >0){
																itemData.unit_dough_list.en.push(doughResult[0].unit_name.en);
																itemData.unit_dough_list.ar.push(doughResult[0].unit_name.ar);
															}
															listCallback(null,doughResult);
														}).catch(next);
													},
													selector_details : (listCallback)=>{
														if(!selectorId) return listCallback(null,null);
														this.itemSelectorUnitsDb.aggregate([
															{$match: 	{
																_id		: selectorId
															}},
															{$lookup: 	{
																from			: Tables.ITEM_UNITS_MASTERS,
																localField		: "item_unit_id",
																foreignField	: "_id",
																as				: "unit_details",
															}},
															{$project	: 	{
																unit_name: {$arrayElemAt:["$unit_details.name", 0] },
															}},
														]).toArray().then(selectorResult=>{
															if(selectorResult && selectorResult.length >0){
																itemData.unit_selector_list.en.push(selectorResult[0].unit_name.en);
																itemData.unit_selector_list.ar.push(selectorResult[0].unit_name.ar);
															}
															listCallback(null,selectorResult);
														}).catch(next);
													},
													extra_group_item_list : (listCallback)=>{
														asyncEach(data.extra_items, (exItemData, exItemEachCallback)=> {
															let groupId = exItemData.group_id;

															asyncParallel({
																extra_group_item_list : (groupCallback)=>{
																	asyncEach(exItemData.extra_item_ids, (exItemData, groupExItemEachCallback)=> {
																		let extraItemId = exItemData.extra_item_id;
																		let groupItemId	= exItemData.extra_group_item_id;

																		asyncParallel({
																			extra_details : (extraItemCallback)=>{
																				/** Get extra item details **/
																				this.itemExtraMastersDb.aggregate([
																					{ $match : {
																						_id 	 : 	extraItemId,
																						item_id	 :	itemId,
																						$or : [
																							{is_active:	Constants.ACTIVE },
																							{is_auto_selected:true }
																						]}
																					},
																					{$lookup:	{
																						from	 : Tables.ITEM_GROUP_EXTRAS,
																						let      : {itemExtraId : "$_id"},
																						pipeline : [
																							{$match : {
																								$expr: {
																									$and : [
																										{$eq: ["$item_extra_id", "$$itemExtraId"]},
																									]
																								}
																							}},
																							{$project: {
																								extra_fees: 1
																							}},
																						],
																						as:	"extra_item_detail"
																					}},
																					{$project: {name: 1, extra_fees: { $ifNull: [ {$arrayElemAt: ["$extra_item_detail.extra_fees",0]},"$extra_fees"  ] }}}
																				]).toArray().then(exItemResult=>{
																					if(exItemResult && exItemResult[0]){
																						exItemResult	=	exItemResult[0];
																						itemData.extra_item_list.en.push(exItemResult.name.en);
																						itemData.extra_item_list.ar.push(exItemResult.name.ar);

																						// if(isPlaceOrder){
																							exItemData.extra_item_name = exItemResult.name;
																						// }

																						if(exItemResult.extra_fees){
																							exItemData.extra_fees = exItemResult.extra_fees;
																						}
																					}else{
																						itemData.item_available =  false;
																					}
																					extraItemCallback(null,exItemResult);
																				}).catch(next);
																			},
																			extra_group_details: (extraItemGroupCallback)=>{
																				/** Get group details **/
																				this.itemGroupExtrasDb.findOne({
																					_id 	: 	groupItemId,
																					item_id	:	itemId,
																					group_id: 	groupId,
																					item_extra_id : extraItemId,
																				},{projection: {extra_fees: 1}}).then(groupItemResult=>{
																					if(groupItemResult){
																						if(groupItemResult.extra_fees){
																							exItemData.extra_fees = groupItemResult.extra_fees;
																						}
																					}else{
																						itemData.item_available =  false;
																					}
																					extraItemGroupCallback(null,groupItemResult);
																				}).catch(next);
																			},
																		},(parallelExGroupErr)=>{
																			groupExItemEachCallback(parallelExGroupErr);
																		});
																	},(asyncGroupExItemErr)=>{
																		groupCallback(asyncGroupExItemErr);
																	});
																},
															},(parallelErr)=>{
																exItemEachCallback(parallelErr);
															});
														},(asyncExItemErr)=>{
															listCallback(asyncExItemErr);
														});
													}
												},(parallelErr)=>{
													eachCallback(parallelErr);
												});
											},(eachErr)=> {
												exItemCallback(eachErr);
											});
										},
									},(parallelErr)=>{
										itemEachCallback(parallelErr);
									});
								},(asyncItemErr)=>{
									callback(asyncItemErr);
								});
							},
						},(parallelErr)=>{
							eachCallback(parallelErr);
						});
					},(subEachErr)=> {
						parentEachCallback(subEachErr);
					});
				},(eachErr)=> {
					if(eachErr) return next(eachErr);

					let grandTotal 		=	0;
					let totalDiscount	=	0;
					let finalList 		= 	[];
					let itemSubTotal	= 	0;
					Object.keys(cartList).map(restaurantId=>{
						Object.keys(cartList[restaurantId]).map(branchId=>{
							let data 			= 	clone(cartList[restaurantId][branchId]);
							data.discount 		=	0;
							let totalAmount		=	0;

							let totalItemAmount = 0;
							data.item_list.map(records=>{
								let qty		  	= 	(records.qty) 		 ? records.qty 		  :0;
								let itemPrice	= 	(records.item_price) ? records.item_price :0;

								if(itemPrice){
									let tmpPrice 		=	itemPrice;
									let percentage		=	records.discount_percentage;
									let discountValue	=	records.discount_value;

									if(discountValue){
										let tmpDiscount= (tmpPrice>=discountValue) ? discountValue :tmpPrice;

										records.strikethrough_price = tmpPrice;
										itemPrice = round(tmpPrice-tmpDiscount);
									}else if(percentage){
										let tmpDiscount = 	(tmpPrice*percentage)/100;

										records.strikethrough_price	= tmpPrice;
										itemPrice = round(tmpPrice-tmpDiscount);
									}
								}

								if(records.unit_id && records.unit_price >0){
									itemPrice	= 	(records.unit_price) ? records.unit_price :0;
									let discountType  =  (records.unit_discount_type) ? records.unit_discount_type :0;
									let discountValue = (records.unit_discount_value) ? records.unit_discount_value :0;

									let tmpPrice =	itemPrice;
									if(discountValue && discountType){
										if(discountType == Constants.DISCOUNT_BY_VALUE){
											let tmpDiscount= (tmpPrice>=discountValue) ? discountValue :tmpPrice;

											records.strikethrough_price = tmpPrice;
											itemPrice = round(tmpPrice-tmpDiscount);
										}else{
											let tmpDiscount = 	(tmpPrice*discountValue)/100;

											records.strikethrough_price= tmpPrice;
											itemPrice = round(tmpPrice-tmpDiscount);
										}
									}
								}

								if(records.item_type == Constants.HALF_AND_HALF_ITEM || records.item_type == Constants.PIZZA_VGROUP){
									itemPrice = 0;
								}

								/** Add item main price */
								records.item_main_price =	round(itemPrice);

								if(records.extra_items && records.extra_items.length >0){
									records.extra_items.map(extraData=>{

										extraData.extra_item_ids.map(itemData=>{
											itemPrice += (itemData.extra_fees) ? parseFloat(itemData.extra_fees) :0;
										});
									});
								}

								if(records.unit_lists && records.unit_lists.length >0){
									records.unit_lists.map(tmpExtraItem=>{
										if(tmpExtraItem.extra_items && tmpExtraItem.extra_items.length >0){
											tmpExtraItem.extra_items.map(extraData=>{

												extraData.extra_item_ids.map(itemData=>{
													itemPrice += (itemData.extra_fees) ? parseFloat(itemData.extra_fees) :0;
												});
											});
										}
									});
								}

								let priceWithQty	=	round(itemPrice*qty);
								records.discount  	= 	0;
								records.sub_price  	= 	priceWithQty;
								records.item_price 	=	round(itemPrice);
								grandTotal 			+= 	priceWithQty;
								totalAmount			+= 	priceWithQty;
								totalItemAmount		+= 	priceWithQty;
								itemSubTotal		+=  priceWithQty;
							});

							/** Add additional tax */
							data.additional_tax =	0;
							data.total_amount	= 	round(totalAmount);
							finalList.push(data);
						});
					});

					/** Set response */
					successResponse.result 			= 	finalList;
					successResponse.grand_total 	= 	round(grandTotal);
					successResponse.item_sub_total 	= 	round(itemSubTotal);
					successResponse.total_discount 	=	round(totalDiscount);
					/** Send success response */
					resolve(successResponse);
				});
			});
        }).catch(next);
	};// end getUserUnavailableItemList()
}
export default UserCarts;

