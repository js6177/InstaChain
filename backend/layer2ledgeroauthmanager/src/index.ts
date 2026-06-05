import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';
import { DatabaseInterface } from './DatabaseInterface';
import { loadConfig } from 'ConfigInterface';
import type { ConfigInterface } from "models/config_models/Config";

import { TwitterOAuthManager } from 'OAuthInterfaces/TwitterOAuthManger';
import { GithubOAuthManager } from 'OAuthInterfaces/GithubOAuthManager';
import { GoogleOAuthManager } from 'OAuthInterfaces/GoogleOAuthManager';
import { FacebookOAuthManager } from 'OAuthInterfaces/FacebookOAuthManager';
import { DiscordOAuthManager } from 'OAuthInterfaces/DiscordOAuthManager';
import { OAuthRequest } from 'models/http_server_models/OAuthRequest';
import { OAuthResponse } from 'models/http_server_models/OAuthResponse';
import { type OAuthUser } from 'models/db_models/OAuthUser';
import { AuthorizeWithLayer2AuthTokenRequest } from 'models/http_server_models/AuthorizeWithLayer2AuthTokenRequest';
import { UserKeys } from 'models/db_models/UserKeys';
import { SearchUserRequest } from 'models/http_server_models/SearchUserRequest';
import { SearchUserResponse } from 'models/http_server_models/SearchUserResponse';
import { FindOauthUserRequest } from 'models/http_server_models/FindOauthUserRequest';
import { FindOAuthUserResponse } from 'models/http_server_models/FindOauthUserResponse';
import { FindOauth2UserByIdRequest } from 'models/http_server_models/FindOauth2UserByIdRequest';
import { FindOauth2UserByIdResponse } from 'models/http_server_models/FindOauth2UserByIdResponse';
import { OAUTH_EXCHANGE, OAUTH_L2_TOKEN_AUTHORIZE, USER_FIND, USER_SEARCH, USER_FIND_BY_ID } from './utils/routes';

