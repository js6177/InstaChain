/* {
    "error_code": 0,
    "error_message": "Success",
    "node_info": {
      "asset_id": 4294967297,
      "deposit_address_derivation_path": "pkh(tpubD6NzVbkrYhZ4YU15BP5R2pwULcnTN7ZoZs6LDkEweNcdMAGVso8StyyqkP4cfVhYGjjcrYjz3zT2ArT9h3scrZCdLkhdQciJbmJ9jMXMv8w/44/1/(i/2147483647)/(i%2147483647))",
      "node_id": "BbwLnyLR9eVjL2qb",
      "node_name": "Tesnet Node",
      "version": {
        "API_version": 1,
        "major_version": 1,
        "minor_version": 0,
        "patch_version": 0
      }
    }
} */

import CommonResponse from "./CommonResponse";

interface NodeInfo {
    asset_id: number;
    deposit_address_derivation_path: string;
    node_id: string;
    node_name: string;
    version: {
        API_version: number;
        major_version: number;
        minor_version: number;
        patch_version: number;
    };
    layer1_network_info: {
      minimum_transaction_amount: number;
    }
}

interface GetNodeInfoResponse extends CommonResponse{
    node_info: NodeInfo;
}

export { GetNodeInfoResponse, NodeInfo };