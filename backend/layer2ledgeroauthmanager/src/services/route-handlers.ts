import type { ConfigInterface } from '@openl2/config-loader';
import type { DatabaseInterface } from '../DatabaseInterface';
import type { DiscordOAuthManager } from '../OAuthInterfaces/DiscordOAuthManager';
import type { FacebookOAuthManager } from '../OAuthInterfaces/FacebookOAuthManager';
import type { GithubOAuthManager } from '../OAuthInterfaces/GithubOAuthManager';
import type { GoogleOAuthManager } from '../OAuthInterfaces/GoogleOAuthManager';
import type { TwitterOAuthManager } from '../OAuthInterfaces/TwitterOAuthManger';
import type { OAuthUser } from '../models/db_models/OAuthUser';
import type { Layer2OAuthRouteHandlers, RouteSetStatus } from '../api/handlers';
import type { AuthorizeWithLayer2AuthTokenRequest } from '../models/http_server_models/AuthorizeWithLayer2AuthTokenRequest';
import type { FindOauth2UserByIdRequest } from '../models/http_server_models/FindOauth2UserByIdRequest';
import type { FindOauth2UserByIdResponse } from '../models/http_server_models/FindOauth2UserByIdResponse';
import type { FindOauthUserRequest } from '../models/http_server_models/FindOauthUserRequest';
import type { FindOAuthUserResponse } from '../models/http_server_models/FindOauthUserResponse';
import { OAuthService, type OAuthRequest } from '../models/http_server_models/OAuthRequest';
import type { OAuthResponse } from '../models/http_server_models/OAuthResponse';
import type { SearchUserRequest } from '../models/http_server_models/SearchUserRequest';
import type { SearchUserResponse } from '../models/http_server_models/SearchUserResponse';
import { ErrorCodes, type ErrorCode } from '../models/http_server_models/ErrorCodes';
import { buildErrorResponse } from '../models/http_server_models/Common/ErrorResponse';

export interface OAuthRouteHandlerDependencies {
  mongoDb: DatabaseInterface;
  twitterOAuthManager: TwitterOAuthManager | null;
  githubOAuthManager: GithubOAuthManager | null;
  googleOAuthManager: GoogleOAuthManager | null;
  facebookOAuthManager: FacebookOAuthManager | null;
  discordOAuthManager: DiscordOAuthManager | null;
}

function buildOAuthErrorResponse(code: ErrorCode): OAuthResponse {
  return {
    error_response: buildErrorResponse(code),
    user: null,
    user_keys: null,
  };
}

function buildSearchUserErrorResponse(code: ErrorCode): SearchUserResponse {
  return {
    error_response: buildErrorResponse(code),
    users: null,
  };
}

function buildFindOAuthUserErrorResponse(code: ErrorCode): FindOAuthUserResponse {
  return {
    error_response: buildErrorResponse(code),
    user: null,
  };
}

function buildFindOauth2UserByIdErrorResponse(code: ErrorCode): FindOauth2UserByIdResponse {
  return {
    error_response: buildErrorResponse(code),
  };
}

