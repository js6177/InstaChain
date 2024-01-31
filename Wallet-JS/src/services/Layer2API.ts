//import { node } from "webpack"

const ERROR_SUCCESS = 0
const ERROR_UNKNOWN = 1
const ERROR_CANNOT_VERIFY_SIGNATURE = 10
const ERROR_CANNOT_DUPLICATE_TRANSACTION = 11
const ERROR_INSUFFICIENT_FUNDS = 12
const ERROR_TRANSACTION_ID_NOT_FOUND = 13
const ERROR_ONBOARDING_PUBKEY_MISMATCH = 14
const ERROR_CANNOT_CANCEL_WITHDRAWAL_MULTIPLE_TIMES = 15
const ERROR_DEPOSIT_ADDRESS_NOT_FOUND = 16
const ERROR_DUPLICATE_NONCE = 17
const ERROR_COULD_NOT_FIND_WITHDRAWAL_REQUEST = 18
const ERROR_DATABASE_TRANSACTIONAL_ERROR = 19

const DEFAULT_LAYER2_HOSTNAME = 'https://testnet.instachain.io/' //if user has not added any nodes, get the default one

import { GetTransactionsResponse } from './messages/GetTransactionsResponse';

class Layer2LedgerNodeInfo {
    layer2LedgerNodeUrl: string;
    layer2LedgerNodeId: string;
    layer2LedgerAssetId: number;

    constructor(node_url: string, node_id: string, node_asset_id: number) {
        this.layer2LedgerNodeUrl = node_url;
        this.layer2LedgerNodeId = node_id;
        this.layer2LedgerAssetId = node_asset_id;
    }


    fromJSON(data: any){
        ////console.log("Layer2LedgerNodeInfo.fromJSON");
        let body = JSON.parse(JSON.stringify(data, null, 2));
        if(body["error_code"] === 0){
            this.layer2LedgerNodeId  = body["node_info"]["node_id"];
            this.layer2LedgerAssetId  = body["node_info"]["asset_id"];
            ////console.log("Node id: " + this.layer2LedgerNodeId);
        }
    }
}

class Layer2LedgerAPI{
    layer2LedgerNodeHostname: string;

    static getErrorCode(jsonData: any) {
        return jsonData['error_code'];
    }

    static getErrorMessage(jsonData: any) {
        return jsonData['error_message'];
    }

    constructor(layer2LedgerNodeHostname = DEFAULT_LAYER2_HOSTNAME){
        this.layer2LedgerNodeHostname = layer2LedgerNodeHostname;
    }


    getNodeInfo(callback: any){
        let _url = this.layer2LedgerNodeHostname + 'getNodeInfo';
        $.ajax({
            url: _url,
            type: 'get',
            contentType: 'application/x-www-form-urlencoded',
            success: function( data: any, textStatus: any, jQxhr: any ){
                //console.log('getNodeInfo (data): ' + JSON.stringify(data, null, 2));
                ////console.log('getNodeInfo (textStatus): ' + textStatus);
                ////console.log('getNodeInfo (jQxhr): ' + jQxhr);
                callback(data);
            },
            error: function( jqXhr: any, textStatus: any, errorThrown : any){
                ////console.log( errorThrown );
            }   
        });
    }

    getDepositAddress(callback: any, layer2AddressPubKey: string, nonce: string, signature: string){
        let _url = this.layer2LedgerNodeHostname + 'getNewDepositAddress';
        $.ajax({
            url: _url,
            type: 'get',
            contentType: 'application/x-www-form-urlencoded',
            data: {
                'layer2_address_pubkey': layer2AddressPubKey,
                'nonce': nonce,
                'signature': signature
            },
            success: function( data: any, textStatus: any, jQxhr: any ){
                //console.log('getDepositAddress (data): ' + JSON.stringify(data, null, 2));
                ////console.log('getDepositAddress (textStatus): ' + textStatus);
                ////console.log('getDepositAddress (jQxhr): ' + jQxhr);
                callback(data, layer2AddressPubKey, nonce);
            },
            error: function( jqXhr: any, textStatus: any, errorThrown: any ){
                ////console.log( errorThrown );
            }   
        });
    }

    pushTransaction(callback: any, amount: number, fee: number, source_address_public_key: string, destination_address_public_key: string, signature: string, transaction_id: string){
        let _url = this.layer2LedgerNodeHostname + 'pushTransaction';
        $.ajax({
            url: _url,
            type: 'post',
            data: {
                'amount': amount,
                'source_address_public_key': source_address_public_key,
                'destination_address_public_key': destination_address_public_key,
                'signature': signature,
                'transaction_id': transaction_id,
                'fee': fee,
            },
            contentType: 'application/x-www-form-urlencoded',
            success: function( data: any, textStatus: any, jQxhr: any ){
                //console.log('pushTransaction (data): ' + JSON.stringify(data, null, 2));
                ////console.log('pushTransaction (textStatus): ' + textStatus);
                ////console.log('pushTransaction (jQxhr): ' + jQxhr);
                callback(data, transaction_id);
            },
            error: function( jqXhr: any, textStatus: any, errorThrown: any ){
                ////console.log( errorThrown );
            } 
        });
    }


