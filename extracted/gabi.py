#!/usr/bin/env python3
"""G.A.B.I. — Gap Auditor of Billed Input"""
import sys, argparse, unicodedata, json
from collections import defaultdict
from calendar import monthrange
from datetime import date, timedelta

# ── Parsers ───────────────────────────────────────────────────────────────────
def parse_task(fp):
    from python_calamine import CalamineWorkbook
    rows = CalamineWorkbook.from_path(fp).get_sheet_by_name("Analítico").to_python(skip_empty_area=False)
    result = defaultdict(lambda: defaultdict(float))
    for row in rows[10:]:
        if len(row) < 9: continue
        resp, dt, cod, total = row[0], row[1], row[2], row[8]
        if not (resp and dt and cod == 'FATURADO' and total): continue
        ds = dt.strftime('%d/%m/%Y') if hasattr(dt, 'strftime') else str(dt)
        result[resp][ds] += float(total)
    return dict(result)

def parse_ga(fp):
    from python_calamine import CalamineWorkbook
    rows = CalamineWorkbook.from_path(fp).get_sheet_by_index(0).to_python(skip_empty_area=False)
    hdr = rows[0][5] if rows and len(rows[0]) > 5 else ''
    parts = str(hdr).split('\n')
    name = parts[1].strip() if len(parts) > 1 else hdr.strip()
    comp = ''.join(filter(str.isdigit, parts[0])) if parts else ''
    year, month = int(comp[:4]), int(comp[4:6]) if len(comp) >= 6 else (0, 0)
    cur = None; daily = {}
    for row in rows:
        b = row[1] if len(row) > 1 else None
        i = row[8] if len(row) > 8 else None
        q = row[9] if len(row) > 9 else None
        if b and isinstance(b, str) and '/' in b: cur = b
        if i == 'Total Data' and cur and b != 'Total' and q:
            daily[cur] = float(q)
    return name, daily, year, month

# ── Matching ──────────────────────────────────────────────────────────────────
PARTICLES = {'de','da','do','dos','das','e'}
def norm(s):
    s = unicodedata.normalize('NFD', s.lower())
    return ''.join(c for c in s if unicodedata.category(c) != 'Mn')
def match_name(full, task_names):
    toks = [t for t in norm(full).split() if t not in PARTICLES]
    for tid in task_names:
        p = norm(tid).split('.')
        if len(p) == 2 and toks[0] == p[0] and any(t == p[1] for t in toks[1:]):
            return tid
    return None

# ── Calendário ────────────────────────────────────────────────────────────────
def easter(y):
    a=y%19;b=y//100;c=y%100;d=b//4;e=b%4;f=(b+8)//25
    g=(b-f+1)//3;h=(19*a+b-d-g+15)%30;i=c//4;k=c%4;l=(32+2*e+2*i-h-k)%7
    m=(a+11*h+22*l)//451;mo=(h+l-7*m+114)//31;dy=((h+l-7*m+114)%31)+1
    return date(y, mo, dy)
def get_holidays(y):
    p = easter(y)
    return {date(y,1,1), p-timedelta(48), p-timedelta(47), p-timedelta(2),
            date(y,4,21), date(y,5,1), p+timedelta(60),
            date(y,9,7), date(y,10,12), date(y,11,2), date(y,11,15), date(y,12,25)}
def wd_count(y, m):
    h = get_holidays(y); _, last = monthrange(y, m)
    return sum(1 for d in range(1, last+1)
               if date(y,m,d).weekday() < 5 and date(y,m,d) not in h)
def get_working_days(y, m):
    h = get_holidays(y); _, last = monthrange(y, m)
    return [f"{d:02d}/{m:02d}/{y}" for d in range(1, last+1)
            if date(y,m,d).weekday() < 5 and date(y,m,d) not in h]

MONTH_PT = {1:'Janeiro',2:'Fevereiro',3:'Março',4:'Abril',5:'Maio',6:'Junho',
            7:'Julho',8:'Agosto',9:'Setembro',10:'Outubro',11:'Novembro',12:'Dezembro'}

# ── Validação ─────────────────────────────────────────────────────────────────
def ds_to_date(ds):
    d,m,y = ds.split('/'); return date(int(y),int(m),int(d))

