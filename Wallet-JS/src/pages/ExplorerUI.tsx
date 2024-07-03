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
import { AddressPresenter, AddressPresenterFromRoute } from "../components/Explorer/AddressPresenter";
import {ErrorPresenter} from "../components/Explorer/ErrorPresenter";

import { Routes, Route, useNavigate } from 'react-router-dom';
import { TransactionPresenterFromRoute } from "../components/Explorer/TransactionPresenter";
import { SearchResultsPresenterFromRoute } from "../components/Explorer/SearchResultsPresenter";

export default function ExplorerUI(props: any){
  const navigate = useNavigate();

  const {workspace, workspaceStateManager} = React.useContext(WorkspaceContext);
  const {explorerState, explorerStateManager} = React.useContext(ExplorerContext);
  const [searchInputText, setSearchInputText] = useState<string>(explorerState?.lastSearchText || ""); // changes every time the user types in the search bar


  const handleSearchInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchInputText(event.target.value);
    explorerState?.setLastSearchText(event.target.value);
  };

  const handleSearch = () => {
    // navigate to the search results page (SearchResultsPresenterFromRoute)
    navigate(`search/${searchInputText}`); 
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
      <Routes>
        <Route path="/search/:searchString" element={<SearchResultsPresenterFromRoute />} />
        <Route path="/address/:address" element={<AddressPresenterFromRoute />} />
        <Route path="/transaction/:transactionID" element={<TransactionPresenterFromRoute />} />
        <Route path="*" element={<ErrorPresenter />} />
      </Routes>
    </div>
  );
}