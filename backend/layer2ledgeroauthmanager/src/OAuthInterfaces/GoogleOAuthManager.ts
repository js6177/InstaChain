import axios from "axios";
import { type OAuth2ServiceParams } from  "models/config_models/Config";
import { OAuthUserModel, type OAuthUser } from "models/db_models/OAuthUser";
import { type DatabaseInterface } from "../DatabaseInterface";
import { GenerateUUID, MillisecondsInMonth } from "../utils/utils";
import { type GoogleUserInfo } from "../models/oauth2_models/Google";
import type { UserKeys } from "../models/db_models/UserKeys";
import { standardizeProfileUrl } from "../utils/OAuthHelperUtils";

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USER_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';

export class GoogleOAuthManager {
    private config: OAuth2ServiceParams;
  
    constructor(config: OAuth2ServiceParams) {
      this.config = config;
    };
  
    async getGoogleAccessToken(code: string): Promise<string> {
        try {
            console.log(`[GoogleOAuthManager] Exchanging code for access token. Code: ${code}`);
            console.log(`[GoogleOAuthManager] Request payload:`, {
                client_id: this.config.clientId,
                client_secret: this.config.clientSecret ? "***" : "missing",
                code,
                redirect_uri: this.config.redirectUri,
                grant_type: 'authorization_code'
            });
            const response = await axios.post<{ access_token: string }>(GOOGLE_TOKEN_URL, {
                client_id: this.config.clientId,
                client_secret: this.config.clientSecret,
                code,
                redirect_uri: this.config.redirectUri,
                grant_type: 'authorization_code'
            }, {
                headers: {
                    Accept: 'application/json',
                },
            });
            console.log(`[GoogleOAuthManager] Token exchange response data:`, JSON.stringify(response.data, null, 2));
            return response.data.access_token;
        } catch (error: any) {
            console.error(`[GoogleOAuthManager] Error exchanging code for token:`, error?.response?.data || error?.message || error);
            throw error;
        }
    }
      
    async getGoogleUserInfo(accessToken: string, mongoDb: DatabaseInterface): Promise<[OAuthUser, UserKeys]> {
        try {
            console.log(`[GoogleOAuthManager] Fetching user info with access token.`);
            const response = await axios.get<GoogleUserInfo>(GOOGLE_USER_URL, {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
            });
            console.log(`[GoogleOAuthManager] User info response data:`, JSON.stringify(response.data, null, 2));

            const googleUserInfo: GoogleUserInfo = response.data as GoogleUserInfo;
            const user: OAuthUser = this.buildOAuthUser(googleUserInfo);
            let userKeys: UserKeys | null = await mongoDb.getOAuthUserKeys(user._id);
            if(userKeys === null) {
                userKeys = await mongoDb.createNewUserKeys(user._id);
            }
            //Save the user to the database
            await mongoDb.saveOAuthUser(user, true);
            return [user, userKeys];
        } catch (error: any) {
            console.error(`[GoogleOAuthManager] Error fetching user info:`, error?.response?.data || error?.message || error);
            throw error;
        }
    }

    buildOAuthUser(googleUserInfo: GoogleUserInfo): OAuthUser {
        const user: OAuthUser = new OAuthUserModel();
        user.service_name = 'google';
        user.service_specific_id = googleUserInfo.id;
        user.layer2_authorization_token = GenerateUUID();
        user.layer2_authorization_token_expiration_timestamp = new Date().getTime() + MillisecondsInMonth; // Set expiration to 1 month from now
        user.username = googleUserInfo.email; // Fallback to email as username
        user.name = googleUserInfo.name;
        user.profile_description = ""; 

        user.first_login_date = new Date();
        user.last_login_date = new Date();
        user.profile_pic_url = googleUserInfo.picture;
        user.profile_url = standardizeProfileUrl(`https://plus.google.com/${googleUserInfo.id}`); // Legacy or generic link
        user.buildPrimaryKey();
        return user;
    }
}
