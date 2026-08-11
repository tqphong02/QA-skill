# Kết nối Database MCP ở chế độ read-only

## Hard gate

Không cấu hình database thật cho đến khi có đủ:

- Engine và environment chính xác
- Host, port và database name
- DB user hoặc role được DBA xác nhận chỉ có quyền đọc
- Schema hoặc dataset scope
- TLS, VPN hoặc SSH tunnel requirement
- Row limit, query timeout và dữ liệu nhạy cảm phải redact

Không đưa password, DSN hoặc connection string vào prompt, repository, evidence hoặc shell history.

## PostgreSQL, MySQL, MariaDB, SQL Server hoặc SQLite

Dùng DBHub với Node.js 22.5+ và một config local không commit. Copy [../assets/dbhub-readonly.example.toml](../assets/dbhub-readonly.example.toml) ra ngoài repository, thay source bằng DSN của read-only user và giới hạn quyền file ở `600`.

```bash
codex mcp add database-readonly -- \
  npx -y @bytebase/dbhub@latest \
  --transport stdio \
  --config /absolute/path/to/dbhub-readonly.toml

codex mcp get database-readonly
```

Antigravity dùng cùng command trong global `~/.gemini/config/mcp_config.json`. `--config` phải trỏ tới file local ngoài repository và entry phải giữ `disabled: true` cho đến khi read-only DB role được xác nhận

```json
{
  "mcpServers": {
    "database-readonly": {
      "command": "npx",
      "args": [
        "-y",
        "@bytebase/dbhub@latest",
        "--transport",
        "stdio",
        "--config",
        "/absolute/path/to/dbhub-readonly.toml"
      ],
      "disabled": true
    }
  }
}
```

Trên Windows thay config path bằng dạng `C:/Users/<USER>/...` và dùng tài khoản database read-only thật

`readonly = true` chỉ là safety net. DB account phải bị revoke quyền INSERT, UPDATE, DELETE, DDL, procedure mutation và quyền chuyển role. Với production, ưu tiên replica hoặc reporting database.

Smoke test chỉ được phép:

- Liệt kê schema/table trong scope
- Chạy `SELECT 1`
- Đọc metadata hoặc aggregate nhỏ có `LIMIT`
- Xác nhận một câu lệnh write bị từ chối bằng static capability inspection, không gửi write vào production

DBHub: <https://github.com/bytebase/dbhub>

## MongoDB

Dùng MCP server chính chủ của MongoDB với `--readOnly` và database user chỉ có read role. Server cần connection string hoặc Atlas service credential trước khi khởi động; không chạy command MCP trống credential rồi kết luận skill lỗi.

Tạo một launcher local được giới hạn quyền, đọc credential từ secret file ngoài repository rồi thực thi:

```bash
codex mcp add mongodb-readonly -- /absolute/path/start-mongodb-mcp-readonly
```

Launcher chỉ được export `MDB_MCP_CONNECTION_STRING` từ keychain, secret manager hoặc file local `chmod 600`, sau đó chạy `npx -y mongodb-mcp-server@latest --readOnly`. Không ghi connection string vào Markdown, Git hoặc command argument. Có thể bật thêm index check và giới hạn document để tránh collection scan hoặc trả dữ liệu quá lớn.

MongoDB MCP: <https://github.com/mongodb-js/mongodb-mcp-server>

## Chẩn đoán

```bash
bash integration/github/scripts/doctor-stack.sh --agent=codex database-readonly
bash integration/github/scripts/doctor-stack.sh --agent=antigravity database-readonly
```

Nếu chưa biết engine hoặc chưa có read-only account, kết quả phải là `BLOCKED` với đúng input còn thiếu, không chọn một MCP hoặc credential ngẫu nhiên.
