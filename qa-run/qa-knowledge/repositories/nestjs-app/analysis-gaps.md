# Analysis Gaps: nestjs-app

> Sinh tự động bởi `repo-runtime-reconciler.mjs` — 2026-07-23T17:50:24.631Z  
> Runtime data: Chưa có (chạy baseline discovery để bổ sung)

## Reconciliation Summary

| Status | Count |
|:---|:---:|
| STATIC_ONLY | 18 |

## Gaps Cần Xử lý

### [MEDIUM] unobserved_api

5 API endpoints trong source code chưa được quan sát trong runtime

**Recommendation:** Chạy qa-run baseline discovery để observe các endpoint này

- `GET /orders`
- `GET /orders/:id`
- `POST /orders`
- `PUT /orders/:id/approve`
- `DELETE /orders/:id`



---
_Cập nhật lại: `node qa-run/scripts/repo-business-discovery.mjs --repo <path> --mode full`_
