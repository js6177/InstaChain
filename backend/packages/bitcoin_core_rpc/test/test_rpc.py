import pytest
import json
from pathlib import Path
from bitcoin_core_rpc import (
    BitcoinRPCClient,
    GetBlockChainInfoResponse,
    GetBlockHeaderResponse
)
from config_models.models import Layer2BridgeBitcoinConfFileSettings

@pytest.fixture
def rpc_config():
    config_path = Path(__file__).parent / "config" / "config.json"
    with open(config_path, "r") as f:
        data = json.load(f)
    return Layer2BridgeBitcoinConfFileSettings(**data)

@pytest.fixture
def rpc_client(rpc_config):
    return BitcoinRPCClient(rpc_config)

@pytest.mark.asyncio
async def test_getbestblockhash(rpc_client):
    block_hash = await rpc_client.getbestblockhash()
    assert isinstance(block_hash, str)
    assert len(block_hash) == 64
    print(f"\nBest block hash: {block_hash}")

@pytest.mark.asyncio
async def test_getblockcount(rpc_client):
    count = await rpc_client.getblockcount()
    assert isinstance(count, int)
    assert count >= 0
    print(f"Block count: {count}")

@pytest.mark.asyncio
async def test_getblockchaininfo(rpc_client):
    info = await rpc_client.getblockchaininfo()
    assert isinstance(info, GetBlockChainInfoResponse)
    assert info.chain == "testnet4"
    print(f"Chain: {info.chain}, Blocks: {info.blocks}")

@pytest.mark.asyncio
async def test_getblockheader(rpc_client):
    block_hash = await rpc_client.getbestblockhash()
    header = await rpc_client.getblockheader(block_hash)
    assert isinstance(header, GetBlockHeaderResponse)
    assert header.hash == block_hash
    print(f"Block height: {header.height}, Confirmations: {header.confirmations}")
