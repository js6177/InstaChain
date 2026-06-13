export const Services = {
  LAYER2LEDGERBATCHED_COMMON: 'layer2ledgerbatched-common',
  LAYER2LEDGERBATCHED_LAYER2LEDGERAPIHANDLER: 'layer2ledgerbatched-layer2ledgerapihandler',
  LAYER2LEDGEROAUTHMANAGER: 'layer2ledgeroauthmanager',
  LAYER2LEDGERBRIDGE: 'layer2ledgerbridge',
  BACKEND_COMMON: 'backend-common',
} as const;

export type ServiceName = (typeof Services)[keyof typeof Services];

export const Environment = {
  DEV: 'dev',
  PROD: 'prod',
  TEST: 'test',
  DEFAULT: 'prod',
} as const;

export type EnvironmentName = (typeof Environment)[keyof typeof Environment];
