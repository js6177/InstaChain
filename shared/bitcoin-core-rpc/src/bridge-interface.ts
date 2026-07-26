import type {
	AddressGroupingEntry,
	BroadcastWithdrawalInput,
	GetBlockHeaderResult,
	GetTransactionResult,
	ListSinceBlockResult,
	WithdrawalTransactionOutput,
} from "./models";

export interface BitcoinRpcClient {
	loadWallet(): Promise<void>;
	getConfirmedTransactions(
		lastBlockHash: string,
	): Promise<ListSinceBlockResult>;
	getBlockHeader(blockHash: string): Promise<GetBlockHeaderResult>;
	getTargetConfirmations(): number;
	getMinimumTransactionAmount(): number;
	broadcastTransaction(
		pendingWithdrawals: BroadcastWithdrawalInput[],
	): Promise<string>;
	getTransaction(transactionId: string): Promise<GetTransactionResult>;
	getWithdrawalOutputsFromTransaction(
		transaction: GetTransactionResult,
	): WithdrawalTransactionOutput[];
	getAddressGroupings(): Promise<AddressGroupingEntry[]>;
}

export type {
	AddressGroupingEntry,
	BroadcastWithdrawalInput,
	GetBlockHeaderResult,
	GetTransactionResult,
	ListSinceBlockResult,
	ListSinceBlockTransaction,
	WithdrawalTransactionOutput,
} from "./models";
