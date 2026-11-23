# Frontend Roadmap

The frontend half of the [project roadmap](../ROADMAP.md): about 3½ days. The goal is a
clean, working logistics dashboard that shows off the backend. It is not meant to make
you a frontend specialist. Keep the code simple, typed and consistent, and lean on
shadcn/ui for anything visual.

## Stack

| Concern | Choice | Why |
| --- | --- | --- |
| Build | Vite | Fast dev server, and a proxy that removes CORS from local development |
| Language | TypeScript (strict) | Catches API mismatches at compile time |
| UI | React 19, Tailwind CSS v4, shadcn/ui, Lucide icons | Good-looking defaults with very little CSS |
| Routing | React Router | Role-based route trees |
| Server state | TanStack Query | Caching, refetching, mutations and invalidation, without hand-written loading flags |
| API types | `openapi-typescript` + `openapi-fetch` | Types are generated from FastAPI's `/openapi.json`, so they cannot drift from the backend |
| Forms | `react-hook-form` + `zod` | Validation with the same rules the backend enforces |
| Maps | Leaflet via `react-leaflet`, with OpenStreetMap tiles | No API key and no billing account. Mapbox or Google can replace it later. |
| Notifications | shadcn `sonner` toasts | For conflicts, errors and live status changes |

## Structure

```
frontend/src/
├── api/
│   ├── schema.d.ts       Generated: npm run gen:api
│   ├── client.ts         openapi-fetch client, auth header, refresh on 401
│   └── hooks/            useDeliveries, useAssignDelivery, … (TanStack Query)
├── auth/                 AuthProvider, useAuth, RequireRole
├── realtime/             useSocket (auth handshake, reconnect, heartbeat)
├── components/
│   ├── ui/               shadcn components (generated)
│   └── …                 StatusBadge, DeliveryTimeline, MapView, EmptyState
├── features/
│   ├── customer/         NewDelivery, MyDeliveries, DeliveryDetail, TrackDelivery
│   ├── courier/          MyAssignments, ActiveDelivery, ShiftToggle
│   ├── dispatch/         DispatchBoard, CandidatesPanel, LiveMap
│   └── admin/            Members, Couriers
├── layouts/              AppShell (sidebar varies by role)
├── routes.tsx
└── main.tsx
```

## Rules

1. **The backend decides.** Show buttons from the delivery's `allowed_actions` field. Never
   copy the state machine into the UI.
2. **Every screen handles four states:** loading (a skeleton), empty, error (a message plus
   a retry button) and success.
3. **Server data lives in TanStack Query, not in `useState`.** After a mutation, invalidate
   the affected queries rather than editing the cache by hand.
4. **Tokens:** keep the access token in memory only. The refresh token is the backend's
   `HttpOnly` cookie, which JavaScript cannot read. On a 401, refresh once (a single shared
   request, even when several calls fail at the same moment), then retry the original call.
5. **Treat a 409 as normal.** "Courier was just taken" shows a toast and refetches the
   candidate list. It is not an error screen.

---

## Day 5: Scaffold, API client and auth

**Must**
- [ ] Scaffold inside `frontend/`: run `npm create vite@latest . -- --template react-ts`, and choose
      "Ignore files and continue" (this ROADMAP is already there).
- [ ] Tailwind v4 (`@tailwindcss/vite`), `npx shadcn@latest init`, and Lucide.
- [ ] `vite.config.ts` proxy: send `/api` and `/ws` (with `ws: true`) to `http://localhost:8000`.
      The browser then sees one origin, so the refresh cookie works and CORS is not needed.
- [ ] `npm run gen:api` runs `openapi-typescript http://localhost:8000/openapi.json -o src/api/schema.d.ts`.
- [ ] `client.ts` attaches the bearer token, and on a 401 makes one shared refresh call and retries. If the refresh fails, it logs the user out.
- [ ] Login and register pages. `AuthProvider` restores the session on page load by calling `/auth/refresh`.
- [ ] `AppShell` with a role-based sidebar. `RequireRole` sends a user to their own home screen.
- [ ] ESLint and Prettier. `npm run typecheck` in CI (a second job in the workflow).

