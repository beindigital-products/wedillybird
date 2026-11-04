import { v } from 'convex/values';
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { generateQrToken } from './lib/qrToken';
import { assertEventAccess } from './lib/eventAuth';
import { musicForClient, photoForClient } from './lib/invitationDesign';
import { MAX_IMPORT_ROWS, guestDedupeKey, guestRowProblem } from '../lib/guests/rules';

const QR_MAX_ATTEMPTS = 6;

async function assertEventOwnership(
  ctx: MutationCtx | QueryCtx,
  eventId: Id<'events'>,
  userId: Id<'users'>,
): Promise<Doc<'events'>> {
  // Propriétaire OU collaborateur gestionnaire — dont le couple rattaché par
  // l'agence (rôle `couple`), qui peut ainsi gérer SA liste d'invités.
  return assertEventAccess(ctx, eventId, userId, { write: true });
}

async function uniqueQrToken(ctx: MutationCtx): Promise<string> {
  for (let i = 0; i < QR_MAX_ATTEMPTS; i++) {
    const token = generateQrToken();
    const existing = await ctx.db
      .query('guests')
      .withIndex('by_qr_token', (q) => q.eq('qrCodeToken', token))
      .first();
    if (!existing) return token;
  }
  throw new Error('QR_TOKEN_GENERATION_FAILED');
}

