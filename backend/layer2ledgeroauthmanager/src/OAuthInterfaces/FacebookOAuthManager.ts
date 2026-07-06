import axios from "axios";
import type { OAuth2ServiceParams } from '@openl2/config-loader';
import { OAuthUserModel, type OAuthUser } from "models/db_models/OAuthUser";
import type { DatabaseInterface } from "../DatabaseInterface";
import { GenerateUUID, MillisecondsInMonth } from "../utils/utils";
import type { FacebookUserInfo } from "../models/oauth2_models/Facebook";
import type { UserKeys } from "../models/db_models/UserKeys";
import { standardizeProfileUrl } from "../utils/OAuthHelperUtils";

const FACEBOOK_TOKEN_URL = 'https://graph.facebook.com/v19.0/oauth/access_token';
const FACEBOOK_USER_URL = 'https://graph.facebook.com/v19.0/me?fields=id,name,email,picture';

export class FacebookOAuthManager {
    private config: OAuth2ServiceParams;
  
    constructor(config: OAuth2ServiceParams) {
      this.config = config;
    };
  
    async getFacebookAccessToken(code: string): Promise<string> {
        try {
            console.log(`[FacebookOAuthManager] Exchanging code for access token. Code: ${code}`);
            const response = await axios.get<{ access_token: string }>(FACEBOOK_TOKEN_URL, {
                params: {
                    client_id: this.config.clientId,
                    client_secret: this.config.clientSecret,
                    code,
                    redirect_uri: this.config.redirectUri,
                },
                headers: {
                    Accept: 'application/json',
                },
            });
            console.log(`[FacebookOAuthManager] Token exchange response data:`, JSON.stringify(response.data, null, 2));
            return response.data.access_token;
        } catch (error: any) {
            console.error(`[FacebookOAuthManager] Error exchanging code for token:`, error?.response?.data || error?.message || error);
            throw error;
        }
    }
      
    async getFacebookUserInfo(accessToken: string, mongoDb: DatabaseInterface): Promise<[OAuthUser, UserKeys]> {
        try {
            console.log(`[FacebookOAuthManager] Fetching user info with access token.`);
            const response = await axios.get<FacebookUserInfo>(FACEBOOK_USER_URL, {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
            });
            console.log(`[FacebookOAuthManager] User info response data:`, JSON.stringify(response.data, null, 2));

            const facebookUserInfo: FacebookUserInfo = response.data as FacebookUserInfo;
            const user: OAuthUser = this.buildOAuthUser(facebookUserInfo);
            let userKeys: UserKeys | null = await mongoDb.getOAuthUserKeys(user._id);
            if(userKeys === null) {
                userKeys = await mongoDb.createNewUserKeys(user._id);
            }
            //Save the user to the database
            await mongoDb.saveOAuthUser(user, true);
            return [user, userKeys];
        } catch (error: any) {
            console.error(`[FacebookOAuthManager] Error fetching user info:`, error?.response?.data || error?.message || error);
            throw error;
        }
    }

    buildOAuthUser(facebookUserInfo: FacebookUserInfo): OAuthUser {
        const user: OAuthUser = new OAuthUserModel();
        user.service_name = 'facebook';
        user.service_specific_id = facebookUserInfo.id;
        user.layer2_authorization_token = GenerateUUID();
        user.layer2_authorization_token_expiration_timestamp = new Date().getTime() + MillisecondsInMonth; // Set expiration to 1 month from now
        user.username = facebookUserInfo.email || facebookUserInfo.id; // Fallback to id as username if email is missing
        user.name = facebookUserInfo.name;
        user.profile_description = ""; 

        user.first_login_date = new Date();
        user.last_login_date = new Date();
        user.profile_pic_url = facebookUserInfo.picture?.data?.url || "";
        user.profile_url = standardizeProfileUrl(`https://facebook.com/${facebookUserInfo.id}`);
        user.buildPrimaryKey();
        return user;
    }
}
