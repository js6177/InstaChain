import type { DatabaseInterface } from "DatabaseInterface";
import type { OAuth2ServiceParams } from "@openl2/config-loader";
import axios from "axios";
import { type OAuthUser, OAuthUserModel } from "models/db_models/OAuthUser";
import type { UserKeys } from "models/db_models/UserKeys";
import type {
	TwitterUserInfo,
	TwitterUserInfoData,
} from "models/oauth2_models/Twitter";
import { buildTwitterUrl, standardizeProfileUrl } from "utils/OAuthHelperUtils";
import { GenerateUUID, MillisecondsInMonth } from "utils/utils";

const TWITTER_TOKEN_URL: string = "https://api.twitter.com/2/oauth2/token";
const TWITTER_USER_URL: string =
	"https://api.twitter.com/2/users/me?user.fields=affiliation,connection_status,created_at,description,entities,id,location,most_recent_tweet_id,name,pinned_tweet_id,profile_banner_url,profile_image_url,protected,public_metrics,receives_your_dm,subscription_type,url,username,verified,verified_type,withheld";

export class TwitterOAuthManager {
	private config: OAuth2ServiceParams;

	constructor(config: OAuth2ServiceParams) {
		this.config = config;
	}

	async getTwitterAccessToken(
		authorizationCode: string,
		codeVerifier: string,
	): Promise<string> {
		console.log(`getTwitterAccessToken: ${authorizationCode}`);
		const credentials = btoa(
			`${this.config.clientId}:${this.config.clientSecret}`,
		);
		try {
			const response = await axios.post<{ access_token: string }>(
				TWITTER_TOKEN_URL,
				{
					client_id: this.config.clientId,
					client_secret: this.config.clientSecret,
					redirect_uri: this.config.redirectUri,
					grant_type: "authorization_code",
					code: authorizationCode,
					code_verifier: codeVerifier,
				},
				{
					headers: {
						Accept: "application/json",
						"Content-Type": "application/x-www-form-urlencoded",
						Authorization: `Basic ${credentials}`,
					},
				},
			);

			console.log(`getTwitterAccessToken: ${JSON.stringify(response.data)}`);
			return response.data.access_token;
		} catch (error) {
			console.error("Error in getTwitterAccessToken:", error);
			throw error;
		}
	}

	async getTwitterUserInfo(
		accessToken: string,
		mongoDb: DatabaseInterface,
	): Promise<[OAuthUser, UserKeys]> {
		console.log(`getTwitterUserInfo: ${accessToken}`);
		try {
			const response = await axios.get<TwitterUserInfoData>(TWITTER_USER_URL, {
				headers: {
					Authorization: `Bearer ${accessToken}`,
				},
			});
			console.log(`getTwitterUserInfo: ${JSON.stringify(response.data)}`);
			//Create OAuthUser object from TwitterUserInfo
			const twitterUserInfoData: TwitterUserInfoData =
				response.data as TwitterUserInfoData;
			const user: OAuthUser = this.buildOAuthUser(twitterUserInfoData.data);
			let userKeys: UserKeys | null = await mongoDb.getOAuthUserKeys(user._id);
			if (userKeys === null) {
				userKeys = await mongoDb.createNewUserKeys(user._id);
			}
			//Save the user to the database
			await mongoDb.saveOAuthUser(user, true);
			return [user, userKeys];
		} catch (error) {
			console.error("Error in getTwitterUserInfo:", error);
			throw error;
		}
	}

	buildOAuthUser(twitterUserInfo: TwitterUserInfo): OAuthUser {
		const user: OAuthUser = new OAuthUserModel();
		user.service_name = "twitter";
		user.service_specific_id = twitterUserInfo.id;
		user.layer2_authorization_token = GenerateUUID();
		user.layer2_authorization_token_expiration_timestamp =
			Date.now() + MillisecondsInMonth; // Set expiration to 1 month from now
		user.username = twitterUserInfo.username;
		user.name = twitterUserInfo.name;
		user.profile_description = twitterUserInfo.description;
		user.first_login_date = new Date();
		user.last_login_date = new Date();
		user.profile_pic_url = twitterUserInfo.profile_image_url;
		user.profile_url = standardizeProfileUrl(
			buildTwitterUrl(twitterUserInfo.username),
		);
		user.buildPrimaryKey();
		return user;
	}
}