    requestWithdrawal(callback: any, layer2AddressPubKey: string, layer1Address: string, amount: number, transactionId: string, signature: string){
        let _url = this.layer2LedgerNodeHostname + 'withdrawalRequest';
        $.ajax({
            url: _url,
            type: 'post',
            data: {
                'amount': amount,
                'source_address_public_key': layer2AddressPubKey,
                'layer1_withdrawal_address': layer1Address,
                'signature': signature,
                'nonce': transactionId
            },
            contentType: 'application/x-www-form-urlencoded',
            success: function( data: any, textStatus: any, jQxhr: any ){
                //console.log('requestWithdrawal (data): ' + JSON.stringify(data, null, 2));
                ////console.log('requestWithdrawal (textStatus): ' + textStatus);
                ////console.log('requestWithdrawal (jQxhr): ' + jQxhr);
                callback(data, transactionId);
            },
            error: function( jqXhr: any, textStatus: any, errorThrown: any ){
                ////console.log( errorThrown );
            } 
        });
    }

    getBalance(callback: any, layer2AddressPubKeys: string[]){
        ////console.log(layer2AddressPubKeys);
        let _url = this.layer2LedgerNodeHostname + 'getBalance';
        $.ajax({
            url: _url,
            type: 'post',
            data: JSON.stringify( {
                'public_keys': layer2AddressPubKeys,
            }),
            contentType: 'application/json',
            success: function( data: any, textStatus: any, jQxhr: any ){
                //console.log('getBalance (data): ' + JSON.stringify(data, null, 2));
                let returnData = JSON.parse((JSON.stringify(data, null, 2)));
                let error_code = returnData['error_code'];
                callback(data);
                //callback.onGetBalance(data);
            },
            error: function( jqXhr: any, textStatus: any, errorThrown: any ){
                ////console.log('Error: ' + JSON.stringify(jqXhr) );
                ////console.log('Error: ' + textStatus );
                ////console.log('Error: ' + errorThrown );
            } 
        });
    }

    getTransaction(transactionId: string){
        
    }

    
    getTransactions(callback: (response: GetTransactionsResponse) => void, layer2AddressPubKeys: string[]){
        let _url = this.layer2LedgerNodeHostname + 'getAllTransactionsOfPublicKey';
        //console.log('getTransactions (layer2AddressPubKeys): ' + layer2AddressPubKeys);
        //console.log('getTransactions (_url): ' + _url);
        $.ajax({
            url: _url,
            type: 'get',
            data: {
                'public_key': layer2AddressPubKeys[0],
            },
            contentType: 'application/x-www-form-urlencoded',
            success: function( data: any, textStatus: any, jQxhr: any ){
                try {
                    //print data
                    ////console.log('getTransactions (parse data): ' + JSON.parse((JSON.stringify(data, null, 2))));
                    //console.log('getTransactions (data): ' + JSON.stringify(data, null, 2));
                } catch (error) {
                    ////console.log('Error: ' + error);
                }
                let getTransactionsResponse: GetTransactionsResponse = JSON.parse((JSON.stringify(data, null, 2)));
                //console.log('getTransactions (getTransactionsResponse): ' + JSON.stringify(getTransactionsResponse, null, 2));

                let returnData = JSON.parse((JSON.stringify(data, null, 2)));
                let transactions = returnData['transactions'];
                let error_code = returnData['error_code'];
                callback(getTransactionsResponse);

            },
            error: function( jqXhr: any, textStatus: any, errorThrown: any ){
                ////console.log('Error: ' + errorThrown );
            } 
        });
    }

    getLayer1AuditReport(callback: any){
        let _url = this.layer2LedgerNodeHostname + 'getLayer1AuditReport';
        $.ajax({
            url: _url,
            type: 'get',
            contentType: 'application/x-www-form-urlencoded',
            success: function( data: any, textStatus: any, jQxhr: any ){
                ////console.log('getLayer1AuditReport (data): ' + JSON.stringify(data, null, 2));
                ////console.log('getLayer1AuditReport (textStatus): ' + textStatus);
                ////console.log('getLayer1AuditReport (jQxhr): ' + jQxhr);
                callback(data);
            },
            error: function( jqXhr: any, textStatus: any, errorThrown: any ){
                ////console.log( errorThrown );
            }   
        });
    
    }
}

//export default getNodeInfo
export {DEFAULT_LAYER2_HOSTNAME, Layer2LedgerNodeInfo, Layer2LedgerAPI}