import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { JsonLd } from '@/components/seo/JsonLd'
import { PageMeta } from '@/components/seo/PageMeta'
import { breadcrumbSchema } from '@/lib/seoSchema'
import { cn } from '@/lib/utils'

type InfoPageShellProps = {
  title: string
  description: string
  path: string
  h1: string
  children: ReactNode
  className?: string
}

export function InfoPageShell({
  title,
  description,
  path,
  h1,
  children,
  className,
}: InfoPageShellProps) {
  const crumbs = [
    { name: 'الرئيسية', path: '/' },
    { name: h1, path },
  ]

  return (
    <>
      <PageMeta title={title} description={description} path={path} absoluteTitle />
      <JsonLd id={`breadcrumb-${path.replace(/\//g, '-')}`} data={breadcrumbSchema(crumbs)} />

      <div className={cn('container-athar py-10 sm:py-14', className)}>
        <nav aria-label="مسار التنقل" className="mb-6 text-sm text-mocha">
          <ol className="flex flex-wrap items-center gap-1.5">
            <li>
              <Link to="/" className="hover:text-brown">
                الرئيسية
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li className="text-brown" aria-current="page">
              {h1}
            </li>
          </ol>
        </nav>

        <article className="mx-auto max-w-3xl">
          <header className="mb-8 border-b border-taupe/25 pb-6">
            <p className="mb-2 text-xs tracking-[0.25em] text-gold-deep">أثر</p>
            <h1 className="font-display text-3xl font-semibold leading-snug text-brown sm:text-4xl">
              {h1}
            </h1>
          </header>
          <div className="space-y-6 text-sm leading-8 text-mocha sm:text-[15px] sm:leading-8">
            {children}
          </div>
        </article>
      </div>
    </>
  )
}
