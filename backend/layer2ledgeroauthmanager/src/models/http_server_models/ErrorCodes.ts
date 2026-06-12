export const ErrorCodes = {
  Success: 0,
  InternalServerError: 1,
  UserNotFound: 2,
  UnsupportedService: 3,
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

const ERROR_CODE_MESSAGES: Record<ErrorCode, string> = {
  [ErrorCodes.Success]: 'Success',
  [ErrorCodes.InternalServerError]: 'Internal Server Error',
  [ErrorCodes.UserNotFound]: 'Could not find user',
  [ErrorCodes.UnsupportedService]: 'Unsupported service',
};

export function getErrorMessage(code: ErrorCode): string {
  return ERROR_CODE_MESSAGES[code];
}
