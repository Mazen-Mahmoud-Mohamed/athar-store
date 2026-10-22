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
  $process=New-CliProcess @('projects','api-keys','--project-ref',$ref,'--output','json')
  $stdout=$process.StandardOutput.ReadToEndAsync();$stderr=$process.StandardError.ReadToEndAsync()
  $process.WaitForExit()
  if($process.ExitCode -ne 0){throw 'Could not obtain existing worker credential; no values logged'}
  $keys=$stdout.Result | ConvertFrom-Json
  $key=@($keys | Where-Object {$_.name -ceq 'service_role'})
  if($key.Count -ne 1 -or $key[0].api_key -notmatch '^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$'){throw 'Expected legacy service-role credential missing'}
  $value=$key[0].api_key
  $part=$value.Split('.')[1].Replace('-','+').Replace('_','/')
  $part=$part.PadRight($part.Length+(4-$part.Length%4)%4,'=')
  $claims=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($part)) | ConvertFrom-Json
  if($claims.ref -cne $ref -or $claims.role -cne 'service_role'){throw 'Worker credential project/role mismatch'}
  return $value
}
switch($Action) {
  Preflight {Invoke-PrivateSql "select current_setting('server_version') as version,(select json_agg(version order by version) from supabase_migrations.schema_migrations) as migrations,current_setting('shared_preload_libraries') like '%pg_cron%' as cron_preloaded,(select count(*) from vault.secrets where name='athar_webhook_worker_service_key') as worker_vault_entries;" | ConvertTo-Json -Depth 8}
  SchedulerPrerequisites {Invoke-PrivateSql "begin; create extension if not exists pg_cron with schema pg_catalog; create extension if not exists pg_net with schema extensions; revoke all on net.http_request_queue,net._http_response from public,anon,authenticated; commit; select extname,extversion from pg_extension where extname in ('pg_cron','pg_net');" | ConvertTo-Json -Depth 8}
  WorkerCredential {
    $key=Get-WorkerKey
    try {
      # Key travels only in a current-user-only pipe, never a file or process argument.
      $sql="do `$`$ begin if exists(select 1 from vault.secrets where name='athar_webhook_worker_service_key') then if not exists(select 1 from vault.decrypted_secrets where name='athar_webhook_worker_service_key' and decrypted_secret='$key') then raise exception 'WORKER_VAULT_CONFLICT'; end if; else perform vault.create_secret('$key','athar_webhook_worker_service_key','Athar scheduled webhook inbox processor'); end if; end `$`$; select count(*) as worker_credential_entries from vault.secrets where name='athar_webhook_worker_service_key';"
      Invoke-PrivateSql $sql | ConvertTo-Json -Depth 8
    } finally {$key=$null;$sql=$null}
  }
  Migrations {
    $sql=& node (Join-Path $PSScriptRoot 'order-release-sql.mjs')
    if($LASTEXITCODE -ne 0){throw 'Atomic release SQL generation failed'}
    Invoke-PrivateSql ($sql -join "`n") | ConvertTo-Json -Depth 8
  }
  Schedule {Invoke-PrivateSql (Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'schedule-webhook-inbox.sql')) | ConvertTo-Json -Depth 8}
  Health {
    Invoke-PrivateSql "select jobid,jobname,schedule,active from cron.job where jobname='athar-webhook-inbox'; select status,count(*) from cron.job_run_details where jobid in (select jobid from cron.job where jobname='athar-webhook-inbox') group by status; select id,status_code,timed_out,error_msg is not null as transport_error from net._http_response order by id desc limit 5; select public.xpay_webhook_queue_status() as queue; select checkout_maintenance,financial_maintenance from public.release_controls;" | ConvertTo-Json -Depth 12
  }
  ResumeProcessing {Invoke-PrivateSql 'select public.resume_xpay_webhook_processing(); select checkout_maintenance,financial_maintenance from public.release_controls;' | ConvertTo-Json -Depth 8}
  Drain {
    $key=Get-WorkerKey
    try {
      $result=Invoke-RestMethod -Method Post -Uri "https://$ref.supabase.co/functions/v1/xpay-process-webhook-inbox" -Headers @{Authorization="Bearer $key"} -ContentType 'application/json' -Body '{}' -TimeoutSec 75
      $result | ConvertTo-Json -Depth 10
    } catch {throw 'Worker request failed; raw response and credentials withheld. Keep checkout closed and inspect scheduler/queue status.'} finally {$key=$null}
  }
  Reopen {Invoke-PrivateSql "begin; do `$`$ begin if exists(select 1 from public.xpay_webhook_inbox where state<>'processed') then raise exception 'WEBHOOK_BACKLOG_NOT_EMPTY'; end if; end `$`$; select public.set_checkout_maintenance(false); commit; select checkout_maintenance,financial_maintenance from public.release_controls;" | ConvertTo-Json -Depth 8}
  Snapshot {Invoke-PrivateSql "select (select count(*) from public.products) as products,(select count(*) from public.categories) as categories,(select count(*) from public.profiles where role='admin') as admins,(select count(*) from public.orders) as orders,(select count(*) from public.order_items) as items,(select count(*) from public.payments) as payments,(select sum(stock_quantity) from public.products) as stock,(select count(*) from storage.objects) as storage_objects;" | ConvertTo-Json -Depth 8}
}
