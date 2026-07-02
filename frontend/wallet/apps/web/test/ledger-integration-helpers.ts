import {
  getDeposit,
  getExplorer,
  getInfo,
  getTransfer,
  getWithdrawal,
  type GetTransactionsResponse,
  type GetTransactionsResponseTransaction,
} from '@openl2/api-layer2ledger'
import { Layer2Address, Layer2Wallet } from '@openl2/wallet-shared'
import {
  buildDepositMessage,
  buildGetDepositAddressMessage,
  buildTransferMessage,
  buildWithdrawalRequestMessage,
  TransactionType,
} from '@openl2/openl2-messaging'

import {
  TESTHELPER_ROUTER_PREFIX,
  TESTHELPER_SEED_BALANCE_ROUTE,
  TESTHELPER_SEED_MNEMONIC_ROUTE,
} from './testhelper-api-paths'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const testDir = dirname(fileURLToPath(import.meta.url))

const API_SUCCESS = 0

interface BridgeConfigFile {
  onboarding_signing_private_key: string
}

interface TestHelperErrorDetail {
  error: string
  message: string
  traceback: string
}

interface TestHelperErrorResponse {
  detail: TestHelperErrorDetail | string
}

interface TestHelperSeedBalanceRequest {
  address: string
  balance: number
  include_deposit_transaction: boolean
}

interface TestHelperSeedMnemonicRequest {
  mnemonic: string
  balance: number
  include_deposit_transaction: boolean
}

interface TestHelperSeedResponse {
  address: string
  balance: number
  include_deposit_transaction: boolean
}

function isTestHelperErrorDetail(detail: unknown): detail is TestHelperErrorDetail {
  if (!detail || typeof detail !== 'object') {
    return false
  }

  return (
    typeof Reflect.get(detail, 'error') === 'string' &&
    typeof Reflect.get(detail, 'message') === 'string' &&
    typeof Reflect.get(detail, 'traceback') === 'string'
  )
}

function parseBridgeConfigFile(value: unknown): BridgeConfigFile | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const onboardingSigningPrivateKey = Reflect.get(value, 'onboarding_signing_private_key')
  if (typeof onboardingSigningPrivateKey !== 'string' || onboardingSigningPrivateKey.length === 0) {
    return null
  }

  return { onboarding_signing_private_key: onboardingSigningPrivateKey }
}

function parseTestHelperErrorResponse(raw: string): TestHelperErrorResponse | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }

  if (!parsed || typeof parsed !== 'object') {
    return null
  }

  const detail = Reflect.get(parsed, 'detail')
  if (typeof detail === 'string') {
    return { detail }
  }

  if (isTestHelperErrorDetail(detail)) {
    return { detail }
  }

  return null
}

function parseTestHelperSeedResponse(value: unknown): TestHelperSeedResponse | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const address = Reflect.get(value, 'address')
  const balance = Reflect.get(value, 'balance')
  const includeDepositTransaction = Reflect.get(value, 'include_deposit_transaction')

  if (
    typeof address !== 'string' ||
    typeof balance !== 'number' ||
    typeof includeDepositTransaction !== 'boolean'
  ) {
    return null
  }

  return {
    address,
    balance,
    include_deposit_transaction: includeDepositTransaction,
  }
}

function formatTestHelperErrorDetail(detail: TestHelperErrorDetail): string {
  return `${detail.error}: ${detail.message}\n${detail.traceback}`
}

let bridgeConfig: BridgeConfigFile | null = null

export function isLedgerIntegrationEnabled(): boolean {
  const apiBase = import.meta.env.VITE_API_BASE_URL ?? ''
  return (
    apiBase.includes('layer2ledgerapihandler') ||
    apiBase.includes('localhost:8000') ||
    apiBase.includes('127.0.0.1:8000')
  )
}

export function getTestHelperBaseUrl(): string {
  return (
    import.meta.env.VITE_TESTHELPER_BASE_URL ??
    'http://layer2ledger-testhelper:8001'
  )
}

