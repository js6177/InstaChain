import MyApp from './pages/MainUI';
import React from 'react';
import {Workspace} from './state/Workspace';
import {Layer2LedgerStateManager} from './state_managers/Layer2LedgerStateManager';
import {WorkspaceStateManager} from './state_managers/WorkSpaceStateManager';
import {useState, useEffect} from 'react';
import { Layer2LedgerContext } from './context/Layer2LedgerContext';
import { WorkspaceContext } from './context/WorkspaceContext';
import { Layer2LedgerState } from './state/Layer2LedgerState';
import { SettingsState } from './state/SettingsState';
import { SettingsManager } from './state_managers/SettingsManager';
import { SettingsContext } from './context/SettingsContext';
import { ExplorerState } from './state/ExplorerState';
import { ExplorerStateManager } from './state_managers/ExplorerStateManager';
import { ExplorerContext } from './context/ExplorerStateContext';
import { BrowserRouter, RouterProvider} from "react-router-dom";


function UiController(props: any) {
    console.log("UiController");
    const [initialized, setInitialized] = useState(false);
    const [layer2LedgerState, setLayer2LedgerState] = useState<Layer2LedgerState | null>(null);
    const [layer2LedgerStateManager, setLayer2LedgerStateManager] = useState<Layer2LedgerStateManager | null>(null);

    const [workspace, setWorkSpace] = useState<Workspace | null>(null);
    const [workspaceStateManager, setWorkspaceStateManagerState] = useState<WorkspaceStateManager | null>(null);

    const [settingsState, setSettingsState] = useState<SettingsState | null>(null);
    const [settingsManager, setSettingsManager] = useState<SettingsManager | null>(null);

    const [explorerState, setExplorerState] = useState<ExplorerState | null>(null);
    const [explorerStateManager, setExplorerStateManager] = useState<ExplorerStateManager | null>(null);

    useEffect(() => {
        if (!initialized) {
            console.log("UiController: Initializing");
            setLayer2LedgerState(new Layer2LedgerState());
            setLayer2LedgerStateManager(new Layer2LedgerStateManager(setLayer2LedgerState));

            setWorkSpace(new Workspace());
            setWorkspaceStateManagerState(new WorkspaceStateManager(setWorkSpace));

            setSettingsState(new SettingsState());
            setSettingsManager(new SettingsManager(setSettingsState));

            setExplorerState(new ExplorerState());
            setExplorerStateManager(new ExplorerStateManager(setExplorerState));

            layer2LedgerStateManager?.fetchLayer2LedgerState();

            setInitialized(true);
        }
    }, [initialized]);


    return (       
        {initialized} && 
        <div>
            <Layer2LedgerContext.Provider value={{layer2LedgerState, layer2LedgerStateManager}}>
                <WorkspaceContext.Provider value={{workspace, workspaceStateManager}}>
                    <SettingsContext.Provider value={{settingsState, settingsManager}}>
                        <ExplorerContext.Provider value={{explorerState, explorerStateManager}}>
                            <BrowserRouter basename="">
                                <MyApp/>
                            </BrowserRouter>
                        </ExplorerContext.Provider>
                    </SettingsContext.Provider>
                </WorkspaceContext.Provider>
            </Layer2LedgerContext.Provider>
        </div>
        
    );

}


export {UiController}