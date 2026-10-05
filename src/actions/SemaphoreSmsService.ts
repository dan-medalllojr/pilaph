import { db } from '../db/index.ts';
import { smsLogs, tickets } from '../db/schema.ts';
import { eq, and, isNull } from 'drizzle-orm';

export class SemaphoreSmsService {
  /**
   * Sends the "almost your turn" SMS (when ticket reaches `near_threshold`).
   * Guarded by `near_sms_sent_at` IS NULL so retries never double-send.
   */
  public static async sendNearSmsIfEligible(params: {
    ticketId: string;
    businessId: number;
    businessName: string;
    code: string;
    customerName: string;
    phone: string | null;
    aheadCount: number;
    appUrl: string;
  }): Promise<boolean> {
    if (!params.phone) return false;

    try {
      const now = new Date();
      // Atomic guard: only update if near_sms_sent_at is currently null
      const updated = await db
        .update(tickets)
        .set({ nearSmsSentAt: now })
        .where(
          and(
            eq(tickets.id, params.ticketId),
            isNull(tickets.nearSmsSentAt)
          )
        )
        .returning();

      if (updated.length === 0) {
        return false; // Already sent
      }

      const firstName =
        params.customerName.trim().split(/\s+/)[0] || 'Customer';
      const ticketLink = `${params.appUrl.replace(/\/$/, '')}/t/${params.ticketId}`;
      const peopleWord = params.aheadCount === 1 ? 'person' : 'people';
      const message = `Hi ${firstName}, ${params.aheadCount} ${peopleWord} ahead of you at ${params.businessName} (${params.code}). Track live: ${ticketLink}`;

      await this.dispatchSms({
        businessId: params.businessId,
        ticketId: params.ticketId,
        phone: params.phone,
        type: 'near',
        message,
      });

      return true;
    } catch (error) {
      console.error('Failed to process near SMS:', error);
      return false;
    }
  }

  /**
   * Sends the "called to counter" SMS when owner calls the ticket.
   * Guarded by `called_sms_sent_at` IS NULL so retries never double-send.
   */
  public static async sendCalledSmsIfEligible(params: {
    ticketId: string;
    businessId: number;
    businessName: string;
    code: string;
    counterName: string;
    phone: string | null;
    appUrl: string;
  }): Promise<boolean> {
    if (!params.phone) return false;

    try {
      const now = new Date();
      // Atomic guard: only update if called_sms_sent_at is currently null
      const updated = await db
        .update(tickets)
        .set({ calledSmsSentAt: now })
        .where(
          and(
            eq(tickets.id, params.ticketId),
            isNull(tickets.calledSmsSentAt)
          )
        )
        .returning();

      if (updated.length === 0) {
        return false; // Already sent
      }

      const ticketLink = `${params.appUrl.replace(/\/$/, '')}/t/${params.ticketId}`;
      const message = `${params.code}, please proceed to ${params.counterName} at ${params.businessName}. Ticket: ${ticketLink}`;

      await this.dispatchSms({
        businessId: params.businessId,
        ticketId: params.ticketId,
        phone: params.phone,
        type: 'called',
        message,
      });

      return true;
    } catch (error) {
      console.error('Failed to process called SMS:', error);
      return false;
    }
  }

