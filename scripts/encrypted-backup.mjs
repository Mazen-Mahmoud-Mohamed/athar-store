// AES-256-GCM envelope. Streams plaintext directly between pg_dump/pg_restore
// and memory; never creates an unencrypted archive. No network access here.
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { open, stat } from 'node:fs/promises'
import { pipeline } from 'node:stream/promises'
import { Writable } from 'node:stream'
const magic = Buffer.from('ATHAR-BACKUP-1\n')
const derive = (passphrase, salt) => scryptSync(passphrase, salt, 32, { N:32768,r:8,p:1,maxmem:128*1024*1024 })
export async function encryptBackup(source, destination, passphrase) {
  const salt=randomBytes(32), iv=randomBytes(12), key=derive(passphrase,salt)
  const header=Buffer.concat([magic,salt,iv])
  const cipher=createCipheriv('aes-256-gcm',key,iv)
  cipher.setAAD(header)
  try {
    await pipeline(source, async function* (chunks) {
      yield header
      for await(const chunk of chunks) yield cipher.update(chunk)
      yield cipher.final()
      yield cipher.getAuthTag()
    }, createWriteStream(destination,{flags:'wx',mode:0o600}))
  } finally { key.fill(0) }
}
export async function* decryptedBackup(file,passphrase) {
  const size=(await stat(file)).size, header=Buffer.alloc(magic.length+44), tag=Buffer.alloc(16)
  if(size<header.length+16) throw new Error('Invalid backup envelope')
  const handle=await open(file,'r')
  try { await handle.read(header,0,header.length,0); await handle.read(tag,0,16,size-16) }
  finally { await handle.close() }
  if(!header.subarray(0,magic.length).equals(magic)) throw new Error('Invalid backup envelope')
  const key=derive(passphrase,header.subarray(magic.length,magic.length+32))
  const decipher=createDecipheriv('aes-256-gcm',key,header.subarray(magic.length+32))
  decipher.setAAD(header); decipher.setAuthTag(tag)
  try {
    if(size>header.length+16) {
      for await(const chunk of createReadStream(file,{start:header.length,end:size-17})) yield decipher.update(chunk)
    }
    yield decipher.final()
  } finally { key.fill(0) }
}
export async function verifyEncryptedBackup(file,passphrase) {
  let bytes=0
  await pipeline(decryptedBackup(file,passphrase),new Writable({write(chunk,encoding,done){bytes+=chunk.length;done()}}))
  return bytes
}
