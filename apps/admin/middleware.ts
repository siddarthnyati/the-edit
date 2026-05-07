import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Vercel Hobby has no built-in password protection. This middleware
// gates every page + API route with HTTP Basic Auth using credentials
// from env vars. Single user (you), single deploy. Browser remembers
// the credentials per session.

export function middleware(request: NextRequest) {
  const auth = request.headers.get('authorization');
  const expectedUser = process.env.ADMIN_USERNAME ?? 'admin';
  const expectedPass = process.env.ADMIN_PASSWORD;

  if (!expectedPass) {
    return new NextResponse('ADMIN_PASSWORD env var not set', { status: 500 });
  }

  if (auth) {
    const [scheme, encoded] = auth.split(' ');
    if (scheme === 'Basic' && encoded) {
      const decoded = Buffer.from(encoded, 'base64').toString();
      const [user, pass] = decoded.split(':');
      if (user === expectedUser && pass === expectedPass) {
        return NextResponse.next();
      }
    }
  }

  return new NextResponse('Authentication required', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="the-edit admin"' },
  });
}

export const config = {
  // Run on every page + API route; skip Next internals and static assets
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
