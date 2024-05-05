import {createContext, Context} from 'react';
import {Layer2LedgerStateManager} from '../state_managers/Layer2LedgerStateManager';
import { Layer2LedgerState } from '../state/Layer2LedgerState';


type Layer2LedgerContextType = {
    layer2LedgerState: Layer2LedgerState | null;
    layer2LedgerStateManager: Layer2LedgerStateManager | null;
};

const Layer2LedgerContext : Context<Layer2LedgerContextType> = createContext<Layer2LedgerContextType>({
    layer2LedgerState: null,
    layer2LedgerStateManager: null,
  });

export {Layer2LedgerContext};