import assert from 'node:assert/strict'

const identifier='(?:"(?:[^"\\r\\n]|"")+"|[a-zA-Z_][a-zA-Z_0-9$]*)'
const grantPattern=new RegExp(`^GRANT (${identifier}) TO (${identifier})(.*?) GRANTED BY (${identifier});\\s*$`)
const unquote=value=>value.startsWith('"')?value.slice(1,-1).replaceAll('""','"'):value

// LOCAL REHEARSAL ONLY. Managed platforms can record membership grantors whose
// ADMIN authority comes from platform bootstrap/catalog state outside pg_dump.
// Reissue memberships as the isolated cluster owner, keeping every membership
// option. Do not promote application roles or remove ownership/ACL restoration.
export function compatibleRoles(sql,owner) {
  assert.equal(owner,'athar_isolated_restore_owner')
  assert.ok(!sql.includes(owner),'Isolated owner collides with source role')
  const memberships=[]
  const seen=new Set()
  const rewritten=sql.split(/\r?\n/).map(line=>{
    if(!line.startsWith('GRANT ')) return line
    const match=line.match(grantPattern)
    assert.ok(match,'Unsupported membership SQL; refuse partial role restore')
    const [,role,member,options]=match
    assert.match(options,/^(?: WITH (?:ADMIN (?:OPTION|TRUE|FALSE)|INHERIT (?:TRUE|FALSE)|SET (?:TRUE|FALSE))(?:, (?:ADMIN (?:TRUE|FALSE)|INHERIT (?:TRUE|FALSE)|SET (?:TRUE|FALSE)))*)?$/)
    const key=JSON.stringify([unquote(role),unquote(member)])
    assert.ok(!seen.has(key),'Multiple grantors for one membership require explicit review')
    seen.add(key)
    memberships.push({role:unquote(role),member:unquote(member),
      admin:/\bADMIN (?:OPTION|TRUE)\b/.test(options),
      inherit:/\bINHERIT (TRUE|FALSE)\b/.exec(options)?.[1],
      set:!/\bSET FALSE\b/.test(options)})
    return `GRANT ${role} TO ${member}${options} GRANTED BY "${owner}";`
  }).join('\n')
  return {sql:rewritten,memberships}
}

export async function verifyRoleCompatibility(client,memberships) {
  const actual=(await client.query(`select r.rolname as role,m.rolname as member,
    a.admin_option,a.inherit_option,a.set_option,m.rolinherit
    from pg_auth_members a join pg_roles r on r.oid=a.roleid
    join pg_roles m on m.oid=a.member`)).rows
  for(const expected of memberships) {
    const rows=actual.filter(row=>row.role===expected.role && row.member===expected.member)
    assert.equal(rows.length,1,'Restored membership missing or ambiguous')
    const row=rows[0]
    assert.equal(row.admin_option,expected.admin,'Membership ADMIN changed')
    assert.equal(row.inherit_option,expected.inherit===undefined?row.rolinherit:expected.inherit==='TRUE','Membership INHERIT changed')
    assert.equal(row.set_option,expected.set,'Membership SET changed')
  }
  return {membershipsVerified:memberships.length,
    grantorNormalization:'Membership grantors replaced by isolated cluster owner; ADMIN/INHERIT/SET options verified. Original role attributes/settings and database ownership/ACLs retained.',
    scope:'Application recovery rehearsal; not a reconstruction of Supabase control-plane infrastructure or membership revocation provenance.'}
}
