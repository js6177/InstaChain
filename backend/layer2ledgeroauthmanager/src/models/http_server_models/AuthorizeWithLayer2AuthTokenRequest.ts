import { t } from 'elysia';

export const Layer2OAuthToken = t.Object({
    layer2_authorization_token: t.String(),
    oauth_service: t.String()
});

export type Layer2OAuthToken = typeof Layer2OAuthToken.static;

export const AuthorizeWithLayer2AuthTokenRequest = t.Object({
    layer2_oauth_token: Layer2OAuthToken
});

export type AuthorizeWithLayer2AuthTokenRequest = typeof AuthorizeWithLayer2AuthTokenRequest.static;
