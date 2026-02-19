import { ObjectId } from 'mongodb';
import * as Constants from '../../../../config/global_constant.mjs';
import Tables from '../../../../config/database_tables.mjs';
import { isPost, getUtcDate, sanitizeData, moveUploadedFile, exportToExcel } from '../../../../utils/index.mjs';
import { parallel as asyncParallel, each as asyncEach } from 'async';
import xlsx from 'xlsx';
import Hubs from './hubs.mjs';

// Model for Hub link area
class HubLinkArea {
    constructor(db) {
        this.db             =   db;
        this.hubModule      =   new Hubs(db);
        this.collectionDb   =   db.collection(Tables.HUBS); // Use constant for collection name
    }   

    /**
	 * Function for add parameters
	 *
	 * @param req As Request Data
	 * @param res As Response Data
	 *
	 * @return render
	 */
	async getLinkedAreas(req, res, next){
        try{
            let hubId	= new ObjectId(req.params.id);
            const areas                     =   this.db.collection(Tables.AREAS);
            const hub_linked_areas 		    =   this.db.collection(Tables.HUB_LINKED_AREAS);
            const restaurant_branch_areas   =   this.db.collection(Tables.RESTAURANT_BRANCH_AREAS);
    
            if(isPost(req)){
                /** Sanitize Data */
                req.body 		=  sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
                let branchId 	= req.body.branch_id && new ObjectId(req.body.branch_id) || "";
                let errors		= [];
    
                if(!branchId) return res.send({status: STATUS_ERROR, message: res.__("admin.system.something_going_wrong_please_try_again")});
    
                /** Upload areas xlsx **/
                moveUploadedFile(req, res,{
                    image				: req.files.upload_file,
                    filePath			: Constants.AREAS_FILES_FILE_PATH,
                    allowedExtensions 	: Constants.ALLOWED_AREAS_MANAGER_EXTENSIONS,
                    allowedImageError 	: Constants.ALLOWED_AREAS_MANAGER_ERROR_MESSAGE,
                    allowedMimeTypes 	: Constants.ALLOWED_AREAS_MANAGER_MIME_EXTENSIONS,
                    allowedMimeError 	: Constants.ALLOWED_AREAS_MANAGER_MIME_ERROR_MESSAGE
                }).then(uploadedResponse=>{
                    /** Send error response **/
                    if(uploadedResponse.status != Constants.STATUS_SUCCESS){
                        return res.send({status: Constants.STATUS_ERROR, errorStatus: 'csv_error', message: uploadedResponse.message});
                    }
    
                    let csvFileName 	= 	uploadedResponse.fileName;
                    let workbook 		= 	xlsx.readFile(Constants.AREAS_FILES_FILE_PATH+csvFileName);
                    let firstSheetName 	= 	workbook.SheetNames[0];
                    let secondSheetName = 	workbook.SheetNames[1];
    
                    /** Get worksheet **/
                    let worksheet 		= 	workbook.Sheets[firstSheetName];
                    let worksheet_2 	= 	workbook.Sheets[secondSheetName];
    
                    let totalRowsData 	= 	worksheet && worksheet['!ref'].split(":") || [];
                    let totalRowsData2 	= 	worksheet_2 && worksheet_2['!ref'].split(":") || [];
                    let totalRows 		= 	totalRowsData?.[1]?.replace(/[^0-9]+/g, "") || "";
                    let totalRows2 		= 	totalRowsData2?.[1]?.replace(/[^0-9]+/g, "") || "";
                    totalRows			=	(totalRows)  ? parseInt(totalRows)  :0;
                    totalRows2			=	(totalRows2) ? parseInt(totalRows2) :0;
    
                    let records  = [];
                    let records2 = [];
                    /* Column Names */
                    let columnSeries= ["A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P","Q","R","S","T","U","V"];
                    /** Remove Extra lines from File */
                    var fileRecords		= {};
                    var fileRecords2	= {};
                    var columnLength	= 22;
    
                    if(worksheet && worksheet instanceof Object && Object.keys(worksheet).length>0){
                        let totalColumns 	= 22;
                        let totalRows 		= 0;
                        /* Remove Extra columns from object */
                        if(worksheet['!margins']){
                            delete worksheet['!margins'];
                        }
                        if(worksheet['!ref']){
                            /* Calculate total rows */
                            let totalRowsData 	= worksheet['!ref'].split(":");
                            totalRows			= (totalRowsData[1]) ? totalRowsData[1] : 0;
                            totalRows			= totalRows.replace(/[^0-9]+/g, "");
                            if(totalRows == ""){
                                totalRows = 0;
                            }else{
                                totalRows=parseInt(totalRows);
                            }
                            delete worksheet['!ref'];
                        }
    
                        /* Arrange array according to requirement */
                        for(let i=1;i<=totalRows;i++){
                            if(!records[i-1]){
                                records[i-1] = [];
                            }
                            for(let j=0;j<totalColumns;j++){
                                records[i-1][j] = (columnSeries[j] && worksheet[columnSeries[j]+i] && worksheet[columnSeries[j]+i].w) ? worksheet[columnSeries[j]+i].w : ((worksheet[columnSeries[j]+i] && worksheet[columnSeries[j]+i].v) ? worksheet[columnSeries[j]+i].v : '');
                            }
                        }
                    }
    
                    /** Ignore 0 index, 0 index is used for column names */
                    for(let i = 1; i < records.length;i++){
                        let currentLength = 0;
                        for(let j=0;j<columnLength;j++){
                            if(!records[i][j] || records[i][j] == ""){
                                currentLength++;
                            }
                        }
                        if(currentLength<columnLength){
                            fileRecords[i] = records[i];
                        }
                    }
    
                    /**Set rows and column for second sheet */
                    if(worksheet_2 && worksheet_2 instanceof Object && Object.keys(worksheet_2).length>0){
                        let totalColumns 	= 22;
                        let totalRows 		= 0;
                        /* Remove Extra columns from object */
                        if(worksheet_2['!margins']){
                            delete worksheet_2['!margins'];
                        }
                        if(worksheet_2['!ref']){
                            /* Calculate total rows */
                            let totalRowsData 	= worksheet_2['!ref'].split(":");
                            totalRows			= (totalRowsData[1]) ? totalRowsData[1] : 0;
                            totalRows			= totalRows.replace(/[^0-9]+/g, "");
                            if(totalRows == ""){
                                totalRows = 0;
                            }else{
                                totalRows=parseInt(totalRows);
                            }
                            delete worksheet_2['!ref'];
                        }
    
                        /* Arrange array according to requirement */
                        for(let i=1;i<=totalRows;i++){
                            if(!records2[i-1]){
                                records2[i-1] = [];
                            }
                            for(let j=0;j<totalColumns;j++){
                                records2[i-1][j] = (columnSeries[j] && worksheet_2[columnSeries[j]+i] && worksheet_2[columnSeries[j]+i].w) ? worksheet_2[columnSeries[j]+i].w : ((worksheet_2[columnSeries[j]+i] && worksheet_2[columnSeries[j]+i].v) ? worksheet_2[columnSeries[j]+i].v : '');
                            }
                        }
                    }
    
                    /** Ignore 0 index, 0 index is used for column names from second sheet*/
                    for(let i = 1; i < records2.length;i++){
                        let currentLength = 0;
                        for(let j=0;j<columnLength;j++){
                            if(!records2[i][j] || records2[i][j] == ""){
                                currentLength++;
                            }
                        }
                        if(currentLength<columnLength){
                            fileRecords2[i] = records2[i];
                        }
                    }
    
                    /**Send error response if file data is empty */
                    if((!fileRecords && fileRecords.length == 0) || (!fileRecords2 &&  fileRecords2.length == 0)){
                        return res.send({ status: Constants.STATUS_ERROR, message: res.__("admin.hubs.no_data_found_in_file") });
                    }                          
                    
                    let areaObjData  = {};
                    let tempaAreaIds = [];
                    asyncParallel({
                        branch_area_ids : (callback)=>{
                            restaurant_branch_areas.aggregate([
                                {$match  : { branch_id : branchId}},
                                {$lookup : {
                                    from		: "areas",
                                    localField	: "area_id",
                                    foreignField: "_id",
                                    as			: "area_detail"
                                }},
                                {$project : {
                                    _id:1,area_id: {$arrayElemAt: ["$area_detail.area_id",0]},area_name: {$arrayElemAt: ["$area_detail.name",0] }
                                }}
                            ]).toArray().then(areaResult=>{
                               
                                let areaIds = [];
                                if(areaResult?.length) areaResult.map((val)=>{
                                    areaIds.push(val.area_id);
                                });
                                callback(null,areaIds);
                            }).catch(next);
                        },
                        get_areas : (callback) =>{
                            areas.find({is_active : Constants.ACTIVE},{projection:{_id:1,area_id:1,name:1}}).toArray().then(areaResult=>{
                                let areaObj = {};
                                if(areaResult?.length) areaResult.map(val=>{
                                    tempaAreaIds.push(val.area_id);
                                    areaObj[val.area_id] = val;
                                    areaObjData[val._id] = val;
                                });
                                callback(null,areaObj);
                            }).catch(next);
                        }
                    },(asyncErr,asyncRes)=>{
                        if(asyncErr) return next(asyncErr);
    
                        let areaDetail 	= asyncRes.get_areas 		? asyncRes.get_areas 		: {};
                        let areaIds 	= asyncRes.branch_area_ids 	? asyncRes.branch_area_ids 	: [];
    
                        if(areaIds && areaIds.length<=0) return res.send({ status: Constants.STATUS_ERROR, message: res.__("admin.hubs.no_branch_area_found") });
    
                        let rowData		     = {};
                        let notExistAreaName = [];
                        let tempAreaIds      = [];
    
                        asyncParallel({
                            validate_data: (callback) =>{
                                /** Check Validation **/
                                Object.keys(fileRecords).map((records,key)=>{
                                    records	 	 = 	(fileRecords[records])	? fileRecords[records] :"";
                                    let areaId 	 = 	(records[0]) 			? records[0]	 	   :"";
                                    let areaName = 	(records[1]) 		    ? records[1]	       :"";
        
                                    if(!areaId){
                                        errors.push(res.__("admin.hubs.please_enter_area_id"));
                                    }else if(tempaAreaIds.indexOf(String(areaId)) < 0){
                                        errors.push(res.__("admin.hubs.please_enter_valid_area_id"));
                                    }
    
                                    tempAreaIds.push(areaId);
    
                                    /* Condition for not exist area */
                                    if(areaIds.indexOf(String(areaId)) == -1 ){
                                        notExistAreaName.push(areaName);
                                    }
    
                                    /* Condition for errors */
                                    if(errors.length <=0) rowData[key] = records;
                                });

                                callback(null);
                            },
                            linked_areas: (callback)=>{
                                hub_linked_areas.find({branch_id: branchId, hub_id: hubId}).toArray().then(result=>{
                                    let linkedAreas = [];
                                    if(result.length > 0){
                                        result.map(record=>{
                                            let aDetail     = (areaObjData[record.area_id]) ? areaObjData[record.area_id] : "";
                                            let laDetail    = (areaObjData[record.linked_area_id]) ? areaObjData[record.linked_area_id] : "";
                                            let linkDetail  = (aDetail && laDetail) ? aDetail.name[Constants.DEFAULT_LANGUAGE_CODE]+" ("+aDetail.area_id+")" +" - "+laDetail.name[Constants.DEFAULT_LANGUAGE_CODE]+" ("+laDetail.area_id+")": "";
                                            linkedAreas.push(linkDetail);
                                        });
                                    }
                                    callback(null,linkedAreas);
                                }).catch(next);
                            },
                            hub_detail : (callback)=>{
                                this.hubModule._getHubDetails(req, res, next).then(hubRes=>{
                                    callback(null,hubRes?.result || null);
                                }).catch(next);
                            }
                        },async(childErr,childResp)=>{
                            if(childErr) return next(childErr);
    
                            let notExistAreas = notExistAreaName.slice(0, 3).join(", ");
                            /**Send error response if no data in file */
                            if(Object.keys(rowData).length == 0) return res.send({status: Constants.STATUS_ERROR, message: res.__('admin.hubs.please_upload_sheet_with_valid_data')});
    
                            if(errors.length>0) return res.send({status: Constants.STATUS_ERROR, message: res.__(errors[0])});
    
                            /**check duplicate area id*/
                            let isDuplicateAreaId = false;
                            isDuplicateAreaId = tempAreaIds.some((element, index) => {
                                return tempAreaIds.indexOf(element) !== index
                            });
    
                            /**Send error response if no area name found */
                            if(tempAreaIds.length < areaIds.length ){
    
                                let areaNames = [];
                                areaIds.map((val)=>{
                                    if(tempAreaIds.indexOf(String(val)) == -1 ){
                                        areaNames.push(areaDetail[val].name[Constants.DEFAULT_LANGUAGE_CODE]);
                                    }
                                });
    
                                let missingAreas = areaNames.slice(0, 3).join(", ");
                                return res.send({status : Constants.STATUS_ERROR, message	: res.__("admin.hubs.some_areas_missing_in_file",'('+missingAreas+')')});
    
                            }else if(notExistAreas.length > 0){
                                return res.send({status : Constants.STATUS_ERROR, message :res.__("admin.hubs.some_areas_not_exit_in_branch_covered_area",'('+notExistAreas+')')});
    
                            }else if(isDuplicateAreaId){
                                return res.send({status : Constants.STATUS_ERROR, message :res.__("admin.hubs.uploaded_areas_is_not_the_same_as_branch_covered_areas")});
                            }
    
                            let hubDetail 	= (childResp.hub_detail)   ? childResp.hub_detail   :'';
                            let logOldValues= (childResp.linked_areas) ? childResp.linked_areas :[];
    
                            /* Delete all linked areas of this branch */
                            await hub_linked_areas.deleteMany({
                                hub_id 		: hubId,
                                branch_id	: branchId
                            },()=> {});
   
                            /** Save file data */
                            let newValuesArr = [];
                            let sheetData = Object.keys(fileRecords2);
                            asyncEach(sheetData, (records, eachCallback)=> {
                                let aId 		= (areaDetail[fileRecords2[records][0]]) ? areaDetail[fileRecords2[records][0]]._id :"";
                                let linkedId 	= (areaDetail[fileRecords2[records][2]]) ? areaDetail[fileRecords2[records][2]]._id :"";
                                let aDetail     = (areaObjData[aId]) ? areaObjData[aId] : "";
                                let laDetail    = (areaObjData[linkedId]) ? areaObjData[linkedId] : "";
                                let linkDetail  = (aDetail && laDetail) ? aDetail.name[Constants.DEFAULT_LANGUAGE_CODE]+" ("+aDetail.area_id+")" +" - "+laDetail.name[Constants.DEFAULT_LANGUAGE_CODE]+" ("+laDetail.area_id+")": "";
                                newValuesArr.push(linkDetail);
    
                                hub_linked_areas.insertOne({
                                    hub_id			:	hubId,
                                    branch_id		:	branchId,
                                    area_id			:	aId,
                                    linked_area_id	:	linkedId,
                                    unique_id		:	String(new ObjectId()),
                                    modified 		:	getUtcDate(),
                                    created 		:	getUtcDate(),
                                }).then(()=>{
                                    eachCallback(null);
                                }).catch(next);
                            },(eachErr)=> {
                                if(eachErr) return next(eachErr);
    
                                /** Save hub history data */
                                this.hubModule.saveHubHistoryData(req,res,{
                                    user_id		: new ObjectId(req.session.user._id),
                                    hub_id 		: hubId,
                                    action 		: Constants.AREA_LINKING,
                                    name 		: (hubDetail.name) ? hubDetail.name : "",
                                    old_values 	: (logOldValues.length > 0) ? logOldValues.join(', ') : '',
                                    new_values 	: (newValuesArr.length > 0) ? newValuesArr.join(', ') : ''
                                }).then({});
    
                                /** Send success response **/
                                res.send({
                                    status	:	Constants.STATUS_SUCCESS,
                                    message : 	res.__("admin.hubs.linked_areas_imported_successfully")
                                });
                            });
                        });
                    });
                }).catch(next);
            }else{
                /** Get hub branch ids */
                let branchIds = await this.collectionDb.distinct("branches",{_id: hubId});
                               
                /** Get branch list */
                const restaurant_branches = this.db.collection(Tables.RESTAURANT_BRANCHES);
                let branchResult = await restaurant_branches.aggregate([
                    {$match	: 	{_id : {$in: branchIds}}},
                    {$lookup:	{
                        from     : Tables.HUB_LINKED_AREAS,
                        let      : {branchId : "$_id"},
                        pipeline : [
                            {$match : {
                                $expr: {
                                    $and : [
                                        {$eq: ["$branch_id", "$$branchId"]},
                                        {$eq: ["$hub_id",hubId]},
                                    ]
                                }
                            }},
                        ],
                        as:	"area_linked_details"
                    }},
                    {$project : {
                        _id:1, name:1, status: {$arrayElemAt: ["$area_linked_details.status",0]},
                    }},
                ]).toArray();

                /** Render view page*/
                res.render('linked_areas',{
                    layout 		:	false,
                    hub_id 		: 	hubId,
                    branch_list : 	branchResult || []
                });            
            }
        }catch(e){return next(e);}
	};//End getLinkedAreas()

