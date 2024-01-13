import {DEFAULT_LAYER2_HOSTNAME, Layer2LedgerNodeInfo, Layer2LedgerAPI} from './Layer2API/Layer2API';
import {Layer1AuditReportResponse} from './Layer2API/messages/Layer1AuditReport';

class Layer2LedgerState{
    constructor(layer2ledgerNodeUrl){
        this.layer2ledgerNodeUrl = DEFAULT_LAYER2_HOSTNAME;
        this.layer2LedgerAPI = new Layer2LedgerAPI(this.layer2ledgerNodeUrl);
        this.layer2LedgerAPI.getNodeInfo(this.onGetNodeInfo.bind(this));
        this.layer1AuditReport = new Layer1AuditReportResponse();

        //define callbacks
        this.onGetLayer1AuditReportCallback = null;
    }

    setCallbacks(onGetLayer1AuditReportCallback){
        this.onGetLayer1AuditReportCallback = onGetLayer1AuditReportCallback;
    }

    onGetNodeInfo(data){
        console.log("Layer2LedgerState.onGetNodeInfo");
        this.layer2LedgerNodeInfo = new Layer2LedgerNodeInfo(this.layer2ledgerNodeUrl, '', 0);
        this.layer2LedgerNodeInfo.fromJSON(data);

        //get the rest of the Layer2 Ledger info (like the audit report)
        this.getLayer1AuditReport();
    }

    getLayer1AuditReport(){
        this.layer2LedgerAPI.getLayer1AuditReport(this.onGetLayer1AuditReport.bind(this));
    }

    onGetLayer1AuditReport(data){
        this.layer1AuditReport.fromJSON(data);
        console.log("Layer2LedgerState.onGetLayer1AuditReport: " + JSON.stringify(this.layer1AuditReport));
        this.onGetLayer1AuditReportCallback && this.onGetLayer1AuditReportCallback('', '', this.layer1AuditReport);
    }
}

export {Layer2LedgerState};