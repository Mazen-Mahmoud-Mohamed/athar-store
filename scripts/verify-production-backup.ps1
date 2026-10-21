#Requires -Version 7.0
param(
  [string]$BackupDirectory = 'D:\work\athar-backups\20261021-222206-96ea5a10',
  [switch]$DiagnoseOnly
)
$ErrorActionPreference='Stop'
$BackupDirectory=[IO.Path]::GetFullPath($BackupDirectory)
if($BackupDirectory -notmatch '^D:\\work\\athar-backups\\[A-Za-z0-9-]+$') { throw 'Unexpected backup directory' }
$manifest=Get-Content -Raw -LiteralPath (Join-Path $BackupDirectory 'backup-manifest.json') | ConvertFrom-Json
$status=Get-Content -Raw -LiteralPath (Join-Path $BackupDirectory 'backup-status.json') | ConvertFrom-Json
if($manifest.projectRef -cne 'rotcgsayspiphcisepmu' -or -not $status.complete) { throw 'Backup identity/completion check failed' }
foreach($entry in @($manifest.archive,$manifest.roles)) {
  if($entry.file -notin @('database.dump.enc','roles.sql.enc')) { throw 'Unexpected archive path' }
  $hash=(Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $BackupDirectory $entry.file)).Hash.ToLowerInvariant()
  if($hash -cne $entry.sha256) { throw 'Encrypted backup checksum mismatch; stop' }
}
if((Get-PSDrive D).Free -lt 2GB) { throw 'Insufficient D: space for isolated restore' }
$restoreDirectory=Join-Path 'D:\work\athar-restore-checks' ([guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $restoreDirectory | Out-Null
$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
& icacls.exe $restoreDirectory '/inheritance:r' '/grant:r' "*$($sid):(OI)(CI)F" | Out-Null
if($LASTEXITCODE -ne 0) { throw 'Failed to restrict isolated restore directory ACL' }
# EFS must succeed BEFORE any production content is decrypted onto this volume.
& 'C:\Windows\System32\cipher.exe' '/e' '/a' $restoreDirectory | Out-Null
if($LASTEXITCODE -ne 0 -or -not ((Get-Item -LiteralPath $restoreDirectory).Attributes -band [IO.FileAttributes]::Encrypted)) {
  throw 'EFS encryption unavailable. No production data has been restored. An encrypted restore volume is required.'
}
$probe=Join-Path $restoreDirectory 'encryption-probe.txt'
[IO.File]::WriteAllText($probe,'Synthetic encryption inheritance probe')
if(-not ((Get-Item -LiteralPath $probe).Attributes -band [IO.FileAttributes]::Encrypted)) { throw 'EFS inheritance check failed' }
Remove-Item -LiteralPath $probe
$secret=Read-Host 'Existing backup encryption passphrase (hidden; do not enter the database password)' -AsSecureString
$start=[Diagnostics.ProcessStartInfo]::new()
$start.FileName=(Get-Command node.exe -ErrorAction Stop).Source
$start.UseShellExecute=$false
$start.ArgumentList.Add('--import')
$start.ArgumentList.Add(([uri](Join-Path $PSScriptRoot 'use-pg1711.mjs')).AbsoluteUri)
$start.ArgumentList.Add((Join-Path $PSScriptRoot $(if($DiagnoseOnly){'diagnose-restore-roles.mjs'}else{'verify-production-backup.mjs'})))
$start.Environment['ATHAR_RESTORE_DIRECTORY']=$restoreDirectory
$start.Environment['ATHAR_BACKUP_DIRECTORY']=$BackupDirectory
$start.Environment['ATHAR_BACKUP_PASSPHRASE']=[Net.NetworkCredential]::new('',$secret).Password
$start.Environment['TEMP']=$restoreDirectory
$start.Environment['TMP']=$restoreDirectory
try {
  $process=[Diagnostics.Process]::Start($start)
  $start.Environment.Remove('ATHAR_BACKUP_PASSPHRASE') | Out-Null
  $process.WaitForExit()
  if($DiagnoseOnly) {
    if($process.ExitCode -ne 0) { throw 'Private restore diagnosis failed; no restore or production operation was attempted.' }
    return
  }
  $report=Get-Content -LiteralPath (Join-Path $BackupDirectory 'restore-verification.json') -Raw | ConvertFrom-Json
  if($process.ExitCode -ne 0 -or -not $report.actualRestore -or -not $report.isolatedMigrationRehearsal -or -not $report.temporaryDataRemoved) {
    throw 'Isolated recovery verification failed. Do not deploy. See safe restore-verification.json in the backup directory.'
  }
} finally {
  $start.Environment.Remove('ATHAR_BACKUP_PASSPHRASE') | Out-Null
  $secret.Dispose()
}
