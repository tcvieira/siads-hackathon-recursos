"""comum/repo.py contra a tabela simulada (moto): chaves do design §3, locks, transações,
cancelamento, contadores, listagens e idempotência das notificações."""

from decimal import Decimal

import pytest
from boto3.dynamodb.conditions import Key
from boto3.dynamodb.types import TypeSerializer

import catalogo_csv
from comum.repo import (
    ConflitoConcorrente,
    Repositorio,
    chave_lock_ambiente,
    chave_lock_recurso,
    obter_repo,
    reserva_de_imagem,
)
from dominio.modelos import (
    Alteracao,
    EmailSimulado,
    ItemRecurso,
    PedidoSnp,
    Periodo,
    Reserva,
)

D = "2026-11-10T"
F = ":00-03:00"


def p(ini: str, fim: str, dia: str = D) -> Periodo:
    return Periodo(f"{dia}{ini}{F}", f"{dia}{fim}{F}")


def nova_reserva(id_="9001", ambiente="3", periodos=None, recursos=None, sub="sub-1") -> Reserva:
    return Reserva(id=id_, finalidade="Reunião de alinhamento", participantes=12, ambienteId=ambiente,
                   periodos=periodos or [p("14:00", "16:00"), p("09:00", "10:00", "2026-11-11T")],
                   recursos=recursos if recursos is not None else [ItemRecurso("6", 2),
                                                                    ItemRecurso("2", 1)],
                   solicitanteSub=sub, solicitanteEmail="solicitante@example.com",
                   setoresIds=["1", "2", "3"], cancelada=False, versao=0,
                   criadoEm="2026-11-01T10:00:00-03:00", disposicaoId="5")


def itens_seed(rid="777", ambiente="1") -> list[dict]:
    """Itens exatamente como `itens_da_reserva()` do scripts/seed.py grava."""
    ini, fim, criado = f"{D}09:00{F}", f"{D}11:00{F}", "2026-11-03T08:00:00-03:00"
    return [
        {"PK": f"RESE#{rid}", "SK": "META", "GSI1PK": "SOLI#ficticio-01", "GSI1SK": criado,
         "id": rid, "finalidade": "Seminário institucional", "participantes": 20,
         "periodos": [{"inicio": ini, "termino": fim}], "recursos": [{"recursoId": "3", "qtd": 1}],
         "solicitanteSub": "ficticio-01", "solicitanteEmail": "pessoa01@example.com",
         "setoresIds": ["1"], "cancelada": False, "versao": 1, "criadoEm": criado,
         "ambienteId": ambiente, "disposicaoId": "5"},
        {"PK": f"OCUP#AMBI#{ambiente}", "SK": f"{ini}#{rid}#0", "reservaId": rid, "inicio": ini,
         "termino": fim},
        {"PK": f"RESE#{rid}", "SK": "PER#0", "GSI1PK": "AGENDA", "GSI1SK": f"{ini}#{rid}",
         "reservaId": rid, "inicio": ini, "termino": fim, "cancelada": False, "setoresIds": ["1"],
         "ambienteId": ambiente},
    ]


@pytest.fixture
def repo(tabela) -> Repositorio:
    return obter_repo()


@pytest.fixture
def cad(repo):
    return repo.carregar_cadastros()


def chaves(tabela, pk: str) -> list[str]:
    return [i["SK"] for i in tabela.query(KeyConditionExpression=Key("PK").eq(pk))["Items"]]


def todos(tabela) -> list[dict]:
    return tabela.scan()["Items"]


def locks() -> dict[str, int]:
    """Locks da Sala 9º andar e do projetor ainda não criados (versão 0)."""
    return {chave_lock_ambiente("3"): 0, chave_lock_recurso("6"): 0}


# --- cache e cadastros ---------------------------------------------------------------------


def test_obter_repo_usa_table_name_e_cache(repo, tabela):
    assert repo.tabela.name == "sisgares"
    assert obter_repo() is repo


