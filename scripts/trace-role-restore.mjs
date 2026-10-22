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

const name=s=>'"'+s.replaceAll('"','""')+'"'

function grantTokens(statement) {
  // PostgreSQL role grants allow optional grantors, identifier lists and arbitrary
  // whitespace. Tokenize identifiers so commas/keywords inside quotes stay data.
  const tokens=[]
  let at=0
  const sql=statement.sql
  const fail=reason=>{throw blocked(reason,statement)}
  while(at<sql.length) {
    if(/\s/u.test(sql[at])){at++;continue}
    if(sql[at]==='"') {
      at++;let value='',closed=false
      while(at<sql.length) {
        if(sql[at]==='"') {
          at++
          if(sql[at]==='"'){value+='"';at++}
          else {closed=true;break}
        } else value+=sql[at++]
      }
      if(!closed||!value||value.includes('\0'))fail('unsupported_membership_identifier')
      tokens.push({kind:'identifier',value});continue
    }
    if(/[,;.]/.test(sql[at])){tokens.push({kind:'punctuation',value:sql[at++]});continue}
    const word=sql.slice(at).match(/^[\p{L}\p{Nl}_][\p{L}\p{Nl}\p{N}\p{M}_$]*/u)?.[0]
    if(!word)fail('unsupported_membership_syntax')
    at+=word.length;tokens.push({kind:'word',value:word.replace(/[A-Z]/g,c=>c.toLowerCase())})
  }
  return tokens
}

export function membership(statement) {
  const tokens=grantTokens(statement)
  const fail=reason=>{throw blocked(reason,statement)}
  let pos=0
  const is=value=>tokens[pos]?.kind==='word'&&tokens[pos].value===value
  const requireWord=value=>{if(!is(value))fail('unsupported_membership_syntax');pos++}
  const identifier=()=>{
    const token=tokens[pos++]
    if(!token||!['word','identifier'].includes(token.kind))fail('unsupported_membership_identifier')
    if(token.kind==='word'&&['current_user','current_role','session_user','public'].includes(token.value))fail('dynamic_membership_identity')
    return token.value
  }
  const list=()=>{
    const values=[identifier()]
    while(tokens[pos]?.value===','&&tokens[pos]?.kind==='punctuation'){pos++;values.push(identifier())}
    if(new Set(values).size!==values.length)fail('duplicate_membership_identity')
    return values
  }
  requireWord('grant');const roles=list();requireWord('to');const members=list()
  const options={admin:false,inherit:undefined,set:true},seen=new Set()
  if(is('with')) {
    pos++
    while(true) {
      const option=tokens[pos++]
      if(option?.kind!=='word'||!['admin','inherit','set'].includes(option.value)||seen.has(option.value))fail('unsupported_membership_options')
      seen.add(option.value)
      const value=tokens[pos++]
      if(value?.kind!=='word'||!['true','false',...(option.value==='admin'?['option']:[])].includes(value.value))fail('unsupported_membership_options')
      options[option.value]=option.value==='inherit'?(value.value==='true'?'TRUE':'FALSE'):value.value!=='false'
      if(tokens[pos]?.kind!=='punctuation'||tokens[pos].value!==',')break
      pos++
    }
  }
  if(is('granted')) {
    pos++;requireWord('by')
    // Grantor identity is used only by the original SQL probe, never interpreted
    // as a source membership identity or used to broaden application privileges.
    if(tokens[pos]?.kind==='word'&&['current_user','current_role','session_user'].includes(tokens[pos].value))pos++
    else identifier()
  }
  if(tokens[pos]?.kind!=='punctuation'||tokens[pos++].value!==';'||pos!==tokens.length)fail('unsupported_membership_syntax')
  return roles.flatMap(role=>members.map(member=>({role,member,...options})))
}

