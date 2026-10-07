import { CheckIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  nomes: readonly string[]
  /** Índice (0..n−1) da etapa atual. */
  atual: number
  /** Maior etapa já visitada: até ela o indicador é clicável. */
  visitada: number
  aoIr: (etapa: number) => void
}

/** Indicador de etapas do assistente de reserva. No mobile vira "Etapa 2 de 4 — Detalhes". */
export function IndicadorEtapas({ nomes, atual, visitada, aoIr }: Props) {
  return (
    <nav aria-label="Etapas da reserva">
      <p className="text-sm font-medium sm:hidden">
        Etapa {atual + 1} de {nomes.length} — {nomes[atual]}
      </p>
      <ol className="hidden gap-2 sm:grid sm:grid-cols-4">
        {nomes.map((nome, n) => {
          const estado = n === atual ? 'atual' : n < atual || n <= visitada ? 'concluida' : 'pendente'
          const conteudo = (
            <>
              <span
                aria-hidden="true"
                className={cn(
                  'flex size-7 shrink-0 items-center justify-center rounded-full border-2 text-sm font-semibold',
                  estado === 'atual' && 'border-primary bg-primary text-primary-foreground',
                  estado === 'concluida' && 'border-primary text-primary',
                  estado === 'pendente' && 'border-input text-muted-foreground',
                )}
              >
                {estado === 'concluida' && n !== atual ? <CheckIcon className="size-4" /> : n + 1}
              </span>
              <span className="min-w-0 text-left">
                <span className={cn('block text-sm leading-tight', estado === 'atual' ? 'font-semibold' : 'font-medium')}>
                  <span className="sr-only">Etapa {n + 1}: </span>
                  {nome}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {estado === 'atual' ? 'Atual' : estado === 'concluida' ? 'Concluída' : 'Pendente'}
                </span>
              </span>
            </>
          )
          const classe = 'flex min-h-11 w-full items-center gap-2 rounded-md px-2 py-1.5'
          return (
            <li key={nome} className={cn('border-b-4', estado === 'atual' ? 'border-primary' : 'border-border')}>
              {estado === 'atual' ? (
                <span aria-current="step" className={classe}>
                  {conteudo}
                </span>
              ) : n <= visitada ? (
                <button type="button" onClick={() => aoIr(n)} className={cn(classe, 'cursor-pointer hover:bg-card')}>
                  {conteudo}
                </button>
              ) : (
                <span className={classe}>{conteudo}</span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
