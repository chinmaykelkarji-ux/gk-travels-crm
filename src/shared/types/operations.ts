// ============================================================
// Operations Dashboard & Trip Timeline — shared types
// ============================================================

export type ServiceType = 'FLIGHT' | 'HOTEL' | 'VEHICLE' | 'ACTIVITY' | 'TRANSFER';

export type ServiceStatus = 'DRAFT' | 'REQUESTED' | 'CONFIRMED' | 'VOUCHER_RECEIVED' | 'CANCELLED';

export interface TripServiceDTO {
  id: string;
  tripId: string;
  tripName: string;
  type: ServiceType;
  status: ServiceStatus;
  serviceDate: string;
  startTime: string | null;
  endTime: string | null;
  supplierName: string | null;
  costPrice: number;
  sellPrice: number;
  details: Record<string, unknown>;
  notes: string | null;
}

export interface PendingPayment {
  tripId: string;
  tripName: string;
  customerName: string;
  customerPhone: string;
  amountDue: number;
  daysUntilDeparture: number;
}

export interface UpcomingRisk {
  tripId: string;
  tripName: string;
  departureDate: string;
  unconfirmedServices: TripServiceDTO[];
  hoursUntilDeparture: number;
}

export interface DashboardData {
  todayDepartures: TripServiceDTO[];
  todayArrivals: TripServiceDTO[];
  hotelCheckIns: TripServiceDTO[];
  hotelCheckOuts: TripServiceDTO[];
  vehicleSchedules: TripServiceDTO[];
  pendingConfirmations: TripServiceDTO[];
  pendingPayments: PendingPayment[];
  upcomingRisks: UpcomingRisk[];
}