export function parameterGrant(statement) {
  const tokens=grantTokens(statement)
  const wordAt=(at,value)=>tokens[at]?.kind==='word'&&tokens[at].value===value
  if(!tokens.some((_,at)=>wordAt(at,'on')&&wordAt(at+1,'parameter')))return null
  const fail=()=>{throw blocked('unsupported_parameter_grant_syntax',statement)}
  let pos=0
  const is=value=>wordAt(pos,value)
  const requireWord=value=>{if(!is(value))fail();pos++}
  const identifier=()=>{
    const token=tokens[pos++]
    if(!token||!['word','identifier'].includes(token.kind))fail()
    return token
  }
  const list=read=>{
    const out=[read()]
    while(tokens[pos]?.kind==='punctuation'&&tokens[pos].value===','){pos++;out.push(read())}
    return out
  }
  requireWord('grant')
  let privileges
  if(is('all')) {pos++;if(is('privileges'))pos++;privileges=['SET','ALTER SYSTEM']}
  else privileges=list(()=>{
    if(is('set')){pos++;return 'SET'}
    requireWord('alter');requireWord('system');return 'ALTER SYSTEM'
  })
  if(new Set(privileges).size!==privileges.length)fail()
  requireWord('on');requireWord('parameter')
  const parameters=list(()=>{
    let value=identifier().value
    while(tokens[pos]?.kind==='punctuation'&&tokens[pos].value==='.') {pos++;value+='.'+identifier().value}
    return value
  })
  requireWord('to')
  const grantees=list(()=>{
    const token=identifier()
    if(token.kind==='word'&&['current_user','current_role','session_user'].includes(token.value))fail()
    return {role:token.value,public:token.kind==='word'&&token.value==='public'}
  })
  let grantOption=false
  if(is('with')){pos++;requireWord('grant');requireWord('option');grantOption=true}
  if(is('granted')){pos++;requireWord('by');identifier()}
  if(tokens[pos]?.kind!=='punctuation'||tokens[pos++].value!==';'||pos!==tokens.length)fail()
  return {privileges,parameters,grantees,grantOption}
}

async function parameterAcl(client,parameter) {
  // Parameter ACLs are owned by PostgreSQL's bootstrap superuser (OID 10).
  // Include default owner privileges so creating an explicit ACL is compared
  // accurately, without treating implicit owner rights as a new application grant.
  const rows=(await client.query(`select a.grantee::text,a.privilege_type,a.is_grantable
    from aclexplode(coalesce((select paracl from pg_parameter_acl where parname=$1),
      acldefault('p',10::oid))) a`,[parameter])).rows
  const map=new Map()
  for(const row of rows) {
    const key=JSON.stringify([row.grantee,row.privilege_type])
    map.set(key,(map.get(key)??false)||row.is_grantable)
  }
  return map
}

function sameAcl(actual,expected) {
  return actual.size===expected.size&&[...expected].every(([key,value])=>actual.get(key)===value)
}

