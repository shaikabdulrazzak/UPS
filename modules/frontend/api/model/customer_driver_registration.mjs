import { ObjectId } from 'mongodb';
import clone from 'clone';
import { parallel as asyncParallel} from 'async';
import * as Constants from "../../../../config/global_constant.mjs";
import Tables from '../../../../config/database_tables.mjs';
import { sanitizeData, getUtcDate, applyValidationInterCallFunction, generateMD5Hash, getRandomOTP, currentTimeStamp, checkReferralCode, generateReferralCode, getDatabaseSlug, updateUserRewardPoints,isWebApi,} from "../../../../utils/index.mjs";
import { sendMailToUsers, sendSMS, sendMail, pushNotification, saveReclaimLogs} from "../../../../services/index.mjs";
import { customerRegistrationValidation, driverRegistrationValidation, loginValidation, forgotPasswordValidation, verifyMobileNumberValidation, resetPasswordValidation } from '../validations/customerDriverValidation.mjs';

import registrationModel from './registration.mjs';
import MyAccountModel from './my_account.mjs';
import UserCartsModel from './user_carts.mjs';

export default class CustomerRegistration {
	constructor(db) {
		this.db = db;
		
		this.registrationAPI = new registrationModel(db);
		this.myAccountAPI = new MyAccountModel(db);
		this.userCartsAPI = new UserCartsModel(db);
	}

	/**
	 * Function for customer registration
	 *
	 * @param req As Request Data
	 * @param res As Response Data
	 *
	 * @return json
	 */
	async customerRegistration (req, res, next) {
		return new Promise(async resolve=>{
			/** Sanitize Data **/
			req.body 		= 	sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
			let password	= 	req?.body?.password || "";
			let socialId	=	req?.body?.social_id || "";
			let socialType	=	req?.body?.social_type?.toLowerCase() || "";
			let firstName 	= 	req?.body?.first_name || "";
			let lastName 	= 	req?.body?.last_name || "";
			let email 		= 	req?.body?.email || "";
			let mobileNumber=   req?.body?.mobile_number || "";
			let receiveNewsletter=   req?.body?.receive_newsletter || 0;
			let referralCode=	req?.body?.referral_code || "";
			let fullName	= 	firstName+' '+ lastName;

			/** Apply validation */
			let validationResponse = await applyValidationInterCallFunction(req, res, next, customerRegistrationValidation);
			if(validationResponse.status != Constants.STATUS_SUCCESS) return resolve(validationResponse);

			const users = this.db.collection(Tables.USERS);
			asyncParallel({
				already_exists:(callback)=>{
					/** Check email/mobile number is unique */
					users.findOne({
						$or	: [
							{email			: {$regex : "^"+email+"$",$options:"i"}},
							{mobile_number	: mobileNumber},
						],
						is_deleted	:	Constants.NOT_DELETED,
						$and		:	[{$or: [
							{is_guest: { $exists : false }},
							{is_guest: false},
						]}],
					},{projection: {
						_id:1,email:1,mobile_number:1, user_role_id: 1
					}}).then(result=>{
						
						if(result){
							let resultMail 	 	= result?.email?.toLowerCase()	|| "";
							let resultMobile	= result?.mobile_number			|| "";
							let enteredMail  	= email.toLowerCase();
							let existsResponse	= {};

							if(result?.user_role_id == Constants.CUSTOMER){
								/** Ask for reclaim if email or mobile already exists*/
								if(resultMail == enteredMail) 	existsResponse.email_exists = true;
								if(resultMobile == mobileNumber) existsResponse.mobile_exists = true;

								if(Object.keys(existsResponse).length > 0){
									/** Send reclaim response **/
									return callback(null,{status : Constants.STATUS_SUCCESS,exists_response: existsResponse, user_id: result?._id,valid_user: false});
								}
							}else{
								let errMessage = [];

								/** Push error message in array if email or mobile already exists*/
								if(resultMail == enteredMail){
									errMessage.push({'param':'email','msg':res.__("user.email_id_is_already_exist")});
								}
								if(resultMobile == mobileNumber){
									errMessage.push({'param':'mobile_number','msg':res.__("user.mobile_already_exists")});
								}
								return callback(null,{status: Constants.STATUS_ERROR, message: errMessage,valid_user: false});
							}
						}
						callback(null,{status: Constants.STATUS_SUCCESS, valid_user: true});
					}).catch(next);
				},
				guest_data:(callback)=>{
					/** Set guest conditions */
					let	guestConditions			  =	clone(Constants.CUSTOMER_COMMON_CONDITIONS);
					guestConditions.is_guest	  = true;
					guestConditions.mobile_number = mobileNumber;

					/** Check mobile number exists with guest user */
					users.findOne(guestConditions,{projection: {_id:1}}).then(guestResult=>{
						callback(null,guestResult);
					}).catch(next);
				},
				referral_code : (callback)=>{
					/** Set referral options **/
					let referralOptions = { prefix : fullName};

					/** Generate referral code **/
					generateReferralCode(req,res,referralOptions).then(referralResponse=>{
						callback(null,referralResponse?.referral_code || "");
					}).catch(next);
				},
				slug : (callback)=>{
					/** Get slug **/
					getDatabaseSlug({title: fullName, table_name : Tables.USERS, slug_field: "slug"}).then(slugResponse=>{
						callback(null,slugResponse?.title ||"");
					}).catch(next);
				},
				referral_detail : (callback)=>{
					checkReferralCode(req,res,next,{referral_code:referralCode}).then(referredResponse=>{
						callback(null,referredResponse);
					}).catch(next);
				}
			},(asyncErr, asyncResponse)=>{
				if(asyncErr) return resolve({status : Constants.STATUS_ERROR, message : res.__("system.something_going_wrong_please_try_again")});
				
				/** If user already exists, return the response */
				if(!asyncResponse?.already_exists?.valid_user){
					delete asyncResponse.already_exists.valid_user;
					return resolve(asyncResponse.already_exists);
				}

				/** Get otp number **/
				let otp  = getRandomOTP();

				let userReferralCode= asyncResponse?.referral_code || "";
				let slug 			= asyncResponse?.slug || "";
				let referredDetail 	= asyncResponse?.referral_detail || "";
				let newPassword		= generateMD5Hash(password);
				let userId  		= asyncResponse?.guest_data?._id || new ObjectId();

				if(referredDetail && referredDetail?.status != Constants.STATUS_SUCCESS) return resolve({status :Constants.STATUS_ERROR,message:[{param:'referral_code',msg:res.__("user.enterd_referral_code_is_not_valid")}]});

				/** Referred user id **/
				let referredUserId	=	referredDetail?.user_id ? new ObjectId(referredDetail?.user_id) : "";
				let timeStamp		= 	currentTimeStamp();
				let validateString	=   generateMD5Hash(timeStamp+email);

				let updateData		=	{
					$set : {
						first_name 		: firstName,
						last_name 		: lastName,
						full_name		: fullName,
						password		: newPassword,
						otp				: otp,
						validate_string : validateString,
						gender 			: req?.body?.gender || "",
						date_of_birth 	: getUtcDate(req?.body?.date_of_birth+" "+START_DATE_TIME_FORMAT),
						email 			: email,
						user_type		: Constants.USER_TYPE_OTHER,
						phone_country_code 	: Constants.DEFAULT_COUNTRY_CODE,
						referral_details	: {
							referral_code 		: userReferralCode,
							referrer_user_code 	: referralCode,
							referred_by 		: referredUserId,
						},
						is_verified 		: Constants.NOT_VERIFIED,
						is_email_verified 	: Constants.NOT_VERIFIED,
						is_mobile_verified 	: Constants.NOT_VERIFIED,
						modified   			: getUtcDate()
					},
					$setOnInsert : {
						user_role_id	: Constants.CUSTOMER,
						slug 			: slug,
						is_deleted 		: Constants.NOT_DELETED,
						mobile_number	: mobileNumber,
						active 			: Constants.ACTIVE,
						total_amount    : 0,
						wallet			: {},
						created 		: getUtcDate(),
					},
					$unset : { is_guest : 1 }
				};

				/** Add wallet object */
				Object.keys(Constants.WALLET_TYPE).map(walletKey=>{
					updateData["$setOnInsert"]["wallet"][walletKey] = 0;
				});

				if(socialId !="" && (socialType =="facebook" || socialType =="google" || socialType =="twitter")){
					updateData["$set"][socialType+"_id"] 	= socialId;
					updateData["$set"]["is_email_verified"] = Constants.VERIFIED;
				}

				/** Save user data **/
				users.updateOne({_id : userId},updateData,{upsert: true}).then(async ()=>{

					if(receiveNewsletter){
						let currentTime	= 	currentTimeStamp();
						let encId		=	generateMD5Hash(currentTime+email);
						/** Save newsletter subscribers data **/
						const newsletter_subscribers = this.db.collection(Tables.NEWSLETTER_SUBSCRIBERS);
						await newsletter_subscribers.insertOne({
							email 			: email,
							status 			: Constants.ACTIVE,
							user_id 		: new ObjectId(userId),
							enc_id			: encId,
							is_subscribe	: Constants.SUBSCRIBED,
							modified 		: getUtcDate(),
							created 		: getUtcDate()
						});
					}

					let refereeEnable	= res?.locals?.settings?.["Rewards_and_referrals.enable_referee_amount"] || 0;
					let refereeAmount	= res?.locals?.settings?.["Rewards_and_referrals.referee_amount"] || 0;
					let referralEnable	= res?.locals?.settings?.["Rewards_and_referrals.enable_referral_amount"] || 0;
					let referralAmount	= res?.locals?.settings?.["Rewards_and_referrals.referral_amount"] || 0;

					if(refereeEnable && referralCode){
						updateUserRewardPoints(req,res,next,{
							user_id			:	userId,
							reward_type		:	Constants.REGISTRATION_REWARD,
							points			:	parseFloat(refereeAmount),
							additional_info	:	{
								referrer_user_code 	: req?.body?.referral_code,
								referred_by 		: referredUserId,
							}
						}).then(()=>{});
					}
					if(referralEnable && referralCode){
						updateUserRewardPoints(req,res,next,{
							user_id			:	referredUserId,
							reward_type		:	Constants.REGISTRATION_REWARD,
							points			:	parseFloat(referralAmount),
							additional_info	:	{
								referee_user_id : userId,
							}
						}).then(()=>{});
					}

					/*************** Send mail  ***************/
					sendMailToUsers(req,res,{
						event_type 			: Constants.NOTIFICATION_FRONT_CUSTOMER_REGISTER,
						full_name			: fullName,
						email				: email,
						receive_newsletter	: receiveNewsletter,
						validate_string		: validateString,
						mobile_number		: Constants.DEFAULT_COUNTRY_CODE+mobileNumber,
						user_id				: userId,
						otp  				: otp
					});

					/** Save reclaim logs */
					saveReclaimLogs(req, res, {
						action_taken_by	: 	userId,
						user_id			: 	userId,
						action			: 	Constants.RECLAIM_LOGS_VERIFY_MOBILE_ACTION,
						channel			: 	req?.body?.channel_id,
						otp				:	otp,
						status			:	Constants.PENDING,
						function		:	"Registration",
					}).then(()=>{ });

					/** Save reclaim logs */
					saveReclaimLogs(req, res, {
						action_taken_by		: userId,
						user_id				: userId,
						action				: Constants.RECLAIM_LOGS_REGISTRATION,
						channel				: req?.body?.channel_id,
					}).then(()=>{});

					resolve({
						user_id	: userId,
						otp		: otp,
						status	: Constants.STATUS_SUCCESS,
						message : res.__("user.customer_has_been_added_successfully"),
					});

					/** Save user login Logs **/
					let userDetails = clone(updateData["$set"]);
					userDetails._id = userId;
					this.registrationAPI.saveLoginLogs(req,res,userDetails);
				}).catch(next);
			});
		});
	};//End customerRegistration()

