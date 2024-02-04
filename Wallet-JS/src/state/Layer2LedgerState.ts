import { DEFAULT_LAYER2_HOSTNAME } from '../services/Layer2API';
import { Layer2LedgerNodeInfo, Layer2LedgerAPI } from '../services/Layer2API';
import { Layer1AuditReportResponse } from '../services/messages/Layer1AuditReport';

class Layer2LedgerState {
    public layer2ledgerNodeUrl: string;
    public layer2LedgerAPI:  Layer2LedgerAPI;
    public layer2LedgerNodeInfo: Layer2LedgerNodeInfo | null = null;
    public layer1AuditReport: Layer1AuditReportResponse;
    
    constructor(layer2ledgerNodeUrl: string = DEFAULT_LAYER2_HOSTNAME) {
        this.layer2ledgerNodeUrl = layer2ledgerNodeUrl;
        this.layer2LedgerAPI = new Layer2LedgerAPI(this.layer2ledgerNodeUrl);
        this.layer1AuditReport = new Layer1AuditReportResponse();
    }
}

export {Layer2LedgerState};