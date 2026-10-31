# Cài GitHub MCP cho Claude Code sau khi clone

## Mục lục

1. Phân biệt SSH và GitHub MCP
2. Clone repository
3. Cài bằng PAT an toàn
4. Kiểm tra sau cài đặt
5. Kiểm tra CI/CD
6. Dùng OAuth thay PAT
7. Đổi tài khoản cá nhân và công ty
8. Gỡ hoặc sửa cấu hình
9. Xử lý lỗi

## 1. Phân biệt SSH và GitHub MCP

- SSH key xác thực các lệnh Git như `clone`, `fetch`, `pull`, và `push`
- GitHub MCP gọi GitHub API nên cần OAuth hoặc PAT riêng, hoàn toàn độc lập với SSH key
- Git identity (`user.name`, `user.email`), SSH account, và MCP account có thể là ba cấu hình khác nhau
- Endpoint `/mcp/x/all` bật toàn bộ toolset MCP, nhưng quyền thực tế vẫn bị giới hạn bởi account, scope, organization policy, SSO, ruleset, và branch protection

Tài liệu chính chủ:

- [GitHub MCP remote server và endpoint all](https://github.com/github/github-mcp-server/blob/main/docs/remote-server.md)
- [Thiết lập và xác thực GitHub MCP](https://docs.github.com/en/copilot/how-tos/provide-context/use-mcp-in-your-ide/set-up-the-github-mcp-server)
- [Claude Code MCP reference](https://docs.claude.com/en/docs/claude-code/mcp)

## 2. Clone repository

Dùng SSH nếu key GitHub đã sẵn sàng:

```bash
git clone git@github.com:tqphong02/QA-skill.git
cd QA-skill
```

Dùng HTTPS nếu chỉ cần clone repository public:

```bash
git clone https://github.com/tqphong02/QA-skill.git
cd QA-skill
```

Kiểm tra Claude Code:

```bash
claude --version
claude mcp list
```

## 3. Cài bằng PAT an toàn

PAT là đường cài đặt ổn định nhất cho Claude Code vì không phụ thuộc một flow OAuth cụ thể của CLI. Không ghi token vào repository, `settings.json`, hoặc command argument hiển thị trong lịch sử shell.

```bash
read -s "GITHUB_PAT_TOKEN?Paste GitHub PAT rồi nhấn Enter: "
export GITHUB_PAT_TOKEN
echo
```

Thêm server remote dùng HTTP transport và bearer token từ biến môi trường (không hard-code token trong lệnh):

```bash
claude mcp add --transport http github https://api.githubcopilot.com/mcp/ \
  --header "Authorization: Bearer ${GITHUB_PAT_TOKEN}"
```

Dùng `claude mcp add --scope project` khi muốn giới hạn cấu hình trong một project cụ thể thay vì toàn user. Mở Claude Code từ cùng shell đã `export` để process kế thừa `GITHUB_PAT_TOKEN`.

## 4. Kiểm tra sau cài đặt

```bash
./../scripts/doctor.sh
claude mcp list
claude mcp get github
```

Kết quả cần có:

- Server tên `github`
- Transport HTTP tới `https://api.githubcopilot.com/mcp/`
- Trạng thái kết nối thành công, không báo thiếu đăng nhập

Khởi động lại phiên Claude Code hoặc mở conversation mới để tool mới được nạp. Thử yêu cầu chỉ đọc trước:

```text
Dùng GitHub MCP xác nhận account hiện tại và liệt kê workflow của tqphong02/QA-skill, không thay đổi gì
```

Sau khi xác nhận đúng account và repository, thử một yêu cầu write có phạm vi nhỏ trên branch riêng.

## 5. Kiểm tra CI/CD

Để tạo và vận hành pipeline QA:

1. Đọc `.github/workflows/` và quy ước repository
2. Tạo hoặc sửa workflow trên branch riêng
3. Validate YAML và chạy test liên quan tại local
4. Commit và push bằng Git/SSH hoặc mở PR qua MCP
5. Dùng GitHub MCP đọc workflow run, job, log và artifact
6. Chỉ rerun, cancel, dispatch, approve deployment, hoặc đổi permission khi người dùng yêu cầu rõ

Với fine-grained PAT, nhóm quyền thường cần cho QA CI/CD là:

- Metadata: read
- Contents: read/write
- Workflows: read/write
- Actions: read/write
- Pull requests: read/write
- Issues: read/write nếu workflow quản lý issue

Chỉ thêm Administration, Secrets, Environments, Deployments, code security, hoặc organization permissions khi use case thực sự cần. Xem [bảng quyền fine-grained PAT chính thức](https://docs.github.com/en/rest/authentication/permissions-required-for-fine-grained-personal-access-tokens).

## 6. Dùng OAuth thay PAT

Nếu phiên bản Claude Code đang dùng hỗ trợ OAuth cho MCP remote server, chạy lệnh thêm server không kèm `--header` và làm theo flow đăng nhập trình duyệt mà CLI mở ra:

```bash
claude mcp add --transport http github https://api.githubcopilot.com/mcp/
```

Nếu CLI báo lỗi OAuth hoặc không mở được browser (môi trường headless, remote, sandbox), quay lại PAT ở Mục 3 — đây là phương án ổn định hơn cho hầu hết môi trường chạy agent.

## 7. Đổi tài khoản cá nhân và công ty

### Đổi account GitHub MCP

```bash
claude mcp remove github
export GITHUB_PAT_TOKEN=<pat-của-account-khác>
claude mcp add --transport http github https://api.githubcopilot.com/mcp/ \
  --header "Authorization: Bearer ${GITHUB_PAT_TOKEN}"
```

Mở conversation Claude Code mới sau khi đổi để tool state được nạp lại.

### Tách account Git qua SSH

Ví dụ `~/.ssh/config`:

```sshconfig
Host github-personal
    HostName github.com
    User git
    IdentityFile ~/.ssh/id_ed25519_personal
    IdentitiesOnly yes

Host github-company
    HostName github.com
    User git
    IdentityFile ~/.ssh/id_ed25519_company
    IdentitiesOnly yes
```

Remote cá nhân:

```bash
git remote set-url origin git@github-personal:tqphong02/QA-skill.git
```

Remote công ty:

```bash
git remote set-url origin git@github-company:COMPANY/REPOSITORY.git
```

Kiểm tra trước push:

```bash
git remote -v
ssh -T git@github-personal
ssh -T git@github-company
```

Tham khảo [quản lý nhiều GitHub account bằng SSH](https://docs.github.com/en/account-and-profile/how-tos/account-management/managing-multiple-accounts).

## 8. Gỡ hoặc sửa cấu hình

Xem cấu hình:

```bash
claude mcp get github
```

Gỡ hoàn toàn:

```bash
claude mcp remove github
```

Thêm lại với endpoint hoặc scope khác bằng cách lặp lại Mục 3.

## 9. Xử lý lỗi

### `claude mcp list` không thấy server vừa thêm

Kiểm tra `--scope` đã dùng lúc `add` (user vs project) có khớp với scope đang xem không; chạy `claude mcp list` trong đúng thư mục project nếu dùng `--scope project`.

### MCP có tools nhưng write bị từ chối

Kiểm tra account đang login, PAT permission/OAuth scope, SSO authorization, repository role, branch protection, ruleset, và organization policy — không giả định đây là lỗi cấu hình MCP.

### Chỉ thấy toolset mặc định

```bash
claude mcp get github
```

URL phải là `/mcp/` hoặc một endpoint `/mcp/x/<toolset>` có chủ đích. Nếu khác, `claude mcp remove github` rồi thêm lại với endpoint đúng.

### Token hết hạn hoặc bị thu hồi

Triệu chứng: tool trả lỗi 401/403 dù trước đó hoạt động bình thường. Tạo PAT mới, `export` lại biến môi trường, và chạy lại lệnh `claude mcp add` ở Mục 3 — không tái sử dụng session cũ với token cũ.

GitHub CLI (`gh`) không phụ thuộc Claude Code MCP; vẫn dùng được để theo dõi CI và đọc workflow run trong khi chẩn đoán MCP.
