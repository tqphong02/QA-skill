# JMeter generator config

## Root fields

| Field | Required | Meaning |
|---|---:|---|
| `name` | yes | Test Plan and Thread Group name |
| `base_url` | yes | Default HTTP or HTTPS origin, optional base path |
| `threads` | yes | Default concurrent virtual users, positive integer |
| `ramp_up_seconds` | yes | Time to start all threads |
| `loops` | conditional | Iterations per thread when duration is not used |
| `duration_seconds` | no | Scheduler duration; when positive it controls the run duration |
| `headers` | no | Global HTTP headers with non-secret values or `${PROPERTY}` references |
| `csv` | no | CSV file, variables, delimiter, recycle, stop-thread, share mode |
| `think_time_ms` | no | Constant pause after each request |
| `think_time_variation_ms` | no | Random pause variation |
| `requests` | yes | Ordered HTTP request list |

## Request fields

| Field | Required | Meaning |
|---|---:|---|
| `name` | yes | Sampler name |
| `method` | yes | GET, POST, PUT, PATCH, DELETE, HEAD, or OPTIONS |
| `path` | yes | Path beginning with `/`, query string allowed |
| `body` | no | String, object, or array sent as raw body |
| `headers` | no | Request-specific Header Manager |
| `expected_status` | yes | One exact HTTP status |
| `response_contains` | no | Literal response-body substring assertion |
| `timeout_ms` | no | Connect and response timeout |
| `json_extractors` | no | Native JSON post-processors for later `${variable}` use |

## JSON extractor

```json
{
  "name": "access_token",
  "json_path": "$.access_token",
  "match_number": 1,
  "default": "NOT_FOUND"
}
```

Define login before requests that reference `${access_token}`. A default of `NOT_FOUND` makes correlation failures visible in later requests.

## Parameter overrides

The `.jmx` accepts:

- `-JPROTOCOL=https`
- `-JHOST=staging.example.com`
- `-JPORT=443`
- `-JBASE_PATH=/gateway`
- `-JTHREADS=10`
- `-JRAMP_UP=30`
- `-JLOOPS=5`
- `-JDURATION=300`

Do not pass secrets on a shared command line when process arguments are visible. Use an approved secret injection mechanism.
