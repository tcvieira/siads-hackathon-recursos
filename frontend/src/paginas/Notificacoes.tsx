import { useState } from 'react'
import { useNotificacoes } from '@/api/consultas'
import type { TipoEmail } from '@/api/tipos'
import { TituloPagina } from '@/componentes/TituloPagina'
import { Badge } from '@/components/ui/badge'
import { formatarDataHora } from '@/lib/datas'

const TIPOS: Record<TipoEmail, string> = { criada: 'Criada', alterada: 'Alterada', cancelada: 'Cancelada' }
const VARIANTE: Record<TipoEmail, 'default' | 'secondary' | 'destructive'> = {
  criada: 'default',
  alterada: 'secondary',
  cancelada: 'destructive',
}

// ponytail: GET /catalogo não traz setores, então mostramos o id; trocar pelo nome se o contrato expuser.
const setor = (id: string) => `Setor ${id}`

export default function Notificacoes() {
  const { data, isPending, error } = useNotificacoes()
  const [tipo, setTipo] = useState<TipoEmail | ''>('')

  const emails = (data?.emails ?? []).filter((e) => !tipo || e.tipo === tipo)
  const pedidos = data?.pedidosSnp ?? []

  return (
    <section className="space-y-6">
      <TituloPagina>Notificações</TituloPagina>
      <p className="text-muted-foreground">
        Caixa de saída simulada: e-mails enviados aos setores e pedidos de serviço no SNP.
      </p>

      {isPending && <output className="block">Carregando notificações…</output>}
      {error && (
        <p role="alert" className="text-destructive">
          Não foi possível carregar as notificações: {error.message}
        </p>
      )}

      {data && (
        <>
          <section aria-labelledby="titulo-emails" className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <h2 id="titulo-emails" className="text-xl font-semibold">
                E-mails ({emails.length})
              </h2>
              <div className="flex flex-col gap-1">
                <label htmlFor="filtro-tipo" className="text-sm font-medium">
                  Tipo
                </label>
                <select
                  id="filtro-tipo"
                  value={tipo}
                  onChange={(e) => setTipo(e.target.value as TipoEmail | '')}
                  className="h-11 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:h-9"
                >
                  <option value="">Todos</option>
                  {Object.entries(TIPOS).map(([valor, rotulo]) => (
                    <option key={valor} value={valor}>
                      {rotulo}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <output className="sr-only">
              {emails.length} e-mail(s) exibido(s)
            </output>

            {emails.length === 0 ? (
              <p>Nenhum e-mail{tipo && ` do tipo ${TIPOS[tipo].toLowerCase()}`}.</p>
            ) : (
              <ul className="space-y-3">
                {emails.map((e) => (
                  <li key={`${e.reservaId}-${e.setorId}-${e.ts}`}>
                    <article className="space-y-2 rounded-md bg-card p-4 shadow-sm break-words">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={VARIANTE[e.tipo]}>{TIPOS[e.tipo]}</Badge>
                        <h3 className="font-medium">{e.assunto}</h3>
                      </div>
                      <dl className="grid gap-x-3 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
                        <dt className="font-medium">Para</dt>
                        <dd className="break-all">
                          {e.para || '(sem e-mail)'} — {setor(e.setorId)}
                        </dd>
                        <dt className="font-medium">Enviado em</dt>
                        <dd>
                          <time dateTime={e.ts}>{formatarDataHora(e.ts)}</time>
                        </dd>
                        <dt className="font-medium">Reserva</dt>
                        <dd>{e.reservaId}</dd>
                      </dl>
                      {e.alteracoes.length > 0 && (
                        <ul className="space-y-1 font-mono text-sm" aria-label="Alterações">
                          {e.alteracoes.map((a) => (
                            <li key={a.campo}>
                              ALTERADO: {a.campo} — <del className="text-destructive">{a.antes || '(vazio)'}</del>{' '}
                              → <ins className="font-semibold">{a.depois || '(vazio)'}</ins>
                            </li>
                          ))}
                        </ul>
                      )}
                    </article>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="titulo-snp" className="space-y-3">
            <h2 id="titulo-snp" className="text-xl font-semibold">
              Pedidos SNP ({pedidos.length})
            </h2>
            {pedidos.length === 0 ? (
              <p>Nenhum pedido SNP.</p>
            ) : (
              <table className="w-full text-left text-sm break-words">
                <thead>
                  <tr className="border-b">
                    <th scope="col" className="p-2">Número</th>
                    <th scope="col" className="p-2">Reserva</th>
                    <th scope="col" className="p-2">Setor</th>
                    <th scope="col" className="p-2">Serviço</th>
                    <th scope="col" className="p-2">Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {pedidos.map((p) => (
                    <tr key={`${p.reservaId}-${p.setorId}`} className="border-b">
                      <td className="p-2 font-mono break-all">{p.numero}</td>
                      <td className="p-2">{p.reservaId}</td>
                      <td className="p-2">{setor(p.setorId)}</td>
                      <td className="p-2">{p.codigoServico}</td>
                      <td className="p-2">
                        <Badge variant={p.situacao === 'ativo' ? 'default' : 'destructive'}>
                          {p.situacao === 'ativo' ? 'Ativo' : 'Cancelado'}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}
    </section>
  )
}
