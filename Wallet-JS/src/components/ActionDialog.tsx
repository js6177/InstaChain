import React from 'react';
import {useState} from 'react';

import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import DialogTitle from '@mui/material/DialogTitle';
import Dialog from '@mui/material/Dialog';
import Alert from '@mui/material/Alert';

const { validate, getAddressInfo } = require('bitcoin-address-validation');

import { WorkspaceContext } from '../context/WorkspaceContext';

var MASTER_MNEOMONIC = "throw illness metal parrot wet they short aunt decline come bind gospel energy retreat prize fly";
import {MNEUMONIC_WORD_COUNT, MNEUMONIC_WORDLIST} from '../utils/Mneumonic';
import { Typography } from '@mui/material';

export function ActionDialogDescriptionDisplay(props: {text: string}){
  const { text } = props;
  return(
    <div>
      <Box component="div" sx={{ whiteSpace: 'normal' }}>
        <Paper elevation={6} />
            <Typography>
              {text}
            </Typography>
        <Paper/>
      </Box>
    </div>
  )
}

export function ActionDialog(props: any){
    const { onClose, dialogErrorCode, isOpen } = props;
  
    const handleClose = () => {
      onClose(dialogErrorCode);
    };
  
    return (
      <Dialog onClose={handleClose} open={isOpen}>
        <DialogTitle>{props.dialogTitle}</DialogTitle>
        <div>{props.dialogBody}</div>
      </Dialog>
    );
  }



  export function CreateOpenWalletDialogBody() {

    const [textInputMneumonic, setTextInputMneumonic] = useState('');
    const {workspaceStateManager} = React.useContext(WorkspaceContext);

      const inputMneumonicChanged = (event: { target: { value: React.SetStateAction<string>; }; }) => {
        setTextInputMneumonic(event.target.value);
        // //console.log('textInputMneumonic: ' +  event.target.value)
      };

      const generateNewWalletMneumonic = () => {
        let mneumonic = "";
        for (let i = 0; i < MNEUMONIC_WORD_COUNT; i++) {
          let index = Math.floor(Math.random() * MNEUMONIC_WORDLIST.length-1);
          mneumonic += MNEUMONIC_WORDLIST[index] + " ";
        }
        mneumonic = mneumonic.trim();
        // //console.log("New wallet mneumonic: " + mneumonic);
        setTextInputMneumonic(mneumonic);
        //document.getElementById('textBoxMneumonicValue').value = mneumonic;
      };

      return (
        <Stack spacing={2} padding={2}>
          <ActionDialogDescriptionDisplay text={"To create a wallet, generate a mneumonic, or enter a saved mneumonic to open an existing wallet."}/>
          <Button  variant="contained" id="generateNewWalletMneumonicButton" onClick={generateNewWalletMneumonic}>Generate Wallet Mneumonic</Button>
          <TextField multiline fullWidth id="textBoxMneumonicValue" label="L2 Mneumonic" variant="outlined" InputLabelProps={{ shrink: true }} value = {textInputMneumonic} onChange={inputMneumonicChanged}/>
          <Alert severity="warning">This mneumonic generates your wallet's private keys, so copy it and keep it safe. It is not possible to recover your wallet's private keys if you loose this mneumonic. Do not share with anyone, as anyone with access to this mneumonic can spend your funds.</Alert>

          <Button variant="contained" id="createNewWallet" disabled={!textInputMneumonic} onClick={() => workspaceStateManager?.newWallet(textInputMneumonic)}>Create/Open Wallet</Button>
        </Stack>
      );
    }

    export function TransferDialogBody(props: any){
      const {workspace, workspaceStateManager} = React.useContext(WorkspaceContext);
      const [destinationAddress, setDestinationAddress] = useState('');
      const [amount, setAmount] = useState(0);
      const [trxId, setTrxId] = useState('');
      const [transactionState, setTransactionState] = useState('');
      let mainWalletAddressPubkey =  workspace?.wallet?.getMainAddressPubkey();
      // //console.log("TransferDialogBody workSpace: " + JSON.stringify(workSpace));
      // //console.log("TransferDialogBody workspaceStateManager: " + JSON.stringify(workspaceStateManager));
      let transactionResult = JSON.stringify(workspace?.transactionResults.get(trxId), null, 2);
      // //console.log("TransferDialogBody trxId: " + trxId);
      // //console.log("TransferDialogBody workSpace.transactionResults: " + JSON.stringify(workSpace.transactionResults));

    ////console.log("TransferDialogBody transactionResult: " + transactionResult);


    const handleDestinationAddressChange = (event: { target: { value: React.SetStateAction<string>; }; }) => {
      setDestinationAddress(event.target.value);
    };

    const handleAmountChange = (event: any) => {
      setAmount(event.target.value);
    };

    function transfer(destinationAddress: string, amount: number){
      if(workspaceStateManager !== null){
        let trxId = workspaceStateManager.generateTransactionIdNonce();
        setTrxId(trxId);
        setTransactionState("Sending transaction...");
        workspaceStateManager.transfer(trxId, destinationAddress, amount);
      }
    }

    return (
      <Stack spacing={2} padding={2}>
        <Alert severity="info">This app is in testnet mode - You are sending testnet Layer2 bitcoins. Testnet bitcoins have no value</Alert>
        <ActionDialogDescriptionDisplay text={"To send funds to another L2 address, enter the destination address and the amount in satoshis. This L2 address is the same as the  'Main Address' field. The transaction should confirm instantly."}/>

        <TextField fullWidth id="inputTransactionSendFromAddress" value={mainWalletAddressPubkey} label="Send From" variant="outlined" InputLabelProps={{ shrink: true }} inputProps={{ readOnly: true }}/>
        <TextField fullWidth id="inputTransactionSendToAddress" value={destinationAddress} label="Send To" variant="outlined" InputLabelProps={{ shrink: true }} onChange={handleDestinationAddressChange} />
        <TextField fullWidth id="inputTransactionAmount" value={amount} label="Amount (in satoshis)" variant="outlined" InputLabelProps={{ shrink: true }} onChange={handleAmountChange} />
        <Button  variant="contained" id="buttonSendTransaction" onClick={() => transfer(destinationAddress, amount) }>Transfer</Button>
        {trxId !== '' && <div>Status: {transactionResult}</div>}
      </Stack>
    )
  }

  export function DepositDialogBody(props: any){
    const {workspace, workspaceStateManager} = React.useContext(WorkspaceContext);
    const [trxId, setTrxId] = useState('');
    const [transactionState, setTransactionState] = useState('');

    let mainWalletAddressPubkey =  workspace?.wallet?.getMainAddressPubkey();
    let layer1DepositAddress = workspace?.depositAddresses.get(mainWalletAddressPubkey);
    let transactionResult = JSON.stringify(workspace?.transactionResults.get(trxId), null, 2);

    function getDepositAddress(){
      if(workspaceStateManager !== null){
        let trxId = workspaceStateManager.generateTransactionIdNonce();
        setTrxId(trxId);
        setTransactionState("Getting deposit address...");
        workspaceStateManager.getDepositAddress(trxId);
      }
    }

    return(
      <Stack spacing={2}  padding={2}>
        <Alert severity="info">This app is in testnet mode - make sure to only sent testnet bitcoin to the deposit address!</Alert>
        <ActionDialogDescriptionDisplay text={"To deposit funds to you L2 address, generate a deposit address. This deposit address is a L1 address that will credit your L2 address with any btc received."}/>

        <TextField fullWidth id="inputGetDepositLayer2Address" value={mainWalletAddressPubkey} label="L2 Address" variant="outlined" InputLabelProps={{ shrink: true }} inputProps={{ readOnly: true }}/>
        <Button  variant="contained" id="buttonGetDepositAddress" onClick={() => getDepositAddress()}>Get Deposit Address</Button>
        <TextField fullWidth value={layer1DepositAddress} label="L1 Deposit Address" variant="outlined" InputLabelProps={{ shrink: true}} inputProps={{ readOnly: true }}/>

        {trxId !== '' && <div>Status: {transactionResult}</div>}
      </Stack>
    )
  }

  export function WithdrawalDialogBody(props: any){
    const [isValidL1Address, setIsValidL1Address] = useState(false);
    const [withdrawalAmount, setWithdrawalAmount] = useState(0);
    const [trxId, setTrxId] = useState('');
    const [transactionState, setTransactionState] = useState('');

    const [layer1WithdrawalDestinatonAddress, setLayer1WithdrawalDestinatonAddress] = useState('');
    const {workspace, workspaceStateManager} = React.useContext(WorkspaceContext);

    let transactionResult = JSON.stringify(workspace?.transactionResults.get(trxId), null, 2);

    const inputWithdrawalDestinationAddressChanged = (event: { target: { value: any; }; }) => {
      let layer1Address = event.target.value;
      var valid = validate(layer1Address, 'testnet');
      ////console.log("validL1Address: " + valid);
      setIsValidL1Address(valid);
      setLayer1WithdrawalDestinatonAddress(layer1Address);
    };

    const inputWithdrawalDestinationAmountChanged = (event: any) => {
      setWithdrawalAmount(event.target.valueAsNumber);
    };

    function withdraw(layer1WithdrawalDestinatonAddress: string, amount: number){
      if(workspaceStateManager !== null){
        let trxId = workspaceStateManager.generateTransactionIdNonce();
        setTrxId(trxId);
        setTransactionState("Withdrawing transaction...");
        workspaceStateManager.requestWithdrawal(trxId, layer1WithdrawalDestinatonAddress, amount);
      }
    }


    let mainWalletAddressPubkey =  workspace?.wallet?.getMainAddressPubkey();

    return(
      <Stack spacing={2}  padding={2}>
        <Alert severity="info">This app is in testnet mode - make sure the withdrawal address is a testnet address!</Alert>
        <ActionDialogDescriptionDisplay text={"To withdraw your L2 funds, enter the L1 address to withdraw to and the amount. There are no withdrawal fees, however since the withdrawal is a L1 transactions, the standard L1 network fees apply. You will receive an L1 transaction id when the transaction is broadcasted, which could take up to 6 blocks."}/>

        <TextField fullWidth id="inputWithdrawalFromAddress" value={mainWalletAddressPubkey} label="Withdraw From" variant="outlined" InputLabelProps={{ shrink: true}} inputProps={{ readOnly: true }} />
        <TextField fullWidth id="inputWithdrawalDestinationAddress" label="Withdraw To (Layer1 address)" variant="outlined" InputLabelProps={{ shrink: true }} onChange={inputWithdrawalDestinationAddressChanged}/>
        <TextField fullWidth id="inputWithdrawalAmount" label="Amount (in satoshis)" type="number" variant="outlined" value={withdrawalAmount} InputLabelProps={{ shrink: true }} onChange={inputWithdrawalDestinationAmountChanged}/>
        <Button  variant="contained" id="buttonRequestWithdrawal" disabled={!isValidL1Address || !(withdrawalAmount>0)} onClick={ () => withdraw(layer1WithdrawalDestinatonAddress, withdrawalAmount)}>Withdraw</Button>
        {trxId !== '' && <div>Status: {transactionResult}</div>}
      </Stack>
    )
  }

  export function ViewJsonDialogBody(props: any){
    const { jsonData } = props;
    ////console.log("ViewJsonDialogBody JSON: " + JSON.stringify(jsonData, null, 2))
    return (
      <Stack spacing={2}>
        <Box component="div" sx={{ whiteSpace: 'normal' }}>
          {JSON.stringify(jsonData, null, 2)}
        </Box>
      </Stack>
    )

  }