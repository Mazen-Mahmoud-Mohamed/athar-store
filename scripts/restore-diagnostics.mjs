// Never emit native stderr, SQL, object names, or arbitrary matched strings.
export function classifyRestoreFailure(raw='') {
  const text=String(raw)
  const sqlState=/ERROR:\s+([0-9A-Z]{5}):/.exec(text)?.[1] ?? null
  const entry=/from TOC entry (\d+);/i.exec(text)?.[1]
  const types=['MATERIALIZED VIEW DATA','MATERIALIZED VIEW','DEFAULT ACL','FK CONSTRAINT','TABLE DATA','SCHEMA','EXTENSION','FUNCTION','PROCEDURE','SEQUENCE','CONSTRAINT','TRIGGER','POLICY','TABLE','TYPE','ACL']
  const objectType=types.find(type=>new RegExp(`(?:from TOC entry \\d+; \\d+ \\d+ |creating )${type}(?: |$)`,'im').test(text))
    ?? (/Command was:\s+CREATE SCHEMA\b/i.test(text)?'SCHEMA':/Command was:\s+CREATE EXTENSION\b/i.test(text)?'EXTENSION':null)
  let category='restore_native_unknown',message='Native restore failed; private encrypted diagnostics require a targeted compatibility review.'
  if(/ERROR:\s+(?:42P06:\s+)?schema "public" already exists/i.test(text)&&/Command was:\s+CREATE SCHEMA (?:public|"public");/i.test(text)) {
    category='default_public_schema_conflict';message='Archive explicitly creates the default schema already present in a fresh PostgreSQL database.'
  } else if(/extension .{0,200} is not available|could not open extension control file/i.test(text)) {
    category='managed_extension_unavailable';message='An archived extension is unavailable in this standalone PostgreSQL installation. No extension or security object has been skipped.'
  } else if(/could not access file .*No such file|could not load library|could not find function .* in file/i.test(text)) {
    category='extension_library_unavailable';message='An archived function requires an unavailable native extension library.'
  } else if(/role .{0,200} does not exist/i.test(text)) {
    category='restore_role_dependency_missing';message='An archive ownership or ACL role dependency is missing.'
  } else if(/schema .{0,200} does not exist/i.test(text)) {
    category='restore_schema_dependency_missing';message='An archived object requires a schema not yet present.'
  } else if(/unrecognized configuration parameter/i.test(text)) {
    category='restore_setting_incompatible';message='An archived session setting is unsupported by the isolated server.'
  } else if(/permission denied|must be owner|must be.*superuser/i.test(text)) {
    category='restore_permission_or_ownership';message='An archive operation failed its permission or ownership check.'
  } else if(/already exists/i.test(text)) {
    category='restore_object_conflict';message='An archived object conflicts with an existing isolated object; no objects were overwritten.'
  } else if(/input file.*end of file|unexpected end of file|did not find magic string|unsupported version.*file header/i.test(text)) {
    category='restore_archive_read';message='Native archive decoding failed; inspect the encrypted stream and client compatibility.'
  }
  return {category,message,sqlState,objectType,archiveEntryIndex:entry?Number(entry):null}
}
