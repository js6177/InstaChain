/**
 * A component for displaying the search results.
 * @param searchString The search string
 */

import React, { useEffect, useState } from 'react';
import CircularProgress from '@mui/material/CircularProgress';

import { WorkspaceContext } from '../../context/WorkspaceContext';
import { ExplorerContext } from '../../context/ExplorerStateContext';
import { useParams } from 'react-router-dom';
import { Transaction } from '../../utils/wallet';
import { GetTransactionsResponseTransaction } from '../../services/messages/Responses/GetTransactionsResponse';

import { AddressPresenter } from './AddressPresenter';
import { TransactionPresenter } from './TransactionPresenter';

class SearchResultsPresenterProps {
    searchString: string = "";
}

export function SearchResultsPresenterFromRoute() {
    const { searchString } = useParams();
    return <SearchResultsPresenter searchString={searchString as string} />;
}

export function SearchResultsPresenter(props: SearchResultsPresenterProps) {
    const { searchString } = props;

    const [isSearchFinishedLoading, setIsSearchFinishedLoading] = useState<boolean>(false);

    const { workspace, workspaceStateManager } = React.useContext(WorkspaceContext);
    const { explorerState, explorerStateManager } = React.useContext(ExplorerContext);

    const [isAddressFound, setAddressFound] = useState<boolean>(false);
    const [isTransactionFound, setTransactionFound] = useState<boolean>(false);

    const [foundAddressBalance, setFoundAddressBalance] = useState<number>(0);
    const [foundTransaction, setFoundTransaction] = useState<Transaction | null>(null);

    loadSearchResults();

    function loadSearchResults() {
        if (workspace?.searchResults.get(searchString) == null) {
            workspaceStateManager?.search(searchString);
        }
    }

    useEffect(() => {
        if(workspace?.searchResults.get(searchString) != null){
            const searchResults = workspace?.searchResults.get(searchString);
            if(searchResults != null){
                setIsSearchFinishedLoading(true);
            
                const _isAddressFound = searchResults?.l2_address != null;
                setAddressFound(_isAddressFound);
                const _isTransactionFound = searchResults?.l2_transaction != null;
                setTransactionFound(_isTransactionFound);

                if(_isAddressFound){
                    setFoundAddressBalance(searchResults?.l2_address?.balance as number);
                }
                if(_isTransactionFound){
                    const transaction = new Transaction();
                    transaction.fromGetTransactionsResponseTransaction(searchResults?.l2_transaction as GetTransactionsResponseTransaction);
                    setFoundTransaction(transaction);
                }
            }
        }
    }, [workspace]);

    // If the search is finished loading, display the search results
    // If the search is not finished loading, display a CircularProgress with the message "Loading..."
    return (
        (isSearchFinishedLoading) ? (
            <div>
                {isAddressFound && <AddressPresenter address={searchString} />}
                {isTransactionFound && foundTransaction != null && <TransactionPresenter transactionID={searchString} />}
                {!isAddressFound && !isTransactionFound && <div>No results found for search string: {searchString}</div>}
            </div>
        ) : (
            <div>
                <CircularProgress />
                <div>Loading...</div>
            </div>
        )
    );

}