export async function loadBridgeConfig(): Promise<void> {
  if (bridgeConfig) return

  const envKey = import.meta.env.VITE_TEST_BRIDGE_SIGNING_PRIVATE_KEY
  if (envKey) {
    bridgeConfig = parseBridgeConfigFile({ onboarding_signing_private_key: envKey })
    return
  }

  try {
    const raw = await readFile(join(testDir, 'test.bridge-config.json'), 'utf-8')
    bridgeConfig = parseBridgeConfigFile(JSON.parse(raw))
    return
  } catch {
    // Optional file — mounted in Docker integration runs.
  }

  const configUrl =
    import.meta.env.VITE_TEST_BRIDGE_CONFIG_URL ?? '/test/test.bridge-config.json'

  try {
    const response = await fetch(configUrl)
    if (response.ok) {
      bridgeConfig = parseBridgeConfigFile(await response.json())
    }
  } catch {
    // Bridge config is only required for deposit integration tests in Docker.
  }
}

export function getBridgeSigningPrivateKey(): string {
  const key = bridgeConfig?.onboarding_signing_private_key
  if (!key) {
    throw new Error(
      'Bridge signing key is not configured. Mount test.bridge-config.json or set VITE_TEST_BRIDGE_SIGNING_PRIVATE_KEY.',
    )
  }
  return key
}

export function createRandomWallet(): Layer2Wallet {
  const wallet = new Layer2Wallet()
  wallet.generateNewMnemonic()
  wallet.fromMnemonic(wallet.mnemonic, 1)
  return wallet
}

export function walletFromMnemonicWords(words: string[]): Layer2Wallet {
  const wallet = new Layer2Wallet()
  wallet.fromMnemonic(words, 1)
  return wallet
}

function bridgeSigner(privateKeyBase58: string): Layer2Address {
  const address = new Layer2Address('', '', '', new Uint8Array(), new Uint8Array())
  address.fromPrivateKeyBase58(privateKeyBase58)
  return address
}

async function formatTesthelperError(response: Response): Promise<string> {
  const raw = await response.text()
  const parsed = parseTestHelperErrorResponse(raw)

  if (parsed?.detail && isTestHelperErrorDetail(parsed.detail)) {
    return formatTestHelperErrorDetail(parsed.detail)
  }

  if (parsed?.detail && typeof parsed.detail === 'string') {
    return parsed.detail
  }

  return raw || response.statusText
}

