// Offline diagnosis only: no database connection and no decrypted files written.
import assert from 'node:assert/strict'
import path from 'node:path'
import { readdir, readFile } from 'node:fs/promises'
import { decryptedBackup, verifyEncryptedBackup } from './encrypted-backup.mjs'

const source=path.resolve(process.env.ATHAR_BACKUP_DIRECTORY ?? '')
const passphrase=process.env.ATHAR_BACKUP_PASSPHRASE
delete process.env.ATHAR_BACKUP_PASSPHRASE
assert.match(source,/^D:\\work\\athar-backups\\[A-Za-z0-9-]+$/i)
assert.ok(passphrase)
try {
  const report=JSON.parse(await readFile(path.join(source,'restore-verification.json'),'utf8'))
  assert.equal(report.stage,'restore_roles')
  const files=(await readdir(source)).filter(name=>/^restore-\d+\.diagnostics\.enc$/.test(name)).sort()
  assert.ok(files.length,'No native PostgreSQL diagnostics found')
  const file=path.join(source,files.at(-1))
  await verifyEncryptedBackup(file,passphrase)
  const chunks=[]
  for await(const chunk of decryptedBackup(file,passphrase)) chunks.push(chunk)
  const raw=Buffer.concat(chunks).toString('utf8')
  // Only permit PostgreSQL permission errors with ordinary identifier characters.
  // Never echo arbitrary stderr, SQL, connection strings, or quoted values.
  const safe=raw.split(/\r?\n/).filter(line=>
    /^(?:ERROR:|DETAIL:|HINT:)\s+(?:permission denied to (?:grant|alter|create) role "[A-Za-z_][A-Za-z_0-9]*"\.?|Only roles with (?:the )?ADMIN option on role "[A-Za-z_][A-Za-z_0-9]*" may grant this role\.?|must be superuser to .{0,80}|role "[A-Za-z_][A-Za-z_0-9]*" (?:is reserved|already exists).*)\s*$/.test(line))
  console.log(JSON.stringify({stage:report.stage,tool:report.failure?.tool,exitCode:report.failure?.exitCode,
    diagnosticFile:path.basename(file),postgresError:safe.length?safe:['Error did not match the safe permission-error allowlist; original remains encrypted.'],
    productionModified:false,restoreAttempted:false},null,2))
} catch {
  console.error('Offline diagnosis failed (passphrase, integrity, or report check). No database operations performed.')
  process.exitCode=1
}
