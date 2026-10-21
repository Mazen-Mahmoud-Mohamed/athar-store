# Run in your own PowerShell 7 terminal. Never enter credentials into chat.
# Only child-process environment carries secrets. No password is written to disk.
#Requires -Version 7.0
$ErrorActionPreference = 'Stop'
$confirmation = Read-Host 'Type BACKUP rotcgsayspiphcisepmu to authorize the read-only dump'
if ($confirmation -cne 'BACKUP rotcgsayspiphcisepmu') { throw 'Cancelled' }
$bin = 'D:\work\athar-pg17-client\pgsql\bin'
foreach ($name in @('pg_dump.exe','pg_dumpall.exe','pg_restore.exe','psql.exe')) {
  if (-not (Test-Path -LiteralPath (Join-Path $bin $name))) { throw "Missing native tool: $name" }
}
if ((Get-PSDrive D).Free -lt 2GB) { throw 'Insufficient D: space' }
& (Get-Command node.exe -ErrorAction Stop).Source (Join-Path $PSScriptRoot 'backup-preflight.mjs')
if ($LASTEXITCODE -ne 0) { throw 'TLS preflight failed before password entry; do not run the dump' }
$databasePassword = Read-Host 'Production database password (hidden)' -AsSecureString
$encryptionPassphrase = Read-Host 'NEW backup encryption passphrase, at least 16 characters; save it in your password manager (hidden)' -AsSecureString
$confirmPassphrase = Read-Host 'Confirm backup encryption passphrase (hidden)' -AsSecureString
$plainPassphrase = [System.Net.NetworkCredential]::new('', $encryptionPassphrase).Password
if ($plainPassphrase.Length -lt 16 -or $plainPassphrase -cne [System.Net.NetworkCredential]::new('', $confirmPassphrase).Password) { throw 'Passphrases do not match or are too short' }
$backupDirectory = Join-Path 'D:\work\athar-backups' ([DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N').Substring(0,8))
New-Item -ItemType Directory -Path $backupDirectory -ErrorAction Stop | Out-Null
$sid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
& icacls.exe $backupDirectory '/inheritance:r' '/grant:r' "*$($sid):(OI)(CI)F" | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Failed to restrict backup directory ACL' }
# Supabase's private root is absent from Windows public trust roots. Pin the
# public CA downloaded via HTTPS from Supabase's certificate distribution bucket.
$certificatePath = Join-Path $PSScriptRoot 'certs\supabase-root-2021.crt'
$certificate = [Security.Cryptography.X509Certificates.X509Certificate2]::new($certificatePath)
$fingerprint = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($certificate.RawData))
if ($fingerprint -cne '807025AD50D4ED219D2C9C7D299C004F824EB00CF7F65AFEF607D07B72E6CAFA' -or
    $certificate.NotAfter.ToUniversalTime() -le [DateTime]::UtcNow -or
    $certificate.NotBefore.ToUniversalTime() -gt [DateTime]::UtcNow) { throw 'Supabase CA pin or validity check failed' }
Copy-Item -LiteralPath $certificatePath -Destination (Join-Path $backupDirectory 'trusted-roots.pem') -ErrorAction Stop
$start = [Diagnostics.ProcessStartInfo]::new()
$start.FileName = (Get-Command node.exe -ErrorAction Stop).Source
$start.ArgumentList.Add((Join-Path $PSScriptRoot 'backup-production.mjs'))
$start.UseShellExecute = $false
$start.Environment['ATHAR_BACKUP_DIRECTORY'] = $backupDirectory
$start.Environment['ATHAR_BACKUP_DB_PASSWORD'] = [System.Net.NetworkCredential]::new('', $databasePassword).Password
$start.Environment['ATHAR_BACKUP_PASSPHRASE'] = $plainPassphrase
try {
  $process = [Diagnostics.Process]::Start($start)
  $start.Environment.Remove('ATHAR_BACKUP_DB_PASSWORD') | Out-Null
  $start.Environment.Remove('ATHAR_BACKUP_PASSPHRASE') | Out-Null
  $plainPassphrase = $null
  $process.WaitForExit()
  if ($process.ExitCode -ne 0) { throw 'Backup failed; release remains blocked' }
} finally {
  $start.Environment.Remove('ATHAR_BACKUP_DB_PASSWORD') | Out-Null
  $start.Environment.Remove('ATHAR_BACKUP_PASSPHRASE') | Out-Null
  $databasePassword.Dispose(); $encryptionPassphrase.Dispose(); $confirmPassphrase.Dispose()
  $plainPassphrase = $null
}
