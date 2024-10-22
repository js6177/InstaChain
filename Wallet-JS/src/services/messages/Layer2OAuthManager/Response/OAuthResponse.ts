import { type ErrorResponse } from "../Common/ErrorResponse";

export interface OAuthUser {
    service_name: string; // The name of the service a user is logged/signed in with (i.e. twitter, github, etc.)
    service_specific_id: string; // Their ID in the service (i.e. Twitter ID, Github ID, etc.)
    _id: string; // The primary key of the object, which is a combination of the service_name and service_specific_id
    layer2_authorization_token: string; // The token that is saved in the client's browser
    layer2_authorization_token_expiration_timestamp: number; // The expiration timestamp of the token in epoch time
    username: string;
    name: string;
    profile_description: string;
    first_login_date: Date; // Date when the user first signed up with OAuth2 to Layer2
    last_login_date: Date;
    profile_pic_url: string;
    profile_url: string;
}

export interface UserKeys {
    _id: string;
    oauth_user_id: string; // The ID of the OAuthUser object that this UserKeys object belongs to
    l2_address_mneumonic: string;               // The mnemonic of the wallet. Either this or the private key needs to be set.
}

export interface OAuthResponse {
    error_response: ErrorResponse;
    user: OAuthUser;
    user_keys: UserKeys;
}