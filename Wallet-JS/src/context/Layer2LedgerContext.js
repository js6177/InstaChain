import {createContext} from 'react';
import {Layer1AuditReportResponse} from '../services/messages/Layer1AuditReport';

const Layer2LedgerContext = createContext({
    layer1AuditReportResponse: new Layer1AuditReportResponse(),
    getLayer2Ledger: null,
  });

export {Layer2LedgerContext};