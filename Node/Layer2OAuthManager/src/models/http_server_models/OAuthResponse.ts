import { type ErrorResponse } from "./Common/ErrorResponse";
import { type OAuthUser } from "../db_models/OAuthUser";
import { type UserKeys } from "models/db_models/UserKeys";

export interface OAuthResponse {
    error_response: ErrorResponse;
    user: OAuthUser | null;
    user_keys: UserKeys | null;
}