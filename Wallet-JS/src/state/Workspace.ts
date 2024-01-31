const { DEFAULT_LAYER2_HOSTNAME, Layer2LedgerNodeInfo, Layer2LedgerAPI } = require('../services/Layer2API');
const { Wallet, MessageBuilder, Transaction } = require('../utils/wallet');
const { useState } = require('react');
const { v4: uuidv4 } = require('uuid');

class Workspace {
    public layer2ledgerNodeUrl: string;
    public mneumonic: string | null;
    public wallet: any | null;
    public transactions: Map<string, any>;
    public addressBalances: Map<string, any>;
    public depositAddresses: Map<string, any>;
    public transactionResults: Map<string, any>;

    constructor(layer2ledgerNodeUrl: string = DEFAULT_LAYER2_HOSTNAME) {
        this.layer2ledgerNodeUrl = layer2ledgerNodeUrl;
        this.mneumonic = null;
        this.wallet = null;
        this.transactions = new Map();
        this.addressBalances = new Map();
        this.depositAddresses = new Map();
        this.transactionResults = new Map();
    }
}

export {Workspace}