import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect } from 'react'
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router'
import { ErroApi } from '@/api/cliente'
import { useSessao } from '@/auth/contexto'
import { ProvedorSessao } from '@/auth/sessao'
import { Toaster } from '@/components/ui/sonner'
import { configuracaoAusente } from '@/config'
import { Guarda, Inicio, NaoEncontrada } from '@/layout/Guarda'
import Layout from '@/layout/Layout'
import { ConfiguracaoAusente, TelaCarregando } from '@/layout/TelaAvulsa'
import { TelaLogin } from '@/layout/TelaLogin'
import Atendimento from '@/paginas/Atendimento'
import FormularioReserva from '@/paginas/FormularioReserva'
import Grade from '@/paginas/Grade'
import MinhasReservas from '@/paginas/MinhasReservas'
import Notificacoes from '@/paginas/Notificacoes'

const SOLICITANTE = ['solicitante', 'admin'] as const
const ATENDENTE = ['atendente', 'admin'] as const

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { index: true, element: <Inicio /> },
      { path: 'grade', element: <Guarda papeis={SOLICITANTE}><Grade /></Guarda> },
      { path: 'grade2', element: <Navigate to="/grade" replace /> },
      { path: 'reservas/nova', element: <Guarda papeis={SOLICITANTE}><FormularioReserva /></Guarda> },
      { path: 'reservas/:id/editar', element: <Guarda papeis={SOLICITANTE}><FormularioReserva /></Guarda> },
      { path: 'minhas-reservas', element: <Guarda papeis={SOLICITANTE}><MinhasReservas /></Guarda> },
      { path: 'atendimento', element: <Guarda papeis={ATENDENTE}><Atendimento /></Guarda> },
      { path: 'notificacoes', element: <Guarda papeis={ATENDENTE}><Notificacoes /></Guarda> },
      { path: '*', element: <NaoEncontrada /> },
    ],
  },
])

const clienteQuery = new QueryClient({
  defaultOptions: {
    queries: {
      // 4xx não melhora tentando de novo.
      retry: (falhas, erro) => falhas < 2 && !(erro instanceof ErroApi && erro.status >= 400 && erro.status < 500),
      refetchOnWindowFocus: false,
    },
  },
})

function Portao() {
  const { carregando, usuario } = useSessao()
  // Sem sessão a URL volta para "/": depois do login, "/" redireciona pelo papel.
  useEffect(() => {
    if (!carregando && !usuario) void router.navigate('/', { replace: true })
  }, [carregando, usuario])
  if (carregando) return <TelaCarregando />
  if (!usuario) return <TelaLogin />
  return <RouterProvider router={router} />
}

export default function App() {
  if (configuracaoAusente.length) return <ConfiguracaoAusente nomes={configuracaoAusente} />
  return (
    <QueryClientProvider client={clienteQuery}>
      <ProvedorSessao>
        <Portao />
      </ProvedorSessao>
      <Toaster theme="light" position="top-right" />
    </QueryClientProvider>
  )
}
