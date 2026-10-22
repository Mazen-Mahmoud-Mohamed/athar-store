// This program has no production connection parameters. All SQL targets a new
// loopback-only PostgreSQL cluster on EFS; only encrypted files are read from backup.
import assert from 'node:assert/strict'
import path from 'node:path'
import net from 'node:net'
import { spawn, execFileSync } from 'node:child_process'
import { readFile, writeFile, lstat, rm, readdir } from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import { Readable, Writable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import EmbeddedPostgres from 'embedded-postgres'
import { decryptedBackup, verifyEncryptedBackup, encryptBackup } from './encrypted-backup.mjs'
import { waitForBackupChild, classifyBackupFailure } from './backup-process.mjs'
import { prepareReleaseSql } from './order-release-sql.mjs'
import { restoreRolesTraced, verifyTracedMemberships } from './trace-role-restore.mjs'
import { classifyRestoreFailure } from './restore-diagnostics.mjs'

const root=path.resolve(process.env.ATHAR_RESTORE_DIRECTORY ?? '')
const source=path.resolve(process.env.ATHAR_BACKUP_DIRECTORY ?? '')
const passphrase=process.env.ATHAR_BACKUP_PASSPHRASE
delete process.env.ATHAR_BACKUP_PASSPHRASE
assert.match(root,/^D:\\work\\athar-restore-checks\\[a-f0-9]{32}$/i)
assert.match(source,/^D:\\work\\athar-backups\\[A-Za-z0-9-]+$/i)
assert.ok(passphrase)
assert.ok(!(await lstat(root)).isSymbolicLink())
// Independently check EFS instead of trusting caller-supplied environment flags.
const attributes=Number(execFileSync('C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe',[
  '-NoProfile','-NonInteractive','-Command',`[int](Get-Item -LiteralPath '${root}').Attributes`,
],{encoding:'utf8',windowsHide:true}).trim())
assert.ok((attributes & 16384)!==0,'Restore directory must be EFS encrypted')
const bin='D:/work/athar-pg17-client/pgsql/bin'
const report={backupDirectory:source,projectRef:'rotcgsayspiphcisepmu',productionModified:false,
  attemptId:process.env.ATHAR_RESTORE_ATTEMPT_ID ?? null,
  actualRestore:false,isolatedMigrationRehearsal:false,temporaryDataRemoved:false,stage:'integrity'}
let server,client
const password=randomUUID()
async function native(tool,args,input) {
  const localEnv={...process.env}
  // Never inherit a service file, host override, production password, or TLS
  // setting when restoring into the explicit loopback-only verification cluster.
  for(const key of Object.keys(localEnv)) if(key.startsWith('PG')) delete localEnv[key]
  Object.assign(localEnv,{PGPASSWORD:password,PGSSLMODE:'disable',PGPASSFILE:path.join(root,'nonexistent-local-pgpass')})
  const child=spawn(path.join(bin,tool),args,{windowsHide:true,
    env:localEnv,stdio:['pipe','pipe','pipe']})
  const done=waitForBackupChild(child), errors=[]
  child.stderr.on('data',chunk=>errors.push(chunk))
  const streams=await Promise.allSettled([
    pipeline(input,child.stdin),pipeline(child.stdout,new Writable({write(chunk,encoding,callback){callback()}})),
  ])
  const status=await done
  if(status.exitCode!==0 || streams.some(result=>result.status==='rejected')) {
    const raw=Buffer.concat(errors)
    const diagnosticFile=raw.length?`restore-${Date.now()}.diagnostics.enc`:null
    if(diagnosticFile) await encryptBackup(Readable.from([raw]),path.join(source,diagnosticFile),passphrase)
    const failure=new Error('Native isolated restore failed')
    const pipelineCode=streams.find(result=>result.status==='rejected')?.reason?.code
    failure.safe={tool,...status,diagnosticFile,
      pipelineCode:['EPIPE','ERR_STREAM_PREMATURE_CLOSE','ERR_STREAM_DESTROYED'].includes(pipelineCode)?pipelineCode:null,
      ...(tool==='pg_restore.exe'?classifyRestoreFailure(raw.toString('utf8')):classifyBackupFailure(raw.toString('utf8')))}
    throw failure
  }
}
async function aggregateSnapshot() {
  const counts={}
  for(const table of ['public.products','public.categories','public.profiles','public.orders','public.order_items','public.payments','auth.users','storage.buckets','storage.objects']) {
    counts[table]=(await client.query(`select count(*)::text as count from ${table}`)).rows[0].count
  }
  const migrations=(await client.query('select version from supabase_migrations.schema_migrations order by version')).rows.map(row=>row.version)
  const inventory=(await client.query('select count(*)::text as products,coalesce(sum(stock_quantity),0)::text as total_stock,count(*) filter(where stock_quantity<0)::text as negative_stock from public.products')).rows[0]
  const payments=(await client.query('select status::text,count(*)::text as count from public.payments group by status order by status')).rows
  const admins=(await client.query("select count(*)::text as count from public.profiles where role='admin'")).rows[0].count
  const roles=(await client.query("select rolname,rolcanlogin,rolsuper,rolbypassrls from pg_roles where rolname in ('anon','authenticated','service_role','postgres','authenticator','supabase_auth_admin','supabase_storage_admin') order by rolname")).rows
  const constraints=(await client.query("select count(*)::text as validated_public_fks from pg_constraint c join pg_namespace n on n.oid=c.connamespace where n.nspname='public' and c.contype='f' and c.convalidated")).rows[0]
  return {counts,migrations,inventory,payments,admins,roles,constraints}
}
try {
  const manifest=JSON.parse(await readFile(path.join(source,'backup-manifest.json'),'utf8'))
  assert.equal(manifest.projectRef,report.projectRef)
  for(const item of [manifest.archive,manifest.roles]) {
    assert.ok(['database.dump.enc','roles.sql.enc'].includes(item.file))
    const file=path.join(source,item.file)
    assert.equal(createHash('sha256').update(await readFile(file)).digest('hex'),item.sha256)
    assert.equal(await verifyEncryptedBackup(file,passphrase),item.plaintextBytes)
  }
  report.integrity='PASS'
  // Use the passphrase already supplied by the open parent session to inspect
  // the previous native failure before repeating any failed database restore.
  let previous
  try {previous=JSON.parse(await readFile(path.join(source,'restore-verification.json'),'utf8'))}
  catch(error){if(error.code!=='ENOENT')throw error}
  if(previous&&['restore_database','diagnose_restore_database'].includes(previous.stage)&&!previous.actualRestore) {
    const files=(await readdir(source)).filter(file=>/^restore-\d+\.diagnostics\.enc$/.test(file)).sort()
    const file=previous.failure?.diagnosticFile ?? files.at(-1)
    assert.match(file ?? '',/^restore-\d+\.diagnostics\.enc$/)
    await verifyEncryptedBackup(path.join(source,file),passphrase)
    const chunks=[]
    for await(const chunk of decryptedBackup(path.join(source,file),passphrase))chunks.push(chunk)
    report.previousDatabaseFailure={...classifyRestoreFailure(Buffer.concat(chunks).toString('utf8')),diagnosticFile:file}
    if(report.previousDatabaseFailure.category!=='default_public_schema_conflict') {
      report.stage='diagnose_restore_database'
      const error=new Error('Previous native error classified; a targeted correction is required before another restore')
      error.safe={tool:'pg_restore.exe',...report.previousDatabaseFailure,diagnosticOnly:true}
      throw error
    }
  }
  const probe=net.createServer()
  await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve))
  const port=probe.address().port
  await new Promise(resolve=>probe.close(resolve))
  const owner='athar_isolated_restore_owner'
  server=new EmbeddedPostgres({databaseDir:path.join(root,'cluster'),port,user:owner,password,
    persistent:true,initdbFlags:['--encoding=UTF8'],postgresFlags:['-h','127.0.0.1',
      '-c','log_statement=none','-c','log_min_error_statement=panic'],onLog(){},onError(){}})
  report.stage='initialize_local_cluster'
  await server.initialise(); await server.start()
  const connection=['--host','127.0.0.1','--port',String(port),'--username',owner,'--no-password']
  report.stage='restore_roles'
  const roleChunks=[]
  for await(const chunk of decryptedBackup(path.join(source,manifest.roles.file),passphrase)) roleChunks.push(chunk)
  const roleClient=server.getPgClient('postgres','127.0.0.1')
  await roleClient.connect()
  let rolePlan
  try {
    rolePlan=await restoreRolesTraced(roleClient,Buffer.concat(roleChunks).toString('utf8'),{owner,
      onPrivateError:async details=>encryptBackup(Readable.from([Buffer.from(JSON.stringify(details))]),
        path.join(source,`role-statement-${Date.now()}-${randomUUID()}.diagnostics.enc`),passphrase)})
    report.roleCompatibility=await verifyTracedMemberships(roleClient,rolePlan)
  } finally {await roleClient.end()}
  await server.createDatabase('athar_restore_verification')
  report.stage='restore_database'
  const restore=()=>native('pg_restore.exe',[...connection,'--dbname','athar_restore_verification','--exit-on-error','--single-transaction','--verbose'],
    decryptedBackup(path.join(source,manifest.archive.file),passphrase))
  try {await restore()}
  catch(error) {
    if(error.safe?.category!=='default_public_schema_conflict')throw error
    // This repair is permitted ONLY after the native error proves that the
    // archive itself contains CREATE SCHEMA public. The failed single-transaction
    // restore rolled back. Remove only the fresh empty bootstrap schema, with
    // no CASCADE, then restore the original archived schema/owner/ACL verbatim.
    const bootstrap=server.getPgClient('athar_restore_verification','127.0.0.1')
    await bootstrap.connect()
    try {
      const schema=(await bootstrap.query(`select pg_get_userbyid(n.nspowner) as owner,
        (select count(*) from pg_class where relnamespace=n.oid)+
        (select count(*) from pg_proc where pronamespace=n.oid)+
        (select count(*) from pg_type where typnamespace=n.oid) as objects
        from pg_namespace n where n.nspname='public'`)).rows[0]
      assert.ok(schema&&['pg_database_owner',owner].includes(schema.owner)&&Number(schema.objects)===0,'Default schema is not an empty bootstrap schema')
      await bootstrap.query('drop schema public')
    } finally {await bootstrap.end()}
    report.databaseBootstrapRepair={category:'default_public_schema_conflict',emptyDefaultSchemaRemoved:true,
      archivedSchemaOwnershipAndAcls:'Restored by the original archive; no --no-owner, --no-acl or ignored errors'}
    await restore()
  }
  client=server.getPgClient('athar_restore_verification','127.0.0.1'); await client.connect()
  await verifyTracedMemberships(client,rolePlan)
  report.stage='verify_restored_catalog_and_counts'
  report.snapshot=await aggregateSnapshot()
  assert.ok(report.snapshot.migrations.includes('20261004000011'),'Expected migration 011 missing')
  assert.ok(!report.snapshot.migrations.some(version=>['20261020000012','20261021000013','20261021000014'].includes(version)),'Unexpected already-applied release migration')
  assert.equal(report.snapshot.roles.length,7,'Expected Supabase roles missing')
  report.schema=(await client.query("select c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('orders','order_items','payments','profiles','products','categories') order by c.relname")).rows
  assert.equal(report.schema.length,6)
  assert.ok(report.schema.every(row=>row.relrowsecurity))
  // Exercise restored grants and policies under an unprivileged identity. No
  // copied customer identity is needed, and no application data is mutated.
  await client.query('begin; set local role authenticated')
  try {
    assert.equal((await client.query('select count(*)::int as n from public.orders')).rows[0].n,0,'RLS exposed orders without an authenticated identity')
    assert.equal((await client.query('select public.is_admin() as allowed')).rows[0].allowed,false,'Missing identity gained admin authority')
  } finally { await client.query('rollback') }
  report.unprivilegedRls='PASS: authenticated without identity cannot read orders or gain admin authority'
  report.actualRestore=true
  report.stage='rehearse_atomic_migrations_on_restored_copy'
  await client.query(await prepareReleaseSql())
  const after=await aggregateSnapshot()
  assert.deepEqual(after.counts,report.snapshot.counts,'Migration rehearsal changed preserved row counts')
  assert.deepEqual(after.inventory,report.snapshot.inventory,'Migration rehearsal changed catalog stock')
  assert.deepEqual(after.payments,report.snapshot.payments,'Migration rehearsal changed payment status totals')
  assert.equal((await client.query('select checkout_maintenance_active() as active')).rows[0].active,true)
  report.rehearsedMigrations=after.migrations.filter(version=>!report.snapshot.migrations.includes(version))
  report.isolatedMigrationRehearsal=true
  report.stage='complete'
} catch(error) {
  report.failure=error.safe ?? {category:'verification_failed',sqlState:/^[0-9A-Z]{5}$/.test(error.code ?? '')?error.code:null,
    internalCode:error.code==='ERR_ASSERTION'?'ASSERTION':null,message:'Isolated restore or metadata consistency check failed. No production changes were made.'}
  // Keep detailed error encrypted for private diagnosis, never terminal logs.
  await encryptBackup(Readable.from([Buffer.from(String(error.stack ?? error))]),path.join(source,`restore-verification-${Date.now()}.diagnostics.enc`),passphrase).catch(()=>{})
  process.exitCode=1
} finally {
  if(client) await client.end().catch(()=>{})
  if(server) await server.stop().catch(()=>{process.exitCode=1})
  if(!process.exitCode) {
    // Exact validated disposable directory only, after its own server is stopped.
    await rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:200})
    report.temporaryDataRemoved=true
  }
  report.localStorageProtection='EFS plus current-user ACL; loopback-only local server'
  report.storageLimitations='Storage object bytes and external Auth/Edge configuration are not in this database backup; preserve existing project and files.'
  await writeFile(path.join(source,'restore-verification.json'),JSON.stringify(report,null,2),{mode:0o600})
  console.log(process.exitCode ? `Isolated restore blocked at ${report.stage}. See private restore-verification.json; production unchanged.`
    : 'PASS: actual isolated production-backup restore, counts/roles/RLS verification, atomic migration rehearsal, and encrypted temporary-data cleanup completed.')
  if(process.exitCode)console.log(JSON.stringify({stage:report.stage,failure:report.failure,productionModified:false},null,2))
}
// embedded-postgres installs exit hooks; make an explicit failed status survive them.
if(process.exitCode) process.exit(process.exitCode)
