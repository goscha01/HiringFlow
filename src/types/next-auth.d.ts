import 'next-auth'

declare module 'next-auth' {
  interface User {
    id: string
    email: string
    workspaceId?: string
    workspaceName?: string
    role?: string
  }

  interface Session {
    user: User & {
      workspaceId: string
      workspaceName: string
      role: string
    }
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string
    workspaceId?: string
    workspaceName?: string
    role?: string
  }
}
