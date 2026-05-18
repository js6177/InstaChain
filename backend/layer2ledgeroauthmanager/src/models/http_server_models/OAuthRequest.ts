import { t } from 'elysia';

export const OAuthRequest = t.Object({
    code: t.String(),
    service: t.String(),
    code_verifier: t.Nullable(t.String())
});

export type OAuthRequest = typeof OAuthRequest.static;
