import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => (key: string, values?: Record<string, string>) =>
    values?.name ? `${namespace}.${key}:${values.name}` : `${namespace ?? 'T'}.${key}`,
  useLocale: () => 'fr',
}));

import { GuestQrButton } from '@/components/guests/guest-qr-button';

describe('GuestQrButton', () => {
  it('ouvre le QR de l’invité avec une image servie par /api/qr et un téléchargement PNG', async () => {
    const user = userEvent.setup();
    render(<GuestQrButton token="ABCDEFGHJKMN" name="Aminata Diallo" />);

    expect(screen.queryByTestId('guest-qr-image')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('guest-qr-open'));

    const img = await screen.findByTestId('guest-qr-image');
    expect(img).toHaveAttribute('src', '/api/qr/ABCDEFGHJKMN');
    expect(img).toHaveAttribute('alt', 'Guests.qr.alt:Aminata Diallo');

    const link = screen.getByTestId('guest-qr-download');
    expect(link).toHaveAttribute('href', '/api/qr/ABCDEFGHJKMN');
    expect(link).toHaveAttribute('download', 'qr-aminata-diallo.png');
  });

  it('garde un nom de fichier sûr pour un nom accentué ou exotique', async () => {
    const user = userEvent.setup();
    render(<GuestQrButton token="ABCDEFGHJKMN" name="Élodie O'Brien / Çelik" />);
    await user.click(screen.getByTestId('guest-qr-open'));
    expect(await screen.findByTestId('guest-qr-download')).toHaveAttribute(
      'download',
      'qr-elodie-o-brien-celik.png',
    );
  });

  it('retombe sur un nom générique si le nom n’a aucun caractère exploitable', async () => {
    const user = userEvent.setup();
    render(<GuestQrButton token="ABCDEFGHJKMN" name="???" />);
    await user.click(screen.getByTestId('guest-qr-open'));
    expect(await screen.findByTestId('guest-qr-download')).toHaveAttribute(
      'download',
      'qr-invite.png',
    );
  });
});
