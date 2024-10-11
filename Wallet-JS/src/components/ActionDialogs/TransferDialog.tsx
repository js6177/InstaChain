import { useEffect, useState } from "react";
import { WorkspaceContext } from "../../context/WorkspaceContext";
import React from "react";
import { Alert, Button, Stack, TextField } from "@mui/material";
import { ActionDialogDescriptionDisplay } from "./ActionDialog";
import { AvailableBalance } from "../AvailableBalance";
import SearchBox from "../SearchTextBox";
import { standardizeProfileUrl } from "../../utils/OAuthHelperUtils";
import { OAuthUserAuxillaryInfo } from "../../services/messages/Layer2OAuthManager/Common/OAuthUserAuxillaryInfo";

export function TransferDialogBody(props: any){
    const {workspace, workspaceStateManager} = React.useContext(WorkspaceContext);
    const [destinationAddress, setDestinationAddress] = useState('');
    const [foundOAuthUserIsPlaceholder, setFoundOAuthUserIsPlaceholder] = useState(false);
    const [amount, setAmount] = useState(0);
    const [trxId, setTrxId] = useState('');
    const [transactionState, setTransactionState] = useState('');
    const [findOAuthUserProfileQuery, setFindOAuthUserProfileQuery] = useState('');
    const mainWalletAddressPubkey =  workspace?.walletManager.getMainWalletAddressPubkey();
    if(mainWalletAddressPubkey === null || mainWalletAddressPubkey === undefined){
      return <div>Wallet not loaded</div>
    }
    const walletBalance = workspace?.addressBalances.get(mainWalletAddressPubkey) || 0;


    const transactionResult = JSON.stringify(workspace?.transactionResults.get(trxId), null, 2);


    useEffect(() => {
      if(findOAuthUserProfileQuery){
        const foundOAuthUser = workspace?.foundOAuthUsers.get(findOAuthUserProfileQuery);
        if(foundOAuthUser){
          setFoundOAuthUserIsPlaceholder(foundOAuthUser.placeholder_user);
          setDestinationAddress(foundOAuthUser.layer2_address_pubkey);
        }
      }
    }, [workspace])

  const handleDestinationAddressChange = (event: { target: { value: React.SetStateAction<string>; }; }) => {
    setDestinationAddress(event.target.value);
  };

  const handleAmountChange = (event: any) => {
    setAmount(event.target.value);
  };

  const handleSearchBoxQueryEntered = (searchQuery: string) => {
    searchQuery = standardizeProfileUrl(searchQuery);
    setFindOAuthUserProfileQuery(searchQuery);
    workspaceStateManager?.findOAuthUser(searchQuery);
  }

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
      <SearchBox placeholder="Enter a profile url to get their Layer2 address" onSearch={handleSearchBoxQueryEntered}></SearchBox>
      {foundOAuthUserIsPlaceholder && <Alert severity="warning">This user has not logged in with OAuth yet. You can still send funds to this address; they will have access to the funds once they login with OAuth.</Alert>}
      <TextField fullWidth id="inputTransactionSendToAddress" value={destinationAddress} label="Send To" variant="outlined" InputLabelProps={{ shrink: true }} onChange={handleDestinationAddressChange} />
      {walletBalance > 0 && <AvailableBalance walletBalance={walletBalance}/>}
      <Stack spacing={2} padding={2} direction="row">
        <TextField fullWidth id="inputTransactionAmount" value={amount} label="Amount (in satoshis)" variant="outlined" InputLabelProps={{ shrink: true }} onChange={handleAmountChange} />
        <Button variant="contained" id="buttonMaxAmount" onClick={() => setAmount(walletBalance)}>Max</Button>
      </Stack>
      <Button  variant="contained" id="buttonSendTransaction" onClick={() => transfer(destinationAddress, amount) }>Transfer</Button>
      {trxId !== '' && <div>Status: {transactionResult}</div>}
    </Stack>
  )
}