import { useMemo, useState } from 'react'
import type { Config, PeriodoOcupado } from '../api/tipos'
import {
  type EstadoCelula,
  montarGrade,
  rotuloDia,
  rotuloHora,
  textoEstado,
} from './logica'
import './grade.css'

/**
 * Grade de horários do solicitante (R7 / RF16) — o componente de maior risco de
 * acessibilidade do sistema. Decisões conforme a NBR 17225:2025:
 * - Tabela de DADOS semântica (5.6): <caption>, <th scope="col"> para dias,
 *   <th scope="row"> para horários. Não é tabela de leiaute (A.1.8).
 * - Estados comunicados por TEXTO + ÍCONE, nunca só por cor (5.11.1 / 5.10.1).
 * - Célula livre é um <button> (ação) com nome acessível completo incluindo
 *   dia e hora (5.8.3 / 5.13.7). Células indisponíveis não são focáveis e
 *   expõem o motivo em texto.
 * - Operável só por teclado (5.1): controles nativos, foco visível (index.css).
 *
 * Config/ocupações aqui são mock locais; a integração com a API (3.9) troca por
 * GET /catalogo e GET /ambientes/{id}/ocupacao.
 */

// --- Dados de exemplo (serão substituídos pela API na tarefa 3.9) --------------------
const CONFIG_DEMO: Config = {
  faixaInicio: '07:00',
  faixaFim: '20:00',
  antecedenciaMin: 120,
  margemMin: 30,
}

const AMBIENTES_DEMO = [
  { id: '1', desc: 'Auditório (Completo)' },
  { id: '5', desc: 'Auditório (Parte A)' },
  { id: '3', desc: 'Sala de Reuniões - 9º andar' },
]

function ocupacoesDemo(ambienteId: string, referencia: Date): PeriodoOcupado[] {
  // Uma reserva de exemplo hoje 09:00–11:00 no ambiente selecionado.
  const dia = new Date(referencia)
  dia.setHours(9, 0, 0, 0)
  const fim = new Date(dia)
  fim.setHours(11, 0, 0, 0)
  return [{ ambienteId, inicio: dia.toISOString(), termino: fim.toISOString() }]
}

// Ícone textual por estado (reforça o significado além da cor — 5.11.1).
const ICONE: Record<EstadoCelula, string> = {
  livre: '＋',
  ocupado: '●',
  margem: '◐',
  passado: '×',
  sem_antecedencia: '⏱',
  fora_faixa: '–',
}

interface Props {
  agora?: Date // injetável para testes/demonstração
  /** chamado ao acionar uma célula livre: leva ao formulário pré-preenchido (3.4) */
  onReservar?: (ambienteId: string, inicio: Date) => void
}

export function Grade({ agora: agoraProp, onReservar }: Props) {
  // Estabiliza "agora" numa única avaliação (evita Date() impuro a cada render).
  const [agora] = useState(() => agoraProp ?? new Date())
  const [ambienteId, setAmbienteId] = useState(AMBIENTES_DEMO[0].id)
  const [colunas, setColunas] = useState(7)
  const [fds, setFds] = useState(false)

  const referencia = useMemo(() => {
    const d = new Date(agora)
    d.setHours(0, 0, 0, 0)
    return d
  }, [agora])

  const ocupacoes = useMemo(
    () => ocupacoesDemo(ambienteId, referencia),
    [ambienteId, referencia],
  )

  const grade = useMemo(
    () => montarGrade(referencia, colunas, fds, ocupacoes, CONFIG_DEMO, agora),
    [referencia, colunas, fds, ocupacoes, agora],
  )

  const ambienteDesc = AMBIENTES_DEMO.find((a) => a.id === ambienteId)?.desc ?? ''

  function reservar(inicio: Date) {
    onReservar?.(ambienteId, inicio)
  }

  return (
    <section aria-labelledby="titulo-grade">
      <h1 id="titulo-grade">Grade de horários</h1>

      <form className="grade-controles" aria-label="Opções da grade">
        <div className="campo">
          <label htmlFor="sel-ambiente">Ambiente</label>
          <select
            id="sel-ambiente"
            value={ambienteId}
            onChange={(e) => setAmbienteId(e.target.value)}
          >
            {AMBIENTES_DEMO.map((a) => (
              <option key={a.id} value={a.id}>
                {a.desc}
              </option>
            ))}
          </select>
        </div>

        <div className="campo">
          <label htmlFor="num-colunas">Número de dias (colunas)</label>
          <input
            id="num-colunas"
            type="number"
            min={1}
            max={14}
            value={colunas}
            onChange={(e) => setColunas(Math.min(14, Math.max(1, Number(e.target.value) || 1)))}
          />
        </div>

        <div className="campo campo--inline">
          <input
            id="exibir-fds"
            type="checkbox"
            checked={fds}
            onChange={(e) => setFds(e.target.checked)}
          />
          <label htmlFor="exibir-fds">Exibir finais de semana</label>
        </div>
      </form>

      <section className="grade-rolagem" aria-label="Tabela de disponibilidade">
        <table className="grade">
          <caption>
            Disponibilidade de {ambienteDesc}. Cada célula indica se o horário está
            livre para reserva, ocupado, em margem de tolerância, ultrapassado ou sem
            antecedência mínima.
          </caption>
          <thead>
            <tr>
              <th scope="col">
                <span className="sr-only">Horário</span>
              </th>
              {grade.colunas.map((c) => (
                <th scope="col" key={c.dia.toISOString()}>
                  {rotuloDia(c.dia)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grade.horarios.map((hhmm, linha) => (
              <tr key={hhmm}>
                <th scope="row" className="grade__hora">
                  {hhmm}
                </th>
                {grade.colunas.map((c) => {
                  const celula = c.celulas[linha]
                  const texto = textoEstado(celula.estado, celula.inicio)
                  if (celula.estado === 'livre') {
                    return (
                      // td é célula de dados, não controle; o rótulo acessível está no conteúdo (botão/texto)
                      // oxlint-disable-next-line jsx-a11y/control-has-associated-label
                      <td key={c.dia.toISOString()} className="grade__cel grade__cel--livre">
                        <button
                          type="button"
                          className="celula-botao"
                          onClick={() => reservar(celula.inicio)}
                        >
                          <span aria-hidden="true" className="celula-icone">
                            {ICONE.livre}
                          </span>
                          <span>
                            Reservar às {rotuloHora(celula.inicio)}
                            <span className="sr-only"> de {rotuloDia(c.dia)}, {ambienteDesc}</span>
                          </span>
                        </button>
                      </td>
                    )
                  }
                  return (
                    // oxlint-disable-next-line jsx-a11y/control-has-associated-label
                    <td
                      key={c.dia.toISOString()}
                      className={`grade__cel grade__cel--${celula.estado}`}
                    >
                      <span className="celula-indisponivel">
                        <span aria-hidden="true" className="celula-icone">
                          {ICONE[celula.estado]}
                        </span>
                        <span>{texto}</span>
                        <span className="sr-only"> — {rotuloHora(celula.inicio)} de {rotuloDia(c.dia)}</span>
                      </span>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </section>
  )
}
