import { body } from 'express-validator';
import * as Constants from '../../../config/global_constant.mjs';

// Validation rules for add/edit hubs
const addEditValidation = [
    body('name_english')
        .notEmpty()
        .withMessage((value, { req }) => req.__('admin.hubs.please_enter_hub_name_in_english')),
    body('name_arabic')
        .notEmpty()
        .withMessage((value, { req }) => req.__('admin.hubs.please_enter_hub_name_in_arabic')),
    body('branches')
        .notEmpty()
        .withMessage((value, { req }) => req.__('admin.hubs.please_select_branches')),
];

// Validation rules for parameters
const parametersValidation = [
    body('parameters_status').not().isEmpty(),
    body('max_order')
        .custom((value,{req, res, next,location,path})=>{
            let paraStatus = req?.body?.parameters_status == Constants.ON && true || false; 
            if(paraStatus && !value){
                return Promise.reject(req.__('admin.hubs.please_enter_max_order', { value, location, path }));
            }else if(value && (!Constants.VALID_NUMBER_REGEX.test(value) || value <= 0)){
                return Promise.reject(req.__('admin.hubs.please_enter_valid', { value, location, path }));
            }else{
                return true;
            }
        }),  
    body('assigned_buffer_time')
        .custom((value,{req, res, next,location,path})=>{
            let paraStatus = req?.body?.parameters_status == Constants.ON && true || false; 
            if(paraStatus && !value){
                return Promise.reject(req.__('admin.hubs.please_enter_assigned_buffer_time', { value, location, path }));
            }else if(value && (!Constants.VALID_NUMBER_REGEX.test(value) || value <= 0)){
                return Promise.reject(req.__('admin.hubs.please_enter_valid', { value, location, path }));
            }else{
                return true;
            }
        }),   
    body('assigned_max_buffer_time')
        .custom((value,{req, res, next,location,path})=>{
            let paraStatus = req?.body?.parameters_status == Constants.ON && true || false; 
            if(paraStatus && !value){
                return Promise.reject(req.__('admin.hubs.please_enter_assigned_max_buffer_time', { value, location, path }));
            }else if(value && (!Constants.VALID_NUMBER_REGEX.test(value) || value <= 0)){
                return Promise.reject(req.__('admin.hubs.please_enter_valid', { value, location, path }));
            }else{
                return true;
            }
        }), 
    body('unassigned_order')
        .custom((value,{req, res, next,location,path})=>{
            let paraStatus      = req?.body?.parameters_status == Constants.ON && true || false; 
            let unAssignStatus  = req?.body?.max_no_of_unassigned_status == Constants.ON && true || false; 
            
            if(paraStatus && unAssignStatus && !value){
                return Promise.reject(req.__('admin.hubs.please_enter_unassigned_order', { value, location, path }));
            }else if(value && (!Constants.VALID_NUMBER_REGEX.test(value) || value <= 0)){
                return Promise.reject(req.__('admin.hubs.please_enter_valid', { value, location, path }));
            }else{
                return true;
            }
        }), 
    body('max_unassigned_order')
        .custom((value,{req, res, next,location,path})=>{
            let paraStatus      = req?.body?.parameters_status == Constants.ON && true || false; 
            let unAssignStatus  = req?.body?.max_no_of_unassigned_status == Constants.ON && true || false; 
            
            if(paraStatus && unAssignStatus && !value){
                return Promise.reject(req.__('admin.hubs.please_enter_max_unassigned_order', { value, location, path }));
            }else if(value && (!Constants.VALID_NUMBER_REGEX.test(value) || value <= 0)){
                return Promise.reject(req.__('admin.hubs.please_enter_valid', { value, location, path }));
            }else{
                return true;
            }
        }), 
    body('urgent_max_unassigned_order')
        .custom((value,{req, res, next,location,path})=>{
            let paraStatus          = req?.body?.parameters_status == Constants.ON && true || false; 
            let maxUnAssignStatus   = req?.body?.urgent_max_no_of_unassigned_status == Constants.ON && true || false; 
            
            if(paraStatus && maxUnAssignStatus && !value){
                return Promise.reject(req.__('admin.hubs.please_enter_urgent_max_unassigned_order', { value, location, path }));
            }else if(value && (!Constants.VALID_NUMBER_REGEX.test(value) || value <= 0)){
                return Promise.reject(req.__('admin.hubs.please_enter_valid', { value, location, path }));
            }else{
                return true;
            }
        })
];

// Validation rules for branch link
const branchLinkValidation = [
    body('branch_ids')
        .notEmpty()
        .withMessage((value, { req }) => req.__('admin.hubs.please_select_branch')),
    body('name_english')
        .notEmpty()
        .withMessage((value, { req }) => req.__('admin.hubs.please_enter_name_in_english')),
    body('name_arabic')
        .notEmpty()
        .withMessage((value, { req }) => req.__('admin.hubs.please_enter_name_in_arabic')),
];

