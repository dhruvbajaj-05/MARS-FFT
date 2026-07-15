import type { QCDepartment } from '@/api/types';

// Route params for the Moulding QC stack (mounted as the QC tab inside the Moulding
// department). QC is no longer a standalone Company → Product → Order module: the active
// order comes from the Entry tab via MouldingSessionContext (req #1, #2).
export type QCStackParamList = {
  MouldingQC: undefined;
  // customerId/productId are passed so the create form never depends on the async
  // order-context query to build its required fields.
  CreateQCReport: { department: QCDepartment; orderId: string; customerId?: string; productId?: string };
  QCReportsList: { department: QCDepartment; orderId?: string; title?: string; search?: string };
  QCReportDetail: { reportId: string };
  QCImageGallery: { department: QCDepartment; orderId: string };
};
