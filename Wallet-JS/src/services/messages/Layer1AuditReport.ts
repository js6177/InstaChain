class Layer1AddressBalance {
    public layer1Address: string;
    public balance: number;

    constructor(layer1Address: string, balance: number) {
        this.layer1Address = layer1Address;
        this.balance = balance;
    }

    getAddress(): string {
        return this.layer1Address;
    }

    getBalance(): number {  
        return this.balance;
    }
}


class Layer1AuditReportResponse {
    public addressBalances: Layer1AddressBalance[];
    public errorCode: number;
    public errorMessage: string;
    public totalBalance: number;
    public blockHeight: number;
    public ready: boolean;

    constructor() {
        this.addressBalances = [];
        this.errorCode = 0;
        this.errorMessage = "";
        this.totalBalance = 0;
        this.blockHeight = 0;
        this.ready = false;
    }

    fromJSON(jsonData: any) {
        this.errorCode = jsonData['error_code'];
        this.errorMessage = jsonData['error_message'];
        this.totalBalance = jsonData['report']['balance'];
        this.blockHeight = jsonData['report']['blockHeight'];

        const addressBalances = jsonData['address_balances'];
        this.addressBalances = [];
        addressBalances.forEach((addressBalance: any) => {
            const layer1Address = addressBalance['layer1Address'];
            const balance = addressBalance['balance'];
            this.addressBalances.push(new Layer1AddressBalance(layer1Address, balance));
        });
        this.ready = true;
    }

    getAddressBalances() {
        return this.addressBalances;
    }
}

export {Layer1AuditReportResponse, Layer1AddressBalance};
