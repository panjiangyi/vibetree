import { useState } from 'react'
import { LockKeyhole, Terminal } from 'lucide-react'
import { useAuthStore } from '../../stores/auth.store.js'

export function LoginScreen() {
  const login = useAuthStore((s) => s.login)
  const error = useAuthStore((s) => s.error)
  const isSubmitting = useAuthStore((s) => s.isSubmitting)

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    try {
      await login({ username, password })
      setPassword('')
    } catch {
      setPassword('')
    }
  }

  return (
    <div className="app-root">
      <div className="flex flex-1 items-center justify-center p-4">
        <div className="w-full max-w-md rounded-3xl border app-panel shadow-2xl">
          <div className="border-b p-8" style={{ borderColor: 'var(--color-border)' }}>
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl app-soft-info">
                <Terminal className="h-6 w-6 app-accent" />
              </div>
              <div>
                <h1 className="m-0 text-2xl font-semibold">VibeTree</h1>
                <p className="m-0 mt-1 text-sm app-muted">Sign in to access your workspace terminals.</p>
              </div>
            </div>
          </div>

          <form className="space-y-5 p-8" onSubmit={handleSubmit}>
            <label className="block text-sm font-medium">
              Username
              <input
                autoFocus
                autoComplete="username"
                className="app-input mt-2"
                disabled={isSubmitting}
                onChange={(event) => setUsername(event.target.value)}
                value={username}
              />
            </label>

            <label className="block text-sm font-medium">
              Password
              <input
                autoComplete="current-password"
                className="app-input mt-2"
                disabled={isSubmitting}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                value={password}
              />
            </label>

            {error && (
              <div className="rounded-xl border px-4 py-3 text-sm app-soft-danger app-danger" style={{ borderColor: 'var(--color-danger-soft)' }}>
                {error}
              </div>
            )}

            <button
              className="app-button-primary flex w-full items-center justify-center gap-2 py-3 text-sm font-medium"
              disabled={isSubmitting || username.trim().length === 0 || password.length === 0}
              type="submit"
            >
              <LockKeyhole className="h-4 w-4" />
              {isSubmitting ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
