const asyncParallel =	require('async/parallel');
const clone			=	require('clone');
const asyncEach 	= 	require("async/each");
const asyncSeries 	= 	require("async/series");
const eachOfSeries 	= 	require("async/eachOfSeries");
const asyncForEachOf= 	require("async/forEachOf");

function Migration() {


    const Migration 	=	this;
    const PIZZA_HUT 	= 	"pizza-hut";
    const BURGER_KING	= 	"burger-king";
    const BURGER_KING_MENU_ID	=	3;
    const PIZZA_HUT_MENU_ID		= 	4;

    const UPSELL_TYPE_OBJECT = {};
    UPSELL_TYPE_OBJECT[0] = {en :"Go Regular", ar : "الذهاب العادية"};
    UPSELL_TYPE_OBJECT[1] = {en :"Go Mega", ar : "الذهاب ميجا"};
    UPSELL_TYPE_OBJECT[2] = {en :"Go King", ar : 'الذهاب الملك'};

	/**
	 * Function to migrate cities in our database
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 *
	 * @return render
	 */
	this.migrateCities = (req, res, next, db2)=>{
		return;
		asyncParallel({
			city_in_system : (cityCallback)=>{
				const cities = db.collection("cities");
				cities.find({}).toArray((err,result)=>{
					if(err) return callback(err,null);
					let cityData = {};
					result.map(cityRecords=> cityData[cityRecords.cravez_city_id] = cityRecords);
					callback(null,cityData);
				});
			},
			area_in_system : (areaCallback)=>{
				const areas = db.collection("areas");
				areas.find({}).toArray((err,result)=>{
					if(err) return callback(err,null);
					let areaData = {};
					result.map(areaRecords=> areaData[areaRecords.cravez_area_id] = areaRecords);
					callback(null,areaData);
				});
			},
			block_in_system : (blockCallback)=>{
				const area_blocks = db.collection("area_blocks");
				area_blocks.find({}).toArray((err,result)=>{
					if(err) return callback(err,null);
					let areaBlockData = {};
					result.map(areaBlockRecords=> areaBlockData[areaBlockRecords.kfg_block_id] = areaBlockRecords);
					callback(null,areaBlockData);
				});
			},
			db2_blocks: (db2BlocksCallback)=>{
				const db2_blocks = db2.collection("blocks");
				db2_blocks.find({}).toArray((err,result)=>{
					callback(err,result);
				});
			},
		},(systemAsyncErr, systemParellelResult)=>{
			if(systemAsyncErr) return console.error(systemAsyncErr);

			let systemBlocks 	= systemParellelResult.block_in_system;
			let systemAreas 	= systemParellelResult.area_in_system;
			let systemCities 	= systemParellelResult.city_in_system;

			let blockArray 	= {};
			let areaArray 	= {};
			let cityArray 	= {};
			asyncEach(systemParellelResult.db2_blocks,(records,callback)=>{
				asyncParallel({
					city : (parellelCallback)=>{
						if(cityArray[records.city_id]) return parellelCallback(null);

						asyncParallel({
							city_unique_number: (cityUniqueCallback)=>{
								if(systemCities[records.city_id]) return cityUniqueCallback(null,systemCities[records.city_id].city_id);

								/** get area unqiue id **/
								getUniqueId(req,res,next,{type:"cities"}).then(uniqueIdResponse=>{
									cityUniqueCallback(null,uniqueIdResponse);
								});
							}
						},(cityAsyncEachErr, cityAsyncParellel)=>{
							if(cityAsyncEachErr) return parellelCallback(cityAsyncEachErr);

							let cityData = {
                                "city_id" 		: cityAsyncParellel.city_unique_number,
                                "country_id" 	: COUNTRY_ID,
                                "created" 		: getUtcDate(),
                                "modified" 		: getUtcDate(),
                                "name" : {
                                    "ar" : records.city_name_arabic,
                                    "en" : records.city_name,
                                },
                                "cravez_city_id": records.city_id,
                                "kfg" : true
							};

							cityArray[records.city_id] = cityData;
							parellelCallback(null);

						});
					},
					area : (parellelCallback)=>{
						if(areaArray[records.area_id]) return parellelCallback(null);

						// asyncParallel({
						// 	city_unique_number: (cityUniqueCallback)=>{
						// 		if(systemCities[records.city_id]) return cityUniqueCallback(null,systemCities[records.city_id].city_id);

						// 		/** get area unqiue id **/
						// 		getUniqueId(req,res,next,{type:"cities"}).then(uniqueIdResponse=>{
						// 			cityUniqueCallback(null,uniqueIdResponse);
						// 		});
						// 	}
						// },(cityAsyncEachErr, cityAsyncParellel)=>{
						// 	if(cityAsyncEachErr) return parellelCallback(cityAsyncEachErr);

						// 	let cityData = {
                        //         "city_id" 		: cityAsyncParellel.city_unique_number,
                        //         "country_id" 	: COUNTRY_ID,
                        //         "created" 		: getUtcDate(),
                        //         "modified" 		: getUtcDate(),
                        //         "name" : {
                        //             "ar" : records.city_name_arabic,
                        //             "en" : records.city_name,
                        //         },
                        //         "cravez_city_id": records.city_id,
                        //         "kfg" : true
						// 	};

						// 	cityArray[records.city_id] = cityData;
						// 	parellelCallback(null);

						// });

						/** get area unqiue id **/
						getUniqueId(req,res,next,{type:"areas"}).then(uniqueIdResponse=>{
							let areaData = {
								"area_id" 	: uniqueIdResponse.result,
								"city_id" 	: "",
								"created" 	: getUtcDate(),
								"is_active" : ACTIVE,
								"modified" 	: getUtcDate(),
								"name" : {
									"ar" : records.area_name_arabic,
									"en" : records.area_name
								},
                                "cravez_area_id": records.area_id,
                                "cravez_city_id": records.city_id,
                                "kfg" : true
							};

							areaArray[records.area_id] = areaData;
							parellelCallback(null);
						}).catch(next);
					},
					block :(parellelCallback)=>{
						/** get block unqiue id **/
						getUniqueId(req,res,next,{type:"area_blocks"}).then(uniqueIdResponse=>{
							let kfgAreaId = records.kfg_area_id ? records.kfg_area_id : 0;

							let blockData = {
								"area_id" 	: "",
								"block_id" 	: uniqueIdResponse.result,
								"city_id" 	: "",
								"created" 	: getUtcDate(),
								"is_active" : 1,
								"modified" 	: getUtcDate(),
								"name" : {
									"ar" : records.block_name_arabic,
									"en" : records.block_name
								},
								"kfg_block_id": kfgAreaId,
                                "cravez_block_id": records.block_id,
                                "cravez_area_id": records.area_id,
                                "cravez_city_id": records.city_id,
                                "kfg" : true
							};

							if(blockArray[kfgAreaId]){
								if(blockArray[kfgAreaId].constructor != Array ){
									let tempBlockData = blockArray[kfgAreaId];
									blockArray[kfgAreaId] = [tempBlockData];
									blockArray[kfgAreaId].push(blockData);
								}else{
									blockArray[kfgAreaId].push(blockData);
								}
							}else{
								blockArray[kfgAreaId] = blockData;
							}

							parellelCallback(null);
						}).catch(next);
					}
				},(parallelErr)=>{
					callback(parallelErr);
				});
			},(asyncEachErr)=>{

				const cities 	  = db.collection("cities");
				const areas 	  = db.collection("areas");
				const area_blocks = db.collection("area_blocks");

                // const cities 	    = db2.collection("cravez_cities");
				// const areas 	        = db2.collection("cravez_areas");
				// const area_blocks    = db2.collection("cravez_area_blocks");

				asyncSeries({
					city: (citySeriesCallback)=>{
						asyncEach(cityArray,(cityRecords,cityCallback)=>{
							let cityData = clone(cityRecords);

							let cityCondition = {
								cravez_city_id: cityData.cravez_city_id
							};
							delete cityData.cravez_city_id;

							cities.updateOne(cityCondition,{
								$set: cityData
							},{
								upsert: true
							},(upddateErr,updateResult)=>{
								if(insertErr) return cityCallback(insertErr);
								cityArray[cityRecords.cravez_city_id]._id = insertResult.insertedId;
								cityCallback();
							});
						},(areaAsyncEachErr)=>{
							citySeriesCallback(areaAsyncEachErr);
						});
					},
					areas: (areaSeriesCallback)=>{
						asyncEach(areaArray,(areaRecords,areaCallback)=>{
                            let areaData = clone(areaRecords);
                            areaData.city_id = (cityArray[areaData.cravez_city_id]) ? cityArray[areaData.cravez_city_id]._id : "";
							areas.insertOne(areaData,(insertErr,insertResult)=>{
                                if(insertErr) return areaCallback(insertErr);
								areaArray[areaRecords.cravez_area_id]._id       = insertResult.insertedId;
								areaArray[areaRecords.cravez_area_id].city_id   = areaData.city_id;
								areaCallback();
							});
						},(areaAsyncEachErr)=>{
							areaSeriesCallback(areaAsyncEachErr);
						});
					},
					blocks: (blockSeriesCallback)=>{
						asyncEach(blockArray,(blockRecords,blockCallback)=>{

							if(blockRecords.constructor != Array ){
								let blockData = clone(blockRecords);
								blockData.area_id = (areaArray[blockData.cravez_area_id]) ? areaArray[blockData.cravez_area_id]._id : "";
								blockData.city_id = (areaArray[blockData.cravez_area_id]) ? areaArray[blockData.cravez_area_id].city_id : "";

								area_blocks.insertOne(blockData,(insertErr,insertResult)=>{
									if(insertErr) return blockCallback(insertErr);
									blockCallback();
								});
							}else{
								let newBlockRecords = [];

								blockRecords.map((blockRecord)=>{
									let blockData = clone(blockRecord);
									blockData.area_id = (areaArray[blockData.cravez_area_id]) ? areaArray[blockData.cravez_area_id]._id : "";
									blockData.city_id = (areaArray[blockData.cravez_area_id]) ? areaArray[blockData.cravez_area_id].city_id : "";
									newBlockRecords.push(blockData);
								});

								area_blocks.insertMany(newBlockRecords,(insertErr,insertResult)=>{
									if(insertErr) return blockCallback(insertErr);
									blockCallback();
								});
							}
						},(areaAsyncEachErr)=>{
							blockSeriesCallback(areaAsyncEachErr);
						});
					}
				}, (asyncSeriesErr)=>{
					console.log("Inserted Successfully.");
				});
			});
		});
		res.render('blank',{layout:false});
    };

	/**
	 * Function to migrate branches
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 *
	 * @return render
	 */
	this.migrateBranches = (req, res, next, db2)=>{
        const restaurant_branches                   = db.collection("restaurant_branches");
        const restaurant_branch_attributes          = db.collection("restaurant_branch_attributes");
        const restaurant_branch_phone_numbers       = db.collection("restaurant_branch_phone_numbers");
        const restaurant_branch_payment_methods     = db.collection("restaurant_branch_payment_methods");
        const restaurant_branch_calendars           = db.collection("restaurant_branch_calendars");
        const restaurants                           = db.collection("restaurants");
        const area_blocks                           = db.collection("area_blocks");
        const users                                 = db.collection("users");
        asyncParallel({
            store: (storeCallback)=>{
                const kfg_stores = db2.collection("kfg_stores");
                kfg_stores.find({}).toArray((err,result)=>{
                    storeCallback(err,result);
                });
            },
            branches: (branchesCallback)=>{
                restaurant_branches.find({kfg: true}).toArray((err,result)=>{
                    let restaurantBranches = {};
                    result.map(branchRecords=> restaurantBranches[branchRecords.kfg_store_id] = branchRecords);
                    branchesCallback(err,restaurantBranches);
                });
            },
            super_admin_details: (superAdminDetails)=>{
                users.findOne({
                    user_role_id : CRAVEZ
                },{projection:{full_name:1,_id:1}},(superAdminErr, superAdminResult)=>{
                    superAdminDetails(superAdminErr, superAdminResult);
                });
            },
            concept_ids: (conceptDetails)=>{
                restaurants.find({
                        concept_id : {
                            $exists: true
                        }
                    },{projection:{_id: 1,concept_id: 1,slug: 1}}
                ).toArray((conceptErr, conceptResult)=>{
                    if(conceptErr) return conceptDetails(conceptErr);
                    let conceptData = {};
                    conceptResult.map(conceptRecords=> conceptData[conceptRecords.concept_id] = conceptRecords);
                    conceptDetails(conceptErr,conceptData);
                });
            },
            blocks: (areaBlockDetails)=>{
                area_blocks.find({
                        kfg: true
                    },{projection:{kfg_block_id: 1,city_id: 1, area_id: 1}}
                ).toArray((areaBlockErr, areaBlockResult)=>{
                    if(areaBlockErr) return areaBlockDetails(areaBlockErr);
                    let kfgAreaBlockData = {};
                    areaBlockResult.map(areaBlockRecords=> kfgAreaBlockData[areaBlockRecords.kfg_block_id] = areaBlockRecords);
                    areaBlockDetails(areaBlockErr,kfgAreaBlockData);
                });
            }
        },(parallelErr,asyncReponse)=>{
            if(parallelErr) return console.error(parallelErr);
            let conceptIds   = asyncReponse.concept_ids;
            let areaBlocks   = asyncReponse.blocks;
            let branchesData = asyncReponse.branches;
            asyncEach(asyncReponse.store,(records,callback)=>{

                if(!areaBlocks[records.store_area_id]){
                    callback(null);
                    return console.error(records.store_area_id+" block not found in area_blocks table");
                }
                if(!conceptIds[records.store_concept_id]){
                    callback(null);
                    return console.error(records.store_concept_id+" concept id not found in restaurants table");
                }
				let restaurantBranchData = {
					"added_by"          : asyncReponse.super_admin_details._id,
					"address"           : records.store_address,
					"area_id"           : areaBlocks[records.store_area_id].area_id,
					"block"             : areaBlocks[records.store_area_id]._id,
					"city_id"           : areaBlocks[records.store_area_id].city_id,
					"branch_number"     : records.store_number,
					"build_no"          : "",
					"description"       : "",
					"modified"          : getUtcDate(records.last_update_date),
					"name" : {
						"en" : records.store_name,
						"ar" : records.store_name_arabic
					},
					"restaurant_id"         : conceptIds[records.store_concept_id]._id,
					"restaurant_slug"       : conceptIds[records.store_concept_id].slug,
					"street"                : "", //"store_street_id"
					"is_active"             : parseInt(records.store_status),
					"is_open"               : OPEN,
					"longitude"             : records.longitude ? parseFloat(records.longitude) : "",
					"latitude"              : records.latitude ? parseFloat(records.latitude) : "",
					"long_lat"				: [
						records.longitude ? parseFloat(records.longitude) : "",
						records.latitude ? parseFloat(records.latitude) : "",
					],
					"kfg_store_concept_id"  : records.store_concept_id,
					"kfg_store_city_id"     : records.store_city_id,
					"kfg_store_street_id"   : records.store_street_id,
					"kfg_store_area_id"     : records.store_area_id,
				};

                restaurant_branches.updateOne(
                    {
                        "kfg_store_id" : records.store_id
                    },
                    {
                        $set: {
                            "added_by"          : asyncReponse.super_admin_details._id,
                            "address"           : records.store_address,
                            "area_id"           : areaBlocks[records.store_area_id].area_id,
                            "block"             : areaBlocks[records.store_area_id]._id,
                            "city_id"           : areaBlocks[records.store_area_id].city_id,
                            "branch_number"     : records.store_number,
                            "build_no"          : "",
                            "description"       : "",
                            "modified"          : getUtcDate(records.last_update_date),
                            "name" : {
                                "en" : records.store_name,
                                "ar" : records.store_name_arabic
                            },
                            "restaurant_id"         : conceptIds[records.store_concept_id]._id,
                            "restaurant_slug"       : conceptIds[records.store_concept_id].slug,
                            "street"                : "", //"store_street_id"
                            "is_active"             : parseInt(records.store_status),
                            "is_open"               : OPEN,
                            "longitude"             : records.longitude ? parseFloat(records.longitude) : "",
							"latitude"              : records.latitude ? parseFloat(records.latitude) : "",

                            "kfg_store_concept_id"  : records.store_concept_id,
                            "kfg_store_city_id"     : records.store_city_id,
                            "kfg_store_street_id"   : records.store_street_id,
                            "kfg_store_area_id"     : records.store_area_id,
                        },
                        $setOnInsert: {
                            "created"   : getUtcDate(records.record_date),
                            "kfg" : true,
                        }
                    },{
                        upsert: true
                    },(insertErr,insertResult)=>{
                        let branchId = (insertResult.upsertedId && insertResult.upsertedId._id) ? insertResult.upsertedId._id : "";

                        if(!branchId) branchId = (branchesData[records.store_id]) ? branchesData[records.store_id]._id : "";

                        if(!branchId) {
                            callback();
                            return console.error(branchId+" Not found in branches");
                        }

                        asyncParallel({
                            insert_branch_attributes: (branchAttributeDetails)=>{
                                let basicCreateConditions = {
                                    "branch_id"         : branchId,
                                    "restaurant_id"     : conceptIds[records.store_concept_id]._id,
                                };

                                let basicSettingDetails = {
                                    "value"     : "",
                                    "modified"  : getUtcDate(records.last_update_date),
                                };

                                let basicDetailOnCreate = {
                                    "channel_id": "merchant_portal",
                                    "added_by"  : asyncReponse.super_admin_details._id,
                                    "created"   : getUtcDate(records.created),
                                    "kfg" : true,
                                };

                                asyncParallel([
                                    (branchAttributeCallback)=>{
                                        /** Restaurant landing images  */
                                        let cloneBasicSettings      = clone(basicSettingDetails);
                                        let cloneBasicConditions    = clone(basicCreateConditions);

                                        cloneBasicSettings.value            = 1;
                                        cloneBasicConditions.attribute_id    = 21;

                                        restaurant_branch_attributes.updateOne(
                                            cloneBasicConditions,
                                            {
                                                $set: cloneBasicSettings,
                                                $setOnInsert: basicDetailOnCreate
                                            },{
                                                upsert: true
                                            },(insertErr)=>{
                                                branchAttributeCallback(insertErr);
                                            }
                                        );
                                    },
                                    (branchAttributeCallback)=>{
                                        /** Discount by percentage */
                                        let cloneBasicSettings      = clone(basicSettingDetails);
                                        let cloneBasicConditions    = clone(basicCreateConditions);

                                        cloneBasicSettings.value            = "";
                                        cloneBasicConditions.attribute_id    = 13;

                                        restaurant_branch_attributes.updateOne(
                                            cloneBasicConditions,
                                            {
                                                $set: cloneBasicSettings,
                                                $setOnInsert: basicDetailOnCreate
                                            },{
                                                upsert: true
                                            },(insertErr)=>{
                                                branchAttributeCallback(insertErr);
                                            }
                                        );
                                    },
                                    (branchAttributeCallback)=>{
                                        /** Discount by value */
                                        let cloneBasicSettings      = clone(basicSettingDetails);
                                        let cloneBasicConditions    = clone(basicCreateConditions);

                                        cloneBasicSettings.value            = "";
                                        cloneBasicConditions.attribute_id    = 20;

                                        restaurant_branch_attributes.updateOne(
                                            cloneBasicConditions,
                                            {
                                                $set: cloneBasicSettings,
                                                $setOnInsert: basicDetailOnCreate
                                            },{
                                                upsert: true
                                            },(insertErr)=>{
                                                branchAttributeCallback(insertErr);
                                            }
                                        );
                                    },
                                    (branchAttributeCallback)=>{
                                        /** Extra charge by value */
                                        let cloneBasicSettings      = clone(basicSettingDetails);
                                        let cloneBasicConditions    = clone(basicCreateConditions);

                                        cloneBasicSettings.value            = "";
                                        cloneBasicConditions.attribute_id    = 18;

                                        restaurant_branch_attributes.updateOne(
                                            cloneBasicConditions,
                                            {
                                                $set: cloneBasicSettings,
                                                $setOnInsert: basicDetailOnCreate
                                            },{
                                                upsert: true
                                            },(insertErr)=>{
                                                branchAttributeCallback(insertErr);
                                            }
                                        );
                                    },
                                    (branchAttributeCallback)=>{
                                        /** Additional tax */
                                        let cloneBasicSettings      = clone(basicSettingDetails);
                                        let cloneBasicConditions    = clone(basicCreateConditions);

                                        cloneBasicSettings.value            = "";
                                        cloneBasicConditions.attribute_id    = 19;

                                        restaurant_branch_attributes.updateOne(
                                            cloneBasicConditions,
                                            {
                                                $set: cloneBasicSettings,
                                                $setOnInsert: basicDetailOnCreate
                                            },{
                                                upsert: true
                                            },(insertErr)=>{
                                                branchAttributeCallback(insertErr);
                                            }
                                        );
                                    },
                                    (branchAttributeCallback)=>{
                                        /** Slogan in arabic */
                                        let cloneBasicSettings      = clone(basicSettingDetails);
                                        let cloneBasicConditions    = clone(basicCreateConditions);

                                        cloneBasicSettings.value            = "";
                                        cloneBasicConditions.attribute_id    = 11;

                                        restaurant_branch_attributes.updateOne(
                                            cloneBasicConditions,
                                            {
                                                $set: cloneBasicSettings,
                                                $setOnInsert: basicDetailOnCreate
                                            },{
                                                upsert: true
                                            },(insertErr)=>{
                                                branchAttributeCallback(insertErr);
                                            }
                                        );
                                    },
                                    (branchAttributeCallback)=>{
                                        /** Slogan in english */
                                        let cloneBasicSettings      = clone(basicSettingDetails);
                                        let cloneBasicConditions    = clone(basicCreateConditions);

                                        cloneBasicSettings.value            = "";
                                        cloneBasicConditions.attribute_id    = 10;

                                        restaurant_branch_attributes.updateOne(
                                            cloneBasicConditions,
                                            {
                                                $set: cloneBasicSettings,
                                                $setOnInsert: basicDetailOnCreate
                                            },{
                                                upsert: true
                                            },(insertErr)=>{
                                                branchAttributeCallback(insertErr);
                                            }
                                        );
                                    },
                                    (branchAttributeCallback)=>{
                                        /** Branch arabic description */
                                        let cloneBasicSettings      = clone(basicSettingDetails);
                                        let cloneBasicConditions    = clone(basicCreateConditions);

                                        cloneBasicSettings.value            = "";
                                        cloneBasicConditions.attribute_id    = 16;

                                        restaurant_branch_attributes.updateOne(
                                            cloneBasicConditions,
                                            {
                                                $set: cloneBasicSettings,
                                                $setOnInsert: basicDetailOnCreate
                                            },{
                                                upsert: true
                                            },(insertErr)=>{
                                                branchAttributeCallback(insertErr);
                                            }
                                        );
                                    },
                                    (branchAttributeCallback)=>{
                                        /** Branch english description */
                                        let cloneBasicSettings      = clone(basicSettingDetails);
                                        let cloneBasicConditions    = clone(basicCreateConditions);

                                        cloneBasicSettings.value            = "";
                                        cloneBasicConditions.attribute_id    = 14;

                                        restaurant_branch_attributes.updateOne(
                                            cloneBasicConditions,
                                            {
                                                $set: cloneBasicSettings,
                                                $setOnInsert: basicDetailOnCreate
                                            },{
                                                upsert: true
                                            },(insertErr)=>{
                                                branchAttributeCallback(insertErr);
                                            }
                                        );
                                    },
                                    (branchAttributeCallback)=>{
                                        /** Branch arabic name */
                                        let cloneBasicSettings      = clone(basicSettingDetails);
                                        let cloneBasicConditions    = clone(basicCreateConditions);

                                        cloneBasicSettings.value            = records.store_name_arabic;
                                        cloneBasicConditions.attribute_id    = 17;

                                        restaurant_branch_attributes.updateOne(
                                            cloneBasicConditions,
                                            {
                                                $set: cloneBasicSettings,
                                                $setOnInsert: basicDetailOnCreate
                                            },{
                                                upsert: true
                                            },(insertErr)=>{
                                                branchAttributeCallback(insertErr);
                                            }
                                        );
                                    },
                                    (branchAttributeCallback)=>{
                                        /** Branch English name */
                                        let cloneBasicSettings      = clone(basicSettingDetails);
                                        let cloneBasicConditions    = clone(basicCreateConditions);

                                        cloneBasicSettings.value            = records.store_name;
                                        cloneBasicConditions.attribute_id    = 15;

                                        restaurant_branch_attributes.updateOne(
                                            cloneBasicConditions,
                                            {
                                                $set: cloneBasicSettings,
                                                $setOnInsert: basicDetailOnCreate
                                            },{
                                                upsert: true
                                            },(insertErr)=>{
                                                branchAttributeCallback(insertErr);
                                            }
                                        );
                                    },
                                ],(attributeAsyncErr)=>{
                                    branchAttributeDetails(attributeAsyncErr);
                                });
                            },
                            insert_branch_phone: (branchPhoneDetails)=>{
                                let basicCreateConditions = {
                                    "branch_id"         : branchId,
                                    "restaurant_id"     : conceptIds[records.store_concept_id]._id,
                                };

                                let basicSettingDetails = {
                                    "value"         : "",
                                    "country_code"  : DEFAULT_COUNTRY_CODE,
                                    "modified"      : getUtcDate(records.last_update_date),
                                };

                                let basicDetailOnCreate = {
                                    "channel_id": "merchant_portal",
                                    "added_by"  : asyncReponse.super_admin_details._id,
                                    "created"   : getUtcDate(records.record_date),
                                    "kfg" : true,
                                };

                                asyncParallel([
                                    (branchPhoneCallback)=>{
                                        if(!records.store_phone1) return branchPhoneCallback(null);

                                        /** Phone number 1 */
                                        let cloneBasicSettings      = clone(basicSettingDetails);
                                        let cloneBasicConditions    = clone(basicCreateConditions);

                                        cloneBasicSettings.value            = records.store_phone1;
                                        cloneBasicConditions.attribute_id    = 1;

                                        restaurant_branch_phone_numbers.updateOne(
                                            cloneBasicConditions,
                                            {
                                                $set: cloneBasicSettings,
                                                $setOnInsert: basicDetailOnCreate
                                            },{
                                                upsert: true
                                            },(insertErr)=>{
                                                branchPhoneCallback(insertErr);
                                            }
                                        );
                                    },
                                    (branchPhoneCallback)=>{
                                        if(!records.store_phone2) return branchPhoneCallback(null);

                                        /** Phone number 2 */
                                        let cloneBasicSettings      = clone(basicSettingDetails);
                                        let cloneBasicConditions    = clone(basicCreateConditions);

                                        cloneBasicSettings.value            = records.store_phone2;
                                        cloneBasicConditions.attribute_id    = 2;

                                        restaurant_branch_phone_numbers.updateOne(
                                            cloneBasicConditions,
                                            {
                                                $set: cloneBasicSettings,
                                                $setOnInsert: basicDetailOnCreate
                                            },{
                                                upsert: true
                                            },(insertErr)=>{
                                                branchPhoneCallback(insertErr);
                                            }
                                        );
                                    }
                                ],(attributeAsyncErr)=>{
                                    branchPhoneDetails(attributeAsyncErr);
                                });
                            },
                            insert_calendar: (branchCalendar)=>{
                                restaurant_branch_calendars.updateOne(
                                    {
                                        "branch_id"     : branchId,
                                        "restaurant_id" : conceptIds[records.store_concept_id]._id,
                                    },
                                    {
                                        $set: {
                                            "status"        : OPEN,
                                            "type"          : DEFAULT_WEEK,
                                            "parent_id"     : "",
                                            "from_hour"     : 0,
                                            "from_minute"   : 0,
                                            "is_exception"  : false,
                                            "to_hour"       : 23,
                                            "to_minute"     : 59,
                                        },
                                        $setOnInsert: {
                                            "channel_id": "merchant_portal",
                                            "added_by"  : asyncReponse.super_admin_details._id,
                                            "created"   : getUtcDate(records.record_date),
                                            "kfg" : true,
                                        }
                                    },{
                                        upsert: true
                                    },(insertErr)=>{
                                        branchCalendar(insertErr);
                                    }
                                );
                            },
                            payment_methods: (paymentMethods)=>{
                                restaurant_branch_payment_methods.updateOne(
                                    {
                                        "branch_id"     : branchId,
                                        "restaurant_id" : conceptIds[records.store_concept_id]._id,
                                    },
                                    {
                                        $set: {
                                            "payment_methods" : [
                                                "cash",
                                                "credit",
                                                "k-net",
                                                "myfatoorah-credit"
                                            ],
                                        },
                                        $setOnInsert: {
                                            "channel_id": "merchant_portal",
                                            "added_by"  : asyncReponse.super_admin_details._id,
                                            "created"   : getUtcDate(records.record_date),
                                            "kfg" : true,
                                        }
                                    },{
                                        upsert: true
                                    },(insertErr)=>{
                                        paymentMethods(insertErr);
                                    }
                                );
                            },
                        },(subParallelErr,subAsyncReponse)=>{
                            callback(insertErr);
                        });
                    }
                );
            },(asyncEachErr)=>{
                console.log('asyncEachErr');
                console.log(asyncEachErr);
            });
        });
		res.render('blank',{layout:false});
    };

	/**
	 * Function to migrate branches settings in collection
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 *
	 * @return render
	 */
	this.migrateBranchSettings = (req, res, next, db2)=>{
        const restaurant_branches               = db.collection("restaurant_branches");
        const restaurant_branch_areas           = db2.collection("temp_restaurant_branch_areas");
        const restaurant_branch_area_settings   = db2.collection("temp_restaurant_branch_area_settings");
        const restaurants                       = db.collection("restaurants");
        const area_blocks                       = db.collection("area_blocks");
        const users                             = db.collection("users");

        asyncParallel({
            branches: (branchesCallback)=>{
                restaurant_branches.find({kfg: true}).toArray((err,result)=>{
                    let restaurantBranches = {};
                    result.map(branchRecords=> restaurantBranches[branchRecords.kfg_store_id] = branchRecords);
                    branchesCallback(err,restaurantBranches);
                });
            },
            store: (storeCallback)=>{
                const kfg_stores = db2.collection("kfg_stores");
                kfg_stores.find({}).toArray((err,result)=>{
                    let storeData = {};
                    result.map(storeRecords=> storeData[storeRecords.store_id] = storeRecords);
                    storeCallback(err,storeData);
                });
            },
            kfg_store_area_maps: (kfgStoreAreaCallback)=>{
                const kfg_store_area_maps = db2.collection("kfg_store_area_maps");
                kfg_store_area_maps.find({
					store_id : 108
				}).toArray((kfgStoreErr,kfgStoreResult)=>{
                    if(kfgStoreErr) return kfgStoreAreaCallback(kfgStoreErr);
                    kfgStoreAreaCallback(kfgStoreErr,kfgStoreResult);
                });
            },
            super_admin_details: (superAdminDetails)=>{
                users.findOne({
                    user_role_id : CRAVEZ
                },{projection:{full_name:1,_id:1}},(superAdminErr, superAdminResult)=>{
                    superAdminDetails(superAdminErr, superAdminResult);
                });
            },
            concept_ids: (conceptDetails)=>{
                restaurants.find({
                        concept_id : {
                            $exists: true
                        }
                    },{projection:{_id: 1,concept_id: 1,slug: 1}}
                ).toArray((conceptErr, conceptResult)=>{
                    if(conceptErr) return conceptDetails(conceptErr);
                    let conceptData = {};
                    conceptResult.map(conceptRecords=> conceptData[conceptRecords.concept_id] = conceptRecords);
                    conceptDetails(conceptErr,conceptData);
                });
            },
            blocks: (areaBlockDetails)=>{
                area_blocks.find({
                        kfg: true
                    },{projection:{kfg_block_id: 1,city_id: 1, area_id: 1}}
                ).toArray((areaBlockErr, areaBlockResult)=>{
                    if(areaBlockErr) return areaBlockDetails(areaBlockErr);
                    let kfgAreaBlockData = {};
                    areaBlockResult.map(areaBlockRecords=> kfgAreaBlockData[areaBlockRecords.kfg_block_id] = areaBlockRecords);
                    areaBlockDetails(areaBlockErr,kfgAreaBlockData);
                });
            }
        },(parallelErr,asyncReponse)=>{
            if(parallelErr) return console.error(parallelErr);
            let conceptIds      = asyncReponse.concept_ids;
            let areaBlocks      = asyncReponse.blocks;
            let storeData       = asyncReponse.store;
            let branchData      = asyncReponse.branches;
            let areaProcessed   = [];
            asyncEach(asyncReponse.kfg_store_area_maps,(records,asyncEachcallback)=>{
                if(!areaBlocks[records.area_id]){
                    asyncEachcallback(null);
                    return console.error(records.area_id+" block not found in area_blocks table");
                }

                if(!conceptIds[records.concept_id]){
                    asyncEachcallback(null);
                    return console.error(records.concept_id+" concept id not found in restaurants table");
                }

                if(!storeData[records.store_id]){
                    asyncEachcallback(null);
                    return console.error(records.store_id+" store id not found in kfg_stores table");
                }

                if(!branchData[records.store_id]){
                    asyncEachcallback(null);
                    return console.error(records.store_id+" branch not found in restaurant branches table");
                }

                let areaId = areaBlocks[records.area_id].area_id;

                if(areaProcessed.indexOf(areaId.toString()) !== -1) return asyncEachcallback(null);

                areaProcessed.push(areaId.toString());

                let branchDetails   = branchData[records.store_id];
                let storeDetails    = storeData[records.store_id];

                asyncParallel({
                    branch_areas: (branchesCallback)=>{
                        restaurant_branch_areas.updateOne(
                            {
                                "branch_id" :   branchDetails._id,
                                "area_id"   :   areaBlocks[records.area_id].area_id
                            },
                            {
                                $set: {
                                    "added_by"          : asyncReponse.super_admin_details._id,
                                    "modified"          : getUtcDate(records.last_update_date),
                                    "open"              : OPEN,
                                    "restaurant_id"     : conceptIds[records.concept_id]._id,
                                    "kfg_store_id"      : records.store_id,
                                    "cravez_area_id"    : areaBlocks[records.area_id].cravez_area_id,
                                    "kfg_block_id"      : areaBlocks[records.area_id].kfg_block_id,
                                    "kfg_concept_id"    : records.concept_id,
                                },
                                $setOnInsert: {
                                    "created"   : getUtcDate(records.record_date),
                                    "kfg" : true,
                                }
                            },{
                                upsert: true
                            },(insertErr)=>{
                                branchesCallback(insertErr);
                            }
                        );
                    },
                    branch_settings: (brancheSettingsCallback)=>{
                        let basicCreateConditions = {
                            "area_id"           : areaBlocks[records.area_id].area_id,
                            "branch_id"         : branchDetails._id,
                            "restaurant_id"     : conceptIds[records.concept_id]._id,
                        };

                        let basicSettingDetails = {
                            "attribute_value"   : "",
                            "modified"          : getUtcDate(records.last_update_date),
                        };

                        let basicDetailOnCreate = {
                            "channel_id": "merchant_portal",
                            "added_by"  : asyncReponse.super_admin_details._id,
                            "created"   : getUtcDate(records.record_date),
                            "kfg" : true,
						};

						brancheSettingsCallback(null);

						/** Comment */
							// asyncParallel([
							// 	(callback)=>{
							// 		/** Preparition time  */
							// 		let cloneBasicSettings      = clone(basicSettingDetails);
							// 		let cloneBasicConditions    = clone(basicCreateConditions);

							// 		cloneBasicSettings.attribute_value  = storeDetails.store_promise_time;
							// 		cloneBasicConditions.attribute_id    = 59;

							// 		restaurant_branch_area_settings.updateOne(
							// 			cloneBasicConditions,
							// 			{
							// 				$set: cloneBasicSettings,
							// 				$setOnInsert: basicDetailOnCreate
							// 			},{
							// 				upsert: true
							// 			},(insertErr)=>{
							// 				callback(insertErr);
							// 			}
							// 		);
							// 	},
							// 	(callback)=>{
							// 		/** Has Offers */
							// 		let cloneBasicSettings      = clone(basicSettingDetails);
							// 		let cloneBasicConditions    = clone(basicCreateConditions);

							// 		cloneBasicSettings.attribute_value  = "";
							// 		cloneBasicConditions.attribute_id    = 59;


							// 		restaurant_branch_area_settings.updateOne(
							// 			cloneBasicConditions,
							// 			{
							// 				$set: cloneBasicSettings,
							// 				$setOnInsert: basicDetailOnCreate
							// 			},{
							// 				upsert: true
							// 			},(insertErr)=>{
							// 				callback(insertErr);
							// 			}
							// 		);
							// 	},
							// 	(callback)=>{
							// 		/** Delivery fees */
							// 		let cloneBasicSettings      = clone(basicSettingDetails);
							// 		let cloneBasicConditions    = clone(basicCreateConditions);

							// 		cloneBasicSettings.attribute_value  = storeDetails.service_charge;
							// 		cloneBasicConditions.attribute_id    = 53;


							// 		restaurant_branch_area_settings.updateOne(
							// 			cloneBasicConditions,
							// 			{
							// 				$set: cloneBasicSettings,
							// 				$setOnInsert: basicDetailOnCreate
							// 			},{
							// 				upsert: true
							// 			},(insertErr)=>{
							// 				callback(insertErr);
							// 			}
							// 		);
							// 	},
							// 	(callback)=>{
							// 		/** Delivery Duration */
							// 		let cloneBasicSettings      = clone(basicSettingDetails);
							// 		let cloneBasicConditions    = clone(basicCreateConditions);

							// 		cloneBasicSettings.attribute_value  = storeDetails.store_promise_time;
							// 		cloneBasicConditions.attribute_id    = 39;


							// 		restaurant_branch_area_settings.updateOne(
							// 			cloneBasicConditions,
							// 			{
							// 				$set: cloneBasicSettings,
							// 				$setOnInsert: basicDetailOnCreate
							// 			},{
							// 				upsert: true
							// 			},(insertErr)=>{
							// 				callback(insertErr);
							// 			}
							// 		);
							// 	},
							// 	(callback)=>{
							// 		/** Delivery By */
							// 		let cloneBasicSettings      = clone(basicSettingDetails);
							// 		let cloneBasicConditions    = clone(basicCreateConditions);

							// 		cloneBasicSettings.attribute_value  = DELIVERY_BY_RESTAURANT;
							// 		cloneBasicConditions.attribute_id    = 44;


							// 		restaurant_branch_area_settings.updateOne(
							// 			cloneBasicConditions,
							// 			{
							// 				$set: cloneBasicSettings,
							// 				$setOnInsert: basicDetailOnCreate
							// 			},{
							// 				upsert: true
							// 			},(insertErr)=>{
							// 				callback(insertErr);
							// 			}
							// 		);
							// 	},
							// 	(callback)=>{
							// 		/** Minimum order limit */
							// 		let cloneBasicSettings      = clone(basicSettingDetails);
							// 		let cloneBasicConditions    = clone(basicCreateConditions);

							// 		cloneBasicSettings.attribute_value  = "";
							// 		cloneBasicConditions.attribute_id    = 41;


							// 		restaurant_branch_area_settings.updateOne(
							// 			cloneBasicConditions,
							// 			{
							// 				$set: cloneBasicSettings,
							// 				$setOnInsert: basicDetailOnCreate
							// 			},{
							// 				upsert: true
							// 			},(insertErr)=>{
							// 				callback(insertErr);
							// 			}
							// 		);
							// 	},
							// 	(callback)=>{
							// 		/** Comming soon */
							// 		let cloneBasicSettings      = clone(basicSettingDetails);
							// 		let cloneBasicConditions    = clone(basicCreateConditions);

							// 		cloneBasicSettings.attribute_value  = "";
							// 		cloneBasicConditions.attribute_id    = 58;


							// 		restaurant_branch_area_settings.updateOne(
							// 			cloneBasicConditions,
							// 			{
							// 				$set: cloneBasicSettings,
							// 				$setOnInsert: basicDetailOnCreate
							// 			},{
							// 				upsert: true
							// 			},(insertErr)=>{
							// 				callback(insertErr);
							// 			}
							// 		);
							// 	},
							// 	(callback)=>{
							// 		/** Accept pickup orders */
							// 		let cloneBasicSettings      = clone(basicSettingDetails);
							// 		let cloneBasicConditions    = clone(basicCreateConditions);

							// 		/** Always yes */
							// 		cloneBasicSettings.attribute_value  = "1";
							// 		cloneBasicConditions.attribute_id    = 60;


							// 		restaurant_branch_area_settings.updateOne(
							// 			cloneBasicConditions,
							// 			{
							// 				$set: cloneBasicSettings,
							// 				$setOnInsert: basicDetailOnCreate
							// 			},{
							// 				upsert: true
							// 			},(insertErr)=>{
							// 				callback(insertErr);
							// 			}
							// 		);
							// 	},
							// 	(callback)=>{
							// 		/** Accept scheduling orders */
							// 		let cloneBasicSettings      = clone(basicSettingDetails);
							// 		let cloneBasicConditions    = clone(basicCreateConditions);

							// 		/** Always yes */
							// 		cloneBasicSettings.attribute_value  = "1";
							// 		cloneBasicConditions.attribute_id    = 65;


							// 		restaurant_branch_area_settings.updateOne(
							// 			cloneBasicConditions,
							// 			{
							// 				$set: cloneBasicSettings,
							// 				$setOnInsert: basicDetailOnCreate
							// 			},{
							// 				upsert: true
							// 			},(insertErr)=>{
							// 				callback(insertErr);
							// 			}
							// 		);
							// 	},
							// ],(asyncUpdateErr)=>{
							// 	brancheSettingsCallback(asyncUpdateErr);
							// });
						/** Comment */
                    }
                },(asyncEachErr)=>{
                    asyncEachcallback(asyncEachErr);
                });
            },(asyncEachErr)=>{
                console.log('asyncEachErr');
                console.log(asyncEachErr);
            });
        });
		res.render('blank',{layout:false});
	};

	 /**
	 * Function to migrate category in our database
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 *
	 * @return render
	 */
	this.migrateCategory = (req, res, next, db2)=>{
        const restaurant_categories	= 	db.collection("restaurant_categories");
        const restaurant_cuisines	= 	db.collection("restaurant_cuisines");
        const restaurants           = 	db.collection("restaurants");
        const users                 =	db.collection("users");
        const cuisines              =	db.collection("cuisines");

        asyncParallel({
            categories: (categoryCallback)=>{
                const kfg_restaurant_categories = db2.collection("kfg_restaurant_categories");
                kfg_restaurant_categories.find({}).toArray((err,result)=>{
                    categoryCallback(err,result);
                });
            },
            super_admin_details: (superAdminDetails)=>{
                users.findOne({
                    user_role_id : CRAVEZ
                },{projection:{full_name:1,_id:1}},(superAdminErr, superAdminResult)=>{
                    superAdminDetails(superAdminErr, superAdminResult);
                });
            },
            cuisines_details: (cuisinesDetails)=>{
                cuisines.findOne({},{projection:{_id:1}},(cuisinesErr, cuisinesResult)=>{
                    cuisinesDetails(cuisinesErr, cuisinesResult);
                });
            },
            concept_ids: (conceptDetails)=>{
                restaurants.find({
					concept_id : { $exists: true }
				},{projection:{_id: 1,concept_id: 1,slug: 1}}).toArray((conceptErr, conceptResult)=>{
                    if(conceptErr) return conceptDetails(conceptErr);

					let conceptData = {};
                    conceptResult.map(conceptRecords=> conceptData[conceptRecords.concept_id] = conceptRecords);
                    conceptDetails(conceptErr,conceptData);
                });
            },
        },(parallelErr,asyncReponse)=>{
			if(parallelErr) return console.error(parallelErr);

			if(!asyncReponse.super_admin_details) 	return console.error("Admin user details not found.");
			if(!asyncReponse.cuisines_details) 		return console.error("Cuisines details not found.");

			let categoryList = {};
			let conceptIds   = asyncReponse.concept_ids;
            asyncForEachOf(asyncReponse.categories,(records,index,eachCallback)=>{
				if(categoryList[records.cravez_menu_category_id]) return eachCallback(null);

				if(!conceptIds[records.concept_id]){
                    eachCallback(null);
                    return console.error(records.concept_id+" concept id not found in restaurants table");
				}

				/** get area unqiue id **/
				getUniqueId(req,res,next,{type:"categories"}).then(uniqueIdResponse=>{
					let categoryData = {
						added_by	:	asyncReponse.super_admin_details._id,
						category_id	:	uniqueIdResponse.result,
						channel_id	:	CHANNEL_CRON,
						cuisine_id	:	asyncReponse.cuisines_details._id,
						image		: 	"",
						is_active	: 	ACTIVE,
						name		:	{
							en : records.category_en_name,
							ar : records.category_ar_name
					   },
						order				: 	index,
						restaurant_id		: 	conceptIds[records.concept_id]._id,
						restaurant_slug		: 	conceptIds[records.concept_id].slug,
						tags				:	[records.category_en_name, records.category_ar_name],
						modified			:	getUtcDate(),
						cravez_category_id 	:	records.cravez_menu_category_id ,
						kfg_sub_menu_id 	:	records.kfg_sub_menu_id ,
					};

					categoryList[records.cravez_menu_category_id] = categoryData;
					eachCallback(null);
				}).catch(next);
			},()=>{
				if(Object.keys(categoryList).length >0){
					asyncEach(categoryList,(records,eachCallback)=>{

						asyncParallel({
							cuisines: (cuisinesCallback)=>{
								restaurant_cuisines.updateOne({
									restaurant_id 	:	records.restaurant_id,
									cuisine_id 		: 	records.cuisine_id
								},
								{
									$set	: {
										modified : getUtcDate(),
									},
									$setOnInsert: {
										created	: 	getUtcDate(),
										kfg	 	:	true,
									}
								},{upsert: true },(insertErr)=>{
									cuisinesCallback(insertErr);
								});
							},
							category_details: (categoryCallback)=>{
								restaurant_categories.updateOne({
									cravez_category_id : records.cravez_category_id
								},
								{
									$set		: records,
									$setOnInsert: {
										created :	getUtcDate(),
										kfg		: 	true,
									}
								},{upsert: true },(insertCatErr)=>{
									categoryCallback(insertCatErr);
								});
							},
						},(parallelErr)=>{
							eachCallback(parallelErr);
						});
					},(eachErr)=>{
						console.log("eachErr");
						console.log(eachErr);
					});
				}else{
					console.log("Not found data")
				}
            });
		});
		res.render('blank',{layout:false});
    };// end migrateCategory()

    /**
	 * Function to migrate items
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 *
	 * @return render
	 */
	this.migrateItem = (req, res, next, db2)=>{
		const db2_combo_list	=	db2.collection("kfg_combo_list");
		const db2_item_list		= 	db2.collection("kfg_items_list");
		const db2_vgroups		= 	db2.collection("kfg_vgroups");

		const restaurant_branches	= 	db.collection("restaurant_branches");
		const restaurant_categories	= 	db.collection("restaurant_categories");
		const restaurant_menus		= 	db.collection("restaurant_menus");
        const users                 =   db.collection("users");

		const items 			    = 	db.collection("items");
		const item_availability     = 	db.collection("item_availability");
		const item_linkings 	    =	db.collection("item_linkings");

		/** Set conditions  */
		let conditions = { sub_menu_id : {$nin : ["0",0]} };

		/** Get item list */
		db2_item_list.aggregate([
			{$match :  conditions},
			{$group	:	{
				_id : 	{$cond: [
							{$and: [
								// { $eq : ["$menu_category_id",PIZZA_HUT_MENU_ID] },
								{ $gt : ["$v_group_id",0] },
							]},
							{
								menu_category_id : "$menu_category_id",
								v_group_id 		 : "$v_group_id",
							},
							"$item_id"
						]},
				seq 				:	{$first : "$seq"},
				item_id 			:	{$first : "$item_id"},
				iscombo 			: 	{$first : "$iscombo"},
				item_name 			: 	{$first : "$item_name"},
				item_name_arb		: 	{$first : "$item_name_arb"},
				item_price 			: 	{$first : "$item_price"},
				item_description	: 	{$first : "$item_description"},
				item_description_arb: 	{$first : "$item_description_arb"},
				v_group_id			: 	{$first : "$v_group_id"},
				menu_category_id	: 	{$first : "$menu_category_id"},
				category_id 		:	{$first : "$category_id"},
				start_time 			:	{$first : "$start_time"},
				end_time 			:	{$first : "$end_time"},
				store_id 			: 	{$first : "$store_id"},
				record_date 		: 	{$first : "$record_date"},
				sync_msg_id 		: 	{$first : "$sync_msg_id"},
				dough_type			: 	{$max	: "$dough_type"},
				item_size 			: 	{$first : "$item_size"},
				is_half 			: 	{$first : "$is_half"},
				selector 			:	{$first : "$selector"},
				kfg_items_list_id	:	{$first : "$kfg_items_list_id"},
				item_availablity_status: {$first: "$item_availablity_status"},
				sub_menu_id 		: 	{$addToSet: "$sub_menu_id"},
				v_group_item_id 	: 	{$push 	: {$cond: [
					{$and: [
						{ $gt : ["$v_group_id",0] },
					]},
					{item_id: "$item_id", kfg_items_list_id: "$kfg_items_list_id", dough_type: "$dough_type", item_size: "$item_size"},
					""
				]}},
			}},
			{$project : {_id :0}},
			{$sort:	{seq: SORT_ASC }}
		]).toArray((err,result)=>{
			if(err) return next(err);

			/** Send success response */
            if(result.length <=0) return res.send({ status: STATUS_SUCCESS, message: "No Records Found", result : result});

			asyncEach(result,(records,callback)=>{
				let iscombo 	=  parseInt(records.iscombo);
				let dbVGroupId 	=  records.v_group_id;
				let itemId		= records.item_id;
				let dbMenuId 	=  records.menu_category_id;
				let storeId 	=  records.store_id;
				// let dbCategoryId=  records.category_id;
				let dbSubMenuId	=  records.sub_menu_id;

				asyncParallel({
					combo_details : (parellelCallback)=>{
						if(!iscombo) return parellelCallback(null,null);

						/** Get item combo details */
						db2_combo_list.findOne({ combo_id:  itemId, },{projection: {combo_price: 1, size_surchg: 1, combo_no_of_components: 1, concept_id: 1, kfg_combo_list_id: 1, sync_msg_id: 1}},(comboErr,comboResult)=>{
							parellelCallback(comboErr,comboResult);
						});
					},
					vgroup_details : (parellelCallback)=>{
						if(!dbVGroupId) return parellelCallback(null,null);

						/** Get v groups details */
						db2_vgroups.findOne({
							menu_id 	:  dbMenuId,
							v_group_id	:  dbVGroupId,
						},{projection: {vgroup_name: 1, vgroup_description: 1, no_of_duplicate: 1, sync_msg_id:1, vgroup_description_arb:1, vgroup_name_arb:1, kfg_vgroups_id:1,}},(vgroupErr,vgroupResult)=>{
							parellelCallback(vgroupErr,vgroupResult);
						});
					},
					store_list : (parellelCallback)=>{
						if(storeId == 0) return parellelCallback(null,[]);

						let tempStoreId	=	storeId.split(',');
						// let storeIdInt	=	tempStoreId.map(rec=>{ return parseInt(rec) });

						/** Get store list */
						restaurant_branches.distinct( "_id",{kfg_store_id:  {$in : tempStoreId}},(storeErr, storeResult)=>{
							parellelCallback(storeErr,storeResult);
						});
					},
					category_details : (parellelCallback)=>{
						if(dbSubMenuId.constructor !== Array) dbSubMenuId = [dbSubMenuId];

						if(dbSubMenuId.length <=0) return parellelCallback(null,dbSubMenuId);

						/** Get category details list */
						restaurant_categories.distinct( "_id",{kfg_sub_menu_id:  {$in : dbSubMenuId}},(categoryErr,categoryResult)=>{
							parellelCallback(categoryErr, categoryResult);
						});
					},
					menu_details : (parellelCallback)=>{
						/** Get menu details list */
						restaurant_menus.findOne({ kfg_menu_id:  dbMenuId },{projection: {restaurant_id: 1, restaurant_slug:1,}},(menuErr,menuResult)=>{
							parellelCallback(menuErr,menuResult);
						});
					},
					vgroup_item_id : (parellelCallback)=>{
						if(!dbVGroupId) return parellelCallback(null,null);

						/** get item unqiue id **/
						getUniqueId(req,res,next,{type:"item"}).then(uniqueIdResponse=>{
							parellelCallback(null,uniqueIdResponse.result);
						}).catch(next);
					},
				},(parallelErr, parallelResponse)=>{
					if(parallelErr) return callback(parallelErr);

					records.store_id 			= 	parallelResponse.store_list;
					records.kfg_store_id 		=	storeId;
					records.sub_category_id		= 	parallelResponse.category_details;
					records.kfg_sub_category_id	=	dbSubMenuId;

					if(parallelResponse.menu_details){
						records.menu_category_id	=	parallelResponse.menu_details._id;
						records.restaurant_id 		= 	parallelResponse.menu_details.restaurant_id;
						records.restaurant_slug 	= 	parallelResponse.menu_details.restaurant_slug;
					}
					records.kfg_menu_category_id	=	dbMenuId;

					if(iscombo && parallelResponse.combo_details){
						let tempComboPrice  =	parseFloat(parallelResponse.combo_details.combo_price);
						let tempSurchg 		=	(parallelResponse.combo_details.size_surchg) ? parseFloat(parallelResponse.combo_details.size_surchg) :0;
						let tempItemPrice	=	tempComboPrice+tempSurchg;

						records.item_price 	= 	parseFloat(tempItemPrice);
						records.combo_price = 	tempComboPrice;
						records.size_surchg =	tempSurchg;
						records.concept_id 	=	parallelResponse.combo_details.concept_id;
						records.kfg_combo_list_id 		=	parallelResponse.combo_details.kfg_combo_list_id;
						records.combo_sync_msg_id 		=	parallelResponse.combo_details.sync_msg_id;
						records.combo_no_of_components 	=	parallelResponse.combo_details.combo_no_of_components;
					}

					if(dbVGroupId){
						records.vgroup_item_id		=	parallelResponse.vgroup_item_id;

						if(dbVGroupId && parallelResponse.vgroup_details){
							records.item_name 			= 	parallelResponse.vgroup_details.vgroup_name;
							records.item_name_arb 		= 	parallelResponse.vgroup_details.vgroup_name_arb;
							records.kfg_vgroups_id		= 	parallelResponse.vgroup_details.kfg_vgroups_id;
							records.no_of_duplicate		= 	parallelResponse.vgroup_details.no_of_duplicate;
							records.item_description 	= 	parallelResponse.vgroup_details.vgroup_description;
							records.item_description_arb= 	parallelResponse.vgroup_details.vgroup_description_arb;
						}
					}

					callback(parallelErr);
				});
			},(asyncEachErr)=>{
				if(asyncEachErr) return next(asyncEachErr);

				/** Get super admin id */
				users.findOne({ user_role_id : CRAVEZ },{projection:{full_name:1,_id:1}},(superAdminErr, superAdminResult)=>{
					if(superAdminErr) return console.error(superAdminErr);

					asyncEach(result,(records,eachCallback)=>{

						if(!records.restaurant_id || !records.restaurant_slug){
							eachCallback(null);
							return console.error("Restaurant details not found in item records", records);
						}

						let restaurantSlug 	= 	records.restaurant_slug;
						let fromTime		=	parseFloat(records.start_time.substr(0,5).replace(":","."));
						let toTime			=	parseFloat(records.end_time.substr(0,5).replace(":","."));
						let itemAvailablityStatus = ACTIVE;
						if(records.start_time =="00:00:00" && records.end_time == "00:00:00"){
							itemAvailablityStatus = NOT_AVAILABLE;
							fromTime	=	parseFloat(DAY_INITIAL_START_TIME.replace(':','.'));
							toTime	 	=	parseFloat(DAY_INITIAL_END_TIME.replace(':','.'));
						}

						let isCombo = (records.iscombo && restaurantSlug == BURGER_KING) ? 	true :false;
						let updateAbleData = {
							name : {
								en : records.item_name,
								ar : records.item_name_arb,
							},
							description : {
								en : records.item_description,
								ar : records.item_description_arb,
							},
							menu_ids			:	(records.menu_category_id) 	?	[records.menu_category_id]	:[],
							category_ids		:	(records.sub_category_id) 	?	records.sub_category_id		:[],
							is_combo			:	isCombo,
							availability_status	:	itemAvailablityStatus,
							kfg_sub_category_id	:	records.kfg_sub_category_id,
							kfg_category_id		:	records.category_id,
							kfg_menu_category_id:	records.kfg_menu_category_id,
							order				:	records.seq,
							price_on_selection	:	(records.v_group_id)	?	PRICE_ON_SELECTION 	:0,
							modified			: 	(records.record_date)	?	getUtcDate(records.record_date) :getUtcDate()
						};

						if(records.no_of_duplicate) updateAbleData.no_of_duplicate = records.no_of_duplicate;
						if(records.is_half) 		updateAbleData.is_half = true;

						let itemConditions  =  {restaurant_id: 	records.restaurant_id};

						if(records.v_group_id){
							updateAbleData.is_vgroup		=	true;
							updateAbleData.v_group_item_ids = 	records.v_group_item_id;

							itemConditions.kfg_vgroup_id 	=	records.v_group_id;

							updateAbleData.item_id 			=	records.vgroup_item_id;
						}else{
							updateAbleData.kfg_items_list_id=	records.kfg_items_list_id;
							updateAbleData.item_price		=	records.item_price;
							updateAbleData.combo_no_of_components =	records.combo_no_of_components;
							itemConditions.item_id 			=	String(records.item_id);
						}

						if(restaurantSlug == PIZZA_HUT && records.iscombo) updateAbleData.is_deal = true;

						/** Manage item type */
						let itemType = "";
						if(!records.v_group_id && !records.iscombo) 		 	itemType	= 	NORMAL_ITEM;
						if(restaurantSlug == BURGER_KING && records.iscombo)	itemType 	= 	COMBO_ITEM;
						if(restaurantSlug == PIZZA_HUT && records.iscombo) 		itemType	=	DEAL_ITEM;
						if(records.v_group_id && records.dough_type <=0) 		itemType 	=	NORMAL_VGROUP;
						if(restaurantSlug == PIZZA_HUT && records.dough_type >0)itemType 	= 	PIZZA_VGROUP;
						if(restaurantSlug == PIZZA_HUT && records.is_half) 		itemType 	= 	HALF_AND_HALF_ITEM;

						if(itemType) updateAbleData.item_type = itemType;

						items.updateOne(itemConditions,
						{
							$set 		: 	updateAbleData,
							$setOnInsert:	{
								kfg		  		:	true,
								channel_id		:	CHANNEL_CRON,
								// item_id			:	records.item_id,
								is_active		:	records.item_availablity_status,
								restaurant_slug	:	records.restaurant_slug,
								added_by   		:	superAdminResult._id,
								created    		: 	(records.record_date)	?	getUtcDate(records.record_date) :getUtcDate()
							}
						},{upsert: true},(itemErr,itemResult) => {

							if(itemResult && itemResult.upsertedId && itemResult.upsertedId._id){

								asyncParallel({
									availability_details : (parellelCallback)=>{
										item_availability.insertOne({
											item_id  	: 	itemResult.upsertedId._id,
											from_time	:	fromTime,
											to_time		:	toTime,
											kfg		  	:	true,
											channel_id	:	CHANNEL_CRON,
											modified    : 	getUtcDate(),
											created 	: 	getUtcDate(),
										},(qryError)=>{
											parellelCallback(qryError);
										});
									},
									linkings_details : (parellelCallback)=>{
										item_linkings.insertOne({
											restaurant_id 	:	records.restaurant_id,
											item_id  		: 	itemResult.upsertedId._id,
											branch_ids		:	records.store_id,
											kfg_store_id	:	records.kfg_store_id,
											kfg		  		:	true,
											menu_ids		:	(records.menu_category_id) 	?	[records.menu_category_id] :[],
											channel_id		:	CHANNEL_CRON,
											customize_attributes: {},
											type			:	ITEM_LISTED_TO_SELECTED_BRANCH_LIST,
											modified    	: 	getUtcDate(),
											created 		: 	getUtcDate(),
										},(qryError)=>{
											parellelCallback(qryError);
										});
									},
								},(parallelErr)=>{
									eachCallback(parallelErr);
								});
							}else{
								eachCallback(itemErr);
							}
						});
					},(asyncEachErr)=>{
                        if(asyncEachErr){
                            console.log("migrateItem async each err");
                            console.log(asyncEachErr);
                        }else{
							console.log("Done migrateItem");
						}
					});
				});
            });

            res.render('blank',{layout:false});
		});
    };// end migrateItem()

    /**
	 * Function to migrate item in our database
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 *
	 * @return render
	 */
	this.migrateItemDetails = (req, res, next, db2)=>{
		const db2_combo_upsell			=	db2.collection("kfg_combo_upsell");
		const db2_kfg_combo_list		=	db2.collection("kfg_combo_list");
		const db2_item_list				= 	db2.collection("kfg_items_list");
		const db2_kfg_sizes				= 	db2.collection("kfg_sizes");
		const db2_kfg_dough_type_list 	= 	db2.collection("kfg_dough_type_list");

		const users					= 	db.collection("users");
		const item_dough_units		= 	db.collection("item_dough_units");
		const item_units			= 	db.collection("item_units");
		const item_units_masters	= 	db.collection("item_units_masters");
		const items					= 	db.collection("items");
		const item_choices_groups	= 	db.collection("item_choices_groups");
		const item_extra_masters	= 	db.collection("item_extra_masters");
		const item_group_extras		= 	db.collection("item_group_extras");

		asyncParallel({
			item_list : (parentCallback)=>{

				/** Set conditions  */
				let conditions = {
					$or : [
						{
							iscombo 		: ACTIVE,
							// menu_category_id: BURGER_KING_MENU_ID
						},
						{
							v_group_id 		 :	{$gt : 0},
							// menu_category_id : 	PIZZA_HUT_MENU_ID
						},
					]
				};

				db2_item_list.aggregate([
					{$sort	:	{ item_size: SORT_ASC, dough_type: SORT_ASC,  }},
					{$match :  	conditions},
					{$group	:	{
						_id : 	{$cond: [
									{$and: [
										{ $gt : ["$v_group_id",0] },
										// { $eq : ["$menu_category_id",PIZZA_HUT_MENU_ID] },
									]},
									{
										menu_category_id : "$menu_category_id",
										v_group_id : "$v_group_id",
										dough_type : "$dough_type",
										item_size : "$item_size",
									},
									"$item_id"
								]},
						seq 			:	{$first : 	"$seq"},
						item_id 		:	{$first : 	"$item_id"},
						v_group_id		: 	{$first : 	"$v_group_id"},
						menu_category_id: 	{$first : 	"$menu_category_id"},
						iscombo			: 	{$first : 	"$iscombo"},
						group_item_list : 	{$push 	: 	{$cond: [
								{$and: [
									{ $gt : ["$v_group_id",0] },
								]},
								{
									v_group_id			:	"$v_group_id",
									item_id 			:	"$item_id",
									item_name 			:	"$item_name",
									item_name_arb 		:	"$item_name_arb",
									item_price 			:	"$item_price",
									item_description 	: 	"$item_description",
									item_description_arb: 	"$item_description_arb",
									item_availablity_status:"$item_availablity_status",
									start_time			: 	"$start_time",
									end_time			: 	"$end_time",
									dough_type 			: 	"$dough_type",
									item_size 			:	"$item_size",
									seq 				:	"$seq",
									selector 			:	"$selector",
									is_half 			:	"$is_half",
								},
								{}
							]
						}}
					}},
					{$sort:	{"_id.v_group_id" : SORT_ASC,"_id.item_size": SORT_ASC, "_id.dough_type": SORT_ASC, }},
					{$project : {_id :0}},
				]).toArray((err,result)=>{
					parentCallback(err,result);
				});
			},
			main_item_list : (parentCallback)=>{
				items.find({
					kfg :	{ $exists: true },
				},{projection:{item_id: 1,restaurant_slug: 1, restaurant_id:1,_id:1,kfg_vgroup_id:1,kfg_items_list_id:1,v_group_item_ids:1, item_price:1}}).toArray((itemErr, itemResult)=>{
                    if(itemErr) return parentCallback(itemErr);

					let itemData = {};
                    itemResult.map(itemRecords=>{
						if(itemRecords.kfg_vgroup_id && itemRecords.v_group_item_ids && itemRecords.v_group_item_ids.length >0){
							itemRecords.v_group_item_ids.map(data=>{
								itemData[data.item_id] = {
									item_main_id 		:	itemRecords._id,
									restaurant_slug 	: 	itemRecords.restaurant_slug,
									restaurant_id 		: 	itemRecords.restaurant_id,
									kfg_items_list_id	: 	data.kfg_items_list_id,
								};
							});
						}else{
							itemData[itemRecords.item_id] = {
								item_main_id 		:	itemRecords._id,
								restaurant_slug 	: 	itemRecords.restaurant_slug,
								restaurant_id 		: 	itemRecords.restaurant_id,
								kfg_items_list_id	: 	itemRecords.kfg_items_list_id,
								item_price			: 	itemRecords.item_price,
							};
						}
					});
                    parentCallback(itemErr,itemData);
                });
			},
			combo_upsell_list : (parentCallback)=>{
				db2_kfg_combo_list.aggregate([
					// {$sort  :	{kfg_combo_upsell_id:SORT_ASC}},
					{$addFields :{
						kfg_combo_upsell_id : {$split : ["$enable_upsell",","]}
					}},
					{$unwind : "$kfg_combo_upsell_id"},
					{$addFields :{
						kfg_combo_upsell_id: { $convert: { input: "$kfg_combo_upsell_id", to: "int", onError: "Error", onNull: 100 } },
					}},
					{$lookup:	{
						"from" 			: 	"kfg_combo_upsell",
						"localField" 	:	"kfg_combo_upsell_id",
						"foreignField" 	: 	"combo_upsell_id",
						"as" 			: 	"combo_upsell_detail"
					}},
					{$match :{ "combo_upsell_detail._id" :{$exists : true} }},
					{$group	:	{
						_id 	: 	"$combo_id",
						data 	:	{$addToSet :{
							combo_upsell_id 		: {$arrayElemAt: ["$combo_upsell_detail.combo_upsell_id",0]},
							combo_upsell_name 		: {$arrayElemAt: ["$combo_upsell_detail.combo_upsell_name",0]},
							combo_upsell_name_arb 	: {$arrayElemAt: ["$combo_upsell_detail.combo_upsell_name_arb",0]},
							kfg_combo_upsell_id 	: {$arrayElemAt: ["$combo_upsell_detail.kfg_combo_upsell_id",0]},
							item_price 				: {$arrayElemAt: ["$combo_upsell_detail.combo_upsell_price",0]},
						}},
					}},
				]).toArray((err,result)=>{
					if(err) return parentCallback(err);

					let resultData = {};
                    result.map(records=>{
						resultData[records._id] = records.data;
					});
					parentCallback(err,resultData);
				});
				// db2_combo_upsell.aggregate([
				// 	{$sort  :	{kfg_combo_upsell_id:SORT_ASC}},
				// 	{$group	:	{
				// 		_id 	: 	"$combo_id",
				// 		data 	:	{$addToSet :{
				// 			combo_upsell_id 		: "$combo_upsell_id",
				// 			combo_upsell_name 		: "$combo_upsell_name",
				// 			combo_upsell_name_arb 	: "$combo_upsell_name_arb",
				// 			kfg_combo_upsell_id 	: "$kfg_combo_upsell_id",
				// 			item_price 				: "$combo_upsell_price",
				// 		}},
				// 	}},
				// ]).toArray((err,result)=>{
				// 	if(err) return parentCallback(err);

				// 	let resultData = {};
                //     result.map(records=>{
				// 		resultData[records._id] = records.data;
				// 	});
				// 	parentCallback(err,resultData);
				// });
			},
			super_admin_details: (superAdminDetails)=>{
				users.findOne({
                    user_role_id : CRAVEZ
                },{projection:{full_name:1,_id:1}},(superAdminErr, superAdminResult)=>{
                    superAdminDetails(superAdminErr, superAdminResult);
                });
            },
		},(parentSubErr,parentSubResponse)=>{
			if(parentSubErr) return console.log(parentSubErr);

			if(!parentSubResponse.super_admin_details) 	return console.error("Admin user details not found in migrateItemChoice.");

			// return res.send({item_list: parentSubResponse.combo_upsell_list});

			let superAdminId 	=	parentSubResponse.super_admin_details._id;
			let result 			=	parentSubResponse.item_list;
			let mainItemList	= 	parentSubResponse.main_item_list;
			let comboUpsellList	= 	parentSubResponse.combo_upsell_list;

			/** Send success response */
			if(result.length <=0 ) return res.send({status: STATUS_SUCCESS, message: "No Records Found", result : result});

			asyncEach(result,(records,eachCallback)=>{
				let iscombo 		=	parseInt(records.iscombo);
				let dbVGroupId 		=  	records.v_group_id;
				let itemId			= 	records.item_id;

				if(iscombo){
					if(!mainItemList[itemId] || !mainItemList[itemId].item_main_id  || !mainItemList[itemId].restaurant_id || !mainItemList[itemId].restaurant_slug || !mainItemList[itemId].kfg_items_list_id){
						eachCallback(null);
						return console.error("Restaurants details not found for item id - "+itemId);
					}

					if(!comboUpsellList[itemId] || comboUpsellList[itemId].length <=0){
						eachCallback(null);
						return console.error("upsell details not found for item id - "+itemId);
					}

					records.item_main_id		=	mainItemList[itemId].item_main_id;
					records.restaurant_id		= 	mainItemList[itemId].restaurant_id;
					records.restaurant_slug		= 	mainItemList[itemId].restaurant_slug;
					records.kfg_items_list_id	= 	mainItemList[itemId].kfg_items_list_id;
					records.main_item_price		= 	mainItemList[itemId].item_price;
					records.group_item_list		= 	comboUpsellList[itemId];
				}

				if(dbVGroupId &&  records.group_item_list.length >0){
					asyncForEachOf(records.group_item_list,(vgroupData,subIndex,eachSubCallback)=>{
						let tempItemId			= 	vgroupData.item_id;

						if(!mainItemList[tempItemId] || !mainItemList[tempItemId].item_main_id  || !mainItemList[tempItemId].restaurant_id || !mainItemList[tempItemId].restaurant_slug || !mainItemList[tempItemId].kfg_items_list_id){
							eachSubCallback(null);
							return console.error("Restaurants details not found for item id - "+tempItemId);
						}

						vgroupData.item_main_id		=	mainItemList[tempItemId].item_main_id;
						vgroupData.restaurant_id	= 	mainItemList[tempItemId].restaurant_id;
						vgroupData.restaurant_slug	= 	mainItemList[tempItemId].restaurant_slug;
						vgroupData.kfg_items_list_id= 	mainItemList[tempItemId].kfg_items_list_id;

						asyncParallel({
							size_details : (parellelCallback)=>{
								if(!vgroupData.item_size) return parellelCallback(null,null);

								/** Get size details details */
								db2_kfg_sizes.findOne({
									size_id :  vgroupData.item_size
								},{projection: {size_en_name: 1, size_ar_name: 1}},(sizeErr,sizeResult)=>{
									parellelCallback(sizeErr,sizeResult);
								});
							},
							dough_type_details : (parellelCallback)=>{
								if(!vgroupData.dough_type) return parellelCallback(null,null);

								/** Get dough type details details */
								db2_kfg_dough_type_list.findOne({ dough_id: vgroupData.dough_type},{projection: {dough_type: 1, dough_type_arb: 1, dough_desc:1, dough_desc_arb:1}},(doughTypeErr,doughTypeResult)=>{
									parellelCallback(doughTypeErr,doughTypeResult);
								});
							},
						},(parallelSubErr,parallelSubResponse)=>{
							if(parallelSubErr) return  eachSubCallback(parallelSubErr);

							if(vgroupData.item_size){
								vgroupData.size_en_name	=	(parallelSubResponse.size_details.size_en_name) ? parallelSubResponse.size_details.size_en_name :"";
								vgroupData.size_ar_name	=	(parallelSubResponse.size_details.size_ar_name) ? parallelSubResponse.size_details.size_ar_name :"";
							}

							if(vgroupData.dough_type){
								vgroupData.dough_type_en_name= (parallelSubResponse.dough_type_details.dough_type) 	? parallelSubResponse.dough_type_details.dough_type 	:"";
								vgroupData.dough_type_ar_name=(parallelSubResponse.dough_type_details.dough_type_arb)? parallelSubResponse.dough_type_details.dough_type_arb :"";
								vgroupData.dough_type_en_desc=(parallelSubResponse.dough_type_details.dough_desc) ? parallelSubResponse.dough_type_details.dough_desc 	:"";
								vgroupData.dough_type_ar_desc=(parallelSubResponse.dough_type_details.dough_desc_arb)? parallelSubResponse.dough_type_details.dough_desc_arb :"";
							}

							eachSubCallback(parallelSubErr);
						});
					},(asyncEachErr)=>{
						eachCallback(asyncEachErr);
					});
				}else{
					eachCallback(null);
				}
			},(asyncEachErr)=>{
                if(asyncEachErr){
                    console.log("migrateItemDetails async each err");
                    return console.log(asyncEachErr);
				}

				let parentObj = {};
				let doughTypeParentObj = {};
				eachOfSeries(result,(records, secondKey, eachCallback)=>{
					let iscombo 		=	parseInt(records.iscombo);
					let dbVGroupId 		=  	parseInt(records.v_group_id);
					let itemId			= 	records.item_id;
					let groupItemList	=	records.group_item_list;
					let isVgroup		=	(dbVGroupId >0) ? true :false;

					if(groupItemList.length <=0){
						eachCallback(null);
						return console.log("No Details found",records);
					}

                    eachOfSeries(groupItemList,(groupData, firstKey, eachSubCallback)=>{
						if(isVgroup){
							if(!groupData.restaurant_id || !groupData.restaurant_slug || !groupData.item_main_id){
								eachSubCallback(null);
								return  console.error("Restaurants details not found vgroup  - "+JSON.stringify(groupData));
							}
						}else if(!records.restaurant_id || !records.restaurant_slug || !records.item_main_id){
							eachSubCallback(null);
							return  console.error("Restaurants details not found comb  - "+JSON.stringify(records));
						}

						let restaurantId	=	(isVgroup) ?  groupData.restaurant_id 	: records.restaurant_id;
						let restaurantSlug 	=	(isVgroup) ?  groupData.restaurant_slug : records.restaurant_slug;
						let itemMainId	 	=	(isVgroup) ?  groupData.item_main_id 	: records.item_main_id;

						asyncParallel({
							unique_item_unit_id : (parellelCallback)=>{
								/** get unique Id Response **/
								getUniqueId(req,res,next,{type:"item_unit"}).then(uniqueIdResponse=>{
									let uniqueItemUnitid = (uniqueIdResponse.result) ? uniqueIdResponse.result :"";
									parellelCallback(null,uniqueItemUnitid);
								}).catch(next);
							},
							dough_type_item_unit_id : (parellelCallback)=>{
								if(!isVgroup || !groupData.dough_type) return parellelCallback(null,null);

								/** get unique Id Response **/
								getUniqueId(req,res,next,{type:"item_unit"}).then(uniqueIdResponse=>{
									let uniqueItemUnitid = (uniqueIdResponse.result) ? uniqueIdResponse.result :"";
									parellelCallback(null,uniqueItemUnitid);
								}).catch(next);
							},
							choice_id : (parellelCallback)=>{
								if(!isVgroup || !groupData.dough_type) return parellelCallback(null,null);

								/** Get size details details */
								item_choices_groups.findOne({
									restaurant_id 	:  	ObjectId(restaurantId),
									item_id 		:  	ObjectId(itemMainId),
									is_choice		:	true,
								},{projection: {_id: 1,}},(choiceErr,choiceResult)=>{
									let choiceId = (choiceResult) ? choiceResult._id:"";
									if(choiceErr || choiceResult){
										return parellelCallback(choiceErr,choiceId);
									}

									let updateData = {
										name  : {
											en : "Your Choice of Pizza",
											ar : "اختيارك من البيتزا",
										},
										min_quantity : 1,
										max_quantity : 1,
										order 		 : 1,
										modified : getUtcDate(),
									}

									/** Save unit master detils */
									item_choices_groups.updateOne({
										restaurant_id 	:  	ObjectId(restaurantId),
										item_id 		:  	ObjectId(itemMainId),
										is_choice		:	true,
									},
									{
										$set		:	updateData,
										$setOnInsert:	{
											added_by		:	superAdminId,
											channel_id		:	CHANNEL_CRON,
											restaurant_slug : 	restaurantSlug,
											cravez_item_id 	:	groupData.item_id,
											created   		:	getUtcDate(),
											kfg		 		: 	true,
										}
									},{upsert: true },(choiceInsertErr,choiceInsertResult)=>{
										let choiceId = (choiceInsertResult &&  choiceInsertResult.upsertedId && choiceInsertResult.upsertedId._id) ? choiceInsertResult.upsertedId._id:"";
										parellelCallback(choiceInsertErr,choiceId);
									});
								});
							},
						},(parallelSubChildErr,parallelSubChildResponse)=>{

							let uniqueItemUnitId 			= 	(parallelSubChildResponse.unique_item_unit_id) 		? 	parallelSubChildResponse.unique_item_unit_id 	 :"";
							let uniqueDoughTypeItemUnitId 	=	(parallelSubChildResponse.dough_type_item_unit_id) 	?	parallelSubChildResponse.dough_type_item_unit_id :"";
							let itemChoiceId 				=	(parallelSubChildResponse.choice_id) 				?	parallelSubChildResponse.choice_id 				:"";

							if(!uniqueItemUnitId){
								eachSubCallback(null);
								return  console.error("Item unit  unique id not found  - "+JSON.stringify(records));
							}

							if(isVgroup && groupData.dough_type && !uniqueDoughTypeItemUnitId){
								eachSubCallback(null);
								return  console.error("Item dough type unit  unique id not found  - "+JSON.stringify(records));
							}
							if(isVgroup && groupData.dough_type && !itemChoiceId){
								eachSubCallback(null);
								return  console.error("Item choice details not found  - "+JSON.stringify(records));
							}

							asyncParallel({
								upsell_details : (parellelCallback)=>{
									let upserllConditions = {
										restaurant_slug :	restaurantSlug
									};

									let unitMasterName 		= 	"";
									let unitMasterArName 	=	"";
									if(isVgroup){
										if(groupData.item_size){
											unitMasterName 		= 	(groupData.size_en_name) ? groupData.size_en_name :"";
											unitMasterArName 	=	(groupData.size_ar_name) ? groupData.size_ar_name :"";

											upserllConditions.size_id = groupData.item_size;
										}else{
											unitMasterName 		= 	(groupData.item_name) 		? 	groupData.item_name 	:"";
											unitMasterArName 	=	(groupData.item_name_arb) 	?	groupData.item_name_arb :"";

											upserllConditions.kfg_items_list_id = groupData.kfg_items_list_id;
										}
									}else{
										unitMasterName =    (UPSELL_TYPE_OBJECT[groupData.combo_upsell_id]) ? UPSELL_TYPE_OBJECT[groupData.combo_upsell_id].en :"";
										unitMasterArName =  (UPSELL_TYPE_OBJECT[groupData.combo_upsell_id]) ? UPSELL_TYPE_OBJECT[groupData.combo_upsell_id].ar :"";

										upserllConditions.combo_upsell_id = groupData.combo_upsell_id;
									}

									/** Get size details details */
									item_units_masters.findOne(upserllConditions,{projection: {_id: 1,}},(masterErr,masterResult)=>{
										let masterId = (masterResult) ? masterResult._id:"";
										if(masterErr || masterResult){
											return parellelCallback(masterErr,masterId);
										}

										let updateData = {
											name  : {
												en : unitMasterName,
												ar : unitMasterArName,
											},
											modified : getUtcDate(),
										}

										if(groupData.item_description || groupData.item_description_arb){
											updateData.description = {
												en : groupData.item_description,
												ar : groupData.item_description_arb,
											};
										}

										/** Save unit master detils */
										item_units_masters.updateOne(upserllConditions,
										{
											$set		:	updateData,
											$setOnInsert:	{
												channel_id		:	CHANNEL_CRON,
												added_by		:	superAdminId,
												item_unit_id 	:	uniqueItemUnitId,
												cravez_item_id 	:	groupData.item_id,
												restaurant_id 	:	restaurantId,
												created   		:	getUtcDate(),
												kfg		 		: 	true,
											}
										},{upsert: true },(insertErr,insertResult)=>{
											let masterId = (insertResult &&  insertResult.upsertedId && insertResult.upsertedId._id) ? insertResult.upsertedId._id:"";
											parellelCallback(insertErr,masterId);
										});
									});
								},
								dough_type_upsell_details : (parellelCallback)=>{
									if(!isVgroup || !groupData.dough_type) return parellelCallback(null,null);

									let unitMasterName 		= 	(groupData.dough_type_en_name) ? groupData.dough_type_en_name :"";
									let unitMasterArName 	=	(groupData.dough_type_ar_name) ? groupData.dough_type_ar_name :"";

									/** Get size details details */
									item_units_masters.findOne({
										restaurant_slug 	:	restaurantSlug,
										// kfg_items_list_id	:	groupData.kfg_items_list_id,
										dough_type			:	groupData.dough_type,
									},{projection: {_id: 1,}},(masterErr,masterResult)=>{
										let masterId = (masterResult) ? masterResult._id:"";
										if(masterErr || masterResult){
											return parellelCallback(masterErr,masterId);
										}

										let updateData = {
											name  : {
												en : unitMasterName,
												ar : unitMasterArName,
											},
											modified : getUtcDate(),
										}

										if(groupData.dough_type_en_desc || groupData.dough_type_ar_desc){
											updateData.description = {
												en : groupData.dough_type_en_desc,
												ar : groupData.dough_type_ar_desc,
											};
										}

										/** Save unit master detils */
										item_units_masters.updateOne({
											restaurant_slug 	:	restaurantSlug,
											// kfg_items_list_id 	:	groupData.kfg_items_list_id,
											dough_type			:	groupData.dough_type,
										},
										{
											$set		:	updateData,
											$setOnInsert:	{
												channel_id		:	CHANNEL_CRON,
												added_by		:	superAdminId,
												cravez_item_id 	:	groupData.item_id,
												item_unit_id 	:	uniqueItemUnitId,
												restaurant_id 	:	restaurantId,
												created   		:	getUtcDate(),
												kfg		 		: 	true,
											}
										},{upsert: true },(insertErr,insertResult)=>{
											let masterId = (insertResult &&  insertResult.upsertedId && insertResult.upsertedId._id) ? insertResult.upsertedId._id:"";
											parellelCallback(insertErr,masterId);
										});
									});
								},
							},(parallelSubErr,parallelSubResponse)=>{
								if(parallelSubErr) return eachSubCallback(parallelSubErr);

								if(!parallelSubResponse.upsell_details){
									eachSubCallback(null)
									return console.log("update details not found \n",JSON.stringify(groupData)+"\n");
								}

								if(groupData.dough_type && !parallelSubResponse.dough_type_upsell_details){
									eachSubCallback(null)
									return console.log("Dough Type update details not found \n",JSON.stringify(groupData)+"\n");
								}

								let itemPrice = groupData.item_price;
								if(iscombo) itemPrice += parseFloat(records.main_item_price)

								let updateData = {
									price 		: 	(!parallelSubResponse.dough_type_upsell_details) ? itemPrice :0,
									modified	:	getUtcDate(),
								};

								if(groupData.item_size){
									updateData.kfg_size = groupData.item_size;
								}

								// if(parallelSubResponse.dough_type_upsell_details){
								// 	updateData.level 		= 	1;
								// 	updateData.has_child 	=	true;
								// };

								let firstUnitMatserId = parallelSubResponse.upsell_details;

								item_units.updateOne({
									restaurant_id 	:	restaurantId,
									item_id 		:	itemMainId,
									item_unit_id	: 	firstUnitMatserId
								},
								{
									$set 		:	updateData,
									$setOnInsert: 	{
										channel_id	:	CHANNEL_CRON,
										added_by	:	superAdminId,
										status   	:	(groupData.item_availablity_status) ? groupData.item_availablity_status :0,
										sorting   	:	(isVgroup) ? parseInt(groupData.seq) :parseInt(records.seq),
										created   	:	getUtcDate(),
										kfg		 	: 	true,
										restaurant_slug :	restaurantSlug,
									}
								},{upsert: true },(insertErr,insertRes)=>{
									if(insertErr) return eachSubCallback(insertErr);

									let childMongoId = (insertRes &&  insertRes.upsertedId && insertRes.upsertedId._id) ? insertRes.upsertedId._id :"";

									if(childMongoId && groupData.item_size){
										if(!parentObj[restaurantSlug]) parentObj[restaurantSlug] = {};
										if(!parentObj[restaurantSlug][itemMainId]) parentObj[restaurantSlug][itemMainId] = {};
										if(!parentObj[restaurantSlug][itemMainId][groupData.item_size]) parentObj[restaurantSlug][itemMainId][groupData.item_size] = "";

										parentObj[restaurantSlug][itemMainId][groupData.item_size] = childMongoId;
									}

									if(!childMongoId && groupData.item_size && parentObj[restaurantSlug] && parentObj[restaurantSlug][itemMainId] && parentObj[restaurantSlug][itemMainId][groupData.item_size]){
										childMongoId = parentObj[restaurantSlug][itemMainId][groupData.item_size];
									}

									asyncParallel({
										update_dough_type_details : (parentCallback)=>{
											if(!parallelSubResponse.dough_type_upsell_details) return parentCallback(null,null);

											let doughTypeUnitMasterId = parallelSubResponse.dough_type_upsell_details;

											let doughTypeUpdateData = clone(updateData);
											// doughTypeUpdateData.level = 2;

											if(doughTypeUpdateData.kfg_size) delete doughTypeUpdateData.kfg_size;

											let unitUpdateAbleData = {
												$set 		:	doughTypeUpdateData,
												$setOnInsert: 	{
													restaurant_slug :	restaurantSlug,
													added_by		:	superAdminId,
													channel_id		:	CHANNEL_CRON,
													kfg_dough_type 	:	groupData.dough_type,
													status   		:	groupData.item_availablity_status,
													created   		:	getUtcDate(),
													kfg		 		: 	true,
												},
												$addToSet : {
													parents	: childMongoId
												}
											};

											if(groupData.is_half && groupData.selector){
												unitUpdateAbleData["$addToSet"].selector = groupData.selector;
											};

											asyncParallel({
												item_dough_id : (itemDoughCallback)=>{
													item_dough_units.findOne({
														item_id 		:	itemMainId,
														// parent_id 		:	childMongoId,
														item_unit_id	: 	doughTypeUnitMasterId,
														restaurant_id 	:	restaurantId,
														parents 		: 	{$elemMatch: {$eq: childMongoId}}
													},{projection: {_id: 1,}},(doughErr,doughResult)=>{
														let doughResultId = (doughResult) ? doughResult._id:"";
														if(doughResultId){
															if(!doughTypeParentObj[String(itemMainId)]) doughTypeParentObj[String(itemMainId)] = {};
															doughTypeParentObj[String(itemMainId)][groupData.dough_type] = doughResultId;
														}

														if(doughErr || doughResult){
															return itemDoughCallback(doughErr,doughResultId);
														}

														item_dough_units.updateOne({
															item_id 		:	itemMainId,
															// parent_id 		:	childMongoId,
															item_unit_id	: 	doughTypeUnitMasterId,
															restaurant_id 	:	restaurantId,
															// parents 		: 	{$elemMatch: {$eq: childMongoId}}
														},unitUpdateAbleData,{upsert: true },(doughInsertErr,doughInsertRes)=>{
															let doughResultId = (doughInsertRes &&  doughInsertRes.upsertedId && doughInsertRes.upsertedId._id) ? doughInsertRes.upsertedId._id :"";
															if(doughResultId){
																if(!doughTypeParentObj[String(itemMainId)]) doughTypeParentObj[String(itemMainId)] = {};
																doughTypeParentObj[String(itemMainId)][groupData.dough_type] = doughResultId;
															}
															itemDoughCallback(doughInsertErr,doughResultId);
														});
													});
												},
											},(parallelItemDoughChildErr,parallelItemDoughRes)=>{
												if(parallelItemDoughChildErr) return parentCallback(parallelItemDoughChildErr);

												let itemDoughId = (doughTypeParentObj[String(itemMainId)] && doughTypeParentObj[String(itemMainId)][groupData.dough_type]) ? doughTypeParentObj[String(itemMainId)][groupData.dough_type] :"";

												if(!itemDoughId){
													console.log("Dough mongo id not found ".JSON.stringify(groupData));
													return parentCallback(null);
												}

												/** Not save extra item  when item is half */
												if(groupData.is_half) return parentCallback(null);

												asyncParallel({
													extra_item_id : (extraCallback)=>{

														item_extra_masters.findOne({
															restaurant_id 	:  	ObjectId(restaurantId),
															item_id 		:  	ObjectId(itemMainId),
															// item_unit		:  	ObjectId(itemDoughId),
															// item_unit_id	:  	ObjectId(doughTypeUnitMasterId),
															is_extra		:	true,
														},{projection: {_id: 1,}},(extraErr,extraResult)=>{
															let extraId = (extraResult) ? extraResult._id:"";
															if(extraErr || extraResult){
																return extraCallback(extraErr,extraId);
															}

															let updateData = {
																name  : {
																	en : groupData.item_name,
																	ar : groupData.item_name_arb,
																},
																extra_fees 	 : 0,
																modified 	 : getUtcDate(),
															};

															item_extra_masters.updateOne({
																restaurant_id 	:  	ObjectId(restaurantId),
																item_id 		:  	ObjectId(itemMainId),
																// item_unit		:  	ObjectId(itemDoughId),
																// item_unit_id	:  	ObjectId(doughTypeUnitMasterId),
																is_extra		:	true,
															},
															{
																$set		:	updateData,
																$setOnInsert:	{
																	added_by		:	superAdminId,
																	is_active		:	ACTIVE,
																	channel_id		:	CHANNEL_CRON,
																	restaurant_slug : 	restaurantSlug,
																	cravez_item_id 	:	groupData.item_id,
																	created   		:	getUtcDate(),
																	kfg		 		: 	true,
																}
															},{upsert: true },(extraInsertErr,extraInsertResult)=>{
																let extraId = (extraInsertResult &&  extraInsertResult.upsertedId && extraInsertResult.upsertedId._id) ? extraInsertResult.upsertedId._id:"";
																extraCallback(extraInsertErr,extraId);
															});
														});
													},
												},(parallelItemExtraErr,parallelItemExtraResponse)=>{
													if(parallelItemExtraErr)	parentCallback(parallelItemExtraErr);

													if(!parallelItemExtraResponse.extra_item_id){
														console.log("Extra item mongo id not found ".JSON.stringify(groupData));
														return parentCallback(null);
													}

													item_group_extras.updateOne({
														group_id 		: 	ObjectId(itemChoiceId),
														item_id 		: 	ObjectId(itemMainId),
														restaurant_id 	:	ObjectId(restaurantId),
														item_extra_id	:	parallelItemExtraResponse.extra_item_id,
														kfg_dough_type	:	groupData.dough_type,
														kfg_size		:	groupData.item_size
													},
													{
														$set	:	{
															modified 		:	getUtcDate(),
															unit_id			:	firstUnitMatserId,
															size_id			:	childMongoId,
															dough_type_id	:	itemDoughId,
															dough_master_unit_id:	doughTypeUnitMasterId,
															extra_fees 		: 	parseFloat(groupData.item_price),
															max_quantity 	: 	1,
															min_quantity 	: 	1,
														},
														$setOnInsert:	{
															channel_id				:	CHANNEL_CRON,
															added_by				:	superAdminId,
															restaurant_slug 		:	restaurantSlug,
															created   				:	getUtcDate(),
															kfg		 				: 	true,
															kfg_main_item_id 		:	groupData.item_id,
															// kfg_modifiers_groups_id :	extraRecords.group_id,
														}
													},{upsert: true },(insertErr)=>{
														parentCallback(insertErr);
													});
												});
											});
										},
									},(parallelChildErr)=>{
										eachSubCallback(parallelChildErr);
									});
								});
							});
						});
					},(asyncSubEachErr)=>{
						eachCallback(asyncSubEachErr);
					});
				},(asyncSeriesErr)=>{
					if(asyncSeriesErr){
                        console.log("migrateItemDetails async series err");
                        console.log(asyncSeriesErr);
                    }else{
						/** Update item lowest price */
						item_units.aggregate([
							{$match : {
								kfg 		: true,
								channel_id	: CHANNEL_CRON,
							}},
							{$group	:	{
								_id 	: 	"$item_id",
								item_id :	{$first : "$item_id"},
								price 	:	{$min	: "$price"},
							}},
						]).toArray((err,unitResult)=>{
							if(err) return console.error("Error on item price update ",err);

							if(unitResult.length <=0) return;

							asyncEach(unitResult,(records,eachCallback)=>{

								items.updateOne({
									_id				   	:	records.item_id,
									price_on_selection	:	0,
								},
								{$set	: {
									item_price 	: records.price,
									modified 	: getUtcDate(),
								}},(insertErr)=>{
									eachCallback(insertErr);
								});
							},(eachErr)=>{
								if(eachErr){
									console.log("migrateItemDetails async each err");
									console.log(eachErr);
								}else{
									console.log("Done migrateItemDetails");
								}
							});
						});
					}
				});
            });

            res.render('blank',{layout:false});
		});
    };// end migrateItemDetails()

    /**
	 * Function to migrate category in our database
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 *
	 * @return render
	 */
	this.migrateItemChoice = (req, res, next, db2)=>{
        const users                 =	db.collection("users");
		const items                 =	db.collection("items");
		const item_units    		=	db.collection("item_units");
		const item_units_masters    =	db.collection("item_units_masters");
		const item_choices_groups   =	db.collection("item_choices_groups");
		const item_extra_masters    =	db.collection("item_extra_masters");
		const item_group_extras     =	db.collection("item_group_extras");

		asyncParallel({
            kfg_item_list: (itemCallback)=>{
                const kfg_all_items_list = db2.collection("kfg_all_items_list");
                kfg_all_items_list.find({}).toArray((err,result)=>{
					if(err) return itemCallback(err);

					let componentData = {};
                    result.map(componentRecords=>{
						componentData[componentRecords.item_id] = componentRecords
					});
                    itemCallback(err,componentData);
                });
            },
            combo_component_list: (componentCallback)=>{
                const kfg_combo_components = db2.collection("kfg_combo_components");
                kfg_combo_components.find({}).toArray((err,result)=>{
					if(err) return componentCallback(err);

					let componentData = {};
                    result.map(componentRecords=>{
						if(!componentData[componentRecords.combo_id]) componentData[componentRecords.combo_id] = {};
						componentData[componentRecords.combo_id][componentRecords.combo_component_id] = componentRecords;
					});
                    componentCallback(err,componentData);
                });
            },
            combo_component_item_list: (componentItemCallback)=>{
				const kfg_combo_components_items = db2.collection("kfg_combo_components_items");
                kfg_combo_components_items.aggregate([
					// {$match :{
						// combo_id : 9503,
						// combo_upsell_id : 2,
						// combo_component_id : 3
					// }},
					{$addFields :{
						item_id: { $convert: { input: "$item_id", to: "string", onError: "Error", onNull: "" } },
					}},
					{$lookup:	{
						"from" 			: 	"kfg_all_items_list",
						"localField" 	:	"item_id",
						"foreignField" 	: 	"item_id",
						"as" 			: 	"item_detail"
					}},
					{$match : { "item_detail._id" : {$exists : true} }},
					{$group:{
						_id : {
							combo_id 			: 	"$combo_id",
							combo_component_id	:	"$combo_component_id",
							combo_upsell_id		: 	"$combo_upsell_id",
						},
						total_item 			:	{$sum 	:	1},
						result              :   {$push 	:	"$$ROOT"},
						combo_id			: 	{$first : 	"$combo_id"},
						combo_component_id 	:	{$first : 	"$combo_component_id"},
						combo_upsell_id		: 	{$first : 	"$combo_upsell_id"},
					}},
					{$match :{
						total_item : {$gt: 1}
					}},
				]).toArray((err,result)=>{
					if(err) return componentItemCallback(err);

					let componentData = {};
                    result.map(records=>{
						if(!componentData[records.combo_id]) componentData[records.combo_id] = {};
						if(!componentData[records.combo_id][records.combo_component_id]) componentData[records.combo_id][records.combo_component_id] = {};
						if(!componentData[records.combo_id][records.combo_component_id][records.combo_upsell_id]) componentData[records.combo_id][records.combo_component_id][records.combo_upsell_id] = [];

						componentData[records.combo_id][records.combo_component_id][records.combo_upsell_id] = records.result;
					});
					componentItemCallback(err,componentData);
				});
			},
			modifier_groups_list: (groupCallback)=>{
                const kfg_modifier_groups = db2.collection("kfg_modifier_groups");
                kfg_modifier_groups.find({}).toArray((err,result)=>{
					if(err) return groupCallback(err);

					let componentData = {};
                    result.map(componentRecords=>{
						componentData[componentRecords.group_id] = componentRecords
					});
                    groupCallback(err,componentData);
                });
            },
			modifier_groups_item_list: (groupItemCallback)=>{
                const kfg_items_modifier_map = db2.collection("kfg_items_modifier_map");
                kfg_items_modifier_map.find({
					// main_modifier_items_id : 102670

				}).toArray((err,result)=>{
					if(err) return groupItemCallback(err);

					let componentData  = {};
					result.map(componentRecords=>{
						let tempItemId 		= 	componentRecords.main_modifier_items_id;
						let tempExtraItemId = 	componentRecords.extra_modifier_item_id;
						let modifierGroupId =	componentRecords.modifier_group_id;

						if(!componentData[tempItemId]) componentData[tempItemId] = {};
						if(!componentData[tempItemId][modifierGroupId]) componentData[tempItemId][modifierGroupId] = {};
						componentData[tempItemId][modifierGroupId][tempExtraItemId] = componentRecords;
					});
                    groupItemCallback(err,componentData);
                });
            },
			super_admin_details: (superAdminDetails)=>{
				users.findOne({
                    user_role_id : CRAVEZ
                },{projection:{full_name:1,_id:1}},(superAdminErr, superAdminResult)=>{
                    superAdminDetails(superAdminErr, superAdminResult);
                });
            },
            main_item_list : (parentCallback)=>{
				items.find({
					// item_id : "834600",
					kfg : 	{ $exists: true },
					$and : [
						{$or	:	[
							{is_deal : { $exists: false }},
							{is_deal : false}
						]},
						{$or	:	[
							{is_half : { $exists: false }},
							{is_half : false}
						]},
						{$or	:	[
							{
								kfg_vgroup_id		: 	{$exists: false},
								v_group_item_ids 	:	{$exists: false},
							},
							{
								kfg_vgroup_id		: 	{$exists: true},
								v_group_item_ids 	:	{$exists: true},
								"v_group_item_ids.item_size"	:	{$eq: 0},
								"v_group_item_ids.dough_type"	:	{$eq: 0},
							}
						]},
					]
				},{projection:{item_id: 1, restaurant_slug: 1, restaurant_id:1, _id:1, kfg_vgroup_id:1, kfg_items_list_id:1, v_group_item_ids:1}}).toArray((itemErr, itemResult)=>{
                    if(itemErr) return parentCallback(itemErr);

					let itemData = {};
                    itemResult.map(itemRecords=>{
						if(itemRecords.kfg_vgroup_id && itemRecords.v_group_item_ids && itemRecords.v_group_item_ids.length >0){
							itemRecords.v_group_item_ids.map(data=>{
								itemData[data.item_id] = {
									item_main_id 		:	itemRecords._id,
									restaurant_slug 	: 	itemRecords.restaurant_slug,
									restaurant_id 		: 	itemRecords.restaurant_id,
									kfg_items_list_id	: 	data.kfg_items_list_id,
									dough_type			: 	data.dough_type,
									item_size			: 	data.item_size,
								};
							});
						}else{
							itemData[itemRecords.item_id] = {
								item_main_id 		:	itemRecords._id,
								restaurant_slug 	: 	itemRecords.restaurant_slug,
								restaurant_id 		: 	itemRecords.restaurant_id,
								kfg_items_list_id	: 	itemRecords.kfg_items_list_id,
							};
						}
					});
                    parentCallback(itemErr,itemData);
                });
			},
            unit_master_list : (parentCallback)=>{
				item_units_masters.find({
					kfg : 	{ $exists: true },
					cravez_item_id : 	{ $exists: true }
				},{projection:{cravez_item_id: 1, _id: 1}}).toArray((unitErr, unitResult)=>{
                    if(unitErr) return parentCallback(unitErr);

					let itemUnitData = {};
                    unitResult.map(unitRecords=>{
						itemUnitData[unitRecords.cravez_item_id] = unitRecords._id;
					});
                    parentCallback(unitErr,itemUnitData);
                });
			},
            dough_type_unit_list : (parentCallback)=>{
				item_units.find({
					kfg 		: 	{ $exists: true },
					parent_id 	: 	{ $exists: true }
				},{projection:{kfg_size: 1, kfg_dough_type: 1, item_unit_id:1,_id:1,item_id:1}}).toArray((unitErr, unitResult)=>{
					if(unitErr) return parentCallback(unitErr);

					let itemUnitData = {};
                    unitResult.map(unitRecords=>{
						let tempItemId 		=	String(unitRecords.item_id);
						let kfgSize 		= 	String(unitRecords.kfg_size);
						let kfgDoughType 	= 	String(unitRecords.kfg_dough_type);

						if(!itemUnitData[tempItemId])  itemUnitData[tempItemId] = {};
						if(!itemUnitData[tempItemId][kfgSize])  itemUnitData[tempItemId][kfgSize] = {};
						itemUnitData[tempItemId][kfgSize][kfgDoughType] = unitRecords;
					});
                    parentCallback(unitErr,itemUnitData);
                });
			},
        },(parallelErr,asyncReponse)=>{
			if(parallelErr) return console.error(parallelErr);

			// return res.send({asyncReponse : asyncReponse.modifier_groups_item_list});

			if(!asyncReponse.super_admin_details) 	return console.error("Admin user details not found in migrateItemChoice.");
			if(Object.keys(asyncReponse.main_item_list).length <=0) 	return console.error("Item details not found migrateItemChoice.");

			let superAdminId 		=	asyncReponse.super_admin_details._id;
			let kfgItemList			=	asyncReponse.kfg_item_list;
			let modifierGroupsList	=	asyncReponse.modifier_groups_list;
			let groupItemList		=	asyncReponse.modifier_groups_item_list;
			let mainItemList 		=	asyncReponse.main_item_list;
			let componentList 		=	asyncReponse.combo_component_list;
			let componentItemList	= 	asyncReponse.combo_component_item_list;
			let unitMasterList		= 	asyncReponse.unit_master_list;
			let doughTypeUnitList	= 	asyncReponse.dough_type_unit_list;
			let notFoundDetails 	=   {group :{}, main_item: {}, extra_item: {} };

			let modifierChoiesGroup 	=	{};
			let modifierExtraItemList 	=	[];
			let comboChoiesGroup 		=	{};
			let comboExtraItemList		=	[];
			let upsellList 				=	{};

			Object.keys(mainItemList).map(itemId=>{

				/** Modifier item list */
				if(groupItemList[itemId]){
					Object.keys(groupItemList[itemId]).map(groupId=>{
						if(modifierGroupsList[groupId]){
							Object.keys(groupItemList[itemId][groupId]).map(extraItemId=>{
								if(kfgItemList[extraItemId]){

									if(!modifierChoiesGroup[itemId] || !modifierChoiesGroup[itemId][groupId]){
										if(!modifierChoiesGroup[itemId]) modifierChoiesGroup[itemId] = {};
										modifierChoiesGroup[itemId][groupId] = {
											item_main_id 				:	mainItemList[itemId].item_main_id,
											restaurant_id 				:	mainItemList[itemId].restaurant_id,
											restaurant_slug				:	mainItemList[itemId].restaurant_slug,

											kfg_item_id					:	itemId,
											kfg_modifiers_groups_id		:	groupId,
											choice_group_en_name 		:	modifierGroupsList[groupId].group_name,
											choice_group_ar_name 		:	modifierGroupsList[groupId].group_name_arb,
											choice_group_min_quantity 	:	modifierGroupsList[groupId].group_min,
											choice_group_max_quantity 	:	modifierGroupsList[groupId].group_max,
											choice_group_record_date 	:	modifierGroupsList[groupId].record_date,
										};
									}

									let doughType 		=	(mainItemList[itemId].dough_type) ? mainItemList[itemId].dough_type :"";
									let itemSize 		= 	(mainItemList[itemId].item_size) ? mainItemList[itemId].item_size :"";
									let unitId			=	"";
									let unitMasterId	=	unitMasterList[itemId];

									if(doughTypeUnitList[String(mainItemList[itemId].item_main_id)] && doughTypeUnitList[String(mainItemList[itemId].item_main_id)][itemSize] && doughTypeUnitList[String(mainItemList[itemId].item_main_id)][itemSize][doughType]){
										unitId		 = doughTypeUnitList[String(mainItemList[itemId].item_main_id)][itemSize][doughType]._id;
										unitMasterId = doughTypeUnitList[String(mainItemList[itemId].item_main_id)][itemSize][doughType].item_unit_id;
									}

									modifierExtraItemList.push({
										item_main_id 				:	mainItemList[itemId].item_main_id,
										restaurant_id 				:	mainItemList[itemId].restaurant_id,
										restaurant_slug				:	mainItemList[itemId].restaurant_slug,
										kfg_modifiers_groups_id		:	groupId,
										kfg_item_id					:	itemId,
										extra_item_order			:	groupItemList[itemId][groupId][extraItemId].seq,
										kfg_extra_item_id			:	parseInt(kfgItemList[extraItemId].item_id),
										extra_item_en_name	 		:	kfgItemList[extraItemId].item_name,
										extra_item_ar_name	 		:	kfgItemList[extraItemId].item_name_arb,
										extra_item_price			:	kfgItemList[extraItemId].item_price,
										extra_item_en_description	:	kfgItemList[extraItemId].item_description,
										extra_item_ar_description	:	kfgItemList[extraItemId].item_description_arb,
										extra_item_record_date		:	kfgItemList[extraItemId].record_date,
										item_availablity_status		:	parseInt(kfgItemList[extraItemId].item_availablity_status),
										extra_item_unit_id	 		:	unitMasterId,
										extra_item_unit		 		:	unitId,
									});
								}else{
									if(!notFoundDetails.extra_item[extraItemId]){
										notFoundDetails.extra_item[extraItemId] =  extraItemId;
										console.error("Modifier extra item details not found for item id - "+itemId+" extra item id- "+extraItemId);
									}
								}
							});
						}else{
							if(!notFoundDetails.group[groupId]){
								notFoundDetails.group[groupId] =  groupId;
								console.log("Group details not found ",groupId);
							}
						}
					});
				}

				if(componentList[itemId] && componentItemList[itemId]){
					Object.keys(componentItemList[itemId]).map(tempComponentId=>{
						Object.keys(componentItemList[itemId][tempComponentId]).map((tempUpSellId,indexf)=>{
							asyncReponse.combo_component_item_list[itemId][tempComponentId][tempUpSellId].map(records=>{
								let componentId 	= 	records.combo_component_id;
								let comboUpsellId 	=	records.combo_upsell_id;
								let extraItemId		=	records.item_id;

								if(componentList[itemId][componentId]){
									if(kfgItemList[extraItemId]){
										let componentDetails = componentList[itemId][componentId];


										if(!comboChoiesGroup[itemId] || !comboChoiesGroup[itemId][componentId]){
											if(!comboChoiesGroup[itemId]) comboChoiesGroup[itemId] = {};

											comboChoiesGroup[itemId][componentId] = {
												item_main_id 				:	mainItemList[itemId].item_main_id,
												restaurant_id 				:	mainItemList[itemId].restaurant_id,
												restaurant_slug				:	mainItemList[itemId].restaurant_slug,
												kfg_combo_components_id		:	componentId,
												choice_group_en_name 		:	componentDetails.combo_component_name,
												choice_group_ar_name 		:	componentDetails.combo_component_name_arb,
												choice_group_record_date 	:	componentDetails.record_date,
												kfg_upsell_id			 	:	comboUpsellId,
												order			 			:	1,
											};
										}
										if(!upsellList[itemId] || !upsellList[itemId][comboUpsellId]){
											if(!upsellList[itemId]) upsellList[itemId] = {};

											upsellList[itemId][comboUpsellId] = {
												item_main_id 				:	mainItemList[itemId].item_main_id,
												restaurant_id 				:	mainItemList[itemId].restaurant_id,
												restaurant_slug				:	mainItemList[itemId].restaurant_slug,
											};
										}

										comboExtraItemList.push({
											item_main_id 				:	mainItemList[itemId].item_main_id,
											restaurant_id 				:	mainItemList[itemId].restaurant_id,
											restaurant_slug				:	mainItemList[itemId].restaurant_slug,

											kfg_combo_components_id		:	componentId,
											kfg_item_id					:	itemId,
											kfg_extra_item_id			:	parseInt(extraItemId),
											extra_item_order			:	kfgItemList[extraItemId].seq,
											extra_item_ar_name	 		:	kfgItemList[extraItemId].item_name_arb,
											extra_item_en_name	 		:	kfgItemList[extraItemId].item_name,
											extra_item_price			:	kfgItemList[extraItemId].item_price,
											extra_item_short_name	 	:	records.item_short_name,
											kfg_upsell_id				:	comboUpsellId,
											sur_chg_usel				:	records.sur_chg_usel,
											size_sur_chg				:	records.size_sur_chg,
											crv_price_category			:	records.crv_price_category,
										});
									}else{
										console.error("Combo extra item details not found for item id - "+itemId+" extra item id- "+extraItemId);
									}
								}else{
									console.error("Combo component details not found.",componentId);
								}
							});
						});
					});
				}
			});


			// return res.send({
				// modifierChoiesGroup 	: 	modifierChoiesGroup,
				// modifierExtraItemList 	: 	modifierExtraItemList,
				// comboChoiesGroup	 	: 	comboChoiesGroup,
				// comboExtraItemList 		:	comboExtraItemList,
			// });

			asyncParallel({
				combo_item_list: (itemCallback)=>{
					if(Object.keys(upsellList).length <= 0 || Object.keys(comboChoiesGroup).length <= 0  || comboExtraItemList.length <= 0){
						console.log("Combo some details not found");
						console.log("upsellList Count "+Object.keys(upsellList).length);
						console.log("comboChoiesGroup Count "+Object.keys(comboChoiesGroup).length);
						console.log("comboExtraItemList Count "+comboExtraItemList.length);
						return itemCallback(null);
					}

					let finalUpSellIds 	= 	{};
					let comboChoiceIds 	=	{};
					asyncParallel({
						upsell_item_list: (upsellCallback)=>{
							asyncForEachOf(upsellList,(re,itemId,eachCallback)=>{
								asyncForEachOf(upsellList[itemId],(records,tempUpSellId,eachChildCallback)=>{
									let tempRestaurantId 	=	records.restaurant_id;
									let tempRestaurantSlug 	= 	records.restaurant_slug;

									/** Get size details details */
									item_units_masters.findOne({
										combo_upsell_id : parseInt(tempUpSellId),
										restaurant_id 	: ObjectId(tempRestaurantId),
									},{projection: {_id: 1,}},(masterErr,masterResult)=>{
										if(masterErr) return eachChildCallback(masterErr);

										if(masterResult){
											if(!finalUpSellIds[itemId]) finalUpSellIds[itemId] ={};
											finalUpSellIds[itemId][tempUpSellId] = masterResult._id;
										}
										return eachChildCallback(masterErr);

										/** Save unit master detils */
										item_units_masters.updateOne({
											combo_upsell_id : parseInt(tempUpSellId),
											restaurant_id 	: ObjectId(tempRestaurantId),
										},
										{
											$set	:	{
												name   : {
													en : UPSELL_TYPE_OBJECT[tempUpSellId].en,
													ar : UPSELL_TYPE_OBJECT[tempUpSellId].ar,
												},
												modified : getUtcDate(),
											},
											$setOnInsert:	{
												added_by		:	superAdminId,
												channel_id		:	CHANNEL_CRON,
												restaurant_slug :	tempRestaurantSlug,
												created   		:	getUtcDate(),
												kfg		 		: 	true,
											}
										},{upsert: true },(insertErr,insertResult)=>{
											if(insertResult &&  insertResult.upsertedId && insertResult.upsertedId._id){
												if(!finalUpSellIds[itemId]) finalUpSellIds[itemId] ={};
												finalUpSellIds[itemId][tempUpSellId] = insertResult.upsertedId._id;
											}
											eachChildCallback(insertErr);
										});
									});
								},(asyncChildEachErr)=>{
									eachCallback(asyncChildEachErr);
								});
							},(asyncEachErr)=>{
								upsellCallback(asyncEachErr);
							});
						},
						choice_group_list: (comboChoiceCallback)=>{
							asyncForEachOf(comboChoiesGroup,(re,itemId,forEachCallback)=>{
								asyncForEachOf(comboChoiesGroup[itemId],(records,componentId, forEachChildCallback)=>{
									let tempRestaurantId 	=	records.restaurant_id;
									let tempRestaurantSlug 	= 	records.restaurant_slug;
									let tempItemMainId 		= 	records.item_main_id;

									/** Get item choice details */
									item_choices_groups.findOne({
										item_id 				: 	ObjectId(tempItemMainId),
										restaurant_id 			:	ObjectId(tempRestaurantId),
										kfg_combo_components_id : 	parseInt(componentId),
									},{projection: {_id: 1,}},(masterErr,masterResult)=>{
										if(masterErr) return forEachChildCallback(masterErr);

										if(masterResult){
											if(!comboChoiceIds[itemId]) comboChoiceIds[itemId] ={};
											if(!comboChoiceIds[itemId][componentId]) comboChoiceIds[itemId][componentId] = masterResult._id;
											return forEachChildCallback(masterErr);
                                        }

										/** Save item choice detils */
										item_choices_groups.updateOne({
											item_id 				: 	ObjectId(tempItemMainId),
											restaurant_id 			:	ObjectId(tempRestaurantId),
											kfg_combo_components_id : 	parseInt(componentId),
										},
										{
											$set	:	{
												name   : {
													en : records.choice_group_en_name,
													ar : records.choice_group_ar_name,
												},
												order 	 : 1,
												modified : getUtcDate(),
											},
											$setOnInsert:	{
												min_quantity 	:	1,
												max_quantity 	: 	1,
												added_by		:	superAdminId,
												channel_id		:	CHANNEL_CRON,
												restaurant_slug :	tempRestaurantSlug,
												created   		:	getUtcDate(records.choice_group_record_date),
												kfg		 		: 	true,
											}
										},{upsert: true },(insertErr,insertResult)=>{
											if(insertResult &&  insertResult.upsertedId && insertResult.upsertedId._id){
												if(!comboChoiceIds[itemId]) comboChoiceIds[itemId] ={};
												if(!comboChoiceIds[itemId][componentId]) comboChoiceIds[itemId][componentId] = insertResult.upsertedId._id;
											}
											forEachChildCallback(insertErr);
										});
									});
								},(asyncChildEachErr)=>{
									forEachCallback(asyncChildEachErr);
								});
							},(asyncEachErr)=>{
								comboChoiceCallback(asyncEachErr);
							});
						},
					},(parallelSubErr)=>{
						if(parallelSubErr) return itemCallback(parallelSubErr);

						asyncForEachOf(comboExtraItemList,(records,key,forEachSubCallback)=>{
							let tempRestaurantId 	=	records.restaurant_id;
							let tempRestaurantSlug 	= 	records.restaurant_slug;
							let tempItemMainId 		= 	records.item_main_id;
							let kfgItemId 			= 	parseInt(records.kfg_item_id);
							let kfgUpsellId 		= 	records.kfg_upsell_id;
							let kfgComboComponentsId= 	records.kfg_combo_components_id;

							if(!comboChoiceIds[kfgItemId] || !comboChoiceIds[kfgItemId][kfgComboComponentsId]){
								forEachSubCallback(null);
								return console.log("Combo Choice group details not found item id - "+kfgItemId+" Components id - "+kfgComboComponentsId,"\n");
							}
							if(!finalUpSellIds[kfgItemId] || !finalUpSellIds[kfgItemId][kfgUpsellId]){
								forEachSubCallback(null);
								return console.log("Combo Unit details not found item id - "+kfgItemId+" upsell id - "+kfgUpsellId,"\n");
							}

							let groupId 	= 	comboChoiceIds[kfgItemId][kfgComboComponentsId];
							let itemUnitId 	=	finalUpSellIds[kfgItemId][kfgUpsellId];

							asyncParallel({
								extra_item_details: (extraItemCallback)=>{
									/** Get extra master details */
									item_extra_masters.findOne({
										item_id 		: 	ObjectId(tempItemMainId),
										restaurant_id 	:	ObjectId(tempRestaurantId),
										extra_item_id	:	records.kfg_extra_item_id,
										kfg_combo_components_id :	kfgComboComponentsId,
									},{projection: {_id: 1,}},(masterErr,masterResult)=>{
										let masterId = (masterResult) ? masterResult._id :"";
										if(masterErr || masterResult) return extraItemCallback(masterErr,masterId);

										/** Save extra master details */
										item_extra_masters.updateOne({
											item_id 		: 	ObjectId(tempItemMainId),
											restaurant_id 	:	ObjectId(tempRestaurantId),
											extra_item_id	:	records.kfg_extra_item_id,
											kfg_combo_components_id :	kfgComboComponentsId,
											item_unit_id 	: 	ObjectId(itemUnitId),
										},
										{
											$set	:	{
												name   : {
													en : records.extra_item_en_name,
													ar : records.extra_item_ar_name,
												},
												modified 				:	getUtcDate(),
												extra_fees		 		:	(records.extra_item_price) ? parseFloat(records.extra_item_price) 	:0,
												order			 		:	(records.extra_item_order) ? parseInt(records.extra_item_order) 	:0,
												kfg_sur_chg_usel 		:	records.sur_chg_usel,
												kfg_size_sur_chg 		: 	records.size_sur_chg,
												kfg_crv_price_category 	:	records.crv_price_category,
												item_short_name		 	:	records.extra_item_short_name,
											},
											$setOnInsert:	{
												is_active		:	ACTIVE,
												channel_id		:	CHANNEL_CRON,
												added_by		:	superAdminId,
												restaurant_slug :	tempRestaurantSlug,
												created   		:	getUtcDate(),
												kfg		 		: 	true,
												kfg_main_item_id:	kfgItemId,
												kfg_upsell_id 	:	kfgUpsellId,
											}
										},{upsert: true },(insertErr,insertResult)=>{
											let masterId = (insertResult &&  insertResult.upsertedId && insertResult.upsertedId._id) ? insertResult.upsertedId._id:"";
											extraItemCallback(insertErr,masterId);
										});
									});
								}
							},(asyncExtraErr,asyncExtraResponse)=>{
								if(asyncExtraErr) return forEachSubCallback(asyncExtraErr);

								if(!asyncExtraResponse.extra_item_details){
									console.log("Combo extra item details not found ",JSON.stringify(records),"\n");
									return forEachSubCallback(asyncExtraErr);
								}

								/** Save item group details */
								item_group_extras.updateOne({
									group_id 		: 	ObjectId(groupId),
									item_id 		: 	ObjectId(tempItemMainId),
									restaurant_id 	:	ObjectId(tempRestaurantId),
									item_extra_id	:	asyncExtraResponse.extra_item_details,
								},
								{
									$set	:	{
										extra_fees	:	(records.extra_item_price) ? parseFloat(records.extra_item_price) :0,
										modified 	:	getUtcDate(),
									},
									$setOnInsert:	{
										channel_id		:	CHANNEL_CRON,
										added_by		:	superAdminId,
										restaurant_slug :	tempRestaurantSlug,
										unit_id 		: 	ObjectId(itemUnitId),
										created   		:	getUtcDate(),
										kfg		 		: 	true,
										kfg_main_item_id:	kfgItemId,
										kfg_upsell_id 	:	kfgUpsellId,
										kfg_combo_components_id :	kfgComboComponentsId,
									}
								},{upsert: true },(insertErr)=>{
									forEachSubCallback(insertErr);
								});
							});
						},(asyncEachSubErr)=>{
							itemCallback(asyncEachSubErr);
						});
					});
				},
				modifier_item_list: (itemCallback)=>{
					if(Object.keys(modifierChoiesGroup).length <= 0 || modifierExtraItemList.length <= 0){
						console.log("Modifier some details not found");
						console.log("modifierChoiesGroup Count "+Object.keys(modifierChoiesGroup).length);
						console.log("modifierExtraItemList Count "+modifierExtraItemList.length);
						return itemCallback(null);
					}

					let finalGroupIds 	= 	{};
					asyncParallel({
						choice_group_list: (modifierChoiceCallback)=>{
							asyncForEachOf(modifierChoiesGroup,(reco,itemId,forEachCallback)=>{
								asyncForEachOf(modifierChoiesGroup[itemId],(records,groupId,forEachChildCallback)=>{
									let tempRestaurantId 			=	records.restaurant_id;
									let tempRestaurantSlug 			= 	records.restaurant_slug;
									let tempItemMainId 			 	= 	records.item_main_id;
									let tempKfgModifiersGroupsId 	= 	records.kfg_modifiers_groups_id;

									/** Get item choice group details */
									item_choices_groups.findOne({
										item_id 				: 	ObjectId(tempItemMainId),
										restaurant_id 			:	ObjectId(tempRestaurantId),
										kfg_modifiers_groups_id : 	parseInt(tempKfgModifiersGroupsId),
									},{projection: {_id: 1,}},(masterErr,masterResult)=>{
										if(masterErr) return forEachChildCallback(masterErr);

										if(masterResult){
											if(!finalGroupIds[String(tempItemMainId)]) finalGroupIds[String(tempItemMainId)] = {};
											finalGroupIds[String(tempItemMainId)][groupId] = masterResult._id;
											return forEachChildCallback(masterErr);
										}

										/** Save choice group detils */
										item_choices_groups.updateOne({
											item_id 				: 	ObjectId(tempItemMainId),
											restaurant_id 			:	ObjectId(tempRestaurantId),
											kfg_modifiers_groups_id : 	parseInt(tempKfgModifiersGroupsId),
										},
										{
											$set	:	{
												name	: {
													en 	: records.choice_group_en_name,
													ar	: records.choice_group_ar_name,
												},
												min_quantity 	:	records.choice_group_min_quantity,
												max_quantity 	: 	records.choice_group_max_quantity,
												order 			:	1,
												modified 		:	getUtcDate(),
											},
											$setOnInsert:	{
												kfg		 		: 	true,
												added_by		:	superAdminId,
												channel_id		:	CHANNEL_CRON,
												restaurant_slug :	tempRestaurantSlug,
												created   		:	getUtcDate(),
											}
										},{upsert: true },(insertErr,insertResult)=>{
											if(insertResult &&  insertResult.upsertedId && insertResult.upsertedId._id){
												if(!finalGroupIds[String(tempItemMainId)]) finalGroupIds[String(tempItemMainId)] = {};
												finalGroupIds[String(tempItemMainId)][groupId] = insertResult.upsertedId._id;
											}
											forEachChildCallback(insertErr);
										});
									});
								},(asyncEachChildErr)=>{
									forEachCallback(asyncEachChildErr);
								});
							},(asyncEachErr)=>{
								modifierChoiceCallback(asyncEachErr);
							});
						},
					},(parallelSubErr)=>{
						if(parallelSubErr) return itemCallback(parallelSubErr);

						asyncForEachOf(modifierExtraItemList,(records,key,forEachSubCallback)=>{
							let tempRestaurantId 	=	records.restaurant_id;
							let tempRestaurantSlug 	= 	records.restaurant_slug;
							let tempItemMainId 		= 	records.item_main_id;
							let kfgItemId 			= 	records.kfg_item_id;
							let kfgModifiersGroupsId= 	records.kfg_modifiers_groups_id;

							if(!finalGroupIds[String(tempItemMainId)] || !finalGroupIds[String(tempItemMainId)][kfgModifiersGroupsId]){
								forEachSubCallback(null);
								return console.log("Modifier Choice group details not found ",JSON.stringify(records));
							}

							let groupId 	= 	finalGroupIds[String(tempItemMainId)][kfgModifiersGroupsId];
							let itemUnitId  = 	records.extra_item_unit_id;
							let itemUnit	= 	records.extra_item_unit;

							asyncParallel({
								extra_item_details: (extraItemCallback)=>{

									let extraMasterConditions = {
										item_id 		: 	ObjectId(tempItemMainId),
										restaurant_id 	:	ObjectId(tempRestaurantId),
										extra_item_id	:	records.kfg_extra_item_id,
										kfg_modifiers_groups_id :	kfgModifiersGroupsId,
										kfg_main_item_id:	kfgItemId,
									};

									if(itemUnitId) extraMasterConditions.item_unit_id 	= ObjectId(itemUnitId);
									if(itemUnit) extraMasterConditions.item_unit 		= ObjectId(itemUnit);

									/** Get extra master details */
									item_extra_masters.findOne(extraMasterConditions,{projection: {_id: 1,}},(masterErr,masterResult)=>{
										let masterId = (masterResult) ? masterResult._id :"";
										if(masterErr || masterResult) return extraItemCallback(masterErr,masterId);

										let extrsItemUpdateData = {
											name   : {
												en : records.extra_item_en_name,
												ar : records.extra_item_ar_name,
											},
											order 		:	records.extra_item_order,
											extra_fees 	:	parseFloat(records.extra_item_price),
											modified 	:	getUtcDate(),
										};

										if(records.extra_item_en_description || records.extra_item_ar_description){
											extrsItemUpdateData.description = {
												en : records.extra_item_en_description,
												ar : records.extra_item_ar_description,
											};
										}

										/** Save extra master details */
										item_extra_masters.updateOne(extraMasterConditions,
										{
											$set		:	extrsItemUpdateData,
											$setOnInsert:	{
												kfg		 		: 	true,
												channel_id		:	CHANNEL_CRON,
												added_by		:	superAdminId,
												restaurant_slug :	tempRestaurantSlug,
												is_active		:	parseInt(records.item_availablity_status),
												created   		:	getUtcDate(records.extra_item_record_date),

											}
										},{upsert: true },(insertErr,insertResult)=>{
											let masterId = (insertResult &&  insertResult.upsertedId && insertResult.upsertedId._id) ? insertResult.upsertedId._id:"";
											extraItemCallback(insertErr,masterId);
										});
									});
								}
							},(asyncExtraErr,asyncExtraResponse)=>{
								if(asyncExtraErr) return forEachSubCallback(asyncExtraErr);

								if(!asyncExtraResponse.extra_item_details){
									console.log("Modifier extra item details not found ",JSON.stringify(records));
									return forEachSubCallback(asyncExtraErr);
								}

								let extraConditions = {
									group_id 		: 	ObjectId(groupId),
									item_id 		: 	ObjectId(tempItemMainId),
									restaurant_id 	:	ObjectId(tempRestaurantId),
									item_extra_id	:	asyncExtraResponse.extra_item_details,
								};

								if(itemUnitId) extraConditions.unit_id = ObjectId(itemUnitId);

								/** Save item group details */
								item_group_extras.updateOne(extraConditions,
								{
									$set	:	{
										modified :	getUtcDate(),
									},
									$setOnInsert:	{
										channel_id		:	CHANNEL_CRON,
										added_by		:	superAdminId,
										restaurant_slug :	tempRestaurantSlug,
										created   		:	getUtcDate(),
										extra_fees 		:	parseFloat(records.extra_item_price),
										kfg		 		: 	true,
										kfg_main_item_id 		:	kfgItemId,
										kfg_modifiers_groups_id :	kfgModifiersGroupsId,
									}
								},{upsert: true },(insertErr)=>{
									forEachSubCallback(insertErr);
								});
							});
						},(asyncEachSubErr)=>{
							itemCallback(asyncEachSubErr);
						});
					});
				},
			},(asyncErr)=>{
                if(asyncErr){
                    console.log("migrateItemChoice err");
                    return console.log(asyncErr);
				}
				console.log("Done migrateItemChoice");
			});

			res.render('blank',{layout:false});
        });
	};// end migrateItemChoice()

	/**
	 * Function to migrate category in our database
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 *
	 * @return render
	 */
	this.migrateDealItem = (req, res, next, db2)=>{
		const users                 =	db.collection("users");
		const items                 =	db.collection("items");
		const item_units		    =	db.collection("item_units");
		const item_dough_units	    =	db.collection("item_dough_units");
		const item_selector_units	=	db.collection("item_selector_units");
		const item_units_masters    =	db.collection("item_units_masters");
		const item_choices_groups   =	db.collection("item_choices_groups");
		const item_extra_masters    =	db.collection("item_extra_masters");
		const item_group_extras     =	db.collection("item_group_extras");

		asyncParallel({
			kfg_item_list: (itemCallback)=>{
				const kfg_all_items_list = db2.collection("kfg_all_items_list");
				kfg_all_items_list.find({}).toArray((err,result)=>{
					if(err) return itemCallback(err);

					let componentData = {};
					result.map(componentRecords=>{
						componentData[componentRecords.item_id] = componentRecords
					});
					itemCallback(err,componentData);
				});
			},
			selector_list: (selectorCallback)=>{
				const kfg_pizz_hut_selector = db2.collection("kfg_pizz_hut_selector");
				kfg_pizz_hut_selector.find({}).toArray((err,result)=>{
					if(err) return selectorCallback(err);

					let componentData = {};
					result.map(componentRecords=>{
						componentData[componentRecords.selector_id] = componentRecords
					});
					selectorCallback(err,componentData);
				});
			},
			item_size_list: (itemCallback)=>{
				const kfg_sizes = db2.collection("kfg_sizes");
				kfg_sizes.find({}).toArray((err,result)=>{
					if(err) return itemCallback(err);

					let componentData = {};
					result.map(componentRecords=>{
						componentData[componentRecords.size_id] = componentRecords
					});
					itemCallback(err,componentData);
				});
			},
			item_dough_type_list: (itemCallback)=>{
				const kfg_dough_type_list = db2.collection("kfg_dough_type_list");
				kfg_dough_type_list.find({}).toArray((err,result)=>{
					if(err) return itemCallback(err);

					let componentData = {};
					result.map(componentRecords=>{
						componentData[componentRecords.dough_id] = componentRecords
					});
					itemCallback(err,componentData);
				});
			},
			modifier_groups_item_list: (groupItemCallback)=>{
				const kfg_items_modifier_map = db2.collection("kfg_items_modifier_map");
				kfg_items_modifier_map.aggregate([
					// {$match :{
					// 	$or :[
					// 		{main_modifier_items_id : 130001},
					// 		{main_modifier_items_id : 103730},
					// 	]
					// }},
					{$group	:	{
						_id : 	{
							modifier_group_id		: 	"$modifier_group_id",
							main_modifier_items_id 	:	"$main_modifier_items_id",
							group_class				: 	"$group_class",
						},
						modifier_group_id 		:	{$first : 	"$modifier_group_id"},
						main_modifier_items_id 	:	{$first : 	"$main_modifier_items_id"},
						group_class 			:	{$first : 	"$group_class"},
						group_item_list 		: 	{$push 	: 	"$$ROOT"}
					}},
					{$sort:	{"_id.group_class" : SORT_ASC }},
					{$lookup:	{
						"from" 			: 	"kfg_modifier_groups",
						"localField" 	:	"modifier_group_id",
						"foreignField" 	: 	"group_id",
						"as" 			: 	"group_detail"
					}},
					{$match :{ "group_detail._id" :{$exists : true} }},
					{$addFields :{
						group_name 		:	{$arrayElemAt: ["$group_detail.group_name",0]},
						group_name_arb 	: 	{$arrayElemAt: ["$group_detail.group_name_arb",0]},
						group_min 		: 	{$arrayElemAt: ["$group_detail.group_min",0]},
						group_max 		: 	{$arrayElemAt: ["$group_detail.group_max",0]},
					}},
					{$project :{_id :0, group_detail:0 }},
				]).toArray((err,result)=>{
					groupItemCallback(err,result);
				});
			},
			super_admin_details: (superAdminDetails)=>{
				users.findOne({
					user_role_id : CRAVEZ
				},{projection:{full_name:1,_id:1}},(superAdminErr, superAdminResult)=>{
					superAdminDetails(superAdminErr, superAdminResult);
				});
			},
			main_item_list : (parentCallback)=>{
				items.find({
					// item_id : 	"130001",

					kfg 	: 	true,
					is_deal :	true
				},{projection:{item_id: 1, restaurant_slug: 1, restaurant_id:1, _id:1, kfg_vgroup_id:1, kfg_items_list_id:1, v_group_item_ids:1}}).toArray((itemErr, itemResult)=>{
					if(itemErr) return parentCallback(itemErr);

					let itemData = {};
					itemResult.map(itemRecords=>{
						if(itemRecords.kfg_vgroup_id && itemRecords.v_group_item_ids && itemRecords.v_group_item_ids.length >0){
							itemRecords.v_group_item_ids.map(data=>{
								itemData[data.item_id] = {
									item_main_id 		:	itemRecords._id,
									restaurant_slug 	: 	itemRecords.restaurant_slug,
									restaurant_id 		: 	itemRecords.restaurant_id,
									kfg_items_list_id	: 	data.kfg_items_list_id,
								};
							});
						}else{
							itemData[itemRecords.item_id] = {
								item_main_id 		:	itemRecords._id,
								restaurant_slug 	: 	itemRecords.restaurant_slug,
								restaurant_id 		: 	itemRecords.restaurant_id,
								kfg_items_list_id	: 	itemRecords.kfg_items_list_id,
							};
						}
					});
					parentCallback(itemErr,itemData);
				});
			},
		},(parallelErr,asyncReponse)=>{
			if(parallelErr) return console.error(parallelErr);

			// return res.send({asyncReponse : asyncReponse.modifier_groups_item_list});

			if(!asyncReponse.super_admin_details) 	return res.send("Admin user details not found in migrateItemChoice.");
			if(Object.keys(asyncReponse.main_item_list).length <=0) 	return res.send("Item details not found migrateItemChoice.");

			let superAdminId 		=	asyncReponse.super_admin_details._id;
			let kfgItemList			=	asyncReponse.kfg_item_list;
			let groupItemList		=	asyncReponse.modifier_groups_item_list;
			let mainItemList 		=	asyncReponse.main_item_list;
			let itemDoughTypeList	=	asyncReponse.item_dough_type_list;
			let itemSizeList		=	asyncReponse.item_size_list;
			let selectorList		=	asyncReponse.selector_list;
			let notFoundDetails 	=   {group :{}, main_item: {}, extra_item: {}, dough_type: {}, item_size:{}};

			let modifierUnitMaster 		=	{};
			let modifierChoiesGroup 	=	{};
			let modifierExtraItemList 	=	[];
			let itemgroupCount 			=	{};
			if(groupItemList.length >=0){
				Object.keys(mainItemList).map(itemId=>{
					groupItemList.map(groupdata=>{
						let groupId  	= 	groupdata.modifier_group_id;
						let groupClass 	= 	groupdata.group_class;

						if(groupdata.main_modifier_items_id == itemId && groupdata.group_item_list.length >0){
							groupdata.group_item_list.map(groupItemData=>{
								let extraItemId =	groupItemData.extra_modifier_item_id;
								if(kfgItemList[extraItemId]){
									if(kfgItemList[extraItemId].dough_type >0){
										let tempItemSize 	=	kfgItemList[extraItemId].item_size;
										let tempDoughType	= 	kfgItemList[extraItemId].dough_type;
										let tempSelector 	= 	kfgItemList[extraItemId].selector;

										if(typeof itemSizeList[String(tempItemSize)] !== typeof Object){
											if(typeof  itemDoughTypeList[tempDoughType] !== typeof Object){



												if(!modifierUnitMaster[itemId] || !modifierUnitMaster[itemId][extraItemId]){
													if(!modifierUnitMaster[itemId]) modifierUnitMaster[itemId] = {};
													modifierUnitMaster[itemId][extraItemId] = {
														item_main_id 		:	mainItemList[itemId].item_main_id,
														restaurant_id 		:	mainItemList[itemId].restaurant_id,
														restaurant_slug		:	mainItemList[itemId].restaurant_slug,
														dough_type			:	tempDoughType,
														item_size			:	tempItemSize,
														seq					: 	kfgItemList[extraItemId].seq,
														selector			: 	kfgItemList[extraItemId].selector,
														item_availablity_status	: 	kfgItemList[extraItemId].item_availablity_status,
														item_price			:	kfgItemList[extraItemId].item_price,
														item_name			:	(selectorList[tempSelector]) ? selectorList[tempSelector].en_name :kfgItemList[extraItemId].item_name,
														item_name_arb		:	(selectorList[tempSelector]) ? selectorList[tempSelector].arb_name:kfgItemList[extraItemId].item_name_arb,
														item_description	:	kfgItemList[extraItemId].item_description,
														item_description_arb:	kfgItemList[extraItemId].item_description_arb,
														size_en_name		: 	itemSizeList[tempItemSize].size_en_name,
														size_ar_name		: 	itemSizeList[tempItemSize].size_ar_name,
														dough_type_en_name	: 	itemDoughTypeList[tempDoughType].dough_type,
														dough_type_arb_name	: 	itemDoughTypeList[tempDoughType].dough_type_arb,
														dough_type_en_desc	: 	itemDoughTypeList[tempDoughType].dough_desc,
														dough_type_ar_desc	: 	itemDoughTypeList[tempDoughType].dough_desc_arb,
													};

												}
												if(!itemgroupCount[mainItemList[itemId].item_main_id]) itemgroupCount[mainItemList[itemId].item_main_id] = {};
												itemgroupCount[mainItemList[itemId].item_main_id][groupClass] = true;
											}else{
												if(!notFoundDetails.dough_type[tempDoughType]){
													notFoundDetails.dough_type[tempDoughType] =  tempDoughType;
													console.log("Extra Item Dough type details not found ",JSON.stringify(kfgItemList[extraItemId]));
												}
											}
										}else{
											if(!notFoundDetails.item_size[tempItemSize]){
												notFoundDetails.item_size[tempItemSize] =  tempItemSize;
												console.log("Extra Item Size details not found ",JSON.stringify(kfgItemList[extraItemId]));
											}
										}
									}else{
										if(!modifierChoiesGroup[itemId] || !modifierChoiesGroup[itemId][groupClass] || !modifierChoiesGroup[itemId][groupClass][groupId]){
											if(!modifierChoiesGroup[itemId]) modifierChoiesGroup[itemId] = {};
											if(!modifierChoiesGroup[itemId][groupClass]) modifierChoiesGroup[itemId][groupClass] = {};
											modifierChoiesGroup[itemId][groupClass][groupId] = {
												item_main_id 				:	mainItemList[itemId].item_main_id,
												restaurant_id 				:	mainItemList[itemId].restaurant_id,
												restaurant_slug				:	mainItemList[itemId].restaurant_slug,

												group_class					:	groupClass,
												kfg_item_id					:	itemId,
												kfg_modifiers_groups_id		:	groupId,
												choice_group_en_name 		:	groupdata.group_name,
												choice_group_ar_name 		:	groupdata.group_name_arb,
												choice_group_min_quantity 	:	groupdata.group_min,
												choice_group_max_quantity 	:	groupdata.group_max,
											};
										}

										modifierExtraItemList.push({
											group_class					:	groupClass,
											item_main_id 				:	mainItemList[itemId].item_main_id,
											restaurant_id 				:	mainItemList[itemId].restaurant_id,
											restaurant_slug				:	mainItemList[itemId].restaurant_slug,
											kfg_modifiers_groups_id		:	groupId,
											kfg_item_id					:	itemId,
											extra_item_order			:	groupItemData.seq,
											kfg_extra_item_id			:	parseInt(kfgItemList[extraItemId].item_id),
											extra_item_en_name	 		:	kfgItemList[extraItemId].item_name,
											extra_item_ar_name	 		:	kfgItemList[extraItemId].item_name_arb,
											extra_item_price			:	kfgItemList[extraItemId].item_price,
											extra_item_en_description	:	kfgItemList[extraItemId].item_description,
											extra_item_ar_description	:	kfgItemList[extraItemId].item_description_arb,
											extra_item_record_date		:	kfgItemList[extraItemId].record_date,
											item_availablity_status		:	parseInt(kfgItemList[extraItemId].item_availablity_status),
										});
									}
								}else{
									if(!notFoundDetails.extra_item[extraItemId]){
										notFoundDetails.extra_item[extraItemId] =  extraItemId;
										console.log("Extra Item details not found ",JSON.stringify(extraItemId));
									}
								}
							});
						}
					});
				});
			}

			let unitChoiesGroup	=	{};
			let modifierUnitExtraItems	=	[];
			if(Object.keys(modifierUnitMaster).length > 0){
				Object.keys(modifierUnitMaster).map(itemMainId=>{
					Object.keys(modifierUnitMaster[itemMainId]).map(itemId=>{
						groupItemList.map(groupdata=>{
							let groupId  	= 	groupdata.modifier_group_id;
							let groupClass 	= 	groupdata.group_class;
							let mainModifierItemId 	= 	groupdata.main_modifier_items_id;

							if(mainModifierItemId == itemId && groupdata.group_item_list.length >0){
								groupdata.group_item_list.map(groupItemData=>{
									let extraItemId =	groupItemData.extra_modifier_item_id;
									if(kfgItemList[extraItemId]){
										if(!unitChoiesGroup[itemMainId] || !unitChoiesGroup[itemMainId][itemId] || !unitChoiesGroup[itemMainId][itemId][groupClass] || !unitChoiesGroup[itemMainId][itemId][groupClass][groupId]){
											if(!unitChoiesGroup[itemMainId]) unitChoiesGroup[itemMainId] = {};
											if(!unitChoiesGroup[itemMainId][itemId]) unitChoiesGroup[itemMainId][itemId] = {};
											if(!unitChoiesGroup[itemMainId][itemId][groupClass]) unitChoiesGroup[itemMainId][itemId][groupClass] = {};

											unitChoiesGroup[itemMainId][itemId][groupClass][groupId] = {
												item_main_id 				:	mainItemList[itemMainId].item_main_id,
												restaurant_id 				:	mainItemList[itemMainId].restaurant_id,
												restaurant_slug				:	mainItemList[itemMainId].restaurant_slug,

												group_class					:	groupClass,
												kfg_item_id					:	itemId,
												kfg_modifiers_groups_id		:	groupId,
												choice_group_en_name 		:	groupdata.group_name,
												choice_group_ar_name 		:	groupdata.group_name_arb,
												choice_group_min_quantity 	:	groupdata.group_min,
												choice_group_max_quantity 	:	groupdata.group_max,
												item_size 					:	kfgItemList[mainModifierItemId].item_size,
												dough_type				 	:	kfgItemList[mainModifierItemId].dough_type,
											};
										}

										modifierUnitExtraItems.push({
											item_main_id 				:	mainItemList[itemMainId].item_main_id,
											restaurant_id 				:	mainItemList[itemMainId].restaurant_id,
											restaurant_slug				:	mainItemList[itemMainId].restaurant_slug,
											kfg_modifiers_groups_id		:	groupId,
											group_class					:	groupClass,
											kfg_item_id					:	itemId,
											item_size 					:	kfgItemList[mainModifierItemId].item_size,
											dough_type				 	:	kfgItemList[mainModifierItemId].dough_type,
											selector				 	:	kfgItemList[mainModifierItemId].selector,
											extra_item_order			:	groupItemData.seq,
											kfg_extra_item_id			:	parseInt(kfgItemList[extraItemId].item_id),
											extra_item_en_name	 		:	kfgItemList[extraItemId].item_name,
											extra_item_ar_name	 		:	kfgItemList[extraItemId].item_name_arb,
											extra_item_price			:	kfgItemList[extraItemId].item_price,
											extra_item_en_description	:	kfgItemList[extraItemId].item_description,
											extra_item_ar_description	:	kfgItemList[extraItemId].item_description_arb,
											extra_item_record_date		:	kfgItemList[extraItemId].record_date,
											item_availablity_status		:	parseInt(kfgItemList[extraItemId].item_availablity_status),
										});
									}
								});
							}
						});
					});
				});
			}

			/*
			return res.send({
				groupItemList 		: groupItemList,
				// modifierUnitMaster 		: modifierUnitMaster,
				// unitChoiesGroup : unitChoiesGroup,
				modifierUnitExtraItems 	: modifierUnitExtraItems,
				// modifierChoiesGroup 	: modifierChoiesGroup,
				// modifierExtraItemList 	: modifierExtraItemList
			});
			*/


			asyncParallel({
				modifier_item_list: (itemCallback)=>{
					if(Object.keys(modifierChoiesGroup).length <= 0 || modifierExtraItemList.length <= 0){
						console.log("Modifier some details not found");
						console.log("modifierChoiesGroup Count "+Object.keys(modifierChoiesGroup).length);
						console.log("modifierExtraItemList Count "+modifierExtraItemList.length);
						return itemCallback(null);
					}

					let finalGroupIds 	= 	{};
					asyncParallel({
						choice_group_list: (modifierChoiceCallback)=>{
							asyncForEachOf(modifierChoiesGroup,(reco,itemId,forEachCallback)=>{
								asyncForEachOf(modifierChoiesGroup[itemId],(recor,groupClass,forEachChildCallback)=>{


									asyncForEachOf(modifierChoiesGroup[itemId][groupClass],(records,groupId,groupChildCallback)=>{
										let tempRestaurantId 			=	records.restaurant_id;
										let tempRestaurantSlug 			= 	records.restaurant_slug;
										let tempItemMainId 			 	= 	records.item_main_id;
										let tempKfgModifiersGroupsId 	= 	records.kfg_modifiers_groups_id;

										/** Get item choice group details */
										item_choices_groups.findOne({
											item_id 				: 	ObjectId(tempItemMainId),
											restaurant_id 			:	ObjectId(tempRestaurantId),
											kfg_modifiers_groups_id : 	parseInt(tempKfgModifiersGroupsId),
											kfg_groups_class 		: 	groupClass,
										},{projection: {_id: 1,}},(masterErr,masterResult)=>{
											if(masterErr) return groupChildCallback(masterErr);

											if(masterResult){
												if(!finalGroupIds[String(tempItemMainId)]) finalGroupIds[String(tempItemMainId)] = {};
												if(!finalGroupIds[String(tempItemMainId)][groupClass]) finalGroupIds[String(tempItemMainId)][groupClass] = {};
												finalGroupIds[String(tempItemMainId)][groupClass][groupId] = masterResult._id;
												return groupChildCallback(masterErr);
											}

											/** Save choice group detils */
											item_choices_groups.updateOne({
												item_id 				: 	ObjectId(tempItemMainId),
												restaurant_id 			:	ObjectId(tempRestaurantId),
												kfg_modifiers_groups_id : 	parseInt(tempKfgModifiersGroupsId),
												kfg_groups_class 		: 	groupClass,
											},
											{
												$set	:	{
													name	: {
														en 	: records.choice_group_en_name,
														ar	: records.choice_group_ar_name,
													},
													min_quantity 	:	records.choice_group_min_quantity,
													max_quantity 	: 	records.choice_group_max_quantity,
													modified 		:	getUtcDate(),
												},
												$setOnInsert:	{
													kfg		 		: 	true,
													added_by		:	superAdminId,
													channel_id		:	CHANNEL_CRON,
													restaurant_slug :	tempRestaurantSlug,
													created   		:	getUtcDate(),
												}
											},{upsert: true },(insertErr,insertResult)=>{
												if(insertResult &&  insertResult.upsertedId && insertResult.upsertedId._id){
													if(!finalGroupIds[String(tempItemMainId)]) finalGroupIds[String(tempItemMainId)] = {};
													if(!finalGroupIds[String(tempItemMainId)][groupClass]) finalGroupIds[String(tempItemMainId)][groupClass] = {};
													finalGroupIds[String(tempItemMainId)][groupClass][groupId] = insertResult.upsertedId._id;
												}
												groupChildCallback(insertErr);
											});
										});
									},(asyncEachChoiceErr)=>{
										forEachChildCallback(asyncEachChoiceErr);
									});
								},(asyncEachChildErr)=>{
									forEachCallback(asyncEachChildErr);
								});
							},(asyncEachErr)=>{
								modifierChoiceCallback(asyncEachErr);
							});
						},
					},(parallelSubErr)=>{
						if(parallelSubErr) return itemCallback(parallelSubErr);

						let finalExtraId = {};
						asyncForEachOf(modifierExtraItemList,(records,key,forEachSubCallback)=>{
							let tempRestaurantId 	=	records.restaurant_id;
							let tempRestaurantSlug 	= 	records.restaurant_slug;
							let tempItemMainId 		= 	records.item_main_id;
							let tempGroupClass 		= 	records.group_class;
							let kfgItemId 			= 	records.kfg_item_id;
							let kfgExtraItemId 		= 	records.kfg_extra_item_id;
							let kfgModifiersGroupsId= 	records.kfg_modifiers_groups_id;

							if(!finalGroupIds[String(tempItemMainId)] || !finalGroupIds[String(tempItemMainId)][tempGroupClass] || !finalGroupIds[String(tempItemMainId)][tempGroupClass][kfgModifiersGroupsId]){
								forEachSubCallback(null);
								return console.log("Modifier Choice group details not found ",JSON.stringify(records));
							}

							// let groupId 	= 	finalGroupIds[String(tempItemMainId)][tempGroupClass][kfgModifiersGroupsId];

							/** Get extra master details */
							item_extra_masters.findOne({
								item_id 		: 	ObjectId(tempItemMainId),
								restaurant_id	:	ObjectId(tempRestaurantId),
								extra_item_id	:	kfgExtraItemId,
							},{projection: {_id: 1}},(masterErr,masterResult)=>{
								if(masterResult){
									if(!finalExtraId[String(tempItemMainId)]) finalExtraId[String(tempItemMainId)] = {};
									finalExtraId[String(tempItemMainId)][kfgExtraItemId] =  masterResult._id;
								}
								if(masterErr || masterResult) return forEachSubCallback(masterErr,masterResult);

								let extrsItemUpdateData = {
									name   : {
										en : records.extra_item_en_name,
										ar : records.extra_item_ar_name,
									},
									extra_fees 	:	parseFloat(records.extra_item_price),
									modified 	:	getUtcDate(),
								};

								if(records.extra_item_en_description || records.extra_item_ar_description){
									extrsItemUpdateData.description = {
										en : records.extra_item_en_description,
										ar : records.extra_item_ar_description,
									};
								}

								/** Save extra master details */
								item_extra_masters.updateOne({
									item_id 		: 	ObjectId(tempItemMainId),
									restaurant_id 	:	ObjectId(tempRestaurantId),
									extra_item_id	:	kfgExtraItemId,
								},
								{
									$set		:	extrsItemUpdateData,
									$setOnInsert:	{
										kfg		 		: 	true,
										channel_id		:	CHANNEL_CRON,
										added_by		:	superAdminId,
										kfg_main_item_id:	kfgItemId,
										restaurant_slug :	tempRestaurantSlug,
										is_active		:	parseInt(records.item_availablity_status),
										order			:	parseInt(records.extra_item_order),
										created   		:	getUtcDate(records.extra_item_record_date),

									}
								},{upsert: true },(insertErr,insertResult)=>{
									if(insertResult &&  insertResult.upsertedId && insertResult.upsertedId._id){
										let masterId = (insertResult &&  insertResult.upsertedId && insertResult.upsertedId._id)

										if(!finalExtraId[String(tempItemMainId)]) finalExtraId[String(tempItemMainId)] = {};
										finalExtraId[String(tempItemMainId)][kfgExtraItemId] =  masterId;
									}

									forEachSubCallback(insertErr,insertResult);
								});
							});
						},(asyncEachSubErr)=>{
							if(asyncEachSubErr) return itemCallback(asyncEachSubErr);


							asyncForEachOf(modifierExtraItemList,(records,key,forEachSubCallback)=>{
								let tempRestaurantId 	=	records.restaurant_id;
								let tempRestaurantSlug 	= 	records.restaurant_slug;
								let tempItemMainId 		= 	records.item_main_id;
								let tempGroupClass 		= 	records.group_class;
								let kfgItemId 			= 	records.kfg_item_id;
								let kfgExtraItemId 		= 	records.kfg_extra_item_id;
								let kfgModifiersGroupsId= 	records.kfg_modifiers_groups_id;

								if(!finalGroupIds[String(tempItemMainId)] || !finalGroupIds[String(tempItemMainId)][tempGroupClass] || !finalGroupIds[String(tempItemMainId)][tempGroupClass][kfgModifiersGroupsId]){
									forEachSubCallback(null);
									return console.log("Modifier Choice group details not found ",JSON.stringify(records));
								}
								if(!finalExtraId[String(tempItemMainId)] || !finalExtraId[String(tempItemMainId)][kfgExtraItemId]){
									console.log("Modifier extra item details not found ",JSON.stringify(records));
									return forEachSubCallback(null);
								}

								let groupId 	= 	finalGroupIds[String(tempItemMainId)][tempGroupClass][kfgModifiersGroupsId];
								let extraItemId = 	finalExtraId[String(tempItemMainId)][kfgExtraItemId];

								/** Save item group details */
								item_group_extras.updateOne({
									group_id 		: 	ObjectId(groupId),
									item_id 		: 	ObjectId(tempItemMainId),
									restaurant_id 	:	ObjectId(tempRestaurantId),
									item_extra_id	:	ObjectId(extraItemId),
								},
								{
									$set	:	{
										modified :	getUtcDate(),
									},
									$setOnInsert:	{
										channel_id		:	CHANNEL_CRON,
										added_by		:	superAdminId,
										restaurant_slug :	tempRestaurantSlug,
										created   		:	getUtcDate(),
										kfg		 		: 	true,
										kfg_main_item_id 		:	kfgItemId,
										kfg_modifiers_groups_id :	kfgModifiersGroupsId,
									}
								},{upsert: true },(insertErr)=>{
									forEachSubCallback(insertErr);
								});
							},(asyncEachChildSubErr)=>{
								itemCallback(asyncEachChildSubErr);
							});
						});
					});
				},
				deal_unit_list: (modifierChoiceCallback)=>{
					if(Object.keys(modifierUnitMaster).length <= 0 || Object.keys(unitChoiesGroup).length <= 0 || Object.keys(modifierUnitExtraItems).length <= 0 ){
						console.log("Deal item unit some details not found");
						console.log("Deal item unit Count "+Object.keys(modifierUnitMaster).length);
						console.log("Deal item choice group Count "+Object.keys(unitChoiesGroup).length);
						console.log("Deal item extra item Count "+Object.keys(modifierUnitExtraItems).length);
						return modifierChoiceCallback(null);
					}

					let itemUnitObj 	= 	{};
					let unitMasterIds 	= 	{};
					asyncForEachOf(modifierUnitMaster,(reco,itemId,forEachCallback)=>{
						asyncForEachOf(modifierUnitMaster[itemId],(records,extraItemId,forEachChildCallback)=>{
							let tempDoughType 		=	records.dough_type;
							let tempItemSize		= 	records.item_size;
							let tempRestaurantSlug	= 	records.restaurant_slug;
							let tempRestaurantId	= 	records.restaurant_id;
							let tempSelector		= 	records.selector;

							asyncParallel({
								unique_item_unit_id : (parellelCallback)=>{
									/** get unique Id Response **/
									getUniqueId(req,res,next,{type:"item_unit"}).then(uniqueIdResponse=>{
										let uniqueItemUnitid = (uniqueIdResponse.result) ? uniqueIdResponse.result :"";
										parellelCallback(null,uniqueItemUnitid);
									}).catch(next);
								},
								dough_type_item_unit_id : (parellelCallback)=>{
									/** get unique Id Response **/
									getUniqueId(req,res,next,{type:"item_unit"}).then(uniqueIdResponse=>{
										let uniqueItemUnitid = (uniqueIdResponse.result) ? uniqueIdResponse.result :"";
										parellelCallback(null,uniqueItemUnitid);
									}).catch(next);
								},
								third_item_unit_id : (parellelCallback)=>{
									/** get unique Id Response **/
									getUniqueId(req,res,next,{type:"item_unit"}).then(uniqueIdResponse=>{
										let uniqueItemUnitid = (uniqueIdResponse.result) ? uniqueIdResponse.result :"";
										parellelCallback(null,uniqueItemUnitid);
									}).catch(next);
								},
							},(parallelChildErr,parallelChildRes)=>{

								let uniqueItemUnitId 			= 	(parallelChildRes.unique_item_unit_id) 		? 	parallelChildRes.unique_item_unit_id 	 :"";
								let uniqueDoughTypeItemUnitId 	=	(parallelChildRes.dough_type_item_unit_id) 	?	parallelChildRes.dough_type_item_unit_id :"";
								let thirdItemUnitId 			=	(parallelChildRes.third_item_unit_id) 		?	parallelChildRes.third_item_unit_id 	:"";

								if(!uniqueItemUnitId){
									forEachChildCallback(null);
									return  console.error("Item unit unique id not found  - "+JSON.stringify(records));
								}
								if(!uniqueDoughTypeItemUnitId){
									forEachChildCallback(null);
									return  console.error("Item dough type unit unique id not found  - "+JSON.stringify(records));
								}

								if(!thirdItemUnitId){
									forEachChildCallback(null);
									return  console.error("Item third unit unique id not found  - "+JSON.stringify(records));
								}

								asyncParallel({
									upsell_details : (parellelCallback)=>{
										if(unitMasterIds[String(tempRestaurantId)] && unitMasterIds[String(tempRestaurantId)].size_list && unitMasterIds[String(tempRestaurantId)].size_list[tempItemSize]) return parellelCallback(null);

										let upserllConditions = {
											restaurant_id 	:	tempRestaurantId,
											size_id 		:	tempItemSize
										};

										/** Get size details details */
										item_units_masters.findOne(upserllConditions,{projection: {_id: 1,}},(masterErr,masterResult)=>{
											if(masterResult){
												if(!unitMasterIds[String(tempRestaurantId)]) unitMasterIds[String(tempRestaurantId)] ={};
												if(!unitMasterIds[String(tempRestaurantId)].size_list) unitMasterIds[String(tempRestaurantId)].size_list ={};

												unitMasterIds[String(tempRestaurantId)].size_list[tempItemSize] = masterResult._id;
											}

											if(masterErr || masterResult) return parellelCallback(masterErr,masterResult);

											let updateData = {
												name  : {
													en : records.size_en_name,
													ar : records.size_ar_name,
												},
												modified : getUtcDate(),
											}

											/** Save unit master detils */
											item_units_masters.updateOne(upserllConditions,
											{
												$set		:	updateData,
												$setOnInsert:	{
													added_by		:	superAdminId,
													channel_id		:	CHANNEL_CRON,
													item_unit_id 	:	uniqueItemUnitId,
													cravez_item_id 	:	extraItemId,
													restaurant_slug :	tempRestaurantSlug,
													created   		:	getUtcDate(),
													kfg		 		: 	true,
												}
											},{upsert: true },(insertErr,insertResult)=>{
												if(insertResult &&  insertResult.upsertedId && insertResult.upsertedId._id){
													if(!unitMasterIds[String(tempRestaurantId)]) unitMasterIds[String(tempRestaurantId)] ={};
													if(!unitMasterIds[String(tempRestaurantId)].size_list) unitMasterIds[String(tempRestaurantId)].size_list ={};

													unitMasterIds[String(tempRestaurantId)].size_list[tempItemSize] = insertResult.upsertedId._id;
												}
												parellelCallback(insertErr,insertResult);
											});
										});
									},
									dough_type_details : (parellelCallback)=>{
										if(unitMasterIds[String(tempRestaurantId)] && unitMasterIds[String(tempRestaurantId)].dough_type && unitMasterIds[String(tempRestaurantId)].dough_type[tempDoughType]) return parellelCallback(null);

										let upserllConditions = {
											restaurant_id 	:	tempRestaurantId,
											dough_type 		:	tempDoughType
										};

										/** Get size details details */
										item_units_masters.findOne(upserllConditions,{projection: {_id: 1,}},(masterErr,masterResult)=>{
											if(masterResult){
												if(!unitMasterIds[String(tempRestaurantId)]) unitMasterIds[String(tempRestaurantId)] ={};
												if(!unitMasterIds[String(tempRestaurantId)].dough_type) unitMasterIds[String(tempRestaurantId)].dough_type ={};

												unitMasterIds[String(tempRestaurantId)].dough_type[tempDoughType] = masterResult._id;
											}

											if(masterErr || masterResult) return parellelCallback(masterErr,masterResult);

											let updateData = {
												name  : {
													en : records.dough_type_en_name,
													ar : records.dough_type_arb_name,
												},
												modified : getUtcDate(),
											}

											if(records.dough_type_en_desc || records.dough_type_ar_desc){
												updateData.description = {
													en : records.dough_type_en_desc,
													ar : records.dough_type_ar_desc,
												};
											}

											/** Save unit master detils */
											item_units_masters.updateOne(upserllConditions,
											{
												$set		:	updateData,
												$setOnInsert:	{
													added_by		:	superAdminId,
													channel_id		:	CHANNEL_CRON,
													item_unit_id 	:	uniqueDoughTypeItemUnitId,
													restaurant_slug :	tempRestaurantSlug,
													created   		:	getUtcDate(),
													kfg		 		: 	true,
												}
											},{upsert: true },(insertErr,insertResult)=>{
												if(insertResult &&  insertResult.upsertedId && insertResult.upsertedId._id){
													if(!unitMasterIds[String(tempRestaurantId)]) unitMasterIds[String(tempRestaurantId)] ={};
													if(!unitMasterIds[String(tempRestaurantId)].dough_type) unitMasterIds[String(tempRestaurantId)].dough_type ={};

													unitMasterIds[String(tempRestaurantId)].dough_type[tempDoughType] = insertResult.upsertedId._id;
												}
												parellelCallback(insertErr,insertResult);
											});
										});
									},
									third_type_details : (parellelCallback)=>{
										if(unitMasterIds[String(tempRestaurantId)] && unitMasterIds[String(tempRestaurantId)].extra_item_id && unitMasterIds[String(tempRestaurantId)].extra_item_id[tempSelector]) return parellelCallback(null);

										let upserllConditions = {
											restaurant_id 		:	tempRestaurantId,
											kfg_selector	 	:	tempSelector
										};

										/** Get size details details */
										item_units_masters.findOne(upserllConditions,{projection: {_id: 1,}},(masterErr,masterResult)=>{
											if(masterResult){
												if(!unitMasterIds[String(tempRestaurantId)]) unitMasterIds[String(tempRestaurantId)] ={};
												if(!unitMasterIds[String(tempRestaurantId)].extra_item_id) unitMasterIds[String(tempRestaurantId)].extra_item_id ={};

												unitMasterIds[String(tempRestaurantId)].extra_item_id[tempSelector] = masterResult._id;
											}

											if(masterErr || masterResult) return parellelCallback(masterErr,masterResult);

											let updateData = {
												name  : {
													en : records.item_name,
													ar : records.item_name_arb,
												},
												modified : getUtcDate(),
											}

											if(records.item_description || records.item_description_arb){
												updateData.description = {
													en : records.item_description,
													ar : records.item_description_arb,
												};
											}

											/** Save unit master detils */
											item_units_masters.updateOne(upserllConditions,
											{
												$set		:	updateData,
												$setOnInsert:	{
													added_by		:	superAdminId,
													channel_id		:	CHANNEL_CRON,
													item_unit_id 	:	thirdItemUnitId,
													restaurant_slug :	tempRestaurantSlug,
													created   		:	getUtcDate(),
													kfg		 		: 	true,
												}
											},{upsert: true },(insertErr,insertResult)=>{
												if(insertResult &&  insertResult.upsertedId && insertResult.upsertedId._id){
													if(!unitMasterIds[String(tempRestaurantId)]) unitMasterIds[String(tempRestaurantId)] ={};
													if(!unitMasterIds[String(tempRestaurantId)].extra_item_id) unitMasterIds[String(tempRestaurantId)].extra_item_id ={};

													unitMasterIds[String(tempRestaurantId)].extra_item_id[tempSelector] = insertResult.upsertedId._id;
												}
												parellelCallback(insertErr,insertResult);
											});
										});
									},
								},(parallelChildErr)=>{
									forEachChildCallback(parallelChildErr);
								});
							});
						},(asyncEachChildErr)=>{
							forEachCallback(asyncEachChildErr);
						});
					},(asyncEachErr)=>{
						if(asyncEachErr) return modifierChoiceCallback(asyncEachErr);

						asyncForEachOf(modifierUnitMaster,(reco,itemId,forEachCallback)=>{
							asyncForEachOf(modifierUnitMaster[itemId],(records,extraItemId,forEachChildCallback)=>{
								// let tempDoughType 		=	records.dough_type;
								let tempItemSize		= 	records.item_size;
								let tempRestaurantSlug	= 	records.restaurant_slug;
								let tempRestaurantId	= 	records.restaurant_id;
								let tempItemMainId		= 	records.item_main_id;

								if(!unitMasterIds[String(tempRestaurantId)] || !unitMasterIds[String(tempRestaurantId)].size_list || !unitMasterIds[String(tempRestaurantId)].size_list[tempItemSize]){
									console.log("item size mongo id not found");
									return forEachChildCallback(null);
								}

								let sizeUnitMasterId 	= 	unitMasterIds[String(tempRestaurantId)].size_list[tempItemSize];
								let sizeUnitConditions = {
									item_id 		:	tempItemMainId,
									item_unit_id	: 	sizeUnitMasterId,
									restaurant_id 	:	tempRestaurantId,
								};

								/** Get unit details */
								item_units.findOne(sizeUnitConditions,{projection: {_id: 1,}},(unitErr,unitResult)=>{
									if(unitResult){
										if(!itemUnitObj[tempRestaurantSlug]) itemUnitObj[tempRestaurantSlug] = {};
										if(!itemUnitObj[tempRestaurantSlug][tempItemMainId]) itemUnitObj[tempRestaurantSlug][tempItemMainId] = {};
										if(!itemUnitObj[tempRestaurantSlug][tempItemMainId].size_list) itemUnitObj[tempRestaurantSlug][tempItemMainId].size_list = {};

										itemUnitObj[tempRestaurantSlug][tempItemMainId].size_list[tempItemSize] = unitResult._id;
										records.parent_id = unitResult._id;
									}

									if(unitErr || unitResult) return forEachChildCallback(unitErr,unitResult);

									let updateData 	=	{
										price 		: 	0,
										modified	:	getUtcDate(),
										sorting		:	(records.seq) ? parseInt(records.seq) :"",
										kfg_size	:	tempItemSize,
									};

									item_units.updateOne(sizeUnitConditions,
									{
										$set 		:	updateData,
										$setOnInsert: 	{
											added_by	:	superAdminId,
											channel_id	:	CHANNEL_CRON,
											status   	:	parseInt(records.item_availablity_status),
											created   	:	getUtcDate(),
											kfg		 	: 	true,
											restaurant_slug :	tempRestaurantSlug,
										}
									},{upsert: true },(insertErr,insertRes)=>{
										let childMongoId = (insertRes &&  insertRes.upsertedId && insertRes.upsertedId._id) ? insertRes.upsertedId._id :"";

										if(childMongoId){
											if(!itemUnitObj[tempRestaurantSlug]) itemUnitObj[tempRestaurantSlug] = {};
											if(!itemUnitObj[tempRestaurantSlug][tempItemMainId]) itemUnitObj[tempRestaurantSlug][tempItemMainId] = {};
											if(!itemUnitObj[tempRestaurantSlug][tempItemMainId].size_list) itemUnitObj[tempRestaurantSlug][tempItemMainId].size_list = {};

											itemUnitObj[tempRestaurantSlug][tempItemMainId].size_list[tempItemSize] = childMongoId;
											records.parent_id = childMongoId;
										}
										forEachChildCallback(insertErr,insertRes);
									});
								});
							},(asyncSubEachErr)=>{
								forEachCallback(asyncSubEachErr);
							});
						},(firstEachErr)=>{
							if(firstEachErr) return  modifierChoiceCallback(firstEachErr);

							asyncForEachOf(modifierUnitMaster,(reco,itemId,secondEachCallback)=>{
								asyncForEachOf(modifierUnitMaster[itemId],(records,extraItemId,forEachSecondCallback)=>{
									let tempItemSize		= 	records.item_size;
									let tempDoughType 		=	records.dough_type;
									let tempRestaurantSlug	= 	records.restaurant_slug;
									let tempRestaurantId	= 	records.restaurant_id;
									let tempItemMainId		= 	records.item_main_id;

									if(!unitMasterIds[String(tempRestaurantId)] || !unitMasterIds[String(tempRestaurantId)].dough_type || !unitMasterIds[String(tempRestaurantId)].dough_type[tempDoughType]){
										console.log("item dough unit master mongo id not found ",JSON.stringify(records));
										return forEachSecondCallback(null);
									}

									let firstParentId = (itemUnitObj[tempRestaurantSlug] && itemUnitObj[tempRestaurantSlug][tempItemMainId] && itemUnitObj[tempRestaurantSlug][tempItemMainId].size_list[tempItemSize]) ? itemUnitObj[tempRestaurantSlug][tempItemMainId].size_list[tempItemSize] :"";

									if(!firstParentId){
										console.log("First parent details not find ",JSON.stringify(records));
										return forEachChildCallback(null);
									}

									let doughMongoId 	= 	unitMasterIds[String(tempRestaurantId)].dough_type[tempDoughType];

									/** Get unit details */
									item_dough_units.findOne({
										item_id 		:	ObjectId(tempItemMainId),
										item_unit_id	: 	ObjectId(doughMongoId),
										restaurant_id 	:	ObjectId(tempRestaurantId),
										parents 		: 	{$elemMatch: {$eq: firstParentId}}
									},{projection: {_id: 1,}},(unitErr,unitResult)=>{
										if(unitResult){
											if(!itemUnitObj[tempRestaurantSlug]) itemUnitObj[tempRestaurantSlug] = {};
											if(!itemUnitObj[tempRestaurantSlug][tempItemMainId]) itemUnitObj[tempRestaurantSlug][tempItemMainId] = {};
											if(!itemUnitObj[tempRestaurantSlug][tempItemMainId].dough_type) itemUnitObj[tempRestaurantSlug][tempItemMainId].dough_type = {};

											itemUnitObj[tempRestaurantSlug][tempItemMainId].dough_type[tempDoughType] = unitResult._id;
											records.unit_dough_type_id =  unitResult._id;
										}

										if(unitErr || unitResult) return forEachSecondCallback(unitErr,unitResult);

										let unitUpdateAbleData = {
											$set :	{
												price 		: 	0,
												modified	:	getUtcDate(),
												sorting		:	(records.seq) ? parseInt(records.seq) :"",
											},
											$setOnInsert: 	{
												added_by		:	superAdminId,
												restaurant_slug :	tempRestaurantSlug,
												channel_id		:	CHANNEL_CRON,
												kfg_dough_type 	:	tempDoughType,
												status   		:	parseInt(records.item_availablity_status),
												created   		:	getUtcDate(),
												kfg		 		: 	true,
											},
											$addToSet : {
												parents	: firstParentId
											}
										};

										item_dough_units.updateOne({
											item_id 		:	ObjectId(tempItemMainId),
											item_unit_id	: 	ObjectId(doughMongoId),
											restaurant_id 	:	ObjectId(tempRestaurantId),
										},unitUpdateAbleData,{upsert: true },(doughInsertErr,doughInsertRes)=>{
											let childDoughMongoId = (doughInsertRes &&  doughInsertRes.upsertedId && doughInsertRes.upsertedId._id) ? doughInsertRes.upsertedId._id :"";

											if(childDoughMongoId){
												if(!itemUnitObj[tempRestaurantSlug]) itemUnitObj[tempRestaurantSlug] = {};
												if(!itemUnitObj[tempRestaurantSlug][tempItemMainId]) itemUnitObj[tempRestaurantSlug][tempItemMainId] = {};
												if(!itemUnitObj[tempRestaurantSlug][tempItemMainId].dough_type) itemUnitObj[tempRestaurantSlug][tempItemMainId].dough_type = {};

												itemUnitObj[tempRestaurantSlug][tempItemMainId].dough_type[tempDoughType] = childDoughMongoId;
												records.unit_dough_type_id =  childDoughMongoId;
											}
											forEachSecondCallback(doughInsertErr,doughInsertRes);
										});
									});
								},(asyncSubEachErr)=>{
									secondEachCallback(asyncSubEachErr);
								});
							},(secondEachErr)=>{
								if(secondEachErr) return  modifierChoiceCallback(secondEachErr);

								let lastUnitId = {};
								asyncForEachOf(modifierUnitMaster,(reco,itemId,thirdEachCallback)=>{
									asyncForEachOf(modifierUnitMaster[itemId],(records,extraItemId,forEachThirdCallback)=>{
										let tempItemSize		= 	records.item_size;
										let tempDoughType 		=	records.dough_type;
										let tempRestaurantSlug	= 	records.restaurant_slug;
										let tempRestaurantId	= 	records.restaurant_id;
										let tempItemMainId		= 	records.item_main_id;
										let tempSelector		= 	records.selector;

										if(!unitMasterIds[String(tempRestaurantId)] || !unitMasterIds[String(tempRestaurantId)].extra_item_id || !unitMasterIds[String(tempRestaurantId)].extra_item_id[tempSelector]){
											console.log("Extra item mongo id not found");
											return forEachThirdCallback(null);
										}

										let firstParentId = (itemUnitObj[tempRestaurantSlug] && itemUnitObj[tempRestaurantSlug][tempItemMainId] && itemUnitObj[tempRestaurantSlug][tempItemMainId].size_list[tempItemSize]) ? itemUnitObj[tempRestaurantSlug][tempItemMainId].size_list[tempItemSize] :"";

										if(!firstParentId){
											console.log("First parent details not find in selector ",JSON.stringify(records));
											return forEachThirdCallback(null);
										}

										let secondParentId = (itemUnitObj[tempRestaurantSlug] && itemUnitObj[tempRestaurantSlug][tempItemMainId] && itemUnitObj[tempRestaurantSlug][tempItemMainId].dough_type && itemUnitObj[tempRestaurantSlug][tempItemMainId].dough_type[tempDoughType]) ? itemUnitObj[tempRestaurantSlug][tempItemMainId].dough_type[tempDoughType] :"";

										if(!secondParentId){
											console.log("second parent id not found",JSON.stringify(records));
											console.log('\n itemUnitObj');
											console.log(JSON.stringify(itemUnitObj[tempRestaurantSlug][tempItemMainId]));
											return forEachThirdCallback(null);
										}

										let extraMongoId 	=	unitMasterIds[String(tempRestaurantId)].extra_item_id[tempSelector];

										item_selector_units.findOne({
											item_id 			:	tempItemMainId,
											item_unit_id		: 	extraMongoId,
											restaurant_id 		:	tempRestaurantId,
											parents 			: 	{$elemMatch: {$eq: firstParentId}},
											dough_type_parents	: 	{$elemMatch: {$eq: secondParentId}}
										},{projection: {_id: 1,}},(unitErr,unitResult)=>{

											if(unitResult){
												if(!lastUnitId[tempRestaurantSlug]) lastUnitId[tempRestaurantSlug] = {};
												if(!lastUnitId[tempRestaurantSlug][tempItemMainId]) lastUnitId[tempRestaurantSlug][tempItemMainId] = {};

												lastUnitId[tempRestaurantSlug][tempItemMainId][tempSelector] = {
													item_unit	 : unitResult._id,
													item_unit_id : extraMongoId,
												};

												if(!itemUnitObj[tempRestaurantSlug]) itemUnitObj[tempRestaurantSlug] = {};
												if(!itemUnitObj[tempRestaurantSlug][tempItemMainId]) itemUnitObj[tempRestaurantSlug][tempItemMainId] = {};
												if(!itemUnitObj[tempRestaurantSlug][tempItemMainId].selector) itemUnitObj[tempRestaurantSlug][tempItemMainId].selector = {};

												itemUnitObj[tempRestaurantSlug][tempItemMainId].selector[tempSelector] = {
													item_unit	 : unitResult._id,
													item_unit_id : extraMongoId,
												};
											}

											if(unitErr || unitResult) return forEachThirdCallback(unitErr,unitResult);

											let unitUpdateAbleData = {
												$set :	{
													price 		: 	parseFloat(records.item_price),
													modified	:	getUtcDate(),
													sorting		:	(records.seq) ? parseInt(records.seq) :"",
												},
												$setOnInsert : 	{
													added_by		:	superAdminId,
													restaurant_slug :	tempRestaurantSlug,
													channel_id		:	CHANNEL_CRON,
													status   		:	parseInt(records.item_availablity_status),
													created   		:	getUtcDate(),
													kfg_selector	:	tempSelector,
													kfg		 		: 	true,
												},
												$addToSet : {
													parents				: firstParentId,
													dough_type_parents	: secondParentId
												}
											};

											item_selector_units.updateOne({
												item_id 		:	tempItemMainId,
												item_unit_id	: 	extraMongoId,
												restaurant_id 	:	tempRestaurantId,
											},unitUpdateAbleData,{upsert: true },(extraInsertErr,extraInsertRes)=>{
												let childUnitMongoId = (extraInsertRes &&  extraInsertRes.upsertedId && extraInsertRes.upsertedId._id) ? extraInsertRes.upsertedId._id :"";

												if(childUnitMongoId){
													if(!lastUnitId[tempRestaurantSlug]) lastUnitId[tempRestaurantSlug] = {};
													if(!lastUnitId[tempRestaurantSlug][tempItemMainId]) lastUnitId[tempRestaurantSlug][tempItemMainId] = {};

													lastUnitId[tempRestaurantSlug][tempItemMainId][tempSelector] = {
														item_unit	 : childUnitMongoId,
														item_unit_id : extraMongoId,
													};

													if(!itemUnitObj[tempRestaurantSlug]) itemUnitObj[tempRestaurantSlug] = {};
													if(!itemUnitObj[tempRestaurantSlug][tempItemMainId]) itemUnitObj[tempRestaurantSlug][tempItemMainId] = {};
													if(!itemUnitObj[tempRestaurantSlug][tempItemMainId].selector) itemUnitObj[tempRestaurantSlug][tempItemMainId].selector = {};

													itemUnitObj[tempRestaurantSlug][tempItemMainId].selector[tempSelector] = {
														item_unit	 : childUnitMongoId,
														item_unit_id : extraMongoId,
													};
												}

												forEachThirdCallback(extraInsertErr);
											});
										});
									},(asyncSubEachErr)=>{
										thirdEachCallback(asyncSubEachErr);
									});
								},(lastEachErr)=>{
									if(lastEachErr) return modifierChoiceCallback(lastEachErr);

									let groupIdObject = {};
									asyncForEachOf(unitChoiesGroup,(reco,mainItemId,firstGroupEachCallback)=>{
										asyncForEachOf(unitChoiesGroup[mainItemId],(data,itemId,secondGroupEachCallback)=>{
											asyncForEachOf(unitChoiesGroup[mainItemId][itemId],(recData,groupClass,thirdGroupCallback)=>{

												asyncForEachOf(unitChoiesGroup[mainItemId][itemId][groupClass],(records,groupId,fourthGroupCallback)=>{
													let tempItemSize		= 	records.item_size;
													let tempKfgItemId		= 	records.kfg_item_id;
													let tempRestaurantSlug	= 	records.restaurant_slug;
													let tempRestaurantId	= 	records.restaurant_id;
													let tempItemMainId		= 	records.item_main_id;
													let tempKfgModifiersGroupsId 	= 	records.kfg_modifiers_groups_id;

													if(!tempRestaurantSlug || !tempRestaurantId || !tempItemMainId){
														console.log("deal item choice group restaurant not found ",JSON.stringify(records));
														return fourthGroupCallback(null);
													}

													if(!unitMasterIds[String(tempRestaurantId)] || !unitMasterIds[String(tempRestaurantId)].size_list || !unitMasterIds[String(tempRestaurantId)].size_list[tempItemSize]){
														console.log("item size unit master mongo id not found in choice groups");
														return fourthGroupCallback(null);
													}

													let sizeUnitMasterId 	= 	unitMasterIds[String(tempRestaurantId)].size_list[tempItemSize];

													/** Get item choice group details */
													item_choices_groups.findOne({
														item_id 				: 	ObjectId(tempItemMainId),
														restaurant_id 			:	ObjectId(tempRestaurantId),
														kfg_modifiers_groups_id : 	parseInt(tempKfgModifiersGroupsId),
														kfg_groups_class 		: 	groupClass,
													},{projection: {_id: 1,}},(masterErr,masterResult)=>{
														if(masterErr) return fourthGroupCallback(masterErr);

														if(masterResult){
															if(!groupIdObject[String(tempItemMainId)]) groupIdObject[String(tempItemMainId)] = {};
															if(!groupIdObject[String(tempItemMainId)][groupClass]) groupIdObject[String(tempItemMainId)][groupClass] = {};
															groupIdObject[String(tempItemMainId)][groupClass][groupId] = masterResult._id;
															return fourthGroupCallback(masterErr);
														}

														/** Save choice group detils */
														item_choices_groups.updateOne({
															item_id 				: 	ObjectId(tempItemMainId),
															restaurant_id 			:	ObjectId(tempRestaurantId),
															kfg_modifiers_groups_id : 	parseInt(tempKfgModifiersGroupsId),
															kfg_groups_class 		: 	groupClass,
														},
														{
															$set	:	{
																name	: {
																	en 	: records.choice_group_en_name,
																	ar	: records.choice_group_ar_name,
																},
																min_quantity 	:	records.choice_group_min_quantity,
																max_quantity 	: 	records.choice_group_max_quantity,
																item_unit_id 	: 	ObjectId(sizeUnitMasterId),
																modified 		:	getUtcDate(),
															},
															$setOnInsert:	{
																kfg		 		: 	true,
																added_by		:	superAdminId,
																channel_id		:	CHANNEL_CRON,
																restaurant_slug :	tempRestaurantSlug,
																created   		:	getUtcDate(),
															}
														},{upsert: true },(insertErr,insertResult)=>{
															if(insertResult &&  insertResult.upsertedId && insertResult.upsertedId._id){
																if(!groupIdObject[String(tempItemMainId)]) groupIdObject[String(tempItemMainId)] = {};
																if(!groupIdObject[String(tempItemMainId)][groupClass]) groupIdObject[String(tempItemMainId)][groupClass] = {};
																groupIdObject[String(tempItemMainId)][groupClass][groupId] = insertResult.upsertedId._id;
															}
															fourthGroupCallback(insertErr);
														});
													});
												},(fourthGroupEachErr)=>{
													thirdGroupCallback(fourthGroupEachErr);
												});
											},(thirdGroupEachErr)=>{
												secondGroupEachCallback(thirdGroupEachErr);
											});
										},(secondGroupEachErr)=>{
											firstGroupEachCallback(secondGroupEachErr);
										});
									},(firstGroupEachErr)=>{
										if(firstGroupEachErr) return modifierChoiceCallback(firstGroupEachErr);

										let unitExtraItemIds = {};
										asyncForEachOf(modifierUnitExtraItems,(records,key,unitForEachSubCallback)=>{
											let tempItemSize		= 	records.item_size;
											let tempRestaurantId 	=	records.restaurant_id;
											let tempRestaurantSlug 	= 	records.restaurant_slug;
											let tempItemMainId 		= 	records.item_main_id;
											let tempGroupClass 		= 	records.group_class;
											let kfgItemId 			= 	records.kfg_item_id;
											let kfgExtraItemId 		= 	records.kfg_extra_item_id;
											let kfgModifiersGroupsId= 	records.kfg_modifiers_groups_id;

											if(!groupIdObject[String(tempItemMainId)] || !groupIdObject[String(tempItemMainId)][tempGroupClass] || !groupIdObject[String(tempItemMainId)][tempGroupClass][kfgModifiersGroupsId]){
												console.log("Deal unit choice group details not found ",JSON.stringify(records));
												console.log(groupIdObject);
												console.log("\n");
												return  unitForEachSubCallback(null);
											}


											if(!unitMasterIds[String(tempRestaurantId)] || !unitMasterIds[String(tempRestaurantId)].size_list || !unitMasterIds[String(tempRestaurantId)].size_list[tempItemSize]){
												console.log("item size mongo id not found");
												return unitForEachSubCallback(null);
											}

											let sizeMongoId 	= 	unitMasterIds[String(tempRestaurantId)].size_list[tempItemSize];

											/** Get extra master details */
											item_extra_masters.findOne({
												item_id 		: 	ObjectId(tempItemMainId),
												restaurant_id	:	ObjectId(tempRestaurantId),
												extra_item_id	:	kfgExtraItemId,
											},{projection: {_id: 1}},(masterErr,masterResult)=>{
												if(masterResult){
													if(!unitExtraItemIds[String(tempItemMainId)]) unitExtraItemIds[String(tempItemMainId)] = {};
													unitExtraItemIds[String(tempItemMainId)][kfgExtraItemId] =  masterResult._id;
												}
												if(masterErr || masterResult) return unitForEachSubCallback(masterErr,masterResult);

												let extrsItemUpdateData = {
													name   : {
														en : records.extra_item_en_name,
														ar : records.extra_item_ar_name,
													},
													extra_fees 	:	parseFloat(records.extra_item_price),
													item_unit_id:	ObjectId(sizeMongoId),
													modified 	:	getUtcDate(),
												};

												if(records.extra_item_en_description || records.extra_item_ar_description){
													extrsItemUpdateData.description = {
														en : records.extra_item_en_description,
														ar : records.extra_item_ar_description,
													};
												}

												/** Save extra master details */
												item_extra_masters.updateOne({
													item_id 		: 	ObjectId(tempItemMainId),
													restaurant_id 	:	ObjectId(tempRestaurantId),
													extra_item_id	:	kfgExtraItemId,
												},
												{
													$set		:	extrsItemUpdateData,
													$setOnInsert:	{
														kfg		 		: 	true,
														channel_id		:	CHANNEL_CRON,
														added_by		:	superAdminId,
														kfg_main_item_id:	kfgItemId,
														restaurant_slug :	tempRestaurantSlug,
														is_active		:	parseInt(records.item_availablity_status),
														order			:	parseInt(records.extra_item_order),
														created   		:	getUtcDate(records.extra_item_record_date),

													}
												},{upsert: true },(insertErr,insertResult)=>{
													if(insertResult &&  insertResult.upsertedId && insertResult.upsertedId._id){
														let masterId = (insertResult &&  insertResult.upsertedId && insertResult.upsertedId._id)

														if(!unitExtraItemIds[String(tempItemMainId)]) unitExtraItemIds[String(tempItemMainId)] = {};
														unitExtraItemIds[String(tempItemMainId)][kfgExtraItemId] =  masterId;
													}
													unitForEachSubCallback(insertErr,insertResult);
												});
											});
										},(unitAsyncEachSubErr)=>{
											if(unitAsyncEachSubErr) return modifierChoiceCallback(unitAsyncEachSubErr);

											// return modifierChoiceCallback(lastEachErr);

											asyncForEachOf(modifierUnitExtraItems,(records,key,unitGroupforEachCallback)=>{
												let tempItemSize		= 	records.item_size;
												let tempDoughType		= 	records.dough_type;
												let tempSelector		= 	records.selector;
												let tempRestaurantId 	=	records.restaurant_id;
												let tempRestaurantSlug 	= 	records.restaurant_slug;
												let tempItemMainId 		= 	records.item_main_id;
												let tempGroupClass 		= 	records.group_class;
												let kfgItemId 			= 	records.kfg_item_id;
												let kfgExtraItemId 		= 	records.kfg_extra_item_id;
												let kfgModifiersGroupsId= 	records.kfg_modifiers_groups_id;

												if(!groupIdObject[String(tempItemMainId)] || !groupIdObject[String(tempItemMainId)][tempGroupClass] || !groupIdObject[String(tempItemMainId)][tempGroupClass][kfgModifiersGroupsId]){
													console.log("Unit deal Choice group details not found ",JSON.stringify(records));
													console.log(JSON.stringify(groupIdObject));
													console.log("\n");
													return unitGroupforEachCallback(null);
												}

												if(!unitExtraItemIds[String(tempItemMainId)] || !unitExtraItemIds[String(tempItemMainId)][kfgExtraItemId]){
													console.log("Unit deal extra item details not found ",JSON.stringify(records));
													console.log("\n");
													return unitGroupforEachCallback(null);
												}

												if(!unitMasterIds[String(tempRestaurantId)] || !unitMasterIds[String(tempRestaurantId)].size_list || !unitMasterIds[String(tempRestaurantId)].size_list[tempItemSize]){
													console.log("Deal extra group size unit master mongo id not found ",JSON.stringify(records));
													return unitGroupforEachCallback(null);
												}

												if(!unitMasterIds[String(tempRestaurantId)] || !unitMasterIds[String(tempRestaurantId)].dough_type || !unitMasterIds[String(tempRestaurantId)].dough_type[tempDoughType]){
													console.log("Deal extra group dough type unit master mongo id not found ",JSON.stringify(records));
													return unitGroupforEachCallback(null);
												}

												if(!itemUnitObj[tempRestaurantSlug] || !itemUnitObj[tempRestaurantSlug][tempItemMainId] || !itemUnitObj[tempRestaurantSlug][tempItemMainId].selector || !itemUnitObj[tempRestaurantSlug][tempItemMainId].selector[tempSelector] ||  !itemUnitObj[tempRestaurantSlug][tempItemMainId].selector[tempSelector].item_unit ||  !itemUnitObj[tempRestaurantSlug][tempItemMainId].selector[tempSelector].item_unit_id){
													console.log("deal item selector unit not found in item_extra_masters ",JSON.stringify(records));
													return thirdGroupCallback(null);
												}

												let firstParentId = (itemUnitObj[tempRestaurantSlug] && itemUnitObj[tempRestaurantSlug][tempItemMainId] && itemUnitObj[tempRestaurantSlug][tempItemMainId].size_list[tempItemSize]) ? itemUnitObj[tempRestaurantSlug][tempItemMainId].size_list[tempItemSize] :"";

												let secondParentId = (itemUnitObj[tempRestaurantSlug] && itemUnitObj[tempRestaurantSlug][tempItemMainId] && itemUnitObj[tempRestaurantSlug][tempItemMainId].dough_type && itemUnitObj[tempRestaurantSlug][tempItemMainId].dough_type[tempDoughType]) ? itemUnitObj[tempRestaurantSlug][tempItemMainId].dough_type[tempDoughType] :"";

												if(!firstParentId){
													console.log("Deal extra group size unit mongo id not found ",JSON.stringify(records));
													return unitGroupforEachCallback(null);
												}

												if(!secondParentId){
													console.log("Deal extra group dough type unit mongo id not found",JSON.stringify(records));
													console.log('\n itemUnitObj');
													console.log(JSON.stringify(itemUnitObj[tempRestaurantSlug][tempItemMainId]));
													return forEachThirdCallback(null);
												}

												let thirdParentId		=	itemUnitObj[tempRestaurantSlug][tempItemMainId].selector[tempSelector].item_unit;
												let groupId 			= 	groupIdObject[String(tempItemMainId)][tempGroupClass][kfgModifiersGroupsId];
												let extraItemId 		= 	unitExtraItemIds[String(tempItemMainId)][kfgExtraItemId];
												let sizeMasterUnitId 	= 	unitMasterIds[String(tempRestaurantId)].size_list[tempItemSize];
												let doughTypeMasterUnitId= 	unitMasterIds[String(tempRestaurantId)].dough_type[tempDoughType];
												let selectorMasterUnitId = 	itemUnitObj[tempRestaurantSlug][tempItemMainId].selector[tempSelector].item_unit_id;

												/** Save item group details */
												item_group_extras.updateOne({
													group_id 		: 	ObjectId(groupId),
													item_id 		: 	ObjectId(tempItemMainId),
													restaurant_id 	:	ObjectId(tempRestaurantId),
													item_extra_id	:	ObjectId(extraItemId),
													kfg_dough_type	:	tempDoughType,
													kfg_size		:	tempItemSize,
													kfg_selector 	:	tempSelector,
												},
												{
													$set	:	{
														modified 		:	getUtcDate(),
														unit_id			:	sizeMasterUnitId,
														size_id			:	firstParentId,
														dough_type_id	:	secondParentId,
														selector_id		:	thirdParentId,
														dough_master_unit_id:	doughTypeMasterUnitId,
														selector_master_unit_id:selectorMasterUnitId,
														extra_fees 		: 	parseFloat(records.extra_item_price),
														max_quantity 	: 	1,
														min_quantity 	: 	1,
													},
													$setOnInsert:	{
														channel_id				:	CHANNEL_CRON,
														added_by				:	superAdminId,
														restaurant_slug 		:	tempRestaurantSlug,
														created   				:	getUtcDate(),
														kfg		 				: 	true,
														kfg_main_item_id 		:	kfgItemId,
														kfg_modifiers_groups_id :	kfgModifiersGroupsId,
													}
												},{upsert: true },(insertErr)=>{
													unitGroupforEachCallback(insertErr);
												});
											},(asyncEachChildSubErr)=>{
												modifierChoiceCallback(asyncEachChildSubErr);
											});
										});
									});
								});
							});
						});
					});
				},
				item_component_list: (itemCallback)=>{
					if(Object.keys(itemgroupCount).length <= 0){
						console.log("Deal number of component not found");
						return itemCallback(null);
					}

					asyncForEachOf(itemgroupCount,(reco,itemId,forEachCallback)=>{
						/** Update item details */
						items.updateOne({
							_id : 	ObjectId(itemId),
						},
						{$set	:	{
							// combo_no_of_components:	Object.keys(itemgroupCount[itemId]).length,
							no_of_components:	Object.keys(itemgroupCount[itemId]).length,
							modified 		:	getUtcDate(),
						}},(insertErr)=>{
							forEachCallback(insertErr);
						});
					},(asyncEachErr)=>{
						itemCallback(asyncEachErr);
					});
				},
			},(asyncErr)=>{
				if(asyncErr){
					console.log("migrateDealItem err");
					return console.log(asyncErr);
				}
				console.log("Done migrateDealItem");
			});
			res.render('blank',{layout:false});
		});
	};// end migrateDealItem()

	/**
	 * Function to migrate half and half pizza in our database
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 *
	 * @return render
	 */
	this.migrateHalfItem = (req, res, next, db2)=>{
		const users                 =	db.collection("users");
		const items                 =	db.collection("items");

		const item_units		    =	db.collection("item_units");
		const item_dough_units	    =	db.collection("item_dough_units");
		const item_selector_units	=	db.collection("item_selector_units");
		const item_units_masters    =	db.collection("item_units_masters");
		const item_choices_groups   =	db.collection("item_choices_groups");
		const item_extra_masters    =	db.collection("item_extra_masters");
		const item_group_extras     =	db.collection("item_group_extras");

		asyncParallel({
			kfg_item_list: (itemCallback)=>{
				const kfg_all_items_list = db2.collection("kfg_all_items_list");
				kfg_all_items_list.find({}).toArray((err,result)=>{
					if(err) return itemCallback(err);

					let componentData = {};
					result.map(componentRecords=>{
						componentData[componentRecords.item_id] = componentRecords
					});
					itemCallback(err,componentData);
				});
			},
			selector_list: (selectorCallback)=>{
				const kfg_pizz_hut_selector = db2.collection("kfg_pizz_hut_selector");
				kfg_pizz_hut_selector.find({}).toArray((err,result)=>{
					if(err) return selectorCallback(err);

					let componentData = {};
					result.map(componentRecords=>{
						componentData[componentRecords.selector_id] = componentRecords
					});
					selectorCallback(err,componentData);
				});
			},
			item_size_list: (itemCallback)=>{
				const kfg_sizes = db2.collection("kfg_sizes");
				kfg_sizes.find({}).toArray((err,result)=>{
					if(err) return itemCallback(err);

					let componentData = {};
					result.map(componentRecords=>{
						componentData[componentRecords.size_id] = componentRecords
					});
					itemCallback(err,componentData);
				});
			},
			item_dough_type_list: (itemCallback)=>{
				const kfg_dough_type_list = db2.collection("kfg_dough_type_list");
				kfg_dough_type_list.find({}).toArray((err,result)=>{
					if(err) return itemCallback(err);

					let componentData = {};
					result.map(componentRecords=>{
						componentData[componentRecords.dough_id] = componentRecords
					});
					itemCallback(err,componentData);
				});
			},
			modifier_groups_item_list: (groupItemCallback)=>{
				const kfg_items_modifier_map = db2.collection("kfg_items_modifier_map");
				kfg_items_modifier_map.aggregate([
					{$lookup:	{
						"from" 			: 	"kfg_modifier_groups",
						"localField" 	:	"modifier_group_id",
						"foreignField" 	: 	"group_id",
						"as" 			: 	"group_detail"
					}},
					{$match :{ "group_detail._id" :{$exists : true} }},
					{$addFields :{
						group_name 		:	{$arrayElemAt: ["$group_detail.group_name",0]},
						group_name_arb 	: 	{$arrayElemAt: ["$group_detail.group_name_arb",0]},
						group_min 		: 	{$arrayElemAt: ["$group_detail.group_min",0]},
						group_max 		: 	{$arrayElemAt: ["$group_detail.group_max",0]},
					}},
					{$project :{group_detail:0 }},
				]).toArray((err,result)=>{
					if(err) return  groupItemCallback(err,result);

					let componentData = {};
					result.map(componentRecords=>{
						if(!componentData[componentRecords.main_modifier_items_id]) componentData[componentRecords.main_modifier_items_id] = [];
						componentData[componentRecords.main_modifier_items_id].push(componentRecords)
					});
					groupItemCallback(err,componentData);
				});
			},
			super_admin_details: (superAdminDetails)=>{
				users.findOne({
					user_role_id : CRAVEZ
				},{projection:{full_name:1,_id:1}},(superAdminErr, superAdminResult)=>{
					superAdminDetails(superAdminErr, superAdminResult);
				});
			},
			choice_details: (choiceDetails)=>{
				/** Get choice details */
				item_choices_groups.find({
					is_choice : true,
				},{projection: {_id: 1,item_id:1}}).toArray((choiceErr,choiceResult)=>{
					if(choiceErr) return choiceDetails(choiceErr);

					let choiceData = {};
					choiceResult.map(choiceRecords=>{
						choiceData[choiceRecords.item_id] = choiceRecords._id;
					});
					choiceDetails(choiceErr,choiceData);

				});
			},
			main_item_list : (parentCallback)=>{
				items.find({
					// item_id : 	"130001",

					kfg 	: 	true,
					is_half :	true
				},{projection:{item_id: 1, restaurant_slug: 1, restaurant_id:1, _id:1, kfg_vgroup_id:1, kfg_items_list_id:1, v_group_item_ids:1}}).toArray((itemErr, itemResult)=>{
					if(itemErr) return parentCallback(itemErr);

					let itemData = {};
					itemResult.map(itemRecords=>{
						if(itemRecords.kfg_vgroup_id && itemRecords.v_group_item_ids && itemRecords.v_group_item_ids.length >0){
							itemRecords.v_group_item_ids.map(data=>{
								itemData[data.item_id] = {
									item_main_id 		:	itemRecords._id,
									restaurant_slug 	: 	itemRecords.restaurant_slug,
									restaurant_id 		: 	itemRecords.restaurant_id,
									kfg_items_list_id	: 	data.kfg_items_list_id,
								};
							});
						}else{
							itemData[itemRecords.item_id] = {
								item_main_id 		:	itemRecords._id,
								restaurant_slug 	: 	itemRecords.restaurant_slug,
								restaurant_id 		: 	itemRecords.restaurant_id,
								kfg_items_list_id	: 	itemRecords.kfg_items_list_id,
							};
						}
					});
					parentCallback(itemErr,itemData);
				});
			},
		},(parallelErr,asyncReponse)=>{
			if(parallelErr) return console.error(parallelErr);

			// return res.send({asyncReponse : asyncReponse.modifier_groups_item_list});

			if(!asyncReponse.super_admin_details) 	return res.send("Admin user details not found in migrateHalfItem.");
			if(Object.keys(asyncReponse.main_item_list).length <=0) 	return res.send("Item details not found migrateHalfItem.");
			if(Object.keys(asyncReponse.choice_details).length <=0) 	return res.send(" Choice details not found in migrateHalfItem.");

			let superAdminId 		=	asyncReponse.super_admin_details._id;
			let kfgItemList			=	asyncReponse.kfg_item_list;
			let groupItemList		=	asyncReponse.modifier_groups_item_list;
			let mainItemList 		=	asyncReponse.main_item_list;
			let itemDoughTypeList	=	asyncReponse.item_dough_type_list;
			let itemSizeList		=	asyncReponse.item_size_list;
			let selectorList		=	asyncReponse.selector_list;
			let choiceList			=	asyncReponse.choice_details;

			let extraItemList 		= [];
			let itemGroupList 		= {};
			let itemUnitMasterList 	= {};
			Object.keys(mainItemList).map(itemId=>{
				if(kfgItemList[itemId] && choiceList[mainItemList[itemId].item_main_id]){
					let itemSize 	=	kfgItemList[itemId].item_size;
					let doughType 	= 	kfgItemList[itemId].dough_type;
					let selector	= 	kfgItemList[itemId].selector;

					if(!itemUnitMasterList[itemId]){
						itemUnitMasterList[itemId]= {
							item_main_id 		:	mainItemList[itemId].item_main_id,
							restaurant_id 		:	mainItemList[itemId].restaurant_id,
							restaurant_slug		:	mainItemList[itemId].restaurant_slug,
							choice_group_id		:	choiceList[mainItemList[itemId].item_main_id],
							dough_type			:	doughType,
							item_size			:	itemSize,
							selector			: 	selector,
							seq					: 	kfgItemList[itemId].seq,
							item_availablity_status:parseInt(kfgItemList[itemId].item_availablity_status),
							item_price			:	kfgItemList[itemId].item_price,
							selector_name		:	(selectorList[selector]) ? selectorList[selector].en_name :"",
							selector_name_arb	:	(selectorList[selector]) ? selectorList[selector].arb_name:"",
							item_name			:	kfgItemList[itemId].item_name,
							item_name_arb		:	kfgItemList[itemId].item_name_arb,
							item_description	:	kfgItemList[itemId].item_description,
							item_description_arb:	kfgItemList[itemId].item_description_arb,
							size_en_name		: 	itemSizeList[itemSize].size_en_name,
							size_ar_name		: 	itemSizeList[itemSize].size_ar_name,
							dough_type_en_name	: 	itemDoughTypeList[doughType].dough_type,
							dough_type_arb_name	: 	itemDoughTypeList[doughType].dough_type_arb,
							dough_type_en_desc	: 	itemDoughTypeList[doughType].dough_desc,
							dough_type_ar_desc	: 	itemDoughTypeList[doughType].dough_desc_arb,
						};
					}

					if(groupItemList[itemId]){
						groupItemList[itemId].map(records=>{
							let modifierGroupId		=	records.modifier_group_id;
							let extraItemId			=	records.extra_modifier_item_id;

							if(!itemGroupList[modifierGroupId]){
								// if(!itemGroupList[itemId]) itemGroupList[itemId] = {};
								itemGroupList[modifierGroupId] = {
									item_main_id 				:	mainItemList[itemId].item_main_id,
									restaurant_id 				:	mainItemList[itemId].restaurant_id,
									restaurant_slug				:	mainItemList[itemId].restaurant_slug,

									kfg_modifiers_groups_id		:	modifierGroupId,
									choice_group_en_name 		:	records.group_name,
									choice_group_ar_name 		:	records.group_name_arb,
									choice_group_min_quantity 	:	records.group_min,
									choice_group_max_quantity 	:	records.group_max,
								};
							}

							extraItemList.push({
								item_main_id 				:	mainItemList[itemId].item_main_id,
								restaurant_id 				:	mainItemList[itemId].restaurant_id,
								restaurant_slug				:	mainItemList[itemId].restaurant_slug,

								dough_type					:	doughType,
								item_size					:	itemSize,
								selector					: 	selector,
								kfg_modifiers_groups_id		:	modifierGroupId,
								kfg_item_id					:	itemId,
								extra_item_order			:	records.seq,
								kfg_extra_item_id			:	kfgItemList[extraItemId].item_id,
								extra_item_en_name	 		:	kfgItemList[extraItemId].item_name,
								extra_item_ar_name	 		:	kfgItemList[extraItemId].item_name_arb,
								extra_item_price			:	kfgItemList[extraItemId].item_price,
								extra_item_en_description	:	kfgItemList[extraItemId].item_description,
								extra_item_ar_description	:	kfgItemList[extraItemId].item_description_arb,
								extra_item_record_date		:	kfgItemList[extraItemId].record_date,
								item_availablity_status		:	parseInt(kfgItemList[extraItemId].item_availablity_status),
							});

						});
					}
				}
			});

			if(Object.keys(itemUnitMasterList).length <= 0 || Object.keys(itemGroupList).length <= 0 || extraItemList.length <= 0){
				return res.send({
					message				:	"Some Details are missing.",
					extraItemList 		: 	extraItemList.length,
					itemUnitMasterList 	: 	Object.keys(itemUnitMasterList).length,
					itemGroupList 		: 	Object.keys(itemGroupList).length,
				});
			}

			let unitMasterIds	= {};
			let itemUnitIds		= {};
			let itemGroupIds 	= {};
			let extraItemIds	= {};
			let isExtraItemIds	= {};
			asyncForEachOf(itemUnitMasterList,(records,itemId,unitMasterEachCallback)=>{
				let restaurantSlug 	= 	records.restaurant_slug;
				let itemMainId 		= 	records.item_main_id;
				let restaurantId 	=	records.restaurant_id;
				let doughType 		=	records.dough_type;
				let itemSize 		=	records.item_size;
				let selector 		=	records.selector;

				if(!restaurantSlug || !itemMainId || !restaurantId){
					console.error("restaurant details not found in save unit master details ",JSON.stringify(records));
					return unitMasterEachCallback(null);
				}

				asyncParallel({
					unique_item_unit_id : (parellelCallback)=>{
						/** get unique Id Response **/
						getUniqueId(req,res,next,{type:"item_unit"}).then(uniqueIdResponse=>{
							let uniqueItemUnitid = (uniqueIdResponse.result) ? uniqueIdResponse.result :"";
							parellelCallback(null,uniqueItemUnitid);
						}).catch(next);
					},
					dough_type_item_unit_id : (parellelCallback)=>{
						/** get unique Id Response **/
						getUniqueId(req,res,next,{type:"item_unit"}).then(uniqueIdResponse=>{
							let uniqueItemUnitid = (uniqueIdResponse.result) ? uniqueIdResponse.result :"";
							parellelCallback(null,uniqueItemUnitid);
						}).catch(next);
					},
					selector_item_unit_id : (parellelCallback)=>{
						/** get unique Id Response **/
						getUniqueId(req,res,next,{type:"item_unit"}).then(uniqueIdResponse=>{
							let uniqueItemUnitid = (uniqueIdResponse.result) ? uniqueIdResponse.result :"";
							parellelCallback(null,uniqueItemUnitid);
						}).catch(next);
					},
				},(parallelErr,parallelRes)=>{

					let uniqueSizeId 		= 	(parallelRes.unique_item_unit_id) 		? 	parallelRes.unique_item_unit_id 	:"";
					let uniqueDoughTypeId	=	(parallelRes.dough_type_item_unit_id) 	?	parallelRes.dough_type_item_unit_id :"";
					let uniqueSelectorId 	=	(parallelRes.selector_item_unit_id) 	?	parallelRes.selector_item_unit_id 	:"";

					if(!uniqueSizeId || !uniqueDoughTypeId || !uniqueSelectorId){
						console.error("Item unit master unique id not found uniqueSizeId - "+uniqueSizeId+" uniqueDoughTypeId - "+uniqueDoughTypeId+" uniqueSelectorId - "+uniqueSelectorId);
						return unitMasterEachCallback(null);
					}

					asyncParallel({
						upsell_details : (parellelCallback)=>{
							if(unitMasterIds[restaurantSlug] && unitMasterIds[restaurantSlug].size_list && unitMasterIds[restaurantSlug].size_list[itemSize]) return parellelCallback(null);

							let upserllConditions = {
								restaurant_id 	:	restaurantId,
								size_id 		:	itemSize
							};

							/** Get size details */
							item_units_masters.findOne(upserllConditions,{projection: {_id: 1,}},(masterErr,masterResult)=>{
								if(masterResult){
									if(!unitMasterIds[restaurantSlug]) unitMasterIds[restaurantSlug] ={};
									if(!unitMasterIds[restaurantSlug].size_list) unitMasterIds[restaurantSlug].size_list ={};

									unitMasterIds[restaurantSlug].size_list[itemSize] = masterResult._id;
								}

								if(masterErr || masterResult) return parellelCallback(masterErr,masterResult);

								/** Save unit master detils */
								item_units_masters.updateOne(upserllConditions,
								{
									$set		:	{
										name  : {
											en : records.size_en_name,
											ar : records.size_ar_name,
										},
										modified : getUtcDate(),
									},
									$setOnInsert:	{
										added_by		:	superAdminId,
										channel_id		:	CHANNEL_CRON,
										item_unit_id 	:	uniqueSizeId,
										restaurant_slug :	restaurantSlug,
										created   		:	getUtcDate(),
										kfg		 		: 	true,
									}
								},{upsert: true },(insertErr,insertResult)=>{
									if(insertResult &&  insertResult.upsertedId && insertResult.upsertedId._id){
										if(!unitMasterIds[restaurantSlug]) unitMasterIds[restaurantSlug] ={};
										if(!unitMasterIds[restaurantSlug].size_list) unitMasterIds[restaurantSlug].size_list ={};

										unitMasterIds[restaurantSlug].size_list[itemSize] = insertResult.upsertedId._id;
									}
									parellelCallback(insertErr,insertResult);
								});
							});
						},
						dough_type_details : (parellelCallback)=>{
							if(unitMasterIds[restaurantSlug] && unitMasterIds[restaurantSlug].dough_type && unitMasterIds[restaurantSlug].dough_type[doughType]) return parellelCallback(null);

							let upserllConditions = {
								restaurant_id 	:	restaurantId,
								dough_type 		:	doughType
							};

							/** Get dough type details */
							item_units_masters.findOne(upserllConditions,{projection: {_id: 1,}},(masterErr,masterResult)=>{
								if(masterResult){
									if(!unitMasterIds[restaurantSlug]) unitMasterIds[restaurantSlug] ={};
									if(!unitMasterIds[restaurantSlug].dough_type) unitMasterIds[restaurantSlug].dough_type ={};

									unitMasterIds[restaurantSlug].dough_type[doughType] = masterResult._id;
								}

								if(masterErr || masterResult) return parellelCallback(masterErr,masterResult);

								let updateData = {
									name  : {
										en : records.dough_type_en_name,
										ar : records.dough_type_arb_name,
									},
									modified : getUtcDate(),
								}

								if(records.dough_type_en_desc || records.dough_type_ar_desc){
									updateData.description = {
										en : records.dough_type_en_desc,
										ar : records.dough_type_ar_desc,
									};
								}

								/** Save unit master detils */
								item_units_masters.updateOne(upserllConditions,
								{
									$set		:	updateData,
									$setOnInsert:	{
										added_by		:	superAdminId,
										channel_id		:	CHANNEL_CRON,
										item_unit_id 	:	uniqueDoughTypeId,
										restaurant_slug :	restaurantSlug,
										created   		:	getUtcDate(),
										kfg		 		: 	true,
									}
								},{upsert: true },(insertErr,insertResult)=>{
									if(insertResult &&  insertResult.upsertedId && insertResult.upsertedId._id){
										if(!unitMasterIds[restaurantSlug]) unitMasterIds[restaurantSlug] ={};
										if(!unitMasterIds[restaurantSlug].dough_type) unitMasterIds[restaurantSlug].dough_type ={};

										unitMasterIds[restaurantSlug].dough_type[doughType] = insertResult.upsertedId._id;
									}
									parellelCallback(insertErr,insertResult);
								});
							});
						},
						selector_type_details : (parellelCallback)=>{
							if(unitMasterIds[restaurantSlug] && unitMasterIds[restaurantSlug].selector_type && unitMasterIds[restaurantSlug].selector_type[selector]) return parellelCallback(null);

							let selectorConditions = {
								restaurant_id 	:	restaurantId,
								kfg_selector	:	selector
							};

							/** Get selector details */
							item_units_masters.findOne(selectorConditions,{projection: {_id: 1,}},(masterErr,masterResult)=>{
								if(masterResult){
									if(!unitMasterIds[restaurantSlug]) unitMasterIds[restaurantSlug] ={};
									if(!unitMasterIds[restaurantSlug].selector_type) unitMasterIds[restaurantSlug].selector_type ={};

									unitMasterIds[restaurantSlug].selector_type[selector] = masterResult._id;
								}

								if(masterErr || masterResult) return parellelCallback(masterErr,masterResult);

								let updateData = {
									name  : {
										en : records.selector_name,
										ar : records.selector_name_arb,
									},
									modified : getUtcDate(),
								}

								/** Save unit master detils */
								item_units_masters.updateOne(selectorConditions,
								{
									$set		:	updateData,
									$setOnInsert:	{
										added_by		:	superAdminId,
										channel_id		:	CHANNEL_CRON,
										item_unit_id 	:	uniqueSelectorId,
										restaurant_slug :	restaurantSlug,
										created   		:	getUtcDate(),
										kfg		 		: 	true,
									}
								},{upsert: true },(insertErr,insertResult)=>{
									if(insertResult &&  insertResult.upsertedId && insertResult.upsertedId._id){
										if(!unitMasterIds[restaurantSlug]) unitMasterIds[restaurantSlug] ={};
										if(!unitMasterIds[restaurantSlug].selector_type) unitMasterIds[restaurantSlug].selector_type ={};

										unitMasterIds[restaurantSlug].selector_type[selector] = insertResult.upsertedId._id;
									}
									parellelCallback(insertErr,insertResult);
								});
							});
						},
					},(parallelChildErr)=>{
						unitMasterEachCallback(parallelChildErr);
					});
				})
			},(asyncUnitMasterEachErr)=>{
				if(asyncUnitMasterEachErr){
					console.error("Error in migrateHalfItem to save unit master details");
					return console.error(asyncUnitMasterEachErr);
				}

				asyncForEachOf(itemUnitMasterList,(records,itemId,itemUnitSizeEachCallback)=>{
					let restaurantSlug 	= 	records.restaurant_slug;
					let itemMainId 		= 	records.item_main_id;
					let restaurantId 	=	records.restaurant_id;
					let itemSize 		=	records.item_size;

					if(!restaurantSlug || !itemMainId || !restaurantId){
						console.error("restaurant details not found in save item unit size ",JSON.stringify(records));
						return itemUnitSizeEachCallback(null);
					}

					if(!unitMasterIds[restaurantSlug] || !unitMasterIds[restaurantSlug].size_list || !unitMasterIds[restaurantSlug].size_list[itemSize]){
						console.log("Size master unit id not found ",JSON.stringify(records));
						return itemUnitSizeEachCallback(null);
					}

					let sizeUnitMasterId  = unitMasterIds[restaurantSlug].size_list[itemSize];
					let sizeUnitConditions = {
						item_id 		:	itemMainId,
						item_unit_id	: 	sizeUnitMasterId,
						restaurant_id 	:	restaurantId,
					};

					/** Get unit details */
					item_units.findOne(sizeUnitConditions,{projection: {_id: 1,}},(unitErr,unitResult)=>{
						if(unitResult){
							if(!itemUnitIds[restaurantSlug]) itemUnitIds[restaurantSlug] = {};
							if(!itemUnitIds[restaurantSlug][itemMainId]) itemUnitIds[restaurantSlug][itemMainId] = {};
							if(!itemUnitIds[restaurantSlug][itemMainId].size_list) itemUnitIds[restaurantSlug][itemMainId].size_list = {};

							itemUnitIds[restaurantSlug][itemMainId].size_list[itemSize] = unitResult._id;
						}

						if(unitErr || unitResult) return itemUnitSizeEachCallback(unitErr,unitResult);

						let updateData 	=	{
							price 		: 	0,
							modified	:	getUtcDate(),
							sorting		:	(records.seq) ? parseInt(records.seq) :"",
							kfg_size	:	itemSize,
						};

						item_units.updateOne(sizeUnitConditions,
						{
							$set 		:	updateData,
							$setOnInsert: 	{
								added_by		:	superAdminId,
								channel_id		:	CHANNEL_CRON,
								status   		:	records.item_availablity_status,
								created   		:	getUtcDate(),
								kfg		 		: 	true,
								restaurant_slug :	restaurantSlug,
							}
						},{upsert: true },(insertErr,insertRes)=>{
							let childMongoId = (insertRes &&  insertRes.upsertedId && insertRes.upsertedId._id) ? insertRes.upsertedId._id :"";

							if(childMongoId){
								if(!itemUnitIds[restaurantSlug]) itemUnitIds[restaurantSlug] = {};
								if(!itemUnitIds[restaurantSlug][itemMainId]) itemUnitIds[restaurantSlug][itemMainId] = {};
								if(!itemUnitIds[restaurantSlug][itemMainId].size_list) itemUnitIds[restaurantSlug][itemMainId].size_list = {};

								itemUnitIds[restaurantSlug][itemMainId].size_list[itemSize] = childMongoId;
								records.parent_id = childMongoId;
							}
							itemUnitSizeEachCallback(insertErr,insertRes);
						});
					});

				},(asyncItemUnitSizeEachErr)=>{
					if(asyncItemUnitSizeEachErr){
						console.error("Error in migrateHalfItem to save item unit size details");
						return console.error(asyncItemUnitSizeEachErr);
					}

					asyncForEachOf(itemUnitMasterList,(records,itemId,itemUnitDoughTypeEachCallback)=>{
						let restaurantSlug 	= 	records.restaurant_slug;
						let itemMainId 		= 	records.item_main_id;
						let restaurantId 	=	records.restaurant_id;
						let itemSize 		=	records.item_size;
						let doughType 		=	records.dough_type;

						if(!restaurantSlug || !itemMainId || !restaurantId){
							console.error("restaurant details not found in save item unit dough type ",JSON.stringify(records));
							return itemUnitDoughTypeEachCallback(null);
						}

						if(!unitMasterIds[restaurantSlug] || !unitMasterIds[restaurantSlug].dough_type || !unitMasterIds[restaurantSlug].dough_type[doughType]){
							console.log("Dough type master unit id not found ",JSON.stringify(records));
							return itemUnitDoughTypeEachCallback(null);
						}

						if(!itemUnitIds[restaurantSlug] || !itemUnitIds[restaurantSlug][itemMainId] || !itemUnitIds[restaurantSlug][itemMainId].size_list  || !itemUnitIds[restaurantSlug][itemMainId].size_list[itemSize]){
							console.log("Size unit id not found ",JSON.stringify(records));
							return itemUnitDoughTypeEachCallback(null);
						}

						let doughUnitMasterId 	= 	unitMasterIds[restaurantSlug].dough_type[doughType];
						let sizeUnitId 			= 	itemUnitIds[restaurantSlug][itemMainId].size_list[itemSize];

						/** Get unit details */
						item_dough_units.findOne({
							item_id 		:	ObjectId(itemMainId),
							item_unit_id	: 	ObjectId(doughUnitMasterId),
							restaurant_id 	:	ObjectId(restaurantId),
							parents 		: 	{$elemMatch: {$eq: sizeUnitId}}
						},{projection: {_id: 1,}},(unitErr,unitResult)=>{
							if(unitResult){
								if(!itemUnitIds[restaurantSlug]) itemUnitIds[restaurantSlug] = {};
								if(!itemUnitIds[restaurantSlug][itemMainId]) itemUnitIds[restaurantSlug][itemMainId] = {};
								if(!itemUnitIds[restaurantSlug][itemMainId].dough_type) itemUnitIds[restaurantSlug][itemMainId].dough_type = {};

								itemUnitIds[restaurantSlug][itemMainId].dough_type[doughType] = unitResult._id;
							}

							if(unitErr || unitResult) return itemUnitDoughTypeEachCallback(unitErr,unitResult);

							let unitUpdateAbleData = {
								$set :	{
									price 		: 	0,
									modified	:	getUtcDate(),
									sorting		:	(records.seq) ? parseInt(records.seq) :"",
								},
								$setOnInsert: 	{
									added_by		:	superAdminId,
									restaurant_slug :	restaurantSlug,
									channel_id		:	CHANNEL_CRON,
									kfg_dough_type 	:	doughType,
									status   		:	records.item_availablity_status,
									created   		:	getUtcDate(),
									kfg		 		: 	true,
								},
								$addToSet : {
									parents	: sizeUnitId
								}
							};

							item_dough_units.updateOne({
								item_id 		:	ObjectId(itemMainId),
								item_unit_id	: 	ObjectId(doughUnitMasterId),
								restaurant_id 	:	ObjectId(restaurantId),
							},unitUpdateAbleData,{upsert: true },(doughInsertErr,doughInsertRes)=>{
								let childDoughMongoId = (doughInsertRes &&  doughInsertRes.upsertedId && doughInsertRes.upsertedId._id) ? doughInsertRes.upsertedId._id :"";

								if(childDoughMongoId){
									if(!itemUnitIds[restaurantSlug]) itemUnitIds[restaurantSlug] = {};
									if(!itemUnitIds[restaurantSlug][itemMainId]) itemUnitIds[restaurantSlug][itemMainId] = {};
									if(!itemUnitIds[restaurantSlug][itemMainId].dough_type) itemUnitIds[restaurantSlug][itemMainId].dough_type = {};

									itemUnitIds[restaurantSlug][itemMainId].dough_type[doughType] = childDoughMongoId;
								}
								itemUnitDoughTypeEachCallback(doughInsertErr,doughInsertRes);
							});
						});
					},(asyncItemUnitDoughTypeEachErr)=>{
						if(asyncItemUnitDoughTypeEachErr){
							console.error("Error in migrateHalfItem to save item unit dough type details");
							return console.error(asyncItemUnitDoughTypeEachErr);
						}

						asyncForEachOf(itemUnitMasterList,(records,itemId,itemUnitSelectorEachCallback)=>{
							let restaurantSlug 	= 	records.restaurant_slug;
							let itemMainId 		= 	records.item_main_id;
							let restaurantId 	=	records.restaurant_id;
							let itemSize 		=	records.item_size;
							let doughType 		=	records.dough_type;
							let selector 		=	records.selector;

							if(!restaurantSlug || !itemMainId || !restaurantId){
								console.error("Half Restaurant details not found in save item unit selector ",JSON.stringify(records));
								return itemUnitSelectorEachCallback(null);
							}

							if(!unitMasterIds[restaurantSlug] || !unitMasterIds[restaurantSlug].selector_type || !unitMasterIds[restaurantSlug].selector_type[selector]){
								console.log("Half Selector type master unit id not found ",JSON.stringify(records));
								return itemUnitSelectorEachCallback(null);
							}

							if(!itemUnitIds[restaurantSlug] || !itemUnitIds[restaurantSlug][itemMainId] || !itemUnitIds[restaurantSlug][itemMainId].size_list  || !itemUnitIds[restaurantSlug][itemMainId].size_list[itemSize]){
								console.log("Half Size unit id not found ",JSON.stringify(records));
								return itemUnitSelectorEachCallback(null);
							}

							if(!itemUnitIds[restaurantSlug] || !itemUnitIds[restaurantSlug][itemMainId] || !itemUnitIds[restaurantSlug][itemMainId].dough_type  || !itemUnitIds[restaurantSlug][itemMainId].dough_type[doughType]){
								console.log("Half Dough type unit id not found ",JSON.stringify(records));
								return itemUnitSelectorEachCallback(null);
							}

							let selectorUnitMasterId 	= 	unitMasterIds[restaurantSlug].selector_type[selector];
							let sizeUnitId 				= 	itemUnitIds[restaurantSlug][itemMainId].size_list[itemSize];
							let doughTypeUnitId			= 	itemUnitIds[restaurantSlug][itemMainId].dough_type[doughType];

							/** Get unit details */
							item_selector_units.findOne({
								item_id 			:	itemMainId,
								item_unit_id		: 	selectorUnitMasterId,
								restaurant_id 		:	restaurantId,
								parents 			: 	{$elemMatch: {$eq: sizeUnitId}},
								dough_type_parents	: 	{$elemMatch: {$eq: doughTypeUnitId}}
							},{projection: {_id: 1,}},(unitErr,unitResult)=>{

								if(unitResult){
									if(!itemUnitIds[restaurantSlug]) itemUnitIds[restaurantSlug] = {};
									if(!itemUnitIds[restaurantSlug][itemMainId]) itemUnitIds[restaurantSlug][itemMainId] = {};
									if(!itemUnitIds[restaurantSlug][itemMainId].selector_type) itemUnitIds[restaurantSlug][itemMainId].selector_type = {};

									itemUnitIds[restaurantSlug][itemMainId].selector_type[selector] = unitResult._id;
								}

								if(unitErr || unitResult) return itemUnitSelectorEachCallback(unitErr,unitResult);

								let unitUpdateAbleData = {
									$set :	{
										price 		: 	0,
										modified	:	getUtcDate(),
										sorting		:	(records.seq) ? parseInt(records.seq) :"",
									},
									$setOnInsert : 	{
										added_by		:	superAdminId,
										restaurant_slug :	restaurantSlug,
										channel_id		:	CHANNEL_CRON,
										status   		:	records.item_availablity_status,
										created   		:	getUtcDate(),
										kfg_selector	:	selector,
										kfg		 		: 	true,
									},
									$addToSet : {
										parents				: sizeUnitId,
										dough_type_parents	: doughTypeUnitId
									}
								};

								item_selector_units.updateOne({
									item_id 		:	itemMainId,
									item_unit_id	: 	selectorUnitMasterId,
									restaurant_id 	:	restaurantId,
								},unitUpdateAbleData,{upsert: true },(extraInsertErr,extraInsertRes)=>{
									let childUnitMongoId = (extraInsertRes &&  extraInsertRes.upsertedId && extraInsertRes.upsertedId._id) ? extraInsertRes.upsertedId._id :"";

									if(childUnitMongoId){
										if(!itemUnitIds[restaurantSlug]) itemUnitIds[restaurantSlug] = {};
										if(!itemUnitIds[restaurantSlug][itemMainId]) itemUnitIds[restaurantSlug][itemMainId] = {};
										if(!itemUnitIds[restaurantSlug][itemMainId].selector_type) itemUnitIds[restaurantSlug][itemMainId].selector_type = {};

										itemUnitIds[restaurantSlug][itemMainId].selector_type[selector] = childUnitMongoId;
									}
									itemUnitSelectorEachCallback(extraInsertErr);
								});
							});
						},(asyncItemUnitSelectorEachErr)=>{
							if(asyncItemUnitSelectorEachErr){
								console.error("Error in migrateHalfItem to save item unit selector details");
								return console.error(asyncItemUnitSelectorEachErr);
							}

							asyncForEachOf(itemUnitMasterList,(records,itemId,itemExtraGroupEachCallback)=>{
								let itemSize 			= 	records.item_size;
								let itemMainId 			= 	records.item_main_id;
								let restaurantId 		=	records.restaurant_id;
								let restaurantSlug 		= 	records.restaurant_slug;

								if(!unitMasterIds[restaurantSlug] || !unitMasterIds[restaurantSlug].size_list || !unitMasterIds[restaurantSlug].size_list[itemSize]){
									console.log("Size master unit id not found in save is extra item ",JSON.stringify(records));
									return itemExtraGroupEachCallback(null);
								}

								let sizeUnitMasterId = 	unitMasterIds[restaurantSlug].size_list[itemSize];

								/** Get extra master details */
								item_extra_masters.findOne({
									item_id 		: 	ObjectId(itemMainId),
									restaurant_id	:	ObjectId(restaurantId),
									extra_item_id	:	itemId,
								},{projection: {_id: 1}},(masterErr,masterResult)=>{
									if(masterResult){
										if(!isExtraItemIds[restaurantSlug]) isExtraItemIds[restaurantSlug] = {};
										if(!isExtraItemIds[restaurantSlug][itemMainId]) isExtraItemIds[restaurantSlug][itemMainId] = {};

										isExtraItemIds[restaurantSlug][itemMainId][itemId] =  masterResult._id;
									}

									if(masterErr || masterResult) return itemExtraGroupEachCallback(masterErr,masterResult);

									let extrsItemUpdateData = {
										name   : {
											en : records.item_name,
											ar : records.item_name_arb,
										},
										extra_fees 	:	parseFloat(records.item_price),
										item_unit_id:	ObjectId(sizeUnitMasterId),
										modified 	:	getUtcDate(),
									};

									if(records.item_description || records.item_description_arb){
										extrsItemUpdateData.description = {
											en : records.item_description,
											ar : records.item_description_arb,
										};
									}

									/** Save extra master details */
									item_extra_masters.updateOne({
										item_id 		: 	ObjectId(itemMainId),
										restaurant_id 	:	ObjectId(restaurantId),
										extra_item_id	:	itemId,
									},
									{
										$set		:	extrsItemUpdateData,
										$setOnInsert:	{
											kfg		 		: 	true,
											channel_id		:	CHANNEL_CRON,
											added_by		:	superAdminId,
											kfg_main_item_id:	itemId,
											restaurant_slug :	restaurantSlug,
											is_active		:	parseInt(records.item_availablity_status),
											order			:	parseInt(records.seq),
											created   		:	getUtcDate(),

										}
									},{upsert: true },(insertErr,insertResult)=>{
										if(insertResult &&  insertResult.upsertedId && insertResult.upsertedId._id){
											if(!isExtraItemIds[restaurantSlug]) isExtraItemIds[restaurantSlug] = {};
											if(!isExtraItemIds[restaurantSlug][itemMainId]) isExtraItemIds[restaurantSlug][itemMainId] = {};

											isExtraItemIds[restaurantSlug][itemMainId][itemId] =  insertResult.upsertedId._id;
										}
										itemExtraGroupEachCallback(insertErr,insertResult);
									});
								});
							},(asyncExtraGroupEachErr)=>{
								if(asyncExtraGroupEachErr){
									console.error("Error in migrateHalfItem to save item extra group item details");
									return console.error(asyncExtraGroupEachErr);
								}

								asyncForEachOf(itemUnitMasterList,(records,itemId,itemIsExtraGroupCallback)=>{
									let itemMainId 			= 	records.item_main_id;
									let restaurantId 		=	records.restaurant_id;
									let restaurantSlug 		= 	records.restaurant_slug;
									let choiceGroupId 		=	records.choice_group_id;
									let itemSize 			=	records.item_size;
									let doughType			= 	records.dough_type;
									let selector			= 	records.selector;

									if(!restaurantSlug || !itemMainId || !restaurantId || !choiceGroupId){
										console.error("restaurant details not found in save item is extra group ",JSON.stringify(records));
										console.log("\n");
										return itemIsExtraGroupCallback(null);
									}

									if(!unitMasterIds[restaurantSlug] || !unitMasterIds[restaurantSlug].size_list || !unitMasterIds[restaurantSlug].size_list[itemSize]){
										console.log("Size master unit id not found in is extra group ",JSON.stringify(records));
										console.log("\n");
										return itemIsExtraGroupCallback(null);
									}

									if(!unitMasterIds[restaurantSlug] || !unitMasterIds[restaurantSlug].dough_type || !unitMasterIds[restaurantSlug].dough_type[doughType]){
										console.log("Dough type master unit id not found in is extra group ",JSON.stringify(records));
										console.log("\n");
										return itemIsExtraGroupCallback(null);
									}

									if(!unitMasterIds[restaurantSlug] || !unitMasterIds[restaurantSlug].selector_type || !unitMasterIds[restaurantSlug].selector_type[selector]){
										console.log("Half Selector type master unit id not found in is extra group  ",JSON.stringify(records));
										console.log("\n");
										return itemIsExtraGroupCallback(null);
									}


									if(!itemUnitIds[restaurantSlug] || !itemUnitIds[restaurantSlug][itemMainId] || !itemUnitIds[restaurantSlug][itemMainId].size_list  || !itemUnitIds[restaurantSlug][itemMainId].size_list[itemSize]){
										console.log("Size unit id not found in is extra group ",JSON.stringify(records));
										console.log("\n");
										return itemIsExtraGroupCallback(null);
									}

									if(!itemUnitIds[restaurantSlug] || !itemUnitIds[restaurantSlug][itemMainId] || !itemUnitIds[restaurantSlug][itemMainId].dough_type  || !itemUnitIds[restaurantSlug][itemMainId].dough_type[doughType]){
										console.log("Dough unit id not found in is extra group ",JSON.stringify(records));
										console.log("\n");
										return itemIsExtraGroupCallback(null);
									}

									if(!itemUnitIds[restaurantSlug] || !itemUnitIds[restaurantSlug][itemMainId] || !itemUnitIds[restaurantSlug][itemMainId].selector_type  || !itemUnitIds[restaurantSlug][itemMainId].selector_type[selector]){
										console.log("selector unit id not found in is extra group ",JSON.stringify(records));
										console.log("\n");
										return itemIsExtraGroupCallback(null);
									}

									if(!isExtraItemIds[restaurantSlug] || !isExtraItemIds[restaurantSlug][itemMainId] || !isExtraItemIds[restaurantSlug][itemMainId][itemId]){
										console.log("Extra item id not found in is extra group ",JSON.stringify(records));
										console.log("\n");
										return itemIsExtraGroupCallback(null);
									}

									let selectorUnitMasterId=	unitMasterIds[restaurantSlug].selector_type[selector];
									let sizeUnitMasterId 	=	unitMasterIds[restaurantSlug].size_list[itemSize];
									let doughUnitMasterId 	= 	unitMasterIds[restaurantSlug].dough_type[doughType];
									let sizeUnitId 			= 	itemUnitIds[restaurantSlug][itemMainId].size_list[itemSize];
									let doughTypeUnitId		= 	itemUnitIds[restaurantSlug][itemMainId].dough_type[doughType];
									let selectorUnitId		= 	itemUnitIds[restaurantSlug][itemMainId].selector_type[selector];
									let extraItemId 		=	isExtraItemIds[restaurantSlug][itemMainId][itemId];
									let groupId		 		=	choiceGroupId;

									/** Save item group details */
									item_group_extras.updateOne({
										group_id 		: 	ObjectId(groupId),
										item_id 		: 	ObjectId(itemMainId),
										restaurant_id 	:	ObjectId(restaurantId),
										item_extra_id	:	ObjectId(extraItemId),
										kfg_dough_type	:	doughType,
										kfg_size		:	itemSize,
										kfg_selector 	:	selector,
									},
									{
										$set	:	{
											modified 		:	getUtcDate(),
											unit_id			:	sizeUnitMasterId,
											size_id			:	sizeUnitId,
											dough_type_id	:	doughTypeUnitId,
											selector_id		:	selectorUnitId,
											dough_master_unit_id:	doughUnitMasterId,
											selector_master_unit_id:selectorUnitMasterId,
											extra_fees 		: 	parseFloat(records.item_price),
											max_quantity 	: 	1,
											min_quantity 	: 	1,
											// order		 	: 	1,
										},
										$setOnInsert:	{
											channel_id			:	CHANNEL_CRON,
											added_by			:	superAdminId,
											restaurant_slug 	:	restaurantSlug,
											created   			:	getUtcDate(),
											kfg		 			: 	true,
											kfg_main_item_id	:	itemId,
										}
									},{upsert: true },(insertErr)=>{
										itemIsExtraGroupCallback(insertErr);
									});
								},(asyncIsItemExtraGroupEachErr)=>{
									if(asyncIsItemExtraGroupEachErr){
										console.error("Error in migrateHalfItem to save is extra item group");
										return console.error(asyncIsItemExtraGroupEachErr);
									}

									asyncForEachOf(itemGroupList,(records,groupId,groupEachCallback)=>{
										let itemMainId 			= 	records.item_main_id;
										let restaurantId 		=	records.restaurant_id;
										let restaurantSlug 		= 	records.restaurant_slug;
										let kfgModifierGroupId 	=	records.kfg_modifiers_groups_id;

										if(!restaurantSlug || !itemMainId || !restaurantId){
											console.error("restaurant details not found in save item group ",JSON.stringify(records));
											return groupEachCallback(null);
										}

										/** Get item choice group details */
										item_choices_groups.findOne({
											item_id 				: 	ObjectId(itemMainId),
											restaurant_id 			:	ObjectId(restaurantId),
											kfg_modifiers_groups_id : 	parseInt(kfgModifierGroupId),
										},{projection: {_id: 1,}},(masterErr,masterResult)=>{
											if(masterResult){
												if(!itemGroupIds[restaurantSlug]) itemGroupIds[restaurantSlug] = {};
												if(!itemGroupIds[restaurantSlug][itemMainId]) itemGroupIds[restaurantSlug][itemMainId] = {};

												itemGroupIds[restaurantSlug][itemMainId][kfgModifierGroupId] = masterResult._id;
											}

											if(masterErr || masterResult) return groupEachCallback(masterErr);

											/** Save choice group detils */
											item_choices_groups.updateOne({
												item_id 				: 	ObjectId(itemMainId),
												restaurant_id 			:	ObjectId(restaurantId),
												kfg_modifiers_groups_id : 	parseInt(kfgModifierGroupId)
											},
											{
												$set	:	{
													name	: {
														en 	: records.choice_group_en_name,
														ar	: records.choice_group_ar_name,
													},
													min_quantity 	:	records.choice_group_min_quantity,
													max_quantity 	: 	records.choice_group_max_quantity,
													order 			: 	2,
													modified 		:	getUtcDate(),
												},
												$setOnInsert:	{
													kfg		 		: 	true,
													added_by		:	superAdminId,
													channel_id		:	CHANNEL_CRON,
													restaurant_slug :	restaurantSlug,
													created   		:	getUtcDate(),
												}
											},{upsert: true },(insertErr,insertResult)=>{
												if(insertResult &&  insertResult.upsertedId && insertResult.upsertedId._id){
													if(!itemGroupIds[restaurantSlug]) itemGroupIds[restaurantSlug] = {};
													if(!itemGroupIds[restaurantSlug][itemMainId]) itemGroupIds[restaurantSlug][itemMainId] = {};

													itemGroupIds[restaurantSlug][itemMainId][kfgModifierGroupId] = insertResult.upsertedId._id;
												}
												groupEachCallback(insertErr);
											});
										});
									},(asyncGroupEachErr)=>{
										if(asyncGroupEachErr){
											console.error("Error in migrateHalfItem to save group details");
											return console.error(asyncGroupEachErr);
										}

										asyncForEachOf(extraItemList,(records,key,itemExtraCallback)=>{
											let itemMainId 			= 	records.item_main_id;
											let restaurantId 		=	records.restaurant_id;
											let restaurantSlug 		= 	records.restaurant_slug;
											let kfgExtraItemId 		= 	records.kfg_extra_item_id;
											let kfgItemId 			= 	records.kfg_item_id;
											// let kfgModifierGroupId 	=	records.kfg_modifiers_groups_id;
											let itemSize 			=	records.item_size;

											if(!restaurantSlug || !itemMainId || !restaurantId){
												console.error("restaurant details not found in save item extra ",JSON.stringify(records));
												return itemExtraCallback(null);
											}

											if(!unitMasterIds[restaurantSlug] || !unitMasterIds[restaurantSlug].size_list || !unitMasterIds[restaurantSlug].size_list[itemSize]){
												console.log("Size master unit id not found in save extra item ",JSON.stringify(records));
												return itemExtraCallback(null);
											}

											let sizeUnitMasterId = 	unitMasterIds[restaurantSlug].size_list[itemSize];

											/** Get extra master details */
											item_extra_masters.findOne({
												item_id 		: 	ObjectId(itemMainId),
												restaurant_id	:	ObjectId(restaurantId),
												extra_item_id	:	kfgExtraItemId,
											},{projection: {_id: 1}},(masterErr,masterResult)=>{
												if(masterResult){
													if(!extraItemIds[restaurantSlug]) extraItemIds[restaurantSlug] = {};
													if(!extraItemIds[restaurantSlug][itemMainId]) extraItemIds[restaurantSlug][itemMainId] = {};

													extraItemIds[restaurantSlug][itemMainId][kfgExtraItemId] =  masterResult._id;
												}

												if(masterErr || masterResult) return itemExtraCallback(masterErr,masterResult);

												let extrsItemUpdateData = {
													name   : {
														en : records.extra_item_en_name,
														ar : records.extra_item_ar_name,
													},
													extra_fees 	:	parseFloat(records.extra_item_price),
													item_unit_id:	ObjectId(sizeUnitMasterId),
													modified 	:	getUtcDate(),
												};

												if(records.extra_item_en_description || records.extra_item_ar_description){
													extrsItemUpdateData.description = {
														en : records.extra_item_en_description,
														ar : records.extra_item_ar_description,
													};
												}

												/** Save extra master details */
												item_extra_masters.updateOne({
													item_id 		: 	ObjectId(itemMainId),
													restaurant_id 	:	ObjectId(restaurantId),
													extra_item_id	:	kfgExtraItemId,
												},
												{
													$set		:	extrsItemUpdateData,
													$setOnInsert:	{
														kfg		 		: 	true,
														channel_id		:	CHANNEL_CRON,
														added_by		:	superAdminId,
														kfg_main_item_id:	kfgItemId,
														restaurant_slug :	restaurantSlug,
														is_active		:	parseInt(records.item_availablity_status),
														order			:	parseInt(records.extra_item_order),
														created   		:	getUtcDate(records.extra_item_record_date),

													}
												},{upsert: true },(insertErr,insertResult)=>{
													if(insertResult &&  insertResult.upsertedId && insertResult.upsertedId._id){
														if(!extraItemIds[restaurantSlug]) extraItemIds[restaurantSlug] = {};
														if(!extraItemIds[restaurantSlug][itemMainId]) extraItemIds[restaurantSlug][itemMainId] = {};

														extraItemIds[restaurantSlug][itemMainId][kfgExtraItemId] =  insertResult.upsertedId._id;
													}
													itemExtraCallback(insertErr,insertResult);
												});
											});
										},(asyncItemExtraEachErr)=>{
											if(asyncItemExtraEachErr){
												console.error("Error in migrateHalfItem to save extra item");
												return console.error(asyncItemExtraEachErr);
											}

											asyncForEachOf(extraItemList,(records,key,itemExtraGroupCallback)=>{
												let itemMainId 			= 	records.item_main_id;
												let restaurantId 		=	records.restaurant_id;
												let restaurantSlug 		= 	records.restaurant_slug;
												let kfgExtraItemId 		= 	records.kfg_extra_item_id;
												let kfgItemId 			= 	records.kfg_item_id;
												let kfgModifierGroupId 	=	records.kfg_modifiers_groups_id;
												let itemSize 			=	records.item_size;
												let doughType			= 	records.dough_type;
												let selector			= 	records.selector;

												if(!restaurantSlug || !itemMainId || !restaurantId){
													console.error("restaurant details not found in save item extra group ",JSON.stringify(records));
													console.log("\n");
													return itemExtraGroupCallback(null);
												}

												if(!unitMasterIds[restaurantSlug] || !unitMasterIds[restaurantSlug].size_list || !unitMasterIds[restaurantSlug].size_list[itemSize]){
													console.log("Size master unit id not found in extra group ",JSON.stringify(records));
													console.log("\n");
													return itemExtraGroupCallback(null);
												}

												if(!unitMasterIds[restaurantSlug] || !unitMasterIds[restaurantSlug].dough_type || !unitMasterIds[restaurantSlug].dough_type[doughType]){
													console.log("Dough type master unit id not found in extra group ",JSON.stringify(records));
													console.log("\n");
													return itemExtraGroupCallback(null);
												}

												if(!unitMasterIds[restaurantSlug] || !unitMasterIds[restaurantSlug].selector_type || !unitMasterIds[restaurantSlug].selector_type[selector]){
													console.log("Half Selector type master unit id not found in extra group  ",JSON.stringify(records));
													console.log("\n");
													return itemExtraGroupCallback(null);
												}


												if(!itemUnitIds[restaurantSlug] || !itemUnitIds[restaurantSlug][itemMainId] || !itemUnitIds[restaurantSlug][itemMainId].size_list  || !itemUnitIds[restaurantSlug][itemMainId].size_list[itemSize]){
													console.log("Size unit id not found in extra group ",JSON.stringify(records));
													console.log("\n");
													return itemExtraGroupCallback(null);
												}

												if(!itemUnitIds[restaurantSlug] || !itemUnitIds[restaurantSlug][itemMainId] || !itemUnitIds[restaurantSlug][itemMainId].dough_type  || !itemUnitIds[restaurantSlug][itemMainId].dough_type[doughType]){
													console.log("Dough unit id not found in extra group ",JSON.stringify(records));
													console.log("\n");
													return itemExtraGroupCallback(null);
												}

												if(!itemUnitIds[restaurantSlug] || !itemUnitIds[restaurantSlug][itemMainId] || !itemUnitIds[restaurantSlug][itemMainId].selector_type  || !itemUnitIds[restaurantSlug][itemMainId].selector_type[selector]){
													console.log("selector unit id not found in extra group ",JSON.stringify(records));
													console.log("\n");
													return itemExtraGroupCallback(null);
												}

												if(!extraItemIds[restaurantSlug] || !extraItemIds[restaurantSlug][itemMainId] || !extraItemIds[restaurantSlug][itemMainId][kfgExtraItemId]){
													console.log("Extra item id not found in extra group ",JSON.stringify(records));
													console.log("\n");
													return itemExtraGroupCallback(null);
												}

												if(!itemGroupIds[restaurantSlug] || !itemGroupIds[restaurantSlug][itemMainId] || !itemGroupIds[restaurantSlug][itemMainId][kfgModifierGroupId]){
													console.log("Group id not found in extra group ",JSON.stringify(records));
													console.log("\n");
													return itemExtraGroupCallback(null);
												}

												let selectorUnitMasterId=	unitMasterIds[restaurantSlug].selector_type[selector];
												let sizeUnitMasterId 	=	unitMasterIds[restaurantSlug].size_list[itemSize];
												let doughUnitMasterId 	= 	unitMasterIds[restaurantSlug].dough_type[doughType];
												let sizeUnitId 			= 	itemUnitIds[restaurantSlug][itemMainId].size_list[itemSize];
												let doughTypeUnitId		= 	itemUnitIds[restaurantSlug][itemMainId].dough_type[doughType];
												let selectorUnitId		= 	itemUnitIds[restaurantSlug][itemMainId].selector_type[selector];
												let extraItemId 		=	extraItemIds[restaurantSlug][itemMainId][kfgExtraItemId];
												let groupId		 		=	itemGroupIds[restaurantSlug][itemMainId][kfgModifierGroupId];

												/** Save item group details */
												item_group_extras.updateOne({
													group_id 		: 	ObjectId(groupId),
													item_id 		: 	ObjectId(itemMainId),
													restaurant_id 	:	ObjectId(restaurantId),
													item_extra_id	:	ObjectId(extraItemId),
													kfg_dough_type	:	doughType,
													kfg_size		:	itemSize,
													kfg_selector 	:	selector,
												},
												{
													$set	:	{
														modified 		:	getUtcDate(),
														unit_id			:	sizeUnitMasterId,
														size_id			:	sizeUnitId,
														dough_type_id	:	doughTypeUnitId,
														selector_id		:	selectorUnitId,
														dough_master_unit_id:	doughUnitMasterId,
														selector_master_unit_id:selectorUnitMasterId,
														extra_fees 		: 	parseFloat(records.extra_item_price),
														max_quantity 	: 	1,
														min_quantity 	: 	1,
													},
													$setOnInsert:	{
														channel_id				:	CHANNEL_CRON,
														added_by				:	superAdminId,
														restaurant_slug 		:	restaurantSlug,
														created   				:	getUtcDate(),
														kfg		 				: 	true,
														kfg_main_item_id 		:	kfgItemId,
														kfg_modifiers_groups_id :	kfgModifierGroupId,
													}
												},{upsert: true },(insertErr)=>{
													itemExtraGroupCallback(insertErr);
												});
											},(asyncItemExtraGroupEachErr)=>{
												if(asyncItemExtraGroupEachErr){
													console.error("Error in migrateHalfItem to save extra item group");
													return console.error(asyncItemExtraGroupEachErr);
												}
												console.log("Done migrateHalfItem");
											});
										});
									});
								});
							});
						});
					});
				});
			});
			res.render('blank',{layout:false});
		});
	};// end migrateHalfItem()

	/**
	 * Function to migrate pizza item in our database
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 *
	 * @return render
	 */
	this.migratePizzaHutVgroups = (req, res, next, db2)=>{
        const users                 =	db.collection("users");
		const items                 =	db.collection("items");
		const item_units    		=	db.collection("item_units");
		const item_choices_groups   =	db.collection("item_choices_groups");
		const item_extra_masters    =	db.collection("item_extra_masters");
		const item_group_extras     =	db.collection("item_group_extras");
		const item_dough_units     =	db.collection("item_dough_units");


		asyncParallel({
            kfg_item_list: (itemCallback)=>{
                const kfg_all_items_list = db2.collection("kfg_all_items_list");
                kfg_all_items_list.find({}).toArray((err,result)=>{
					if(err) return itemCallback(err);

					let componentData = {};
                    result.map(componentRecords=>{
						componentData[componentRecords.item_id] = componentRecords
					});
                    itemCallback(err,componentData);
                });
            },
			modifier_groups_list: (groupCallback)=>{
                const kfg_modifier_groups = db2.collection("kfg_modifier_groups");
                kfg_modifier_groups.find({}).toArray((err,result)=>{
					if(err) return groupCallback(err);

					let componentData = {};
                    result.map(componentRecords=>{
						componentData[componentRecords.group_id] = componentRecords
					});
                    groupCallback(err,componentData);
                });
            },
			modifier_groups_item_list: (groupItemCallback)=>{
                const kfg_items_modifier_map = db2.collection("kfg_items_modifier_map");
                kfg_items_modifier_map.find({}).toArray((err,result)=>{
					if(err) return groupItemCallback(err);

					let componentData  = {};
					result.map(componentRecords=>{
						let tempItemId 		= 	componentRecords.main_modifier_items_id;
						let tempExtraItemId = 	componentRecords.extra_modifier_item_id;
						let modifierGroupId =	componentRecords.modifier_group_id;

						if(!componentData[tempItemId]) componentData[tempItemId] = [];
						componentData[tempItemId].push(componentRecords);
					});
                    groupItemCallback(err,componentData);
                });
            },
			super_admin_details: (superAdminDetails)=>{
				users.findOne({
                    user_role_id : CRAVEZ
                },{projection:{full_name:1,_id:1}},(superAdminErr, superAdminResult)=>{
                    superAdminDetails(superAdminErr, superAdminResult);
                });
            },
            main_item_list : (parentCallback)=>{
				items.find({
					kfg : 	{ $exists: true },
					kfg_vgroup_id: {$exists:true},
					v_group_item_ids: {$exists:true},
					"v_group_item_ids.dough_type" : {$gt:0},
					$and : [
						{$or	:	[
							{is_deal : { $exists: false }},
							{is_deal : false}
						]},
						{$or	:	[
							{is_half : { $exists: false }},
							{is_half : false}
						]},
					]
				},{projection:{item_id: 1, name: 1, restaurant_slug: 1, restaurant_id: 1, _id:1, kfg_vgroup_id:1, kfg_items_list_id:1, v_group_item_ids:1}}).toArray((itemErr, itemResult)=>{
                    if(itemErr) return parentCallback(itemErr);

					let itemData = {};
                    itemResult.map(itemRecords=>{
						let tempItemId = String(itemRecords._id);
						if(itemRecords.kfg_vgroup_id && itemRecords.v_group_item_ids && itemRecords.v_group_item_ids.length >0){
							itemRecords.v_group_item_ids.map(data=>{
								if(!itemData[tempItemId]) itemData[tempItemId] = {
									item_id				:	itemRecords.item_id,
									restaurant_slug 	: 	itemRecords.restaurant_slug,
									restaurant_id 		: 	itemRecords.restaurant_id,
									item_list			: 	[]
								};
								itemData[tempItemId].item_list.push({
									kfg_items_list_id 	: data.kfg_items_list_id,
									item_id			 	: data.item_id,
									dough_type		 	: data.dough_type,
									item_size		 	: data.item_size,
								});
							});
						}
					});
                    parentCallback(itemErr,itemData);
                });
			},
            unit_master_list : (parentCallback)=>{
				asyncParallel({
					dough_data: (doughCallback)=>{
						item_dough_units.find({
							kfg : { $exists: true },
							kfg_dough_type:  { $exists: true }
						},{projection:{_id: 1,item_id: 1, item_unit_id: 1,kfg_dough_type: 1 }}).toArray((unitErr, unitResult)=>{
							if(unitErr) return doughCallback(unitErr);
							let doughData 	= {};
							unitResult.map(unitRecords=>{
								let tempItemId = String(unitRecords.item_id);
								if(!doughData[tempItemId]) doughData[tempItemId] = {};
								doughData[tempItemId][unitRecords.kfg_dough_type] = unitRecords;
							});
							doughCallback(unitErr,doughData);
						});
					},
					size_data: (sizeCallback)=>{
						item_units.find({
							kfg : { $exists: true },
							kfg_size:  { $exists: true }
						},{projection:{_id: 1,item_id: 1, item_unit_id: 1,kfg_size: 1 }}).toArray((unitErr, unitResult)=>{
							if(unitErr) return sizeCallback(unitErr);
							let sizeData 	= {};
							unitResult.map(unitRecords=>{
								let tempItemId = String(unitRecords.item_id);
								if(!sizeData[tempItemId]) sizeData[tempItemId] = {};
								sizeData[tempItemId][unitRecords.kfg_size] = unitRecords;
							});
							sizeCallback(unitErr,sizeData);
						});
					}
				},(asyncSizeDoughErr,asyncSizeDoughResponse)=>{
					if(asyncSizeDoughErr) return parentCallback(asyncSizeDoughErr);
					parentCallback(null,{
						size_data :	asyncSizeDoughResponse.size_data,
						dough_data: asyncSizeDoughResponse.dough_data
					});
				});
			}
        },(parallelErr,asyncReponse)=>{
			if(parallelErr) return console.error(parallelErr);

			if(!asyncReponse.super_admin_details) 	return console.error("Admin user details not found in migrateItemChoice.");
			if(Object.keys(asyncReponse.main_item_list).length <=0) 	return console.error("Item details not found migrateItemChoice.");
			let superAdminId 		=	asyncReponse.super_admin_details._id;
			let kfgItemList			=	asyncReponse.kfg_item_list;
			let modifierGroupsList	=	asyncReponse.modifier_groups_list;
			let groupItemList		=	asyncReponse.modifier_groups_item_list;
			let mainItemList 		=	asyncReponse.main_item_list;
			let unitMasterList		= 	asyncReponse.unit_master_list;

			let modifierChoiesGroup 		=	{};
			let modifierExtraItemList 		=	{};
			let modifierGroupExtras 		=	{};
			let modifierGroupExtrasItems 	=	{};

			Object.keys(mainItemList).map(mainItemId=>{
				let extraItemData 	= mainItemList[mainItemId];
				let itemId			= mainItemList[mainItemId].item_id;

				if(extraItemData.item_list.length>0){
					extraItemData.item_list.map(extraItemRecords=>{
						let extraItemId = extraItemRecords.item_id;
						let doughType 	= extraItemRecords.dough_type;
						let itemSize 	= extraItemRecords.item_size;

						if(!groupItemList[extraItemId]){
							if(!groupItemList[extraItemId]){
								console.log("item id: "+extraItemId+" not found in groupItemList");
								return;
							}
						}

						if(groupItemList[extraItemId].length>0){
							groupItemList[extraItemId].map(groupItemRecords=>{
								let groupId 			= groupItemRecords.modifier_group_id;
								let extraModifierItemId = groupItemRecords.extra_modifier_item_id;

								if(!modifierExtraItemList[mainItemId]) modifierExtraItemList[mainItemId] = {};

								if(!modifierExtraItemList[mainItemId][extraModifierItemId]){
									modifierExtraItemList[mainItemId][extraModifierItemId] = {
										item_main_id 				:	mainItemId,
										restaurant_id 				:	mainItemList[mainItemId].restaurant_id,
										restaurant_slug				:	mainItemList[mainItemId].restaurant_slug,
										kfg_modifiers_groups_id		:	groupId,
										kfg_item_id					:	extraItemId,
										extra_item_order			:	groupItemRecords.seq,
										kfg_extra_item_id			:	parseInt(extraModifierItemId),
										extra_item_en_name	 		:	kfgItemList[extraModifierItemId].item_name,
										extra_item_ar_name	 		:	kfgItemList[extraModifierItemId].item_name_arb,
										extra_item_price			:	kfgItemList[extraModifierItemId].item_price,
										extra_item_en_description	:	kfgItemList[extraModifierItemId].item_description,
										extra_item_ar_description	:	kfgItemList[extraModifierItemId].item_description_arb,
										extra_item_record_date		:	kfgItemList[extraModifierItemId].record_date,
										item_availablity_status		:	parseInt(kfgItemList[extraModifierItemId].item_availablity_status),
										item_unit_size				:	itemSize
									};
								}

								if(!modifierChoiesGroup[mainItemId]) modifierChoiesGroup[mainItemId] = {};

								if(!modifierChoiesGroup[mainItemId][groupId]){
									modifierChoiesGroup[mainItemId][groupId] = {
										item_main_id 				:	mainItemId,
										restaurant_id 				:	mainItemList[mainItemId].restaurant_id,
										restaurant_slug				:	mainItemList[mainItemId].restaurant_slug,
										kfg_item_id					:	itemId,
										kfg_modifiers_groups_id		:	groupId,
										choice_group_en_name 		:	modifierGroupsList[groupId].group_name,
										choice_group_ar_name 		:	modifierGroupsList[groupId].group_name_arb,
										choice_group_min_quantity 	:	modifierGroupsList[groupId].group_min,
										choice_group_max_quantity 	:	modifierGroupsList[groupId].group_max,
										choice_group_record_date 	:	modifierGroupsList[groupId].record_date,
										item_unit_size				:	itemSize
									};
								}

								/** ignore duplicacy */
								if(!modifierGroupExtras[mainItemId]) modifierGroupExtras[mainItemId] = {};
								if(!modifierGroupExtras[mainItemId][itemSize]) modifierGroupExtras[mainItemId][itemSize] = {};
								if(!modifierGroupExtras[mainItemId][itemSize][doughType]) modifierGroupExtras[mainItemId][itemSize][doughType] = {};
								if(!modifierGroupExtras[mainItemId][itemSize][doughType][groupId]) modifierGroupExtras[mainItemId][itemSize][doughType][groupId] = {};

								if(!modifierGroupExtras[mainItemId][itemSize][doughType][groupId][extraModifierItemId]){
									modifierGroupExtras[mainItemId][itemSize][doughType][groupId][extraModifierItemId] = true;
									if(!modifierGroupExtrasItems[mainItemId]) modifierGroupExtrasItems[mainItemId] = [];
									modifierGroupExtrasItems[mainItemId].push({
										kfg_size		: itemSize,
										kfg_dough_type	: doughType,
										group_id		: groupId,
										extra_item_id	: extraModifierItemId
									});
								}
							});
						}else{
							console.log("groupItemList[extraItemId] is empty : "+extraItemId);
						}
					});
				}else{
					console.log("extraItemData.item_list is empty");
				}
			});

			if(Object.keys(modifierChoiesGroup).length <= 0 || Object.keys(modifierExtraItemList).length <= 0){
				console.log("Modifier some details not found");
				console.log("modifierChoiesGroup Count "+Object.keys(modifierChoiesGroup).length);
				console.log("modifierExtraItemList Count "+modifierExtraItemList.length);
				return;
			}

			let finalGroupIds 	= 	{};
			asyncParallel({
				choice_group_list: (modifierChoiceCallback)=>{
					asyncForEachOf(modifierChoiesGroup,(reco,itemId,forEachCallback)=>{
						asyncForEachOf(modifierChoiesGroup[itemId],(records,groupId,forEachChildCallback)=>{
							let tempRestaurantId 			=	records.restaurant_id;
							let tempRestaurantSlug 			= 	records.restaurant_slug;
							let tempItemMainId 			 	= 	itemId;
							let tempKfgModifiersGroupsId 	= 	records.kfg_modifiers_groups_id;

							/** Get item choice group details */
							item_choices_groups.findOne({
								item_id 				: 	ObjectId(tempItemMainId),
								restaurant_id 			:	ObjectId(tempRestaurantId),
								kfg_modifiers_groups_id : 	parseInt(tempKfgModifiersGroupsId),
							},{projection: {_id: 1,}},(masterErr,masterResult)=>{
								if(masterErr) return forEachChildCallback(masterErr);

								if(masterResult){
									modifierChoiesGroup[itemId][groupId]._id = masterResult._id;
									return forEachChildCallback(masterErr);
								}

								if(!unitMasterList.size_data[itemId] || typeof unitMasterList.size_data[itemId][records.item_unit_size] === typeof undefined || typeof unitMasterList.size_data[itemId][records.item_unit_size] === typeof undefined){
									console.log("kfg size id not found in unitMasterList : "+records.item_unit_size+" for item: "+itemId);
									return forEachChildCallback(null);
								}

								/** Save choice group detils */
								item_choices_groups.updateOne({
									item_id 				: 	ObjectId(tempItemMainId),
									restaurant_id 			:	ObjectId(tempRestaurantId),
									kfg_modifiers_groups_id : 	parseInt(tempKfgModifiersGroupsId),
								},
								{
									$set	:	{
										name	: {
											en 	: records.choice_group_en_name,
											ar	: records.choice_group_ar_name,
										},
										min_quantity 	:	records.choice_group_min_quantity,
										max_quantity 	: 	records.choice_group_max_quantity,
										item_unit_id	:	unitMasterList.size_data[itemId][records.item_unit_size].item_unit_id,
										order			:	2,
										modified 		:	getUtcDate(),
									},
									$setOnInsert:	{
										kfg		 		: 	true,
										added_by		:	superAdminId,
										channel_id		:	CHANNEL_CRON,
										restaurant_slug :	tempRestaurantSlug,
										created   		:	getUtcDate(),
									}
								},{upsert: true },(insertErr,insertResult)=>{
									if(insertResult &&  insertResult.upsertedId && insertResult.upsertedId._id){
										modifierChoiesGroup[itemId][groupId]._id = insertResult.upsertedId._id;
									}
									forEachChildCallback(insertErr);
								});
							});
						},(asyncEachChildErr)=>{
							forEachCallback(asyncEachChildErr);
						});
					},(asyncEachErr)=>{
						modifierChoiceCallback(asyncEachErr);
					});
				},
			},(parallelSubErr)=>{
				if(parallelSubErr) return itemCallback(parallelSubErr);

				asyncForEachOf(modifierExtraItemList,(reco,itemId,forEachCallback)=>{
					asyncForEachOf(modifierExtraItemList[itemId],(records,extraModifierItemId,forEachChildCallback)=>{
						let tempRestaurantId 	=	records.restaurant_id;
						let tempRestaurantSlug 	= 	records.restaurant_slug;
						let tempItemMainId 		= 	itemId;
						let kfgItemId 			= 	records.kfg_item_id;
						let kfgModifiersGroupsId= 	records.kfg_modifiers_groups_id;

						if(!modifierChoiesGroup[tempItemMainId] || !modifierChoiesGroup[tempItemMainId][kfgModifiersGroupsId]){
							forEachChildCallback(null);
							return console.log("Modifier Choice group details not found ",JSON.stringify(records));
						}

						if(!unitMasterList.size_data[itemId] || typeof unitMasterList.size_data[itemId][records.item_unit_size] === typeof undefined || typeof unitMasterList.size_data[itemId][records.item_unit_size] === typeof undefined){
							console.log("kfg size id not found in unitMasterList : "+records.item_unit_size+" for item: "+itemId,records);
							return forEachChildCallback(null);
						}

						/** Get extra master details */
						item_extra_masters.findOne({
							item_id 				: 	ObjectId(tempItemMainId),
							restaurant_id 			:	ObjectId(tempRestaurantId),
							extra_item_id			:	records.kfg_extra_item_id,
							kfg_modifiers_groups_id :	kfgModifiersGroupsId,
							kfg_main_item_id		:	kfgItemId,
						},{projection: {_id: 1,}},(masterErr,masterResult)=>{
							let masterId = (masterResult) ? masterResult._id :"";
							if(masterErr || masterResult){
								modifierExtraItemList[itemId][extraModifierItemId]._id = masterId;
								return forEachChildCallback(null);
							}

							let extrsItemUpdateData = {
								name   : {
									en : records.extra_item_en_name,
									ar : records.extra_item_ar_name,
								},
								item_unit_id	:	unitMasterList.size_data[itemId][records.item_unit_size].item_unit_id,
								extra_fees 		:	parseFloat(records.extra_item_price),
								order 			:	parseFloat(records.extra_item_order),
								max_quantity	: 	1,
								min_quantity	: 	1,
								modified 		:	getUtcDate(),
							};

							if(records.extra_item_en_description || records.extra_item_ar_description){
								extrsItemUpdateData.description = {
									en : records.extra_item_en_description,
									ar : records.extra_item_ar_description,
								};
							}

							/** Save extra master details */
							item_extra_masters.updateOne({
								item_id 		: 	ObjectId(tempItemMainId),
								restaurant_id 	:	ObjectId(tempRestaurantId),
								extra_item_id	:	records.kfg_extra_item_id,
								kfg_modifiers_groups_id :	kfgModifiersGroupsId,
								kfg_main_item_id:	kfgItemId,
							},
							{
								$set		:	extrsItemUpdateData,
								$setOnInsert:	{
									kfg		 		: 	true,
									channel_id		:	CHANNEL_CRON,
									added_by		:	superAdminId,
									restaurant_slug :	tempRestaurantSlug,
									is_active		:	parseInt(records.item_availablity_status),
									created   		:	getUtcDate(records.extra_item_record_date),

								}
							},{upsert: true },(insertErr,insertResult)=>{
								let masterId = (insertResult &&  insertResult.upsertedId && insertResult.upsertedId._id) ? insertResult.upsertedId._id:"";
								modifierExtraItemList[itemId][extraModifierItemId]._id = masterId;
								forEachChildCallback(null);
							});
						});
					},(asyncEachChildErr)=>{
						if(!modifierGroupExtrasItems[itemId]){
							console.log("Modifier extra item details not found for ",itemId);
							return forEachCallback(asyncExtraErr);
						}

						asyncForEachOf(modifierGroupExtrasItems[itemId],(extraRecords,key,subExtraForEachCallback)=>{

							if(!modifierChoiesGroup[itemId] || typeof modifierChoiesGroup[itemId][extraRecords.group_id] === typeof undefined || typeof modifierChoiesGroup[itemId][extraRecords.group_id]._id === typeof undefined){
								console.log("id not found in modifierChoiesGroup : "+extraRecords.group_id+" for item: "+itemId);
								return subExtraForEachCallback(null);
							}

							if(!modifierExtraItemList[itemId] || typeof modifierExtraItemList[itemId][extraRecords.extra_item_id] === typeof undefined || typeof modifierExtraItemList[itemId][extraRecords.extra_item_id]._id === typeof undefined){
								console.log("id not found in modifierExtraItemList : "+extraRecords.extra_item_id+" for item: "+itemId);
								return subExtraForEachCallback(null);
							}

							if(typeof unitMasterList.dough_data[itemId] === typeof undefined || typeof unitMasterList.dough_data[itemId][extraRecords.kfg_dough_type] === typeof undefined || typeof unitMasterList.dough_data[itemId][extraRecords.kfg_dough_type] === typeof undefined){
								console.log("kfg dough id not found in unitMasterList : "+extraRecords.kfg_dough_type+" for item: "+itemId);
								return subExtraForEachCallback(null);
							}

							if(!unitMasterList.size_data[itemId] || typeof unitMasterList.size_data[itemId][extraRecords.kfg_size] === typeof undefined || typeof unitMasterList.size_data[itemId][extraRecords.kfg_size] === typeof undefined){
								console.log("kfg size id not found in unitMasterList : "+extraRecords.kfg_size+" for item: "+itemId);
								return subExtraForEachCallback(null);
							}

							let groupId 			= modifierChoiesGroup[itemId][extraRecords.group_id]._id;
							let extraItemId 		= modifierExtraItemList[itemId][extraRecords.extra_item_id]._id;
							let doughTypeObjectId 	= unitMasterList.dough_data[itemId][extraRecords.kfg_dough_type]._id;
							let doughTypeMasterId 	= unitMasterList.dough_data[itemId][extraRecords.kfg_dough_type].item_unit_id;
							let itemSizeId 			= unitMasterList.size_data[itemId][extraRecords.kfg_size].item_unit_id;
							let itemSizeObjectId 	= unitMasterList.size_data[itemId][extraRecords.kfg_size]._id;

							/** Save item group details */
							item_group_extras.updateOne({
								group_id 		: 	ObjectId(groupId),
								item_id 		: 	ObjectId(itemId),
								restaurant_id 	:	modifierExtraItemList[itemId][extraRecords.extra_item_id].restaurant_id,
								item_extra_id	:	extraItemId,
								kfg_dough_type	:	extraRecords.kfg_dough_type,
								kfg_size		:	extraRecords.kfg_size
							},
							{
								$set	:	{
									modified 				:	getUtcDate(),
									unit_id					:	itemSizeId,
									size_id					:	itemSizeObjectId,
									dough_type_id			:	doughTypeObjectId,
									dough_master_unit_id	:	doughTypeMasterId,
									extra_fees 				: 	parseFloat(modifierExtraItemList[itemId][extraRecords.extra_item_id].extra_item_price),
									max_quantity 			: 	1,
									min_quantity 			: 	1,
								},
								$setOnInsert:	{
									channel_id				:	CHANNEL_CRON,
									added_by				:	superAdminId,
									restaurant_slug 		:	modifierExtraItemList[itemId][extraRecords.extra_item_id].restaurant_slug,
									created   				:	getUtcDate(),
									kfg		 				: 	true,
									kfg_main_item_id 		:	modifierExtraItemList[itemId][extraRecords.extra_item_id].kfg_item_id,
									kfg_modifiers_groups_id :	extraRecords.group_id,
								}
							},{upsert: true },(insertErr)=>{
								subExtraForEachCallback(insertErr);
							});
						},(subExtraEachErr)=>{
							forEachCallback(subExtraEachErr);
						});
					});
				},(asyncEachErr)=>{
					console.log('script end asyncEachErr');
					console.log(asyncEachErr);
				});
			});
		});
		res.render('blank',{layout:false});
	}// end migratePizzaHutVgroups()



}
module.exports = new Migration();
/**  */
    /**
    kfg_stores
    {
        "_id" : ObjectId("5e32e8d1785c4b2a34cc39c5"),
        "kfg_store_id" : 1131.0,
        "store_id" : "21",
        "store_name" : "bk dasma",
        "store_name_arabic" : null,
        "store_number" : "322008",
        "store_phone1" : "22574509",
        "store_phone2" : "22517456",
        "store_address" : "homoud al ruquba st,dasma - block 5, dasma , kuwait",
        "store_concept_id" : "2",
        "store_status" : "1",
        "store_promise_time" : "30",
        "start_time" : "10:50:00",
        "end_time" : "05:00:59",
        "service_charge" : 0.0,
        "store_menu_id" : "3",
        "store_country_id" : "3",
        "store_province_id" : "15",
        "store_city_id" : "100",
        "store_district_id" : "47",
        "store_street_id" : "1634",
        "store_area_id" : "204",
        "store_zone_id" : null,
        "record_date" : ISODate("2005-03-18T18:30:00.000Z"),
        "last_update_date" : ISODate("2013-03-18T18:30:00.000Z"),
        "pickup_start_time" : "10:50:00",
        "pickup_end_time" : "05:00:59",
        "longitude" : "29.361899",
        "latitude" : "48.006643"
    }

    -----------


    users
    //Pizza hut user
    {
        "restaurant_id" : ObjectId("5e3a9b9c9040de8656e72f5e"),
        "user_role_id" : "5b6bc8351dd6a1219e632b05",
        "user_type" : "restaurant",
        "active" : 1,
        "created" : ISODate("2019-02-05T09:03:09.956Z"),
        "email" : "pizza.hut@mailinator.com",
        "full_name" : "Pizza hut",
        "is_deleted" : 0,
        "is_verified" : 1,
        "mobile_number" : "22113344",
        "modified" : ISODate("2019-02-05T09:03:09.956Z"),
        "password" : "$2b$10$.vDrV1lx4HeUN6op9px8UuQuWVX8w.YW7KVn0fnNZH.yaZVbetcyu",
        "phone_country_code" : "+965",
        "slug" : "pizza-hut",
        "username" : "pizza.hut@mailinator.com"
    }

    //Burger King user
    {
        "restaurant_id" : ObjectId("5e3a9c009040de8656e99ecb"),
        "user_role_id" : "5b6bc8351dd6a1219e632b05",
        "user_type" : "restaurant",
        "active" : 1,
        "created" : ISODate("2019-02-05T09:03:09.956Z"),
        "email" : "burger.king@mailinator.com",
        "full_name" : "Burger King",
        "is_deleted" : 0,
        "is_verified" : 1,
        "mobile_number" : "22113345",
        "modified" : ISODate("2019-02-05T09:03:09.956Z"),
        "password" : "$2b$10$.vDrV1lx4HeUN6op9px8UuQuWVX8w.YW7KVn0fnNZH.yaZVbetcyu",
        "phone_country_code" : "+965",
        "slug" : "burger-king",
        "username" : "burger.king@mailinator.com"
    }

    //Pizza Hut
    restaurants
    {
        // After inserting in db
        "_id" : ObjectId("5e3a9b9c9040de8656e72f5e"),
        "address" : "Pizza Hut",
        "created" : ISODate("2019-02-05T09:03:09.956Z"),
        "default_name" : "Pizza Hut",
        "description" : "Pizza Hut",
        "image" : "",
        "is_deleted" : 0,
        "modified" : ISODate("2019-02-05T09:03:09.956Z"),
        "name" : {
            "en" : "Pizza Hut",
            "ar" : "سيخ دونر"
        },
        "open" : false,
        "restaurant_number" : "854568",
        "slug" : "pizza-hut",
        "status" : 1,
        "concept_id": 1
    }

    Burger King
    restaurants
    {
        // After inserting in db
        "_id" : ObjectId("5e3a9c009040de8656e99ecb"),
        "address" : "Burger King",
        "created" : ISODate("2019-12-12T09:03:09.956Z"),
        "default_name" : "Burger King",
        "description" : "Burger King",
        "image" : "",
        "is_deleted" : 0,
        "modified" : ISODate("2019-02-05T09:03:09.956Z"),
        "name" : {
            "en" : "Burger King",
            "ar" : "برجر كنج"
        },
        "open" : false,
        "restaurant_number" : "854569",
        "slug" : "burger-king",
        "status" : 1,
        "concept_id": 2
    }


    -----------


    users
    {
        "restaurant_id" : ObjectId("5df213421736296c2d8ba628"),
        "user_role_id" : "5b6bc8351dd6a1219e632b05",
        "user_type" : "restaurant",
        "active" : 1,
        "created" : ISODate("2019-12-12T10:15:30.830Z"),
        "email" : "caesar@mailinator.com",
        "full_name" : "Caesar",
        "is_deleted" : 0,
        "is_verified" : 1,
        "mobile_number" : "22113344",
        "modified" : ISODate("2020-02-04T13:33:42.658Z"),
        "password" : "$2b$10$.vDrV1lx4HeUN6op9px8UuQuWVX8w.YW7KVn0fnNZH.yaZVbetcyu",
        "phone_country_code" : "+965",
        "slug" : "caesar",
        "username" : "caesar@mailinator.com",
        "last_login" : ISODate("2020-02-04T13:33:42.658Z")
    }


    restaurants
    {
        "address" : "Al Jahra, Kuwait",                             "store_address"
        "created" : ISODate("2019-12-12T09:03:09.956Z"),            getUtcDate()
        "default_name" : "Skewer Doner",	                        ?
        "description" : "Al Jahra, Kuwait",	                        ?
        "image" : "",
        "is_deleted" : 0,
        "modified" : ISODate("2019-12-12T10:05:16.321Z")            ,getUtcDate()
        "name" : {
            "en" : "Skewer Doner",                                  ?
            "ar" : "سيخ دونر" ?                                     ?
        },
        "open" : false,
        "restaurant_number" : "",	                                generate Number
        "slug" : "skewer-doner",	                                generateSlug
        "status" : 1
    }

    restaurant_details
    {
        "_id" : ObjectId("5df2024d6f49bfe051c0a922"),
        "restaurant_id" : ObjectId("5df2024d85ea0d05d6cf61a7"),
        "account_manager" : "Skewer Doner",                         ?
        "address" : "Al Jahra, Kuwait",                             ?
        "approved_by" : ObjectId("5df1e6bf517e712e9f33a2b3"),
        "approved_on" : ISODate("2019-12-12T09:03:09.959Z"),
        "bank_account" : "0532013000",                              Account details?
        "beneficiary" : "Skewer Doner",
        "caused_by" : [                                             ?
            {
                "cause" : "customer",
                "percentage" : 25
            },
            {
                "cause" : "restaurant",
                "percentage" : 10
            },
            {
                "cause" : "crv",
                "percentage" : 25
            }
        ],
        "commission_criteria" : "gross_amount",                     ?
        "commission_type" : "fixed",                                ?
        "commission_value" : [                                      ?
            {
                "commission" : 10
            }
        ],
        "contact_person" : "Skewer Doner",                          ?
        "contract_date" : ISODate("2019-12-12T00:00:00.000Z"),      ?
        "contract_number" : "56458521",                             ?
        "created" : ISODate("2019-12-12T09:03:09.960Z"),            ?
        "delivery_by" : [                                           Restaurant always
            "cravez",
            "restaurant"
        ],
        "effective_date" : ISODate("2019-12-20T00:00:00.000Z"),     ?
        "email" : "skewer.doner@mailinator.com",                    ?
        "expire_date" : ISODate("2020-12-31T00:00:00.000Z"),        ?
        "iban" : "DE89 3704 0044 0532 0130 00",                     ?
        "mobile_number" : "1155332266",                             ?
        "modified" : ISODate("2019-12-12T10:05:16.322Z"),           getUtcDate()
        "payment_method" : [                                        ?
            {
                "method" : "cash",
                "commission" : 10
            },
            {
                "method" : "k-net",
                "commission" : 10
            },
            {
                "method" : "credit",
                "commission" : 10
            },
            {
                "method" : "myfatoorah-credit",
                "commission" : 10
            }
        ],
        "phone_country_code" : "+91",                               default country code : +965
        "settlement_method" : [                                     ?
            "cash",
            "cheque",
            "transfer"
        ],
        "settlement_type" : "monthly",                              ?
        "valid_from" : ISODate("2019-12-12T00:00:00.000Z")          ?
    }

    restaurant_details pizza hut
    {
        "restaurant_id" : ObjectId("5e3a9b9c9040de8656e72f5e"),
        "delivery_by" : [
            "restaurant"
        ],
        "email" : "pizza.hut@mailinator.com",
        "mobile_number" : "22113344",
        "payment_method" : [
            {
                "method" : "cash",
                "commission" : 0
            },
            {
                "method" : "k-net",
                "commission" : 0
            },
            {
                "method" : "credit",
                "commission" : 0
            },
            {
                "method" : "myfatoorah-credit",
                "commission" : 0
            }
        ],
        "phone_country_code" : "+965"
    }

    restaurant_details burger king
    {
        "restaurant_id" : ObjectId("5e3a9c009040de8656e99ecb"),
        "delivery_by" : [
            "restaurant"
        ],
        "email" : "burger.king@mailinator.com",
        "mobile_number" : "22113345",
        "payment_method" : [
            {
                "method" : "cash",
                "commission" : 0
            },
            {
                "method" : "k-net",
                "commission" : 0
            },
            {
                "method" : "credit",
                "commission" : 0
            },
            {
                "method" : "myfatoorah-credit",
                "commission" : 0
            }
        ],
        "phone_country_code" : "+965",
    }



    restaurant_branches
    {
        "added_by" : ,                                                          Super admin
        "address" : "Skewer Doner Branch 1",                                    "store_address"
        "area_id" : ObjectId("5df1fbed3781db4ed271138e"),	                    according to "store_area_id"
        "block" : "",	                                                        "store_area_id"
        "branch_number" : "268079",                                             store_number
        "build_no" : "",
        "city_id" : ObjectId("5df1f9cf3781db4ed2711368"),                       according to "store_area_id"
        "created" : ISODate("2019-12-19T08:28:05.265Z"),                        record date
        "description" : "",                                                     ?
        "modified" : ISODate("2019-12-23T12:26:22.284Z"),                       getUtcDate()
        "name" : {
            "en" : "Skewer Doner Branch 1",		                                "store_name"
            "ar" : "Skewer Doner Branch 1"		                                "store_name_arabic"
        },
        "restaurant_id" : ObjectId("5df2024d85ea0d05d6cf61a7"),                 take from restaurant table
        "restaurant_slug" : "skewer-doner",	                                    generateSlug
        "street" : "",                                                          "store_street_id"
        "status" : 0,                                                           "store_status"
        "is_open" : 0                                                           Always open
        "longitude" : "29.361899",                                              "longitude"
        "latitude" : "48.006643"                                                "latitude"
    }


    kfg_store_area_maps
    {
        "_id" : ObjectId("5e32e8d1785c4b2a34cc3a54"),
        "kfg_store_area_maps_id" : NumberLong(25653),
        "store_id" : NumberLong(44),
        "area_id" : NumberLong(441),
        "concept_id" : NumberLong(2),
        "record_date" : ISODate("2013-02-17T18:30:00.000Z"),
        "last_update_date" : ISODate("2013-03-18T18:30:00.000Z")
    }

    restaurant_branch_areas
    {
        "_id" : ObjectId("5df21c2a6f49bfe0519e43c5"),
        "area_id" : ObjectId("5df1fbed3781db4ed271138e"),                       "area_id"???? area id is block
        "branch_id" : ObjectId("5df214dc0d76756c1762a02b"),                     "store_id"
        "added_by" : ObjectId("5df2024d6f49bfe051c0a91f"),                      super admin
        "created" : ISODate("2019-12-12T10:29:34.381Z"),                        getUtcDate();
        "modified" : ISODate("2019-12-13T12:37:17.850Z"),                       getUtcDate();
        "open" : 1,                                                             "Assuming open always"
        "restaurant_id" : ObjectId("5df2024d85ea0d05d6cf61a7")                  "concept_id"
    }


//////////////////////////

restaurant_branch_area_settings
{
    "_id" : ObjectId("5e26de539040de865633be05"),
    "area_id" : ObjectId("5df1fbed3781db4ed271138e"),                       "area_id"???? area id is block
    "attribute_id" : 40,                                                    same as it is now
    "branch_id" : ObjectId("5e26de030028a522782b7043"),                     "store_id"
    "added_by" : ObjectId("5df2024d6f49bfe051c0a91f"),                      super admin
    "attribute_value" : "30",                                                   "promise_time" (promise time is area wise, in kfg its branch wise)
    "channel_id" : "merchant_portal",                                       "merchant_portal"
    "created" : ISODate("2020-01-21T11:18:52.769Z"),                        getUtcDate();
    "modified" : ISODate("2020-01-21T11:18:59.284Z"),                       getUtcDate();
    "restaurant_id" : ObjectId("5df2024d85ea0d05d6cf61a7"),                 "concept_id"
    "attribute_name" : "Preparation Time"
}


{                                                  ?
    "attribute_id" : 59,
    "attribute_name" : "Has Offers"
}

{                                                  "service_charge"
    "attribute_id" : 43,
    "attribute_name" : "Delivery Fees"
}

{                                                  "promise_time" or other?
    "attribute_id" : 39,
    "attribute_name" : "Delivery Duration"
}

{                                                  always restaurant
    "attribute_id" : 44,
    "attribute_name" : "Delivery By"
}

{                                                  no minimum order limit
    "attribute_id" : 41,
    "attribute_name" : "Minimum Order Limit"
}



{                                                  not required
    "attribute_id" : 58,
    "attribute_name" : "Coming Soon"
}

{                                                  "Yes"
    "attribute_id" : 60,
    "attribute_name" : "Accept Pickup Orders"
}

{                                                  "Yes"
    "attribute_id" : 65,
    "attribute_name" : "Accept Scheduling Orders"
}

//////////////////////////

restaurant_branch_attributes

{                                                                           ?
    "_id" : ObjectId("5e2822519040de86564707a5"),
    "added_by" : ObjectId("5df1e82d3781db4ed2711360"),
    "attribute_id" : 21,
    "value" : "15",
    "created" : ISODate("2020-01-22T10:22:08.899Z"),
    "modified" : ISODate("2020-01-22T10:22:08.900Z"),
    "branch_id" : ObjectId("5e2822519739a5652aa68072"),
    "restaurant_id" : ObjectId("5e2822519739a5652aa68071"),
    "attribute_name" : "Restaurant landing images"
}
?



    {                                                   ?
        "attribute_id" : 13,
        "attribute_name" : "Discount by percentage"
    }


    {                                                   ?
        "attribute_id" : 20,
        "attribute_name" : "Discount by value"
    }


    {                                                   ?
        "attribute_id" : 18,
        "attribute_name" : "Extra charge by value"
    }


    {                                                   ?
        "attribute_id" : 19,
        "attribute_name" : "Additional tax"
    }


{                                                   ?
    "attribute_id" : 11,
    "attribute_name" : "Slogan in arabic"
}


{                                                   ?
    "attribute_id" : 10,
    "attribute_name" : "Slogan in english"
}


    {                                                   ?
        "attribute_id" : 16,
        "attribute_name" : "branch arabic desc."
    }


    {                                                   ?
        "attribute_id" : 14,
        "attribute_name" : "branch english desc."
    }

{
    "attribute_id" : 17,
    "attribute_name" : "branch arabic name"         "store_name"
}

{
    "attribute_id" : 15,
    "attribute_name" : "branch english name"        "store_name_arabic"
}


-----------------------------

restaurant_branch_phone_numbers
{
    "_id" : ObjectId("5df230ca6f49bfe0514e244b"),
    "branch_id" : ObjectId("5df219ac2dd0b84193aae782"),
    "added_by" : ObjectId("5df213426f49bfe051511f76"),
    "attribute_id" : 1,
    "created" : ISODate("2019-12-12T12:21:30.517Z"),
    "modified" : ISODate("2019-12-12T12:21:57.761Z"),
    "restaurant_id" : ObjectId("5df213421736296c2d8ba628"),
    "value" : "22331122",
    "country_code" : "+965",
    "attribute_name" : "Restaurant Branch Customer Service Number"
}
                                                                                    "store_phone1" : "22574509",
                                                                                    "store_phone2" : "22517456",

{
    "_id" : ObjectId("5df21dd5c820725e85204da5"),
    "branch_id" : ObjectId("5df219ac2dd0b84193aae782"),
    "attribute_id" : 2,
    "created" : ISODate("2019-12-12T11:00:37.764Z"),
    "modified" : ISODate("2019-12-12T11:00:37.763Z"),
    "restaurant_id" : ObjectId("5df213421736296c2d8ba628"),
    "value" : "12345678",
    "country_code" : "+965",
    "attribute_name" : "Restaurant Branch Hot Line Number"
}
                                                                                    "store_phone1" : "22574509",
                                                                                    "store_phone2" : "22517456",


----------

restaurant_branch_payment_methods
{
    "_id" : ObjectId("5df214dc0d76756c1762a02b"),
    "added_by" : ObjectId("5df2024d6f49bfe051c0a91f"),
    "branch_id" : ObjectId("5df214dc0d76756c1762a02b"),
    "created" : ISODate("2019-12-13T13:35:36.088Z"),                                getUtcDate()
    "modified" : ISODate("2019-12-13T13:57:10.009Z"),                               getUtcDate()
    "payment_methods" : [
        "cash",
        "credit",
        "k-net",
        "myfatoorah-credit"
    ],
    "restaurant_id" : ObjectId("5df2024d85ea0d05d6cf61a7")
}
                                                                                    ????????????????????????

---------------------
restaurant_branch_calendars
{
    "_id" : ObjectId("5e2822519040de86564707b4"),
    "branch_id" : ObjectId("5e2822519739a5652aa68072"),                     "store_id"
    "restaurant_id" : ObjectId("5e2822519739a5652aa68071"),                 "concept_id"
    "status" : 1,                                                           same as it is now
    "type" : "DW",                                                          same as it is now
    "added_by" : ObjectId("5e2822519739a5652aa68073"),                      super admin
    "created" : ISODate("2020-02-04T11:18:46.025Z"),                        getUtcDate();
    "from_hour" : 0,                                                        same as it is now
    "from_minute" : 0,                                                      same as it is now
    "is_exception" : false,                                                 same as it is now
    "modified" : ISODate("2020-02-04T11:18:46.025Z"),                       getUtcDate();
    "parent_id" : "",                                                       same as it is now
    "to_hour" : 23,                                                         same as it is now
    "to_minute" : 59,                                                       same as it is now
}



users?
---------------


//burger king
{
    "created" : ISODate("2018-03-13T12:32:55.899Z"),
    "end_date" : "",
    "end_time" : "",
    "image" : "",
    "menu_id" : "989565",
    "modified" : ISODate("2018-03-13T12:32:55.899Z"),
    "name" : {
        "en" : "Default Menu",
        "ar" : "القائمة الافتراضية"
    },
    "is_default" : true,
    "restaurant_id" : ObjectId("5e3a9c009040de8656e99ecb"),
    "restaurant_slug" : "burger-king",
    "start_date" : "",
    "start_time" : "",
    "is_active" : 1,
    "kfg_menu_id": 3,
    "kfg_concept_id":2
}


//Pizza Hut
{
    "created" : ISODate("2018-03-13T12:32:55.899Z"),
    "end_date" : "",
    "end_time" : "",
    "image" : "",
    "menu_id" : "989566",
    "modified" : ISODate("2018-03-13T12:32:55.899Z"),
    "name" : {
        "en" : "Default Menu",
        "ar" : "القائمة الافتراضية"
    },
    "is_default" : true,
    "restaurant_id" : ObjectId("5e3a9b9c9040de8656e72f5e"),
    "restaurant_slug" : "pizza-hut",
    "start_date" : "",
    "start_time" : "",
    "is_active" : 1,
    "kfg_menu_id": 4,
    "kfg_concept_id":1
}

*/

/*
	is half wala nahi huva
	or deal m

	/*
	// For Work  remining . second parent id not found check
	perfect save in unit master but not in unit tabel

		format to save

		super parent
		id = 1
		size - l
		level 1
		has_child = true

	sub parent
		id = 2
		parent_id - 1
		dough type - 2
		level 2
		has_child = true

	Child
		id = 3
		parent_id - 2
		extra item id  - 56
		level 3


	*/


