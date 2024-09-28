import { Layer2OAuthToken } from '../services/messages/Layer2OAuthManager/Request/AuthorizeWithLayer2AuthTokenRequest';
const LAYER2_OAUTH_AUTHORIZATION_TOKEN_KEY_NAME = 'layer2_authorization_token';

export function loadLayer2OAuthAuthorizationTokenFromLocalStorage() : Layer2OAuthToken | null {
    const token = localStorage.getItem(LAYER2_OAUTH_AUTHORIZATION_TOKEN_KEY_NAME);
    return token ? JSON.parse(token) : null;
}

export function saveLayer2OAuthAuthorizationTokenToLocalStorage(token: Layer2OAuthToken) : void {
    localStorage.setItem(LAYER2_OAUTH_AUTHORIZATION_TOKEN_KEY_NAME, JSON.stringify(token));
}

export function removeLayer2OAuthAuthorizationTokenFromLocalStorage() : void {
    localStorage.removeItem(LAYER2_OAUTH_AUTHORIZATION_TOKEN_KEY_NAME);
}