def test_carregar_cadastros_igual_ao_csv(cad):
    esperado, setores, vinculos = catalogo_csv.carregar()
    c = cad.catalogo
    assert c.config == esperado.config
    assert sorted(a.id for a in c.ambientes) == sorted(a.id for a in esperado.ambientes)
    assert [g.id for g in c.grupos] == [g.id for g in esperado.grupos]  # ativos, por ordem
    assert {r.id: r for r in c.recursos} == {r.id: r for r in esperado.recursos}
    projetor = next(r for r in c.recursos if r.id == "6")
    assert type(projetor.disponibilidade) is int and projetor.disponibilidade == 2
    assert cad.setores == {s.id: s for s in setores}
    assert sorted(cad.vinculos, key=repr) == sorted(vinculos, key=repr)
    assert "6" in cad.limitados() and "2" not in cad.limitados()


def test_catalogo_publico_so_ativos(cad):
    pub = cad.catalogo_publico()
    assert pub.ambientes and all(a.ativo for a in pub.ambientes)
    assert "2" not in {a.id for a in pub.ambientes}          # Sala 5º andar inativa
    assert all(r.ativo for r in pub.recursos) and "7" not in {r.id for r in pub.recursos}
    assert all(d.ativo for d in pub.disposicoes)
    assert len(pub.ambientes) < len(cad.catalogo.ambientes)


# --- criação -------------------------------------------------------------------------------


def test_criacao_grava_chaves_do_design(repo, tabela, cad):
    salva = repo.salvar_reserva(nova_reserva(), None, locks(), cad)
    assert salva.versao == 1 and salva.cancelada is False

    assert sorted(chaves(tabela, "RESE#9001")) == ["META", "PER#0", "PER#1"]
    assert sorted(chaves(tabela, "OCUP#AMBI#3")) == [f"{D}14:00{F}#9001#0",
                                                     f"2026-11-11T09:00{F}#9001#1"]
    # Só o projetor (limitado) ocupa; o café (não limitado) não.
    assert len(chaves(tabela, "OCUP#RECU#6")) == 2
    assert chaves(tabela, "OCUP#RECU#2") == []

    meta = tabela.get_item(Key={"PK": "RESE#9001", "SK": "META"})["Item"]
    assert meta["GSI1PK"] == "SOLI#sub-1" and meta["GSI1SK"] == "2026-11-01T10:00:00-03:00"
    assert meta["versao"] == 1 and "status" not in meta and "complemento" not in meta
    # Mesmos atributos que o seed grava.
    assert set(meta) == set(itens_seed()[0])
    per = tabela.get_item(Key={"PK": "RESE#9001", "SK": "PER#0"})["Item"]
    assert set(per) == set(itens_seed()[2])
    assert per["GSI1PK"] == "AGENDA" and per["GSI1SK"] == f"{D}14:00{F}#9001"
    ocup = tabela.get_item(Key={"PK": "OCUP#RECU#6", "SK": f"{D}14:00{F}#9001#0"})["Item"]
    assert ocup["qtd"] == 2 and ocup["reservaId"] == "9001"

    assert repo.ler_versoes_locks([chave_lock_ambiente("3"), chave_lock_recurso("6"),
                                   chave_lock_recurso("8")]) == {
        "LOCK#AMBI#3": 1, "LOCK#RECU#6": 1, "LOCK#RECU#8": 0}


def test_local_proprio_sem_ocup_ambiente(repo, tabela, cad):
    r = nova_reserva(ambiente=None, recursos=[ItemRecurso("2", 1)])
    r.complemento = "Sala da unidade"
    repo.salvar_reserva(r, None, {}, cad)
    per = tabela.get_item(Key={"PK": "RESE#9001", "SK": "PER#0"})["Item"]
    assert "ambienteId" not in per
    meta = tabela.get_item(Key={"PK": "RESE#9001", "SK": "META"})["Item"]
    assert "ambienteId" not in meta and meta["complemento"] == "Sala da unidade"
    assert not [i for i in todos(tabela) if i["PK"].startswith("OCUP#")]
    # META sem `ambienteId` (como o seed grava) volta como local próprio.
    assert repo.obter_reserva("9001").ambienteId is None
    assert repo.obter_metas(["9001"])[0].ambienteId is None


