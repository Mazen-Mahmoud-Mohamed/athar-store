# أثر — Athar Storefront

Premium Arabic RTL e-commerce frontend for the Egyptian fashion/accessories brand **أثر**.

This repository currently implements **Phase 1**: design system, architecture, routing, premium storefront UI, cart shell, admin UI shell, and Supabase client scaffolding.

## Assets discovered

| File | Role |
|------|------|
| `file_000000008d4c820a980a315fe10734b9.png` | Official أثر brand logo (also copied to `src/assets/athar-logo.png`, `public/athar-logo.png`, `public/favicon.png`) |
| `Screenshot_2026-10-02-23-23-22-51.jpg.jpeg` | Reference screenshot of an existing Arabic store UX (not visually copied) |

The website uses the **actual supplied logo file**. It is not redrawn in HTML/CSS.

## Tech stack

- React 19 + TypeScript
- Vite
- Tailwind CSS v4
- shadcn-style UI primitives (Radix + CVA)
- React Router
- Supabase JS client (public anon key only)
- Sonner (toasts)
- Lucide icons

## Architecture

```text
src/
  assets/           # Brand logo
  components/       # Shared UI + layout + SEO
  components/ui/    # Button, Input, Sheet, Dialog, Badge...
  data/             # Placeholder catalog for Phase 1
  features/         # Cart, products, categories
  hooks/
  layouts/          # Store + Admin layouts
  lib/              # Utils + Supabase client
  pages/            # Route pages (store + admin)
  services/         # Data access layer
  types/            # Database + domain types
  utils/
supabase/
  schema.sql        # Draft SQL + RLS (apply in next phase)
```

## Environment

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Required public variables only:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key
```

Never put `service_role` or private secrets in the frontend.

## Commands

```bash
npm install
npm run dev
npm run build
npm run preview
```

TypeScript is checked as part of `npm run build` (`tsc -b && vite build`).

## Routes implemented

### Storefront
- `/`
- `/products`
- `/products/:id`
- `/category/:slug`
- `/cart`
- `/checkout`
- `/order-success`

### Admin
- `/admin/login`
- `/admin`
- `/admin/products`
- `/admin/products/new`
- `/admin/products/:id/edit`
- `/admin/categories`
- `/admin/orders`
- `/admin/orders/:id`

## Current status (Phase 2)

Done:
- Phase 1 storefront UI preserved
- Production-ready SQL migrations (schema, RLS, Storage)
- Secure guest order RPC (`create_guest_order`) with price snapshots
- Auth service + admin route guard (session / role / loading)
- Service layer: products, categories, orders, auth
- Typed database models aligned to schema (`preparing` status)
- Checkout creates orders through Supabase RPC when configured
- Admin CRUD wired to services (products/categories/orders)

**SQL was NOT auto-applied** — local `.env` was missing and the CLI session did not show a project named `athar`.

See: `supabase/SETUP.md`

Next phase (not started):
- Apply migrations to verified athar project
- Promote first admin profile
- Full storefront catalog UX polish against live data
- Favorites backend / richer search

## Brand direction

- Elegant, feminine, premium, warm, modern
- Cream / ivory surfaces
- Brown typography
- Gold as accent only
- Arabic-first RTL experience
