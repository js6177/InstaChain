import type { OAuth2ServiceParams } from "@openl2/config-loader";
import axios from "axios";
import { type OAuthUser, OAuthUserModel } from "models/db_models/OAuthUser";
import type { DatabaseInterface } from "../DatabaseInterface";
import { log } from "../logger";
import type { UserKeys } from "../models/db_models/UserKeys";
import type { FacebookUserInfo } from "../models/oauth2_models/Facebook";
import { standardizeProfileUrl } from "../utils/OAuthHelperUtils";
import { GenerateUUID, MillisecondsInMonth } from "../utils/utils";

const FACEBOOK_TOKEN_URL =
	"https://graph.facebook.com/v19.0/oauth/access_token";
const FACEBOOK_USER_URL =
	"https://graph.facebook.com/v19.0/me?fields=id,name,email,picture";

export class FacebookOAuthManager {
	private config: OAuth2ServiceParams;

	constructor(config: OAuth2ServiceParams) {
		this.config = config;
	}

	async getFacebookAccessToken(code: string): Promise<string> {
		try {
			log.info("Exchanging code for access token", { service: "facebook" });
			const response = await axios.get<{ access_token: string }>(
				FACEBOOK_TOKEN_URL,
				{
					params: {
						client_id: this.config.clientId,
						client_secret: this.config.clientSecret,
						code,
						redirect_uri: this.config.redirectUri,
					},
					headers: {
						Accept: "application/json",
					},
				},
			);
			log.info("Token exchange succeeded", { service: "facebook" });
			return response.data.access_token;
		} catch (error: unknown) {
			log.exception("Error exchanging code for token", error, {
				service: "facebook",
			});
			throw error;
		}
	}

	async getFacebookUserInfo(
		accessToken: string,
		mongoDb: DatabaseInterface,
	): Promise<[OAuthUser, UserKeys]> {
		try {
			log.info("Fetching user info", { service: "facebook" });
			const response = await axios.get<FacebookUserInfo>(FACEBOOK_USER_URL, {
				headers: {
					Authorization: `Bearer ${accessToken}`,
				},
			});
			log.info("Fetched user info", {
				service: "facebook",
				service_specific_id: response.data.id,
			});

			const facebookUserInfo: FacebookUserInfo =
				response.data as FacebookUserInfo;
			const user: OAuthUser = this.buildOAuthUser(facebookUserInfo);
			let userKeys: UserKeys | null = await mongoDb.getOAuthUserKeys(user._id);
			if (userKeys === null) {
				userKeys = await mongoDb.createNewUserKeys(user._id);
			}
			//Save the user to the database
			await mongoDb.saveOAuthUser(user, true);
			return [user, userKeys];
		} catch (error: unknown) {
			log.exception("Error fetching user info", error, { service: "facebook" });
			throw error;
		}
	}

	buildOAuthUser(facebookUserInfo: FacebookUserInfo): OAuthUser {
		const user: OAuthUser = new OAuthUserModel();
		user.service_name = "facebook";
		user.service_specific_id = facebookUserInfo.id;
		user.layer2_authorization_token = GenerateUUID();
		user.layer2_authorization_token_expiration_timestamp =
			Date.now() + MillisecondsInMonth; // Set expiration to 1 month from now
		user.username = facebookUserInfo.email || facebookUserInfo.id; // Fallback to id as username if email is missing
		user.name = facebookUserInfo.name;
		user.profile_description = "";

		user.first_login_date = new Date();
		user.last_login_date = new Date();
		user.profile_pic_url = facebookUserInfo.picture?.data?.url || "";
		user.profile_url = standardizeProfileUrl(
			`https://facebook.com/${facebookUserInfo.id}`,
		);
		user.buildPrimaryKey();
		return user;
	}
}
