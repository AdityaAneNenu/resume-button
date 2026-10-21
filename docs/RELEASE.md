# Release and submission handoff

The local 1.0.0 build is complete. This document separates build evidence from public submission steps.

## Release contents

Run `npm run package:release` to create a source ZIP and SHA-256 checksum under `artifacts/releases/`. It includes code, lockfile, tests, CI, model setup, license, documentation, and screenshots. It excludes Git metadata, node_modules, the production build, model downloads, databases, drafts, logs outside samples, and generated verification files.

Extract it into a new directory, run `npm ci`, follow the README model instructions, build, and launch. The model download is about 1.1 GB.

The release was extracted and checked with a fresh dependency install, verified cached model downloads and runtime extraction, a production build, and a new production server. The test server was stopped after confirming its model and static assets were ready.

## Submission readiness

| Item | Status |
| --- | --- |
| Working local open-model application | Complete |
| MIT license and upstream notices | Complete |
| Setup, production, architecture, contribution docs | Complete |
| Automated tests and real Qwen evidence | Complete |
| Screenshots, demo recording, template-shaped article | Complete locally |
| Public repository and public demo links | [GitHub source and recordings](https://github.com/AdityaAneNenu/resume-button) |
| DEV article | Local draft; not posted |
| Challenge submission | Not submitted |
| Human time-savings measurement | Not measured; optional |
| Partner prize claims | None claimed |

The draft follows the official template retrieved on October 21: What I Built, Demo, Code, How I Built It, and Why Does Open Innovation Matter. The official template adds `devchallenge` and `hf26challenge`. The draft includes public repository, demo, and screenshot links. Optional agent-session and partner sections are omitted because no session was uploaded and no partner use has been established.

## Deadline

The user is registered for [Hacktoberfest Open-Source AI Challenge: Week 3](https://dev.to/challenges/hacktoberfest-week3-2026-10-19), event 81.

The written rules retrieved October 21 say October 25 at 11:59 PM PDT, which is October 26 at 12:29 PM IST. The event feed says October 25 at 06:59 UTC, which is October 25 at 12:29 PM IST. These conflict by one day. Aim to publish by October 24 and verify the final deadline with the organizer.

## Optional human evaluation

Use two comparable unfinished tasks. For one, read the raw notes and source files; for the other, start with a generated card. Record elapsed time until the first correct action and whether the action addresses the actual blocker. Counterbalance task order across participants. Count mistakes and preparation time, including generation, and report the sample size. No such result has been collected yet.

The source and recordings were published to GitHub at the user's request on October 22. Posting to DEV and submitting the entry remain pending. Review `docs/SUBMISSION_DRAFT.md` before posting it.
