import { assemblyApi } from '@/api/endpoints/assembly';
import { dispatchApi } from '@/api/endpoints/dispatch';
import { mouldingApi } from '@/api/endpoints/moulding';
import { qcApi } from '@/api/endpoints/qc';
import { ROLES, type Role } from '@/types/roles';

export type DeptKey = 'moulding' | 'assembly' | 'qc' | 'dispatch';

// Descriptor that lets a single engineer navigator/screen set work for any of the
// four departments. `api` is intentionally permissive (the four department APIs share
// the same method names but department-specific record/status types); screens cast to
// the concrete DTO they expect. This avoids function-parameter contravariance friction
// while keeping one navigator for all engineers.
export interface DepartmentApi {
  create: (form: FormData) => Promise<any>;
  listMine: (params?: any) => Promise<any>;
  status: (orderId: string) => Promise<any>;
  get: (id: string) => Promise<any>;
}
export interface DepartmentDescriptor {
  key: DeptKey;
  label: string;
  recordNoun: string;
  api: DepartmentApi;
}

const DESCRIPTORS: Record<DeptKey, DepartmentDescriptor> = {
  moulding: { key: 'moulding', label: 'Moulding', recordNoun: 'Moulding Record', api: mouldingApi },
  assembly: { key: 'assembly', label: 'Assembly', recordNoun: 'Assembly Record', api: assemblyApi },
  qc: { key: 'qc', label: 'Quality Control', recordNoun: 'QC Report', api: qcApi },
  dispatch: { key: 'dispatch', label: 'Dispatch', recordNoun: 'Dispatch Record', api: dispatchApi },
};

const ROLE_TO_DEPT: Partial<Record<Role, DeptKey>> = {
  [ROLES.MOULDING_ENGINEER]: 'moulding',
  [ROLES.ASSEMBLY_ENGINEER]: 'assembly',
  [ROLES.QC_ENGINEER]: 'qc',
  [ROLES.PACKING_DISPATCH_ENGINEER]: 'dispatch',
};

export function departmentForRole(role: Role): DepartmentDescriptor | null {
  const key = ROLE_TO_DEPT[role];
  return key ? DESCRIPTORS[key] : null;
}
