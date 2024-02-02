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


import {Layer2LedgerContext} from '../context/Layer2LedgerContext';
import {WorkspaceContext} from '../context/WorkspaceContext';
import {TransactionDataGrid} from '../components/TransactionsDataGrid'
import {TransactionsAccordionList} from '../components/TransactionsAccordionList'
import {ActionDialog, CreateOpenWalletDialogBody, TransferDialogBody, DepositDialogBody, WithdrawalDialogBody} from '../components/ActionDialog'
import AddressBalanceTable from '../components/AddressBalanceTable';

import GitHubIcon from '@mui/icons-material/GitHub';
import TwitterIcon from '@mui/icons-material/Twitter';
import GoogleIcon from '@mui/icons-material/Google';
import CurrencyBitcoinIcon from '@mui/icons-material/CurrencyBitcoin';

import { red, green, blue } from '@mui/material/colors';
import { ThemeProvider, createTheme} from '@mui/material/styles';
import { CssBaseline } from '@mui/material/';
import { Card } from '@mui/material/';
import { color } from '@mui/system';


const theme = createTheme({
  palette: {
    mode: 'light',
    //spacing: 8,
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
/*     newWalletButton:{
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
    } */
  },
});

export default function MyApp(props: any) {
  const {layer1AuditReportResponse: layer1AuditReport} = React.useContext(Layer2LedgerContext);

  const [activeTab, setActiveTab] = React.useState('wallet');

  const handleTabChange = (tab: React.SetStateAction<string>) => {
    setActiveTab(tab);
  };

  return (
    <div>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Stack spacing={2} padding={2} bgcolor="paperColor">
          <ProjectHeaderUI activeTab={activeTab} handleTabChange={handleTabChange} />
          {activeTab === 'wallet' && <WalletUI/>}
          {activeTab === 'explorer' && <ExplorerUI />}
          {activeTab === 'audit' && <AuditUI layer1AuditReportResponse={layer1AuditReport} />}
        </Stack>
      </ThemeProvider>
    </div>
  );
}

