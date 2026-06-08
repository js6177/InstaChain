import { t } from 'elysia';

// TypeScript enum for OAuth services
export enum OAuthService {
  Twitter = 'twitter',
  Github = 'github',
  Google = 'google',
  Facebook = 'facebook',
  Discord = 'discord',
}

// Elysia validation schema based on the enum
export const OAuthServiceSchema = t.Enum(OAuthService);

export const OAuthRequest = t.Object({
  code: t.String(),
  service: OAuthServiceSchema,
  code_verifier: t.Nullable(t.String()),
});

export type OAuthRequest = typeof OAuthRequest.static;