def validate(ga, task, y, m):
    TOL = 0.1; wdays_list = get_working_days(y, m)
    wdays = len(wdays_list); ga_tot = sum(ga.values()); lim = wdays * 8
    mensal_ok = ga_tot <= lim + TOL
    issues = []

    # R3 — limite mensal
    if not mensal_ok:
        issues.append({'date': f'{m:02d}/{y}', 'rule': 'R3', 'severity': 'error',
            'message': f'Total mensal GA ({ga_tot:.2f}h) excede {lim}h ({wdays} dias úteis × 8h) — correção obrigatória'})

    all_days = sorted(set(list(ga) + list(task) + wdays_list),
                      key=lambda x: (x[6:], x[3:5], x[:2]))

    for ds in all_days:
        g = ga.get(ds, 0.0); t = task.get(ds, 0.0)
        d_obj = ds_to_date(ds)
        is_weekend = d_obj.weekday() >= 5

        # R4 — apontamento em fim de semana
        if is_weekend and (g > TOL or t > TOL):
            parts = []
            if g > TOL: parts.append(f"GA: {g:.2f}h")
            if t > TOL: parts.append(f"Task: {t:.2f}h")
            issues.append({'date': ds, 'rule': 'R4', 'severity': 'warning',
                'message': f'Apontamento em fim de semana — {", ".join(parts)}'})
            continue  # fins de semana não entram nas demais regras

        # R0 — dia útil sem apontamento em nenhum sistema
        if not is_weekend and g <= TOL and t <= TOL:
            issues.append({'date': ds, 'rule': 'R0', 'severity': 'warning',
                'message': 'Dia útil sem apontamento em nenhum dos sistemas'})
            continue

        # R1 — divergência
        if abs(g - t) > TOL:
            issues.append({'date': ds, 'rule': 'R1', 'severity': 'error',
                'message': f'GA ({g:.2f}h) difere do Task faturado ({t:.2f}h) — diferença {g-t:+.2f}h'})

        # R2 — limite diário
        if g > 8.0 + TOL:
            sev = 'info' if mensal_ok else 'warning'
            lbl = 'observação' if mensal_ok else 'ponto de ajuste — mensal comprometido'
            issues.append({'date': ds, 'rule': 'R2', 'severity': sev,
                'message': f'GA ({g:.2f}h) excede 8h diárias ({lbl})'})

    return issues, mensal_ok, wdays, lim

# ── Markdown ──────────────────────────────────────────────────────────────────
def build_md(persons):
    out = []
    for p in persons:
        ga_tot=p['ga_total']; task_tot=p['task_total']; lim=p['monthly_limit']
        mensal_ok=p['mensal_ok']; errors=p['errors_count']
        status_mensal = "✅ OK" if mensal_ok else f"❌ EXCEDIDO em +{ga_tot-lim:.2f}h"
        status_geral  = ("✅ Sem inconsistências" if not p['issues_count'] else
                         f"❌ {errors} erro(s) crítico(s)" if errors else
                         f"⚠️ {p['warnings_count']} aviso(s)" if p['warnings_count'] else
                         f"ℹ️ {p['info_count']} observação(ões)")
        out += [f"# G.A.B.I. — {p['name']} · {p['month_label']}","",
                f"> **Status geral:** {status_geral}  ",f"> **Task ID:** `{p['task_id']}`","",
                "## Resumo Mensal","","| Métrica | Valor |","|---|---|",
                f"| GA Total | **{ga_tot:.2f}h** |",
                f"| Task Faturado Total | {task_tot:.2f}h |",
                f"| Diferença (GA − Task) | **{ga_tot-task_tot:+.2f}h** |",
                f"| Dias úteis | {p['working_days']} dias |",
                f"| Limite mensal | {lim}h ({p['working_days']} × 8h) |",
                f"| Status mensal | {status_mensal} |",""]
        r1 = [i for i in p['issues'] if i['rule']=='R1']
        if r1 and all(p['days'][j]['ga']>p['days'][j]['task']
                      for j,d in enumerate(p['days']) if 'R1' in d['rules']):
            out += ["## Padrão Identificado","",
                    f"GA consistentemente acima do Task em **{len(r1)} de {len(p['days'])} dias**.",
                    f"Task apontado com horas arredondadas (~{task_tot/max(len(p['days']),1):.1f}h/dia fixas);",
                    "GA registra horas reais. Ação: **ajustar o Task para refletir o GA**","(após regularizar dias que excedem o limite mensal).",""]
        out += ["## Apontamentos por Dia","","| Data | GA (h) | Task Fat. (h) | Diferença | Flags |","|---|---|---|---|---|"]
        for d in p['days']:
            diff_str = f"{d['diff']:+.2f}h" if abs(d['diff'])>0.01 else "—"
            out.append(f"| {d['date']} | {d['ga']:.2f} | {d['task']:.2f} | {diff_str} | {' '.join(d['rules']) if d['rules'] else '✅'} |")
        out.append("")
        if p['issues']:
            out.append(f"## Inconsistências ({p['issues_count']} total)"); out.append("")
            by_rule = defaultdict(list)
            for i in p['issues']: by_rule[i['rule']].append(i)
            labels = {
                'R3':'🔴 R3 — Limite mensal excedido (correção obrigatória)',
                'R1':'🔴 R1 — Divergência GA vs Task',
                'R2':f"{'⚠️' if not mensal_ok else 'ℹ️'} R2 — Dias com GA > 8h ({'ponto de ajuste' if not mensal_ok else 'observação'})",
                'R0':'⚠️ R0 — Dias úteis sem apontamento',
                'R4':'⚠️ R4 — Apontamentos em fim de semana',
            }
            for rule in ['R3','R1','R2','R0','R4']:
                if rule not in by_rule: continue
                out += [f"### {labels[rule]} ({len(by_rule[rule])})",""]
                for i in by_rule[rule]:
                    icon = '❌' if i['severity']=='error' else '⚠️' if i['severity']=='warning' else 'ℹ️'
                    out.append(f"- {icon} **{i['date']}** — {i['message']}")
                out.append("")
        else:
            out += ["## Resultado","","✅ Nenhuma inconsistência encontrada.",""]
        out += ["---","*Gerado por G.A.B.I. — Gap Auditor of Billed Input*",""]
    return '\n'.join(out)

