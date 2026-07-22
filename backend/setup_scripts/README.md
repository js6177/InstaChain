These setup scripts should be run once (before docker building) before setup in order to:
- generate signing/verifying keys in order for various services to communicate securily with each other (by signing and verifying messages sent between them)
- copies the docker env variables for the 3rd party apps (bitcoin core, redis, mongodb, postgresql) into a single config.json for each backend service so that the backend services can connect to them

The backend can be run two ways:
- through docker containers, where each service is it's own docker contianer and the docker containers also contains the images of 3rd party servers (postgresql server, redis server, bitcoin core)
- or on a local dev machine, where each backend service can be run through bun, and redis/postgres servers are ran on localhost too. This should be mainly used as a dev setup for debugging with VS code.

In order to setup in either mode, you first need to run the setup scripts in order to generate all the necesary keys.

## Recommended first-time Docker setup

From the repo root, this orchestrates key generation, starting `bitcoin-core`, waiting for chain sync, and importing the wallet:

```bash
bun run setup:first-time -- -env=prod
# or from this directory:
bun run setup:first-time -- -env=dev
# recreate wallet only (keeps synced blockchain data volume):
bun run setup:first-time -- -env=prod -overwrite-wallet
```

To permanently remove all OpenL2 docker containers and volumes:

```bash
bun run uninstall
# or non-interactive:
bun run uninstall -- -noprompt
# or: make uninstall
```

You can also fine-tune individual setup steps from the repo root:

```bash
bun run setup -- -env=test -containered=true -generate-keys -generate-oauth-config
bun run setup -- -env=test -containered=true -import-keys-to-bitcoin-core
```

Or from this directory:

```bash
bun run src/main.ts -env=prod -containered=true -generate-keys -generate-oauth-config
```

# Running on a local dev machine
If you plan on running the backend services on a local dev machine, you first need to install the 3rd party dependencies. Once they are installed, make sure bitcoind is stopped, as these setup scripts will overwrite the bitcoin.conf.
To stop bitcoind, run
`bitcoin-cli stop`

If you are running the postgresql server inside WSL (windows subsystem for linux), you need to manually set the postgresql password to 'postgresql'
`sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'postgres';"`

Run the setup scripts:

```bash
bun run src/main.ts -env=prod -containered=false -generate-keys -import-keys-to-bitcoin-core
```

This will generate all the keys and configs. Then it waits for input in order to give you time to run bitcoind to import bitcoin private keys to it. Once you run bitcoind click Enter.


# Running though docker containers

If you want to run the backend services in a docker container, use this command:

```bash
bun run src/main.ts -env=prod -containered=true -generate-keys -import-keys-to-bitcoin-core
```

# CLI options

| Flag | Description |
|------|-------------|
| `-env <env>` | Environment (`dev`, `prod`, `test`). Default: `dev` |
| `-generate-keys` | Generate keys and write service config files under `.config/<env>/` |
| `-import-keys-to-bitcoin-core` | Import generated BTC descriptors into Bitcoin Core |
| `-generate-oauth-config` | Generate `layer2ledgeroauthmanager` config from its docker `.env` file |
| `-containered <true\|false>` | Use docker service hostnames vs localhost. Default: `true` |
| `-overwrite-bitcoinconf` | Copy generated `bitcoin.conf` over the system Bitcoin Core conf (local/non-containered only) |
