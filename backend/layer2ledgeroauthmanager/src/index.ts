import { Elysia } from 'elysia';
import { OAuthService } from 'models/http_server_models/OAuthRequest';
import { cors } from '@elysiajs/cors';
import { DatabaseInterface } from './DatabaseInterface';
import { loadOAuthManagerConfig, type ConfigInterface } from '@openl2/config-loader';

import { TwitterOAuthManager } from 'OAuthInterfaces/TwitterOAuthManger';
import { GithubOAuthManager } from 'OAuthInterfaces/GithubOAuthManager';
import { GoogleOAuthManager } from 'OAuthInterfaces/GoogleOAuthManager';
import { FacebookOAuthManager } from 'OAuthInterfaces/FacebookOAuthManager';
import { DiscordOAuthManager } from 'OAuthInterfaces/DiscordOAuthManager';
import { OAuthRequest } from 'models/http_server_models/OAuthRequest';
import { OAuthResponse } from 'models/http_server_models/OAuthResponse';
import type { OAuthUser } from 'models/db_models/OAuthUser';
import { AuthorizeWithLayer2AuthTokenRequest } from 'models/http_server_models/AuthorizeWithLayer2AuthTokenRequest';
import { SearchUserRequest } from 'models/http_server_models/SearchUserRequest';
import { SearchUserResponse } from 'models/http_server_models/SearchUserResponse';
import { FindOauthUserRequest } from 'models/http_server_models/FindOauthUserRequest';
import { FindOAuthUserResponse } from 'models/http_server_models/FindOauthUserResponse';
import { FindOauth2UserByIdRequest } from 'models/http_server_models/FindOauth2UserByIdRequest';
import { FindOauth2UserByIdResponse } from 'models/http_server_models/FindOauth2UserByIdResponse';
import { OAUTH_EXCHANGE, OAUTH_L2_TOKEN_AUTHORIZE, USER_FIND, USER_SEARCH, USER_FIND_BY_ID } from './utils/routes';
import { ErrorCodes, type ErrorCode } from 'models/http_server_models/ErrorCodes';
import { buildErrorResponse } from 'models/http_server_models/Common/ErrorResponse';

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

const config: ConfigInterface = loadOAuthManagerConfig();

const port = config.server.port;
const host = config.server.host;

let twitterOAuthManager: TwitterOAuthManager | null = null;
let githubOAuthManager: GithubOAuthManager | null = null;
let googleOAuthManager: GoogleOAuthManager | null = null;
let facebookOAuthManager: FacebookOAuthManager | null = null;
let discordOAuthManager: DiscordOAuthManager | null = null;
if (config.twitter) { twitterOAuthManager = new TwitterOAuthManager(config.twitter); }
if (config.github) { githubOAuthManager = new GithubOAuthManager(config.github); }
if (config.google) { googleOAuthManager = new GoogleOAuthManager(config.google); }
if (config.facebook) { facebookOAuthManager = new FacebookOAuthManager(config.facebook); }
if (config.discord) { discordOAuthManager = new DiscordOAuthManager(config.discord); }

const mongoDb: DatabaseInterface = new DatabaseInterface(config.mongoDb);
const connected: boolean = await mongoDb.connect();
if (!connected) {
  console.error('Error connecting to MongoDB. Exiting...');
  process.exit(1);
}

