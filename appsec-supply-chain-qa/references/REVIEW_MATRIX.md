# AppSec and supply-chain review matrix

| Area | Local evidence | Limitation |
|---|---|---|
| Secret hygiene | redacted path, line and finding kind | regex is not a complete secret scanner |
| Dependencies | manifest and lockfile inventory | no registry or CVE lookup in local mode |
| SBOM | generator/config presence | presence does not prove SBOM accuracy |
| CI controls | security-job/config inventory | workflow execution needs CI evidence |
| License policy | policy/config presence | legal interpretation requires owner review |

All scanner alerts remain `Candidate` until reproduction and control comparison
