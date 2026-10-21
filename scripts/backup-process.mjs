import { spawn } from 'node:child_process'
import { Readable } from 'node:stream'
import { encryptBackup } from './encrypted-backup.mjs'

export function waitForBackupChild(child) {
  return new Promise(resolve=>{
    child.once('error',error=>resolve({exitCode:null,signal:null,errorCode:error.code}))
    child.once('close',(exitCode,signal)=>resolve({exitCode,signal,errorCode:null}))
  })
}

// Return ONLY fixed descriptions. Native stderr can contain credentials, SQL,
// auth records, or identifiers and must never be copied to terminal/status JSON.
export function classifyBackupFailure(diagnostics='', code='') {
  const text=String(diagnostics)
  if (/certificate verify failed|SELF_SIGNED_CERT|unable to get.*issuer|root certificate file|does not match host/i.test(text)) return {category:'tls_trust',message:'TLS certificate/hostname validation failed. Use the pinned Supabase CA; do not weaken sslmode.'}
  if (/password authentication failed|SASL authentication failed/i.test(text)) return {category:'authentication',message:'Database authentication failed. Re-enter the existing database password locally; do not reset credentials.'}
  if (/no password supplied/i.test(text)) return {category:'password_missing',message:'The native child did not receive a database password.'}
  if (/permission denied|must be.*superuser|insufficient privilege/i.test(text)) return {category:'permissions',message:'The database role lacks permission to read a required backup object. Review encrypted diagnostics privately.'}
  if (/could not translate host|ENOTFOUND|EAI_AGAIN/i.test(text+code)) return {category:'dns',message:'Database hostname resolution failed.'}
  if (/timed out|timeout expired|connection refused|ECONNREFUSED|ETIMEDOUT/i.test(text+code)) return {category:'connectivity',message:'Database connectivity failed or timed out; check network access.'}
  if (/unrecognized option|invalid option|invalid connection option|server version mismatch/i.test(text)) return {category:'tool_arguments',message:'Native PostgreSQL tool arguments or version are incompatible.'}
  if (/authenticate data|Invalid backup envelope/i.test(text)) return {category:'backup_integrity',message:'Encrypted backup authentication failed. Verify the encryption passphrase and file integrity locally.'}
  if (code==='ENOSPC') return {category:'disk_space',message:'D: has insufficient space for the encrypted backup.'}
  if (['EACCES','EPERM'].includes(code)) return {category:'filesystem_access',message:'The backup process cannot access its private D: destination.'}
  if (code==='ENOENT') return {category:'tool_missing',message:'A required local tool or input file is missing.'}
  return {category:'native_or_pipeline',message:'Native backup or encryption pipeline failed. Encrypted diagnostics are retained; this is not a usable backup.'}
}

export async function runEncryptedTool({executable,args,env,output,passphrase}) {
  const child=spawn(executable,args,{env,stdio:['ignore','pipe','pipe'],windowsHide:true})
  const diagnostics=[]
  child.stderr.on('data',chunk=>diagnostics.push(chunk))
  const exited=waitForBackupChild(child)
  let pipelineError
  try { await encryptBackup(child.stdout,output,passphrase) }
  catch(error) { pipelineError=error; child.kill() }
  const status=await exited
  const raw=Buffer.concat(diagnostics)
  if(raw.length) await encryptBackup(Readable.from([raw]),output.replace(/\.enc$/,'.diagnostics.enc'),passphrase)
  if(status.exitCode!==0 || pipelineError) {
    const safe=classifyBackupFailure(raw.toString('utf8'),pipelineError?.code ?? status.errorCode)
    const error=new Error(safe.message)
    error.failure={...status,...safe}
    throw error
  }
  return {...status,warnings:raw.length>0}
}
