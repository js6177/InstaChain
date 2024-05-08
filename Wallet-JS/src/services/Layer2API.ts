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

import GetBalanceRequest from './messages/Requests/GetBalanceRequest'
import GetDepositAddressRequest from './messages/Requests/GetDepositAddressRequest'
import GetTransactionRequest from './messages/Requests/GetTransactionRequest'
import GetTransactionsRequest from './messages/Requests/GetTransactionsRequest'
import PushTransactionRequest from './messages/Requests/PushTransactionRequest'
import RequestWithdrawalRequest from './messages/Requests/RequestWithdrawalRequest'
import { GetBalanceResponse } from './messages/Responses/GetBalanceResponse'
import GetDepositAddressResponse from './messages/Responses/GetDepositAddressResponse'
import { GetNodeInfoResponse } from './messages/Responses/GetNodeInfoResponse'
import GetTransactionResponse from './messages/Responses/GetTransactionResponse'
import { GetTransactionsResponse } from './messages/Responses/GetTransactionsResponse';
import { Layer1AuditReportResponse } from './messages/Responses/Layer1AuditReportResponse'
import TransferTransactionResponse from './messages/Responses/TransferTransactionResponse'
import WithdrawalRequestResponse from './messages/Responses/WithdrawalRequestResponse'

class Layer2LedgerNodeInfo {
    layer2LedgerNodeUrl: string;
    layer2LedgerNodeId: string;
    layer2LedgerAssetId: number;
    minimumTransactionAmount: number = 1000;

    constructor(node_url: string, node_id: string, node_asset_id: number) {
        this.layer2LedgerNodeUrl = node_url;
        this.layer2LedgerNodeId = node_id;
        this.layer2LedgerAssetId = node_asset_id;
    }

    fromGetNodeInfoResponse(getNodeInfoResponse: GetNodeInfoResponse){
        this.layer2LedgerNodeId = getNodeInfoResponse.node_info.node_id;
        this.layer2LedgerAssetId = getNodeInfoResponse.node_info.asset_id;
        this.minimumTransactionAmount = getNodeInfoResponse.node_info.layer1_network_info.minimum_transaction_amount;
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
        const _url = this.layer2LedgerNodeHostname + 'getNodeInfo';
        $.ajax({
            url: _url,
            type: 'get',
            contentType: 'application/x-www-form-urlencoded',
            success: function( data: any, textStatus: any, jQxhr: any ){
                const nodeInfoResponse: GetNodeInfoResponse = JSON.parse((JSON.stringify(data, null, 2)));
                callback(nodeInfoResponse);
            },
            error: function( jqXhr: any, textStatus: any, errorThrown : any){
                ////console.log( errorThrown );
            }   
        });
    }

    getDepositAddress(callback: (getDepositAddressResponse: GetDepositAddressResponse, layer2AddressPubKey: string, trxID: string) => void, getDepositAddressRequest: GetDepositAddressRequest){
        const _url = this.layer2LedgerNodeHostname + 'getNewDepositAddress';
        $.ajax({
            url: _url,
            type: 'get',
            contentType: 'application/x-www-form-urlencoded',
            data: getDepositAddressRequest,
            success: function( data: any, textStatus: any, jQxhr: any ){
                const getDepositAddressResponse: GetDepositAddressResponse = JSON.parse((JSON.stringify(data, null, 2)));
                callback(getDepositAddressResponse, getDepositAddressRequest.layer2_address_pubkey, getDepositAddressRequest.nonce);
            },
            error: function( jqXhr: any, textStatus: any, errorThrown: any ){
                ////console.log( errorThrown );
            }   
        });
    }

    pushTransaction(callback: (transferTransactionResponse: TransferTransactionResponse, trxId: string) => void, pushTransactionRequest: PushTransactionRequest){
        const _url = this.layer2LedgerNodeHostname + 'pushTransaction';
        $.ajax({
            url: _url,
            type: 'post',
            data: pushTransactionRequest,
            contentType: 'application/x-www-form-urlencoded',
            success: function( data: any, textStatus: any, jQxhr: any ){
                //console.log('pushTransaction (data): ' + JSON.stringify(data, null, 2));
                ////console.log('pushTransaction (textStatus): ' + textStatus);
                ////console.log('pushTransaction (jQxhr): ' + jQxhr);
                const transferTransactionResponse : TransferTransactionResponse = JSON.parse((JSON.stringify(data, null, 2)));
                callback(transferTransactionResponse, pushTransactionRequest.transaction_id);
            },
            error: function( jqXhr: any, textStatus: any, errorThrown: any ){
                ////console.log( errorThrown );
            } 
        });
    }


