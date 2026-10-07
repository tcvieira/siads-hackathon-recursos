import { useId, useMemo, useRef, useState } from 'react'
import type { Erro, ItemRecurso, Periodo, ReservaEntrada } from '../api/tipos'
import {
  AMBIENTES_DEMO,
  CONFIG_DEMO,
  DISPOSICOES_DEMO,
  GRUPOS_DEMO,
  RECURSOS_DEMO,
} from './dadosDemo'
import { recursosOferecidos, validarReserva, FINALIDADE_MAX } from './logica'
import './formulario.css'

/**
 * Formulário de cadastro de reserva (R2 / tarefa 3.4), com foco em acessibilidade
 * de formulário (ABNT NBR 17225:2025 §5.9):
 * - todo campo tem <label for> (5.9.1/5.9.3); placeholder nunca substitui label
 * - obrigatórios com aria-required; complemento vira obrigatório dinamicamente (RN2)
 * - erros com aria-invalid + aria-describedby e resumo em role="alert" com links (5.9.9)
 * - validação ao vivo anunciada em aria-live="polite" sem mover o foco (R3.3)
 * - grupos com <fieldset>/<legend> (5.9.6); disposição em radio-cards com img alt (5.2)
 * - quantidade só para recursos limitados (R2.6); recursos filtrados por ambiente (RN9)
 *
 * Catálogo em mock local; a integração (POST /reservas/validar e /reservas) é a 3.9.
 */

const LOCAL_PROPRIO = '' // value do <option> "Não solicitado / local próprio"
const BASE_ICONES = '/icones' // tarefa 3.1 copia os ícones para public/icones

interface Props {
  /** pré-preenchimento vindo da grade (ambiente/data/hora) */
  inicial?: Partial<ReservaEntrada>
  agora?: Date
  onSalvar?: (reserva: ReservaEntrada) => void
}

function novoPeriodo(): Periodo {
  return { inicio: '', termino: '' }
}

