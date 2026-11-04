// @vitest-environment edge-runtime
/**
 * Envoi du QR d'entrée par WhatsApp (`invitationActions.sendTickets`) sur les
 * VRAIES fonctions Convex, avec l'API Meta simulée.
 *
 * Ce qu'on protège : un invité confirmé reçoit son QR et RIEN d'autre (aucune
 * demande de confirmation), personne ne reçoit son QR deux fois, un échec n'est
 * jamais compté comme envoyé, et un essai à blanc ne bloque pas le vrai envoi.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { newHarness, seedEvent, seedUser, type Harness } from './utils/convex-harness';

let t: Harness;
let owner: Id<'users'>;
let eventId: Id<'events'>;
const fetchMock = vi.fn();

const okResponse = () =>
  new Response(JSON.stringify({ messages: [{ id: 'wamid.TEST' }] }), { status: 200 });

beforeEach(async () => {
  t = newHarness();
  owner = await seedUser(t, { phone: '+33611111111', fullName: 'Daba' });
  eventId = await seedEvent(t, owner);

  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => okResponse());
  vi.stubGlobal('fetch', fetchMock);
  process.env.WHATSAPP_ACCESS_TOKEN = 'test-token';
  process.env.WHATSAPP_PHONE_NUMBER_ID = '123456';
  process.env.NEXT_PUBLIC_APP_URL = 'https://app.test';
  delete process.env.E2E_MODE;
  delete process.env.WHATSAPP_TICKET_TEMPLATE;
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.WHATSAPP_ACCESS_TOKEN;
  delete process.env.WHATSAPP_PHONE_NUMBER_ID;
  delete process.env.NEXT_PUBLIC_APP_URL;
  delete process.env.E2E_MODE;
});

const phone = (i: number) => `+3366000${String(i).padStart(4, '0')}`;

async function importGuests(
  n: number,
  opts: { markConfirmed?: boolean; offset?: number; withPhone?: boolean } = {},
) {
  const offset = opts.offset ?? 0;
  await t.mutation(api.guests.importMany, {
    eventId,
    requesterId: owner,
    markConfirmed: opts.markConfirmed ?? true,
    rows: Array.from({ length: n }, (_, i) => ({
      fullName: `Invité ${i + offset}`,
      ...(opts.withPhone === false ? {} : { phone: phone(i + offset) }),
      plusOnesAllowed: 0,
    })),
  });
}

const send = (requesterId: Id<'users'> = owner) =>
  t.action(api.invitationActions.sendTickets, { eventId, requesterId });
const guestDocs = () => t.run(async (ctx) => ctx.db.query('guests').collect());
const bodies = () => fetchMock.mock.calls.map((c) => JSON.parse(String(c[1]?.body)));

describe('invitationActions.sendTickets', () => {
  it('envoie à chaque invité confirmé son QR — en-tête image, 3 variables, AUCUN bouton', async () => {
    await importGuests(3);
    const res = await send();
    expect(res).toMatchObject({ sent: 3, failed: 0, simulated: 0, total: 3 });

    const docs = await guestDocs();
    const sentBodies = bodies();
    expect(sentBodies).toHaveLength(3);

    for (const body of sentBodies) {
      expect(body.type).toBe('template');
      expect(body.template.name).toBe('wedding_entry_pass');
      expect(body.template.language.code).toBe('fr');

      const kinds = body.template.components.map((c: { type: string }) => c.type);
      // Ni bouton « Confirmer ma présence », ni lien de réponse : un en-tête image et un corps.
      expect(kinds).toEqual(['header', 'body']);
      expect(JSON.stringify(body)).not.toMatch(/button|confirm/i);

      const [header, text] = body.template.components;
      const link: string = header.parameters[0].image.link;
      const token = link.replace('https://app.test/api/qr/', '');
      expect(header.parameters[0].type).toBe('image');
      expect(docs.some((g) => g.qrCodeToken === token)).toBe(true);
      expect(text.parameters.map((p: { text: string }) => p.text)).toEqual([
        expect.stringMatching(/^Invité$/),
        'Alice & Bob',
        expect.stringMatching(/\d{4}$/),
      ]);
    }
  });

  it('adresse chaque QR à son propriétaire (bon numéro, bon jeton)', async () => {
    await importGuests(2);
    await send();
    const docs = await guestDocs();
    for (const body of bodies()) {
      const token = body.template.components[0].parameters[0].image.link.split('/').pop();
      const guest = docs.find((g) => g.qrCodeToken === token)!;
      expect(body.to).toBe(guest.phone!.replace(/^\+/, ''));
    }
  });

  it('marque ticketSentAt, et relancer n’écrit plus à personne', async () => {
    await importGuests(3);
    await send();
    expect((await guestDocs()).every((g) => typeof g.ticketSentAt === 'number')).toBe(true);

    fetchMock.mockClear();
    const again = await send();
    expect(again).toEqual({ sent: 0, failed: 0, simulated: 0, total: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('n’écrit qu’aux invités confirmés avec un numéro', async () => {
    await importGuests(2); // confirmés, avec numéro
    await importGuests(2, { offset: 10, markConfirmed: false }); // en attente
    await importGuests(1, { offset: 20, withPhone: false }); // confirmé sans numéro
    // Un refus et un « peut-être » passés par le vrai formulaire de réponse.
    await importGuests(2, { offset: 30, markConfirmed: false });
    const docs = await guestDocs();
    const declined = docs.find((g) => g.fullName === 'Invité 30')!;
    const maybe = docs.find((g) => g.fullName === 'Invité 31')!;
    await t.mutation(api.rsvps.submit, { token: declined.qrCodeToken, rsvpStatus: 'declined' });
    await t.mutation(api.rsvps.submit, { token: maybe.qrCodeToken, rsvpStatus: 'maybe' });

    const res = await send();
    expect(res).toMatchObject({ sent: 2, total: 2 });
    const phones = bodies().map((b) => b.to);
    expect(phones.sort()).toEqual([phone(0), phone(1)].map((p) => p.slice(1)).sort());
  });

  it('un échec n’est pas compté comme envoyé, remonte la raison, et ne se rejoue que lui', async () => {
    await importGuests(3);
    // Le gabarit n'est pas encore validé chez Meta : tout échoue.
    fetchMock.mockImplementation(
      async () =>
        new Response(
          JSON.stringify({ error: { message: 'Template name does not exist', code: 132001 } }),
          { status: 404 },
        ),
    );
    const res = await send();
    expect(res).toMatchObject({
      sent: 0,
      failed: 3,
      total: 3,
      firstError: { message: 'Template name does not exist', code: 132001 },
    });
    expect((await guestDocs()).every((g) => g.ticketSentAt === undefined)).toBe(true);

    // Le gabarit est validé : le même bouton rattrape tout le monde.
    fetchMock.mockImplementation(async () => okResponse());
    expect(await send()).toMatchObject({ sent: 3, failed: 0 });
  });

  it('un échec isolé ne bloque pas les autres invités', async () => {
    await importGuests(3);
    let call = 0;
    fetchMock.mockImplementation(async () =>
      ++call === 2
        ? new Response(JSON.stringify({ error: { message: 'unreachable', code: 131026 } }), {
            status: 400,
          })
        : okResponse(),
    );
    const res = await send();
    expect(res).toMatchObject({ sent: 2, failed: 1, total: 3 });
    expect((await guestDocs()).filter((g) => g.ticketSentAt).length).toBe(2);
  });

  it('en mode simulation, rien n’est marqué : un essai à blanc ne bloque pas le vrai envoi', async () => {
    await importGuests(2);
    process.env.E2E_MODE = '1';
    const dry = await send();
    expect(dry).toMatchObject({ sent: 0, simulated: 2, failed: 0, total: 2 });
    expect(fetchMock).not.toHaveBeenCalled();
    expect((await guestDocs()).every((g) => g.ticketSentAt === undefined)).toBe(true);

    delete process.env.E2E_MODE;
    expect(await send()).toMatchObject({ sent: 2, simulated: 0 });
  });

  it('sans identifiants WhatsApp, échoue franchement au lieu de marquer envoyé', async () => {
    await importGuests(1);
    delete process.env.WHATSAPP_ACCESS_TOKEN;
    const res = await send();
    expect(res).toMatchObject({
      sent: 0,
      failed: 1,
      firstError: { message: 'WHATSAPP_NOT_CONFIGURED' },
    });
    expect((await guestDocs())[0]?.ticketSentAt).toBeUndefined();
  });

  it('utilise le nom de gabarit configuré par variable d’environnement', async () => {
    await importGuests(1);
    process.env.WHATSAPP_TICKET_TEMPLATE = 'mon_gabarit_qr';
    await send();
    expect(bodies()[0].template.name).toBe('mon_gabarit_qr');
  });

  it('refuse un événement non publié, sans rien envoyer', async () => {
    await importGuests(1);
    await t.run(async (ctx) => ctx.db.patch(eventId, { status: 'draft' }));
    await expect(send()).rejects.toThrow('EVENT_NOT_PUBLISHED');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuse un utilisateur étranger à l’événement', async () => {
    await importGuests(1);
    const stranger = await seedUser(t, { phone: '+33699999999' });
    await expect(send(stranger)).rejects.toThrow('EVENT_NOT_FOUND_OR_FORBIDDEN');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('autorise un gestionnaire rattaché (couple/planner), pas un simple « scanner »', async () => {
    await importGuests(1);
    const couple = await seedUser(t, { phone: '+33677777777' });
    const scanner = await seedUser(t, { phone: '+33688888888' });
    await t.run(async (ctx) => {
      const base = { eventId, invitedBy: owner, invitedAt: Date.now(), acceptedAt: Date.now() };
      await ctx.db.insert('eventCollaborators', { ...base, userId: couple, role: 'couple' });
      await ctx.db.insert('eventCollaborators', { ...base, userId: scanner, role: 'scanner' });
    });
    await expect(send(scanner)).rejects.toThrow('EVENT_NOT_FOUND_OR_FORBIDDEN');
    expect(await send(couple)).toMatchObject({ sent: 1 });
  });
});

describe('invitation WhatsApp et liste importée « confirmée »', () => {
  it('l’envoi d’invitations ignore les invités déjà confirmés', async () => {
    await importGuests(3); // confirmés par import
    await importGuests(2, { offset: 10, markConfirmed: false }); // sans réponse
    const res = await t.action(api.invitationActions.broadcast, { eventId, requesterId: owner });
    expect(res).toMatchObject({ sent: 2, total: 2 });
    // Aucun gabarit d'invitation n'est parti vers un invité confirmé.
    const targets = bodies().map((b) => b.to);
    expect(targets.sort()).toEqual([phone(10), phone(11)].map((p) => p.slice(1)).sort());
    expect(bodies().every((b) => b.template.name.startsWith('wedding_invitation_'))).toBe(true);
  });

  it('le « reste à inviter » tombe à zéro quand tous les autres sont confirmés', async () => {
    await importGuests(3); // confirmés par import
    const counts = await t.query(api.guests.countByEvent, { eventId, requesterId: owner });
    expect(counts.withPhone - counts.invited).toBe(0);

    await importGuests(2, { offset: 10, markConfirmed: false });
    const after = await t.query(api.guests.countByEvent, { eventId, requesterId: owner });
    expect(after.withPhone - after.invited).toBe(2);
  });

  it('envoyer les QR ne compte pas comme avoir envoyé l’invitation', async () => {
    await importGuests(1, { markConfirmed: false });
    const [guest] = await guestDocs();
    await t.mutation(api.rsvps.submit, { token: guest!.qrCodeToken, rsvpStatus: 'attending' });
    await send();
    const [after] = await guestDocs();
    expect(after?.ticketSentAt).toBeTypeOf('number');
    expect(after?.invitationSentAt).toBeUndefined();
  });
});
