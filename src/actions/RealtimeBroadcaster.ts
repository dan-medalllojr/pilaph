import { WebSocket, WebSocketServer } from 'ws';
import { NowServingEntry } from '../types/queue.ts';

interface SubscribedClient {
  ws: WebSocket;
  channels: Set<string>;
}

class RealtimeBroadcasterService {
  private clients: Set<SubscribedClient> = new Set();

  public attachWebSocketServer(wss: WebSocketServer) {
    wss.on('connection', (ws: WebSocket) => {
      const client: SubscribedClient = {
        ws,
        channels: new Set(),
      };
      this.clients.add(client);

      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString());
          if (msg.type === 'subscribe' && typeof msg.channel === 'string') {
            client.channels.add(msg.channel);
            ws.send(
              JSON.stringify({
                type: 'subscribed',
                channel: msg.channel,
                timestamp: new Date().toISOString(),
              })
            );
          } else if (msg.type === 'unsubscribe' && typeof msg.channel === 'string') {
            client.channels.delete(msg.channel);
          } else if (msg.type === 'ping') {
            ws.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }));
          }
        } catch {
          // Ignore malformed WS frames
        }
      });

      ws.on('close', () => {
        this.clients.delete(client);
      });

      ws.on('error', () => {
        this.clients.delete(client);
      });
    });
  }

  /**
   * Broadcasts non-personal queue state signal on `queue:{business_id}`.
   * Strictly excludes customer names and phone numbers per privacy architecture.
   */
  public async broadcastQueueEvent(
    businessId: number,
    event: 'ticket.joined' | 'ticket.called' | 'ticket.updated' | 'queue.toggled',
    payload: {
      code: string | null;
      counter: string | null;
      status: string;
      waiting_count: number;
      waiting_codes: string[];
      now_serving: NowServingEntry[];
    }
  ) {
    const channel = `queue:${businessId}`;
    const message = {
      type: 'broadcast',
      channel,
      event,
      payload,
      timestamp: new Date().toISOString(),
    };

    this.sendToChannelSubscribers(channel, message);
    await this.forwardToSupabaseRestBroadcast(channel, event, payload);
  }

  /**
   * Broadcasts ticket-specific update on `ticket:{ticket_uuid}`.
   * Strictly excludes customer names and phone numbers.
   */
  public async broadcastTicketEvent(
    ticketUuid: string,
    event: 'ticket.called' | 'ticket.cancelled' | 'ticket.updated',
    payload: {
      code: string;
      counter: string | null;
      status: string;
    }
  ) {
    const channel = `ticket:${ticketUuid}`;
    const message = {
      type: 'broadcast',
      channel,
      event,
      payload,
      timestamp: new Date().toISOString(),
    };

    this.sendToChannelSubscribers(channel, message);
    await this.forwardToSupabaseRestBroadcast(channel, event, payload);
  }

  private sendToChannelSubscribers(channel: string, data: unknown) {
    const serialized = JSON.stringify(data);
    for (const client of this.clients) {
      if (
        client.ws.readyState === WebSocket.OPEN &&
        client.channels.has(channel)
      ) {
        client.ws.send(serialized);
      }
    }
  }

  /**
   * If SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided in .env,
   * also sends an HTTP POST to Supabase's Realtime REST Broadcast endpoint.
   */
  private async forwardToSupabaseRestBroadcast(
    topic: string,
    event: string,
    payload: Record<string, unknown>
  ) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) {
      return;
    }

    try {
      const endpoint = `${supabaseUrl.replace(/\/$/, '')}/realtime/v1/api/broadcast`;
      await fetch(endpoint, {
        method: 'POST',
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [
            {
              topic,
              event,
              payload,
            },
          ],
        }),
      });
    } catch (error) {
      console.error('Supabase REST Broadcast forwarding warning:', error);
    }
  }
}

export const RealtimeBroadcaster = new RealtimeBroadcasterService();
