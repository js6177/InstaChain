import type { OAuthUser } from "models/db_models/OAuthUser";

export interface OAuthUserAuxillaryInfo {
    user: OAuthUser;
    layer2_address_pubkey: string;
    placeholder_user: boolean;
}