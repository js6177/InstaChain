from layer1_utils import derive_address_from_xpub_segwit

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
        # Assuming deposit addresses are always receiving addresses (change=0)
        # and we are always using testnet for these generated addresses
        address = derive_address_from_xpub_segwit(master_xpub=master_public_key, change=0, address_index=address_index, testnet=True)
        return address

    except Exception as e:
        print(f"Error generating address: {e}")
        return None