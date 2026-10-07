import { CheckIcon, CircleAlertIcon, InfoIcon, LoaderCircleIcon, PencilIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Catalogo, Erro } from '@/api/tipos'
import { LOCAL_PROPRIO, NOME_LOCAL_PROPRIO } from '@/componentes/FormularioReservaAmbiente'
import { Button } from '@/components/ui/button'
import { formatarData } from '@/lib/datas'
import type { Valores } from '@/paginas/FormularioReserva'

export type EstadoAoVivo =
  | { tipo: 'ocioso' }
  | { tipo: 'verificando' }
  | { tipo: 'pronto'; erros: Erro[] }
  | { tipo: 'falha'; mensagem: string }

const diaSemanaCurto = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', timeZone: 'UTC' })

/** `qui 08/10 · 09:00–10:00`. */
function formatarPeriodoCurto(p: Valores['periodos'][number]): string {
  const semana = diaSemanaCurto.format(new Date(`${p.data}T12:00:00Z`)).replace('.', '')
  return `${semana} ${formatarData(p.data)} · ${p.inicio}–${p.termino}`
}

/** Resultado da validação no servidor (dry-run) em uma linha; `detalhado` lista os problemas. */
export function StatusDisponibilidade({ aoVivo, detalhado = false }: { aoVivo: EstadoAoVivo; detalhado?: boolean }) {
  const linha = 'flex items-start gap-1.5'
  const icone = 'mt-0.5 size-4 shrink-0'
  if (aoVivo.tipo === 'ocioso') {
    return (
      <p className={`${linha} text-muted-foreground`}>
        <InfoIcon aria-hidden="true" className={icone} />
        Disponibilidade ainda não verificada: escolha o ambiente e preencha os períodos.
      </p>
    )
  }
  if (aoVivo.tipo === 'verificando') {
    return (
      <p className={linha}>
        <LoaderCircleIcon aria-hidden="true" className={`${icone} animate-spin`} />
        Verificando disponibilidade…
      </p>
    )
  }
  if (aoVivo.tipo === 'falha') {
    return (
      <p className={linha}>
        <CircleAlertIcon aria-hidden="true" className={icone} />
        Não foi possível verificar a disponibilidade agora: {aoVivo.mensagem}
      </p>
    )
  }
  if (!aoVivo.erros.length) {
    return (
      <p className={`${linha} font-medium text-sucesso`}>
        <CheckIcon aria-hidden="true" className={icone} />
        Disponível: nenhum conflito nos períodos informados.
      </p>
    )
  }
  return (
    <div className="space-y-1">
      <p className={`${linha} font-medium text-destructive`}>
        <CircleAlertIcon aria-hidden="true" className={icone} />
        Indisponível: {aoVivo.erros.length === 1 ? '1 problema' : `${aoVivo.erros.length} problemas`}.
      </p>
      {detalhado && (
        <ul className="list-disc space-y-1 pl-6">
          {aoVivo.erros.map((e, n) => (
            <li key={n}>
              {e.mensagem}
              {e.sugestao && ` Sugestão: ${e.sugestao}.`}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

interface Props {
  catalogo: Catalogo
  valores: Valores
  /** Na revisão (etapa 4): cada seção ganha "Editar" e os recursos aparecem um a um. */
  aoEditar?: (etapa: number) => void
}

/** O que já foi preenchido, por seção: card lateral (desktop) e etapa "Revisar e enviar". */
export function ResumoReserva({ catalogo, valores, aoEditar }: Props) {
  const vazio = <span className="text-muted-foreground">Não informado</span>
  const localProprio = valores.ambiente === LOCAL_PROPRIO
  const ambiente = localProprio ? NOME_LOCAL_PROPRIO : catalogo.ambientes.find((a) => a.id === valores.ambiente)?.desc
  const periodos = valores.periodos.filter((p) => p.data && p.inicio && p.termino)
  const recursos = valores.recursos.map((i) => {
    const r = catalogo.recursos.find((x) => x.id === i.recursoId)
    return r?.limitado ? `${r.desc} (${i.qtd})` : (r?.desc ?? i.recursoId)
  })
  const listaPeriodos = periodos.length ? (
    <ul>
      {periodos.map((p, n) => (
        <li key={n}>{formatarPeriodoCurto(p)}</li>
      ))}
    </ul>
  ) : (
    vazio
  )
  let listaRecursos: ReactNode = recursos.length === 1 ? '1 recurso' : `${recursos.length} recursos`
  if (!recursos.length) listaRecursos = 'Nenhum recurso'
  else if (aoEditar) {
    listaRecursos = (
      <ul>
        {recursos.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
    )
  }

  const secoes: { titulo: string; etapa: number; itens: [string, ReactNode][] }[] = [
    {
      titulo: 'Onde e quando',
      etapa: 0,
      itens: [
        ['Ambiente', ambiente ?? vazio],
        ...(localProprio ? [['Local', valores.complemento.trim() || vazio] as [string, ReactNode]] : []),
        ['Períodos', listaPeriodos],
      ],
    },
    {
      titulo: 'Detalhes',
      etapa: 1,
      itens: [
        ['Finalidade', valores.finalidade.trim() || vazio],
        ['Participantes', valores.participantes.trim() || vazio],
        ['Disposição', catalogo.disposicoes.find((d) => d.id === valores.disposicaoId)?.desc ?? 'Sem preferência'],
      ],
    },
    {
      titulo: 'Recursos',
      etapa: 2,
      itens: [
        ['Recursos', listaRecursos],
      ],
    },
  ]

  return (
    <div className="space-y-4">
      {secoes.map((s) => (
        <section key={s.titulo} aria-labelledby={`resumo-${s.etapa}${aoEditar ? '-revisao' : ''}`} className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-x-3">
            <h3 id={`resumo-${s.etapa}${aoEditar ? '-revisao' : ''}`} className="font-semibold text-titulo-card">
              {s.titulo}
            </h3>
            {aoEditar && (
              <Button type="button" variant="link" className="h-11 px-0 text-link sm:h-8" onClick={() => aoEditar(s.etapa)}>
                <PencilIcon aria-hidden="true" />
                Editar<span className="sr-only"> {s.titulo.toLowerCase()}</span>
              </Button>
            )}
          </div>
          <dl className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm">
            {s.itens.map(([termo, valor]) => (
              <div key={termo} className="contents">
                <dt className="text-muted-foreground">{termo}</dt>
                <dd className="break-words">{valor}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  )
}
