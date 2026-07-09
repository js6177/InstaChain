import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import Redis from 'ioredis';
import { Layer2Address } from '@openl2/pubkey-utils';
import {
  loadBackendCommonConfig,
  loadLayer2LedgerAPIHandlerConfig,
  loadLayer2LedgerCommonConfig,
} from '@openl2/config-loader';
import { createDatabase, migrateDatabase } from '../src/db/client';
import { layer2AddressBalance } from '../src/db/schema';
import { DistributedLock } from '../src/redis/distributed-lock';
import { createRouteHandlers } from '../src/services/route-handlers';
import { buildTransferMessage, NODE_ASSET_ID_HEX } from '@openl2/openl2-messaging';
import { PENDING_TRANSACTIONS_LIST_KEY } from '../src/redis/distributed-lock';

const commonConfig = loadLayer2LedgerCommonConfig(process.env.ENVIRONMENT ?? 'test');
const apiHandlerConfig = loadLayer2LedgerAPIHandlerConfig(process.env.ENVIRONMENT ?? 'test');
const backendCommon = loadBackendCommonConfig(process.env.ENVIRONMENT ?? 'test');

const { db, sql } = createDatabase({
  dbUser: commonConfig.database.db_user,
  dbPassword: commonConfig.database.db_password,
  dbHost: commonConfig.database.db_host,
  dbPort: commonConfig.database.db_port,
  dbName: commonConfig.database.db_name,
});

const redis = new Redis({
  host: commonConfig.redis.host,
  port: commonConfig.redis.port,
  maxRetriesPerRequest: null,
});

const lockManager = new DistributedLock(redis);

beforeAll(async () => {
  await migrateDatabase(sql);
  await lockManager.setup();
  await redis.del(PENDING_TRANSACTIONS_LIST_KEY);
});

afterAll(async () => {
  await redis.quit();
  await sql.end();
});

describe('transfer route handler', () => {
  it('queues a signed transfer in redis', async () => {
    const source = new Layer2Address('', '', '', new Uint8Array(), new Uint8Array());
    const dest = new Layer2Address('', '', '', new Uint8Array(), new Uint8Array());
    source.generateNewAddress();
    dest.generateNewAddress();

    await db.insert(layer2AddressBalance).values({
      address: source.public_key_str_base58,
      balance: 1000,
    });

    const transactionId = crypto.randomUUID();
    const amount = 100;
    const fee = 10;
    const message = buildTransferMessage(
      backendCommon.node_id,
      NODE_ASSET_ID_HEX,
      source.public_key_str_base58,
      dest.public_key_str_base58,
      amount,
      fee,
      transactionId,
    );
    const signature = await source.signMessage(message);

    const handlers = createRouteHandlers({
      db,
      redis,
      lockManager,
      settings: apiHandlerConfig,
      messaging: {
        nodeId: backendCommon.node_id,
        layer2BridgeSigningPublicKey: backendCommon.layer2bridge_signing_public_key,
      },
    });

    const response = await handlers.pushTransaction({
      amount,
      destination_address_public_key: dest.public_key_str_base58,
      fee,
      signature,
      source_address_public_key: source.public_key_str_base58,
      transaction_id: transactionId,
    });

    expect(response.error_code).toBe(0);

    const pending = await redis.lindex(PENDING_TRANSACTIONS_LIST_KEY, 0);
    expect(pending).toBeTruthy();
    const parsed = JSON.parse(pending!);
    expect(parsed.transaction.amount).toBe(amount);
    expect(parsed.transaction.layer2_transaction_id).toBe(transactionId);
    await redis.del(PENDING_TRANSACTIONS_LIST_KEY);
  });
});

describe('distributed lock', () => {
  it('acquires and releases a single lock', async () => {
    const token = await lockManager.acquireMultiLock(['alice']);
    expect(token).toBeTruthy();
    const released = await lockManager.releaseMultiLock(['alice'], token!);
    expect(released).toBe(true);
  });

  it('fails when a key is already locked', async () => {
    const token = await lockManager.acquireMultiLock(['bob']);
    expect(token).toBeTruthy();
    const second = await lockManager.acquireMultiLock(['bob']);
    expect(second).toBeNull();
    await lockManager.releaseMultiLock(['bob'], token!);
  });
});
