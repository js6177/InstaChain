from sqlalchemy import Column, Integer, String, DateTime, JSON, Text
from sqlalchemy.sql import func
from database import Base, get_db
import ErrorMessage
import KeyVerification
import logging
import random
import string
import datetime
import math
import GlobalLogging

class Layer1AuditReport(Base):
    __tablename__ = "layer1_audit_reports"

    id = Column(Integer, primary_key=True, index=True)
    blockHeight = Column(Integer, unique=True, index=True)
    balance = Column(Integer)
    layer1AddressBalances = Column(JSON)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())
    signature = Column(Text)

    def to_dict(self):
        result = {
            'id': self.id,
            'blockHeight': self.blockHeight,
            'balance': self.balance,
            'timestamp': self.timestamp,
            'signature': self.signature
        }
        return result

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

    db = next(get_db())
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
    finally:
        db.close()
    
    return status

def getLayer1AuditReport(blockHeight: int):
    db = next(get_db())
    try:
        if blockHeight == 0:
            # Return the latest audit report
            report = db.query(Layer1AuditReport).order_by(Layer1AuditReport.blockHeight.desc()).first()
        else:
            report = db.query(Layer1AuditReport).filter(Layer1AuditReport.blockHeight == blockHeight).first()
        return report
    finally:
        db.close()

def getLayer1AddressBalances(includeZeroBalances: bool = True) -> list[Layer1Addresses]:
    db = next(get_db())
    try:
        query = db.query(Layer1Addresses).order_by(Layer1Addresses.balance.desc())
        if not includeZeroBalances:
            query = query.filter(Layer1Addresses.balance > 0)
        return query.all()
    finally:
        db.close()