function ProjectHeaderUI(props: any) {
  const { activeTab, handleTabChange } = props;

  return (
    <Stack
      direction="row"
      justifyContent="space-between"
      alignItems="flex-start"
      spacing={2}
    >
      <Chip label="Instachain v0.1 beta testnet" size="medium" />

      <Stack direction="row" spacing={2}>
        <Button
          variant={activeTab === 'wallet' ? 'contained' : 'outlined'}
          onClick={() => handleTabChange('wallet')}
        >
          Wallet
        </Button>
        <Button
          variant={activeTab === 'explorer' ? 'contained' : 'outlined'}
          onClick={() => handleTabChange('explorer')}
        >
          Explorer
        </Button>
        <Button
          variant={activeTab === 'audit' ? 'contained' : 'outlined'}
          onClick={() => handleTabChange('audit')}
        >
          Audit
        </Button>
      </Stack>


      <Stack
        direction="row"
        justifyContent="flex-end"
        alignItems="flex-start"
        spacing={2}
      >
        <Chip
          icon={<CurrencyBitcoinIcon />}
          label="Bitcointalk"
        />
        <Chip
          icon={<GitHubIcon />}
          label="Github"
          component="a"
          href="https://github.com/js6177/InstaChain"
          target="_blank"
          clickable
        />
        <Chip icon={<TwitterIcon />}  label="Twitter" />
        <Chip icon={<GoogleIcon />} label="Google Cloud" />
      </Stack>
    </Stack>
  );
}


  function ProjectDescriptionUI(props: any) {
    return (
      <div/>
    );
/*     const items : any = [];
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
    ) */
  }

  function WalletUI(props: any){

    //use workspac context here
    const {workspace, workspaceStateManager} = React.useContext(WorkspaceContext);
    //If wallet it null, then it is not loaded
    const isWalletLoaded = workspace?.wallet != null;
    ////console.log("isWalletLoaded: " + isWalletLoaded);

    const [createOpenWalletDialogIsOpen, setCreateOpenWalletDialogIsOpen] = React.useState(false);
    const [createOpenWalletDialogStatus, setCreateOpenWalletDialogStatus] = React.useState("");

    const [transferDialogIsOpen, setTransferDialogIsOpen] = React.useState(false);
    const [transferDialogStatus, setTransferDialogStatus] = React.useState("");

    const [getDepositAddressDialogIsOpen, setGetDepositAddressDialogIsOpen] = React.useState(false);

    const [withdrawalDialogIsOpen, setWithdrawalDialogIsOpen] = React.useState(false);

    const [transactionsViewMode, setTransactionsViewMode] = React.useState("list");

    let mainAddressPubkey = "";
    let mainAddressBalance = 0;
    if(isWalletLoaded){
      mainAddressPubkey = workspace?.wallet.getMainAddressPubkey();
      mainAddressBalance = workspace?.addressBalances.get(mainAddressPubkey) || 0;
      //console.log("WalletUI addressBalances: " + JSON.stringify(workSpace.addressBalances));
    }
    //console.log("WalletUI mainAddressPubkey: " + mainAddressPubkey);
    //console.log("WalletUI mainAddressBalance: " + mainAddressBalance);

  
    const handleClickCreateOpenWalletDialogOpen = () => {
      setCreateOpenWalletDialogIsOpen(true);
    };
  
    const handleCreateOpenWalletDialogClose = (value: React.SetStateAction<string>) => {
      setCreateOpenWalletDialogIsOpen(false);
      setCreateOpenWalletDialogStatus(value);
    };

    const handleClickTransferDialogOpen = () => {
      setTransferDialogIsOpen(true);
    };
    
    const handleTransferDialogClose = (value: React.SetStateAction<string>) => {
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

    const handleTransactionsViewModeChange = (_event: any, newTransactionsViewMode: React.SetStateAction<string>) => {
      //console.log("handleTransactionsViewModeChange: " + newTransactionsViewMode);
      setTransactionsViewMode(newTransactionsViewMode);
    };

      return (
        <div>
          <Stack spacing={2}>
          {!isWalletLoaded &&
            <Box  display="flex" justifyContent="center" >
              <Card sx={{  maxWidth: 1/3, p: 2, bgcolor:'#FEFAE0' }} >
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
              <Button variant="contained" onClick={handleClickCreateOpenWalletDialogOpen}>
                Create/Open L2 Wallet
              </Button>
              {isWalletLoaded &&
              <Box display="block" >
                <Card variant="outlined" sx={{p:2, bgcolor:'#FEFAE0' }}>
                  <MainAddressBalanceView  mainAddressPubkey={mainAddressPubkey} manAddressBalance={mainAddressBalance}/>
                </Card>
              </Box>}
            </Stack>

            <Stack direction="row" spacing={2}>
              <Tooltip title="Send funds to another Layer 2 address">
                <Button variant="contained"  onClick={handleClickTransferDialogOpen} disabled={!isWalletLoaded}>
                  Transfer (L2-{'>'}L2)
                </Button>
                </Tooltip>
                <ActionDialog
                  dialogErrorCode={transferDialogStatus}
                  isOpen={transferDialogIsOpen}
                  onClose={handleTransferDialogClose}
                  dialogTitle="Transfer (L2->L2)"
                  dialogBody={<TransferDialogBody />}
                />
              

              <Tooltip title="Deposit funds from your Layer 1 bitcoin address to your Layer 2 address">
                <Button variant="contained"  onClick={handleDepositDialogOpen} disabled={!isWalletLoaded}>
                  Deposit (L1-{'>'}L2)
                </Button>
                </Tooltip>
                <ActionDialog
                  isOpen={getDepositAddressDialogIsOpen}
                  onClose={handleDepositDialogClose}
                  dialogTitle="Deposit (L1->L2)"
                  dialogBody={<DepositDialogBody/>}
                />
              

              <Tooltip title="Withdraw funds from your Layer 2 address to you Layer 1 bitcoin address">
                <Button variant="contained" onClick={handleWihdrawalDialogOpen} disabled={!isWalletLoaded}>
                  Withdraw (L2-{'>'}L1)
                </Button>
                </Tooltip>
                <ActionDialog
                  isOpen={withdrawalDialogIsOpen}
                  onClose={handleWithdrawalDialogClose}
                  dialogTitle="Withdraw (L2->L1)"
                  dialogBody={<WithdrawalDialogBody/>}
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
              <IconButton onClick={() => workspaceStateManager?.refreshWallet()}>
                <RefreshIcon />
              </IconButton>
            </Stack>
            {
              isWalletLoaded && transactionsViewMode == "list" && <TransactionsAccordionList transactions={workspace.transactions} myAddresses={[workspace.wallet.getMainAddressPubkey()]} />
            }
            {
              isWalletLoaded && transactionsViewMode == "grid" && <TransactionDataGrid transactions={workspace.transactions.get(workspace.wallet.getMainAddressPubkey())} />
            }

            </Stack>
        </div>
      ); 
  }

  function ExplorerUI(props: any){
    return(
      <div>
      </div>
    );
  }

  function AuditUI(props: any) {
    const { layer1AuditReportResponse } = props;
    return (
      <div style={{ display: 'flex' }}>
        <AddressBalanceTable/>
      </div>
    );
  }

  function MainAddressBalanceView(props: any){
    const { WorkspaceState, mainAddressPubkey, manAddressBalance } = props;

    return(
      <div>
        Main L2 Address: {mainAddressPubkey}
        <br/>
        Balance (satoshis): {manAddressBalance}
      </div>
    );
  }




