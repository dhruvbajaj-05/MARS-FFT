'use strict';

// Single source of truth for user roles (matches docs 02 & 08).
const ROLES = Object.freeze({
  ADMIN: 'admin',
  MOULDING_ENGINEER: 'moulding_engineer',
  ASSEMBLY_ENGINEER: 'assembly_engineer',
  QC_ENGINEER: 'qc_engineer',
  PACKING_DISPATCH_ENGINEER: 'packing_dispatch_engineer',
  CUSTOMER: 'customer',
});

const ALL_ROLES = Object.values(ROLES);

// Convenience groupings used by RBAC guards in later phases.
const ENGINEER_ROLES = [
  ROLES.MOULDING_ENGINEER,
  ROLES.ASSEMBLY_ENGINEER,
  ROLES.QC_ENGINEER,
  ROLES.PACKING_DISPATCH_ENGINEER,
];

module.exports = { ROLES, ALL_ROLES, ENGINEER_ROLES };
