// Local synthetic database only. Exercises encryption AND a real pg_restore.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Writable } from 'node:stream'
import { decryptedBackup, verifyEncryptedBackup } from './encrypted-backup.mjs'
import { runEncryptedTool } from './backup-process.mjs'

export async function testEncryptedBackup({test,db,server,directory,port}) {
  await test('encrypted native backup detects wrong keys/tampering and actually restores the synthetic database on PostgreSQL 17.11', async () => {
    const bin='D:/work/athar-pg17-client/pgsql/bin'
    const passphrase='synthetic-backup-passphrase-local-only'
    const file=path.join(directory,'synthetic.dump.enc')
    const env={...process.env,PGPASSWORD:server.options.password}
    const dumped=await runEncryptedTool({executable:path.join(bin,'pg_dump.exe'),args:['-h','127.0.0.1','-p',String(port),'-U','postgres','-d','postgres','-Fc','--no-password'],env,output:file,passphrase})
    assert.equal(dumped.exitCode,0)
    const roles=await runEncryptedTool({executable:path.join(bin,'pg_dumpall.exe'),args:['-h','127.0.0.1','-p',String(port),'-U','postgres','--roles-only','--no-role-passwords','--no-password'],env,output:path.join(directory,'roles.enc'),passphrase})
    assert.equal(roles.exitCode,0)
    assert.ok(await verifyEncryptedBackup(file,passphrase)>0)
    const decode=spawn(path.join(bin,'pg_restore.exe'),['--file=-'],{windowsHide:true})
    const decodeExit=once(decode,'close'); decode.stderr.resume()
    await Promise.all([
      pipeline(decryptedBackup(file,passphrase),decode.stdin),
      pipeline(decode.stdout,new Writable({write(chunk,encoding,done){done()}})),
    ])
    assert.equal((await decodeExit)[0],0,'complete archive decode must succeed without plaintext output')
    await assert.rejects(verifyEncryptedBackup(file,'wrong-passphrase'))
    const content=await readFile(file); content[Math.floor(content.length/2)]^=1
    const corrupt=path.join(directory,'corrupt.dump.enc'); await writeFile(corrupt,content)
    await assert.rejects(verifyEncryptedBackup(corrupt,passphrase))
    await server.createDatabase('athar_restore_verification')
    const restore=spawn(path.join(bin,'pg_restore.exe'),['-h','127.0.0.1','-p',String(port),'-U','postgres','-d','athar_restore_verification','--no-password','--exit-on-error','--single-transaction'],{env,windowsHide:true})
    const restoreExit=once(restore,'close'); restore.stdout.resume(); restore.stderr.resume()
    await pipeline(decryptedBackup(file,passphrase),restore.stdin)
    assert.equal((await restoreExit)[0],0,'actual isolated pg_restore must succeed')
    const restored=server.getPgClient('athar_restore_verification','127.0.0.1')
    await restored.connect()
    try {
      const query=`select (select count(*) from orders) as orders,(select count(*) from payments) as payments,
        (select count(*) from xpay_refunds) as refunds,(select count(*) from xpay_webhook_inbox) as inbox,
        (select count(*) from supabase_migrations.schema_migrations) as migrations,
        (select sum(stock_quantity) from products) as stock`
      assert.deepEqual((await restored.query(query)).rows,(await db.query(query)).rows)
    } finally { await restored.end() }
  })
}
