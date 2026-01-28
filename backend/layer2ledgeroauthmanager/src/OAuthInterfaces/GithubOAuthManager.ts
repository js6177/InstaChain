import axios from "axios";
import { type OAuth2ServiceParams } from  "models/config_models/Config";
import { OAuthUserModel, type OAuthUser } from "models/db_models/OAuthUser";
import { type DatabaseInterface } from "DatabaseInterface";
import { GenerateUUID, MillisecondsInMonth } from "utils/utils";
import { type GithubUserInfo } from "models/oauth2_models/Github";
import type { UserKeys } from "models/db_models/UserKeys";
import { standardizeProfileUrl } from "utils/OAuthHelperUtils";

const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const GITHUB_USER_URL = 'https://api.github.com/user';


export class GithubOAuthManager {
    private config: OAuth2ServiceParams;
  
    constructor(config: OAuth2ServiceParams) {
      this.config = config;
    };
  
    async getGithubAccessToken(code: string): Promise<string> {
        const response = await axios.post<{ access_token: string }>(GITHUB_TOKEN_URL, null, {
          params: {
            client_id: this.config.clientId,
            client_secret: this.config.clientSecret,
            code,
          },
          headers: {
            Accept: 'application/json',
          },
        });
        return response.data.access_token;
      }
      
      async getGithubUserInfo(accessToken: string, mongoDb: DatabaseInterface): Promise<[OAuthUser, UserKeys]> {
        const response = await axios.get<GithubUserInfo>(GITHUB_USER_URL, {
          headers: {
            Authorization: `token ${accessToken}`,
          },
        });
        const githubUserInfo: GithubUserInfo = response.data as GithubUserInfo;
        const user: OAuthUser = this.buildOAuthUser(githubUserInfo);
        let userKeys: UserKeys | null = await mongoDb.getOAuthUserKeys(user._id);
        if(userKeys === null) {
          userKeys = await mongoDb.createNewUserKeys(user._id);
        }
        //Save the user to the database
        await mongoDb.saveOAuthUser(user, true);
        return [user, userKeys];
      }

      buildOAuthUser(githubUserInfo: GithubUserInfo): OAuthUser {
        const user: OAuthUser = new OAuthUserModel();
        user.service_name = 'github';
        user.service_specific_id = githubUserInfo.id.toString();
        user.layer2_authorization_token = GenerateUUID();
        user.layer2_authorization_token_expiration_timestamp = new Date().getTime() + MillisecondsInMonth; // Set expiration to 1 month from now
        user.username = githubUserInfo.login;
        user.name = githubUserInfo.name;
        user.profile_description = githubUserInfo.bio;

        user.first_login_date = new Date();
        user.last_login_date = new Date();
        user.profile_pic_url = githubUserInfo.avatar_url;
        user.profile_url = standardizeProfileUrl(githubUserInfo.html_url);
        user.buildPrimaryKey();
        return user;
      }
}