import { ObjectId } from 'mongodb';
import clone from 'clone';
import {parallel as asyncParallel, each as asyncEach } from 'async';
import * as Constants from "../../../../config/global_constant.mjs";
import Tables from '../../../../config/database_tables.mjs';
import { isPost, sanitizeData, getUtcDate, configDatatable, appendFileExistData, generateOfferCode, getDropdownList, moveUploadedFile, newDate, arrayToObject } from "../../../../utils/index.mjs";
import BREADCRUMBS from '../../../../breadcrumbs.mjs';
import { saveSystemLogs } from "../../../../services/index.mjs";

class OfferManagement {
    constructor(db) {
        this.db = db;
        this.collectionDb = db.collection(Tables.OFFERS);
    }

    /**
     * Function to get offer list
     *
     * @param req	As Request Data
     * @param res	As Response Data
     * @param next 	As Callback argument to the middleware function
     *
     * @return render/json
     */
    async getOffersList(req, res, next) {
        try {
            let offerType = (req.query.offer_type) ? req.query.offer_type : '';

            if(isPost(req)){
                let limit = (req.body.length) ? parseInt(req.body.length) : Constants.ADMIN_LISTING_LIMIT;
                let skip = (req.body.start) ? parseInt(req.body.start) : Constants.DEFAULT_SKIP;
                let fromDate = (req.body.from_date) ? req.body.from_date : "";
                let toDate = (req.body.to_date) ? req.body.to_date : "";

                let offerIds = [];
                if(offerType) {
                    // Get offer ids from offer_logs
                    const offerLogs = this.db.collection(Tables.OFFER_LOGS);
                    offerIds = await offerLogs.distinct("offer_id", {});
                }

                /** Configure Datatable conditions*/
                const dataTableConfig = await configDatatable(req, res, null);
                
                /** Set conditions */
                let commonConditions = {};

                if(offerType){
                    switch(offerType){
                        case "redeemed_offers":
                            commonConditions._id = {$in : offerIds.map(id => new ObjectId(id))};
                            break;
                        case "unused_offers":
                            commonConditions._id = {$nin : offerIds.map(id => new ObjectId(id))};
                            break;
                    }
                }

                /** Condition for date */
                if (fromDate != "" && toDate != "") {
                    dataTableConfig.conditions["$or"] = [
                        {$and : [
                            { valid_from : {$gte : new Date(fromDate)} },
                            { valid_to   : {$lte : new Date(toDate)} }
                        ]},
                        {$and : [
                            { valid_to 	 : {$gte : new Date(fromDate)} },
                            { valid_from : {$lte : new Date(toDate)} }
                        ]}
                    ];
                }

                dataTableConfig.conditions = Object.assign(dataTableConfig.conditions, commonConditions);

                // Get list or count of offers with aggregation
                let dbRes = await this.collectionDb.aggregate([
                    {$match: dataTableConfig.conditions },
                    {$facet : {
                        list : [
                            {$sort: dataTableConfig.sort_conditions },
                            {$skip: skip },
                            {$limit: limit },
                            {$lookup:	{
                                from     : Tables.OFFER_LOGS,
                                let      : {offerId : "$_id"},
                                pipeline : [
                                    {$match : {
                                        $expr: {$and : [
                                            {$eq: ["$offer_id", "$$offerId"]},
                                        ]}
                                    }},
                                    {$addFields : { isDevice : {$ifNull: [ "$user_id", true ] }}},
                                    {$group	: {
                                        _id : {
                                            user_device_id: {$cond: [
                                                {$and: [
                                                    {$eq: ["$isDevice",true] },
                                                ]},
                                                "$device_id",
                                                "$user_id",
                                            ]}
                                        },
                                        total_redeem_count: {$sum: 1},
                                    }},
                                ],
                                as:	"offer_redeem_details"
                            }},
                            {$project : { 
                                _id:1, title:1, offer_code:1, valid_from:1, valid_to:1, is_active:1, status:1, total_redeem:1, unique_redeem_count : {$size: "$offer_redeem_details"},
                                total_redeem_count  : {$sum: "$offer_redeem_details.total_redeem_count"},
                            }}
                        ],
                        count: [
                            {$count: "count"},
                        ],
                    }}
                ]).toArray();

                /** Send response **/
                res.send({
                    status: Constants.STATUS_SUCCESS,
                    draw: dataTableConfig.result_draw,
                    data			:   dbRes?.[0]?.list ||[],
                    recordsTotal	:	dbRes?.[0]?.count?.[0]?.count || 0,
                    recordsFiltered	:  	dbRes?.[0]?.count?.[0]?.count || 0,
                }); 
            } else {
                /** render offers listing page **/
                req.breadcrumbs(BREADCRUMBS['admin/offer_management/list']);
                res.render('list', {offer_type : offerType});
            }
        } catch (error) {
            next(error);
        }
    }