async function testhelperPost(
  path: string,
  body: TestHelperSeedBalanceRequest | TestHelperSeedMnemonicRequest,
): Promise<TestHelperSeedResponse> {
  const response = await fetch(`${getTestHelperBaseUrl()}${TESTHELPER_ROUTER_PREFIX}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    const detail = await formatTesthelperError(response)
    throw new Error(`testhelper ${path} failed: ${response.status}\n${detail}`)
  }

  const payload: unknown = await response.json()
  const result = parseTestHelperSeedResponse(payload)
  if (!result) {
    throw new Error(`testhelper ${path} returned an invalid seed response`)
  }
  return result
}

export async function seedWalletMnemonic(
  mnemonic: string,
  balanceSats: number,
  includeDepositTransaction = false,
): Promise<string> {
  const request: TestHelperSeedMnemonicRequest = {
    mnemonic,
    balance: balanceSats,
    include_deposit_transaction: includeDepositTransaction,
  }
  const result = await testhelperPost(TESTHELPER_SEED_MNEMONIC_ROUTE, request)
  return result.address
}

export async function seedWalletAddress(
  address: string,
  balanceSats: number,
  includeDepositTransaction = false,
): Promise<void> {
  const request: TestHelperSeedBalanceRequest = {
    address,
    balance: balanceSats,
    include_deposit_transaction: includeDepositTransaction,
  }
  await testhelperPost(TESTHELPER_SEED_BALANCE_ROUTE, request)
}

export async function getNodeContext() {
  const infoApi = getInfo()
  const response = await infoApi.getNodeInfoInfoGetNodeInfoGet()
  if (response.error_code !== API_SUCCESS || !response.node_info) {
    throw new Error(`get_node_info failed: ${response.error_message}`)
  }
  return response.node_info
}

export async function getTransferFee(): Promise<number> {
  const explorer = getExplorer()
  const response = await explorer.getFeeExplorerGetFeePost({})
  if (response.error_code !== API_SUCCESS) {
    throw new Error(`get_fee failed: ${response.error_message}`)
  }
  return response.fee
}

export async function getAddressBalance(publicKey: string): Promise<number> {
  const explorer = getExplorer()
  const response = await explorer.getBalanceExplorerGetBalancePost({
    public_keys: [publicKey],
  })
  if (response.error_code !== API_SUCCESS) {
    throw new Error(`get_balance failed: ${response.error_message}`)
  }
  const entry = response.balance?.find((b) => b.public_key === publicKey)
  return entry?.balance ?? 0
}

export async function getAddressTransactions(
  publicKey: string,
): Promise<GetTransactionsResponseTransaction[]> {
  const explorer = getExplorer()
  const response = await explorer.getAllTransactionsExplorerGetAllTransactionsPost({
    public_keys: [publicKey],
  })
  if (response.error_code !== API_SUCCESS) {
    throw new Error(`get_all_transactions failed: ${response.error_message}`)
  }
  return flattenTransactions(response, publicKey)
}

export function flattenTransactions(
  response: GetTransactionsResponse,
  publicKey: string,
): GetTransactionsResponseTransaction[] {
  const group = response.transaction_groups?.find((g) => g.public_key === publicKey)
  return group?.transactions ?? []
}

export async function waitForBalance(
  publicKey: string,
  expectedBalance: number,
  timeoutMs = 30_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const balance = await getAddressBalance(publicKey)
    if (balance === expectedBalance) return
    await sleep(500)
  }
  const finalBalance = await getAddressBalance(publicKey)
  throw new Error(
    `Timed out waiting for balance of ${publicKey}. Expected ${expectedBalance}, got ${finalBalance}`,
  )
}

export async function waitForMinBalance(
  publicKey: string,
  minimumBalance: number,
  timeoutMs = 30_000,
): Promise<number> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const balance = await getAddressBalance(publicKey)
    if (balance >= minimumBalance) return balance
    await sleep(500)
  }
  const finalBalance = await getAddressBalance(publicKey)
  throw new Error(
    `Timed out waiting for minimum balance on ${publicKey}. Expected >= ${minimumBalance}, got ${finalBalance}`,
  )
}

export async function depositToAddress(
  wallet: Layer2Wallet,
  amountSats: number,
): Promise<string> {
  await loadBridgeConfig()
  const mainAddress = wallet.addresses[0]
  const node = await getNodeContext()
  const depositApi = getDeposit()

  const depositAddressNonce = crypto.randomUUID()
  const depositAddressMessage = buildGetDepositAddressMessage(
    node.node_id,
    node.asset_id,
    mainAddress.public_key_str_base58,
    depositAddressNonce,
  )
  const depositAddressSignature = await mainAddress.signMessage(depositAddressMessage)

  const depositAddressResponse =
    await depositApi.getDepositAddressDepositGetDepositAddressPost({
      layer2_address_pubkey: mainAddress.public_key_str_base58,
      nonce: depositAddressNonce,
      signature: depositAddressSignature,
    })

  if (depositAddressResponse.error_code !== API_SUCCESS) {
    throw new Error(`get_deposit_address failed: ${depositAddressResponse.error_message}`)
  }

  const layer1DepositAddress = depositAddressResponse.layer1_deposit_address
  if (!layer1DepositAddress) {
    throw new Error('get_deposit_address returned no layer1 address')
  }

  const layer1TxId = `test-l1-tx-${crypto.randomUUID()}`
  const confirmNonce = crypto.randomUUID()
  const depositMessage = buildDepositMessage(
    node.node_id,
    layer1TxId,
    0,
    layer1DepositAddress,
    amountSats,
    confirmNonce,
  )
  const bridge = bridgeSigner(getBridgeSigningPrivateKey())
  const depositSignature = await bridge.signMessage(depositMessage)

  const confirmResponse = await depositApi.depositConfirmedDepositDepositConfirmedPost({
    transactions: [
      {
        layer1_transaction_id: layer1TxId,
        layer1_transaction_vout: 0,
        layer1_address: layer1DepositAddress,
        amount: amountSats,
        nonce: confirmNonce,
        signature: depositSignature,
      },
    ],
  })

  if (confirmResponse.error_code !== API_SUCCESS) {
    throw new Error(`deposit_confirmed failed: ${confirmResponse.error_message}`)
  }

  return confirmNonce
}

export async function transferBetweenAddresses(
  source: Layer2Address,
  destinationPublicKey: string,
  amountSats: number,
  feeSats: number,
): Promise<string> {
  const node = await getNodeContext()
  const transferApi = getTransfer()
  const transactionId = crypto.randomUUID()

  const message = buildTransferMessage(
    node.node_id,
    node.asset_id,
    source.public_key_str_base58,
    destinationPublicKey,
    amountSats,
    feeSats,
    transactionId,
  )
  const signature = await source.signMessage(message)

  const response = await transferApi.createTransferTransferPushTransactionPost({
    source_address_public_key: source.public_key_str_base58,
    destination_address_public_key: destinationPublicKey,
    amount: amountSats,
    fee: feeSats,
    transaction_id: transactionId,
    signature,
  })

  if (response.error_code !== API_SUCCESS) {
    throw new Error(`push_transaction failed: ${response.error_message}`)
  }

  return transactionId
}

export async function withdrawFromAddress(
  source: Layer2Address,
  layer1WithdrawalAddress: string,
  amountSats: number,
): Promise<string> {
  const node = await getNodeContext()
  const withdrawalApi = getWithdrawal()
  const transactionId = crypto.randomUUID()

  const message = buildWithdrawalRequestMessage(
    node.node_id,
    node.asset_id,
    source.public_key_str_base58,
    layer1WithdrawalAddress,
    transactionId,
    amountSats,
  )
  const signature = await source.signMessage(message)

  const response = await withdrawalApi.requestWithdrawalWithdrawalRequestWithdrawalPost({
    source_address_public_key: source.public_key_str_base58,
    layer1_withdrawal_address: layer1WithdrawalAddress,
    amount: amountSats,
    layer2_transaction_id: transactionId,
    signature,
  })

  if (response.error_code !== API_SUCCESS) {
    throw new Error(`request_withdrawal failed: ${response.error_message}`)
  }

  return transactionId
}

export function expectDepositTransaction(
  transactions: GetTransactionsResponseTransaction[],
  amountSats: number,
  destinationPublicKey: string,
) {
  const depositTx = transactions.find(
    (tx) =>
      tx.transaction_type === TransactionType.TRX_DEPOSIT &&
      tx.destination_address_pubkey === destinationPublicKey &&
      tx.amount === amountSats,
  )
  if (!depositTx) {
    throw new Error(
      `Expected deposit transaction for ${destinationPublicKey} amount ${amountSats}, got: ${JSON.stringify(transactions)}`,
    )
  }
  return depositTx
}

export function expectTransferTransaction(
  transactions: GetTransactionsResponseTransaction[],
  amountSats: number,
  sourcePublicKey: string,
  destinationPublicKey: string,
) {
  const transferTx = transactions.find(
    (tx) =>
      tx.transaction_type === TransactionType.TRX_TRANSFER &&
      tx.source_address_pubkey === sourcePublicKey &&
      tx.destination_address_pubkey === destinationPublicKey &&
      tx.amount === amountSats,
  )
  if (!transferTx) {
    throw new Error(
      `Expected transfer ${sourcePublicKey} -> ${destinationPublicKey} amount ${amountSats}, got: ${JSON.stringify(transactions)}`,
    )
  }
  return transferTx
}

export function expectWithdrawalTransaction(
  transactions: GetTransactionsResponseTransaction[],
  amountSats: number,
  sourcePublicKey: string,
) {
  const withdrawalTx = transactions.find(
    (tx) =>
      tx.transaction_type === TransactionType.TRX_WITHDRAWAL_INITIATED &&
      tx.source_address_pubkey === sourcePublicKey &&
      tx.amount === amountSats,
  )
  if (!withdrawalTx) {
    throw new Error(
      `Expected withdrawal from ${sourcePublicKey} amount ${amountSats}, got: ${JSON.stringify(transactions)}`,
    )
  }
  return withdrawalTx
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
