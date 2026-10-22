#Requires -Version 7.0
param(
  [string]$BackupDirectory = 'D:\work\athar-backups\20261021-222206-96ea5a10',
  [switch]$DiagnoseOnly,
  [switch]$RepairSession,
  [switch]$InspectRoleStructure
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
function New-PrivateRestoreDirectory {
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
return $restoreDirectory
}
$restoreDirectory=New-PrivateRestoreDirectory
$secret=Read-Host 'Existing backup encryption passphrase (hidden; do not enter the database password)' -AsSecureString
try {
while($true) {
$attemptId=[guid]::NewGuid().ToString('N')
$codeFiles=@('verify-production-backup.mjs','trace-role-restore.mjs','order-release-sql.mjs',
  '../supabase/migrations/20261020000012_order_inventory_and_payment_guards.sql',
  '../supabase/migrations/20261021000013_xpay_refund_event_ledger.sql',
  '../supabase/migrations/20261021000014_checkout_maintenance_and_webhook_inbox.sql') | ForEach-Object { Join-Path $PSScriptRoot $_ }
$codeHash=($codeFiles | ForEach-Object { (Get-FileHash -LiteralPath $_ -Algorithm SHA256).Hash }) -join ':'
$start=[Diagnostics.ProcessStartInfo]::new()
$start.FileName=(Get-Command node.exe -ErrorAction Stop).Source
$start.UseShellExecute=$false
$start.ArgumentList.Add('--import')
$start.ArgumentList.Add(([uri](Join-Path $PSScriptRoot 'use-pg1711.mjs')).AbsoluteUri)
$start.ArgumentList.Add((Join-Path $PSScriptRoot $(if($InspectRoleStructure){'inspect-role-structure.mjs'}elseif($DiagnoseOnly){'diagnose-restore-roles.mjs'}else{'verify-production-backup.mjs'})))
$start.Environment['ATHAR_RESTORE_DIRECTORY']=$restoreDirectory
$start.Environment['ATHAR_BACKUP_DIRECTORY']=$BackupDirectory
$start.Environment['ATHAR_BACKUP_PASSPHRASE']=[Net.NetworkCredential]::new('',$secret).Password
$start.Environment['ATHAR_RESTORE_ATTEMPT_ID']=$attemptId
$start.Environment['TEMP']=$restoreDirectory
$start.Environment['TMP']=$restoreDirectory
try {
  $process=[Diagnostics.Process]::Start($start)
  $start.Environment.Remove('ATHAR_BACKUP_PASSPHRASE') | Out-Null
  $process.WaitForExit()
  if($InspectRoleStructure) {
    if($process.ExitCode -ne 0) { throw 'Offline statement diagnosis failed; no database operation attempted.' }
    Write-Host 'Keep this window open. Share only the structural JSON above. No restoration has been attempted.'
    Write-Host 'After the exact syntax has been reviewed and fixed, type retry here. The existing passphrase remains only in this local session.'
    while($true) {
      $choice=Read-Host 'Type retry after the verified correction, or stop to dispose of the passphrase'
      if($choice -cne 'retry') { throw 'Diagnostic session stopped; no restoration or deployment performed.' }
      $newHash=($codeFiles | ForEach-Object { (Get-FileHash -LiteralPath $_ -Algorithm SHA256).Hash }) -join ':'
      if($newHash -cne $codeHash) { break }
      Write-Host 'Verifier code is unchanged; no restore was run. Session remains open for the correction.'
    }
    $InspectRoleStructure=$false
    $RepairSession=$true
    $restoreDirectory=New-PrivateRestoreDirectory
    continue
  }
  if($DiagnoseOnly) {
    if($process.ExitCode -ne 0) { throw 'Private restore diagnosis failed; no restore or production operation was attempted.' }
    return
  }
  $report=Get-Content -LiteralPath (Join-Path $BackupDirectory 'restore-verification.json') -Raw | ConvertFrom-Json
  if($report.attemptId -cne $attemptId) { throw 'No report from this attempt; stale results rejected. Do not deploy.' }
  if($process.ExitCode -ne 0 -or -not $report.actualRestore -or -not $report.isolatedMigrationRehearsal -or -not $report.temporaryDataRemoved) {
    if($RepairSession) {
      Write-Host 'Repair session paused. Share only the SAFE failure JSON printed above. Do not share encrypted diagnostics or passphrases.'
      Write-Host 'The passphrase remains in this local process only. After the local correction, type retry here; no second passphrase entry is needed.'
      while($true) {
        $choice=Read-Host 'Type retry after the correction, or stop to dispose of the passphrase'
        if($choice -cne 'retry') { break }
        $newHash=($codeFiles | ForEach-Object { (Get-FileHash -LiteralPath $_ -Algorithm SHA256).Hash }) -join ':'
        if($newHash -cne $codeHash) { break }
        Write-Host 'Verifier code is unchanged; refusing to repeat the same failing attempt. Session remains open.'
      }
      if($choice -ceq 'retry') {
          $restoreDirectory=New-PrivateRestoreDirectory
          continue
      }
    }
    throw 'Isolated recovery verification failed. Do not deploy. See safe restore-verification.json in the backup directory.'
  }
  break
} finally {
  $start.Environment.Remove('ATHAR_BACKUP_PASSPHRASE') | Out-Null
}
}
} finally {
  $secret.Dispose()
}
