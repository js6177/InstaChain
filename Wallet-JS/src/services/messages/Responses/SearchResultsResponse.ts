/*
{
  error_code: 0,
  error_message: "Success",
  l2_address: null,
  l2_transaction: null,
  search_string: "N42zQfGWZwQjKqhGZ15h5Q3HEUareHXDnDLQyo4TUb72Rd2PFajzV79yo18RrRPDeqeFhuiGuRzE4ZYCzrHUUaJ9",
  search_type: "*",
}
*/


import CommonResponse from "./CommonResponse";
import { GetBalanceResponseBalance } from "./GetBalanceResponse";
import { GetTransactionsResponseTransaction } from "./GetTransactionsResponse";

interface SearchResultsResponse extends CommonResponse{
    search_string: string;
    search_type: string;
    l2_transaction: GetTransactionsResponseTransaction | null;
    l2_address: GetBalanceResponseBalance | null;
}

export default SearchResultsResponse;