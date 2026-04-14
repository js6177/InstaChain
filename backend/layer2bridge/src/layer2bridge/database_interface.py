from __future__ import annotations

from pathlib import Path
from typing import Any, ClassVar, Dict, List, Optional

from sqlalchemy import Index, Integer, String, create_engine
from sqlalchemy.orm import Mapped, Session, declarative_base, mapped_column, sessionmaker

from bitcoin_core_rpc import (
    ListSinceBlockTransaction,
    GetTransactionResponse,
    GetTransactionDetail,
)
from layer2bridge.onboarding_logger import OnboardingLogger

from openl2_messaging.constants import SATOSHI_PER_BITCOIN

DEFAULT_DATABASE_NAME = "bitcoin.db"

Base = declarative_base()


class ConfirmedTransaction(Base):
    __tablename__ = "ConfirmedTransactions"

    __allow_unmapped__ = True

    #values for layer2 status (deposits)
    LAYER2_STATUS_PENDING: ClassVar[int] = 1
    LAYER2_STATUS_CONFIRMED: ClassVar[int] = 2

    CATEGORY_SEND: ClassVar[str] = "send"
    CATEGORY_RECIEVE: ClassVar[str] = "receive"

    transaction_id: Mapped[str] = mapped_column(String, primary_key=True)
    layer2_status: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    transaction_vout: Mapped[int] = mapped_column(Integer, primary_key=True)
    amount: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    fee: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    address: Mapped[str] = mapped_column(String, nullable=False, default="")
    category: Mapped[str] = mapped_column(String, primary_key=True)
    confirmations: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    timestamp: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    blockheight: int = 0

    __table_args__ = (
        Index("UIX_ConfirmedTransactions_layer2_status", "layer2_status"),
    )

    def setValues(
        self,
        transaction_id: str,
        layer2_status: Optional[int],
        transaction_vout: int,
        amount: int,
        fee: int,
        address: str,
        category: str,
        confirmations: int,
        timestamp: int,
        blockheight: int,
    ) -> None:
        self.transaction_id = transaction_id
        self.transaction_vout = transaction_vout
        self.layer2_status = layer2_status
        self.amount = amount
        self.fee = fee
        self.address = address
        self.category = category
        self.confirmations = confirmations
        self.timestamp = timestamp
        self.blockheight = blockheight

    def fromBitcoinRpcListSinceBlockTransactions(
        self, transaction: ListSinceBlockTransaction
    ) -> ConfirmedTransaction:
        self.setValues(
            transaction.txid,
            ConfirmedTransaction.LAYER2_STATUS_PENDING,
            transaction.vout,
            int(transaction.amount * SATOSHI_PER_BITCOIN),
            0,
            transaction.address or "",
            transaction.category,
            transaction.confirmations,
            transaction.time,
            transaction.blockheight or 0,
        )
        return self

    def fromBitcoinRpcGetTransactionResponseDetails(
        self,
        transactionDetail: GetTransactionDetail,
        transaction_id: str,
        blockheight: int,
        timestamp: int,
    ) -> ConfirmedTransaction:
        self.setValues(
            transaction_id,
            ConfirmedTransaction.LAYER2_STATUS_PENDING,
            transactionDetail.vout,
            int(transactionDetail.amount * SATOSHI_PER_BITCOIN),
            int((transactionDetail.fee or 0) * SATOSHI_PER_BITCOIN),
            transactionDetail.address or "",
            transactionDetail.category,
            0,
            timestamp,
            blockheight,
        )
        return self

    @staticmethod
    def fromBitcoinRpcGetTransactionResponse(
        bitcoinRpcGetTransactionResponse: GetTransactionResponse,
    ) -> Dict[str, ConfirmedTransaction]:
        outputs: Dict[str, ConfirmedTransaction] = {}
        for transactionDetail in bitcoinRpcGetTransactionResponse.details:
            output = ConfirmedTransaction().fromBitcoinRpcGetTransactionResponseDetails(
                transactionDetail,
                bitcoinRpcGetTransactionResponse.txid,
                bitcoinRpcGetTransactionResponse.blockheight or 0,
                bitcoinRpcGetTransactionResponse.time,
            )
            outputs[output.address] = output
        return outputs


