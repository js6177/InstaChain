import { t } from "elysia";
import { ErrorResponse } from "./Common/ErrorResponse";
import { OAuthUserSchema } from "./schemas/oauth-user";

export const SearchUserResponse = t.Object({
	error_response: ErrorResponse,
	users: t.Nullable(t.Array(OAuthUserSchema)),
});

export type SearchUserResponse = typeof SearchUserResponse.static;
