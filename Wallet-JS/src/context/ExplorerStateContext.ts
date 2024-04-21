import { createContext } from 'react';
import { ExplorerState } from '../state/ExplorerState';
import { ExplorerStateManager } from '../state_managers/ExplorerStateManager';

type ExplorerContextType = {
    explorerState: ExplorerState | null;
    explorerStateManager: ExplorerStateManager | null;
};

const ExplorerContext = createContext<ExplorerContextType>({
    explorerState: null,
    explorerStateManager: null,
});

export { ExplorerContext };