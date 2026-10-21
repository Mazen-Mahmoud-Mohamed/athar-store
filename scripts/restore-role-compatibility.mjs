// Compatibility entry point. The former line-rewriting implementation is retired:
// it rejected multiple grantors and emitted an incompatible explicit GRANTED BY.
export { roleStatements, restoreRolesTraced, verifyTracedMemberships } from './trace-role-restore.mjs'
