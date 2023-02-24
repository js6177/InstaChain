import React from 'react';

import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';

import DialogTitle from '@mui/material/DialogTitle';
import Dialog from '@mui/material/Dialog';
import Alert from '@mui/material/Alert';

import {getUiControllerCallbacks, setUiControllerCallbacks} from '../Callbacks/CallbacksMap'

var MASTER_MNEOMONIC = "throw illness metal parrot wet they short aunt decline come bind gospel energy retreat prize fly";
import {MNEUMONIC_WORD_COUNT, MNEUMONIC_WORDLIST} from '../Mneumonic'
import { Typography } from '@mui/material';

export function ActionDialogDescriptionDisplay(props){
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

export function ActionDialog(props) {
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

    const generateNewWalletMneumonic = () => {
      let mneumonic = "";
      for (let i = 0; i < MNEUMONIC_WORD_COUNT; i++) {
        let index = Math.floor(Math.random() * MNEUMONIC_WORDLIST.length-1);
        mneumonic += MNEUMONIC_WORDLIST[index] + " ";
      }
      mneumonic = mneumonic.trim();
      console.log("New wallet mneumonic: " + mneumonic);
      document.getElementById('textBoxMneumonicValue').value = mneumonic;
    };

    return (
      <Stack spacing={2}>
        <ActionDialogDescriptionDisplay text={"To create a wallet, generate a mneumonic, or enter a saved mneumonic to open an existing wallet."}/>
        <Button  variant="contained" id="generateNewWalletMneumonicButton" onClick={generateNewWalletMneumonic}>Generate Wallet Mneumonic</Button>
        <TextField multiline fullWidth id="textBoxMneumonicValue" label="Mneumonic" variant="outlined" InputLabelProps={{ shrink: true }} defaultValue={MASTER_MNEOMONIC}/>
        <Alert severity="warning">This mneumonic generates your wallet's private keys, so copy it and keep it safe. It is not possible to recover your wallet's private keys if you loose this mneumonic. Do not share with anyone, as anyone with access to this mneumonic can spend your funds.</Alert>

        <Button  variant="contained" id="createNewWallet" onClick={ getUiControllerCallbacks()["createWallet"]}>Create/Open Wallet</Button>
      </Stack>
    );
  }

  export function TransferDialogBody(props){
    const { transferTransactionErrorMessage } = props;
    let mainWalletAddressPubkey =  getUiControllerCallbacks()["getMainWalletAddress"]();
    return (
      <Stack spacing={2}>
        <Alert severity="info">This app is in testnet mode - You are sending testnet Layer2 bitcoins. Testnet bitcoins have no value</Alert>
        <ActionDialogDescriptionDisplay text={"To send funds to another L2 address, enter the destination address and the amount in satoshis. This L2 address is the same as the  'Main Address' field. The transaction should confirm instantly."}/>

        <TextField fullWidth id="inputTransactionSendFromAddress" value={mainWalletAddressPubkey} label="Send From" variant="outlined" InputLabelProps={{ shrink: true, readOnly: true }}/>
        <TextField fullWidth id="inputTransactionSendToAddress" label="Send To" variant="outlined" InputLabelProps={{ shrink: true }}/>
        <TextField fullWidth id="inputTransactionAmount" label="Amount (in satoshis)" variant="outlined" InputLabelProps={{ shrink: true }}/>
        <Button  variant="contained" id="buttonSendTransaction" onClick={ getUiControllerCallbacks()["transfer"]}>Transfer</Button>
        <div>Status: {transferTransactionErrorMessage}</div>
      </Stack>
    )
  }

  export function DepositDialogBody(props){
    const { getDepositAddressErrorMessage, depositAddress } = props;

    let mainWalletAddressPubkey =  getUiControllerCallbacks()["getMainWalletAddress"]();
    return(
      <Stack spacing={2}>
        <Alert severity="info">This app is in testnet mode - make sure to only sent testnet bitcoin to the deposit address!</Alert>
        <ActionDialogDescriptionDisplay text={"To deposit funds to you L2 address, generate a deposit address. This deposit address is a L1 address that will credit your L2 address with any btc received."}/>

        <TextField fullWidth id="inputGetDepositLayer2Address" value={mainWalletAddressPubkey} label="L2 Address" variant="outlined" InputLabelProps={{ shrink: true, readOnly: true }}/>
        <Button  variant="contained" id="buttonGetDepositAddress" onClick={ getUiControllerCallbacks()["getDepositAddress"]}>Get Deposit Address</Button>
        <TextField fullWidth value={depositAddress} label="L1 Deposit Address" variant="outlined" InputLabelProps={{ shrink: true, readOnly: true }}/>

        <div>Status: {getDepositAddressErrorMessage}</div>
      </Stack>
    )
  }

  export function WithdrawalDialogBody(props){
    const { withdrawTransactionErrorMessage } = props;

    let mainWalletAddressPubkey =  getUiControllerCallbacks()["getMainWalletAddress"]();
    return(
      <Stack spacing={2}>
        <Alert severity="info">This app is in testnet mode - make sure the withdrawal address is a testnet address!</Alert>
        <ActionDialogDescriptionDisplay text={"To withdraw your L2 funds, enter the L1 address to withdraw to and the amount. There are no withdrawal fees, however since the withdrawal is a L1 transactions, the standard L1 network fees apply. You will receive an L1 transaction id when the transaction is broadcasted, which could take up to 6 blocks."}/>

        <TextField fullWidth id="inputWithdrawalFromAddress" value={mainWalletAddressPubkey} label="Withdraw From" variant="outlined" InputLabelProps={{ shrink: true, readOnly: true }}/>
        <TextField fullWidth id="inputWithdrawalDestinationAddress" label="Withdraw To (Layer1 address)" variant="outlined" InputLabelProps={{ shrink: true }}/>
        <TextField fullWidth id="inputWithdrawalAmount" label="Amount (in satoshis)" variant="outlined" InputLabelProps={{ shrink: true }}/>
        <Button  variant="contained" id="buttonRequestWithdrawal" onClick={ getUiControllerCallbacks()["requestWithdrawal"]}>Withdraw</Button>
        <div>Status: {withdrawTransactionErrorMessage}</div>
      </Stack>
    )
  }

  export function ViewJsonDialogBody(props){
    const { jsonData } = props;
    console.log("ViewJsonDialogBody JSON: " + JSON.stringify(jsonData, null, 2))
    return (
      <Stack spacing={2}>
        <Box component="div" sx={{ whiteSpace: 'normal' }}>
          {JSON.stringify(jsonData, null, 2)}
        </Box>
      </Stack>
    )

  }