class PendingWithdrawal(Base):
    __tablename__ = "PendingWithdrawals"

    __allow_unmapped__ = True

    #values for layer1 status (withdrawal requests)
    LAYER1_STATUS_PENDING: ClassVar[int] = 1
    LAYER1_STATUS_BROADCASTED: ClassVar[int] = 2
    LAYER1_STATUS_BROADCASTED_REMOVED_FROM_MEMPOOL: ClassVar[int] = 3
    LAYER1_STATUS_CONFIRMED: ClassVar[int] = 4

    layer2_withdrawal_id: Mapped[str] = mapped_column(String, primary_key=True)
    status: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    transaction_id: Mapped[str] = mapped_column(String, nullable=False, default="")
    amount: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    fee: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    destination_address: Mapped[str] = mapped_column(String, nullable=False, default="")
    confirmations: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    withdrawal_requested_timestamp: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    date_broadcasted: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    __table_args__ = (
        Index("UIX_PendingWithdrawals_layer2_withdrawal_id", "layer2_withdrawal_id"),
        Index("NIX_PendingWithdrawals_status", "status"),
    )

    def setValues(
        self,
        layer2_withdrawal_id: str,
        status: int,
        transaction_id: str,
        amount: int,
        fee: int,
        destination_address: str,
        confirmations: int,
        withdrawal_requested_timestamp: int,
        date_broadcasted: int,
    ) -> None:
        self.layer2_withdrawal_id = layer2_withdrawal_id
        self.status = status
        self.transaction_id = transaction_id
        self.amount = amount
        self.fee = fee
        self.destination_address = destination_address
        self.confirmations = confirmations
        self.withdrawal_requested_timestamp = withdrawal_requested_timestamp
        self.date_broadcasted = date_broadcasted

    def fromWithdrawalRequestAPIJson(
        self, withdrawalJSON: Dict[str, Any]
    ) -> PendingWithdrawal:
        self.setValues(
            withdrawalJSON["layer2_withdrawal_id"],
            int(withdrawalJSON["status"]),
            "",
            withdrawalJSON["amount"],
            0,
            withdrawalJSON["layer1_address"],
            0,
            withdrawalJSON["withdrawal_requested_timestamp"],
            0,
        )
        return self


class KeyValue(Base):
    __tablename__ = "KeyValue"

    _key: Mapped[str] = mapped_column(String, primary_key=True)
    value: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    __table_args__ = (
        Index("UIX_KeyValue_key", "_key"),
    )


