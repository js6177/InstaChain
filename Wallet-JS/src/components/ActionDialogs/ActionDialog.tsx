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

import { WorkspaceContext } from '../../context/WorkspaceContext';


import { Typography } from '@mui/material';
import { Layer2LedgerContext } from '../../context/Layer2LedgerContext';

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