import { useQuery, useMutation, type UseQueryResult, type UseMutationResult } from '@tanstack/react-query';
import { treaty } from '@elysiajs/eden';
import type {
    AuthorizeWithLayer2AuthTokenRequest,
    ErrorResponse,
    FindOAuthUserResponse,
    FindOauth2UserByIdRequest,
    FindOauth2UserByIdResponse,
    FindOauthUserRequest,
    OAuthRequest,
    OAuthResponse,
    SearchUserRequest,
    SearchUserResponse,
} from '@openl2/api-layer2oauthmanager';
import { ErrorCodes } from '@openl2/api-layer2oauthmanager';
import { LAYER2_OAUTH_API_URL } from '../config';

const oauthApi = treaty(LAYER2_OAUTH_API_URL) as any;

type TreatyResult<T> = {
    data: T | null;
    error: { value?: T } | null;
};

function unwrapOAuthApiResponse<T extends { error_response: ErrorResponse }>(res: TreatyResult<T>): T {
    const response = (res.data ?? res.error?.value) as T | null | undefined;
    if (!response) {
        throw new Error('Request failed');
    }
    if (response.error_response.error_code !== ErrorCodes.Success) {
        throw new Error(response.error_response.error_message);
    }
    return response;
}

async function postOAuthFindUserById(params: FindOauth2UserByIdRequest): Promise<FindOauth2UserByIdResponse> {
    const res = await oauthApi.oauth.findUserById.post(params) as TreatyResult<FindOauth2UserByIdResponse>;
    return unwrapOAuthApiResponse(res);
}

async function postOAuthSearchUser(params: SearchUserRequest): Promise<SearchUserResponse> {
    const res = await oauthApi.user.search.post(params) as TreatyResult<SearchUserResponse>;
    return unwrapOAuthApiResponse(res);
}

async function postOAuthFindUser(params: FindOauthUserRequest): Promise<FindOAuthUserResponse> {
    const res = await oauthApi.user.find.post(params) as TreatyResult<FindOAuthUserResponse>;
    return unwrapOAuthApiResponse(res);
}

async function postOAuthL2TokenAuthorize(params: AuthorizeWithLayer2AuthTokenRequest): Promise<OAuthResponse> {
    const res = await oauthApi.oauth.l2_token_authorize.post(params) as TreatyResult<OAuthResponse>;
    return unwrapOAuthApiResponse(res);
}

async function postOAuthExchange(params: OAuthRequest): Promise<OAuthResponse> {
    const res = await oauthApi.oauth.exchange.post(params) as TreatyResult<OAuthResponse>;
    return unwrapOAuthApiResponse(res);
}

export const useFindOAuthUserById = (
    params: FindOauth2UserByIdRequest | undefined,
): UseQueryResult<FindOauth2UserByIdResponse, Error> => {
    return useQuery<FindOauth2UserByIdResponse, Error>({
        queryKey: ['OAuthFindUserById', params],
        queryFn: () => postOAuthFindUserById(params!),
        enabled: !!params?.service_name && !!params?.service_specific_id,
        staleTime: Infinity,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
    });
};

export const useSearchOAuthUser = (
    params: SearchUserRequest | undefined,
): UseQueryResult<SearchUserResponse, Error> => {
    return useQuery<SearchUserResponse, Error>({
        queryKey: ['OAuthSearchUser', params],
        queryFn: () => postOAuthSearchUser(params!),
        enabled: !!params?.keyword,
    });
};

export const useFindOAuthUser = (
    params: FindOauthUserRequest | undefined,
): UseQueryResult<FindOAuthUserResponse, Error> => {
    return useQuery<FindOAuthUserResponse, Error>({
        queryKey: ['OAuthFindUser', params],
        queryFn: () => postOAuthFindUser(params!),
        enabled: !!params?.profile_url,
    });
};

export const useAuthorizeWithLayer2Token = (
    params: AuthorizeWithLayer2AuthTokenRequest | undefined,
): UseQueryResult<OAuthResponse, Error> => {
    return useQuery<OAuthResponse, Error>({
        queryKey: ['OAuthL2TokenAuthorize', params],
        queryFn: () => postOAuthL2TokenAuthorize(params!),
        enabled: !!params?.layer2_oauth_token.layer2_authorization_token,
    });
};

export const useOAuthExchangeMutation = (): UseMutationResult<OAuthResponse, Error, OAuthRequest> => {
    return useMutation<OAuthResponse, Error, OAuthRequest>({
        mutationFn: postOAuthExchange,
    });
};
