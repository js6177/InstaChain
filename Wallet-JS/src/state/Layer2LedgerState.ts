import { DEFAULT_LAYER2_HOSTNAME } from '../services/Layer2API';
import { Layer2LedgerNodeInfo, Layer2LedgerAPI } from '../services/Layer2API';
import { GetLayer1AuditReportResponse } from '../services/messages/Layer2Ledger/Responses/Layer1AuditReportResponse';

class Layer2LedgerState {
    public layer2ledgerNodeUrl: string;
    public layer2LedgerAPI:  Layer2LedgerAPI;
    public layer2LedgerNodeInfo: Layer2LedgerNodeInfo | null = null;
    public layer1AuditReport: GetLayer1AuditReportResponse;
    
    constructor(layer2ledgerNodeUrl: string = DEFAULT_LAYER2_HOSTNAME) {
        this.layer2ledgerNodeUrl = layer2ledgerNodeUrl;
        this.layer2LedgerAPI = new Layer2LedgerAPI(this.layer2ledgerNodeUrl);
        this.layer1AuditReport = new GetLayer1AuditReportResponse();
    }
}

export {Layer2LedgerState};