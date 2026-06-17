import type { NativeStackScreenProps } from '@react-navigation/native-stack';

// Param lists per stack. Detail screens carry the record/order id; list/create
// screens take no params. Extend as screens are added.
export type AdminStackParamList = {
  AdminDashboard: undefined;
  AdminOrders: undefined;
  AdminDelayedOrders: undefined;
  AdminOrderDetail: { id: string };
  AdminCustomers: undefined;
  AdminProducts: undefined;
  AdminUsers: undefined;
  AdminAnalytics: undefined;
  ProductionSummary: undefined;
  RejectionAnalytics: undefined;
  DepartmentSummary: undefined;
  CustomerSummary: undefined;
  Settings: undefined;
};

export type EngineerStackParamList = {
  EngineerDashboard: undefined;
  CreateRecord: undefined;
  MyRecords: undefined;
  RecordDetail: { id: string };
  OrderProgress: { orderId?: string };
  Settings: undefined;
};

export type CustomerStackParamList = {
  CustomerDashboard: undefined;
  CustomerOrders: undefined;
  CustomerOrderDetail: { id: string };
  CustomerOrderProgress: { id: string };
  Settings: undefined;
};

export type AdminScreenProps<T extends keyof AdminStackParamList> = NativeStackScreenProps<
  AdminStackParamList,
  T
>;
export type EngineerScreenProps<T extends keyof EngineerStackParamList> = NativeStackScreenProps<
  EngineerStackParamList,
  T
>;
export type CustomerScreenProps<T extends keyof CustomerStackParamList> = NativeStackScreenProps<
  CustomerStackParamList,
  T
>;
