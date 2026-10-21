// TLS only: intentionally supplies no password and disables password-file lookup.
import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { X509Certificate } from 'node:crypto'
import { classifyBackupFailure } from './backup-process.mjs'
const caPath=fileURLToPath(new URL('./certs/supabase-root-2021.crt',import.meta.url))
const cert=new X509Certificate(await readFile(caPath))
if(cert.fingerprint256.replaceAll(':','')!=='807025AD50D4ED219D2C9C7D299C004F824EB00CF7F65AFEF607D07B72E6CAFA' || !cert.ca || Date.parse(cert.validTo)<=Date.now()) throw new Error('Supabase CA pin/validity check failed')
const pooler=new URL((await readFile(new URL('../supabase/.temp/pooler-url',import.meta.url),'utf8')).trim())
if(pooler.hostname!=='aws-1-eu-central-1.pooler.supabase.com' || pooler.port!=='5432' || pooler.username!=='postgres.rotcgsayspiphcisepmu' || pooler.pathname!=='/postgres' || pooler.password) throw new Error('Unexpected production pooler identity')
const connection=`host=${pooler.hostname} port=5432 dbname=postgres user=${pooler.username} sslmode=verify-full sslrootcert='${caPath.replaceAll('\\','/')}' gssencmode=disable connect_timeout=15`
const env={...process.env,PGPASSWORD:'',PGPASSFILE:'D:/work/athar-backups/__nonexistent_diagnostic_pgpass__',PGOPTIONS:'-c default_transaction_read_only=on'}
const child=spawn('D:/work/athar-pg17-client/pgsql/bin/psql.exe',['--dbname',connection,'--no-password','-X','-c','select 1'],{env,windowsHide:true})
let stderr=''
child.stdout.resume(); child.stderr.on('data',chunk=>{stderr+=chunk})
child.on('error',error=>{console.error(classifyBackupFailure('',error.code).message);process.exitCode=1})
child.on('close',code=>{
  if(code!==0 && /no password supplied/i.test(stderr)) console.log('PASS: PostgreSQL TLS certificate and hostname verified; password entry is now required.')
  else if(code===0) { console.error('Unexpected password-free authentication. Stop and review.');process.exitCode=1 }
  else { console.error(`TLS preflight failed (psql.exe exit ${code}): ${classifyBackupFailure(stderr).message}`);process.exitCode=1 }
})
