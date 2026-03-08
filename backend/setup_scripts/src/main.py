from config_models import Layer2LedgerCommonSettings, SettingsLayer2Address, Layer2LedgerAPIHandlerSettings, PostgresqlDatabaseSettings, RedisSettings, Layer2LedgerDockerEnvSettings, Layer2BridgeBitcoinConfFileSettings, Layer2BridgeSettings, CommonBackendSettings
from config_loader import get_config_directory, get_env_specific_config_directory, get_project_root, get_config_file_path, get_layer2bridge_bitcoinconf_file_path, get_bitcoincore_conf_directory, Services
from misc_utils import generate_secure_password, generate_alphanumeric_id
from layer2address import Layer2Address
from layer1_utils import generate_mnemonic, generate_master_keys_segwit, generate_bitcoin_core_descriptor_segwit, derive_address_from_xpub_segwit, MasterKeys, BitcoinCoreDescriptor
from bitcoin_core_rpc import BitcoinRPCClient
from bitcoin_core_rpc.models import DescriptorImportRequest
import random
import string
import asyncio
import json
import argparse
import shutil
from configobj import ConfigObj
from pathlib import Path
from typing import Tuple, Optional
from enum import StrEnum

class Intermediate(StrEnum):
    BITCOIN_CORE_MASTER_KEYS = 'temp-bitcoincore-master-keys'

def str2bool(v: str | bool) -> bool:
    if isinstance(v, bool):
        return v
    if v.lower() in ('yes', 'true', 't', 'y', '1'):
        return True
    elif v.lower() in ('no', 'false', 'f', 'n', '0'):
        return False
    else:
        raise argparse.ArgumentTypeError('Boolean value expected.')

def get_layer2ledgerbatched_docker_env_settings(environment: str) -> Layer2LedgerDockerEnvSettings:
    """
    Loads and returns the Layer2LedgerDockerEnvSettings for the specified environment.
    """
    root_path = get_project_root()
    config_file_path = root_path / 'backend/layer2ledgerbatched' / f'.env.{environment}'
    settings = Layer2LedgerDockerEnvSettings.load_from_path(str(config_file_path))
    return settings

def generate_keys(env: str, containered: bool = True) -> Tuple[Layer2BridgeSettings, MasterKeys]:
    print(f"\nLoading configurations for environment: {env}")

    project_root = get_project_root()
    out_config_dir = get_env_specific_config_directory(environment=env) # Directory where the generated config files will be stored
    if not out_config_dir.exists():
        out_config_dir.mkdir(parents=True, exist_ok=True)
    print(f"Project root is at: {project_root}")
    print(f"Output config path is at: {out_config_dir}")

    layer2ledgerbatched_docker_env = get_layer2ledgerbatched_docker_env_settings(env)

    db_host = layer2ledgerbatched_docker_env.postgres_host if containered else "localhost"
    redis_host = layer2ledgerbatched_docker_env.redis_host if containered else "localhost"

    # Generate the json config for layer2ledgerbatched-common and layer2ledgerbatched-layer2ledgerapihandler from the values in the docker env
    layer2ledgerbatched_common_settings = Layer2LedgerCommonSettings(
        database=PostgresqlDatabaseSettings(
            db_user=layer2ledgerbatched_docker_env.postgres_user,
            db_password=layer2ledgerbatched_docker_env.postgres_password,
            db_host=db_host,
            db_port=str(layer2ledgerbatched_docker_env.postgres_port),
            db_name=layer2ledgerbatched_docker_env.postgres_db,
        ),
        redis=RedisSettings(
            host=redis_host,
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
        layer2ledger_node_id = generate_alphanumeric_id(),
        deposit_wallet_master_pubkey = btc_keys.master_xpub,
        minimum_layer1_transaction_amount = 1000,
        layer2bridge_signing_address=SettingsLayer2Address(
            mneumonic=None,
            private_key=layer2bridge_signing_address.private_key_str_base58,
            public_key=layer2bridge_signing_address.public_key_str_base58,
        ),
        deposit_transaction_pubkey = generate_alphanumeric_id(),
        layer2bridge_signing_key_uses_functional_test_keys=False,
        onboarding_layer2_deposit_address=SettingsLayer2Address(
            mneumonic=None,
            private_key=onboarding_layer2_deposit_address.private_key_str_base58,
            public_key=onboarding_layer2_deposit_address.public_key_str_base58,
        ),
    )

    layer2bridge_bitcoinconf_file_path = get_layer2bridge_bitcoinconf_file_path()
    layer2bridge_bitcoinconfig_obj = ConfigObj(str(layer2bridge_bitcoinconf_file_path), encoding='utf-8')
    new_btc_rpcpassword = generate_secure_password(16)
    

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
        layer2_node_url=f'http://localhost:{layer2ledgerbatched_docker_env.layer2ledger_fastapi_port}',
        onboarding_signing_private_key=layer2bridge_signing_address.private_key_str_base58
    )

    common_backend_settings: CommonBackendSettings = CommonBackendSettings(
         node_id = layer2ledgerbatched_layer2ledgerapihandler_settings.layer2ledger_node_id,
         layer2bridge_signing_public_key = layer2bridge_signing_address.public_key_str_base58
    )

    with open(get_config_file_path('bitcoin.conf', env), 'wb') as f:
        layer2bridge_bitcoinconfig_obj.write(f)

    with open(get_config_file_path(Services.LAYER2LEDGERBATCHED_COMMON, env), 'w') as f:
        f.write(layer2ledgerbatched_common_settings.model_dump_json(indent=4))

    with open(get_config_file_path(Services.LAYER2LEDGERBATCHED_LAYER2LEDGERAPIHANDLER, env), 'w') as f:
        f.write(layer2ledgerbatched_layer2ledgerapihandler_settings.model_dump_json(indent=4))

    with open(get_config_file_path(Services.LAYER2LEDGERBRIDGE, env), 'w') as f:
        f.write(layer2bridge_settings.model_dump_json(indent=4))

    with open(get_config_file_path(Services.BACKEND_COMMON, env), 'w') as f:
        f.write(common_backend_settings.model_dump_json(indent=4))

    # Store MasterKeys in a temp file
    temp_keys_path = get_config_file_path(Intermediate.BITCOIN_CORE_MASTER_KEYS, env)
    with open(temp_keys_path, 'w') as f:
        f.write(btc_keys.model_dump_json(indent=4))
    print(f"Master keys saved to: {temp_keys_path}")

    return layer2bridge_settings, btc_keys

