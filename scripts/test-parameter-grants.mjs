import assert from 'node:assert/strict'
import {roleStatements,membership,parameterGrant} from './trace-role-restore.mjs'
const statement=sql=>roleStatements(sql)[0]
// Exact anonymized structure of real backup statement 73: the old dispatch
// calls the membership parser and rejects this valid parameter privilege grant.
const regression=statement('GRANT SET ON PARAMETER log_min_duration_statement TO synthetic_parameter_role;')
assert.throws(()=>membership(regression),error=>error.safe.reason==='unsupported_membership_syntax')
assert.deepEqual(parameterGrant(regression),{
  privileges:['SET'],parameters:['log_min_duration_statement'],
  grantees:[{role:'synthetic_parameter_role',public:false}],grantOption:false,
})
assert.deepEqual(parameterGrant(statement('GRANT ALTER SYSTEM, SET ON PARAMETER "custom.parameter", log_statement TO "quoted""role", PUBLIC WITH GRANT OPTION;')),
  {privileges:['ALTER SYSTEM','SET'],parameters:['custom.parameter','log_statement'],
    grantees:[{role:'quoted"role',public:false},{role:'public',public:true}],grantOption:true})
assert.deepEqual(parameterGrant(statement('grant all privileges on parameter custom.parameter to target granted by grantor;')).privileges,['SET','ALTER SYSTEM'])
assert.equal(parameterGrant(statement('GRANT role_a TO role_b;')),null)
assert.equal(parameterGrant(statement('GRANT "on" TO "parameter";')),null)
for(const sql of [
  'GRANT SELECT ON PARAMETER log_statement TO target;',
  'GRANT SET ON PARAMETER log_statement TO target WITH ADMIN OPTION;',
  'GRANT SET ON PARAMETER log_statement TO target WITH GRANT OPTION garbage;',
  'GRANT SET ON PARAMETER log_statement TO CURRENT_USER;',
  'GRANT SET, SET ON PARAMETER log_statement TO target;',
])assert.throws(()=>parameterGrant(statement(sql)),error=>error.safe.reason==='unsupported_parameter_grant_syntax')
console.log('PASS statement-73 regression: membership-only parser rejects; parameter dispatch preserves SET/ALTER SYSTEM, grant options, quoted names/lists and rejects invalid syntax')
