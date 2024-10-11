import { OAuthUser } from "../Response/OAuthResponse";

export interface OAuthUserAuxillaryInfo {
    user: OAuthUser;
    layer2_address_pubkey: string;
    placeholder_user: boolean;
}