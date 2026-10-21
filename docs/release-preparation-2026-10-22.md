# Local release preparation — 22 October 2026

Production has not been modified by this work. Owner confirmation that historical
orders/payments were development tests is accepted. XPay remains LIVE. No provider
API calls, payments, refunds, or synthetic production webhooks are authorized here.

## Implemented

- Migration 014 gates order, order-item, payment, and product writes in PostgreSQL.
  Statement triggers acquire a shared control-row lock through transaction end;
  activation waits for in-flight writes, then subsequent writers fail closed.
- Full maintenance stops financial writes. `resume_xpay_webhook_processing()`
  permits existing-payment processing while new order/payment inserts stay blocked.
  `set_checkout_maintenance(false)` reopens checkout only after drain/verification.
- Intake verifies signature freshness and event mode/contract before durable queue
  insertion. The same event ID cannot replace its payload, mode, or type. Queue
  errors return 503. Maintenance/occupied claims return 503 after durable storage.
- A service-only worker processes stored verified payloads; there is no replay
  signature forgery or public endpoint that accepts unsigned financial payloads.
  One global live claim, five-minute lease, receipt-order selection, 30-second
  failure backoff, attempts, and retained failure state support retries/recovery.
- Ordering is eligible receipt order; XPay itself can deliver events out of order.
  A failed early refund backs off so its paid-event dependency can run. Existing
  atomic RPCs enforce monotonic financial state and order-before-payment locking.
- A processed marker is set only after successful business processing/dedupe.
  Failure after money commit but before inbox ack re-executes idempotently.
  An unassociated event stays pending; it is never silently consumed.
- The worker accepts only the existing service-role bearer credential, compared
  through fixed-length digests. Queue tables and control mutation RPCs have no
  browser grants. No payloads/customer details are returned by queue status.

## Validation

- PostgreSQL **17.11**: 62 groups passed using D: binaries/temp files.
- Includes atomic 012/013/014 application, maintenance lock races, direct RPC and
  Edge gate enforcement, durable enqueue failures, worker authorization, retries,
  expiring leases, stale ack rejection, duplicate identity conflicts, payment/stock
  races, full/partial/failed refunds, and queued refund recovery.
- Native encrypted synthetic backup was actually restored into a second isolated
  PostgreSQL database; counts, migration history, and inventory totals matched.
  Wrong keys and ciphertext tampering were rejected. This is NOT a restore test of
  the still-uncreated production backup.
- XPay regressions, application TypeScript, new handler/worker strict type checks,
  and lint passed. The complete create/status handler check uses the existing
  transport declaration with `noImplicitAny=false`; two pre-existing inferred item
  callbacks need real remote SDK types for full Deno equivalence.
- RouteScroll and unrelated frontend code were unchanged; earlier tests retained.
- Hosted cron/Vault/pg_net, managed Auth/PostgREST/Storage, Edge deployment, and
  actual production restore have NOT been tested by the local harness.

## Password entry and encrypted backup

Run locally in **PowerShell 7**, not in chat:

```powershell
pwsh -NoProfile -File "C:\Users\mmahm\OneDrive\Desktop\rana priject\scripts\backup-production.ps1"
```

The wrapper asks for explicit confirmation, then hidden database-password entry
and a NEW encryption passphrase of at least 16 characters (twice). Store the
encryption passphrase in your password manager. Never share either in chat.
It creates a unique D:\work\athar-backups directory with current-user-only ACLs.
The pinned public Supabase Root 2021 CA is copied as PEM; no private keys are exported.
The wrapper verifies its fingerprint/validity and performs a password-free
`verify-full` TLS preflight before requesting credentials. Supabase's private CA
is not supplied by the Windows public-root export used by the original wrapper.
Password values exist only in memory and child-process environment, never argv,
the repository, a pgpass file, or logs. Clear existing shell transcription first.

The native command executed by the wrapper (password intentionally absent) is:

```text
D:\work\athar-pg17-client\pgsql\bin\pg_dump.exe --dbname "host=aws-1-eu-central-1.pooler.supabase.com port=5432 dbname=postgres user=postgres.rotcgsayspiphcisepmu sslmode=verify-full sslrootcert='<unique-D-backup-directory>/trusted-roots.pem' gssencmode=disable connect_timeout=15" --no-password --format=custom --lock-wait-timeout=10000 --schema=public --schema=auth --schema=storage --schema=supabase_migrations --schema=extensions
```

The password prompt is the wrapper's hidden interactive `Read-Host` prompt; it
supplies PGPASSWORD only to the native child. `PGOPTIONS` forces read-only sessions.
`pg_dumpall --roles-only --no-role-passwords` separately captures roles/memberships.
Its snapshot is separate from the database archive; do not change roles mid-backup.

Native stdout streams directly into AES-256-GCM with a fresh salt/nonce per file
and scrypt-derived key. No unencrypted archive is written. Sensitive diagnostics
are encrypted too. Each completed envelope is fully authenticated/decrypted into
a discard sink and SHA-256 is recorded. Complete archive decoding/decompression
is also checked by piping pg_restore SQL output into a discard sink.
These checks prove integrity, NOT restorability. Any dump/role/TLS failure blocks
release and retains only partial encrypted artifacts; do not downgrade TLS.
Failure status now records the child executable, stage, native exit code and a
fixed, sanitized error category in `backup-status.json`. Raw native errors remain
encrypted. The original failed attempt has no status record and is not a backup.

Coverage: catalog, categories, admin profile/auth data, orders/payments, public
functions/RLS/grants, Auth/Storage metadata, extensions, migration ledger, and
password-free roles/memberships. Selected-schema dumps still need dependencies.

