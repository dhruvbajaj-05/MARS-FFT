import { useCurrentUser } from '@/hooks/useAuth';
import { ROLES } from '@/types/roles';

// Who can do what in the centralized QC (defect-reporting) module. Mirrors the backend
// route guards in qcReport.routes.js:
//   • QC Engineer  — full author: create/upload reports, open/close cases, comment, archive.
//   • Admin        — open/close a case + comment, but NOT create (req #11).
//   • Moulding / Assembly engineers — read-only (req #7).
export interface QCCapabilities {
  canCreate: boolean;
  canArchive: boolean;
  canChangeStatus: boolean;
  canComment: boolean;
}

export function useQCCapabilities(): QCCapabilities {
  const user = useCurrentUser();
  const role = user?.role;
  const isQC = role === ROLES.QC_ENGINEER;
  const isAdmin = role === ROLES.ADMIN;
  return {
    canCreate: isQC,
    canArchive: isQC,
    canChangeStatus: isQC || isAdmin,
    canComment: isQC || isAdmin,
  };
}
