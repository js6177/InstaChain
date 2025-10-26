import datetime
import enum
import typing

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    Enum,
    Float,
    Integer,
    JSON,
    String,
    Text,
    func,
    inspect,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

class Base(DeclarativeBase):
    pass

def model_to_dict(model_instance: Base, include_pk: bool = False) -> dict[str, typing.Any]:
    columns = inspect(model_instance.__class__).columns
    return {
        column.key: getattr(model_instance, column.key)
        for column in columns
        if getattr(model_instance, column.key) is not None
        and (include_pk or not column.primary_key)
    }

class Layer1AuditReport(Base):
    __tablename__ = "layer1_audit_reports"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    blockHeight: Mapped[int] = mapped_column(Integer, unique=True, index=True)
    balance: Mapped[int] = mapped_column(Integer)
    layer1AddressBalances: Mapped[dict[str, typing.Any]] = mapped_column(JSON)
    timestamp: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    signature: Mapped[str] = mapped_column(Text)


class Layer1Addresses(Base):
    __tablename__ = "layer1_addresses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    layer1Address: Mapped[str] = mapped_column(String, unique=True, index=True)
    balance: Mapped[int] = mapped_column(Integer)
    label: Mapped[str] = mapped_column(Text)


class TransactionDuration(Base):
    __tablename__ = "transaction_durations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    timestamp: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    duration: Mapped[float] = mapped_column(Float)
    transaction_id: Mapped[str] = mapped_column(String, index=True)
    action: Mapped[str] = mapped_column(String)
    item_count: Mapped[int] = mapped_column(Integer)


class KeyValueStore(Base):
    __tablename__ = "key_value_store"

    key: Mapped[str] = mapped_column(String, primary_key=True, index=True)
    value: Mapped[str] = mapped_column(String, nullable=False)


class MasterPublicKeyIndex(Base):
    __tablename__ = "master_public_key_indices"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    mpk_index: Mapped[int] = mapped_column(BigInteger, nullable=False)


class WithdrawalStatus(enum.IntEnum):
    WITHDRAWAL_STATUS_PENDING = 1
    WITHDRAWAL_STATUS_ACKNOWLEDGED = 2
    WITHDRAWAL_STATUS_BROADCASTED = 3
    WITHDRAWAL_STATUS_CONFIRMED = 4
    WITHDRAWAL_STATUS_CANCELED = 5


class WithdrawalRequests(Base):
    __tablename__ = "withdrawal_requests"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    layer1_address: Mapped[str] = mapped_column(String, index=True)
    layer1_transaction_id: Mapped[str] = mapped_column(String, nullable=True)
    status: Mapped[WithdrawalStatus] = mapped_column(Enum(WithdrawalStatus))
    amount: Mapped[int] = mapped_column(Integer)
    layer2_withdrawal_id: Mapped[str] = mapped_column(String, unique=True, index=True)
    server_signature: Mapped[str] = mapped_column(String, nullable=True)
    layer2_transaction_id: Mapped[str] = mapped_column(String)
    withdrawal_requested_timestamp: Mapped[int] = mapped_column(BigInteger)
    withdrawal_requested_timestamp_str: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class ConfirmedWithdrawals(Base):
    __tablename__ = "confirmed_withdrawals"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    layer1_transaction_id: Mapped[str] = mapped_column(String, index=True)
    layer1_transaction_vout: Mapped[int] = mapped_column(Integer)
    layer1_address: Mapped[str] = mapped_column(String, index=True)
    amount: Mapped[int] = mapped_column(Integer)
    layer2_withdrawal_id: Mapped[str] = mapped_column(String, unique=True, index=True)
    broadcasted_signature: Mapped[str] = mapped_column(String)
    confirmed_signature: Mapped[str] = mapped_column(String)
    confirmed: Mapped[bool] = mapped_column(Boolean, default=False)
    confirmation_timestamp_str: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class DepositAddresses(Base):
    __tablename__ = "deposit_addresses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    layer2_address: Mapped[str] = mapped_column(String, index=True)
    nonce: Mapped[str] = mapped_column(String)
    layer1_address: Mapped[str] = mapped_column(String, unique=True, index=True)
    signature: Mapped[str] = mapped_column(String)
    date_requested: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    mpk_index: Mapped[int] = mapped_column(Integer)


class Layer2AddressBalance(Base):
    __tablename__ = "layer2_address_balance"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    address: Mapped[str] = mapped_column(String, unique=True, index=True)
    balance: Mapped[int] = mapped_column(Integer)
    timestamp: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

class TransactionType(enum.IntEnum):
    TRX_TRANSFER = 1  # layer2 transfer
    TRX_DEPOSIT = 2  # when a user deposits btc to a deposit address, then funds get credited to his pubkey
    TRX_WITHDRAWAL_INITIATED = 3  # when the user wants to withdraw to a btc address (locks that amount)
    TRX_WITHDRAWAL_BROADCASTED = 4 # when the transaction is broadcasted and in the mempool
    TRX_WITHDRAWAL_CANCELED = 5  # when the transaction gets removed from the layer1 mempool for any reason
    TRX_WITHDRAWAL_CONFIRMED = 6  # when the withdrawal gets confirmed in the layer1 chain
    INSTRUCTION_GET_DEPOSIT_ADDRESS = 7 # instruction to get a deposit address
    INSTRUCTION_LAYER1_AUDIT = 8 # instruction to perform a layer1 audit

class Transaction(Base):
    __tablename__ = "transactions"

    timestamp: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    amount: Mapped[int] = mapped_column(Integer)
    fee: Mapped[int] = mapped_column(Integer)
    source_address_pubkey: Mapped[str] = mapped_column(String, index=True)
    destination_address_pubkey: Mapped[str] = mapped_column(String, index=True)
    transaction_type: Mapped[TransactionType] = mapped_column(Enum(TransactionType))
    layer2_transaction_id: Mapped[str] = mapped_column(
        String, primary_key=True, index=True
    )
    signature: Mapped[str] = mapped_column(String)
    signature_date: Mapped[int] = mapped_column(BigInteger)
    layer1_transaction_id: Mapped[str] = mapped_column(String)
    layer2_withdrawal_id: Mapped[str] = mapped_column(String)


