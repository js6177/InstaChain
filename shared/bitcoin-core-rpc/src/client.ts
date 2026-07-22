import type { Layer2BridgeBitcoinConfFileSettings } from '@openl2/config-loader';
import type {
  BitcoinRpcResponse,
  CreateWalletResult,
  DescriptorImportRequest,
  GetBlockChainInfoResult,
  GetBlockHeaderResult,
  GetTransactionResult,
  ImportDescriptorResult,
  ListAddressGroupingsResult,
  ListSinceBlockResult,
  LoadWalletResult,
  SendManyAmounts,
} from './models';

export class BitcoinRPCClient {
  private readonly baseUrl: string;
  private readonly authHeader: string;

  constructor(
    private readonly config: Layer2BridgeBitcoinConfFileSettings,
    private walletName?: string,
  ) {
    this.baseUrl = `http://${config.rpchost}:${config.rpcport}`;
    this.authHeader = `Basic ${btoa(`${config.rpcuser}:${config.rpcpassword}`)}`;
  }

  withWallet(walletName: string): BitcoinRPCClient {
    return new BitcoinRPCClient(this.config, walletName);
  }

  setWalletName(walletName: string): void {
    this.walletName = walletName;
  }

  private get url(): string {
    if (this.walletName) {
      return `${this.baseUrl}/wallet/${encodeURIComponent(this.walletName)}`;
    }
    return this.baseUrl;
  }

  private async callRaw<T>(method: string, params: unknown[] = []): Promise<BitcoinRpcResponse<T>> {
    const response = await fetch(this.url, {
      method: 'POST',
      headers: {
        Authorization: this.authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '1.0',
        id: 'bitcoin-core-rpc',
        method,
        params,
      }),
      signal: AbortSignal.timeout(120_000),
    });

    const body = (await response.json()) as BitcoinRpcResponse<T>;
    if (!response.ok && body.error === null) {
      throw new Error(`Bitcoin RPC HTTP ${response.status}: ${JSON.stringify(body)}`);
    }
    return body;
  }

  private async call<T>(method: string, params: unknown[] = []): Promise<T> {
    const response = await this.callRaw<T>(method, params);
    if (response.error) {
      throw new Error(`Bitcoin RPC error: ${response.error.code} - ${response.error.message}`);
    }
    if (response.result === null) {
      throw new Error(`Bitcoin RPC returned null result for ${method}`);
    }
    return response.result;
  }

  async getBestBlockHash(): Promise<string> {
    return String(await this.call('getbestblockhash'));
  }

  async getBlockCount(): Promise<number> {
    return Number(await this.call('getblockcount'));
  }

  async getBlockchainInfo(): Promise<GetBlockChainInfoResult> {
    return (await this.call('getblockchaininfo')) as GetBlockChainInfoResult;
  }

  async loadWallet(filename: string): Promise<BitcoinRpcResponse<LoadWalletResult>> {
    return this.callRaw<LoadWalletResult>('loadwallet', [filename]);
  }

  async unloadWallet(walletName: string): Promise<BitcoinRpcResponse<null>> {
    return this.callRaw<null>('unloadwallet', [walletName]);
  }

  async listWallets(): Promise<string[]> {
    return (await this.call<string[]>('listwallets')) ?? [];
  }

  async createWallet(
    walletName: string,
    options?: {
      disablePrivateKeys?: boolean;
      blank?: boolean;
      passphrase?: string;
      avoidReuse?: boolean;
      descriptors?: boolean;
      loadOnStartup?: boolean;
    },
  ): Promise<BitcoinRpcResponse<CreateWalletResult>> {
    const params: unknown[] = [
      walletName,
      options?.disablePrivateKeys ?? false,
      options?.blank ?? false,
      options?.passphrase ?? '',
      options?.avoidReuse ?? false,
      options?.descriptors ?? true,
    ];
    if (options?.loadOnStartup !== undefined) {
      params.push(options.loadOnStartup);
    }
    return this.callRaw<CreateWalletResult>('createwallet', params);
  }

  async importDescriptors(
    requests: DescriptorImportRequest[],
  ): Promise<ImportDescriptorResult[]> {
    return (await this.call<ImportDescriptorResult[]>('importdescriptors', [requests]));
  }

  async getNewAddress(label = '', addressType?: string): Promise<string> {
    const params: unknown[] = [label];
    if (addressType !== undefined) {
      params.push(addressType);
    }
    return String(await this.call('getnewaddress', params));
  }

  async sendMany(
    amounts: SendManyAmounts,
    options?: { minconf?: number; subtractFeeFrom?: string[] },
  ): Promise<string> {
    const minconf = options?.minconf ?? 1;
    const subtractFeeFrom = options?.subtractFeeFrom ?? [];
    const result = await this.call<string | number>('sendmany', [
      '',
      amounts,
      minconf,
      '',
      subtractFeeFrom,
      false,
    ]);
    return String(result);
  }

  async listSinceBlock(
    blockHash = '',
    targetConfirmations = 1,
    includeWatchOnly = true,
    includeRemoved = true,
  ): Promise<ListSinceBlockResult> {
    return (await this.call('listsinceblock', [
      blockHash,
      targetConfirmations,
      includeWatchOnly,
      includeRemoved,
    ])) as ListSinceBlockResult;
  }

  async getTransaction(
    txid: string,
    includeWatchOnly = true,
    verbose = false,
  ): Promise<GetTransactionResult> {
    return (await this.call('gettransaction', [txid, includeWatchOnly, verbose])) as GetTransactionResult;
  }

  async getBlockHeader(blockHash: string, verbose = true): Promise<GetBlockHeaderResult> {
    return (await this.call('getblockheader', [blockHash, verbose])) as GetBlockHeaderResult;
  }

  async listAddressGroupings(): Promise<ListAddressGroupingsResult> {
    const result = await this.call<Array<Array<[string, number, string?]>>>('listaddressgroupings');
    return result.map((group) =>
      group.map(([address, amount, label]) => ({
        address,
        amount,
        label,
      })),
    );
  }
}
