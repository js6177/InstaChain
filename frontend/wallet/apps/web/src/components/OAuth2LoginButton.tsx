import React, { useEffect, useState } from "react";
// @ts-expect-error
import OAuth2LoginImport from "react-simple-oauth2-login";
// @ts-expect-error
const OAuth2Login = OAuth2LoginImport.default || OAuth2LoginImport;
import {
	OAuthService,
	type OAuthResponse,
} from "@openl2/api-layer2oauthmanager";
import { useOAuthExchangeMutation } from "../hooks/useLayer2LedgerOauthManagerQueries";

const GOOGLE_OAuth2_CLIENT_ID: string =
	import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID ||
	"17462425659-3bj289qvtabukac8khb1k9egrft3mkmv.apps.googleusercontent.com";
const GITHUB_OAuth2_CLIENT_ID: string =
	import.meta.env.VITE_GITHUB_OAUTH_CLIENT_ID || "Ov23lib6aYPuNReWkLjX";
const TWITTER_OAuth2_CLIENT_ID: string =
	import.meta.env.VITE_TWITTER_OAUTH_CLIENT_ID ||
	"MlZNU3FNYWVta2hBN2xYSG9XR2w6MTpjaQ";
const FACEBOOK_OAuth2_CLIENT_ID: string =
	import.meta.env.VITE_FACEBOOK_OAUTH_CLIENT_ID || "936264089367995";
const DISCORD_OAuth2_CLIENT_ID: string =
	import.meta.env.VITE_DISCORD_OAUTH_CLIENT_ID || "1510783980168024164";

const GOOGLE_AUTHORIZATION_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_REDIRECT_URL = `${import.meta.env.VITE_APP_ORIGIN || "http://localhost:5173"}/oauth2/google/callback`;

const GITHUB_AUTHORIZATION_URL = "https://github.com/login/oauth/authorize";
const GITHUB_REDIRECT_URL = `${import.meta.env.VITE_APP_ORIGIN || "http://localhost:5173"}/oauth2/github/callback`;

const TWITTER_AUTHORIZATION_URL = "https://twitter.com/i/oauth2/authorize";
const TWITTER_REDIRECT_URL = `${import.meta.env.VITE_APP_ORIGIN || "http://localhost:5173"}/oauth2/twitter/callback`;

const FACEBOOK_AUTHORIZATION_URL =
	"https://www.facebook.com/v19.0/dialog/oauth";
const FACEBOOK_REDIRECT_URL = `${import.meta.env.VITE_APP_ORIGIN || "http://localhost:5173"}/oauth2/facebook/callback`;

const DISCORD_AUTHORIZATION_URL = "https://discord.com/api/oauth2/authorize";
const DISCORD_REDIRECT_URL = `${import.meta.env.VITE_APP_ORIGIN || "http://localhost:5173"}/oauth2/discord/callback`;

interface OAuthProps {
	onSuccess: (data: OAuthResponse) => void;
	onError: (error: string) => void;
}

interface OAuthCodeResponse {
	code: string | null;
}

// Implement PKCE SHA256 logic using Web Crypto API to avoid lodash/crypto-js
async function sha256(plain: string): Promise<string> {
	const encoder = new TextEncoder();
	const data = encoder.encode(plain);
	const hash = await crypto.subtle.digest("SHA-256", data);
	// Base64URL encoding
	return btoa(String.fromCharCode(...new Uint8Array(hash)))
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
}

