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
        try {
            const response = await axios.post<{ access_token?: string, error?: string, error_description?: string }>(GITHUB_TOKEN_URL, {
                client_id: this.config.clientId,
                client_secret: this.config.clientSecret,
                code,
                redirect_uri: this.config.redirectUri,
            }, {
              headers: {
                Accept: 'application/json',
              },
            });
            
            console.log("Github Access Token Response:", response.data);

            if (response.data.error) {
                console.error("Github OAuth Error:", response.data.error, response.data.error_description);
                throw new Error(`Github OAuth Error: ${response.data.error_description}`);
            }

            if (!response.data.access_token) {
                throw new Error("Github Access Token not found in response.");
            }

            return response.data.access_token;
        } catch (error: any) {
            console.error("Error getting Github Access Token:", error?.response?.data || error.message || error);
            throw error;
        }
      }
      
      async getGithubUserInfo(accessToken: string, mongoDb: DatabaseInterface): Promise<[OAuthUser, UserKeys]> {
        try {
          const response = await axios.get<GithubUserInfo>(GITHUB_USER_URL, {
            headers: {
              Authorization: `Bearer ${accessToken}`,
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
        } catch (error: any) {
            console.error("Error getting Github User Info:", error?.response?.data || error.message || error);
            throw error;
        }
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