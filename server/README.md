# Infinity Storage Backend API

Next.js backend for Infinity Storage. Provides routes for authentication, storage operations, file and folder management, pricing, caching, metrics, and payments.

## Prerequisites

- Node.js 20+
- npm
- PostgreSQL (for Prisma-backed features)
- Wallet and network credentials for Walrus/Sui operations

## Install

```bash
npm install
```

## Environment

Create `server/.env` with the values required for your local and deployment setup.

Typical categories include:

- network and RPC settings
- wallet/private key configuration
- database (`DATABASE_URL`)
- Stripe configuration

## Run Locally

```bash
npm run dev
```

## Build and Start

```bash
npm run build
npm run start
```

## Prisma Commands

```bash
npm run migrate:status
npm run migrate:deploy
npm run migrate:dev
npm run db:push
npm run prisma:studio
```

## API Route Groups

Routes are implemented under `server/app/api/`:

- `auth`
- `balance`
- `cache`
- `config`
- `cron`
- `delete`
- `download`
- `files`
- `folders`
- `health`
- `metrics`
- `payment`
- `price`
- `shares`
- `stripe_payment`
- `upload`
- `verify`

## Troubleshooting

If `.next` artifacts cause local issues:

```bash
rm -rf .next
npm run dev
```

If dependencies are corrupted or mismatched:

```bash
rm -rf node_modules package-lock.json
npm install
```

Test retrieval using the CLI or the scripts in ../client/src/scripts.

## License

MIT License - see the [LICENSE](../LICENSE) file for details.

## Authors

Neil Roy, Kevin Lee, Edwin Medrano Villela, Awin Zhang, Suhrit Padakanti