	/**
	 * Function for driver registration
	 *
	 * @param req As Request Data
	 * @param res As Response Data
	 *
	 * @return json
	 */
   	async driverRegistration (req, res, next){
		return new Promise(async resolve=>{
			/** Sanitize Data **/
			req.body 		= sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
			let password	= req?.body?.password || "";
			let lastName 	= req?.body?.last_name || "";
			let email 		= req?.body?.email || "";
			let mobileNumber= req?.body?.mobile_number || "";
			let firstName 	= req?.body?.first_name || "";
			let fullName	= firstName + " " + lastName;

			/** Check validation **/
			let validationResponse = await applyValidationInterCallFunction(req, res, next, driverRegistrationValidation);
			if(validationResponse.status != Constants.STATUS_SUCCESS) return resolve(validationResponse);

			const users 	= this.db.collection(Tables.USERS);
			asyncParallel({
				already_exists:(callback)=>{
					/** Check email/mobile number is unique */
					users.findOne({
						$or			: [
							{email			: {$regex : "^"+email+"$",$options:"i"}},
							{mobile_number	: mobileNumber},
						],
						is_deleted	: Constants.NOT_DELETED,
					},{projection: {
						_id:1,email:1,mobile_number:1, user_role_id: 1
					}}).then(result=>{	
						if(result){
							let resultMail 	 	= result?.email?.toLowerCase()	|| "";
							let resultMobile	= result?.mobile_number			|| "";
							let enteredMail  	= email.toLowerCase();
							let existsResponse	= {};

							if(result?.user_role_id == Constants.CUSTOMER){
								/** Ask for reclaim if email or mobile already exists*/
								if(resultMail == enteredMail) 	existsResponse.email_exists = true;
								if(resultMobile == mobileNumber) existsResponse.mobile_exists = true;

								if(Object.keys(existsResponse).length > 0){
									/** Send reclaim response **/
									return callback(null,{status : Constants.STATUS_SUCCESS,exists_response: existsResponse, user_id: result?._id,valid_user: false});
								}
							}else{
								let errMessage = [];

								/** Push error message in array if email or mobile already exists*/
								if(resultMail == enteredMail){
									errMessage.push({'param':'email','msg':res.__("user.email_id_is_already_exist")});
								}
								if(resultMobile == mobileNumber){
									errMessage.push({'param':'mobile_number','msg':res.__("user.mobile_already_exists")});
								}
								return callback(null,{status: Constants.STATUS_ERROR, message: errMessage,valid_user: false});
							}
						}
						callback(null,{status: Constants.STATUS_SUCCESS, valid_user: true});
					}).catch(next);
				},
				slug : (callback)=>{
					/** Get slug **/
					getDatabaseSlug({title: fullName, table_name : Tables.USERS, slug_field: "slug"}).then(slugResponse=>{
						callback(null,slugResponse?.title ||"");
					}).catch(next);
				},
				otp : (callback)=>{
					/** Get otp number **/
					callback(null,getRandomOTP());
				},
				driver_id : (callback)=>{
					/** get driver id **/
					getUniqueId(req,res,next,{type: "user_driver_id"}).then(uniqueIdResponse=>{
						callback(null,uniqueIdResponse?.result || "");
					}).catch(next);
				}
			},(asyncErr, asyncResponse)=>{
				if(asyncErr) return resolve({status : Constants.STATUS_ERROR, message : res.__("system.something_going_wrong_please_try_again")});

				if(!asyncResponse.already_exists.valid_user){
					delete asyncResponse.already_exists.valid_user;
					return resolve(asyncResponse.already_exists);
				}

				let otp  			= asyncResponse?.otp 			? asyncResponse?.otp 		:"";
				let slug 			= asyncResponse?.slug 			? asyncResponse?.slug 		:"";
				let newPassword		= generateMD5Hash(password);
				let uniqueDriverId  = asyncResponse?.driver_id 	? asyncResponse?.driver_id	:"";

				let timeStamp		= currentTimeStamp();
				let validateString	= generateMD5Hash(timeStamp+email);

				/** Set update Data */
				let updateData = {
					first_name 			: firstName,
					last_name 			: lastName,
					full_name			: fullName,
					user_role_id		: Constants.DRIVER,
					otp					: otp,
					validate_string 	: validateString,
					is_email_verified 	: Constants.NOT_VERIFIED,
					is_mobile_verified 	: Constants.NOT_VERIFIED,
					slug 				: slug,
					email 				: email,
					mobile_number 		: mobileNumber,
					password			: newPassword,
					user_type			: Constants.USER_TYPE_OTHER,
					active 				: Constants.ACTIVE,
					is_verified 		: Constants.NOT_VERIFIED,
					is_deleted 			: Constants.NOT_DELETED,
					order_status 		: Constants.ORDER_DRIVER_FREE,
					driver_id           : uniqueDriverId,
					created 			: getUtcDate(),
					modified   			: getUtcDate()
				};

				/** Save user data **/
				users.insertOne(updateData).then(qryResult=>{

					/*************** Send mail  ***************/
					sendMailToUsers(req,res,{
						event_type 		: Constants.NOTIFICATION_FRONT_DRIVER_REGISTER,
						full_name		: fullName,
						email			: email,
						mobile_number	: Constants.DEFAULT_COUNTRY_CODE+mobileNumber,
						validate_string	: validateString,
						otp				: otp
					});

					/*************** Send mail  ***************/
					let userId = qryResult?.insertedId || "";	
					resolve({
						user_id	: userId,
						otp		: otp,
						status	: Constants.STATUS_SUCCESS,
						message : res.__("user.driver_has_been_added_successfully"),
					});

					/** Save user login Logs **/
					let userDetails = clone(updateData);
					userDetails._id = userId;
					this.registrationAPI.saveLoginLogs(req,res,userDetails);
				}).catch(next);
			});
		}).catch(next);
	}//End driverRegistration()

