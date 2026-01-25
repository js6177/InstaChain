from sqlalchemy import Column, Integer, String, DateTime, JSON, Text, select
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func
from Layer2Ledger.database.database import Base, get_db, AsyncSession
from Layer2Ledger.core import ErrorMessage
from Layer2Ledger.core import KeyVerification
import logging
import random
import string
import datetime
import math
from Layer2Ledger.core import GlobalLogging

class Layer1AuditReport(Base):
    __tablename__ = "layer1_audit_reports"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    blockHeight: Mapped[int] = mapped_column(Integer, unique=True, index=True)
    balance: Mapped[int] = mapped_column(Integer)
    layer1AddressBalances: Mapped[dict] = mapped_column(JSON)
    timestamp: Mapped[datetime.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    signature: Mapped[str] = mapped_column(Text)


class Layer1Addresses(Base):
    __tablename__ = "layer1_addresses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    layer1Address: Mapped[str] = mapped_column(String, unique=True, index=True)
    balance: Mapped[int] = mapped_column(Integer)
    label: Mapped[str] = mapped_column(Text)

async def processLayer1AuditReport(db: AsyncSession, blockheight: int, layer1AddressBalances: dict, totalBalance: int, signature: str):
    status = ErrorMessage.ERROR_SUCCESS
    
    # verify the signature
    if not KeyVerification.verifyLayer1AuditReportSignature(blockheight, totalBalance, signature):
        status = ErrorMessage.ERROR_INVALID_SIGNATURE
        return status

    try:
        # Check if report already exists
        result = await db.execute(select(Layer1AuditReport).filter(Layer1AuditReport.blockHeight == blockheight))
        existing_report = result.scalars().first()
        if existing_report is not None:
            status = ErrorMessage.ERROR_AUDIT_REPORT_ALREADY_EXISTS
            return status

        # Create new report
        report = Layer1AuditReport(
            blockHeight=blockheight,
            layer1AddressBalances=layer1AddressBalances,
            signature=signature,
            balance=totalBalance
        )
        
        db.add(report)
        
        # Update or create Layer1Addresses
        for layer1Address, balance in layer1AddressBalances.items():
            result = await db.execute(select(Layer1Addresses).filter(Layer1Addresses.layer1Address == layer1Address))
            address = result.scalars().first()
            if address is None:
                address = Layer1Addresses(
                    layer1Address=layer1Address,
                    balance=balance
                )
                db.add(address)
            else:
                address.balance = balance
        
        await db.commit()
    except Exception as e:
        await db.rollback()
        GlobalLogging.log_text("processLayer1AuditReport: " + str(e))
        status = ErrorMessage.ERROR_FAILED_TO_WRITE_TO_DATABASE
    
    return status

async def getLayer1AuditReport(db: AsyncSession, blockHeight: int) -> tuple[int, Layer1AuditReport | None]:
    result = ErrorMessage.ERROR_SUCCESS
    try:
        if blockHeight == 0:
            # Return the latest audit report
            result = await db.execute(select(Layer1AuditReport).order_by(Layer1AuditReport.blockHeight.desc()))
            report = result.scalars().first()
        else:
            result = await db.execute(select(Layer1AuditReport).filter(Layer1AuditReport.blockHeight == blockHeight))
            report = result.scalars().first()
        if report is None:
            result = ErrorMessage.ERROR_AUDIT_REPORT_DOES_NOT_EXIST
        return result, report
    except Exception as e:
        logging.error(f"Error retrieving Layer1AuditReport for blockHeight {blockHeight}: {e}")
        raise

async def getLayer1AddressBalances(db: AsyncSession, includeZeroBalances: bool = True) -> list[Layer1Addresses]:
    try:
        query = select(Layer1Addresses).order_by(Layer1Addresses.balance.desc())
        if not includeZeroBalances:
            query = query.filter(Layer1Addresses.balance > 0)
        result = await db.execute(query)
        return result.scalars().all()
    except Exception as e:
        logging.error(f"Error retrieving Layer1Addresses: {e}")
        raise
