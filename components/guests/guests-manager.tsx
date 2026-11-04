'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PhoneInput } from '@/components/auth/phone-input';
import { GuestQrButton } from '@/components/guests/guest-qr-button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/cn';
import {
  addGuestAction,
  removeGuestAction,
  type GuestActionResult,
} from '@/app/[locale]/(app)/events/[eventId]/guests/actions';

type RsvpStatus = 'pending' | 'attending' | 'declined' | 'maybe';

export interface GuestItem {
  _id: string;
  fullName: string;
  phone?: string;
  email?: string;
  category?: string;
  plusOnesAllowed: number;
  plusOnesNames?: string[];
  rsvpStatus: RsvpStatus;
  invitationSentAt?: number;
  dietaryRestrictions?: string;
  notes?: string;
  customAnswers?: Array<{ questionId: string; values: string[] }>;
  qrCodeToken: string;
  createdAt: number;
  updatedAt: number;
}

interface Props {
  eventId: string;
  initialGuests: GuestItem[];
  /** Questions custom de l'event (id → libellé) pour afficher les réponses. */
  questions?: Array<{ id: string; label: string }>;
}

export function GuestsManager({ eventId, initialGuests, questions = [] }: Props) {
  const t = useTranslations('Guests');
  const [guests, setGuests] = useState<GuestItem[]>(initialGuests);
  const [formOpen, setFormOpen] = useState(false);
  const questionLabels = new Map(questions.map((q) => [q.id, q.label]));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl font-semibold">{t('listTitle')}</h2>
        {formOpen ? null : (
          <Button onClick={() => setFormOpen(true)} size="sm">
            {t('addGuest')}
          </Button>
        )}
      </div>

      {formOpen ? (
        <AddGuestForm
          eventId={eventId}
          onCancel={() => setFormOpen(false)}
          onAdded={(guest) => {
            setGuests((prev) => [guest, ...prev]);
            setFormOpen(false);
          }}
        />
      ) : null}

      {guests.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[color:var(--color-border)] p-8 text-center text-sm text-[color:var(--color-muted)]">
          {t('empty')}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {guests.map((g) => (
            <GuestRow
              key={g._id}
              guest={g}
              eventId={eventId}
              questionLabels={questionLabels}
              onRemoved={() => setGuests((prev) => prev.filter((x) => x._id !== g._id))}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

/** Réponses RSVP d'un invité (régime + questions custom) affichées sous le nom. */
function GuestAnswers({
  guest,
  questionLabels,
  dietaryLabel,
}: {
  guest: GuestItem;
  questionLabels: Map<string, string>;
  dietaryLabel: string;
}) {
  const answers = guest.customAnswers ?? [];
  const hasDietary = !!guest.dietaryRestrictions;
  if (!hasDietary && answers.length === 0) return null;
  return (
    <div className="mt-1.5 flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
      {hasDietary ? (
        <p>
          <span className="font-medium text-[color:var(--color-ink-700)]">{dietaryLabel} : </span>
          {guest.dietaryRestrictions}
        </p>
      ) : null}
      {answers.map((a) => {
        const label = questionLabels.get(a.questionId);
        if (!label || a.values.length === 0) return null;
        return (
          <p key={a.questionId}>
            <span className="font-medium text-[color:var(--color-ink-700)]">{label} : </span>
            {a.values.join(', ')}
          </p>
        );
      })}
    </div>
  );
}

function GuestRow({
  guest,
  eventId,
  questionLabels,
  onRemoved,
}: {
  guest: GuestItem;
  eventId: string;
  questionLabels: Map<string, string>;
  onRemoved: () => void;
}) {
  const t = useTranslations('Guests');
  const tCommon = useTranslations('Common');
  const [pending, startTransition] = useTransition();
  const [confirmRemove, setConfirmRemove] = useState(false);

  function handleRemove() {
    startTransition(async () => {
      const result = await removeGuestAction(guest._id, eventId);
      if (result.ok) {
        onRemoved();
      } else {
        setConfirmRemove(false);
      }
    });
  }

  return (
    <li
      data-testid="guest-row"
      className="flex flex-col gap-3 rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="font-medium">{guest.fullName}</span>
          <Badge variant={rsvpVariant(guest.rsvpStatus)}>{t(rsvpLabel(guest.rsvpStatus))}</Badge>
          {guest.plusOnesAllowed > 0 ? (
            <Badge variant="neutral">+{guest.plusOnesAllowed}</Badge>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-3 text-xs text-[color:var(--color-muted)]">
          {guest.phone ? <span>{guest.phone}</span> : null}
          {guest.email ? <span>{guest.email}</span> : null}
          {guest.category ? <span>• {guest.category}</span> : null}
        </div>
        <GuestAnswers
          guest={guest}
          questionLabels={questionLabels}
          dietaryLabel={t('answersDietary')}
        />
      </div>
      <div className="flex items-center gap-2">
        {/* Un invité tout juste ajouté n'a pas encore son vrai jeton (`tmp-…`). */}
        {guest.qrCodeToken.startsWith('tmp-') ? null : (
          <GuestQrButton token={guest.qrCodeToken} name={guest.fullName} />
        )}
        {confirmRemove ? (
          <>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleRemove}
              disabled={pending}
              data-testid="confirm-remove"
            >
              {pending ? tCommon('loading') : tCommon('delete')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirmRemove(false)}
              disabled={pending}
            >
              {tCommon('cancel')}
            </Button>
          </>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setConfirmRemove(true)}
            data-testid="remove-guest"
          >
            {tCommon('delete')}
          </Button>
        )}
      </div>
    </li>
  );
}

function AddGuestForm({
  eventId,
  onCancel,
  onAdded,
}: {
  eventId: string;
  onCancel: () => void;
  onAdded: (guest: GuestItem) => void;
}) {
  const t = useTranslations('Guests');
  const tCommon = useTranslations('Common');
  const [pending, startTransition] = useTransition();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | undefined>>({});
  const [error, setError] = useState<string | null>(null);

  function onSubmit(formData: FormData) {
    setError(null);
    setFieldErrors({});
    startTransition(async () => {
      const fullName = (formData.get('fullName') as string | null) ?? '';
      const phone = (formData.get('phone') as string | null) ?? '';
      const email = (formData.get('email') as string | null) ?? '';
      const category = (formData.get('category') as string | null) ?? '';
      const plusOnes = Number.parseInt(
        (formData.get('plusOnesAllowed') as string | null) ?? '0',
        10,
      );

      const result: GuestActionResult = await addGuestAction(eventId, formData);
      if (result.ok) {
        onAdded({
          _id: `tmp-${Date.now()}`,
          fullName: fullName.trim(),
          phone: phone.trim() || undefined,
          email: email.trim().toLowerCase() || undefined,
          category: category.trim() || undefined,
          plusOnesAllowed: Number.isFinite(plusOnes) ? plusOnes : 0,
          rsvpStatus: 'pending',
          qrCodeToken: `tmp-${Date.now()}`,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
        return;
      }
      if (result.fieldErrors) {
        const flat: Record<string, string | undefined> = {};
        for (const [k, v] of Object.entries(result.fieldErrors)) {
          if (v && v.length > 0) flat[k] = v[0];
        }
        setFieldErrors(flat);
        return;
      }
      if (result.error === 'INVITATION_LIMIT_REACHED') {
        setError(t('errors.limitReached'));
        return;
      }
      setError(t('errors.submit'));
    });
  }

  return (
    <form
      action={onSubmit}
      className="flex flex-col gap-4 rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-5"
      data-testid="add-guest-form"
    >
      <h3 className="font-display text-lg font-semibold">{t('addGuest')}</h3>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          label={t('fullNameLabel')}
          id="fullName"
          name="fullName"
          required
          error={fieldErrors.fullName}
          placeholder={t('fullNamePlaceholder')}
        />
        <div className="flex flex-col gap-2">
          <Label htmlFor="phone">{t('phoneLabel')}</Label>
          <PhoneInput id="phone" name="phone" error={fieldErrors.phone} />
        </div>
        <Field
          label={t('emailLabel')}
          id="email"
          name="email"
          type="email"
          placeholder={t('emailPlaceholder')}
          error={fieldErrors.email}
        />
        <Field
          label={t('categoryLabel')}
          id="category"
          name="category"
          placeholder={t('categoryPlaceholder')}
          error={fieldErrors.category}
        />
        <div className="flex flex-col gap-2">
          <Label htmlFor="plusOnesAllowed">{t('plusOnesLabel')}</Label>
          <Input
            id="plusOnesAllowed"
            name="plusOnesAllowed"
            type="number"
            min={0}
            max={10}
            defaultValue={0}
            aria-invalid={!!fieldErrors.plusOnesAllowed}
          />
          {fieldErrors.plusOnesAllowed ? (
            <p className="text-xs text-[color:var(--color-destructive)]">
              {fieldErrors.plusOnesAllowed}
            </p>
          ) : null}
        </div>
        <Field
          label={t('notesLabel')}
          id="notes"
          name="notes"
          placeholder={t('notesPlaceholder')}
          error={fieldErrors.notes}
        />
      </div>

      {error ? (
        <p
          id="add-guest-error"
          role="alert"
          className="text-sm text-[color:var(--color-destructive)]"
        >
          {error}
        </p>
      ) : null}

      <div className="flex items-center justify-end gap-3">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
          {tCommon('cancel')}
        </Button>
        <Button type="submit" disabled={pending} data-testid="submit-guest">
          {pending ? t('adding') : t('addGuest')}
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  id,
  name,
  type = 'text',
  placeholder,
  required,
  error,
}: {
  label: string;
  id: string;
  name: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
  error?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-2')}>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={name}
        type={type}
        placeholder={placeholder}
        required={required}
        aria-invalid={!!error}
      />
      {error ? <p className="text-xs text-[color:var(--color-destructive)]">{error}</p> : null}
    </div>
  );
}

function rsvpVariant(status: RsvpStatus): 'primary' | 'accent' | 'destructive' | 'neutral' {
  if (status === 'attending') return 'accent';
  if (status === 'declined') return 'destructive';
  if (status === 'maybe') return 'primary';
  return 'neutral';
}

function rsvpLabel(
  status: RsvpStatus,
): 'rsvpPending' | 'rsvpAttending' | 'rsvpDeclined' | 'rsvpMaybe' {
  if (status === 'attending') return 'rsvpAttending';
  if (status === 'declined') return 'rsvpDeclined';
  if (status === 'maybe') return 'rsvpMaybe';
  return 'rsvpPending';
}