    /**
     * Function to get offer details
     *
     * @param req	As Request Data
     * @param res	As Response Data
     * @param next 	As Callback argument to the middleware function
     *
     * @return json
     */
    async getOfferDetails(req, res, next) {
        try {
            /** Get offer details **/
            const result = await this.collectionDb.findOne({
                _id: new ObjectId(req.params.id)
            }, {projection: { _id:1, applicable_for:1, branch_ids:1, cuisine_ids:1, description:1, discount_type:1, display_offer:1, display_order:1, image_in_english:1, image_in_arabic:1, item_ids:1, max_amount:1, min_amount:1, number_of_members:1, offer_code:1, offer_max_amount:1, offer_type:1, offer_value:1, restaurant_ids:1, category_ids:1, title:1, user_ids:1, valid_from:1, valid_to:1, item_offer_type: 1, minimum_items: 1, discount_price:1, total_unique_redeem: 1, total_redeem: 1, corporate_ids: 1, is_free_delivery:1, listed_on_myoffer:1, offer_sub_type:1, restaurant_type:1, restaurant_discount_ratio:1}});

            /** Send error response */
            if(!result) {
                return {
                    status: Constants.STATUS_ERROR,
                    message: res.__("admin.system.invalid_access")
                };
            }

            /** Appened image with full path **/
            const imageResponse = await appendFileExistData({
                "file_url" 			: 	Constants.OFFER_MANAGEMENT_FILE_URL,
                "file_path" 		: 	Constants.OFFER_MANAGEMENT_FILE_PATH,
                "result" 			: 	[result],
                "database_field" 	: 	"image_in_english",
                "image_placeholder" :   "en_image"
            });
            
            /** Appened image with full path **/
            const imageArabicResponse = await appendFileExistData({
                "file_url" 			: 	Constants.OFFER_MANAGEMENT_FILE_URL,
                "file_path" 		: 	Constants.OFFER_MANAGEMENT_FILE_PATH,
                "result" 			: 	imageResponse.result,
                "database_field" 	: 	"image_in_arabic",
                "image_placeholder" :   "ar_image"
            });

            /** Send success response **/
            return {
                status	: Constants.STATUS_SUCCESS,
                result	: imageArabicResponse?.result?.[0] || {}
            };
        } catch (error) {
            next(error);
        }
    }

