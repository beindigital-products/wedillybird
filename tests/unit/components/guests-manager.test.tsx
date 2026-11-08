import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { GuestItem } from '@/components/guests/guests-manager';

const addGuestActionMock = vi.fn();
const removeGuestActionMock = vi.fn();

vi.mock('@/app/[locale]/(app)/events/[eventId]/guests/actions', () => ({
  addGuestAction: (eventId: string, formData: FormData) => addGuestActionMock(eventId, formData),
  removeGuestAction: (guestId: string, eventId: string) => removeGuestActionMock(guestId, eventId),
  updateGuestAction: vi.fn(),
}));

vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => (key: string) => `${namespace ?? 'T'}.${key}`,
  useLocale: () => 'fr',
}));

import { GuestsManager } from '@/components/guests/guests-manager';

const EVENT_ID = 'evt_123';

function buildGuest(overrides: Partial<GuestItem> = {}): GuestItem {
  return {
    _id: 'g_1',
    fullName: 'Aminata Diallo',
    plusOnesAllowed: 0,
    rsvpStatus: 'pending',
    qrCodeToken: 'QR123',
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

beforeEach(() => {
  addGuestActionMock.mockReset();
  removeGuestActionMock.mockReset();
});

describe('GuestsManager', () => {
  it('renders the empty-state when there are no guests', () => {
    render(<GuestsManager eventId={EVENT_ID} initialGuests={[]} maxGuests={100} />);
    expect(screen.getByText('Guests.empty')).toBeInTheDocument();
    expect(screen.queryByTestId('guest-row')).not.toBeInTheDocument();
  });

  it('lists initial guests with their RSVP status and plus-ones badge', () => {
    const guests: GuestItem[] = [
      buildGuest({ _id: 'g_1', fullName: 'Aminata', rsvpStatus: 'attending', plusOnesAllowed: 2 }),
      buildGuest({ _id: 'g_2', fullName: 'Kwame', rsvpStatus: 'declined' }),
    ];
    render(<GuestsManager eventId={EVENT_ID} initialGuests={guests} maxGuests={100} />);

    expect(screen.getAllByTestId('guest-row')).toHaveLength(2);
    expect(screen.getByText('Aminata')).toBeInTheDocument();
    expect(screen.getByText('Guests.rsvpAttending')).toBeInTheDocument();
    expect(screen.getByText('+2')).toBeInTheDocument();
    expect(screen.getByText('Guests.rsvpDeclined')).toBeInTheDocument();
  });

  it('opens the add-guest form and submits it with form data', async () => {
    addGuestActionMock.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<GuestsManager eventId={EVENT_ID} initialGuests={[]} maxGuests={100} />);

    await user.click(screen.getByRole('button', { name: 'Guests.addGuest' }));
    expect(screen.getByTestId('add-guest-form')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Guests.fullNameLabel'), 'Awa Ndiaye');
    await user.type(screen.getByLabelText('Guests.phoneLabel'), '+221771234567');
    await user.click(screen.getByTestId('submit-guest'));

    await waitFor(() => expect(addGuestActionMock).toHaveBeenCalledTimes(1));
    const [eventId, formData] = addGuestActionMock.mock.calls[0]!;
    expect(eventId).toBe(EVENT_ID);
    expect(formData.get('fullName')).toBe('Awa Ndiaye');
    expect(formData.get('phone')).toBe('+221771234567');

    await waitFor(() => expect(screen.getByText('Awa Ndiaye')).toBeInTheDocument());
  });

  it('displays field errors returned by the server action', async () => {
    addGuestActionMock.mockResolvedValue({
      ok: false,
      error: 'INVALID_INPUT',
      fieldErrors: { phone: ['Numéro invalide (format E.164)'] },
    });
    const user = userEvent.setup();
    render(<GuestsManager eventId={EVENT_ID} initialGuests={[]} maxGuests={100} />);

    await user.click(screen.getByRole('button', { name: 'Guests.addGuest' }));
    await user.type(screen.getByLabelText('Guests.fullNameLabel'), 'Awa');
    await user.type(screen.getByLabelText('Guests.phoneLabel'), 'not-a-phone');
    await user.click(screen.getByTestId('submit-guest'));

    expect(await screen.findByText(/E\.164/i)).toBeInTheDocument();
    expect(screen.queryByText('Awa')).toBe(null);
  });

  it('shows the invitation-quota error when the server reports INVITATION_LIMIT_REACHED', async () => {
    addGuestActionMock.mockResolvedValue({
      ok: false,
      error: 'INVITATION_LIMIT_REACHED',
    });
    const user = userEvent.setup();
    render(<GuestsManager eventId={EVENT_ID} initialGuests={[]} maxGuests={100} />);

    await user.click(screen.getByRole('button', { name: 'Guests.addGuest' }));
    await user.type(screen.getByLabelText('Guests.fullNameLabel'), 'Awa');
    await user.click(screen.getByTestId('submit-guest'));

    expect(await screen.findByText('Guests.errors.limitReached')).toBeInTheDocument();
    expect(screen.queryByText('Awa')).toBe(null);
  });

  it('removes a guest after confirmation', async () => {
    removeGuestActionMock.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(
      <GuestsManager
        eventId={EVENT_ID}
        initialGuests={[buildGuest({ _id: 'g_1', fullName: 'Mamadou' })]}
        maxGuests={100}
      />,
    );

    await user.click(screen.getByTestId('remove-guest'));
    await user.click(screen.getByTestId('confirm-remove'));

    await waitFor(() => expect(removeGuestActionMock).toHaveBeenCalledWith('g_1', EVENT_ID));
    await waitFor(() => expect(screen.queryByText('Mamadou')).not.toBeInTheDocument());
  });
});
