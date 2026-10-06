// Must stay the first import: modules below (e.g. src/db/index.ts) read
// process.env at import time.
import 'dotenv/config';
import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import zlib from 'zlib';
import { WebSocketServer } from 'ws';
import { createServer as createViteServer } from 'vite';
import { and, eq, inArray } from 'drizzle-orm';

import { db } from './src/db/index.ts';
import {
  businesses,
  counters,
  pushSubscriptions,
  services,
  tickets,
} from './src/db/schema.ts';
import { getOrCreateUserWithBusiness } from './src/db/users.ts';
import { requireAuth, AuthRequest } from './src/middleware/auth.ts';
import { RealtimeBroadcaster } from './src/actions/RealtimeBroadcaster.ts';
import {
  getBusinessAnalytics,
  getOwnerDashboardState,
  getPublicQueueStateBySlug,
  getPublicTicketState,
  invalidatePublicQueueCache,
} from './src/actions/QueueCalculations.ts';
import { CreateTicket } from './src/actions/CreateTicket.ts';
import { CallNextTicket } from './src/actions/CallNextTicket.ts';
import { EndOfDayCleanup } from './src/actions/EndOfDayCleanup.ts';
import { OwnerAlerts } from './src/actions/OwnerAlerts.ts';
import { getVapidPublicKey, isPushConfigured } from './src/lib/owner-push.ts';
import { SemaphoreSmsService } from './src/actions/SemaphoreSmsService.ts';
import { normalizePhilippinePhone } from './src/actions/PhoneNormalizer.ts';
import {
  MAX_SHOP_PHOTO_BYTES,
  SHOP_PHOTO_TYPES,
  isImageOfType,
  removeShopPhoto,
  uploadShopPhoto,
} from './src/lib/shop-photos.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Minimal valid solid-slate PNG generator for PWA icons
function generateSolidPng(width: number, height: number): Buffer {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  function crc32(buf: Buffer): number {
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      crc ^= buf[i];
      for (let j = 0; j < 8; j++) {
        crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
      }
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function makeChunk(type: string, data: Buffer): Buffer {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
    return Buffer.concat([len, typeBuf, data, crcBuf]);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const rowSize = 1 + width * 3;
  const raw = Buffer.alloc(rowSize * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * rowSize;
    raw[rowStart] = 0; // filter type 0
    for (let x = 0; x < width; x++) {
      const px = rowStart + 1 + x * 3;
      const border = Math.floor(width * 0.16);
      const isInner =
        x >= border &&
        x < width - border &&
        y >= border &&
        y < height - border;
      // Outer #0F172A (15, 23, 42), Inner accent #10B981 (16, 185, 129)
      raw[px] = isInner ? 16 : 15;
      raw[px + 1] = isInner ? 185 : 23;
      raw[px + 2] = isInner ? 129 : 42;
    }
  }

  const compressed = zlib.deflateSync(raw);
  return Buffer.concat([
    signature,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', compressed),
    makeChunk('IEND', Buffer.alloc(0)),
  ]);
}

const icon180 = generateSolidPng(180, 180);
const icon192 = generateSolidPng(192, 192);
const icon512 = generateSolidPng(512, 512);

// Per-IP rate limiter for ticket creation
const ipJoinBuckets = new Map<string, { count: number; resetAt: number }>();
function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = ipJoinBuckets.get(ip);
  if (!entry || entry.resetAt < now) {
    ipJoinBuckets.set(ip, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (entry.count >= 25) {
    return false;
  }
  entry.count += 1;
  return true;
}

async function startServer() {
  const app = express();
  const server = http.createServer(app);

  // Attach WebSocket server on the same port 3000 at path `/ws`
  const wss = new WebSocketServer({ noServer: true });
  RealtimeBroadcaster.attachWebSocketServer(wss);

  server.on('upgrade', (request, socket, head) => {
    const pathname = new URL(request.url || '/', 'http://localhost:3000')
      .pathname;
    if (pathname === '/ws') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    }
  });

  app.set('trust proxy', true);
  app.use(express.json());

  // Health route (`/up`)
  app.get('/up', (_req, res) => {
    res.json({ status: 'ok', timezone: 'Asia/Manila' });
  });

  // Serve generated PNG icons for PWA compliance
  app.get('/apple-touch-icon.png', (_req, res) => {
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(icon180);
  });
  app.get('/pwa-192x192.png', (_req, res) => {
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(icon192);
  });
  app.get('/pwa-512x512.png', (_req, res) => {
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(icon512);
  });
  app.get('/pwa-maskable-512x512.png', (_req, res) => {
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(icon512);
  });

  // ============================================================================
  // PUBLIC ROUTES (No login, zero personal data in state payloads)
  // ============================================================================

  // Public queue state snapshot (`/api/q/:slug/state`)
  app.get('/api/q/:slug/state', async (req, res) => {
    try {
      const { slug } = req.params;
      const providedToken =
        typeof req.query.k === 'string' ? req.query.k.trim() : '';

      const state = await getPublicQueueStateBySlug(slug);
      if (!state) {
        return res.status(404).json({ error: 'Shop queue not found.' });
      }

      // Check QR token validity without exposing the secret token unless rotateQrDaily is true
      const bizRows = await db
        .select()
        .from(businesses)
        .where(eq(businesses.slug, slug));
      const actualToken = bizRows[0]?.qrToken || '';
      const qrTokenValid = Boolean(
        providedToken && providedToken === actualToken
      );

      res.json({
        ...state,
        qrTokenValid,
      });
    } catch (error: unknown) {
      console.error('Error in GET /api/q/:slug/state:', error);
      res.status(500).json({ error: 'Failed to fetch queue state.' });
    }
  });

  // Public create ticket (`POST /api/q/:slug/tickets`)
  app.post('/api/q/:slug/tickets', async (req, res) => {
    try {
      const clientIp = req.ip || 'unknown';
      if (!checkRateLimit(clientIp)) {
        return res.status(429).json({
          error: 'Too many requests. Please wait a moment and try again.',
        });
      }

      const appUrl =
        process.env.APP_URL || `${req.protocol}://${req.get('host')}`;

      const result = await CreateTicket.execute({
        slug: req.params.slug,
        qrToken: req.body.qrToken || req.body.k || '',
        serviceId: Number(req.body.serviceId),
        customerName: req.body.customerName || '',
        phone: req.body.phone || null,
        idempotencyKey: req.body.idempotencyKey || '',
        deviceId: req.body.deviceId || '',
        honeypot: req.body.website || '',
        appUrl,
      });

      if (!result.ok) {
        return res.status(result.status).json({ error: result.error });
      }

      res.status(result.status).json({
        alreadyActive: Boolean(result.alreadyActive),
        idempotentReplay: Boolean(result.idempotentReplay),
        ticket: result.ticket,
      });
    } catch (error: unknown) {
      console.error('Error in POST /api/q/:slug/tickets:', error);
      res.status(500).json({ error: 'Failed to join the queue.' });
    }
  });

  // Public single ticket state (`GET /api/t/:ticketId/state`)
  app.get('/api/t/:ticketId/state', async (req, res) => {
    try {
      const state = await getPublicTicketState(req.params.ticketId);
      if (!state) {
        return res.status(404).json({ error: 'Ticket not found.' });
      }
      res.json(state);
    } catch (error: unknown) {
      console.error('Error in GET /api/t/:ticketId/state:', error);
      res.status(500).json({ error: 'Failed to fetch ticket state.' });
    }
  });

  // Public cancel ticket (`POST /api/t/:ticketId/cancel`)
  app.post('/api/t/:ticketId/cancel', async (req, res) => {
    try {
      const ticketId = req.params.ticketId;
      const existing = await db
        .select()
        .from(tickets)
        .where(eq(tickets.id, ticketId));

      if (existing.length === 0) {
        return res.status(404).json({ error: 'Ticket not found.' });
      }
      const t = existing[0];

      // Status-checked update: only `waiting` or `called` -> `cancelled`
      if (t.status === 'waiting' || t.status === 'called') {
        await db
          .update(tickets)
          .set({
            status: 'cancelled',
            completedAt: new Date(),
          })
          .where(
            and(
              eq(tickets.id, ticketId),
              inArray(tickets.status, ['waiting', 'called'])
            )
          );

        invalidatePublicQueueCache(t.businessId);
        const bizRows = await db
          .select()
          .from(businesses)
          .where(eq(businesses.id, t.businessId));

        if (bizRows.length > 0) {
          const freshPublic = await getPublicQueueStateBySlug(
            bizRows[0].slug,
            true
          );
          if (freshPublic) {
            await RealtimeBroadcaster.broadcastQueueEvent(
              t.businessId,
              'ticket.updated',
              {
                code: t.code,
                counter: null,
                status: 'cancelled',
                waiting_count: freshPublic.waitingCount,
                waiting_codes: freshPublic.waitingCodes,
                now_serving: freshPublic.nowServing,
              }
            );
          }
        }

        await RealtimeBroadcaster.broadcastTicketEvent(
          ticketId,
          'ticket.cancelled',
          {
            code: t.code,
            counter: null,
            status: 'cancelled',
          }
        );
      }

      const freshTicket = await getPublicTicketState(ticketId);
      res.json({ ticket: freshTicket });
    } catch (error: unknown) {
      console.error('Error in POST /api/t/:ticketId/cancel:', error);
      res.status(500).json({ error: 'Failed to cancel ticket.' });
    }
  });

  // ============================================================================
  // OWNER AUTHENTICATED ROUTES (Scoped to owner's business via policy)
  // ============================================================================

  async function resolveOwnerBusinessId(req: AuthRequest): Promise<number> {
    const uid = req.user!.uid;
    const email = req.user!.email || 'owner@barbershop.ph';
    const name = req.user!.name || email.split('@')[0];
    const userRecord = await getOrCreateUserWithBusiness(uid, email, name);
    if (!userRecord.businessId) {
      throw new Error('User has no associated business.');
    }
    return userRecord.businessId;
  }

  // GET /api/dashboard/state
  app.get(
    '/api/dashboard/state',
    requireAuth,
    async (req: AuthRequest, res) => {
      try {
        const businessId = await resolveOwnerBusinessId(req);
        const state = await getOwnerDashboardState(businessId);
        res.json(state);
      } catch (error: unknown) {
        console.error('Error in GET /api/dashboard/state:', error);
        res
          .status(500)
          .json({ error: 'Failed to load owner dashboard state.' });
      }
    }
  );

  // POST /api/dashboard/counters/:counterId/call-next
  app.post(
    '/api/dashboard/counters/:counterId/call-next',
    requireAuth,
    async (req: AuthRequest, res) => {
      try {
        const businessId = await resolveOwnerBusinessId(req);
        const counterId = Number(req.params.counterId);
        const expectedCurrentTicketId =
          req.body.expected_current_ticket_id ?? null;
        const appUrl =
          process.env.APP_URL || `${req.protocol}://${req.get('host')}`;

        const result = await CallNextTicket.execute({
          businessId,
          counterId,
          expectedCurrentTicketId,
          appUrl,
        });

        res.status(result.status).json(result);
      } catch (error: unknown) {
        console.error('Error in call-next:', error);
        res.status(500).json({ error: 'Failed to call next customer.' });
      }
    }
  );

  // POST /api/dashboard/tickets/:ticketId/done
  app.post(
    '/api/dashboard/tickets/:ticketId/done',
    requireAuth,
    async (req: AuthRequest, res) => {
      try {
        const businessId = await resolveOwnerBusinessId(req);
        const ticketId = String(req.params.ticketId);

        // Status-checked update (`called -> done`) scoped to businessId
        const updated = await db
          .update(tickets)
          .set({
            status: 'done',
            completedAt: new Date(),
          })
          .where(
            and(
              eq(tickets.id, ticketId),
              eq(tickets.businessId, businessId),
              eq(tickets.status, 'called')
            )
          )
          .returning();

        if (updated.length > 0) {
          const t = updated[0];
          invalidatePublicQueueCache(businessId);
          const bizRows = await db
            .select()
            .from(businesses)
            .where(eq(businesses.id, businessId));
          if (bizRows.length > 0) {
            const freshPublic = await getPublicQueueStateBySlug(
              bizRows[0].slug,
              true
            );
            if (freshPublic) {
              await RealtimeBroadcaster.broadcastQueueEvent(
                businessId,
                'ticket.updated',
                {
                  code: t.code,
                  counter: null,
                  status: 'done',
                  waiting_count: freshPublic.waitingCount,
                  waiting_codes: freshPublic.waitingCodes,
                  now_serving: freshPublic.nowServing,
                }
              );
            }
          }
          await RealtimeBroadcaster.broadcastTicketEvent(
            ticketId,
            'ticket.updated',
            {
              code: t.code,
              counter: null,
              status: 'done',
            }
          );
        }

        const dashboard = await getOwnerDashboardState(businessId);
        res.json({ ok: true, dashboard });
      } catch (error: unknown) {
        console.error('Error marking ticket done:', error);
        res.status(500).json({ error: 'Failed to mark ticket as done.' });
      }
    }
  );

  // POST /api/dashboard/tickets/:ticketId/no-show
  app.post(
    '/api/dashboard/tickets/:ticketId/no-show',
    requireAuth,
    async (req: AuthRequest, res) => {
      try {
        const businessId = await resolveOwnerBusinessId(req);
        const ticketId = String(req.params.ticketId);

        // Status-checked update (`called -> no_show`) scoped to businessId
        const updated = await db
          .update(tickets)
          .set({
            status: 'no_show',
            completedAt: new Date(),
          })
          .where(
            and(
              eq(tickets.id, ticketId),
              eq(tickets.businessId, businessId),
              eq(tickets.status, 'called')
            )
          )
          .returning();

        if (updated.length > 0) {
          const t = updated[0];
          invalidatePublicQueueCache(businessId);
          const bizRows = await db
            .select()
            .from(businesses)
            .where(eq(businesses.id, businessId));
          if (bizRows.length > 0) {
            const freshPublic = await getPublicQueueStateBySlug(
              bizRows[0].slug,
              true
            );
            if (freshPublic) {
              await RealtimeBroadcaster.broadcastQueueEvent(
                businessId,
                'ticket.updated',
                {
                  code: t.code,
                  counter: null,
                  status: 'no_show',
                  waiting_count: freshPublic.waitingCount,
                  waiting_codes: freshPublic.waitingCodes,
                  now_serving: freshPublic.nowServing,
                }
              );
            }
          }
          await RealtimeBroadcaster.broadcastTicketEvent(
            ticketId,
            'ticket.updated',
            {
              code: t.code,
              counter: null,
              status: 'no_show',
            }
          );
        }

        const dashboard = await getOwnerDashboardState(businessId);
        res.json({ ok: true, dashboard });
      } catch (error: unknown) {
        console.error('Error marking ticket no-show:', error);
        res.status(500).json({ error: 'Failed to mark ticket as no-show.' });
      }
    }
  );

  // POST /api/dashboard/tickets/:ticketId/recall
  app.post(
    '/api/dashboard/tickets/:ticketId/recall',
    requireAuth,
    async (req: AuthRequest, res) => {
      try {
        const businessId = await resolveOwnerBusinessId(req);
        const ticketId = String(req.params.ticketId);

        const updated = await db
          .update(tickets)
          .set({ calledAt: new Date() })
          .where(
            and(
              eq(tickets.id, ticketId),
              eq(tickets.businessId, businessId),
              eq(tickets.status, 'called')
            )
          )
          .returning();

        if (updated.length > 0) {
          const t = updated[0];
          const [bizRows, ctrRows] = await Promise.all([
            db.select().from(businesses).where(eq(businesses.id, businessId)),
            t.counterId
              ? db.select().from(counters).where(eq(counters.id, t.counterId))
              : Promise.resolve([]),
          ]);
          const counterName = ctrRows[0]?.name || 'Counter';

          invalidatePublicQueueCache(businessId);
          if (bizRows.length > 0) {
            const freshPublic = await getPublicQueueStateBySlug(
              bizRows[0].slug,
              true
            );
            if (freshPublic) {
              await RealtimeBroadcaster.broadcastQueueEvent(
                businessId,
                'ticket.called',
                {
                  code: t.code,
                  counter: counterName,
                  status: 'called',
                  waiting_count: freshPublic.waitingCount,
                  waiting_codes: freshPublic.waitingCodes,
                  now_serving: freshPublic.nowServing,
                }
              );
            }
          }

          await RealtimeBroadcaster.broadcastTicketEvent(
            ticketId,
            'ticket.called',
            {
              code: t.code,
              counter: counterName,
              status: 'called',
            }
          );
        }

        const dashboard = await getOwnerDashboardState(businessId);
        res.json({
          ok: true,
          message:
            updated.length > 0
              ? `Re-announced ${updated[0].code} on TV & customer ticket screen.`
              : 'Ticket is no longer active.',
          dashboard,
        });
      } catch (error: unknown) {
        console.error('Error recalling ticket:', error);
        res.status(500).json({ error: 'Failed to recall ticket.' });
      }
    }
  );

  // POST /api/dashboard/tickets/bulk-remove
  app.post(
    '/api/dashboard/tickets/bulk-remove',
    requireAuth,
    async (req: AuthRequest, res) => {
      try {
        const businessId = await resolveOwnerBusinessId(req);
        const ticketIds: string[] = Array.isArray(req.body.ticketIds)
          ? req.body.ticketIds.map(String)
          : [];

        if (ticketIds.length === 0) {
          return res
            .status(422)
            .json({ error: 'Select at least one ticket to remove.' });
        }

        const removed = await db
          .update(tickets)
          .set({
            status: 'cancelled',
            completedAt: new Date(),
          })
          .where(
            and(
              eq(tickets.businessId, businessId),
              inArray(tickets.id, ticketIds),
              eq(tickets.status, 'waiting')
            )
          )
          .returning();

        invalidatePublicQueueCache(businessId);
        const bizRows = await db
          .select()
          .from(businesses)
          .where(eq(businesses.id, businessId));
        if (bizRows.length > 0) {
          const freshPublic = await getPublicQueueStateBySlug(
            bizRows[0].slug,
            true
          );
          if (freshPublic) {
            await RealtimeBroadcaster.broadcastQueueEvent(
              businessId,
              'ticket.updated',
              {
                code: null,
                counter: null,
                status: 'cancelled',
                waiting_count: freshPublic.waitingCount,
                waiting_codes: freshPublic.waitingCodes,
                now_serving: freshPublic.nowServing,
              }
            );
          }
        }

        for (const r of removed) {
          await RealtimeBroadcaster.broadcastTicketEvent(
            r.id,
            'ticket.cancelled',
            {
              code: r.code,
              counter: null,
              status: 'cancelled',
            }
          );
        }

        const dashboard = await getOwnerDashboardState(businessId);
        res.json({
          ok: true,
          removedCount: removed.length,
          dashboard,
        });
      } catch (error: unknown) {
        console.error('Error in bulk-remove:', error);
        res.status(500).json({ error: 'Failed to bulk-remove tickets.' });
      }
    }
  );

  // POST /api/dashboard/queue/toggle
  app.post(
    '/api/dashboard/queue/toggle',
    requireAuth,
    async (req: AuthRequest, res) => {
      try {
        const businessId = await resolveOwnerBusinessId(req);
        const bizRows = await db
          .select()
          .from(businesses)
          .where(eq(businesses.id, businessId));
        if (bizRows.length === 0) {
          return res.status(404).json({ error: 'Business not found.' });
        }
        const current = bizRows[0];
        const nextOpen =
          typeof req.body.isOpen === 'boolean'
            ? req.body.isOpen
            : !current.isOpen;

        await db
          .update(businesses)
          .set({ isOpen: nextOpen })
          .where(eq(businesses.id, businessId));

        invalidatePublicQueueCache(businessId);
        const freshPublic = await getPublicQueueStateBySlug(current.slug, true);
        if (freshPublic) {
          await RealtimeBroadcaster.broadcastQueueEvent(
            businessId,
            'queue.toggled',
            {
              code: null,
              counter: null,
              status: nextOpen ? 'open' : 'paused',
              waiting_count: freshPublic.waitingCount,
              waiting_codes: freshPublic.waitingCodes,
              now_serving: freshPublic.nowServing,
            }
          );
        }

        const dashboard = await getOwnerDashboardState(businessId);
        res.json({ ok: true, isOpen: nextOpen, dashboard });
      } catch (error: unknown) {
        console.error('Error toggling queue:', error);
        res.status(500).json({ error: 'Failed to toggle queue status.' });
      }
    }
  );

  // PUT /api/dashboard/business (Update business settings & QR rotation)
  app.put(
    '/api/dashboard/business',
    requireAuth,
    async (req: AuthRequest, res) => {
      try {
        const businessId = await resolveOwnerBusinessId(req);
        const bizRows = await db
          .select()
          .from(businesses)
          .where(eq(businesses.id, businessId));
        if (bizRows.length === 0) {
          return res.status(404).json({ error: 'Business not found.' });
        }
        const current = bizRows[0];

        const name = (req.body.name || current.name).trim();
        const nearThreshold = Math.max(
          1,
          Math.min(10, Number(req.body.nearThreshold ?? current.nearThreshold))
        );
        const maxWaiting =
          req.body.maxWaiting === '' || req.body.maxWaiting === null
            ? null
            : Math.max(1, Number(req.body.maxWaiting));
        const joinCutoffTime =
          req.body.joinCutoffTime === '' || req.body.joinCutoffTime === null
            ? null
            : String(req.body.joinCutoffTime).trim();
        const rotateQrDaily =
          typeof req.body.rotateQrDaily === 'boolean'
            ? req.body.rotateQrDaily
            : current.rotateQrDaily;

        let qrToken = current.qrToken;
        if (req.body.regenerateQrToken) {
          qrToken = `${current.slug}-${Math.random()
            .toString(36)
            .substring(2, 8)}`;
        }

        await db
          .update(businesses)
          .set({
            name,
            nearThreshold,
            maxWaiting,
            joinCutoffTime,
            rotateQrDaily,
            qrToken,
          })
          .where(eq(businesses.id, businessId));

        invalidatePublicQueueCache(businessId);
        const dashboard = await getOwnerDashboardState(businessId);
        res.json({ ok: true, dashboard });
      } catch (error: unknown) {
        console.error('Error updating business settings:', error);
        res.status(500).json({ error: 'Failed to save business settings.' });
      }
    }
  );

  // POST /api/dashboard/business/photo (raw image body; shown on the customer join page)
  app.post(
    '/api/dashboard/business/photo',
    requireAuth,
    express.raw({ type: SHOP_PHOTO_TYPES, limit: MAX_SHOP_PHOTO_BYTES }),
    async (req: AuthRequest, res) => {
      try {
        const businessId = await resolveOwnerBusinessId(req);
        const contentType = String(req.headers['content-type'] || '')
          .split(';')[0]
          .trim();
        const bytes = req.body;
        if (
          !Buffer.isBuffer(bytes) ||
          bytes.length === 0 ||
          !isImageOfType(bytes, contentType)
        ) {
          return res
            .status(400)
            .json({ error: 'Upload a JPG, PNG or WebP photo.' });
        }

        const bizRows = await db
          .select()
          .from(businesses)
          .where(eq(businesses.id, businessId));
        const previousUrl = bizRows[0]?.photoUrl ?? null;

        const photoUrl = await uploadShopPhoto(businessId, bytes, contentType);
        await db
          .update(businesses)
          .set({ photoUrl })
          .where(eq(businesses.id, businessId));
        await removeShopPhoto(previousUrl);

        invalidatePublicQueueCache(businessId);
        const dashboard = await getOwnerDashboardState(businessId);
        res.json({ ok: true, dashboard });
      } catch (error: unknown) {
        console.error('Error uploading shop photo:', error);
        res.status(500).json({ error: 'Failed to upload shop photo.' });
      }
    }
  );

  // DELETE /api/dashboard/business/photo
  app.delete(
    '/api/dashboard/business/photo',
    requireAuth,
    async (req: AuthRequest, res) => {
      try {
        const businessId = await resolveOwnerBusinessId(req);
        const bizRows = await db
          .select()
          .from(businesses)
          .where(eq(businesses.id, businessId));
        const previousUrl = bizRows[0]?.photoUrl ?? null;

        await db
          .update(businesses)
          .set({ photoUrl: null })
          .where(eq(businesses.id, businessId));
        await removeShopPhoto(previousUrl);

        invalidatePublicQueueCache(businessId);
        const dashboard = await getOwnerDashboardState(businessId);
        res.json({ ok: true, dashboard });
      } catch (error: unknown) {
        console.error('Error removing shop photo:', error);
        res.status(500).json({ error: 'Failed to remove shop photo.' });
      }
    }
  );

  // Services CRUD
  app.post(
    '/api/dashboard/services',
    requireAuth,
    async (req: AuthRequest, res) => {
      try {
        const businessId = await resolveOwnerBusinessId(req);
        const name = String(req.body.name || '').trim();
        const prefix = String(req.body.prefix || '')
          .trim()
          .toUpperCase()
          .slice(0, 2);
        const defaultMinutes = Math.max(
          3,
          Math.min(180, Number(req.body.defaultMinutes || 15))
        );

        if (!name || !prefix) {
          return res
            .status(422)
            .json({ error: 'Service name and ticket prefix are required.' });
        }

        await db.insert(services).values({
          businessId,
          name,
          prefix,
          defaultMinutes,
          isActive: true,
        });

        invalidatePublicQueueCache(businessId);
        const dashboard = await getOwnerDashboardState(businessId);
        res.status(201).json({ ok: true, dashboard });
      } catch (error: unknown) {
        console.error('Error creating service:', error);
        res.status(422).json({
          error:
            'Could not create service (ensure prefix is unique for your shop).',
        });
      }
    }
  );

  app.put(
    '/api/dashboard/services/:id',
    requireAuth,
    async (req: AuthRequest, res) => {
      try {
        const businessId = await resolveOwnerBusinessId(req);
        const serviceId = Number(req.params.id);

        const existing = await db
          .select()
          .from(services)
          .where(
            and(
              eq(services.id, serviceId),
              eq(services.businessId, businessId)
            )
          );
        if (existing.length === 0) {
          return res.status(404).json({ error: 'Service not found.' });
        }

        const cur = existing[0];
        await db
          .update(services)
          .set({
            name:
              req.body.name !== undefined
                ? String(req.body.name).trim()
                : cur.name,
            prefix:
              req.body.prefix !== undefined
                ? String(req.body.prefix).trim().toUpperCase().slice(0, 2)
                : cur.prefix,
            defaultMinutes:
              req.body.defaultMinutes !== undefined
                ? Math.max(3, Number(req.body.defaultMinutes))
                : cur.defaultMinutes,
            isActive:
              typeof req.body.isActive === 'boolean'
                ? req.body.isActive
                : cur.isActive,
          })
          .where(
            and(
              eq(services.id, serviceId),
              eq(services.businessId, businessId)
            )
          );

        invalidatePublicQueueCache(businessId);
        const dashboard = await getOwnerDashboardState(businessId);
        res.json({ ok: true, dashboard });
      } catch (error: unknown) {
        console.error('Error updating service:', error);
        res.status(500).json({ error: 'Failed to update service.' });
      }
    }
  );

  // DELETE /api/dashboard/services/:id (only services no ticket has used)
  app.delete(
    '/api/dashboard/services/:id',
    requireAuth,
    async (req: AuthRequest, res) => {
      try {
        const businessId = await resolveOwnerBusinessId(req);
        const serviceId = Number(req.params.id);

        const existing = await db
          .select()
          .from(services)
          .where(
            and(
              eq(services.id, serviceId),
              eq(services.businessId, businessId)
            )
          );
        if (existing.length === 0) {
          return res.status(404).json({ error: 'Service not found.' });
        }

        // Tickets keep their service for history and stats.
        const used = await db
          .select({ id: tickets.id })
          .from(tickets)
          .where(eq(tickets.serviceId, serviceId))
          .limit(1);
        if (used.length > 0) {
          return res.status(409).json({
            error:
              'This service already has tickets, so it cannot be deleted. Set it to Inactive instead.',
          });
        }

        await db
          .delete(services)
          .where(
            and(
              eq(services.id, serviceId),
              eq(services.businessId, businessId)
            )
          );

        invalidatePublicQueueCache(businessId);
        const dashboard = await getOwnerDashboardState(businessId);
        res.json({ ok: true, dashboard });
      } catch (error: unknown) {
        console.error('Error deleting service:', error);
        res.status(500).json({ error: 'Failed to delete service.' });
      }
    }
  );

  // Counters CRUD
  app.post(
    '/api/dashboard/counters',
    requireAuth,
    async (req: AuthRequest, res) => {
      try {
        const businessId = await resolveOwnerBusinessId(req);
        const name = String(req.body.name || '').trim();
        if (!name) {
          return res.status(422).json({ error: 'Counter name is required.' });
        }

        await db.insert(counters).values({
          businessId,
          name,
          isActive: true,
        });

        invalidatePublicQueueCache(businessId);
        const dashboard = await getOwnerDashboardState(businessId);
        res.status(201).json({ ok: true, dashboard });
      } catch (error: unknown) {
        console.error('Error creating counter:', error);
        res.status(500).json({ error: 'Failed to create counter.' });
      }
    }
  );

  app.put(
    '/api/dashboard/counters/:id',
    requireAuth,
    async (req: AuthRequest, res) => {
      try {
        const businessId = await resolveOwnerBusinessId(req);
        const counterId = Number(req.params.id);

        const existing = await db
          .select()
          .from(counters)
          .where(
            and(
              eq(counters.id, counterId),
              eq(counters.businessId, businessId)
            )
          );
        if (existing.length === 0) {
          return res.status(404).json({ error: 'Counter not found.' });
        }

        const cur = existing[0];
        await db
          .update(counters)
          .set({
            name:
              req.body.name !== undefined
                ? String(req.body.name).trim()
                : cur.name,
            isActive:
              typeof req.body.isActive === 'boolean'
                ? req.body.isActive
                : cur.isActive,
          })
          .where(
            and(
              eq(counters.id, counterId),
              eq(counters.businessId, businessId)
            )
          );

        invalidatePublicQueueCache(businessId);
        const dashboard = await getOwnerDashboardState(businessId);
        res.json({ ok: true, dashboard });
      } catch (error: unknown) {
        console.error('Error updating counter:', error);
        res.status(500).json({ error: 'Failed to update counter.' });
      }
    }
  );

  // DELETE /api/dashboard/counters/:id (only chairs no ticket has used)
  app.delete(
    '/api/dashboard/counters/:id',
    requireAuth,
    async (req: AuthRequest, res) => {
      try {
        const businessId = await resolveOwnerBusinessId(req);
        const counterId = Number(req.params.id);

        const existing = await db
          .select()
          .from(counters)
          .where(
            and(
              eq(counters.id, counterId),
              eq(counters.businessId, businessId)
            )
          );
        if (existing.length === 0) {
          return res.status(404).json({ error: 'Counter not found.' });
        }

        // Tickets keep the chair that served them for history and stats.
        const used = await db
          .select({ id: tickets.id })
          .from(tickets)
          .where(eq(tickets.counterId, counterId))
          .limit(1);
        if (used.length > 0) {
          return res.status(409).json({
            error:
              'This chair has already served tickets, so it cannot be deleted. Set it to Offline instead.',
          });
        }

        await db
          .delete(counters)
          .where(
            and(
              eq(counters.id, counterId),
              eq(counters.businessId, businessId)
            )
          );

        invalidatePublicQueueCache(businessId);
        const dashboard = await getOwnerDashboardState(businessId);
        res.json({ ok: true, dashboard });
      } catch (error: unknown) {
        console.error('Error deleting counter:', error);
        res.status(500).json({ error: 'Failed to delete counter.' });
      }
    }
  );

  // GET /api/dashboard/stats
  app.get(
    '/api/dashboard/stats',
    requireAuth,
    async (req: AuthRequest, res) => {
      try {
        const businessId = await resolveOwnerBusinessId(req);
        const stats = await getBusinessAnalytics(businessId);
        res.json(stats);
      } catch (error: unknown) {
        console.error('Error loading stats:', error);
        res.status(500).json({ error: 'Failed to load queue statistics.' });
      }
    }
  );

  // POST /api/dashboard/sms/simulate (Manual Admin SMS Simulator for Semaphore Verification)
  app.post(
    '/api/dashboard/sms/simulate',
    requireAuth,
    async (req: AuthRequest, res) => {
      try {
        const businessId = await resolveOwnerBusinessId(req);
        const ticketId = String(req.body.ticketId || '').trim();
        const type: 'near' | 'called' =
          req.body.type === 'called' ? 'called' : 'near';
        const rawPhone = String(req.body.phone || '').trim();
        const counterName = String(
          req.body.counterName || 'Counter 1'
        ).trim();
        const aheadCount = Math.max(0, Number(req.body.aheadCount ?? 2));
        const enforceDuplicateGuard = Boolean(req.body.enforceDuplicateGuard);
        const customMessage =
          typeof req.body.customMessage === 'string'
            ? req.body.customMessage
            : undefined;

        const [bizRows, ticketRows] = await Promise.all([
          db.select().from(businesses).where(eq(businesses.id, businessId)),
          db
            .select()
            .from(tickets)
            .where(
              and(
                eq(tickets.id, ticketId),
                eq(tickets.businessId, businessId)
              )
            ),
        ]);

        if (bizRows.length === 0 || ticketRows.length === 0) {
          return res
            .status(404)
            .json({ error: 'Selected ticket not found for this business.' });
        }

        const biz = bizRows[0];
        const ticket = ticketRows[0];

        const normalizedPhone = normalizePhilippinePhone(
          rawPhone || ticket.phone
        );
        if (!normalizedPhone) {
          return res.status(422).json({
            error:
              'Please provide a valid Philippine mobile number (e.g. 0917 123 4567).',
          });
        }

        const appUrl =
          process.env.APP_URL || `${req.protocol}://${req.get('host')}`;

        const simResult = await SemaphoreSmsService.sendManualTestSms({
          businessId,
          businessName: biz.name,
          ticketId: ticket.id,
          code: ticket.code,
          customerName: ticket.customerName,
          phone: normalizedPhone,
          type,
          counterName,
          aheadCount,
          enforceDuplicateGuard,
          customMessage,
          appUrl,
        });

        const dashboard = await getOwnerDashboardState(businessId);
        res.json({
          ...simResult,
          dashboard,
        });
      } catch (error: unknown) {
        console.error('Error in POST /api/dashboard/sms/simulate:', error);
        res
          .status(500)
          .json({ error: 'Failed to simulate Semaphore SMS dispatch.' });
      }
    }
  );

  // GET /api/dashboard/push/public-key (VAPID public key the browser subscribes with)
  app.get(
    '/api/dashboard/push/public-key',
    requireAuth,
    (_req: AuthRequest, res) => {
      const publicKey = getVapidPublicKey();
      if (!publicKey) {
        return res
          .status(503)
          .json({ error: 'Owner alerts are not set up on this server.' });
      }
      res.json({ publicKey });
    }
  );

  // POST /api/dashboard/push-subscriptions (save this device's browser push subscription)
  app.post(
    '/api/dashboard/push-subscriptions',
    requireAuth,
    async (req: AuthRequest, res) => {
      try {
        const businessId = await resolveOwnerBusinessId(req);
        const endpoint = String(req.body.endpoint || '');
        const p256dh = String(req.body.keys?.p256dh || '');
        const authKey = String(req.body.keys?.auth || '');
        // Real push services only use HTTPS endpoints.
        if (
          !endpoint.startsWith('https://') ||
          endpoint.length > 1000 ||
          !p256dh ||
          p256dh.length > 200 ||
          !authKey ||
          authKey.length > 100
        ) {
          return res.status(400).json({ error: 'Invalid push subscription.' });
        }

        const userAgent = (req.get('user-agent') || '').slice(0, 300) || null;
        await db
          .insert(pushSubscriptions)
          .values({
            businessId,
            userUid: req.user!.uid,
            endpoint,
            p256dh,
            auth: authKey,
            userAgent,
          })
          .onConflictDoUpdate({
            target: pushSubscriptions.endpoint,
            set: {
              businessId,
              userUid: req.user!.uid,
              p256dh,
              auth: authKey,
              userAgent,
            },
          });

        res.status(201).json({ ok: true });
      } catch (error: unknown) {
        console.error('Error saving push subscription:', error);
        res.status(500).json({ error: 'Failed to save push subscription.' });
      }
    }
  );

  // DELETE /api/dashboard/push-subscriptions (turn off alerts on this device)
  app.delete(
    '/api/dashboard/push-subscriptions',
    requireAuth,
    async (req: AuthRequest, res) => {
      try {
        const endpoint = String(req.body.endpoint || '');
        await db
          .delete(pushSubscriptions)
          .where(
            and(
              eq(pushSubscriptions.endpoint, endpoint),
              eq(pushSubscriptions.userUid, req.user!.uid)
            )
          );
        res.json({ ok: true });
      } catch (error: unknown) {
        console.error('Error removing push subscription:', error);
        res.status(500).json({ error: 'Failed to remove push subscription.' });
      }
    }
  );

  // POST /api/dashboard/end-of-day-cleanup (run the nightly cleanup now for the owner's shop)
  app.post(
    '/api/dashboard/end-of-day-cleanup',
    requireAuth,
    async (req: AuthRequest, res) => {
      try {
        const businessId = await resolveOwnerBusinessId(req);
        const cleanupResult =
          await EndOfDayCleanup.execute(businessId);
        const dashboard = await getOwnerDashboardState(businessId);
        res.json({
          ok: true,
          message: `End-of-day cleanup completed (${cleanupResult?.cancelledWaitingCount || 0} waiting cancelled, ${cleanupResult?.markedNoShowCount || 0} called marked no-show).`,
          dashboard,
        });
      } catch (error: unknown) {
        console.error('Error in end-of-day-cleanup:', error);
        res.status(500).json({ error: 'Failed to run end-of-day cleanup.' });
      }
    }
  );

  // ============================================================================
  // VITE DEV MIDDLEWARE OR STATIC DIST SERVING
  // ============================================================================
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = Number(process.env.PORT) || 3000;
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`PilaPH server listening on http://0.0.0.0:${PORT}`);
  });

  // Owner "join cutoff is near" alerts. Checked twice a minute; each shop
  // gets at most one reminder per day.
  if (isPushConfigured()) {
    setInterval(() => {
      void OwnerAlerts.remindUpcomingCutoffs();
    }, 30 * 1000);
  }
}

startServer();
