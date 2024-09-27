import CommonResponse from "./CommonResponse";

interface GetDepositAddressResponse extends CommonResponse{
    layer1_deposit_address: string;
}

export default GetDepositAddressResponse;