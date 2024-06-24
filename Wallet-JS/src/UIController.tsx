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
    const [layer2LedgerState, setLayer2LedgerState] = useState( new Layer2LedgerState() );
    const layer2LedgerStateManager = new Layer2LedgerStateManager(setLayer2LedgerState);

    const [workspace, setWorkSpace] = useState(new Workspace());
    const [workspaceStateManager, setWorkspaceStateManagerState] = useState(new WorkspaceStateManager(setWorkSpace));

    const [settingsState, setSettingsState] = useState(new SettingsState());
    const settingsManager = new SettingsManager(setSettingsState);

    const [explorerState, setExplorerState] = useState(new ExplorerState());
    const explorerStateManager = new ExplorerStateManager(setExplorerState);

    useEffect(() => {
        layer2LedgerStateManager.fetchLayer2LedgerState();
    }, []);

    return (        
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