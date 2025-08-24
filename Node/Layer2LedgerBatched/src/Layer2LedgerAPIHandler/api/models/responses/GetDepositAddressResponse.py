from .CommonResponse import CommonResponse


class GetDepositAddressResponse(CommonResponse):
    layer1_deposit_address: str = None
