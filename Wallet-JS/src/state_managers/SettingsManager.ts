import { SettingsState, CurrencyUnits } from '../state/SettingsState';

class SettingsManager {
    public setSettingsState: (state: SettingsState) => void;
    public settingsState: SettingsState;

    constructor(_setSettingsState: (state: SettingsState) => void) {
        this.setSettingsState = _setSettingsState;
        this.settingsState = new SettingsState();
    }

    public setCurrencyUnits(currencyUnits: CurrencyUnits) {
        this.settingsState.currencyUnits = currencyUnits;
        this.setLatestSettingsState();
    }

    public setLatestSettingsState(){
        this.setSettingsState && this.setSettingsState(this.settingsState);
    }
}

export { SettingsManager };