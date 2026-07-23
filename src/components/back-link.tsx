import Link from 'next/link'

export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex w-fit items-center gap-1 text-sm text-neutral-500 hover:text-neutral-900"
    >
      ← {label}
    </Link>
  )
}
