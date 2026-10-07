import { useMemo, useState } from 'react'
import type { CardAtendimento } from '../api/tipos'
import { AMBIENTES_DEMO, RECURSOS_DEMO } from '../reserva/dadosDemo'
import { rotuloStatus } from '../minhas-reservas/logica'
import { cardsDemo } from './dadosDemo'
import { agruparPorData, faixaHorarioDoDia, rotuloDiaLongo } from './logica'
import './atendimento.css'

/**
 * Painel de atendimento (R8 / RF17), acessível:
 * - cards de reservas não canceladas agrupados por data (hoje + N dias, navegável)
 * - cada dia é uma seção com <h2>; os cards ficam numa lista semântica <ul>
 * - cada card traz horário, ambiente, finalidade, solicitante (e-mail MASCARADO
 *   pela Lambda — R8.3/LGPD), recursos com quantidade, nº SNP (link) e status em
 *   texto + badge (nunca só cor — 5.11.1)
 * - controles de data de referência e número de dias
 *
 * Dados em mock local; integração GET /painel/atendimento é a 3.9.
 */
interface Props {
  agora?: Date
  onAbrirReserva?: (reservaId: string) => void
}

function paraDateInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function PainelAtendimento({ agora: agoraProp, onAbrirReserva }: Props) {
  const [agora] = useState(() => agoraProp ?? new Date())
  const [deData, setDeData] = useState(() => paraDateInput(agora))
  const [numeroDias, setNumeroDias] = useState(8) // hoje + 7

  const cards = useMemo<CardAtendimento[]>(() => cardsDemo(agora), [agora])
  const ambientesPorId = useMemo(() => new Map(AMBIENTES_DEMO.map((a) => [a.id, a.desc])), [])
  const recursosPorId = useMemo(() => new Map(RECURSOS_DEMO.map((r) => [r.id, r.desc])), [])

  const dias = useMemo(
    () => agruparPorData(cards, new Date(`${deData}T00:00:00`), numeroDias),
    [cards, deData, numeroDias],
  )

  const totalCards = dias.reduce((acc, d) => acc + d.cards.length, 0)

  return (
    <section aria-labelledby="titulo-atend">
      <h1 id="titulo-atend">Atendimento</h1>

      <form className="atend-controles" aria-label="Período exibido">
        <div className="campo">
          <label htmlFor="atend-de">A partir de</label>
          <input id="atend-de" type="date" value={deData} onChange={(e) => setDeData(e.target.value)} />
        </div>
        <div className="campo">
          <label htmlFor="atend-dias">Número de dias</label>
          <input
            id="atend-dias"
            type="number"
            min={1}
            max={31}
            value={numeroDias}
            onChange={(e) => setNumeroDias(Math.min(31, Math.max(1, Number(e.target.value) || 1)))}
          />
        </div>
      </form>

      <p className="sr-only" aria-live="polite">
        {totalCards} reserva(s) no período exibido.
      </p>

      {dias.map((dia) => (
        <section className="atend-dia" key={dia.data.toISOString()} aria-labelledby={`dia-${dia.data.toISOString()}`}>
          <h2 id={`dia-${dia.data.toISOString()}`} className="atend-dia__titulo">
            {rotuloDiaLongo(dia.data)}
          </h2>
          {dia.cards.length === 0 ? (
            <p className="atend-dia__vazio">Sem reservas neste dia.</p>
          ) : (
            <ul className="atend-cards">
              {dia.cards.map((card) => {
                const r = card.reserva
                const ambiente = r.ambienteId ? ambientesPorId.get(r.ambienteId) ?? r.ambienteId : 'Local próprio'
                const st = r.status ?? 'prevista'
                return (
                  <li key={r.id} className="card-atend">
                    <div className="card-atend__topo">
                      <span className="card-atend__horario">{faixaHorarioDoDia(card, dia.data)}</span>
                      <span className={`badge badge--${st}`}>{rotuloStatus(st)}</span>
                    </div>
                    <h3 className="card-atend__titulo">{r.finalidade}</h3>
                    <dl className="card-atend__dados">
                      <dt>Ambiente</dt>
                      <dd>{ambiente}</dd>
                      <dt>Solicitante</dt>
                      <dd>{r.solicitanteEmail}</dd>
                      <dt>Participantes</dt>
                      <dd>{r.participantes}</dd>
                      {r.recursos.length > 0 && (
                        <>
                          <dt>Recursos</dt>
                          <dd>
                            <ul className="card-atend__recursos">
                              {r.recursos.map((item) => (
                                <li key={item.recursoId}>
                                  {recursosPorId.get(item.recursoId) ?? `Recurso ${item.recursoId}`} — {item.qtd}
                                </li>
                              ))}
                            </ul>
                          </dd>
                        </>
                      )}
                      {card.pedidosSnp.length > 0 && (
                        <>
                          <dt>Pedido SNP</dt>
                          <dd className="card-atend__snp">
                            {card.pedidosSnp.map((p) => (
                              <span key={p.numero}>
                                <a href={`#snp-${p.numero}`}>
                                  {p.numero}
                                  <span className="sr-only"> (abre o pedido no sistema nacional)</span>
                                </a>
                                {p.situacao === 'cancelado' ? ' (cancelado)' : ''}
                              </span>
                            ))}
                          </dd>
                        </>
                      )}
                    </dl>
                    <div className="card-atend__acoes">
                      <button type="button" className="botao-secundario" onClick={() => onAbrirReserva?.(r.id)}>
                        Abrir reserva
                        <span className="sr-only"> {r.finalidade}</span>
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      ))}
    </section>
  )
}
