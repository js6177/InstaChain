export interface BitcoinRpcError {
  code: number;
  message: string;
  data?: unknown;
}

export interface BitcoinRpcResponse<T> {
  result: T | null;
  error: BitcoinRpcError | null;
  id: string;
}

export interface LoadWalletResult {
  name: string;
  warning?: string | null;
}

export interface ListSinceBlockTransaction {
  address?: string;
  category: string;
  amount: number;
  vout: number;
  fee?: number;
  confirmations: number;
  blockheight?: number;
  txid: string;
  time: number;
  timereceived?: number;
}

export interface ListSinceBlockResult {
  transactions: ListSinceBlockTransaction[];
  lastblock: string;
}

export interface GetTransactionDetail {
  address?: string;
  category: string;
  amount: number;
  vout: number;
  fee?: number;
}

export interface GetTransactionResult {
  txid: string;
  amount: number;
  fee?: number;
  confirmations: number;
  blockheight?: number;
  time: number;
  details: GetTransactionDetail[];
}

export interface GetBlockHeaderResult {
  hash: string;
  confirmations: number;
  height: number;
}

export interface GetBlockChainInfoResult {
  chain: string;
  blocks: number;
  headers: number;
  bestblockhash: string;
  verificationprogress?: number;
  initialblockdownload?: boolean;
}

export interface BroadcastWithdrawalInput {
  withdrawalId: string;
  destinationAddress: string;
  amountSatoshis: number;
}

/** Address → BTC amount map for Bitcoin Core `sendmany`. */
export type SendManyAmounts = Record<string, number>;

export interface WithdrawalTransactionOutput {
  address: string;
  vout: number;
  amountSatoshis: number;
}

export interface AddressGroupingEntry {
  address: string;
  amount: number;
  label: string;
}

/** One address entry from Bitcoin Core's listaddressgroupings RPC (amount in BTC). */
export interface AddressGroupingItem {
  address: string;
  amount: number;
  label?: string;
}

/** Addresses in a wallet that share common inputs. */
export type AddressGrouping = AddressGroupingItem[];

/** Result of the listaddressgroupings RPC. */
export type ListAddressGroupingsResult = AddressGrouping[];

export interface CreateWalletResult {
  name: string;
  warning?: string | null;
}

export interface DescriptorImportRequest {
  desc: string;
  active?: boolean;
  timestamp?: number | string;
  range?: number | number[];
  internal?: boolean;
  next_index?: number;
  label?: string;
}

export interface ImportDescriptorResult {
  success: boolean;
  warnings?: string[] | null;
  error?: BitcoinRpcError | Record<string, unknown> | null;
}

export function isWalletAlreadyLoaded(error: BitcoinRpcError | null | undefined): boolean {
  return error?.code === -35;
}

export function isWalletAlreadyExists(error: BitcoinRpcError | null | undefined): boolean {
  return error?.code === -4;
}
