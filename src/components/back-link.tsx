import Link from 'next/link'

export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex w-fit items-center gap-1 text-lg font-medium text-neutral-600 hover:text-neutral-900"
    >
      ← {label}
    </Link>
  )
}
