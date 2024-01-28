const { DEFAULT_LAYER2_HOSTNAME, Layer2LedgerNodeInfo, Layer2LedgerAPI } = require('../services/Layer2API');
const { Layer1AuditReportResponse } = require('../services/messages/Layer1AuditReport');

class Layer2LedgerState {
    public layer2ledgerNodeUrl: string;
    public layer2LedgerAPI: typeof Layer2LedgerAPI;
    public layer2LedgerNodeInfo: typeof Layer2LedgerNodeInfo;
    public layer1AuditReport: typeof Layer1AuditReportResponse;
    public onGetLayer1AuditReportCallback: any;

    constructor(layer2ledgerNodeUrl: string) {
        this.layer2ledgerNodeUrl = DEFAULT_LAYER2_HOSTNAME;
        this.layer2LedgerAPI = new Layer2LedgerAPI(this.layer2ledgerNodeUrl);
        this.layer2LedgerAPI.getNodeInfo(this.onGetNodeInfo.bind(this));
        this.layer1AuditReport = new Layer1AuditReportResponse();

        // define callbacks
        this.onGetLayer1AuditReportCallback = null;
    }

    public setCallbacks(onGetLayer1AuditReportCallback: any) {
        this.onGetLayer1AuditReportCallback = onGetLayer1AuditReportCallback;
    }

    public onGetNodeInfo(data: any) {
        console.log("Layer2LedgerState.onGetNodeInfo");
        this.layer2LedgerNodeInfo = new Layer2LedgerNodeInfo(this.layer2ledgerNodeUrl, '', 0);
        this.layer2LedgerNodeInfo.fromJSON(data);

        // get the rest of the Layer2 Ledger info (like the audit report)
        this.getLayer1AuditReport();
    }

    public getLayer1AuditReport() {
        this.layer2LedgerAPI.getLayer1AuditReport(this.onGetLayer1AuditReport.bind(this));
    }

    public onGetLayer1AuditReport(data: any) {
        this.layer1AuditReport.fromJSON(data);
        console.log("Layer2LedgerState.onGetLayer1AuditReport: " + JSON.stringify(this.layer1AuditReport));
        this.onGetLayer1AuditReportCallback && this.onGetLayer1AuditReportCallback('', '', this.layer1AuditReport);
    }
}

export {Layer2LedgerState};