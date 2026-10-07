import { useMemo, useRef, useState } from 'react'
import type { Reserva } from '../api/tipos'
import { DialogoConfirmacao } from '../componentes/DialogoConfirmacao'
import { CONFIG_DEMO, AMBIENTES_DEMO } from '../reserva/dadosDemo'
import { reservasDemo } from './dadosDemo'
import { podeAlterar, podeCancelar, rotuloStatus, status } from './logica'
import './minhas-reservas.css'

/**
 * Tela "Minhas reservas" (R5 / tarefa 3.5), acessível:
 * - lista semântica com status em TEXTO + badge (nunca só cor — 5.11.1)
 * - Editar e Cancelar; ações indisponíveis ficam desabilitadas conforme RN12
 * - Cancelar abre diálogo de confirmação (ação irreversível — 5.9.12); ao fechar,
 *   o foco volta ao botão que o abriu (5.1.1)
 * - resultado do cancelamento anunciado em aria-live (5.13.8)
 *
 * Dados em mock local; integração (GET/DELETE /reservas) é a tarefa 3.9.
 */
interface Props {
  agora?: Date
  onEditar?: (reserva: Reserva) => void
}

export function MinhasReservas({ agora: agoraProp, onEditar }: Props) {
  const [agora] = useState(() => agoraProp ?? new Date())
  const [reservas, setReservas] = useState<Reserva[]>(() => reservasDemo(agora))
  const [alvoCancelar, setAlvoCancelar] = useState<Reserva | null>(null)
  const [aviso, setAviso] = useState('')

  // Guarda o botão que abriu o diálogo para devolver o foco ao fechar.
  const gatilhoRef = useRef<HTMLButtonElement | null>(null)

  const ambientesPorId = useMemo(
    () => new Map(AMBIENTES_DEMO.map((a) => [a.id, a.desc])),
    [],
  )

  function abrirCancelamento(reserva: Reserva, botao: HTMLButtonElement) {
    gatilhoRef.current = botao
    setAlvoCancelar(reserva)
  }

  function fecharDialogo() {
    setAlvoCancelar(null)
    gatilhoRef.current?.focus()
  }

  function confirmarCancelamento() {
    if (!alvoCancelar) return
    setReservas((atual) =>
      atual.map((r) => (r.id === alvoCancelar.id ? { ...r, cancelada: true } : r)),
    )
    setAviso(`Reserva ${alvoCancelar.id} cancelada.`)
    fecharDialogo()
  }

  return (
    <section aria-labelledby="titulo-minhas">
      <h1 id="titulo-minhas">Minhas reservas</h1>

      <p className="sr-only" aria-live="polite">
        {aviso}
      </p>

      {reservas.length === 0 ? (
        <p>Você ainda não tem reservas.</p>
      ) : (
        <ul className="lista-reservas">
          {reservas.map((r) => {
            const s = status(r, agora)
            const ambiente = r.ambienteId ? ambientesPorId.get(r.ambienteId) ?? r.ambienteId : 'Local próprio'
            const alterar = podeAlterar(r, agora)
            const cancelar = podeCancelar(r, CONFIG_DEMO, agora)
            return (
              <li key={r.id} className="cartao-reserva">
                <div className="cartao-reserva__cabecalho">
                  <h2 className="cartao-reserva__titulo">
                    {r.finalidade}
                  </h2>
                  <span className={`badge badge--${s}`}>{rotuloStatus(s)}</span>
                </div>
                <dl className="cartao-reserva__dados">
                  <div>
                    <dt>Ambiente</dt>
                    <dd>{ambiente}</dd>
                  </div>
                  <div>
                    <dt>Participantes</dt>
                    <dd>{r.participantes}</dd>
                  </div>
                  <div>
                    <dt>Períodos</dt>
                    <dd>
                      {r.periodos
                        .map(
                          (p) =>
                            `${new Date(p.inicio).toLocaleString('pt-BR')} – ${new Date(p.termino).toLocaleString('pt-BR')}`,
                        )
                        .join('; ')}
                    </dd>
                  </div>
                </dl>
                <div className="cartao-reserva__acoes">
                  <button
                    type="button"
                    className="botao-secundario"
                    disabled={!alterar}
                    onClick={() => onEditar?.(r)}
                  >
                    Editar
                    <span className="sr-only"> a reserva {r.finalidade}</span>
                  </button>
                  <button
                    type="button"
                    className="botao-perigo-leve"
                    disabled={!cancelar}
                    onClick={(e) => abrirCancelamento(r, e.currentTarget)}
                  >
                    Cancelar
                    <span className="sr-only"> a reserva {r.finalidade}</span>
                  </button>
                  {!alterar && !cancelar && (
                    <span className="cartao-reserva__nota">
                      {s === 'cancelada' ? 'Reserva cancelada.' : 'Reserva não pode mais ser alterada.'}
                    </span>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <DialogoConfirmacao
        aberto={alvoCancelar !== null}
        titulo="Cancelar reserva"
        descricao={
          alvoCancelar
            ? `Tem certeza de que deseja cancelar a reserva "${alvoCancelar.finalidade}"? Esta ação não pode ser desfeita.`
            : ''
        }
        rotuloConfirmar="Cancelar reserva"
        rotuloCancelar="Manter reserva"
        onConfirmar={confirmarCancelamento}
        onFechar={fecharDialogo}
      />
    </section>
  )
}