async def import_keys_to_bitcoin_core(env: str, bridge_settings: Optional[Layer2BridgeSettings] = None, btc_keys: Optional[MasterKeys] = None) -> None:
    if bridge_settings is None:
        bridge_settings_path = get_config_file_path(Services.LAYER2LEDGERBRIDGE, env)
        print(f"Loading bridge settings from: {bridge_settings_path}")
        if not bridge_settings_path.exists():
            print(f"Error: Bridge settings file not found at {bridge_settings_path}. Run with -generate-keys first.")
            return
        with open(bridge_settings_path, 'r') as f:
            bridge_settings = Layer2BridgeSettings.model_validate_json(f.read())
    
    if btc_keys is None:
        temp_keys_path = get_config_file_path(Intermediate.BITCOIN_CORE_MASTER_KEYS, env)
        print(f"Loading master keys from: {temp_keys_path}")
        if not temp_keys_path.exists():
            print(f"Error: Master keys file not found at {temp_keys_path}. Run with -generate-keys first.")
            return
        with open(temp_keys_path, 'r') as f:
            btc_keys = MasterKeys.model_validate_json(f.read())

    print(f"\nImporting keys to Bitcoin Core wallet: {bridge_settings.wallet_name}")
    
    # Initialize RPC client without wallet name first to create/load wallet
    rpc_client = BitcoinRPCClient(bridge_settings.rpc_settings)
    
    # Try to load wallet
    load_resp = await rpc_client.loadwallet(bridge_settings.wallet_name)
    if load_resp.error:
        if load_resp.is_wallet_already_loaded:
            print(f"Wallet '{bridge_settings.wallet_name}' is already loaded.")
        else:
            print(f"Could not load wallet, attempting to create it. Error: {load_resp.error.code} - {load_resp.error.message}")
            create_resp = await rpc_client.createwallet(bridge_settings.wallet_name)
            if create_resp.error:
                if create_resp.is_wallet_already_exists:
                    print(f"Wallet '{bridge_settings.wallet_name}' already exists. Attempting to load it again...")
                    load_resp2 = await rpc_client.loadwallet(bridge_settings.wallet_name)
                    if load_resp2.error and not load_resp2.is_wallet_already_loaded:
                        print(f"Failed to load existing wallet: {load_resp2.error.code} - {load_resp2.error.message}")
                        return
                else:
                    print(f"Failed to create wallet: {create_resp.error.code} - {create_resp.error.message}")
                    return
            else:
                print(f"Wallet '{bridge_settings.wallet_name}' created successfully.")
    else:
        print(f"Wallet '{bridge_settings.wallet_name}' loaded successfully.")

    # Now use the client with the specific wallet
    rpc_client.wallet_name = bridge_settings.wallet_name
    
    # Generate descriptors
    testnet = bridge_settings.rpc_settings.chain != "main"
    descriptors_data: list[BitcoinCoreDescriptor] = generate_bitcoin_core_descriptor_segwit(btc_keys.master_xprv, testnet=testnet)
    
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
        derived_address = derive_address_from_xpub_segwit(btc_keys.master_xpub, change=0, address_index=0, testnet=testnet)
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
    parser = argparse.ArgumentParser(description='Setup scripts for OpenL2')
    parser.add_argument('-env', type=str, default='dev', help='Environment to use (default: dev)')
    parser.add_argument('-generate-keys', action='store_true', help='Generate keys and save to config files')
    parser.add_argument('-import-keys-to-bitcoin-core', action='store_true', help='Import generated keys to Bitcoin Core')
    parser.add_argument('-containered', type=str2bool, default=True, help='Whether the setup is for a containered environment (default: True)')
    parser.add_argument('-overwrite-bitcoinconf', action='store_true', default=False, help='Overwrite the system bitcoin.conf with the project one (only if -containered is False) (default: True)')
    args = parser.parse_args()

    if not args.generate_keys and not args.import_keys_to_bitcoin_core:
        parser.print_help()
        return

    bridge_settings = None
    btc_keys = None

    if args.generate_keys:
        bridge_settings, btc_keys = generate_keys(args.env, containered=args.containered)

    if not args.containered and args.overwrite_bitcoinconf:
        source = get_config_file_path('bitcoin.conf', args.env)
        dest_dir = get_bitcoincore_conf_directory()
        dest = dest_dir / "bitcoin.conf"
        
        print(f"Overwriting system bitcoin.conf at {dest} with {source}")
        if not dest_dir.exists():
            dest_dir.mkdir(parents=True, exist_ok=True)
        
        shutil.copy2(source, dest)

        if args.import_keys_to_bitcoin_core:
            input("Start bitcoin core, and press Enter to import key import...")



    if args.import_keys_to_bitcoin_core:
        await import_keys_to_bitcoin_core(args.env, bridge_settings, btc_keys)


if __name__ == "__main__":
    asyncio.run(main())