	/**
	 * Function for login customer/driver
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	 **/
	async login (req,res,next){
		return new Promise(async resolve=>{
			/** Sanitize Data **/
			req.body 		= 	sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
			let userType	= 	(req?.body?.user_type) ? req?.body?.user_type : "";
			let socialId	=	(req?.body?.social_id)	?	req?.body?.social_id					:"";
			let socialType	=	(req?.body?.social_type)	?	req?.body?.social_type.toLowerCase() 	:"";
			let deviceToken =	(req?.body?.device_token)	?	req?.body?.device_token				:"";

			/** Send error response **/
			if(!userType) return resolve({status : Constants.STATUS_ERROR, message : res.__("system.missing_parameters")});
			if(userType != Constants.USER_TYPE_CUSTOMER && userType != Constants.USER_TYPE_DRIVER) return resolve({status : Constants.STATUS_ERROR, message : res.__("system.invalid_access")});

			/** Check validation **/
			let validationResponse = await applyValidationInterCallFunction(req, res, next, loginValidation);
			if(validationResponse.status != Constants.STATUS_SUCCESS) return resolve(validationResponse);

			/** Set conditions **/
			let userRoleId = (userType == Constants.USER_TYPE_CUSTOMER) ? Constants.CUSTOMER : Constants.DRIVER;
			let conditions	=	{
				user_type	: Constants.USER_TYPE_OTHER,
				user_role_id: userRoleId,
				is_deleted	: Constants.NOT_DELETED,
			};

			/** Social conditions **/
			if(socialId !="" && (socialType =="facebook" || socialType =="google"|| socialType =="twitter")){
				let socialIdCondition = {};
				socialIdCondition 					= 	{};
				socialIdCondition[socialType+'_id'] =	socialId;
				conditions["$or"] 	=	[];

				if(req.body.user_name) conditions["$or"].push({"email" : {$regex : '^'+req.body.user_name+'$',$options : 'i'}});
				conditions["$or"].push(socialIdCondition);
			}else{
				conditions["$or"] 	=	[
					{"email": {$regex : '^'+req.body.user_name+'$',$options : 'i'}},
					{'mobile_number': req.body.user_name},

				];
				conditions.password	= generateMD5Hash(req.body.password);
			}

			/** Set options data for get user details **/
			let userOptions = {
				conditions	: conditions,
				fields		: {otp:0,email_otp:0,is_deleted:0,created:0,modified:0,password:0}
			};

			/** Get user details **/
			let userResponse = await this.registrationAPI.getUserData(req,res,next,userOptions);

			if(userResponse.status != Constants.STATUS_SUCCESS) return resolve(userResponse);
			let resultData	= userResponse?.result || "";
			if(!resultData){
				if(socialId !="" && (socialType =="facebook" || socialType =="google" || socialType =="twitter")){
					/** Send success response */
					return resolve({status: Constants.STATUS_SUCCESS, is_register: Constants.NOT_REGISTER, message: res.__("user.social_not_register_message") });
				}

				/** Send error/success response **/
				return resolve({
					status	: Constants.STATUS_ERROR,
					message	: [{"param":"password","msg":res.__("user.email_password_entered_incorrect")}]
				});
			}

			/** Response if user deactivated by admin*/
			if(resultData.active != Constants.ACTIVE) return resolve({status: Constants.STATUS_ERROR,message: res.__("user.account_temporarily_disabled")});

			const users = this.db.collection(Tables.USERS);

			if(resultData.is_verified == Constants.VERIFIED){
				let deviceDetails 	=	resultData?.device_details ?	resultData?.device_details :[];
				let isSameDevice 	= 	true;
				let anotherDeviceDetails =	[];
				
				if(deviceDetails.length >0){
					isSameDevice = false;
					deviceDetails.map(data=>{
						if(data.device_token && data.device_token == deviceToken){
							isSameDevice = true;
						}else{
							anotherDeviceDetails.push(data);
						}
					});
				}

				asyncParallel({
					update_social_id : (callback)=>{
						/** Update social id **/
						if(socialId !="" && (socialType =="facebook" || socialType =="google" || socialType =="twitter")){
							/** Set update data **/
							let socialUpdateData				=	{modified: getUtcDate()};
							socialUpdateData[socialType+'_id'] 	=	socialId

							/** Update user details **/
							users.updateOne({_id:new ObjectId(resultData._id)},{$set :socialUpdateData}).then(()=>{ }).catch(next);
						}
						callback(null);
					},
					update_user_id : (callback)=>{
						if(userType != Constants.USER_TYPE_CUSTOMER || !req.body.device_id) return callback(null,null);

						/** Update user id */
						this.userCartsAPI.updateUserId(req,res,next,{user_id: resultData._id, device_id: req?.body?.device_id || ""}).then(()=>{
							callback(null);
						}).catch(next);
					},
					notification_type_details : (callback)=>{
						if(userType != Constants.USER_TYPE_DRIVER || isSameDevice) return callback(null,null);

						/** Get notification type details  */
						const notification_types	=	this.db.collection(Tables.NOTIFICATION_TYPES);
						notification_types.findOne({
							notification_type: Constants.NOTIFICATION_TO_DRIVER_LOGIN_IN_ANOTHER_DEVICE
						}).then(typeResult=>{
							callback(null,typeResult);
						}).catch(next);
					},
				},(asyncErr, asyncResponse)=>{
					if(asyncErr) return next(asyncErr);

					/** Save user login Logs **/
					this.registrationAPI.saveLoginLogs(req,res,resultData).then(()=>{});

					/** Send success response **/
					resolve({
						status		: Constants.STATUS_SUCCESS,
						result		: resultData,
						is_register : Constants.REGISTER,
						image_path	: Constants.USERS_URL,
						message 	: res.__('user.success_login_msg')
					});

					/** Send pn when driver login another  device  */
					let notificationDetails = asyncResponse.notification_type_details;
					if(notificationDetails && anotherDeviceDetails.length >0 && userType == Constants.USER_TYPE_DRIVER && !isSameDevice){
						let tmpMessage 	= (notificationDetails?.message) ? notificationDetails?.message :{};
						let tmpTitle 	= (notificationDetails?.title) 	? notificationDetails?.title :{};
						anotherDeviceDetails.forEach(records=>{
							pushNotification(req,res,{
								pn_type		: 	Constants.NOTIFICATION_TO_DRIVER_LOGIN_IN_ANOTHER_DEVICE,
								user_id		:	resultData._id,
								device_token:	records.device_token,
								device_type	:	records.device_type,
								pn_body		:	tmpMessage.ar,
								user_role_id:	resultData.user_role_id,
								user_language_id: resultData.preference_language,
								pn_body_descriptions: {
									message: tmpMessage, title: tmpTitle
								}
							});
						});
					}
				});
			}else{
				if(resultData.is_mobile_verified != Constants.VERIFIED){
					/** Get otp number **/
					let mobileOTP		= getRandomOTP();
					let mobileNumber	= (resultData?.mobile_number) ? resultData?.mobile_number	:"";
					let countryCode		= (resultData?.country_code)	 ? resultData?.country_code	:Constants.DEFAULT_COUNTRY_CODE;

					/** Update otp in users **/
					users.updateOne({_id:new ObjectId(resultData._id)},{$set :{otp: mobileOTP,modified: getUtcDate()}}).then(()=>{

						/**************** Send otp for verify *******************/
						let msgBody	= (res.locals.settings['SMS.resend_otp']) ? res.locals.settings['SMS.resend_otp'] : '';
						msgBody		= msgBody.replace(RegExp('{OTP}','g'),mobileOTP);

						/**Send sms **/
						sendSMS(req,res,{
							mobile_number	: countryCode + mobileNumber,
							user_id			: resultData._id,
							sms_template	: msgBody
						});
						/**************** Send otp for verify *******************/

						resolve({
							status				: Constants.STATUS_SUCCESS,
							is_mobile_verified	: Constants.NOT_VERIFIED,
							user_id				: resultData._id,
							otp					: mobileOTP,
							message				: res.__('user.user_not_verified_login_mesage',mobileNumber)
						});
					}).catch(next);
				}else{
					resolve({
						status				: Constants.STATUS_SUCCESS,
						is_email_verified	: Constants.NOT_VERIFIED,
						user_id				: resultData._id,
						message				: res.__('user.your_email_id_is_not_verified')
					});
				}
			}
		});
	};//End login()

