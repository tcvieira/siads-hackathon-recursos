"""O domínio é Python puro: nenhum módulo de dominio/ importa boto3, botocore ou pydantic (R12.2)."""

import ast
from pathlib import Path

DOMINIO = Path(__file__).resolve().parent.parent / "src" / "dominio"
PROIBIDOS = {"boto3", "botocore", "pydantic"}


def _imports(arquivo: Path) -> set[str]:
    modulos = set()
    for no in ast.walk(ast.parse(arquivo.read_text(encoding="utf-8"), filename=str(arquivo))):
        if isinstance(no, ast.Import):
            modulos |= {alias.name.split(".")[0] for alias in no.names}
        elif isinstance(no, ast.ImportFrom) and no.module and no.level == 0:
            modulos.add(no.module.split(".")[0])
    return modulos


def test_dominio_sem_boto3_nem_pydantic():
    arquivos = sorted(DOMINIO.glob("*.py"))
    assert len(arquivos) >= 6  # __init__, modelos, hierarquia, tempo, regras, conflitos, notificacao
    violacoes = {a.name: sorted(_imports(a) & PROIBIDOS) for a in arquivos if _imports(a) & PROIBIDOS}
    assert violacoes == {}
