---
inclusion: always
---

# Mensagens de commit — Conventional Commits em pt-BR

Todo commit deste repositório segue o [Conventional Commits 1.0.0](https://www.conventionalcommits.org/pt-br/v1.0.0/),
com descrição e corpo em **português do Brasil**. Os tipos ficam em inglês, como na especificação.

## Formato

```
<tipo>(<escopo opcional>): <descrição>

<corpo opcional>

<rodapé(s) opcional(is)>
```

- **Descrição:** imperativo, minúscula inicial, sem ponto final, até ~72 caracteres.
  Ex.: `adiciona checagem de conflito pai/filho`, não `Adicionada checagem...`.
- **Corpo:** explica o **porquê** e o contexto; linhas de até ~100 caracteres; separado por linha em branco.
- **Rodapé:** `Refs: R3, RN6` para rastrear requisitos da spec; `BREAKING CHANGE: <descrição>` quando houver.
- Mudança incompatível também pode ser marcada com `!`: `feat(api)!: ...`.

## Tipos

| Tipo | Uso |
|---|---|
| `feat` | nova funcionalidade |
| `fix` | correção de bug |
| `docs` | só documentação (README, specs, ARQUITETURA.md) |
| `test` | adiciona ou corrige testes |
| `refactor` | mudança de código sem alterar comportamento |
| `perf` | melhoria de desempenho |
| `style` | formatação, sem mudança de lógica |
| `build` | dependências, empacotamento, `template.yaml` de build |
| `ci` | pipelines e automações de CI |
| `chore` | manutenção que não se encaixa acima (gitignore, configs do Kiro) |
| `revert` | reverte commit anterior |

## Escopos sugeridos

`dominio`, `api`, `auth`, `notificacoes`, `infra`, `seed`, `frontend`, `grade`, `atendimento`,
`a11y`, `spec`, `steering`, `docs`. Use o mais específico que fizer sentido; omita se o commit
for transversal.

## Regras práticas

- Um commit = uma mudança lógica. Separe `feat` de `test` só quando forem independentes.
- Nunca commitar `.env` ou credenciais.
- Commits feitos por agentes seguem o mesmo padrão.

## Exemplos

```
feat(dominio): bloqueia reserva dentro da margem de 30 minutos

A margem conta nos dois sentidos: antes do início e depois do término
do período já existente.

Refs: R3.1, RN5
```

```
fix(auth): converte cognito:groups de string para lista
```

```
docs(spec): adiciona requisitos, design e plano do MVP
```
