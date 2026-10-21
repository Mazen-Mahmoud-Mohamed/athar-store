-- PREPARED ONLY: execute after deployment approval. Never disable the provider endpoint.
-- Requires existing pg_cron, pg_net, and Vault plus a securely entered Vault secret
-- named athar_webhook_worker_service_key containing this project's existing service key.
-- No credential value belongs in this file, shell history, a migration, or application logs.
begin;
do $$begin
  if to_regnamespace('cron') is null or to_regnamespace('net') is null
     or to_regclass('vault.decrypted_secrets') is null then
    raise exception 'QUEUE_SCHEDULER_PREREQUISITES_MISSING';
  end if;
  if (select count(*) from vault.decrypted_secrets where name='athar_webhook_worker_service_key') <> 1 then
    raise exception 'QUEUE_SCHEDULER_CREDENTIAL_NOT_PROVISIONED';
  end if;
  if exists(select 1 from cron.job where jobname='athar-webhook-inbox') then
    raise exception 'QUEUE_SCHEDULER_ALREADY_EXISTS';
  end if;
end$$;
select cron.schedule('athar-webhook-inbox','* * * * *',$job$
  select net.http_post(
    url := 'https://rotcgsayspiphcisepmu.supabase.co/functions/v1/xpay-process-webhook-inbox',
    headers := jsonb_build_object('Content-Type','application/json','Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='athar_webhook_worker_service_key')),
    body := '{}'::jsonb, timeout_milliseconds := 60000
  );
$job$);
commit;
