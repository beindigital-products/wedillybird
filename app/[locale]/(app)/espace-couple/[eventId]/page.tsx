import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Calendar, MapPin, Users, CreditCard, ExternalLink, CheckCircle2 } from 'lucide-react';
import { getSession } from '@/lib/auth/session';
import { redirect } from '@/i18n/navigation';
import { convexApi, getConvexServerClient } from '@/lib/auth/convex-server';
import { AppShell } from '@/components/app/app-shell';
import { GuestsManager } from '@/components/guests/guests-manager';
import { NotificationsPanel } from '@/components/notifications/notifications-panel';
import { RsvpQuestionsEditor } from '@/components/events/rsvp-questions-editor';
import { eventHasPremiumOnlyFeature } from '@/lib/payments/entitlements';
import { nowMs } from '@/lib/pro/format';

const PAY_TONE = {
  pending: { bg: 'var(--color-accent-soft)', fg: 'var(--color-gold-500)' },
  succeeded: {
    bg: 'color-mix(in oklch, var(--color-sage-500) 16%, transparent)',
    fg: 'var(--color-sage-500)',
  },
  failed: { bg: 'var(--color-surface-elevated)', fg: 'var(--color-danger)' },
} satisfies Record<string, { bg: string; fg: string }>;

/**
 * Espace couple — vue d'un mariage géré par une agence, accessible au couple rattaché
 * (collaborateur rôle `couple`). Suivi (date, lieu, invités/RSVP), gestion de la liste
 * d'invités (composant partagé) et paiements (régler les liens de l'agence). Données
 * couple-safe : pas de budget ni de marge agence.
 */