# ── Chart JS ──────────────────────────────────────────────────────────────────
CHART_JS = r"""
function buildChart(idx, p) {
  if (CI) { CI.destroy(); CI = null; }

  const gabiPlugin = {
    id: 'gabiPlugin',
    afterDatasetsDraw(chart) {
      const { ctx, scales: { x, y }, chartArea } = chart;
      const meta0 = chart.getDatasetMeta(0); // GA bars
      const meta1 = chart.getDatasetMeta(1); // Task bars

      p.days.forEach((d, i) => {
        const bar0 = meta0.data[i], bar1 = meta1.data[i];
        if (!bar0 || !bar1) return;

        const isR0 = d.rules.includes('R0');
        const isR4 = d.rules.includes('R4');

        // ── Fundo colorido para R0 e R4 ──────────────────────────────────
        if (isR0 || isR4) {
          const left   = x.getPixelForValue(i - 0.5);
          const right  = x.getPixelForValue(i + 0.5);
          ctx.save();
          ctx.fillStyle = isR4
            ? 'rgba(168,85,247,.10)'   // roxo para fim de semana
            : 'rgba(234,179,8,.08)';   // amarelo para dia sem apontamento
          ctx.fillRect(left, chartArea.top, right - left, chartArea.bottom - chartArea.top);
          ctx.restore();
        }

        // ── Barras fantasma tracejadas para R0 ───────────────────────────
        if (isR0) {
          const groupW  = x.getPixelForValue(1) - x.getPixelForValue(0);
          const barW    = groupW * 0.28;
          const gap     = groupW * 0.04;
          const centerX = x.getPixelForValue(i);
          const phantH  = 16;
          const baseY   = chartArea.bottom;

          ctx.save();
          ctx.setLineDash([3, 3]);
          ctx.strokeStyle = 'rgba(245,158,11,.55)';
          ctx.lineWidth = 1.5;
          // GA
          ctx.strokeRect(centerX - barW - gap/2, baseY - phantH, barW, phantH);
          // Task
          ctx.strokeRect(centerX + gap/2, baseY - phantH, barW, phantH);
          ctx.restore();
        }

        // ── Label "8h" na linha de limite ────────────────────────────────
        if (i === p.days.length - 1) {
          ctx.save();
          ctx.fillStyle = 'rgba(239,68,68,.85)';
          ctx.font = 'bold 11px system-ui';
          ctx.textAlign = 'left';
          ctx.fillText('8h', chartArea.right + 6, y.getPixelForValue(8) + 4);
          ctx.restore();
        }

        // ── Badges acima dos grupos problemáticos ─────────────────────────
        const badgeRules = d.rules.filter(r => r !== 'R3');
        if (!badgeRules.length) return;

        const groupX = (bar0.x + bar1.x) / 2;
        const maxVal = Math.max(d.ga, d.task, 0.3);
        const topY   = y.getPixelForValue(maxVal) - 8;

        // Cor e texto por prioridade
        let color, bgColor, text;
        if (d.rules.includes('R1')) {
          color = '#ef4444'; bgColor = 'rgba(239,68,68,.15)';
          text  = badgeRules.join(' ');
        } else if (d.rules.includes('R4')) {
          color = '#a855f7'; bgColor = 'rgba(168,85,247,.15)';
          text  = badgeRules.join(' ');
        } else if (d.rules.includes('R0')) {
          color = '#eab308'; bgColor = 'rgba(234,179,8,.15)';
          text  = 'R0';
        } else if (d.rules.includes('R2') && d.sevs && d.sevs.R2 === 'info') {
          color = '#3b82f6'; bgColor = 'rgba(59,130,246,.15)';
          text  = 'R2';
        } else {
          color = '#f59e0b'; bgColor = 'rgba(245,158,11,.15)';
          text  = badgeRules.join(' ');
        }

        ctx.save();
        ctx.font = 'bold 9px system-ui';
        ctx.textAlign = 'center';
        const tw = ctx.measureText(text).width;
        const bw = tw + 8, bh = 14, bx = groupX - bw/2, by = topY - bh, r = 3;
        ctx.beginPath();
        ctx.moveTo(bx+r,by); ctx.lineTo(bx+bw-r,by);
        ctx.quadraticCurveTo(bx+bw,by,bx+bw,by+r);
        ctx.lineTo(bx+bw,by+bh-r);
        ctx.quadraticCurveTo(bx+bw,by+bh,bx+bw-r,by+bh);
        ctx.lineTo(bx+r,by+bh);
        ctx.quadraticCurveTo(bx,by+bh,bx,by+bh-r);
        ctx.lineTo(bx,by+r);
        ctx.quadraticCurveTo(bx,by,bx+r,by);
        ctx.closePath();
        ctx.fillStyle = bgColor; ctx.fill();
        ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.stroke();
        ctx.fillStyle = color;
        ctx.fillText(text, groupX, by + bh - 3);
        ctx.restore();
      });
    }
  };

  const ctx = document.getElementById('ch-' + idx).getContext('2d');
  CI = new Chart(ctx, {
    data: {
      labels: p.days.map(d => d.date.substring(0, 5)),
      datasets: [
        { type:'bar', label:'GA',
          data: p.days.map(d => d.ga || 0),
          backgroundColor:'rgba(59,130,246,.75)', borderWidth:0,
          borderRadius:3, borderSkipped:false, order:2 },
        { type:'bar', label:'Task Faturado',
          data: p.days.map(d => d.task || 0),
          backgroundColor:'rgba(16,185,129,.75)', borderWidth:0,
          borderRadius:3, borderSkipped:false, order:2 },
        { type:'line', label:'Limite 8h',
          data: Array(p.days.length).fill(8),
          borderColor:'rgba(239,68,68,.55)', borderWidth:1.5,
          pointRadius:0, tension:0, order:1 }
      ]
    },
    options: {
      responsive:true,
      interaction:{mode:'index', intersect:false},
      plugins: {
        legend:{ display:false },
        tooltip:{
          backgroundColor:'#1e293b', borderColor:'#334155', borderWidth:1,
          titleColor:'#f8fafc', bodyColor:'#94a3b8', padding:10,
          callbacks:{
            title(items) { return p.days[items[0].dataIndex].date; },
            label(item) {
              if (item.datasetIndex === 2) return null;
              const lbl = item.datasetIndex === 0 ? 'GA' : 'Task Faturado';
              const val = item.parsed.y;
              return val > 0 ? `  ${lbl}: ${val.toFixed(2)}h` : `  ${lbl}: sem apontamento`;
            },
            afterBody(items) {
              const d = p.days[items[0].dataIndex];
              const lines = [];
              const diff = d.ga - d.task;
              if (Math.abs(diff) > 0.1) {
                lines.push('');
                lines.push(`  ⚠️  Diferença: ${diff > 0 ? '+' : ''}${diff.toFixed(2)}h`);
                lines.push(`  → ${d.ga > d.task ? 'Task precisa subir' : 'GA precisa subir'}`);
              }
              if (d.rules.includes('R0')) {
                lines.push('');
                lines.push('  ⚠️  Dia útil sem apontamento nos dois sistemas');
              }
              if (d.rules.includes('R2')) {
                const obs = d.sevs && d.sevs.R2 === 'info';
                lines.push('');
                lines.push(`  ${obs?'ℹ️':'⚠️'}  GA acima de 8h (${obs?'observação':'ponto de ajuste'})`);
              }
              if (d.rules.includes('R4')) {
                lines.push('');
                lines.push('  ⚠️  Apontamento registrado em fim de semana');
              }
              return lines;
            }
          }
        }
      },
      scales:{
        x:{ stacked:false, grid:{color:'rgba(51,65,85,.35)'}, ticks:{color:'#64748b',font:{size:10}} },
        y:{ stacked:false, grid:{color:'rgba(51,65,85,.35)'},
            ticks:{color:'#64748b',font:{size:11},callback:v=>`${v}h`},
            suggestedMin:0,
            suggestedMax: Math.max(10,...p.days.map(d=>d.ga),...p.days.map(d=>d.task)) + 1.5,
            afterFit(s){s.width+=20;} }
      },
      layout:{ padding:{right:30, top:20} }
    },
    plugins:[gabiPlugin]
  });
}
"""

