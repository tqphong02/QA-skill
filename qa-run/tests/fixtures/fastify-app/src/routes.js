async function invoiceRoutes(fastify, options) {
  fastify.get('/invoices', async (request, reply) => {
    return { invoices: [] };
  });

  fastify.get('/invoices/:id', async (request, reply) => {
    const invoice = await db.findById(request.params.id);
    if (!invoice) {
      return reply.status(404).send({ error: 'Invoice not found' });
    }
    return invoice;
  });

  fastify.post('/invoices', {
    preHandler: [fastify.authenticate],
    schema: {
      body: {
        type: 'object',
        required: ['amount', 'customerId'],
        properties: {
          amount: { type: 'number', minimum: 0 },
          customerId: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    if (request.body.amount <= 0) {
      throw new Error('Insufficient amount');
    }
    return reply.status(201).send({ id: 'new-invoice' });
  });

  fastify.put('/invoices/:id/pay', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const invoice = await db.findById(request.params.id);
    if (invoice.status !== 'PENDING') {
      throw new Error('Cannot pay invoice not in PENDING status');
    }
    invoice.status = 'PAID';
    return { paid: true };
  });
}

module.exports = invoiceRoutes;
