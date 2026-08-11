# Google Drive account profile example

This optional local file contains non-secret routing metadata. Copy it to `ACCOUNT-PROFILE.md`; that filename is gitignored.

- Google account: `qa-user@example.com`
- MCP server name: `google-drive`
- MCP package: `@piotr-agier/google-drive-mcp`
- OAuth credential environment variable: `GOOGLE_DRIVE_OAUTH_CREDENTIALS`
- MCP scopes environment variable: `GOOGLE_DRIVE_MCP_SCOPES`
- OAuth credential path: `~/.config/google-drive-mcp/gcp-oauth.keys.json`

Never add OAuth client secrets, access tokens, refresh tokens, cookies, or service-account private keys.
