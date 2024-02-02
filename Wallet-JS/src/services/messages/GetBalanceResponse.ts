/* 
{
    "balance": [
      {
        "balance": 136558,
        "public_key": "N42zQfGWZwQjKqhGZ15h5Q3HEUareHXDnDLQyo4TUb72Rd2PFajzV79yo18RrRPDeqeFhuiGuRzE4ZYCzrHUUaJ9"
      }
    ],
    "error_code": 0,
    "error_message": "Success"
} 
*/

import CommonResponse from "./CommonResponse";

interface Balance {
    balance: number;
    public_key: string;
}

interface GetBalanceResponse extends CommonResponse{
    balance: Balance[];
}

export default GetBalanceResponse;