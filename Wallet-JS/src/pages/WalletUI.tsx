import { Box, Button, Card, IconButton, Stack, ToggleButton, ToggleButtonGroup, Tooltip } from "@mui/material";
import React from "react";
import { ActionDialog } from "../components/ActionDialogs/ActionDialog";
import { CreateOpenWalletDialogBody } from "../components/ActionDialogs/CreateOpenWalletDialog";
import { TransferDialogBody } from "../components/ActionDialogs/TransferDialog";
import { DepositDialogBody } from "../components/ActionDialogs/DepositDialog";
import { WithdrawalDialogBody } from "../components/ActionDialogs/WithdrawalDialog";
import { TransactionsAccordionList } from "../components/TransactionsAccordionList";
import { TransactionDataGrid } from "../components/TransactionsDataGrid";
import { WorkspaceContext } from "../context/WorkspaceContext";

import ListIcon from '@mui/icons-material/List';
import GridViewIcon from '@mui/icons-material/GridView';
import RefreshIcon from '@mui/icons-material/Refresh';
import { AvailableBalance } from "../components/AvailableBalance";



export default function WalletUI(props: any){

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

    let mainLayer2AddressPubkey = "";
    let mainLayer2AddressBalance = 0;
    if(isWalletLoaded){
      mainLayer2AddressPubkey = workspace?.wallet?.getMainAddressPubkey() || "";
      mainLayer2AddressBalance = workspace?.addressBalances.get(mainLayer2AddressPubkey) || 0;
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
                  <MainAddressBalanceView  mainAddressPubkey={mainLayer2AddressPubkey} manAddressBalance={mainLayer2AddressBalance}/>
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
              isWalletLoaded && transactionsViewMode == "list" && <TransactionsAccordionList transactions={workspace.transactions} myAddresses={[mainLayer2AddressPubkey]} />
            }
            {
              isWalletLoaded && transactionsViewMode == "grid" && <TransactionDataGrid transactions={workspace.transactions.get(mainLayer2AddressPubkey) ?? []} />
            }

            </Stack>
        </div>
      ); 
  }

function MainAddressBalanceView(props: any){
    const { mainAddressPubkey, manAddressBalance } = props;

    return(
      <div>
        Main L2 Address: {mainAddressPubkey}
        <br/>
        {manAddressBalance > 0 && <AvailableBalance walletBalance={manAddressBalance}/>}

        
      </div>
    );
  }