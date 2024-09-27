import express, { type Request, type Response } from 'express';
import { DatabaseInterface } from './DatabaseInterface';
import { loadConfig } from 'ConfigInterface';
import type { ConfigInterface } from "models/config_models/Config";

import { TwitterOAuthManager } from 'OAuthInterfaces/TwitterOAuthManger';
import { GithubOAuthManager } from 'OAuthInterfaces/GithubOAuthManager';
import type { OAuthRequest } from 'models/http_server_models/OAuthRequest';
import type { OAuthResponse } from 'models/http_server_models/OAuthResponse';
import { type OAuthUser } from 'models/db_models/OAuthUser';

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
  const { code, service, code_verifier } = req.body;
  let accessToken = '';
  if (service === 'twitter' && twitterOAuthManager) {
    try {
      accessToken = await twitterOAuthManager.getTwitterAccessToken(code, code_verifier);
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
  }else if (service === 'github' && githubOAuthManager) {
    try {
      accessToken = await githubOAuthManager.getGithubAccessToken(code);
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
  //return res.status(400).json({ error: 'Unknown Error' });
});

app.listen(port, host, () => {
  console.log(`Server is running on http://${host}:${port}`);
});