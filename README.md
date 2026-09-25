# Fivehundrd. The Wall

Production port of the approved `reference.html` prototype.

## Local development

```bash
pnpm install
pnpm dev
```

Open <http://localhost:3000>. The prepare script copies the source-of-truth
prototype into `public/` before development and production builds. The root
route initially serves that document byte-for-byte, establishing a zero-diff
baseline while the implementation is incrementally extracted into typed React
components.

## Checks

```bash
pnpm lint
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
```

The visual test compares the application with the reference at the three
required viewport sizes in light and dark mode.
