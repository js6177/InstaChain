from __future__ import annotations
import datetime
import string
from typing import Any
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy import Column, Integer, String, BigInteger, Float, Boolean, DateTime, ForeignKey

from BitcoinRPCResponses.ListAddressGroupingsResponse import BitcoinRpcListAddressGroupingsAddress
from constants import SATOSHI_PER_BITCOIN

Base = declarative_base()

class AuditState(Base):
    __tablename__ = 'audit_state'
    id = Column(Integer, primary_key=True)
    block_height = Column(Integer)

class AuditLayer1Address(Base):
    __tablename__ = 'layer1_address'
    layer1_address = Column(String, primary_key=True)
    layer1_address_label = Column(String)
    balance = Column(BigInteger, index=False)
    sent_to_layer2_ledger = Column(Boolean)
    last_updated_block_height = Column(Integer)
    last_updated_on = Column(DateTime)


    def __init__(self, layer1_address: string, layer1_address_label: string, balance: int, sent_to_layer2_ledger: bool = False):
        self.layer1_address = layer1_address
        self.layer1_address_label = layer1_address_label
        self.balance = balance
        self.sent_to_layer2_ledger = sent_to_layer2_ledger
        self.last_updated_block_height = 0
        self.last_updated_on = datetime.datetime.now()

    def to_dict(self):
        return {
            'layer1_address': self.layer1_address,
            'layer1_address_label': self.layer1_address_label,
            'balance': self.balance,
            'last_updated_block_height': self.last_updated_block_height,
            'last_updated_on': self.last_updated_on.timestamp()  # Convert datetime to Unix timestamp
        }
    
    @staticmethod
    def fromBitcoinRpcListAddressGroupingsAddress(address: BitcoinRpcListAddressGroupingsAddress) -> AuditLayer1Address:
        layer1_address = address.address
        layer1_address_label = address.label
        balance = int(address.amount * SATOSHI_PER_BITCOIN)
        return AuditLayer1Address(layer1_address, layer1_address_label, balance)

class AuditDatabaseInterface:
    def __init__(self, dbPath: string):
        sqlAlchemyPath = 'sqlite:///' + dbPath
        self.engine = create_engine(sqlAlchemyPath, echo=False)
        Base.metadata.create_all(self.engine)

        Session = sessionmaker(bind=self.engine)
        self.session = Session()

    def addLayer1Address(self, layer1address: AuditLayer1Address, commit: bool = False):
        self.session.add(layer1address)
        if commit:
            self.session.commit()

    def addOrUpdateLayer1Addresses(self, layer1Addresses: list[AuditLayer1Address], blockHeight: int, commit: bool = False):
        for layer1Address in layer1Addresses:
            existingLayer1Address = self.session.query(AuditLayer1Address).filter_by(layer1_address=layer1Address.layer1_address).first()
            if existingLayer1Address:
                existingLayer1Address.balance = layer1Address.balance
                existingLayer1Address.last_updated_block_height = blockHeight
                existingLayer1Address.last_updated_on = datetime.datetime.now()
            else:
                self.session.add(layer1Address)
        self.updateAuditState(blockHeight)
        if commit:
            self.session.commit()

    def getLayer1Addresses(self, getZeroBalanceAddresses: bool = True) -> list[AuditLayer1Address]:
        if getZeroBalanceAddresses:
            return self.session.query(AuditLayer1Address).all()
        else:
            return self.session.query(AuditLayer1Address).filter(AuditLayer1Address.balance > 0).all()

    def setLayer1AddressesSentToLayer2Ledger(self, layer1Addresses: list[AuditLayer1Address], commit: bool = False):
        for layer1Address in layer1Addresses:
            layer1Address.sent_to_layer2_ledger = True
        if commit:
            self.session.commit()

    def updateAuditState(self, blockHeight: int, commit: bool = False):
        self.session.query(AuditState).delete()
        self.session.add(AuditState(block_height=blockHeight))
        if commit:
            self.session.commit()

    def getLastAuditBlockHeight(self) -> int:
        auditState = self.session.query(AuditState).first()
        if auditState:
            return auditState.block_height
        else:
            return 0

