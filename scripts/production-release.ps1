#Requires -Version 7.0
param([Parameter(Mandatory)][ValidateSet('Preflight','SchedulerPrerequisites','WorkerCredential','Migrations','Schedule','Health','ResumeProcessing','Drain','Reopen','Snapshot')][string]$Action)
$ErrorActionPreference='Stop'
$ref='rotcgsayspiphcisepmu'
$repo=Split-Path $PSScriptRoot -Parent
if((Get-Content -Raw -LiteralPath (Join-Path $repo 'supabase/.temp/project-ref')).Trim() -cne $ref){throw 'Production reference mismatch'}
$recovery=Get-Content -Raw -LiteralPath 'D:\work\athar-backups\20261021-222206-96ea5a10\restore-verification.json' | ConvertFrom-Json
if(-not $recovery.actualRestore -or -not $recovery.isolatedMigrationRehearsal -or -not $recovery.temporaryDataRemoved -or $recovery.projectRef -cne $ref){throw 'Verified recovery prerequisite missing'}
$cli=Join-Path $env:APPDATA 'npm/node_modules/supabase/dist/supabase.js'
function New-CliProcess([string[]]$Arguments) {
  $start=[Diagnostics.ProcessStartInfo]::new((Get-Command node.exe).Source)
  $start.UseShellExecute=$false; $start.RedirectStandardOutput=$true; $start.RedirectStandardError=$true; $start.WorkingDirectory=$repo
  $start.ArgumentList.Add($cli)
  foreach($value in $Arguments){$start.ArgumentList.Add($value)}
  return [Diagnostics.Process]::Start($start)
}
function Invoke-PrivateSql([string]$Sql) {
  if((Get-Content -Raw -LiteralPath (Join-Path $repo 'supabase/.temp/project-ref')).Trim() -cne $ref){throw 'Project reference changed'}
  $pipeName='athar-release-'+[guid]::NewGuid().ToString('N')
  $pipe=[IO.Pipes.NamedPipeServerStream]::new($pipeName,[IO.Pipes.PipeDirection]::Out,1,[IO.Pipes.PipeTransmissionMode]::Byte,[IO.Pipes.PipeOptions]::Asynchronous -bor [IO.Pipes.PipeOptions]::CurrentUserOnly)
  $connected=$pipe.WaitForConnectionAsync()
  $process=New-CliProcess @('db','query','--linked','--project-ref',$ref,'--output','json','--file',('\\.\pipe\'+$pipeName))
  $stdout=$process.StandardOutput.ReadToEndAsync();$stderr=$process.StandardError.ReadToEndAsync()
  try {
    if(-not $connected.Wait(20000)){if(-not $process.HasExited){$process.Kill($true)};throw 'Private SQL pipe failed'}
    $writer=[IO.StreamWriter]::new($pipe,[Text.UTF8Encoding]::new($false))
    $writer.Write($Sql);$writer.Flush();$writer.Dispose()
    if(-not $process.WaitForExit(90000)){$process.Kill($true);throw 'Production SQL timed out; inspect state before retry'}
    if($process.ExitCode -ne 0){throw 'Production SQL failed. Raw CLI diagnostics withheld because they may contain SQL or credentials. Inspect production state before retry.'}
    return ($stdout.Result | ConvertFrom-Json)
  } finally {$pipe.Dispose();$process.Dispose()}
}
function Get-WorkerKey {
  $result=Invoke-PrivateSql "select decrypted_secret as worker_token from vault.decrypted_secrets where name='athar_webhook_worker_service_key';"
  if($result.rows.Count -ne 1 -or $result.rows[0].worker_token -notmatch '^[a-f0-9]{64}$'){throw 'Dedicated worker credential unavailable; no value logged'}
  return $result.rows[0].worker_token
}
function Set-PrivateWorkerSecret([string]$Value) {
  # The CLI env-file loader rejects named pipes. Encrypt the directory BEFORE
  # creating the token file; EFS plus the current-user ACL protects it at rest.
  $directory=Join-Path 'D:\work\athar-release-secrets' ([guid]::NewGuid().ToString('N'))
  $directory=[IO.Path]::GetFullPath($directory)
  if($directory -notmatch '^D:\\work\\athar-release-secrets\\[a-f0-9]{32}$'){throw 'Unexpected private secret directory'}
  New-Item -ItemType Directory -Path $directory | Out-Null
  $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  & icacls.exe $directory '/inheritance:r' '/grant:r' "*$($sid):(OI)(CI)F" | Out-Null
  if($LASTEXITCODE -ne 0){throw 'Private token directory ACL failed'}
  & 'C:\Windows\System32\cipher.exe' '/e' '/a' $directory | Out-Null
  if($LASTEXITCODE -ne 0 -or -not ((Get-Item -LiteralPath $directory).Attributes -band [IO.FileAttributes]::Encrypted)){throw 'Token directory is not EFS encrypted'}
  $file=Join-Path $directory 'worker.env'
  try {
    [IO.File]::WriteAllText($file,"ATHAR_WEBHOOK_WORKER_KEY=$Value`n",[Text.UTF8Encoding]::new($false))
    if(-not ((Get-Item -LiteralPath $file).Attributes -band [IO.FileAttributes]::Encrypted)){throw 'Token file did not inherit EFS encryption'}
    $process=New-CliProcess @('secrets','set','--project-ref',$ref,'--env-file',$file)
    $stdout=$process.StandardOutput.ReadToEndAsync();$stderr=$process.StandardError.ReadToEndAsync()
    if(-not $process.WaitForExit(60000)){$process.Kill($true);throw 'Worker token configuration timed out'}
    if($process.ExitCode -ne 0){throw 'Worker token configuration failed; raw output withheld'}
  } finally {
    if(Test-Path -LiteralPath $file){Remove-Item -LiteralPath $file}
    Remove-Item -LiteralPath $directory
  }
}
switch($Action) {
  Preflight {Invoke-PrivateSql "select current_setting('server_version') as version,(select json_agg(version order by version) from supabase_migrations.schema_migrations) as migrations,current_setting('shared_preload_libraries') like '%pg_cron%' as cron_preloaded,(select count(*) from vault.secrets where name='athar_webhook_worker_service_key') as worker_vault_entries;" | ConvertTo-Json -Depth 8}
  SchedulerPrerequisites {Invoke-PrivateSql "begin; create extension if not exists pg_cron with schema pg_catalog; create extension if not exists pg_net with schema extensions; revoke all on net.http_request_queue,net._http_response from public,anon,authenticated; commit; select extname,extversion from pg_extension where extname in ('pg_cron','pg_net');" | ConvertTo-Json -Depth 8}
  WorkerCredential {
    $existing=Invoke-PrivateSql "select decrypted_secret as worker_token from vault.decrypted_secrets where name='athar_webhook_worker_service_key';"
    $key=if($existing.rows.Count -eq 1 -and $existing.rows[0].worker_token -match '^[a-f0-9]{64}$'){$existing.rows[0].worker_token}else{[Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).ToLowerInvariant()}
    try {
      # Key travels only in a current-user-only pipe, never a file or process argument.
      Set-PrivateWorkerSecret $key
      $sql="do `$`$ declare v_id uuid; begin select id into v_id from vault.secrets where name='athar_webhook_worker_service_key'; if v_id is not null then perform vault.update_secret(v_id,'$key'); else perform vault.create_secret('$key','athar_webhook_worker_service_key','Dedicated Athar webhook worker token'); end if; end `$`$; select count(*) as worker_credential_entries from vault.secrets where name='athar_webhook_worker_service_key';"
      Invoke-PrivateSql $sql | ConvertTo-Json -Depth 8
    } finally {$key=$null;$sql=$null;$existing=$null}
  }
  Migrations {
    $sql=& node (Join-Path $PSScriptRoot 'order-release-sql.mjs')
    if($LASTEXITCODE -ne 0){throw 'Atomic release SQL generation failed'}
    Invoke-PrivateSql ($sql -join "`n") | ConvertTo-Json -Depth 8
  }
  Schedule {Invoke-PrivateSql (Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'schedule-webhook-inbox.sql')) | ConvertTo-Json -Depth 8}
  Health {
    Invoke-PrivateSql "select jsonb_build_object('jobs',(select jsonb_agg(j) from (select jobid,jobname,schedule,active from cron.job where jobname='athar-webhook-inbox') j),'runs',(select jsonb_agg(r) from (select status,count(*) from cron.job_run_details where jobid in (select jobid from cron.job where jobname='athar-webhook-inbox') group by status) r),'http',(select jsonb_agg(h) from (select id,status_code,timed_out,error_msg is not null as transport_error from net._http_response order by id desc limit 5) h),'queue',public.xpay_webhook_queue_status(),'maintenance',(select row_to_json(c) from (select checkout_maintenance,financial_maintenance from public.release_controls) c)) as health;" | ConvertTo-Json -Depth 16
  }
  ResumeProcessing {Invoke-PrivateSql 'select public.resume_xpay_webhook_processing(); select checkout_maintenance,financial_maintenance from public.release_controls;' | ConvertTo-Json -Depth 8}
  Drain {
    $key=Get-WorkerKey
    try {
      $result=Invoke-RestMethod -Method Post -Uri "https://$ref.supabase.co/functions/v1/xpay-process-webhook-inbox" -Headers @{Authorization="Bearer $key"} -ContentType 'application/json' -Body '{}' -TimeoutSec 75 -SkipHttpErrorCheck -StatusCodeVariable workerHttpStatus
      if($workerHttpStatus -ge 400) {
        $safeCode=if($result.error -in @('unauthorized','claim_failed','status_failed','unavailable','BOOT_ERROR','WORKER_ERROR')){$result.error}else{'unclassified'}
        Write-Output (@{http_status=[int]$workerHttpStatus;error=$safeCode}|ConvertTo-Json -Compress)
        throw 'Worker returned a non-success HTTP status'
      }
      $result | ConvertTo-Json -Depth 10
    } catch {throw 'Worker request failed; raw response and credentials withheld. Keep checkout closed and inspect scheduler/queue status.'} finally {$key=$null}
  }
  Reopen {Invoke-PrivateSql "begin; do `$`$ begin if exists(select 1 from public.xpay_webhook_inbox where state<>'processed') then raise exception 'WEBHOOK_BACKLOG_NOT_EMPTY'; end if; end `$`$; select public.set_checkout_maintenance(false); commit; select checkout_maintenance,financial_maintenance from public.release_controls;" | ConvertTo-Json -Depth 8}
  Snapshot {Invoke-PrivateSql "select (select count(*) from public.products) as products,(select count(*) from public.categories) as categories,(select count(*) from public.profiles where role='admin') as admins,(select count(*) from public.orders) as orders,(select count(*) from public.order_items) as items,(select count(*) from public.payments) as payments,(select sum(stock_quantity) from public.products) as stock,(select count(*) from storage.objects) as storage_objects;" | ConvertTo-Json -Depth 8}
}