def test_obter_reserva_no_formato_do_seed(repo, tabela):
    for item in itens_seed():
        tabela.put_item(Item=item)
    r = repo.obter_reserva("777")
    assert r == Reserva(id="777", finalidade="Seminário institucional", participantes=20,
                        ambienteId="1", periodos=[p("09:00", "11:00")],
                        recursos=[ItemRecurso("3", 1)], solicitanteSub="ficticio-01",
                        solicitanteEmail="pessoa01@example.com", setoresIds=["1"],
                        cancelada=False, versao=1, criadoEm="2026-11-03T08:00:00-03:00",
                        disposicaoId="5")
    assert type(r.participantes) is int and type(r.recursos[0].qtd) is int
    assert repo.obter_reserva("inexistente") is None


def test_lock_com_versao_desatualizada_conflita(repo, tabela, cad):
    repo.salvar_reserva(nova_reserva(), None, locks(), cad)
    antes = len(todos(tabela))
    outra = nova_reserva(id_="9002", periodos=[p("18:00", "19:00")])
    with pytest.raises(ConflitoConcorrente):
        repo.salvar_reserva(outra, None, {"LOCK#AMBI#3": 0, "LOCK#RECU#6": 0}, cad)
    assert len(todos(tabela)) == antes  # nada gravado
    # Com as versões atuais, passa.
    atuais = repo.ler_versoes_locks(["LOCK#AMBI#3", "LOCK#RECU#6"])
    repo.salvar_reserva(outra, None, atuais, cad)
    assert repo.ler_versoes_locks(["LOCK#AMBI#3"]) == {"LOCK#AMBI#3": 2}


def test_criacao_com_id_existente_conflita(repo, cad):
    repo.salvar_reserva(nova_reserva(), None, {}, cad)
    with pytest.raises(ConflitoConcorrente):
        repo.salvar_reserva(nova_reserva(), None, {}, cad)


# --- alteração e cancelamento --------------------------------------------------------------


def test_alteracao_remove_ocupacoes_antigas(repo, tabela, cad):
    antiga = repo.salvar_reserva(nova_reserva(), None, locks(), cad)
    nova = nova_reserva(ambiente="7", periodos=[p("15:00", "17:00")],
                        recursos=[ItemRecurso("8", 1)])
    vers = repo.ler_versoes_locks(["LOCK#AMBI#7", "LOCK#RECU#8"])
    salva = repo.salvar_reserva(nova, antiga, vers, cad)
    assert salva.versao == 2

    assert chaves(tabela, "OCUP#AMBI#3") == []
    assert chaves(tabela, "OCUP#RECU#6") == []
    assert chaves(tabela, "OCUP#AMBI#7") == [f"{D}15:00{F}#9001#0"]
    assert chaves(tabela, "OCUP#RECU#8") == [f"{D}15:00{F}#9001#0"]
    assert sorted(chaves(tabela, "RESE#9001")) == ["META", "PER#0"]
    lida = repo.obter_reserva("9001")
    assert lida.ambienteId == "7" and lida.versao == 2 and lida.periodos == [p("15:00", "17:00")]


def test_alteracao_mantem_chave_igual(repo, tabela, cad):
    antiga = repo.salvar_reserva(nova_reserva(), None, {}, cad)
    nova = nova_reserva()
    nova.finalidade = "Outra finalidade"
    repo.salvar_reserva(nova, antiga, {}, cad)
    assert len(chaves(tabela, "OCUP#AMBI#3")) == 2
    assert repo.obter_reserva("9001").finalidade == "Outra finalidade"


