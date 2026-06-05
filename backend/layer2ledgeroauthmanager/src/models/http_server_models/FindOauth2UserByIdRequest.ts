import { t } from 'elysia';

export const FindOauth2UserByIdRequest = t.Object({
    service_name: t.String(),
    service_specific_id: t.String()
});

export type FindOauth2UserByIdRequest = typeof FindOauth2UserByIdRequest.static;
