from config_models import Layer2LedgerCommonSettings, SettingsLayer2Address, Layer2LedgerAPIHandlerSettings, PostgresqlDatabaseSettings, RedisSettings, Layer2LedgerDockerEnvSettings
from config_loader import get_project_root, get_config_file
from layer2address import Layer2Address
import random
import string

def get_layer2ledgerbatched_docker_env_settings(environment: str) -> Layer2LedgerDockerEnvSettings:
    """
    Loads and returns the Layer2LedgerDockerEnvSettings for the specified environment.
    """
    root_path = get_project_root()
    config_file_path = root_path + '/backend/layer2ledgerbatched' + f'/.env.{environment}'
    settings = Layer2LedgerDockerEnvSettings.load_from_path(config_file_path)
    return settings

def main():
    project_root = get_project_root()
    print(f"Project root is at: {project_root}")

    services = ['layer2ledgerbatched-common', 'layer2ledgerbatched-layer2ledgerapihandler', 'layer2ledgeroauthmanager', 'layer2ledgerbridge']
    envs = ['dev', 'staging', 'prod']

    env = 'dev'
    print(f"\nLoading configurations for environment: {env}")

    layer2ledgerbatched_docker_env = get_layer2ledgerbatched_docker_env_settings(env)
    print("Layer2LedgerDockerEnvSettings loaded:")
    print(layer2ledgerbatched_docker_env.model_dump_json(indent=4))

    layer2ledgerbatched_common_settings_path = get_config_file('layer2ledgerbatched-common', env)
    print(f"Layer2LedgerCommonSettings config file path: {layer2ledgerbatched_common_settings_path}")

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
    print("Layer2LedgerCommonSettings generated from Docker env:")
    print(layer2ledgerbatched_common_settings.model_dump_json(indent=4))

    layer2ledgerbatched_layer2ledgerapihandler_settings_path = get_config_file('layer2ledgerbatched-layer2ledgerapihandler', env)
    print(f"Layer2LedgerLayer2LedgerApiHandlerSettings config file path: {layer2ledgerbatched_layer2ledgerapihandler_settings_path}")

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
    print("Layer2LedgerAPIHandlerSettings generated from Docker env:")
    print(layer2ledgerbatched_layer2ledgerapihandler_settings_path.model_dump_json(indent=4))



if __name__ == "__main__":
    main()
