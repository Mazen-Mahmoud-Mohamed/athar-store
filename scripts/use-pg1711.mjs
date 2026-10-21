// Local-only regression runtime: use the approved D: PostgreSQL 17.11 binaries.
import { registerHooks } from 'node:module'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
const bin = 'D:/work/athar-pg17-client/pgsql/bin'
const version = execFileSync(path.join(bin, 'postgres.exe'), ['--version'], { encoding: 'utf8' }).trim()
if (!version.endsWith('17.11')) throw new Error('PostgreSQL 17.11 is required')
console.log(version)
const source = ['postgres', 'initdb', 'pg_ctl'].map(name =>
  `export const ${name} = ${JSON.stringify(path.join(bin, `${name}.exe`))};`).join('\n')
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'embedded-postgres') return { url: new URL('../node_modules/.athar-pg17/node_modules/embedded-postgres/dist/index.js', import.meta.url).href, shortCircuit: true }
    if (specifier === '@embedded-postgres/windows-x64') return { url: `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`, shortCircuit: true }
    return nextResolve(specifier, context)
  },
})
