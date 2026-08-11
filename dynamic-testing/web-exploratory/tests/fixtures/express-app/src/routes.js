const express = require('express');
const router = express.Router();

function authenticate(req, res, next) {
  if (!req.headers.authorization) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.user || req.user.role !== role) {
      throw new Error('Insufficient permissions');
    }
    next();
  };
}

router.get('/products', (req, res) => {
  res.json({ products: [] });
});

router.get('/products/:id', authenticate, (req, res) => {
  const product = db.find(req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found' });
  res.json(product);
});

router.post('/products', authenticate, requireRole('admin'), (req, res) => {
  const existing = db.findByCode(req.body.code);
  if (existing) return res.status(409).json({ error: 'Product code already exists' });
  const product = db.create(req.body);
  res.status(201).json(product);
});

router.put('/products/:id', authenticate, (req, res) => {
  res.json({ updated: true });
});

router.delete('/products/:id', authenticate, requireRole('admin'), (req, res) => {
  res.status(204).send();
});

module.exports = router;
