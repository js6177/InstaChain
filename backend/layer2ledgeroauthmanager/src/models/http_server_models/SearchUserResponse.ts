import { t } from 'elysia';
import { OAuthUserSchema } from "../db_models/OAuthUser";
import { ErrorResponse } from "./Common/ErrorResponse";

export const SearchUserResponse = t.Object({
    error_response: ErrorResponse,
    users: t.Nullable(t.Array(OAuthUserSchema))
});

export type SearchUserResponse = typeof SearchUserResponse.static;
