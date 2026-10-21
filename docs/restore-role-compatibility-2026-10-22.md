# Isolated application recovery compatibility

The latest actual-backup report contains ERR_ASSERTION at restore_roles, not a
PostgreSQL SQLSTATE. The previous compatibility parser failed before executing
the SQL. Its exact assertion is still encrypted; do not claim a particular source
statement caused that assertion without evidence.

A separate concrete defect in the previous rewrite was reproduced on PostgreSQL
17.11: explicit GRANTED BY naming a superuser can fail with 42501/check_role_grantor
when that named grantor lacks the required ADMIN membership. The new executor
uses the isolated bootstrap superuser's implicit grantor, without extra grants
to application roles. All role declarations, attributes, settings, ownership,
database ACLs and RLS are restored without skipping failed statements.

The SQL lexer handles comments, multiline quoted strings, quoted semicolons and
pg_dump restrict directives. Each executed statement has a source line, index,
fixed operation type and hash. Failures expose only those fields, SQLSTATE,
fixed reason and server routine. Raw statement/error details are encrypted with
the existing backup passphrase; they are never printed or written as plaintext.

Original membership statements are probed in savepoints and rolled back. Only
the known 42501 grantor incompatibility is eligible for normalization. Multiple
grantors on one role/member pair are explicitly combined using the union of
their ADMIN, INHERIT and SET options. The resulting effective options are checked
against pg_auth_members. Grantor-specific revocation provenance is not recreated.
Unsupported syntax or unrelated SQL errors stop the attempt with exact location.

Synthetic validation covers CREATE/ALTER failures with exact SQLSTATE and source
location, full rollback, a failing grantor probe, distinct grantors with different
options, actual encrypted database restore, unprivileged RLS, migration 012-014
rehearsal, and EFS temporary-directory cleanup on PostgreSQL 17.11.

Run verify-production-backup.ps1 -RepairSession. The wrapper prompts for the
existing encryption passphrase once and retains its SecureString only in the
local parent process. A diagnostic stop leaves that session open for a local
correction and retry in a fresh isolated cluster; unchanged-code retries are
refused. Attempt IDs reject stale reports. No database password is needed.

This is application recovery, not full Supabase infrastructure recovery. Storage
object bytes, platform configuration, Auth settings and Edge secrets must remain
preserved in the existing project. The production archive has not yet passed
this corrected verifier; the owner must unlock it locally. No production write
is permitted until actual recovery and webhook cutover safeguards pass.
