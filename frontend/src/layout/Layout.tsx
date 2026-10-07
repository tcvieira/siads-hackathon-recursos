/**
 * Leiaute das telas logadas: skip link, header com nav "Principal" (menu por papel, R1.4), main.
 * Ao trocar de rota, o foco vai para o `<h1>` da nova página (TituloPagina).
 */
import { LogOut } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { useSessao, useUsuario } from '@/auth/contexto'
import { PAPEIS, pode, type Papel } from '@/auth/usuario'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const MENU: { para: string; rotulo: string; papeis: Papel[] }[] = [
  { para: '/grade', rotulo: 'Grade de horários', papeis: ['solicitante', 'admin'] },
  { para: '/minhas-reservas', rotulo: 'Minhas reservas', papeis: ['solicitante', 'admin'] },
  { para: '/atendimento', rotulo: 'Atendimento', papeis: ['atendente', 'admin'] },
  { para: '/notificacoes', rotulo: 'Notificações', papeis: ['atendente', 'admin'] },
]

const NOME_PAPEL: Record<Papel, string> = { solicitante: 'Solicitante', atendente: 'Atendente', admin: 'Administrador' }

export default function Layout() {
  const { sair, trocarPapel } = useSessao()
  const usuario = useUsuario()
  const navegar = useNavigate()
  const { pathname } = useLocation()
  const rotaAnterior = useRef(pathname)

  useEffect(() => {
    if (rotaAnterior.current === pathname) return
    rotaAnterior.current = pathname
    document.querySelector<HTMLElement>('main h1')?.focus()
  }, [pathname])

  return (
    <div className="flex min-h-svh flex-col">
      <a
        href="#conteudo"
        className="sr-only z-50 rounded-md bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:absolute focus:top-2 focus:left-2"
      >
        Pular para o conteúdo
      </a>
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <p className="text-lg font-semibold">SISGARES</p>
          <nav aria-label="Principal" className="flex-1">
            <ul className="flex flex-wrap gap-1">
              {MENU.filter((item) => pode(usuario, item.papeis)).map((item) => (
                <li key={item.para}>
                  <NavLink
                    to={item.para}
                    className={({ isActive }) =>
                      cn(
                        'inline-flex min-h-9 items-center rounded-md px-3 py-1.5 text-sm font-medium hover:bg-muted',
                        isActive && 'bg-primary text-primary-foreground hover:bg-primary',
                      )
                    }
                  >
                    {item.rotulo}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            {trocarPapel && (
              <label className="flex items-center gap-2">
                <span>Papel simulado</span>
                <select
                  className="min-h-9 rounded-md border border-input bg-background px-2"
                  value={usuario.papel}
                  onChange={(e) => {
                    trocarPapel(e.target.value as Papel)
                    void navegar('/')
                  }}
                >
                  {PAPEIS.map((p) => (
                    <option key={p} value={p}>
                      {NOME_PAPEL[p]}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <p>
              <span className="text-muted-foreground">{NOME_PAPEL[usuario.papel]}:</span> {usuario.email}
            </p>
            {!trocarPapel && (
              <Button variant="outline" size="sm" onClick={sair}>
                <LogOut aria-hidden="true" />
                Sair
              </Button>
            )}
          </div>
        </div>
      </header>
      <main id="conteudo" tabIndex={-1} className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 outline-none">
        <Outlet />
      </main>
    </div>
  )
}