export function FormularioReserva({ inicial, agora: agoraProp, onSalvar }: Props) {
  const [agora] = useState(() => agoraProp ?? new Date())

  const [ambienteId, setAmbienteId] = useState<string | null>(inicial?.ambienteId ?? AMBIENTES_DEMO[0].id)
  const [complemento, setComplemento] = useState(inicial?.complemento ?? '')
  const [finalidade, setFinalidade] = useState(inicial?.finalidade ?? '')
  const [participantes, setParticipantes] = useState(inicial?.participantes ?? 1)
  const [disposicaoId, setDisposicaoId] = useState<string | null>(inicial?.disposicaoId ?? null)
  const [periodos, setPeriodos] = useState<Periodo[]>(inicial?.periodos?.length ? inicial.periodos : [novoPeriodo()])
  const [itens, setItens] = useState<ItemRecurso[]>(inicial?.recursos ?? [])
  const [erros, setErros] = useState<Erro[]>([])
  const [enviado, setEnviado] = useState(false)

  const idBase = useId()
  const resumoRef = useRef<HTMLDivElement>(null)

  const ambienteSelecionado = ambienteId !== null
  const recursosDisponiveis = useMemo(
    () => recursosOferecidos(RECURSOS_DEMO, ambienteId),
    [ambienteId],
  )

  const reservaAtual: ReservaEntrada = useMemo(
    () => ({
      finalidade,
      participantes,
      ambienteId,
      complemento: ambienteSelecionado ? null : complemento,
      disposicaoId: ambienteSelecionado ? disposicaoId : null,
      periodos,
      recursos: itens,
    }),
    [finalidade, participantes, ambienteId, ambienteSelecionado, complemento, disposicaoId, periodos, itens],
  )

  // Validação ao vivo (anunciada em aria-live) a cada mudança relevante.
  const errosAoVivo = useMemo(
    () => validarReserva(reservaAtual, RECURSOS_DEMO, CONFIG_DEMO, agora),
    [reservaAtual, agora],
  )

  function errosDoCampo(campo: string, periodoIndex?: number): Erro[] {
    return erros.filter(
      (e) => e.campo === campo && (periodoIndex === undefined || e.periodoIndex === periodoIndex),
    )
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setEnviado(true)
    const encontrados = validarReserva(reservaAtual, RECURSOS_DEMO, CONFIG_DEMO, agora)
    setErros(encontrados)
    if (encontrados.length > 0) {
      // move o foco para o resumo de erros (sem roubar foco durante digitação)
      resumoRef.current?.focus()
      return
    }
    onSalvar?.(reservaAtual)
  }

  function alterarItem(recursoId: string, marcado: boolean, qtd = 1) {
    setItens((atual) => {
      const semEle = atual.filter((i) => i.recursoId !== recursoId)
      return marcado ? [...semEle, { recursoId, qtd }] : semEle
    })
  }

  function alterarQtd(recursoId: string, qtd: number) {
    setItens((atual) => atual.map((i) => (i.recursoId === recursoId ? { ...i, qtd } : i)))
  }

  const descricaoDisponivel = (campo: string) => (errosDoCampo(campo).length > 0 ? `${idBase}-${campo}-erro` : undefined)

  return (
    <section aria-labelledby="titulo-form">
      <h1 id="titulo-form">Nova reserva</h1>

      {/* Resumo de erros: role=alert, foco programável, links para os campos (5.9.9) */}
      {enviado && erros.length > 0 && (
        <div
          ref={resumoRef}
          role="alert"
          tabIndex={-1}
          className="resumo-erros"
          aria-labelledby="resumo-erros-titulo"
        >
          <h2 id="resumo-erros-titulo">Corrija {erros.length} problema(s) antes de salvar</h2>
          <ul>
            {erros.map((er, i) => (
              <li key={`${er.campo}-${er.periodoIndex ?? ''}-${i}`}>
                <a href={`#${idBase}-${er.campo}${er.periodoIndex !== undefined && er.periodoIndex !== null ? `-${er.periodoIndex}` : ''}`}>
                  {er.mensagem}
                  {er.sugestao ? ` (${er.sugestao})` : ''}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate>
        {/* Ambiente */}
        <div className="campo">
          <label htmlFor={`${idBase}-ambiente`}>Ambiente</label>
          <select
            id={`${idBase}-ambiente`}
            value={ambienteId ?? LOCAL_PROPRIO}
            onChange={(e) => setAmbienteId(e.target.value === LOCAL_PROPRIO ? null : e.target.value)}
          >
            <option value={LOCAL_PROPRIO}>Não solicitado / local próprio</option>
            {AMBIENTES_DEMO.filter((a) => a.ativo).map((a) => (
              <option key={a.id} value={a.id}>
                {a.desc}
              </option>
            ))}
          </select>
        </div>

        {/* Complemento: obrigatório dinamicamente quando não há ambiente (RN2) */}
        {!ambienteSelecionado && (
          <div className="campo">
            <label htmlFor={`${idBase}-complemento`}>
              Complemento do ambiente <span className="obrigatorio">(obrigatório)</span>
            </label>
            <input
              id={`${idBase}-complemento`}
              type="text"
              value={complemento}
              aria-required="true"
              aria-invalid={errosDoCampo('complemento').length > 0 || undefined}
              aria-describedby={descricaoDisponivel('complemento')}
              onChange={(e) => setComplemento(e.target.value)}
            />
            {errosDoCampo('complemento').map((er) => (
              <p id={`${idBase}-complemento-erro`} key={er.mensagem} className="erro-campo">
                {er.mensagem}
              </p>
            ))}
          </div>
        )}

        {/* Finalidade */}
        <div className="campo">
          <label htmlFor={`${idBase}-finalidade`}>
            Finalidade <span className="obrigatorio">(obrigatório)</span>
          </label>
          <textarea
            id={`${idBase}-finalidade`}
            value={finalidade}
            rows={3}
            maxLength={FINALIDADE_MAX}
            aria-required="true"
            aria-invalid={errosDoCampo('finalidade').length > 0 || undefined}
            aria-describedby={`${idBase}-finalidade-ajuda ${descricaoDisponivel('finalidade') ?? ''}`.trim()}
            onChange={(e) => setFinalidade(e.target.value)}
          />
          <p id={`${idBase}-finalidade-ajuda`} className="ajuda">
            Até {FINALIDADE_MAX} caracteres.
          </p>
          {errosDoCampo('finalidade').map((er) => (
            <p id={`${idBase}-finalidade-erro`} key={er.mensagem} className="erro-campo">
              {er.mensagem}
            </p>
          ))}
        </div>

        {/* Participantes */}
        <div className="campo">
          <label htmlFor={`${idBase}-participantes`}>
            Quantidade de participantes <span className="obrigatorio">(obrigatório)</span>
          </label>
          <input
            id={`${idBase}-participantes`}
            type="number"
            min={1}
            inputMode="numeric"
            value={participantes}
            aria-required="true"
            aria-invalid={errosDoCampo('participantes').length > 0 || undefined}
            aria-describedby={descricaoDisponivel('participantes')}
            onChange={(e) => setParticipantes(Number(e.target.value))}
          />
          {errosDoCampo('participantes').map((er) => (
            <p id={`${idBase}-participantes-erro`} key={er.mensagem} className="erro-campo">
              {er.mensagem}
            </p>
          ))}
        </div>

        {/* Disposição (só com ambiente), radio-cards com imagem + alt */}
        {ambienteSelecionado && (
          <fieldset className="campo">
            <legend>Disposição do ambiente (opcional)</legend>
            <div className="radio-cards">
              {DISPOSICOES_DEMO.filter((d) => d.ativo).map((d) => (
                <label key={d.id} className="radio-card">
                  <input
                    type="radio"
                    name={`${idBase}-disposicao`}
                    value={d.id}
                    checked={disposicaoId === d.id}
                    onChange={() => setDisposicaoId(d.id)}
                  />
                  <img src={`${BASE_ICONES}/${d.icone}`} alt={`Disposição: ${d.desc}`} width={96} height={72} />
                  <span>{d.desc}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        {/* Períodos dinâmicos */}
        <fieldset className="campo">
          <legend>Períodos <span className="obrigatorio">(ao menos um)</span></legend>
          {errosDoCampo('periodos').filter((e) => e.periodoIndex === undefined || e.periodoIndex === null).map((er) => (
            <p id={`${idBase}-periodos`} key={er.mensagem} className="erro-campo">
              {er.mensagem}
            </p>
          ))}
          <ol className="periodos">
            {periodos.map((p, idx) => {
              const errosPeriodo = errosDoCampo('periodos', idx)
              return (
                <li key={idx} id={`${idBase}-periodos-${idx}`} className="periodo">
                  <div className="campo">
                    <label htmlFor={`${idBase}-ini-${idx}`}>Início do período {idx + 1}</label>
                    <input
                      id={`${idBase}-ini-${idx}`}
                      type="datetime-local"
                      value={p.inicio}
                      aria-invalid={errosPeriodo.length > 0 || undefined}
                      aria-describedby={errosPeriodo.length ? `${idBase}-periodo-${idx}-erro` : undefined}
                      onChange={(e) =>
                        setPeriodos((atual) => atual.map((x, i) => (i === idx ? { ...x, inicio: e.target.value } : x)))
                      }
                    />
                  </div>
                  <div className="campo">
                    <label htmlFor={`${idBase}-fim-${idx}`}>Término do período {idx + 1}</label>
                    <input
                      id={`${idBase}-fim-${idx}`}
                      type="datetime-local"
                      value={p.termino}
                      aria-invalid={errosPeriodo.length > 0 || undefined}
                      onChange={(e) =>
                        setPeriodos((atual) => atual.map((x, i) => (i === idx ? { ...x, termino: e.target.value } : x)))
                      }
                    />
                  </div>
                  {errosPeriodo.map((er) => (
                    <p id={`${idBase}-periodo-${idx}-erro`} key={er.mensagem} className="erro-campo">
                      {er.mensagem}
                      {er.sugestao ? ` (${er.sugestao})` : ''}
                    </p>
                  ))}
                  {periodos.length > 1 && (
                    <button
                      type="button"
                      className="botao-secundario"
                      onClick={() => setPeriodos((atual) => atual.filter((_, i) => i !== idx))}
                    >
                      Remover período {idx + 1}
                    </button>
                  )}
                </li>
              )
            })}
          </ol>
          <button type="button" className="botao-secundario" onClick={() => setPeriodos((a) => [...a, novoPeriodo()])}>
            Adicionar período
          </button>
        </fieldset>

        {/* Recursos agrupados por grupo, filtrados por ambiente (RN9) */}
        <fieldset className="campo">
          <legend>Recursos e serviços (opcional)</legend>
          {errosDoCampo('recursos').map((er) => (
            <p id={`${idBase}-recursos`} key={er.mensagem} className="erro-campo">
              {er.mensagem}
            </p>
          ))}
          {GRUPOS_DEMO.map((grupo) => {
            const doGrupo = recursosDisponiveis.filter((r) => r.grupoId === grupo.id)
            if (doGrupo.length === 0) return null
            return (
              <fieldset key={grupo.id} className="grupo-recurso">
                <legend>{grupo.desc}</legend>
                {doGrupo.map((rec) => {
                  const item = itens.find((i) => i.recursoId === rec.id)
                  const marcado = Boolean(item)
                  return (
                    <div key={rec.id} className="recurso-linha">
                      <span className="recurso-check">
                        <input
                          id={`${idBase}-rec-${rec.id}`}
                          type="checkbox"
                          checked={marcado}
                          onChange={(e) => alterarItem(rec.id, e.target.checked)}
                        />
                        <img src={`${BASE_ICONES}/${rec.icone}`} alt="" width={24} height={24} />
                        <label htmlFor={`${idBase}-rec-${rec.id}`}>{rec.desc}</label>
                      </span>
                      {rec.limitado && marcado && (
                        <span className="recurso-qtd">
                          <label htmlFor={`${idBase}-qtd-${rec.id}`}>
                            Quantidade de {rec.desc} (disponível: {rec.disponibilidade})
                          </label>
                          <input
                            id={`${idBase}-qtd-${rec.id}`}
                            type="number"
                            min={1}
                            max={rec.disponibilidade}
                            value={item?.qtd ?? 1}
                            onChange={(e) => alterarQtd(rec.id, Number(e.target.value))}
                          />
                        </span>
                      )}
                    </div>
                  )
                })}
              </fieldset>
            )
          })}
        </fieldset>

        {/* Validação ao vivo anunciada sem mover o foco (R3.3) */}
        <p className="sr-only" aria-live="polite">
          {errosAoVivo.length === 0
            ? 'Formulário sem pendências de validação.'
            : `${errosAoVivo.length} pendência(s) de validação no momento.`}
        </p>

        <div className="acoes">
          <button type="submit" className="botao-primario">
            Salvar reserva
          </button>
        </div>
      </form>
    </section>
  )
}