export async function restoreRolesTraced(client,text,{owner,onPrivateError=async()=>{}}) {
  if(owner!=='athar_isolated_restore_owner'||text.includes(owner))throw blocked('isolated_owner_collision')
  const statements=roleStatements(text),groups=new Map(),expected=[],probes=[],parameterAcls=new Map()
  for(const statement of statements) {
    if(/^GRANT\s/i.test(statement.sql)) {
      statement.parameter=parameterGrant(statement)
      if(statement.parameter){statement.type='GRANT PARAMETER';continue}
      statement.groups=[]
      for(const m of membership(statement)) {
        const key=JSON.stringify([m.role,m.member])
        statement.groups.push(key)
        if(!groups.has(key))groups.set(key,[])
        groups.get(key).push({...m,statement})
      }
    } else if(!/^(?:CREATE ROLE|ALTER ROLE|COMMENT ON ROLE|SET (?:default_transaction_read_only|client_encoding|standard_conforming_strings))\b/i.test(statement.sql)) {
      throw blocked('unexpected_role_dump_statement',statement)
    }
  }
  const applied=new Set()
  await client.query('begin')
  try {
    for(const statement of statements) {
      if(statement.parameter) {
        const grant=statement.parameter
        for(const parameter of grant.parameters) {
          if(!parameterAcls.has(parameter))parameterAcls.set(parameter,await parameterAcl(client,parameter))
          const acl=parameterAcls.get(parameter)
          for(const grantee of grant.grantees) {
            const oid=grantee.public?'0':(await client.query('select oid::text from pg_roles where rolname=$1',[grantee.role])).rows[0]?.oid
            if(!oid)throw blocked('parameter_grantee_missing',statement)
            for(const privilege of grant.privileges) {
              const key=JSON.stringify([oid,privilege])
              acl.set(key,(acl.get(key)??false)||grant.grantOption)
            }
          }
        }
      }
      if(statement.groups) {
        // Probe each original SQL once, including all members, before splitting
        // its equivalent edges. No source GRANT is silently discarded.
        await client.query('savepoint membership_probe')
        try {await client.query(statement.sql)}
        catch(error) {
          await onPrivateError({statement:statement.sql,error:{message:error.message,detail:error.detail,code:error.code}})
          probes.push(blocked('original_membership_grantor_incompatible',statement,error.code).safe)
          if(error.code!=='42501')throw blocked('unexpected_membership_probe_failure',statement,error.code)
        } finally {await client.query('rollback to savepoint membership_probe');await client.query('release savepoint membership_probe')}
      }
      for(const group of statement.groups ?? [null]) {
      if(group&&applied.has(group))continue
      let sql=statement.sql
      if(group) {
        const members=groups.get(group),first=members[0]
        const role=(await client.query('select rolinherit from pg_roles where rolname=$1',[first.member])).rows[0]
        if(!role)throw blocked('membership_identity_missing',statement)
        const m={role:first.role,member:first.member,
          admin:members.some(x=>x.admin),inherit:members.some(x=>x.inherit===undefined?role.rolinherit:x.inherit==='TRUE'),
          set:members.some(x=>x.set)}
        expected.push(m);applied.add(group)
        // Explicit GRANTED BY triggers PostgreSQL's ADMIN-option check even for
        // a named superuser. Let the isolated bootstrap superuser issue its own
        // grant instead; do not invent ADMIN memberships for application roles.
        sql=`GRANT ${name(m.role)} TO ${name(m.member)} WITH ADMIN ${m.admin}, INHERIT ${m.inherit}, SET ${m.set};`
      }
      try {await client.query(sql)}
      catch(error) {
        await onPrivateError({statement:statement.sql,executedStatement:sql,error:{message:error.message,detail:error.detail,hint:error.hint,code:error.code,routine:error.routine}})
        const failure=blocked(statement.parameter?'parameter_grant_replay_failed':'postgres_statement_failed',statement,error.code)
        failure.safe.serverRoutine=/^[A-Za-z_0-9]+$/.test(error.routine ?? '')?error.routine:null
        throw failure
      }
      }
    }
    for(const [parameter,expectedAcl] of parameterAcls) {
      if(!sameAcl(await parameterAcl(client,parameter),expectedAcl))throw blocked('parameter_acl_verification_failed')
    }
    await client.query('commit')
  } catch(error) {await client.query('rollback');throw error}
  return {expected,parameterAcls:[...parameterAcls].map(([parameter,acl])=>({parameter,acl:[...acl]})),
    parameterGrantStatements:statements.filter(s=>s.parameter).length,
    statementCount:statements.length,membershipStatements:statements.filter(s=>s.groups).length,
    combinedMemberships:[...groups.values()].filter(x=>x.length>1).length,originalGrantorFailures:probes}
}

export async function verifyTracedMemberships(client,plan) {
  for(const entry of plan.parameterAcls ?? []) {
    if(!sameAcl(await parameterAcl(client,entry.parameter),new Map(entry.acl)))throw blocked('parameter_acl_verification_failed')
  }
  for(const m of plan.expected) {
    const rows=(await client.query(`select a.admin_option,a.inherit_option,a.set_option
      from pg_auth_members a join pg_roles r on r.oid=a.roleid join pg_roles p on p.oid=a.member
      where r.rolname=$1 and p.rolname=$2`,[m.role,m.member])).rows
    if(rows.length!==1||rows[0].admin_option!==m.admin||rows[0].inherit_option!==m.inherit||rows[0].set_option!==m.set)throw blocked('effective_membership_verification_failed')
  }
  return {statementCount:plan.statementCount,membershipStatements:plan.membershipStatements,
    parameterGrantStatements:plan.parameterGrantStatements,parameterAclsVerified:plan.parameterAcls?.length ?? 0,
    membershipsVerified:plan.expected.length,combinedMemberships:plan.combinedMemberships,
    originalGrantorFailures:plan.originalGrantorFailures,
    scope:'Application recovery equivalent: original role attributes, ownership, grants and RLS retained; membership grantor provenance normalized and effective ADMIN/INHERIT/SET union verified.'}
}
