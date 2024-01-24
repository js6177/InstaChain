import {createContext} from 'react';
import { Workspace } from '../state/Workspace';
import { WorkspaceStateManager } from '../state_managers/WorkSpaceStateManager';

const WorkspaceContext = createContext({
    workspace: null,
    workspaceStateManager: null,
});

export {WorkspaceContext};