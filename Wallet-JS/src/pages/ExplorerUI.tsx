import React, { useEffect, useState } from "react";
import IconButton from "@mui/material/IconButton";
import SearchIcon from "@mui/icons-material/Search";
import TextField from "@mui/material/TextField";
import { AddressBalanceView, AddressBalanceViewProps } from "../components/AddressBalanceView";
import { TransactionsAccordionList } from "../components/TransactionsAccordionList";

import { WorkspaceContext } from "../context/WorkspaceContext";
import { Transaction } from "../utils/wallet";
import { IsGetAddressBalanceFound, IsSuccessResponse } from "../utils/MessageUtils";
import { ExplorerContext } from "../context/ExplorerStateContext";
import { AddressOverview } from "../components/AddressOverview";


export default function ExplorerUI(props: any){
  const {workspace, workspaceStateManager} = React.useContext(WorkspaceContext);
  const {explorerState, explorerStateManager} = React.useContext(ExplorerContext);
  const [searchInputText, setSearchInputText] = useState<string>(explorerState?.lastSearchText || ""); // changes every time the user types in the search bar
  const [lastSearchInputText, setLastSearchInputText] = useState<string>(explorerState?.lastSearchText || ""); // stores the last text that was searched
  const [isAddressFound, setAddressFound] = useState<boolean>(explorerState?.isAddressBalanceDisplayed() || explorerState?.isAddressOverviewDisplayed() || false);
  const [isTransactionFound, setTransactionFound] = useState<boolean>(explorerState?.isTransactionDisplayed() || false);

  const [foundAddressBalance, setFoundAddressBalance] = useState<number>(0);
  const [foundTransaction, setFoundTransaction] = useState<Transaction | null>(null);
  const [foundAddressTransactions, setFoundAddressTransactions] = useState<Transaction[]>([]);

  const [isAddressBalanceDisplayed, setIsAddressBalanceDisplayed] = useState<boolean>(explorerState?.isAddressBalanceDisplayed() || false);
  const [isAddressOverviewDisplayed, setIsAddressOverviewDisplayed] = useState<boolean>(explorerState?.isAddressOverviewDisplayed() || false);
  const [isTransactionDisplayed, setIsTransactionDisplayed] = useState<boolean>(explorerState?.isTransactionDisplayed() || false);

  useEffect(() => {
    if (isTransactionDisplayed) {
      setFoundTransaction(workspaceStateManager?.workspace?.searchedTransaction?.get(lastSearchInputText) as Transaction);
    }
    if (isAddressBalanceDisplayed) {
      setFoundAddressBalance(workspaceStateManager?.workspace?.searchedAddressBalances?.get(lastSearchInputText) as number);
      if(workspaceStateManager?.workspace?.searchedAdressTransactions?.get(lastSearchInputText) != null){
        setFoundAddressTransactions(workspaceStateManager?.workspace?.searchedAdressTransactions?.get(lastSearchInputText) as Transaction[]);
      }
    }
    if (isAddressOverviewDisplayed) {
      setFoundAddressTransactions(workspaceStateManager?.workspace?.searchedAdressTransactions?.get(lastSearchInputText) as Transaction[]);
      // TODO: Fill in data needed for the address overview
    }
  }, [isTransactionDisplayed, isAddressBalanceDisplayed, isAddressOverviewDisplayed]);


  useEffect(() => {
    const addressBalanceResults = workspaceStateManager?.workspace?.searchResults?.get(lastSearchInputText)?.getAddressBalanceResults;
    const _isAddressFound = addressBalanceResults != null && IsSuccessResponse(addressBalanceResults) && IsGetAddressBalanceFound(addressBalanceResults, lastSearchInputText);
    setAddressFound(_isAddressFound);
    const singleTransactionResult = workspaceStateManager?.workspace?.searchResults?.get(lastSearchInputText)?.getSingleTransactionResults;
    const _isTransactionFound = singleTransactionResult != null && IsSuccessResponse(singleTransactionResult);
    setTransactionFound(_isTransactionFound);

    if(_isAddressFound){
      setFoundAddressBalance(workspaceStateManager?.workspace?.searchedAddressBalances?.get(lastSearchInputText) as number);
      explorerStateManager?.setDisplayedAddressBalance(lastSearchInputText);
      explorerStateManager?.setLastSearchText(lastSearchInputText);
      setIsAddressBalanceDisplayed(true);
      setIsTransactionDisplayed(false);
    }
    if(_isTransactionFound){
      setFoundTransaction(workspaceStateManager?.workspace?.searchedTransaction?.get(lastSearchInputText) as Transaction);
      explorerStateManager?.setDisplayedTransaction(lastSearchInputText);
      explorerStateManager?.setLastSearchText(lastSearchInputText);
      setIsTransactionDisplayed(true);
      setIsAddressBalanceDisplayed(false);
    }
    if(!_isAddressFound && !_isTransactionFound){
      explorerStateManager?.setNoSearchResults();
      setIsAddressBalanceDisplayed(false);
      setIsTransactionDisplayed(false);
    }
  }, [workspace]);

  const handleSearchInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchInputText(event.target.value);
  };

  const handleSearch = () => {
    //clean the existing search results
    setLastSearchInputText(searchInputText);
    explorerStateManager?.setLastSearchText(searchInputText);
    console.log("Search for: ", searchInputText);
    workspaceStateManager?.search(searchInputText);
    //workspaceStateManager?.getAddressBalance(searchInputText);
    //workspaceStateManager?.getAddressTransactions(searchInputText);
    //workspaceStateManager?.getTransaction(searchInputText);
  }



  return (
    <div>
      <TextField
        type="text"
        value={searchInputText}
        onChange={handleSearchInputChange}
      />
      <IconButton onClick={handleSearch}>
        <SearchIcon />
      </IconButton>
      <div>
        {isAddressBalanceDisplayed && (
            <AddressBalanceView
              address={lastSearchInputText}
              balance={foundAddressBalance as number}
            />
        )}
        {isTransactionDisplayed && (foundTransaction) && (
            <TransactionsAccordionList
              transactions={new Map<string, Transaction[]>().set(lastSearchInputText, [foundTransaction as Transaction])}
              myAddresses={[]}
            />
        )}
        {!isAddressFound && !isTransactionFound &&
          <p>No results found</p>
        }
        </div>
    </div>
  );
}