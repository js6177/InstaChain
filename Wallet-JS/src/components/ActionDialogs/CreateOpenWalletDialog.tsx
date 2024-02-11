import { useState } from "react";
import { WorkspaceContext } from "../../context/WorkspaceContext";
import React from "react";
import { Alert, Button, Stack, TextField } from "@mui/material";
import { ActionDialogDescriptionDisplay } from "./ActionDialog";

var MASTER_MNEOMONIC = "throw illness metal parrot wet they short aunt decline come bind gospel energy retreat prize fly";
import {MNEUMONIC_WORD_COUNT, MNEUMONIC_WORDLIST} from '../../utils/Mneumonic';

export function CreateOpenWalletDialogBody() {

    const [textInputMneumonic, setTextInputMneumonic] = useState('');
    const {workspaceStateManager} = React.useContext(WorkspaceContext);

      const inputMneumonicChanged = (event: { target: { value: React.SetStateAction<string>; }; }) => {
        setTextInputMneumonic(event.target.value);
      };

      const generateNewWalletMneumonic = () => {
        let mneumonic = "";
        for (let i = 0; i < MNEUMONIC_WORD_COUNT; i++) {
          let index = Math.floor(Math.random() * MNEUMONIC_WORDLIST.length-1);
          mneumonic += MNEUMONIC_WORDLIST[index] + " ";
        }
        mneumonic = mneumonic.trim();
        setTextInputMneumonic(mneumonic);
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