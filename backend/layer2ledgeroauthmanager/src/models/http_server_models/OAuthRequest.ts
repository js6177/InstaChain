import { t } from 'elysia';

export const OAuthServiceSchema = t.Union([
    t.Literal('twitter'),
    t.Literal('github'),
    t.Literal('google'),
    t.Literal('facebook'),
    t.Literal('discord'),
]);

export type OAuthService = typeof OAuthServiceSchema.static;

export const OAuthRequest = t.Object({
    code: t.String(),
    service: OAuthServiceSchema,
    code_verifier: t.Nullable(t.String())
});

export type OAuthRequest = typeof OAuthRequest.static;
