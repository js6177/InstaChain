import { eq, sql } from 'drizzle-orm';
import { Elysia, t } from 'elysia';
import { Layer2Address } from '@openl2/pubkey-utils';
import { getTestHelperPort, loadLayer2LedgerCommonConfig } from '@openl2/config-loader';
import { createDatabase, migrateDatabase } from '../db/client';
import { layer2AddressBalance, TransactionType, transactions } from '../db/schema';

const commonConfig = loadLayer2LedgerCommonConfig();
const { db, sql: postgresSql } = createDatabase({
  dbUser: commonConfig.database.db_user,
  dbPassword: commonConfig.database.db_password,
  dbHost: commonConfig.database.db_host,
  dbPort: commonConfig.database.db_port,
  dbName: commonConfig.database.db_name,
});

// Schema reset is handled by layer2ledgerapihandler on test startup. The testhelper
// only seeds data and must not drop tables — compose run would recreate this container
// (e.g. as a wallet-web dependency) and wipe seed data or race migrations.
await migrateDatabase(postgresSql);

const SeedBalanceRequest = t.Object({
  address: t.String(),
  balance: t.Number(),
  include_deposit_transaction: t.Boolean(),
});

const SeedMnemonicRequest = t.Object({
  mnemonic: t.String(),
  balance: t.Number(),
  include_deposit_transaction: t.Boolean(),
});

async function upsertBalance(address: string, balance: number): Promise<void> {
  await db
    .insert(layer2AddressBalance)
    .values({ address, balance })
    .onConflictDoUpdate({
      target: layer2AddressBalance.address,
      set: { balance },
    });
}

async function maybeInsertDepositTransaction(
  address: string,
  balance: number,
  includeDepositTransaction: boolean,
): Promise<void> {
  if (!includeDepositTransaction) {
    return;
  }
  await db.insert(transactions).values({
    amount: balance,
    fee: 0,
    sourceAddressPubkey: 'deposit-source',
    destinationAddressPubkey: address,
    transactionType: TransactionType.TRX_DEPOSIT,
    layer2TransactionId: crypto.randomUUID(),
    signature: 'test-signature',
    signatureDate: 0,
    layer1TransactionId: '',
    layer2WithdrawalId: '',
    batchHeight: 0,
  });
}

const app = new Elysia({ prefix: '/testhelper' })
  .get('/health', () => ({ status: 'ok' }))
  .post(
    '/seed/balance',
    async ({ body }) => {
      await upsertBalance(body.address, body.balance);
      await maybeInsertDepositTransaction(
        body.address,
        body.balance,
        body.include_deposit_transaction,
      );
      return {
        address: body.address,
        balance: body.balance,
        include_deposit_transaction: body.include_deposit_transaction,
      };
    },
    { body: SeedBalanceRequest },
  )
  .post(
    '/seed/mnemonic',
    async ({ body }) => {
      const address = new Layer2Address('', '', '', new Uint8Array(), new Uint8Array());
      address.fromSeed(body.mnemonic);
      await upsertBalance(address.public_key_str_base58, body.balance);
      await maybeInsertDepositTransaction(
        address.public_key_str_base58,
        body.balance,
        body.include_deposit_transaction,
      );
      return {
        address: address.public_key_str_base58,
        balance: body.balance,
        include_deposit_transaction: body.include_deposit_transaction,
      };
    },
    { body: SeedMnemonicRequest },
  )
  .listen({
    // Bind all interfaces so Docker healthchecks and other containers can reach us.
    hostname: '0.0.0.0',
    port: getTestHelperPort(),
  });

console.log(`testhelper listening on http://0.0.0.0:${getTestHelperPort()}`);

export type App = typeof app;
