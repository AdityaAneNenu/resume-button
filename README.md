# Resume Button

A local assistant for picking up unfinished work. Leave a short session note, select a few files or a test log, and create a resume card with your goal, progress, blocker, failed attempts, and one next step.

The app runs on your computer. Qwen interprets the context through llama.cpp; SQLite keeps cards and their original sources available after you close the browser.

## Start on Windows

Requires Node.js 22.13 or newer, npm, PowerShell, and Git if you want captured Git status and diffs. Node.js 24 is recommended. The bundled model setup targets Windows x64 and CPU inference.

```powershell
npm ci
npm run setup:model
npm run local
```

Open http://127.0.0.1:4173. Setup downloads the pinned llama.cpp runtime and Qwen2.5-1.5B-Instruct Q4_K_M weights, about 1.1 GB, and checks both SHA-256 hashes. It needs internet for those downloads. Cards can be generated offline afterward. Startup may take a few seconds while the model loads.

The runtime is already installed in this workspace, so `npm run local` is enough for subsequent launches. If the app and model are already running, simply open the URL.

To run them in separate terminals:

```powershell
npm run model
npm run dev
```

For a production build:

```powershell
npm run build
npm run local:production
```

The local launcher reuses an existing model or app when available. `npm start` launches only the production app; `npm run dev` launches only the development app. Stop the app before switching between development and production on the same port. Press Ctrl+C in the launch terminal to stop task-owned processes.

## Save and resume

1. Create a project, optionally with an absolute folder path.
2. Select **Save my place**. Use the guided note to record your goal, completed work, current blocker, failed attempt, next idea, and unresolved decision. All fields are optional. Free notes are also supported.
3. Import text files or scan the attached folder. Scan results start unselected; choose the relevant context. Rescanning preserves files you imported yourself.
4. Create the card. The local model selects evidence lines and proposes a next step when you have not recorded one. The form shows elapsed time during generation. **Cancel generation** keeps your draft and selected sources so you can retry.
5. Inspect any source link to open the saved copy at its cited line. Start a focus session, revisit older cards in History, or export a card as Markdown.

Your draft includes both note modes, imported/scanned text, selected checkboxes, and scan metadata. It survives closing the form or reloading this browser and clears after a successful save. Drafts belong to the browser and app origin; changing ports or browsers does not transfer them. A visible message reports unavailable/full browser storage.

Use the project settings button to change the name, context, or attached folder. **Remove this card** removes the selected stopping point after confirmation. Project removal is available in local settings and removes its saved cards; the attached folder stays in place. Download a backup before removing work you may need later.

## Backup and restore

Open local settings using the model-status button at the bottom of navigation. **Download backup** exports projects, cards, and captured source copies in versioned JSON. **Import backup** previews the project count; **Restore copies** validates ownership and evidence, creates new IDs in a transaction, and preserves existing projects. Attach folder paths again after restoring. Files must be smaller than 10 MB.

Backups contain plain source text. Browser drafts and folder attachments are excluded. Keep backups somewhere you control. For a complete database copy, stop the app before copying `.resume-button/resume.db`.

The **Weekend Atlas** example is fictional and its initial card is handwritten. Creating a new card from its sources runs the actual local model. See `samples/weekend-atlas/` for a small unfinished task you can attach or import.

## How evidence works

- The model returns numbered source lines. Saved quotes come directly from those lines, with their source and line number.
- Explicit `Goal:`, `Completed:`, `Blocked:`, and `Tried:` labels take precedence over model categorization. Where several supplied notes have labels for a category, the last supplied note for that category takes precedence; file timestamps are not used.
- New recaps use selected source text directly. This prevents the model from writing a success claim that contradicts the saved blocker.
- A recorded `Next idea:` or `Next step:` is shown as **Your recorded idea**. Otherwise the model proposes an **AI suggestion** with clickable supporting sources.
- Unknown line IDs, headings classified as evidence, and selections that contradict an explicit label are omitted and counted. Invalid responses get one repair attempt before a visible error. Failed generation does not remove prior cards or your note draft.
- Plain notes are split into exact sentence evidence, PASS/FAIL log lines retain their status, and open questions must point to a source question. The small bundled model can still omit failed attempts in unlabeled prose; guided notes preserve them more reliably.

A matching quote is evidence of what the source said. It does not prove that the source is current or that an AI classification or suggestion is correct. Old cards retain their original interpretation and sources.

## Limits and storage

