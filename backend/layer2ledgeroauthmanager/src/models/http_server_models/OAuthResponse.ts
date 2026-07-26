import { t } from "elysia";
import { ErrorResponse } from "./Common/ErrorResponse";
import { OAuthUserSchema } from "./schemas/oauth-user";
import { UserKeysSchema } from "./schemas/user-keys";

export const OAuthResponse = t.Object({
	error_response: ErrorResponse,
	user: t.Nullable(OAuthUserSchema),
	user_keys: t.Nullable(UserKeysSchema),
});

export type OAuthResponse = typeof OAuthResponse.static;
