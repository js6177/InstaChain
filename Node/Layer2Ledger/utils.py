import math
from bip_utils import Bip32Secp256k1, Bip44Coins, P2PKHAddrEncoder, Bip32KeyNetVersions
from bip_utils.bip.bip32.bip32_const import Bip32Const
from bip_utils.coin_conf import CoinsConf

BIP32_MAX_INDEX = 2147483647 # (2^31)-1

def generate_btc_testnet_address(master_public_key: str, address_index: int) -> str:
    """
    Generates a Bitcoin Testnet address using a master public key and derivation path.

    Args:
        master_public_key: The master public key in extended format (tpub...).
        address_index: The nth address to generate.

    Returns:
        The Bitcoin Testnet address. Or None if an error occurs.
    """
    try:
        divisor = math.floor(address_index/BIP32_MAX_INDEX)
        remainder = address_index % BIP32_MAX_INDEX
        derivation_path = f"m/44/1/{divisor}/{remainder}"

        # Create a Bip32 object from the master public key (Secp256k1 curve)
        bip32_obj = Bip32Secp256k1.FromExtendedKey(master_public_key, Bip32Const.TEST_NET_KEY_NET_VERSIONS)

        # Derive the child key
        derived_key = bip32_obj.DerivePath(derivation_path)

        # Get the derived public key
        public_key = derived_key.PublicKey().RawCompressed().ToBytes()

        # Generate the testnet address
        address = P2PKHAddrEncoder.EncodeKey(public_key, net_ver=CoinsConf.BitcoinTestNet.ParamByKey("p2sh_net_ver"))

        return address

    except Exception as e:
        print(f"Error generating address: {e}")
        return None