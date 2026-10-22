import assert from 'node:assert/strict'
import {roleStructure} from './role-structure.mjs'
const pattern=roleStructure('GRANT "private_role_canary" TO hidden_member_canary WITH INHERIT FALSE GRANTED BY "private_grantor_canary";')
assert.deepEqual(pattern,['GRANT','QUOTED_IDENTIFIER','TO','IDENTIFIER','WITH','INHERIT','FALSE','GRANTED','BY','QUOTED_IDENTIFIER',';'])
assert.deepEqual(roleStructure('GRANT ALL PRIVILEGES ON SCHEMA "private_schema_canary" TO hidden_role_canary;'),
  ['GRANT','ALL','PRIVILEGES','ON','SCHEMA','QUOTED_IDENTIFIER','TO','IDENTIFIER',';'])
assert.deepEqual(roleStructure("GRANT 'secret_canary' 123 !"),['GRANT','STRING_LITERAL','NUMBER','OTHER'])
assert.ok(!JSON.stringify(pattern).includes('canary'))
assert.deepEqual(roleStructure('GRANT "escaped""canary" TO "multiline\ncanary";'),['GRANT','QUOTED_IDENTIFIER','TO','QUOTED_IDENTIFIER',';'])
console.log('PASS structural diagnostic redaction: identifiers, escaped/multiline names, string literals, numbers and unknown characters do not disclose values')