**Done when:** logging in as each role lands on that role's empty home screen, reloading
the page keeps you logged in, and logout clears the session.

## Day 6: Customer and courier screens

**Customer: Must**
- [ ] **New delivery:** a form for pickup and dropoff (address, lat and lng), recipient, package, weight and service level. Show the price estimate as the fields change (debounced call to `/deliveries/estimate`).
- [ ] Each form generates an `Idempotency-Key` (`crypto.randomUUID()`) when it loads, so a double click or a retried submit cannot create two deliveries.
- [ ] **My deliveries:** a table with a status filter, sorting and cursor pagination. Keep the filters in the URL search parameters so the page can be shared and survives a reload.
- [ ] **Delivery detail:** a status badge, addresses, price, the event timeline from `/events`, and a cancel button when `allowed_actions` contains `cancel`.

**Courier: Must**
- [ ] A shift toggle (`PATCH /couriers/me/availability`).
- [ ] **My assignments:** an offered assignment shows Accept and Reject. An accepted one shows the next action (Pickup, then Start, then Complete), plus Fail with a reason.
- [ ] Ask for confirmation before Complete and Fail.

**Stretch**
- [ ] Choose pickup and dropoff by clicking a small map instead of typing coordinates.

**Done when:** a customer can create and cancel deliveries, and a courier can carry out an
assigned delivery from start to finish entirely in the UI.

## Day 10: Dispatcher dashboard and live tracking

**Must**
- [ ] **Dispatch board:** a queue of `pending` deliveries on the left. Selecting one opens the **Candidates panel**, which ranks couriers with their distance, location age and reasons, and has an Assign button.
- [ ] Assign handles 409 the friendly way: a toast says "That courier was just assigned elsewhere", then the candidates are refetched.
- [ ] **Live map:** courier markers from `/ws/v1/dispatch/monitor`, pending pickups as a second marker type, and a popup with the courier's current delivery.
- [ ] **`useSocket` hook:**
  - sends the auth message first;
  - reconnects with exponential backoff (1 s, 2 s, 4 s, capped at 30 s);
  - treats the snapshot sent on connect as the source of truth;
  - shows a connection indicator (connected, reconnecting or offline);
  - closes the socket when the component unmounts.
- [ ] **Customer tracking page:** the courier marker moves smoothly between updates, and the status timeline updates live (invalidate the delivery query when a status message arrives).

**Done when:** with `scripts/simulate_courier.py` running, the dispatcher map and the
customer tracking page both show the courier moving, and status changes appear without
reloading the page.

## Day 11 (frontend half): Admin and polish

**Must**
- [ ] **Members:** list the members, add a member by email and role, and change a member's role.
- [ ] **Couriers:** list the couriers with shift and busy status, vehicle and capacity, and when their location was last updated.
- [ ] Go through every screen: loading, empty and error states; a 404 page; a page title per route; useful empty-state text.
- [ ] Check every screen at phone width. Couriers will use it on a phone.

**Stretch**
- [ ] Vitest tests for the refresh-once logic in `client.ts` (the riskiest code on the frontend).
- [ ] A Playwright smoke test of the full demo flow.
- [ ] A dark mode toggle (shadcn already supports it).

## Day 12: Demo

- [ ] Screenshots or a short GIF of each role for the root README.
- [ ] Document `npm install`, `npm run gen:api` and `npm run dev` in `frontend/README.md`.
- [ ] Confirm the React app covers every flow of the old static UI, then the backend deletes `app/static/`.

## Learning order (if React is new to you)

Learn just enough for the day ahead. Don't study everything up front.

1. **Day 5:** components, props, `useState` and `useEffect`, and React Router basics.
2. **Day 6:** TanStack Query `useQuery` and `useMutation`, and `react-hook-form` with `zod`.
3. **Day 10:** `useRef` for the WebSocket, cleanup in effects, and react-leaflet markers.
