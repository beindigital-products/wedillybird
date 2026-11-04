import { v } from 'convex/values';
import { action } from './_generated/server';
import { internal } from './_generated/api';
import {
  DEFAULT_INVITATION_STYLE,
  DEFAULT_PERSONAL_MESSAGE_FALLBACK,
  type InvitationStyleId,
  getMetaTemplateName,
  getTicketTemplateName,
} from '../lib/whatsapp/templates';
import { qrImageUrl } from '../lib/guests/qr';
import { sendWhatsAppCloudTemplate, isWhatsAppCloudConfigured } from './lib/whatsappCloud';
import { resolveChannel } from './lib/channelRouting';
import { isTwilioConfigured, sendTwilioSms } from './lib/twilioSms';

/**
 * Délai avant le contrôle de livraison post-broadcast : on laisse les
 * StatusCallback Twilio arriver (queued → delivered/undelivered/failed) avant de
 * calculer le taux de non-livraison et d'alerter l'ops (mode d'échec F4).
 */
const DELIVERABILITY_CHECK_DELAY_MS = 15 * 60 * 1000;

interface BroadcastResult {
  sent: number;
  failed: number;
  skipped: number;
  total: number;
  style: InvitationStyleId;
  mock: boolean;
}

/**
 * Broadcast les invitations WhatsApp à tous les guests d'un event qui :
 *  1. ont un phone E.164
 *  2. n'ont pas encore reçu leur invitation (invitationSentAt undefined)
 *
 * Utilise le template Meta correspondant au `messagingConfig.templateStyle`
 * du event (default: warm). Marker chaque guest avec invitationSentAt après
 * succès. Idempotent : un re-run skip les déjà-envoyés.
 *
 * Mode mock auto si WHATSAPP_ACCESS_TOKEN absent (logs en console — utile
 * en dev sans creds Meta).
 */
export const broadcast = action({
  args: {
    eventId: v.id('events'),
    requesterId: v.id('users'),
  },
  handler: async (ctx, { eventId, requesterId }): Promise<BroadcastResult> => {
    const event = await ctx.runQuery(internal.events._getForBroadcast, {
      eventId,
      requesterId,
    });
    if (!event) throw new Error('EVENT_NOT_FOUND_OR_FORBIDDEN');

    if (event.status !== 'active') {
      throw new Error('EVENT_NOT_PUBLISHED');
    }

    const guests = await ctx.runQuery(internal.guests.listToInvite, { eventId });
    const styleId: InvitationStyleId =
      event.messagingConfig?.templateStyle ?? DEFAULT_INVITATION_STYLE;

    if (guests.length === 0) {
      return { sent: 0, failed: 0, skipped: 0, total: 0, style: styleId, mock: false };
    }

    const personalMessage =
      event.messagingConfig?.personalMessage?.trim() || DEFAULT_PERSONAL_MESSAGE_FALLBACK;

    const coupleNames = `${event.coupleNames.partnerA} & ${event.coupleNames.partnerB}`;
    const eventDateFormatted = new Intl.DateTimeFormat('fr', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: event.timezone,
    }).format(new Date(event.eventDate));
    // Version EN de la date + base URL pour les invitations SMS (invités
    // US/Canada). La copie SMS est en anglais car le routage SMS cible le +1.
    const eventDateEn = new Intl.DateTimeFormat('en-US', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: event.timezone,
    }).format(new Date(event.eventDate));
    const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://wedillybird.com';
    // URL du webhook StatusCallback Twilio : Twilio y POST le statut de livraison
    // réel de chaque SMS (delivered/undelivered/failed) — cf. convex/smsDeliveries.
    const smsStatusCallbackUrl = `${appBaseUrl}/api/webhooks/twilio`;

    const templateName = getMetaTemplateName(styleId, process.env);
    const isMock = !isWhatsAppCloudConfigured();

    let sent = 0;
    let failed = 0;

    for (const guest of guests) {
      const guestFirstName = guest.fullName.split(' ')[0] ?? guest.fullName;

      // Routage canal : invités +1 (US/Canada) → SMS Twilio si configuré,
      // sinon WhatsApp (comportement historique). Gated sur isTwilioConfigured
      // → inerte tant que Twilio n'est pas live (tout part en WhatsApp).
      if (resolveChannel(guest.phone) === 'sms' && isTwilioConfigured()) {
        const rsvpUrl = `${appBaseUrl}/en/i/${guest.qrCodeToken}`;
        const smsResult = await sendTwilioSms({
          to: guest.phone,
          body: `${guestFirstName}, ${coupleNames} invite you to their wedding on ${eventDateEn}. ${personalMessage} RSVP: ${rsvpUrl} Reply STOP to opt out.`,
          statusCallback: smsStatusCallbackUrl,
        });
        if (!smsResult.ok) {
          console.error(`[broadcast] SMS failed for ${guest.phone}: ${smsResult.error}`);
          failed++;
          continue;
        }
        if (smsResult.mock) {
          console.info(`[twilio:mock] INVITATION SMS -> ${guest.phone} | ${guest.fullName}`);
        }
        await ctx.runMutation(internal.guests.markInvitationSent, {
          guestId: guest._id,
          channel: 'sms' as const,
        });
        // Journalise l'envoi : le webhook StatusCallback mettra à jour le statut
        // de livraison réel. Le HTTP 200 de Twilio ne prouve que la mise en file (F4).
        if (smsResult.messageId && !smsResult.mock) {
          await ctx.runMutation(internal.smsDeliveries.record, {
            twilioSid: smsResult.messageId,
            kind: 'invitation' as const,
            guestId: guest._id,
            eventId,
            to: guest.phone,
            status: 'sent' as const,
          });
        }
        sent++;
        continue;
      }

      const result = await sendWhatsAppCloudTemplate({
        to: guest.phone,
        templateName,
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: guestFirstName },
              { type: 'text', text: coupleNames },
              { type: 'text', text: eventDateFormatted },
              { type: 'text', text: personalMessage },
            ],
          },
          {
            type: 'button',
            sub_type: 'url',
            index: '0',
            parameters: [{ type: 'text', text: guest.qrCodeToken }],
          },
        ],
      });

      if (!result.ok) {
        console.error(`[broadcast] failed for ${guest.phone}: ${result.error}`);
        failed++;
        continue;
      }

      if (result.mock) {
        console.info(
          `[whatsapp:mock] INVITATION (${templateName}) -> ${guest.phone} | ${guest.fullName}`,
        );
      }
      await ctx.runMutation(internal.guests.markInvitationSent, {
        guestId: guest._id,
        channel: 'whatsapp' as const,
      });
      sent++;
    }

    // Filet F4 : ~15 min après le broadcast, relire les statuts de livraison
    // réels et alerter l'ops si le taux de non-livraison est anormal (signal d'un
    // filtrage carrier A2P). No-op si aucun SMS réel n'atteint le seuil.
    if (isTwilioConfigured() && sent > 0) {
      await ctx.scheduler.runAfter(
        DELIVERABILITY_CHECK_DELAY_MS,
        internal.smsDeliveries.checkEventDeliverabilityAndAlert,
        { eventId },
      );
    }

    return {
      sent,
      failed,
      skipped: 0,
      total: guests.length,
      style: styleId,
      mock: isMock,
    };
  },
});

