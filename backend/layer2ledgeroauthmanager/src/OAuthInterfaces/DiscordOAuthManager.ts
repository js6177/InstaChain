import type { OAuth2ServiceParams } from "@openl2/config-loader";
import axios from "axios";
import { type OAuthUser, OAuthUserModel } from "models/db_models/OAuthUser";
import type { DatabaseInterface } from "../DatabaseInterface";
import { log } from "../logger";
import type { UserKeys } from "../models/db_models/UserKeys";
import type { DiscordUserInfo } from "../models/oauth2_models/Discord";
import { standardizeProfileUrl } from "../utils/OAuthHelperUtils";
import { GenerateUUID, MillisecondsInMonth } from "../utils/utils";

const DISCORD_TOKEN_URL = "https://discord.com/api/oauth2/token";
const DISCORD_USER_URL = "https://discord.com/api/users/@me";

export class DiscordOAuthManager {
	private config: OAuth2ServiceParams;

	constructor(config: OAuth2ServiceParams) {
		this.config = config;
	}

	async getDiscordAccessToken(code: string): Promise<string> {
		try {
			log.info("Exchanging code for access token", { service: "discord" });

			const params = new URLSearchParams();
			params.append("client_id", this.config.clientId);
			params.append("client_secret", this.config.clientSecret);
			params.append("grant_type", "authorization_code");
			params.append("code", code);
			params.append("redirect_uri", this.config.redirectUri!);

			const response = await axios.post<{ access_token: string }>(
				DISCORD_TOKEN_URL,
				params,
				{
					headers: {
						"Content-Type": "application/x-www-form-urlencoded",
						Accept: "application/json",
					},
				},
			);
			log.info("Token exchange succeeded", { service: "discord" });
			return response.data.access_token;
		} catch (error: unknown) {
			log.exception("Error exchanging code for token", error, {
				service: "discord",
			});
			throw error;
		}
	}

	async getDiscordUserInfo(
		accessToken: string,
		mongoDb: DatabaseInterface,
	): Promise<[OAuthUser, UserKeys]> {
		try {
			log.info("Fetching user info", { service: "discord" });
			const response = await axios.get<DiscordUserInfo>(DISCORD_USER_URL, {
				headers: {
					Authorization: `Bearer ${accessToken}`,
				},
			});
			log.info("Fetched user info", {
				service: "discord",
				service_specific_id: response.data.id,
			});

			const discordUserInfo: DiscordUserInfo = response.data as DiscordUserInfo;
			const user: OAuthUser = this.buildOAuthUser(discordUserInfo);
			let userKeys: UserKeys | null = await mongoDb.getOAuthUserKeys(user._id);
			if (userKeys === null) {
				userKeys = await mongoDb.createNewUserKeys(user._id);
			}
			//Save the user to the database
			await mongoDb.saveOAuthUser(user, true);
			return [user, userKeys];
		} catch (error: unknown) {
			log.exception("Error fetching user info", error, { service: "discord" });
			throw error;
		}
	}

	buildOAuthUser(discordUserInfo: DiscordUserInfo): OAuthUser {
		const user: OAuthUser = new OAuthUserModel();
		user.service_name = "discord";
		user.service_specific_id = discordUserInfo.id;
		user.layer2_authorization_token = GenerateUUID();
		user.layer2_authorization_token_expiration_timestamp =
			Date.now() + MillisecondsInMonth; // Set expiration to 1 month from now
		user.username = discordUserInfo.username;
		user.name = discordUserInfo.global_name || discordUserInfo.username;
		user.profile_description = "";

		user.first_login_date = new Date();
		user.last_login_date = new Date();
		if (discordUserInfo.avatar) {
			user.profile_pic_url = `https://cdn.discordapp.com/avatars/${discordUserInfo.id}/${discordUserInfo.avatar}.png`;
		} else {
			user.profile_pic_url = "";
		}
		user.profile_url = standardizeProfileUrl(
			`https://discord.com/users/${discordUserInfo.id}`,
		);
		user.buildPrimaryKey();
		return user;
	}
}
