from bip_utils import (
    Bip32Slip10Secp256k1,
    Bip39SeedGenerator,
    Bip32KeyNetVersions,
    WifEncoder
)
import json

def polymod(c, val):
    c0 = c >> 35
    c = ((c & 0x7ffffffff) << 5) ^ val
    if (c0 & 1):
        c ^= 0xf5dee51989
    if (c0 & 2):
        c ^= 0xa9fdca3312
    if (c0 & 4):
        c ^= 0x1bab10e32d
    if (c0 & 8):
        c ^= 0x3706b1677a
    if (c0 & 16):
        c ^= 0x644d626ffd
    return c

def descriptor_checksum(desc: str) -> str:
    INPUT_CHARSET = "0123456789()[],'/*abcdefgh@:$%{}IJKLMNOPQRSTUVWXYZ&+-.;<=>?!^_|~ijklmnopqrstuvwxyzABCDEFGH`#\"\\ ";
    CHECKSUM_CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";

    c = 1
    cls = 0
    clscount = 0
    for ch in desc:
        pos = INPUT_CHARSET.find(ch)
        if pos == -1:
            return ""
        c = polymod(c, pos & 31)
        cls = cls * 3 + (pos >> 5)
        clscount += 1
        if clscount == 3:
            c = polymod(c, cls)
            cls = 0
            clscount = 0
    if clscount > 0:
        c = polymod(c, cls)
    for j in range (0, 8):
        c = polymod(c, 0)
    c ^= 1

    ret = [None] * 8
    for j in range(0, 8):
        ret[j] = CHECKSUM_CHARSET[(c >> (5 * (7 - j))) & 31]
    return ''.join(ret)

def get_key_net_versions(testnet: bool = False):
    """Get the correct key net versions for testnet or mainnet."""
    if testnet:
        return Bip32KeyNetVersions(
            pub_net_ver=bytes.fromhex('043587cf'),  # tpub
            priv_net_ver=bytes.fromhex('04358394')  # tprv
        )
    else:
        return Bip32KeyNetVersions(
            pub_net_ver=bytes.fromhex('0488b21e'),  # xpub
            priv_net_ver=bytes.fromhex('0488ade4')  # xprv
        )


def generate_master_keys_segwit(mnemonic: str, testnet: bool = False):
    """
    Generate master keys for BIP84 using standard xprv/xpub format.
    Derives to m/84'/coin_type'/0' and exports with standard prefixes.
    """
    seed = Bip39SeedGenerator(mnemonic).Generate()
    coin_type = 1 if testnet else 0
    
    # Get key net versions
    key_net_ver = get_key_net_versions(testnet)
    
    # Create master key from seed with correct network
    bip32_ctx = Bip32Slip10Secp256k1.FromSeed(seed, key_net_ver)
    
    # Derive to m/84'/coin_type'/0'
    path_ctx = bip32_ctx.ChildKey(0x80000054)  # 84'
    path_ctx = path_ctx.ChildKey(0x80000000 + coin_type)  # coin_type'
    path_ctx = path_ctx.ChildKey(0x80000000)  # 0'
    
    # Export with standard xprv/xpub
    master_xprv = path_ctx.PrivateKey().ToExtended()
    master_xpub = path_ctx.PublicKey().ToExtended()
    
    derivation_path = f"m/84'/{coin_type}'/0'"
    
    return {
        "master_xprv": master_xprv,
        "master_xpub": master_xpub,
        "derivation_path": derivation_path,
        "testnet": testnet
    }


def derive_address_from_xpub_segwit(master_xpub: str, change: int, address_index: int, testnet: bool = False):
    """
    Derive native SegWit address from xpub.
    """
    # Get correct key net versions
    key_net_ver = get_key_net_versions(testnet)
    
    # Parse extended public key with network version
    bip32_ctx = Bip32Slip10Secp256k1.FromExtendedKey(master_xpub, key_net_ver)
    
    # Derive change/address_index
    change_ctx = bip32_ctx.ChildKey(change)
    address_ctx = change_ctx.ChildKey(address_index)
    
    # Get SegWit address
    from bip_utils import P2WPKHAddrEncoder
    pub_key = address_ctx.PublicKey().RawCompressed().ToBytes()
    
    if testnet:
        address = P2WPKHAddrEncoder.EncodeKey(pub_key, hrp="tb")
    else:
        address = P2WPKHAddrEncoder.EncodeKey(pub_key, hrp="bc")
    
    return address


