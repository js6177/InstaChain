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
import Tooltip from '@mui/material/Tooltip';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import ToggleButton from '@mui/material/ToggleButton';
import ListIcon from '@mui/icons-material/List';
import GridViewIcon from '@mui/icons-material/GridView';

import IconButton from '@mui/material/IconButton';
import CloseIcon from '@mui/icons-material/Close';
import RefreshIcon from '@mui/icons-material/Refresh';

import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';


//import {getMainWalletAddress} from './UIController'
import {getUiControllerCallbacks, setUiControllerCallbacks} from './Callbacks/CallbacksMap'
import {TransactionDataGrid} from './UI/TransactionsDataGrid'
import {TransactionsAccordionList} from './UI/TransactionsAccordionList'
import {ActionDialog, CreateOpenWalletDialogBody, TransferDialogBody, DepositDialogBody, WithdrawalDialogBody} from './UI/ActionDialog'
import GitHubIcon from '@mui/icons-material/GitHub';
import TwitterIcon from '@mui/icons-material/Twitter';
import GoogleIcon from '@mui/icons-material/Google';
import CurrencyBitcoinIcon from '@mui/icons-material/CurrencyBitcoin';

import { red, green, blue } from '@mui/material/colors';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { CssBaseline } from '@mui/material/';
import { Card } from '@mui/material/';
import { color } from '@mui/system';


const theme = createTheme({
  palette: {
    mode: 'light',
    spacing: 8,
    background: {
      default: "#daffe7"
    },
    primary: {
      main: '#DC9A22',
      contrastText: "#FFFFFF"
    },
    secondary: {
      main: '#f30057',
    },
    error: {
      main: '#9e3c35',
      light: '#de2618',
      dark: '#b31308',
    },
    projectDescriptionCardColor:{
      main: "#DC9A22"
    },
    newWalletButton:{
      main: "#03D624",
      contrastText: "#FFFFFF"   
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
    },
    depositButtonColor:{
      main: "#caffbf",
      contrastText: "#FFFFFF"
    },
    paperColor:{
      main: "#f8edeb"
    },
    positiveTransactionColor:{
      main: "#32a852",
      contrastText: "#FFFFFF"
    },
    negativeTransactionColor:{
      main: "#a83232",
      contrastText: "#FFFFFF"
    }
  },
});

