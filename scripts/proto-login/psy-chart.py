# -*- coding: utf-8 -*-
"""Рисунок для страницы входа /data/PsyStudResurs/: спрос «курсовая по психологии» по месяцам
(Вордстат, вся Россия, ноябрь 2024 — сентябрь 2026). Классы и viewBox те же, что у фасада Сиротиной
(HOUSE_CSS в src/lib/proto.ts): 668×440, поля по 24 ед. Печатает SVG в stdout.
Запуск: python scripts/proto-login/psy-chart.py <dynamics.csv>"""
import csv
import sys

src = sys.argv[1]
pts = []
with open(src, encoding="utf-8-sig") as f:
    for r in csv.DictReader(f, delimiter=";"):
        if r["запрос"] == "курсовая по психологии":
            pts.append((r["месяц"], int(r["запросов"])))
pts.sort()

L, R, T, B = 72, 644, 76, 360   # область графика
VMAX = 6000
n = len(pts)
step = (R - L) / (n - 1)
x = lambda i: L + i * step
y = lambda v: B - (B - T) * v / VMAX
MON = "ЯНВ ФЕВ МАР АПР МАЙ ИЮН ИЮЛ АВГ СЕН ОКТ НОЯ ДЕК".split()

out = ['<div class="art" aria-hidden="true">', '  <svg viewBox="0 0 668 440" fill="none">',
       '    <text x="24" y="34" class="t hi">СПРОС · КУРСОВАЯ ПО ПСИХОЛОГИИ</text>',
       '    <text x="644" y="34" class="t" text-anchor="end">ЗАПРОСОВ В МЕСЯЦ</text>']
d = 0.2
# сетка и подписи шкалы
for v in (0, 2000, 4000, 6000):
    cls = "ln" if v == 0 else "ln thin"
    out.append(f'    <path pathLength="1" class="{cls}" style="--d:{d:.2f}s" d="M{L} {y(v):.1f}H{R}"/>')
    out.append(f'    <text x="24" y="{y(v) + 4:.1f}" class="t">{v // 1000 if v else 0}{" ТЫС" if v else ""}</text>')
    d += 0.08
# столбики по месяцам
for i, (m, v) in enumerate(pts):
    out.append(f'    <path pathLength="1" class="ln hatch" style="--d:{d:.2f}s" d="M{x(i):.1f} {B}V{y(v):.1f}"/>')
    d += 0.025
# кривая
path = "M" + "L".join(f"{x(i):.1f} {y(v):.1f}" for i, (_, v) in enumerate(pts))
out.append(f'    <path pathLength="1" class="ln strong" style="--d:{d:.2f}s" d="{path}"/>')
d += 1.0
# пик и последняя точка
pi = max(range(n), key=lambda i: pts[i][1])
li = n - 1
for i, red, w in ((pi, True, "0s"), (li, False, "2.4s")):
    cx, cy = x(i), y(pts[i][1])
    out.append(f'    <rect pathLength="1" class="win{" red" if red else ""}" style="--d:{d:.2f}s;--w:{w}" '
               f'x="{cx - 5:.1f}" y="{cy - 5:.1f}" width="10" height="10"/>')
    d += 0.1
def label(i):
    m, v = pts[i]
    return f"{MON[int(m[5:]) - 1]} {m[:4]} · {v:,}".replace(",", " ")
cx, cy = x(pi), y(pts[pi][1])
out.append(f'    <path pathLength="1" class="ln thin" style="--d:{d:.2f}s" d="M{cx + 9:.1f} {cy:.1f}H{cx + 40:.1f}"/>')
out.append(f'    <text x="{cx + 46:.1f}" y="{cy + 4:.1f}" class="t hi">{label(pi)}</text>')
cx, cy = x(li), y(pts[li][1])
out.append(f'    <path pathLength="1" class="ln thin" style="--d:{d + .05:.2f}s" d="M{cx - 9:.1f} {cy:.1f}H{cx - 30:.1f}"/>')
out.append(f'    <text x="{cx - 36:.1f}" y="{cy + 4:.1f}" class="t" text-anchor="end">{label(li)}</text>')
# подписи оси времени
for i, (m, _) in enumerate(pts):
    if m[5:] == "01" or i == li:
        anchor = "end" if i == li else "middle"
        out.append(f'    <text x="{x(i):.1f}" y="{B + 22}" class="t" text-anchor="{anchor}">{MON[int(m[5:]) - 1]} {m[2:4]}</text>')
# штамп
out.append(f'    <path pathLength="1" class="ln thin" style="--d:{d + .1:.2f}s" d="M340 396H644V428H340ZM480 396V428M590 396V428"/>')
out.append('    <text x="352" y="416" class="t hi">ПСИСТУДРЕСУРС</text>')
out.append('    <text x="492" y="416" class="t">ВОРДСТАТ</text>')
out.append('    <text x="602" y="416" class="t">РФ</text>')
out += ['  </svg>', '</div>']
print("\n".join(out))
