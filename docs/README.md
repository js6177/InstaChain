# Setting up

The OpenL2 project is split into a backend and frontend. The backend itself is split into multiple services. To setup the backend, see the README in the backend folder.

## Layer2 Ledger API client

The Layer2 Ledger HTTP API is defined in `backend/layer2ledger`. Consumers (frontend wallet and `layer2bridge`) import the typed Eden treaty client and shared request/response models from the shared package:

`/shared/api-layer2ledger` (`@openl2/api-layer2ledger`)

Example:

```typescript
import {
  createLayer2LedgerClient,
  unwrapLayer2LedgerResponse,
} from '@openl2/api-layer2ledger';

const ledgerApi = createLayer2LedgerClient('http://localhost:8000');
const balance = unwrapLayer2LedgerResponse(
  await ledgerApi.explorer.get_balance.post({ public_keys: [publicKey] }),
);
```