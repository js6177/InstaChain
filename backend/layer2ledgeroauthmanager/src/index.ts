import {
	loadOAuthManagerConfig,
	type ConfigInterface,
} from "@openl2/config-loader";
import { DatabaseInterface } from "./DatabaseInterface";
import { TwitterOAuthManager } from "OAuthInterfaces/TwitterOAuthManger";
import { GithubOAuthManager } from "OAuthInterfaces/GithubOAuthManager";
import { GoogleOAuthManager } from "OAuthInterfaces/GoogleOAuthManager";
import { FacebookOAuthManager } from "OAuthInterfaces/FacebookOAuthManager";
import { DiscordOAuthManager } from "OAuthInterfaces/DiscordOAuthManager";
import { createLayer2OAuthApp } from "./api/app";
import { createOAuthRouteHandlers } from "./services/route-handlers";

const config: ConfigInterface = loadOAuthManagerConfig();

const port = config.server.port;
const host = config.server.host;

let twitterOAuthManager: TwitterOAuthManager | null = null;
let githubOAuthManager: GithubOAuthManager | null = null;
let googleOAuthManager: GoogleOAuthManager | null = null;
let facebookOAuthManager: FacebookOAuthManager | null = null;
let discordOAuthManager: DiscordOAuthManager | null = null;
if (config.twitter) {
	twitterOAuthManager = new TwitterOAuthManager(config.twitter);
}
if (config.github) {
	githubOAuthManager = new GithubOAuthManager(config.github);
}
if (config.google) {
	googleOAuthManager = new GoogleOAuthManager(config.google);
}
if (config.facebook) {
	facebookOAuthManager = new FacebookOAuthManager(config.facebook);
}
if (config.discord) {
	discordOAuthManager = new DiscordOAuthManager(config.discord);
}

const mongoDb: DatabaseInterface = new DatabaseInterface(config.mongoDb);
const connected: boolean = await mongoDb.connect();
if (!connected) {
	console.error("Error connecting to MongoDB. Exiting...");
	process.exit(1);
}

const handlers = createOAuthRouteHandlers({
	mongoDb,
	twitterOAuthManager,
	githubOAuthManager,
	googleOAuthManager,
	facebookOAuthManager,
	discordOAuthManager,
});

const app = createLayer2OAuthApp(handlers).listen(
	{
		port,
		hostname: host,
	},
	() => {
		console.log(`Server is running on http://${host}:${port}`);
	},
);

export type App = typeof app;
