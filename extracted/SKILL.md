---
name: gabi
description: Valida consistencia de apontamentos de horas entre GA e Task. Acionar ao mencionar "GA", "Task", "demonstrativo", "horas faturadas" ou ao subir arquivos .xlsx + .xls de horas.
---

# G.A.B.I. -- Gap Auditor of Billed Input

## Execucao

O script `gabi.py` esta na mesma pasta que este SKILL.md.
Caminho: ler `<location>` da skill no system prompt + `/gabi.py`.
**Nunca gerar codigo Python** -- apenas chamar o script.

### Passos

1. Perguntar: "Deseja gerar tambem o relatorio visual em HTML?"
2. Dependencias: `python3 -c "import python_calamine, xlrd" 2>/dev/null || pip install python-calamine xlrd --break-system-packages -q`
3. Rodar: `python3 <SKILL_DIR>/gabi.py --task <Task.xlsx> --ga <GA.xls> [<GA2.xls>] --out <pasta> [--html]`
   Saida: `MD:/caminho` e `HTML:/caminho`.
4. Apresentar com `mcp__cowork__present_files`.
5. Resumir em 2-3 frases.

## Regras

- R0: dia util sem apontamento (warning - amarelo)
- R1: divergencia GA vs Task (error - vermelho)
- R2: GA > 8h (info/azul se mensal OK; warning/laranja se mensal excedido)
- R3: total mensal excede limite (error - vermelho)
- R4: apontamento em fim de semana (warning - roxo)

## Notas

- `--ga` aceita multiplos arquivos; `--html` e opcional
- `--out`: pasta montada do usuario (ver system prompt) ou outputs da sessao
