import {DEFAULT_LAYER2_HOSTNAME, Layer2LedgerNodeInfo, Layer2LedgerAPI} from '../services/Layer2API';
import {Layer1AuditReportResponse} from '../services/messages/Layer1AuditReport';

class Layer2LedgerStateManager{
    constructor(setLayer1AuditState, layer2ledgerNodeUrl = DEFAULT_LAYER2_HOSTNAME){
        this.setLayer1AuditState = setLayer1AuditState;
        this.layer2ledgerNodeUrl = layer2ledgerNodeUrl;
        this.layer2LedgerAPI = new Layer2LedgerAPI(this.layer2ledgerNodeUrl);
        this.layer1AuditReport = new Layer1AuditReportResponse();
    }

    fetchLayer2LedgerState(){
        this.layer2LedgerAPI.getNodeInfo(this.onGetNodeInfo.bind(this));
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

        this.setLayer1AuditState && this.setLayer1AuditState(this.layer1AuditReport);
    }
}

export {Layer2LedgerStateManager};