const { DEFAULT_LAYER2_HOSTNAME, Layer2LedgerNodeInfo, Layer2LedgerAPI } = require('../services/Layer2API');
const { Layer1AuditReportResponse } = require('../services/messages/Layer1AuditReport');

class Layer2LedgerState {
    public layer2ledgerNodeUrl: string;
    public layer2LedgerAPI: typeof Layer2LedgerAPI;
    public layer2LedgerNodeInfo: typeof Layer2LedgerNodeInfo;
    public layer1AuditReport: typeof Layer1AuditReportResponse;
    
    constructor(layer2ledgerNodeUrl: string = DEFAULT_LAYER2_HOSTNAME) {
        this.layer2ledgerNodeUrl = layer2ledgerNodeUrl;
        this.layer2LedgerAPI = new Layer2LedgerAPI(this.layer2ledgerNodeUrl);
        this.layer1AuditReport = new Layer1AuditReportResponse();
    }
}

export {Layer2LedgerState};