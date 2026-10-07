import { Grade } from './grade/Grade'
import './App.css'

/**
 * Casca da aplicação com a estrutura de regiões (landmarks) exigida pela
 * NBR 17225:2025: skip link (5.7.11), um único <header>/<nav>/<main> (5.4),
 * um único <h1> por página (5.3.3) e <main> com foco programável.
 *
 * O roteamento real (react-router) e a autenticação entram nas tarefas 3.2/3.3;
 * por ora o App renderiza diretamente a grade do solicitante (3.6).
 */
function App() {
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
              <a href="#conteudo" aria-current="page">
                Grade de horários
              </a>
            </li>
          </ul>
        </nav>
      </header>

      <main id="conteudo" tabIndex={-1}>
        <Grade />
      </main>
    </>
  )
}

export default App
