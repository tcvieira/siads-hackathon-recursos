"""Catálogo dos CSVs do caso (docs/requisitos/dados/) para os testes.

Segue a mesma lógica de `montar_catalogo()` do `scripts/seed.py`, sem importá-lo (ele puxa
dotenv e boto3). `carregar()` devolve as dataclasses do domínio; `itens_tabela()` devolve os
itens `CAT#…` e `CTR#…` no formato gravado pelo seed, para os testes com a moto.
"""

import csv
from collections import defaultdict
from pathlib import Path

from dominio.modelos import (
    Ambiente,
    Catalogo,
    Config,
    Disposicao,
    GrupoRecurso,
    Recurso,
    Setor,
    VinculoSetor,
)

DADOS = Path(__file__).resolve().parents[2] / "docs" / "requisitos" / "dados"
CONFIG = {"faixaInicio": "07:00", "faixaFim": "20:00", "antecedenciaMin": 120, "margemMin": 30}

# R11.4: vínculos (setor, recurso) com código de serviço do SNP, iguais aos do seed.
CODIGOS_SNP = {("2", "6"): "SNP-TI-0006", ("2", "8"): "SNP-TI-0008", ("2", "96"): "SNP-TI-0096",
               ("3", "5"): "SNP-LOG-0005"}


def _ler(nome: str) -> list[dict]:
    with open(DADOS / nome, encoding="utf-8") as arq:
        return list(csv.DictReader(arq))


def _por_int(ids) -> list[str]:
    return sorted(ids, key=int)


def itens_tabela() -> list[dict]:
    """Itens CAT#… e os contadores CTR#RESE / CTR#SNP, como o seed grava."""
    setores_ambiente, setores_recurso = defaultdict(list), defaultdict(list)
    vinculos_recurso = defaultdict(set)
    itens = []

    for v in _ler("dados-envolvido-ambiente.csv"):
        setores_ambiente[v["EAMB_AMBI_ID"]].append(v["EAMB_ENVO_ID"])
        itens.append({"PK": "CAT#VINC", "SK": f"AMBI#{v['EAMB_AMBI_ID']}#ENVO#{v['EAMB_ENVO_ID']}",
                      "tipo": "AMBI", "alvoId": v["EAMB_AMBI_ID"], "setorId": v["EAMB_ENVO_ID"]})
    for v in _ler("dados-envolvido-recurso.csv"):
        setor, recurso = v["EREC_ENVO_ID"], v["EREC_RECU_ID"]
        setores_recurso[recurso].append(setor)
        item = {"PK": "CAT#VINC", "SK": f"RECU#{recurso}#ENVO#{setor}",
                "tipo": "RECU", "alvoId": recurso, "setorId": setor}
        if (setor, recurso) in CODIGOS_SNP:
            item["codigoServicoSnp"] = CODIGOS_SNP[(setor, recurso)]
        itens.append(item)
    for v in _ler("dados-vinculo-recurso.csv"):
        vinculos_recurso[v["VREC_RECU_ID"]].add(v["VREC_AMBI_ID"])

    for r in _ler("dados-ambiente.csv"):
        a = r["AMBI_ID"]
        item = {"PK": "CAT#AMBI", "SK": a, "id": a, "desc": r["AMBI_DESC"],
                "ativo": r["AMBI_ST_ATIVO"] == "S", "setores": _por_int(setores_ambiente[a])}
        if r["AMBI_ID_PAI"]:
            item["paiId"] = r["AMBI_ID_PAI"]
        itens.append(item)
    for r in _ler("dados-disposicao.csv"):
        itens.append({"PK": "CAT#DISP", "SK": r["DISP_ID"], "id": r["DISP_ID"], "desc": r["DISP_DESC"],
                      "ativo": r["DISP_ST_ATIVO"] == "S", "icone": r["DISP_ICONE_ARQUIVO"]})
    for r in _ler("dados-grupo-recurso.csv"):
        itens.append({"PK": "CAT#GREC", "SK": r["GREC_ID"], "id": r["GREC_ID"], "desc": r["GREC_DESC"],
                      "ordem": int(r["GREC_ORDEM"]), "ativo": r["GREC_ST_ATIVO"] == "S"})
    for r in _ler("dados-recurso.csv"):
        rid = r["RECU_ID"]
        itens.append({"PK": "CAT#RECU", "SK": rid, "id": rid, "desc": r["RECU_DESC"],
                      "grupoId": r["RECU_GREC_ID"], "limitado": r["RECU_ST_LIMITADO"] == "S",
                      "disponibilidade": int(r["RECU_DISPONIBILIDADE"]),
                      "ativo": r["RECU_ST_ATIVO"] == "S", "icone": r["RECU_ICONE_ARQUIVO"],
                      "ambientesVinculados": _por_int(vinculos_recurso[rid]),
                      "setores": _por_int(setores_recurso[rid])})
    for r in _ler("dados-envolvido.csv"):
        itens.append({"PK": "CAT#ENVO", "SK": r["ENVO_ID"], "id": r["ENVO_ID"], "desc": r["ENVO_DESC"],
                      "email": r["ENVO_EMAIL"], "ativo": r["ENVO_ST_ATIVO"] == "S"})
    itens.append({"PK": "CAT#CONF", "SK": "GLOBAL", **CONFIG})

    # O seed grava em CTR#RESE o último id usado; aqui, o maior id de reserva do CSV.
    ultimo = max(int(p["PRES_RESE_ID"].replace(".", "")) for p in _ler("dados-periodo-reserva.csv"))
    itens.append({"PK": "CTR#RESE", "SK": "CTR", "valor": ultimo})
    itens.append({"PK": "CTR#SNP", "SK": "CTR", "valor": 0})
    return itens


