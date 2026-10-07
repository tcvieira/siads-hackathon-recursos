/**
 * Tela de login própria (R1.1): e-mail e senha autenticados direto no Cognito (SRP).
 * Contas em primeiro acesso passam por um segundo passo para definir a nova senha.
 * Em telas estreitas o painel gráfico vira uma faixa compacta no topo.
 */
import {
  CalendarDays,
  CircleAlert,
  ClipboardList,
  Eye,
  EyeOff,
  LayoutGrid,
  Loader2,
  LogIn,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useSessao } from '@/auth/contexto'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const BENEFICIOS: { icone: LucideIcon; texto: string }[] = [
  { icone: LayoutGrid, texto: 'Veja a ocupação da semana e escolha o melhor horário.' },
  { icone: ClipboardList, texto: 'Solicite ambientes e recursos em poucos passos.' },
  { icone: CalendarDays, texto: 'Acompanhe o andamento de cada solicitação.' },
]

/** Composição decorativa: grade de horários estilizada sobre o azul do cabeçalho. */
function ArteDecorativa() {
  const dias = [0, 1, 2, 3, 4]
  const blocos = [
    // [dia, y, altura, preenchimento]
    [0, 120, 150, 'white', 0.1],
    [1, 330, 90, '#8fd3b6', 0.28],
    [2, 210, 200, 'white', 0.08],
    [2, 520, 110, '#8fd3b6', 0.22],
    [3, 90, 80, '#8fd3b6', 0.2],
    [3, 400, 170, 'white', 0.1],
    [4, 260, 120, '#8fd3b6', 0.26],
    [4, 620, 130, 'white', 0.08],
  ] as const
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      className="absolute inset-0 size-full"
      viewBox="0 0 800 900"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <linearGradient id="login-fundo" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1e3a6e" />
          <stop offset="1" stopColor="#2c4f93" />
        </linearGradient>
        <pattern id="login-grade" width="80" height="60" patternUnits="userSpaceOnUse">
          <path d="M80 0H0V60" fill="none" stroke="white" strokeOpacity="0.07" strokeWidth="1" />
        </pattern>
        <radialGradient id="login-brilho" cx="0.85" cy="0.95" r="0.7">
          <stop offset="0" stopColor="#8fd3b6" stopOpacity="0.22" />
          <stop offset="1" stopColor="#8fd3b6" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="800" height="900" fill="url(#login-fundo)" />
      <rect width="800" height="900" fill="url(#login-grade)" />
      <rect width="800" height="900" fill="url(#login-brilho)" />
      {dias.map((d) => (
        <line key={d} x1={160 * d + 80} y1="0" x2={160 * d + 80} y2="900" stroke="white" strokeOpacity="0.08" />
      ))}
      {blocos.map(([dia, y, altura, cor, opacidade], i) => (
        <rect key={i} x={160 * dia + 92} y={y} width="136" height={altura} rx="8" fill={cor} fillOpacity={opacidade} />
      ))}
    </svg>
  )
}