	/**
	 * Function to send verification email
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	 **/
	async sendVerificationMail (req,res,next){
		return new Promise(async resolve=>{
			/** Sanitize Data **/
			req.body 		= sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
			let userType	= (req?.body?.user_type)? req?.body?.user_type	: "";
			let userId		= (req?.body?.user_id) 	? req?.body?.user_id	: "";

			/** Send error response **/
			if(!userType || !userId) return resolve({status : Constants.STATUS_ERROR, message : res.__("system.missing_parameters")});

			/** Set options data for get user details **/
			let	userConditions = (userType == Constants.USER_TYPE_CUSTOMER) ? clone(Constants.CUSTOMER_COMMON_CONDITIONS) : clone(Constants.DRIVER_COMMON_CONDITIONS);
			userConditions._id = new ObjectId(userId);

			let userOptions = {
				conditions	: userConditions,
				fields		: {_id:1,email:1,full_name:1}
			};

			/** Get user details **/
			let userResponse = await this.registrationAPI.getUserData(req,res,next,userOptions);
			if(userResponse.status != Constants.STATUS_SUCCESS) return resolve(userResponse);
			let resultData	= userResponse?.result || "";

			let timeStamp		= currentTimeStamp();
			let validateString	= generateMD5Hash(timeStamp+resultData?.email);

			/** Update validate string in users **/

			let dataToBeSaved = {validate_string: validateString,modified: getUtcDate()};
			const users = this.db.collection(Tables.USERS);
			users.updateOne({_id:new ObjectId(resultData._id)},{$set :dataToBeSaved}).then(()=>{

				/**Send email */
				sendMailToUsers(req,res,{
					event_type 		: Constants.RESEND_CUSTOMER_DRIVER_EMAIL_EVENTS,
					full_name		: resultData?.full_name,
					email			: resultData?.email,
					validate_string	: validateString,
					user_id			: userId,
					user_type		: userType,
				});

				if(userType == Constants.USER_TYPE_CUSTOMER) {
					/** Save reclaim logs */
					saveReclaimLogs(req, res, {
						action_taken_by	: userId,
						user_id			: userId,
						action			: Constants.RECLAIM_LOGS_VERIFY_EMAIL_ACTION,
						channel			: req?.body?.channel_id,
						reset_tries		: 1,
						status			: Constants.PENDING,
						function		: "Registration",
					}).then(()=>{ });
				}

				resolve({
					status 	: Constants.STATUS_SUCCESS,
					message	: res.__('user.user_not_verified_mesage',resultData?.email)
				});
			}).catch(next);
		}).catch(next);
	};//End sendVerificationMail()

