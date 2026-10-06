export type TicketStatus = 'waiting' | 'called' | 'done' | 'no_show' | 'cancelled';
export type UserRole = 'owner' | 'staff';
export type SmsType = 'near' | 'called';

export interface Business {
  id: number;
  name: string;
  slug: string;
  isOpen: boolean;
  nearThreshold: number;
  maxWaiting: number | null;
  joinCutoffTime: string | null;
  qrToken: string;
  rotateQrDaily: boolean;
  qrTokenDate: string;
  timezone: string;
  photoUrl: string | null;
}

export interface ServiceItem {
  id: number;
  businessId: number;
  name: string;
  prefix: string;
  defaultMinutes: number;
  isActive: boolean;
  avgServiceMinutes?: number;
  waitingCount?: number;
  estimatedWaitRange?: string;
}

export interface CounterItem {
  id: number;
  businessId: number;
  name: string;
  isActive: boolean;
  currentTicket?: TicketItem | null;
}

export interface TicketItem {
  id: string;
  businessId: number;
  serviceId: number;
  serviceName?: string;
  servicePrefix?: string;
  counterId: number | null;
  counterName?: string | null;
  queueDate: string;
  number: number;
  code: string;
  customerName: string;
  phone: string | null;
  status: TicketStatus;
  joinedAt: string;
  calledAt: string | null;
  completedAt: string | null;
  nearSmsSentAt: string | null;
  calledSmsSentAt: string | null;
  position?: number | null;
  etaMinutes?: number | null;
  etaRange?: string | null;
}

export interface SmsLogItem {
  id: number;
  businessId: number;
  ticketId: string;
  ticketCode?: string;
  phone: string;
  type: SmsType;
  message: string;
  status: string;
  driver: string;
  providerResponse: string | null;
  createdAt: string;
}

export interface NowServingEntry {
  counterId: number;
  counterName: string;
  ticketCode: string | null;
  serviceName: string | null;
  calledAt: string | null;
}

export interface PublicQueueState {
  business: {
    id: number;
    name: string;
    slug: string;
    isOpen: boolean;
    nearThreshold: number;
    maxWaiting: number | null;
    joinCutoffTime: string | null;
    rotateQrDaily: boolean;
    qrToken?: string; // Included only when rotateQrDaily is true so TV display can render live QR
    timezone: string;
    photoUrl: string | null;
    isPastCutoff: boolean;
    isFull: boolean;
    manilaTime: string;
    manilaDate: string;
  };
  services: Array<{
    id: number;
    name: string;
    prefix: string;
    defaultMinutes: number;
    isActive: boolean;
    avgMinutes: number;
    estimatedWaitMinutes: number;
    estimatedWaitRange: string;
  }>;
  counters: Array<{
    id: number;
    name: string;
    isActive: boolean;
  }>;
  nowServing: NowServingEntry[];
  waitingCount: number;
  waitingCodes: string[];
  estimatedNewJoinRange: string;
  estimatedNewJoinMinutes: number;
}

export interface PublicTicketState {
  id: string;
  code: string;
  status: TicketStatus;
  serviceName: string;
  servicePrefix: string;
  counterName: string | null;
  joinedAt: string;
  calledAt: string | null;
  completedAt: string | null;
  position: number | null;
  aheadCount: number;
  etaMinutes: number | null;
  etaRange: string | null;
  nearSmsSent: boolean;
  calledSmsSent: boolean;
  hasPhone: boolean;
  business: {
    id: number;
    name: string;
    slug: string;
    isOpen: boolean;
    nearThreshold: number;
  };
  nowServing: NowServingEntry[];
  waitingCodes: string[];
}

export interface DashboardState {
  business: Business;
  services: ServiceItem[];
  counters: CounterItem[];
  waitingTickets: TicketItem[];
  calledTickets: TicketItem[];
  recentCompletedTickets: TicketItem[];
  smsLogs: SmsLogItem[];
  statsSummary: {
    servedToday: number;
    waitingNow: number;
    noShowsToday: number;
    cancelledToday: number;
    avgWaitMinutesToday: number;
    avgServiceMinutesToday: number;
  };
  manilaTime: string;
  manilaDate: string;
}

export interface AnalyticsStats {
  servedToday: number;
  servedWeek: number;
  noShowsToday: number;
  cancelledToday: number;
  avgWaitMinutes: number;
  avgServiceMinutes: number;
  smsSentToday: number;
  hourlyDistribution: Array<{
    hourLabel: string;
    hour: number;
    count: number;
  }>;
  serviceBreakdown: Array<{
    serviceId: number;
    name: string;
    prefix: string;
    servedCount: number;
    waitingCount: number;
    avgServiceMinutes: number;
  }>;
}

export interface QueueBroadcastPayload {
  channel: string;
  event: 'ticket.joined' | 'ticket.called' | 'ticket.updated' | 'queue.toggled';
  payload: {
    code: string | null;
    counter: string | null;
    status: string;
    waiting_count: number;
    waiting_codes: string[];
    now_serving: NowServingEntry[];
  };
  timestamp: string;
}

export interface TicketBroadcastPayload {
  channel: string;
  event: 'ticket.called' | 'ticket.cancelled' | 'ticket.updated';
  payload: {
    code: string;
    counter: string | null;
    status: TicketStatus;
  };
  timestamp: string;
}
