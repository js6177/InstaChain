import type {
	AuthorizeWithLayer2AuthTokenRequest,
	FindOAuthUserResponse,
	FindOauth2UserByIdRequest,
	FindOauth2UserByIdResponse,
	FindOauthUserRequest,
	OAuthRequest,
	OAuthResponse,
	SearchUserRequest,
	SearchUserResponse,
} from "@openl2/api-layer2oauthmanager";
import {
	authorizeWithLayer2Token,
	createLayer2OAuthClient,
	findOAuthUser,
	findOAuthUserById,
	oauthExchange,
	searchOAuthUser,
} from "@openl2/api-layer2oauthmanager";
import {
	type UseMutationResult,
	type UseQueryResult,
	useMutation,
	useQuery,
} from "@tanstack/react-query";
import { LAYER2_OAUTH_API_URL } from "../config";

const oauthApi = createLayer2OAuthClient(LAYER2_OAUTH_API_URL);

export function useFindOAuthUserById(
	params: FindOauth2UserByIdRequest | undefined,
): UseQueryResult<FindOauth2UserByIdResponse, Error> {
	return useQuery({
		queryKey: ["OAuthFindUserById", params],
		queryFn: async (): Promise<FindOauth2UserByIdResponse> => {
			if (!params) {
				throw new Error("FindOauth2UserByIdRequest is required");
			}
			return findOAuthUserById(oauthApi, params);
		},
		enabled: !!params?.service_name && !!params?.service_specific_id,
		staleTime: Infinity,
		refetchOnWindowFocus: false,
		refetchOnReconnect: false,
	});
}

export function useSearchOAuthUser(
	params: SearchUserRequest | undefined,
): UseQueryResult<SearchUserResponse, Error> {
	return useQuery({
		queryKey: ["OAuthSearchUser", params],
		queryFn: async (): Promise<SearchUserResponse> => {
			if (!params) {
				throw new Error("SearchUserRequest is required");
			}
			return searchOAuthUser(oauthApi, params);
		},
		enabled: !!params?.keyword,
	});
}

export function useFindOAuthUser(
	params: FindOauthUserRequest | undefined,
): UseQueryResult<FindOAuthUserResponse, Error> {
	return useQuery({
		queryKey: ["OAuthFindUser", params],
		queryFn: async (): Promise<FindOAuthUserResponse> => {
			if (!params) {
				throw new Error("FindOauthUserRequest is required");
			}
			return findOAuthUser(oauthApi, params);
		},
		enabled: !!params?.profile_url,
	});
}

export function useAuthorizeWithLayer2Token(
	params: AuthorizeWithLayer2AuthTokenRequest | undefined,
): UseQueryResult<OAuthResponse, Error> {
	return useQuery({
		queryKey: ["OAuthL2TokenAuthorize", params],
		queryFn: async (): Promise<OAuthResponse> => {
			if (!params) {
				throw new Error("AuthorizeWithLayer2AuthTokenRequest is required");
			}
			return authorizeWithLayer2Token(oauthApi, params);
		},
		enabled: !!params?.layer2_oauth_token.layer2_authorization_token,
	});
}

export function useOAuthExchangeMutation(): UseMutationResult<
	OAuthResponse,
	Error,
	OAuthRequest
> {
	return useMutation({
		mutationFn: async (params: OAuthRequest): Promise<OAuthResponse> => {
			return oauthExchange(oauthApi, params);
		},
	});
}