	/**
	 * Function for recover forgot password
	 *
	 * @param req 	As 	Request Data
	 * @param res 	As 	Response Data
	 * @param next	As 	Callback argument to the middleware function
	 *
	 * @return json
	 **/
    async forgotPassword (req,res,next){
		return new Promise(async resolve=>{
			/** Sanitize Data **/
			req.body 			= sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
			let selectedType 	= req?.body?.type || "";
			let userType		= req?.body?.user_type || "";

			/** Send error response **/
			if(!userType || !selectedType) return resolve({status : Constants.STATUS_ERROR, message : res.__("system.missing_parameters")});

			/** Check validation **/
			let validationResponse = await applyValidationInterCallFunction(req, res, next, forgotPasswordValidation);
			if(validationResponse.status != Constants.STATUS_SUCCESS) return resolve(validationResponse);

			let mobileNumber	= req?.body?.mobile_number || "";
			let userEmail		= req?.body?.email  		|| "";
			let isMobile		= (selectedType == Constants.MOBILE_NUMBER) ? true : false;

			let	userConditions	= (userType == Constants.USER_TYPE_CUSTOMER) ? clone(Constants.CUSTOMER_COMMON_CONDITIONS) : clone(Constants.DRIVER_COMMON_CONDITIONS);
			userConditions.is_guest	=	{$exists : false };

			/**Condition  for mobile or email*/
			if(isMobile){
				userConditions.mobile_number = mobileNumber;
			}else{
				userConditions.email = userEmail;
			}

			/** Set options for get user details **/
			let options = {
				conditions	: userConditions,
				fields		: {
					_id :1,full_name:1,mobile_number:1,country_code:1,is_verified:1,active:1,email:1
				}
			};
			/** Get user details **/
			let response =  await this.registrationAPI.getUserData(req,res,next,options);
			if(response.status != Constants.STATUS_SUCCESS) return resolve(response);

			/** Send error response **/
			let inputParam = (isMobile) ? "mobile_number" :"email";
			if(!response.result) return resolve({status : Constants.STATUS_ERROR, message : [{param: inputParam, msg:res.__("user.email_not_registered")}]});

			let result 			= response.result;
			let activeStatus	= result.active || "";
			let verifiedStatus	= result.is_verified || "";
			let countryCode		= result.country_code || Constants.DEFAULT_COUNTRY_CODE;
			let email			= result.email || "";
			let fullName		= result.full_name || "";

			if(isMobile) mobileNumber	= countryCode+mobileNumber;
			let timeStamp				= currentTimeStamp();
			let forgotValidateString	= generateMD5Hash(timeStamp+email);

			/** Send error response **/
			if(activeStatus != Constants.ACTIVE) return resolve({status : Constants.STATUS_ERROR, message	: [{param: inputParam, msg: res.__("user.account_temporarily_disabled")}]});

			/** Send error response **/
			if(verifiedStatus != Constants.VERIFIED) return resolve({status : Constants.STATUS_ERROR, message : [{param: inputParam, msg: res.__("user.account_is_not_verified")}]});

			/** Get Otp **/
			let mobileOTP 	 = getRandomOTP();
			let dataToBeSaved = {
				otp			: mobileOTP,
				modified	: getUtcDate(),
			};

			if(!isMobile){
				dataToBeSaved = {
					forgot_validate_string	: forgotValidateString,
					modified				: getUtcDate(),
				};
			}

			/** Update otp number **/
			const users = this.db.collection(Tables.USERS);
			users.updateOne({_id : new ObjectId(result._id)},{$set	: dataToBeSaved}).then(()=>{
				if(isMobile){
					/*********** Send sms for forgot password ***************/
						let msgBody = (res.locals.settings['SMS.forgot_password']) ? res.locals.settings['SMS.forgot_password'] :"";
						msgBody		= msgBody.replace(RegExp('{OTP}','g'),mobileOTP);

						/** Send sms **/
						sendSMS(req,res,{
							mobile_number: mobileNumber,
							user_id 	: result._id,
							sms_template: msgBody
						});
					/*********** Send sms for forgot password ***************/
				} else {

					/*********** Send email for forgot password ***************/
					sendMailToUsers(req,res,{
						event_type 		: Constants.CUSTOMER_DRIVER_FORGOT_PASSWORD_EMAIL_EVENTS,
						full_name		: fullName,
						email			: email,
						validate_string	: forgotValidateString,
						user_id			: result._id,
						user_type		: userType
					});
					/*********** Send email for forgot password ***************/
				}

				/** Send success response **/
				let message = (isMobile) ?  res.__("user.otp_sent_successfully_on_mobile",mobileNumber) : res.__("user.link_sent_successfully_on_email",email);
				let returnResponse = {
					status 		: Constants.STATUS_SUCCESS,
					user_id		: result._id,
					message		: message
				};
				if(isMobile) returnResponse.otp	= mobileOTP;

				/** Send success response **/
				resolve(returnResponse);
			}).catch(next);
		}).catch(next);
	};// end forgotPassword()