  /**
   * Administrator SMS Simulator action:
   * Allows manually triggering a `near` or `called` SMS notification for a specific ticket
   * to verify Semaphore formatting, payload structure, and duplicate-send guard behavior.
   */
  public static async sendManualTestSms(params: {
    businessId: number;
    businessName: string;
    ticketId: string;
    code: string;
    customerName: string;
    phone: string;
    type: 'near' | 'called';
    counterName: string;
    aheadCount: number;
    enforceDuplicateGuard: boolean;
    customMessage?: string;
    appUrl: string;
  }) {
    try {
      const now = new Date();

      if (params.enforceDuplicateGuard) {
        if (params.type === 'near') {
          const updated = await db
            .update(tickets)
            .set({ nearSmsSentAt: now, phone: params.phone })
            .where(
              and(
                eq(tickets.id, params.ticketId),
                isNull(tickets.nearSmsSentAt)
              )
            )
            .returning();

          if (updated.length === 0) {
            return {
              ok: false,
              skippedByGuard: true,
              reason: `Blocked by near_sms_sent_at guard: Ticket ${params.code} already received a Near-Turn SMS today. Uncheck "Enforce Duplicate Guard" to force a test resend.`,
            };
          }
        } else {
          const updated = await db
            .update(tickets)
            .set({ calledSmsSentAt: now, phone: params.phone })
            .where(
              and(
                eq(tickets.id, params.ticketId),
                isNull(tickets.calledSmsSentAt)
              )
            )
            .returning();

          if (updated.length === 0) {
            return {
              ok: false,
              skippedByGuard: true,
              reason: `Blocked by called_sms_sent_at guard: Ticket ${params.code} already received a Called SMS today. Uncheck "Enforce Duplicate Guard" to force a test resend.`,
            };
          }
        }
      } else {
        // Force test mode: update timestamp & phone on the ticket
        await db
          .update(tickets)
          .set(
            params.type === 'near'
              ? { nearSmsSentAt: now, phone: params.phone }
              : { calledSmsSentAt: now, phone: params.phone }
          )
          .where(eq(tickets.id, params.ticketId));
      }

      const firstName =
        params.customerName.trim().split(/\s+/)[0] || 'Customer';
      const ticketLink = `${params.appUrl.replace(/\/$/, '')}/t/${params.ticketId}`;
      const peopleWord = params.aheadCount === 1 ? 'person' : 'people';

      const defaultMessage =
        params.type === 'near'
          ? `Hi ${firstName}, ${params.aheadCount} ${peopleWord} ahead of you at ${params.businessName} (${params.code}). Track live: ${ticketLink}`
          : `${params.code}, please proceed to ${params.counterName} at ${params.businessName}. Ticket: ${ticketLink}`;

      const message =
        params.customMessage && params.customMessage.trim()
          ? params.customMessage.trim()
          : defaultMessage;

      const dispatchResult = await this.dispatchSms({
        businessId: params.businessId,
        ticketId: params.ticketId,
        phone: params.phone,
        type: params.type,
        message,
      });

      return {
        ok: true,
        skippedByGuard: false,
        logEntry: dispatchResult.logEntry,
        semaphorePayload: dispatchResult.semaphorePayload,
      };
    } catch (error) {
      console.error('Database query failed in sendManualTestSms:', error);
      throw new Error('Failed to execute test SMS simulation.', {
        cause: error,
      });
    }
  }

  private static async dispatchSms(params: {
    businessId: number;
    ticketId: string;
    phone: string;
    type: 'near' | 'called';
    message: string;
  }) {
    const driver = (process.env.SMS_DRIVER || 'log').toLowerCase();
    const apiKey = process.env.SEMAPHORE_API_KEY;
    const senderName = process.env.SEMAPHORE_SENDER_NAME || 'PILAPH';

    let status = 'logged';
    let providerResponse =
      'Simulated via SMS_DRIVER=log · Ready for Semaphore PH production';

    const semaphorePayload = {
      endpoint: 'https://api.semaphore.co/api/v4/messages',
      driver: driver === 'semaphore' && apiKey ? 'semaphore' : 'log',
      sendername: senderName,
      number: params.phone,
      message: params.message,
      segments: Math.max(1, Math.ceil(params.message.length / 160)),
    };

    if (driver === 'semaphore' && apiKey) {
      try {
        const res = await fetch('https://api.semaphore.co/api/v4/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            apikey: apiKey,
            number: params.phone,
            message: params.message,
            sendername: senderName,
          }),
        });
        const text = await res.text();
        status = res.ok ? 'sent' : 'failed';
        providerResponse = text.slice(0, 500);
      } catch (err: unknown) {
        status = 'failed';
        providerResponse =
          err instanceof Error
            ? err.message
            : 'Network error calling Semaphore API';
      }
    }

    const inserted = await db
      .insert(smsLogs)
      .values({
        businessId: params.businessId,
        ticketId: params.ticketId,
        phone: params.phone,
        type: params.type,
        message: params.message,
        status,
        driver: driver === 'semaphore' && apiKey ? 'semaphore' : 'log',
        providerResponse,
      })
      .returning();

    return {
      logEntry: inserted[0],
      semaphorePayload: {
        ...semaphorePayload,
        status,
        providerResponse,
      },
    };
  }
}
