import { getServerSession } from 'next-auth';

export async function GET(request) {
  return Response.json({ products: [] });
}

export async function POST(request) {
  const session = await getServerSession();
  if (!session) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const body = await request.json();
  return Response.json({ created: true }, { status: 201 });
}
