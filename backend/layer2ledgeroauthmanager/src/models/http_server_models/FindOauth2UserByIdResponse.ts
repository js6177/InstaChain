import { t } from "elysia";
import { ErrorResponse } from "./Common/ErrorResponse";
import { OAuthUserSchema } from "./schemas/oauth-user";

export const FindOauth2UserByIdResponse = t.Object({
	error_response: ErrorResponse,
	user: t.Optional(OAuthUserSchema),
	layer2_address_pubkey: t.Optional(t.String()),
});

export type FindOauth2UserByIdResponse =
	typeof FindOauth2UserByIdResponse.static;
