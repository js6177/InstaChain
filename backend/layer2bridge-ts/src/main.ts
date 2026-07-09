import { join } from 'node:path';
import {
  getEnvSpecificOutputDirectory,
  loadBackendCommonConfig,
  loadLayer2BridgeConfig,
  type EnvironmentName,
  resolveEnvironment,
} from '@openl2/config-loader';
import {
  createBridgeDatabase,
  getAllPendingConfirmedTransactions,
  getKeyValue,
  getPendingConfirmedDepositTransactions,
  getPendingConfirmedWithdrawalTransactions,
  getPendingWithdrawals,
  insertConfirmedTransaction,
  insertPendingWithdrawal,
  setKeyValue,
  updateConfirmedTransaction,
  updatePendingWithdrawalBroadcast,
} from './db/client';
import { Layer2Status, PendingWithdrawalStatus, SATOSHI_PER_BITCOIN, type ConfirmedTransactionRow, type PendingWithdrawalRow } from './db/schema';
import { ErrorCodes } from '@openl2/api-layer2ledger';
import { Layer2Interface, successOrDuplicateErrorCode, type WithdrawalBroadcastInput } from './layer2-interface';

export interface BitcoinRpcTransaction {
  txid: string;
  vout: number;
  category: 'receive' | 'send';
  amount: number;
  confirmations: number;
  time: number;
  address?: string;
  blockheight?: number;
}

export interface ListSinceBlockResponse {
  transactions: BitcoinRpcTransaction[];
  lastblock: string;
}

export interface BitcoinRpcClient {
  getConfirmedTransactions(lastBlockHash: string): Promise<ListSinceBlockResponse>;
  getBlockHeader(blockHash: string): Promise<{ height: number }>;
  getTargetConfirmations(): number;
  getMinimumTransactionAmount(): number;
  sendMany(outputs: Record<string, number>): Promise<string>;
}

function log(message: string): void {
  console.log(`${new Date().toISOString()} ${message}`);
}

export class Layer2Bridge {
  bridgeDbPath = '';
  bridgeDb = createBridgeDatabase(':memory:');
  layer2Interface: Layer2Interface | null = null;
  bitcoinRPC: BitcoinRpcClient | null = null;
  lastblockhash = '';
  blockheight = 0;
  confirmedTransactionsDict = new Map<string, ConfirmedTransactionRow>();
  withdrawalTransactionOutputs = new Map<string, PendingWithdrawalRow>();

  loadConfig(environment?: EnvironmentName): void {
    const env = resolveEnvironment(environment);
    const settings = loadLayer2BridgeConfig(env);
    const backendCommon = loadBackendCommonConfig(env);
    this.bridgeDbPath = join(
      getEnvSpecificOutputDirectory(env),
      settings.database_layer2bridge_name,
    );
    this.bridgeDb = createBridgeDatabase(this.bridgeDbPath);
    this.layer2Interface = new Layer2Interface(
      settings.layer2_node_url,
      settings.onboarding_signing_private_key,
      backendCommon.node_id,
    );
  }

  async run(): Promise<void> {
    this.loadConfig();
    if (!this.bitcoinRPC || !this.layer2Interface) {
      throw new Error('bitcoinRPC and layer2Interface must be configured before run()');
    }

    this.lastblockhash = await getKeyValue(this.bridgeDb, 'lastConfirmedBlockHash');

    const pendingConfirmed = await getAllPendingConfirmedTransactions(this.bridgeDb);
    for (const trx of pendingConfirmed) {
      this.confirmedTransactionsDict.set(
        `${trx.transactionId}:${trx.transactionVout}:${trx.category}`,
        trx,
      );
    }

    while (true) {
      await this.getConfirmedTransactionsFromNodeAndSaveToDb();
      await this.getPendingWithdrawalsFromLayer2LedgerAndSaveToDb();
      await this.getPendingWithdrawalsFromDb();
      await this.sendPendingConfirmedDepositsToLayer2Ledger();
      await this.sendPendingConfirmedWithdrawalsToLayer2Ledger();
      await this.broadcastPendingWithdrawals();
      await Bun.sleep(60_000);
    }
  }

  async getConfirmedTransactionsFromNodeAndSaveToDb(): Promise<void> {
    if (!this.bitcoinRPC) return;
    const response = await this.bitcoinRPC.getConfirmedTransactions(this.lastblockhash);
    this.lastblockhash = response.lastblock;
    const header = await this.bitcoinRPC.getBlockHeader(this.lastblockhash);
    this.blockheight = header.height;
    log(`Latest blockheight: ${this.blockheight}`);

    for (const confirmedTransaction of response.transactions) {
      if (confirmedTransaction.confirmations < this.bitcoinRPC.getTargetConfirmations()) {
        continue;
      }
      const key = `${confirmedTransaction.txid}:${confirmedTransaction.vout}:${confirmedTransaction.category}`;
      if (this.confirmedTransactionsDict.has(key)) {
        continue;
      }
      const dbObject: ConfirmedTransactionRow = {
        transactionId: confirmedTransaction.txid,
        transactionVout: confirmedTransaction.vout,
        layer2Status: Layer2Status.PENDING,
        amount: Math.round(confirmedTransaction.amount * SATOSHI_PER_BITCOIN),
        fee: 0,
        address: confirmedTransaction.address ?? '',
        category: confirmedTransaction.category,
        confirmations: confirmedTransaction.confirmations,
        timestamp: confirmedTransaction.time,
      };
      this.confirmedTransactionsDict.set(key, dbObject);
      await insertConfirmedTransaction(this.bridgeDb, dbObject);
    }
    await setKeyValue(this.bridgeDb, 'lastConfirmedBlockHash', this.lastblockhash);
  }