    /**
     * Function for add or update offer
     *
     * @param req 	As Request Data
     * @param res 	As Response Data
     * @param next 	As Callback argument to the middleware function
     *
     * @return render/json
     */
    async addEditOffer(req, res, next) {
        try {
            let isEditable = (req.params.id) ? true : false;
            let offerId = (req.params.id) ? new ObjectId(req.params.id) : new ObjectId();

            if(isPost(req)){
                /** Sanitize Data **/
                req.body = sanitizeData(req.body, Constants.NOT_ALLOWED_TAGS_XSS);                
                let offerType = (req.body.offer_type) ? req.body.offer_type : "";
                let itemOfferType = (req.body.item_offer_type) ? req.body.item_offer_type : "";
                let items = (req.body.items) ? req.body.items : "";
                let listedOnMyOffer = (req.body.listed_on_my_offer) ? req.body.listed_on_my_offer : "";
                let applicableFor   = (req.body.applicable_for) ? req.body.applicable_for : [];

                /** Send error response */
                if(offerType == Constants.COMBO_OFFER && itemOfferType == Constants.ITEM_WISE_OFFER && req.body.restaurant_ids && req.body.branch_ids && req.body.category_ids && (!items || items.length <=0)){
                    return res.send({status: Constants.STATUS_ERROR, message :res.__("admin.system.something_going_wrong_please_try_again") });
                }

                asyncParallel({
					image_in_english: (callback)=>{
                        if(!req.files || !req.files.image_in_english) return callback(null,null);
                        
												/** Upload image in english **/
						moveUploadedFile(req, res, {
							'image' 	: req.files.image_in_english,
							'filePath'  : Constants.OFFER_MANAGEMENT_FILE_PATH,
							'oldPath' 	: (req.body.old_image_in_english) ? req.body.old_image_in_english : ""
						}).then(fileResponse => {
							callback(null,fileResponse);
						}).catch(next);
					},
					image_in_arabic: (callback)=>{
                        if(!req.files || !req.files.image_in_arabic) return callback(null,null);
                        
						/** Upload image in arabic **/
						moveUploadedFile(req, res, {
							'image' 	: req.files.image_in_arabic,
							'filePath'  : Constants.OFFER_MANAGEMENT_FILE_PATH,
							'oldPath' 	: (req.body.old_image_in_arabic) ? req.body.old_image_in_arabic : ""
						}).then(fileResponse => {
							callback(null,fileResponse);
						}).catch(next);
					}
				},async (err,response)=>{
					if(err) return next(err);

					let imageInEnglishResponse = response.image_in_english ? response.image_in_english : "";
					let imageInArabicResponse  = response.image_in_arabic  ? response.image_in_arabic  : "";

					/** Set error if image is not in format **/
					let imageErrors = [];
					if(imageInEnglishResponse.status == Constants.STATUS_ERROR) {
						imageErrors.push({'param': 'image_in_english','msg': imageInEnglishResponse.message });
					}

					/** Set error if image is not in format **/
					if(imageInArabicResponse.status == Constants.STATUS_ERROR) {
						imageErrors.push({ 'param': 'image_in_arabic', 'msg': imageInArabicResponse.message });
					}

					/** Send error response **/
                    if(imageErrors.length >0) return res.send({status:STATUS_ERROR, message:imageErrors });

                    let fromDate 	= req.body.start_date;
					let toDate 	 	= req.body.end_date;
                    let userIds 	  = (req.body.user_ids) 	  ? req.body.user_ids 		:[];
                    let restaurantIds = (req.body.restaurant_ids) ? req.body.restaurant_ids :[];
                    let branchIds 	  = (req.body.branch_ids)	  ? req.body.branch_ids 	:[];
                    let categoryIds	  = (req.body.category_ids)   ? req.body.category_ids 	:[];
                    let cuisineIds 	  = (req.body.cuisine_ids) 	  ? req.body.cuisine_ids 	:[];
                    let itemIds 	  = (req.body.item_ids) 	  ? req.body.item_ids 		:[];
                    let corporateIds  = (req.body.corporate_ids)  ? req.body.corporate_ids 	:[];

                    /** Convert array to object **/
                    userIds			= (userIds.constructor === Array) 		? userIds 		: [userIds];
                    restaurantIds	= (restaurantIds.constructor === Array) ? restaurantIds : [restaurantIds];
                    branchIds		= (branchIds.constructor === Array) 	? branchIds 	: [branchIds];
                    cuisineIds		= (cuisineIds.constructor === Array) 	? cuisineIds 	: [cuisineIds];
                    itemIds			= (itemIds.constructor === Array) 		? itemIds 		: [itemIds];
                    categoryIds		= (categoryIds.constructor === Array) 	? categoryIds 	: [categoryIds];
                    corporateIds	= (corporateIds.constructor === Array) 	? corporateIds 	: [corporateIds];
                    applicableFor	= (applicableFor.constructor === Array) ? applicableFor : [applicableFor];

                    /** Convert date to database date format **/
					let tempToDate  = newDate(toDate, Constants.DATABASE_DATE_FORMAT);
					let tempFromDate= newDate(fromDate, Constants.DATABASE_DATE_FORMAT);
					tempToDate  	= newDate(tempToDate+" "+Constants.END_DATE_TIME_FORMAT);
					tempFromDate  	= newDate(tempFromDate+" "+Constants.START_DATE_TIME_FORMAT);

					if(offerType == Constants.COMBO_OFFER){
                        let errors = [];
                        if(itemOfferType == Constants.ITEM_WISE_OFFER){
                            let selectedCount = 0;
                            if(items.length >0){
                                items.map((records,index)=>{
                                    if(records.is_selected){
                                        selectedCount++;
                                        if(!records.price){
                                            errors.push({'param': 'items_'+index, 'msg': res.__("admin.offer_management.please_enter_price") });
                                        }else if(isNaN(records.price) || records.price<0 || records.price > Constants.MAX_PERCENTAGE){
                                            errors.push({'param': 'items_'+index, 'msg': res.__("admin.offer_management.please_enter_valid_price") });
                                        }
                                    }
                                });
                            }
                            if(!selectedCount && req.body.restaurant_ids && req.body.branch_ids && req.body.category_ids){
                                let params 		= (items.length >0) ? "items_select_0" :Constants.ADMIN_GLOBAL_ERROR;
                                let tmpMessage	= (items.length >0) ? res.__("admin.offer_management.please_select_item") :res.__("admin.offer_management.select_at_least_one_item");
        
                                errors.push({'param': params, 'msg': tmpMessage });
                            }
                        }else if(!itemIds || itemIds.length <=0){
                            errors.push({'param': "item_ids", 'msg': res.__("admin.offer_management.select_at_least_one_item") });
                        }
                        
                        /** Send error response **/
                        if(errors.length > 0) return res.send({ status: Constants.STATUS_ERROR, message: errors});
                    }        

                    let numberOfOffers = req.body.number_of_offers ?  req.body.number_of_offers : 0;
                    let offerCode 	   = req.body.offer_code       ?  req.body.offer_code       : "";
                    let offerCodeArray = [];

                    /** Generate offer code **/
                    if(numberOfOffers > 0){
                        for(var i=1; i<=numberOfOffers; i++){
                            let tmp = "";
                            if(i < 10){
                                tmp = offerCode+"00"+i;
                            }else if(i > 100){
                                tmp = offerCode+i;
                            }else {
                                tmp = offerCode+"0"+i;
                            }
                            offerCodeArray.push(tmp);
                        }
                    }

                    /** Set data in a object **/
					let updateData = {
						$set :{
							title : {
								en : req.body.title_in_english,
								ar : req.body.title_in_arabic
							},
							description : {
								en : req.body.description_in_english,
								ar : req.body.description_in_arabic
							},
							offer_type 		 	: req.body.offer_type,
							offer_value 		: (req.body.offer_value)	  ?	parseFloat(req.body.offer_value) :"",
							offer_max_amount 	: (req.body.offer_max_amount) ? parseFloat(req.body.offer_max_amount) :0,
							min_amount 		 	: (req.body.min_amount) ? parseFloat(req.body.min_amount) :"",
							max_amount 		 	: (req.body.max_amount) ? parseFloat(req.body.max_amount) :"",
							total_redeem		: (req.body.total_redeem) ? parseInt(req.body.total_redeem) :"",
							total_unique_redeem	: (req.body.total_unique_redeem) ? parseInt(req.body.total_unique_redeem) :"",
							applicable_for 	 	: applicableFor,
							corporate_ids 	 	: arrayToObject(corporateIds),
							user_ids  		 	: arrayToObject(userIds),
							restaurant_ids   	: arrayToObject(restaurantIds),
							branch_ids  		: arrayToObject(branchIds),
							category_ids  		: arrayToObject(categoryIds),
							cuisine_ids 		: arrayToObject(cuisineIds),
							item_ids  			: arrayToObject(itemIds),
							valid_from			: tempFromDate,
							valid_to			: tempToDate,
							display_offer		: (req.body.display_offer) ? true : false,
							display_order		: (req.body.display_order) ? parseInt(req.body.display_order) : "",
							discount_type		: req.body.discount_type,
							number_of_members	: (req.body.number_of_members) ? parseInt(req.body.number_of_members) : "",
							modified			: getUtcDate(),
							is_free_delivery	: (req.body.free_delivery) ? true : false,
							listed_on_myoffer   : (listedOnMyOffer)  	   ? true : false,
							offer_sub_type      : req.body.offer_sub_type,
							restaurant_type     : req.body.restaurant_type,
							restaurant_discount_ratio : parseFloat(req.body.offer_discount_for_restaurant),
							cravez_discount_ratio 	  : Constants.MAX_PERCENTAGE - parseFloat(req.body.offer_discount_for_restaurant)
						},
						$setOnInsert : {
							offer_code 	:	offerCode,
							status 	  	: 	Constants.OFFER_PUBLISHED,
							is_active	: 	Constants.ACTIVE,
							created   	: 	getUtcDate()
						}
					};

					if(offerType == Constants.COMBO_OFFER){
						updateData["$set"].minimum_items 	=  parseFloat(req.body.minimum_items) ;
						updateData["$set"].item_offer_type  =  req.body.item_offer_type;

						if(itemOfferType == Constants.GENERAL_ITEM_OFFER) updateData["$set"].discount_price =  parseFloat(req.body.discount_price);
					}else{
						if(!updateData["$unset"]) updateData["$unset"] ={};

						updateData["$unset"].minimum_items 		= 1;
						updateData["$unset"].item_offer_type 	= 1;
						updateData["$unset"].discount_price 	= 1;
 					}

					/** if upload image in english **/
					if(imageInEnglishResponse.fileName) updateData["$set"]['image_in_english'] = imageInEnglishResponse.fileName;

					/** if upload image in arabic **/
					if(imageInArabicResponse.fileName) updateData["$set"]['image_in_arabic'] = imageInArabicResponse.fileName;

					let insertDataArray = [];
					if(numberOfOffers > 0){
						offerCodeArray.map(records=>{
							let tmpInsertData = clone(updateData);
							tmpInsertData["$setOnInsert"].offer_code = records;

							insertDataArray.push({ update_data: tmpInsertData, tmp_data:{_id: new ObjectId()}});
						});
					}else{
						insertDataArray.push({ update_data : updateData, tmp_data : {_id: offerId}});
					}

                    /** Update details **/
					const offer_items = this.db.collection(Tables.OFFER_ITEMS);
					asyncEach(insertDataArray, (records, eachCallback)=> {
						let tmpOfferId = records.tmp_data._id;

						/** Update offer details */
						this.collectionDb.updateOne({_id:tmpOfferId},records.update_data,{upsert:true}).then(()=>{

							asyncParallel({
								save_offer_item :(callback)=>{
									/** Delete offer items */
									offer_items.deleteMany({offer_id: tmpOfferId}).then(()=>{

										if(offerType != Constants.COMBO_OFFER || itemOfferType != Constants.ITEM_WISE_OFFER) return callback(null);

										asyncEach(req.body.items, (records, childEachCallback)=> {
											if(records.is_selected){
												/** Update offer items */
												offer_items.updateOne({
													offer_id 	:	tmpOfferId,
													item_id		: 	new ObjectId(records.item_id),
												},
												{
													$set : {
														price 		: 	parseFloat(records.price),
														modified   	:	getUtcDate()
													},
													$setOnInsert : {
														restaurant_id  	: new ObjectId(records.restaurant_id),
														created   		: getUtcDate()
													}
												},{upsert: true}).then(()=>{
													childEachCallback(null);
												}).catch(next);
											}else{
												childEachCallback(null);
											}
										},(eachErr)=> {
											callback(eachErr);
										});
									}).catch(next);
								},
							},(asyncErr)=>{
								/** save System logs */
								saveSystemLogs(req, res, {
									user_id				: req.session.user._id,
									parent_id			: tmpOfferId,
									activity_module		: Constants.SYSTEM_LOG_MODULE_OFFER_MANAGEMENT,
									activity_type		: Constants.ACTIVITY_TYPE_ADD_EDIT,
									additional_details	: {}
								});

								eachCallback(asyncErr);
							});
						}).catch(next);
					},(eachErr)=> {
						if(eachErr) return next(eachErr);

						/** Send success response **/
						let message = (isEditable) ? res.__("admin.offer_management.offer_has_been_updated_successfully") :res.__("admin.offer_management.offer_has_been_added_successfully");
						if(!isEditable) req.flash(Constants.STATUS_SUCCESS,message);
						res.send({
							status		: Constants.STATUS_SUCCESS,
							redirect_url: Constants.WEBSITE_ADMIN_URL+"offer_management",
							message		: message
						});
					});
                });
            } else {
                let offerData = {};
                if(isEditable){
                    const offerDetails = await this.getOfferDetails(req, res, next);

                    /** Send error response **/
                    if(offerDetails.status != Constants.STATUS_SUCCESS) return res.status(400).send(offerDetails);
                    
                    offerData = offerDetails.result;
                }

                let restaurantIds  	= offerData?.restaurant_ids || [];
                let userIds  	   	= offerData?.user_ids || [];
                let branchIds  	   	= offerData?.branch_ids || [];
                let cuisineIds     	= offerData?.cuisine_ids || [];
                let categoryIds    	= offerData?.category_ids || [];
                let itemIds    	   	= offerData?.item_ids || [];
                let corporateIds   	= offerData?.corporate_ids || [];
                let offerType 		= offerData?.offer_type || "";
                let itemOfferType 	= offerData?.item_offer_type || "";
                let onlyList 		= (offerType == Constants.COMBO_OFFER && itemOfferType ==Constants.ITEM_WISE_OFFER) ? true :false;

                asyncParallel({
                    category_list : (callback)=>{
                        if(!isEditable || !restaurantIds.length) return callback(null,"");
    
                        /** Get branch list **/
                        this.categoryListHtml(req,res,next,{restaurant_ids:restaurantIds,category_ids:categoryIds}).then(categoryResponse=>{
                            callback(null,categoryResponse?.category_list || "");
                        }).catch(next);
                    },
                    cuisine_ids : (callback)=>{
                        if(!isEditable || !restaurantIds.length) return callback(null,[]);
    
                        /** Get cuisine ids  */
                        const restaurant_branch_cuisines = this.db.collection(Tables.RESTAURANT_BRANCH_CUISINES);
                        restaurant_branch_cuisines.distinct("cuisine_id",{restaurant_id : {$in: restaurantIds}}).then(cuisineIds=>{
                            callback(null,cuisineIds);
                        }).catch(next);
                    },
                    item_list : (callback)=>{
                        if(!isEditable || !restaurantIds.length) return callback(null, onlyList ? [] : "");
    
                        /** Get branch list **/
                        this.itemListWithHtml(req,res,next,{
                            restaurant_ids:restaurantIds,
                            category_ids:categoryIds,
                            branch_ids: branchIds,
                            item_ids: itemIds,
                            only_list:onlyList
                        }).then(itemResponse=>{
                            callback(null,itemResponse?.item_list || "");
                        }).catch(next);
                    },
                    branch_list: (callback)=>{
                        if(!isEditable || !restaurantIds.length) return callback(null,"");
    
                        /** Get branch list **/
                        this.branchListWithHtml(req,res,next,{
                            restaurant_ids:restaurantIds,
                            branch_ids:branchIds
                        }).then(branchResponse=>{
                            callback(null,branchResponse?.branch_list || "");
                        }).catch(next);
                    },
                    offer_code :(callback)=>{
                        if(isEditable) return callback(null,null);
    
                        /**Get unique offer code **/
                        generateOfferCode(req,res, next,{}).then(offerResponse=> {
                            callback(null,offerResponse?.offer_code || "");
                        }).catch(next);
                    },
                    offer_item_list :(callback)=>{
                        if(!isEditable || offerType != Constants.COMBO_OFFER || itemOfferType !=Constants.ITEM_WISE_OFFER) return callback(null,null);
    
                        /** Get offer item list */
                        const offer_items = this.db.collection(Tables.OFFER_ITEMS);
                        offer_items.find({ offer_id: new ObjectId(offerId) },{projection:{item_id:1, price:1}}).toArray().then(itemRsult=>{
                            callback(null,itemRsult);
                        }).catch(next);
                    },
                    selected_user : (callback)=>{
                        if(userIds.length ==0) return callback(null,[]);
    
                        const users = this.db.collection(Tables.USERS);
                        users.find({_id: {$in: userIds}},{projection: {_id:1,full_name:1,mobile_number:1}}).sort({full_name: Constants.SORT_ASC}).toArray().then(result=>{
                            callback(null,result);
                        }).catch(next);
                    },
                },async (asyncErr,asyncResponse)=>{
                    if(asyncErr) return next(asyncErr);

                    let cuisineIdsResponse = asyncResponse.cuisine_ids || [];
                    let itemList    	   = asyncResponse.item_list || "";
                    let branchList		   = asyncResponse.branch_list || "";
                    let categoryList	   = asyncResponse.category_list || "";
                    let offerCode    	   = asyncResponse.offer_code || "";

                    /** Set dropdown options **/
                    let dropdownOptions = {
                        collections :[
                            {
                                collection : Tables.RESTAURANTS,
                                columns    :  ["_id",["name",Constants.DEFAULT_LANGUAGE_CODE]],
                                conditions : {
                                    status		: Constants.ACTIVE,
                                    is_deleted	: Constants.NOT_DELETED,
                                },
                                selected   : restaurantIds
                            },
                            {
                                collection : Tables.CORPORATE_TIE_UPS,
                                columns    :  ["_id",["corporate_name",Constants.DEFAULT_LANGUAGE_CODE]],
                                selected   : corporateIds
                            }
                        ],
                    };
                    /**Check for is editable */
                    if(isEditable){
                        dropdownOptions.collections.push({
                            collection : Tables.CUISINES,
                            columns    : ["_id",["name",Constants.DEFAULT_LANGUAGE_CODE]],
                            conditions : {
                                is_active  : Constants.ACTIVE,
                                _id 	   : {$in : cuisineIdsResponse}
                            },
                            selected   : cuisineIds
                        });
                    }

                    /**Get dropdown list **/
                    let dropDownResponse = await getDropdownList(req,res, next,dropdownOptions);

                    /** Send error response **/
                    if(dropDownResponse.status != Constants.STATUS_SUCCESS) return res.status(400).send(dropDownResponse);

                    /** render add/edit offer page **/
                    req.breadcrumbs(BREADCRUMBS['admin/offer_management/'+ (isEditable ? 'edit' : 'add')]);
                    res.render('add_edit', {
						layout			:	false,
						result			: 	offerData,
						is_editable		: 	isEditable,
						restaurant_list	:   dropDownResponse?.final_html_data?.[0] || "",
						corporate_list	: 	dropDownResponse?.final_html_data?.[1] || "",
						cuisine_list	: 	dropDownResponse?.final_html_data?.[2] || "",
						selected_user	: 	asyncResponse?.selected_user || [],
						offer_item_list	: 	asyncResponse?.offer_item_list || [],
						item_list		: 	itemList,
						offer_code		:   offerCode,
						branch_list		:   branchList,
						category_list	:   categoryList
                    });
                });
            }
        } catch (error) {
            next(error);
        }
    }

