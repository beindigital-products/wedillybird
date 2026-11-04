'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { addGuestSchema, updateGuestSchema } from '@/lib/validators/guests';
import { MAX_IMPORT_ROWS } from '@/lib/guests/rules';
import { convexApi, getConvexServerClient } from '@/lib/auth/convex-server';
import { getSession } from '@/lib/auth/session';

export type GuestActionResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string[] | undefined> };

function rawFromForm(fd: FormData, key: string): string | undefined {
  const v = fd.get(key);
  if (typeof v !== 'string') return undefined;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export async function addGuestAction(
  eventId: string,
  formData: FormData,
): Promise<GuestActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: 'UNAUTHENTICATED' };

  const parsed = addGuestSchema.safeParse({
    fullName: rawFromForm(formData, 'fullName'),
    phone: rawFromForm(formData, 'phone'),
    email: rawFromForm(formData, 'email'),
    category: rawFromForm(formData, 'category'),
    plusOnesAllowed: rawFromForm(formData, 'plusOnesAllowed') ?? '0',
    notes: rawFromForm(formData, 'notes'),
  });

  if (!parsed.success) {
    return {
      ok: false,
      error: 'INVALID_INPUT',
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const convex = getConvexServerClient();
  try {
    await convex.mutation(convexApi.addGuest, {
      eventId,
      requesterId: session.userId,
      fullName: parsed.data.fullName,
      plusOnesAllowed: parsed.data.plusOnesAllowed,
      ...(parsed.data.phone ? { phone: parsed.data.phone } : {}),
      ...(parsed.data.email ? { email: parsed.data.email } : {}),
      ...(parsed.data.category ? { category: parsed.data.category } : {}),
      ...(parsed.data.notes ? { notes: parsed.data.notes } : {}),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'UNKNOWN';
    if (message.includes('INVITATION_LIMIT_REACHED')) {
      return { ok: false, error: 'INVITATION_LIMIT_REACHED' };
    }
    return { ok: false, error: message };
  }

  revalidatePath(`/events/${eventId}/guests`);
  return { ok: true };
}

export async function updateGuestAction(
  guestId: string,
  eventId: string,
  formData: FormData,
): Promise<GuestActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: 'UNAUTHENTICATED' };

  const parsed = updateGuestSchema.safeParse({
    fullName: rawFromForm(formData, 'fullName'),
    phone: rawFromForm(formData, 'phone'),
    email: rawFromForm(formData, 'email'),
    category: rawFromForm(formData, 'category'),
    plusOnesAllowed: rawFromForm(formData, 'plusOnesAllowed'),
    notes: rawFromForm(formData, 'notes'),
  });

  if (!parsed.success) {
    return {
      ok: false,
      error: 'INVALID_INPUT',
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const convex = getConvexServerClient();
  try {
    await convex.mutation(convexApi.updateGuest, {
      guestId,
      requesterId: session.userId,
      ...(parsed.data.fullName !== undefined ? { fullName: parsed.data.fullName } : {}),
      ...(parsed.data.phone !== undefined ? { phone: parsed.data.phone } : {}),
      ...(parsed.data.email !== undefined ? { email: parsed.data.email } : {}),
      ...(parsed.data.category !== undefined ? { category: parsed.data.category } : {}),
      ...(parsed.data.plusOnesAllowed !== undefined
        ? { plusOnesAllowed: parsed.data.plusOnesAllowed }
        : {}),
      ...(parsed.data.notes !== undefined ? { notes: parsed.data.notes } : {}),
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'UNKNOWN' };
  }

  revalidatePath(`/events/${eventId}/guests`);
  return { ok: true };
}

export async function removeGuestAction(
  guestId: string,
  eventId: string,
): Promise<GuestActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: 'UNAUTHENTICATED' };

  const convex = getConvexServerClient();
  try {
    await convex.mutation(convexApi.removeGuest, {
      guestId,
      requesterId: session.userId,
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'UNKNOWN' };
  }

  revalidatePath(`/events/${eventId}/guests`);
  return { ok: true };
}

const importRowSchema = z.object({
  fullName: z.string().max(500),
  phone: z.string().max(40).optional(),
  email: z.string().max(320).optional(),
  category: z.string().max(200).optional(),
  plusOnesAllowed: z.number(),
});

const importPayloadSchema = z.object({
  markConfirmed: z.boolean(),
  rows: z.array(importRowSchema).min(1).max(MAX_IMPORT_ROWS),
});

export type ImportGuestsPayload = z.infer<typeof importPayloadSchema>;

export type ImportGuestsResult =
  | { ok: true; imported: number; skipped: Array<{ index: number; reason: string }> }
  | { ok: false; error: string };

/**
 * Importe en lot les invités d'un CSV déjà analysé dans le navigateur. Le serveur
 * revalide tout (cf. `guests.importMany`) : cette action ne fait que filtrer la
 * forme de la charge utile et traduire les erreurs.
 */
export async function importGuestsAction(
  eventId: string,
  payload: ImportGuestsPayload,
): Promise<ImportGuestsResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: 'UNAUTHENTICATED' };

  const parsed = importPayloadSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };

  const convex = getConvexServerClient();
  try {
    const result = await convex.mutation(convexApi.importGuests, {
      eventId,
      requesterId: session.userId,
      markConfirmed: parsed.data.markConfirmed,
      rows: parsed.data.rows,
    });
    revalidatePath(`/events/${eventId}/guests`);
    return { ok: true, imported: result.imported, skipped: result.skipped };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'UNKNOWN';
    if (message.includes('IMPORT_TOO_LARGE')) return { ok: false, error: 'IMPORT_TOO_LARGE' };
    if (message.includes('FORBIDDEN') || message.includes('EVENT_NOT_FOUND')) {
      return { ok: false, error: 'FORBIDDEN' };
    }
    return { ok: false, error: message };
  }
}

export type SendTicketsResult =
  | {
      ok: true;
      sent: number;
      failed: number;
      simulated: number;
      total: number;
      firstError?: { message: string; code?: number };
    }
  | { ok: false; error: 'UNAUTHENTICATED' | 'EVENT_NOT_PUBLISHED' | 'FORBIDDEN' | 'UNKNOWN' };

/**
 * Envoie à chaque invité confirmé son QR d'entrée par WhatsApp (sans invitation
 * ni demande de réponse). Les droits et la publication de l'événement sont
 * vérifiés côté Convex ; cette action traduit seulement les erreurs.
 */
export async function sendTicketsAction(eventId: string): Promise<SendTicketsResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: 'UNAUTHENTICATED' };

  const convex = getConvexServerClient();
  try {
    const result = await convex.action(convexApi.sendTickets, {
      eventId,
      requesterId: session.userId,
    });
    revalidatePath(`/events/${eventId}/guests`);
    return { ok: true, ...result };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'UNKNOWN';
    if (message.includes('EVENT_NOT_PUBLISHED')) return { ok: false, error: 'EVENT_NOT_PUBLISHED' };
    if (message.includes('EVENT_NOT_FOUND_OR_FORBIDDEN') || message.includes('FORBIDDEN')) {
      return { ok: false, error: 'FORBIDDEN' };
    }
    return { ok: false, error: 'UNKNOWN' };
  }
}
