# Docker on Unraid

The Docker image uses Node.js and SQLite. Cloudflare is not required. The database, generated session secret and SQLite
journal files live in `/data`, mapped to your appdata share. The web UI, REST API and MCP all use container port 3000.

## Install using a local build

On your Unraid server, clone this fork into a directory used for source checkouts (separate from appdata), then build:

```sh
git clone https://github.com/andrewgribben/opentracker.git
cd opentracker
docker build -t opentracker:local .
```

In **Docker → Add Container**, leave **Template** unselected and enter:

- **Name:** `opentracker`
- **Repository:** `opentracker:local` (or your published image tag).
- **Network Type:** `bridge`.
- **WebUI** (Advanced View): `http://[IP]:[PORT:3000]`.
- Add a **Port**: container `3000`, host `3000` (or your preferred free host port), TCP.
- Add a **Path**: container `/data`, host `/mnt/user/appdata/opentracker`, read/write.
- Add a **Variable**: key `DASHBOARD_URL`, value `http://YOUR-UNRAID-IP:3000` using your actual IP and chosen host port.
- Optionally add **Variables** `PUID=99`, `PGID=100`, `UMASK=002` and `TZ=Europe/London`; additional settings are listed below.

Click **Apply**, open **WebUI**, and sign up to create your account. Unraid saves the container configuration automatically;
you can edit its ports, paths, variables and other settings through the normal Docker UI. No Community Applications listing
or manual XML installation is required. Signup remains open; use your usual network access controls if the service is
intended to be private.

The supplied `unraid/opentracker.xml` is an optional prefilled template. If you prefer to import it rather than enter the
fields, copy it to `/boot/config/plugins/dockerMan/templates-user/my-opentracker.xml` on Unraid, then select `opentracker`
under **Docker → Add Container**. That optional import only prepopulates the form; the container has the same capabilities
when configured directly in the UI.

## Settings

- **Web port:** host port defaults to 3000. Container port stays 3000.
- **Appdata:** defaults to `/mnt/user/appdata/opentracker`; use a local cache/pool-backed appdata share. Do not use network
  storage for SQLite. Run one container per database directory.
- **PUID / PGID:** defaults to Unraid's `nobody:users` (`99:100`). Startup fixes ownership of the dedicated appdata directory
  and then drops privileges for migrations and the server. Do not map `/data` to a shared parent directory.
- **UMASK:** defaults to `002`. **TZ** defaults to `Europe/London` in the template.
- **Public URL / DASHBOARD_URL:** the address users visit, including scheme and host port. Used for links and cookie defaults.
- **SESSION_SECRET:** leave blank to generate `/data/session-secret` on first start; keep this file across updates. Alternatively
  supply at least 32 random characters. Changing the secret invalidates existing logins.
- **COOKIE_SECURE:** blank automatically selects `true` for an HTTPS Public URL and `false` for HTTP. Override with `true` or
  `false` if required. Direct LAN HTTP needs `false`.
- **TRUST_PROXY:** defaults to `false`. Set `true` behind one trusted reverse proxy which overwrites `X-Forwarded-For` and
  `X-Forwarded-Proto`. Prevent direct untrusted access to the backend in that configuration. Client IPs control login/signup
  rate limits; supplied Cloudflare IP headers are discarded by the Node server.
- **SES_AWS_REGION**, **EMAIL_FROM**, **ADMIN_EMAIL**, **SES_AWS_ACCESS_KEY_ID**, **SES_AWS_SECRET_ACCESS_KEY:** optional
  signup notification email via Amazon SES. The region defaults to `us-west-2`; leave credentials unset to disable sending.
- **SENTRY_DSN:** optional error reporting. **GOOGLE_ANALYTICS_ID / GOOGLE_ANALYTICS_API_SECRET:** optional analytics.
- **USERO_CLIENT_ID:** blank disables the feedback widget; supply your own client ID to enable it.

Generic Docker installations can also set `PORT` (internal listening port), `DATA_DIR` and `DATABASE_URL`. Their defaults are
`3000`, `/data` and `file:/data/opentracker.db`. If overriding paths, keep the database inside persistent storage and adjust
port mappings and WebUI accordingly. Docker supports `--user UID:GID` when the mounted directory is already writable;
PUID/PGID ownership setup only runs when the entrypoint starts as root. Logs go to standard output and appear in Unraid.
`/health` checks database access and is used by the Docker healthcheck.

## Reverse proxy and MCP

Set Public URL to your HTTPS URL and Trust reverse proxy to `true`. The default cookie selection then enables secure cookies.
Configure your proxy to forward the request host/protocol and support streaming HTTP on `/mcp`. Create an API key at `/profile`:

```sh
claude mcp add --transport http tracker https://tracker.example.com/mcp --header "Authorization: Bearer lt_..."
```

The REST API is documented in [API.md](../API.md); all existing API-key access rules still apply.

## Updates and published images

For a local build, pull the desired revision and rebuild `opentracker:local`, then use Unraid's **Edit → Apply** to recreate
this container with the new image. Keep the appdata mapping. Do not use Compose to replace a template-managed container.

The `Docker image` GitHub workflow builds `linux/amd64` and `linux/arm64`. A pushed `v*` release tag publishes versioned images
and `latest` to `ghcr.io/andrewgribben/opentracker`. Manual workflow runs publish `edge`. Pull requests build without publishing.
The workflow uses `GITHUB_TOKEN`, so no Docker Hub credentials are needed. For anonymous Unraid pulls, set the GHCR package
visibility to public after the first publish. Only select a published tag after its workflow succeeds; the repository name in
this template defaults to a local image because no published image is assumed to exist yet.

Once a release exists, change **Repository** in the Unraid template to `ghcr.io/andrewgribben/opentracker:VERSION` or `:latest`.
Unraid can then check/pull image updates normally. The inherited Cloudflare deployment jobs are gated to the upstream repo;
if you also want Cloudflare deployments for this fork, adjust those conditions and provide your own credentials/config.

## Backup and restore

Stop the container, copy the **entire appdata directory**, then restart it. Stopping avoids inconsistent copies of SQLite's
journal files. Protect backups: they contain user data, password hashes and the session signing secret.
To restore, stop the container, restore appdata, and start with the image version matching that backup. Startup migrations
are forward-only; after an update, rolling back an image may require restoring its matching pre-update appdata backup.
The entrypoint exits without serving traffic if a migration fails; inspect the Unraid container logs.

## Verify a build

```sh
docker build -t opentracker:local .
npm run test:docker
```

The smoke test uses a temporary container and volume, verifies signup, session cookies, REST and MCP access, and confirms
that stories and login sessions survive container recreation. It removes only those test resources. Set `TEST_IMAGE` to test
another local image tag. Set `TEST_STORAGE_ROOT=/tmp` to test a fresh host bind mount instead of a named Docker volume. The publishing workflow runs this test on Linux amd64 before publishing both architectures.

## Schema development

Cloudflare continues to use `migrations/*.sql`. Docker uses Prisma's separate `prisma/migrations/` history, initially generated
from the current schema. These are separate database installations; this is not an automated D1 data import.
After a schema change, create the Cloudflare migration as described in README and a matching Docker migration against a
local development SQLite database:

```sh
DATABASE_URL=file:/tmp/opentracker-development.db npx prisma migrate dev --name your_change
npx prisma generate
```

Commit both migration histories. Never run `migrate dev` or `db push` against production appdata.
