// A class for displaying a Layer2 address, it's balance and it's transactions
// Has a AddressBalanceView component that displays the address and it's balance, and a TransactionsAccordionList component that displays the transactions of the address

import React from 'react';
import { TransactionsAccordionList } from './TransactionsAccordionList';
import { AddressBalanceView } from './AddressBalanceView';
import { Transaction } from '../utils/wallet';
import { AddressAdditionalInfo } from './AddressAdditionalInfo';
import { Card } from '@mui/material';
import { TRX_WITHDRAWAL_INITIATED } from "../utils/wallet";
import { OAuthUserAuxillaryInfo } from '../services/messages/Layer2OAuthManager/Common/OAuthUserAuxillaryInfo';


class AddressOverviewProps {
    address: string = "";
    balance: number = 0;
    transactions: Map<string, Transaction[]> = new Map();
    myAddresses: string[] = [];
    enableAddressLink?: boolean = true;
    ownerOAuthUser?: OAuthUserAuxillaryInfo | null = null;
}

export function AddressOverview(props: AddressOverviewProps) {
    
    const transactions: Transaction[] = props.transactions.get(props.address) ? props.transactions.get(props.address) as Transaction[] : [];
    const ownerOAuthUser = props.ownerOAuthUser;
    let isLayer1WithdrawalAddress = false;
    transactions.forEach(transaction => { 
        if(transaction.transaction_type == TRX_WITHDRAWAL_INITIATED && transaction.destination_address == props.address){
            isLayer1WithdrawalAddress = true;
        }     
    });
    return (
        <div>
            <Card>
                <AddressBalanceView
                    address={props.address}
                    balance={props.balance}
                    enableAddressLink={props.enableAddressLink}
                    isLayer1WithdrawalAddress={isLayer1WithdrawalAddress}
                    ownerOAuthUser={ownerOAuthUser}
                />
                <AddressAdditionalInfo transactions={transactions} address={props.address} />
            </Card>

            <TransactionsAccordionList
                transactions={props.transactions}
                myAddresses={props.myAddresses}
            />
        </div>
    );
}



