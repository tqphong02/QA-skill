export default function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).json({ orders: [] });
  }
  if (req.method === 'POST') {
    const { amount } = req.body;
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }
    return res.status(201).json({ id: 'new-order' });
  }
  res.status(405).json({ error: 'Method not allowed' });
}