  async getPendingWithdrawalsFromLayer2LedgerAndSaveToDb(): Promise<void> {
    if (!this.layer2Interface) return;
    let lastWithdrawalTimestamp = Number(
      await getKeyValue(this.bridgeDb, 'lastwithdrawalTimestamp'),
    );
    const response = await this.layer2Interface.getWithdrawalRequests(lastWithdrawalTimestamp);
    if (response.error_code !== ErrorCodes.SUCCESS) {
      return;
    }

    for (const wr of response.withdrawal_requests ?? []) {
      await insertPendingWithdrawal(this.bridgeDb, {
        layer2WithdrawalId: wr.layer2_withdrawal_id,
        status: PendingWithdrawalStatus.PENDING,
        transactionId: '',
        amount: wr.amount,
        fee: 0,
        destinationAddress: wr.layer1_address,
        confirmations: 0,
        withdrawalRequestedTimestamp: wr.withdrawal_requested_timestamp,
        dateBroadcasted: 0,
      });
      if (wr.withdrawal_requested_timestamp > lastWithdrawalTimestamp) {
        lastWithdrawalTimestamp = wr.withdrawal_requested_timestamp;
      }
    }
    await setKeyValue(this.bridgeDb, 'lastwithdrawalTimestamp', String(lastWithdrawalTimestamp));
  }

  async getPendingWithdrawalsFromDb(): Promise<void> {
    this.withdrawalTransactionOutputs.clear();
    const pending = await getPendingWithdrawals(this.bridgeDb);
    const minimum = this.bitcoinRPC?.getMinimumTransactionAmount() ?? 1000;
    for (const pendingWithdrawal of pending) {
      if (pendingWithdrawal.amount >= minimum) {
        this.withdrawalTransactionOutputs.set(
          pendingWithdrawal.layer2WithdrawalId,
          pendingWithdrawal,
        );
      }
    }
  }

  async sendPendingConfirmedDepositsToLayer2Ledger(): Promise<void> {
    if (!this.layer2Interface) return;
    const pending = await getPendingConfirmedDepositTransactions(this.bridgeDb);
    if (pending.length === 0) return;
    const response = await this.layer2Interface.sendConfirmDeposit(
      pending.map((trx) => ({
        transactionId: trx.transactionId,
        transactionVout: trx.transactionVout,
        address: trx.address,
        amount: trx.amount,
      })),
    );
    if (response.error_code !== ErrorCodes.SUCCESS) return;
    for (const trx of response.transactions ?? []) {
      if (successOrDuplicateErrorCode(trx.error_code)) {
        await updateConfirmedTransaction(
          this.bridgeDb,
          trx.layer1_transaction_id,
          trx.layer1_transaction_vout,
          'receive',
          Layer2Status.CONFIRMED,
        );
      }
    }
  }

  async sendPendingConfirmedWithdrawalsToLayer2Ledger(): Promise<void> {
    if (!this.layer2Interface) return;
    const pending = await getPendingConfirmedWithdrawalTransactions(this.bridgeDb);
    if (pending.length === 0) return;
    const response = await this.layer2Interface.sendConfirmWithdrawal(
      pending.map((trx) => ({
        transactionId: trx.transactionId,
        transactionVout: trx.transactionVout,
        address: trx.address,
        amount: trx.amount,
      })),
    );
    if (response.error_code !== ErrorCodes.SUCCESS) return;
    for (const trx of response.transactions ?? []) {
      if (successOrDuplicateErrorCode(trx.error_code)) {
        await updateConfirmedTransaction(
          this.bridgeDb,
          trx.layer1_transaction_id,
          trx.layer1_transaction_vout,
          'send',
          Layer2Status.CONFIRMED,
        );
      }
    }
  }

  async broadcastPendingWithdrawals(): Promise<void> {
    if (!this.bitcoinRPC || !this.layer2Interface) return;
    if (this.withdrawalTransactionOutputs.size === 0) return;

    const outputs: Record<string, number> = {};
    for (const withdrawal of this.withdrawalTransactionOutputs.values()) {
      outputs[withdrawal.destinationAddress] =
        (outputs[withdrawal.destinationAddress] ?? 0) + withdrawal.amount / SATOSHI_PER_BITCOIN;
    }
    const txid = await this.bitcoinRPC.sendMany(outputs);
    const broadcasted: WithdrawalBroadcastInput[] = [];
    let vout = 0;
    for (const withdrawal of this.withdrawalTransactionOutputs.values()) {
      broadcasted.push({
        layer1_transaction_id: txid,
        layer1_transaction_vout: vout,
        layer1_address: withdrawal.destinationAddress,
        amount: withdrawal.amount,
        layer2_withdrawal_id: withdrawal.layer2WithdrawalId,
      });
      vout += 1;
      await updatePendingWithdrawalBroadcast(
        this.bridgeDb,
        withdrawal.layer2WithdrawalId,
        txid,
      );
    }
    await this.layer2Interface.sendWithdrawalBroadcasted(broadcasted);
  }
}

if (import.meta.main) {
  const bridge = new Layer2Bridge();
  bridge.loadConfig();
  log('layer2bridge-ts started');

  // In Docker we only need a long-running process so other services can depend on it.
  // The real bridge loop requires a Bitcoin RPC client implementation, which will be
  // wired in as part of the full TypeScript migration.
  // Until then, keep the container alive.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    await Bun.sleep(60_000);
  }
}
