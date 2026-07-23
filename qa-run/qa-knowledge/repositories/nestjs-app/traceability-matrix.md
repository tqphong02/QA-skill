# Traceability Matrix: nestjs-app

> Sinh tự động bởi `traceability-matrix-generator.mjs` — 2026-07-23T16:35:26.759Z  
> Dùng file này để đảm bảo mọi business flow đều có testcase tương ứng

---

## Flow → Rule → API → Entity → Testcase Hints

| Flow ID | Flow Name | Module | Rules | APIs | Entities | Test Hints | Confidence |
|:---|:---|:---|:---|:---|:---|:---|:---:|
`ORDER_GET_5D2B12D8` | GET / (Roles) | order | PERMISSION_BF426B<br>PERMISSION_203CBC<br>PERMISSION_3B47B5 | `GET /orders`<br>`GET /orders/:id`<br>`POST /orders` | Order | Happy path: request hợp lệ → response 2xx | Auth: request không có token → 401,  | ✅
`ORDER_GET_00D87662` | GET :id (findOne) | order | PERMISSION_BF426B<br>PERMISSION_203CBC<br>PERMISSION_3B47B5 | `GET /orders`<br>`GET /orders/:id`<br>`POST /orders` | Order | Happy path: request hợp lệ → response 2xx | Auth: request không có token → 401,  | ✅
`ORDER_POST_002B0614` | POST / (create) | order | PERMISSION_BF426B<br>PERMISSION_203CBC<br>PERMISSION_3B47B5 | `GET /orders`<br>`GET /orders/:id`<br>`POST /orders` | Order | Happy path: request hợp lệ → response 2xx | Auth: request không có token → 401,  | ✅
`ORDER_PUT_A9162DD5` | PUT :id/approve (Roles) | order | PERMISSION_BF426B<br>PERMISSION_203CBC<br>PERMISSION_3B47B5 | `GET /orders`<br>`GET /orders/:id`<br>`POST /orders` | Order | Happy path: request hợp lệ → response 2xx | Auth: request không có token → 401,  | ✅
`ORDER_DELETE_24A6ECB2` | DELETE :id (Roles) | order | PERMISSION_BF426B<br>PERMISSION_203CBC<br>PERMISSION_3B47B5 | `GET /orders`<br>`GET /orders/:id`<br>`POST /orders` | Order | Happy path: request hợp lệ → response 2xx | Auth: request không có token → 401,  | ✅

---

## Orphan Business Rules (không gắn với flow nào)

> Các rule này tồn tại trong code nhưng chưa được ánh xạ vào flow — cần bổ sung testcase riêng

| Rule ID | Module | Category | Condition | Failure |
|:---|:---|:---|:---|:---|
| _Tất cả rules đã được ánh xạ_ | | | | |

---

## Coverage Summary

| Metric | Count |
|:---|:---:|
| Total flows | 5 |
| Flows với rules | 5 |
| Flows với APIs | 5 |
| Flows với entities | 5 |
| Orphan rules | 0 |
| Total testcase hints | 13 |

---

_Cập nhật lại: `node qa-run/scripts/repo-business-discovery.mjs --repo <path> --mode full`_
