# أثر Supabase setup (Phase 2)

Dedicated project:

- Name: **athar** / أثر
- Ref: `rotcgsayspiphcisepmu`
- URL host: `rotcgsayspiphcisepmu.supabase.co`

## Frontend env

Vite loads:

1. `.env`
2. `.env.local` (preferred for local secrets; gitignored)

Required keys only:

```env
VITE_SUPABASE_URL=https://rotcgsayspiphcisepmu.supabase.co
VITE_SUPABASE_ANON_KEY=<athar anon / publishable key>
```

Never put `service_role`, `sb_secret_*`, or account passwords in Vite env.

`.env.example` must stay placeholders only.

## Apply migrations (manual — required once)

The local Supabase CLI session may not have Management API privileges on athar.
Apply SQL in the athar Dashboard SQL Editor as role `postgres`, in order:

1. `supabase/migrations/20261003000001_initial_schema.sql`
2. `supabase/migrations/20261003000002_rls.sql`
3. `supabase/migrations/20261003000003_storage.sql`
4. `supabase/migrations/20261003000004_guest_order_confirmation.sql` (guest checkout confirmation payload)

Or, after logging the CLI into the account that owns athar:

```bash
supabase link --project-ref rotcgsayspiphcisepmu
supabase db push
```

Optional demo seed only:

- `supabase/seed.sql`

## Promote first admin

1. Create a user in athar **Authentication → Users** (email/password).
2. Run in SQL Editor:

```sql
update public.profiles
set role = 'admin'
where id = '<auth-user-uuid>';
```

Do not store that password in the repo.
