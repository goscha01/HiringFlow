import 'next-auth'

declare module 'next-auth' {
  interface User {
    id: string
    email: string
    isSuperAdmin?: boolean
    workspaceId?: string
    workspaceName?: string
    role?: string
  }

  interface Session {
    user: User & {
      isSuperAdmin: boolean
      workspaceId: string
      workspaceName: string
      role: string
    }
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string
    isSuperAdmin?: boolean
    workspaceId?: string
    workspaceName?: string
    role?: string
  }
}
