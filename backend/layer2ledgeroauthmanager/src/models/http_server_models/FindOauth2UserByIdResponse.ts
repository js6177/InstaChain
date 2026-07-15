import { t } from 'elysia';
import { OAuthUserSchema } from "./schemas/oauth-user";
import { ErrorResponse } from "./Common/ErrorResponse";

export const FindOauth2UserByIdResponse = t.Object({
    error_response: ErrorResponse,
    user: t.Optional(OAuthUserSchema),
    layer2_address_pubkey: t.Optional(t.String())
});

export type FindOauth2UserByIdResponse = typeof FindOauth2UserByIdResponse.static;
