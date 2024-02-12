import { useState } from "react";
import React from "react";
import { Alert, Button, Stack, TextField } from "@mui/material";
import { ActionDialogDescriptionDisplay } from "./ActionDialog";
import { Layer2LedgerContext } from "../../context/Layer2LedgerContext";
import { WorkspaceContext } from "../../context/WorkspaceContext";
import { AvailableBalance } from "../AvailableBalance";
import { validate, getAddressInfo, Network } from 'bitcoin-address-validation';



export function WithdrawalDialogBody(props: any){
    const {layer2LedgerState} = React.useContext(Layer2LedgerContext);
    const [isValidL1Address, setIsValidL1Address] = useState(false);
    const [withdrawalAmount, setWithdrawalAmount] = useState(0);
    const [withdrawalAmountValid, setWithdrawalAmountValid] = useState(false);
    const minimumWithdrawalAmount = layer2LedgerState?.layer2LedgerNodeInfo?.minimumTransactionAmount || 1000;
    const [trxId, setTrxId] = useState('');
    const [transactionState, setTransactionState] = useState('');

    const [layer1WithdrawalDestinatonAddress, setLayer1WithdrawalDestinatonAddress] = useState('');
    const {workspace, workspaceStateManager} = React.useContext(WorkspaceContext);

    const transactionResult = JSON.stringify(workspace?.transactionResults.get(trxId), null, 2);

    const inputWithdrawalDestinationAddressChanged = (event: { target: { value: string; }; }) => {
      const layer1Address = event.target.value;
      const valid = validate(layer1Address, Network.testnet);
      ////console.log("validL1Address: " + valid);
      setIsValidL1Address(valid);
      setLayer1WithdrawalDestinatonAddress(layer1Address);
    };

    const inputWithdrawalDestinationAmountChanged = (event: any) => {
      setWithdrawalAmount(event.target.valueAsNumber);
      setWithdrawalAmountValid((event.target.valueAsNumber >= minimumWithdrawalAmount));
    };

    function withdraw(layer1WithdrawalDestinatonAddress: string, amount: number){
      if(workspaceStateManager !== null){
        const trxId = workspaceStateManager.generateTransactionIdNonce();
        setTrxId(trxId);
        setTransactionState("Withdrawing transaction...");
        workspaceStateManager.requestWithdrawal(trxId, layer1WithdrawalDestinatonAddress, amount);
      }
    }


    const mainWalletAddressPubkey =  workspace?.wallet?.getMainAddressPubkey();
    if(mainWalletAddressPubkey === null || mainWalletAddressPubkey === undefined){
      return <div>Wallet not loaded</div>
    }
    const walletBalance = workspace?.addressBalances.get(mainWalletAddressPubkey) || 0;

    return(
      <Stack spacing={2}  padding={2}>
        <Alert severity="info">This app is in testnet mode - make sure the withdrawal address is a testnet address!</Alert>
        <ActionDialogDescriptionDisplay text={"To withdraw your L2 funds, enter the L1 address to withdraw to and the amount. There are no withdrawal fees, however since the withdrawal is a L1 transactions, the standard L1 network fees apply. You will receive an L1 transaction id when the transaction is broadcasted, which could take up to 6 blocks."}/>

        <TextField fullWidth id="inputWithdrawalFromAddress" value={mainWalletAddressPubkey} label="Withdraw From" variant="outlined" InputLabelProps={{ shrink: true}} inputProps={{ readOnly: true }} />
        <TextField
          fullWidth
          id="inputWithdrawalDestinationAddress"
          label="Withdraw To (Layer1 address)"
          variant="outlined"
          InputLabelProps={{ shrink: true }}
          onChange={inputWithdrawalDestinationAddressChanged}
          error={layer1WithdrawalDestinatonAddress !== '' && !isValidL1Address}
          helperText={
            layer1WithdrawalDestinatonAddress !== '' && !isValidL1Address
              ? "Invalid Layer1 address"
              : ""
          }
        />
        {walletBalance > 0 && <AvailableBalance walletBalance={walletBalance}/>}
        <TextField
          fullWidth
          id="inputWithdrawalAmount"
          label="Amount (in satoshis)"
          type="number"
          variant="outlined"
          value={withdrawalAmount}
          InputLabelProps={{ shrink: true }}
          onChange={inputWithdrawalDestinationAmountChanged}
          error={!withdrawalAmountValid}
          helperText={
            !withdrawalAmountValid &&
            `The withdrawal amount must be greater than ${minimumWithdrawalAmount}`
          }
        />
        <Button
          variant="contained"
          id="buttonRequestWithdrawal"
          disabled={!isValidL1Address || !withdrawalAmountValid}
          onClick={() => withdraw(layer1WithdrawalDestinatonAddress, withdrawalAmount)}
        >
          Withdraw
        </Button>
        {trxId !== '' && <div>Status: {transactionResult}</div>}
      </Stack>
    )
  }