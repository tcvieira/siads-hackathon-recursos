"""Lambda `notificacoes`: consumidor do DynamoDB Stream (design.md §6).

Stub da Fase 0: descarta o lote sem erro, para não travar o shard nem gerar retentativas.
Por isso as reservas gravadas pelo seed antes do redeploy não geram e-mails (design.md §10).
A implementação real entra na tarefa 2.10.
"""


def handler(event, context):
    return None
