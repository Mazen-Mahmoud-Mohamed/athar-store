import assert from 'node:assert/strict'
import {loadHandlers} from './order-handler-test-harness.mjs'
let queries=0
const client={async query(sql){queries++;if(sql.includes('claim_xpay_webhook_event'))return {rows:[{claim_xpay_webhook_event:null}]};if(sql.includes('xpay_webhook_queue_status'))return {rows:[{xpay_webhook_queue_status:{pending:0,maintenance:true,processing_paused:true}}]};throw Error('Unexpected worker database call')}}
const handlers=await loadHandlers(client)
try {
  assert.equal((await handlers.worker(false)).status,401)
  assert.equal((await handlers.worker(true,client,'local_service_fixture')).status,401)
  assert.equal(queries,0)
  const response=await handlers.worker()
  assert.equal(response.status,200)
  assert.deepEqual(await response.json(),{processed:0,failed:0,queue:{pending:0,maintenance:true,processing_paused:true}})
  assert.equal(queries,2)
  const get=globalThis.Deno.env.get
  globalThis.Deno.env.get=key=>key==='ATHAR_WEBHOOK_WORKER_KEY'?undefined:get(key)
  assert.equal((await handlers.worker()).status,503)
  assert.equal(queries,2)
  console.log('PASS worker auth: dedicated token succeeds; browser/service credentials rejected; missing token fails closed; paused queue makes no financial mutation')
} finally {handlers.close()}
