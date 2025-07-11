from sqlalchemy import Column, Integer, String, DateTime, JSON, Text
from sqlalchemy.sql import func
from Layer2Ledger.database.database import Base, DatabaseSession, get_db
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

    id = Column(Integer, primary_key=True, index=True)
    blockHeight = Column(Integer, unique=True, index=True)
    balance = Column(Integer)
    layer1AddressBalances = Column(JSON)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())
    signature = Column(Text)


class Layer1Addresses(Base):
    __tablename__ = "layer1_addresses"

    id = Column(Integer, primary_key=True, index=True)
    layer1Address = Column(String, unique=True, index=True)
    balance = Column(Integer)
    label = Column(Text)

def processLayer1AuditReport(blockheight: int, layer1AddressBalances: dict, totalBalance: int, signature: str):
    status = ErrorMessage.ERROR_SUCCESS
    
    # verify the signature
    if not KeyVerification.verifyLayer1AuditReportSignature(blockheight, totalBalance, signature):
        status = ErrorMessage.ERROR_INVALID_SIGNATURE
        return status

    with get_db() as db:
        try:
            # Check if report already exists
            existing_report = db.query(Layer1AuditReport).filter(Layer1AuditReport.blockHeight == blockheight).first()
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
                address = db.query(Layer1Addresses).filter(Layer1Addresses.layer1Address == layer1Address).first()
                if address is None:
                    address = Layer1Addresses(
                        layer1Address=layer1Address,
                        balance=balance
                    )
                    db.add(address)
                else:
                    address.balance = balance
            
            db.commit()
        except Exception as e:
            db.rollback()
            GlobalLogging.log_text("processLayer1AuditReport: " + str(e))
            status = ErrorMessage.ERROR_FAILED_TO_WRITE_TO_DATABASE
    
    return status

def getLayer1AuditReport(db: DatabaseSession, blockHeight: int) -> tuple[int, Layer1AuditReport | None]:
    result = ErrorMessage.ERROR_SUCCESS
    try:
        if blockHeight == 0:
            # Return the latest audit report
            report = db.query(Layer1AuditReport).order_by(Layer1AuditReport.blockHeight.desc()).first()
        else:
            report = db.query(Layer1AuditReport).filter(Layer1AuditReport.blockHeight == blockHeight).first()
        if report is None:
            result = ErrorMessage.ERROR_AUDIT_REPORT_DOES_NOT_EXIST
        return result, report
    except Exception as e:
        logging.error(f"Error retrieving Layer1AuditReport for blockHeight {blockHeight}: {e}")
        raise

def getLayer1AddressBalances(db: DatabaseSession, includeZeroBalances: bool = True) -> list[Layer1Addresses]:
    try:
        query = db.query(Layer1Addresses).order_by(Layer1Addresses.balance.desc())
        if not includeZeroBalances:
            query = query.filter(Layer1Addresses.balance > 0)
        return query.all()
    except Exception as e:
        logging.error(f"Error retrieving Layer1Addresses: {e}")
        raise