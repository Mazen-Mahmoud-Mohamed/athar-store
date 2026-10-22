import assert from 'node:assert/strict'
import { membership, roleStatements } from './trace-role-restore.mjs'

const parse=sql=>membership(roleStatements(sql)[0])
const edge=(role,member,options={})=>({role,member,admin:false,inherit:undefined,set:true,...options})
assert.deepEqual(parse('GRANT source TO target;'),[edge('source','target')])
assert.deepEqual(parse('GRANT source TO target GRANTED BY grantor;'),[edge('source','target')])
assert.deepEqual(parse('grant\tSource\n to\tTarget\n WITH\n ADMIN OPTION , INHERIT FALSE , SET TRUE\n GRANTED\tBY "Grantor" ;'),
  [edge('source','target',{admin:true,inherit:'FALSE'})])
assert.deepEqual(parse('GRANT "role, TO" TO "member""name" WITH INHERIT TRUE, SET FALSE;'),
  [edge('role, TO','member"name',{inherit:'TRUE',set:false})])
assert.deepEqual(parse('GRANT a,b TO x,y WITH ADMIN FALSE, INHERIT FALSE, SET FALSE GRANTED BY current_user;'),
  ['a','b'].flatMap(role=>['x','y'].map(member=>edge(role,member,{inherit:'FALSE',set:false}))))
assert.deepEqual(parse('GRANT "WITH", Ünicode TO "TO", "CURRENT_USER";'),
  ['WITH','Ünicode'].flatMap(role=>['TO','CURRENT_USER'].map(member=>edge(role,member))))
assert.deepEqual(parse('GRANT /* gap */ a TO b WITH SET FALSE;'),[edge('a','b',{set:false})])
for(const sql of [
  'GRANT a TO b WITH ADMIN TRUE, ADMIN FALSE;',
  'GRANT a TO b WITH INHERIT OPTION;',
  'GRANT a TO b WITH SET OPTION;',
  'GRANT a TO b WITH ADMIN TRUE GARBAGE;',
  'GRANT a TO b GRANTED BY;',
  'GRANT a TO b,c,c;',
  'GRANT a TO CURRENT_USER;',
  'GRANT SELECT ON TABLE orders TO b;',
])assert.throws(()=>parse(sql),error=>error.safe.category==='role_restore')
console.log('PASS role membership grammar: optional/explicit grantor, quotes/escaping, whitespace/case, Unicode, multiple roles/members, exact options and ambiguous/invalid rejection')
