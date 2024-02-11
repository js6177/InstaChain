import { useState } from "react";
import { WorkspaceContext } from "../../context/WorkspaceContext";
import React from "react";
import { Alert, Button, Stack, TextField } from "@mui/material";
import { ActionDialogDescriptionDisplay } from "./ActionDialog";

export function TransferDialogBody(props: any){
    const {workspace, workspaceStateManager} = React.useContext(WorkspaceContext);
    const [destinationAddress, setDestinationAddress] = useState('');
    const [amount, setAmount] = useState(0);
    const [trxId, setTrxId] = useState('');
    const [transactionState, setTransactionState] = useState('');
    const mainWalletAddressPubkey =  workspace?.wallet?.getMainAddressPubkey();

    const transactionResult = JSON.stringify(workspace?.transactionResults.get(trxId), null, 2);



  const handleDestinationAddressChange = (event: { target: { value: React.SetStateAction<string>; }; }) => {
    setDestinationAddress(event.target.value);
  };

  const handleAmountChange = (event: any) => {
    setAmount(event.target.value);
  };

  function transfer(destinationAddress: string, amount: number){
    if(workspaceStateManager !== null){
      const trxId = workspaceStateManager.generateTransactionIdNonce();
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