    /**
	 * Function to export linked areas
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 * @param next 	As 	Callback argument to the middleware function
	 *
	 * @return null
	*/
	async exportLinkedAreas(req,res,next){
		let hubId 		= (req.params.hub_id)		? new ObjectId(req.params.hub_id)    :"";
		let branchId 	= (req.params.branch_id)	? new ObjectId(req.params.branch_id) :"";

		asyncParallel({
			covered_area_list: (callback) =>{
				const restaurant_branch_areas = this.db.collection(Tables.RESTAURANT_BRANCH_AREAS);
				restaurant_branch_areas.aggregate([
					{$match  : { branch_id : branchId}},
					{$lookup : {
						from		: Tables.AREAS,
						localField	: "area_id",
						foreignField: "_id",
						as			: "area_detail"
					}},
					{$project : {
						_id:1,
                        area_id: {$arrayElemAt: ["$area_detail.area_id",0]},
                        name: {$arrayElemAt: ["$area_detail.name."+[Constants.DEFAULT_LANGUAGE_CODE],0]}
					}}
				]).toArray().then(areaResult=>{
					callback(null,areaResult);
				}).catch(callback);
			},
			linked_area_list: (callback)=>{
				const hub_linked_areas = this.db.collection(Tables.HUB_LINKED_AREAS);
				hub_linked_areas.aggregate([
					{$match : {
						hub_id 		: hubId,
						branch_id 	: branchId
					}},
					{$lookup : {
						from		: Tables.AREAS,
						localField	: "area_id",
						foreignField: "_id",
						as			: "area_detail"
					}},
					{$lookup : {
						from		: Tables.AREAS,
						localField	: "linked_area_id",
						foreignField: "_id",
						as			: "linked_area_detail"
					}},
					{$project : {
						_id:1,
                        area_name: {$arrayElemAt: ["$area_detail.name."+[Constants.DEFAULT_LANGUAGE_CODE],0]},
                        linked_area_name: {$arrayElemAt: ["$linked_area_detail.name."+[Constants.DEFAULT_LANGUAGE_CODE],0]},
                        area_id: {$arrayElemAt: ["$area_detail.area_id",0]},
                        linked_area_id: {$arrayElemAt: ["$linked_area_detail.area_id",0]}
					}}
				]).toArray().then(result=>{
					callback(null,result);
				}).catch(callback);
			}
		},(asyncErr,asyncRes)=>{
			if(asyncErr) return next(asyncErr);

			let coveredAreaList = (asyncRes.covered_area_list) ? asyncRes.covered_area_list : [];
			let linkedAreaList 	= (asyncRes.linked_area_list) ? asyncRes.linked_area_list : [];

			let temp		= [];
			let commonColls	= [
				res.__("admin.hubs.area_id"),
				res.__("admin.hubs.area_name"),
			];

			if(coveredAreaList && coveredAreaList.length > 0){
				coveredAreaList.map(records=>{
					let buffer = [
						(records.area_id)	? parseInt(records.area_id)	: "",
						(records.name)		? records.name		: ""
					];
					temp.push(buffer);
				});
			}

			let temp_1			= [];
			let commonColls_1	= [
				res.__("admin.hubs.main_area_id"),
				res.__("admin.hubs.main_area_name"),
				res.__("admin.hubs.linked_area_id"),
				res.__("admin.hubs.linked_area_name"),
			];
			if(linkedAreaList && linkedAreaList.length > 0){
				linkedAreaList.map(records=>{
					let buffer_1 =	[
						(records.area_id)			? records.area_id			: "",
						(records.area_name)			? records.area_name			: "",
						(records.linked_area_id)	? records.linked_area_id 	: "",
						(records.linked_area_name)	? records.linked_area_name	: "",
					];
					temp_1.push(buffer_1);
				});
			}

			/**  Function to export data in excel format **/
			exportToExcel(req,res,{
				file_prefix 	    : res.__("admin.hubs.linked_areas"),
				heading_columns	    : commonColls,
				heading_columns_1	: commonColls_1,
				export_data     	: temp,
				export_data_1		: temp_1,
				sheet_name          : res.__("admin.hubs.covered_area"),
				sheet_name_1        : res.__("admin.hubs.linked_areas"),
			});
		});
	}// End exportLinkedAreas

