import { GetNodeInfoResponse } from "../services/messages/GetNodeInfoResponse";

const { DEFAULT_LAYER2_HOSTNAME, Layer2LedgerNodeInfo, Layer2LedgerAPI } = require('../services/Layer2API');
const { Layer1AuditReportResponse } = require('../services/messages/Layer1AuditReport');

class Layer2LedgerStateManager {
    public setLayer1AuditState: (state: typeof Layer1AuditReportResponse) => void;
    public layer2ledgerNodeUrl: string;
    public layer2LedgerAPI: typeof Layer2LedgerAPI;
    public layer1AuditReport: typeof Layer1AuditReportResponse;
    public layer2LedgerNodeInfo: typeof Layer2LedgerNodeInfo;

    constructor(setLayer1AuditState: (state: typeof Layer1AuditReportResponse) => void, layer2ledgerNodeUrl = DEFAULT_LAYER2_HOSTNAME) {
        this.setLayer1AuditState = setLayer1AuditState;
        this.layer2ledgerNodeUrl = layer2ledgerNodeUrl;
        this.layer2LedgerAPI = new Layer2LedgerAPI(this.layer2ledgerNodeUrl);
        this.layer1AuditReport = new Layer1AuditReportResponse();
    }

    public fetchLayer2LedgerState() {
        this.layer2LedgerAPI.getNodeInfo(this.onGetNodeInfo.bind(this));
    }

    private onGetNodeInfo(getNodeInfoResponse: GetNodeInfoResponse) {
        //console.log("Layer2LedgerState.onGetNodeInfo");
        this.layer2LedgerNodeInfo = new Layer2LedgerNodeInfo(this.layer2ledgerNodeUrl, '', 0);
        this.layer2LedgerNodeInfo.fromGetNodeInfoResponse(getNodeInfoResponse);

        //get the rest of the Layer2 Ledger info (like the audit report)
        this.getLayer1AuditReport();
    }

    private getLayer1AuditReport() {
        this.layer2LedgerAPI.getLayer1AuditReport(this.onGetLayer1AuditReport.bind(this));
    }

    private onGetLayer1AuditReport(data: any) {
        this.layer1AuditReport.fromJSON(data);
        //console.log("Layer2LedgerState.onGetLayer1AuditReport: " + JSON.stringify(this.layer1AuditReport));

        this.setLayer1AuditState && this.setLayer1AuditState(this.layer1AuditReport);
    }
}

export {Layer2LedgerStateManager};