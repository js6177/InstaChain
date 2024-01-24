import MyApp from './pages/MainUI';
import React from 'react';
import {Workspace} from './state/Workspace';
import {Layer2LedgerStateManager} from './state_managers/Layer2LedgerStateManager';
import {WorkspaceStateManager} from './state_managers/WorkSpaceStateManager';
import {Layer1AuditReportResponse} from './services/messages/Layer1AuditReport';
import {useState, useEffect} from 'react';
import { Layer2LedgerContext } from './context/Layer2LedgerContext';
import { WorkspaceContext } from './context/WorkspaceContext';


function UiController(props) {
    const [layer1AuditReportResponse, setlayer1AuditReportResponse] = useState(
        new Layer1AuditReportResponse()
    );
    const layer2LedgerStateManager = new Layer2LedgerStateManager(setlayer1AuditReportResponse);

    const [workSpace, setWorkSpace] = useState(new Workspace());
    const [workspaceStateManager, setWorkspaceStateManagerState] = useState(new WorkspaceStateManager(setWorkSpace));

    console.log("UiController workSpace: " + JSON.stringify(workSpace, null, 2));

    useEffect(() => {
        layer2LedgerStateManager.fetchLayer2LedgerState();
    }, []);

    return (        
        <div>
            <Layer2LedgerContext.Provider value={{layer1AuditReportResponse , layer2LedgerStateManager}}>
                <WorkspaceContext.Provider value={{workSpace, workspaceStateManager}}>
                    <MyApp/>
                </WorkspaceContext.Provider>
            </Layer2LedgerContext.Provider>
        </div>
    );

}


export {UiController}