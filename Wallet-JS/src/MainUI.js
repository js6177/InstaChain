import * as React from 'react';
//import React from 'react';
import ReactDOM from 'react-dom';

import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import List from '@mui/material/List';
import DialogTitle from '@mui/material/DialogTitle';
import Dialog from '@mui/material/Dialog';
import Stack from '@mui/material/Stack';
import InputLabel from '@mui/material/InputLabel';
import Alert from '@mui/material/Alert';
import Chip from '@mui/material/Chip';

import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';


//import {getMainWalletAddress} from './UIController'
import {getUiControllerCallbacks, setUiControllerCallbacks} from './Callbacks/CallbacksMap'
import {TransactionDataGrid} from './UI/TransactionsDataGrid'
import {ActionDialog, CreateOpenWalletDialogBody, TransferDialogBody, DepositDialogBody, WithdrawalDialogBody} from './UI/ActionDialog'
import GitHubIcon from '@mui/icons-material/GitHub';
import TwitterIcon from '@mui/icons-material/Twitter';
import GoogleIcon from '@mui/icons-material/Google';
import CurrencyBitcoinIcon from '@mui/icons-material/CurrencyBitcoin';

import { red, green, blue } from '@mui/material/colors';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { Card, CssBaseline } from '@mui/material/';


const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#4f51b5',
    },
    secondary: {
      main: '#f30057',
    },
    error: {
      main: '#9e3c35',
      light: '#de2618',
      dark: '#b31308',
    },
    bitcoinOrange:{
      main: "#f2a900",
      contrastText: "#FFFFFF"
    },
    twitter:{
      main: "#1DA1F2",
      contrastText: "#FFFFFF"
    },
    github:{
      main: "#333",
      contrastText: "#FFFFFF"

    },
    googleCloud:{
      main: "#4285F4",
      contrastText: "#FFFFFF"

    }
  },
});