def test_alteracao_com_meta_desatualizado_conflita(repo, cad):
    antiga = repo.salvar_reserva(nova_reserva(), None, {}, cad)
    repo.salvar_reserva(nova_reserva(), antiga, {}, cad)  # versao 2 na tabela
    with pytest.raises(ConflitoConcorrente):
        repo.salvar_reserva(nova_reserva(), antiga, {}, cad)


def test_cancelamento_remove_ocup_e_marca_per(repo, tabela, cad):
    salva = repo.salvar_reserva(nova_reserva(), None, locks(), cad)
    cancelada = repo.cancelar_reserva(salva, cad)
    assert cancelada.cancelada and cancelada.versao == 2
    assert not [i for i in todos(tabela) if i["PK"].startswith("OCUP#")]
    for sk in ("PER#0", "PER#1"):
        assert tabela.get_item(Key={"PK": "RESE#9001", "SK": sk})["Item"]["cancelada"] is True
    meta = repo.obter_reserva("9001")
    assert meta.cancelada and meta.versao == 2
    with pytest.raises(ConflitoConcorrente):  # versão já mudou
        repo.cancelar_reserva(salva, cad)


def test_cancelamento_de_reserva_do_seed(repo, tabela, cad):
    for item in itens_seed():
        tabela.put_item(Item=item)
    repo.cancelar_reserva(repo.obter_reserva("777"), cad)
    assert chaves(tabela, "OCUP#AMBI#1") == []
    assert repo.obter_reserva("777").cancelada


def test_salvar_sem_cadastros_carrega_o_catalogo(repo, tabela):
    repo.salvar_reserva(nova_reserva(), None, {})
    assert len(chaves(tabela, "OCUP#RECU#6")) == 2


# --- contadores e ocupações ----------------------------------------------------------------


def test_contador_rese_e_snp(repo):
    ultimo = next(i["valor"] for i in catalogo_csv.itens_tabela() if i["PK"] == "CTR#RESE")
    assert repo.proximo_numero("RESE") == ultimo + 1
    assert repo.proximo_numero("RESE") == ultimo + 2
    assert repo.proximo_numero("SNP") == 1
    assert type(repo.proximo_numero("SNP")) is int


def test_ocupacoes_filtradas_por_ate(repo, cad):
    repo.salvar_reserva(nova_reserva(), None, {}, cad)
    todas = repo.ocupacoes_ambiente("3", "2026-11-12T00:00:00-03:00")
    assert [o.inicio for o in todas] == [f"{D}14:00{F}", f"2026-11-11T09:00{F}"]
    assert repo.ocupacoes_ambiente("3", f"{D}23:59{F}", consistente=False)[0].reservaId == "9001"
    assert len(repo.ocupacoes_ambiente("3", f"{D}14:00{F}")) == 0  # SK < ate
    rec = repo.ocupacoes_recurso("6", "2026-11-12T00:00:00-03:00")
    assert [o.qtd for o in rec] == [2, 2]


# --- listagens -----------------------------------------------------------------------------


def test_listagens(repo, tabela, cad):
    repo.salvar_reserva(nova_reserva("9001", sub="sub-a"), None, {}, cad)
    repo.salvar_reserva(nova_reserva("9002", ambiente="7", periodos=[p("08:00", "09:00")],
                                     recursos=[], sub="sub-a"), None, {}, cad)
    repo.salvar_reserva(nova_reserva("9003", ambiente="28", periodos=[p("10:00", "11:00")],
                                     recursos=[], sub="sub-b"), None, {}, cad)

    assert [r.id for r in repo.listar_por_solicitante("sub-a")] == ["9001", "9002"]
    assert repo.listar_por_solicitante("ninguem") == []

    ag = repo.agenda(f"{D}00:00{F}", f"{D}23:59{F}")
    assert [(a.reservaId, a.inicio) for a in ag] == [("9002", f"{D}08:00{F}"),
                                                     ("9003", f"{D}10:00{F}"),
                                                     ("9001", f"{D}14:00{F}")]
    assert ag[0].ambienteId == "7" and ag[0].setoresIds == ["1", "2", "3"]
    assert ag[0].cancelada is False

    metas = repo.obter_metas(["9003", "9001", "9003", "inexistente"])
    assert [m.id for m in metas] == ["9003", "9001"]


