# Setup Guide

This guide walks you through setting up POS S360T for local development or production.

---

## 1. Prerequisites

- Node.js 20 or higher
- npm (or bun)
- Git
- A Supabase project (free tier is fine for development)
- (Optional) Docker for containerized deployment

---

## 2. Clone and Install

```bash
git clone https://github.com/mateopiza/ai-point-of-sale.git
cd ai-point-of-sale
npm install
```

---

## 3. Supabase Setup

### 3.1 Create a Project

1. Go to [https://supabase.com](https://supabase.com) and create a new project.
2. Copy the **Project URL** and **anon public key** from Settings > API.

### 3.2 Configure Environment Variables

```bash
cp .env.example .env
```

Fill in:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-key
```

### 3.3 Apply Migrations

Install the Supabase CLI and link your project:

```bash
supabase login
supabase link --project-ref your-project-ref
supabase db push
```

### 3.4 Seed Demo Data (Optional)

For local development, seed data creates a demo tenant and users:

```bash
supabase db reset
```

> This runs `supabase/seed.sql`. Do not run on production databases.

---

## 4. Run the App

```bash
npm run dev
```

Open [http://localhost:8080](http://localhost:8080).

Default demo credentials (if seeded):

- Email: `owner@demo.local`
- Password: `Demo2026!`

---

## 5. Configure Optional Integrations

### Barcode Lookup

1. Create an account at [https://www.barcodelookup.com](https://www.barcodelookup.com).
2. Add your API key to `.env`:

```env
VITE_BARCODE_LOOKUP_API_KEY=your-key
```

If not set, the app falls back to Open Food Facts.

### OpenRouter (AI Agent)

1. Create an account at [https://openrouter.ai](https://openrouter.ai).
2. Add your key (this goes in Supabase Edge Function secrets, not in `.env`):

```bash
supabase secrets set OPENROUTER_API_KEY=your-key
```

### Google Gemini (Invoice OCR)

```bash
supabase secrets set GEMINI_API_KEY=your-key
```

### Rappi

Configure Rappi credentials as Supabase Edge Function secrets:

```bash
supabase secrets set RAPPI_CLIENT_ID=your-id
supabase secrets set RAPPI_CLIENT_SECRET=your-secret
supabase secrets set RAPPI_WEBHOOK_SECRET=your-secret
supabase secrets set RAPPI_API_BASE=https://services.rappi.com
```

### Evolution API (WhatsApp)

```bash
supabase secrets set EVOLUTION_API_URL=https://your-evolution-instance
supabase secrets set EVOLUTION_API_KEY=your-key
supabase secrets set EVOLUTION_WEBHOOK_SECRET=your-secret
```

---

## 6. Run Tests

```bash
npm run test
npm run test:watch
```

Run the quality gates:

```bash
npm run lint
npm run validate:migrations
npm run build
```

---

## 7. Build for Production

### Web / PWA

```bash
npm run build
```

The output is in `dist/`.

### Electron

```bash
npm run build:electron
```

The output is in `release/`.

### Docker

```bash
docker build \
  --build-arg VITE_SUPABASE_URL=https://your-project.supabase.co \
  --build-arg VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-key \
  -t poss360t:latest .

docker run -p 3000:80 poss360t:latest
```

---

## 8. Troubleshooting

| Problem | Solution |
|---------|----------|
| `VITE_SUPABASE_URL is required` in Docker | Pass the build args correctly. |
| Login fails | Check that migrations and seed ran. |
| AI agent does not respond | Verify `OPENROUTER_API_KEY` is set as a Supabase secret. |
| Rappi webhooks return 401 | Check `RAPPI_WEBHOOK_SECRET`. |
| Offline sync not working | Verify IndexedDB is allowed in browser settings. |

---

## 9. Next Steps

- Read [ARCHITECTURE.md](ARCHITECTURE.md) for system design.
- Read [FLOWS.md](FLOWS.md) for business processes.
- Read [DATABASE.md](DATABASE.md) for the data model.
- Read [SECURITY.md](SECURITY.md) before going to production.
