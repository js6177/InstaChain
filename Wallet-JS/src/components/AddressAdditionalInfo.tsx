/**
 * This component is used to display the following additional information about the address:
 * Transaction count
 * Linked users
 * First seen (date)
 * Last seen (date)
 * Total sent
 * Total received
 */

import React from 'react';
import { Transaction } from '../utils/wallet';
import { Box, Card } from '@mui/material';
import { TransactionTimestampToDate } from '../utils/DateUtils';


class AddressAdditionalInfoProps {
    address: string = "";
    transactions: Transaction[] = [];
}

export function AddressAdditionalInfo(props: AddressAdditionalInfoProps) {
    const { address, transactions } = props;

    const transactionCount = transactions.length;
    const linkedUsers = "None";
    let firstSeen = "N/A";
    let lastSeen = "N/A";
    let totalSent = 0;
    let totalReceived = 0;
    if(transactions.length > 0){
        firstSeen = TransactionTimestampToDate(transactions.reduce((min, transaction) => transaction.timestamp < min ? transaction.timestamp : min, transactions[0].timestamp));
        lastSeen = TransactionTimestampToDate(transactions.reduce((max, transaction) => transaction.timestamp > max ? transaction.timestamp : max, transactions[0].timestamp));
    
        totalSent = transactions.filter(transaction => address === transaction.source_address).reduce((total, transaction) => total + (transaction.amount ?? 0), 0);
        totalReceived = transactions.filter(transaction => address === transaction.destination_address).reduce((total, transaction) => total + (transaction.amount ?? 0), 0);
    }
    return (
        <div>
            <Card>
                <div style={{ display: 'flex', flexDirection: 'row' }}>
                    <div style={{ flex: 1 }}>
                        <div>Transaction count: {transactionCount}</div>
                        <div>Linked users: {linkedUsers}</div>
                    </div>
                    <div style={{ flex: 1 }}>
                        <div>First seen: {firstSeen}</div>
                        <div>Last seen: {lastSeen}</div>
                    </div>
                    <div style={{ flex: 1 }}>
                        <div>Total sent: {totalSent}</div>
                        <div>Total received: {totalReceived}</div>
                    </div>
                </div>
            </Card>
        </div>
    );
}