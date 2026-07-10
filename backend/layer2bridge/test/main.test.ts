import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Layer2Bridge, type BitcoinRpcClient } from '../src/main';
import { createBridgeDatabase, getKeyValue, getPendingWithdrawals } from '../src/db/client';
import { Layer2Status, SATOSHI_PER_BITCOIN } from '../src/db/schema';

let tempDir = '';

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'layer2bridge-'));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

function createBridgeWithMocks(): Layer2Bridge {
  const bridge = new Layer2Bridge();
  bridge.loadConfig('test');
  bridge.bridgeDb = createBridgeDatabase(join(tempDir, 'bridge.sqlite'));
  bridge.bitcoinRPC = {
    getConfirmedTransactions: mock(async () => ({
      lastblock: 'blockhash1',
      transactions: [
        {
          txid: 'tx1',
          vout: 0,
          category: 'receive',
          amount: 0.01,
          confirmations: 6,
          time: 1000,
          address: 'addr1',
        },
      ],
    })),
    getBlockHeader: mock(async () => ({ height: 100 })),
    getTargetConfirmations: () => 3,
    getMinimumTransactionAmount: () => 1000,
    sendMany: mock(async () => 'broadcast-tx'),
  } satisfies BitcoinRpcClient;
  bridge.layer2Interface = {
    getWithdrawalRequests: mock(async () => ({
      error_code: 0,
      withdrawal_requests: [
        {
          layer2_withdrawal_id: 'w1',
          amount: 50_000,
          layer1_address: 'dest1',
          withdrawal_requested_timestamp: 2000,
        },
      ],
    })),
    sendConfirmDeposit: mock(async () => ({
      error_code: 0,
      transactions: [{ layer1_transaction_id: 'tx1', layer1_transaction_vout: 0, error_code: 0 }],
    })),
    sendConfirmWithdrawal: mock(async () => ({ error_code: 0, transactions: [] })),
    sendWithdrawalBroadcasted: mock(async () => ({ error_code: 0 })),
  } as never;
  return bridge;
}

describe('layer2bridge', () => {
  it('stores confirmed transactions from the node', async () => {
    const bridge = createBridgeWithMocks();
    await bridge.getConfirmedTransactionsFromNodeAndSaveToDb();
    expect(bridge.lastblockhash).toBe('blockhash1');
    expect(await getKeyValue(bridge.bridgeDb, 'lastConfirmedBlockHash')).toBe('blockhash1');
    const pending = await bridge.bridgeDb.select().from(
      (await import('../src/db/schema')).confirmedTransactions,
    );
    expect(pending[0]?.amount).toBe(0.01 * SATOSHI_PER_BITCOIN);
  });

  it('stores pending withdrawals from layer2ledger', async () => {
    const bridge = createBridgeWithMocks();
    await bridge.getPendingWithdrawalsFromLayer2LedgerAndSaveToDb();
    const pending = await getPendingWithdrawals(bridge.bridgeDb);
    expect(pending[0]?.layer2WithdrawalId).toBe('w1');
    expect(Number(await getKeyValue(bridge.bridgeDb, 'lastwithdrawalTimestamp'))).toBe(2000);
  });

  it('filters withdrawals below the minimum amount', async () => {
    const bridge = createBridgeWithMocks();
    await bridge.getPendingWithdrawalsFromLayer2LedgerAndSaveToDb();
    bridge.bitcoinRPC!.getMinimumTransactionAmount = () => 100_000;
    await bridge.getPendingWithdrawalsFromDb();
    expect(bridge.withdrawalTransactionOutputs.size).toBe(0);
  });

  it('acknowledges deposit confirmations from layer2ledger', async () => {
    const bridge = createBridgeWithMocks();
    await bridge.getConfirmedTransactionsFromNodeAndSaveToDb();
    await bridge.sendPendingConfirmedDepositsToLayer2Ledger();
    const rows = await bridge.bridgeDb.select().from(
      (await import('../src/db/schema')).confirmedTransactions,
    );
    expect(rows[0]?.layer2Status).toBe(Layer2Status.CONFIRMED);
  });
});
