from google.cloud import ndb
import ErrorMessage
import KeyVerification
import logging
import random
import string
import datetime
import math
import GlobalLogging

class Layer1AuditReport(ndb.Model):
    blockHeight = ndb.IntegerProperty()
    balance = ndb.IntegerProperty(indexed=False)
    layer1AddressBalances = ndb.JsonProperty(indexed=False)
    timestamp = ndb.DateTimeProperty(auto_now_add=True)
    signature = ndb.TextProperty(indexed=False)

    #return everything except the layer1AddressBalances in a dict
    def to_dict(self):
        result = super(Layer1AuditReport, self).to_dict()
        del result['layer1AddressBalances']
        return result

class Layer1Addresses(ndb.Model):
    layer1Address = ndb.StringProperty()
    balance = ndb.IntegerProperty()
    label = ndb.TextProperty(indexed=False)

@ndb.transactional()
def processLayer1AuditReport(blockheight: int, layer1AddressBalances: dict, totalBalance: int, signature: str):
    status = ErrorMessage.ERROR_SUCCESS
    #verify the signature
    if not KeyVerification.verifyLayer1AuditReportSignature(blockheight, totalBalance, signature):
        status = ErrorMessage.ERROR_INVALID_SIGNATURE
        return status

    
    report = Layer1AuditReport()
    report.blockHeight = blockheight
    report.layer1AddressBalances = layer1AddressBalances
    report.signature = signature
    report.balance = totalBalance

    #check to see if an audit report already exists for this block height
    existingReport = Layer1AuditReport.query(Layer1AuditReport.blockHeight == blockheight).get()
    if existingReport is not None:
        #return error already exists
        status = ErrorMessage.ERROR_AUDIT_REPORT_ALREADY_EXISTS
        return status
    else:
        try:
            report.put()

            for layer1Address in layer1AddressBalances:
                address = Layer1Addresses.query(Layer1Addresses.layer1Address == layer1Address).get()
                if address is None:
                    address = Layer1Addresses()
                    address.layer1Address = layer1Address
                    address.balance = layer1AddressBalances[layer1Address]
                    address.put()
                else:
                    address.balance = layer1AddressBalances[layer1Address]
                    address.put()
        except Exception as e:
            GlobalLogging.logger.log_text("processLayer1AuditReport: " + str(e))
            status = ErrorMessage.ERROR_FAILED_TO_WRITE_TO_DATABASE
            return status

    return status

def getLayer1AuditReport(blockHeight: int):
    report = None
    if(blockHeight == 0):
        #return the latest audit report
        report = Layer1AuditReport.query().order(-Layer1AuditReport.blockHeight).get()
    else:
        report = Layer1AuditReport.query(Layer1AuditReport.blockHeight == blockHeight).get()
    return report

def getLayer1AddressBalances(includeZeroBalances: bool = True):
    addresses = Layer1Addresses.query().order(-Layer1Addresses.balance).fetch()
    if not includeZeroBalances:
        addresses = [address for address in addresses if address.balance > 0]
    return addresses