export default function MyApp(props) {
  const { WorkspaceState, transferTransactionErrorMessage, transactions, callbacksMap } = props;

  setUiControllerCallbacks(callbacksMap);
    return (
      <div>
        <ThemeProvider theme={theme}>
          <Stack spacing={2} >
            <ProjectHeaderUI/>
            {false && <ProjectDescriptionUI/>}
            <MainUI WorkspaceState={WorkspaceState} transactions={transactions}/>
          </Stack>
        </ThemeProvider>
      </div>
    );
  }

  function ProjectHeaderUI(props){
    return(
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="flex-start"
        spacing={2}
      >
        <Chip label="Instachain v0.1 beta testnet" size='medium' color='primary'/>

        <Stack
          direction="row"
          justifyContent="flex-end"
          alignItems="flex-start"
          spacing={2}
        > 
          <Chip icon={<CurrencyBitcoinIcon />} color='bitcoinOrange' label="Bitcointalk" />
          <Chip icon={<GitHubIcon />} color='github' label="Github" component="a" href="https://github.com/js6177/InstaChain" clickable/>
          <Chip icon={<TwitterIcon />} color='twitter' label="Twitter" />
          <Chip icon={<GoogleIcon />} color='googleCloud' label="Google Cloud" />

        </Stack>
         
      </Stack>
    )
  }

  function ProjectDescriptionUI(props){
    const items = [];
    const featuresMap = new Map([
      ['2 way peg', ''],
      ['Open Source', ''],
      ['No Account Required', ''],
      ['Pseudonymous', ''],
      ['Instant', ''],
      ['~0 fees', ''],
    ]);
  
    featuresMap.forEach((featureDescription, feature) => {
      items.push(
        <Accordion flexGrow={1}>
          <AccordionSummary
            expandIcon={<ExpandMoreIcon />}
            aria-controls="panel1a-content"
            id="panel1a-header"
          >
            <Typography>
              {feature}
            </Typography>
          </AccordionSummary>
          <AccordionDetails>
            {featureDescription}          
          </AccordionDetails>
        </Accordion>
      );
    });
    return(
      <div>
        
        <Box >
          <List
            dense= {true}
            >
              {items}
          </List>
        </Box>
      </div>
    )
  }

  function MainUI(props){
    const { WorkspaceState, transactions } = props;
    
    const [createOpenWalletDialogIsOpen, setCreateOpenWalletDialogIsOpen] = React.useState(false);
    const [createOpenWalletDialogStatus, setCreateOpenWalletDialogStatus] = React.useState("");

    const [transferDialogIsOpen, setTransferDialogIsOpen] = React.useState(false);
    const [transferDialogStatus, setTransferDialogStatus] = React.useState("");

    const [getDepositAddressDialogIsOpen, setGetDepositAddressDialogIsOpen] = React.useState(false);

    const [withdrawalDialogIsOpen, setWithdrawalDialogIsOpen] = React.useState(false);

  
    const handleClickCreateOpenWalletDialogOpen = () => {
      setCreateOpenWalletDialogIsOpen(true);
    };
  
    const handleCreateOpenWalletDialogClose = (value) => {
      setCreateOpenWalletDialogIsOpen(false);
      setCreateOpenWalletDialogStatus(value);
    };

    const handleClickTransferDialogOpen = () => {
      setTransferDialogIsOpen(true);
    };
    
    const handleTransferDialogClose = (value) => {
      setTransferDialogIsOpen(false);
      setTransferDialogStatus(value);
    };

    const handleDepositDialogOpen = () => {
      setGetDepositAddressDialogIsOpen(true);
    };
    
    const handleDepositDialogClose = () => {
      setGetDepositAddressDialogIsOpen(false);
    };

    const handleWihdrawalDialogOpen = () => {
      setWithdrawalDialogIsOpen(true);
    };
    
    const handleWithdrawalDialogClose = () => {
      setWithdrawalDialogIsOpen(false);
    };

      return (
        <div>
          <Stack spacing={2}>
            <Stack direction="row"        
            justifyContent="space-between"
            alignItems="flex-start"
            spacing={2}>
              <Box display="block">
                <Card variant="outlined" >
                  <MainAddressBalanceView  mainAddressPubkey={WorkspaceState.mainAddressPubkey} manAddressBalance={WorkspaceState.addressBalances[WorkspaceState.mainAddressPubkey]}/>
                </Card>
              </Box>
              <ActionDialog
                dialogErrorCode={createOpenWalletDialogStatus}
                isOpen={createOpenWalletDialogIsOpen}
                onClose={handleCreateOpenWalletDialogClose}
                dialogTitle="Create/Open Wallet"
                dialogBody={<CreateOpenWalletDialogBody />}
              />
              <Button variant="outlined" onClick={handleClickCreateOpenWalletDialogOpen}>
                Create/Open Wallet
              </Button>
            </Stack>
              
            <TransactionDataGrid transactions={transactions} />



            <Stack direction="row" spacing={2}>
              <Button variant="outlined" onClick={handleClickTransferDialogOpen}>
                Transfer
              </Button>
              <ActionDialog
                dialogErrorCode={transferDialogStatus}
                isOpen={transferDialogIsOpen}
                onClose={handleTransferDialogClose}
                dialogTitle="Transfer"
                dialogBody={<TransferDialogBody transferTransactionErrorMessage={WorkspaceState.transferTransactionErrorMessage}/>}
              />

              <Button variant="outlined" onClick={handleDepositDialogOpen}>
                Deposit
              </Button>
              <ActionDialog
                isOpen={getDepositAddressDialogIsOpen}
                onClose={handleDepositDialogClose}
                dialogTitle="Deposit"
                dialogBody={<DepositDialogBody getDepositAddressErrorMessage={WorkspaceState.getDepositAddressErrorMessage} depositAddress={WorkspaceState.depositAddress}/>}
              />

              <Button variant="outlined" onClick={handleWihdrawalDialogOpen}>
                Withdraw
              </Button>
              <ActionDialog
                isOpen={withdrawalDialogIsOpen}
                onClose={handleWithdrawalDialogClose}
                dialogTitle="Withdraw"
                dialogBody={<WithdrawalDialogBody withdrawTransactionErrorMessage={WorkspaceState.withdrawTransactionErrorMessage}/>}
              />
              </Stack>
            </Stack>
        </div>
      ); 
  }

  function MainAddressBalanceView(props){
    const { WorkspaceState, mainAddressPubkey, manAddressBalance } = props;

    return(
      <div>
        Main Address: {mainAddressPubkey}
        <br/>
        Balance (satoshis): {manAddressBalance}
      </div>
    );
  }




