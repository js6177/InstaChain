import testKeys from './test.keys.json';

export interface TestKeys {
    mnemonic: string;
}

export class TestKeysModel {
    private keys: TestKeys;

    constructor(keys: TestKeys) {
        this.keys = keys;
    }

    get mnemonic(): string {
        return this.keys.mnemonic;
    }

    get mnemonicWords(): string[] {
        return this.keys.mnemonic.split(' ');
    }

    static load(): TestKeysModel {
        return new TestKeysModel(testKeys);
    }
}