	/**
	 * Function for resend otp
	 *
	 * @param req	As	Request Data
	 * @param res	As	Response Data
	 * @param next	As	Callback argument to the middleware function
	 *
	 * @return json
	 **/
	async resendOtp (req,res,next){
		return new Promise(async resolve=>{
			/** Sanitize Data **/
			req.body 		= sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
			let userId		= req?.body?.user_id 	|| "";
			let userType	= req?.body?.user_type	|| "";

			if(!userType || !userId) return resolve({status :Constants.STATUS_ERROR, message: res.__("system.missing_parameters")});

			/** Set user conditions **/
			let	userConditions	= (userType == Constants.USER_TYPE_CUSTOMER) ? clone(Constants.CUSTOMER_COMMON_CONDITIONS) : clone(Constants.DRIVER_COMMON_CONDITIONS);
			userConditions._id = new ObjectId(userId);

			/** Set options for get user details **/
			let options = {
				conditions	: userConditions,
				fields		: {_id:1,mobile_number:1,country_code:1,email:1,full_name:1}
			};

			/** Get user details **/
			let response = await this.registrationAPI.getUserData(req,res,next,options);
			if(response.status != Constants.STATUS_SUCCESS && !response.result) return next(res.__("system.something_going_wrong_please_try_again"));

			let result	= response.result;
			let otp		= await getRandomOTP();

			const users = this.db.collection(Tables.USERS);
			users.updateOne({_id : new ObjectId(result._id)},{$set: {modified : getUtcDate(),otp : otp}}).then(()=>{

				/******************* Send OTP To User  **********************/
					let countryCode		= result.country_code || Constants.DEFAULT_COUNTRY_CODE;
					let mobileNumber	= result.mobile_number || "";
					mobileNumber	= countryCode+mobileNumber;
					let msgBody 	= (res.locals.settings['SMS.resend_otp']) ? res.locals.settings['SMS.resend_otp'] : '';
					msgBody			= msgBody.replace(RegExp('{OTP}','g'),otp);

					/**Send sms **/
					sendSMS(req,res,{
						mobile_number	: mobileNumber,
						user_id 		: result._id,
						sms_template	: msgBody
					});
				/*************** Send OTP To User ***************/

				if(userType == Constants.USER_TYPE_CUSTOMER) {
					/** Save reclaim logs */
					saveReclaimLogs(req, res, {
						action_taken_by	: userId,
						user_id			: userId,
						action			: Constants.RECLAIM_LOGS_VERIFY_MOBILE_ACTION,
						channel			: req.body.channel_id,
						reset_tries		: 1,
						status			: Constants.PENDING,
						otp				: otp,
						function		: "Registration",
					});
				}

				/** Send success response **/
				resolve({
					status 	: Constants.STATUS_SUCCESS,
					otp		: otp,
					user_id	: result._id,
					message	: res.__("user.otp_sent_successfully_on_mobile",mobileNumber)
				});
			}).catch(next);
		}).catch(next);
	};//End resendOtp()

	/**
	 * Function to verify phone number
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	 */
	async verifyMobileNumber (req,res,next){
		return new Promise(async resolve=>{
			/** Sanitize Data */
			req.body 	= sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
			let userId 	= req?.body?.user_id 	? new ObjectId(req?.body?.user_id)	:"";
			let otp 	= req?.body?.otp		|| "";
			let otpType	= req?.body?.otp_type 	|| "";

			/** Send error response */
			if(!userId) return resolve({status : Constants.STATUS_ERROR, message	: res.__("system.something_going_wrong_please_try_again")});

			/** Check validation **/
			let validationResponse = await applyValidationInterCallFunction(req, res, next, verifyMobileNumberValidation);
			if(validationResponse.status != Constants.STATUS_SUCCESS) return resolve(validationResponse);

			/** Set conditions */
			let userConditions = {
				_id					: userId,
				user_type			: Constants.OTHER,
				is_deleted			: Constants.NOT_DELETED,
				$or					: [
					{user_role_id	: Constants.DRIVER},
					{user_role_id	: Constants.CUSTOMER}
				]
			};

			if(otpType != "forgot_password")  userConditions.is_mobile_verified = Constants.NOT_VERIFIED;

			/** Get user details **/
			const users = this.db.collection(Tables.USERS);
			users.findOne(userConditions,{projection: {_id:1,otp:1,is_email_verified:1,user_role_id:1}}).then(result=>{

				/** Send error response */
				if(!result) return resolve({status : Constants.STATUS_ERROR,message : res.__("system.invalid_access")});

				/** Send error response */
				if(result.otp && result.otp != otp) return resolve({status	: Constants.STATUS_ERROR,message	: [{'param':'otp','msg':res.__("user.please_enter_correct_otp")}]});

				if(otpType == "forgot_password") return resolve({status : Constants.STATUS_SUCCESS,message : res.__("user.your_otp_is_verified_successfully")});

				let updateData	= {
					$set: {
						is_mobile_verified	: Constants.VERIFIED,
						modified			: getUtcDate()
					},
					$unset : {
						otp	: 1,
					}
				};

				// if(result.is_email_verified) updateData["$set"]['is_verified'] = Constants.VERIFIED;
				updateData["$set"]['is_verified'] = Constants.VERIFIED;

				/** Update user details **/
				users.updateOne({_id : new ObjectId(result._id) },updateData).then(()=>{

					/* Common functino for user details */
					let options = {
						conditions	:	{
							_id				: new ObjectId(result._id),
							is_deleted		: Constants.NOT_DELETED,
							active			: Constants.ACTIVE,
						},
						fields	: {otp:0,email_otp:0,is_deleted:0,created:0,device_details:0,modified:0},
					};

					/** Get user details **/
					this.registrationAPI.getUserData(req,res,next,options).then(response=>{
						if(response.status != Constants.STATUS_SUCCESS) return next(response.message);

						if(result.user_role_id == Constants.CUSTOMER && otpType != "forgot_password") {
							/** Save reclaim logs */
							saveReclaimLogs(req, res, {
								action_taken_by	: 	userId,
								user_id			: 	userId,
								action			: 	Constants.RECLAIM_LOGS_VERIFY_MOBILE_ACTION,
								channel			: 	req.body.channel_id,
								status			:	Constants.VERIFIED,
								function		: 	"Registration",
							});
						}

						/** Send success response **/
						resolve({
							status 	: Constants.STATUS_SUCCESS,
							result	: (response.result)	? response.result	:{},
							message	: res.__("user.your_mobile_number_verified_successfully"),
						});
					}).catch(next);
				}).catch(next);
			});
		}).catch(next);
	};//End verifyMobileNumber()

