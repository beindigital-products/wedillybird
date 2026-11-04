import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TICKET_TEMPLATE, getTicketTemplateName } from '@/lib/whatsapp/templates';

describe('gabarit « QR d’entrée »', () => {
  it('a 3 variables séquentielles et aucune demande de réponse', () => {
    const vars = TICKET_TEMPLATE.bodyText.match(/\{\{\d+\}\}/g);
    expect(vars).toEqual(['{{1}}', '{{2}}', '{{3}}']);
    expect(TICKET_TEMPLATE.bodyText).not.toMatch(/confirm|répond|reponse/i);
  });

  it('le nom par défaut est surchargeable par variable d’environnement', () => {
    expect(getTicketTemplateName({})).toBe('wedding_entry_pass');
    expect(getTicketTemplateName({ WHATSAPP_TICKET_TEMPLATE: 'autre' })).toBe('autre');
  });

  it('le document de soumission Meta contient exactement le texte du code', () => {
    const doc = readFileSync(`${process.cwd()}/docs/whatsapp-entry-pass-template.md`, 'utf8');
    expect(doc).toContain(TICKET_TEMPLATE.bodyText);
    expect(doc).toContain(TICKET_TEMPLATE.metaTemplateName);
    expect(doc).toContain(TICKET_TEMPLATE.metaTemplateEnvVar);
  });
});
