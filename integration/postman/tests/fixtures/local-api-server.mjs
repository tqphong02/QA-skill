import http from 'node:http'

const port = Number(process.argv[2] || 18766)
const server = http.createServer((request, response) => {
  const status = request.url === '/health' ? 200 : 404
  response.writeHead(status, { 'content-type': 'application/json' })
  response.end(JSON.stringify({ ok: status === 200 }))
})

server.listen(port, '127.0.0.1', () => {
  process.stdout.write(`READY ${port}\n`)
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)))
}
