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
    <h1 tabIndex={-1} className={cn('faixa-pagina mb-6 scroll-mt-4 bg-faixa py-6 text-3xl font-normal break-words', className)}>
      {children}
    </h1>
  )
}
