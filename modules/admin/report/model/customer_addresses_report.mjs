import { parallel as asyncParallel, eachOfSeries} from 'async';
import * as Constants from '../../../../config/global_constant.mjs';
import Tables from '../../../../config/database_tables.mjs';
import BREADCRUMBS from '../../../../breadcrumbs.mjs';
import { isPost, configDatatable } from '../../../../utils/index.mjs';
import XLSX from "xlsx";
import fs from 'fs';

// Model for customer addresses report
export default class CustomerAddress {
	constructor(db) {
		this.db = db;

		/** Use in export data **/
		this.exportNumber					= 0;
		this.exportFilterConditions 		= {};
		this.exportSortConditions			= {};
		this.exportCommonConditions			= {};
		this.exportSortConditions[this.exportNumber]	= {_id : Constants.SORT_DESC};
		this.REPORT_ADDRESS_LIMIT = 5;
	}

	/**
	 * Function to get customer address report list
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 *
	 * @return render/json
	 */
	async getCustomerAddressReportList(req,res,next){
		try{
			if(isPost(req)){
				let limit		  	= 	(req.body.length) 		 ?	parseInt(req.body.length) :Constants.ADMIN_LISTING_LIMIT;
				let skip		  	= 	(req.body.start)  		 ? 	parseInt(req.body.start)  :Constants.DEFAULT_SKIP;
				let mobileNumber    =   (req.body.mobile_number) ?  req.body.mobile_number    : "";
				let exportCount	  	=	(req.body.export_count)	 ? 	req.body.export_count     :0;
				const collection  	= 	this.db.collection(Tables.USERS);

				/** Configure Datatable conditions*/
				let dataTableConfig = await configDatatable(req,res,null);

				let commonConditions = {
					user_role_id : Constants.CUSTOMER,
					is_deleted 	 : Constants.NOT_DELETED
				};

				/**condition  for mobile number **/
				if (mobileNumber != "") {
					dataTableConfig.conditions["$or"]=[
						{"mobile_number" 	:	{$regex:mobileNumber}},
						{"cust_tele2"		: 	{$regex:mobileNumber}}
					];
				}

				/** Set conditions for export order detail report **/
				dataTableConfig.conditions 			=	Object.assign(commonConditions,dataTableConfig.conditions);
				this.exportCommonConditions				= 	commonConditions;
				this.exportFilterConditions[exportCount]= 	dataTableConfig.conditions;
				this.exportSortConditions[exportCount]	= 	dataTableConfig.sort_conditions;
				asyncParallel({
					result :(callback)=>{
						/** Get list of customer **/
						collection.find(dataTableConfig.conditions,{projection:{_id:1,full_name:1,mobile_number:1,cust_tele2:1}}).sort(dataTableConfig.sort_conditions).skip(skip).limit(limit).toArray().then(result=>{
							if(result?.length ==0) return callback(null, result);

							let allUserIds = [];
							result.map(data=>{
								allUserIds.push(data._id);
							});

							const areas					=	this.db.collection(Tables.AREAS);
							const area_blocks			= 	this.db.collection(Tables.AREA_BLOCKS);
							const customer_addresses	= 	this.db.collection(Tables.CUSTOMER_ADDRESSES);
							asyncParallel({
								area_list :(subcallback)=>{
									/** Get area list */
									areas.find({},{projection: {_id:1, name:1}}).toArray().then(areaList=>{
										let areaObj = {};
										if(areaList && areaList.length > 0){
											areaList.map(areaData=>{
												areaObj[areaData._id] = areaData;
											});
										}
										subcallback(null,areaObj);
									}).catch(next);
								},
								block_list :(subcallback)=>{
									/** Get block list */
									area_blocks.find({},{projection: {_id:1, name:1}}).toArray().then(blockList=>{
										let blockObj = {};
										if(blockList && blockList.length > 0){
											blockList.map(blockData=>{
												blockObj[blockData._id] = blockData;
											});
										}
										subcallback(null,blockObj);
									}).catch(next);
								},
								addr_list :(subcallback)=>{
									customer_addresses.find({user_id: {$in: allUserIds} },{projection: {_id:1, street:1, building_number:1,area_id:1,block_id:1,user_id:1}}).sort({_id: Constants.SORT_DESC}).toArray().then(addList=>{
										let addrObj = {};
										if(addList && addList.length > 0){
											addList.forEach(data=>{
												if(!addrObj[data.user_id]) addrObj[data.user_id] = [];

												if(addrObj[data.user_id].length < this.REPORT_ADDRESS_LIMIT){
													addrObj[data.user_id].push(data);
												}
											});
										}
										subcallback(null, addrObj);
									}).catch(next);
								}
							},(subErr,subRes)=>{
								if(subErr) return callback(subErr);

								let areaObj		=	subRes.area_list;
								let blockObj	= 	subRes.block_list;
								let addrList	= 	subRes.addr_list;
								result.map(data=>{
									if(!data.addresses_list) data.addresses_list = [];

									if(addrList[data._id]){
										addrList[data._id].map(addrDetail=>{
											let areaId 		=	addrDetail.area_id;
											let blockId 	=	addrDetail.block_id;

											let areaName  =	(areaObj[areaId] && areaObj[areaId].name && areaObj[areaId].name[Constants.DEFAULT_LANGUAGE_CODE]) ?  areaObj[areaId].name[Constants.DEFAULT_LANGUAGE_CODE] :"";
											let blockName =	(blockObj[blockId] && blockObj[blockId].name && blockObj[blockId].name[Constants.DEFAULT_LANGUAGE_CODE]) ?  blockObj[blockId].name[Constants.DEFAULT_LANGUAGE_CODE]	:"";

											addrDetail.area_name 		= 	areaName;
											addrDetail.area_block_name 	=	blockName;

											data.addresses_list.push(addrDetail);
										});
									}
								});
								callback(null, result);
							});
						}).catch(next);
					},
					filter_records : (callback)=>{
						/** Get filtered records counting in customer **/
						collection.countDocuments(dataTableConfig.conditions).then(filterContResult=>{
							callback(null, filterContResult);
						}).catch(next);
					}
				},(err, response)=>{
					/** Send response **/
					res.send({
						status			: (!err) ? Constants.STATUS_SUCCESS : Constants.STATUS_ERROR,
						draw			: dataTableConfig.result_draw,
						data			: (response.result) 		? response.result :[],
						recordsFiltered	: (response.filter_records)	? response.filter_records 	:0,
						recordsTotal	: (response.filter_records) ? response.filter_records	:0
					});
				});
			}else{
				this.exportNumber++;

				/** render customer order report listing page **/
				req.breadcrumbs(BREADCRUMBS['admin/report/customer_adress']);
				res.render('customer_addresses_report', {
					address_limit : this.REPORT_ADDRESS_LIMIT,
					export_count  : this.exportNumber,
				});
			}
		}catch(err){
			return next(err);
		}
	};//End getCustomerAddressReportList()