def derive_address_from_xprv_segwit(master_xprv: str, change: int, address_index: int, testnet: bool = False):
    """
    Derive native SegWit address from xprv with private key.
    """
    # Get correct key net versions
    key_net_ver = get_key_net_versions(testnet)
    
    # Parse extended private key with network version
    bip32_ctx = Bip32Slip10Secp256k1.FromExtendedKey(master_xprv, key_net_ver)
    
    # Derive change/address_index
    change_ctx = bip32_ctx.ChildKey(change)
    address_ctx = change_ctx.ChildKey(address_index)
    
    # Get SegWit address
    from bip_utils import P2WPKHAddrEncoder
    pub_key = address_ctx.PublicKey().RawCompressed().ToBytes()
    
    if testnet:
        address = P2WPKHAddrEncoder.EncodeKey(pub_key, hrp="tb")
    else:
        address = P2WPKHAddrEncoder.EncodeKey(pub_key, hrp="bc")
    
    # Get WIF private key - use WifEncoder
    priv_key_bytes = address_ctx.PrivateKey().Raw().ToBytes()
    
    if testnet:
        # Testnet WIF has prefix 0xef
        private_key_wif = WifEncoder.Encode(priv_key_bytes, net_ver=b'\xef')
    else:
        # Mainnet WIF has prefix 0x80
        private_key_wif = WifEncoder.Encode(priv_key_bytes, net_ver=b'\x80')
    
    return {
        "address": address,
        "private_key_wif": private_key_wif
    }


def generate_bitcoin_core_descriptor_segwit(master_xprv: str, testnet: bool = False, address_range: int = 1000):
    """
    Generate native SegWit descriptors with checksums for Bitcoin Core.
    """
    receiving_desc = f"wpkh({master_xprv}/0/*)"
    change_desc = f"wpkh({master_xprv}/1/*)"
    
    receiving_checksum = descriptor_checksum(receiving_desc)
    change_checksum = descriptor_checksum(change_desc)
    
    descriptors = [
        {
            "desc": f"{receiving_desc}#{receiving_checksum}",
            "active": True,
            "internal": False,
            "range": [0, address_range],
            "next_index": 0,
            "timestamp": "now",
            "label": "BIP84 Receiving"
        },
        {
            "desc": f"{change_desc}#{change_checksum}",
            "active": True,
            "internal": True,
            "range": [0, address_range],
            "next_index": 0,
            "timestamp": "now",
            "label": "BIP84 Change"
        }
    ]
    
    return descriptors


# Example usage
if __name__ == "__main__":
    from bip_utils import Bip39MnemonicGenerator, Bip39WordsNum
    
    mnemonic = Bip39MnemonicGenerator().FromWordsNumber(Bip39WordsNum.WORDS_NUM_12)
    print(f"Mnemonic: {mnemonic}\n")
    
    testnet = True
    keys = generate_master_keys_segwit(mnemonic, testnet=testnet)
    
    print(f"Network: {'Testnet' if testnet else 'Mainnet'}")
    print(f"Derivation Path: {keys['derivation_path']}")
    print(f"Master xprv: {keys['master_xprv']}")
    print(f"Master xpub: {keys['master_xpub']}\n")
    
    # Verify it starts with correct prefix
    if testnet:
        assert keys['master_xprv'].startswith('tprv'), f"Expected tprv, got {keys['master_xprv'][:4]}"
        assert keys['master_xpub'].startswith('tpub'), f"Expected tpub, got {keys['master_xpub'][:4]}"
        print(f"✓ Testnet keys have correct prefixes (tprv/tpub)\n")
    else:
        assert keys['master_xprv'].startswith('xprv'), f"Expected xprv, got {keys['master_xprv'][:4]}"
        assert keys['master_xpub'].startswith('xpub'), f"Expected xpub, got {keys['master_xpub'][:4]}"
        print(f"✓ Mainnet keys have correct prefixes (xprv/xpub)\n")
    
    # Generate addresses
    print("=== Native SegWit Addresses (from xpub) ===")
    for i in range(5):
        addr = derive_address_from_xpub_segwit(keys['master_xpub'], change=0, address_index=i, testnet=testnet)
        print(f"Address {i}: {addr}")
    
    print("\n=== Native SegWit Addresses (from xprv) ===")
    for i in range(3):
        result = derive_address_from_xprv_segwit(keys['master_xprv'], change=0, address_index=i, testnet=testnet)
        print(f"Address {i}: {result['address']}")
        print(f"  Private Key WIF: {result['private_key_wif']}")
    
    print("\n=== Bitcoin Core Descriptors ===")
    descriptors = generate_bitcoin_core_descriptor_segwit(keys['master_xprv'], testnet=testnet)
    print(json.dumps(descriptors, indent=2))
    
    print("\n=== Bitcoin Core Command ===")
    print(f"bitcoin-cli {'-testnet4' if testnet else ''} importdescriptors '")
    print(json.dumps(descriptors, indent=2))
    print("'")