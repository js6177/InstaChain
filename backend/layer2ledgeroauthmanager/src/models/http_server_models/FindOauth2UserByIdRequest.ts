import { t } from "elysia";
import { OAuthServiceSchema } from "./OAuthRequest";

export const FindOauth2UserByIdRequest = t.Object({
	service_name: OAuthServiceSchema,
	service_specific_id: t.String(),
});

export type FindOauth2UserByIdRequest = typeof FindOauth2UserByIdRequest.static;
