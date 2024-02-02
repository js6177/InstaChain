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

import GetBalanceResponse from './messages/GetBalanceResponse'
import GetDepositAddressResponse from './messages/GetDepositAddressResponse'
import { GetNodeInfoResponse } from './messages/GetNodeInfoResponse'
import { GetTransactionsResponse } from './messages/GetTransactionsResponse';
import TransferTransactionResponse from './messages/TransferTransactionResponse'
import WithdrawalRequestResponse from './messages/WithdrawalRequestResponse'

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

    fromGetNodeInfoResponse(getNodeInfoResponse: GetNodeInfoResponse){
        this.layer2LedgerNodeId = getNodeInfoResponse.node_info.node_id;
        this.layer2LedgerAssetId = getNodeInfoResponse.node_info.asset_id;
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


    getNodeInfo(callback: (response: GetNodeInfoResponse) => void){
        let _url = this.layer2LedgerNodeHostname + 'getNodeInfo';
        $.ajax({
            url: _url,
            type: 'get',
            contentType: 'application/x-www-form-urlencoded',
            success: function( data: any, textStatus: any, jQxhr: any ){
                let nodeInfoResponse: GetNodeInfoResponse = JSON.parse((JSON.stringify(data, null, 2)));
                callback(nodeInfoResponse);
            },
            error: function( jqXhr: any, textStatus: any, errorThrown : any){
                ////console.log( errorThrown );
            }   
        });
    }

    getDepositAddress(callback: (getDepositAddressResponse: GetDepositAddressResponse, layer2AddressPubKey: string, trxID: string) => void, layer2AddressPubKey: string, nonce: string, signature: string){
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
                let getDepositAddressResponse: GetDepositAddressResponse = JSON.parse((JSON.stringify(data, null, 2)));
                callback(getDepositAddressResponse, layer2AddressPubKey, nonce);
            },
            error: function( jqXhr: any, textStatus: any, errorThrown: any ){
                ////console.log( errorThrown );
            }   
        });
    }

    pushTransaction(callback: (transferTransactionResponse: TransferTransactionResponse, trxId: string) => void, amount: number, fee: number, source_address_public_key: string, destination_address_public_key: string, signature: string, transaction_id: string){
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
                let transferTransactionResponse : TransferTransactionResponse = JSON.parse((JSON.stringify(data, null, 2)));
                callback(transferTransactionResponse, transaction_id);
            },
            error: function( jqXhr: any, textStatus: any, errorThrown: any ){
                ////console.log( errorThrown );
            } 
        });
    }


    requestWithdrawal(callback: (withdrawalRequestResponse: WithdrawalRequestResponse, trxId: string) => void, layer2AddressPubKey: string, layer1Address: string, amount: number, transactionId: string, signature: string){
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
                let withdrawalRequestResponse : WithdrawalRequestResponse = JSON.parse((JSON.stringify(data, null, 2)));
                callback(withdrawalRequestResponse, transactionId);
            },
            error: function( jqXhr: any, textStatus: any, errorThrown: any ){
                ////console.log( errorThrown );
            } 
        });
    }

    getBalance(callback: (getBalanceResponse: GetBalanceResponse) => void, layer2AddressPubKeys: string[]){
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
                let getBalanceResponse: GetBalanceResponse = JSON.parse((JSON.stringify(data, null, 2)));
                callback(getBalanceResponse);
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
                let getTransactionsResponse: GetTransactionsResponse = JSON.parse((JSON.stringify(data, null, 2)));
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