import { OAuthUser } from "models/db_models/OAuthUser";
import type { ErrorResponse } from "./Common/ErrorResponse";

export interface SearchUserResponse{
    error_response: ErrorResponse;
    users: OAuthUser[] | null;
}