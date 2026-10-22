<div align="center">

<img src="public/athar-logo.png" alt="Athar brand logo" width="150" />

# Athar Store | أثر

**Elegance That Leaves a Mark**

A production e-commerce storefront for an Egyptian bags and accessories brand, featuring an Arabic-first RTL shopping experience, customer accounts, secure checkout, order tracking, admin tools, and verified product reviews.

[**Live Store**](https://athar.qd.je) · [**Shop Products**](https://athar.qd.je/products) · [**Admin Portal**](https://athar.qd.je/admin/login)

[![Deploy GitHub Pages](https://github.com/Mazen-Mahmoud-Mohamed/athar-store/actions/workflows/deploy-github-pages.yml/badge.svg)](https://github.com/Mazen-Mahmoud-Mohamed/athar-store/actions/workflows/deploy-github-pages.yml)
![React](https://img.shields.io/badge/React-19-149eca?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-6-3178c6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-8-646cff?logo=vite&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ecf8e?logo=supabase&logoColor=white)
![Arabic RTL](https://img.shields.io/badge/Language-Arabic%20%7C%20RTL-b8956c)

</div>

---

> **Project status:** This is the active application repository, **not an early-phase UI prototype**. The storefront is deployed at [athar.qd.je](https://athar.qd.je) using GitHub Pages. Authentication, PostgreSQL, storage, and payment-related server functions are provided by Supabase. **Documentation updated: October 22, 2026.**

## Table of Contents

- [Overview](#overview)
- [What's New](#whats-new)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [Available Routes](#available-routes)
- [Project Structure](#project-structure)
- [Orders & Payments](#orders--payments)
- [Verified Product Reviews](#verified-product-reviews)
- [Backend & Security](#backend--security)
- [Testing & Operations](#testing--operations)
- [Deployment](#deployment)
- [Documentation & Contributing](#documentation--contributing)

## Overview

**Athar** is an Egyptian e-commerce experience for handbags and accessories. The storefront is optimized for Arabic, right-to-left layouts, and responsive shopping, with a warm cream, brown, and gold visual identity.

| Area | Features implemented |
| --- | --- |
| **Storefront** | Dynamic homepage, live product catalog, categories, search, offers, new arrivals, featured products, product details, and product imagery |
| **Product discovery** | Category and price filters; new, featured, and discounted product filters; sorting by newest, price, or name; compact responsive filter controls |
| **Cart & checkout** | Persistent cart, quantity management, **Buy Now** flow that does not overwrite the cart, and price/stock revalidation before ordering |
| **Customer accounts** | Email/password registration, Google OAuth, email confirmation, password recovery, profile settings, and default shipping address |
| **Order tracking** | Authenticated customer orders, history and details, progress tracking, and server-controlled cancellation |
| **Payments** | Cash on delivery (**COD**), XPay Hosted Checkout (**Test/Live**), authoritative server-side payment verification, and webhooks |
| **Admin dashboard** | Product/category CRUD, images, stock, order management, fulfillment states, and customer review moderation |
| **Product reviews** | 1–5 stars after a verified purchase is delivered, optional comment and image, approval before publication, and optional name display |
| **SEO & UX** | Arabic RTL interface, responsive pages, optimized product images, Open Graph, JSON-LD, sitemap, robots.txt, and legal/policy pages |

## What's New

### October 2026 releases

1. **Customer accounts and Google Sign-In** — Customers can register, authenticate with Google, manage their details, and view their own orders. New orders are linked to authenticated customer accounts instead of being created through the deprecated guest-order RPC.
2. **XPay checkout integration and recovery** — Online payments use Supabase Edge Functions, authenticated order creation, ownership checks, idempotency keys, webhook signature validation, durable event processing, and retry handling.
3. **Order and inventory safeguards** — PostgreSQL enforces order-status transitions, inventory reservation/release behavior, payment integrity, cancellation rules, and refund bookkeeping.
4. **Verified-purchase reviews** — Customers can rate individual purchased products **only after an order is marked `delivered`**. Comments and pictures are optional; an administrator approves ratings before publication.
5. **Optional reviewer identity** — A default-off checkbox lets customers choose to display their saved profile name with an approved review. Previously submitted reviews remain anonymous.
6. **Products page UI/UX overhaul** — Reduced unused vertical space, horizontal category pills, compact sort and quick-filter controls, and a smaller price-filter popover instead of an oversized sheet.
7. **Production tooling** — GitHub Pages automation, security and payment regression scripts, documented release procedures, and encrypted backup/restore utilities.

> Some files under `docs/` and `supabase/SETUP.md` are historical implementation notes and may describe the system as it existed at the time. Use the **current source code and versioned migrations** to establish the present implementation.

## Tech Stack

| Layer | Technology |
| --- | --- |
| Frontend | **React 19**, **TypeScript 6**, **Vite 8** |
| Styling and UI | **Tailwind CSS v4**, Radix UI, CVA, Lucide React, Sonner |
| Routing | **React Router 7**, including public and protected routes |
| Backend | **Supabase**: PostgreSQL, Auth, Row Level Security (RLS), Storage, and Edge Functions |
| Authentication | Email/password and **Google OAuth** through Supabase Auth |
| Payments | **XPay Hosted Checkout**, with server-side credentials and verification |
| Hosting | **GitHub Pages** with the custom domain `athar.qd.je` |
| CI/CD | **GitHub Actions** for build validation and deployment |
| SEO | Open Graph metadata, JSON-LD structured data, sitemap.xml, and robots.txt |

## Getting Started

### Prerequisites

- **Node.js 22**
- **npm**
- A properly configured **Supabase development project** to use database-backed features

Clone and install dependencies:

~~~bash
git clone https://github.com/Mazen-Mahmoud-Mohamed/athar-store.git
cd athar-store
npm ci
~~~

Copy the example environment file:

~~~bash
cp .env.example .env.local
~~~

On Windows PowerShell:

~~~powershell
Copy-Item .env.example .env.local
~~~

Provide your **development project's public client credentials** in `.env.local`:

~~~dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_PUBLIC_ANON_OR_PUBLISHABLE_KEY
~~~

Start the development server:

~~~bash
npm run dev
~~~

Vite prints the local URL (usually `http://localhost:5173`).

> **Security:** Never place `service_role`, `sb_secret_*`, XPay private keys, Google client secrets, or account passwords in `VITE_*` variables. Vite embeds those values into publicly downloadable frontend bundles. Do not point destructive tests, demo seeds, or migrations at production without an explicit release plan.

### Development commands

| Command | Purpose |
| --- | --- |
| `npm ci` | Install dependency versions from `package-lock.json` |
| `npm run dev` | Start the Vite development server |
| `npm run build` | Run TypeScript validation and build the production bundle |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | Run Oxlint |
| `npm run test:xpay` | Run the XPay signing/integration test harness using fixtures |
| `npm run test:orders` | Run the order, inventory, and payment tests; may require a test PostgreSQL environment |
| `npm run seo:sitemap` | Generate/enrich the sitemap when configuration permits |

Additional checks are available under `scripts/`, including `test-customer-accounts-security.mjs`, `test-route-scroll.mjs`, and `test-xpay-refunds.mjs`. Some older test harnesses intentionally reproduce historical schema states; review each script's prerequisites before running it.

## Available Routes

### Storefront and customer account

| Route | Description |
| --- | --- |
| `/` | Homepage |
| `/products` | All products, search, filtering, and sorting |
| `/products/:id` | Product detail page, gallery, and approved reviews (slug or UUID) |
| `/category/:slug` | Category-specific product listing |
| `/cart` | Shopping cart |
| `/checkout` | Authenticated customer checkout |
| `/checkout?intent=buy-now` | Direct single-product checkout |
| `/order-success` | Order confirmation and XPay status handling |
| `/login` | Customer sign-in |
| `/register` | Customer registration |
| `/forgot-password` | Request password recovery |
| `/reset-password` | Set a new password |
| `/auth/callback` | OAuth return handler |
| `/account` | Customer order history |
| `/account/profile` | Customer profile settings |
| `/account/orders/:id` | Order detail, tracking, cancellation, and post-delivery reviews |
| `/privacy-policy` | Privacy policy |
| `/terms` | Terms and conditions |
| `/return-policy` | Returns policy |

### Administration

| Route | Description |
| --- | --- |
| `/admin/login` | Administrator sign-in |
| `/admin` | Dashboard |
| `/admin/products` | Product management |
| `/admin/products/new` | Create a product |
| `/admin/products/:id/edit` | Edit a product |
| `/admin/categories` | Category management |
| `/admin/orders` | Order management |
| `/admin/orders/:id` | Order detail and status changes |
| `/admin/reviews` | Approve, hide, or delete customer reviews |

`/checkout` and `/account/*` require an authenticated customer session. Administrative pages require an account with the admin role, enforced in conjunction with backend authorization rules.

## Project Structure

~~~text
athar-store/
├── .github/workflows/
│   ├── deploy-github-pages.yml     # Production site deployment
│   └── review-feature-check.yml    # Pull request build and lint
├── public/                          # Logo, favicon, CNAME, SEO assets
├── src/
│   ├── App.tsx                      # Routes and application providers
│   ├── assets/                      # Brand images
│   ├── components/                  # Shared UI, layouts, admin, SEO
│   ├── config/                      # Public site and contact settings
│   ├── features/
│   │   ├── account/                 # Customer guards and review form
│   │   ├── admin/                   # Admin auth guard and provider
│   │   ├── cart/                    # Shopping cart and persistence
│   │   ├── catalog/                 # Product filter controls
│   │   ├── checkout/                # Buy Now session intent
│   │   └── products/                # Cards, gallery, public reviews
│   ├── layouts/                     # Store and admin layouts
│   ├── lib/                         # Validation, images, SEO utilities
│   ├── pages/                       # Storefront, account, admin routes
│   ├── services/                    # Supabase data-access layer
│   ├── types/                       # Domain and database definitions
│   └── index.css                    # Tailwind and brand design tokens
├── supabase/
│   ├── migrations/                  # Versioned SQL migrations 001–017
│   ├── functions/
│   │   ├── _shared/                 # XPay, CORS, webhook processing
│   │   ├── xpay-create-payment/
│   │   ├── xpay-payment-status/
│   │   ├── xpay-webhook/
│   │   └── xpay-process-webhook-inbox/
│   ├── config.toml
│   ├── seed.sql
│   └── SETUP.md
├── scripts/                         # QA, backup, restore, release, SEO
├── docs/                            # Operations and investigation notes
├── .env.example
├── package.json
└── vite.config.ts
~~~

## Orders & Payments

### Customer checkout journey

1. Select a product and add it to the cart, or use **Buy Now**.
2. Sign in or register if necessary, then provide shipping and Egyptian phone details.
3. Revalidate product availability and pricing; **the backend computes authoritative order totals** rather than trusting the browser.
4. Select **Cash on Delivery (COD)** or **XPay Hosted Checkout**.
5. Track the order under `/account`. The normal progression is `pending → confirmed → preparing → shipped → delivered`; cancellation follows separate server-enforced rules.
6. Once an order is delivered, review the products included in that order.

### Payment architecture

~~~text
Customer checkout
       │
       ├── COD ────────► create_customer_order (PostgreSQL RPC)
       │
       └── XPay ───────► xpay-create-payment (Edge Function)
                                │
                                ▼
                          XPay Hosted Checkout
                                │
                         Signed XPay webhook
                                │
                                ▼
                    xpay-webhook → Durable inbox
                                │
                                ▼
                    xpay-process-webhook-inbox
                                │
                                ▼
                   Verified payment + order state
~~~

The implementation includes:

- Server-only `XPAY_MODE` selection and XPay credentials; the browser cannot override the provider mode.
- Customer JWT verification when creating XPay payments, plus ownership checks before reusing earlier attempts.
- Payment idempotency and webhook event deduplication.
- XPay signature verification, provider mode and session verification, and payment/amount matching.
- Inventory and order-state safeguards implemented in database RPCs.
- A durable webhook inbox with an authenticated processing worker and retry handling.
- Refund-related database logic and event reconciliation.

**A successful browser redirect is not proof of payment.** Verified payment state must come from the server and the payment provider.

### Server-side secrets

Configure these as **Supabase Edge Function secrets**, never frontend environment variables:

| Secret | Role |
| --- | --- |
| `XPAY_MODE` | `test` or `live` |
| `XPAY_SECRET_KEY` | Matching provider API secret |
| `XPAY_WEBHOOK_SECRET` | Webhook signature verification |
| `STOREFRONT_URL` | Return/cancel URL origin |
| `XPAY_WEBHOOK_SECRET_SECONDARY` | Optional *temporary* signature overlap during a controlled cutover |

XPay webhook endpoint:

~~~text
https://rotcgsayspiphcisepmu.supabase.co/functions/v1/xpay-webhook
~~~

The background inbox processor lives under `supabase/functions/xpay-process-webhook-inbox/`, with scheduling SQL in `scripts/schedule-webhook-inbox.sql`. **Do not send synthetic payment/webhook events to production.**

## Verified Product Reviews

Every product review is tied to an actual item in an order belonging to the reviewer.

- **1–5 stars** can be submitted only after the order reaches `delivered`.
- Each purchased order item can be reviewed **once**.
- Reviews may include an optional comment of up to **1,200 characters** and an optional **JPEG/PNG/WebP** photo of up to **5 MB**.
- Review images are stored in the private `product-review-photos` bucket and accessed using time-limited URLs subject to database/storage permissions.
- New submissions start as `pending`. **Neither ratings nor comments/photos appear publicly or affect averages before admin approval.**
- Administrators can **approve, hide, or permanently delete** reviews from `/admin/reviews`.
- The **Show my name with this review** preference is **off by default**. If enabled, the saved profile name is captured at submission and may be displayed after approval. Otherwise, the review appears under a generic customer label; older reviews remain anonymous.

Relevant source files:

- `src/features/account/OrderProductReviews.tsx` — customer review form
- `src/features/products/ProductReviews.tsx` — approved public reviews
- `src/services/reviewService.ts` — review RPCs and image handling
- `src/pages/admin/AdminReviewsPage.tsx` — moderation interface
- `supabase/migrations/20261022000016_verified_product_reviews.sql` — review eligibility and moderation
- `supabase/migrations/20261022000017_optional_review_author_name.sql` — opt-in author identity

## Backend & Security

**Supabase PostgreSQL RLS and server-side RPCs** are essential authorization boundaries. UI controls are not substitutes for ownership and permission checks.

| Database resource | Purpose |
| --- | --- |
| `profiles` | Customer profile and `customer` / `admin` role |
| `categories`, `products` | Catalog, categories, stock levels |
| `orders`, `order_items` | Order ownership and historical product/price snapshots |
| `payments` | XPay payment attempts and metadata |
| `xpay_webhook_events`, `xpay_refunds` | Processed provider events and refund ledger |
| `xpay_webhook_inbox` | Durable webhook processing queue |
| `release_controls` | Checkout/financial maintenance safety gates |
| `product_reviews` | Ratings, moderation state, and optional public name |
| `product-images` | Public catalog image bucket with admin-only writes |
| `product-review-photos` | Private customer review image bucket |

### Migration history

| Versions | Main changes |
| --- | --- |
| **001–007** | Initial schema, RLS, catalog image storage, admin order workflow, category visibility |
| **008–011** | XPay payment storage, provider RPCs, required service-role privileges |
| **012–014** | Inventory/payment consistency, refund ledger, checkout maintenance, durable webhook inbox |
| **015** | Authenticated customer orders, order ownership, customer cancellation, replacement of guest-order creation |
| **016** | Verified reviews, private uploads, admin moderation |
| **017** | Opt-in reviewer name with backward-compatible RPC support |

> **Production migration warning:** Historical migrations are intentionally not rewritten after they have run. Some newer migrations were applied using the Supabase Management API, resulting in **recorded migration version identifiers that differ from their checked-in filenames**. Inspect `supabase_migrations.schema_migrations` and reconcile the actual deployed schema with the local migration history **before running `supabase db push`**. Test against a separate database and obtain a restorable backup first.

### Rate limiting and abuse prevention

Supabase Auth supplies authentication-specific rate limits based on project settings. The current application **does not implement a comprehensive, dedicated API rate limiter for order/payment creation or a universal CAPTCHA**. RLS prevents unauthorized access, but it does not replace throttling or anti-automation controls.

## Testing & Operations

The pull request validation workflow runs:

~~~bash
npm ci
npm run build
npm run lint
~~~

Changes involving payments, authorization, reviews, or database migrations also require scenario-specific checks:

- Anonymous or wrong-account requests must not access customer orders or reviews.
- Orders must follow valid transitions and maintain inventory integrity through cancellation and retries.
- Payment verification must correctly handle amounts, provider modes, signed webhook events, duplicates, and refunds.
- Pending/hidden reviews, images, and opt-in names must not leak to public responses.
- Schema changes must be tested against the intended starting database state and verified against recorded migrations.

### Production backup and recovery

Repository scripts include:

- `scripts/backup-production.ps1`
- `scripts/verify-production-backup.ps1`
- Supporting backup, encrypted diagnostics, and restoration tooling under `scripts/`
- Release and investigation reports under `docs/`

These production recovery tools depend on a controlled Windows environment and PostgreSQL 17.11 tooling. They are **not** ordinary developer startup commands. **An encrypted and integrity-checked archive is not equivalent to a successfully tested production restoration**. Review the most recent verification results before attempting a production cutover.

## Deployment

The public frontend is served through GitHub Pages at:

### **https://athar.qd.je**

Workflow: [`.github/workflows/deploy-github-pages.yml`](.github/workflows/deploy-github-pages.yml)

On pushes to `main`:

1. GitHub Actions checks out the repository and runs `npm ci`.
2. The site builds using `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from GitHub Actions secrets.
3. The workflow verifies production asset paths and SEO artifacts.
4. The `dist/` artifact is published to GitHub Pages.

The Vite `base` is `/` for the custom domain. The build copies `index.html` to `404.html` so direct React Router links can load correctly on GitHub Pages. The repository also contains `public/CNAME`, `robots.txt`, and `sitemap.xml`; sitemap generation may enrich catalog URLs when Supabase configuration is available at build time.

**Backend deployment is separate.** Publishing GitHub Pages does **not** apply Supabase SQL migrations or deploy Edge Functions.

### Google OAuth configuration

To enable Google sign-in in another environment:

1. Configure the Google provider in **Supabase Auth**.
2. Register the Supabase Auth callback URL in the Google Cloud OAuth client.
3. Set the Supabase **Site URL** and allowed redirect URLs to match the frontend domain and `/auth/callback` route.
4. Keep the Google client secret in the provider/server configuration, never in Git or any `VITE_*` environment variable.

## Documentation & Contributing

- [Supabase setup guide](supabase/SETUP.md) — service setup and payment configuration (**may contain historical instructions**)
- [Database migrations](supabase/migrations/) — versioned schema and authorization changes
- [Engineering/operations notes](docs/) — order flows, refund handling, backup and release investigations
- [Tooling and tests](scripts/) — QA, verification, and controlled operational utilities
- [GitHub Actions](.github/workflows/) — build checks and deployment

For changes, use a dedicated feature branch, run the build and lint checks, and test backend/security changes in an isolated environment. Submit a pull request with a concise description and reproducible validation steps.

**License:** No `LICENSE` file is currently checked into this repository. Do not assume open-source redistribution rights without the project owner's permission.

---

<div align="center">

### Athar — Elegance That Leaves a Mark ✨

[**Shop**](https://athar.qd.je) · [**Instagram**](https://www.instagram.com/atha.r1797) · [**Email**](mailto:Atharbags2026@gmail.com)

*Built for an Arabic-first shopping experience.*

</div>