class DB:
    def __init__(self, wallet_name: Path | str, *args: Any, **kwargs: Any):
        db_path = str(wallet_name or DEFAULT_DATABASE_NAME)
        self.engine = create_engine(
            f"sqlite:///{db_path}",
            echo=False,
        )
        SessionFactory = sessionmaker(bind=self.engine)
        self.session: Session = SessionFactory()
        return super().__init__(*args, **kwargs)

    def openOrCreateDB(self) -> None:
        Base.metadata.create_all(self.engine)

    def getPendingWithdrawals(self) -> List[PendingWithdrawal]:
        pending_rows = (
            self.session.query(PendingWithdrawal)
            .filter(PendingWithdrawal.status == PendingWithdrawal.LAYER1_STATUS_PENDING)
            .all()
        )
        withdrawals: List[PendingWithdrawal] = [
            PendingWithdrawal(
                layer2_withdrawal_id=row.layer2_withdrawal_id,
                status=row.status,
                transaction_id=row.transaction_id,
                amount=row.amount,
                fee=row.fee,
                destination_address=row.destination_address,
                confirmations=row.confirmations,
                withdrawal_requested_timestamp=row.withdrawal_requested_timestamp,
                date_broadcasted=row.date_broadcasted,
            )
            for row in pending_rows
        ]
        return withdrawals

    def getPendingWithdrawal(self, _layer2_withdrawal_id: str) -> Optional[PendingWithdrawal]:
        row = (
            self.session.query(PendingWithdrawal)
            .filter(PendingWithdrawal.layer2_withdrawal_id == _layer2_withdrawal_id)
            .first()
        )
        if not row:
            return None
        return PendingWithdrawal(
            layer2_withdrawal_id=row.layer2_withdrawal_id,
            status=row.status,
            transaction_id=row.transaction_id,
            amount=row.amount,
            fee=row.fee,
            destination_address=row.destination_address,
            confirmations=row.confirmations,
            withdrawal_requested_timestamp=row.withdrawal_requested_timestamp,
            date_broadcasted=row.date_broadcasted,
        )

    def insertPendingWithdrawal(self, pendingWithdrawal: PendingWithdrawal) -> None:
        try:
            model = PendingWithdrawal(
                layer2_withdrawal_id=pendingWithdrawal.layer2_withdrawal_id,
                status=int(pendingWithdrawal.status or 0),
                transaction_id=pendingWithdrawal.transaction_id,
                amount=pendingWithdrawal.amount,
                fee=pendingWithdrawal.fee,
                destination_address=pendingWithdrawal.destination_address,
                confirmations=pendingWithdrawal.confirmations,
                withdrawal_requested_timestamp=pendingWithdrawal.withdrawal_requested_timestamp,
                date_broadcasted=pendingWithdrawal.date_broadcasted,
            )
            self.session.add(model)
            self.session.commit()
        except Exception as e:
            OnboardingLogger(str(e))
            self.session.rollback()

    def updatePendingWithdrawal(
        self,
        layer2_withdrawal_id: str,
        status: int,
        transaction_id: str,
        fee: int,
    ) -> None:
        self.session.query(PendingWithdrawal).filter(
            PendingWithdrawal.layer2_withdrawal_id == layer2_withdrawal_id
        ).update(
            {
                PendingWithdrawal.status: status,
                PendingWithdrawal.transaction_id: transaction_id,
                PendingWithdrawal.fee: fee,
            },
            synchronize_session=False,
        )
        self.session.commit()

    def insertConfirmedTransaction(self, confirmedTransaction: ConfirmedTransaction) -> None:
        OnboardingLogger(
            "Inserting ConfirmedTransaction: "
            + confirmedTransaction.transaction_id
            + "-"
            + str(confirmedTransaction.transaction_vout)
        )
        model = ConfirmedTransaction(
            transaction_id=confirmedTransaction.transaction_id,
            layer2_status=int(confirmedTransaction.layer2_status or 0),
            transaction_vout=confirmedTransaction.transaction_vout,
            amount=confirmedTransaction.amount,
            fee=confirmedTransaction.fee,
            address=confirmedTransaction.address,
            category=confirmedTransaction.category,
            confirmations=confirmedTransaction.confirmations,
            timestamp=confirmedTransaction.timestamp,
        )
        self.session.add(model)
        self.session.commit()

    def getAllPendingConfirmedTransactions(self) -> List[ConfirmedTransaction]:
        rows = (
            self.session.query(ConfirmedTransaction)
            .filter(ConfirmedTransaction.layer2_status == ConfirmedTransaction.LAYER2_STATUS_PENDING)
            .all()
        )
        transactions: List[ConfirmedTransaction] = [
            ConfirmedTransaction(
                transaction_id=row.transaction_id,
                layer2_status=row.layer2_status,
                transaction_vout=row.transaction_vout,
                amount=row.amount,
                fee=row.fee,
                address=row.address,
                category=row.category,
                confirmations=row.confirmations,
                timestamp=row.timestamp,
            )
            for row in rows
        ]
        return transactions

    def getPendingConfirmedTransactions(self, category: str) -> List[ConfirmedTransaction]:
        rows = (
            self.session.query(ConfirmedTransaction)
            .filter(
                ConfirmedTransaction.layer2_status == ConfirmedTransaction.LAYER2_STATUS_PENDING,
                ConfirmedTransaction.category == category,
            )
            .all()
        )
        transactions: List[ConfirmedTransaction] = []
        for row in rows:
            trx = ConfirmedTransaction(
                transaction_id=row.transaction_id,
                layer2_status=row.layer2_status,
                transaction_vout=row.transaction_vout,
                amount=row.amount,
                fee=row.fee,
                address=row.address,
                category=row.category,
                confirmations=row.confirmations,
                timestamp=row.timestamp,
            )
            transactions.append(trx)
            OnboardingLogger(vars(trx))
        return transactions

    def getPendingConfirmedDepositTransactions(self) -> List[ConfirmedTransaction]:
        return self.getPendingConfirmedTransactions(ConfirmedTransaction.CATEGORY_RECIEVE)

    def getPendingConfirmedWithdrawalTransactions(self) -> List[ConfirmedTransaction]:
        return self.getPendingConfirmedTransactions(ConfirmedTransaction.CATEGORY_SEND)

    def updateConfirmedTransaction(
        self,
        transaction_id: str,
        transaction_vout: int,
        category: str,
        layer2_status: int,
    ) -> None:
        self.session.query(ConfirmedTransaction).filter(
            ConfirmedTransaction.transaction_id == transaction_id,
            ConfirmedTransaction.transaction_vout == transaction_vout,
            ConfirmedTransaction.category == category,
        ).update(
            {ConfirmedTransaction.layer2_status: layer2_status},
            synchronize_session=False,
        )
        self.session.commit()

    def getKeyValue(self, key: str, defaultValue: Optional[str] = None) -> Optional[str]:
        row = self.session.query(KeyValue).filter(KeyValue._key == key).first()
        return row.value if row else defaultValue

    def setKeyValue(
        self, key: str, value: str, insertValueIfKeyDoesNotExist: bool = False
    ) -> None:
        existing = self.session.query(KeyValue).filter(KeyValue._key == key).first()
        if existing:
            existing.value = value
        elif insertValueIfKeyDoesNotExist:
            self.session.add(KeyValue(_key=key, value=value))
        self.session.commit()

    def getLastBlockHash(self) -> str:
        return self.getKeyValue("lastConfirmedBlockHash", "") or ""

    def setLastBlockHash(self, lastConfirmedBlockHash: str) -> None:
        self.setKeyValue("lastConfirmedBlockHash", lastConfirmedBlockHash, True)

    def getLastWithdrawalRequestTimestamp(self, defaultValue: int = 0) -> int:
        return int(self.getKeyValue("lastwithdrawalTimestamp", str(defaultValue)) or defaultValue)

    def setLastWithdrawalTimestamp(
        self, lastwithdrawalTimestamp: int, defaultValue: int = 0
    ) -> None:
        self.setKeyValue("lastwithdrawalTimestamp", str(lastwithdrawalTimestamp), True)

    def getLastBroadcastBlockHeight(self, defaultValue: int = 0) -> int:
        return int(self.getKeyValue("lastBroadcastBlockHeight", str(defaultValue)) or defaultValue)

    def setLastBroadcastBlockHeight(self, lastBroadcastBlockHeight: int) -> None:
        OnboardingLogger("Setting setLastBroadcastBlockHeight: " + str(lastBroadcastBlockHeight))
        self.setKeyValue("lastBroadcastBlockHeight", str(lastBroadcastBlockHeight), True)

    def getBroadcastTransactionBlockDelay(self, defaultValue: int = 6) -> int:
        return int(self.getKeyValue("broadcastTransactionBlockDelay", str(defaultValue)) or defaultValue)

    def setBroadcastTransactionBlockDelay(self, broadcastTransactionBlockDelay: int) -> None:
        self.setKeyValue("broadcastTransactionBlockDelay", str(broadcastTransactionBlockDelay), True)

    def close(self) -> None:
        self.session.close()
        self.engine.dispose()
