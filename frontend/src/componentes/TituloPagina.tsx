import { useEffect } from 'react'
import { cn } from '@/lib/utils'

/**
 * `<h1>` único da página. Define o `document.title` ("<texto> — SISGARES") e recebe o foco
 * quando a rota muda (o Layout procura `main h1`), por isso tem `tabIndex={-1}`.
 */
export function TituloPagina({ children, className }: { children: string; className?: string }) {
  useEffect(() => {
    document.title = `${children} — SISGARES`
  }, [children])
  return (
    <h1 tabIndex={-1} className={cn('scroll-mt-4 text-2xl font-semibold tracking-tight', className)}>
      {children}
    </h1>
  )
}
