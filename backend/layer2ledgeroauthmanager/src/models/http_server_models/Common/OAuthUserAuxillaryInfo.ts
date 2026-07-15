import { t } from 'elysia';
import { OAuthUserSchema } from "../schemas/oauth-user";

export const OAuthUserAuxillaryInfo = t.Object({
    user: OAuthUserSchema,
    layer2_address_pubkey: t.String(),
    placeholder_user: t.Boolean()
});

export type OAuthUserAuxillaryInfo = typeof OAuthUserAuxillaryInfo.static;