    requestWithdrawal(callback: (withdrawalRequestResponse: WithdrawalRequestResponse, trxId: string) => void, requestWithdrawalRequest: RequestWithdrawalRequest){
        const _url = this.layer2LedgerNodeHostname + 'withdrawalRequest';
        $.ajax({
            url: _url,
            type: 'post',
            data: requestWithdrawalRequest,
            contentType: 'application/x-www-form-urlencoded',
            success: function( data: any, textStatus: any, jQxhr: any ){
                //console.log('requestWithdrawal (data): ' + JSON.stringify(data, null, 2));
                ////console.log('requestWithdrawal (textStatus): ' + textStatus);
                ////console.log('requestWithdrawal (jQxhr): ' + jQxhr);
                const withdrawalRequestResponse : WithdrawalRequestResponse = JSON.parse((JSON.stringify(data, null, 2)));
                callback(withdrawalRequestResponse, requestWithdrawalRequest.nonce);
            },
            error: function( jqXhr: any, textStatus: any, errorThrown: any ){
                ////console.log( errorThrown );
            } 
        });
    }

    getBalance(callback: (getBalanceResponse: GetBalanceResponse, ownAddress: boolean) => void, getBalanceRequest: GetBalanceRequest, ownAddress: boolean = true){
        ////console.log(layer2AddressPubKeys);
        const _url = this.layer2LedgerNodeHostname + 'getBalance';
        $.ajax({
            url: _url,
            type: 'post',
            data: JSON.stringify(getBalanceRequest),
            contentType: 'application/json',
            success: function( data: any, textStatus: any, jQxhr: any ){
                const getBalanceResponse: GetBalanceResponse = JSON.parse((JSON.stringify(data, null, 2)));
                callback(getBalanceResponse, ownAddress);
            },
            error: function( jqXhr: any, textStatus: any, errorThrown: any ){
                ////console.log('Error: ' + JSON.stringify(jqXhr) );
                ////console.log('Error: ' + textStatus );
                ////console.log('Error: ' + errorThrown );
            } 
        });
    }

    getTransaction(callback: (response: GetTransactionResponse) => void, getTransactionRequest: GetTransactionRequest){
        const _url = this.layer2LedgerNodeHostname + 'getTransaction';
        $.ajax({
            url: _url,
            type: 'get',
            data: getTransactionRequest,
            contentType: 'application/x-www-form-urlencoded',
            success: function( data: any, textStatus: any, jQxhr: any ){
                ////console.log('getTransaction (data): ' + JSON.stringify(data, null, 2));
                ////console.log('getTransaction (textStatus): ' + textStatus);
                ////console.log('getTransaction (jQxhr): ' + jQxhr);
                const getTransactionResponse: GetTransactionResponse = JSON.parse((JSON.stringify(data, null, 2)));
                callback(getTransactionResponse);
            },
            error: function( jqXhr: any, textStatus: any, errorThrown: any ){
                ////console.log( errorThrown );

                console.log('Error: ' + errorThrown );
                
            } 
        });
    }

    
    getTransactions(callback: (response: GetTransactionsResponse, ownAddress: boolean) => void, getTransactionsRequest: GetTransactionsRequest, ownAddress: boolean = true){
        const _url = this.layer2LedgerNodeHostname + 'getAllTransactionsOfPublicKey';
        //console.log('getTransactions (layer2AddressPubKeys): ' + layer2AddressPubKeys);
        //console.log('getTransactions (_url): ' + _url);
        $.ajax({
            url: _url,
            type: 'post',
            data: JSON.stringify(getTransactionsRequest),
            contentType: 'application/json',
            success: function( data: any, textStatus: any, jQxhr: any ){
                const getTransactionsResponse: GetTransactionsResponse = JSON.parse((JSON.stringify(data, null, 2)));
                callback(getTransactionsResponse, ownAddress);

            },
            error: function( jqXhr: any, textStatus: any, errorThrown: any ){
                ////console.log('Error: ' + errorThrown );
            } 
        });
    }

    getLayer1AuditReport(callback: (response: Layer1AuditReportResponse) => void){
        const _url = this.layer2LedgerNodeHostname + 'getLayer1AuditReport';
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