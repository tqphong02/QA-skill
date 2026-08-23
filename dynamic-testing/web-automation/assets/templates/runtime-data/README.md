# Runtime Data Folder

This folder is generated at runtime and is intentionally kept separate from
`test-data/`, which contains committed static/typed testcase data.

Runtime files may include generated users, mock payloads, upload inputs,
checkout sessions and the last-run summary. They are scoped by the fixture
namespace and must not be shared by parallel workers without an explicit
isolation contract.

Examples:

```text
runtime-data/
├── users.<namespace>.json
├── generated.<namespace>.json
└── last-run.json
```

The project `.gitignore` ignores runtime files and keeps only this README and
`.gitkeep`. Do not commit credentials, tokens, cookies or authenticated
storage state here.
