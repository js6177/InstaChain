import { createContext, Context } from 'react';
import { Workspace } from '../state/Workspace';
import { WorkspaceStateManager } from '../state_managers/WorkSpaceStateManager';

type WorkspaceContextType = {
    workspace: Workspace | null;
    workspaceStateManager: WorkspaceStateManager | null;
};

const WorkspaceContext: Context<WorkspaceContextType> = createContext<WorkspaceContextType>({
    workspace: null,
    workspaceStateManager: null,
});

export { WorkspaceContext };
