// Tests the real recovery verifier against a synthetic backup; never connects to Supabase.
import assert from 'node:assert/strict'
import path from 'node:path'
import net from 'node:net'
import { randomUUID, createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { execFileSync, spawn } from 'node:child_process'
import { once } from 'node:events'
import { fileURLToPath } from 'node:url'
import EmbeddedPostgres from 'embedded-postgres'
import { runEncryptedTool } from './backup-process.mjs'
import { compatibleRoles } from './restore-role-compatibility.mjs'
assert.throws(()=>compatibleRoles('GRANT unexpected SQL;','athar_isolated_restore_owner'))
assert.throws(()=>compatibleRoles('GRANT anon TO authenticated GRANTED BY postgres;\nGRANT anon TO authenticated GRANTED BY another;','athar_isolated_restore_owner'))
const syntheticPassphrase='synthetic-restore-test-only-passphrase'
const directory=await mkdtemp('D:/work/athar-test-temp/recovery-fixture-')
const backup=path.resolve('D:/work/athar-backups',`selftest-${randomUUID()}`)
const restoreRoot=path.resolve('D:/work/athar-restore-checks',randomUUID().replaceAll('-',''))
await mkdir(backup,{recursive:true}); await mkdir(restoreRoot,{recursive:true})
execFileSync('C:/Windows/System32/cipher.exe',['/e','/a',restoreRoot],{stdio:'ignore',windowsHide:true})
const probe=net.createServer()
await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve))
const port=probe.address().port
await new Promise(resolve=>probe.close(resolve))
const password=randomUUID()
const server=new EmbeddedPostgres({databaseDir:path.join(directory,'cluster'),port,user:'postgres',password,
  persistent:true,initdbFlags:['--encoding=UTF8'],postgresFlags:['-h','127.0.0.1'],onLog(){},onError(){}})
let db
try {
  await server.initialise(); await server.start()
  db=server.getPgClient('postgres','127.0.0.1'); await db.connect()
  await db.query(`create role anon;create role authenticated;create role service_role bypassrls;
    create role authenticator;create role supabase_auth_admin;create role supabase_storage_admin;
    create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to anon,authenticated,service_role;
    create schema storage;create table storage.buckets(id text);create table storage.objects(id uuid);
    create schema extensions;create schema supabase_migrations;
    create table supabase_migrations.schema_migrations(version text primary key,name text,statements text[]);`)
  // Platform bootstrap can leave a grantor that no longer has ADMIN authority.
  // A verbatim pg_dumpall replay cannot recreate that provenance on vanilla PG.
  await db.query(`create role managed_grantor superuser;
    set role managed_grantor;
    grant authenticated to authenticator with inherit false, set true;
    reset role; alter role managed_grantor nosuperuser;`)
  await assert.rejects(db.query('grant authenticated to authenticator with inherit false, set true granted by managed_grantor'),
    error=>error.code==='42501')
  for(const name of ['20261003000001_initial_schema','20261003000002_rls','20261003000004_guest_order_confirmation',
    '20261003000005_admin_order_status_workflow','20261004000008_xpay_payments','20261004000009_xpay_service_role_rpc_grants',
    '20261004000010_xpay_service_role_table_grants','20261004000011_xpay_service_role_order_read_grants']) {
    await db.query(await readFile(new URL(`../supabase/migrations/${name}.sql`,import.meta.url),'utf8'))
    await db.query('insert into supabase_migrations.schema_migrations(version,name) values($1,$2)',[name.split('_')[0],name])
  }
  const env={...process.env,PGPASSWORD:password}
  const local=['--host','127.0.0.1','--port',String(port),'--username','postgres','--no-password']
  await runEncryptedTool({executable:'D:/work/athar-pg17-client/pgsql/bin/pg_dump.exe',args:[...local,'--dbname','postgres','--format=custom'],env,
    output:path.join(backup,'database.dump.enc'),passphrase:syntheticPassphrase})
  await runEncryptedTool({executable:'D:/work/athar-pg17-client/pgsql/bin/pg_dumpall.exe',args:[...local,'--roles-only','--no-role-passwords'],env,
    output:path.join(backup,'roles.sql.enc'),passphrase:syntheticPassphrase})
  const item=async file=>{const bytes=await readFile(path.join(backup,file));return{file,sha256:createHash('sha256').update(bytes).digest('hex'),plaintextBytes:bytes.length-75}}
  await writeFile(path.join(backup,'backup-manifest.json'),JSON.stringify({projectRef:'rotcgsayspiphcisepmu',synthetic:true,
    archive:await item('database.dump.enc'),roles:await item('roles.sql.enc')}))
  const child=spawn(process.execPath,['--import',new URL('./use-pg1711.mjs',import.meta.url).href,
    fileURLToPath(new URL('./verify-production-backup.mjs',import.meta.url))],{env:{...process.env,ATHAR_BACKUP_DIRECTORY:backup,
      ATHAR_RESTORE_DIRECTORY:restoreRoot,ATHAR_BACKUP_PASSPHRASE:syntheticPassphrase,TEMP:restoreRoot,TMP:restoreRoot},windowsHide:true})
  const done=once(child,'close')
  child.stdout.on('data',chunk=>process.stdout.write(chunk));child.stderr.on('data',chunk=>process.stderr.write(chunk))
  const [code]=await done
  const report=JSON.parse(await readFile(path.join(backup,'restore-verification.json'),'utf8'))
  if(code!==0) { console.log(JSON.stringify({syntheticFailure:report})); throw new Error('Synthetic recovery verifier failed') }
  assert.equal(report.actualRestore,true);assert.equal(report.isolatedMigrationRehearsal,true);assert.equal(report.temporaryDataRemoved,true)
  assert.ok(report.roleCompatibility.membershipsVerified>=1)
  assert.match(report.unprivilegedRls,/^PASS:/)
  assert.deepEqual(report.rehearsedMigrations,['20261020000012','20261021000013','20261021000014'])
  console.log('PASS production recovery verifier: encrypted synthetic roles/data, real restore, invariants, atomic migration rehearsal, and EFS cleanup')
} finally {
  if(db)await db.end();await server.stop()
  assert.ok(directory.startsWith('D:/work/athar-test-temp/recovery-fixture-'))
  await rm(directory,{recursive:true,force:true,maxRetries:5,retryDelay:200})
  // Retain encrypted synthetic artifacts on failure for diagnosis; never touch real backups.
}
