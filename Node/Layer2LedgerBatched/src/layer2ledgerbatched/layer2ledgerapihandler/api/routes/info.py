from fastapi import APIRouter
from layer2ledgerbatched.layer2ledgerapihandler.api.models.responses.get_node_info_response import (
    GetNodeInfoResponse,
    Layer1NetworkInfo,
    NodeInfo,
    Version,
)
from layer2ledgerbatched.layer2ledgerapihandler.config import config
from layer2ledgerbatched.layer2ledgerapihandler.config.config import get_settings
from layer2ledgerbatched.layer2ledgerapihandler.utils.error_message import (
    ERROR_SUCCESS,
    get_error_message,
)

router = APIRouter()

GET_NODE_INFO_ROUTE = "/getNodeInfo"


@router.get(GET_NODE_INFO_ROUTE, response_model=GetNodeInfoResponse)
async def get_node_info() -> GetNodeInfoResponse:
    """
    Returns information about the node, such as node ID, name, asset ID, and version.
    """
    settings = get_settings()

    # TODO: Get version from a more reliable source
    version = Version(
        API_version=1,
        major_version=0,
        minor_version=1,
        patch_version=0,
    )

    layer1_network_info = Layer1NetworkInfo(
        minimum_transaction_amount=settings.MINIMUM_LAYER1_TRANSACTION_AMOUNT
    )

    # TODO: Confirm the correct derivation path
    node_info = NodeInfo(
        asset_id=config.NODE_ASSET_ID,
        deposit_address_derivation_path="m/44/1",
        layer1_network_info=layer1_network_info,
        node_id=settings.NODE_ID,
        node_name=settings.NODE_ID,  # Using NODE_ID as node_name
        onboarding_deposit_signing_key_pubkey=settings.Onboarding_Deposit_Address.public_key,
        version=version,
    )

    return GetNodeInfoResponse(
        node_info=node_info,
        error_code=ERROR_SUCCESS,
        error_message=get_error_message(ERROR_SUCCESS),
    )
