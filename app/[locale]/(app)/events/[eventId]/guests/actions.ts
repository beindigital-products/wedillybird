'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { addGuestSchema, updateGuestSchema } from '@/lib/validators/guests';
import { GUEST_IMPORT_MAX } from '@/lib/guests/csv';
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

export type ImportGuestsResult = { ok: true; created: number } | { ok: false; error: string };

const importGuestsSchema = z.array(addGuestSchema).min(1).max(GUEST_IMPORT_MAX);

/**
 * Import en lot d'invités (CSV). Les lignes sont re-validées ici avec le même
 * schéma que le formulaire d'ajout : le navigateur n'est pas une frontière de
 * confiance. Tout ou rien — un quota dépassé n'insère aucune ligne.
 */
export async function importGuestsAction(
  eventId: string,
  guests: unknown,
): Promise<ImportGuestsResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: 'UNAUTHENTICATED' };

  const parsed = importGuestsSchema.safeParse(guests);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };

  const convex = getConvexServerClient();
  try {
    const res = await convex.mutation(convexApi.addGuests, {
      eventId,
      requesterId: session.userId,
      guests: parsed.data.map((g) => ({
        fullName: g.fullName,
        plusOnesAllowed: g.plusOnesAllowed,
        ...(g.phone ? { phone: g.phone } : {}),
        ...(g.email ? { email: g.email } : {}),
        ...(g.category ? { category: g.category } : {}),
        ...(g.notes ? { notes: g.notes } : {}),
      })),
    });
    revalidatePath(`/events/${eventId}/guests`);
    return { ok: true, created: res.created };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'UNKNOWN';
    if (message.includes('INVITATION_LIMIT_REACHED')) {
      return { ok: false, error: 'INVITATION_LIMIT_REACHED' };
    }
    return { ok: false, error: message };
  }
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