def carregar() -> tuple[Catalogo, list[Setor], list[VinculoSetor]]:
    """Catálogo completo (inclusive inativos; grupos só ativos, por ordem), setores e vínculos."""
    por_pk = defaultdict(list)
    for item in itens_tabela():
        por_pk[item["PK"]].append(item)

    ambientes = [Ambiente(id=i["id"], desc=i["desc"], ativo=i["ativo"], paiId=i.get("paiId"),
                          setores=i["setores"]) for i in por_pk["CAT#AMBI"]]
    disposicoes = [Disposicao(id=i["id"], desc=i["desc"], ativo=i["ativo"], icone=i["icone"])
                   for i in por_pk["CAT#DISP"]]
    grupos = [GrupoRecurso(id=i["id"], desc=i["desc"])
              for i in sorted(por_pk["CAT#GREC"], key=lambda g: g["ordem"]) if i["ativo"]]
    recursos = [Recurso(id=i["id"], desc=i["desc"], grupoId=i["grupoId"], limitado=i["limitado"],
                        disponibilidade=i["disponibilidade"], ativo=i["ativo"], icone=i["icone"],
                        ambientesVinculados=i["ambientesVinculados"], setores=i["setores"])
                for i in por_pk["CAT#RECU"]]
    conf = por_pk["CAT#CONF"][0]
    config = Config(faixaInicio=conf["faixaInicio"], faixaFim=conf["faixaFim"],
                    antecedenciaMin=conf["antecedenciaMin"], margemMin=conf["margemMin"])
    setores = [Setor(id=i["id"], desc=i["desc"], email=i["email"], ativo=i["ativo"])
               for i in por_pk["CAT#ENVO"]]
    vinculos = [VinculoSetor(tipo=i["tipo"], alvoId=i["alvoId"], setorId=i["setorId"],
                             codigoServicoSnp=i.get("codigoServicoSnp")) for i in por_pk["CAT#VINC"]]
    return Catalogo(ambientes, disposicoes, grupos, recursos, config), setores, vinculos
