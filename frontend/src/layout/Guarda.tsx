import type { ReactNode } from 'react'
import { Link, Navigate } from 'react-router'
import { useUsuario } from '@/auth/contexto'
import { pode, type Papel } from '@/auth/usuario'
import { TituloPagina } from '@/componentes/TituloPagina'

/** Guarda de rota por grupo do Cognito: sem o papel, mostra "Acesso negado". */
export function Guarda({ papeis, children }: { papeis: readonly Papel[]; children: ReactNode }) {
  const usuario = useUsuario()
  if (pode(usuario, papeis)) return children
  return (
    <section className="space-y-4">
      <TituloPagina>Acesso negado</TituloPagina>
      <p>Seu perfil não tem acesso a esta tela.</p>
      <p>
        <Link to="/" className="underline underline-offset-4">
          Ir para a tela inicial
        </Link>
      </p>
    </section>
  )
}

/** `/`: solicitante → /grade; atendente e admin → /atendimento (design.md §7). */
export function Inicio() {
  const usuario = useUsuario()
  return <Navigate to={pode(usuario, ['atendente', 'admin']) ? '/atendimento' : '/grade'} replace />
}

export function NaoEncontrada() {
  return (
    <section className="space-y-4">
      <TituloPagina>Página não encontrada</TituloPagina>
      <p>
        <Link to="/" className="underline underline-offset-4">
          Ir para a tela inicial
        </Link>
      </p>
    </section>
  )
}
