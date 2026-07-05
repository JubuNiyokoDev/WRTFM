# Worldwide Rapid Task For Money Architecture

## Product direction

The project is a verification automation engine for task-and-earn platforms.
The marketplace screens remain useful, but the core value is automated control:

- task understanding and proof requirements;
- proof collection and normalized evidence;
- confidence scoring and automatic decisions;
- manual review for uncertain cases only;
- reports, auditability, and platform/API integration.

## Clean Project Layout

- `frontend`: React, Vite, Tailwind and Tauri desktop shell.
- `frontend/src/api-client`: generated React Query API client.
- `backend`: Express API, verification routes and build tooling.
- `backend/src/db`: Drizzle database connection and schema.
- `backend/src/api-zod`: generated Zod schemas from OpenAPI.
- `backend/api-spec`: OpenAPI contract and Orval generation config.
- `docs`: product and architecture documentation.

## Commands

From the project root:

```sh
pnpm dev:frontend
pnpm dev:backend
pnpm dev:tauri
pnpm typecheck
pnpm build
pnpm build:tauri
```

## Next Architecture Steps

1. Extract verification rules into focused domain modules under `backend/src`.
2. Add first-party proof upload storage, OCR/image analysis and duplicate-proof detection.
3. Wire campaign funding to verified wallet balance and escrow-style task payouts.
4. Add partner API keys, webhooks and usage billing for licensed integrations.
5. Add contract tests around confidence thresholds and decision routing.
