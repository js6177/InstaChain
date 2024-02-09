enum CurrencyUnits {
    BTC = 'bitcoins',
    SATS = 'satoshis'
}

class SettingsState {
    public currencyUnits: CurrencyUnits; // 'BTC' | 'sats'

    constructor(currencyUnits: CurrencyUnits = CurrencyUnits.SATS) {
        this.currencyUnits = currencyUnits;
    }
}

export {CurrencyUnits, SettingsState};