function generateRandomString(length: number): string {
	const possible =
		"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
	let text = "";
	for (let i = 0; i < length; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}

function useOAuthCodeExchange(
	service: OAuthService,
	codeVerifier: string | null,
	onSuccess: (data: OAuthResponse) => void,
	onError: (error: string) => void,
): {
	handleOAuthExchange: (code: string) => Promise<void>;
	isExchanging: boolean;
} {
	const { mutateAsync, isPending } = useOAuthExchangeMutation();

	const handleOAuthExchange = async (code: string): Promise<void> => {
		try {
			const data = await mutateAsync({
				code,
				service,
				code_verifier: codeVerifier,
			});
			onSuccess(data);
		} catch (err) {
			onError((err as Error).message);
		}
	};

	return { handleOAuthExchange, isExchanging: isPending };
}

export function TwitterLoginWithOAuth2Login({
	onSuccess,
	onError,
}: OAuthProps): React.JSX.Element {
	const [PKCE_code, setPKCE_code] = useState<string>("");
	const [PKCE_code_sha256, setPKCE_code_sha256] = useState<string>("");
	const { handleOAuthExchange, isExchanging } = useOAuthCodeExchange(
		OAuthService.Twitter,
		PKCE_code,
		onSuccess,
		onError,
	);

	useEffect(() => {
		const code = generateRandomString(43); // Ensure sufficient length for PKCE
		setPKCE_code(code);
		sha256(code).then(setPKCE_code_sha256);
	}, []);

	return (
		<OAuth2Login
			authorizationUrl={TWITTER_AUTHORIZATION_URL}
			responseType="code"
			clientId={TWITTER_OAuth2_CLIENT_ID}
			redirectUri={TWITTER_REDIRECT_URL}
			scope="tweet.read users.read"
			state={generateRandomString(10)}
			buttonText={isExchanging ? "Logging in..." : "Login with X"}
			className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2 w-full"
			isCrossOrigin={false}
			onSuccess={(response: OAuthCodeResponse): void => {
				if (response.code !== null) {
					handleOAuthExchange(response.code);
				}
			}}
			onFailure={(): void => {
				onError("Twitter login failed");
			}}
			extraParams={{
				code_challenge: PKCE_code_sha256,
				code_challenge_method: "S256",
			}}
		/>
	);
}

export function GithubLoginWithOAuth2Login({
	onSuccess,
	onError,
}: OAuthProps): React.JSX.Element {
	const { handleOAuthExchange, isExchanging } = useOAuthCodeExchange(
		OAuthService.Github,
		null,
		onSuccess,
		onError,
	);

	return (
		<OAuth2Login
			authorizationUrl={GITHUB_AUTHORIZATION_URL}
			responseType="code"
			clientId={GITHUB_OAuth2_CLIENT_ID}
			redirectUri={GITHUB_REDIRECT_URL}
			scope=""
			buttonText={isExchanging ? "Logging in..." : "Login with Github"}
			className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2 w-full"
			isCrossOrigin={false}
			onSuccess={(response: OAuthCodeResponse): void => {
				if (response.code !== null) {
					handleOAuthExchange(response.code);
				}
			}}
			onFailure={(): void => {
				onError("Github login failed");
			}}
		/>
	);
}

export function GoogleLoginWithOAuth2Login({
	onSuccess,
	onError,
}: OAuthProps): React.JSX.Element {
	const { handleOAuthExchange, isExchanging } = useOAuthCodeExchange(
		OAuthService.Google,
		null,
		onSuccess,
		onError,
	);

	return (
		<OAuth2Login
			authorizationUrl={GOOGLE_AUTHORIZATION_URL}
			responseType="code"
			clientId={GOOGLE_OAuth2_CLIENT_ID}
			redirectUri={GOOGLE_REDIRECT_URL}
			scope="email profile"
			buttonText={isExchanging ? "Logging in..." : "Login with Google"}
			className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2 w-full"
			isCrossOrigin={false}
			onSuccess={(response: OAuthCodeResponse): void => {
				if (response.code !== null) {
					handleOAuthExchange(response.code);
				}
			}}
			onFailure={(): void => {
				onError("Google login failed");
			}}
		/>
	);
}

export function FacebookLoginWithOAuth2Login({
	onSuccess,
	onError,
}: OAuthProps): React.JSX.Element {
	const { handleOAuthExchange, isExchanging } = useOAuthCodeExchange(
		OAuthService.Facebook,
		null,
		onSuccess,
		onError,
	);

	return (
		<OAuth2Login
			authorizationUrl={FACEBOOK_AUTHORIZATION_URL}
			responseType="code"
			clientId={FACEBOOK_OAuth2_CLIENT_ID}
			redirectUri={FACEBOOK_REDIRECT_URL}
			scope="public_profile"
			buttonText={isExchanging ? "Logging in..." : "Login with Facebook"}
			className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2 w-full"
			isCrossOrigin={false}
			onSuccess={(response: OAuthCodeResponse): void => {
				if (response.code !== null) {
					handleOAuthExchange(response.code);
				}
			}}
			onFailure={(): void => {
				onError("Facebook login failed");
			}}
		/>
	);
}

export function DiscordLoginWithOAuth2Login({
	onSuccess,
	onError,
}: OAuthProps): React.JSX.Element {
	const { handleOAuthExchange, isExchanging } = useOAuthCodeExchange(
		OAuthService.Discord,
		null,
		onSuccess,
		onError,
	);

	return (
		<OAuth2Login
			authorizationUrl={DISCORD_AUTHORIZATION_URL}
			responseType="code"
			clientId={DISCORD_OAuth2_CLIENT_ID}
			redirectUri={DISCORD_REDIRECT_URL}
			scope="identify"
			buttonText={isExchanging ? "Logging in..." : "Login with Discord"}
			className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2 w-full"
			isCrossOrigin={false}
			onSuccess={(response: OAuthCodeResponse): void => {
				if (response.code !== null) {
					handleOAuthExchange(response.code);
				}
			}}
			onFailure={(): void => {
				onError("Discord login failed");
			}}
		/>
	);
}
