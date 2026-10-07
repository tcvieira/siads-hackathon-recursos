import { useMemo } from 'react'
import type { TipoEmail } from '../api/tipos'
import { caixaDemo } from './dadosDemo'
import './notificacoes.css'

/**
 * Tela "Notificações" — caixa de saída simulada (R6.4 / tarefa 3.8), acessível.
 *
 * SEGURANÇA: o frontend NÃO renderiza o campo `html` do e-mail. Mostra os campos
 * estruturados (`alteracoes[]`), evitando XSS (design.md §6). As diferenças da
 * alteração usam texto "ALTERADO:" + <del>/<ins>, nunca só cor (NBR 5.11.1 / R6.2).
 *
 * Estrutura semântica: seções com <h2>, listas <ul>, badges com rótulo textual.
 * Dados em mock local; integração GET /notificacoes é a 3.9.
 */

const ROTULO_TIPO: Record<TipoEmail, string> = {
  criada: 'Criada',
  alterada: 'Alterada',
  cancelada: 'Cancelada',
}

function formatarData(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR')
}

export function Notificacoes() {
  const caixa = useMemo(() => caixaDemo(), [])

  return (
    <section aria-labelledby="titulo-notif">
      <h1 id="titulo-notif">Notificações</h1>
      <p>Caixa de saída simulada: nenhum e-mail é realmente enviado.</p>

      <section aria-labelledby="notif-emails-titulo">
        <h2 id="notif-emails-titulo">E-mails ({caixa.emails.length})</h2>
        {caixa.emails.length === 0 ? (
          <p>Nenhum e-mail gerado.</p>
        ) : (
          <ul className="notif-lista">
            {caixa.emails.map((email) => (
              <li key={`${email.reservaId}-${email.ts}`} className="notif-email">
                <div className="notif-email__topo">
                  <h3 className="notif-email__assunto">{email.assunto}</h3>
                  <span className={`badge badge--${email.tipo}`}>{ROTULO_TIPO[email.tipo]}</span>
                </div>
                <p className="notif-email__meta">
                  Para: {email.para} · {formatarData(email.ts)} · reserva nº {email.reservaId}
                </p>
                {email.tipo === 'alterada' && email.alteracoes.length > 0 && (
                  <ul className="notif-alteracoes">
                    {email.alteracoes.map((alt) => (
                      <li key={alt.campo}>
                        <span className="rotulo-alterado">ALTERADO:</span> {alt.campo} —{' '}
                        <del>{alt.antes}</del> <span aria-hidden="true">→</span>{' '}
                        <ins>{alt.depois}</ins>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="notif-snp-titulo">
        <h2 id="notif-snp-titulo">Pedidos no SNP ({caixa.pedidosSnp.length})</h2>
        {caixa.pedidosSnp.length === 0 ? (
          <p>Nenhum pedido gerado.</p>
        ) : (
          <ul className="notif-snp-lista">
            {caixa.pedidosSnp.map((p) => (
              <li key={p.numero} className="notif-snp">
                <span className="notif-snp__numero">
                  <a href={`#snp-${p.numero}`}>
                    {p.numero}
                    <span className="sr-only"> (abre o pedido no sistema nacional)</span>
                  </a>
                </span>
                <span>Serviço: {p.codigoServico}</span>
                <span>Reserva nº {p.reservaId}</span>
                <span>Situação: {p.situacao === 'cancelado' ? 'Cancelado' : 'Ativo'}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  )
}
