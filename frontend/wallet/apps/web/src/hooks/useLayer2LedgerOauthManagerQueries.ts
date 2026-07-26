import {
	type AuthorizeWithLayer2AuthTokenRequest,
	createLayer2OAuthClient,
	type FindOAuthUserResponse,
	type FindOauth2UserByIdRequest,
	type FindOauth2UserByIdResponse,
	type FindOauthUserRequest,
	type OAuthRequest,
	type OAuthResponse,
	type SearchUserRequest,
	type SearchUserResponse,
	unwrapLayer2OAuthResponse,
} from "@openl2/api-layer2oauthmanager";
import { useMutation, useQuery } from "@tanstack/react-query";
import { LAYER2_OAUTH_API_URL } from "../config";

const oauthApi = createLayer2OAuthClient(LAYER2_OAUTH_API_URL);

export const useFindOAuthUserById = (
	params: FindOauth2UserByIdRequest | undefined,
) => {
	return useQuery({
		queryKey: ["OAuthFindUserById", params],
		queryFn: async () =>
			unwrapLayer2OAuthResponse<FindOauth2UserByIdResponse>(
				await oauthApi.oauth.findUserById.post(params!),
			),
		enabled: !!params?.service_name && !!params?.service_specific_id,
		staleTime: Infinity,
		refetchOnWindowFocus: false,
		refetchOnReconnect: false,
	});
};

export const useSearchOAuthUser = (params: SearchUserRequest | undefined) => {
	return useQuery({
		queryKey: ["OAuthSearchUser", params],
		queryFn: async () =>
			unwrapLayer2OAuthResponse<SearchUserResponse>(
				await oauthApi.user.search.post(params!),
			),
		enabled: !!params?.keyword,
	});
};

export const useFindOAuthUser = (params: FindOauthUserRequest | undefined) => {
	return useQuery({
		queryKey: ["OAuthFindUser", params],
		queryFn: async () =>
			unwrapLayer2OAuthResponse<FindOAuthUserResponse>(
				await oauthApi.user.find.post(params!),
			),
		enabled: !!params?.profile_url,
	});
};

export const useAuthorizeWithLayer2Token = (
	params: AuthorizeWithLayer2AuthTokenRequest | undefined,
) => {
	return useQuery({
		queryKey: ["OAuthL2TokenAuthorize", params],
		queryFn: async () =>
			unwrapLayer2OAuthResponse<OAuthResponse>(
				await oauthApi.oauth.l2_token_authorize.post(params!),
			),
		enabled: !!params?.layer2_oauth_token.layer2_authorization_token,
	});
};

export const useOAuthExchangeMutation = () => {
	return useMutation({
		mutationFn: async (params: OAuthRequest) =>
			unwrapLayer2OAuthResponse<OAuthResponse>(
				await oauthApi.oauth.exchange.post(params),
			),
	});
};
