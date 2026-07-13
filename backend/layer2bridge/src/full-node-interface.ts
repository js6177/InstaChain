import {
  BitcoinRPCClient,
  isWalletAlreadyLoaded,
  type AddressGroupingEntry,
  type BitcoinRpcClient,
  type BroadcastWithdrawalInput,
  type GetBlockHeaderResult,
  type GetTransactionResult,
  type ListSinceBlockResult,
  type SendManyAmounts,
  type WithdrawalTransactionOutput,
} from '@openl2/bitcoin-core-rpc';
import type { Layer2BridgeBitcoinConfFileSettings } from '@openl2/config-loader';
import { SATOSHI_PER_BITCOIN } from '@openl2/openl2-messaging';
import type { PendingWithdrawalRow } from './db/schema';

const TESTNET_TARGET_CONFIRMATIONS = 3;
const MAINNET_TARGET_CONFIRMATIONS = 6;
const DEFAULT_MINIMUM_TRANSACTION_AMOUNT = 1000;

function log(message: string): void {
  console.log(`${new Date().toISOString()} ${message}`);
}

function isTestnetChain(chain: string): boolean {
  return chain !== 'main';
}

export class BitcoinFullNodeRpc implements BitcoinRpcClient {
  private readonly client: BitcoinRPCClient;
  private readonly testnet: boolean;

  constructor(
    rpcConfig: Layer2BridgeBitcoinConfFileSettings,
    private readonly walletName: string,
  ) {
    this.client = new BitcoinRPCClient(rpcConfig, walletName);
    this.testnet = isTestnetChain(rpcConfig.chain);
    log(`bitcoin RPC wallet=${walletName} host=${rpcConfig.rpchost}:${rpcConfig.rpcport}`);
  }

  getMinimumTransactionAmount(): number {
    return DEFAULT_MINIMUM_TRANSACTION_AMOUNT;
  }

  getTargetConfirmations(): number {
    return this.testnet ? TESTNET_TARGET_CONFIRMATIONS : MAINNET_TARGET_CONFIRMATIONS;
  }

  async loadWallet(): Promise<void> {
    const response = await this.client.loadWallet(this.walletName);
    if (response.result) {
      return;
    }
    if (isWalletAlreadyLoaded(response.error)) {
      log(`wallet ${this.walletName} already loaded`);
      return;
    }
    if (response.error) {
      throw new Error(`Failed to load wallet: ${response.error.message}`);
    }
    throw new Error('Failed to load wallet: unknown error');
  }

  async getConfirmedTransactions(lastBlockHash: string): Promise<ListSinceBlockResult> {
    const targetConfirmations = lastBlockHash ? this.getTargetConfirmations() : 1;
    log(`lastblockhash: ${lastBlockHash}, targetConfirmations: ${targetConfirmations}`);
    return this.client.listSinceBlock(lastBlockHash, targetConfirmations);
  }

  async getBlockHeader(blockHash: string): Promise<GetBlockHeaderResult> {
    return this.client.getBlockHeader(blockHash);
  }

  async broadcastTransaction(pendingWithdrawals: BroadcastWithdrawalInput[]): Promise<string> {
    const amounts: SendManyAmounts = {};
    const subtractFeeFrom: string[] = [];
    for (const pendingWithdrawal of pendingWithdrawals) {
      subtractFeeFrom.push(pendingWithdrawal.destinationAddress);
      const existingAmount = amounts[pendingWithdrawal.destinationAddress] ?? 0;
      amounts[pendingWithdrawal.destinationAddress] =
        existingAmount + pendingWithdrawal.amountSatoshis / SATOSHI_PER_BITCOIN;
    }
    log(`broadcastTransaction: ${JSON.stringify(amounts)}`);
    const txid = await this.client.sendMany(amounts, {
      minconf: 1,
      subtractFeeFrom,
    });
    log(`/broadcastTransaction: ${txid}`);
    return txid;
  }

  async getTransaction(transactionId: string): Promise<GetTransactionResult> {
    return this.client.getTransaction(transactionId);
  }

  getWithdrawalOutputsFromTransaction(transaction: GetTransactionResult): WithdrawalTransactionOutput[] {
    const outputs: WithdrawalTransactionOutput[] = [];
    for (const detail of transaction.details) {
      if (!detail.address) {
        continue;
      }
      outputs.push({
        address: detail.address,
        vout: detail.vout,
        amountSatoshis: Math.round(Math.abs(detail.amount) * SATOSHI_PER_BITCOIN),
      });
    }
    return outputs;
  }

  async sendMany(outputs: SendManyAmounts): Promise<string> {
    return this.client.sendMany(outputs, { minconf: 1 });
  }

  async getAddressGroupings(): Promise<AddressGroupingEntry[]> {
    const groupings = await this.client.listAddressGroupings();
    const addresses: AddressGroupingEntry[] = [];
    for (const grouping of groupings) {
      for (const entry of grouping) {
        addresses.push({
          address: entry.address,
          amount: entry.amount,
          label: entry.label ?? '',
        });
      }
    }
    return addresses;
  }

  /** Convert bridge DB rows to RPC broadcast inputs. */
  static toBroadcastInputs(
    pendingWithdrawals: Map<string, PendingWithdrawalRow>,
  ): BroadcastWithdrawalInput[] {
    return [...pendingWithdrawals.values()].map((withdrawal) => ({
      withdrawalId: withdrawal.layer2WithdrawalId,
      destinationAddress: withdrawal.destinationAddress,
      amountSatoshis: withdrawal.amount,
    }));
  }
}
