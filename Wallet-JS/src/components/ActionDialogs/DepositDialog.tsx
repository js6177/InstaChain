import { useState } from "react";
import { WorkspaceContext } from "../../context/WorkspaceContext";
import React from "react";
import { Alert, Button, Stack, TextField } from "@mui/material";
import { ActionDialogDescriptionDisplay } from "./ActionDialog";

export function DepositDialogBody(props: any){
    const {workspace, workspaceStateManager} = React.useContext(WorkspaceContext);
    const [trxId, setTrxId] = useState('');
    const [transactionState, setTransactionState] = useState('');

    let mainWalletAddressPubkey =  workspace?.wallet?.getMainAddressPubkey() || '';
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