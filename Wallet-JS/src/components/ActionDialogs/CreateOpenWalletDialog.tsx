import { useState } from "react";
import { WorkspaceContext } from "../../context/WorkspaceContext";
import React from "react";
import { Alert, Button, FormControlLabel, Stack, TextField } from "@mui/material";
import { ActionDialogDescriptionDisplay } from "./ActionDialog";

import {MNEUMONIC_WORD_COUNT, MNEUMONIC_WORDLIST} from '../../utils/Mneumonic';
import Checkbox from '@mui/material/Checkbox';

export function CreateOpenWalletDialogBody() {

    const [textInputMneumonic, setTextInputMneumonic] = useState('');
    const [saveMneumonic, setSaveMneumonic] = useState(false);
    const {workspaceStateManager} = React.useContext(WorkspaceContext);

    React.useEffect(() => {
      const mneumonic = getMneumonicFromLocalStorage();
      if(mneumonic){
        setSaveMneumonic(true);
        setTextInputMneumonic(mneumonic);
      }
    }, []);

    const inputMneumonicChanged = (event: { target: { value: React.SetStateAction<string>; }; }) => {
      setTextInputMneumonic(event.target.value);
    };

    const generateNewWalletMneumonic = () => {
      let mneumonic = "";
      for (let i = 0; i < MNEUMONIC_WORD_COUNT; i++) {
        const index = Math.floor(Math.random() * MNEUMONIC_WORDLIST.length-1);
        mneumonic += MNEUMONIC_WORDLIST[index] + " ";
      }
      mneumonic = mneumonic.trim();
      setTextInputMneumonic(mneumonic);
    };

    const saveMneumonicToLocalStorage = (mneumonic: string) => {
      localStorage.setItem("mneumonic", mneumonic);
    }

    const getMneumonicFromLocalStorage = () => {
      return localStorage.getItem("mneumonic");
    }

    const handleSaveMneumonicCheckboxChange = (event: { target: { checked: React.SetStateAction<boolean>; }; }) => {
      setSaveMneumonic(event.target.checked);
    };

    const createNewWalletClicked = () => {
      if(saveMneumonic){
        saveMneumonicToLocalStorage(textInputMneumonic);
      }
      workspaceStateManager?.newWallet(textInputMneumonic)
    }

    return (
      <Stack spacing={2} padding={2}>
        <ActionDialogDescriptionDisplay text={"To create a wallet, generate a mneumonic, or enter a saved mneumonic to open an existing wallet."}/>
        <Button  variant="contained" id="generateNewWalletMneumonicButton" onClick={generateNewWalletMneumonic}>Generate Wallet Mneumonic</Button>
        <TextField multiline fullWidth id="textBoxMneumonicValue" label="L2 Mneumonic" variant="outlined" InputLabelProps={{ shrink: true }} value = {textInputMneumonic} onChange={inputMneumonicChanged}/>
        <Alert severity="warning">This mneumonic generates your wallet's private keys, so copy it and keep it safe. It is not possible to recover your wallet's private keys if you loose this mneumonic. Do not share with anyone, as anyone with access to this mneumonic can spend your funds.</Alert>
        <FormControlLabel
        label="Save mneumonic to LocalStorage"
        control={<Checkbox checked={saveMneumonic} onChange={handleSaveMneumonicCheckboxChange} />}
      />

        <Button variant="contained" id="createNewWallet" disabled={!textInputMneumonic} onClick={createNewWalletClicked}>Create/Open Wallet</Button>
      </Stack>
    );
    }