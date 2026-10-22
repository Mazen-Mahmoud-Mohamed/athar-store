// Structural tokens only. Never return identifier/string values or unknown text.
const keywords=new Set(('GRANT TO WITH ADMIN OPTION INHERIT SET TRUE FALSE GRANTED BY ON ALL PRIVILEGES TABLE TABLES SCHEMA SCHEMAS DATABASE FUNCTION FUNCTIONS PROCEDURE PROCEDURES ROUTINE ROUTINES SEQUENCE SEQUENCES TYPE TYPES LANGUAGE FOREIGN SERVER TABLESPACE PARAMETER CURRENT_USER CURRENT_ROLE SESSION_USER PUBLIC ROLE IN GROUP').split(' '))
export function roleStructure(sql) {
  const tokens=[]
  let at=0
  while(at<sql.length) {
    const c=sql[at]
    if(/\s/u.test(c)){at++;continue}
    if(c==='"'||c==="'") {
      const quote=c;at++;let closed=false
      while(at<sql.length) {
        if(sql[at++]===quote) {
          if(sql[at]===quote)at++
          else {closed=true;break}
        }
      }
      tokens.push(quote==='"'?'QUOTED_IDENTIFIER':'STRING_LITERAL')
      if(!closed)tokens.push('UNTERMINATED_QUOTE')
      continue
    }
    const word=sql.slice(at).match(/^[\p{L}\p{Nl}_][\p{L}\p{Nl}\p{N}\p{M}_$]*/u)?.[0]
    if(word){const upper=word.toUpperCase();tokens.push(keywords.has(upper)?upper:'IDENTIFIER');at+=word.length;continue}
    const number=sql.slice(at).match(/^\d+/)?.[0]
    if(number){tokens.push('NUMBER');at+=number.length;continue}
    tokens.push(',;().=*[]:'.includes(c)?c:'OTHER');at++
  }
  return tokens
}
