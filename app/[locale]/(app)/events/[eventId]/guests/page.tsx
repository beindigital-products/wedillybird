import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { ArrowLeft, Download } from 'lucide-react';
import { Link, redirect } from '@/i18n/navigation';
import { getSession } from '@/lib/auth/session';
import { convexApi, getConvexServerClient } from '@/lib/auth/convex-server';
import { AppShell } from '@/components/app/app-shell';
import { GuestsManager } from '@/components/guests/guests-manager';
import { GuestsImport } from '@/components/guests/guests-import';
import { GuestsTickets } from '@/components/guests/guests-tickets';

export default async function GuestsPage({
  params,
}: {
  params: Promise<{ locale: string; eventId: string }>;
}) {
  const { locale, eventId } = await params;
  setRequestLocale(locale);

  const session = await getSession();
  if (!session) {
    redirect({ href: '/sign-in', locale });
  }

  const convex = getConvexServerClient();
  const event = await convex.query(convexApi.getEventById, {
    eventId,
    requesterId: session!.userId,
  });
  if (!event) notFound();

  const guests = await convex.query(convexApi.listGuestsByEvent, {
    eventId,
    requesterId: session!.userId,
  });

  const user = await convex.query(convexApi.currentUser, { userId: session!.userId });
  const t = await getTranslations('Guests');
  const tStats = await getTranslations('EventStats');

  return (
    <AppShell userName={user?.fullName}>
      <div className="container-page flex flex-col gap-10 py-12 sm:py-16">
        <header className="flex flex-col gap-5">
          <Link
            href={`/events/${eventId}`}
            className="inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.32em] text-[color:var(--color-ink-500)] uppercase transition-colors hover:text-[color:var(--color-ink-900)]"
          >
            <ArrowLeft className="h-3 w-3" strokeWidth={2} aria-hidden />
            {t('backToEvent')}
          </Link>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex flex-col gap-2">
              <h1
                className="font-display text-balance italic"
                style={{
                  fontSize: 'clamp(2rem, 4.5vw, 3rem)',
                  lineHeight: 1.05,
                  letterSpacing: '-0.022em',
                  color: 'var(--color-ink-900)',
                }}
              >
                {t('title')}
              </h1>
              <p className="text-sm text-[color:var(--color-ink-500)] sm:text-base">
                {t('summary', { total: guests.length, max: event.maxGuests })}
              </p>
            </div>
            <a
              href={`/api/events/${eventId}/guests.csv`}
              className="focus-ring inline-flex items-center gap-2 rounded-full border border-[color:var(--color-border-strong)] bg-white px-4 py-2 text-sm font-medium text-[color:var(--color-ink-900)] transition-colors hover:bg-[color:var(--color-ivory-100)]"
              data-testid="export-csv"
            >
              <Download className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
              {tStats('export')}
            </a>
          </div>
        </header>

        <GuestsImport
          eventId={eventId}
          existingGuests={guests.map((g) => ({
            fullName: g.fullName,
            phone: g.phone,
            email: g.email,
          }))}
          remaining={Math.max(0, event.maxGuests - guests.length)}
        />

        <GuestsTickets
          eventId={eventId}
          eventStatus={event.status}
          counts={{
            attending: guests.filter((g) => g.rsvpStatus === 'attending').length,
            eligible: guests.filter(
              (g) => g.rsvpStatus === 'attending' && g.phone && !g.ticketSentAt,
            ).length,
            sent: guests.filter((g) => g.ticketSentAt).length,
            attendingNoPhone: guests.filter((g) => g.rsvpStatus === 'attending' && !g.phone).length,
          }}
        />

        {/* `GuestsManager` garde sa liste en état local, amorcé une seule fois :
            la clé le remonte quand la liste change côté serveur (import, ajout,
            suppression) pour qu'il affiche les vraies fiches. */}
        <GuestsManager
          key={`${guests.length}-${guests[0]?._id ?? 'none'}`}
          eventId={eventId}
          initialGuests={guests}
          questions={(event.rsvpConfig?.customQuestions ?? []).map((q) => ({
            id: q.id,
            label: q.label,
          }))}
        />
      </div>
    </AppShell>
  );
}
