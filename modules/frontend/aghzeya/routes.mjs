import { fileURLToPath } from 'url';
import { dirname } from 'path';
import Aghzeya from "./model/aghzeya.mjs";
import soap from 'soap';
import axios from 'axios';
import https from 'https';
import * as Constants from "./../../../config/global_constant.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const aghzeyaUrl = Constants.AGHZEYA_API_URL;

/**
 * Configure aghzeya routes
 * @param {Object} router - Express router instance
 * @param {Object} options - Configuration options
 * @param {Object} options.db - Database connection instance
 * @param {Function} options.checkLoggedInAdmin - Middleware to check admin authentication
 */
export default function configure(router, { db }) {
    const modulePath    =   '/aghzeya_api/' ;
    const aghzeyaModule =   new Aghzeya(db);
    
    // Set views for all /aghzeya* routes
    router.use(modulePath, (req, res, next) => {
        req.rendering.views = __dirname + "/views";
        next();
    });

    /** Routing used to get restaurant data */
    router.get(modulePath+'get_all_restaurant_data',(req, res,next)=>{
        aghzeyaModule.getAllRestaurantData(req,res,next).then(response=>{
            res.send(response);
        }).catch(next);
    });

    /** Routing used to get restaurant wise sources */
    router.get(modulePath+'get_sources/:restaurant_id',(req, res,next)=>{
        soap.createClient(aghzeyaUrl, (err, client)=>{
            aghzeyaModule.getSources(req,res,next,client).then(response=>{
                res.send(response);
            }).catch(next);
        });
    });

    /** Routing used to get restaurant wise category */
    router.get(modulePath+'get_category/:restaurant_id',(req, res,next)=>{
        soap.createClient(aghzeyaUrl, (err, client)=>{
            aghzeyaModule.getCategory(req,res,next,client).then(response=>{
                res.send(response);
            }).catch(next);
        });
    });

    /** Routing used to get restaurant wise category */
    router.get(modulePath+'get_payment_method/:restaurant_id',(req, res,next)=>{
        soap.createClient(aghzeyaUrl, (err, client)=>{
            aghzeyaModule.getPaymentMethods(req,res,next,client).then(response=>{
                res.send(response);
            }).catch(next);
        });
    });

    /** Routing used to get restaurant wise branch */
    router.get(modulePath+'get_branchs/:restaurant_id',(req, res,next)=>{
        soap.createClient(aghzeyaUrl, (err, client)=>{
            aghzeyaModule.getBranch(req,res,next,client).then(response=>{
                res.send(response);
            }).catch(next);
        });
    });

    /** Routing used to get restaurant wise items */
    router.get(modulePath+'get_items/:restaurant_id',(req, res,next)=>{
        soap.createClient(aghzeyaUrl, (err, client)=>{
            aghzeyaModule.getItems(req,res,next,client).then(response=>{
                res.send(response);
            }).catch(next);
        });
    });

    /** Routing used to get restaurant wise areas */
    router.get(modulePath+'get_restaurant_area/:restaurant_id',(req, res,next)=>{
        soap.createClient(aghzeyaUrl, (err, client)=>{
            aghzeyaModule.getAreas(req,res,next,client).then(response=>{
                res.send(response);
            }).catch(next);
        });
    });

    /** Routing used to place order  */
    router.get([modulePath+'aghzeya_place_order/:order_id', modulePath+'aghzeya_place_order/:order_id/:is_modified'],(req, res,next)=>{
        let wsdlOptions = {
            envelopeKey: 'soapenv',
        };

        soap.createClient(aghzeyaUrl, wsdlOptions, function (err, client) {
            aghzeyaModule.aghzeyaPlaceOrder(req,res,next,client).then(response=>{
                res.send(response);
            }).catch(next);
        });
    });

    /** Routing used to cancel order */
    router.get(modulePath+'aghzeya_cancel_order/:order_id',(req, res,next)=>{
        let wsdlOptions = {
            envelopeKey	: 	'soapenv',
        };

        soap.createClient(aghzeyaUrl, wsdlOptions, function (err, client) {
            aghzeyaModule.aghzeyaCancelOrder(req,res,next,client).then(response=>{
                res.send(response);
            }).catch(next);
        });
    });

    /** Routing used to get aghzeya order status */
    router.get(modulePath+'get_aghzeya_order_status',(req, res,next)=>{
        soap.createClient(aghzeyaUrl, (err, client)=>{
            aghzeyaModule.getAghzeyaOrderStatus(req,res,next,client).then(response=>{
                res.send(response);
            }).catch(next);
        });
    });

    /** Routing used to get areas */
    router.get(modulePath+'get_areas',(req, res,next)=>{
        aghzeyaModule.importAreas(req,res,next).then(response=>{
            res.send(response);
        }).catch(next);
    });

    /** Routing used to get aghzeya cancellation reason */
    router.get(modulePath+'get_aghzeya_cancel_reasons/:restaurant_id',(req, res,next)=>{
        soap.createClient(aghzeyaUrl, (err, client)=>{
            aghzeyaModule.getCancellationReasons(req,res,next,client).then(response=>{
                res.send(response);
            }).catch(next);
        });
    });

    /** Routing used to map cancel reasons */
    router.get(modulePath+'map_cancel_reasons',(req, res,next)=>{
        aghzeyaModule.mapCancelResonswithCravez(req,res,next).then(response=>{
            res.send(response);
        }).catch(next);
    });

    /** Routing used to group list */
    router.get(modulePath+'get_extra_group/:restaurant_id',(req, res,next)=>{
        soap.createClient(aghzeyaUrl, (err, client)=>{
            aghzeyaModule.getAghzeyaGroup(req,res,next,client).then(response=>{
                res.send(response);
            }).catch(next);
        });
    });

    /** Routing used to mapping of group and extra item based on item */
    router.get(modulePath+'get_extra_mapping/:restaurant_id',(req, res,next)=>{
        soap.createClient(aghzeyaUrl, (err, client)=>{
            aghzeyaModule.getAghzeyaExtraItem(req,res,next,client).then(response=>{
                res.send(response);
            }).catch(next);
        });
    });

    /** Routing used to push complain to GFC */
    router.get(modulePath+'push_complaint_to_gfc/:order_id',(req, res,next)=>{
        soap.createClient(aghzeyaUrl, (err, client)=>{
            aghzeyaModule.pushComplaintToGFC(req,res,next,client).then(response=>{
                res.send(response);
            }).catch(next);
        });
    });

    /** Routing used to fetch simphony order status */
    router.get([modulePath+'fetch-simphony-order-status', modulePath+'fetch-simphony-order-status/:days'],(req, res,next)=>{
        aghzeyaModule.fetchSimphonyOrderStatus(req,res,next);
    });

    /** Routing used to fetch dhub order status */
    router.get([modulePath+'fetch-dhub-order-status', modulePath+'fetch-dhub-order-status/:days'],(req, res,next)=>{
        aghzeyaModule.fetchDhubOrderStatus(req,res,next);
    });

    /** Routing used to test GFC APIs */
    router.get(modulePath+'test_soap_api',(req, res,next)=>{
        try {
            let wsdlOptions = {envelopeKey: 'soapenv'};
            soap.createClient(aghzeyaUrl, wsdlOptions, function (err, client) {
                if(err){
                    return res.send({ soap: true, err: String(err) });
                }

                try {
                    /** Call service */
                    client["of_get_rest_category"]({passcode: Constants.AGHZEYA_PASSCODE, resturant_id: 1},(err, response)=>{
                        if(err){
                            return res.send({ client: true, err: String(err)  });
                        }

                        res.send({response : response});
                    });
                }catch(e){
                    res.send({ in_catch : true, err: String(e),   });
                }
            });
        }catch(e){
            res.send({ first_catch : true, err: String(e),  });
        }
    });

    router.get(modulePath+'fetch-simphony-data',(req, res,next)=>{
        try {
            console.log(process.env.SIMPHONY_SERVER_URL)

            axios({
                method: 'GET',
                url: `${process.env.SIMPHONY_SERVER_URL}`,
                headers: {
                    'Content-Type': 'application/json',
                },
                httpsAgent: new https.Agent({ rejectUnauthorized: false }) // equivalent to strictSSL: false
            }).then((body) => {
                res.send({
                    body : body,
                })
            }).catch((error)=>{
                res.send({
                    error : error,
                })
            });
        }catch(e){
            res.send({ first_catch : true, err: String(e),  });
        }
    });
}