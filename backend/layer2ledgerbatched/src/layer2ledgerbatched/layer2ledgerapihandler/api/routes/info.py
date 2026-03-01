from fastapi import APIRouter
from layer2ledgerbatched.layer2ledgerapihandler.api.models.responses.get_node_info_response import (
    GetNodeInfoResponse,
    Layer1NetworkInfo,
    NodeInfo,
    Version,
)
from layer2ledgerbatched.common.constants import NODE_ASSET_ID
from config_loader.loader import get_layer2ledgerbatched_layer2ledgerapihandler_config, Environment
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
    settings = get_layer2ledgerbatched_layer2ledgerapihandler_config(Environment.PROD)

    # TODO: Get version from a more reliable source
    version = Version(
        API_version=1,
        major_version=0,
        minor_version=1,
        patch_version=0,
    )

    layer1_network_info = Layer1NetworkInfo(
        minimum_transaction_amount=settings.minimum_layer1_transaction_amount
    )

    # TODO: Confirm the correct derivation path
    node_info = NodeInfo(
        asset_id=NODE_ASSET_ID,
        deposit_address_derivation_path="m/44/1",
        layer1_network_info=layer1_network_info,
        node_id=settings.layer2ledger_node_id,
        node_name=settings.layer2ledger_node_id,  # Using NODE_ID as node_name
        onboarding_deposit_signing_key_pubkey=settings.onboarding_layer2_deposit_address.public_key,
        version=version,
    )

    return GetNodeInfoResponse(
        node_info=node_info,
        error_code=ERROR_SUCCESS,
        error_message=get_error_message(ERROR_SUCCESS),
    )
