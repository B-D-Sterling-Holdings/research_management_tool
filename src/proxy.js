import { NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth';

export async function proxy(request) {
  const { pathname } = request.nextUrl;

  // Only protect API routes (pages are protected client-side)
  if (!pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  // Allow auth endpoints
  if (pathname.startsWith('/api/auth/')) {
    return NextResponse.next();
  }

  // Check Authorization header
  const authHeader = request.headers.get('Authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const session = await verifySession(token);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/api/:path*'],
};
