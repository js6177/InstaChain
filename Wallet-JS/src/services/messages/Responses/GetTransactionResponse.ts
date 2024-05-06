import CommonResponse from './CommonResponse';
import { GetTransactionsResponseTransaction } from './GetTransactionsResponse';

interface GetTransactionResponse extends CommonResponse{
    transaction_id: string;
    transaction: GetTransactionsResponseTransaction | null;
}

export default GetTransactionResponse;