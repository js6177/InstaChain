import { useQuery, useMutation, type UseQueryResult, type UseMutationResult } from '@tanstack/react-query';
import { treaty } from '@elysiajs/eden';
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
} from '@openl2/api-layer2oauthmanager';
import { LAYER2_OAUTH_API_URL } from '../config';

const oauthApi = treaty(LAYER2_OAUTH_API_URL) as any;

type TreatyError = { value?: { error?: string } };

function getTreatyErrorMessage(error: TreatyError): string {
    return error.value?.error ?? 'Request failed';
}

async function postOAuthFindUserById(params: FindOauth2UserByIdRequest): Promise<FindOauth2UserByIdResponse> {
    const res = await oauthApi.oauth.findUserById.post(params);
    if (res.error) {
        throw new Error(getTreatyErrorMessage(res.error));
    }
    return res.data;
}

async function postOAuthSearchUser(params: SearchUserRequest): Promise<SearchUserResponse> {
    const res = await oauthApi.user.search.post(params);
    if (res.error) {
        throw new Error(getTreatyErrorMessage(res.error));
    }
    return res.data;
}

async function postOAuthFindUser(params: FindOauthUserRequest): Promise<FindOAuthUserResponse> {
    const res = await oauthApi.user.find.post(params);
    if (res.error) {
        throw new Error(getTreatyErrorMessage(res.error));
    }
    return res.data;
}

async function postOAuthL2TokenAuthorize(params: AuthorizeWithLayer2AuthTokenRequest): Promise<OAuthResponse> {
    const res = await oauthApi.oauth.l2_token_authorize.post(params);
    if (res.error) {
        throw new Error(getTreatyErrorMessage(res.error));
    }
    return res.data;
}

async function postOAuthExchange(params: OAuthRequest): Promise<OAuthResponse> {
    const res = await oauthApi.oauth.exchange.post(params);
    if (res.error) {
        throw new Error(getTreatyErrorMessage(res.error));
    }
    return res.data;
}

export const useFindOAuthUserById = (
    serviceName: string | undefined,
    serviceSpecificId: string | undefined,
): UseQueryResult<FindOauth2UserByIdResponse, Error> => {
    return useQuery<FindOauth2UserByIdResponse, Error>({
        queryKey: ['OAuthFindUserById', serviceName, serviceSpecificId],
        queryFn: () => postOAuthFindUserById({
            service_name: serviceName!,
            service_specific_id: serviceSpecificId!,
        }),
        enabled: !!serviceName && !!serviceSpecificId,
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
