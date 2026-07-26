import { t } from "elysia";

export const CommonResponse = t.Object({
	error_code: t.Number(),
	error_message: t.String(),
});

export type CommonResponse = typeof CommonResponse.static;

export const ErrorCodes = {
	SUCCESS: 0,
	UNKNOWN: 1,
	CANNOT_VERIFY_SIGNATURE: 10,
	CANNOT_DUPLICATE_TRANSACTION: 11,
	INSUFFICIENT_FUNDS: 12,
	TRANSACTION_ID_NOT_FOUND: 13,
	DEPOSIT_ADDRESS_NOT_FOUND: 16,
	DUPLICATE_TRANSACTION_ID: 17,
	ADDRESS_LOCKED: 23,
	INVALID_SIGNATURE: 31,
	INVALID_SOURCE_ADDRESS: 35,
	INVALID_DESTINATION_ADDRESS: 36,
	INVALID_AMOUNT: 37,
} as const;

const errorMessages: Record<number, string> = {
	[ErrorCodes.SUCCESS]: "Success",
	[ErrorCodes.UNKNOWN]: "Unknown error",
	[ErrorCodes.CANNOT_DUPLICATE_TRANSACTION]:
		"Transaction with that ID (nonce) already exists",
	[ErrorCodes.INSUFFICIENT_FUNDS]: "Insufficient funds",
	[ErrorCodes.TRANSACTION_ID_NOT_FOUND]: "Cannot find the transaction",
	[ErrorCodes.DEPOSIT_ADDRESS_NOT_FOUND]:
		"The address that funds were deposited to was not found",
	[ErrorCodes.DUPLICATE_TRANSACTION_ID]: "The nonce must be unique",
	[ErrorCodes.ADDRESS_LOCKED]:
		"The address is locked because it is being processed by another transaction. Please try again",
	[ErrorCodes.INVALID_SIGNATURE]: "The signature is invalid",
	[ErrorCodes.INVALID_SOURCE_ADDRESS]: "Invalid source address",
	[ErrorCodes.INVALID_DESTINATION_ADDRESS]: "Invalid destination address",
	[ErrorCodes.INVALID_AMOUNT]: "Invalid amount",
};

export function getErrorMessage(errorCode: number): string {
	return errorMessages[errorCode] ?? "Unknown error";
}

export function buildCommonResponse(
	errorCode: number,
	errorMessage?: string,
): CommonResponse {
	return {
		error_code: errorCode,
		error_message: errorMessage ?? getErrorMessage(errorCode),
	};
}
