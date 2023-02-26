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

class Layer2LedgerNodeInfo{
    constructor(node_url, node_id, node_asset_id){
        this.layer2LedgerNodeUrl = node_url;
        this.layer2LedgerNodeId = node_id;
        this.layer2LedgerAssetId = node_asset_id;
    }

    fromJSON(data){
        console.log("Layer2LedgerNodeInfo.fromJSON");
        let body = JSON.parse(JSON.stringify(data, null, 2));
        if(body["error_code"] === 0){
            this.layer2LedgerNodeId  = body["node_info"]["node_id"];
            this.layer2LedgerAssetId  = body["node_info"]["asset_id"];
            console.log("Node id: " + this.layer2LedgerNodeId);
        }
    }
}

class Layer2LedgerAPI{

    static getErrorCode(jsonData) {
        return jsonData['error_code'];
    }

    static getErrorMessage(jsonData) {
        return jsonData['error_message'];
    }

    constructor(layer2LedgerNodeHostname = DEFAULT_LAYER2_HOSTNAME, workspace = null){
        this.layer2LedgerNodeHostname = layer2LedgerNodeHostname;
        this.workspace = workspace;
    }


    getNodeInfo(workspace){
        let _url = this.layer2LedgerNodeHostname + 'getNodeInfo';
        $.ajax({
            url: _url,
            type: 'get',
            contentType: 'application/x-www-form-urlencoded',
            success: function( data, textStatus, jQxhr ){
                console.log('getNodeInfo (data): ' + JSON.stringify(data, null, 2));
                console.log('getNodeInfo (textStatus): ' + textStatus);
                console.log('getNodeInfo (jQxhr): ' + jQxhr);
                workspace.onGetNodeInfo(data);
            },
            error: function( jqXhr, textStatus, errorThrown ){
                console.log( errorThrown );
            }   
        });
    }

    getDepositAddress(callback, layer2AddressPubKey, nonce, signature){
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
            success: function( data, textStatus, jQxhr ){
                console.log('getDepositAddress (data): ' + JSON.stringify(data, null, 2));
                console.log('getDepositAddress (textStatus): ' + textStatus);
                console.log('getDepositAddress (jQxhr): ' + jQxhr);
                callback(data);
            },
            error: function( jqXhr, textStatus, errorThrown ){
                console.log( errorThrown );
            }   
        });
    }

    pushTransaction(callback, amount, fee, source_address_public_key, destination_address_public_key, signature, transaction_id){
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
            success: function( data, textStatus, jQxhr ){
                console.log('pushTransaction (data): ' + JSON.stringify(data, null, 2));
                console.log('pushTransaction (textStatus): ' + textStatus);
                console.log('pushTransaction (jQxhr): ' + jQxhr);
                callback(data);
            },
            error: function( jqXhr, textStatus, errorThrown ){
                console.log( errorThrown );
            } 
        });
    }


    requestWithdrawal(callback, layer2AddressPubKey, layer1Address, amount, transactionId, signature){
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
            success: function( data, textStatus, jQxhr ){
                console.log('requestWithdrawal (data): ' + JSON.stringify(data, null, 2));
                console.log('requestWithdrawal (textStatus): ' + textStatus);
                console.log('requestWithdrawal (jQxhr): ' + jQxhr);
                callback(data);
            },
            error: function( jqXhr, textStatus, errorThrown ){
                console.log( errorThrown );
            } 
        });
    }

    getBalance(callback, layer2AddressPubKeys){
        console.log(layer2AddressPubKeys);
        let _url = this.layer2LedgerNodeHostname + 'getBalance';
        $.ajax({
            url: _url,
            type: 'post',
            data: JSON.stringify( {
                'public_keys': layer2AddressPubKeys,
            }),
            contentType: 'application/json',
            success: function( data, textStatus, jQxhr ){
                console.log('getBalance (data): ' + JSON.stringify(data, null, 2));
                console.log('getBalance (textStatus): ' + textStatus);
                console.log('getBalance (jQxhr): ' + jQxhr);
                let returnData = JSON.parse((JSON.stringify(data, null, 2)));
                let error_code = returnData['error_code'];
                console.log('error_code: ' + error_code);
                callback(data);
                //callback.onGetBalance(data);
            },
            error: function( jqXhr, textStatus, errorThrown ){
                console.log('Error: ' + JSON.stringify(jqXhr) );
                console.log('Error: ' + textStatus );
                console.log('Error: ' + errorThrown );
            } 
        });
    }

    getTransaction(transactionId){
        
    }

    
    getTransactions(callback, layer2AddressPubKeys){
        let _url = this.layer2LedgerNodeHostname + 'getAllTransactionsOfPublicKey';
        $.ajax({
            url: _url,
            type: 'get',
            data: {
                'public_key': layer2AddressPubKeys[0],
            },
            contentType: 'application/x-www-form-urlencoded',
            success: function( data, textStatus, jQxhr ){
                console.log('pushTransaction (data): ' + JSON.stringify(data, null, 2));
                console.log('pushTransaction (textStatus): ' + textStatus);
                console.log('pushTransaction (jQxhr): ' + jQxhr);
                let returnData = JSON.parse((JSON.stringify(data, null, 2)));
                let transactions = returnData['transactions'];
                let error_code = returnData['error_code'];
                console.log('transactions: ' + transactions)
                console.log('error_code: ' + error_code);
                callback.onGetTransactions(data);
            },
            error: function( jqXhr, textStatus, errorThrown ){
                console.log('Error: ' + errorThrown );
            } 
        });
    }
}

//export default getNodeInfo
export {DEFAULT_LAYER2_HOSTNAME, Layer2LedgerNodeInfo, Layer2LedgerAPI}