    /**
	 * Function for update branch link area
	 *
	 * @param req As Request Data
	 * @param res As Response Data
	 *
	 * @return render
	 */
	async updateLinkedAreaStatus(req, res, next){
		let branchId 	= (req.body.branch_id)		 	? new ObjectId(req.body.branch_id) 	: "";
		let hubId 		= (req.body.hub_id)		 		? new ObjectId(req.body.hub_id) 	: "";
		let status	 	= (parseInt(req.body.status)== Constants.ON) ? Constants.ON : Constants.OFF;

		const hub_linked_areas = this.db.collection(Tables.HUB_LINKED_AREAS);
		asyncParallel({
			hub_detail: (callback)=>{
				this.collectionDb.findOne({_id: hubId},{projection:{_id:1,name:1}}).then(result=>{
                    callback(null,result);
                }).catch(callback);
			},
			branch_detail: (callback)=>{
				const restaurant_branches = this.db.collection(Tables.RESTAURANT_BRANCHES);
				restaurant_branches.findOne({_id : branchId},{projection:{_id:1,name:1}}).then(result=>{
                    callback(null,result);
                }).catch(callback);
			},
			linked_areas: (callback)=>{
				hub_linked_areas.find({hub_id: hubId, branch_id: branchId}).toArray().then(result=>{
                    callback(null,result);
                }).catch(callback);
			},
		},async (asyncErr,asyncRes)=>{
			if(asyncErr) return next(asyncErr);

			let linkedAreas = (asyncRes.linked_areas)   ?   asyncRes.linked_areas   : [];
			let hubDetail 	= (asyncRes.hub_detail)     ?   asyncRes.hub_detail     : "";
			let branchDetail= (asyncRes.branch_detail)  ?   asyncRes.branch_detail  : "";

			/** Send error response **/
			if(linkedAreas && linkedAreas.length<=0) return res.send({status: Constants.STATUS_ERROR, message: res.__("admin.hubs.no_linked_areas_found_in_this_branch")});

            try{
                /** Update status */
                await hub_linked_areas.updateMany({
                    hub_id		: hubId,
                    branch_id	: branchId
                },
                {$set : {
                    status	 : status,
                    modified : getUtcDate()
                }});				

				/* Save activity history */
				this.hubModule.saveHubHistoryData(req, res, {
					user_id	       : new ObjectId(req.session.user._id),
					hub_id		   : new ObjectId(hubId),
					action		   : Constants.AREA_LINKING,
					name		   : (hubDetail.name) ? hubDetail.name : "",
					old_values     : ((branchDetail && branchDetail.name) ? branchDetail.name.en : "") +" "+res.__("admin.hubs.branch_linked_area_status") +" - "+ ((status== Constants.ON && Constants.HUB_PARAMETER_DROPDOWN[status]) ? Constants.HUB_PARAMETER_DROPDOWN[Constants.OFF] : Constants.HUB_PARAMETER_DROPDOWN[Constants.ON]),
					new_values      	: ((branchDetail && branchDetail.name) ? branchDetail.name.en : "") +" "+ res.__("admin.hubs.branch_linked_area_status") +" - "+ ((status==Constants.ON && Constants.HUB_PARAMETER_DROPDOWN[status]) ? Constants.HUB_PARAMETER_DROPDOWN[status] : Constants.HUB_PARAMETER_DROPDOWN[Constants.OFF])
				}).then({});

				/** Send success response **/
				res.send({
					status	:	Constants.STATUS_SUCCESS,
					message : 	res.__("admin.hubs.status_updated_successfully")
				});
			}catch(e){return next(e)};
		});
	};//End updateLinkedAreaStatus()
}
export default HubLinkArea; 