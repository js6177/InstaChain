import { t } from 'elysia';
import { ErrorResponse } from "./Common/ErrorResponse";
import { OAuthUserSchema } from "../db_models/OAuthUser";
import { UserKeysSchema } from "../db_models/UserKeys";

export const OAuthResponse = t.Object({
    error_response: ErrorResponse,
    user: t.Nullable(OAuthUserSchema),
    user_keys: t.Nullable(UserKeysSchema)
});

export type OAuthResponse = typeof OAuthResponse.static;
