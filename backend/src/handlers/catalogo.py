"""Lambda `catalogo`: GET /catalogo (design.md §4; R2.8).

Devolve só itens ativos (ambientes, disposições, grupos e recursos com vínculos e `limitado`) e
a configuração. `Catalogo` não tem e-mail de setor.
"""

from aws_lambda_powertools.event_handler import APIGatewayHttpResolver

from comum.http import registrar_erros, resposta, usuario_do_evento
from comum.repo import obter_repo

app = APIGatewayHttpResolver()
registrar_erros(app)


@app.get("/catalogo")
def obter_catalogo():
    usuario_do_evento(app)  # qualquer autenticado
    return resposta(obter_repo().carregar_cadastros().catalogo_publico())


def handler(event, context):
    return app.resolve(event, context)