export default async function CoupleEventPage({
  params,
}: {
  params: Promise<{ locale: string; eventId: string }>;
}) {
  const { locale, eventId } = await params;
  setRequestLocale(locale);

  const session = await getSession();
  if (!session) redirect({ href: '/sign-in', locale });

  const convex = getConvexServerClient();
  let overview;
  try {
    overview = await convex.query(convexApi.coupleOverview, {
      eventId,
      requesterId: session!.userId,
    });
  } catch {
    notFound();
  }
  const [guests, payments, user, event] = await Promise.all([
    convex.query(convexApi.listGuestsByEvent, { eventId, requesterId: session!.userId }),
    convex.query(convexApi.listPaymentLinksForEvent, { eventId, requesterId: session!.userId }),
    convex.query(convexApi.currentUser, { userId: session!.userId }),
    convex.query(convexApi.getEventById, { eventId, requesterId: session!.userId }),
  ]);

  const t = await getTranslations('CoupleSpace');
  const format = await getFormatter();

  const eur = (minor: number) => format.number(minor / 100, { style: 'currency', currency: 'EUR' });

  const payStatusLabel: Record<keyof typeof PAY_TONE, string> = {
    pending: t('payPending'),
    succeeded: t('paySucceeded'),
    failed: t('payFailed'),
  };

  const days = Math.ceil((overview.eventDate - nowMs()) / 86_400_000);
  const dateStr = format.dateTime(new Date(overview.eventDate), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const s = overview.guestStats;

  const stat = (label: string, value: string | number) => (
    <div className="flex flex-col gap-1 rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-4 py-3.5">
      <span className="font-mono text-[10px] tracking-[0.16em] text-[color:var(--color-ink-500)] uppercase">
        {label}
      </span>
      <span className="font-display text-2xl text-[color:var(--color-ink-900)] italic tabular-nums">
        {value}
      </span>
    </div>
  );

  return (
    <AppShell userName={user?.fullName}>
      <div className="container-page flex flex-col gap-12 py-12 sm:py-16">
        {/* En-tête mariage */}
        <header className="flex flex-col gap-3">
          <span className="font-mono text-[10px] tracking-[0.32em] text-[color:var(--color-ink-500)] uppercase">
            {t('eventEyebrow')}
          </span>
          <h1
            className="font-display text-balance italic"
            style={{
              fontSize: 'clamp(2rem, 4.5vw, 3.25rem)',
              lineHeight: 1.05,
              letterSpacing: '-0.022em',
              color: 'var(--color-ink-900)',
            }}
          >
            {overview.coupleNames.partnerA} &amp; {overview.coupleNames.partnerB}
          </h1>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm text-[color:var(--color-ink-500)]">
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" strokeWidth={1.9} aria-hidden />
              {dateStr}
            </span>
            {overview.venue ? (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" strokeWidth={1.9} aria-hidden />
                {overview.venue.name}
              </span>
            ) : null}
            {days >= 0 ? (
              <span className="inline-flex items-center gap-1.5 font-medium text-[color:var(--color-ink-900)]">
                {days === 0 ? t('today') : t('daysUntil', { days })}
              </span>
            ) : null}
          </div>
        </header>

        {/* Suivi (capacité 1) */}
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {stat(t('statGuests'), s.total)}
          {stat(t('statConfirmed'), s.attending)}
          {stat(t('statPending'), s.pending)}
          {stat(t('statExpected'), s.expectedHeadcount)}
        </section>

        {/* Notifications du couple (réponses invités, infos de l'agence…) */}
        <NotificationsPanel userId={session!.userId} />

        {/* Invités (capacité 2) — composant partagé */}
        <section className="flex flex-col gap-5">
          <div className="flex items-center gap-2">
            <Users
              className="h-4 w-4 text-[color:var(--color-ink-500)]"
              strokeWidth={1.9}
              aria-hidden
            />
            <h2 className="font-display text-xl text-[color:var(--color-ink-900)] italic">
              {t('guestsTitle')}
            </h2>
          </div>
          <p className="max-w-prose text-sm text-[color:var(--color-ink-500)]">{t('guestsHint')}</p>
          <GuestsManager
            eventId={eventId}
            initialGuests={guests}
            maxGuests={event?.maxGuests ?? 0}
            questions={(event?.rsvpConfig?.customQuestions ?? []).map((q) => ({
              id: q.id,
              label: q.label,
            }))}
          />
        </section>

        {/* Questions du RSVP — éditable ou lecture seule selon la délégation agence */}
        {event ? (
          <section className="flex flex-col gap-5">
            <RsvpQuestionsEditor
              eventId={eventId}
              initialConfig={event.rsvpConfig}
              unlocked={eventHasPremiumOnlyFeature(event)}
              upgradeHref={`/espace-couple/${eventId}`}
              canEdit={event.rsvpConfig?.coupleCanEdit ?? false}
            />
          </section>
        ) : null}

        {/* Paiements (capacité 3) */}
        <section className="flex flex-col gap-5">
          <div className="flex items-center gap-2">
            <CreditCard
              className="h-4 w-4 text-[color:var(--color-ink-500)]"
              strokeWidth={1.9}
              aria-hidden
            />
            <h2 className="font-display text-xl text-[color:var(--color-ink-900)] italic">
              {t('paymentsTitle')}
            </h2>
          </div>
          {payments.length === 0 ? (
            <p className="text-sm text-[color:var(--color-ink-500)]">{t('paymentsEmpty')}</p>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {payments.map((p) => {
                const statusKey = (
                  p.status in PAY_TONE ? p.status : 'pending'
                ) as keyof typeof PAY_TONE;
                const tone = PAY_TONE[statusKey];
                return (
                  <li
                    key={p._id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-4 py-3.5"
                  >
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-medium text-[color:var(--color-ink-900)]">
                        {p.description}
                      </span>
                      <span className="font-mono text-[13px] text-[color:var(--color-ink-500)]">
                        {eur(p.amountMinor)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <span
                        className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-mono text-[10px] tracking-[0.1em] uppercase"
                        style={{ background: tone.bg, color: tone.fg }}
                      >
                        {p.status === 'succeeded' ? (
                          <CheckCircle2 className="h-3 w-3" strokeWidth={2.2} aria-hidden />
                        ) : null}
                        {payStatusLabel[statusKey]}
                      </span>
                      {p.status === 'pending' && p.checkoutUrl ? (
                        <a
                          href={p.checkoutUrl}
                          className="focus-ring inline-flex items-center gap-1.5 rounded-full bg-[color:var(--color-ink-900)] px-4 py-2 text-sm font-medium text-[color:var(--color-ivory-50)] transition-opacity hover:opacity-90"
                        >
                          {t('payCta')}
                          <ExternalLink className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                        </a>
                      ) : p.receiptUrl ? (
                        <a
                          href={p.receiptUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="focus-ring inline-flex items-center gap-1.5 rounded-full border border-[color:var(--color-border-strong)] px-3.5 py-1.5 text-xs text-[color:var(--color-ink-700)] hover:text-[color:var(--color-ink-900)]"
                        >
                          {t('receiptCta')}
                          <ExternalLink className="h-3 w-3" strokeWidth={2} aria-hidden />
                        </a>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </AppShell>
  );
}
