# Cài GitHub MCP cho Codex sau khi clone

## Mục lục

1. Phân biệt SSH và GitHub MCP
2. Clone repository
3. Cài bằng OAuth
4. Kiểm tra sau cài đặt
5. Kiểm tra CI/CD
6. Dùng PAT thay OAuth
7. Đổi tài khoản cá nhân và công ty
8. Gỡ hoặc sửa cấu hình
9. Xử lý lỗi

## 1. Phân biệt SSH và GitHub MCP

- SSH key xác thực các lệnh Git như `clone`, `fetch`, `pull`, và `push`
- GitHub MCP gọi GitHub API nên cần OAuth hoặc PAT riêng
- Git identity (`user.name`, `user.email`), SSH account, và MCP account có thể là ba cấu hình khác nhau
- Endpoint `/mcp/x/all` bật toàn bộ toolset MCP, nhưng quyền thực tế vẫn bị giới hạn bởi account, scope, organization policy, SSO, ruleset, và branch protection

Tài liệu chính chủ:

- [GitHub MCP remote server và endpoint all](https://github.com/github/github-mcp-server/blob/main/docs/remote-server.md)
- [Thiết lập và xác thực GitHub MCP](https://docs.github.com/en/copilot/how-tos/provide-context/use-mcp-in-your-ide/set-up-the-github-mcp-server)

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

Kiểm tra Codex:

```bash
codex --version
codex mcp list
```

## 3. Cài bằng OAuth

### macOS, Linux và WSL

Xem trước hành động:

```bash
./github-mcp-qa/scripts/install-codex.sh --dry-run --login
```

Cấu hình và mở đăng nhập OAuth:

```bash
./github-mcp-qa/scripts/install-codex.sh --login
```

Trong trình duyệt:

1. Kiểm tra đúng GitHub account cá nhân hoặc công ty
2. Đọc các scope GitHub yêu cầu
3. Chỉ approve organization cần dùng
4. Hoàn tất rồi quay lại Terminal

### Windows PowerShell

```powershell
codex mcp add github --url https://api.githubcopilot.com/mcp/x/all
codex mcp login github
codex mcp get github
```

Không commit file credential hoặc token sinh ra bởi máy người dùng.

## 4. Kiểm tra sau cài đặt

```bash
./github-mcp-qa/scripts/doctor.sh
codex mcp list
```

Kết quả cần có:

- Server tên `github`
- Transport `streamable_http`
- URL `https://api.githubcopilot.com/mcp/x/all`
- Auth không báo thiếu đăng nhập

Khởi động lại Codex hoặc mở thread mới. Thử yêu cầu chỉ đọc trước:

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

## 6. Dùng PAT thay OAuth

PAT phù hợp với CI, môi trường không mở được browser, hoặc máy bị chặn OAuth. Ưu tiên fine-grained PAT giới hạn theo repository.

Không paste token vào chat, Git config, `config.toml`, source code, hoặc file trong repository. Đặt token vào secret manager hoặc environment variable của phiên làm việc:

```bash
export GITHUB_MCP_PAT="github_pat_xxx"
codex mcp remove github
codex mcp add github \
  --url https://api.githubcopilot.com/mcp/x/all \
  --bearer-token-env-var GITHUB_MCP_PAT
codex mcp get github
```

Codex app khởi chạy từ GUI có thể không nhận environment variable của Terminal. Trong trường hợp đó, dùng OAuth hoặc cơ chế quản lý environment của hệ điều hành/doanh nghiệp; không ghi PAT plaintext vào repository.

## 7. Đổi tài khoản cá nhân và công ty

### Đổi account GitHub MCP

```bash
codex mcp logout github
codex mcp login github
```

Chọn đúng account ở trình duyệt và mở thread Codex mới sau login.

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
codex mcp get github
```

Đổi endpoint hiện có sang all toolsets:

```bash
./github-mcp-qa/scripts/install-codex.sh --replace --login
```

Đăng xuất nhưng giữ server:

```bash
codex mcp logout github
```

Gỡ hoàn toàn:

```bash
codex mcp remove github
```

## 9. Xử lý lỗi

### `Operation not permitted` khi ghi `~/.codex`

Chạy lệnh trong Terminal của chính người dùng, kiểm tra quyền thư mục `~/.codex`, hoặc liên hệ quản trị viên nếu máy có managed policy.

### `Could not resolve hostname github.com`

Đây là lỗi DNS/network, không phải sai SSH key. Kiểm tra VPN, proxy, DNS doanh nghiệp, rồi thử:

```bash
ssh -T git@github.com
```

### MCP có tools nhưng write bị từ chối

Kiểm tra account đang login, OAuth scope/PAT permission, SSO authorization, repository role, branch protection, ruleset, và organization policy.

### Chỉ thấy toolset mặc định

```bash
codex mcp get github
```

URL phải kết thúc bằng `/mcp/x/all`. Nếu khác, chạy script với `--replace`.