	async exportCustomerAddressReport(req,res,next){
		try{
			let exportCount 	= 	(req.params.export_count) 				? 	req.params.export_count	:0;
			let filterCondition =	(this.exportFilterConditions[exportCount]) 	?	this.exportFilterConditions[exportCount] 	:this.exportCommonConditions;
			let sortConditions	= 	(this.exportSortConditions[exportCount]) 	? 	this.exportSortConditions[exportCount] 		:this.exportSortConditions[0];
			let conditions		= 	filterCondition;

			if(!conditions || Object.keys(conditions).length == 0){
				conditions = {user_role_id : Constants.CUSTOMER, is_deleted: Constants.NOT_DELETED };
			}

			/** Get list of customer**/
			const users	= this.db.collection(Tables.USERS);
			users.aggregate([
				{$match :  conditions},
				{$sort  :  sortConditions},
				{$project :	{ _id:1,full_name:1,mobile_number:1,cust_tele2:1, addr_list:1}}
			]).toArray().then(userResult=>{

				const areas			=	this.db.collection(Tables.AREAS);
				const area_blocks	= 	this.db.collection(Tables.AREA_BLOCKS);
				const customer_addresses	= this.db.collection(Tables.CUSTOMER_ADDRESSES);
				asyncParallel({
					area_list :(subcallback)=>{
						if(userResult.length ==0) return subcallback(null, {});

						/** Get area list */
						areas.find({},{projection: {_id:1, name:1}}).toArray().then(areaList=>{
							let areaObj = {};
							if(areaList && areaList.length > 0){
								areaList.map(areaData=>{
									areaObj[areaData._id] = areaData;
								});
							}
							subcallback(null,areaObj);
						}).catch(next);
					},
					block_list :(subcallback)=>{
						if(userResult.length ==0) return subcallback(null, {});

						/** Get block list */
						area_blocks.find({},{projection: {_id:1, name:1}}).toArray().then(blockList=>{
							let blockObj = {};
							if(blockList && blockList.length > 0){
								blockList.map(blockData=>{
									blockObj[blockData._id] = blockData;
								});
							}
							subcallback(null,blockObj);
						}).catch(next);
					},
					user_list :(subcallback)=>{
						eachOfSeries(userResult,(records, firstKey, childCallback)=>{
							/** Get list of customer addresses **/
							customer_addresses.find({user_id: records._id },{projection: {_id:1, street:1, building_number:1,area_id:1,block_id:1}}).sort({_id: Constants.SORT_DESC}).limit(this.REPORT_ADDRESS_LIMIT).toArray().then(addList=>{
								records.addr_list = 	addList || [];
								childCallback(null);
							}).catch(next);
						},(asyncChildErr)=>{
							subcallback(asyncChildErr, userResult);
						});
					}
				},(subErr,subRes)=>{
					if(subErr) return next(subErr);

					/** Define excel heading label **/
					let commonColls	= 	[
						res.__("admin.report.customer_name"),
						res.__("admin.report.mobile_number"),
						res.__("admin.report.secondary_mobile_number")
					];

					for (let i=1; i <= this.REPORT_ADDRESS_LIMIT; i++) {
						commonColls.push(res.__('admin.report.address',i));
					}

					let ws = XLSX.utils.aoa_to_sheet([commonColls ]);

					let areaObj		=	subRes.area_list;
					let blockObj	= 	subRes.block_list;
					userResult	= 	subRes.user_list;
					if(userResult && userResult.length > 0){
						userResult.map(data=>{
							let addrList = (data.addr_list) ? data.addr_list :[];
							let buffer =	[
								(data.full_name)		? 	data.full_name 		:"",
								(data.mobile_number)	? 	data.mobile_number 	:"",
								(data.cust_tele2)    	?	(data.cust_tele2)   :""
							];

							for (let i=0; i < this.REPORT_ADDRESS_LIMIT; i++){
								if(addrList[i]){
									let custAddDetail  	=	addrList[i];
									let areaId 			=	custAddDetail.area_id;
									let blockId 		=	custAddDetail.block_id;

									let areaDetails		= 	(areaObj[areaId])	?	areaObj[areaId] 	:{};
									let blockDetails 	=	(blockObj[blockId]) ? 	blockObj[blockId]	:{};
									let areaName  		=	(areaDetails.name && areaDetails.name[Constants.DEFAULT_LANGUAGE_CODE]) 	?	areaDetails.name[Constants.DEFAULT_LANGUAGE_CODE]+","		:"";
									let blockName 		=	(blockDetails.name && blockDetails.name[Constants.DEFAULT_LANGUAGE_CODE])	?  	blockDetails.name[Constants.DEFAULT_LANGUAGE_CODE]+","	:"";
									let streetName     	= 	(custAddDetail.street) 			?	custAddDetail.street+"," 		:"";
									let buildingNumber 	=	(custAddDetail.building_number)	?	custAddDetail.building_number	:"";

									buffer.push(areaName+blockName+streetName+buildingNumber);
								}else{
									buffer.push("");
								}
							}

							XLSX.utils.sheet_add_aoa(ws, [buffer], {origin:-1});
						});
					}

					let authId			= 	req.session.user._id;
					let outputFileName 	=	Constants.WEBSITE_ROOT_PATH+"public/CustomerAdressReports_"+authId+".csv";
					let stream = XLSX.stream.to_csv(ws);
					stream.pipe(fs.createWriteStream(outputFileName)).on('finish', () =>{

						res.download(outputFileName, 'CustomerAdressReports.csv');
					});
				});
			}).catch(next);
		}catch(err){
			return next(err);
		}
	};// end exportCustomerAddressReport()
}