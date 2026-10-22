# Isolated database restore compatibility

Production role and parameter ACL restoration has passed. The subsequent native
pg_restore failure is still encrypted; its production-specific cause must not be
claimed until the open recovery session decrypts the existing diagnostic.

The next attempt authenticates and classifies that diagnostic before database
work. Output contains only fixed categories/messages, SQLSTATE when supplied by
the native error, a whitelisted object type and numeric TOC entry. SQL, names and
raw stderr remain encrypted. A child exit and EPIPE from a stopped input stream
are distinguished; a failed restore does not invalidate an integrity-checked
backup automatically.

Only one database bootstrap repair is implemented: if the native error proves
CREATE SCHEMA public collided with the fresh database's default schema, verify
the latter is empty and has expected bootstrap ownership, then DROP SCHEMA
without CASCADE. The failed single-transaction restore has rolled back. Replay
the original archive strictly, restoring its schema ownership and ACLs. Do not
use --no-owner, --no-acl, exclude schemas, disable RLS, or ignore restore errors.

Synthetic PostgreSQL 17.11 selected-schema backups reproduce this native error;
tests cover the guarded repair, prior encrypted diagnostics, role/parameter ACL
verification, database counts, unprivileged RLS and migration 012-014 rehearsal.
An unknown existing failure stops after diagnosis, before repeating the restore.

Standalone PostgreSQL does not automatically reproduce Supabase native extension
binaries or extension-specific platform objects, managed background services,
Auth runtime configuration, Storage object bytes, JWT/Edge secrets or Vault.
None is stubbed or silently excluded. A required missing extension/library or
dependency remains a specific blocker. This is an application database recovery
rehearsal, not proof of full Supabase infrastructure reconstruction.
