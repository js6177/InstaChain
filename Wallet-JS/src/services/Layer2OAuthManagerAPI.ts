const DEFAULT_LAYER2_OAUTHMANAGER_HOSTNAME = 'http://127.0.0.1:4000/';
import { OAuthResponse } from "../services/messages/Layer2OAuthManager/Response/OAuthResponse";
import { AuthorizeWithLayer2AuthTokenRequest, Layer2OAuthToken } from "../services/messages/Layer2OAuthManager/Request/AuthorizeWithLayer2AuthTokenRequest";
import { OAuthRequest } from "./messages/Layer2OAuthManager/Request/OAuthRequest";
import {SearchUserRequest} from "./messages/Layer2OAuthManager/Request/SearchUserRequest";
import { SearchUserResponse } from "./messages/Layer2OAuthManager/Response/SearchUserResponse";

export class Layer2OAuthManagerAPI {
  static async exchangeOAuthCode(code: string, service: string, code_verifier: string | null): Promise<OAuthResponse> {
    const body: OAuthRequest = { code, service, code_verifier };
    const response = await fetch(DEFAULT_LAYER2_OAUTHMANAGER_HOSTNAME + 'oauth/exchange', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error('OAuth exchange failed');
    }

    const data: OAuthResponse = await response.json();
    return data;
  }

  static async authorizeWithLayer2OAuthToken(layer2_oauth_token: Layer2OAuthToken): Promise<OAuthResponse> {
    const body: AuthorizeWithLayer2AuthTokenRequest = { layer2_oauth_token };
    const url: string = DEFAULT_LAYER2_OAUTHMANAGER_HOSTNAME + 'oauth/l2_token_authorize'
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error('OAuth authorize failed');
    }

    const data: OAuthResponse = await response.json();
    return data;
  }

  static async searchOAuthUser(keyword: string, callback: (searchUserRequest: SearchUserRequest,  searchUserResponse: SearchUserResponse) => void): Promise<SearchUserResponse> {

    const url: string = DEFAULT_LAYER2_OAUTHMANAGER_HOSTNAME + 'user/search'
    const body : SearchUserRequest = {keyword: keyword, username: true, profile_url: true};
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error('OAuth search failed');
    }


    const data: SearchUserResponse = await response.json();
    callback(body, data);
    return data;
  }
}