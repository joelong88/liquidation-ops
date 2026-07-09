import { LoginForm } from '@/app/login/login-form'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const { next } = await searchParams

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
      <div className="flex flex-col items-center gap-1 text-center">
        <h1 className="text-lg font-semibold text-neutral-900">Liquidation Ops</h1>
        <p className="text-sm text-neutral-500">Sign in to continue</p>
      </div>
      <LoginForm next={next ?? '/dashboard'} />
    </main>
  )
}