export default function MyApp(props) {
  const { WorkspaceState, transferTransactionErrorMessage, transactions, callbacksMap } = props;

  setUiControllerCallbacks(callbacksMap);
    return (
      <div  >
        <ThemeProvider theme={theme}>
          <CssBaseline/>
          <Stack spacing={2} padding={2}  bgcolor="paperColor">
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
        <Chip label="Instachain v0.1 beta testnet" size='medium'/>

        <Stack
          direction="row"
          justifyContent="flex-end"
          alignItems="flex-start"
          spacing={2}
        > 
          <Chip icon={<CurrencyBitcoinIcon />} color='bitcoinOrange' label="Bitcointalk" />
          <Chip icon={<GitHubIcon />} color='github' label="Github" component="a" href="https://github.com/js6177/InstaChain" target="_blank" clickable/>
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

    const [transactionsViewMode, setTransactionsViewMode] = React.useState("list");

  
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

    const handleTransactionsViewModeChange = (event, newTransactionsViewMode) => {
      console.log("handleTransactionsViewModeChange: " + newTransactionsViewMode);
      setTransactionsViewMode(newTransactionsViewMode);
    };

      return (
        <div>
          <Stack spacing={2}>
          {!WorkspaceState.walletLoaded &&
            <Box  display="flex" justifyContent="center" >
              <Card sx={{  maxWidth: 1/3, p: 2, bgcolor:'#FEFAE0' }} justifyContent="center" >
              IC is a new real-time Layer2 sidechain build for instant, near 0 fee payments. To get started, click “new wallet” and generate your L2 wallet; no login or registration is required. To learn more about the project, check the links on the top right.
              </Card>
            </Box>
            }
            <Stack direction="row"        
            justifyContent="space-between"
            alignItems="flex-end"
            spacing={2}>
              <ActionDialog
                dialogErrorCode={createOpenWalletDialogStatus}
                isOpen={createOpenWalletDialogIsOpen}
                onClose={handleCreateOpenWalletDialogClose}
                dialogTitle="Create/Open L2 Wallet"
                dialogBody={<CreateOpenWalletDialogBody />}
              />
              <Button variant="contained" onClick={handleClickCreateOpenWalletDialogOpen} color='newWalletButton'>
                Create/Open L2 Wallet
              </Button>
              {WorkspaceState.walletLoaded &&
              <Box display="block" >
                <Card variant="outlined" sx={{p:2, bgcolor:'#FEFAE0' }}>
                  <MainAddressBalanceView  mainAddressPubkey={WorkspaceState.mainAddressPubkey} manAddressBalance={WorkspaceState.addressBalances[WorkspaceState.mainAddressPubkey]}/>
                </Card>
              </Box>}
            </Stack>
              


            


            <Stack direction="row" spacing={2}>
              <Tooltip title="Send funds to another Layer 2 address">
                <Button variant="contained"  onClick={handleClickTransferDialogOpen} disabled={!WorkspaceState.walletLoaded}>
                  Transfer (L2-{'>'}L2)
                </Button>
                </Tooltip>
                <ActionDialog
                  dialogErrorCode={transferDialogStatus}
                  isOpen={transferDialogIsOpen}
                  onClose={handleTransferDialogClose}
                  dialogTitle="Transfer (L2->L2)"
                  dialogBody={<TransferDialogBody transferTransactionErrorMessage={WorkspaceState.transferTransactionErrorMessage}/>}
                />
              

              <Tooltip title="Deposit funds from your Layer 1 bitcoin address to your Layer 2 address">
                <Button variant="contained"  onClick={handleDepositDialogOpen} disabled={!WorkspaceState.walletLoaded}>
                  Deposit (L1-{'>'}L2)
                </Button>
                </Tooltip>
                <ActionDialog
                  isOpen={getDepositAddressDialogIsOpen}
                  onClose={handleDepositDialogClose}
                  dialogTitle="Deposit (L1->L2)"
                  dialogBody={<DepositDialogBody getDepositAddressErrorMessage={WorkspaceState.getDepositAddressErrorMessage} depositAddress={WorkspaceState.depositAddress}/>}
                />
              

              <Tooltip title="Withdraw funds from your Layer 2 address to you Layer 1 bitcoin address">
                <Button variant="contained" onClick={handleWihdrawalDialogOpen} disabled={!WorkspaceState.walletLoaded}>
                  Withdraw (L2-{'>'}L1)
                </Button>
                </Tooltip>
                <ActionDialog
                  isOpen={withdrawalDialogIsOpen}
                  onClose={handleWithdrawalDialogClose}
                  dialogTitle="Withdraw (L2->L1)"
                  dialogBody={<WithdrawalDialogBody withdrawTransactionErrorMessage={WorkspaceState.withdrawTransactionErrorMessage}/>}
                />
              
            </Stack>

            <Stack direction="row" spacing={2}>
              <ToggleButtonGroup
                value={transactionsViewMode}
                exclusive
                onChange={handleTransactionsViewModeChange}>
                <ToggleButton value="list" aria-label="list">
                  <ListIcon />
                </ToggleButton>
                <ToggleButton value="grid" aria-label="grid">
                  <GridViewIcon />
                </ToggleButton>
              </ToggleButtonGroup>
              <IconButton onClick={ getUiControllerCallbacks()["getTransactions"]}>
                <RefreshIcon />
              </IconButton>
            </Stack>

            {
            transactionsViewMode == "list" && <TransactionsAccordionList transactions={transactions} myAddresses={WorkspaceState.myAddresses} />
            }
            {
            transactionsViewMode == "grid" && <TransactionDataGrid transactions={transactions} />
            }

            </Stack>
        </div>
      ); 
  }

  function MainAddressBalanceView(props){
    const { WorkspaceState, mainAddressPubkey, manAddressBalance } = props;

    return(
      <div>
        Main L2 Address: {mainAddressPubkey}
        <br/>
        Balance (satoshis): {manAddressBalance}
      </div>
    );
  }




