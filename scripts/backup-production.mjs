// Invoked only by the interactive PowerShell wrapper. Read-only PostgreSQL dump.
import path from 'node:path'
import { spawn } from 'node:child_process'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import { createHash } from 'node:crypto'
import { Readable, Writable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { encryptBackup, decryptedBackup, verifyEncryptedBackup } from './encrypted-backup.mjs'
import { runEncryptedTool, classifyBackupFailure, waitForBackupChild } from './backup-process.mjs'

const ref='rotcgsayspiphcisepmu'
const destination=path.resolve(process.env.ATHAR_BACKUP_DIRECTORY ?? '')
const dbPassword=process.env.ATHAR_BACKUP_DB_PASSWORD
const passphrase=process.env.ATHAR_BACKUP_PASSPHRASE
delete process.env.ATHAR_BACKUP_DB_PASSWORD
delete process.env.ATHAR_BACKUP_PASSPHRASE
if(!/^D:\\work\\athar-backups\\[A-Za-z0-9-]+$/i.test(destination)) throw new Error('Backup destination must be a unique D: backup directory')
if(!dbPassword || !passphrase || passphrase.length<16) throw new Error('Interactive credentials and a 16+ character encryption passphrase are required')
const bin='D:/work/athar-pg17-client/pgsql/bin'
const rootCert=path.join(destination,'trusted-roots.pem')
const pooler=new URL((await readFile(new URL('../supabase/.temp/pooler-url',import.meta.url),'utf8')).trim())
if(pooler.hostname!=='aws-1-eu-central-1.pooler.supabase.com' || pooler.port!=='5432' || pooler.username!==`postgres.${ref}` || pooler.pathname!=='/postgres' || pooler.password) throw new Error('Unexpected production session-pooler identity')
const connection=`host=${pooler.hostname} port=5432 dbname=postgres user=postgres.${ref} sslmode=verify-full sslrootcert='${rootCert.replaceAll('\\','/')}' gssencmode=disable connect_timeout=15`
const env={...process.env,PGPASSWORD:dbPassword,PGOPTIONS:'-c default_transaction_read_only=on'}
let stage='initialization'
let tool=null
// A zero exit status plus authenticated decryption is required. Raw errors, which
// may contain identifiers, are encrypted rather than printed to terminal logs.
async function dump(tool,args,name) {
  const output=path.join(destination,name+'.enc')
  const {warnings}=await runEncryptedTool({executable:path.join(bin,tool),args,env,output,passphrase})
  const bytes=await verifyEncryptedBackup(output,passphrase)
  const hash=createHash('sha256')
  for await(const chunk of createReadStream(output)) hash.update(chunk)
  return {file:path.basename(output),plaintextBytes:bytes,sha256:hash.digest('hex'),warnings}
}
try {
  await mkdir(destination,{recursive:true})
  const dumpArgs=['--dbname',connection,'--no-password','--format=custom','--lock-wait-timeout=10000',
    '--schema=public','--schema=auth','--schema=storage','--schema=supabase_migrations','--schema=extensions']
  stage='database_dump'; tool='pg_dump.exe'
  const archive=await dump(tool,dumpArgs,'database.dump')
  stage='roles_dump'; tool='pg_dumpall.exe'
  const roles=await dump(tool,['--dbname',connection,'--no-password','--roles-only','--no-role-passwords'],'roles.sql')
  // Decode the WHOLE archive. --list may stop reading before all stdin is consumed;
  // using --file=- also verifies data-block decompression, without running any SQL.
  // This remains an integrity check, NOT a restore test.
  stage='archive_decode'; tool='pg_restore.exe'
  const restore=spawn(path.join(bin,tool),['--file=-'],{stdio:['pipe','pipe','pipe'],windowsHide:true})
  const done=waitForBackupChild(restore)
  const decodeDiagnostics=[]
  restore.stderr.on('data',chunk=>decodeDiagnostics.push(chunk))
  const decoded=await Promise.allSettled([
    pipeline(decryptedBackup(path.join(destination,archive.file),passphrase),restore.stdin),
    pipeline(restore.stdout,new Writable({write(chunk,encoding,callback){callback()}})),
  ])
  const decodeStatus=await done
  const pipelineFailure=decoded.find(result=>result.status==='rejected')
  if(decodeStatus.exitCode!==0 || pipelineFailure) {
    const raw=Buffer.concat(decodeDiagnostics)
    if(raw.length) await encryptBackup(Readable.from([raw]),path.join(destination,'archive-decode.diagnostics.enc'),passphrase)
    const failure=new Error('Complete archive decoding failed')
    failure.failure={...decodeStatus,...classifyBackupFailure(raw.toString('utf8'),pipelineFailure?.reason?.code ?? decodeStatus.errorCode)}
    throw failure
  }
  const manifest={projectRef:ref,createdAt:new Date().toISOString(),clientVersion:'17.11',schemas:['public','auth','storage','supabase_migrations','extensions'],
    encryption:'AES-256-GCM; scrypt N=32768 r=8 p=1; independent random salt/nonce per file',archive,roles,
    authenticatedDecryption:'PASS',completeArchiveDecode:'PASS',restoreTest:'NOT RUN',
    limitations:['Storage object bytes and Edge/Auth configuration secrets are outside the database dump','Role passwords are deliberately excluded','Managed Supabase extensions/platform-owned objects may require an equivalent Supabase recovery target','Vault secrets and platform-managed schemas outside the listed scope are excluded']}
  await writeFile(path.join(destination,'backup-manifest.json'),JSON.stringify(manifest,null,2),{flag:'wx',mode:0o600})
  await writeFile(path.join(destination,'backup-status.json'),JSON.stringify({complete:true,restoreVerified:false,stage:'complete'},null,2),{flag:'wx',mode:0o600})
  console.log('Encrypted backup created and integrity checked. Restore verification is still required. Directory: '+destination)
} catch(error) {
  const failure={complete:false,usableBackup:false,stage,tool,...(error.failure ?? {exitCode:null,...classifyBackupFailure(error.message,error.code)})}
  await writeFile(path.join(destination,'backup-status.json'),JSON.stringify(failure,null,2),{flag:'wx',mode:0o600}).catch(()=>{})
  console.error(`Backup failed at ${stage} (${tool ?? 'local setup'}), exit code ${failure.exitCode ?? 'unavailable'}: ${failure.message}`)
  console.error('Do not deploy. Partial encrypted files retained; backup-status.json contains safe failure metadata. No plaintext archive was created.')
  process.exitCode=1
} finally { env.PGPASSWORD=''; }
