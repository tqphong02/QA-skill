# Call graphs and NestJS

## Bounded call graph

`whitebox graph` starts from one exact function and follows statically resolved local calls until `maxDepth` or `maxNodes`.

Each edge has:

- `resolved`: exactly one local target
- `ambiguous`: multiple local targets
- `external-or-dynamic`: no deterministic local target

An unresolved edge is useful evidence of uncertainty, not a failure to hide. `truncated: true` means traversal stopped at a configured boundary.

For TypeScript and JavaScript, the resolver uses identifiers, same-class `this.method()`, constructor property aliases, import declarations, and source locations. Generic adapters use AST call nodes plus same-file disambiguation.

## NestJS extraction

`whitebox nestjs` extracts:

- `@Controller`, `@Injectable`, and `@Module` classes
- controller route decorators and paths
- constructor parameters and visible types
- `@Inject("TOKEN")` tokens
- module `controllers`, `providers`, `imports`, and `exports`

An injection is resolved only when the visible token matches a discovered class. Custom providers, `useFactory`, dynamic modules, symbol tokens, reflection, runtime containers, and generated metadata may require manual review.

Use the NestJS graph to choose inter-function scope, then run function analysis on each risk-relevant node. Do not assume a resolved DI edge proves the provider is configured correctly at runtime.
