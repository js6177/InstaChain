import React from 'react';

import { Accordion, Card, ListItem, Stack } from '@mui/material';
import { AccordionSummary } from '@mui/material';
import { AccordionDetails } from '@mui/material';
import { Typography } from '@mui/material';
import { ExpandMore as ExpandMoreIcon } from '@mui/icons-material';
import { Button } from '@mui/material';
import { Paper } from '@mui/material';
import { List } from '@mui/material';
import { Box } from '@mui/material';
import Chip from '@mui/material/Chip';
import { color } from '@mui/system';

import { Transaction } from '../utils/wallet';
import BtcAmountDisplay from './BtcAmountDisplay';
import { TransactionTimestampToDate } from '../utils/DateUtils';
import { CopyableTextDisplay } from './Explorer/CopyableTextDisplay';
import { ExplorerLinkBuilder } from '../utils/RouterUtils';
import { Link } from 'react-router-dom';
import JsonPretty from 'react-json-pretty';

//Display a list of transactions in an accordion list, similar to TransactionsDataGrid.js
//Foreach transaction in transactions, create an AccordionListViewItem passin in the transaction to props
export function TransactionsAccordionList(props: {transactions: Map<string, Transaction[]>, myAddresses: string[]}){
    const { transactions, myAddresses } = props;
    // assume transactions is a map, with key = address, value = array of transactions
    // transactionsLoaded is true if transactions is not null and is not empty
    const transactionsLoaded = transactions && transactions.size > 0;
    ////console.log("TransactionsAccordionList transactionsLoaded: " + transactionsLoaded)
    ////console.log("TransactionsAccordionList JSON: " + JSON.stringify(transactions, null, 2))
    const accordionListViewItems: JSX.Element[] = [];
    if(transactionsLoaded){
        transactions.forEach((transactionArray, address) => {
            transactionArray.forEach((transaction) => {
                accordionListViewItems.push(<TransactionAccordionListViewItem key={transaction.id} transaction={transaction} myAddresses={myAddresses} />);
            });
        });
    }
    
    return(
        <Box>
            <List component="div">
                {transactionsLoaded && accordionListViewItems }
            </List>
        </Box>
    );
}


//Create the ListView items for the accordion list, which display the transaction details
//Display the transaction amount, source address, destination address, and transaction type in the main body,
//and the transaction id, layer1 transaction id, and timestamp in the dropdown details section
//Also add a 'view' button to the dropdown that will display the transaction json in a popup
export function TransactionAccordionListViewItem(props: {transaction: Transaction, myAddresses: string[]}){
    const { transaction, myAddresses } = props;
    const [show, setShow] = React.useState(false);
    const handleClose = () => setShow(false);
    const handleShow = () => setShow(true);
    

    const isTransactionFromMe = myAddresses.includes(transaction.source_address);
    const transactionColor = isTransactionFromMe ? "red" : "green";
    const transactionAmount: number = (isTransactionFromMe ? -(transaction.amount ?? 0) : transaction.amount) ?? 0;

    return(
        <div>
            <ListItem disableGutters={true}>
            <Accordion>
                <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{backgroundColor: '#FEFAE0' }}>
                    <Stack direction="row" 
                            width="100%"
                            spacing={2}  
                            justifyContent="space-between"
                            alignItems="stretch" 
                            >
                         <Stack direction="column" spacing={0} alignItems="flex-end" justifyContent="space-between">
                            <Box>
                                {transaction.transaction_type_desc}
                            </Box>
                            <CopyableTextDisplay label="Tx ID:" text={transaction.transaction_id} childElement={
                                <Link to={ExplorerLinkBuilder.buildLayer2TransactionLink(transaction.transaction_id)}>
                                    <Box>{transaction.transaction_id}</Box>
                                </Link>
                                } />
                        </Stack>
                        <Stack direction="column" spacing={0}>
                            <CopyableTextDisplay label="From:" text={transaction.source_address} childElement={
                                <Link to={ExplorerLinkBuilder.buildLayer2AddressLink(transaction.source_address)}>
                                    <Box>{transaction.source_address}</Box>
                                </Link>
                            } />

                            <CopyableTextDisplay label="To:" text={transaction.destination_address} childElement={
                                <Link to={ExplorerLinkBuilder.buildLayer2AddressLink(transaction.destination_address)}>
                                    <Box>{transaction.destination_address}</Box>
                                </Link>
                            } />
                        </Stack>

                        <Stack direction="column" spacing={0} alignItems="flex-end" justifyContent="space-between">
                            <BtcAmountDisplay amount={transactionAmount} color={transactionColor} />                               
                            <Box>
                                {TransactionTimestampToDate(transaction.timestamp)}
                            </Box>
                        </Stack>

                    </Stack>
                </AccordionSummary>
                <AccordionDetails>
                    <Typography>
                        <JsonPretty id="json-data" data={transaction} />
                    </Typography>
                </AccordionDetails>
            </Accordion>
            </ListItem>
        </div>
    );
}