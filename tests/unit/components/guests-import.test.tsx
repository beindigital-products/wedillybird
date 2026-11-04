import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const importGuestsActionMock = vi.fn();
const refreshMock = vi.fn();

vi.mock('@/app/[locale]/(app)/events/[eventId]/guests/actions', () => ({
  importGuestsAction: (...args: unknown[]) => importGuestsActionMock(...args),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => (key: string) => `${namespace ?? 'T'}.${key}`,
  useLocale: () => 'fr',
}));

import { GuestsImport } from '@/components/guests/guests-import';

const EVENT_ID = 'evt_123';
const CSV = [
  'Nom;Téléphone;Email',
  'Aminata Diallo;06 12 34 56 78;Aminata@Exemple.com',
  'Kwame Mensah;+233201234567;',
  'Sans numéro;;',
].join('\n');

beforeEach(() => {
  importGuestsActionMock.mockReset();
  refreshMock.mockReset();
});

async function openAndParse(
  user: ReturnType<typeof userEvent.setup>,
  props: Partial<React.ComponentProps<typeof GuestsImport>> = {},
  csv = CSV,
) {
  render(<GuestsImport eventId={EVENT_ID} existingGuests={[]} remaining={100} {...props} />);
  await user.click(screen.getByTestId('import-open'));
  await user.click(screen.getByTestId('import-paste'));
  await user.paste(csv);
  await user.click(screen.getByTestId('import-parse'));
}

describe('GuestsImport', () => {
  it('reste replié tant qu’on ne l’ouvre pas', () => {
    render(<GuestsImport eventId={EVENT_ID} existingGuests={[]} remaining={10} />);
    expect(screen.getByTestId('import-open')).toBeInTheDocument();
    expect(screen.queryByTestId('guests-import')).not.toBeInTheDocument();
  });

  it('propose un modèle CSV téléchargeable', async () => {
    const user = userEvent.setup();
    render(<GuestsImport eventId={EVENT_ID} existingGuests={[]} remaining={10} />);
    await user.click(screen.getByTestId('import-open'));
    const link = screen.getByTestId('import-template');
    expect(link).toHaveAttribute('download', 'modele-invites.csv');
    expect(decodeURIComponent(link.getAttribute('href') ?? '')).toContain('Nom complet;Téléphone');
  });

  it('analyse le CSV collé et prévisualise les lignes avec le numéro normalisé', async () => {
    const user = userEvent.setup();
    await openAndParse(user);

    const rows = await screen.findAllByTestId('import-row');
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.getAttribute('data-status') === 'ready')).toBe(true);
    expect(screen.getByText(/\+33612345678 · aminata@exemple\.com/)).toBeInTheDocument();
    expect(screen.getByText('+233201234567')).toBeInTheDocument();
  });

  it('marque les doublons face aux invités existants et n’importe pas ces lignes', async () => {
    importGuestsActionMock.mockResolvedValue({ ok: true, imported: 2, skipped: [] });
    const user = userEvent.setup();
    await openAndParse(user, {
      existingGuests: [{ fullName: 'Kwame Mensah', phone: '+233201234567' }],
    });

    const rows = await screen.findAllByTestId('import-row');
    expect(rows.map((r) => r.getAttribute('data-status'))).toEqual(['ready', 'duplicate', 'ready']);

    await user.click(screen.getByTestId('import-run'));
    await waitFor(() => expect(importGuestsActionMock).toHaveBeenCalledTimes(1));
    const [, payload] = importGuestsActionMock.mock.calls[0]!;
    expect(payload.rows.map((r: { fullName: string }) => r.fullName)).toEqual([
      'Aminata Diallo',
      'Sans numéro',
    ]);
  });

  it('importe en pending par défaut, et en « confirmés » quand la case est cochée', async () => {
    importGuestsActionMock.mockResolvedValue({ ok: true, imported: 3, skipped: [] });
    const user = userEvent.setup();
    await openAndParse(user);

    await user.click(screen.getByTestId('import-confirmed'));
    await user.click(screen.getByTestId('import-run'));

    await waitFor(() => expect(importGuestsActionMock).toHaveBeenCalledTimes(1));
    expect(importGuestsActionMock).toHaveBeenCalledWith(EVENT_ID, {
      markConfirmed: true,
      rows: [
        {
          fullName: 'Aminata Diallo',
          phone: '+33612345678',
          email: 'aminata@exemple.com',
          plusOnesAllowed: 0,
        },
        { fullName: 'Kwame Mensah', phone: '+233201234567', plusOnesAllowed: 0 },
        { fullName: 'Sans numéro', plusOnesAllowed: 0 },
      ],
    });
  });

  it('envoie markConfirmed=false si la case reste décochée', async () => {
    importGuestsActionMock.mockResolvedValue({ ok: true, imported: 3, skipped: [] });
    const user = userEvent.setup();
    await openAndParse(user);
    await user.click(screen.getByTestId('import-run'));
    await waitFor(() => expect(importGuestsActionMock).toHaveBeenCalled());
    expect(importGuestsActionMock.mock.calls[0]![1].markConfirmed).toBe(false);
  });

  it('affiche le résultat et rafraîchit la page après l’import', async () => {
    importGuestsActionMock.mockResolvedValue({ ok: true, imported: 3, skipped: [] });
    const user = userEvent.setup();
    await openAndParse(user);
    await user.click(screen.getByTestId('import-run'));

    expect(await screen.findByTestId('import-result')).toBeInTheDocument();
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it('affiche une erreur et reste sur l’aperçu si l’import échoue', async () => {
    importGuestsActionMock.mockResolvedValue({ ok: false, error: 'UNKNOWN' });
    const user = userEvent.setup();
    await openAndParse(user);
    await user.click(screen.getByTestId('import-run'));

    expect(await screen.findByText('Guests.import.errors.submit')).toBeInTheDocument();
    expect(screen.queryByTestId('import-result')).not.toBeInTheDocument();
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it('signale un fichier sans ligne exploitable', async () => {
    const user = userEvent.setup();
    await openAndParse(user, {}, 'Nom;Téléphone');
    expect(await screen.findByText('Guests.import.errors.empty')).toBeInTheDocument();
    expect(screen.queryByTestId('import-run')).not.toBeInTheDocument();
  });

  it('bloque l’import si aucune colonne ne correspond au nom', async () => {
    const user = userEvent.setup();
    await openAndParse(user, {}, 'Téléphone;Email\n06 12 34 56 78;a@b.fr');
    expect(await screen.findByText('Guests.import.errors.noNameColumn')).toBeInTheDocument();
    expect(screen.getByTestId('import-run')).toBeDisabled();
  });

  it('désactive l’import quand toutes les lignes sont invalides ou au-delà du quota', async () => {
    const user = userEvent.setup();
    await openAndParse(user, { remaining: 0 });
    await screen.findAllByTestId('import-row');
    expect(screen.getByTestId('import-run')).toBeDisabled();
    expect(
      screen.getAllByTestId('import-row').every((r) => r.getAttribute('data-status') === 'limit'),
    ).toBe(true);
  });
});
