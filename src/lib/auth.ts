import { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { prisma } from './prisma'
import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
          include: {
            memberships: {
              include: { workspace: true },
              orderBy: { joinedAt: 'asc' },
              take: 1,
            },
          },
        })

        if (!user) {
          return null
        }

        const isPasswordValid = await bcrypt.compare(
          credentials.password,
          user.passwordHash
        )

        if (!isPasswordValid) {
          return null
        }

        const membership = user.memberships[0]
        if (!membership) {
          return null
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name || user.email,
          workspaceId: membership.workspaceId,
          workspaceName: membership.workspace.name,
          role: membership.role,
        }
      },
    }),
  ],
  session: {
    strategy: 'jwt',
  },
  pages: {
    signIn: '/login',
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.workspaceId = (user as any).workspaceId
        token.workspaceName = (user as any).workspaceName
        token.role = (user as any).role
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
        ;(session.user as any).workspaceId = token.workspaceId as string
        ;(session.user as any).workspaceName = token.workspaceName as string
        ;(session.user as any).role = token.role as string
      }
      return session
    },
  },
}

/**
 * Get authenticated workspace session for admin API routes.
 * Returns { userId, workspaceId, role } or null if unauthorized.
 */
export async function getWorkspaceSession(): Promise<{
  userId: string
  workspaceId: string
  role: string
} | null> {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return null
  const workspaceId = (session.user as any).workspaceId as string | undefined
  if (!workspaceId) return null
  return {
    userId: session.user.id,
    workspaceId,
    role: (session.user as any).role || 'member',
  }
}

/**
 * Helper: return 401 response.
 */
export function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}
