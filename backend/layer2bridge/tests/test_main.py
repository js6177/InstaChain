import pytest
import asyncio
from unittest.mock import MagicMock, AsyncMock
from pathlib import Path
import os
import shutil

from layer2bridge.main import Layer2Bridge
from layer2bridge import database_interface as DatabaseInterface
from layer2bridge import layer2interface as Layer2Interface
from layer2bridge.full_node_interface import BitcoinRPC
from config_loader.loader import Environment
from bitcoin_core_rpc.models import (
    ListSinceBlockResponse,
    ListSinceBlockTransaction,
    GetBlockHeaderResponse,
    GetTransactionResponse,
    GetTransactionDetail
)
from openl2_layer2ledger_api.models.responses import (
    GetWithdrawalRequestsResponse, 
    WithdrawalRequest,
    DepositConfirmedResponse,
    Layer1TransactionIdStatus,
    WithdrawalConfirmedResponse,
    Layer1WithdrawalConfirmedTransactionStatus,
    WithdrawalBroadcastedResponse,
    Layer1BroadcastedWithdrawalTransactionStatus
)

@pytest.fixture
def bridge():
    # Setup
    bridge = Layer2Bridge()
    bridge.loadConfig(Environment.TEST.value)
    
    # Ensure database directory is clean
    output_dir = bridge.database_layer2bridge_full_path.parent
    if output_dir.exists():
        shutil.rmtree(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    
    bridge.layer2BridgeDB = DatabaseInterface.DB(bridge.database_layer2bridge_full_path)
    bridge.layer2BridgeDB.openOrCreateDB()
    
    bridge.bitcoinRPC = MagicMock(spec=BitcoinRPC)
    bridge.layer2Interface = MagicMock(spec=Layer2Interface.Layer2Interface)
    
    bridge.lastblockhash = ''
    bridge.confirmedTransactionsDict = {}
    bridge.blockheight = 0
    bridge.withdrawalTransactionOutputs = {}
    
    yield bridge
    
    # Teardown
    bridge.close()
    if output_dir.exists():
        shutil.rmtree(output_dir)

@pytest.mark.asyncio
async def test_getConfirmedTransactionsFromNodeAndSaveToDb(bridge: Layer2Bridge):
    # Mock data
    tx = ListSinceBlockTransaction(
        txid="tx1",
        vout=0,
        category="receive",
        amount=0.01,
        confirmations=6,
        time=1000,
        timereceived=1000,
        bip125_replaceable="no",
        address="addr1",
        blockheight=100
    )
    
    mock_response = ListSinceBlockResponse(
        transactions=[tx],
        lastblock="blockhash1"
    )
    
    bridge.bitcoinRPC.getConfirmedTransactions = AsyncMock(return_value=mock_response)
    bridge.bitcoinRPC.getTargetConfirmations = MagicMock(return_value=3)
    bridge.bitcoinRPC.getBlockHeader = AsyncMock(return_value=GetBlockHeaderResponse(
        hash="blockhash1", confirmations=1, height=100, version=1, versionHex="1",
        merkleroot="root", time=1000, mediantime=1000, nonce=1, bits="1",
        difficulty=1.0, chainwork="1", nTx=1
    ))
    
    # Run
    await bridge.getConfirmedTransactionsFromNodeAndSaveToDb()
    
    # Verify
    assert bridge.lastblockhash == "blockhash1"
    assert bridge.layer2BridgeDB.getLastBlockHash() == "blockhash1"
    
    pending_txs = bridge.layer2BridgeDB.getAllPendingConfirmedTransactions()
    assert len(pending_txs) == 1
    assert pending_txs[0].transaction_id == "tx1"
    assert pending_txs[0].amount == 1000000 # 0.01 * 10^8

@pytest.mark.asyncio
async def test_getPendingWithdrawalsFromLayer2LedgerAndSaveToDb(bridge: Layer2Bridge):
    # Mock data
    wr = WithdrawalRequest(
        layer2_withdrawal_id="w1",
        amount=50000,
        layer1_address="dest1",
        withdrawal_requested_timestamp=2000,
        layer1_transaction_id=None,
        status=1,
        server_signature=None,
        layer2_transaction_id="l2tx1",
        withdrawal_requested_timestamp_str=None
    )
    
    mock_response = GetWithdrawalRequestsResponse(
        error_code=0,
        error_message="success",
        withdrawal_requests=[wr]
    )
    
    bridge.layer2Interface.getWithdrawalRequests = AsyncMock(return_value=mock_response)
    
    # Run
    await bridge.getPendingWithdrawalsFromLayer2LedgerAndSaveToDb()
    
    # Verify
    assert bridge.layer2BridgeDB.getLastWithdrawalRequestTimestamp() == 2000
    
    pending_withdrawals = bridge.layer2BridgeDB.getPendingWithdrawals()
    assert len(pending_withdrawals) == 1
    assert pending_withdrawals[0].layer2_withdrawal_id == "w1"
    assert pending_withdrawals[0].amount == 50000

@pytest.mark.asyncio
async def test_getPendingWithdrawalsFromDb(bridge: Layer2Bridge):
    # Setup DB
    withdrawal = DatabaseInterface.PendingWithdrawal(
        layer2_withdrawal_id="w2",
        status=int(DatabaseInterface.PendingWithdrawal.Layer1Status.PENDING),
        amount=100000,
        destination_address="dest2",
        withdrawal_requested_timestamp=3000
    )
    bridge.layer2BridgeDB.insertPendingWithdrawal(withdrawal)
    
    bridge.bitcoinRPC.getMinimumTransactionAmount = MagicMock(return_value=1000)
    
    # Run
    bridge.getPendingWithdrawalsFromDb()
    
    # Verify
    assert "w2" in bridge.withdrawalTransactionOutputs
    assert bridge.withdrawalTransactionOutputs["w2"].amount == 100000
    assert bridge.withdrawalTransactionOutputs["w2"].destination_address == "dest2"
    assert bridge.withdrawalTransactionOutputs["w2"].status == int(DatabaseInterface.PendingWithdrawal.Layer1Status.PENDING)

@pytest.mark.asyncio
async def test_getPendingWithdrawalsFromDb_skipsSmallAmount(bridge: Layer2Bridge):
    # Setup DB
    withdrawal = DatabaseInterface.PendingWithdrawal(
        layer2_withdrawal_id="w3",
        status=int(DatabaseInterface.PendingWithdrawal.Layer1Status.PENDING),
        amount=500,
        destination_address="dest3",
        withdrawal_requested_timestamp=4000
    )
    bridge.layer2BridgeDB.insertPendingWithdrawal(withdrawal)
    
    bridge.bitcoinRPC.getMinimumTransactionAmount = MagicMock(return_value=1000)
    
    # Run
    bridge.getPendingWithdrawalsFromDb()
    
    # Verify
    assert "w3" not in bridge.withdrawalTransactionOutputs

@pytest.mark.asyncio
async def test_sendPendingConfirmedDepositsToLayer2Ledger(bridge: Layer2Bridge):
    # Setup DB
    tx = DatabaseInterface.ConfirmedTransaction(
        transaction_id="tx_dep1",
        transaction_vout=0,
        layer2_status=int(DatabaseInterface.ConfirmedTransaction.Layer2Status.PENDING),
        amount=100000,
        address="addr_dep1",
        category=DatabaseInterface.ConfirmedTransaction.Category.RECIEVE.value
    )
    bridge.layer2BridgeDB.insertConfirmedTransaction(tx)
    
    mock_response = DepositConfirmedResponse(
        error_code=0,
        error_message="success",
        transactions=[Layer1TransactionIdStatus(
            error_code=0,
            error_message="success",
            layer1_transaction_id="tx_dep1",
            layer1_transaction_vout=0
        )]
    )
    bridge.layer2Interface.sendConfirmDeposit = AsyncMock(return_value=mock_response)
    
    # Run
    await bridge.sendPendingConfirmedDepositsToLayer2Ledger()
    
    # Verify
    pending_deposits = bridge.layer2BridgeDB.getPendingConfirmedDepositTransactions()
    assert len(pending_deposits) == 0 # Should be confirmed now

@pytest.mark.asyncio
async def test_sendPendingConfirmedWithdrawalsToLayer2Ledger(bridge: Layer2Bridge):
    # Setup DB
    tx = DatabaseInterface.ConfirmedTransaction(
        transaction_id="tx_wd1",
        transaction_vout=1,
        layer2_status=int(DatabaseInterface.ConfirmedTransaction.Layer2Status.PENDING),
        amount=50000,
        address="addr_wd1",
        category=DatabaseInterface.ConfirmedTransaction.Category.SEND.value
    )
    bridge.layer2BridgeDB.insertConfirmedTransaction(tx)
    
    mock_response = WithdrawalConfirmedResponse(
        error_code=0,
        error_message="success",
        transactions=[Layer1WithdrawalConfirmedTransactionStatus(
            error_code=0,
            error_message="success",
            layer1_transaction_id="tx_wd1",
            layer1_transaction_vout=1
        )]
    )
    bridge.layer2Interface.sendConfirmWithdrawal = AsyncMock(return_value=mock_response)
    
    # Run
    await bridge.sendPendingConfirmedWithdrawalsToLayer2Ledger()
    
    # Verify
    pending_withdrawals = bridge.layer2BridgeDB.getPendingConfirmedWithdrawalTransactions()
    assert len(pending_withdrawals) == 0 # Should be confirmed now

@pytest.mark.asyncio
async def test_broadcastPendingWithdrawals(bridge: Layer2Bridge):
    # Setup DB and state
    withdrawal = DatabaseInterface.PendingWithdrawal(
        layer2_withdrawal_id="l2w1",
        status=int(DatabaseInterface.PendingWithdrawal.Layer1Status.PENDING),
        amount=60000,
        destination_address="dest_addr1",
        withdrawal_requested_timestamp=1000
    )
    bridge.layer2BridgeDB.insertPendingWithdrawal(withdrawal)
    bridge.withdrawalTransactionOutputs = {"l2w1": withdrawal}
    bridge.blockheight = 100
    bridge.layer2BridgeDB.setLastBroadcastBlockHeight(90)
    bridge.layer2BridgeDB.setBroadcastTransactionBlockDelay(5) # 90 + 5 = 95 < 100
    
    bridge.bitcoinRPC.broadcastTransaction = AsyncMock(return_value="tx_broadcast1")
    
    # Mock getTransaction to return output details
    mock_get_tx_response = GetTransactionResponse(
        amount=-0.0006,
        confirmations=0,
        txid="tx_broadcast1",
        time=2000,
        timereceived=2000,
        bip125_replaceable="no",
        details=[
            GetTransactionDetail(
                address="dest_addr1",
                category="send",
                amount=-0.0006,
                vout=0
            )
        ],
        hex="0101"
    )
    bridge.bitcoinRPC.getTransaction = AsyncMock(return_value=mock_get_tx_response)
    
    mock_l2_response = WithdrawalBroadcastedResponse(
        error_code=0,
        error_message="success",
        transactions=[Layer1BroadcastedWithdrawalTransactionStatus(
            error_code=0,
            error_message="success",
            layer2_withdrawal_id="l2w1"
        )]
    )
    bridge.layer2Interface.sendWithdrawalBroadcasted = AsyncMock(return_value=mock_l2_response)
    
    # Run
    await bridge.broadcastPendingWithdrawals()
    
    # Verify
    assert bridge.layer2BridgeDB.getLastBroadcastBlockHeight() == 100
    
    # Check if withdrawal status was updated in DB
    updated_withdrawal = bridge.layer2BridgeDB.getPendingWithdrawal("l2w1")
    assert updated_withdrawal is not None
    assert updated_withdrawal.status == int(DatabaseInterface.PendingWithdrawal.Layer1Status.BROADCASTED)
    assert updated_withdrawal.transaction_id == "tx_broadcast1"
