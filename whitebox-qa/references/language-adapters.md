# Language adapters

## Adapter selection

The file extension deterministically selects one parser:

| Extensions | Language | Parser |
|---|---|---|
| `.ts`, `.tsx` | TypeScript | ts-morph |
| `.js`, `.jsx` | JavaScript | ts-morph |
| `.py` | Python | ast-grep/tree-sitter |
| `.java` | Java | ast-grep/tree-sitter |
| `.go` | Go | ast-grep/tree-sitter |
| `.cs` | C# | ast-grep/tree-sitter |
| `.dart` | Dart | ast-grep/tree-sitter |

Unsupported extensions fail with `LANGUAGE_NOT_SUPPORTED`.

## Normalization

The generic adapters translate language AST nodes into the shared model:

- Python `match/case` becomes a switch-style decision
- Java switch statements and expressions become switch paths
- Go expression/type switch and `panic` are normalized to switch/throw behavior where visible
- C# switch statements/expressions and throw statements are normalized
- Dart function signatures plus bodies, switch cases, return, throw, and try/catch are normalized

All adapters detect function or method name, class where available, source lines, source hash, decisions, exits, bounded paths, and static testcase candidates.

## Fail-closed rules

- No exact match: `FUNCTION_NOT_FOUND`
- Multiple matches: `AMBIGUOUS_FUNCTION`
- Unsupported file: `LANGUAGE_NOT_SUPPORTED`
- Parser-specific unsupported syntax: retain a warning or require manual review

Do not use regex output as a substitute when an AST adapter fails.
