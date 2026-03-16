import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import MasterpromptBuilder from '@/components/MasterpromptBuilder'

export default async function BuilderPage() {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gray-900 flex items-center justify-center">
              <span className="text-white text-xs font-bold">TB</span>
            </div>
            <span className="text-lg font-semibold text-gray-900">ThinkBot</span>
          </div>
          <span className="text-xs text-gray-400">{user.email}</span>
        </div>
      </header>

      {/* Builder */}
      <main className="py-8">
        <MasterpromptBuilder />
      </main>
    </div>
  )
}
