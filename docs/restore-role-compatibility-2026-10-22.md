# Isolated application recovery compatibility

The existing production encrypted backup is preserved. The previously observed
native role replay exited with psql status 3; its original error remains encrypted.
Do not claim its exact SQL cause has been confirmed before decrypting diagnostics.

The standalone verifier now explicitly normalizes membership grantor provenance
to its unique local superuser. All original role declarations, attributes,
settings, membership ADMIN/INHERIT/SET options, database ownership, ACLs and RLS
remain in the restore. Unsupported membership syntax or duplicate memberships
with different grantors fail closed for review. Every normalized membership's
options are compared against pg_auth_members after the restore. No application
role is promoted to overcome a restore error.

This proves application recovery compatibility, not exact managed infrastructure
recovery or membership revocation provenance. Supabase infrastructure, Storage
object bytes, Auth configuration, Edge secrets and external provider settings
remain outside this logical recovery test and must be preserved in place.

The synthetic PostgreSQL 17.11 fixture models a bootstrap grantor that subsequently
lost superuser/ADMIN authority. Verbatim membership replay must fail with SQLSTATE
42501; normalized restore must pass with the original INHERIT false/SET true
membership, restored ownership and ACLs, unprivileged RLS checks, migration
012/013/014 rehearsal and EFS temporary-directory cleanup.

Production restore is still pending the owner's existing encryption passphrase.
Run verify-production-backup.ps1 normally; DiagnoseOnly is optional and is not
required to exercise the new compatibility bootstrap. Never enter a passphrase
in chat. No new backup, production SQL, functions or website deployment was
performed while preparing this change.
