import MyApp from './MainUI';
import React from 'react';
import ReactDOM from 'react-dom/client';
import {Workspace} from './Workspace';

var workSpace = null;

class UiController extends React.Component{
    constructor(props){ 
        super(props);
        console.log("UiController constructor");
        this.state = {
            mainAddressPubkey: "",
            depositAddress: "",
            transferTransactionErrorMessage: "",
            getDepositAddressErrorMessage: "",
            withdrawTransactionErrorMessage: "",
            transactions: [],
            addressBalances: []
        };

        this._callbacksMap = {
            "createWallet": this.createWallet.bind(this),
            "getMainWalletAddress": this.getMainWalletAddress.bind(this),
            "transfer": this.transfer.bind(this),
            "getBalance": this.getBalance.bind(this),
            "getTransactions": this.getTransactions.bind(this),
            "getDepositAddress": this.getDepositAddress.bind(this),
            "requestWithdrawal": this.requestWithdrawal.bind(this)
        }
    }

    componentDidMount() {
        console.log("componentDidMount");
      }
    
      render() {
        return (        
        <div>
            <MyApp WorkspaceState={this.state} transactions={this.state.transactions} callbacksMap={this._callbacksMap}/>
        </div>
        ) 
      }

    createWallet(){
        workSpace = new Workspace();
        workSpace.setUiCallbacks(this.onGetBalance.bind(this), this.onGetTransactions.bind(this), this.onTransferTransactionCompleted.bind(this), this.onGetDepositAddressCompleted.bind(this), this.onWithdrawalTransactionCompleted.bind(this));
        let mneumonic = document.getElementById("textBoxMneumonicValue").value;
        workSpace.newWallet(mneumonic);
        
        this.setState({
            mainAddressPubkey: this.getMainWalletAddress()
        })

        this.getTransactions();
    }

    getMainWalletAddress(){
        if(workSpace){
            return workSpace.wallet.getMainAddressPubkey();
        }
    }
    

    getBalance(){
        if(workSpace){
            workSpace.getBalance();
        }
    }

    getTransactions(){
        this.getBalance();
        if(workSpace){
           workSpace.getTransactions();
        }
    }
    

    transfer(){
        if(workSpace){
            let destinationAddress = document.getElementById("inputTransactionSendToAddress").value;
            let amount = document.getElementById("inputTransactionAmount").value;
    
            if(destinationAddress && amount){
                workSpace.transfer(destinationAddress, amount);

                this.setState({
                    transferTransactionErrorMessage: "Transfering..."
                  })
                
            }
        }
    }

    requestWithdrawal(){
        if(workSpace){
            let destinationAddress = document.getElementById("inputWithdrawalDestinationAddress").value;
            let amount = document.getElementById("inputWithdrawalAmount").value;
            workSpace.requestWithdrawal(destinationAddress, amount);

            this.setState({
                withdrawTransactionErrorMessage: "Withdrawing..."
              })
        }
    }

    getDepositAddress(){
        if(workSpace){
            workSpace.getDepositAddress();
        }
    }
    

    onGetBalance(errorCode, errorMessage, addressBalanceMap){
        console.log("UiController onGetBalance: " + errorMessage);
        this.setState({
            addressBalances: addressBalanceMap
        });
    }

    onGetTransactions(errorCode, errorMessage){
        console.log("UiController onGetTransactions: " + errorMessage);
       let transactions = []
       
        Object.keys(workSpace.transactions).map(function(address){
            workSpace.transactions[address].forEach( (trx) => {transactions.push(trx)} );
        });
        
        this.setState({
            transactions: transactions
        });
    }

    onTransferTransactionCompleted(errorCode, errorMessage){
        console.log("UiController onTransferTransactionCompleted errorCode: " + errorCode);
        console.log("UiController onTransferTransactionCompleted errorMessage: " + errorMessage);

        this.setState({
            transferTransactionErrorMessage: errorMessage
          })
    }

    onGetDepositAddressCompleted(errorCode, errorMessage, layer1DepositAddress){
        this.setState({
            getDepositAddressErrorMessage: errorMessage,
            depositAddress: layer1DepositAddress
          })
    }

    onWithdrawalTransactionCompleted(errorCode, errorMessage){
        this.setState({
            withdrawTransactionErrorMessage: errorMessage
          })
    }
}


export {UiController}