from config_models import Layer2LedgerCommonSettings, SettingsLayer2Address, Layer2LedgerAPIHandlerSettings, PostgresqlDatabaseSettings, RedisSettings, Layer2LedgerDockerEnvSettings, Layer2BridgeBitcoinConfFileSettings, Layer2BridgeSettings
from config_loader import get_config_path, get_env_specific_config_path, get_project_root, get_config_file, get_layer2bridge_bitcoinconf_file_path, Services
from misc_utils import generate_secure_password, generate_alphanumeric_id
from layer2address import Layer2Address
from layer1_utils import generate_mnemonic, generate_master_keys_segwit, generate_bitcoin_core_descriptor_segwit, derive_address_from_xpub_segwit, MasterKeys, BitcoinCoreDescriptor
from bitcoin_core_rpc import BitcoinRPCClient
from bitcoin_core_rpc.models import DescriptorImportRequest
import random
import string
import asyncio
from configobj import ConfigObj
from pathlib import Path
from typing import Tuple

def get_layer2ledgerbatched_docker_env_settings(environment: str) -> Layer2LedgerDockerEnvSettings:
    """
    Loads and returns the Layer2LedgerDockerEnvSettings for the specified environment.
    """
    root_path = get_project_root()
    config_file_path = root_path + '/backend/layer2ledgerbatched' + f'/.env.{environment}'
    settings = Layer2LedgerDockerEnvSettings.load_from_path(config_file_path)
    return settings

def generate_keys() -> Tuple[Layer2BridgeSettings, str, str]:
    env = 'dev'
    print(f"\nLoading configurations for environment: {env}")

    project_root = get_project_root()
    out_config_dir = get_env_specific_config_path(environment=env) # Directory where the generated config files will be stored
    out_config_dir_path = Path(out_config_dir)
    if not out_config_dir_path.exists():
        out_config_dir_path.mkdir(parents=True, exist_ok=True)
    print(f"Project root is at: {project_root}")
    print(f"Output config path is at: {out_config_dir}")

    layer2ledgerbatched_docker_env = get_layer2ledgerbatched_docker_env_settings(env)


    # Generate the json config for layer2ledgerbatched-common and layer2ledgerbatched-layer2ledgerapihandler from the values in the docker env
    layer2ledgerbatched_common_settings = Layer2LedgerCommonSettings(
        database=PostgresqlDatabaseSettings(
            db_user=layer2ledgerbatched_docker_env.postgres_user,
            db_password=layer2ledgerbatched_docker_env.postgres_password,
            db_host=layer2ledgerbatched_docker_env.postgres_host,
            db_port=str(layer2ledgerbatched_docker_env.postgres_port),
            db_name=layer2ledgerbatched_docker_env.postgres_db,
        ),
        redis=RedisSettings(
            host=layer2ledgerbatched_docker_env.redis_host,
            port=layer2ledgerbatched_docker_env.redis_port,
        ),
    )

    # Generate keys for the signing address and onboarding address
    layer2bridge_signing_address = Layer2Address()
    layer2bridge_signing_address.new_address()
    onboarding_layer2_deposit_address = Layer2Address()
    onboarding_layer2_deposit_address.new_address()

    # Generate master keys for BTC wallet
    mnemonic = generate_mnemonic(12)
    btc_keys: MasterKeys = generate_master_keys_segwit(mnemonic, testnet=True) # Assuming dev uses testnet

    layer2ledgerbatched_layer2ledgerapihandler_settings = Layer2LedgerAPIHandlerSettings(
        layer2ledger_node_id=''.join(random.choices(string.ascii_lowercase + string.digits, k=16)),
        deposit_wallet_master_pubkey=btc_keys.master_xpub,
        minimum_layer1_transaction_amount=1000,
        layer2bridge_signing_address=SettingsLayer2Address(
            mneumonic=None,
            private_key=layer2bridge_signing_address.private_key_str_base58,
            public_key=layer2bridge_signing_address.public_key_str_base58,
        ),
        deposit_transaction_pubkey=''.join(random.choices(string.ascii_lowercase + string.digits, k=16)),
        layer2bridge_signing_key_uses_functional_test_keys=False,
        onboarding_layer2_deposit_address=SettingsLayer2Address(
            mneumonic=None,
            private_key=onboarding_layer2_deposit_address.private_key_str_base58,
            public_key=onboarding_layer2_deposit_address.public_key_str_base58,
        ),
    )

    layer2bridge_bitcoinconf_file_path = get_layer2bridge_bitcoinconf_file_path()
    layer2bridge_bitcoinconfig_obj = ConfigObj(layer2bridge_bitcoinconf_file_path, encoding='utf-8')
    new_btc_rpcpassword = 'f4cB39dA2kp5Vh' # generate_secure_password(16) # hardcoded for now. TODO: uncomment
    

    selected_chain = layer2bridge_bitcoinconfig_obj.get('chain')
    layer2bridge_bitcoinconfig_obj[selected_chain]['rpcpassword'] = new_btc_rpcpassword
    print(f"Chain specified in bitcoin.conf: {selected_chain}")
    selected_chain_info  = layer2bridge_bitcoinconfig_obj.get(selected_chain, {})

    layer2bridge_bitcoinconf_settings = Layer2BridgeBitcoinConfFileSettings(
        chain=selected_chain,
        rpchost="localhost",
        rpcport=selected_chain_info.get('rpcport'),
        rpcuser=selected_chain_info.get('rpcuser'),
        rpcpassword=selected_chain_info.get('rpcpassword'),
    )

    layer2bridge_settings = Layer2BridgeSettings(
        rpc_settings=layer2bridge_bitcoinconf_settings,
        database_layer2bridge_name='layer2bridge_db.' + env,
        wallet_name='wallet-' + env,
        layer2_node_url='localhost',
        onboarding_signing_private_key=layer2bridge_signing_address.private_key_str_base58,
        import_wallet_privkey_at_startup=False,
        wallet_private_key_seed_mneumonic=mnemonic, # Using the BIP39 mnemonic

    )

    with open(get_config_file('bitcoin.conf', env), 'wb') as f:
        layer2bridge_bitcoinconfig_obj.write(f)

    with open(get_config_file(Services.LAYER2LEDGERBATCHED_COMMON, env), 'w') as f:
        f.write(layer2ledgerbatched_common_settings.model_dump_json(indent=4))

    with open(get_config_file(Services.LAYER2LEDGERBATCHED_LAYER2LEDGERAPIHANDLER, env), 'w') as f:
        f.write(layer2ledgerbatched_layer2ledgerapihandler_settings.model_dump_json(indent=4))

    with open(get_config_file(Services.LAYER2LEDGERBRIDGE, env), 'w') as f:
        f.write(layer2bridge_settings.model_dump_json(indent=4))

    return layer2bridge_settings, btc_keys.master_xprv, btc_keys.master_xpub

