'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AlertTriangle, CheckCircle2, QrCode, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { sendTicketsAction } from '@/app/[locale]/(app)/events/[eventId]/guests/actions';

interface Props {
  eventId: string;
  eventStatus: 'draft' | 'active' | 'archived' | 'cancelled';
  counts: {
    /** Invités confirmés. */
    attending: number;
    /** Confirmés avec un numéro, QR pas encore envoyé. */
    eligible: number;
    /** QR déjà envoyés. */
    sent: number;
    /** Confirmés sans numéro : aucun message ne peut leur être envoyé. */
    attendingNoPhone: number;
  };
}

type State =
  | { kind: 'idle' }
  | {
      kind: 'done';
      sent: number;
      failed: number;
      simulated: number;
      firstError?: { message: string; code?: number };
    }
  | { kind: 'error'; message: string };

/** Meta : « template name does not exist » — gabarit absent ou pas encore validé. */
const META_TEMPLATE_MISSING = [132001, 132000];

/**
 * Envoi du QR d'entrée par WhatsApp aux invités confirmés — un message qui ne
 * porte que le QR : aucune invitation, aucune demande de réponse. C'est le
 * parcours « ticketing » d'une liste déjà confirmée ailleurs (cf. l'import CSV).
 */
export function GuestsTickets({ eventId, eventStatus, counts }: Props) {
  const t = useTranslations('Guests.tickets');
  const router = useRouter();
  const { confirm, confirmDialog } = useConfirm();
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<State>({ kind: 'idle' });

  const isPublished = eventStatus === 'active';
  const canSend = isPublished && counts.eligible > 0;
  const allSent = counts.attending > 0 && counts.eligible === 0 && counts.sent > 0;

  async function handleSend() {
    if (!canSend) return;
    const ok = await confirm({
      title: t('confirmTitle', { count: counts.eligible }),
      description: t('confirmBody'),
      confirmLabel: t('confirmCta', { count: counts.eligible }),
    });
    if (!ok) return;

    setState({ kind: 'idle' });
    startTransition(async () => {
      const res = await sendTicketsAction(eventId);
      if (res.ok) {
        setState({
          kind: 'done',
          sent: res.sent,
          failed: res.failed,
          simulated: res.simulated,
          ...(res.firstError ? { firstError: res.firstError } : {}),
        });
        router.refresh();
        return;
      }
      setState({
        kind: 'error',
        message:
          res.error === 'EVENT_NOT_PUBLISHED'
            ? t('errors.notPublished')
            : res.error === 'FORBIDDEN'
              ? t('errors.forbidden')
              : t('errors.generic'),
      });
    });
  }

  return (
    <section
      className="flex flex-col gap-4 rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-5"
      data-testid="guests-tickets"
      aria-label={t('title')}
    >
      <div className="flex flex-col gap-1">
        <h3 className="font-display flex items-center gap-2 text-lg font-semibold">
          <QrCode className="h-4 w-4" strokeWidth={2} aria-hidden />
          {t('title')}
        </h3>
        <p className="text-sm text-[color:var(--color-muted)]">{t('intro')}</p>
      </div>

      <p className="text-sm" data-testid="tickets-progress">
        {t('progress', { sent: counts.sent, total: counts.attending })}
      </p>

      {!isPublished ? (
        <Hint testId="tickets-hint-unpublished">{t('hintNotPublished')}</Hint>
      ) : counts.attending === 0 ? (
        <Hint testId="tickets-hint-none">{t('hintNoAttending')}</Hint>
      ) : null}
      {isPublished && counts.attendingNoPhone > 0 ? (
        <Hint testId="tickets-hint-nophone">
          {t('hintNoPhone', { count: counts.attendingNoPhone })}
        </Hint>
      ) : null}

      {allSent ? (
        <p
          className="flex items-center gap-2 text-sm text-[color:var(--color-sage-500)]"
          data-testid="tickets-all-sent"
        >
          <CheckCircle2 className="h-4 w-4" strokeWidth={2} aria-hidden />
          {t('allSent')}
        </p>
      ) : null}

      {state.kind === 'done' ? <Outcome state={state} /> : null}
      {state.kind === 'error' ? (
        <p role="alert" className="text-sm text-[color:var(--color-danger)]">
          {state.message}
        </p>
      ) : null}

      <div>
        <Button
          type="button"
          size="md"
          disabled={!canSend || pending}
          onClick={() => void handleSend()}
          data-testid="tickets-send"
        >
          <Send className="h-4 w-4" strokeWidth={2} aria-hidden />
          {pending ? t('sending') : t('send', { count: counts.eligible })}
        </Button>
      </div>
      {confirmDialog}
    </section>
  );
}

function Hint({ children, testId }: { children: React.ReactNode; testId: string }) {
  return (
    <div
      className="flex items-start gap-3 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface-elevated)] p-3"
      data-testid={testId}
    >
      <AlertTriangle
        className="mt-0.5 h-4 w-4 flex-shrink-0 text-[color:var(--color-gold-700)]"
        strokeWidth={2}
        aria-hidden
      />
      <p className="text-sm leading-relaxed">{children}</p>
    </div>
  );
}

function Outcome({ state }: { state: Extract<State, { kind: 'done' }> }) {
  const t = useTranslations('Guests.tickets');
  const reason = state.firstError
    ? state.firstError.code !== undefined && META_TEMPLATE_MISSING.includes(state.firstError.code)
      ? t('errors.templateMissing')
      : state.firstError.message === 'WHATSAPP_NOT_CONFIGURED'
        ? t('errors.notConfigured')
        : t('errors.reason', { message: state.firstError.message })
    : null;

  return (
    <div className="flex flex-col gap-1 text-sm" data-testid="tickets-outcome" role="status">
      {state.sent > 0 ? (
        <p className="text-[color:var(--color-sage-500)]">
          {t('resultSent', { count: state.sent })}
        </p>
      ) : null}
      {state.simulated > 0 ? (
        <p data-testid="tickets-simulated">{t('resultSimulated', { count: state.simulated })}</p>
      ) : null}
      {state.failed > 0 ? (
        <>
          <p className="text-[color:var(--color-danger)]">
            {t('resultFailed', { count: state.failed })}
          </p>
          {reason ? <p className="text-[color:var(--color-muted)]">{reason}</p> : null}
        </>
      ) : null}
    </div>
  );
}
