# This script sets up new ecdsa keys for Layer2LedgerAPIHandlerSettings settings file.
from layer2ledgerbatched.layer2ledgerapihandler.config.config import Layer2LedgerAPIHandlerSettings, SettingsLayer2Address
from layer2ledgerbatched.layer2ledgerapihandler.utils.layer2address import Layer2Address
from layer2ledgerbatched.common.config.config import DEFAULT_ENVIRONMENT, Environment
from layer2ledgerbatched.layer2ledgerapihandler.config.config import ROOT_DIR, config_filename
import json
from pathlib import Path


def random_string(length: int):
    import random
    import string
    return ''.join(random.choice(string.ascii_letters + string.digits) for _ in range(length))

def generate_layer2ledgerapihandler_settings():
    layer2bridge_key = Layer2Address()
    layer2bridge_key.new_address()

    layer2_deposit_address = Layer2Address()
    layer2_deposit_address.new_address()

    settings = Layer2LedgerAPIHandlerSettings(
        layer2ledger_node_id = random_string(32),
        deposit_wallet_master_pubkey = random_string(32),
        minimum_layer1_transaction_amount = 1000,
        layer2bridge_signing_address = SettingsLayer2Address(public_key=layer2bridge_key.public_key_str_base58, private_key=layer2bridge_key.private_key_str_base58),
        deposit_transaction_pubkey = random_string(32),
        layer2bridge_signing_key_uses_functional_test_keys = True,
        onboarding_layer2_deposit_address = SettingsLayer2Address(public_key=layer2_deposit_address.public_key_str_base58, private_key=layer2_deposit_address.private_key_str_base58)
    ) 
    settings_json = settings.model_dump_json(indent=4)
    for env in Environment:
        config_path = Path((Path(ROOT_DIR).expanduser())) / env.value / config_filename
        config_path.parent.mkdir(parents=True, exist_ok=True)
        with open(config_path, "w") as f:
            f.write(settings_json)
        print(f"Settings file saved to {config_path}")

if __name__ == "__main__":
    generate_layer2ledgerapihandler_settings()

