go Hackatudo!

## Credenciais AWS para o CLI

Copie `.env-example` para `.env` e preencha `AWS_DEFAULT_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` e `AWS_SESSION_TOKEN`. Depois, na raiz do projeto:

```bash
set -a
source .env
set +a
```

O `set -a` exporta automaticamente todas as variáveis definidas pelo `source`; o `set +a` desliga isso.

Para conferir:

```bash
aws sts get-caller-identity
```

Deve aparecer `assumed-role/WSParticipantRole/Participant`.

Observações:

- Vale só para o terminal atual. Em outra aba, rode o `source` de novo.
- As credenciais são temporárias. Se aparecer `ExpiredToken`, pegue novas no portal do workshop e atualize o `.env`.
- Se o `.env` foi salvo no Windows (com `\r` no fim das linhas), rode uma vez `sed -i 's/\r$//' .env`.
- Não commite o `.env`.