def test_obter_metas_em_lotes(repo, tabela):
    with tabela.batch_writer() as lote:
        for n in range(130):
            item = dict(itens_seed(rid=str(5000 + n))[0])
            lote.put_item(Item=item)
    ids = [str(5000 + n) for n in range(130)]
    assert [m.id for m in repo.obter_metas(ids)] == ids
    assert repo.obter_metas([]) == []


# --- notificações --------------------------------------------------------------------------


def email(setor="2", ts="2026-11-05T10:00:00-03:00") -> EmailSimulado:
    return EmailSimulado(reservaId="9001", ts=ts, setorId=setor, para="seart@example.com",
                         assunto="[SISGARES] Reserva 9001 alterada", tipo="alterada",
                         html="<p>x</p>",
                         alteracoes=[Alteracao("Períodos", "10/11 14:00–16:00", "10/11 15:00–17:00")])


def pedido(setor="2", situacao="ativo") -> PedidoSnp:
    return PedidoSnp(reservaId="9001", setorId=setor, numero="SNP-2026-00001",
                     codigoServico="SNP-TI-0006", situacao=situacao)


def test_gravar_notificacoes_idempotente(repo, tabela):
    assert repo.gravar_notificacoes("9001", "evt-1", [email(), email("3")], [pedido()]) is True
    antes = sorted(i["SK"] for i in todos(tabela) if i["PK"] == "RESE#9001")
    assert antes == ["EMAIL#2026-11-05T10:00:00-03:00#2", "EMAIL#2026-11-05T10:00:00-03:00#3",
                     "EVT#evt-1", "SNP#2"]

    # Mesmo eventID (retentativa do stream), mesmo com conteúdo diferente: nada novo.
    assert repo.gravar_notificacoes("9001", "evt-1", [email("1", ts="2026-11-05T11:00:00-03:00")],
                                    [pedido(situacao="cancelado")]) is False
    depois = sorted(i["SK"] for i in todos(tabela) if i["PK"] == "RESE#9001")
    assert depois == antes
    assert repo.pedidos_snp("9001") == [pedido()]

    # Outro evento grava normalmente (upsert do SNP#).
    assert repo.gravar_notificacoes("9001", "evt-2", [], [pedido(situacao="cancelado")]) is True
    assert repo.pedidos_snp("9001")[0].situacao == "cancelado"


def test_notificacoes_por_intervalo(repo):
    repo.gravar_notificacoes("9001", "evt-1", [email("2", "2026-11-05T10:00:00-03:00"),
                                               email("3", "2026-11-07T10:00:00-03:00")], [])
    lidos = repo.notificacoes("2026-11-05T00:00:00-03:00", "2026-11-06T00:00:00-03:00")
    assert lidos == [email("2", "2026-11-05T10:00:00-03:00")]
    assert isinstance(lidos[0].alteracoes[0], Alteracao)
    assert repo.pedidos_snp("inexistente") == []


# --- stream --------------------------------------------------------------------------------


def test_reserva_de_imagem(repo, tabela):
    meta = itens_seed()[0]
    serializar = TypeSerializer().serialize
    imagem = {k: serializar(Decimal(v) if isinstance(v, int) and not isinstance(v, bool) else v)
              for k, v in meta.items()}
    r = reserva_de_imagem(imagem)
    for item in itens_seed():
        tabela.put_item(Item=item)
    assert r == repo.obter_reserva("777")
    assert type(r.versao) is int
