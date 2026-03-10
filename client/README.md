# Infinity Storage Client

React + Vite frontend for Infinity Storage, plus local CLI utilities for upload and download operations.

## Prerequisites

- Node.js 20+
- npm
- Sui wallet and testnet assets for testing storage flows

## Install

```bash
npm install
```

## Run the Frontend

```bash
npm run start
```

## Build and Preview

```bash
npm run build
npm run preview
```

## Utility Scripts

Generate key material:

```bash
npm run generate-key
```

Query user blobs:

```bash
npm run query:blobs
```

## CLI Commands

Show CLI usage:

```bash
npm run cli:start -- --help
```

Upload a file:

```bash
npm run upload -- <path>
```

Download a file:

```bash
npm run download -- <blobId> [outputDir] [filename]
```

Check balance:

```bash
npm run balance
```

Estimate storage cost:

```bash
npm run cost -- <path>
```

## Project Structure

```text
client/
├── src/
│   ├── components/
│   ├── hooks/
│   ├── pages/
│   ├── scripts/
│   └── services/
├── scripts/
└── README.md
```