// Validation rules for order slabs
const orderSlabsValidation = [
    body('order_status').not().isEmpty(),
    body('first_order_min')
        .custom((value,{req, res, next,location,path})=>{
            let firOdMax = req?.body?.first_order_max  || false; 
            if(firOdMax && !value){
                return Promise.reject(req.__('admin.hubs.please_enter_first_order_min_value', { value, location, path }));
            }else if(value && (isNaN(value) || value < 0)){
                return Promise.reject(req.__('admin.hubs.please_enter_valid', { value, location, path }));
            }else{
                return true;
            }
        }), 
    body('first_order_max')
        .custom((value,{req, res, next,location,path})=>{
            let firOdMin = req?.body?.first_order_min  || false; 
            if(firOdMin && !value){
                return Promise.reject(req.__('admin.hubs.please_enter_first_order_max_value', { value, location, path }));
            }else if(value && (isNaN(value) || value < 0)){
                return Promise.reject(req.__('admin.hubs.please_enter_valid', { value, location, path }));
            }else if(value && firOdMin && value < firOdMin){
                return Promise.reject(req.__('admin.hubs.max_distance_should_be_greater_than_min', { value, location, path }));
            }else{
                return true;
            }
        }), 

    body('second_order_min')
        .custom((value,{req, res, next,location,path})=>{
            let secOdMax = req?.body?.second_order_max  || false; 
            if(secOdMax && !value){
                return Promise.reject(req.__('admin.hubs.please_enter_second_order_min_value', { value, location, path }));
            }else if(value && (isNaN(value) || value < 0)){
                return Promise.reject(req.__('admin.hubs.please_enter_valid', { value, location, path }));
            }else{
                return true;
            }
        }), 
    body('second_order_max')
        .custom((value,{req, res, next,location,path})=>{
            let secOdMin = req?.body?.second_order_min  || false; 
            if(secOdMin && !value){
                return Promise.reject(req.__('admin.hubs.please_enter_second_order_max_value', { value, location, path }));
            }else if(value && (isNaN(value) || value < 0)){
                return Promise.reject(req.__('admin.hubs.please_enter_valid', { value, location, path }));
            }else if(value && secOdMin && value < secOdMin){
                return Promise.reject(req.__('admin.hubs.max_distance_should_be_greater_than_min', { value, location, path }));
            }else{
                return true;
            }
        }), 
    
    body('third_order_min')
        .custom((value,{req, res, next,location,path})=>{
            let thirdOdMax = req?.body?.third_order_max  || false; 
            if(thirdOdMax && !value){
                return Promise.reject(req.__('admin.hubs.please_enter_third_order_min_value', { value, location, path }));
            }else if(value && (isNaN(value) || value < 0)){
                return Promise.reject(req.__('admin.hubs.please_enter_valid', { value, location, path }));
            }else{
                return true;
            }
        }), 
    body('third_order_max')
        .custom((value,{req, res, next,location,path})=>{
            let thirdOdMin = req?.body?.third_order_min  || false; 
            if(thirdOdMin && !value){
                return Promise.reject(req.__('admin.hubs.please_enter_third_order_max_value', { value, location, path }));
            }else if(value && (isNaN(value) || value < 0)){
                return Promise.reject(req.__('admin.hubs.please_enter_valid', { value, location, path }));
            }else if(value && thirdOdMin && value < thirdOdMin){
                return Promise.reject(req.__('admin.hubs.max_distance_should_be_greater_than_min', { value, location, path }));
            }else{
                return true;
            }
        }), 

    body('fourth_order_min')
        .custom((value,{req, res, next,location,path})=>{
            let fourthOdMax = req?.body?.fourth_order_max  || false; 
            if(fourthOdMax && !value){
                return Promise.reject(req.__('admin.hubs.please_enter_fourth_order_min_value', { value, location, path }));
            }else if(value && (isNaN(value) || value < 0)){
                return Promise.reject(req.__('admin.hubs.please_enter_valid', { value, location, path }));
            }else{
                return true;
            }
        }), 
    body('fourth_order_max')
        .custom((value,{req, res, next,location,path})=>{
            let fourthOdMin = req?.body?.fourth_order_min  || false; 
            if(fourthOdMin && !value){
                return Promise.reject(req.__('admin.hubs.please_enter_fourth_order_max_value', { value, location, path }));
            }else if(value && (isNaN(value) || value < 0)){
                return Promise.reject(req.__('admin.hubs.please_enter_valid', { value, location, path }));
            }else if(value && fourthOdMin && value < fourthOdMin){
                return Promise.reject(req.__('admin.hubs.max_distance_should_be_greater_than_min', { value, location, path }));
            }else{
                return true;
            }
        }), 

    body('exceeding_order_slabs')
        .custom((value,{req, res, next,location,path})=>{
            let orderStatus = req?.body?.order_status == Constants.ON && true || false; 
            if(orderStatus && !value){
                return Promise.reject(req.__('admin.hubs.please_enter_exceeding_order_slab_value', { value, location, path }));
            }else if(value && (!Constants.VALID_NUMBER_REGEX.test(value) || value <= 0)){
                return Promise.reject(req.__('admin.hubs.please_enter_valid', { value, location, path }));
            }else{
                return true;
            }
        }), 
    body('max_exceeding_order_slabs')
        .custom((value,{req, res, next,location,path})=>{
            let orderStatus = req?.body?.order_status == Constants.ON && true || false; 
            if(orderStatus && !value){
                return Promise.reject(req.__('admin.hubs.please_enter_max_exceeding_order_slab_value', { value, location, path }));
            }else if(value && (!Constants.VALID_NUMBER_REGEX.test(value) || value <= 0)){
                return Promise.reject(req.__('admin.hubs.please_enter_valid', { value, location, path }));
            }else{
                return true;
            }
        }), 
];

export { addEditValidation, parametersValidation, branchLinkValidation, orderSlabsValidation }; 