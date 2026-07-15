import { Elysia, t } from 'elysia';
import { cors } from '@elysiajs/cors';
import {
  HEALTH_ROUTE,
  OAUTH_EXCHANGE,
  OAUTH_L2_TOKEN_AUTHORIZE,
  USER_FIND,
  USER_FIND_BY_ID,
  USER_SEARCH,
} from './api-paths';
import type { Layer2OAuthRouteHandlers } from './handlers';
import { AuthorizeWithLayer2AuthTokenRequest } from '../models/http_server_models/AuthorizeWithLayer2AuthTokenRequest';
import { FindOauth2UserByIdRequest } from '../models/http_server_models/FindOauth2UserByIdRequest';
import { FindOauth2UserByIdResponse } from '../models/http_server_models/FindOauth2UserByIdResponse';
import { FindOauthUserRequest } from '../models/http_server_models/FindOauthUserRequest';
import { FindOAuthUserResponse } from '../models/http_server_models/FindOauthUserResponse';
import { OAuthRequest } from '../models/http_server_models/OAuthRequest';
import { OAuthResponse } from '../models/http_server_models/OAuthResponse';
import { SearchUserRequest } from '../models/http_server_models/SearchUserRequest';
import { SearchUserResponse } from '../models/http_server_models/SearchUserResponse';

const HealthResponse = t.Object({
  status: t.String(),
});

export function createLayer2OAuthApp(handlers: Layer2OAuthRouteHandlers) {
  return new Elysia({ name: 'layer2oauth-api' })
    .use(cors())
    .get(HEALTH_ROUTE, () => handlers.health(), {
      response: HealthResponse,
    })
    .post(OAUTH_EXCHANGE, ({ body, set }) => handlers.exchange(body, set), {
      body: OAuthRequest,
      response: OAuthResponse,
    })
    .post(
      OAUTH_L2_TOKEN_AUTHORIZE,
      ({ body, set }) => handlers.authorizeWithLayer2Token(body, set),
      {
        body: AuthorizeWithLayer2AuthTokenRequest,
        response: OAuthResponse,
      },
    )
    .post(USER_SEARCH, ({ body, set }) => handlers.searchUser(body, set), {
      body: SearchUserRequest,
      response: SearchUserResponse,
    })
    .post(USER_FIND, ({ body, set }) => handlers.findUser(body, set), {
      body: FindOauthUserRequest,
      response: FindOAuthUserResponse,
    })
    .post(USER_FIND_BY_ID, ({ body, set }) => handlers.findUserById(body, set), {
      body: FindOauth2UserByIdRequest,
      response: FindOauth2UserByIdResponse,
    });
}

export type Layer2OAuthApp = ReturnType<typeof createLayer2OAuthApp>;
