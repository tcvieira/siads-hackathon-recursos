import { useState } from 'react'
import type { Reserva, ReservaEntrada } from './api/tipos'
import { Grade } from './grade/Grade'
import { FormularioReserva } from './reserva/FormularioReserva'
import { MinhasReservas } from './minhas-reservas/MinhasReservas'
import { PainelAtendimento } from './atendimento/PainelAtendimento'
import { Notificacoes } from './notificacoes/Notificacoes'
import './App.css'

/**
 * Casca da aplicação com a estrutura de regiões (landmarks) exigida pela
 * NBR 17225:2025: skip link (5.7.11), um único <header>/<nav>/<main> (5.4),
 * um único <h1> por página (5.3.3) e <main> com foco programável.
 *
 * O roteamento real (react-router) e a autenticação entram nas tarefas 3.2/3.3.
 * Por ora o App alterna entre as telas por estado, para demonstrar os fluxos
 * grade → formulário e minhas reservas → editar.
 */

type Tela =
  | { nome: 'grade' }
  | { nome: 'minhas' }
  | { nome: 'atendimento' }
  | { nome: 'notificacoes' }
  | { nome: 'formulario'; inicial: Partial<ReservaEntrada> }

/** Converte Date local para o valor de <input type="datetime-local"> (YYYY-MM-DDTHH:MM). */
function paraDatetimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Monta o pré-preenchimento do formulário a partir de uma reserva existente (Editar). */
function reservaParaEntrada(r: Reserva): Partial<ReservaEntrada> {
  return {
    ambienteId: r.ambienteId,
    complemento: r.complemento ?? null,
    disposicaoId: r.disposicaoId ?? null,
    finalidade: r.finalidade,
    participantes: r.participantes,
    recursos: r.recursos,
    periodos: r.periodos.map((p) => ({
      inicio: paraDatetimeLocal(new Date(p.inicio)),
      termino: paraDatetimeLocal(new Date(p.termino)),
    })),
  }
}

interface ItemMenu {
  nome: Tela['nome']
  rotulo: string
}
const MENU: ItemMenu[] = [
  { nome: 'grade', rotulo: 'Grade de horários' },
  { nome: 'minhas', rotulo: 'Minhas reservas' },
  { nome: 'atendimento', rotulo: 'Atendimento' },
  { nome: 'notificacoes', rotulo: 'Notificações' },
  { nome: 'formulario', rotulo: 'Nova reserva' },
]

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

  function irPara(nome: Tela['nome']) {
    if (nome === 'formulario') setTela({ nome: 'formulario', inicial: {} })
    else if (nome === 'minhas') setTela({ nome: 'minhas' })
    else if (nome === 'atendimento') setTela({ nome: 'atendimento' })
    else if (nome === 'notificacoes') setTela({ nome: 'notificacoes' })
    else setTela({ nome: 'grade' })
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
            {MENU.map((item) => (
              <li key={item.nome}>
                <a
                  href="#conteudo"
                  aria-current={tela.nome === item.nome ? 'page' : undefined}
                  onClick={(e) => {
                    e.preventDefault()
                    irPara(item.nome)
                  }}
                >
                  {item.rotulo}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <main id="conteudo" tabIndex={-1}>
        {tela.nome === 'grade' && <Grade onReservar={iniciarReserva} />}
        {tela.nome === 'minhas' && (
          <MinhasReservas
            onEditar={(r) => setTela({ nome: 'formulario', inicial: reservaParaEntrada(r) })}
          />
        )}
        {tela.nome === 'atendimento' && (
          <PainelAtendimento onAbrirReserva={() => setTela({ nome: 'formulario', inicial: {} })} />
        )}
        {tela.nome === 'notificacoes' && <Notificacoes />}
        {tela.nome === 'formulario' && (
          <FormularioReserva inicial={tela.inicial} onSalvar={() => setTela({ nome: 'minhas' })} />
        )}
      </main>
    </>
  )
}

export default App
