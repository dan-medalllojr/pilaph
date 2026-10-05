-- =============================================================================
-- PilaPH — Supabase PostgreSQL Schema & Initial Seed Script
-- Run this inside your Supabase Dashboard -> SQL Editor to create all tables
-- in your Supabase database (https://vxpgkokekhrtzyechlth.supabase.co)
-- =============================================================================

CREATE TABLE IF NOT EXISTS "businesses" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "slug" text NOT NULL UNIQUE,
  "is_open" boolean DEFAULT true NOT NULL,
  "near_threshold" integer DEFAULT 3 NOT NULL,
  "max_waiting" integer,
  "join_cutoff_time" text,
  "qr_token" text NOT NULL,
  "rotate_qr_daily" boolean DEFAULT false NOT NULL,
  "qr_token_date" text NOT NULL,
  "timezone" text DEFAULT 'Asia/Manila' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "users" (
  "id" serial PRIMARY KEY NOT NULL,
  "uid" text NOT NULL UNIQUE,
  "email" text NOT NULL,
  "name" text DEFAULT 'Owner' NOT NULL,
  "business_id" integer REFERENCES "businesses"("id"),
  "role" text DEFAULT 'owner' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "services" (
  "id" serial PRIMARY KEY NOT NULL,
  "business_id" integer NOT NULL REFERENCES "businesses"("id"),
  "name" text NOT NULL,
  "prefix" text NOT NULL,
  "default_minutes" integer DEFAULT 15 NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "services_business_prefix_idx"
  ON "services" ("business_id", "prefix");

CREATE TABLE IF NOT EXISTS "counters" (
  "id" serial PRIMARY KEY NOT NULL,
  "business_id" integer NOT NULL REFERENCES "businesses"("id"),
  "name" text NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "tickets" (
  "id" text PRIMARY KEY NOT NULL,
  "business_id" integer NOT NULL REFERENCES "businesses"("id"),
  "service_id" integer NOT NULL REFERENCES "services"("id"),
  "counter_id" integer REFERENCES "counters"("id"),
  "queue_date" text NOT NULL,
  "number" integer NOT NULL,
  "code" text NOT NULL,
  "customer_name" text NOT NULL,
  "phone" text,
  "status" text DEFAULT 'waiting' NOT NULL,
  "joined_at" timestamp DEFAULT now() NOT NULL,
  "called_at" timestamp,
  "completed_at" timestamp,
  "near_sms_sent_at" timestamp,
  "called_sms_sent_at" timestamp,
  "idempotency_key" text NOT NULL UNIQUE,
  "device_id" text NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "tickets_service_date_num_idx"
  ON "tickets" ("service_id", "queue_date", "number");

CREATE INDEX IF NOT EXISTS "tickets_device_active_idx"
  ON "tickets" ("business_id", "queue_date", "device_id", "status");

CREATE INDEX IF NOT EXISTS "tickets_phone_active_idx"
  ON "tickets" ("business_id", "queue_date", "phone", "status");

CREATE INDEX IF NOT EXISTS "tickets_queue_lookup_idx"
  ON "tickets" ("business_id", "queue_date", "status", "joined_at");

CREATE TABLE IF NOT EXISTS "sms_logs" (
  "id" serial PRIMARY KEY NOT NULL,
  "business_id" integer NOT NULL REFERENCES "businesses"("id"),
  "ticket_id" text NOT NULL REFERENCES "tickets"("id"),
  "phone" text NOT NULL,
  "type" text NOT NULL,
  "message" text NOT NULL,
  "status" text NOT NULL,
  "driver" text DEFAULT 'log' NOT NULL,
  "provider_response" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "push_subscriptions" (
  "id" serial PRIMARY KEY NOT NULL,
  "business_id" integer NOT NULL REFERENCES "businesses"("id"),
  "user_uid" text NOT NULL,
  "endpoint" text NOT NULL UNIQUE,
  "p256dh" text NOT NULL,
  "auth" text NOT NULL,
  "user_agent" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);

-- Seed default Philippine Barbershop
INSERT INTO businesses (id, name, slug, is_open, near_threshold, max_waiting, join_cutoff_time, qr_token, rotate_qr_daily, qr_token_date, timezone)
VALUES (1, 'Juan''s Barbershop & Grooming', 'juans-barbershop', true, 3, 25, '21:30', 'juan-makati-2026', false, '2026-10-05', 'Asia/Manila')
ON CONFLICT (slug) DO NOTHING;

SELECT setval('businesses_id_seq', (SELECT COALESCE(MAX(id), 1) FROM businesses));

INSERT INTO services (id, business_id, name, prefix, default_minutes, is_active)
VALUES
  (1, 1, 'Classic Gupit & Styling', 'A', 20, true),
  (2, 1, 'Beard Sculpt & Hot Towel', 'B', 15, true),
  (3, 1, 'Executive Package (Cut + Massage)', 'C', 30, true)
ON CONFLICT (business_id, prefix) DO NOTHING;

SELECT setval('services_id_seq', (SELECT COALESCE(MAX(id), 1) FROM services));

INSERT INTO counters (id, business_id, name, is_active)
VALUES
  (1, 1, 'Chair 1 — Kuya Jun', true),
  (2, 1, 'Chair 2 — Marco', true),
  (3, 1, 'Chair 3 — Alden', true)
ON CONFLICT DO NOTHING;

SELECT setval('counters_id_seq', (SELECT COALESCE(MAX(id), 1) FROM counters));