Each card accepts up to 20 sources including the session note, 6,000 characters per source, and 18,000 characters total. Folder scans inspect at most 400 entries, consider at most 80 files, and return at most 16 text files across four folder levels, plus limited Git context when available. Large files are truncated with a notice. Select a small set of relevant sources for faster, clearer results.

Scans skip hidden files, common secret filenames, dependency/build folders, runtime/storage folders, generated artifacts, and symbolic links/junctions. These filename rules cannot identify every sensitive file. Imported text files are chosen explicitly by you.

Projects, snapshots, and selected source copies are stored in `.resume-button/resume.db` using SQLite. Browser drafts are stored in localStorage. These files are not encrypted. The app has no accounts, cloud generation, telemetry, or analytics. Both servers listen on loopback; the model endpoint must also be loopback. One card can generate at a time. A combined 180-second timeout bounds the model request and one repair attempt; streaming is not implemented.

## Existing local models

The backend supports a llama.cpp OpenAI-compatible endpoint or Ollama. To use an existing Ollama installation, start Ollama and pull the model, then set:

```powershell
$env:MODEL_PROVIDER = 'ollama'
$env:MODEL_URL = 'http://127.0.0.1:11434'
$env:MODEL_NAME = 'qwen2.5:1.5b'
npm run dev
```

`npm run local` and `npm run local:production` respect these settings; otherwise they start or reuse the bundled llama.cpp service. `PORT` sets the app port, and `RESUME_DATA_PATH` sets the SQLite database location. `MODEL_URL` accepts an HTTP loopback origin without credentials, paths, or query parameters. A provider must support the requested JSON schema and cooperate with cancellation. Protocol coverage for Ollama is simulated; the bundled Qwen runtime has also been checked with real generation.

## Verify

```powershell
npm test
npm run format:check
npm run build
npx playwright install chromium
npm run test:e2e
```

The 30 unit/API tests cover evidence, author-label precedence, persistent history, folder scanning, both model protocols, request validation, cancellation, backup recovery, and empty-workspace persistence. Three browser flows exercise capture, full draft recovery, source navigation, export, focus, history, project management, backups, cancellation, and mobile layout. Browser tests use an in-memory fixture on port 4190 and the current production build. They do not require model weights or touch your database. Local runs show Chromium; CI runs headlessly.

The real Qwen production check also passed. A five-source capture took 92.1 seconds on this machine; earlier smaller runs were faster. This measures generation latency, not human time saved. See [BUILD_STATUS.md](BUILD_STATUS.md) for evidence and limits.

## Troubleshooting

| Problem | Action |
| --- | --- |
| Model offline | Wait for startup, use Refresh in local settings, or run `npm run model`. Confirm the configured model name is loaded. |
| Port already occupied | Open the existing app or stop its launch terminal; alternatively set `PORT` to a free port. |
| Generation fails or times out | Keep the draft, reduce selected context, and use guided labels. Check the model terminal. |
| Folder scan fails | Edit the absolute folder path or import text files directly. |
| Draft storage unavailable | Keep capture open until you save; reduce imported context. Saved cards remain in SQLite. |
| Backup import fails | Check the version and file size. Invalid imports leave existing projects intact. |
| Playwright executable missing | Run `npx playwright install chromium`. Build before running browser tests. |

## Release and demo

Run `npm run package:release` for a source ZIP and SHA-256 file under `artifacts/releases/`. It excludes dependencies, runtime/model downloads, database files, and generated test data. Extract, run `npm ci`, and follow the setup instructions above.

- [Demo walkthrough and screenshots](docs/DEMO.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Release and submission handoff](docs/RELEASE.md)
- [Local DEV article draft](docs/SUBMISSION_DRAFT.md)
- [Contributing](CONTRIBUTING.md) and [release notes](CHANGELOG.md)

The project is MIT licensed and published at [AdityaAneNenu/resume-button](https://github.com/AdityaAneNenu/resume-button). [Watch the short demo](docs/media/resume-button-demo-short.webm) or [download the full real-model recording](docs/media/resume-button-demo.webm). The DEV article remains a Markdown draft; the challenge entry has not been submitted.

## Open components

- [Qwen2.5-1.5B-Instruct](https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct) and its [official GGUF weights](https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF), Apache 2.0.
- [llama.cpp](https://github.com/ggml-org/llama.cpp), MIT.
- React, Vite, Express, Zod, and SQLite provide the interface, local API, validation, and storage.

Open weights and a replaceable local inference endpoint make the assistant usable without a cloud account or per-card API charge. CPU speed and interpretation quality depend on the model and the context you choose.