    /**
     * Function to update offer status
     *
     * @param req	As Request Data
     * @param res	As Response Data
     * @param next 	As Callback argument to the middleware function
     *
     * @return json
     */
    async updateOfferStatus(req, res, next) {
        try {
            let offerId = req.params.id;
            let status = req.params.status == Constants.ACTIVE ? Constants.DEACTIVE 	:Constants.ACTIVE;

            /** Update offer status **/
            await this.collectionDb.updateOne({
                _id: new ObjectId(offerId)
            }, {
                $set: {
                    is_active: parseInt(status),
                    modified: getUtcDate()
                }
            });

            /** save System logs */
            saveSystemLogs(req, res, {
                user_id: req.session.user._id,
                parent_id: new ObjectId(offerId),
                activity_module: Constants.SYSTEM_LOG_MODULE_OFFER_MANAGEMENT,
                activity_type: Constants.ACTIVITY_TYPE_STATUS_UPDATE,
                additional_details: {
                    status: status
                }
            });

            /** Send success response **/
			req.flash(Constants.STATUS_SUCCESS,res.__("admin.offer_management.offer_status_has_been_updated_successfully"));
			res.redirect(Constants.WEBSITE_ADMIN_URL+"offer_management");
        } catch (error) {
            next(error);
        }
    }

