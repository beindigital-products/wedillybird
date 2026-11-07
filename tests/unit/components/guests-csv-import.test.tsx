import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const importGuestsActionMock = vi.fn();
const refreshMock = vi.fn();

vi.mock('@/app/[locale]/(app)/events/[eventId]/guests/actions', () => ({
  importGuestsAction: (eventId: string, guests: unknown) => importGuestsActionMock(eventId, guests),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => {
    const t = (key: string, params?: Record<string, unknown>) =>
      `${namespace ?? 'T'}.${key}${params ? ` ${JSON.stringify(params)}` : ''}`;
    t.rich = (key: string, params?: Record<string, unknown>) =>
      `${namespace ?? 'T'}.${key} ${JSON.stringify(params ?? {})}`;
    return t;
  },
  useLocale: () => 'fr',
}));

import { GuestsCsvImport } from '@/components/guests/guests-csv-import';

const EVENT_ID = 'evt_123';
const CSV = [
  'Nom;Téléphone;Email;Accompagnants',
  'Aminata Diallo;0612345678;;2',
  'Moussa Sow;0698765432;moussa@exemple.com;0',
].join('\n');

function setup(props: Partial<React.ComponentProps<typeof GuestsCsvImport>> = {}) {
  const onClose = vi.fn();
  render(
    <GuestsCsvImport
      eventId={EVENT_ID}
      existing={[]}
      remaining={100}
      onClose={onClose}
      {...props}
    />,
  );
  return { onClose, user: userEvent.setup() };
}

async function pasteAndParse(user: ReturnType<typeof userEvent.setup>, text: string) {
  await user.click(screen.getByTestId('guests-csv-paste'));
  await user.paste(text);
  await user.click(screen.getByTestId('guests-csv-parse'));
}

beforeEach(() => {
  importGuestsActionMock.mockReset();
  refreshMock.mockReset();
});

describe('GuestsCsvImport', () => {
  it('colle un CSV, aperçoit les lignes, importe les invités valides', async () => {
    importGuestsActionMock.mockResolvedValue({ ok: true, created: 2 });
    const { user } = setup();

    await pasteAndParse(user, CSV);
    expect(screen.getByText('Aminata Diallo +2')).toBeInTheDocument();
    expect(screen.getByText('+33698765432 · moussa@exemple.com')).toBeInTheDocument();

    await user.click(screen.getByTestId('guests-csv-import-submit'));

    await waitFor(() => expect(importGuestsActionMock).toHaveBeenCalledTimes(1));
    expect(importGuestsActionMock).toHaveBeenCalledWith(EVENT_ID, [
      { fullName: 'Aminata Diallo', plusOnesAllowed: 2, phone: '+33612345678' },
      {
        fullName: 'Moussa Sow',
        plusOnesAllowed: 0,
        phone: '+33698765432',
        email: 'moussa@exemple.com',
      },
    ]);
    expect(await screen.findByTestId('guests-csv-result')).toBeInTheDocument();
    expect(refreshMock).toHaveBeenCalled();
  });

  it('n’envoie pas les doublons de la liste existante', async () => {
    importGuestsActionMock.mockResolvedValue({ ok: true, created: 1 });
    const { user } = setup({
      existing: [{ fullName: 'Aminata Diallo', phone: '+33612345678' }],
    });

    await pasteAndParse(user, CSV);
    await user.click(screen.getByTestId('guests-csv-import-submit'));

    await waitFor(() => expect(importGuestsActionMock).toHaveBeenCalledTimes(1));
    const sent = importGuestsActionMock.mock.calls[0]![1] as Array<{ fullName: string }>;
    expect(sent.map((g) => g.fullName)).toEqual(['Moussa Sow']);
  });

  it('bloque l’import quand le fichier dépasse le quota restant', async () => {
    const { user } = setup({ remaining: 1 });

    await pasteAndParse(user, CSV);

    expect(screen.getByRole('alert')).toHaveTextContent('Guests.import.quota');
    expect(screen.getByTestId('guests-csv-import-submit')).toBeDisabled();
    expect(importGuestsActionMock).not.toHaveBeenCalled();
  });

  it('affiche une erreur claire pour un fichier sans ligne de données', async () => {
    const { user } = setup();

    await pasteAndParse(user, 'Nom;Téléphone');

    expect(screen.getByRole('alert')).toHaveTextContent('Guests.import.tooFew');
    expect(screen.getByTestId('guests-csv-parse')).toBeInTheDocument();
  });

  it('montre l’erreur de quota renvoyée par le serveur et n’affiche pas le résultat', async () => {
    importGuestsActionMock.mockResolvedValue({ ok: false, error: 'INVITATION_LIMIT_REACHED' });
    const { user } = setup();

    await pasteAndParse(user, CSV);
    await user.click(screen.getByTestId('guests-csv-import-submit'));

    expect(await screen.findByRole('alert')).toHaveTextContent('Guests.errors.limitReached');
    expect(screen.queryByTestId('guests-csv-result')).not.toBeInTheDocument();
    expect(refreshMock).not.toHaveBeenCalled();
  });
});
