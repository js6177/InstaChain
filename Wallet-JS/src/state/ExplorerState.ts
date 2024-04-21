enum DisplayedEntityType {
    AddressBalance = "AddressBalance",
    AddressOverview = "AddressOverview",
    Transaction = "Transaction",
    NoSearchResults = "NoSearchResults",
}

interface DisplayedEntity {
    type: DisplayedEntityType;
    id: string;
}

class ExplorerState {
    public lastSearchText: string;
    public displayedEntity: DisplayedEntity;

    constructor(lastSearchText: string = '', displayedEntityType: DisplayedEntityType = DisplayedEntityType.NoSearchResults, displayedEntityId: string = '') {
        this.lastSearchText = lastSearchText;
        this.displayedEntity = { type: displayedEntityType, id: displayedEntityId };
    }

    public setDisplayedAddressBalance(address: string) {
        const displayedEntity = {
            type: DisplayedEntityType.AddressBalance,
            id: address,
        };
        this.setDisplayedEntity(displayedEntity);
    }

    public setDisplayedAddressOverview(address: string) {
        const displayedEntity = {
            type: DisplayedEntityType.AddressOverview,
            id: address,
        };
        this.setDisplayedEntity(displayedEntity);
    }

    public setDisplayedTransaction(txid: string) {
        const displayedEntity = {
            type: DisplayedEntityType.Transaction,
            id: txid,
        };
        this.setDisplayedEntity(displayedEntity);
    }

    public setNoSearchResults() {
        const displayedEntity = {
            type: DisplayedEntityType.NoSearchResults,
            id: '',
        };
        this.setDisplayedEntity(displayedEntity);
    }

    public setDisplayedEntity(displayedEntity: DisplayedEntity) {
        this.displayedEntity = displayedEntity;
    }

    public setLastSearchText(lastSearchText: string) {
        this.lastSearchText = lastSearchText;
    }

    public isAddressBalanceDisplayed() {
        return this.displayedEntity?.type === DisplayedEntityType.AddressBalance;
    }

    public isAddressOverviewDisplayed() {
        return this.displayedEntity?.type === DisplayedEntityType.AddressOverview;
    }

    public isTransactionDisplayed() {
        return this.displayedEntity?.type === DisplayedEntityType.Transaction;
    }

    public isNoSearchResultsDisplayed() {
        return this.displayedEntity?.type === DisplayedEntityType.NoSearchResults;
    }

    public clear() {
        this.lastSearchText = '';
        this.displayedEntity = { type: DisplayedEntityType.NoSearchResults, id: '' };
    }

}

export { ExplorerState, DisplayedEntityType, DisplayedEntity };