export const add = mutation({
  args: {
    eventId: v.id('events'),
    requesterId: v.id('users'),
    fullName: v.string(),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    category: v.optional(v.string()),
    plusOnesAllowed: v.number(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const event = await assertEventOwnership(ctx, args.eventId, args.requesterId);

    const fullName = args.fullName.trim();
    if (fullName.length < 1 || fullName.length > 120) throw new Error('INVALID_FULL_NAME');
    if (
      !Number.isInteger(args.plusOnesAllowed) ||
      args.plusOnesAllowed < 0 ||
      args.plusOnesAllowed > 10
    ) {
      throw new Error('INVALID_PLUS_ONES');
    }

    // maxGuests is the cap on invitation slots (= guest entries), not on
    // physical attendees. Plus-ones do not count toward this quota.
    const existing = await ctx.db
      .query('guests')
      .withIndex('by_event', (q) => q.eq('eventId', args.eventId))
      .collect();
    if (existing.length >= event.maxGuests) {
      throw new Error('INVITATION_LIMIT_REACHED');
    }

    const qrCodeToken = await uniqueQrToken(ctx);
    const now = Date.now();

    const id = await ctx.db.insert('guests', {
      eventId: args.eventId,
      fullName,
      ...(args.phone ? { phone: args.phone.trim() } : {}),
      ...(args.email ? { email: args.email.trim().toLowerCase() } : {}),
      ...(args.category ? { category: args.category.trim() } : {}),
      plusOnesAllowed: args.plusOnesAllowed,
      rsvpStatus: 'pending' as const,
      ...(args.notes ? { notes: args.notes.trim() } : {}),
      qrCodeToken,
      createdAt: now,
      updatedAt: now,
    });

    return { id, qrCodeToken };
  },
});

/**
 * Import en lot d'une liste d'invités (CSV déjà analysé côté app).
 *
 * Le serveur reste l'autorité : chaque ligne est revalidée avec les mêmes règles
 * que l'aperçu (`lib/guests/rules`), les doublons — même nom + même coordonnée,
 * déjà présents ou répétés dans le lot — sont ignorés, et le plafond de fiches
 * de l'événement est respecté (les lignes en trop sont ignorées, pas le lot).
 * Une ligne refusée n'empêche jamais les autres : on renvoie la liste des
 * lignes ignorées avec leur raison.
 *
 * `markConfirmed` crée les invités directement `attending` (RSVP déjà recueilli
 * ailleurs) : ils n'ont pas à repasser par la page de réponse, mais n'ont pas
 * non plus répondu via Wedillybird (pas de notification aux organisateurs).
 */
export const importMany = mutation({
  args: {
    eventId: v.id('events'),
    requesterId: v.id('users'),
    markConfirmed: v.boolean(),
    rows: v.array(
      v.object({
        fullName: v.string(),
        phone: v.optional(v.string()),
        email: v.optional(v.string()),
        category: v.optional(v.string()),
        plusOnesAllowed: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    if (args.rows.length > MAX_IMPORT_ROWS) throw new Error('IMPORT_TOO_LARGE');
    const event = await assertEventOwnership(ctx, args.eventId, args.requesterId);

    const existing = await ctx.db
      .query('guests')
      .withIndex('by_event', (q) => q.eq('eventId', args.eventId))
      .collect();
    const seen = new Set(existing.map(guestDedupeKey));
    let remaining = event.maxGuests - existing.length;

    const skipped: Array<{ index: number; reason: string }> = [];
    let imported = 0;
    const now = Date.now();

    for (const [index, row] of args.rows.entries()) {
      const problem = guestRowProblem(row);
      if (problem) {
        skipped.push({ index, reason: problem });
        continue;
      }
      const key = guestDedupeKey(row);
      if (seen.has(key)) {
        skipped.push({ index, reason: 'duplicate' });
        continue;
      }
      if (remaining <= 0) {
        skipped.push({ index, reason: 'limit' });
        continue;
      }
      seen.add(key);
      remaining--;

      await ctx.db.insert('guests', {
        eventId: args.eventId,
        fullName: row.fullName.trim(),
        ...(row.phone ? { phone: row.phone.trim() } : {}),
        ...(row.email ? { email: row.email.trim().toLowerCase() } : {}),
        ...(row.category?.trim() ? { category: row.category.trim() } : {}),
        plusOnesAllowed: row.plusOnesAllowed,
        rsvpStatus: args.markConfirmed ? ('attending' as const) : ('pending' as const),
        ...(args.markConfirmed ? { rsvpRespondedAt: now } : {}),
        qrCodeToken: await uniqueQrToken(ctx),
        createdAt: now,
        updatedAt: now,
      });
      imported++;
    }

    return { imported, skipped };
  },
});

export const update = mutation({
  args: {
    guestId: v.id('guests'),
    requesterId: v.id('users'),
    fullName: v.optional(v.string()),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    category: v.optional(v.string()),
    plusOnesAllowed: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const guest = await ctx.db.get(args.guestId);
    if (!guest) throw new Error('GUEST_NOT_FOUND');
    await assertEventOwnership(ctx, guest.eventId, args.requesterId);

    const patch: Partial<Doc<'guests'>> = { updatedAt: Date.now() };

    if (args.fullName !== undefined) {
      const trimmed = args.fullName.trim();
      if (trimmed.length < 1 || trimmed.length > 120) throw new Error('INVALID_FULL_NAME');
      patch.fullName = trimmed;
    }
    if (args.phone !== undefined) patch.phone = args.phone.trim() || undefined;
    if (args.email !== undefined) patch.email = args.email.trim().toLowerCase() || undefined;
    if (args.category !== undefined) patch.category = args.category.trim() || undefined;
    if (args.notes !== undefined) patch.notes = args.notes.trim() || undefined;
    if (args.plusOnesAllowed !== undefined) {
      if (
        !Number.isInteger(args.plusOnesAllowed) ||
        args.plusOnesAllowed < 0 ||
        args.plusOnesAllowed > 10
      ) {
        throw new Error('INVALID_PLUS_ONES');
      }
      patch.plusOnesAllowed = args.plusOnesAllowed;
    }

    await ctx.db.patch(args.guestId, patch);
    return { ok: true as const };
  },
});

export const remove = mutation({
  args: { guestId: v.id('guests'), requesterId: v.id('users') },
  handler: async (ctx, { guestId, requesterId }) => {
    const guest = await ctx.db.get(guestId);
    if (!guest) throw new Error('GUEST_NOT_FOUND');
    await assertEventOwnership(ctx, guest.eventId, requesterId);
    await ctx.db.delete(guestId);
    return { ok: true as const };
  },
});

export const listByEvent = query({
  args: { eventId: v.id('events'), requesterId: v.id('users') },
  handler: async (ctx, { eventId, requesterId }) => {
    await assertEventOwnership(ctx, eventId, requesterId);
    const rows = await ctx.db
      .query('guests')
      .withIndex('by_event', (q) => q.eq('eventId', eventId))
      .order('desc')
      .collect();
    return rows.map((g) => ({
      _id: g._id,
      fullName: g.fullName,
      phone: g.phone,
      email: g.email,
      category: g.category,
      plusOnesAllowed: g.plusOnesAllowed,
      plusOnesNames: g.plusOnesNames,
      rsvpStatus: g.rsvpStatus,
      invitationSentAt: g.invitationSentAt,
      dietaryRestrictions: g.dietaryRestrictions,
      notes: g.notes,
      customAnswers: g.customAnswers,
      qrCodeToken: g.qrCodeToken,
      createdAt: g.createdAt,
      updatedAt: g.updatedAt,
    }));
  },
});

export const getByToken = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const guest = await ctx.db
      .query('guests')
      .withIndex('by_qr_token', (q) => q.eq('qrCodeToken', token))
      .first();
    if (!guest) return null;

    const event = await ctx.db.get(guest.eventId);
    if (!event) return null;
    if (event.status === 'cancelled' || event.status === 'archived') return null;

    return {
      guest: {
        _id: guest._id,
        fullName: guest.fullName,
        plusOnesAllowed: guest.plusOnesAllowed,
        rsvpStatus: guest.rsvpStatus,
        rsvpRespondedAt: guest.rsvpRespondedAt,
        plusOnesNames: guest.plusOnesNames,
        dietaryRestrictions: guest.dietaryRestrictions,
        notes: guest.notes,
        customAnswers: guest.customAnswers,
      },
      event: {
        _id: event._id,
        title: event.title,
        coupleNames: event.coupleNames,
        eventDate: event.eventDate,
        timezone: event.timezone,
        venue: event.venue,
        theme: event.theme,
        invitationCinematic: event.invitationCinematic,
        invitationMusic: musicForClient(event.invitationMusic),
        invitationPhoto: photoForClient(event.invitationPhoto),
        ceremonySchedule: event.ceremonySchedule,
        rsvpConfig: event.rsvpConfig,
        // Reco-faciale opt-in (Lane T3, F7) : la page galerie invité s'en sert
        // pour masquer le bouton « Find my photos » quand l'event n'a pas
        // activé la feature.
        faceSearchEnabled: event.faceSearchEnabled === true,
      },
    };
  },
});

export const countByEvent = query({
  args: { eventId: v.id('events'), requesterId: v.id('users') },
  handler: async (ctx, { eventId, requesterId }) => {
    await assertEventOwnership(ctx, eventId, requesterId);
    const rows = await ctx.db
      .query('guests')
      .withIndex('by_event', (q) => q.eq('eventId', eventId))
      .collect();

    let attending = 0;
    let declined = 0;
    let pending = 0;
    let maybe = 0;
    let invited = 0;
    let withPhone = 0;
    for (const g of rows) {
      if (g.rsvpStatus === 'attending') attending++;
      else if (g.rsvpStatus === 'declined') declined++;
      else if (g.rsvpStatus === 'maybe') maybe++;
      else pending++;
      if (g.invitationSentAt) invited++;
      if (g.phone) withPhone++;
    }
    return { total: rows.length, attending, declined, pending, maybe, invited, withPhone };
  },
});

export const listForCheckIn = query({
  args: { eventId: v.id('events'), requesterId: v.id('users') },
  handler: async (ctx, { eventId, requesterId }) => {
    await assertEventOwnership(ctx, eventId, requesterId);
    const rows = await ctx.db
      .query('guests')
      .withIndex('by_event', (q) => q.eq('eventId', eventId))
      .collect();
    return rows.map((g) => ({
      _id: g._id,
      fullName: g.fullName,
      category: g.category,
      plusOnesAllowed: g.plusOnesAllowed,
      rsvpStatus: g.rsvpStatus,
      qrCodeToken: g.qrCodeToken,
      checkedInAt: g.checkedInAt,
    }));
  },
});

export const checkInByToken = mutation({
  args: {
    token: v.string(),
    eventId: v.id('events'),
    requesterId: v.id('users'),
  },
  handler: async (ctx, { token, eventId, requesterId }) => {
    await assertEventOwnership(ctx, eventId, requesterId);

    const guest = await ctx.db
      .query('guests')
      .withIndex('by_qr_token', (q) => q.eq('qrCodeToken', token))
      .first();
    if (!guest) throw new Error('GUEST_NOT_FOUND');
    if (guest.eventId !== eventId) throw new Error('GUEST_WRONG_EVENT');

    const now = Date.now();
    const alreadyCheckedInAt = guest.checkedInAt;

    if (!alreadyCheckedInAt) {
      await ctx.db.patch(guest._id, {
        checkedInAt: now,
        checkedInBy: requesterId,
        updatedAt: now,
      });
    }

    return {
      ok: true as const,
      alreadyCheckedIn: Boolean(alreadyCheckedInAt),
      checkedInAt: alreadyCheckedInAt ?? now,
      guest: {
        _id: guest._id,
        fullName: guest.fullName,
        category: guest.category,
        plusOnesAllowed: guest.plusOnesAllowed,
        rsvpStatus: guest.rsvpStatus,
      },
    };
  },
});

export const undoCheckIn = mutation({
  args: { guestId: v.id('guests'), requesterId: v.id('users') },
  handler: async (ctx, { guestId, requesterId }) => {
    const guest = await ctx.db.get(guestId);
    if (!guest) throw new Error('GUEST_NOT_FOUND');
    await assertEventOwnership(ctx, guest.eventId, requesterId);
    if (!guest.checkedInAt) return { ok: true as const };

    await ctx.db.patch(guestId, {
      checkedInAt: undefined,
      checkedInBy: undefined,
      updatedAt: Date.now(),
    });
    return { ok: true as const };
  },
});

/**
 * Liste les guests d'un event qui n'ont pas encore reçu leur invitation
 * (pas de invitationSentAt) et qui ont un phone (pour WhatsApp). Utilisé
 * par l'action `invitationActions.broadcast` pour itérer.
 */
export const listToInvite = internalQuery({
  args: { eventId: v.id('events') },
  handler: async (ctx, { eventId }) => {
    const guests = await ctx.db
      .query('guests')
      .withIndex('by_event', (q) => q.eq('eventId', eventId))
      .collect();
    return guests
      .filter((g) => !g.invitationSentAt && g.phone)
      .map((g) => ({
        _id: g._id,
        fullName: g.fullName,
        phone: g.phone!,
        qrCodeToken: g.qrCodeToken,
      }));
  },
});

/**
 * Patche un guest après envoi réussi de son invitation. Idempotent : si
 * déjà set, ne fait rien (on n'écrase pas le timestamp initial).
 */
export const markInvitationSent = internalMutation({
  args: {
    guestId: v.id('guests'),
    channel: v.union(v.literal('whatsapp'), v.literal('email'), v.literal('sms')),
  },
  handler: async (ctx, { guestId, channel }) => {
    const guest = await ctx.db.get(guestId);
    if (!guest) return { ok: false as const, reason: 'NOT_FOUND' as const };
    if (guest.invitationSentAt) return { ok: true as const, alreadySent: true };
    const now = Date.now();
    await ctx.db.patch(guestId, {
      invitationSentAt: now,
      invitationChannel: channel,
      updatedAt: now,
    });
    return { ok: true as const, alreadySent: false };
  },
});

export const markReminderSent = internalMutation({
  args: {
    guestId: v.id('guests'),
    tier: v.union(v.literal('d7'), v.literal('d1')),
  },
  handler: async (ctx, { guestId, tier }) => {
    const now = Date.now();
    // On patche en plus `lastReminderSentAt` (anti-doublon court-terme tous
    // canaux/tiers confondus, cf. `lib/reminders/window.ts`). Le marker par
    // tier reste la source d'idempotence par tier.
    await ctx.db.patch(
      guestId,
      tier === 'd7'
        ? { reminderD7SentAt: now, lastReminderSentAt: now, updatedAt: now }
        : { reminderD1SentAt: now, lastReminderSentAt: now, updatedAt: now },
    );
    return { ok: true as const };
  },
});

export type GuestListItem = {
  _id: Id<'guests'>;
  fullName: string;
  phone?: string;
  email?: string;
  category?: string;
  plusOnesAllowed: number;
  rsvpStatus: 'pending' | 'attending' | 'declined' | 'maybe';
  invitationSentAt?: number;
  notes?: string;
  qrCodeToken: string;
  createdAt: number;
  updatedAt: number;
};