	/**
	 * Function to verify email address
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	 */
	async verifyEmailAddress (req,res,next){
		return new Promise(resolve=>{
			/** Sanitize Data */
			req.body 			= sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
			let validateString	= req?.body?.validate_string || "";

			/** Send error response */
			if(!validateString) return resolve({status : Constants.STATUS_ERROR, message	: res.__("system.missing_parameters")});

			/** Get user details  **/
			const users = this.db.collection(Tables.USERS);
			users.findOne({
				validate_string			: validateString,
				user_type				: Constants.OTHER,
				is_deleted				: Constants.NOT_DELETED,
				is_email_verified		: Constants.NOT_VERIFIED,
				$or						: [
					{user_role_id		: Constants.DRIVER},
					{user_role_id		: Constants.CUSTOMER}
				]
			},{projection: {_id:1,is_mobile_verified:1,user_role_id:1}}).then(result=>{

				/** Send error response */
				if(!result) return resolve({status : Constants.STATUS_ERROR, message : res.__("user.you_are_using_wrong_link")});

				let updateData		=	{
					$set: {
						is_email_verified	: Constants.VERIFIED,
						modified			: getUtcDate()
					},
					$unset : {
						validate_string	: 1
					}
				};

				/** Update user details **/
				users.updateOne({_id : new ObjectId(result._id)},updateData).then(()=>{

					if(result.user_role_id == Constants.CUSTOMER) {
						/** Save reclaim logs */
						saveReclaimLogs(req, res, {
							action_taken_by	: new ObjectId(result._id),
							user_id			: new ObjectId(result._id),
							action			: Constants.RECLAIM_LOGS_VERIFY_EMAIL_ACTION,
							channel			: req.body.channel_id,
							reset_tries		: 1,
							status			: Constants.VERIFIED,
							function		: "Registration",
						});
					}

					/** Send success response **/
					resolve({
						status 	:	Constants.STATUS_SUCCESS,
						message	:	res.__("user.your_email_address_verified_successfully"),
					});
				}).catch(next);
			}).catch(next);
		}).catch(next);
	};//End verifyEmailAddress()

	/**
	 * Function for reset password
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	 **/
	async customerDriverResetPassword (req,res,next){
		return new Promise(async resolve=>{
			/** Sanitize Data **/
			req.body 			= sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
			let userId			= req?.body?.user_id				|| "";
			let userType		= req?.body?.user_type				|| "";
			let validateString	= req?.body?.forgot_validate_string	|| "";

			/** Send error response */
			if(!userType || (!userId  && !validateString)) return resolve({status : Constants.STATUS_ERROR, message : res.__("system.missing_parameters")});

			/** Check validation **/
			let validationResponse = await applyValidationInterCallFunction(req, res, next, resetPasswordValidation);
			if(validationResponse.status != Constants.STATUS_SUCCESS) return resolve(validationResponse);

			/** Set user conditions **/
			let	userConditions	= (userType == Constants.USER_TYPE_CUSTOMER) ? clone(Constants.CUSTOMER_COMMON_CONDITIONS) : clone(Constants.DRIVER_COMMON_CONDITIONS);
			if(userId) 			userConditions._id = new ObjectId(userId);
			if(validateString)	userConditions.forgot_validate_string = validateString;

			/** Set options for get user details **/
			let options 	= {
				conditions	: userConditions,
				fields		: {_id :1}
			};

			/** Get user details **/
			let response = await this.registrationAPI.getUserData(req,res,next,options);
			if(response.status != Constants.STATUS_SUCCESS || !response.result) return next(res.__("system.something_going_wrong_please_try_again"));

			let result		= response.result;
			let resultId  	= result._id;
			let password	= req?.body?.password		|| "";
			let newPassword	= generateMD5Hash(password);

			/** Update user password **/
			let users = this.db.collection(Tables.USERS);
			await users.updateOne({
					_id : new ObjectId(resultId)
				},
				{
					$set	: 	{
						password	: newPassword,
						modified 	: getUtcDate()
					},
					$unset  : {
						forgot_validate_string : 1
					}
				}
			);

			/** Send success response **/
			resolve({
				status	: Constants.STATUS_SUCCESS,
				message : res.__("user.your_password_has_been_reset_successfully"),
			});
		}).catch(next);
	};//End customerDriverResetPassword()

	/**
	 * Function to send otp to mobile number/Email before reclaiming user account
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	 */
	async sendReclaimOTP (req,res,next){
		return new Promise(async resolve=>{
			/** Sanitize Data */
			req.body 		=	sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
			let userId		= 	req?.body?.user_id ? new ObjectId(req.body.user_id) :"";

			/* JSON.parse to convert "true" to true */
			let emailExists	= 	req?.body?.email_exists ? JSON.parse(req.body.email_exists) 	:false;
			let mobileExists= 	req?.body?.mobile_exists ? JSON.parse(req.body.mobile_exists) 	:false;

			/** Send error response */
			if(!userId || (!emailExists && !mobileExists)) return resolve({status : Constants.STATUS_ERROR, message : res.__("system.missing_parameters")});

			/** Find user details **/
			const users = this.db.collection(Tables.USERS);
			users.findOne({
				_id 		: userId,
				is_deleted 	: Constants.NOT_DELETED,
			},{projection: {_id:1,mobile_number:1,email:1,full_name:1}}).then(findResult=>{

				if(!findResult) return resolve({
					status	: Constants.STATUS_ERROR,
					message	: res.__("system.something_going_wrong_please_try_again")
				});

				let otp = getRandomOTP();

				/** Update mobile otp  **/
				users.updateOne({
					_id 		: userId,
					is_deleted 	: Constants.NOT_DELETED,
				},
				{$set: {
					otp 	 : otp,
					modified : getUtcDate()
				}}).then(()=>{

					let message = "";
					if(emailExists && mobileExists) message = res.__("user.please_enter_otp_has_been_sent_to_your_email_and_mobile_number");
					if(emailExists) message = res.__("user.please_enter_otp_has_been_sent_to_your_email");
					if(mobileExists) message = res.__("user.please_enter_otp_has_been_sent_to_your_mobile_number");

					/** Send success response */
					resolve({
						status	: Constants.STATUS_SUCCESS,
						message	: message,
						otp     : otp
					});

					if(emailExists){
						/**Send email */
						let fullName 	= findResult.full_name;
						let email 		= findResult.email;
						if(email) sendMail(req,res,{
							to 			: email,
							action 		: "send_otp",
							rep_array 	: [fullName,otp]
						});
					}

					if(mobileExists){
						let mobileNumber = findResult.mobile_number;
						let countryCode	 = Constants.DEFAULT_COUNTRY_CODE;
						mobileNumber = countryCode+mobileNumber;

						/**************** Send otp for verify *******************/
						let msgBody	= res.locals.settings['SMS.otp_msg_for_reclaim'] || '';
						msgBody		= msgBody.replace(RegExp('{OTP}','g'),otp);

						/**Send sms **/
						sendSMS(req,res,{
							mobile_number	: mobileNumber,
							user_id			: userId,
							sms_template	: msgBody
						});
					}
				}).catch(next);
			}).catch(next);
		}).catch(next);
	};//End sendReclaimOTP()

