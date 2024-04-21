import { ExplorerState } from "../state/ExplorerState";

class ExplorerStateManager {
    public setExplorerState: (state: ExplorerState) => void;
    public explorerState: ExplorerState;

    constructor(_setExplorerState: (state: ExplorerState) => void) {
        this.setExplorerState = _setExplorerState;
        this.explorerState = new ExplorerState();
    }

    public setDisplayedAddressBalance(address: string) {
        this.explorerState.setDisplayedAddressBalance(address);
        this.setLatestExplorerState();
    }

    public setDisplayedAddressOverview(address: string) {
        this.explorerState.setDisplayedAddressOverview(address);
        this.setLatestExplorerState();
    }

    public setDisplayedTransaction(txid: string) {
        this.explorerState.setDisplayedTransaction(txid);
        this.setLatestExplorerState();
    }

    public setNoSearchResults() {
        this.explorerState.setNoSearchResults();
        this.setLatestExplorerState();
    }

    public setLastSearchText(lastSearchText: string) {
        this.explorerState.setLastSearchText(lastSearchText);
        this.setLatestExplorerState();
    }

    public clear() {
        this.explorerState.clear();
        this.setLatestExplorerState();
    }

    public setLatestExplorerState(){
        this.setExplorerState && this.setExplorerState(this.explorerState);
    }
}

export { ExplorerStateManager };