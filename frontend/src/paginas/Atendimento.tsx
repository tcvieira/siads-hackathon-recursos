import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { CardAtendimento, Catalogo, Periodo, StatusReserva } from '@/api/tipos'
import { useCatalogo, usePainelAtendimento } from '@/api/consultas'
import { TituloPagina } from '@/componentes/TituloPagina'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { diaDe, diasDaSemana, formatarData, formatarDiaSemana, formatarHora, hoje, inicioDoDia, somarDias } from '@/lib/datas'

/** R8: hoje + 7 dias. */
const DIAS = 8

const ROTULO_STATUS: Record<StatusReserva, string> = {
  prevista: 'Prevista',
  em_andamento: 'Em andamento',
  transcorrida: 'Transcorrida',
  cancelada: 'Cancelada',
}

interface Item {
  card: CardAtendimento
  periodo: Periodo
}

export default function Atendimento() {
  const [inicio, setInicio] = useState(hoje)
  const dias = diasDaSemana(inicio, DIAS)
  const fim = dias[DIAS - 1]
  const painel = usePainelAtendimento(inicioDoDia(inicio), inicioDoDia(somarDias(inicio, DIAS)))
  const catalogo = useCatalogo()

  // Uma reserva com vários períodos aparece em cada dia em que tem período.
  const porDia = new Map<string, Item[]>(dias.map((d) => [d, []]))
  for (const card of painel.data ?? []) {
    if (card.reserva.cancelada) continue
    for (const periodo of card.reserva.periodos) porDia.get(diaDe(periodo.inicio))?.push({ card, periodo })
  }
  for (const itens of porDia.values()) itens.sort((a, b) => a.periodo.inicio.localeCompare(b.periodo.inicio))

  return (
    <section className="space-y-6">
      <TituloPagina>Painel de atendimento</TituloPagina>

      <nav aria-label="Período" className="flex flex-wrap items-center gap-2">
        <Button variant="outline" className="min-h-11 sm:min-h-9" onClick={() => setInicio(somarDias(inicio, -DIAS))}>
          <ChevronLeft aria-hidden="true" />
          {DIAS} dias anteriores
        </Button>
        <Button variant="outline" className="min-h-11 sm:min-h-9" onClick={() => setInicio(hoje())} disabled={inicio === hoje()}>
          Hoje
        </Button>
        <Button variant="outline" className="min-h-11 sm:min-h-9" onClick={() => setInicio(somarDias(inicio, DIAS))}>
          Próximos {DIAS} dias
          <ChevronRight aria-hidden="true" />
        </Button>
        <p aria-live="polite" className="w-full text-sm text-muted-foreground sm:w-auto">
          Mostrando de {formatarData(inicio)} a {formatarData(fim)}
        </p>
      </nav>

      {painel.isPending ? (
        <output className="block">Carregando reservas…</output>
      ) : painel.isError ? (
        <p role="alert" className="text-destructive">
          Não foi possível carregar o painel: {painel.error.message}
        </p>
      ) : (
        dias.map((dia) => {
          const itens = porDia.get(dia) ?? []
          const idTitulo = `dia-${dia}`
          return (
            <section key={dia} aria-labelledby={idTitulo} className="space-y-3">
              <h2 id={idTitulo} className="text-lg font-semibold first-letter:uppercase">
                {formatarDiaSemana(dia)}
                {dia === hoje() && ' (hoje)'}
              </h2>
              {itens.length === 0 ? (
                <p className="text-muted-foreground">Nenhuma reserva neste dia.</p>
              ) : (
                <ul className="grid gap-3 md:grid-cols-2">
                  {itens.map(({ card, periodo }) => (
                    <li key={`${card.reserva.id}-${periodo.inicio}`}>
                      <CartaoReserva card={card} periodo={periodo} catalogo={catalogo.data} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )
        })
      )}
    </section>
  )
}

function CartaoReserva({ card, periodo, catalogo }: Item & { catalogo?: Catalogo }) {
  const { reserva, pedidosSnp } = card
  const ambiente = reserva.ambienteId
    ? (catalogo?.ambientes.find((a) => a.id === reserva.ambienteId)?.desc ?? `Ambiente ${reserva.ambienteId}`)
    : 'Não solicitado / local próprio'
  const disposicao = catalogo?.disposicoes.find((d) => d.id === reserva.disposicaoId)?.desc
  const nomeRecurso = (id: string) => catalogo?.recursos.find((r) => r.id === id)?.desc ?? `Recurso ${id}`
  const horario = `${formatarHora(periodo.inicio)} às ${formatarHora(periodo.termino)}`

  return (
    <article aria-label={`${horario}, ${ambiente}`} className="h-full space-y-3 rounded-lg border bg-card p-4 text-card-foreground">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="font-semibold break-words">
          <span className="block tabular-nums">{horario}</span>
          <span className="block font-normal">{ambiente}</span>
        </h3>
        {reserva.status && <Badge variant="outline">{ROTULO_STATUS[reserva.status]}</Badge>}
      </header>

      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm [&_dd]:min-w-0 [&_dd]:break-words [&_dt]:font-medium">
        <dt>Finalidade</dt>
        <dd>{reserva.finalidade}</dd>
        <dt>Participantes</dt>
        <dd>{reserva.participantes}</dd>
        <dt>Solicitante</dt>
        <dd>{reserva.solicitanteEmail}</dd>
        {disposicao && (
          <>
            <dt>Disposição</dt>
            <dd>{disposicao}</dd>
          </>
        )}
        {reserva.complemento && (
          <>
            <dt>Complemento</dt>
            <dd>{reserva.complemento}</dd>
          </>
        )}
        <dt>Recursos</dt>
        <dd>
          {reserva.recursos.length === 0 ? (
            'Nenhum'
          ) : (
            <ul>
              {reserva.recursos.map((r) => (
                <li key={r.recursoId}>
                  {nomeRecurso(r.recursoId)}
                  {r.qtd > 1 && ` (${r.qtd})`}
                </li>
              ))}
            </ul>
          )}
        </dd>
        <dt>Pedidos SNP</dt>
        <dd>
          {pedidosSnp.length === 0 ? (
            'Nenhum'
          ) : (
            <ul>
              {pedidosSnp.map((p) => (
                <li key={p.numero}>
                  <span className="tabular-nums">{p.numero}</span> ({p.codigoServico}
                  {p.situacao === 'cancelado' && ', cancelado'})
                </li>
              ))}
            </ul>
          )}
        </dd>
      </dl>
    </article>
  )
}