	/**
	 * Function to reclaim driver/customer account
	 *
	 * @param req As Request Data
	 * @param res As Response Data
	 *
	 * @return json
	 */
	async reClaimAccount (req, res, next){
		return new Promise(resolve=>{
			/** Sanitize Data */
			req.body 		=	sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
			let userId 		= 	req?.body?.user_id		|| "";
			let userType	= 	req?.body?.user_type	|| "";
			let otp			= 	req?.body?.otp			|| "";
			let isWeb		= 	isWebApi(req,res);

			/** Send error response */	
			if(!userId || !userType) return resolve({status: Constants.STATUS_ERROR, message: res.__("system.missing_parameters")});

			if(isWeb && !otp){
				return resolve({status: Constants.STATUS_ERROR, message: [{'param':'otp','msg':res.__("user.please_enter_otp")}]});
			}

			/** set user conditions */
			let	userConditions	= (userType == Constants.USER_TYPE_CUSTOMER) ? clone(Constants.CUSTOMER_COMMON_CONDITIONS) : clone(Constants.DRIVER_COMMON_CONDITIONS);
			userConditions._id = new ObjectId(userId);

			/** Get user details  */
			const users = this.db.collection(Tables.USERS);
			users.findOne(userConditions,{projection: {_id:1,otp:1}}).then(result=>{

				/** Send error response */
				if(!result) return resolve({status:Constants.STATUS_ERROR, message:res.__("system.invalid_access")});

				/** Send error response */
				if(isWeb && result.otp != otp){
					return resolve({status: Constants.STATUS_ERROR, message: [{'param':'otp','msg':res.__("user.please_enter_correct_otp")}]});
				}

				/** Update verification status */
				users.updateOne(userConditions,
				{$set : {
					active	 			: Constants.ACTIVE,
					is_verified 		: Constants.NOT_VERIFIED,
					is_email_verified	: Constants.NOT_VERIFIED,
					is_mobile_verified	: Constants.NOT_VERIFIED,
					modified 			: getUtcDate()
				}}).then(()=>{

					if(userType == Constants.USER_TYPE_CUSTOMER) {
						/** Save reclaim logs */
						saveReclaimLogs(req, res, {
							action_taken_by		: userId,
							user_id				: userId,
							action				: Constants.RECLAIM_LOGS_RECLAIM_ACTION,
							channel				: req.body.channel_id,
						});
					}

					/**For render schedule page */
					resolve({
						status		: Constants.STATUS_SUCCESS,
						is_verified : Constants.NOT_VERIFIED,
						message		: res.__("users.account_reclaimed_successfully_please_verify_account")
					});
				}).catch(next);
			}).catch(next);
		}).catch(next);
	};//End reClaimAccount()

	/**
	 * Function to logout
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	 **/
	async logOut (req, res, next){
		return new Promise(resolve=>{
			req.body 		= sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
			let userType	= req?.body?.user_type 		|| "";
			let userId 		= req?.body?.user_id 		|| "";
			let deviceType 	= req?.body?.device_type	|| "";
			let deviceToken = req?.body?.device_token	|| "";

			/** Send error response **/
			if(!userId || !userType) return resolve({status : Constants.STATUS_ERROR, message: res.__("system.missing_parameters")});

			/** Send error response **/
			if(userType != Constants.USER_TYPE_CUSTOMER && userType != Constants.USER_TYPE_DRIVER) return resolve({status : Constants.STATUS_ERROR, message : res.__("system.invalid_access")});

			asyncParallel({
				update_device_details : (callback)=>{
					if(!(deviceType && deviceToken)) return callback(null);

					/** Update user details **/
					const users	=	this.db.collection(Tables.USERS);
					users.updateOne({
						_id	: new ObjectId(userId),
						"device_details.device_type" : deviceType,
						"device_details.device_token" : deviceToken,
					},
					{$pull: {
						device_details: {
							device_type	: deviceType,
							device_token: deviceToken
						}
					},$set:{
						is_available 	: Constants.NOT_AVAILABLE,
						modified		: getUtcDate()
					}}).then(()=>{
						callback(null);
					}).catch(next);
				},
				update_logout_time : (callback)=>{
					/** Save user login details **/
					const user_logins	=	this.db.collection(Tables.USER_LOGINS);
					user_logins.updateOne({
						user_id			: new ObjectId(userId),
						device_type 	: deviceType,
						device_token 	: deviceToken,
					},
					{$set :{
						logout_time		: getUtcDate()
					}}).then(()=>{
						callback(null);
					});
				},
			},()=>{
				/** Send success response **/
				resolve({
					status	: Constants.STATUS_SUCCESS,
					message	: res.__("user.you_have_logged_out_successfully")
				});
			});
		}).catch(next);
	};//End logOut()

	/**
	 * Function to verify forget password string
	 *
	 * @param req 	As Request Data
	 * @param res 	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	 **/
	async verifyForgetPasswordString (req, res, next){
		return new Promise(resolve=>{
			req.body 		    =   sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
			let userType		=   req?.body?.user_type		|| "";
			let validateString	=   req?.body?.validate_string	|| "";

			/** Send error response */
			if(!validateString || !userType) return resolve({status: Constants.STATUS_ERROR, message: res.__("system.missing_parameters")});

			/** Set user conditions **/
			let	userConditions	= (userType == Constants.USER_TYPE_CUSTOMER) ? clone(Constants.CUSTOMER_COMMON_CONDITIONS) : clone(Constants.DRIVER_COMMON_CONDITIONS);
			userConditions.forgot_validate_string = validateString;

			/** Get user details **/
			this.registrationAPI.getUserData(req,res,next,{
				conditions	: userConditions,
				fields		: {_id :1}
			}).then(response =>{
				if(response.status != Constants.STATUS_SUCCESS || !response.result) return resolve({status:Constants.STATUS_ERROR, message:res.__("system.invalid_access")});

				/** Send success response **/
				resolve({
					status	    : Constants.STATUS_SUCCESS,
					is_valid    : true,
				});
			}).catch(next);
		}).catch(next);
	};//End verifyForgetPasswordString()
}//End class CustomerRegistration
