import type { AuthorizeWithLayer2AuthTokenRequest } from "../models/http_server_models/AuthorizeWithLayer2AuthTokenRequest";
import type { FindOauth2UserByIdRequest } from "../models/http_server_models/FindOauth2UserByIdRequest";
import type { FindOauth2UserByIdResponse } from "../models/http_server_models/FindOauth2UserByIdResponse";
import type { FindOauthUserRequest } from "../models/http_server_models/FindOauthUserRequest";
import type { FindOAuthUserResponse } from "../models/http_server_models/FindOauthUserResponse";
import type { OAuthRequest } from "../models/http_server_models/OAuthRequest";
import type { OAuthResponse } from "../models/http_server_models/OAuthResponse";
import type { SearchUserRequest } from "../models/http_server_models/SearchUserRequest";
import type { SearchUserResponse } from "../models/http_server_models/SearchUserResponse";

export interface RouteSetStatus {
	status?: number | string;
}

export interface HealthResponse {
	status: string;
}

export interface Layer2OAuthRouteHandlers {
	health(): HealthResponse;
	exchange(body: OAuthRequest, set: RouteSetStatus): Promise<OAuthResponse>;
	authorizeWithLayer2Token(
		body: AuthorizeWithLayer2AuthTokenRequest,
		set: RouteSetStatus,
	): Promise<OAuthResponse>;
	searchUser(
		body: SearchUserRequest,
		set: RouteSetStatus,
	): Promise<SearchUserResponse>;
	findUser(
		body: FindOauthUserRequest,
		set: RouteSetStatus,
	): Promise<FindOAuthUserResponse>;
	findUserById(
		body: FindOauth2UserByIdRequest,
		set: RouteSetStatus,
	): Promise<FindOauth2UserByIdResponse>;
}
