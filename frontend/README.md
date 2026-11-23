# Veloce frontend

React + TypeScript + Vite, styled with Tailwind CSS v4. It has a landing page and screens
for every backend endpoint. What each user sees depends on their role.

## Run it

The backend must be running on port 8000 (see [../backend/README.md](../backend/README.md)).

```bash
npm install
npm run dev        # http://localhost:5173
```

Vite forwards `/api`, `/health`, `/docs` and `/openapi.json` to `localhost:8000`, so the
browser sees one origin and the backend needs no CORS settings.

| Script              | Does |
| ------------------- | ---- |
| `npm run dev`       | Dev server with hot reload |
| `npm run typecheck` | TypeScript, strict |
| `npm run lint`      | oxlint |
| `npm run build`     | Type-check, then a production build in `dist/` |

## Screens

| Path | Who | What |
| --- | --- | --- |
| `/` | everyone | Landing page: a scroll-driven story of one delivery, live API status from `/health/ready` |
| `/login` | everyone | Sign in (split layout: brand panel and form) |
| `/register` | everyone | Create a customer account (same layout, its own page) |
| `/app` | signed in | Overview: a greeting by time of day, key numbers, latest deliveries, quick actions |
| `/app/deliveries` | signed in | Paginated list: customers see their own, couriers see theirs, admins see all |
| `/app/deliveries/new` | customer, admin | Request a delivery. Validation errors appear on each field |
| `/app/deliveries/:id` | signed in | Progress, addresses and package. Admins assign couriers; customers and admins cancel |
| `/app/couriers` (`/new`, `/:id`) | admin | Fleet list with filters, create, edit |
| `/app/account` | signed in | Profile, sign out, sign out everywhere, theme, API status |

## How it works

- **Theme:** light or dark. On a first visit it follows the system setting. Once the user
  picks one with the switch (in the header, the sidebar and Account), the choice is saved
  in `localStorage`. A small script in `index.html` applies it before the first paint, so
  there is no flash. Colors are CSS variables in `src/index.css`, and components only use
  token names (`bg-surface`, `text-muted`, …), never raw colors.
- **Layout:** signed-in pages have a fixed sidebar on large screens and a slide-in drawer on
  phones. The drawer closes on navigation and on Escape.
- **Motion:** the landing story (`src/components/landing/DeliveryStory.tsx`) pins a map
  while the user scrolls. Scroll progress moves one delivery through its five steps, and
  the courier follows route points that are measured once after mount. Other sections fade
  in with `Reveal`. Everything respects `prefers-reduced-motion`.
- **API client** (`src/lib/api.ts`): adds the bearer token. On a 401 it refreshes once and
  retries. Refresh tokens rotate and a reused one ends the session, so the refresh runs
  under a cross-tab lock (`navigator.locks`), and no two tabs ever spend the same token.
  It reads the backend's `{error: {code, message, details}}` shape and maps validation
  details back onto form fields.
- **Server state:** TanStack Query. Writes refresh the affected lists afterwards. A 409
  during assignment means another dispatcher got there first: it shows a toast and the
  courier list is reloaded.
- **Types:** `src/lib/types.ts` mirrors the backend's Pydantic schemas by hand. Generating
  it from `/openapi.json` (`openapi-typescript`) is planned.

## Known limits

- Tokens are kept in `localStorage`. Backend Day 2 moves the refresh token into an httpOnly
  cookie, out of reach of JavaScript.
- Coordinates are typed in by hand. Choosing them on a map comes with the map work.
- The components follow shadcn/ui's conventions (cva and `cn`), but they were written by
  hand rather than generated with the shadcn CLI.
