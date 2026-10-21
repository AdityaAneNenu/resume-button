# Contributing

Resume Button is a local Windows-first app. Read [README.md](README.md) for setup and model choices.

## Development

Use Node.js 22.13 or later; Node 24 is recommended.

```powershell
npm ci
npm run dev
```

A model is needed only for real generation. Unit and browser tests use isolated fixtures. Keep private notes, databases, model downloads, environment files, and generated artifacts out of commits.

Before proposing a change:

```powershell
npm test
npm run format:check
npm run build
npx playwright install chromium
npm run test:e2e
```

The browser suite uses an in-memory database on port 4190 and the current production build. Leave that port free. Format changed code with Prettier.

## Evidence and data changes

Keep quotes exact and tied to saved source lines. Clearly label generated suggestions. Preserve explicit author categories and recorded next ideas. A failed or cancelled generation must not create a card or discard the draft. Restore backups as copies and keep existing work.

Include a regression check for changes that could lose data or break the evidence contract. Explain the user-visible behavior and any model limitations in the contribution.

Application contributions are provided under the MIT license. Dependencies retain their upstream licenses.
