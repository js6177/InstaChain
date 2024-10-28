// A class for displaying a Layer2 address and it's balance

/**
 * A class for displaying a Layer2 address and it's balance
 * @param address The address to display
 * @param balance The balance to display
 * @param enableAddressLink If true, the address will be a link to a page in the explorer that displays the address in an AddressPresenter component
 **/

import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Stack from "@mui/material/Stack";
import React from "react";
import { AvailableBalance } from "./AvailableBalance";
import { Link } from "react-router-dom";
import { CopyableTextDisplay } from "./Explorer/CopyableTextDisplay";
import { ExplorerLinkBuilder } from "../utils/RouterUtils";
import { Layer2LedgerContext } from "../context/Layer2LedgerContext";
import { OAuthUser } from "../services/messages/Layer2OAuthManager/Response/OAuthResponse";
import Alert from "@mui/material/Alert/Alert";

class AddressBalanceViewProps {
    address: string = "";
    balance: number = 0;
    enableAddressLink?: boolean = true;
    isLayer1WithdrawalAddress?: boolean = false;
    ownerOAuthUser?: OAuthUser | null = null; //if this address is owned by an OAuthUser, this will be the OAuthUser object

    constructor(address: string, balance: number, enableAddressLink: boolean = true) {
        this.address = address;
        this.balance = balance;
        this.enableAddressLink = enableAddressLink;
    }
}

function AddressBalanceView(props: AddressBalanceViewProps) {
    const { address, balance, enableAddressLink = true, isLayer1WithdrawalAddress = false, ownerOAuthUser = null} = props;
    const {layer2LedgerState} = React.useContext(Layer2LedgerContext);

    let isOnboardingDepositAddress = false;
    if(props.address === layer2LedgerState?.layer2LedgerNodeInfo?.onboardingDepositSigningKeyPubkey){
        isOnboardingDepositAddress = true;
    }
    
    return (
        <Card>
            <Stack direction="column" spacing={0} sx={{ margin: '16px' }}>
                {isLayer1WithdrawalAddress && <Alert severity="info">This is a Layer 1 withdrawal address</Alert>}
                {isOnboardingDepositAddress && <Alert severity="info">This address represents the source of all deposits from Layer 1 to Layer 2</Alert>}
                { ownerOAuthUser && <Alert severity="info">This address is owned by {ownerOAuthUser.username}</Alert>}
                {enableAddressLink ? (
                    <Stack direction="row" spacing={0}>
                            <CopyableTextDisplay label="Address:" text={address}  linkTo={ExplorerLinkBuilder.buildLayer2AddressLink(address)} />
                        
                    </Stack>                    
                ) : (
                    <Box>Address: {address}</Box>
                )}
                <AvailableBalance walletBalance={balance} availableBalanceText="Balance: "/>
            </Stack>
        </Card>
    );
}

export { AddressBalanceView, AddressBalanceViewProps}