const config: ConfigInterface = loadConfig('../config.json');

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
  .post(OAUTH_EXCHANGE, async ({ body, set }) => {
    const requestBody: OAuthRequest = body;
    let accessToken = '';
    if (requestBody.service === 'twitter' && twitterOAuthManager && requestBody.code_verifier) {
      try {
        accessToken = await twitterOAuthManager.getTwitterAccessToken(requestBody.code, requestBody.code_verifier);
        let [userInfo, userKeys] = await twitterOAuthManager.getTwitterUserInfo(accessToken, mongoDb);
        let oauthResponse: OAuthResponse = {
          error_response: {
            error_code: 0,
            error_message: 'Success'
          },
          user: userInfo,
          user_keys: userKeys
        }
        return oauthResponse;
      } catch (error) {
        set.status = 500;
        return { error: 'Internal Server Error' };
      }
    } else if (requestBody.service === 'github' && githubOAuthManager) {
      try {
        accessToken = await githubOAuthManager.getGithubAccessToken(requestBody.code);
        let [userInfo, userKeys] = await githubOAuthManager.getGithubUserInfo(accessToken, mongoDb);
        let oauthResponse: OAuthResponse = {
          error_response: {
            error_code: 0,
            error_message: 'Success'
          },
          user: userInfo,
          user_keys: userKeys
        }
        return oauthResponse;
      } catch (error) {
        set.status = 500;
        return { error: 'Internal Server Error' };
      }
    } else if (requestBody.service === 'google' && googleOAuthManager) {
      try {
        accessToken = await googleOAuthManager.getGoogleAccessToken(requestBody.code);
        let [userInfo, userKeys] = await googleOAuthManager.getGoogleUserInfo(accessToken, mongoDb);
        let oauthResponse: OAuthResponse = {
          error_response: {
            error_code: 0,
            error_message: 'Success'
          },
          user: userInfo,
          user_keys: userKeys
        }
        return oauthResponse;
      } catch (error) {
        set.status = 500;
        return { error: 'Internal Server Error' };
      }
    } else if (requestBody.service === 'facebook' && facebookOAuthManager) {
      try {
        accessToken = await facebookOAuthManager.getFacebookAccessToken(requestBody.code);
        let [userInfo, userKeys] = await facebookOAuthManager.getFacebookUserInfo(accessToken, mongoDb);
        let oauthResponse: OAuthResponse = {
          error_response: {
            error_code: 0,
            error_message: 'Success'
          },
          user: userInfo,
          user_keys: userKeys
        }
        return oauthResponse;
      } catch (error) {
        set.status = 500;
        return { error: 'Internal Server Error' };
      }
    } else if (requestBody.service === 'discord' && discordOAuthManager) {
      try {
        accessToken = await discordOAuthManager.getDiscordAccessToken(requestBody.code);
        let [userInfo, userKeys] = await discordOAuthManager.getDiscordUserInfo(accessToken, mongoDb);
        let oauthResponse: OAuthResponse = {
          error_response: {
            error_code: 0,
            error_message: 'Success'
          },
          user: userInfo,
          user_keys: userKeys
        }
        return oauthResponse;
      } catch (error) {
        set.status = 500;
        return { error: 'Internal Server Error' };
      }
    }

    set.status = 400;
    return { error: 'Unsupported service' };
  }, {
    body: OAuthRequest,
    response: {
      200: OAuthResponse,
      400: t.Object({ error: t.String() }),
      500: t.Object({ error: t.String() })
    }
  })
  .post(OAUTH_L2_TOKEN_AUTHORIZE, async ({ body, set }) => {
    try {
      const requestBody: AuthorizeWithLayer2AuthTokenRequest = body;
      const [user, user_keys] = await mongoDb.authorizeOAuthUserWithLayer2Token(requestBody.layer2_oauth_token);
      if (user) {
        let oauthResponse: OAuthResponse = {
          error_response: {
            error_code: 0,
            error_message: 'Success'
          },
          user: user,
          user_keys: user_keys
        }
        return oauthResponse;
      } else {
        set.status = 400;
        return { error: 'Could not find user' };
      }
    }
    catch (error) {
      set.status = 500;
      return { error: 'Internal Server Error' };
    }
  }, {
    body: AuthorizeWithLayer2AuthTokenRequest,
    response: {
      200: OAuthResponse,
      400: t.Object({ error: t.String() }),
      500: t.Object({ error: t.String() })
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
        let searchUserResponse: SearchUserResponse = {
          error_response: {
            error_code: 0,
            error_message: 'Success'
          },
          users: [user]
        }
        return searchUserResponse;
      } else {
        set.status = 400;
        return { error: 'Could not find user' };
      }
    }
    catch (error) {
      set.status = 500;
      return { error: 'Internal Server Error' };
    }
  }, {
    body: SearchUserRequest,
    response: {
      200: SearchUserResponse,
      400: t.Object({ error: t.String() }),
      500: t.Object({ error: t.String() })
    }
  })
  .post(USER_FIND, async ({ body, set }) => {
    try {
      const requestBody: FindOauthUserRequest = body;
      const user = await mongoDb.findUser(null, requestBody.profile_url, true);
      if (user) {
        let searchUserResponse: FindOAuthUserResponse = {
          error_response: {
            error_code: 0,
            error_message: 'Success'
          },
          user: user,
        }
        return searchUserResponse;
      } else {
        set.status = 400;
        return { error: 'Could not find user' };
      }
    } catch (error) {
      set.status = 500;
      return { error: 'Internal Server Error' };
    }
  }, {
    body: FindOauthUserRequest,
    response: {
      200: FindOAuthUserResponse,
      400: t.Object({ error: t.String() }),
      500: t.Object({ error: t.String() })
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
        
        let response: FindOauth2UserByIdResponse = {
          error_response: {
            error_code: 0,
            error_message: 'Success'
          },
          user: user,
          layer2_address_pubkey: pubkey
        };
        return response;
      } else {
        set.status = 404;
        return { error: 'Could not find user' };
      }
    } catch (error) {
      console.error(error);
      set.status = 500;
      return { error: 'Internal Server Error' };
    }
  }, {
    body: FindOauth2UserByIdRequest,
    response: {
      200: FindOauth2UserByIdResponse,
      404: t.Object({ error: t.String() }),
      500: t.Object({ error: t.String() })
    }
  })
  .listen({
    port: port,
    hostname: host
  }, () => {
    console.log(`Server is running on http://${host}:${port}`);
  });

import { t } from 'elysia';
export type App = typeof app
