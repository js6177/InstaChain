from config_models import Layer2LedgerCommonSettings, SettingsLayer2Address, Layer2LedgerAPIHandlerSettings, PostgresqlDatabaseSettings, RedisSettings, Layer2LedgerDockerEnvSettings, Layer2BridgeBitcoinConfFileSettings, Layer2BridgeSettings
from config_loader import get_config_path, get_env_specific_config_path, get_project_root, get_config_file, get_layer2bridge_bitcoinconf_file_path, Services
from misc_utils import generate_secure_password, generate_alphanumeric_id
from layer2address import Layer2Address
import random
import string
from configobj import ConfigObj
from pathlib import Path

def get_layer2ledgerbatched_docker_env_settings(environment: str) -> Layer2LedgerDockerEnvSettings:
    """
    Loads and returns the Layer2LedgerDockerEnvSettings for the specified environment.
    """
    root_path = get_project_root()
    config_file_path = root_path + '/backend/layer2ledgerbatched' + f'/.env.{environment}'
    settings = Layer2LedgerDockerEnvSettings.load_from_path(config_file_path)
    return settings

def main():
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

    layer2ledgerbatched_layer2ledgerapihandler_settings_path = Layer2LedgerAPIHandlerSettings(
        layer2ledger_node_id=''.join(random.choices(string.ascii_lowercase + string.digits, k=16)),
        deposit_wallet_master_pubkey="pubkey-abc",
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
        layer2_node_url='localhost',
        onboarding_signing_private_key=layer2bridge_signing_address.private_key_str_base58,
        import_wallet_privkey_at_startup=False,
        wallet_private_key_seed_mneumonic=generate_alphanumeric_id(32),
    )

    with open(get_config_file('bitcoin.conf', env), 'wb') as f:
        layer2bridge_bitcoinconfig_obj.write(f)

    with open(get_config_file(Services.LAYER2LEDGERBATCHED_COMMON, env), 'w') as f:
        f.write(layer2ledgerbatched_common_settings.model_dump_json(indent=4))

    with open(get_config_file(Services.LAYER2LEDGERBATCHED_LAYER2LEDGERAPIHANDLER, env), 'w') as f:
        f.write(layer2ledgerbatched_layer2ledgerapihandler_settings_path.model_dump_json(indent=4))

    with open(get_config_file(Services.LAYER2LEDGERBRIDGE, env), 'w') as f:
        f.write(layer2bridge_settings.model_dump_json(indent=4))
    


if __name__ == "__main__":
    main()
