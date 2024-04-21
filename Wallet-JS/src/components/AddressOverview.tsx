// A class for displaying a Layer2 address, it's balance and it's transactions
// Has a AddressBalanceView component that displays the address and it's balance, and a TransactionsAccordionList component that displays the transactions of the address

import React from 'react';
import { TransactionsAccordionList } from './TransactionsAccordionList';
import { AddressBalanceView } from './AddressBalanceView';
import { Transaction } from '../utils/wallet';

class AddressOverviewProps {
    address: string = "";
    balance: number = 0;
    transactions: Map<string, Transaction[]> = new Map();
    myAddresses: string[] = [];
}

export function AddressOverview(props: AddressOverviewProps) {
    return (
        <div>
            <AddressBalanceView
                address={props.address}
                balance={props.balance}
            />
            <TransactionsAccordionList
                transactions={props.transactions}
                myAddresses={props.myAddresses}
            />
        </div>
    );
}



