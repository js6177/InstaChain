import { type Static, t } from "elysia";

export const UserKeysSchema = t.Object({
	oauth_user_id: t.String(),
	l2_address_mneumonic: t.String(),
	l2_address_public_key: t.Optional(t.String()),
});

export type UserKeysType = Static<typeof UserKeysSchema>;
