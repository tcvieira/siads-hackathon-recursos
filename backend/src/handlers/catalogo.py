"""Lambda `catalogo`: GET /catalogo (design.md §4).

Stub da Fase 0: só existe para o template SAM já apontar para o handler.
A implementação real entra na tarefa 2.8.
"""

import json


def handler(event, context):
    return {
        "statusCode": 501,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps({"mensagem": "Não implementado"}),
    }
