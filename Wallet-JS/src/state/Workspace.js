import {DEFAULT_LAYER2_HOSTNAME, Layer2LedgerNodeInfo, Layer2LedgerAPI} from '../services/Layer2API';
import {Wallet, MessageBuilder, Transaction} from '../utils/wallet'
import { useState } from 'react';
import {v4 as uuidv4} from 'uuid';

class Workspace{
    constructor(layer2ledgerNodeUrl){
        this.layer2ledgerNodeUrl = DEFAULT_LAYER2_HOSTNAME;
        this.mneumonic = null;
        this.wallet = null;
        this.transactions = new Map();
        this.addressBalances = new Map();
        this.depositAddresses = new Map();

        this.transactionResults = new Map();
    }
}

export {Workspace}