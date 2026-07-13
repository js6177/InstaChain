export { BitcoinRPCClient } from './src/client';
export type { BitcoinRpcClient } from './src/bridge-interface';
export type {
  AddressGrouping,
  AddressGroupingEntry,
  AddressGroupingItem,
  BitcoinRpcError,
  BitcoinRpcResponse,
  BroadcastWithdrawalInput,
  GetBlockChainInfoResult,
  GetBlockHeaderResult,
  GetTransactionDetail,
  GetTransactionResult,
  ListAddressGroupingsResult,
  ListSinceBlockResult,
  ListSinceBlockTransaction,
  LoadWalletResult,
  SendManyAmounts,
  WithdrawalTransactionOutput,
} from './src/models';
export { isWalletAlreadyExists, isWalletAlreadyLoaded } from './src/models';