    /**
     * Function to get branch list
     *
     * @param req	As Request Data
     * @param res	As Response Data
     * @param next 	As Callback argument to the middleware function
     *
     * @return json
     */
    async branchList(req, res, next) {
        try {
            const response = await this.branchListWithHtml(req, res, next, req.body);
            res.send(response);
        } catch (error) {
            next(error);
        }
    }

    /**
     * Function for get branch list with html
     *
     * @param req 	As Request Data
     * @param res 	As Response Data
     * @param next 	As Callback argument to the middleware function
     * @param options As Options object
     *
     * @return Promise
     */
    async branchListWithHtml(req, res, next, options) {
        try {
            let restaurantIds = (options.restaurant_ids) ? options.restaurant_ids : [];
            let branchIds = (options.branch_ids) ? options.branch_ids : [];

            if(restaurantIds.length <= 0) {
                return {
                    status: Constants.STATUS_SUCCESS,
                    branch_list: ""
                };
            }

            // Convert string IDs to ObjectIds
            restaurantIds = restaurantIds.map(id => new ObjectId(id));

            // Get branch list
            const restaurantBranches = this.db.collection(Tables.RESTAURANT_BRANCHES);
            const branchList = await restaurantBranches.find({
                is_active: Constants.ACTIVE,
                restaurant_id: {$in: restaurantIds}
            }, {
                projection: {_id: 1, name: 1, restaurant_id: 1}
            }).sort({
                ["name." + Constants.DEFAULT_LANGUAGE_CODE]: Constants.SORT_ASC
            }).toArray();

            // Get restaurant list
            const restaurants = this.db.collection(Tables.RESTAURANTS);
            const restaurantList = await restaurants.find({
                _id: {$in: restaurantIds},
                status: Constants.ACTIVE,
                is_deleted: Constants.NOT_DELETED,
            }, {
                projection: {_id: 1, name: 1}
            }).toArray();

            if(!branchList || !restaurantList) {
                return {
                    status: Constants.STATUS_ERROR, 
                    message: res.__("admin.system.something_going_wrong_please_try_again")
                };
            }

            // Manage lists
            let branchListGrouped = {};
            branchList.forEach(record => {
                if(!branchListGrouped[record.restaurant_id]) {
                    branchListGrouped[record.restaurant_id] = [];
                }
                branchListGrouped[record.restaurant_id].push(record);
            });

            let restaurantListMap = {};
            restaurantList.forEach(record => {
                restaurantListMap[record._id] = record.name[Constants.DEFAULT_LANGUAGE_CODE];
            });

            let finalBranchList = "";

            Object.keys(restaurantListMap).forEach(restaurantId => {
                let restaurantName = restaurantListMap[restaurantId] || "";

                if(branchListGrouped[restaurantId]) {
                    finalBranchList += "<optgroup label='" + restaurantName + "'>";

                    branchListGrouped[restaurantId].forEach(record => {
                        let branchId = record._id;
                        let branchName = record.name[Constants.DEFAULT_LANGUAGE_CODE];
                        let selectedFlag = "";

                        if(branchIds.length > 0) {
                            branchIds.forEach(tempBranchId => {
                                if(String(tempBranchId) == branchId) {
                                    selectedFlag = "selected";
                                }
                            });
                        }
                        finalBranchList += '<option value="' + record._id + '" ' + selectedFlag + '>' + branchName + '</option>';
                    });

                    finalBranchList += "</optgroup>";
                }
            });

            return {
                status: Constants.STATUS_SUCCESS,
                branch_list: finalBranchList
            };
        } catch (error) {
            next(error);
        }
    }

