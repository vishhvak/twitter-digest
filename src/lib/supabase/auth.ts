import { createClient } from './server'

export async function requireAuth(): Promise<{ authenticated: boolean; userId?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { authenticated: false }
  return { authenticated: true, userId: user.id }
}
