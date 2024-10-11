import CommonResponse from "../../Layer2Ledger/Responses/CommonResponse";
import { OAuthUserAuxillaryInfo } from "../Common/OAuthUserAuxillaryInfo";

// If newly_created_user is true, the user was just created (i.e. the user has not signed up or logged in before and has been created as a placeholder)
// layer2_address_public_key is the public key of the user's layer 2 address
export interface FindOAuthUserResponse {
    error_response: CommonResponse;
    user: OAuthUserAuxillaryInfo;
}