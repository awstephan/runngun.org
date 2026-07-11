# Run & Gun

A Nostr-powered schedule for Run & Gun shooting and multi-sport events.

Run & Gun publishes a trusted community event schedule as NIP-52 time-based calendar events. Visitors can browse upcoming, in-progress, and past events through schedule, calendar, map, RSS, and NIP-19 detail views. Trusted Admins use the Nostr-authenticated admin panel to publish their own events and reusable templates.

Repository: [github.com/awstephan/runngun.org](https://github.com/awstephan/runngun.org)

## Features

### Schedule Events

- NIP-52 time-based calendar events (`kind 31923`)
- Strict validation of identity, timing, `runngun` membership, and `D` day-index tags
- Upcoming, in-progress, and past lifecycle states
- Timezone-safe authoring using the selected IANA timezone
- Secure root-level `naddr` detail routes containing event kind, author, and identifier
- Author-only editing and NIP-09 deletion requests
- Optional summary, location, image, price, and reference links

### Discovery

- Home page with the active event schedule
- Paginated schedule view at `/schedule`
- Month calendar at `/calendar`, including multi-day events
- Interactive Leaflet map at `/map`
- RSS feed at `/feed` and `/rss.xml`
- Event detail pages at root-level NIP-19 addresses such as `/naddr1...`

### Location Resolutions

- Site Owner-curated coordinates stored in a NIP-78 record
- Browser-persisted fallback discoveries from OpenStreetMap Nominatim
- Exact and approximate precision with approximate locations labeled on the map
- Last validated curated coordinates remain authoritative during relay outages
- Globally throttled external requests and 24-hour failed-lookup caching
- Legacy location caches and the former custom `g` tag shape are migrated safely

### Trusted Administration

- The Site Owner appoints Trusted Admins through an owner-authored NIP-78 record
- The Site Owner is always trusted
- The last validated authority set provides stale read availability during relay outages
- Appointment and revocation require fresh authority
- Revocation removes trust from all content by that identity, including older content
- Trusted Admins may publish events and templates, but may only edit or remove their own

### Event Templates

- Shared Event Templates stored in per-author NIP-78 documents
- Templates preserve descriptive fields without copying stale dates, times, or timezones
- Current Trusted Admin templates are aggregated deterministically
- Only the template creator may update or delete it

### Community and Payments

- NIP-52 event RSVPs (`kind 31925`)
- Threaded event comments
- NIP-57 Lightning zaps with LNURL, WebLN, and Nostr Wallet Connect support
- Blossom image uploads using the logged-in Nostr signer

## Active Routes

| Route | Purpose |
|---|---|
| `/` | Home and active Schedule Events |
| `/schedule` | Full upcoming and in-progress schedule |
| `/calendar` | Month calendar |
| `/map` | Interactive event map |
| `/admin` | Nostr-authenticated administration |
| `/feed` | Browser-readable RSS feed |
| `/rss.xml` | Legacy RSS alias |
| `/:nip19` | Root-level NIP-19 Schedule Event details |

## Nostr Data

| Data | NIP | Kind | Identity |
|---|---:|---:|---|
| Schedule Event | 52 | `31923` | Author + event `d` tag |
| Event RSVP | 52 | `31925` | RSVP `d` tag and Schedule Event `a` tag |
| Trusted Admins | 78 | `30078` | Site Owner + `runngun-admin-list` |
| Event Templates | 78 | `30078` | Template author + `runngun-event-templates` |
| Location Resolutions | 78 | `30078` | Site Owner + `runngun-geolocations` |
| Relay List | 65 | `10002` | User pubkey |
| Zap Request / Receipt | 57 | `9734` / `9735` | Target event or profile |

Application-specific NIP-78 schemas are documented in [`NIP.md`](./NIP.md). Every trusted addressable query includes its expected author; relays are never trusted to establish administrative authority by themselves.

## Architecture

The codebase favors deep modules: domain rules and Nostr interpretation sit behind small interfaces, while React pages focus on rendering.

```text
src/
├── components/
│   ├── auth/                 Nostr login and account switching
│   ├── ui/                   shadcn/ui primitives
│   ├── EventCard.tsx         Schedule Event presentation
│   └── EventForm.tsx         Event draft editor
├── hooks/
│   ├── useTrustedAdmin.ts    Authority resolution and trusted queries
│   ├── useScheduleEvents.ts  Trusted Schedule Event retrieval
│   ├── useEventAuthoring.ts  Publication and deletion sequencing
│   ├── useEventTemplates.ts  Per-author template persistence
│   ├── useLocationResolutions.ts
│   └── useLocationCuration.ts
├── lib/
│   ├── schedule-event.ts     NIP-52 interpretation and lifecycle
│   ├── event-authoring.ts    Draft conversion, validation, and encoding
│   ├── location-resolution.ts
│   └── config.ts             Site Owner and NIP-78 identifiers
├── pages/
│   ├── Index.tsx
│   ├── Schedule.tsx
│   ├── Calendar.tsx
│   ├── Map.tsx
│   ├── Admin.tsx
│   ├── RSS.tsx
│   └── NIP19Page.tsx
└── test/                     Shared Vitest setup
```

Domain terminology lives in [`CONTEXT.md`](./CONTEXT.md). Architectural decisions are recorded in [`docs/adr/`](./docs/adr/).

## Tech Stack

- React 18 and React Router
- TypeScript
- Vite 8
- Tailwind CSS 3 and shadcn/ui
- Nostrify and nostr-tools
- TanStack Query
- Leaflet with CartoDB map tiles
- Vitest and Testing Library

## Configuration

The Site Owner pubkey and NIP-78 document identifiers are defined in [`src/lib/config.ts`](./src/lib/config.ts):

```ts
export const SITE_OWNER_PUBKEY = '1f273472730e3369aa7888e81203598e0330064264fb950c31958fe08f1ce596';

export const ADMIN_LIST_DTAG = 'runngun-admin-list';
export const TEMPLATES_DTAG = 'runngun-event-templates';
export const GEOLOCATION_DTAG = 'runngun-geolocations';
```

Relay and Blossom server preferences are managed through application configuration and persisted in the browser. Logged-in users can synchronize NIP-65 relay lists.

## Development

Requirements: a current Node.js release and npm.

```bash
# Install dependencies
npm install

# Start the Vite development server
npm run dev

# Type-check, lint, run tests, and build
npm test

# Build production assets and create the SPA 404 fallback
npm run build
```

`npm test` installs dependencies, runs TypeScript without emitting files, runs ESLint, executes Vitest, builds with Vite, and copies `dist/index.html` to `dist/404.html`.

## Deployment

The application is a static browser application:

1. Run `npm run build`.
2. Deploy the contents of `dist/`.
3. Configure unknown paths to serve `index.html` for React Router.

The build also creates `dist/404.html` for static hosts that use a 404 fallback for client-side routes.

## Security Model

- Trusted Admin authority only accepts the Site Owner-authored admin document.
- Trusted content queries filter by the currently resolved Trusted Admin authors.
- Addressable Schedule Event routes filter by both author and `d` tag.
- The Site Owner is the only identity that can appoint admins or curate shared Location Resolutions.
- Schedule Events and Event Templates retain author ownership for mutation.
- Legacy browser admin lists are never treated as authority.
- External URLs and images are sanitized before rendering where applicable.
- The application uses a restrictive Content Security Policy in `index.html`.

## License

ISC
