import { useQuery, useMutation } from "@tanstack/react-query";
import {
	createLayer2OAuthClient,
	unwrapLayer2OAuthResponse,
	type AuthorizeWithLayer2AuthTokenRequest,
	type FindOauth2UserByIdRequest,
	type FindOauth2UserByIdResponse,
	type FindOauthUserRequest,
	type FindOAuthUserResponse,
	type OAuthRequest,
	type OAuthResponse,
	type SearchUserRequest,
	type SearchUserResponse,
} from "@openl2/api-layer2oauthmanager";
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
