// Local recovery only. Raw SQL/errors remain in memory or authenticated encryption.
import { createHash } from 'node:crypto'

function blocked(reason,statement,sqlState=null) {
  const error=new Error('Role recovery stopped; see safe statement diagnostic')
  error.safe={category:'role_restore',reason,sqlState,
    statementIndex:statement?.index ?? null,sourceLine:statement?.line ?? null,
    statementType:statement?.type ?? null,
    statementFingerprint:statement?createHash('sha256').update(statement.sql).digest('hex'):null}
  return error
}

// Split SQL, not lines: role settings/comments may contain quoted semicolons,
// multiline strings, escaped quotes and dollar quotes. Only pg_dump's restrict
// directives are accepted; arbitrary psql commands/connections are rejected.
export function roleStatements(text) {
  const result=[]
  let i=0,line=1,start=1,sql='',quote=null,block=0,escaped=false
  const take=()=>{const c=text[i++];if(c==='\n')line++;return c}
  const flush=()=>{
    if(!sql.trim())return
    const value=sql.trim(),head=value.match(/^(CREATE ROLE|ALTER ROLE|COMMENT ON ROLE|GRANT|SET)\b/i)?.[1]?.toUpperCase() ?? 'UNKNOWN'
    result.push({sql:value,line:start,index:result.length+1,type:head});sql=''
  }
  while(i<text.length) {
    const c=text[i],next=text[i+1]
    if(block) {
      if(c==='/'&&next==='*'){take();take();block++}
      else if(c==='*'&&next==='/'){take();take();block--}
      else take()
      continue
    }
    if(quote) {
      if(quote.startsWith('$')) {
        if(text.startsWith(quote,i)){sql+=text.slice(i,i+quote.length);i+=quote.length;quote=null}
        else sql+=take()
      } else {
        sql+=take()
        if(escaped&&c==='\\'&&i<text.length)sql+=take()
        else if(c===quote){if(text[i]===quote)sql+=take();else quote=null}
      }
      continue
    }
    if(c==='-'&&next==='-'){while(i<text.length&&text[i]!=='\n')take();sql+=' ';continue}
    if(c==='/'&&next==='*'){take();take();block=1;sql+=' ';continue}
    if(c==='\\') {
      const end=text.indexOf('\n',i),directive=text.slice(i,end<0?text.length:end).trim()
      if(sql.trim()||!/^\\(?:un)?restrict [A-Za-z0-9]+$/.test(directive))throw blocked('unsupported_psql_directive',{index:result.length+1,line,sql:directive,type:'PSQL_DIRECTIVE'})
      while(i<text.length&&text[i]!=='\n')take()
      continue
    }
    if(!sql.trim()&&!/\s/.test(c))start=line
    if(c==="'"||c==='"'){escaped=c==="'"&&/(?:^|\W)E$/i.test(sql);quote=c;sql+=take();continue}
    const dollar=c==='$'?text.slice(i).match(/^\$(?:[A-Za-z_][A-Za-z_0-9]*)?\$/)?.[0]:null
    if(dollar){quote=dollar;sql+=dollar;i+=dollar.length;continue}
    sql+=take()
    if(c===';')flush()
  }
  if(quote||block)throw blocked('unterminated_sql',{index:result.length+1,line:start,sql,type:'PARSER'})
  flush();return result
}

const ident='(?:"(?:[^"\\r\\n]|"")+"|[A-Za-z_][A-Za-z_0-9$]*)'
const grant=new RegExp(`^GRANT (${ident}) TO (${ident})(.*?) GRANTED BY (${ident});$`,'s')
const unquote=s=>s.startsWith('"')?s.slice(1,-1).replaceAll('""','"'):s
const name=s=>'"'+s.replaceAll('"','""')+'"'

function membership(statement) {
  const match=statement.sql.match(grant)
  if(!match)throw blocked('unsupported_membership_syntax',statement)
  const options=match[3].trim()
  if(options&&!/^WITH (?:ADMIN (?:OPTION|TRUE|FALSE)|INHERIT (?:TRUE|FALSE)|SET (?:TRUE|FALSE))(?:,\s*(?:ADMIN (?:OPTION|TRUE|FALSE)|INHERIT (?:TRUE|FALSE)|SET (?:TRUE|FALSE)))*$/.test(options))throw blocked('unsupported_membership_options',statement)
  return {role:unquote(match[1]),member:unquote(match[2]),
    admin:/\bADMIN (?:OPTION|TRUE)\b/.test(options),
    inherit:/\bINHERIT (TRUE|FALSE)\b/.exec(options)?.[1],set:!/\bSET FALSE\b/.test(options)}
}

