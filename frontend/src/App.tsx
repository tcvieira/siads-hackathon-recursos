import { useState } from 'react'
import type { ReservaEntrada } from './api/tipos'
import { Grade } from './grade/Grade'
import { FormularioReserva } from './reserva/FormularioReserva'
import './App.css'

/**
 * Casca da aplicação com a estrutura de regiões (landmarks) exigida pela
 * NBR 17225:2025: skip link (5.7.11), um único <header>/<nav>/<main> (5.4),
 * um único <h1> por página (5.3.3) e <main> com foco programável.
 *
 * O roteamento real (react-router) e a autenticação entram nas tarefas 3.2/3.3.
 * Por ora o App alterna entre a grade e o formulário por estado, para demonstrar
 * o fluxo "Reservar às HH:MM" → formulário pré-preenchido (3.4).
 */

type Tela = { nome: 'grade' } | { nome: 'formulario'; inicial: Partial<ReservaEntrada> }

/** Converte Date local para o valor de <input type="datetime-local"> (YYYY-MM-DDTHH:MM). */
function paraDatetimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function App() {
  const [tela, setTela] = useState<Tela>({ nome: 'grade' })

  function iniciarReserva(ambienteId: string, inicio: Date) {
    const termino = new Date(inicio.getTime() + 60 * 60_000) // sugestão: +1h
    setTela({
      nome: 'formulario',
      inicial: {
        ambienteId,
        periodos: [{ inicio: paraDatetimeLocal(inicio), termino: paraDatetimeLocal(termino) }],
      },
    })
  }

  return (
    <>
      <a className="skip-link" href="#conteudo">
        Pular para o conteúdo principal
      </a>

      <header className="cabecalho">
        <div className="cabecalho__marca">
          <strong>SISGARES</strong>
          <span className="cabecalho__sub">Solicitação de Ambientes e Recursos</span>
        </div>
        <nav aria-label="Principal">
          <ul className="menu">
            <li>
              <a
                href="#conteudo"
                aria-current={tela.nome === 'grade' ? 'page' : undefined}
                onClick={(e) => {
                  e.preventDefault()
                  setTela({ nome: 'grade' })
                }}
              >
                Grade de horários
              </a>
            </li>
            <li>
              <a
                href="#conteudo"
                aria-current={tela.nome === 'formulario' ? 'page' : undefined}
                onClick={(e) => {
                  e.preventDefault()
                  setTela({ nome: 'formulario', inicial: {} })
                }}
              >
                Nova reserva
              </a>
            </li>
          </ul>
        </nav>
      </header>

      <main id="conteudo" tabIndex={-1}>
        {tela.nome === 'grade' ? (
          <Grade onReservar={iniciarReserva} />
        ) : (
          <FormularioReserva
            inicial={tela.inicial}
            onSalvar={() => setTela({ nome: 'grade' })}
          />
        )}
      </main>
    </>
  )
}

export default App
