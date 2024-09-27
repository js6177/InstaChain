import CommonResponse from "../services/messages/Layer2Ledger/Responses/CommonResponse";
import { GetBalanceResponse } from "../services/messages/Layer2Ledger/Responses/GetBalanceResponse";

export function IsSuccessResponse(response: CommonResponse): boolean {
    return response.error_code === 0;
}

export function IsGetAddressBalanceFound(response: GetBalanceResponse, address: string): boolean {
   let addressFound: boolean = false;
    response.balance.forEach((addressBalance) => {
        if (addressBalance.public_key === address) {
            addressFound = addressBalance.address_found;
        }
    });
    return addressFound;
}