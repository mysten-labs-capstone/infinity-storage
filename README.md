# Infinity Storage

Infinity Storage is a TypeScript project for encrypted file storage on Walrus with a React frontend and Next.js backend.

## Team

- Neil Roy
- Kevin Lee
- Edwin Medrano Villela
- Awin Zhang
- Suhrit Padakanti

## Repository Layout

```text
mysten-labs-walrus/
├── client/      # React + Vite app and CLI helpers
├── server/      # Next.js API and database-backed services
├── docs/        # Project documentation
└── README.md
```

## Main Features

- Encrypted file upload and download flows
- File and folder management
- Upload verification and health endpoints
- Price, balance, and cache-related APIs
- Stripe-backed payment endpoints on the server

## Local Development

### Start the Client

```bash
cd client
npm install
npm start
```

### Start the Server

```bash
cd server
npm install
npm run dev
```

## Environment Variables

Both apps rely on `.env` files.

- `client/` uses Vite and script-related environment values.
- `server/` uses API, database, wallet, and payment configuration values.

Check source usage in each app for the exact variables required in your deployment.

## Resources

- Walrus docs: https://docs.wal.app
- Sui docs: https://docs.sui.io/

## License

MIT. See `LICENSE.txt`.