    /**
     * Function to get category list
     *
     * @param req	As Request Data
     * @param res	As Response Data
     * @param next 	As Callback argument to the middleware function
     *
     * @return json
     */
    async categoryList(req, res, next) {
        try {
            const response = await this.categoryListHtml(req, res, next, req.body);
            res.send(response);
        } catch (error) {
            next(error);
        }
    }

    /**
     * Function for get category list with html
     *
     * @param req 	As Request Data
     * @param res 	As Response Data
     * @param next 	As Callback argument to the middleware function
     * @param options As Options object
     *
     * @return Promise
     */
    async categoryListHtml(req, res, next, options) {
        try {
            let restaurantIds = (options.restaurant_ids) ? options.restaurant_ids : [];
            let categoryIds = (options.category_ids) ? options.category_ids : [];

            if(restaurantIds.length <= 0) {
                return {
                    status: Constants.STATUS_SUCCESS,
                    category_list: ""
                };
            }

            // Convert string IDs to ObjectIds
            restaurantIds = restaurantIds.map(id => new ObjectId(id));

            // Get category list
            const restaurantCategories = this.db.collection(Tables.RESTAURANT_CATEGORIES);
            const categoryList = await restaurantCategories.find({
                is_active: Constants.ACTIVE,
                restaurant_id: {$in: restaurantIds}
            }, {
                projection: {_id: 1, name: 1, restaurant_id: 1}
            }).sort({
                ["name." + Constants.DEFAULT_LANGUAGE_CODE]: Constants.SORT_ASC
            }).toArray();

            // Get restaurant list
            const restaurants = this.db.collection(Tables.RESTAURANTS);
            const restaurantList = await restaurants.find({
                _id: {$in: restaurantIds},
                status: Constants.ACTIVE,
                is_deleted: Constants.NOT_DELETED,
            }, {
                projection: {_id: 1, name: 1}
            }).toArray();

            if(!categoryList || !restaurantList) {
                return {
                    status: Constants.STATUS_SUCCESS,
                    category_list: ""
                };
            }

            // Manage lists
            let categoryListGrouped = {};
            categoryList.forEach(record => {
                if(!categoryListGrouped[record.restaurant_id]) {
                    categoryListGrouped[record.restaurant_id] = [];
                }
                categoryListGrouped[record.restaurant_id].push(record);
            });

            let restaurantListMap = {};
            restaurantList.forEach(record => {
                restaurantListMap[record._id] = record.name[Constants.DEFAULT_LANGUAGE_CODE];
            });

            let finalCategoryList = "";

            Object.keys(restaurantListMap).forEach(restaurantId => {
                let restaurantName = restaurantListMap[restaurantId] || "";

                if(categoryListGrouped[restaurantId]) {
                    finalCategoryList += "<optgroup label='" + restaurantName + "'>";

                    categoryListGrouped[restaurantId].forEach(record => {
                        let categoryId = record._id;
                        let categoryName = record.name[Constants.DEFAULT_LANGUAGE_CODE];
                        let selectedFlag = "";

                        if(categoryIds.length > 0) {
                            categoryIds.forEach(tempCategoryId => {
                                if(String(tempCategoryId) == categoryId) {
                                    selectedFlag = "selected";
                                }
                            });
                        }
                        finalCategoryList += '<option value="' + record._id + '" ' + selectedFlag + '>' + categoryName + '</option>';
                    });

                    finalCategoryList += "</optgroup>";
                }
            });

            return {
                status: Constants.STATUS_SUCCESS,
                category_list: finalCategoryList
            };
        } catch (error) {
            next(error);
        }
    }