const app = new Elysia()
  .use(cors())
  .get('/health', () => ({ status: 'ok' }))
  .post(OAUTH_EXCHANGE, async ({ body, set }) => {
    const requestBody: OAuthRequest = body;
    let accessToken = '';
    if (requestBody.service === OAuthService.Twitter && twitterOAuthManager && requestBody.code_verifier) {
      try {
        accessToken = await twitterOAuthManager.getTwitterAccessToken(requestBody.code, requestBody.code_verifier);
        const [userInfo, userKeys] = await twitterOAuthManager.getTwitterUserInfo(accessToken, mongoDb);
        const oauthResponse: OAuthResponse = {
          error_response: buildErrorResponse(ErrorCodes.Success),
          user: userInfo,
          user_keys: userKeys
        }
        return oauthResponse;
      } catch (error) {
        set.status = 500;
        return buildOAuthErrorResponse(ErrorCodes.InternalServerError);
      }
    } else if (requestBody.service === OAuthService.Github && githubOAuthManager) {
      try {
        accessToken = await githubOAuthManager.getGithubAccessToken(requestBody.code);
        const [userInfo, userKeys] = await githubOAuthManager.getGithubUserInfo(accessToken, mongoDb);
        const oauthResponse: OAuthResponse = {
          error_response: buildErrorResponse(ErrorCodes.Success),
          user: userInfo,
          user_keys: userKeys
        }
        return oauthResponse;
      } catch (error) {
        set.status = 500;
        return buildOAuthErrorResponse(ErrorCodes.InternalServerError);
      }
    } else if (requestBody.service === OAuthService.Google && googleOAuthManager) {
      try {
        accessToken = await googleOAuthManager.getGoogleAccessToken(requestBody.code);
        const [userInfo, userKeys] = await googleOAuthManager.getGoogleUserInfo(accessToken, mongoDb);
        const oauthResponse: OAuthResponse = {
          error_response: buildErrorResponse(ErrorCodes.Success),
          user: userInfo,
          user_keys: userKeys
        }
        return oauthResponse;
      } catch (error) {
        set.status = 500;
        return buildOAuthErrorResponse(ErrorCodes.InternalServerError);
      }
    } else if (requestBody.service === OAuthService.Facebook && facebookOAuthManager) {
      try {
        accessToken = await facebookOAuthManager.getFacebookAccessToken(requestBody.code);
        const [userInfo, userKeys] = await facebookOAuthManager.getFacebookUserInfo(accessToken, mongoDb);
        const oauthResponse: OAuthResponse = {
          error_response: buildErrorResponse(ErrorCodes.Success),
          user: userInfo,
          user_keys: userKeys
        }
        return oauthResponse;
      } catch (error) {
        set.status = 500;
        return buildOAuthErrorResponse(ErrorCodes.InternalServerError);
      }
    } else if (requestBody.service === OAuthService.Discord && discordOAuthManager) {
      try {
        accessToken = await discordOAuthManager.getDiscordAccessToken(requestBody.code);
        const [userInfo, userKeys] = await discordOAuthManager.getDiscordUserInfo(accessToken, mongoDb);
        const oauthResponse: OAuthResponse = {
          error_response: buildErrorResponse(ErrorCodes.Success),
          user: userInfo,
          user_keys: userKeys
        }
        return oauthResponse;
      } catch (error) {
        set.status = 500;
        return buildOAuthErrorResponse(ErrorCodes.InternalServerError);
      }
    }

    set.status = 400;
    return buildOAuthErrorResponse(ErrorCodes.UnsupportedService);
  }, {
    body: OAuthRequest,
    response: {
      200: OAuthResponse,
      400: OAuthResponse,
      500: OAuthResponse,
    }
  })
  .post(OAUTH_L2_TOKEN_AUTHORIZE, async ({ body, set }) => {
    try {
      const requestBody: AuthorizeWithLayer2AuthTokenRequest = body;
      const [user, user_keys] = await mongoDb.authorizeOAuthUserWithLayer2Token(requestBody.layer2_oauth_token);
      if (user) {
        const oauthResponse: OAuthResponse = {
          error_response: buildErrorResponse(ErrorCodes.Success),
          user: user,
          user_keys: user_keys
        }
        return oauthResponse;
      } else {
        set.status = 400;
        return buildOAuthErrorResponse(ErrorCodes.UserNotFound);
      }
    }
    catch (error) {
      set.status = 500;
      return buildOAuthErrorResponse(ErrorCodes.InternalServerError);
    }
  }, {
    body: AuthorizeWithLayer2AuthTokenRequest,
    response: {
      200: OAuthResponse,
      400: OAuthResponse,
      500: OAuthResponse,
    }
  })
  .post(USER_SEARCH, async ({ body, set }) => {
    try {
      const requestBody: SearchUserRequest = body;
      let user: OAuthUser | null = null;
      if (requestBody.username) {
        user = await mongoDb.searchUser(requestBody.keyword, null);
      } else if (requestBody.profile_url) {
        user = await mongoDb.searchUser(null, requestBody.keyword);
      }
      if (user) {
        const searchUserResponse: SearchUserResponse = {
          error_response: buildErrorResponse(ErrorCodes.Success),
          users: [user]
        }
        return searchUserResponse;
      } else {
        set.status = 400;
        return buildSearchUserErrorResponse(ErrorCodes.UserNotFound);
      }
    }
    catch (error) {
      set.status = 500;
      return buildSearchUserErrorResponse(ErrorCodes.InternalServerError);
    }
  }, {
    body: SearchUserRequest,
    response: {
      200: SearchUserResponse,
      400: SearchUserResponse,
      500: SearchUserResponse,
    }
  })
  .post(USER_FIND, async ({ body, set }) => {
    try {
      const requestBody: FindOauthUserRequest = body;
      const user = await mongoDb.findUser(null, requestBody.profile_url, true);
      if (user) {
        const searchUserResponse: FindOAuthUserResponse = {
          error_response: buildErrorResponse(ErrorCodes.Success),
          user: user,
        }
        console.log("Search User Response:", searchUserResponse);
        return searchUserResponse;
      } else {
        set.status = 400;
        return buildFindOAuthUserErrorResponse(ErrorCodes.UserNotFound);
      }
    } catch (error) {
      set.status = 500;
      return buildFindOAuthUserErrorResponse(ErrorCodes.InternalServerError);
    }
  }, {
    body: FindOauthUserRequest,
    response: {
      200: FindOAuthUserResponse,
      400: FindOAuthUserResponse,
      500: FindOAuthUserResponse,
    }
  })
  .post(USER_FIND_BY_ID, async ({ body, set }) => {
    try {
      const requestBody: FindOauth2UserByIdRequest = body;
      const user = await mongoDb.getOAuthUser(requestBody.service_name, requestBody.service_specific_id);
      
      if (user) {
        let pubkey: string | undefined;
        const keys = await mongoDb.getOAuthUserKeys(user._id);
        if (keys && keys.l2_address_public_key) {
          pubkey = keys.l2_address_public_key;
        }
        
        const response: FindOauth2UserByIdResponse = {
          error_response: buildErrorResponse(ErrorCodes.Success),
          user: user,
          layer2_address_pubkey: pubkey
        };
        console.log("Find User By ID Response:", response); 
        return response;
      } else {
        set.status = 404;
        return buildFindOauth2UserByIdErrorResponse(ErrorCodes.UserNotFound);
      }
    } catch (error) {
      console.error(error);
      set.status = 500;
      return buildFindOauth2UserByIdErrorResponse(ErrorCodes.InternalServerError);
    }
  }, {
    body: FindOauth2UserByIdRequest,
    response: {
      200: FindOauth2UserByIdResponse,
      404: FindOauth2UserByIdResponse,
      500: FindOauth2UserByIdResponse,
    }
  })
  .listen({
    port: port,
    hostname: host
  }, () => {
    console.log(`Server is running on http://${host}:${port}`);
  });

export type App = typeof app
