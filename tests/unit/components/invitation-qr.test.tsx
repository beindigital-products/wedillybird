import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('next-intl/server', () => ({
  getTranslations: async (namespace?: string) => (key: string, params?: Record<string, unknown>) =>
    `${namespace ?? 'T'}.${key}${params ? ` ${JSON.stringify(params)}` : ''}`,
}));
vi.mock('@/i18n/navigation', () => ({
  Link: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock('@/components/invitation/wedding-countdown', () => ({ WeddingCountdown: () => null }));
vi.mock('@/components/invitation/rsvp-form-v4', () => ({ RsvpFormV4: () => null }));
vi.mock('@/components/invitation/reveal', () => ({
  Reveal: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('@/components/landing/footer-rich', () => ({ LandingFooterRich: () => null }));

import { GuestQr } from '@/components/invitation/guest-qr';
import { InvitationContent } from '@/components/invitation/invitation-content';

const TOKEN = 'ABCDEFGHJKMN';

const event = {
  coupleNames: { partnerA: 'Alice', partnerB: 'Bob' },
  eventDate: Date.UTC(2027, 5, 12, 14, 0),
  timezone: 'Europe/Paris',
};

async function renderContent(
  rsvpStatus: 'pending' | 'attending' | 'declined' | 'maybe',
  demo = false,
) {
  const ui = await InvitationContent({
    token: TOKEN,
    locale: 'fr',
    accentColor: 'oklch(72% 0.09 20)',
    demo,
    guest: { fullName: 'Aminata Diallo', plusOnesAllowed: 2, rsvpStatus },
    event,
  });
  render(ui);
}

describe('GuestQr', () => {
  it('rend un SVG accessible avec fond blanc et modules sombres', () => {
    render(<GuestQr value={TOKEN} label="QR code d'entrée de Aminata" />);
    const svg = screen.getByRole('img', { name: "QR code d'entrée de Aminata" });
    expect(svg.tagName.toLowerCase()).toBe('svg');
    expect(svg.querySelector('rect')?.getAttribute('fill')).toBe('#ffffff');
    expect(svg.querySelector('path')?.getAttribute('d')).toMatch(/^M\d+ \d+h\d+v1h-\d+z/);
  });
});

describe('InvitationContent — QR d’entrée', () => {
  it('s’affiche, avec le code de secours, quand l’invité a confirmé sa présence', async () => {
    await renderContent('attending');
    expect(screen.getByTestId('guest-qr-section')).toBeInTheDocument();
    expect(screen.getByTestId('guest-qr')).toBeInTheDocument();
    expect(
      screen.getByText(`Invitation.qrManual ${JSON.stringify({ code: TOKEN })}`),
    ).toBeInTheDocument();
  });

  it.each(['pending', 'declined', 'maybe'] as const)(
    'ne s’affiche pas tant que le statut est « %s »',
    async (status) => {
      await renderContent(status);
      expect(screen.queryByTestId('guest-qr-section')).not.toBeInTheDocument();
    },
  );

  it('ne s’affiche pas en démo (token fictif)', async () => {
    await renderContent('attending', true);
    expect(screen.queryByTestId('guest-qr-section')).not.toBeInTheDocument();
  });
});
