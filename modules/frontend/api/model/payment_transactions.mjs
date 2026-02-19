import { ObjectId } from 'mongodb';
import * as Constants from "../../../../config/global_constant.mjs";
import Tables from '../../../../config/database_tables.mjs';
import { sanitizeData, arrayToObject} from "../../../../utils/index.mjs";

export default class PaymentTransactions {
	constructor(db) {
		this.db = db;	
	}

    /**
	 * Function to get payment transaction list
	 *
	 * @param req	As Request Data
	 * @param res	As Response Data
	 * @param next	As Callback argument to the middleware function
	 *
	 * @return json
	 **/
	async getPaymentTransactionList (req,res,next){
		return new Promise(async resolve=>{
			try{
				/** Sanitize Data **/
				req.body 	= sanitizeData(req.body,Constants.NOT_ALLOWED_TAGS_XSS);
				let userId	= req?.body?.user_id ? new ObjectId(req.body.user_id) :"";

				/** Send error response **/
				if(!userId) return resolve({status: Constants.STATUS_ERROR, message : res.__("system.missing_parameters")});

				/** Get payment transaction list **/
				const payment_transactions	= this.db.collection(Tables.PAYMENT_TRANSACTIONS);
				let paymentResult = await payment_transactions.find({ 
					user_id : userId
				},{projection: {
					user_id:1,amount:1,currency:1,payment_method:1,payment_status:1,payment_event:1,invoice_number:1,transaction_id:1,order_ids:1,created:1,modified:1
				}}).toArray();

				/** Insert order ids in a array  **/
				let orderIds =  [];
				paymentResult.map(records=>{
					records.order_ids.map(orderId=>{
						orderIds.push(orderId);
					});
				});
				
				if(orderIds.length > 0) orderIds  = arrayToObject(orderIds);

				let orderList = [];
				if(orderIds?.length){
					/** Get order unique id **/
					const orders = this.db.collection(Tables.ORDERS);
					orderList = await orders.find({ _id : {$in : orderIds}},{projection: {_id:1,unique_order_id:1}}).toArray();
				}	

				/** Insert unique order id in payment transaction list **/
				paymentResult.map(paymentRecords=>{
					orderList.map(orderRecords=>{
						if(paymentRecords.order_ids && paymentRecords.order_ids.length > 0){
							paymentRecords.order_ids.map(orderId=>{
								if(orderId.toString() == orderRecords._id.toString()){
									paymentRecords.unique_order_id = orderRecords.unique_order_id;
								}
							});
						}
					})
				});

				/**Send success response */
				resolve({status: Constants.STATUS_SUCCESS, payment_transaction_list : paymentResult});               
            }catch(err){
                return next(err);
            }
		}).catch(next);
	};// end getPaymentTransactionList()
}
