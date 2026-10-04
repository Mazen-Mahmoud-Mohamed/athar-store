import type { ReactNode } from 'react'

type AdminEmptyStateProps = {
  title: string
  description?: string
  action?: ReactNode
}

export function AdminEmptyState({ title, description, action }: AdminEmptyStateProps) {
  return (
    <div className="rounded-xl border border-dashed border-taupe/50 bg-card/60 px-6 py-12 text-center">
      <p className="font-display text-lg font-semibold text-brown">{title}</p>
      {description ? <p className="mx-auto mt-2 max-w-md text-sm text-mocha">{description}</p> : null}
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  )
}
