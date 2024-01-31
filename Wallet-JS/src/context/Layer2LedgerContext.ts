import {createContext, Context} from 'react';
import {Layer1AuditReportResponse} from '../services/messages/Layer1AuditReport';
import {Layer2LedgerStateManager} from '../state_managers/Layer2LedgerStateManager';

import { type } from 'os';

type Layer2LedgerContextType = {
    layer1AuditReportResponse: Layer1AuditReportResponse;
    layer2LedgerStateManager: Layer2LedgerStateManager | null;
};

const Layer2LedgerContext : Context<Layer2LedgerContextType> = createContext<Layer2LedgerContextType>({
    layer1AuditReportResponse: new Layer1AuditReportResponse(),
    layer2LedgerStateManager: null,
  });

export {Layer2LedgerContext};