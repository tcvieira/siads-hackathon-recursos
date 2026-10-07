"""Lambda `paineis`: /ambientes/{id}/ocupacao, /painel/atendimento e /notificacoes (design.md §4).

Stub da Fase 0: só existe para o template SAM já apontar para o handler.
A implementação real entra na tarefa 2.9.
"""

import json


def handler(event, context):
    return {
        "statusCode": 501,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps({"mensagem": "Não implementado"}),
    }
