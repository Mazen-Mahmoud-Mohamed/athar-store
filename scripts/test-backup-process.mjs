import assert from 'node:assert/strict'
import path from 'node:path'
import { readFile } from 'node:fs/promises'
import { runEncryptedTool, classifyBackupFailure } from './backup-process.mjs'
import { decryptedBackup } from './encrypted-backup.mjs'

export async function testBackupProcess({test,directory}) {
  const passphrase='synthetic-backup-process-passphrase'
  await test('native failure records exact exit and safe category while raw diagnostics remain encrypted',async()=>{
    const output=path.join(directory,'tls-failed.enc')
    const raw='pg_dump: SSL error: certificate verify failed; postgresql://private-user:private-password@example/secret-db'
    let failure
    try {
      await runEncryptedTool({executable:process.execPath,args:['-e',`process.stderr.write(${JSON.stringify(raw)});process.exitCode=1`],env:process.env,output,passphrase})
      assert.fail('must reject failed child')
    } catch(error) { failure=error.failure }
    assert.equal(failure.exitCode,1)
    assert.equal(failure.category,'tls_trust')
    assert.ok(!JSON.stringify(failure).includes('private-user'))
    assert.ok(!JSON.stringify(failure).includes('private-password'))
    assert.ok(!JSON.stringify(failure).includes('secret-db'))
    let decoded=''
    for await(const chunk of decryptedBackup(path.join(directory,'tls-failed.diagnostics.enc'),passphrase)) decoded+=chunk
    assert.equal(decoded,raw)
    assert.ok(!(await readFile(path.join(directory,'tls-failed.diagnostics.enc'))).includes(Buffer.from(raw)))
  })
  await test('process-launch failures remain actionable and do not escape as unhandled child errors',async()=>{
    await assert.rejects(runEncryptedTool({executable:path.join(directory,'nonexistent.exe'),args:[],env:process.env,
      output:path.join(directory,'missing.enc'),passphrase}),error=>error.failure.errorCode==='ENOENT' && error.failure.category==='tool_missing')
  })
  await test('safe diagnostics distinguish authentication, permissions, arguments, network and disk failures',async()=>{
    for(const [text,code,category] of [
      ['password authentication failed for user private','', 'authentication'],
      ['fe_sendauth: no password supplied','', 'password_missing'],
      ['permission denied for table private_table','', 'permissions'],
      ['unrecognized option --bad','', 'tool_arguments'],
      ['connection timed out','', 'connectivity'],
      ['', 'ENOSPC','disk_space'],
    ]) assert.equal(classifyBackupFailure(text,code).category,category)
  })
}