interface SendTicketsResult {
  /** QR réellement envoyés (et marqués comme tels). */
  sent: number;
  /** Envois refusés (gabarit non validé, numéro injoignable…) — à relancer. */
  failed: number;
  /** Envois simulés (mode test) : rien n'est parti ni n'a été marqué. */
  simulated: number;
  /** Invités éligibles au moment du lancement. */
  total: number;
  /** Première erreur rencontrée, pour dire pourquoi (ex. gabarit absent). */
  firstError?: { message: string; code?: number };
}

/**
 * Envoie à chaque invité CONFIRMÉ son QR d'entrée par WhatsApp — et rien d'autre :
 * pas d'invitation, pas de bouton « Confirmer ma présence » (cf. `TICKET_TEMPLATE`).
 *
 * Éligibles : `attending`, avec un numéro, QR pas encore envoyé. Un invité qui
 * a déjà reçu son QR est ignoré, donc relancer l'envoi ne réécrit à personne et
 * ne reprend que les échecs. Seuls les envois réellement partis sont marqués
 * `ticketSentAt` : en mode simulation (`E2E_MODE`) rien n'est marqué, pour qu'un
 * essai à blanc n'empêche jamais le vrai envoi.
 *
 * Accessible à tout gestionnaire de l'événement (couple rattaché compris) ;
 * l'événement doit être publié, comme pour les invitations.
 */
export const sendTickets = action({
  args: {
    eventId: v.id('events'),
    requesterId: v.id('users'),
  },
  handler: async (ctx, { eventId, requesterId }): Promise<SendTicketsResult> => {
    const event = await ctx.runQuery(internal.events._getForTickets, { eventId, requesterId });
    if (!event) throw new Error('EVENT_NOT_FOUND_OR_FORBIDDEN');
    if (event.status !== 'active') throw new Error('EVENT_NOT_PUBLISHED');

    const guests = await ctx.runQuery(internal.guests.listForTickets, { eventId });
    if (guests.length === 0) return { sent: 0, failed: 0, simulated: 0, total: 0 };

    const coupleNames = `${event.coupleNames.partnerA} & ${event.coupleNames.partnerB}`;
    const eventDateFormatted = new Intl.DateTimeFormat('fr', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: event.timezone,
    }).format(new Date(event.eventDate));
    const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://wedillybird.com';
    const templateName = getTicketTemplateName(process.env);

    let sent = 0;
    let failed = 0;
    let simulated = 0;
    let firstError: SendTicketsResult['firstError'];

    for (const guest of guests) {
      const firstName = guest.fullName.split(' ')[0] ?? guest.fullName;
      const result = await sendWhatsAppCloudTemplate({
        to: guest.phone,
        templateName,
        components: [
          {
            type: 'header',
            parameters: [
              { type: 'image', image: { link: qrImageUrl(appBaseUrl, guest.qrCodeToken) } },
            ],
          },
          {
            type: 'body',
            parameters: [
              { type: 'text', text: firstName },
              { type: 'text', text: coupleNames },
              { type: 'text', text: eventDateFormatted },
            ],
          },
        ],
      });

      if (!result.ok) {
        console.error(`[tickets] failed for ${guest.phone}: ${result.error}`);
        failed++;
        firstError ??= {
          message: result.error ?? 'UNKNOWN',
          ...(result.errorCode !== undefined ? { code: result.errorCode } : {}),
        };
        continue;
      }
      if (result.mock) {
        console.info(`[whatsapp:mock] ENTRY PASS (${templateName}) -> ${guest.phone}`);
        simulated++;
        continue;
      }
      await ctx.runMutation(internal.guests.markTicketSent, { guestId: guest._id });
      sent++;
    }

    return {
      sent,
      failed,
      simulated,
      total: guests.length,
      ...(firstError ? { firstError } : {}),
    };
  },
});
