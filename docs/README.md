# Setting up

The OpenL2 project is split into a backend and frontend. The backend itself is split into multiple services. To setup the backend, see the README in the backend folder.
Once the backend is setup (after you finish running setup_scripts), you will need to generate the openapi spec from the backend, and import it into the frontend so they can talk to each other.

In the backend, go to

`/backend/layer2ledgerbatched`

and run 

`uv run tools/dump_fastapi_openapi.py`

This should generate an openapi spec at the location:

`OpenAPI schema dumped to /backend/layer2ledgerbatched/docs/layer2ledgerapihandler_openapi.json`

Move that spec to `/frontend/wallet/packages/api-layer2ledger/specs`

And import it into the frontend project so that the frontend has access tot he request/response models and a way to call them.

To import it, use orval. Navigate to the api-layer2ledger package.

`/frontend/wallet/packages/api-layer2ledger`

and run

`bun run orval`

This will generate the appropriate client required to call the layer2ledger API in `/src/`