async def import_keys_to_bitcoin_core(bridge_settings: Layer2BridgeSettings, master_xprv: str, master_xpub: str) -> None:
    print(f"\nImporting keys to Bitcoin Core wallet: {bridge_settings.wallet_name}")
    
    # Initialize RPC client without wallet name first to create/load wallet
    rpc_client = BitcoinRPCClient(bridge_settings.rpc_settings)
    
    # Try to load wallet, if it fails create it
    try:
        await rpc_client.loadwallet(bridge_settings.wallet_name)
        print(f"Wallet '{bridge_settings.wallet_name}' loaded successfully.")
    except Exception as e:
        print(f"Could not load wallet, attempting to create it. Error: {e}")
        try:
            await rpc_client.createwallet(bridge_settings.wallet_name)
            print(f"Wallet '{bridge_settings.wallet_name}' created successfully.")
        except Exception as e2:
            print(f"Attempted to create wallet but received error: {e2}. Proceeding anyway...")
            # Try loading it one more time just in case it was created but creation returned error
            try:
                await rpc_client.loadwallet(bridge_settings.wallet_name)
                print(f"Wallet '{bridge_settings.wallet_name}' loaded on second attempt.")
            except:
                pass

    # Now use the client with the specific wallet
    rpc_client.wallet_name = bridge_settings.wallet_name
    
    # Generate descriptors
    testnet = bridge_settings.rpc_settings.chain != "main"
    descriptors_data: list[BitcoinCoreDescriptor] = generate_bitcoin_core_descriptor_segwit(master_xprv, testnet=testnet)
    
    import_requests = [
        DescriptorImportRequest(
            desc=d.desc,
            active=d.active,
            internal=d.internal,
            range=d.range,
            timestamp=d.timestamp
        ) for d in descriptors_data
    ]
    
    print("Importing descriptors...")
    try:
        results = await rpc_client.importdescriptors(import_requests)
        for i, res in enumerate(results):
            if res.success:
                print(f"Descriptor {i} imported successfully.")
            else:
                print(f"Failed to import descriptor {i}: {res.error}")
    except Exception as e:
        print(f"Failed to call importdescriptors: {e}")

    # Verification
    print("\nVerifying imported keys...")
    try:
        # Use the specialized getnewaddress method
        new_address = await rpc_client.getnewaddress(address_type="bech32")
        print(f"New address from Bitcoin Core: {new_address}")
        
        # Derive address 0 from xpub for comparison
        derived_address = derive_address_from_xpub_segwit(master_xpub, change=0, address_index=0, testnet=testnet)
        print(f"Derived address 0 from xpub: {derived_address}")
        
        if new_address == derived_address:
            print("✓ Verification successful: Addresses match!")
        else:
            # Bitcoin core might return the next available address if index 0 was already used or if it started at a different index
            # But in a new wallet it should be index 0
            print("! Verification warning: Addresses do not match. This might be expected if the wallet was previously used.")
    except Exception as e:
        print(f"Verification failed with error: {e}")

async def main() -> None:
    bridge_settings, master_xprv, master_xpub = generate_keys()
    await import_keys_to_bitcoin_core(bridge_settings, master_xprv, master_xpub)


if __name__ == "__main__":
    asyncio.run(main())