export async function restoreRolesTraced(client,text,{owner,onPrivateError=async()=>{}}) {
  if(owner!=='athar_isolated_restore_owner'||text.includes(owner))throw blocked('isolated_owner_collision')
  const statements=roleStatements(text),groups=new Map(),expected=[],probes=[]
  for(const statement of statements) {
    if(/^GRANT\s/.test(statement.sql)) {
      const m=membership(statement),key=JSON.stringify([m.role,m.member])
      statement.group=key
      if(!groups.has(key))groups.set(key,[])
      groups.get(key).push({...m,statement})
    } else if(!/^(?:CREATE ROLE|ALTER ROLE|COMMENT ON ROLE|SET (?:default_transaction_read_only|client_encoding|standard_conforming_strings))\b/i.test(statement.sql)) {
      throw blocked('unexpected_role_dump_statement',statement)
    }
  }
  const applied=new Set()
  await client.query('begin')
  try {
    for(const statement of statements) {
      if(statement.group&&applied.has(statement.group))continue
      let sql=statement.sql
      if(statement.group) {
        const members=groups.get(statement.group),first=members[0]
        const role=(await client.query('select rolinherit from pg_roles where rolname=$1',[first.member])).rows[0]
        if(!role)throw blocked('membership_identity_missing',statement)
        const m={role:first.role,member:first.member,
          admin:members.some(x=>x.admin),inherit:members.some(x=>x.inherit===undefined?role.rolinherit:x.inherit==='TRUE'),
          set:members.some(x=>x.set)}
        // Probe original statements with their real grantors, then roll back the
        // probe. Record only safe location/SQLSTATE; raw details are encrypted.
        for(const original of members) {
          await client.query('savepoint membership_probe')
          try {await client.query(original.statement.sql)}
          catch(error) {
            await onPrivateError({statement:original.statement.sql,error:{message:error.message,detail:error.detail,code:error.code}})
            const safe=blocked('original_membership_grantor_incompatible',original.statement,error.code).safe
            probes.push(safe)
            // Only the known permission failure can use grantor normalization.
            if(error.code!=='42501')throw blocked('unexpected_membership_probe_failure',original.statement,error.code)
          } finally {await client.query('rollback to savepoint membership_probe');await client.query('release savepoint membership_probe')}
        }
        expected.push(m);applied.add(statement.group)
        // Explicit GRANTED BY triggers PostgreSQL's ADMIN-option check even for
        // a named superuser. Let the isolated bootstrap superuser issue its own
        // grant instead; do not invent ADMIN memberships for application roles.
        sql=`GRANT ${name(m.role)} TO ${name(m.member)} WITH ADMIN ${m.admin}, INHERIT ${m.inherit}, SET ${m.set};`
      }
      try {await client.query(sql)}
      catch(error) {
        await onPrivateError({statement:statement.sql,executedStatement:sql,error:{message:error.message,detail:error.detail,hint:error.hint,code:error.code,routine:error.routine}})
        const failure=blocked('postgres_statement_failed',statement,error.code)
        failure.safe.serverRoutine=/^[A-Za-z_0-9]+$/.test(error.routine ?? '')?error.routine:null
        throw failure
      }
    }
    await client.query('commit')
  } catch(error) {await client.query('rollback');throw error}
  return {expected,statementCount:statements.length,membershipStatements:[...groups.values()].reduce((n,x)=>n+x.length,0),
    combinedMemberships:[...groups.values()].filter(x=>x.length>1).length,originalGrantorFailures:probes}
}

export async function verifyTracedMemberships(client,plan) {
  for(const m of plan.expected) {
    const rows=(await client.query(`select a.admin_option,a.inherit_option,a.set_option
      from pg_auth_members a join pg_roles r on r.oid=a.roleid join pg_roles p on p.oid=a.member
      where r.rolname=$1 and p.rolname=$2`,[m.role,m.member])).rows
    if(rows.length!==1||rows[0].admin_option!==m.admin||rows[0].inherit_option!==m.inherit||rows[0].set_option!==m.set)throw blocked('effective_membership_verification_failed')
  }
  return {statementCount:plan.statementCount,membershipStatements:plan.membershipStatements,
    membershipsVerified:plan.expected.length,combinedMemberships:plan.combinedMemberships,
    originalGrantorFailures:plan.originalGrantorFailures,
    scope:'Application recovery equivalent: original role attributes, ownership, grants and RLS retained; membership grantor provenance normalized and effective ADMIN/INHERIT/SET union verified.'}
}