export function createOAuthRouteHandlers(
  deps: OAuthRouteHandlerDependencies,
): Layer2OAuthRouteHandlers {
  const {
    mongoDb,
    twitterOAuthManager,
    githubOAuthManager,
    googleOAuthManager,
    facebookOAuthManager,
    discordOAuthManager,
  } = deps;

  return {
    health() {
      return { status: 'ok' };
    },

    async exchange(body: OAuthRequest, set: RouteSetStatus): Promise<OAuthResponse> {
      let accessToken = '';
      if (body.service === OAuthService.Twitter && twitterOAuthManager && body.code_verifier) {
        try {
          accessToken = await twitterOAuthManager.getTwitterAccessToken(body.code, body.code_verifier);
          const [userInfo, userKeys] = await twitterOAuthManager.getTwitterUserInfo(accessToken, mongoDb);
          return {
            error_response: buildErrorResponse(ErrorCodes.Success),
            user: userInfo,
            user_keys: userKeys,
          };
        } catch {
          set.status = 500;
          return buildOAuthErrorResponse(ErrorCodes.InternalServerError);
        }
      } else if (body.service === OAuthService.Github && githubOAuthManager) {
        try {
          accessToken = await githubOAuthManager.getGithubAccessToken(body.code);
          const [userInfo, userKeys] = await githubOAuthManager.getGithubUserInfo(accessToken, mongoDb);
          return {
            error_response: buildErrorResponse(ErrorCodes.Success),
            user: userInfo,
            user_keys: userKeys,
          };
        } catch {
          set.status = 500;
          return buildOAuthErrorResponse(ErrorCodes.InternalServerError);
        }
      } else if (body.service === OAuthService.Google && googleOAuthManager) {
        try {
          accessToken = await googleOAuthManager.getGoogleAccessToken(body.code);
          const [userInfo, userKeys] = await googleOAuthManager.getGoogleUserInfo(accessToken, mongoDb);
          return {
            error_response: buildErrorResponse(ErrorCodes.Success),
            user: userInfo,
            user_keys: userKeys,
          };
        } catch {
          set.status = 500;
          return buildOAuthErrorResponse(ErrorCodes.InternalServerError);
        }
      } else if (body.service === OAuthService.Facebook && facebookOAuthManager) {
        try {
          accessToken = await facebookOAuthManager.getFacebookAccessToken(body.code);
          const [userInfo, userKeys] = await facebookOAuthManager.getFacebookUserInfo(accessToken, mongoDb);
          return {
            error_response: buildErrorResponse(ErrorCodes.Success),
            user: userInfo,
            user_keys: userKeys,
          };
        } catch {
          set.status = 500;
          return buildOAuthErrorResponse(ErrorCodes.InternalServerError);
        }
      } else if (body.service === OAuthService.Discord && discordOAuthManager) {
        try {
          accessToken = await discordOAuthManager.getDiscordAccessToken(body.code);
          const [userInfo, userKeys] = await discordOAuthManager.getDiscordUserInfo(accessToken, mongoDb);
          return {
            error_response: buildErrorResponse(ErrorCodes.Success),
            user: userInfo,
            user_keys: userKeys,
          };
        } catch {
          set.status = 500;
          return buildOAuthErrorResponse(ErrorCodes.InternalServerError);
        }
      }

      set.status = 400;
      return buildOAuthErrorResponse(ErrorCodes.UnsupportedService);
    },

    async authorizeWithLayer2Token(
      body: AuthorizeWithLayer2AuthTokenRequest,
      set: RouteSetStatus,
    ): Promise<OAuthResponse> {
      try {
        const [user, user_keys] = await mongoDb.authorizeOAuthUserWithLayer2Token(
          body.layer2_oauth_token,
        );
        if (user) {
          return {
            error_response: buildErrorResponse(ErrorCodes.Success),
            user,
            user_keys,
          };
        }
        set.status = 400;
        return buildOAuthErrorResponse(ErrorCodes.UserNotFound);
      } catch {
        set.status = 500;
        return buildOAuthErrorResponse(ErrorCodes.InternalServerError);
      }
    },

    async searchUser(body: SearchUserRequest, set: RouteSetStatus): Promise<SearchUserResponse> {
      try {
        let user: OAuthUser | null = null;
        if (body.username) {
          user = await mongoDb.searchUser(body.keyword, null);
        } else if (body.profile_url) {
          user = await mongoDb.searchUser(null, body.keyword);
        }
        if (user) {
          return {
            error_response: buildErrorResponse(ErrorCodes.Success),
            users: [user],
          };
        }
        set.status = 400;
        return buildSearchUserErrorResponse(ErrorCodes.UserNotFound);
      } catch {
        set.status = 500;
        return buildSearchUserErrorResponse(ErrorCodes.InternalServerError);
      }
    },

    async findUser(body: FindOauthUserRequest, set: RouteSetStatus): Promise<FindOAuthUserResponse> {
      try {
        const user = await mongoDb.findUser(null, body.profile_url, true);
        if (user) {
          const response: FindOAuthUserResponse = {
            error_response: buildErrorResponse(ErrorCodes.Success),
            user,
          };
          console.log('Search User Response:', response);
          return response;
        }
        set.status = 400;
        return buildFindOAuthUserErrorResponse(ErrorCodes.UserNotFound);
      } catch {
        set.status = 500;
        return buildFindOAuthUserErrorResponse(ErrorCodes.InternalServerError);
      }
    },

    async findUserById(
      body: FindOauth2UserByIdRequest,
      set: RouteSetStatus,
    ): Promise<FindOauth2UserByIdResponse> {
      try {
        const user = await mongoDb.getOAuthUser(body.service_name, body.service_specific_id);

        if (user) {
          let pubkey: string | undefined;
          const keys = await mongoDb.getOAuthUserKeys(user._id);
          if (keys?.l2_address_public_key) {
            pubkey = keys.l2_address_public_key;
          }

          const response: FindOauth2UserByIdResponse = {
            error_response: buildErrorResponse(ErrorCodes.Success),
            user,
            layer2_address_pubkey: pubkey,
          };
          console.log('Find User By ID Response:', response);
          return response;
        }
        set.status = 404;
        return buildFindOauth2UserByIdErrorResponse(ErrorCodes.UserNotFound);
      } catch (error) {
        console.error(error);
        set.status = 500;
        return buildFindOauth2UserByIdErrorResponse(ErrorCodes.InternalServerError);
      }
    },
  };
}
