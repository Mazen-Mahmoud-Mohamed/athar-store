# Backup failure diagnosis — 22 October 2026

No migrations, deployments, credential resets, or production data changes occurred.

## Evidence

- Failed directory: `D:\work\athar-backups\20261021-220054-b1c9b243`.
- `database.dump.enc`: 75 bytes, exactly the envelope header/salt/IV/tag for an
  empty stream. No database archive content exists. Encrypted diagnostics: 227
  bytes. No success manifest exists. Preserve these files; never restore them.
- Original diagnostics remain encrypted; their passphrase is not available to
  the agent. The original wrapper also discarded the native exit code. Neither
  historic value is fabricated or inferred from a PowerShell exception.
- Reproducing the exact pg_dump arguments with the original CA bundle and no
  password produced native **exit 1**, **zero stdout bytes**, and the safe error
  `SSL error: certificate verify failed` before password authentication.
- The original bundle exported Windows public roots; it omitted Supabase's
  private root. A Node TLS probe independently returned SELF_SIGNED_CERT_IN_CHAIN.
- Using Supabase Root 2021 CA with `sslmode=verify-full` reaches the password
  challenge (`fe_sendauth: no password supplied`). This verifies strict TLS and
  hostname matching; it does NOT validate the owner's password or dump privileges.

## Fix and provenance

Public CA source, downloaded over validated HTTPS:
https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt

Certificate identity: Supabase Root 2021 CA, Supabase Inc. Valid through 26 April
2031. SHA-256 DER fingerprint:
`807025AD50D4ED219D2C9C7D299C004F824EB00CF7F65AFEF607D07B72E6CAFA`.

The source is pinned in `scripts/certs/supabase-root-2021.crt`. The wrapper checks
the fingerprint and validity dates, then runs a no-password preflight before
asking for credentials. It copies only this public CA into the private D: backup
directory. Hostname/CA verification stays enabled. No machine trust store changes
or TLS downgrades are made.

Official guidance:
https://supabase.com/docs/guides/platform/ssl-enforcement
https://supabase.com/docs/guides/database/psql

Native child supervision now captures exit codes and launch failures. Only fixed
error descriptions are printed or saved in safe status JSON. Raw stderr is
encrypted, including potentially sensitive SQL or identifiers. Partial archives
remain invalid; a success manifest is created only after all required stages pass.

## Targeted validation

- Production password-free strict TLS preflight: PASS. No SQL/data access.
- Failure code/category, diagnostic encryption, credential/identifier redaction:
  PASS using synthetic native child failures.
- Missing executable and safe authentication/permission/network/argument/disk
  categories: PASS.
- Real native PostgreSQL 17.11 pg_dump and password-free role dump: PASS on
  synthetic data only.
- Encryption authentication, full archive decode, tamper/wrong-key rejection,
  actual isolated pg_restore and aggregate comparison: PASS on synthetic data.
- JavaScript syntax, PowerShell parser and targeted lint: PASS.
- Existing 62 order/webhook groups were not unnecessarily rerun.

## Next action

Run `scripts/backup-production.ps1` in PowerShell 7. The database password and
backup encryption passphrase must be entered locally again: they were not retained.
Report only the resulting backup directory and safe status. Authentication,
production dump permissions and actual production-backup restore verification
remain pending until this succeeds. Release remains blocked until recovery and
hosted webhook cutover/scheduling checks pass.
