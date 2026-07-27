import type { OAuth2ServiceParams } from "@openl2/config-loader";
import axios from "axios";
import { type OAuthUser, OAuthUserModel } from "models/db_models/OAuthUser";
import type { DatabaseInterface } from "../DatabaseInterface";
import { log } from "../logger";
import type { UserKeys } from "../models/db_models/UserKeys";
import type { GoogleUserInfo } from "../models/oauth2_models/Google";
import { standardizeProfileUrl } from "../utils/OAuthHelperUtils";
import { GenerateUUID, MillisecondsInMonth } from "../utils/utils";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USER_URL = "https://www.googleapis.com/oauth2/v2/userinfo";

export class GoogleOAuthManager {
	private config: OAuth2ServiceParams;

	constructor(config: OAuth2ServiceParams) {
		this.config = config;
	}

	async getGoogleAccessToken(code: string): Promise<string> {
		try {
			log.info("Exchanging code for access token", { service: "google" });
			const response = await axios.post<{ access_token: string }>(
				GOOGLE_TOKEN_URL,
				{
					client_id: this.config.clientId,
					client_secret: this.config.clientSecret,
					code,
					redirect_uri: this.config.redirectUri,
					grant_type: "authorization_code",
				},
				{
					headers: {
						Accept: "application/json",
					},
				},
			);
			log.info("Token exchange succeeded", { service: "google" });
			return response.data.access_token;
		} catch (error: unknown) {
			log.exception("Error exchanging code for token", error, {
				service: "google",
			});
			throw error;
		}
	}

	async getGoogleUserInfo(
		accessToken: string,
		mongoDb: DatabaseInterface,
	): Promise<[OAuthUser, UserKeys]> {
		try {
			log.info("Fetching user info", { service: "google" });
			const response = await axios.get<GoogleUserInfo>(GOOGLE_USER_URL, {
				headers: {
					Authorization: `Bearer ${accessToken}`,
				},
			});
			log.info("Fetched user info", {
				service: "google",
				service_specific_id: response.data.id,
			});

			const googleUserInfo: GoogleUserInfo = response.data as GoogleUserInfo;
			const user: OAuthUser = this.buildOAuthUser(googleUserInfo);
			let userKeys: UserKeys | null = await mongoDb.getOAuthUserKeys(user._id);
			if (userKeys === null) {
				userKeys = await mongoDb.createNewUserKeys(user._id);
			}
			//Save the user to the database
			await mongoDb.saveOAuthUser(user, true);
			return [user, userKeys];
		} catch (error: unknown) {
			log.exception("Error fetching user info", error, { service: "google" });
			throw error;
		}
	}

	buildOAuthUser(googleUserInfo: GoogleUserInfo): OAuthUser {
		const user: OAuthUser = new OAuthUserModel();
		user.service_name = "google";
		user.service_specific_id = googleUserInfo.id;
		user.layer2_authorization_token = GenerateUUID();
		user.layer2_authorization_token_expiration_timestamp =
			Date.now() + MillisecondsInMonth; // Set expiration to 1 month from now
		user.username = googleUserInfo.email; // Fallback to email as username
		user.name = googleUserInfo.name;
		user.profile_description = "";

		user.first_login_date = new Date();
		user.last_login_date = new Date();
		user.profile_pic_url = googleUserInfo.picture;
		user.profile_url = standardizeProfileUrl(
			`https://plus.google.com/${googleUserInfo.id}`,
		); // Legacy or generic link
		user.buildPrimaryKey();
		return user;
	}
}
