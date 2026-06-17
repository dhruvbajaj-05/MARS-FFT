// Notifications architecture scaffold — Phase 10 spec: PREPARE the architecture for
// future push notifications / production & dispatch alerts, do NOT implement yet.
//
// When implemented (likely with expo-notifications + a backend device-token endpoint):
//   1. registerForPushNotifications() requests OS permission and returns an Expo push
//      token, which is POSTed to a future `/notifications/devices` backend route,
//      scoped to the authenticated user (and customerId for customers).
//   2. Incoming notifications carry a typed payload (see NotificationPayload) whose
//      `route` maps to navigation/linking.ts so a tap deep-links to the order/record.
//   3. Alert categories: PRODUCTION_ALERT, DISPATCH_ALERT, QC_ALERT, ORDER_UPDATE.
//
// Kept as interfaces + no-op stubs so screens/navigation can reference the shape today
// without pulling in the dependency or requesting permissions prematurely.

export type NotificationCategory =
  | 'PRODUCTION_ALERT'
  | 'DISPATCH_ALERT'
  | 'QC_ALERT'
  | 'ORDER_UPDATE';

export interface NotificationPayload {
  category: NotificationCategory;
  title: string;
  body: string;
  // Deep-link target resolved via navigation/linking.ts.
  route?: { screen: string; params?: Record<string, string> };
}

export async function registerForPushNotifications(): Promise<string | null> {
  // TODO(phase-future): implement with expo-notifications + backend device registration.
  return null;
}

export function handleNotificationResponse(_payload: NotificationPayload): void {
  // TODO(phase-future): route via navigation ref using _payload.route.
}
