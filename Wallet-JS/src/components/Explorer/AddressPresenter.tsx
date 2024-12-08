/**
 * A component for displaying a Layer2 address and it's balance and transactions
 * This component has an AddressOverview component that displays the address, it's balance and it's transactions
 * This will fetch the address's transactions from the WorkspaceStateManager.workspace.searchedAdressTransactions[address] and the address's balance from the WorkspaceStateManager.workspace.searchedAddressBalances[address].
 * If they are empty, it will fetch them using the WorspaceStateManager.getAddressTransactions(address) and WorkspaceStateManager.getAddressBalance(address) functions.
 * @param address The address to display
 */

import React, { useEffect, useState } from 'react';
import CircularProgress from '@mui/material/CircularProgress';

import { AddressOverview } from '../AddressOverview';
import { AddressBalanceView } from '../AddressBalanceView';
import { Transaction } from '../../utils/wallet';
import { WorkspaceContext } from '../../context/WorkspaceContext';
import { ExplorerContext } from '../../context/ExplorerStateContext';
import { useParams } from 'react-router-dom';
import { AreTransactionArraysEqual } from '../../utils/ComparisonUtils';


class AddressPresenterProps {
    address: string = "";
    showTransactions?: boolean = true;
}

export function AddressPresenterFromRoute() {
    const { address } = useParams();
    return <AddressPresenter address={address as string} showTransactions={true}/>;
}

export function AddressPresenter(props: AddressPresenterProps) {
    const { address,  showTransactions = false} = props;

    const {workspace, workspaceStateManager} = React.useContext(WorkspaceContext);
    const {explorerState, explorerStateManager} = React.useContext(ExplorerContext);
    const [isSearchFinishedLoading, setIsSearchFinishedLoading] = useState<boolean>(false);
    
    const [addressBalance, setAddressBalance] = useState<number>(0);
    const [addressTransactions, setAddressTransactions] = useState<Transaction[] | null>(null);

    loadAddress();

    function loadAddress(){
        // Fetch the address's balance and transactions
        const newAddressBalance = workspace?.searchedAddressBalances?.get(address);
        if(newAddressBalance != null){
            if(addressBalance != newAddressBalance){
                setAddressBalance(workspace?.searchedAddressBalances?.get(address) as number);
                setIsSearchFinishedLoading(true);
            }
        }else{
            workspaceStateManager?.getAddressBalance(address);
        }

        const newAddressTransactions = workspace?.searchedAdressTransactions?.get(address);
        if(showTransactions){
            if(newAddressTransactions != null){
                if(!AreTransactionArraysEqual(newAddressTransactions, addressTransactions as Transaction[])){
                    setAddressTransactions(newAddressTransactions);
                    setIsSearchFinishedLoading(true);
                }
            }
            else{
                workspaceStateManager?.getAddressTransactions(address);
            }
        }
    }

    useEffect(() => {
        loadAddress();
    }, [workspace]);

    // If showTransactions is true, display AddressOverview.
    // Otherwise, return display AddressBalance
    return (
        isSearchFinishedLoading ? (
            showTransactions ? (
                (addressBalance != null && addressTransactions != null) && (
                <AddressOverview
                    address={address}
                    balance={addressBalance}
                    transactions={new Map([[address, addressTransactions]])}
                    myAddresses={[]}
                    enableAddressLink={true}
                    ownerOAuthUser={workspace?.layer2AddressToOAuthUser.get(address)}
                />
                )
            ) : 
            (
                <AddressBalanceView address={address} balance={addressBalance} enableAddressLink={true} />
            )
        ) : (
            <div>
                <CircularProgress />
            </div>        
        )
    );
}