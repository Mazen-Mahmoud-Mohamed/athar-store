// Generates a reviewed, atomic cutover. Does not connect to any database.
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
export const releaseMigrations = [
  '20261020000012_order_inventory_and_payment_guards',
  '20261021000013_xpay_refund_event_ledger',
  '20261021000014_checkout_maintenance_and_webhook_inbox',
]
export async function prepareReleaseSql() {
  let sql = `begin;\nset local lock_timeout = '10s';\nset local statement_timeout = '60s';\n`
  sql += 'lock table public.orders, public.payments, public.order_items, public.products in access exclusive mode;\n'
  sql += `do $$begin if exists(select 1 from supabase_migrations.schema_migrations where version in ('20261020000012','20261021000013','20261021000014')) then raise exception 'RELEASE_MIGRATION_ALREADY_APPLIED'; end if; end$$;\n`
  for (const name of releaseMigrations) {
    const source = await readFile(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), 'utf8')
    if ((source.match(/^begin;\s*$/gmi) ?? []).length !== 1 || (source.match(/^commit;\s*$/gmi) ?? []).length !== 1) {
      throw new Error(`Unexpected transaction boundaries: ${name}`)
    }
    const body = source.replace(/^begin;\s*$/mi, '').replace(/^commit;\s*$/mi, '')
    const version = name.split('_')[0]
    const migrationName = name.slice(version.length + 1)
    const literal = '$athar_migration$'
    if (body.includes(literal)) throw new Error('SQL literal delimiter conflict')
    sql += `\n${body}\ninsert into supabase_migrations.schema_migrations(version,name,statements) values ('${version}','${migrationName}',array[${literal}${body}${literal}]);\n`
  }
  sql += "select public.set_checkout_maintenance(true);\nnotify pgrst, 'reload schema';\ncommit;\n"
  return sql
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.write(await prepareReleaseSql())
}
