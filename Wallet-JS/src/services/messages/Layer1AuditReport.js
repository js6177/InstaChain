class Layer1AddressBalance {
    constructor(layer1Address, balance) {
        this.layer1Address = layer1Address;
        this.balance = balance;
    }

    getAddress() {
        return this.layer1Address;
    }

    getBalance() {  
        return this.balance;
    }
}


class Layer1AuditReportResponse{
    constructor(){
        this.addressBalances = [];
        this.errorCode = 0;
        this.errorMessage = "";
        this.totalBalance = 0;
        this.blockHeight = 0;
    }

    fromJSON(jsonData){
        this.errorCode = jsonData['error_code'];
        this.errorMessage = jsonData['error_message'];
        this.totalBalance = jsonData['report']['balance'];
        this.blockHeight = jsonData['report']['blockHeight'];

        let addressBalances = jsonData['address_balances'];
        addressBalances.forEach(addressBalance => {
            let layer1Address = addressBalance['layer1Address'];
            let balance = addressBalance['balance'];
            this.addressBalances.push(new Layer1AddressBalance(layer1Address, balance));
        })
    }

    getAddressBalances(){
        return this.addressBalances;
    }
}

export {Layer1AuditReportResponse, Layer1AddressBalance};
