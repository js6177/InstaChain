import { t } from 'elysia';

export const ErrorResponse = t.Object({
    error_code: t.Number(),
    error_message: t.String()
});

export type ErrorResponse = typeof ErrorResponse.static;
