import express, { type Request, type Response } from 'express';
import { DatabaseInterface } from './DatabaseInterface';
import { loadConfig } from 'ConfigInterface';
import type { ConfigInterface } from "models/config_models/Config";

import { TwitterOAuthManager } from 'OAuthInterfaces/TwitterOAuthManger';
import { GithubOAuthManager } from 'OAuthInterfaces/GithubOAuthManager';
import type { OAuthRequest } from 'models/http_server_models/OAuthRequest';
import type { OAuthResponse } from 'models/http_server_models/OAuthResponse';
import { type OAuthUser } from 'models/db_models/OAuthUser';
import type { AuthorizeWithLayer2AuthTokenRequest } from 'models/http_server_models/AuthorizeWithLayer2AuthTokenRequest';
import type { UserKeys } from 'models/db_models/UserKeys';
import type {SearchUserRequest} from 'models/http_server_models/SearchUserRequest';
import type {SearchUserResponse} from 'models/http_server_models/SearchUserResponse';
import type { FindOauthUserRequest } from 'models/http_server_models/FindOauthUserRequest';
import type { FindOAuthUserResponse } from 'models/http_server_models/FindOauthUserResponse';

const config: ConfigInterface = loadConfig('../config.json');

const app = express();
const port = config.server.port;
const host = config.server.host;
app.use(express.json());


app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*'); // Replace '*' with specific origins if needed
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

let twitterOAuthManager = null;
let githubOAuthManager = null;
if(config.twitter) {twitterOAuthManager = new TwitterOAuthManager(config.twitter);}
if(config.github) {githubOAuthManager = new GithubOAuthManager(config.github);}

const mongoDb: DatabaseInterface = new DatabaseInterface(config.mongoDb);
const connected: boolean = await mongoDb.connect();
if(!connected) {
  console.error('Error connecting to MongoDB. Exiting...');
  process.exit(1);
}

app.post('/oauth/exchange', async (req: Request<{}, {}, OAuthRequest>, res: Response) => {
  const requestBody: OAuthRequest = req.body;
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
      return res.status(200).json(oauthResponse);
    } catch (error) {
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }else if (requestBody.service === 'github' && githubOAuthManager) {
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
      return res.status(200).json(oauthResponse);
    } catch (error) {
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  return res.status(400).json({ error: 'Unsupported service' });
});

app.post('/oauth/l2_token_authorize', async (req: Request<{}, {}, AuthorizeWithLayer2AuthTokenRequest>, res: Response) => {  
  try{
    const requestBody: AuthorizeWithLayer2AuthTokenRequest = req.body;
    const [user, user_keys] = await mongoDb.authorizeOAuthUserWithLayer2Token(requestBody.layer2_oauth_token);
    if(user){
      let oauthResponse: OAuthResponse = {
        error_response: { 
          error_code: 0,
          error_message: 'Success'
        },
        user: user,
        user_keys: user_keys
      }
      return res.status(200).json(oauthResponse);
    }else{
      let oauthResponse: OAuthResponse = {
        error_response: { 
          error_code: 1,
          error_message: 'Error'
        },
        user: user,
        user_keys: user_keys
      }
      return res.status(400).json({ error: 'Could not find user' });
    }
  }
  catch(error){
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.post('/user/search', async (req: Request<{}, {}, SearchUserRequest>, res: Response) => {
  try{
    const requestBody: SearchUserRequest = req.body;
    let user: OAuthUser | null = null;
    if(requestBody.username){
      user = await mongoDb.searchUser(requestBody.keyword, null);
    }else if(requestBody.profile_url){
      user = await mongoDb.searchUser(null, requestBody.keyword);
    }
    if(user){
      let searchUserResponse: SearchUserResponse = {
        error_response: { 
          error_code: 0,
          error_message: 'Success'
        },
        users: [user]
      }
      return res.status(200).json(searchUserResponse);
    }else{
      return res.status(400).json({ error: 'Could not find user' });
    }
  }
  catch(error){
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.post('/user/find', async (req: Request<{}, {}, FindOauthUserRequest>, res: Response) => {
  try{
    const requestBody: FindOauthUserRequest = req.body;
    const user = await mongoDb.findUser(null, requestBody.profile_url, true);
    if(user){
      let searchUserResponse: FindOAuthUserResponse = {
        error_response: { 
          error_code: 0,
          error_message: 'Success'
        },
        user: user,
      }
      return res.status(200).json(searchUserResponse);
    }else{
      return res.status(400).json({ error: 'Could not find user' });
    }
  }catch(error){
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.listen(port, host, () => {
  console.log(`Server is running on http://${host}:${port}`);
});