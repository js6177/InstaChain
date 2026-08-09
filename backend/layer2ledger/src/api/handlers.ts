import type { CommonResponse } from "./models/common";
import type {
	DepositConfirmedRequest,
	GetBalanceRequest,
	GetDepositAddressRequest,
	GetFeeRequest,
	GetTransactionRequest,
	GetTransactionsRequest,
	GetWithdrawalRequestsRequest,
	PushTransactionRequest,
	RequestWithdrawalRequest,
	StartProfilerSessionRequest,
	StopProfilerSessionRequest,
	WithdrawalBroadcastedRequest,
	WithdrawalConfirmedRequest,
} from "./models/requests";
import type {
	DepositConfirmedResponse,
	GetBalanceResponse,
	GetDepositAddressResponse,
	GetFeeResponse,
	GetNodeInfoResponse,
	GetTransactionResponse,
	GetTransactionsResponse,
	GetWithdrawalRequestsResponse,
	StartProfilerSessionResponse,
	StopProfilerSessionResponse,
	WithdrawalBroadcastedResponse,
	WithdrawalConfirmedResponse,
} from "./models/responses";

export interface Layer2LedgerRouteHandlers {
	health(): CommonResponse;
	startProfilerSession(
		body: StartProfilerSessionRequest,
	): Promise<StartProfilerSessionResponse>;
	stopProfilerSession(
		body: StopProfilerSessionRequest,
	): Promise<StopProfilerSessionResponse>;
	pushTransaction(body: PushTransactionRequest): Promise<CommonResponse>;
	getDepositAddress(
		body: GetDepositAddressRequest,
	): Promise<GetDepositAddressResponse>;
	depositConfirmed(
		body: DepositConfirmedRequest,
	): Promise<DepositConfirmedResponse>;
	requestWithdrawal(body: RequestWithdrawalRequest): Promise<CommonResponse>;
	getWithdrawalRequests(
		body: GetWithdrawalRequestsRequest,
	): Promise<GetWithdrawalRequestsResponse>;
	withdrawalBroadcasted(
		body: WithdrawalBroadcastedRequest,
	): Promise<WithdrawalBroadcastedResponse>;
	withdrawalConfirmed(
		body: WithdrawalConfirmedRequest,
	): Promise<WithdrawalConfirmedResponse>;
	getBalance(body: GetBalanceRequest): Promise<GetBalanceResponse>;
	getTransaction(body: GetTransactionRequest): Promise<GetTransactionResponse>;
	getAllTransactions(
		body: GetTransactionsRequest,
	): Promise<GetTransactionsResponse>;
	getFee(body: GetFeeRequest): Promise<GetFeeResponse>;
	getNodeInfo(): Promise<GetNodeInfoResponse>;
}
