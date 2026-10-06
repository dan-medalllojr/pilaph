import { relations } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const businesses = pgTable('businesses', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  isOpen: boolean('is_open').notNull().default(true),
  nearThreshold: integer('near_threshold').notNull().default(3),
  maxWaiting: integer('max_waiting'),
  joinCutoffTime: text('join_cutoff_time'),
  qrToken: text('qr_token').notNull(),
  rotateQrDaily: boolean('rotate_qr_daily').notNull().default(false),
  qrTokenDate: text('qr_token_date').notNull(),
  timezone: text('timezone').notNull().default('Asia/Manila'),
  // Public URL in the `shop-photos` Supabase Storage bucket; null = no photo.
  photoUrl: text('photo_url'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  name: text('name').notNull().default('Owner'),
  businessId: integer('business_id').references(() => businesses.id),
  role: text('role').notNull().default('owner'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const services = pgTable(
  'services',
  {
    id: serial('id').primaryKey(),
    businessId: integer('business_id')
      .references(() => businesses.id)
      .notNull(),
    name: text('name').notNull(),
    prefix: text('prefix').notNull(),
    defaultMinutes: integer('default_minutes').notNull().default(15),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('services_business_prefix_idx').on(table.businessId, table.prefix),
  ]
);

export const counters = pgTable('counters', {
  id: serial('id').primaryKey(),
  businessId: integer('business_id')
    .references(() => businesses.id)
    .notNull(),
  name: text('name').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const tickets = pgTable(
  'tickets',
  {
    id: text('id').primaryKey(),
    businessId: integer('business_id')
      .references(() => businesses.id)
      .notNull(),
    serviceId: integer('service_id')
      .references(() => services.id)
      .notNull(),
    counterId: integer('counter_id').references(() => counters.id),
    queueDate: text('queue_date').notNull(),
    number: integer('number').notNull(),
    code: text('code').notNull(),
    customerName: text('customer_name').notNull(),
    phone: text('phone'),
    status: text('status').notNull().default('waiting'),
    joinedAt: timestamp('joined_at').defaultNow().notNull(),
    calledAt: timestamp('called_at'),
    completedAt: timestamp('completed_at'),
    nearSmsSentAt: timestamp('near_sms_sent_at'),
    calledSmsSentAt: timestamp('called_sms_sent_at'),
    idempotencyKey: text('idempotency_key').notNull().unique(),
    deviceId: text('device_id').notNull(),
  },
  (table) => [
    uniqueIndex('tickets_service_date_num_idx').on(
      table.serviceId,
      table.queueDate,
      table.number
    ),
    index('tickets_device_active_idx').on(
      table.businessId,
      table.queueDate,
      table.deviceId,
      table.status
    ),
    index('tickets_phone_active_idx').on(
      table.businessId,
      table.queueDate,
      table.phone,
      table.status
    ),
    index('tickets_queue_lookup_idx').on(
      table.businessId,
      table.queueDate,
      table.status,
      table.joinedAt
    ),
  ]
);

export const smsLogs = pgTable('sms_logs', {
  id: serial('id').primaryKey(),
  businessId: integer('business_id')
    .references(() => businesses.id)
    .notNull(),
  ticketId: text('ticket_id')
    .references(() => tickets.id)
    .notNull(),
  phone: text('phone').notNull(),
  type: text('type').notNull(),
  message: text('message').notNull(),
  status: text('status').notNull(),
  driver: text('driver').notNull().default('log'),
  providerResponse: text('provider_response'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const pushSubscriptions = pgTable('push_subscriptions', {
  id: serial('id').primaryKey(),
  businessId: integer('business_id')
    .references(() => businesses.id)
    .notNull(),
  userUid: text('user_uid').notNull(),
  endpoint: text('endpoint').notNull().unique(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const businessesRelations = relations(businesses, ({ many }) => ({
  users: many(users),
  services: many(services),
  counters: many(counters),
  tickets: many(tickets),
  smsLogs: many(smsLogs),
  pushSubscriptions: many(pushSubscriptions),
}));

export const usersRelations = relations(users, ({ one }) => ({
  business: one(businesses, {
    fields: [users.businessId],
    references: [businesses.id],
  }),
}));

export const servicesRelations = relations(services, ({ one, many }) => ({
  business: one(businesses, {
    fields: [services.businessId],
    references: [businesses.id],
  }),
  tickets: many(tickets),
}));

export const countersRelations = relations(counters, ({ one, many }) => ({
  business: one(businesses, {
    fields: [counters.businessId],
    references: [businesses.id],
  }),
  tickets: many(tickets),
}));

export const ticketsRelations = relations(tickets, ({ one, many }) => ({
  business: one(businesses, {
    fields: [tickets.businessId],
    references: [businesses.id],
  }),
  service: one(services, {
    fields: [tickets.serviceId],
    references: [services.id],
  }),
  counter: one(counters, {
    fields: [tickets.counterId],
    references: [counters.id],
  }),
  smsLogs: many(smsLogs),
}));