# ── HTML ──────────────────────────────────────────────────────────────────────
def build_html(persons):
    data_json = json.dumps(persons, ensure_ascii=False, default=str)
    month_label = persons[0]['month_label'] if persons else ''
    css = ('*{box-sizing:border-box;margin:0;padding:0}'
           'body{font-family:system-ui,-apple-system,sans-serif;background:#0f172a;color:#f8fafc;min-height:100vh}'
           '.hdr{background:#1e293b;border-bottom:1px solid #334155;padding:16px 24px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px}'
           '.hdr h1{font-size:1.25rem;font-weight:700;color:#3b82f6}'
           '.hdr p{font-size:.8rem;color:#94a3b8;margin-top:2px}'
           '.badge{display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:999px;font-size:.75rem;font-weight:600}'
           '.be{background:#450a0a;color:#fca5a5;border:1px solid #7f1d1d}'
           '.bw{background:#451a03;color:#fcd34d;border:1px solid #78350f}'
           '.bi{background:#0c1a3a;color:#93c5fd;border:1px solid #1e3a8a}'
           '.bo{background:#052e16;color:#86efac;border:1px solid #14532d}'
           '.main{padding:18px 24px;max-width:1100px;margin:0 auto}'
           '.st{font-size:.68rem;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:#64748b;margin-bottom:8px;margin-top:18px}'
           '.pc{background:#1e293b;border:1px solid #334155;border-radius:10px;padding:14px 18px;margin-bottom:8px;cursor:pointer;transition:border-color .15s}'
           '.pc:hover,.pc.active{border-color:#3b82f6}'
           '.pn{font-size:.9rem;font-weight:600}.pid{font-size:.72rem;color:#64748b;margin-top:2px}'
           '.sr{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}'
           '.stat{background:#0f172a;border-radius:7px;padding:8px 12px;flex:1;min-width:85px}'
           '.sl{font-size:.64rem;color:#64748b;text-transform:uppercase;letter-spacing:.05em}'
           '.sv{font-size:1.05rem;font-weight:700;margin-top:2px}'
           '.sv.pos{color:#f87171}.sv.neg{color:#34d399}.sv.ok{color:#4ade80}'
           '.dp{background:#1e293b;border:1px solid #334155;border-radius:10px;padding:18px;margin-top:8px;display:none}'
           '.dp.visible{display:block}'
           '.cw{background:#0f172a;border-radius:8px;padding:14px 14px 8px;margin-bottom:16px}'
           '.cl{display:flex;gap:14px;margin-bottom:10px;flex-wrap:wrap;align-items:center}'
           '.li{display:flex;align-items:center;gap:5px;font-size:.72rem;color:#94a3b8}'
           '.ld{width:13px;height:13px;border-radius:3px;flex-shrink:0}'
           '.ll{width:20px;height:3px;border-radius:2px;flex-shrink:0}'
           '.lbadge{display:inline-block;padding:1px 5px;border-radius:3px;font-size:.68rem;font-weight:700;border:1px solid}'
           'table{width:100%;border-collapse:collapse;font-size:.82rem}'
           'th{text-align:left;padding:7px 11px;background:#0f172a;color:#64748b;font-size:.65rem;text-transform:uppercase;letter-spacing:.05em;font-weight:600}'
           'td{padding:7px 11px;border-bottom:1px solid #0f172a}'
           'tr.rok td{background:#0a1220}tr.ri td{background:#0a1628}'
           'tr.rw td{background:#1a1205}tr.re td{background:#1a0808}'
           'tr.r0 td{background:#1a1400}tr.r4 td{background:#180d24}'
           'tr:hover td{filter:brightness(1.18)}'
           '.rb{display:inline-block;padding:1px 5px;border-radius:4px;font-size:.66rem;font-weight:700;margin-right:2px}'
           '.rR1{background:#7f1d1d;color:#fca5a5}.rR2i{background:#172554;color:#93c5fd}'
           '.rR2w{background:#78350f;color:#fcd34d}.rR3{background:#7f1d1d;color:#fca5a5}'
           '.rR0{background:#422006;color:#fde047}.rR4{background:#2e1065;color:#d8b4fe}'
           '.ii{display:flex;gap:9px;padding:7px 0;border-bottom:1px solid #0f172a;align-items:flex-start}'
           '.ii:last-child{border-bottom:none}'
           '.id2{font-size:.72rem;color:#64748b;min-width:82px;flex-shrink:0;margin-top:1px}.im{font-size:.8rem;color:#cbd5e1}'
           '.eb{display:inline-flex;align-items:center;gap:6px;background:#1d4ed8;color:#fff;border:none;padding:7px 14px;border-radius:7px;font-size:.8rem;font-weight:600;cursor:pointer}'
           '.eb:hover{background:#2563eb}'
           '.dpos{color:#f87171}.dneg{color:#34d399}.dzero{color:#64748b}'
           '.mb{border-radius:7px;padding:9px 13px;margin-bottom:12px;font-size:.8rem;font-weight:500;line-height:1.5}'
           '.mok{background:#052e16;border:1px solid #14532d;color:#86efac}'
           '.merr{background:#450a0a;border:1px solid #7f1d1d;color:#fca5a5}'
           '.insight{background:#1a1205;border:1px solid #78350f;border-radius:7px;padding:10px 14px;margin-bottom:12px;font-size:.8rem;color:#fcd34d;line-height:1.6}')

    ui_js = r"""
function render(){
  document.getElementById('tp').textContent=DATA.length;
  const te=DATA.reduce((s,p)=>s+p.errors_count,0),ti=DATA.reduce((s,p)=>s+p.issues_count,0);
  const gb=document.getElementById('gb');
  if(te>0)gb.innerHTML=`<span class="badge be">❌ ${te} erro(s)</span>`;
  else if(ti>0)gb.innerHTML=`<span class="badge bw">⚠️ ${ti} aviso(s)</span>`;
  else gb.innerHTML=`<span class="badge bo">✅ OK</span>`;
  document.getElementById('pl').innerHTML=DATA.map((p,i)=>{
    const bc=p.errors_count>0?'be':p.warnings_count>0?'bw':p.info_count>0?'bi':'bo';
    const bi2=p.errors_count>0?'❌':p.warnings_count>0?'⚠️':p.info_count>0?'ℹ️':'✅';
    const bt=p.issues_count===0?'OK':p.errors_count>0?`${p.errors_count} erro(s)`:p.warnings_count>0?`${p.warnings_count} aviso(s)`:`${p.info_count} obs.`;
    const dc=Math.abs(p.diff_total)>0.1?(p.diff_total>0?'pos':'neg'):'ok';
    const pct=(p.ga_total/p.monthly_limit*100).toFixed(1);
    return `<div class="pc" id="c${i}" onclick="showDetail(${i})">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px">
        <div><div class="pn">${p.name}</div><div class="pid">${p.task_id}</div></div>
        <span class="badge ${bc}">${bi2} ${bt}</span></div>
      <div class="sr">
        <div class="stat"><div class="sl">GA Total</div><div class="sv ${p.mensal_ok?'':'pos'}">${p.ga_total.toFixed(2)}h</div></div>
        <div class="stat"><div class="sl">Task Fat.</div><div class="sv">${p.task_total.toFixed(2)}h</div></div>
        <div class="stat"><div class="sl">Diferença</div><div class="sv ${dc}">${p.diff_total>0?'+':''}${p.diff_total.toFixed(2)}h</div></div>
        <div class="stat"><div class="sl">Limite</div><div class="sv ${p.mensal_ok?'ok':'pos'}">${p.monthly_limit}h · ${pct}%</div></div>
        <div class="stat"><div class="sl">Dias úteis</div><div class="sv">${p.working_days}d</div></div>
      </div></div>`;
  }).join('');
  if(DATA.length===1)showDetail(0);
}
function showDetail(idx){
  const panel=document.getElementById('detail');
  document.querySelectorAll('.pc').forEach(c=>c.classList.remove('active'));
  if(ai===idx){ai=null;panel.classList.remove('visible');panel.innerHTML='';if(CI){CI.destroy();CI=null;}return;}
  ai=idx; document.getElementById(`c${idx}`).classList.add('active');
  const p=DATA[idx];
  const pct=(p.ga_total/p.monthly_limit*100).toFixed(1);
  const exc=(p.ga_total-p.monthly_limit).toFixed(2);
  const banner=p.mensal_ok
    ?`<div class="mb mok">✅ Limite mensal OK — GA ${p.ga_total.toFixed(2)}h de ${p.monthly_limit}h · ${pct}% · dias >8h são observações</div>`
    :`<div class="mb merr">❌ Limite mensal EXCEDIDO — GA ${p.ga_total.toFixed(2)}h ultrapassa ${p.monthly_limit}h em +${exc}h · ${pct}%</div>`;
  const r1days=p.issues.filter(i=>i.rule==='R1').length;
  const insight=r1days>0?`<div class="insight">⚠️ <strong>Padrão:</strong> GA acima do Task em ${r1days} de ${p.days.length} dias. Diferença acumulada <strong>+${p.diff_total.toFixed(2)}h</strong> — Task com horas arredondadas. Ação: ajustar o Task para refletir o GA.</div>`:'';
  const rows=p.days.map(d=>{
    const dc=Math.abs(d.diff)>0.1?(d.diff>0?'dpos':'dneg'):'dzero';
    const st=d.status==='ok'?'rok':d.status==='info'?'ri':d.status==='warning'?'rw':d.status==='r0'?'r0':d.status==='r4'?'r4':'re';
    const badges=d.rules.map(r=>{
      if(r==='R2') return `<span class="rb rR2${d.sevs&&d.sevs.R2==='info'?'i':'w'}">R2</span>`;
      return `<span class="rb r${r}">${r}</span>`;
    }).join('');
    const gaStr=d.ga>0?`${d.ga.toFixed(2)}h`:'<span style="color:#64748b">—</span>';
    const taskStr=d.task>0?`${d.task.toFixed(2)}h`:'<span style="color:#64748b">—</span>';
    return `<tr class="${st}"><td>${d.date}</td><td>${gaStr}</td><td>${taskStr}</td><td class="${dc}">${Math.abs(d.diff)>0.01?(d.diff>0?'+':'')+d.diff.toFixed(2)+'h':'—'}</td><td>${badges||'<span style="color:#64748b">—</span>'}</td></tr>`;
  }).join('');
  const rlab={
    R3:'R3 — Limite mensal excedido',
    R1:'R1 — Divergência GA vs Task',
    R2:`R2 — Dias >8h (${p.mensal_ok?'observação':'ponto de ajuste'})`,
    R0:'R0 — Dias úteis sem apontamento',
    R4:'R4 — Apontamentos em fim de semana'
  };
  const byRule={};p.issues.forEach(i=>{if(!byRule[i.rule])byRule[i.rule]=[];byRule[i.rule].push(i);});
  const ihtml=Object.keys(rlab).filter(r=>byRule[r]).map(rule=>`
    <div class="st" style="margin-top:12px">${byRule[rule][0].severity==='error'?'🔴':'⚠️'} ${rlab[rule]} (${byRule[rule].length})</div>
    ${byRule[rule].map(i=>`<div class="ii"><span style="flex-shrink:0">${i.severity==='error'?'❌':i.severity==='info'?'ℹ️':'⚠️'}</span><span class="id2">${i.date}</span><span class="im">${i.message}</span></div>`).join('')}`).join('');
  panel.innerHTML=`${banner}${insight}
    <div class="cw">
      <div class="cl">
        <div class="li"><div class="ld" style="background:rgba(59,130,246,.8)"></div>GA</div>
        <div class="li"><div class="ld" style="background:rgba(16,185,129,.8)"></div>Task Faturado</div>
        <div class="li"><div class="ll" style="background:rgba(239,68,68,.6)"></div>Limite 8h</div>
        <div class="li"><span class="lbadge" style="color:#ef4444;border-color:#ef4444;background:rgba(239,68,68,.12)">R1</span>&nbsp;Divergência</div>
        <div class="li"><span class="lbadge" id="leg-r2-${idx}" style="">R2</span>&nbsp;GA &gt; 8h</div>
        <div class="li"><span class="lbadge" style="color:#eab308;border-color:#eab308;background:rgba(234,179,8,.12)">R0</span>&nbsp;Sem apontamento</div>
        <div class="li"><span class="lbadge" style="color:#a855f7;border-color:#a855f7;background:rgba(168,85,247,.12)">R4</span>&nbsp;Fim de semana</div>
      </div>
      <canvas id="ch-${idx}" height="85"></canvas>
    </div>
    <div style="font-size:.86rem;font-weight:600;margin-bottom:9px">${p.name} — Detalhe por dia</div>
    <div style="overflow-x:auto"><table><thead><tr><th>Data</th><th>GA (h)</th><th>Task Fat. (h)</th><th>Diferença</th><th>Flags</th></tr></thead><tbody>${rows}</tbody></table></div>
    <div style="margin-top:12px">${p.issues.length===0?'<div style="color:#22c55e;padding:8px 0">✅ Sem inconsistências.</div>':ihtml}</div>`;
  panel.classList.add('visible');
  buildChart(idx, p);
  // Legenda R2: azul se observação, laranja se aviso
  const legR2 = document.getElementById('leg-r2-' + idx);
  if (legR2) {
    const r2color = p.mensal_ok ? '#3b82f6' : '#f59e0b';
    const r2bg    = p.mensal_ok ? 'rgba(59,130,246,.12)' : 'rgba(245,158,11,.12)';
    legR2.style.color       = r2color;
    legR2.style.borderColor = r2color;
    legR2.style.background  = r2bg;
  }
  setTimeout(()=>panel.scrollIntoView({behavior:'smooth',block:'nearest'}),50);
}
function exportXLSX(){
  const rows=[['Pessoa','Task ID','Data','Regra','Severidade','Mensagem']];
  DATA.forEach(p=>{
    if(!p.issues.length)rows.push([p.name,p.task_id,'—','—','OK','Sem inconsistências']);
    else p.issues.forEach(i=>rows.push([p.name,p.task_id,i.date,i.rule,
      i.severity==='error'?'Erro crítico':'Aviso',i.message]));
  });
  const ws=XLSX.utils.aoa_to_sheet(rows),wb2=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb2,ws,'Inconsistências');
  XLSX.writeFile(wb2,`GABI_${DATA[0]?.export_suffix||'export'}.xlsx`);
}
render();
"""
    return ('<!DOCTYPE html><html lang="pt-BR"><head>'
            '<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">'
            f'<title>G.A.B.I. — {month_label}</title>'
            '<script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>'
            '<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js"></script>'
            f'<style>{css}</style></head><body>'
            '<div class="hdr"><div>'
            '<h1>G.A.B.I. <span style="color:#64748b;font-weight:400;font-size:.85rem">— Gap Auditor of Billed Input</span></h1>'
            f'<p>Validação &nbsp;·&nbsp; {month_label} &nbsp;·&nbsp; <span id="tp"></span> pessoa(s)</p></div>'
            '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">'
            '<span id="gb"></span><button class="eb" onclick="exportXLSX()">⬇ Exportar Excel</button></div></div>'
            '<div class="main"><div class="st">Pessoas Validadas</div>'
            '<div id="pl"></div><div id="detail" class="dp"></div></div>'
            f'<script>const DATA={data_json};let ai=null,CI=null;\n'
            + CHART_JS + ui_js + '</script></body></html>')

# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description='G.A.B.I. — Gap Auditor of Billed Input')
    parser.add_argument('--task', required=True)
    parser.add_argument('--ga', required=True, nargs='+')
    parser.add_argument('--html', action='store_true')
    parser.add_argument('--out', default='.')
    args = parser.parse_args()

    task_data = parse_task(args.task)
    persons = []

    for ga_file in args.ga:
        ga_name, ga_daily, year, month = parse_ga(ga_file)
        task_id = match_name(ga_name, list(task_data.keys()))
        if not task_id:
            print(f"⚠️  Não foi possível mapear '{ga_name}'. Disponíveis: {list(task_data.keys())}", file=sys.stderr)
            continue
        task_daily = task_data.get(task_id, {})
        issues, mensal_ok, wdays, lim = validate(ga_daily, task_daily, year, month)
        ga_tot = sum(ga_daily.values()); task_tot = sum(task_daily.values())

        # Todos os dias relevantes: dias úteis + dias com apontamentos
        working = set(get_working_days(year, month))
        all_dates = sorted(set(list(ga_daily) + list(task_daily)) | working,
                           key=lambda x: (x[6:], x[3:5], x[:2]))

        days_data = []
        for ds in all_dates:
            g = round(ga_daily.get(ds, 0.0), 2); t = round(task_daily.get(ds, 0.0), 2)
            day_issues = [i for i in issues if i['date'] == ds]
            rules = [i['rule'] for i in day_issues]
            sevs  = {i['rule']: i['severity'] for i in day_issues}
            if 'R1' in rules or 'R3' in rules: status = 'error'
            elif 'R4' in rules: status = 'r4'
            elif 'R0' in rules: status = 'r0'
            elif 'R2' in rules and sevs.get('R2') == 'warning': status = 'warning'
            elif 'R2' in rules: status = 'info'
            else: status = 'ok'
            days_data.append({'date':ds,'ga':g,'task':t,'diff':round(g-t,2),
                               'rules':rules,'sevs':sevs,'status':status})

        persons.append({
            'name':ga_name, 'task_id':task_id,
            'month_label':f"{MONTH_PT[month]} / {year}",
            'export_suffix':f"{month:02d}{year}",
            'ga_total':round(ga_tot,2), 'task_total':round(task_tot,2),
            'diff_total':round(ga_tot-task_tot,2),
            'working_days':wdays, 'monthly_limit':lim, 'mensal_ok':mensal_ok,
            'issues_count':len(issues),
            'errors_count':len([i for i in issues if i['severity']=='error']),
            'warnings_count':len([i for i in issues if i['severity']=='warning']),
            'info_count':len([i for i in issues if i['severity']=='info']),
            'days':days_data, 'issues':issues,
        })

    if not persons:
        print("Nenhuma pessoa processada.", file=sys.stderr); sys.exit(1)

    import os
    sfx  = persons[0]['export_suffix']
    slug = '_'.join(p['task_id'].lower().replace('.','_') for p in persons)

    md_path = os.path.join(args.out, f"validacao_{sfx}_{slug}.md")
    with open(md_path, 'w', encoding='utf-8') as f: f.write(build_md(persons))
    print(f"MD:{md_path}")

    if args.html:
        html_path = os.path.join(args.out, f"validacao_{sfx}_{slug}.html")
        with open(html_path, 'w', encoding='utf-8') as f: f.write(build_html(persons))
        print(f"HTML:{html_path}")

if __name__ == '__main__':
    main()
