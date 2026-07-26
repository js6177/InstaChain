import { t } from "elysia";
import { type ErrorCode, getErrorMessage } from "../ErrorCodes";

export const ErrorResponse = t.Object({
	error_code: t.Number(),
	error_message: t.String(),
});

export type ErrorResponse = typeof ErrorResponse.static;

export function buildErrorResponse(code: ErrorCode): ErrorResponse {
	return {
		error_code: code,
		error_message: getErrorMessage(code),
	};
}