    /**
     * Function to get cuisine list
     *
     * @param req	As Request Data
     * @param res	As Response Data
     * @param next 	As Callback argument to the middleware function
     *
     * @return json
     */
    async cuisineList(req, res, next) {
        try {
            let restaurantIds = req.body.restaurant_ids;

            /** Send error response */
            if(!restaurantIds || restaurantIds.length <= 0) {
                return res.send({
                    status: Constants.STATUS_ERROR, 
                    message: res.__("admin.system.something_going_wrong_please_try_again")
                });
            }

            // Convert string IDs to ObjectIds
            restaurantIds = restaurantIds.map(id => new ObjectId(id));

            /** Get cuisine ids */
            const restaurantBranchCuisines = this.db.collection(Tables.RESTAURANT_BRANCH_CUISINES);
            const cuisineIds = await restaurantBranchCuisines.distinct("cuisine_id", {
                restaurant_id: {$in: restaurantIds}
            });

            /** Set options for cuisine list */
            let options = {
                collections: [
                    {
                        collection: Tables.CUISINES,
                        columns: ["_id", ["name", Constants.DEFAULT_LANGUAGE_CODE]],
                        conditions: {
                            is_active: Constants.ACTIVE,
                            _id: {$in: cuisineIds}
                        }
                    },
                ]
            };

            /** Get cuisine list */
            const dropDownResponse = await getDropdownList(req, res, next, options);
            
            if(dropDownResponse.status != Constants.STATUS_SUCCESS) {
                return res.send({
                    status: Constants.STATUS_ERROR, 
                    message: res.__("admin.system.something_going_wrong_please_try_again")
                });
            }

            res.send({
                status: Constants.STATUS_SUCCESS,
                cuisine_list: dropDownResponse?.final_html_data?.[0] || ""
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Function to get item list
     *
     * @param req	As Request Data
     * @param res	As Response Data
     * @param next 	As Callback argument to the middleware function
     *
     * @return json
     */
    async itemList(req, res, next) {
        try {
            const response = await this.itemListWithHtml(req, res, next, req.body);
            res.send(response);
        } catch (error) {
            next(error);
        }
    }

    /**
     * Function to get item list with html
     *
     * @param req 	As Request Data
     * @param res 	As Response Data
     * @param next 	As Callback argument to the middleware function
     * @param options As Options object
     *
     * @return Promise
     */
    async itemListWithHtml(req, res, next, options) {
        try {
            let restaurantIds = (options.restaurant_ids) ? options.restaurant_ids : [];
            let branchIds = (options.branch_ids) ? options.branch_ids : [];
            let categoryIds = (options.category_ids) ? options.category_ids : [];
            let itemIds = (options.item_ids) ? options.item_ids : [];
            let onlyList = (options.only_list) ? JSON.parse(options.only_list) : false;

            if(restaurantIds.length <= 0 || categoryIds.length <= 0) {
                return {
                    status: Constants.STATUS_SUCCESS,
                    item_list: ""
                };
            }

            // Convert string IDs to ObjectIds
            restaurantIds = restaurantIds.map(id => new ObjectId(id));
            branchIds = branchIds.map(id => new ObjectId(id));
            categoryIds = categoryIds.map(id => new ObjectId(id));

            // Set conditions for item linking
            let linkItemConditions = {
                $or: [
                    {
                        type: Constants.ITEM_NOT_LISTED_TO_SELECTED_BRANCH_LIST,
                        branch_ids: {$nin: branchIds}
                    },
                    {
                        type: Constants.ITEM_LISTED_TO_SELECTED_BRANCH_LIST,
                        $or: [
                            {branch_ids: {$size: 0}},
                            {branch_ids: {$in: branchIds}}
                        ]
                    }
                ]
            };

            // Get item ids from item_linkings
            const itemLinkings = this.db.collection(Tables.ITEM_LINKINGS);
            const linkedItemIds = await itemLinkings.distinct("item_id", linkItemConditions);

            // Get items
            const items = this.db.collection(Tables.ITEMS);
            const itemList = await items.find({
                is_active: Constants.ACTIVE,
                _id: {$in: linkedItemIds},
                $or: [
                    {category_ids: {$size: 0}},
                    {category_ids: {$in: categoryIds}}
                ]
            }, {
                projection: {restaurant_id: 1, name: 1, item_price: 1}
            }).toArray();

            // Get restaurant list
            const restaurants = this.db.collection(Tables.RESTAURANTS);
            const restaurantList = await restaurants.find({
                _id: {$in: restaurantIds},
                status: Constants.ACTIVE,
                is_deleted: Constants.NOT_DELETED,
            }, {
                projection: {_id: 1, name: 1}
            }).toArray();

            // Manage lists
            let itemsListGrouped = {};
            itemList.forEach(record => {
                if(!itemsListGrouped[record.restaurant_id]) {
                    itemsListGrouped[record.restaurant_id] = [];
                }
                itemsListGrouped[record.restaurant_id].push(record);
            });

            let restaurantListMap = {};
            restaurantList.forEach(record => {
                restaurantListMap[record._id] = record.name[Constants.DEFAULT_LANGUAGE_CODE];
            });

            let finalItemList = "";

            if(onlyList) {
                finalItemList = [];

                Object.keys(restaurantListMap).forEach(restaurantId => {
                    if(itemsListGrouped && itemsListGrouped[restaurantId]) {
                        finalItemList.push({
                            restaurant_id: restaurantId,
                            restaurant_name: restaurantListMap[restaurantId],
                            item_list: itemsListGrouped[restaurantId],
                        });
                    }
                });
            } else {
                Object.keys(restaurantListMap).forEach(restaurantId => {
                    let restaurantName = restaurantListMap[restaurantId] || "";

                    if(itemsListGrouped && itemsListGrouped[restaurantId]) {
                        finalItemList += "<optgroup label='" + restaurantName + "'>";

                        itemsListGrouped[restaurantId].forEach(record => {
                            let itemId = record._id;
                            let itemName = record.name[Constants.DEFAULT_LANGUAGE_CODE];
                            let selectedFlag = "";

                            if(itemIds.length > 0) {
                                itemIds.forEach(tempItemId => {
                                    if(String(tempItemId) == itemId) {
                                        selectedFlag = "selected";
                                    }
                                });
                            }

                            finalItemList += '<option value="' + record._id + '" ' + selectedFlag + '>' + itemName + '</option>';
                        });

                        finalItemList += "</optgroup>";
                    }
                });
            }

            return {
                status: Constants.STATUS_SUCCESS,
                item_list: finalItemList
            };
        } catch (error) {
            next(error);
        }
    }

    /**
     * Function to get restaurant list
     *
     * @param req	As Request Data
     * @param res	As Response Data
     * @param next 	As Callback argument to the middleware function
     *
     * @return json
     */
    async restaurantList(req, res, next) {
        try {
            let restaurantType = req.body.restaurant_type;

            /** Send error response */
            if(!restaurantType) {
                return res.send({
                    status: Constants.STATUS_ERROR, 
                    message: res.__("admin.system.something_going_wrong_please_try_again")
                });
            }

            /** Set conditions */
            let conditions = {};
            if(restaurantType == Constants.REDEEMED_FOR_ALL_RESTAURANTS_DELIVERED_BY_CRAVEZ) {
                conditions = {
                    delivery_by: {$in: [Constants.DELIVERY_BY_CRAVEZ]}
                };
            } else if(restaurantType == Constants.REDEEMED_FOR_ALL_RESTAURANTS_DELIVERED_BY_RESTAURANT) {
                conditions = {
                    delivery_by: {$in: [Constants.DELIVERY_BY_RESTAURANT]}
                };
            }

            /** Get restaurant ids */
            const restaurantDetails = this.db.collection(Tables.RESTAURANT_DETAILS);
            const restaurantIds = await restaurantDetails.distinct("restaurant_id", conditions);

            /** Set options for restaurant list */
            let options = {
                collections: [
                    {
                        collection: Tables.RESTAURANTS,
                        columns: ["_id", ["name", Constants.DEFAULT_LANGUAGE_CODE]],
                        conditions: {
                            status: Constants.ACTIVE,
                            is_deleted: Constants.NOT_DELETED,
                            _id: {$in: restaurantIds}
                        }
                    },
                ]
            };

            /** Get restaurant list */
            const dropDownResponse = await getDropdownList(req, res, next, options);
            
            if(dropDownResponse.status != Constants.STATUS_SUCCESS) {
                return res.send({
                    status: Constants.STATUS_ERROR, 
                    message: res.__("admin.system.something_going_wrong_please_try_again")
                });
            }

            res.send({
                status: Constants.STATUS_SUCCESS,
                restaurant_list: dropDownResponse.final_html_data["0"]
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Function to get users list
     *
     * @param req	As Request Data
     * @param res	As Response Data
     * @param next 	As Callback argument to the middleware function
     *
     * @return json
     */
    async getUsersList(req, res, next) {
        try {
            let limit = (req.body.length) ? parseInt(req.body.length) : 10;
            let page = (req.body.page) ? parseInt(req.body.page) : 1;
            let name = (req.body.q) ? req.body.q : "";
            let userIds = (req.body.user_ids) ? req.body.user_ids.split(",").map(id => new ObjectId(id)) : [];
            let skip = (limit * page) - limit;

            /** Set conditions */
            let conditions = {...Constants.CUSTOMER_COMMON_CONDITIONS};
            conditions._id = {$nin: userIds};
            if (name) conditions['full_name'] = {$regex: name, $options: 'i'};

            const users = this.db.collection(Tables.USERS);

            // Get user records
            const records = await users.find(conditions, {
                projection: {_id: 1, full_name: 1, mobile_number: 1}
            }).collation(Constants.COLLATION_VALUE).sort({
                full_name: Constants.SORT_ASC
            }).limit(limit).skip(skip).toArray();

            let userList = [];
            if(records && records.length > 0) {
                userList = records.map(record => ({
                    id: record._id,
                    text: record.full_name + ((record.mobile_number) ? "(" + record.mobile_number + ")" : "")
                }));
            }

            // Get selected users (only for first page)
            let selectedList = [];
            if(userIds.length > 0 && page == 1) {
                let selectedConditions = {
                    _id: {$in: userIds},
                    is_deleted: Constants.NOT_DELETED,
                };

                if (name) selectedConditions['full_name'] = {$regex: name, $options: 'i'};

                const selectedUsers = await users.find(selectedConditions, {
                    projection: {_id: 1, full_name: 1, mobile_number: 1}
                }).collation(Constants.COLLATION_VALUE).sort({
                    full_name: Constants.SORT_ASC
                }).toArray();

                if(selectedUsers && selectedUsers.length > 0) {
                    selectedList = selectedUsers.map(record => ({
                        id: record._id,
                        text: record.full_name + ((record.mobile_number) ? "(" + record.mobile_number + ")" : "")
                    }));
                }
            }

            // Get total count
            const totalCount = await users.countDocuments(conditions);

            let finalList = selectedList.concat(userList);

            res.send({
                result: finalList,
                selected_user: selectedList,
                total_count: totalCount
            });
        } catch (error) {
            next(error);
        }
    }
}

export default OfferManagement; 