from bip_utils import Bip32, Bip32Utils, Bip32Conf, BitcoinConf, Bip44BitcoinTestNet, WifEncoder
from bip_utils import P2PKH, P2SH, P2WPKH
import hashlib
import binascii
import random
import math
import checksum


BIP32_MAX_INDEX = 2147483647 # (2^31)-1

def generate_private_key_seed() -> str:
    """
    Generates a random 32-byte hexadecimal string to be used as a private key seed.

    Returns:
        A 64-character hexadecimal string representing the private key seed.
    """

    m = hashlib.sha256()
    random_bytes = random.randbytes(32)
    m.update(random_bytes)
    return m.hexdigest()

def generate_private_key_seed_from_mnemonic(mnemonic: str) -> str:
    m = hashlib.sha256()
    m.update(mnemonic.encode('utf-8'))
    return m.hexdigest()


def generate_importdescriptors_from_seed(seed: str, starting_index: int, num_addresses: int, testnet: bool) -> list[dict[str,str]]:
    descriptors: list[dict[str,str]] = [{}]
    seed_bytes = binascii.unhexlify(seed)
    pubkey_version = Bip32Conf.KEY_NET_VER.Test() if testnet else Bip32Conf.KEY_NET_VER.Main()
    privkey_version = BitcoinConf.WIF_NET_VER.Test() if testnet else BitcoinConf.WIF_NET_VER.Main()
    master_bip32_ctx = Bip32.FromSeed(seed_bytes, pubkey_version)
    wif = WifEncoder.Encode(master_bip32_ctx.PrivateKey().Raw().ToBytes(), True, privkey_version)
    master_pubkey = master_bip32_ctx.PublicKey().ToExtended()
    for i in range(starting_index, starting_index + num_addresses):
        divisor = math.floor(i/BIP32_MAX_INDEX)
        remainder = i % BIP32_MAX_INDEX
        bip32_ctx = master_bip32_ctx.ChildKey(44).ChildKey(1).ChildKey(divisor).ChildKey(remainder)
        wif = WifEncoder.Encode(bip32_ctx.PrivateKey().Raw().ToBytes(), True, privkey_version)

        bip32_ctx = Bip32.FromExtendedKey(master_pubkey, pubkey_version)
        bip32_ctx = bip32_ctx.ChildKey(44).ChildKey(1).ChildKey(divisor).ChildKey(remainder)
        descriptor = "pkh(" + master_pubkey + "/44/1/" + str(divisor) + "/" + str(remainder) + ")"
        descriptor_checksum = checksum.AddChecksum(descriptor) #see getdescriptorinfo
        pubkey_bytes = bip32_ctx.PublicKey().RawCompressed().ToBytes()
        address = P2PKH.ToAddress(pubkey_bytes, BitcoinConf.P2PKH_NET_VER.Test())
        importmultiCmd = {'desc': descriptor_checksum, "timestamp": "now", "label": address}
        descriptors.append(importmultiCmd)
    return descriptors


def generate_btc_testnet_address(master_public_key: str, address_index: int) -> str | None:
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
        address = P2PKHAddrEncoder.EncodeKey(public_key, net_ver=CoinsConf.BitcoinTestNet.ParamByKey("p2pkh_net_ver"))

        return address

    except Exception as e:
        print(f"Error generating address: {e}")
        return None