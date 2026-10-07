/** Mensagens em pt-BR para os erros do Cognito (via Amplify) no login e na troca de senha. */

export function mensagemErroAuth(erro: unknown, etapa: 'entrar' | 'nova-senha' = 'entrar'): string {
  const nome = erro instanceof Error ? erro.name : ''
  switch (nome) {
    case 'NotAuthorizedException':
      return etapa === 'nova-senha'
        ? 'A sessão de troca de senha expirou. Volte e entre novamente.'
        : 'E-mail ou senha incorretos.'
    case 'UserNotFoundException':
    case 'EmptySignInUsername':
    case 'EmptySignInPassword':
      return 'E-mail ou senha incorretos.'
    case 'PasswordResetRequiredException':
      return 'Sua senha precisa ser redefinida. Procure a administração do sistema.'
    case 'UserNotConfirmedException':
      return 'Sua conta ainda não foi confirmada. Procure a administração do sistema.'
    case 'InvalidPasswordException':
    case 'InvalidParameterException':
      return 'A nova senha não atende à política de senhas (tamanho mínimo, maiúsculas, minúsculas, número e símbolo).'
    case 'LimitExceededException':
    case 'TooManyRequestsException':
    case 'TooManyFailedAttemptsException':
      return 'Muitas tentativas. Aguarde alguns minutos e tente de novo.'
    case 'NetworkError':
      return 'Não foi possível falar com o servidor. Verifique a conexão e tente de novo.'
    default:
      return erro instanceof TypeError
        ? 'Não foi possível falar com o servidor. Verifique a conexão e tente de novo.'
        : 'Não foi possível entrar agora. Tente de novo.'
  }
}
