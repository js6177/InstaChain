import { t } from 'elysia';
import { OAuthUserSchema } from "../../db_models/OAuthUser";

export const OAuthUserAuxillaryInfo = t.Object({
    user: OAuthUserSchema,
    layer2_address_pubkey: t.String(),
    placeholder_user: t.Boolean()
});

export type OAuthUserAuxillaryInfo = typeof OAuthUserAuxillaryInfo.static;
