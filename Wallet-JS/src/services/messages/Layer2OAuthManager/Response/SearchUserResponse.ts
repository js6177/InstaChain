import { OAuthUser } from "./OAuthResponse";
import type { ErrorResponse } from "../Common/ErrorResponse";

export interface SearchUserResponse{
    error_response: ErrorResponse;
    users: OAuthUser[] | null;
}