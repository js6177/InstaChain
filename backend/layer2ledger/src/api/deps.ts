import type { Layer2LedgerAPIHandlerConfig } from '@openl2/config-loader';
import type { MessagingContext } from '@openl2/openl2-messaging';

export interface Layer2LedgerAppDependencies {
  db: unknown;
  /**
   * Intentionally structural/opaque: this shared package must not depend on any
   * specific database/redis client implementation.
   */
  sql: unknown;
  redis: unknown;
  lockManager: {
    acquireMultiLock(userIds: string[]): Promise<string | null>;
    releaseMultiLock(userIds: string[], lockToken: string): Promise<boolean>;
  };
  settings: Layer2LedgerAPIHandlerConfig;
  messaging: MessagingContext;
  generateBtcTestnetAddress(masterPublicKey: string, addressIndex: number): string | null;
}
