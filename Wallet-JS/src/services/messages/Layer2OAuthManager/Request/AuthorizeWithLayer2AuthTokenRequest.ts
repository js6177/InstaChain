export interface Layer2OAuthToken {
    layer2_authorization_token: string;
    oauth_service: string;
}

export interface AuthorizeWithLayer2AuthTokenRequest {
    layer2_oauth_token: Layer2OAuthToken;
}