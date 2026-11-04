import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const sendTicketsActionMock = vi.fn();
const refreshMock = vi.fn();

vi.mock('@/app/[locale]/(app)/events/[eventId]/guests/actions', () => ({
  sendTicketsAction: (...args: unknown[]) => sendTicketsActionMock(...args),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: refreshMock }) }));
vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => (key: string, values?: Record<string, unknown>) =>
    `${namespace}.${key}${values ? `:${JSON.stringify(values)}` : ''}`,
  useLocale: () => 'fr',
}));

import { GuestsTickets } from '@/components/guests/guests-tickets';

const EVENT_ID = 'evt_1';
const counts = (over: Partial<React.ComponentProps<typeof GuestsTickets>['counts']> = {}) => ({
  attending: 5,
  eligible: 3,
  sent: 2,
  attendingNoPhone: 0,
  ...over,
});

function setup(
  props: Partial<React.ComponentProps<typeof GuestsTickets>> = {},
  user = userEvent.setup(),
) {
  render(<GuestsTickets eventId={EVENT_ID} eventStatus="active" counts={counts()} {...props} />);
  return user;
}

async function sendAndConfirm(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByTestId('tickets-send'));
  const dialog = await screen.findByRole('dialog');
  await user.click(within(dialog).getByRole('button', { name: /confirmCta/ }));
}

beforeEach(() => {
  sendTicketsActionMock.mockReset();
  refreshMock.mockReset();
});

describe('GuestsTickets', () => {
  it('affiche la progression et le nombre de QR à envoyer', () => {
    setup();
    expect(screen.getByTestId('tickets-progress')).toHaveTextContent('{"sent":2,"total":5}');
    expect(screen.getByTestId('tickets-send')).toBeEnabled();
    expect(screen.getByTestId('tickets-send')).toHaveTextContent('"count":3');
  });

  it('bloque l’envoi tant que l’événement n’est pas publié', () => {
    setup({ eventStatus: 'draft' });
    expect(screen.getByTestId('tickets-hint-unpublished')).toBeInTheDocument();
    expect(screen.getByTestId('tickets-send')).toBeDisabled();
  });

  it('explique comment faire quand aucun invité n’est confirmé', () => {
    setup({ counts: counts({ attending: 0, eligible: 0, sent: 0 }) });
    expect(screen.getByTestId('tickets-hint-none')).toBeInTheDocument();
    expect(screen.getByTestId('tickets-send')).toBeDisabled();
  });

  it('signale les confirmés sans numéro, qui ne recevront rien', () => {
    setup({ counts: counts({ attendingNoPhone: 2 }) });
    expect(screen.getByTestId('tickets-hint-nophone')).toHaveTextContent('"count":2');
  });

  it('indique que tout est parti quand il n’y a plus rien à envoyer', () => {
    setup({ counts: counts({ eligible: 0, sent: 5 }) });
    expect(screen.getByTestId('tickets-all-sent')).toBeInTheDocument();
    expect(screen.getByTestId('tickets-send')).toBeDisabled();
  });

  it('demande confirmation avant d’envoyer, et n’envoie rien si on annule', async () => {
    const user = setup();
    await user.click(screen.getByTestId('tickets-send'));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Guests.tickets.confirmBody');
    await user.click(within(dialog).getByRole('button', { name: /cancel/ }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(sendTicketsActionMock).not.toHaveBeenCalled();
  });

  it('envoie après confirmation, affiche le résultat et rafraîchit la page', async () => {
    sendTicketsActionMock.mockResolvedValue({
      ok: true,
      sent: 3,
      failed: 0,
      simulated: 0,
      total: 3,
    });
    const user = setup();
    await sendAndConfirm(user);

    await waitFor(() => expect(sendTicketsActionMock).toHaveBeenCalledWith(EVENT_ID));
    expect(await screen.findByTestId('tickets-outcome')).toHaveTextContent('resultSent');
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it('distingue un envoi simulé d’un vrai envoi', async () => {
    sendTicketsActionMock.mockResolvedValue({
      ok: true,
      sent: 0,
      failed: 0,
      simulated: 3,
      total: 3,
    });
    const user = setup();
    await sendAndConfirm(user);
    expect(await screen.findByTestId('tickets-simulated')).toHaveTextContent('"count":3');
    expect(screen.queryByText(/resultSent/)).not.toBeInTheDocument();
  });

  it.each([
    [{ message: 'Template name does not exist', code: 132001 }, 'errors.templateMissing'],
    [{ message: 'WHATSAPP_NOT_CONFIGURED' }, 'errors.notConfigured'],
    [{ message: 'Recipient unreachable', code: 131026 }, 'errors.reason'],
  ])('explique pourquoi les envois ont échoué : %o', async (firstError, expectedKey) => {
    sendTicketsActionMock.mockResolvedValue({
      ok: true,
      sent: 0,
      failed: 3,
      simulated: 0,
      total: 3,
      firstError,
    });
    const user = setup();
    await sendAndConfirm(user);
    const outcome = await screen.findByTestId('tickets-outcome');
    expect(outcome).toHaveTextContent('resultFailed');
    expect(outcome).toHaveTextContent(expectedKey);
  });

  it.each([
    ['EVENT_NOT_PUBLISHED', 'errors.notPublished'],
    ['FORBIDDEN', 'errors.forbidden'],
    ['UNKNOWN', 'errors.generic'],
  ])('traduit l’erreur %s', async (error, expectedKey) => {
    sendTicketsActionMock.mockResolvedValue({ ok: false, error });
    const user = setup();
    await sendAndConfirm(user);
    expect(await screen.findByRole('alert')).toHaveTextContent(expectedKey);
    expect(refreshMock).not.toHaveBeenCalled();
  });
});
