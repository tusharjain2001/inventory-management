# Studio Rubina — Inventory & Sales

Web-based inventory, sales and GST invoicing for Studio Rubina (Gurugram). One Next.js app
(pages + API), PostgreSQL on Supabase, product photos on Supabase Storage.

**Modules:** dashboard · product master (photos, GST/HSN, Excel import) · inventory ledger
(opening stock, stock-in/purchases, adjustments, damaged/lost, stock out for display / "Potential
Sales") · sales orders → GST tax invoices (Tally-style print) → payments · credit notes ·
customers & purchase history · suppliers · reports (stock, sales, purchase, profit, low-stock,
fast/slow-moving, dead stock, valuation, GST, payments) · users, roles & permissions · settings ·
audit log & login activity.

Developer conventions: [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

## Local development

Requires Node.js 22+.

```bash
npm install
npm run db:local          # terminal 1 — local PostgreSQL on port 5433 (downloads automatically)
npx prisma migrate dev    # create tables
npm run db:seed           # roles, default settings, admin user, "Cash" walk-in customer
npx next dev -p 3100      # http://localhost:3100
```

Sign in as `admin` / `ChangeMe@123` and change the password from the user menu.
Without SMTP settings, password-reset links are printed in the server console. Without Supabase
Storage settings, uploads are saved to `./uploads`.

## Production setup (Hostinger Business Web Hosting + Supabase)

### 1. Supabase (database + photos)
1. Create a project at supabase.com using the **client's email**. Region: **Mumbai (ap-south-1)**.
2. **Project Settings → Database → Connection string → Session pooler**: copy the URI and put the
   database password in it. Use it for both `DATABASE_URL` and `DIRECT_URL`.
3. **Storage → New bucket** named `uploads`, set to **Public**.
4. **Project Settings → API**: copy the Project URL (`SUPABASE_URL`) and the `service_role` key
   (`SUPABASE_SERVICE_ROLE_KEY`). Keep the service key secret; it is only used on the server.
5. At go-live, upgrade to **Pro** for daily backups. On the Free plan, enable the backup workflow
   in step 4.

### 2. Create the tables (from your computer, once per release)
```bash
# .env.production.local or exported env vars pointing at Supabase
DATABASE_URL="postgresql://postgres.xxxx:PASSWORD@aws-0-ap-south-1.pooler.supabase.com:5432/postgres"
DIRECT_URL="$DATABASE_URL"
npx prisma migrate deploy
SEED_ADMIN_EMAIL="owner@example.com" SEED_ADMIN_PASSWORD="a-strong-password" npm run db:seed
```
The seed only creates missing data, so it is safe to re-run.

### 3. Hostinger (the app)
1. In hPanel, add a **Node.js web app** (Business plan or higher), connected to the GitHub repo
   (or upload the project zip without `node_modules`, `.next`, `.pgdata`, `uploads`).
2. Node version **22**, build command `npm run build`, start command `npm start`
   (`npm install` runs `prisma generate` automatically).
3. Environment variables:

   | Name | Value |
   |---|---|
   | `DATABASE_URL`, `DIRECT_URL` | Supabase session pooler URI |
   | `APP_URL` | `https://inventory.studiorubina.com` (used in password-reset emails) |
   | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_BUCKET` | from step 1 (`uploads`) |
   | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | e.g. Brevo/Resend free tier, or Gmail app password |

4. Point the domain (or subdomain `inventory.`) at the app in hPanel and enable the free SSL.

### 4. Backups on the Supabase Free plan
`.github/workflows/db-backup.yml` dumps the database every night at 02:00 IST and keeps 30 days
of backups as downloadable GitHub Actions artifacts. Add the repository secret `DIRECT_URL` to
enable it. The daily connection also keeps the free project from pausing.
Restore: `pg_restore --clean --no-owner -d "$DIRECT_URL" inventory-YYYY-MM-DD.dump`.

## Go-live checklist
- [ ] Settings → Company: logo, address, GSTIN, PAN, bank details (pre-filled from the GST certificate and the sample invoice — verify)
- [ ] Settings → Numbering: invoice prefix/format and next number (e.g. continue `SR/027/26-27`)
- [ ] Settings → Invoice: terms & conditions
- [ ] Settings → Inventory: set **Default opening stock** to 0 (it is 5 for testing)
- [ ] Import products from Excel with real opening stock; delete test data
- [ ] Create staff users and check role permissions / discount limits (Sales 10%, Manager 15%)
- [ ] Change the admin password
