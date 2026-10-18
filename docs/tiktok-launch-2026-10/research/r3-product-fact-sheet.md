# Wedillybird — Product Fact Sheet for the 30 English TikTok videos

Prepared 2026-10-18 by read-only audit. Every statement is one of: (a) read from the repo at `/home/user/wedillybird`, HEAD `4efeeed` (merge of PR #112, 2026-09-11; shallow clone, 145 commits); (b) a read-only GET of a public wedillybird.com page made on 2026-10-18; (c) labelled as inference.

Production appears to equal the repo HEAD: the live sitemap stamps all 84 URLs `lastmod 2026-09-11T20:50Z` (assumption: no later deploy).

Not done: no install, build, app run, generation/studio/TikTok/OpenArt call, or spend. Not available to me: `.context/pricing-v2.md`, `.context/redesign-direction.md`, `.context/livrables-wedillybird/*` (cited by CLAUDE.md and code comments, absent from the repo), and any Stripe / Meta / Twilio / AWS / Convex-prod / PostHog data. Anything that depends on those is UNVERIFIED.

Status legend used everywhere below:

- LIVE: implemented in code at HEAD and reachable in the shipped UI. "(prod-checked)" means I also fetched the public page today.
- PARTIAL: works, but a material gap changes what may be claimed.
- BACKLOG: not implemented, disabled, or labelled "soon" in the product.
- UNVERIFIED: code exists but depends on an external approval/config or production behaviour I could not observe.

---

## 0. The 20 things that would make a video false (read this first)

| # | Claim in circulation (site copy, CLAUDE.md, drafts) | What the code / docs actually say | Evidence | Safe alternative |
|---|---|---|---|---|
| 1 | "Invitations delivered on WhatsApp" and "in the US and Canada, guests get an SMS" | WhatsApp invitation templates (5 styles) and D-7/D-1 reminder templates are marked "coded, Meta submission still to launch" in BACKLOG.md (undated, may be stale). Twilio is deliberately NOT set on prod Convex until the A2P / Toll-Free verification is approved (runbook verified 2026-07-27). WhatsApp bodies are sent with language `fr` (French text only). Invitations go only to guests that have a phone number. No email invitation exists. | BACKLOG.md:307-315; docs/prod-runbook.md:78; convex/lib/whatsappCloud.ts:159; lib/whatsapp/templates.ts:37-78; convex/guests.ts:343; convex/invitationActions.ts:101,136 | Say "one personal link per guest". Do not show or promise delivery, channel, or delivery speed. |
| 2 | "Every guest gets a unique QR code" (Plans.qrCodes, FAQ, pre-drafted hooks "garde son QR code") | No QR image is generated anywhere. Guests have a 12-character token (`convex/lib/qrToken.ts`; the seeds use 20 hex characters); the scanner (html5-qrcode) treats the decoded text as that raw token. The only QR drawing in the app is a decorative mock (`QrMono`) in the unlinked couple space. | components/checkin/qr-scanner.tsx; components/checkin/checkin-manager.tsx (submit); components/mon-mariage/parts.tsx:224; grep: no `qrcode`/`qrserver` anywhere in app, components, lib, convex | "Check guests in at the door by scanning their code or typing it." Never show a guest holding or receiving a QR from Wedillybird. |
| 3 | "Twelve openings. Twelve worlds." / "Twelve openings to choose from" / "choose your music and photo" | Couples can choose only 2 openings (`seal`, `floral`). 10 more play in the landing gallery (8 work, 2 have missing English strings) and 1 (`jardin-japonais`) is unreleased. The real guest page `/i/[token]` is given no `cinematic`, `music`, `photoUrl` or `eventDate` props, so it always plays the default Seal with no music; a couple's chosen design shows only in the owner preview (`/events/<id>/preview`), while `/demo` can show any opening through a URL parameter. Two of the twelve (`theatre`, `voyage`) have missing English strings. | components/invitation/cinematics/registry.ts:49; app/[locale]/i/[token]/page.tsx:90-97 vs app/[locale]/(app)/events/[eventId]/preview/page.tsx:135-146 and app/[locale]/(marketing)/demo/page.tsx:142-152; messages/en.json:912,920 | "Open the demo invitation and watch the envelope open." (wedillybird.com/en/demo) |
| 4 | "Automatic reminders to non-responders (D-7 and D-1)" / "Follow up with guests who haven't replied" | The daily cron reminds only guests whose RSVP is already `attending`. The only "Awaiting reply / follow up with non-responders" audience sits in the agency Messaging tab, which is disabled (`MESSAGING_WIRED = false`). | convex/reminders.ts:76,206-225; messages/en.json (WhatsApp.reminders.d7Description "to confirmed guests"; Plans.features.guestReminders; Marketing.guide.step4.item1); components/pro/weddings/hub-ops-tabs.tsx:666-671 | "Confirmed guests get a reminder a week and a day before." (email by default; WhatsApp only with approved templates) |
| 5 | Guest-list import; "Dietary needs aggregated by category" (Landing.features.rsvp.highlights) | No guest import exists. Guests are added one by one; the only CSV feature for guests is an export. CSV import exists only for agency CRM clients. Dietary needs are free text shown per guest and exported in the CSV; no aggregate or category view exists. | convex/guests.ts:34-110; app/api/events/[eventId]/guests.csv/route.ts; components/pro/integrations/csv-import.tsx; components/guests/guests-manager.tsx:105-108; messages/en.json (Landing.features.rsvp.highlights) | "Export your guest list, with dietary needs, to CSV for the caterer." |
| 6 | "Printable final PDF album", albums, "HD photo book printed and delivered to your home" | No PDF-album generator and no album feature in the real gallery (albums exist only in the simulated agency tab). The photo-book "order" stores an address and emails ops, who make and ship it by hand. 0 orders to date. | grep "album" in app/components/convex/lib returns only the simulated tab and plan strings; convex/photoBooks.ts:5-8; messages/en.json:3935 | Do not mention PDF album or albums. Photo book only after founder confirms fulfilment. |
| 7 | Unsourced numbers: "98% open rate", "22% for email", "2 billion", "page weighs less than 80 KB, tested on 3G, 2-second load", "opened in two seconds", "Three seconds" (real Seal opening is about 5.7 s), "RSVP in 30 seconds", "3 minutes" (site) vs "PLAN YOURS IN 2 MINUTES" (video script), "99.9% SLA", "reply within 4 h", "Most popular" badge | No source in the repo for any of them. The repo's own guardrails flag percentages, "tested/measured/proven" and counts as needing proof. | messages/en.json:630,659,706,764,784,799,3987,4007; scripts/generate-video-assets.mjs:65; agents/.../guardrails.py | Use no numbers, or numbers that come from the code (for example "5 weddings in parallel" on Starter). |
| 8 | "Encrypted local IndexedDB cache" / "works 100% offline" | The Dexie tables hold names and tokens in plain text. There is no service worker: offline scanning only works while the already-loaded check-in page stays open. | lib/offline/guests-db.ts; lib/checkin/queue.ts; no `serviceWorker` in app/components/lib/public | "Keep checking guests in when the signal drops; scans sync when you are back online." |
| 9 | "Data hosted in Europe" / "Stored in Europe (Convex Frankfurt, Vercel Paris)" | The Privacy Policy (live) says "Convex (database, US)", "Vercel (hosting, US/EU)"; the policy never claims EU-only storage. | messages/en.json:611,792 vs live /en/legal/privacy | Say nothing about data location. |
| 10 | "Full refund within 7 days" (hero, CTA, pricing) | Terms: "Full refund within 7 days **if the event has not been sent**". The wizard says "before invitations are sent". | messages/en.json:374,610,801,4162 | Quote the condition or omit. Always human-review. |
| 11 | "Prices exclude tax. Any local sales tax is added at checkout." | Stripe computes no tax on this account (`amount_total` is the displayed price). BACKLOG item 9 says no US acquisition traffic until Stripe Tax is activated. | messages/en.json:4030; lib/payments/vat.ts:9-12; BACKLOG.md:30-34 | Do not mention tax. Founder decision needed before US paid or organic push. |
| 12 | Price/plan statements in CLAUDE.md, offers.md, FAQ | `agents/.../offers.md` is stale (19/49/29 EUR, 89/179/349, 69). CLAUDE.md says Essential has no shared gallery and caps of 100/250 invitations; code gives Essential a 30-day gallery and sets `maxGuests` to 5000 for every B2C event, so the hub can read "limit 5000 invitations". Pro pages show plans in $ and overages in EUR. | agents/.../knowledge/offers.md; lib/payments/plans.ts:103; convex/events.ts:38,570; messages/en.json:772 | Treat every price or limit as human-review. Section C lists the exact code values. |
| 13 | Agency wedding hub shown as a live feature set | In `/pro/weddings/<id>`: Messaging is disabled; Check-in is a client-side simulation ("simulate scan", "simulate offline"); Gallery renders a hard-coded fake photo set with names like "Aminata D."; Seating is a preview. | components/pro/weddings/hub-ops-tabs.tsx:8-13,666-671,1408,1903 | Film the real single-event pages instead (`/events/<id>/...`) or the agency cockpit/CRM/budget. |
| 14 | "HoneyBook import, Zapier, API and webhooks" (Agency plan, /pros) | In the product these three connectors carry a "Soon" badge. Only CSV client import works. | app/[locale]/(app)/pro/integrations/page.tsx:107-112; messages/en.json:887,4004,4701 | Say "CSV import". |
| 15 | PAYG "1 wedding, gallery for 12 months" | Org access derives from the credit balance; publishing consumes the credit (balance 0), after which `orgHasActiveAccess` is false (gallery would read expired, back-office "no plan"). Code-reading finding, not tested. | convex/events.ts:730-790; lib/payments/entitlements.ts:186-194,335-348 | Do not promote PAYG. |
| 16 | Social proof | 0 live transactions at last count (CLAUDE.md); testimonials and "1 240 weddings" were removed in the Sept audit; the hero couple photo is an Unsplash stock image; "Camille & Hugo", "Léa & Adam", "Sarah & Marc" are fictional. | docs/landing-audit-2026-09.md:95,160; CLAUDE.md | No customers, counts, ratings, quotes, "loved by". Label demo couples as fictional. |
| 17 | Name | A different company, Weddybird (weddybird.com), sells wedding-planning software with guest websites. | Section E | Always write "Wedillybird"; never "Weddy". |
| 18 | "No card required to explore" on /pros | An agency back-office is locked until a subscription, PAYG credit or gifted account exists; `events.create` for an org throws `SUBSCRIPTION_REQUIRED`. The claim is accurate for couples only (create, preview, add guests; pay to publish and send). | convex/events.ts:505-506; lib/payments/entitlements.ts:248-260 | Couples: "create and preview before you pay". |
| 19 | Legal notice completeness | Live /en/legal/mentions lacks legal form, registered address, SIRET and publication director. Terms last updated 2026-04-25. | live fetch; BACKLOG.md:119-129 | Fix before paid spend; do not cite legal pages as complete. |
| 20 | "Premium: seating with conflicts / constraints" | Seating has drag-and-drop, auto-seat by category, round/rectangular tables, print. "Do not seat X near Y" constraints are listed as future work. | BACKLOG.md:438-442; messages/en.json (Pros.wedge.items.seating.detail) | "Drag-and-drop seating plan with auto-seat." |

---

## A. Positioning

**One paragraph (safe, LIVE-only features).**
Wedillybird is a wedding-organisation web app built around the guest's phone. Instead of a PDF or an app to install, each guest gets one personal link to an animated invitation page where they reply: coming, maybe or can't make it, with plus-ones, dietary needs and a note for the couple. The couple follows replies on a dashboard, checks guests in at the door with a phone scanner that keeps working if the signal drops, seats confirmed guests at tables on the Premium plan, and gathers everyone's photos in a moderated shared gallery afterwards. Couples pay once per wedding, with no subscription. Wedding planners get a separate multi-wedding back-office (CRM, budget, vendors, quotes, white-label branding) on monthly plans. The company is French (Tuum Agency, trading as Wedillybird); the site is available in seven languages.

**10 words.** "One personal link per guest: invitation, RSVP, check-in, photo gallery."

**25 words.** "Wedillybird is a wedding platform giving each guest one personal link to an animated invitation and RSVP, plus scanner check-in and a moderated photo gallery."

(Both word counts verified; wording is for human approval like all copy.)

**Taglines and headline options that already exist in the copy** (source in brackets):

- "Your wedding invitations, delivered by text." [Landing.hero.title + titleAccent; live]
- "Your wedding, organised stress-free" [Common.tagline]
- "A wedding lives in the conversation. Make it happen there." [Auth.title; FR original "Le mariage se vit dans la conversation. Faites-le exister là."]
- "A wedding is no longer planned in a PDF." [Landing.manifesto.title]
- "The big day deserves better than a PDF." [Landing.ctaFinal.title]
- "An envelope that opens, a card that comes alive." [Landing.cinematic.title]
- "A fair price for the most beautiful day." [Landing.pricing.title]
- "Prepare your big day" [Auth.tagline]
- "The wedding concierge that lives in your guests' texts. Designed for weddings around the world." [Landing.footer.tagline]
- "Not an app, a moment that lasts." [Landing.manifesto.pullquote]
- Pros: "The operating system for your wedding agency"; "From the first message to the last shared memory"; "On the day, where other tools stop" [Pros.hero/journey/wedge]
- Video-script overlays already drafted in `scripts/generate-video-assets.mjs`: "Planning a wedding in 2026…", "What if it was simple?", "A wedding invitation your guests will actually keep.", "RSVP in 3 taps. No app needed.", "All your wedding photos. In one place." (the last-frame text "PLAN YOURS IN 2 MINUTES" and the terracotta colours there are legacy; do not reuse).
- Open A/B hooks in the AI-ops plan: "Le mariage se vit dans la conversation" vs "Invitations WhatsApp, RSVP et check-in en un seul lien".

Brand voice constraints (agents/.../brand-voice.md): calm wedding-operations partner; practical before poetic; warm, not sugary; name the friction (spreadsheets, scattered RSVPs, manual relaunches, day-of check-in); no fake urgency, no exaggerated promises.

Audiences and markets: couples (one-shot) and wedding planners / agencies (subscription). The English launch targets the US and Canada (FAQ comment "hors-sujet marché de lancement"; flag emoji for `en` is the US flag; `en` defaults to USD).

---

## B. Feature table

Columns: feature; what it does for couple / guest / planner; status; evidence (path:line or live URL); one safe English claim (still subject to human review); claims to avoid.

### B1. Before the wedding: invitations and guests

| Feature | Couple / guest / planner | Status | Evidence | Safe one-line claim | Avoid |
|---|---|---|---|---|---|
| Personal invitation page (`/i/<token>`) | Couple adds guests; each gets a unique link. Guest opens it in the phone browser, no app or account: names, countdown, date and venue, RSVP form, link to the photo gallery. Planner: same page under `<slug>.wedillybird.com/i/<token>` in the agency colour, Wedillybird footer hidden. | LIVE (prod-checked via /en/demo, which renders the same components) | app/[locale]/i/[token]/page.tsx:90-112; components/invitation/invitation-content.tsx; app/[locale]/(public-org)/orgs/[slug]/i/[token]/page.tsx | "Every guest gets one personal link that opens in their phone's browser, nothing to install." | "opens in two seconds", "under 80 KB", "works on 3G" (unsourced); "customisable page (colours, photo, text)": on the guest page only the couple's accent colour is applied. |
| Opening animation ("cinematic") | Couple: "The Seal" is included on every plan; picking another opening, music and photo is Premium/Pro. Guest: full-screen opening (Seal about 5.7 s, Bloom about 10 s), "Skip" button, then the page; replays on reload or `?replay=1`. | PARTIAL (see openings list below) | registry.ts:14-49; cinematic2.tsx:60 (waits 4.59 s + 1.1 s); cinematics/floral.tsx:42 (9.0 s + 1.1 s); app/[locale]/i/[token]/page.tsx:90-97; convex/lib/invitationDesign.ts:104-136 | "Watch a sealed envelope open on the couple's names: try the live demo at wedillybird.com/en/demo." | "twelve openings", "pick your opening and your guests see it", "three seconds". |
| Invitation music | Premium/Pro: five original in-house tracks (Aurore, Jardin, Célébration, Envol, Harmonie) or own MP3/M4A up to 10 MB. A "Open the invitation" gate starts audio (browser autoplay rule). | PARTIAL: configurable and previewable, but `music` is not passed on the guest page | lib/invitation/music.ts; components/invitation/invitation-shell.tsx; i/[token]/page.tsx:90-97 | "Preview your invitation with one of five original tracks (Premium)." | "your guests hear your song". |
| Couple photo and day-of schedule on the invitation | Premium/Pro: upload a couple portrait and a ceremony schedule. | PARTIAL: rendered only in the owner preview (`InvitationPortrait`, `InvitationSchedule`), not in the guest page body | preview/page.tsx:150,254; invitation-content.tsx (neither component imported) | Do not claim. | "your photo and schedule on the invitation". |
| Invitation message style and personal note | Couple picks a tone (Warm default, Classic, "Ceremony", Festive, Minimal), adds a short personal note, sees a live phone mockup. A "custom template" card (badged "Premium" in the UI but not plan-gated in code, and absent from the plan feature lists) is submitted to Meta for approval (minutes up to 24 h). | LIVE in code; wording is French only (mockup text and sent message are French; English translations exist only for Meta submission) | lib/whatsapp/templates.ts:37-86; components/events/whatsapp-message-mockup.tsx; lib/whatsapp/template-translations.ts; events/[eventId]/messaging/page.tsx | "Choose the tone of the invitation message." (UI only, without showing the French preview) | Showing the message mockup in an English video; "messages sent in English". |
| Sending: WhatsApp | Couple publishes (needs a paid plan), presses "Send to N guests". Each guest with a phone number gets a Meta template message with a button to their link. In mock mode the UI says "Demo mode — no real message was sent". | UNVERIFIED (templates not shown as approved; WABA verification unknown; error 131030 handling suggests unverified-WABA behaviour was hit) | convex/invitationActions.ts:42-196; convex/lib/whatsappCloud.ts:88-110; BACKLOG.md:307-315 | none until a real delivery proof exists | "delivered on WhatsApp", "98% open rate". |
| Sending: SMS to +1 numbers | Routing by recipient country code: `+1` goes to Twilio SMS in English ("{first}, {couple} invite you to their wedding on {date}. {note} RSVP: {url} Reply STOP to opt out."), only if Twilio is configured; otherwise falls back to WhatsApp. Delivery status tracked via StatusCallback; 15-minute deliverability alert. Default personal note is French ("Au plaisir de vous voir."). | UNVERIFIED (Twilio intentionally absent from prod per runbook) | convex/lib/channelRouting.ts:21,44; convex/invitationActions.ts:101-134; convex/smsDeliveries.ts; lib/whatsapp/templates.ts:86; docs/prod-runbook.md:78 | none until A2P approval is confirmed | "guests in the US and Canada get an SMS". |
| Sending: email | Not an invitation channel. Email is used for sign-in links, D-7/D-1 reminders, receipts, partner invites, newsletter. | BACKLOG for invitations | convex/guests.ts:343 (`g.phone` required) | n/a | "send invitations by email". |
| RSVP form | Guest chooses "I'll be there / Maybe / I can't make it"; if attending: plus-one names (up to the allowance the couple set per guest, 0 to 10), dietary needs (free text, 200 chars), note for the couple (500 chars). Confetti on success; guest can change the answer. Organisers get an in-app notification. | LIVE (demo mode prod-checked; no write in demo) | components/invitation/rsvp-form-v4.tsx; convex/rsvps.ts:10-82; en.json Invitation.* | "Guests reply from their phone: coming, maybe or can't make it, with plus-ones and dietary needs." | "30 seconds", "3 taps", "structured meal selection" (free text only, unless Premium custom question). |
| Custom RSVP questions | Premium/Pro: up to 10 questions (short text, long text, single choice, multiple choice, yes/no), required or only-if-attending. Answers appear in the CSV. | LIVE | lib/rsvp/questions.ts:85; convex/events.ts:281-330; en.json RsvpEditor | "Add your own RSVP questions, like meal choice or shuttle (Premium)." | none |
| RSVP dashboard | Event hub shows confirmed / pending / maybe / declined counts, invitations sent, and an SMS delivery block. In production the counters are a live Convex subscription (`useQuery`); otherwise server-rendered. | LIVE | components/events/live-guest-stats.tsx; app/[locale]/(app)/events/[eventId]/page.tsx | "See who is coming, pending or declined on one dashboard." | "73% replied in 24 h" (mockup figure), "limit 5000 invitations" visible on screen. |
| Reminders D-7 / D-1 | Daily cron (10:00 UTC) reminds guests whose RSVP is already "attending": by email when the guest has an email (default channel), by WhatsApp only if the event channel is whatsapp/both AND the Meta reminder templates are configured (otherwise email-only fallback). 12-hour de-dup. | PARTIAL (confirmed guests only) | convex/crons.ts:9-14; convex/reminders.ts:29-169; lib/reminders/window.ts; en.json WhatsApp.reminders | "Confirmed guests get a reminder a week and a day before." | "chases non-responders", "automatic WhatsApp reminders". |
| Relaunch of non-responders | Not available to couples. The agency Messaging tab has an "Awaiting reply" audience but the tab is switched off. | BACKLOG | hub-ops-tabs.tsx:662-671; en.json:3096-3097 | n/a | any relaunch or follow-up claim. |
| Guest list: add, edit, delete | One at a time: name, phone, email, category, plus-ones 0-10, notes; a unique token and link per guest. | LIVE | convex/guests.ts:34-135; components/guests/guests-manager.tsx | "Add each guest with their plus-ones; every guest gets a unique link." | "import your list". |
| Guest list: import | None. | BACKLOG | see row 5 of section 0 | n/a | "import from Excel/CSV/contacts". |
| Guest list: CSV export | Full list with status, plus-one names, dietary, custom answers, notes and token. | LIVE | app/api/events/[eventId]/guests.csv/route.ts | "Export your guest list to CSV for the caterer." | none |
| Couple self-serve space `/mon-mariage` | Home, guests/RSVP dashboard, planning (default retro-planning seeded), vendors, budget, seating, plan screens; Convex-backed. No link to it exists anywhere in the app navigation; anonymous visits redirect to sign-in. `/capture-mm` renders the same UI with mock data (blocked on production: 404). | PARTIAL (built, unlinked) | app/[locale]/(app)/mon-mariage/page.tsx; convex/coupleSpace.ts; grep for "/mon-mariage" links: none; live GET /en/capture-mm = 404 | none until the founder confirms it ships | "budget tracker and vendor manager for couples". |

**Openings by English name** (`InvitationDesign.themes`, registry in `components/invitation/cinematics/registry.ts`):

- Offered in the couple and agency pickers today: **The Seal** (`seal`, default, all plans); **The Bloom** (`floral`, Premium/Pro; "a rosebud opens at dawn, then the garden leads you beneath the flowered arch"; uses an AI-generated video plate).
- Render fine, appear in the landing gallery and on `/en/demo?cinematic=<id>`, but cannot be chosen: **The Invitation** (`fairepart`: press the wax seal, card opens onto your photo), **The Royal Invitation** (`royal`), **The Wedding Cake** (`cake`), **The Constellation** (`etoiles`), **The Lanterns** (`lanternes`), **The Shore** (`rivage`), **The Fireworks** (`feux`), **The Art Deco** (`deco`).
- Broken in English (missing keys, verified against en.json): **The Curtain Rise** (`theatre`, key `actOne`) and **The Boarding** (`voyage`, keys `passDate`, `passGate`, `passSeat`). Do not film.
- Unreleased: `jardin-japonais` (plate video exists in `public/cinematics`; no English name; the server rejects it as an invalid cinematic).

### B2. Day of the wedding

| Feature | Couple / guest / planner | Status | Evidence | Safe one-line claim | Avoid |
|---|---|---|---|---|---|
| Check-in scanner | Staff open `/events/<id>/check-in`: phone-camera scanner (html5-qrcode) or manual code box. A valid guest token gives a "Welcome <name>" toast with the guest's plus-one allowance; a repeat gives "Already checked in"; 30-second undo; 2-second per-code cooldown. | PARTIAL: the scanner is complete, but no QR code image is generated for guests anywhere | components/checkin/checkin-manager.tsx:51-52,203-330; components/checkin/qr-scanner.tsx; convex/guests.ts:251-330; components/mon-mariage/parts.tsx:224 | "Welcome guests at the door by scanning their code, or type it in." | "every guest gets a QR code in their invitation". |
| Offline check-in | Guest list cached in IndexedDB; offline scans are queued, shown as "N check-ins pending sync", drained automatically when `online` fires (or "Sync now") through an idempotent `/api/checkin/sync`. The server currently records the sync time, not the scan time. BACKLOG item "sync queue" is stale: it is implemented. | LIVE with caveats | lib/offline/guests-db.ts; lib/checkin/queue.ts; app/api/checkin/sync/route.ts:1-20 | "Keep checking guests in when the signal drops; scans sync when you are back online." | "works 100% offline", "encrypted cache", "no signal needed to open the page". |
| Seating plan | Premium/Pro: `/events/<id>/seating`. List or floor-plan view; drag confirmed guests (plus-ones placed individually) onto round or rectangular tables; capacity warnings; "Auto-seat" groups by category; printable page. | LIVE (Essential sees an upgrade prompt) | convex/seating.ts; convex/lib/autoplace.ts; BACKLOG.md:423-442; tests/e2e/seating.spec.ts; en.json Seating.* | "Drag-and-drop seating plan with auto-seat and print (Premium)." | "manage constraints / conflicts". |

### B3. After the wedding: photos

| Feature | Couple / guest / planner | Status | Evidence | Safe one-line claim | Avoid |
|---|---|---|---|---|---|
| Shared gallery | Guests reach it from their invitation link; couple uploads too. JPG/PNG/WebP up to 15 MB, compressed in the browser, direct upload to S3. Every photo starts "pending"; guests see approved photos plus their own pending ones. Only open while the gallery window is open (paid plan). | LIVE (infra per runbook; production behaviour not observed by me) | convex/photos.ts:98-240; components/gallery/guest-gallery.tsx; components/gallery/photo-uploader.tsx | "Guests add their photos from the same link." | speeds ("approved in seconds"). |
| Moderation | Automatic screening (Rekognition: adult content, violence, shocking content; optional OpenAI check) then couple Approve / Reject / Remove; borderline photos wait for manual review. Runs for every plan (listed as a Premium bullet). | LIVE | convex/photos.ts:323-340,561-625; BACKLOG.md:210-216; en.json Gallery.moderationNotice | "Photos are screened automatically, and you approve or reject." | "AI guarantees nothing inappropriate". |
| Retention | Essential 30 days after the event date; Premium 180 days; HD upsell 5 years; agency weddings stay open while the agency is covered (60-day read-only grace after a gifted account ends). | LIVE | convex/lib/eventPlan.ts:15-18; lib/payments/plans.ts:103-118; convex/lib/entitlements.ts | "Premium keeps your gallery online for six months; add the HD option for five years." | CLAUDE.md's "Essential has no gallery". |
| HD ZIP download | Premium/Pro, or any plan after the +29 EUR / +30 USD HD upsell. | LIVE | lib/gallery/zip-access.ts; app/[locale]/(app)/events/[eventId]/gallery/download-zip/route.ts | "Download every photo in one ZIP (Premium or HD option)." | none |
| Face search ("Find my photos") | Premium/Pro, opt-in, OFF by default: couple selects wedding state/province and ticks a consent notice; guests upload a selfie (not stored); Rekognition matches. Blocked for Illinois, Texas, Washington. Faces purged within 24 h after expiry. | LIVE (cannot run without AWS) | convex/events.ts:403-458; convex/lib/biometricConsent.ts:25; en.json FaceSearchPrivacy, Legal.privacy.biometricsBody | "Optional face search lets guests find their photos with a selfie (Premium, off by default)." | showing real faces; "available everywhere"; accuracy claims. |
| Albums / PDF album | No album feature in the real gallery; no PDF generator. Appears in Premium plan copy, Stripe description and Terms. | BACKLOG / not found | section 0 row 6 | n/a | any mention. |
| HD photo book | After the HD upsell the couple enters an address; ops are emailed and make and ship it by hand ("We print and ship within fifteen days"). 0 orders. | PARTIAL (manual) | convex/photoBooks.ts:5-8; en.json Upgrade.upsell.photoBook | none until fulfilment is proven | "delivered to your door". |

### B4. Wedding planners (agency back-office, dark theme)

| Feature | Planner view | Status | Evidence | Safe one-line claim | Avoid |
|---|---|---|---|---|---|
| Cockpit, multi-wedding, quotas | `/pro/dashboard`: KPIs, quota gauges (active events, storage, messages, seats), upcoming weddings with RSVP progress, activity. Active-event quota is enforced at publish (5 / 20 / 50). | LIVE | convex/pro.ts; components/pro/cockpit.tsx; convex/events.ts:730-790 | "Run several weddings from one cockpit." | "unlimited". |
| CRM pipeline | `/pro/clients`: kanban Lead, Contacted, Quote, Booked, In progress, Delivered; notes; lead-to-wedding conversion; CSV import. Business and up. | LIVE | convex/clients.ts; lib/payments/entitlements.ts:108-117; tests/e2e/pro-clients.spec.ts | "Move leads to booked weddings on a kanban board (Business)." | "never lose a lead". |
| Quotes, invoices, contracts | `/pro/quotes`, `/pro/contracts`, Business and up. "E-signature" is a status workflow (draft, sent, signed by client, countersigned, active) with an audit log, not a cryptographic or qualified signature. | LIVE (workflow) | convex/contracts.ts:1-30; convex/quotes.ts | "Send quotes and contracts from the same place." | "legally binding e-signature". |
| Payments to the agency's own Stripe | Stripe Connect onboarding; payment links as direct charges on the agency's connected account; no application fee in code. Business and up. | LIVE in code; UNVERIFIED in prod (needs the Connect webhook secret) | convex/paymentLinks.ts; app/api/stripe/connect/*; .env.example | none yet | "no commission" until prod proof. |
| Budget, vendors, planning | Editable per-wedding budget with payment ledger and exports (Business+); vendor directory (Starter up to 25, Business+ unlimited) attachable to weddings; task planning with phases and templates. | LIVE | convex/budget.ts; convex/vendors.ts:75-81; convex/planning.ts | "Track each wedding's budget, vendors and tasks." | none |
| Integrations | CSV client import works. HoneyBook, Zapier/Make, API and webhooks are "Soon". | PARTIAL / BACKLOG | pro/integrations/page.tsx:107-112 | "Import your clients from a CSV." | the three connectors. |
| Team and seats | Invite colleagues by email; seats 2 / 8 / unlimited enforced; roles. | LIVE | convex/organizations.ts:604-611,744-751; lib/payments/entitlements.ts:42-67 | "Invite your team." | none |
| White label | Brand colour and logo, `<slug>.wedillybird.com` (wildcard host answers: a probe of an unknown slug returned HTTP 404 over valid TLS, so DNS/cert exist; a real org was not tested), invitation pages under the subdomain, couple portal `/espace-couple` (agency invites the couple by phone; guest list and payments). Agency "total white label" (own domain, own sender email, no badge) is only a stored field plus copy: no custom-domain routing in `proxy.ts`. | PARTIAL / UNVERIFIED | proxy.ts:52-69; convex/organizations.ts:281-306; tests/e2e/couple-portal.spec.ts; lib/pro/white-label.ts:32 (stale `.fr` helper) | "Your colour and logo on your couples' invitation pages (Business)." | "your own domain and emails". |
| Agency wedding hub tabs | Messaging disabled; Check-in simulated; Gallery fake photos; Seating preview. | PARTIAL (simulated) | section 0 row 13 | n/a | filming them as real. |
| Pay-as-you-go | One-off agency event. | UNVERIFIED | section 0 row 15 | n/a | do not promote. |

### B5. Platform and business

| Feature | What it does | Status | Evidence | Safe one-line claim | Avoid |
|---|---|---|---|---|---|
| 7 locales | `fr` (default, no URL prefix), `en`, `es`, `it`, `pt` (PT-PT), `de`, `ar` (right-to-left). No forced redirect; a soft banner suggests the browser language. Parity of keys is script-checked, completeness is not. | LIVE (prod-checked: sitemap has all 7) | i18n/routing.ts:3-12; scripts/validate-i18n-parity.ts | "Available in seven languages." | claiming every screen is polished in all 7. |
| Multi-currency | Display currency follows billing country (geo cookie `wbb_ccy`): US and Canada get USD, everyone else EUR; footer switch offers EUR, USD, MAD; XOF and TND are display-only. English locale falls back to USD. A UK or Australian viewer sees EUR. | LIVE | proxy.ts:116-130; lib/payments/country.ts:56-75; lib/payments/currency.ts:96-115 | "Prices show in dollars in the US and Canada." | "pay in your local currency"; "the price adjusts to your region" (only the currency changes; there is no regional pricing). |
| Checkout and invoices | Stripe Checkout (one-shot for couples, subscriptions for agencies), Customer Portal, PDF invoice per payment. EUR prices include 20% VAT; USD shown without tax. 0 live transactions at last count. The in-app English upgrade card prints a hard-coded "Essential — $40" next to the formatted price (duplicate or wrong currency). | LIVE / UNVERIFIED money path | lib/payments/vat.ts; app/api/payments/[paymentId]/invoice.pdf/route.tsx; components/payments/upgrade-card.tsx:81-82 | "Payments are processed by Stripe." | filming the upgrade or checkout step; "secure" or "guaranteed". |
| Overage pricing | EUR 0.06 per message, EUR 0.25 per extra guest, EUR 0.03 per GB-month, EUR 19 per extra event or seat. These are display constants: no metering or invoicing code exists; messages and storage are only measured for gauges; guests-per-event is not enforced (cap 5000). Reaching the active-event quota blocks publishing instead. | BACKLOG (display only) | lib/payments/entitlements.ts:70-81; convex/events.ts:38; convex/pro.ts:62-98; grep "invoiceItems / usage_record": none | none | "no hidden fees", "billed as used". |
| Partner (affiliate) programme | Invitation-only. Admin creates a partner with code and link; first-touch 30-day cookie; commission 20% of the tax-exclusive net unless agreed otherwise; combined discount plus commission capped at 25%; codes valid 12 months; vests on the wedding date and at least 7 days after purchase; payout monthly, EUR 50 minimum. Partner space `/partenaire`; public terms `/legal/affiliation`. Creators must disclose ads and use only real features. Partner invites can gift an agency account (N months) or a free Premium wedding. | LIVE (CI e2e on the in-memory backend) | convex/affiliate.ts; convex/partnerInvites.ts; messages Legal.affiliation; tests/e2e/partner-journey.spec.ts | "Partner programme by invitation." | open-signup "affiliate" calls to action. |
| Installable app (PWA) | Manifest only; the three icon files it references do not exist in `public/`; no service worker. | BACKLOG | app/manifest.ts:17-30; public/ | n/a | "install the app". |
| Newsletter | Footer form "Get our free invitation templates": subscribers stored; there are no templates to send (the `/templates` page is a placeholder). | LIVE form, empty promise | convex/newsletter.ts; messages/en.json:806 | n/a | "templates signed by renowned wedding designers". |
| Notifications | In-app bell and email for RSVP replies and similar. | LIVE | convex/notifications.ts; convex/lib/notify.ts | n/a | n/a |
| Admin console `/admin/*` | Internal back-office (payments, users, affiliates, moderation, acquisition). | LIVE (internal) | app/[locale]/(app)/admin | do not film | personal data. |

---

## C. Pricing as live in code (human review required for every price mention)

Source of truth read: `lib/payments/plans.ts`, `lib/payments/subscriptions.ts`, `lib/payments/entitlements.ts`, `lib/payments/currency.ts`, `lib/payments/vat.ts`, plus live pages. The canonical `.context/pricing-v2.md` was not available.

### C1. Couples (one-shot per wedding)

| Item | EUR (incl. 20% VAT) | USD (shown excl. tax) | Gallery after the wedding | What the code gives |
|---|---|---|---|---|
| Essential | 29 EUR (`plans.ts:86`) | 40 USD (`:95`) | 30 days | Invitation page, unique guest token and link, real-time RSVP, offline check-in, basic dashboard, text invitation, D-7/D-1 reminders. No opening choice (Seal only), no seating, no custom RSVP questions, no face search, no ZIP. |
| Premium | 59 EUR (`:87`) | 80 USD (`:96`) | 180 days | Essential plus: opening/music/photo choice, seating plan, custom RSVP questions, face search (opt-in), ZIP download, 3 WebP photo sizes, AI moderation bullet. "PDF album" is promised but not implemented. |
| Post-wedding HD option | +29 EUR (`:88`) | +30 USD (`:97`) | 5 years | Longer retention, HD ZIP, photo-book order (manual). |

Other currencies are derived from EUR at fixed rates (MAD x10.7, TND x3.4, XOF x655.957) and only EUR, USD and MAD can be paid; XOF and TND are display-only. USD for couples is a hand-set market price (not EUR x1.08), per the 2026-07-06 decision in the code comment. The currency a viewer sees follows the billing country, not the language: only US and Canada get dollars, so a UK, Australian or other English-speaking viewer sees 29 / 59 EUR. A caption saying "$40" is therefore true for US/CA billing only.

### C2. Agencies (subscription, annual is 12 x monthly x 0.80 rounded up)

| Tier | Monthly EUR / USD | Annual EUR / USD (per month equivalent) | Active weddings | Guests per wedding (nominal) | Messages per month (gauge) | Storage (gauge) | Seats | Feature gates |
|---|---|---|---|---|---|---|---|---|
| Starter | 99 / 99 | 951 / 951 (79.25) | 5 | 150 | 3,000 | 50 GB | 2 | Branding, vendor directory up to 25, no CRM pipeline |
| Business | 219 / 219 | 2,103 / 2,103 (175.25) | 20 | 150 | 10,000 | 200 GB | 8 | CRM kanban, editable budget, quotes and contracts, payment links, couple portal |
| Agency | 449 / 449 | 4,311 / 4,311 (359.25) | 50 | 150 | 25,000 | 500 GB | unlimited | Multi-wedding analytics, integrations (only CSV works), "total white label" (partly stored fields) |
| Pay-as-you-go | 79 / 79 per wedding | n/a | 1 | 150 | n/a | 25 GB | n/a | See section 0 row 15 |

Evidence: `subscriptions.ts:64-72,112-120,145-146`; `entitlements.ts:42-67`. Pro USD is nominal parity with EUR (founder decision 2026-07-27; the v2.4 increase was cancelled). Enforced limits: active events at publish, seats, vendor cap, feature tiers. Display only: messages, storage, guests per event, overage prices.

### C3. Contradictions between code, messages, CLAUDE.md and offers.md

| Topic | Code | messages/en.json and live site | CLAUDE.md | agents/.../offers.md |
|---|---|---|---|---|
| Couples prices | 29 / 59 / +29 EUR; 40 / 80 / +30 USD | same (FAQ, Terms, cards) | same | **19 / 49 / 29 EUR (stale)** |
| Agency prices | 99 / 219 / 449; PAYG 79 | same; pages show $ for plans and EUR for overages | same (with a v2.4 paragraph that contradicts parity, then explicitly cancels it) | **89 / 179 / 349; PAYG 69 (stale)** |
| Essential gallery | 30 days | Terms: "core features + 30-day gallery"; Upgrade card: "Gallery active 30 days"; pricing card lists none | "sans galerie partagée" | not stated |
| Invitation caps | `maxGuests` = 5000 for all B2C events (`events.ts:38`) | FAQ: "Essential up to 100, Premium up to 250" | "100 / 250 invitations max" | not stated |
| FAQ obsolete plan | n/a | `Faq.questions.guestVsInvitation` still says "Sérénité plan (150 invitations)" (en.json:596) | n/a | n/a |
| PAYG price in comments | 79 | n/a | 79 | `subscriptions.ts:141` comment still says 69 |
| BACKLOG.md | n/a | n/a | n/a | BACKLOG.md:30 still lists $39 / $99 / +$59 (couples) and $89 / $179 / $349 (agencies); BACKLOG.md:56 lists Starter 29 / Business 79 / Agency 199 EUR per month; BACKLOG.md:376 shows the PAYG card at 69 EUR |
| Extra seat | EUR 19 per month (`entitlements.ts:79`) | "+EUR 19/month" on plans page vs "On request" in Pros pricing add-ons | n/a | n/a |
| Currency symbols | USD plans | `/forfaits-pros` and `/pros`: plans in $, overages in EUR, HD option in $ | n/a | n/a |
| US tax | none computed | "Any local sales tax is added at checkout" | n/a | n/a |

---

## D. Public URLs, sign-up flow, link-in-bio

Default locale is French at the root (`/`). Use the `/en` prefix explicitly; there is no automatic redirect by browser language.

### D1. What an anonymous viewer can open today

| URL | What it is | Status | Promote? |
|---|---|---|---|
| `https://wedillybird.com/en` | English landing: hero "Your wedding invitations, delivered by text.", CTAs "Plan my wedding" and "See an invitation", four pillars, channels, opening gallery, pricing (USD for US/CA viewers), FAQ, footer. | LIVE (prod-checked) | Yes, main link |
| `/en/demo` | Real invitation page for fictional couple Léa and Adam, guest "Sam", venue "Domaine des Lilas", June 12, 2027. Banner "Demo invitation · fictional couple", "Replay the opening", "Create mine" (to sign-up), live RSVP form (no data stored). `?cinematic=<id>` and `?replay=1` supported. | LIVE (prod-checked) | Yes, best proof page |
| `/en/pros` | Agency landing: "The operating system for your wedding agency", 11 modules, plans in USD, overages in EUR. | LIVE (prod-checked) | Only for the planner audience, after claims clean-up |
| `/en/forfaits-pros` | Agency plans (Starter, Business "Most popular", Agency, PAYG). | LIVE (prod-checked) | Not yet (mixed currencies, "reply within 4 h") |
| `/en/guide` | "The Perfect Wedding Guide": five-stage checklist. | LIVE (prod-checked) | Optional (contains the non-responder claim) |
| `/en/faq`, `/en/contact` | FAQ (questions listed; answers are accordions that include the stale "Sérénité" and 100/250 wording) and contact (hello@, support@, privacy@wedillybird.com). | LIVE (FAQ prod-checked) | Optional, after copy fixes |
| `/en/legal/terms`, `/privacy`, `/cookies`, `/affiliation`, `/mentions` | Legal; `/mentions` is incomplete (no legal form, address, SIRET, director). `/mentions` is not in the sitemap. | LIVE (prod-checked) | No |
| `/en/sign-up`, `/en/sign-in` | Phone tab (default) and Email tab. | LIVE (prod-checked) | Via landing CTAs only |
| `/en/templates` | Six colour-block cards named "Minimalist Elegance", "Country Romance", "Oriental Night", "Traditional Purity", "Sunset", "Black & Gold Signature". No real template previews; these are not selectable designs. | LIVE but placeholder | **No** |
| `/en/blog` | 404. | n/a | No |
| `/en/capture-mm`, `/en/dev-login` | 404 on production by design. | n/a | No |
| `/en/mon-mariage` | Redirects anonymous visitors to sign-in. | n/a | No |
| `https://<slug>.wedillybird.com` | Agency subdomains; unknown slug returns 404 over valid TLS. | UNVERIFIED for real orgs | No |
| `/en/i/<token>` | Private per-guest links (noindex). Never publish a real token. `scripts/capture-prod-invitation.mjs` contains a production token: do not use or fetch it. | n/a | No |

The sitemap lists 12 paths times 7 locales (84 URLs): `/`, `/demo`, `/pros`, `/templates`, `/guide`, `/forfaits-pros`, `/contact`, `/faq`, `/legal/terms`, `/legal/privacy`, `/legal/cookies`, `/legal/affiliation`.

### D2. Sign-up flow in English (read from code, entry pages prod-checked)

1. `wedillybird.com/en` hero button "Plan my wedding" (or header "Create an account") opens `/en/sign-up`, heading "Welcome to Wedillybird", step label "STEP 01 — IDENTITY". `?plan=essential` or `?plan=premium` is carried over from the pricing cards.
2. Two methods: **Phone** tab (default; country selector; "Send code"; a 6-digit code arrives by WhatsApp, or by SMS for +1 only when Twilio is live; valid 5 minutes) or **Email** tab ("Send my link"; one-time magic link valid 15 minutes). Because US numbers fall back to WhatsApp while Twilio is off, the **Email** tab is the safe path to show to a US audience.
3. Onboarding in three steps: profile (first and last name, email), secure the account (add phone or email), role ("A couple getting married" or "A professional").
4. A couple lands on `/dashboard`, which jumps to the event page when there is one event, or offers "Create an event".
5. Wizard `/events/new`: The couple (title, two first names), Date and time zone (must be in the future), Venue (optional), Visual theme (optional colours and typeface), Choose your plan. Copy: "The payment is not charged until you activate the plan. Full refund within 7 days if you change your mind before invitations are sent."
6. Event page (draft): add guests, preview the invitation, customise the message. **Publishing and sending require a paid plan** (`PLAN_REQUIRED`), via Stripe Checkout ("Activate a plan").
7. After publishing: "Send to N guests", track replies, day-of check-in, gallery, optional HD upsell.
8. A planner chooses "A professional", creates an organisation (`/pro/onboarding`), then needs a subscription, PAYG credit or a partner-gifted account before the back-office unlocks.

### D3. Link-in-bio recommendation

- Primary: `https://wedillybird.com/en` (landing in English, CTA above the fold, links to demo and sign-up). Use the apex domain.
- For "wow" videos, the call to action can be "try the demo invitation: wedillybird.com/en/demo" (no sign-up, shows the real component).
- UTM tags are an assumption: the repo has no UTM-specific code, but standard analytics SDKs record them. Suggested: `?utm_source=tiktok&utm_medium=organic&utm_campaign=<video-id>`. Whether production analytics are actually collecting is unverified: the Sept 2026 audit lists the PostHog production keys, the cookieless-mode switch and Vercel Web Analytics as founder to-dos (docs/landing-audit-2026-09.md:157,165-167).
- Social-share previews (Open Graph image) are in French ("Invitations mariage par WhatsApp, RSVP, check-in").
- Do not use `?ref=CODE` unless the video belongs to a partner (it sets a 30-day attribution cookie and affects commission).

---

## E. Claims guardrails

### E1. What can be said (all LIVE, no external dependency)

- One personal link per guest; the page opens in the browser; no app or account for guests.
- The opening animation exists and can be watched on the demo page. The sealed-envelope Seal is the default for everyone.
- Guests reply with attending / maybe / declined, plus-ones, dietary text and a note; custom questions on Premium.
- The couple sees counts of confirmed, pending, maybe and declined, and can export the guest list to CSV.
- Door check-in with a phone scanner or by typing a code; undo within 30 seconds; offline queue that syncs when back online.
- Premium: seating plan with drag-and-drop, auto-seat, print; custom RSVP questions; ZIP download; opt-in face search (not offered for weddings in Illinois, Texas or Washington).
- Shared gallery: guests upload from their link; automatic screening plus couple approval; retention 30 days (Essential), 6 months (Premium), 5 years with the HD option.
- Couples pay once per wedding; two plans; no subscription for couples.
- Agencies: multi-wedding cockpit, CRM kanban (Business), budget, vendors, quotes and contracts (Business), team seats, brand colour and logo on invitation pages.
- Seven interface languages.
- French company (Tuum Agency, trading as Wedillybird); payments processed by Stripe.

### E2. What cannot be said

- Any usage count, satisfaction score, review, rating, "trusted by", "loved by", "#1", "most popular", customer story or quote (none exist; 0 live transactions at last count; the Sept 2026 audit removed the invented ones). A voice-over reading as a customer counts as an invented testimonial; use clearly dramatised POV only.
- Any percentage, speed or time claim (30 seconds, two seconds, three seconds, 3 or 2 minutes, 98%, 22%, 80 KB, 3G, SLA, 4 h).
- Delivery or deliverability: "delivered on WhatsApp", "SMS in the US and Canada", "98% open rate", "never lands in spam".
- Hosting and security: "data hosted in Europe", "GDPR compliant", "encrypted", "secure".
- Legal and payment promises: unconditional refund, "free postponement up to 24 months" (the Terms say only "free postponement to another date"), "tax added at checkout", "no hidden fees", "legally binding e-signature", "no commission". Every price needs human review (offers.md, approval-checklist.md).
- Features that do not exist or are not wired: guest import, dietary summary by category, non-responder follow-up, QR codes issued to guests, PDF album, albums, photo book delivery, custom domain and own-domain email, HoneyBook/Zapier/API, seating constraints, PAYG, budget/vendor tools for couples.
- "Twelve openings", "choose your music and photo and your guests see it", The Curtain Rise, The Boarding, the Japanese garden.
- Competitor claims ("HoneyBook does not...", "your competitors don't have these").
- Guest personal data of any kind (names, phones, photos). Seeds contain realistic names and phone numbers; blur or replace. The test number `+33612931779` (user "Mamadou Seck") looks like a personal number: never on screen.

### E3. Brand name, voice and text-to-speech

- Written form: **Wedillybird** (capital W, one word, no space or hyphen). Domain `wedillybird.com`. The logo wordmark is lowercase "wedillybird" in a bold serif, with two lovebirds forming a heart and a four-point star (`public/wedillybird-logo.png`, 2001 x 551, RGBA).
- Never: "Wedilly Bird" (used only in internal PostHog/Convex org names), "WeddyBird", "Weddybird", "Weddy", "Wedding Bird", camel case.
- Suggested TTS: respelling **"WED-ih-lee-bird"**, IPA `/ˈwɛdɪliˌbɝd/` (SSML: `<phoneme alphabet="ipa" ph="ˈwɛdɪliˌbɝd">Wedillybird</phoneme>`). Say the domain as "wedillybird dot com". The stress and vowels are my inference from the spelling, not a founder statement: record a 3-second test per TTS engine and have the founder approve once. Keep on-screen captions spelled "Wedillybird".
- Look: ivory, blush, champagne gold; Bodoni Moda Italic for display lines, Geist for UI text (DESIGN.md). Do not describe the brand as "terracotta"; do not reuse the terracotta end cards from `scripts/generate-video-assets.mjs`.

### E4. Possible confusion with Weddybird

- The Sept 2026 landing audit found that a search for "wedillybird" returns WeddyBird (weddybird.com, @WeddyBird on X) first (docs/landing-audit-2026-09.md:68-71,147).
- My web search found weddybird.com/en/about-weddybird: a wedding-planning platform with planning tools and guest-facing wedding websites ("everything from save-the-date to the photo gallery"). The brief calls it a German company; I could not confirm its legal entity or country (the search also surfaced unrelated WeddyPlace GmbH in Berlin, the Weddy iOS app, and Wedy). Same category, so confusion risk is real.
- Rules: never mention or compare; avoid hashtags `#weddybird` and `#weddy`; claim `@wedillybird` on every platform before posting; put "wedillybird.com" on screen in the first and last second; spell the name once in captions.

### E5. Process rules the repo already imposes

- `agents/.../knowledge/approval-checklist.md`: a human checks offer alignment, sourced numbers, real testimonials, guest data, legal/payment/deliverability promises, correct CTA, and approves.
- `agents/.../guardrails.py` flags as "source required" any line matching percentages, "N x", "plus de N", "N mariages/clients/utilisateurs/invites", or the words tested/measured/proven.
- No licensed music unless rights are documented. The five tracks in `public/audio/invitation` are original in-house synthesis ("zero third-party sample, free commercial use", `scripts/generate-invitation-music.mjs` header), so they are safe; trending TikTok sounds are not (TikTok business accounts are generally limited to its commercial music library; general platform knowledge, not from the repo).
- AI disclosure: the two cinematic plate videos are AI-generated (OpenArt wan2-7 pipeline per `.claude/skills/invitation-cinematic/references/pipeline-media.md`). TikTok asks creators to label realistic AI-generated content; label any video that includes them or other generated imagery or voice, to be safe.
- Creator posts follow the partner terms article 8: visible "ad / commercial collaboration" label, no promise of results, no misleading price statement, no bidding on the brand name.

### E6. Safe one-line claim bank (still human-reviewed)

1. "One personal link per guest, nothing to install."
2. "Guests reply in a few taps, plus-ones and dietary needs included."
3. "See who is coming, pending or declined on one dashboard."
4. "Export your guest list to CSV."
5. "Welcome guests at the door with a phone scanner, even when the signal drops."
6. "Guests add their photos from the same link; you approve what appears."
7. "Drag-and-drop seating plan with auto-seat (Premium)."
8. "Pay once per wedding, no subscription."
9. "Open the live demo invitation, no sign-up."
10. "Planners: one cockpit for every wedding, CRM, budget and vendors (Business and up)."
11. "Face search is optional, off by default, and not available in Illinois, Texas or Washington."
12. "Available in English, French, Spanish, Italian, Portuguese, German and Arabic."

---

## F. UI capture feasibility

### F0. Verdict

- **Feasible, medium effort, no secrets needed.** The repo has a seeded, locally runnable stack: the real `convex/**` functions served from memory through `convex-test` (`tests/e2e/support/serve.mjs`), seed functions (`convex/seed.ts`), captured emails, and Playwright config that wires everything (`playwright.config.ts`). CI exercises it with `CONVEX_MEM=1` and no secrets (`.github/workflows/ci.yml`), but only for the admin/partner journey (`tests/e2e/partner-journey.spec.ts`); the couple and planner screens are not proven on that backend, so plan a half-day smoke-test spike.
- Three tiers:
  - Tier 0, no backend: `pnpm dev` with a dummy Convex URL renders every public page: landing, `/demo` (all openings, RSVP demo), pricing, pros pages, legal, and `/capture-mm` (mock couple space).
  - Tier 1, in-memory Convex: authenticated screens (host dashboard, guests, seating, check-in, gallery, agency cockpit, CRM, budget).
  - Tier 2, real Convex dev deployment: needs a Convex account and secrets (not "no secrets"); gives live WebSocket updates.
- **Ready-made capture scripts are not usable as is**: `scripts/capture-marketing-en.mjs`, `capture-launch-screens.mjs`, `capture-prod-invitation.mjs` import Playwright from the author's Mac path (`/Users/rrr/conductor/workspaces/wedillybird-convex/nicosia/...`), expect an app on `localhost:3001`, a guest token (`0d548d2d246c4c2aa126`) that exists only in the author's dev Convex deployment, and write to `.context/attachments/` (absent). They take still PNGs, not video. Their `wedillybird-locale-suggestion-dismissed` localStorage key is dead code (the real dismissal is the cookie `wbb_locale_suggestion_dismissed`).
- No pre-made screenshots or recordings exist in the repo.

### F1. Best 9:16 recordings for about 8 feature videos

| # | Video | Exact route and actions | Data needed | Tier | Authenticity | Notes and risks |
|---|---|---|---|---|---|---|
| 1 | The invitation opens | `/en/demo` (Seal); `/en/demo?cinematic=floral&replay=1` (Bloom); optional `?cinematic=fairepart`, `royal`, `feux`, `deco`, `lanternes`, `etoiles`, `rivage`, `cake`. Wait about 6 s (Seal) or 10 s (Bloom) before scrolling. | none | 0 | High (real component) | Demo banner is visible, which is honest. Silent: add an in-house track in post. Never `theatre`, `voyage`, `jardin-japonais`. The countdown appears only after hydration. |
| 2 | RSVP in a few taps (guest) | `/en/demo`, scroll to "Will you join us?": tap "I'll be there", fill plus-one, dietary, note, "Send my reply": confetti. | none | 0 | High (demo mode, nothing stored) | The demo guest has 1 plus-one allowance. |
| 3 | Host dashboard and guest list | `/en/events/<eventId>` and `/en/events/<eventId>/guests` (RSVP badges, "Add an invitation" form, CSV export link). | `seed:seedLaunchDemo` (event "Sarah & Marc", 18 guests across attending/maybe/declined/pending, plus-ones, dietary), then shift the date (see recipe) | 1 | High | Counters do not tick live (no WebSocket in this stack). Hub text can read "limit 5000 invitations": crop or use the `seedTierFixtures` Premium event (limit 250). Blur phone numbers. |
| 4 | Live RSVP (split screen) | Phone view `/en/i/<sampleInvitationToken>` replying; desktop hub refreshed. | as 3 | 1 | Medium (refresh needed) | Real live counters need Tier 2. |
| 5 | Door check-in, offline | `/en/events/<eventId>/check-in`. Chromium fake camera showing QR images of guest tokens; `context.setOffline(true)` then scan: toast "Saved locally (offline)", badge "N check-ins pending sync"; go online: "N check-ins synced". | seed as 3; QR images generated outside the app from `guests:listByEvent` tokens | 1 | Medium (real scanner UI; QR images are staged because the app issues none) | Needs a fake-camera spike (about half a day). Do not imply the app produces the QR. |
| 6 | Seating plan | `/en/events/<eventId>/seating`: drag guests, "Auto-seat", "Floor plan", "Print" (`/seating/print`). | Premium event with 12+ attending guests (launch-demo seed is Premium) | 1 | High | Use pointer drags with stepped mouse moves. |
| 7 | Shared gallery | Guest `/en/i/<token>/gallery`; owner `/en/events/<eventId>/gallery` (filters, Approve/Reject, "Download all as ZIP"). | Photo rows inserted through `photos:confirmOwnerUpload` then `photos:internalMarkModerated`; `CLOUDFRONT_DOMAIN=media.wedillybird.com` set on the memory backend; Playwright route intercept fulfils `https://media.wedillybird.com/**` with local licensed or AI stock images | 1 | Medium (staged data) | Uploads and face search call AWS and cannot run; do not film upload speed or face search. CSP only allows `*.cloudfront.net` and `media.wedillybird.com` images. No real faces. |
| 8 | For wedding planners | `/en/pro/dashboard` (gauges), `/en/pro/clients` (kanban), `/en/pro/budget`, `/en/pro/vendors`, `/en/pro/weddings` list. Avoid the Messaging/Check-in/Gallery tabs inside `/pro/weddings/<id>`. | `seed:seedTestUsers` then `seed:seedTierFixtures`: agency "Studio Lumière" (Agency tier), clients Awa and Karim, Léa and Tom, Sofia and Mehdi, vendors, curated budget lines; sign in as `camille@wedillybird.test` | 1 | High for cockpit/CRM/budget | Dark theme (Linear-grade), data is EUR and France-flavoured. Do not mention integrations beyond CSV. |
| 9 | Landing and pricing scroll | `/en`, `#pricing`; cookie `wbb_ccy=USD` for dollars. | none | 0 | High | Every price needs review; hide the cookie bar. |
| 10 | Sign up in four screens | `/en/sign-up` then onboarding then `/en/events/new` wizard then event page. Phone-OTP can be filmed with `DEMO_BYPASS_PHONE`/`DEMO_BYPASS_CODE` set on the memory backend, or use the Email tab with the captured magic link. | none (fresh DB) | 1 | High | Payment step needs dev mode plus `PAYMENTS_DRIVER=mock` (mock checkout is disabled in `NODE_ENV=production`); in prod mode, stop before payment or seed a paid event. |
| 11 | Couple planning space (only if the founder confirms it ships) | `/en/capture-mm?screen=dashboard`, `planning`, `vendors`, `budget`, `seating`, `forfait` | none; mock bundle | 0 | Low (mock data, unlinked feature) | Blocked on production only; works locally. |
| - | Not recommended | WhatsApp or SMS message received on a phone (no real capture, delivery unproven, French text); agency hub tabs; upgrade/checkout step (duplicated "$40"); `/en/templates`. | | | | |

### F2. Prerequisites

- Node 22 (`.nvmrc` = 22; sandbox has 22.22.0), pnpm 10.28.1 (`packageManager`; sandbox has it), `ffmpeg` 6.x for post (sandbox has 6.1.1, no `qrencode` filter), Chromium via Playwright 1.59.x (a devDependency; not installed in this sandbox, no `node_modules` either).
- Internet for `pnpm install`, the Playwright browser download, and **`next build`, which fetches Google Fonts** (Bodoni Moda, Geist, Geist Mono) through `next/font/google`; an offline build will fail.
- A QR generator for the check-in video (not in this sandbox: no `qrcode`/`segno` Python module, no `qrencode`): for example `pnpm dlx qrcode` or `qrencode`.
- Env vars (all dummy; no secrets): `NEXT_PUBLIC_CONVEX_URL`, `APP_BASE_URL`, `NEXT_PUBLIC_APP_URL`, `ADMIN_EMAIL`, `CONVEX_WEBHOOK_SECRET`, `SESSION_SECRET` (32+ characters), `WHATSAPP_MOCK=1`, `E2E_MODE=1`, `EMAIL_DRIVER=mock`; on the memory backend also `CONVEX_MEM_PORT`, optional `CLOUDFRONT_DOMAIN`, `DEMO_BYPASS_PHONE`, `DEMO_BYPASS_CODE`.
- `convex/_generated` is committed, so no Convex codegen or login is needed.

### F3. Step-by-step recipe (do not execute from this audit; run in a scratch clone)

```bash
# 1. Install (scratch clone so the audited checkout stays pristine)
pnpm install --frozen-lockfile
pnpm exec playwright install chromium

# 2. TIER 0 ONLY (public pages, no backend): done after this step
printf 'NEXT_PUBLIC_CONVEX_URL=https://invalid.convex.test\nSESSION_SECRET=test-session-secret-at-least-32-chars-long-xxxxx\n' > .env.local
NEXT_TELEMETRY_DISABLED=1 pnpm dev        # http://localhost:3000/en , /en/demo , /en/capture-mm?screen=dashboard

# 3. TIER 1: in-memory Convex (terminal A) - real convex/** functions via convex-test
export CONVEX_MEM_PORT=3210
export APP_BASE_URL=http://localhost:3000 NEXT_PUBLIC_APP_URL=http://localhost:3000
export ADMIN_EMAIL=admin@wedillybird.test CONVEX_WEBHOOK_SECRET=test-webhook-secret E2E_MODE=1
export CLOUDFRONT_DOMAIN=media.wedillybird.com                 # required once photo rows exist (cdnDomain() throws otherwise)
export DEMO_BYPASS_PHONE=+12025550123 DEMO_BYPASS_CODE=424242  # optional: film phone + code sign-up
node tests/e2e/support/serve.mjs                                # health: curl http://127.0.0.1:3210/__test__/health

# 4. Build and start Next (terminal B). The Convex URL is baked into the CSP at BUILD time.
export NEXT_PUBLIC_CONVEX_URL=http://127.0.0.1:3210
pnpm build
APP_BASE_URL=http://localhost:3000 NEXT_PUBLIC_APP_URL=http://localhost:3000 \
ADMIN_EMAIL=admin@wedillybird.test CONVEX_WEBHOOK_SECRET=test-webhook-secret \
SESSION_SECRET=test-session-secret-at-least-32-chars-long-xxxxx \
WHATSAPP_MOCK=1 E2E_MODE=1 EMAIL_DRIVER=mock pnpm start         # http://localhost:3000

# 5. Smoke test the stack (the only spec CI runs on it); green means the stack works on this machine.
#    It resets the in-memory database before every test, so run it BEFORE seeding.
CONVEX_MEM=1 pnpm exec playwright test tests/e2e/partner-journey.spec.ts --project=chromium

# 6. Seed (internal mutations are callable through /__test__/call; args are plain JSON)
call() { curl -s -X POST http://127.0.0.1:3210/__test__/call -H 'content-type: application/json' -d "$1"; }
call '{"type":"mutation","path":"seed:seedLaunchDemo","args":{}}'
#   returns ownerId, eventId, sampleInvitationToken (a PENDING guest, ideal for the RSVP take)
#   the seeded date is 2026-07-18 (past, countdown would read "The big day is here"): shift it, and re-theme off the legacy terracotta
call '{"type":"mutation","path":"events:update","args":{"eventId":"<eventId>","requesterId":"<ownerId>","eventDate":<future epoch ms>,"invitationCinematic":"floral","theme":{"primaryColor":"oklch(72% 0.09 20)","accentColor":"oklch(78% 0.075 78)","fontFamily":"Playfair Display"}}}'
#   agency demo (do NOT also run seed:seedAdminUser: same phone +33600000001 as the launch-demo owner)
call '{"type":"mutation","path":"seed:seedTestUsers","args":{}}'
call '{"type":"mutation","path":"seed:seedTierFixtures","args":{}}'
#   guest tokens for QR images:  call '{"type":"query","path":"guests:listByEvent","args":{"eventId":"<eventId>","requesterId":"<ownerId>"}}'
#   gallery rows: photos:confirmOwnerUpload {eventId,requesterId,s3Key,sizeBytes,contentType} then photos:internalMarkModerated {s3Key,decision:"approved"}
```

Then, in each Playwright capture script (import from `playwright`, not the author's path):

1. Context: `viewport {450, 800}` (exact 9:16), `isMobile`, `hasTouch`, `deviceScaleFactor` 2.4, `locale: 'en-US'`, `timezoneId: 'America/New_York'`, `colorScheme: 'light'`; cookies `wbb_ccy=USD` and `wbb_locale_suggestion_dismissed=1` for `http://localhost:3000`; `addInitScript` setting `localStorage['wedillybird-cookie-consent']='declined'` (hides the cookie bar).
2. Sign in (Tier 1): `/en/sign-in`, tab "Email", field "Email address", button "Send my link"; read the link from `GET http://127.0.0.1:3210/__test__/emails`; `page.goto(link)`. Use `demo-owner@wedillybird.test` (launch-demo owner), `camille@wedillybird.test` (agency). Pattern: `tests/e2e/utils/mem-backend.ts` `signInByEmail` (French labels there; English here). `/dev-login` and `/api/checkout/mock` are disabled under `pnpm start` (NODE_ENV production); they work under `pnpm dev`, which adds a Next dev indicator to crop.
3. Check-in take: launch Chromium with `--use-fake-ui-for-media-stream --use-fake-device-for-media-stream --use-file-for-fake-video-capture=<loop.y4m>`, `permissions: ['camera']`; build the loop with ffmpeg from QR PNGs (each shown about 2.5 s, blank gaps so each guest decodes once). Offline: `context.setOffline(true/false)`.
4. Gallery take: `page.route('https://media.wedillybird.com/**', r => r.fulfill({ path: <local jpg> }))`.
5. Record, then convert: Playwright `recordVideo` outputs 25 fps VP8 WebM at the viewport's CSS-pixel size (it can only be scaled down, never up, and defaults to fit inside 800 x 800), so it is soft when upscaled. Run a 5-second test take and `ffprobe` it before committing to this route. Use it for choreography and rough cuts; for final footage prefer headed Chromium captured by OBS or ffmpeg screen capture at 60 fps (or an iOS Simulator / phone with QuickTime). Upscale rough cuts: `ffmpeg -i raw.webm -vf "scale=1080:1920:flags=lanczos" -r 30 -c:v libx264 -crf 18 -pix_fmt yuv420p out.mp4`.
6. Verify each take by `ffprobe` (size 1080 x 1920, 30 fps), then add captions and an in-house track from `public/audio/invitation`.

### F4. Effort and risks

| Work package | Effort (person-days, my estimate) | Main risk |
|---|---|---|
| Tier 0 captures (landing, `/demo` openings and RSVP, pricing) | 0.5 to 1 | Low. Hide cookie bar; hydration waits. |
| Stand up and smoke-test the in-memory stack | 0.5 to 1 | Medium: network for fonts and Playwright download; port clashes; Vite resolution in `serve.mjs`; the `convex-test` id format used inside URL paths such as `/events/<id>` is untested in this repo. |
| Seeds, login helper, date shift | 0.5 | Low. Seeds use legacy terracotta theme and French-flavoured names. |
| Host dashboard, guests, seating | 1 | Low to medium: counters static (no WebSocket); "limit 5000" text. |
| Check-in with fake camera and offline | 0.5 to 1 | Medium: fake-camera spike; QR must be staged; claim risk. |
| Gallery with seeded photos | 1 | Medium: CDN interception, licensed images, no upload or face search. |
| Planner cockpit, CRM, budget | 0.5 | Low. |
| Per-video post (crop, captions, music, QC) | 0.25 to 0.5 each | Low. |

Total about 5 to 7 person-days for 8 to 10 UI-based videos (assumption, not measured).

Technical limits of the in-memory stack, all verified in code: no WebSocket, so client `useQuery` components (notification bell, live guest counters, partner link) stay empty or static; every `'use node'` module (`emailActions`, `photosActions`, `photosFaceSearch`, `reminderActions`, `whatsappTemplates`, `invitationAudio`, `photosReprocess`, `whatsappTemplateNotifications`) cannot execute, so S3 presigned uploads, face search, reminders and Meta calls are unavailable; email is replaced by a capture double; only one backend exists per run, so Playwright runs serially.

### F5. Can existing media be reused as B-roll? (ffprobe results, 2026-10-18)

| File | Probe result | Reuse verdict |
|---|---|---|
| `public/cinematics/floral/plate.mp4` | H.264 High, 720 x 1280 (9:16), 30 fps, 281 frames, 9.37 s, 1.56 MB, no audio | Usable as B-roll for "The Bloom" (rosebud to flowered arch). AI-generated: label it. Upscale to 1080 x 1920 will be soft. Better to record the real component at `/en/demo?cinematic=floral`. |
| `public/cinematics/floral/poster.jpg`, `still.jpg` | JPEG 720 x 1280 (first and last frame) | Usable as stills; low resolution. |
| `public/cinematics/jardin-japonais/plate.mp4` | H.264 High, 716 x 1284 (not exact 9:16), 30 fps, 150 frames, 5.06 s, 4.26 MB, with AAC-LC stereo 44.1 kHz 128 kb/s audio | Do not use as a product feature: unreleased universe, no English name, rejected by server validation; the embedded audio's rights are unknown. |
| `public/cinematics/jardin-japonais/poster.jpg` | JPEG 720 x 1290 | Same. |
| `public/audio/invitation/aurore.m4a` | AAC-LC 44.1 kHz stereo, about 109 kb/s, 79.3 s, 1.09 MB (intimate piano) | Reusable: original in-house synthesis. |
| `public/audio/invitation/jardin.m4a` | 78.7 s, 1.08 MB (harp) | Reusable. |
| `public/audio/invitation/celebration.m4a` | 72.2 s, 0.99 MB (marimba, 100 BPM, most upbeat) | Reusable. |
| `public/audio/invitation/envol.m4a` | 80.3 s, 1.10 MB (airy arpeggios) | Reusable. |
| `public/audio/invitation/harmonie.m4a` | 83.0 s, 1.14 MB (strings) | Reusable. |
| `public/wedillybird-logo.png` | PNG RGBA 2001 x 551 | Brand lockup; reuse. |
| `public/wedillybird-mark.svg` | SVG, `currentColor`, viewBox 220 130 560 740 | Reuse; tint to ink or blush. |
| `public/android-chrome-512x512.png`, `192x192.png`, `app/apple-icon.png` | square icons | Avatars. |
| `hero-bg.jpg` (components/landing) | Unsplash stock couple photo | Do not present as customers. |

Mood note: the tracks are quiet and ambient (piano, harp); expect to pair them with faster cuts or a more energetic bed from another licensed source.

---

## G. Items I could not verify (need the founder or production access)

1. Whether any real WhatsApp invitation or reminder has been delivered, whether the Meta templates are approved, and whether the WhatsApp Business Account is verified.
2. Whether Twilio / A2P is live (US SMS and US sign-up codes).
3. Whether a Premium couple's chosen opening, music, photo and schedule appear on a real `/i/<token>` page (code says no).
4. Where guests are supposed to get a QR code.
5. Stripe live state: USD prices, Stripe Tax, cross-currency settlement, Connect webhook; whether any real payment has happened since the last "0 transactions" note.
6. Convex region and the data-location statement; the intended refund wording; the reminder audience (confirmed only or all).
7. Whether `/mon-mariage` is meant to launch, and whether PAYG is for sale.
8. TTS pronunciation of the brand.
9. Whether wildcard agency subdomains work for a real org slug.
10. Whether the site copy listed in section 0 will be corrected before the videos go live (the videos should not repeat copy that the product cannot back).

## H. Evidence index (files read)

CLAUDE.md, AGENTS.md, DESIGN.md, BACKLOG.md, README.md; docs/landing-audit-2026-09.md, docs/analytics.md, docs/prod-runbook.md (no business-model doc exists); agents/wedillybird_ai_ops/knowledge/*.md and src (guardrails, drafts, social, media); messages/en.json and fr.json (plus price scans of de, es); lib/payments/*; lib/whatsapp/*; lib/checkin, lib/offline, lib/reminders, lib/rsvp, lib/invitation, lib/pro; proxy.ts; next.config.ts; app/** routes and key pages; components/invitation/**, landing, checkin, gallery, events, pro, mon-mariage; convex/* (auth, events, guests, rsvps, reminders, crons, invitationActions, photos, photoBooks, seating, coupleSpace, pro, clients, contracts, paymentLinks, organizations, seed, lib/*); public/** (ffprobe); scripts/*.mjs; playwright.config.ts; tests/e2e/support/*, tests/e2e/utils/*, partner-journey and other specs; .github/workflows/ci.yml; .claude/skills/invitation-cinematic. Live GETs (2026-10-18): sitemap.xml, /en, /en/demo, /en/pros, /en/forfaits-pros, /en/templates, /en/guide, /en/faq, /en/legal/mentions, /en/legal/privacy, /en/legal/terms, /en/sign-up, /en/blog, /en/capture-mm, /en/mon-mariage, www.wedillybird.com/en, one unknown agency subdomain. One web search on "Weddybird".