Limitations: Storage object bytes are outside PostgreSQL and are not backed up;
this release must not mutate/delete them. Edge secrets, OAuth/SMTP settings, JWT
keys, Vault secrets, role passwords, and platform configuration are not included.
Preserve those in the existing project/owner's secure configuration inventory.
Do not claim whole-project disaster recovery from this logical archive alone.

## Actual production-backup restore verification — after backup exists

The owner has completed the real encrypted backup in
`D:\work\athar-backups\20261021-222206-96ea5a10`. Its success manifest reports
authenticated decryption and full archive decode PASS with no native dump warnings.
Actual production-data restore is still pending the owner's local passphrase entry.

The executable verifier is `scripts/verify-production-backup.ps1`. It checks the
source identity and SHA-256 values, requires and tests EFS inheritance on a new
private D: directory, and prompts only for the existing encryption passphrase.
It restores password-free roles into a unique local superuser's cluster (avoiding
role-name collisions), restores the custom archive using native pg_restore, and
verifies counts, key roles, migration history and RLS. It also runs the atomic
012/013/014 transaction on the restored copy and checks preserved counts, payment
totals, and inventory. A current-user-only, aggregate-only restore report is saved
beside the backup. Success requires encrypted temporary-data cleanup as well as
the child exit status. Raw failure diagnostics are encrypted. The verifier has
passed an end-to-end synthetic EFS/native PostgreSQL 17.11 test; that result is not
represented as a successful restore of the owner's actual backup.

1. Confirm the backup manifest, authentication tags, hashes, and dump exit status;
   review encrypted diagnostics privately if warnings exist.
2. Use a new empty local cluster from the D: 17.11 binaries, loopback only, random
   credentials, private ACL, and an EFS-encrypted directory or encrypted volume.
   Do not restore production rows onto unencrypted temporary storage.
3. Authenticate each encrypted envelope completely BEFORE feeding decrypted data
   into any restore process. Feed plaintext from memory to stdin only.
4. Restore password-free roles/memberships first. Explicitly handle the initial
   local postgres role collision; do not discard other restore errors.
5. Pipe authenticated decrypted custom archive to native pg_restore:
   `--host=127.0.0.1 --port=<isolated-port> --username=<local-owner>
   --dbname=<empty-local-db> --exit-on-error --single-transaction`.
   Credentials must be local, never production. The output/error stream stays
   encrypted or private; never print customer/auth rows or password hashes.
6. Require exit 0 and verify catalog counts, migration versions, roles, public
   function definitions, grants/RLS, FK validation, and inventory/payment totals
   using aggregate/catalog queries. Compare with the archive and a read-only
   production baseline, noting any data changes since the dump snapshot.
7. Managed extensions/platform-owned Auth/Storage objects may not restore into
   vanilla PostgreSQL. If dependencies are unavailable, report the exact failed
   objects and keep deployment blocked until an equivalent isolated recovery
   target or explicitly scoped, demonstrated application recovery is available.
8. Stop the isolated server and remove its precisely identified encrypted test
   directory only after verification. Retain encrypted backup and passphrase.

## Coordinated cutover — prepared, not executed

There must be no ordinary `db push` exposing 012/013 before maintenance exists.
The prepared SQL assembler validates and removes only the outer transaction
wrappers, then applies **012 -> 013 -> 014** under one transaction and access-
exclusive table locks. It records each original body in the migration ledger,
activates maintenance before COMMIT, and requests PostgREST schema reload.
Any failure rolls back all three schemas and ledger entries. Lock/statement
timeouts fail closed. Migrations 012/013 themselves remain unchanged.

1. Require an encrypted production backup and actual recovery verification first.
2. Verify provider endpoint remains ENABLED, non-2xx retention/retry/replay works,
   and retain the cutover-window event IDs through the provider's own tooling.
   Never disable the endpoint; events created during disablement may be omitted.
3. Deploy the complete webhook bundle first, then create/status and queue worker.
   While 014 RPCs are missing, signed webhook storage and checkout checks return
   non-2xx, so they do not falsely acknowledge success. The provider must retain
   and retry this short interval; confirm it before execution. Drain old in-flight
   function requests and retain/reconcile the deployment-window provider history.
4. Execute only the generated atomic release SQL against the checked production
   reference. It commits all three migrations with checkout/financial gates ON.
5. Verify schema, migration ledger, RLS, grants, triggers, function bundles and
   configuration metadata. Publish the approved frontend, excluding unrelated work.
6. Install a recurring worker invocation before reopening traffic. Prepared
   `scripts/schedule-webhook-inbox.sql` uses pg_cron/pg_net and a Vault reference to
   the existing service key, never a literal key. Secure credential provisioning,
   extension availability, permissions, and actual job execution need approval
   and hosted verification; none is configured by these local changes.
7. Call service-only `resume_xpay_webhook_processing()` to let existing payments
   process while new checkout remains blocked. Run the worker until pending=0;
   account for lease expiry/backoff and inspect repeated failures privately.
   Reconcile/replay retained provider events from the pre-inbox deployment window.
8. Require non-sensitive catalog/order/payment invariants, healthy worker/job runs,
   frontend version checks, and an empty reconciled backlog; then call
   `set_checkout_maintenance(false)`. Never test by creating a production payment.

Failure recovery: keep gates closed. Before migration COMMIT, SQL rollback is
automatic. After COMMIT, do not blindly deploy old functions or run down-migrations.
Retain the inbox/provider events and use a reviewed forward fix; if restoration is
necessary, first preserve events and reconcile payments arriving after the backup.
Never reset the project or overwrite newer financial state from an old snapshot.
