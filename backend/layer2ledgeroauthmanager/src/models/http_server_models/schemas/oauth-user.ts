import { t, type Static } from "elysia";

export const OAuthUserSchema = t.Object({
	service_name: t.String(),
	service_specific_id: t.String(),
	_id: t.String(),
	layer2_authorization_token: t.String(),
	layer2_authorization_token_expiration_timestamp: t.Number(),
	username: t.String(),
	name: t.Nullable(t.String()),
	profile_pic_url: t.Nullable(t.String()),
	profile_url: t.String(),
	profile_description: t.Nullable(t.String()),
	first_login_date: t.Date(),
	last_login_date: t.Optional(t.Date()),
});

export type OAuthUserType = Static<typeof OAuthUserSchema>;
