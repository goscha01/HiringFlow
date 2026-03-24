import { withAuth } from 'next-auth/middleware'
import { NextResponse } from 'next/server'

export default withAuth(
  function middleware(req) {
    return NextResponse.next()
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        // Allow public routes
        if (req.nextUrl.pathname.startsWith('/f/')) return true
        if (req.nextUrl.pathname.startsWith('/api/public/')) return true
        if (req.nextUrl.pathname === '/login') return true
        if (req.nextUrl.pathname.startsWith('/uploads/')) return true

        // Require auth for admin routes
        if (req.nextUrl.pathname.startsWith('/admin')) {
          return !!token
        }

        // Require auth for protected API routes
        if (req.nextUrl.pathname.startsWith('/api/')) {
          if (req.nextUrl.pathname.startsWith('/api/auth/')) return true
          if (req.nextUrl.pathname.startsWith('/api/uploads/')) return true
          return !!token
        }

        return true
      },
    },
  }
)

export const config = {
  matcher: ['/admin/:path*', '/api/:path*', '/f/:path*'],
}
