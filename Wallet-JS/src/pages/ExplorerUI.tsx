import React, { useEffect, useState } from "react";
import IconButton from "@mui/material/IconButton";
import SearchIcon from "@mui/icons-material/Search";
import TextField from "@mui/material/TextField";
import { AddressBalanceView, AddressBalanceViewProps } from "../components/AddressBalanceView";
import { TransactionsAccordionList } from "../components/TransactionsAccordionList";

import { WorkspaceContext } from "../context/WorkspaceContext";
import { Transaction } from "../utils/wallet";
import { IsSuccessResponse } from "../utils/MessageUtils";


export default function ExplorerUI(props: any){
  const {workspace, workspaceStateManager} = React.useContext(WorkspaceContext);
  const [searchInputText, setSearchInputText] = useState<string>(""); // changes every time the user types in the search bar
  const [lastSearchInputText, setLastSearchInputText] = useState<string>(""); // stores the last text that was searched
  const [isAddressFound, setAddressFound] = useState<boolean>(false);
  const [isTransactionFound, setTransactionFound] = useState<boolean>(false);

  const [foundAddressBalance, setFoundAddressBalance] = useState<number>(0);
  const [foundTransaction, setFoundTransaction] = useState<Transaction | null>(null);

  useEffect(() => {
    const addressBalanceResults = workspaceStateManager?.workspace?.searchResults?.get(lastSearchInputText)?.getAddressBalanceResults;
    const _isAddressFound = addressBalanceResults != null && IsSuccessResponse(addressBalanceResults);
    setAddressFound(_isAddressFound);
    const singleTransactionResult = workspaceStateManager?.workspace?.searchResults?.get(lastSearchInputText)?.getSingleTransactionResults;
    const _isTransactionFound = singleTransactionResult != null && IsSuccessResponse(singleTransactionResult);
    setTransactionFound(_isTransactionFound);

    if(_isAddressFound){
      setFoundAddressBalance(workspaceStateManager?.workspace?.searchedAddressBalances?.get(lastSearchInputText) as number);
    }
    if(_isTransactionFound){
      setFoundTransaction(workspaceStateManager?.workspace?.searchedTransaction?.get(lastSearchInputText) as Transaction);
    }
  }, [workspace]);

  const handleSearchInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchInputText(event.target.value);
  };

  const handleSearch = () => {
    //clean the existing search results
    setLastSearchInputText(searchInputText);
    console.log("Search for: ", searchInputText);
    workspaceStateManager?.getAddressBalance(searchInputText);
    //workspaceStateManager?.getAddressTransactions(searchInputText);
    workspaceStateManager?.getTransaction(searchInputText);
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
        {isAddressFound && (
            <AddressBalanceView
              address={lastSearchInputText}
              balance={foundAddressBalance as number}
            />
        )}
        {isTransactionFound && (
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