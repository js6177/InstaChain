/**
 * A component for displaying a Layer2 address and it's balance and transactions
 * This component displays a TransactionAccordionListViewItem component
 * This will fetch the transaction WorkspaceStateManager.workspace.searchedTransaction[transactionID].
 * If they are empty, it will fetch them using the WorspaceStateManager.getTransaction(address).
 * @param transactionID The transaction to display
 */

import React, { useEffect, useState } from 'react';

import { TransactionAccordionListViewItem } from '../TransactionsAccordionList';
import { Transaction } from '../../utils/wallet';
import { WorkspaceContext } from '../../context/WorkspaceContext';
import { ExplorerContext } from '../../context/ExplorerStateContext';

import { useParams } from 'react-router-dom';

class TransactionPresenterProps {
    transactionID: string = "";
}

export function TransactionPresenterFromRoute() {
    const { transactionID } = useParams();
    return <TransactionPresenter transactionID={transactionID as string} />;
}

export function TransactionPresenter(props: TransactionPresenterProps) {
    const { transactionID } = props;

    const {workspace, workspaceStateManager} = React.useContext(WorkspaceContext);
    const {explorerState, explorerStateManager} = React.useContext(ExplorerContext);
    
    const [transaction, setTransaction] = useState<Transaction | null>(null);

    loadTranaction();

    function loadTranaction(){
        // Fetch the transaction
        if(workspace?.searchedTransaction?.get(transactionID) != null){
            if(transaction == null){
                setTransaction(workspace?.searchedTransaction?.get(transactionID) as Transaction);
            }
        }else{
            workspaceStateManager?.getTransaction(transactionID);
        }
    }

    useEffect(() => {
        loadTranaction();
    }, [workspace]);

    return (
            transaction && (
                <TransactionAccordionListViewItem
                    transaction={transaction as Transaction}
                    myAddresses={[]}
                />
            )
        
    );
}
