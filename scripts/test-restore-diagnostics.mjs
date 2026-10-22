import assert from 'node:assert/strict'
import {classifyRestoreFailure} from './restore-diagnostics.mjs'
const conflict='pg_restore: from TOC entry 7; 2615 2200 SCHEMA - public private_owner_canary\npg_restore: error: could not execute query: ERROR:  schema "public" already exists\nCommand was: CREATE SCHEMA public;\n'
assert.deepEqual(classifyRestoreFailure(conflict),{
  category:'default_public_schema_conflict',message:'Archive explicitly creates the default schema already present in a fresh PostgreSQL database.',
  sqlState:null,objectType:'SCHEMA',archiveEntryIndex:7,
})
assert.equal(classifyRestoreFailure(conflict.replaceAll('public','private_schema_canary')).category,'restore_object_conflict')
assert.equal(classifyRestoreFailure('ERROR: schema "public" already exists\nCommand was: CREATE TABLE private_canary();').category,'restore_object_conflict')
for(const [text,category] of [
  ['ERROR: extension "private_extension_canary" is not available','managed_extension_unavailable'],
  ['ERROR: role "private_role_canary" does not exist','restore_role_dependency_missing'],
  ['ERROR: schema "private_schema_canary" does not exist','restore_schema_dependency_missing'],
  ['ERROR: unrecognized configuration parameter "private_setting_canary"','restore_setting_incompatible'],
  ['ERROR: permission denied for private_secret_canary','restore_permission_or_ownership'],
  ['arbitrary private_secret_canary','restore_native_unknown'],
]) {
  const safe=classifyRestoreFailure(text)
  assert.equal(safe.category,category)
  assert.ok(!JSON.stringify(safe).includes('canary'))
}
assert.equal(classifyRestoreFailure('ERROR: 42501: permission denied').sqlState,'42501')
assert.ok(!JSON.stringify(classifyRestoreFailure(conflict)).includes('private_owner'))
console.log('PASS restore diagnostics: strict bootstrap-conflict evidence, other dependency categories, SQLSTATE/TOC metadata and identifier/error redaction')
