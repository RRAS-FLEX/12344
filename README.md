# Nautiplex

## How can I edit this code?

There are several ways of editing your application.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## Auth setup (Google + Email)

This app now supports:

- Sign in/sign up with email + password
- Sign in with Google OAuth

Create a local env file before running in dev:

```sh
cp .env.example .env
```

Then set your Google OAuth Web Client ID in `.env`:

```sh
VITE_GOOGLE_CLIENT_ID=your-google-oauth-client-id.apps.googleusercontent.com
VITE_GTM_ID=GTM-XXXXXXX
VITE_API_BASE_URL=

STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_PUBLISHABLE_KEY=pk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx

SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
APP_BASE_URL=https://your-site.netlify.app
API_PORT=4242
```

Run the frontend and backend in parallel during development:

```sh
npm run dev
npm run dev:api
```

Stripe integration uses hosted Stripe Checkout + Stripe Connect Express split payouts.
Run `supabase_stripe_connect_setup.sql` in Supabase SQL editor before using it.

If you see `401: invalid_client`:

- Make sure this is a **Web application** OAuth client ID.
- Add your exact frontend origin in Google Console → Authorized JavaScript origins (for example `http://localhost:3000`, `http://localhost:3001`, or `http://192.168.1.71:3000`).
- Remove quotes/spaces from `.env` value and restart the dev server.

Auth data is persisted in browser local storage:

- `nautiq_auth_users` (registered users)
- `nautiq_auth_session` (active signed-in user)

## Analytics (GTM + GA4)

This app supports Google Tag Manager via environment variable:

```sh
VITE_GTM_ID=GTM-XXXXXXX
```

When set, the app pushes funnel events to `window.dataLayer` and maps them to GA4-friendly events:

- `search_submitted` → `search`
- `boat_viewed` → `view_item`
- `booking_started` → `begin_checkout`
- `booking_confirmed` → `purchase`
- `experiment_exposure` → `experiment_impression`
- route changes → `page_view`

For A/B testing, the homepage hero CTA uses experiment key `hero_search_cta` with sticky variants per user.

## Supabase Integration (Optional)

This project includes optional Supabase integration for production-ready database and authentication. 

**Why Supabase?**
- Real PostgreSQL database instead of localStorage
- Multi-user support with proper role-based access
- File storage for boat images and documents
- Real-time updates with subscriptions
- Row-Level Security for data privacy
- Scalable to thousands of users

**Setup Instructions:**

See [SUPABASE_SETUP.md](./SUPABASE_SETUP.md) for detailed setup steps.

**Quick Start:**
1. Create a Supabase project at [supabase.com](https://supabase.com)
2. Copy your project URL and anon key
3. Add them to `.env.local`:
   ```
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=your-key
   ```
4. Run the SQL schema from `SUPABASE_SETUP.md` in the Supabase SQL Editor
5. Replace imports in your code:
   ```ts
   // Before (localStorage):
   import { addOwnerBoat } from "@/lib/owner-dashboard";
   
   // After (Supabase):
   import { addOwnerBoat } from "@/lib/supabase-owner-dashboard";
   import { signInWithEmail } from "@/lib/supabase-auth";
   ```

**Available Supabase Modules:**
- `src/lib/supabase.ts` — Client initialization & TypeScript types
- `src/lib/supabase-auth.ts` — Sign up / sign in / session management
- `src/lib/supabase-owner-dashboard.ts` — Boat CRUD operations

**Backward Compatibility:**
The current localStorage-based auth and boat management still work. You can migrate incrementally.

## Deployment

Build the app with:

```sh
npm run build
```

Preview the production build with:

```sh
npm run preview
```

