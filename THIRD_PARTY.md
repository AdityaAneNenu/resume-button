# Third-party components

Resume Button application code uses the MIT license in `LICENSE`. Dependencies keep their own licenses.

| Component | Purpose | License / source |
| --- | --- | --- |
| Qwen2.5-1.5B-Instruct and official GGUF weights | Local language inference | [Apache 2.0 / model card](https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF) |
| llama.cpp | Portable CPU model runtime | [MIT](https://github.com/ggml-org/llama.cpp/blob/master/LICENSE) |
| React and React DOM | User interface | MIT |
| Express | Local HTTP API | MIT |
| Vite | Development server and browser build | MIT |
| Zod | Input and output validation | MIT |
| Lucide | Interface icons | ISC |
| Node.js / SQLite | Server runtime and database | [Node.js licenses](https://github.com/nodejs/node/blob/main/LICENSE); SQLite public domain |
| Playwright | Browser verification | Apache 2.0 |

Model weights and runtime binaries are downloaded separately by `npm run setup:model`, never included in the source release. Pinned upstream links and SHA-256 hashes are recorded in `scripts/setup-model.ps1`. Preserve upstream notices when redistributing those separate components.
