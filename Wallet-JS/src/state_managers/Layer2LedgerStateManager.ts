import { GetNodeInfoResponse } from "../services/messages/GetNodeInfoResponse";
import { Layer2LedgerState } from "../state/Layer2LedgerState";

import { DEFAULT_LAYER2_HOSTNAME } from '../services/Layer2API';
import { Layer2LedgerNodeInfo, Layer2LedgerAPI } from '../services/Layer2API';
import { Layer1AuditReportResponse } from '../services/messages/Layer1AuditReport';

class Layer2LedgerStateManager {
    public setLayer2LedgerState: (state: Layer2LedgerState) => void;
    public layer2LedgerState: Layer2LedgerState;

    constructor(_setLayer2LedgerState: (state: Layer2LedgerState) => void, layer2ledgerNodeUrl = DEFAULT_LAYER2_HOSTNAME) {
        this.setLayer2LedgerState = _setLayer2LedgerState;
        this.layer2LedgerState = new Layer2LedgerState(layer2ledgerNodeUrl);
    }

    public fetchLayer2LedgerState() {
        this.layer2LedgerState.layer2LedgerAPI.getNodeInfo(this.onGetNodeInfo.bind(this));
    }

    private onGetNodeInfo(getNodeInfoResponse: GetNodeInfoResponse) {
        this.layer2LedgerState.layer2LedgerNodeInfo = new Layer2LedgerNodeInfo(this.layer2LedgerState.layer2ledgerNodeUrl, '', 0);
        this.layer2LedgerState.layer2LedgerNodeInfo.fromGetNodeInfoResponse(getNodeInfoResponse);

        //get the rest of the Layer2 Ledger info (like the audit report)
        this.getLayer1AuditReport();
    }

    private getLayer1AuditReport() {
        this.layer2LedgerState.layer2LedgerAPI.getLayer1AuditReport(this.onGetLayer1AuditReport.bind(this));
    }

    private onGetLayer1AuditReport(data: any) {
        this.layer2LedgerState.layer1AuditReport.fromJSON(data);
        this.setLatestLayer2LedgerState();
    }

    public setLatestLayer2LedgerState(){
        this.setLayer2LedgerState && this.setLayer2LedgerState(this.layer2LedgerState);
    }
}

export {Layer2LedgerStateManager};