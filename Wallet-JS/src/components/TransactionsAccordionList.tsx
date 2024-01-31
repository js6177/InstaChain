import React from 'react';

import { Accordion, ListItem, Stack } from '@mui/material';
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

//Display a list of transactions in an accordion list, similar to TransactionsDataGrid.js
//Foreach transaction in transactions, create an AccordionListViewItem passin in the transaction to props
export function TransactionsAccordionList(props: {transactions: Map<string, Transaction[]>, myAddresses: string[]}){
    const { transactions, myAddresses } = props;
    // assume transactions is a map, with key = address, value = array of transactions
    // transactionsLoaded is true if transactions is not null and is not empty
    let transactionsLoaded = transactions && transactions.size > 0;
    ////console.log("TransactionsAccordionList transactionsLoaded: " + transactionsLoaded)
    ////console.log("TransactionsAccordionList JSON: " + JSON.stringify(transactions, null, 2))
    let accordionListViewItems: JSX.Element[] = [];
    if(transactionsLoaded){
        transactions.forEach((transactionArray, address) => {
            transactionArray.forEach((transaction) => {
                accordionListViewItems.push(<AccordionListViewItem key={transaction.id} transaction={transaction} myAddresses={myAddresses} />);
            });
        });
    };
    
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
export function AccordionListViewItem(props: {transaction: Transaction, myAddresses: string[]}){
    const { transaction, myAddresses } = props;
    const [show, setShow] = React.useState(false);
    const handleClose = () => setShow(false);
    const handleShow = () => setShow(true);
    

    const isTransactionFromMe = myAddresses.includes(transaction.source_address);
    const transactionAmountWithSign = isTransactionFromMe ? "-" + transaction.amount : "+" + transaction.amount;
    //const transactionColor: string = isTransactionFromMe ? "negativeTransactionColor" : "positiveTransactionColor";
    const transactionColor = isTransactionFromMe ? "error" : "success";


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
                        <Stack direction="column" spacing={0}>
                            <Box>
                                {"From: " + transaction.source_address}
                            </Box>
                            <Box>
                                {"To: " + transaction.destination_address}
                            </Box>
                            <Box>
                                {transaction.transaction_type_desc}
                            </Box>
                        </Stack>
                        <Stack direction="column" spacing={0} alignItems="flex-end" justifyContent="space-between">
                            <Chip label={transactionAmountWithSign} color={transactionColor} />                                
                            <Box>
                                {new Date(transaction.timestamp * 1000).toLocaleString()}
                            </Box>
                        </Stack>

                    </Stack>
                </AccordionSummary>
                <AccordionDetails>
                    <Typography>
                        {JSON.stringify(transaction, null, 2)}
                    </Typography>
                </AccordionDetails>
            </Accordion>
            </ListItem>
        </div>
    );
}