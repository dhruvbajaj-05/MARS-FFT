// Single source of truth for roles — must match backend src/utils/roles.js exactly.
export const ROLES = {
  ADMIN: 'admin',
  MOULDING_ENGINEER: 'moulding_engineer',
  ASSEMBLY_ENGINEER: 'assembly_engineer',
  QC_ENGINEER: 'qc_engineer',
  PACKING_DISPATCH_ENGINEER: 'packing_dispatch_engineer',
  CUSTOMER: 'customer',
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export const ENGINEER_ROLES: Role[] = [
  ROLES.MOULDING_ENGINEER,
  ROLES.ASSEMBLY_ENGINEER,
  ROLES.QC_ENGINEER,
  ROLES.PACKING_DISPATCH_ENGINEER,
];

export function isEngineer(role: Role): boolean {
  return ENGINEER_ROLES.includes(role);
}

// Human-readable labels for UI.
export const ROLE_LABELS: Record<Role, string> = {
  [ROLES.ADMIN]: 'Administrator',
  [ROLES.MOULDING_ENGINEER]: 'Moulding Engineer',
  [ROLES.ASSEMBLY_ENGINEER]: 'Assembly Engineer',
  [ROLES.QC_ENGINEER]: 'QC Engineer',
  [ROLES.PACKING_DISPATCH_ENGINEER]: 'Dispatch Engineer',
  [ROLES.CUSTOMER]: 'Customer',
};
