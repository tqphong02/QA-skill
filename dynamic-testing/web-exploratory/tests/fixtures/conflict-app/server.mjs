import http from 'node:http';

const html = `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <title>Conflict App Order Detail</title>
  <style>
    body { font-family: sans-serif; padding: 20px; }
    .badge { background: #e0e0e0; padding: 4px 8px; border-radius: 4px; }
    .btn { padding: 8px 16px; margin-right: 8px; cursor: pointer; }
    .btn-primary { background: #007bff; color: white; border: none; }
    .btn-danger { background: #dc3545; color: white; border: none; }
    .required { color: red; }
    .sidebar { background: #f8f9fa; padding: 15px; width: 200px; }
    .alert-success { background: #d4edda; color: #155724; padding: 10px; margin-top: 10px; }
  </style>
</head>
<body>
  <div class="user-role">Role: Staff</div>
  <div class="sidebar">
    <nav>
      <a href="/orders" class="menu-item">Orders</a>
      <a href="/settings/payment" class="menu-item">Payment Settings</a>
    </nav>
  </div>

  <main>
    <h1>Order Detail #ORD-1001</h1>
    <span class="badge status" id="order-status">DRAFT</span>

    <div class="toolbar" style="margin: 20px 0;">
      <!-- Bug 1: Staff sees Approve button -->
      <button id="approve" class="btn btn-primary">Approve</button>
      <!-- Bug 4: Save Draft and Submit -->
      <button id="save-draft" class="btn">Save Draft</button>
      <button id="submit" class="btn btn-primary">Submit</button>
      <!-- Bug 6: UI shows success but API returns 500 / status remains DRAFT -->
      <button id="submit-error" class="btn btn-primary">Submit Order Error</button>
      <!-- Bug 3: Delete without confirm modal -->
      <button id="delete" class="btn btn-danger">Delete</button>
      <button id="cancel" class="btn">Cancel</button>
    </div>

    <div id="toast-message" style="display: none;" class="alert-success">Submit Order Successfully!</div>

    <form id="order-form">
      <div class="form-group">
        <!-- Bug 2: Amount required in UI but optional in doc -->
        <label for="amount">Amount <span class="required">*</span></label>
        <input type="number" id="amount" name="amount" required value="-500" />
      </div>

      <div class="form-group">
        <!-- Bug 5: Status direct select -->
        <label for="status">Status</label>
        <select id="status" name="status">
          <option value="DRAFT">DRAFT</option>
          <option value="SUBMITTED">SUBMITTED</option>
          <option value="APPROVED">APPROVED</option>
          <option value="COMPLETED">COMPLETED</option>
        </select>
      </div>
    </form>
  </main>

  <script>
    document.getElementById('approve').onclick = () => alert('Approved');
    document.getElementById('save-draft').onclick = () => fetch('/api/save', { method: 'POST' });
    document.getElementById('submit').onclick = () => fetch('/api/save', { method: 'POST' });
    document.getElementById('submit-error').onclick = async () => {
      document.getElementById('toast-message').style.display = 'block';
      try {
        await fetch('/api/submit-error', { method: 'POST' });
      } catch (e) {}
    };
    document.getElementById('delete').onclick = () => fetch('/api/delete', { method: 'DELETE' });
  </script>
</body>
</html>`;

export function startConflictServer(port = 0) {
  const server = http.createServer((req, res) => {
    if (req.url === '/api/save') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true, status: 'SAVED' }));
    }
    if (req.url === '/api/submit-error') {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Internal Server Error', status: 'DRAFT' }));
    }
    if (req.url === '/api/delete') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true, deleted: true }));
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  });

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      const boundPort = server.address().port;
      server.unref(); // Ensure server doesn't block Node event loop from exiting
      resolve({ server, port: boundPort });
    });
  });
}

if (process.argv[1]?.endsWith('server.mjs')) {
  startConflictServer(9876).then(({ port }) => {
    console.log(`Conflict App server running on http://localhost:${port}`);
  });
}
