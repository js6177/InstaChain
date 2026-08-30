import type {
	AuthorizeWithLayer2AuthTokenRequest,
	FindOAuthUserResponse,
	FindOauth2UserByIdRequest,
	FindOauth2UserByIdResponse,
	FindOauthUserRequest,
	HealthResponse,
	OAuthRequest,
	OAuthResponse,
	SearchUserRequest,
	SearchUserResponse,
} from "@openl2/layer2oauthmanager/http-server-models";
import { type Layer2OAuthClient, unwrapLayer2OAuthResponse } from "./eden";

/**
 * Typed Eden wrappers. Response/request shapes come from TypeBox models on the
 * server (`*.static`) — do not redefine them here. Explicit generics keep the
 * client typed even when duplicate `elysia` installs break treaty inference.
 */

export async function getOAuthHealth(
	client: Layer2OAuthClient,
): Promise<HealthResponse> {
	return unwrapLayer2OAuthResponse<HealthResponse>(await client.health.get());
}

export async function oauthExchange(
	client: Layer2OAuthClient,
	body: OAuthRequest,
): Promise<OAuthResponse> {
	return unwrapLayer2OAuthResponse<OAuthResponse>(
		await client.oauth.exchange.post(body),
	);
}

export async function authorizeWithLayer2Token(
	client: Layer2OAuthClient,
	body: AuthorizeWithLayer2AuthTokenRequest,
): Promise<OAuthResponse> {
	return unwrapLayer2OAuthResponse<OAuthResponse>(
		await client.oauth.l2_token_authorize.post(body),
	);
}

export async function searchOAuthUser(
	client: Layer2OAuthClient,
	body: SearchUserRequest,
): Promise<SearchUserResponse> {
	return unwrapLayer2OAuthResponse<SearchUserResponse>(
		await client.user.search.post(body),
	);
}

export async function findOAuthUser(
	client: Layer2OAuthClient,
	body: FindOauthUserRequest,
): Promise<FindOAuthUserResponse> {
	return unwrapLayer2OAuthResponse<FindOAuthUserResponse>(
		await client.user.find.post(body),
	);
}

export async function findOAuthUserById(
	client: Layer2OAuthClient,
	body: FindOauth2UserByIdRequest,
): Promise<FindOauth2UserByIdResponse> {
	return unwrapLayer2OAuthResponse<FindOauth2UserByIdResponse>(
		await client.oauth.findUserById.post(body),
	);
}
