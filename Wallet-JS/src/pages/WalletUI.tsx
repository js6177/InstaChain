import { Box, Button, Card, IconButton, Stack, ToggleButton, ToggleButtonGroup, Tooltip } from "@mui/material";
import React, { useEffect } from "react";
import { ActionDialog } from "../components/ActionDialogs/ActionDialog";
import { CreateOpenWalletDialogBody } from "../components/ActionDialogs/CreateOpenWalletDialog";
import { TransferDialogBody } from "../components/ActionDialogs/TransferDialog";
import { DepositDialogBody } from "../components/ActionDialogs/DepositDialog";
import { WithdrawalDialogBody } from "../components/ActionDialogs/WithdrawalDialog";
import { TransactionsAccordionList } from "../components/TransactionsAccordionList";
import { TransactionDataGrid } from "../components/TransactionsDataGrid";
import { WorkspaceContext } from "../context/WorkspaceContext";
import {loadLayer2OAuthAuthorizationTokenFromLocalStorage} from "../state_managers/LocalStorageManager";
import { Layer2OAuthToken } from "../services/messages/Layer2OAuthManager/Request/AuthorizeWithLayer2AuthTokenRequest";
import {Layer2OAuthManagerAPI} from "../services/Layer2OAuthManagerAPI";

import ListIcon from '@mui/icons-material/List';
import GridViewIcon from '@mui/icons-material/GridView';
import RefreshIcon from '@mui/icons-material/Refresh';
import { AvailableBalance } from "../components/AvailableBalance";
import { OAuth2UserProfileCard } from "../components/OAuth2UserDisplays/OAuth2UserProfileCard";
import { GithubLoginWithOAuth2Login, GoogleLoginWithOAuth2Login, TwitterLoginWithOAuth2Login } from "../components/OAuth2/OAuth2LoginButton";
import { OAuthUser } from "../services/messages/Layer2OAuthManager/Response/OAuthResponse";


export default function WalletUI(props: any){

    const {workspace, workspaceStateManager} = React.useContext(WorkspaceContext);
    const isWalletLoaded = workspace ? (workspace.walletManager.getWalletCount() > 0) : false;

    const [createOpenWalletDialogIsOpen, setCreateOpenWalletDialogIsOpen] = React.useState(false);
    const [createOpenWalletDialogStatus, setCreateOpenWalletDialogStatus] = React.useState("");

    const [transferDialogIsOpen, setTransferDialogIsOpen] = React.useState(false);
    const [transferDialogStatus, setTransferDialogStatus] = React.useState("");

    const [getDepositAddressDialogIsOpen, setGetDepositAddressDialogIsOpen] = React.useState(false);

    const [withdrawalDialogIsOpen, setWithdrawalDialogIsOpen] = React.useState(false);

    const [transactionsViewMode, setTransactionsViewMode] = React.useState("list");

    let loggedInOAuthUser: OAuthUser | null = null;

    let mainLayer2AddressPubkey = "";
    let mainLayer2AddressBalance = 0;
    if(isWalletLoaded){
      mainLayer2AddressPubkey = workspace?.walletManager.getMainWalletAddressPubkey() || "";
      mainLayer2AddressBalance = workspace?.addressBalances.get(mainLayer2AddressPubkey) || 0;

      loggedInOAuthUser = workspace?.walletManager.getMainWalletOAuthUser() || null;
    }

    useEffect(() => {
      if(!isWalletLoaded){
        const layer2OAuthToken: Layer2OAuthToken | null = loadLayer2OAuthAuthorizationTokenFromLocalStorage();
        if(layer2OAuthToken !== null){
          // Get the OAuth user from the Layer2OAuthManagerAPI
          Layer2OAuthManagerAPI.authorizeWithLayer2OAuthToken(layer2OAuthToken).then((response) => {
            if(response.error_response.error_code === 0){
              workspaceStateManager?.addOAuthUser(response.user, response.user_keys);
            }
          });
        }
      }
    }, [workspace]);

  
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
              {!isWalletLoaded &&
                <Stack direction={"column"}>
                  <GoogleLoginWithOAuth2Login/>
                  <GithubLoginWithOAuth2Login/>
                  <TwitterLoginWithOAuth2Login/>
                  <Button variant="contained" onClick={handleClickCreateOpenWalletDialogOpen}>
                    Create/Open L2 Wallet
                  </Button>
                </Stack>
              }
              {isWalletLoaded &&
              <Box display="block" >
                <Card variant="outlined" sx={{p:2, bgcolor:'#FEFAE0' }}>
                  <MainAddressBalanceView  mainAddressPubkey={mainLayer2AddressPubkey} manAddressBalance={mainLayer2AddressBalance} oauthUser={loggedInOAuthUser}/>
                </Card>
              </Box>}
            </Stack>
            {isWalletLoaded && <div>
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
              </div>
            }
            {
              workspace && isWalletLoaded && transactionsViewMode == "list" && <TransactionsAccordionList transactions={workspace.transactions} myAddresses={[mainLayer2AddressPubkey]} />
            }
            {
              workspace && isWalletLoaded && transactionsViewMode == "grid" && <TransactionDataGrid transactions={workspace.transactions.get(mainLayer2AddressPubkey) ?? []} />
            }

            </Stack>
        </div>
      ); 
  }

class MainAddressBalanceViewProps {
    mainAddressPubkey: string = "";
    manAddressBalance: number = 0;
    oauthUser?: OAuthUser | null = null;
}

function MainAddressBalanceView(props: MainAddressBalanceViewProps){
    const {workspace, workspaceStateManager} = React.useContext(WorkspaceContext);
    const { mainAddressPubkey, manAddressBalance, oauthUser = null } = props;
    const handleLogout = () => {
      workspaceStateManager?.logoutOAuthUser(null);
    };
    return(
      <div>
        <Stack direction="row" spacing={2}>
          {oauthUser !==null && <OAuth2UserProfileCard user={oauthUser}/>}
          {oauthUser !==null && <Button variant="outlined" onClick={handleLogout}>Logout</Button>}
        </Stack>
        Main L2 Address: {mainAddressPubkey}
        <br/>
        {manAddressBalance > 0 && <AvailableBalance walletBalance={manAddressBalance}/>}

      </div>
    );
  }

