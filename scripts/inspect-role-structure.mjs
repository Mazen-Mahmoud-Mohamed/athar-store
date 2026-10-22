// Offline only. This module has no database client or PostgreSQL import.
import path from 'node:path'
import { readFile,writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { decryptedBackup,verifyEncryptedBackup } from './encrypted-backup.mjs'
import { roleStatements,membership } from './trace-role-restore.mjs'
import { roleStructure } from './role-structure.mjs'

const source=path.resolve(process.env.ATHAR_BACKUP_DIRECTORY ?? '')
const passphrase=process.env.ATHAR_BACKUP_PASSPHRASE
delete process.env.ATHAR_BACKUP_PASSPHRASE
const hash=bytes=>createHash('sha256').update(bytes).digest('hex')
try {
  if(!/^D:\\work\\athar-backups\\[A-Za-z0-9-]+$/i.test(source)||!passphrase)throw Error('invalid local input')
  const manifest=JSON.parse(await readFile(path.join(source,'backup-manifest.json'),'utf8'))
  if(manifest.projectRef!=='rotcgsayspiphcisepmu'||manifest.roles.file!=='roles.sql.enc')throw Error('unexpected backup')
  const file=path.join(source,manifest.roles.file)
  if(hash(await readFile(file))!==manifest.roles.sha256)throw Error('checksum')
  if(await verifyEncryptedBackup(file,passphrase)!==manifest.roles.plaintextBytes)throw Error('authenticated size')
  const chunks=[]
  for await(const chunk of decryptedBackup(file,passphrase))chunks.push(chunk)
  const statement=roleStatements(Buffer.concat(chunks).toString('utf8')).find(s=>s.index===73)
  if(!statement||statement.line!==146||hash(statement.sql)!=='6073bf80c06ef5a2fe89cbd54f4285309862518d50a28c478902db0ad6b25ebe')throw Error('target mismatch')
  let parserResult='ACCEPTED'
  try {membership(statement)}catch(error){parserResult=error.safe?.reason ?? 'UNCLASSIFIED_PARSER_FAILURE'}
  const parserUrl=new URL('./trace-role-restore.mjs',import.meta.url)
  const verifier=await readFile(new URL('./verify-production-backup.mjs',import.meta.url),'utf8')
  const safe={diagnostic:'OFFLINE_STATEMENT_STRUCTURE',statementIndex:73,sourceLine:146,
    statementFingerprint:hash(statement.sql),structuralTokens:roleStructure(statement.sql),parserResult,
    parserFile:fileURLToPath(parserUrl),parserSha256:hash(await readFile(parserUrl)),
    verifierImportsTracedParser:verifier.includes("from './trace-role-restore.mjs'"),
    productionModified:false,databaseConnectionAttempted:false,decryptedFilesWritten:false}
  await writeFile(path.join(source,'role-structure-diagnostic.json'),JSON.stringify(safe,null,2))
  console.log(JSON.stringify(safe,null,2))
} catch {
  console.error('Offline structure diagnosis failed: passphrase, integrity, or exact statement identity check. No SQL or decrypted contents emitted; no database connection attempted.')
  process.exitCode=1
}