function CampoSenha(props: {
  id: string
  rotulo: string
  nomeBotao: string
  autoComplete: 'current-password' | 'new-password'
  valor: string
  aoMudar: (valor: string) => void
  erroId?: string
}) {
  const [visivel, setVisivel] = useState(false)
  return (
    <div className="space-y-2">
      <Label htmlFor={props.id}>{props.rotulo}</Label>
      <div className="relative">
        <Input
          id={props.id}
          type={visivel ? 'text' : 'password'}
          autoComplete={props.autoComplete}
          autoCapitalize="none"
          spellCheck={false}
          required
          value={props.valor}
          onChange={(e) => props.aoMudar(e.target.value)}
          aria-describedby={props.erroId}
          aria-invalid={props.erroId ? true : undefined}
          className="h-10 pr-11"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={props.nomeBotao}
          aria-pressed={visivel}
          onClick={() => setVisivel((v) => !v)}
          className="absolute top-0 right-0 size-10"
        >
          {visivel ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
        </Button>
      </div>
    </div>
  )
}

export function TelaLogin() {
  const { entrar, confirmarNovaSenha, erro: erroSessao } = useSessao()
  const [passo, setPasso] = useState<'credenciais' | 'nova-senha'>('credenciais')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [novaSenha, setNovaSenha] = useState('')
  const [confirmacao, setConfirmacao] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const titulo = useRef<HTMLHeadingElement>(null)
  const trocouPasso = useRef(false)

  const novaSenhaPasso = passo === 'nova-senha'
  const textoTitulo = novaSenhaPasso ? 'Definir nova senha' : 'Entrar'
  const mensagem = erro ?? erroSessao
  const erroId = mensagem ? 'erro-login' : undefined

  useEffect(() => {
    document.title = `${textoTitulo} — SISGARES`
    if (trocouPasso.current) titulo.current?.focus() // anuncia a nova etapa ao leitor de tela
  }, [textoTitulo])

  const mudarPasso = (novo: typeof passo) => {
    trocouPasso.current = true
    setErro(null)
    setPasso(novo)
  }

  async function enviar(evento: FormEvent) {
    evento.preventDefault()
    if (enviando) return
    setErro(null)
    if (novaSenhaPasso && novaSenha !== confirmacao) {
      setErro('A confirmação não é igual à nova senha.')
      return
    }
    setEnviando(true)
    try {
      if (!novaSenhaPasso) {
        if ((await entrar(email, senha)) === 'nova-senha') {
          setSenha('')
          mudarPasso('nova-senha')
        }
      } else {
        await confirmarNovaSenha(novaSenha)
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível entrar agora. Tente de novo.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="grid min-h-svh md:grid-cols-[55fr_45fr]">
      <aside aria-label="Sobre o SISGARES" className="relative overflow-hidden bg-cabecalho text-white">
        <ArteDecorativa />
        <div className="relative flex h-full flex-col gap-3 px-4 py-5 md:justify-between md:gap-12 md:px-14 md:py-14">
          <p className="flex items-center gap-2 text-xl font-bold tracking-wide md:text-2xl">
            <CalendarDays aria-hidden="true" className="size-6" />
            SISGARES
          </p>
          <div className="space-y-8">
            <p className="max-w-md text-base font-semibold md:text-4xl md:leading-tight">
              Reserva de ambientes e recursos
            </p>
            <ul className="hidden max-w-md space-y-4 md:block">
              {BENEFICIOS.map(({ icone: Icone, texto }) => (
                <li key={texto} className="flex items-start gap-3 text-base text-white/90">
                  <Icone aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-[#8fd3b6]" />
                  {texto}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </aside>

      <main className="flex items-start justify-center px-4 py-8 md:items-center md:py-12">
        <Card className="w-full max-w-md">
          <CardContent>
            <form onSubmit={(e) => void enviar(e)} className="flex flex-col gap-5">
              <div className="space-y-1">
                <h1 ref={titulo} tabIndex={-1} className="text-2xl font-semibold outline-none">
                  {textoTitulo}
                </h1>
                <p className="text-sm text-muted-foreground">
                  {novaSenhaPasso
                    ? 'Este é o seu primeiro acesso. Defina uma nova senha para continuar.'
                    : 'Use o e-mail e a senha da sua conta no SISGARES.'}
                </p>
              </div>

              {mensagem && (
                <p
                  id="erro-login"
                  role="alert"
                  className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
                >
                  <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                  {mensagem}
                </p>
              )}

              {novaSenhaPasso ? (
                <>
                  <CampoSenha
                    id="nova-senha"
                    rotulo="Nova senha"
                    nomeBotao="Mostrar nova senha"
                    autoComplete="new-password"
                    valor={novaSenha}
                    aoMudar={setNovaSenha}
                    erroId={erroId}
                  />
                  <CampoSenha
                    id="confirmacao-senha"
                    rotulo="Confirmar nova senha"
                    nomeBotao="Mostrar confirmação da nova senha"
                    autoComplete="new-password"
                    valor={confirmacao}
                    aoMudar={setConfirmacao}
                    erroId={erroId}
                  />
                  <p className="text-sm text-muted-foreground">
                    A senha deve seguir a política da conta: em geral, 8 ou mais caracteres com maiúsculas,
                    minúsculas, número e símbolo.
                  </p>
                </>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="email">E-mail</Label>
                    <Input
                      id="email"
                      type="email"
                      inputMode="email"
                      autoComplete="username"
                      autoCapitalize="none"
                      spellCheck={false}
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      aria-describedby={erroId}
                      aria-invalid={erroId ? true : undefined}
                      className="h-10"
                    />
                  </div>
                  <CampoSenha
                    id="senha"
                    rotulo="Senha"
                    nomeBotao="Mostrar senha"
                    autoComplete="current-password"
                    valor={senha}
                    aoMudar={setSenha}
                    erroId={erroId}
                  />
                </>
              )}

              <output className="sr-only">{enviando ? 'Entrando…' : ''}</output>
              <div className="flex flex-col gap-2">
                <Button type="submit" size="lg" aria-disabled={enviando} className="aria-disabled:opacity-70">
                  {enviando ? <Loader2 aria-hidden="true" className="animate-spin" /> : <LogIn aria-hidden="true" />}
                  {enviando ? 'Entrando…' : novaSenhaPasso ? 'Definir senha e entrar' : 'Entrar'}
                </Button>
                {novaSenhaPasso && (
                  <Button type="button" variant="ghost" size="lg" onClick={() => mudarPasso('credenciais')}>
                    Voltar
                  </Button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
