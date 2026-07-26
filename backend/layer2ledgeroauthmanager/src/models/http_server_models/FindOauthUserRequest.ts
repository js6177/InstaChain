import { t } from "elysia";

export const FindOauthUserRequest = t.Object({
	username: t.Nullable(t.String()),
	profile_url: t.String(),
});

export type FindOauthUserRequest = typeof FindOauthUserRequest.static;
