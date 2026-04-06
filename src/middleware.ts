import { withAuth } from 'next-auth/middleware'
import { NextResponse } from 'next/server'

export default withAuth(
  function middleware(req) {
    // Platform admin: require isSuperAdmin in token
    if (req.nextUrl.pathname.startsWith('/platform-admin')) {
      const token = req.nextauth?.token
      if (!token?.isSuperAdmin) {
        return NextResponse.redirect(new URL('/dashboard/flows', req.url))
      }
    }
    return NextResponse.next()
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        const path = req.nextUrl.pathname

        // Allow public routes
        if (path.startsWith('/f/')) return true
        if (path.startsWith('/a/')) return true
        if (path.startsWith('/t/')) return true
        if (path.startsWith('/schedule/')) return true
        if (path.startsWith('/call/')) return true
        if (path.startsWith('/api/public/')) return true
        if (path === '/') return true
        if (path === '/login') return true
        if (path === '/register') return true
        if (path.startsWith('/uploads/')) return true

        // Require auth for platform admin
        if (path.startsWith('/platform-admin')) {
          return !!token
        }

        // Require auth for dashboard routes
        if (path.startsWith('/dashboard')) {
          return !!token
        }

        // Require auth for protected API routes
        if (path.startsWith('/api/')) {
          if (path.startsWith('/api/auth/')) return true
          if (path.startsWith('/api/uploads/')) return true
          return !!token
        }

        return true
      },
    },
  }
)

export const config = {
  matcher: ['/', '/dashboard/:path*', '/platform-admin/:path*', '/api/:path*', '/f/:path*', '/a/:path*', '/t/:path*', '/schedule/:path*', '/call/:path*', '/register'],
}
