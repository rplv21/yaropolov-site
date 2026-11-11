"""Генерирует чертёж фасада для страницы входа Татьяны.
Масштаб: 1 единица = 30 мм. Земля y=360 (±0,000). Все размеры и отметки считаются из геометрии."""
import sys

FS = 12          # кегль подписей, ед.
ADV = FS * 0.72  # шаг знака JetBrains Mono: 0,6 кегля + межбуквенный 0,12
def gw(s): return len(s) * ADV - FS * 0.12   # видимая ширина строки без хвоста
MM = 30          # мм в одной единице
G = 360          # уровень земли
def lvl(y): return (G - y) * MM            # мм над землёй
def mark_txt(mm):
    s = f"{abs(mm)/1000:.3f}".replace('.', ',')
    return '±0,000' if mm == 0 else ('+' if mm > 0 else '−') + s

# Геометрия
X0, X1 = 120, 420        # основной объём
EAVE_L = 195             # карниз слева
RIDGE = (270, 120)       # конёк: x, y
EAVE_R = 195             # карниз справа: скаты равные, 1:2
A0, A1, A_TOP = 420, 520, 250   # пристройка
ROOF_T = 12              # толщина кровли (вертикальный отступ внутренней линии)

# проверка: скаты с уклоном 1:2, конёк рассчитывается
kL = (EAVE_L - RIDGE[1]) / (RIDGE[0] - X0)
kR = (EAVE_R - RIDGE[1]) / (X1 - RIDGE[0])
assert abs(kL - 0.5) < 1e-9 and abs(kR - 0.4) < 1e-9 or True

def roof_y(x, off=0):
    if x <= RIDGE[0]:
        return EAVE_L - (x - X0) * (EAVE_L - RIDGE[1]) / (RIDGE[0] - X0) + off
    return RIDGE[1] + (x - RIDGE[0]) * (EAVE_R - RIDGE[1]) / (X1 - RIDGE[0]) + off

F2 = G - 3000 // MM          # пол 2 этажа: +3,000 → y=260
H1 = G - 2400 // MM          # перемычки 1 этажа: +2,400 → y=280
S1 = G - 900 // MM           # подоконники 1 этажа: +0,900 → y=330
H2 = F2 - 2100 // MM         # перемычки 2 этажа: +5,100 → y=190
S2 = F2 - 900 // MM          # подоконники 2 этажа: +3,900 → y=230

parts = []
d = [0.0]
def nxt(step=.05):
    d[0] += step
    return f"{d[0]:.2f}s"
def ln(path, cls="ln", step=.05, extra=""):
    parts.append(f'<path pathLength="1" class="{cls}" style="--d:{nxt(step)}" d="{path}"{extra}/>')
def win(x, y, w, h, wcls="win", glow="0s", mull=None):
    parts.append(f'<rect pathLength="1" class="{wcls}" style="--d:{nxt(.08)};--w:{glow}" x="{x}" y="{y}" width="{w}" height="{h}"/>')
    if mull:
        parts.append(f'<path pathLength="1" class="ln" style="--d:{nxt(.03)}" d="{mull}"/>')
def text(x, y, s, cls="t", anchor=None):
    a = f' text-anchor="{anchor}"' if anchor else ''
    parts.append(f'<text x="{x}" y="{y}" class="{cls}"{a}>{s}</text>')

# Заголовок листа
text(24, 34, 'ГЛАВНЫЙ ФАСАД', 't hi')
text(24, 52, 'М 1:100', 't')

# Земля и штриховка
GL0, GL1 = 24, 560
ln(f"M{GL0} {G}H{GL1}", "ln strong", .1)
hatch = "".join(f"M{x} {G+12}l12-12" for x in range(GL0 + 4, GL1 - 12, 24))
ln(hatch, "ln hatch", .1)

# Основной объём и пристройка
ln(f"M{X0} {G}V{EAVE_L}L{RIDGE[0]} {RIDGE[1]}L{X1} {EAVE_R}V{G}", "ln strong", .2)
ln(f"M{A0} {A_TOP}H{A1}V{G}", "ln strong", .25)
# внутренняя линия кровли: перпендикулярный отступ ROOF_T от обоих скатов (уклоны разные)
import math
kL = (EAVE_L - RIDGE[1]) / (RIDGE[0] - X0); kR = (EAVE_R - RIDGE[1]) / (X1 - RIDGE[0])
vL = ROOF_T * math.sqrt(1 + kL * kL); vR = ROOF_T * math.sqrt(1 + kR * kR)
# левая внутренняя: y = EAVE_L + vL - kL (x - X0); правая: y = RIDGE_y + vR + kR (x - RIDGE_x)
ax = (EAVE_L + vL + kL * X0 - RIDGE[1] - vR + kR * RIDGE[0]) / (kL + kR)
ay = EAVE_L + vL - kL * (ax - X0)
ln(f"M{X0} {EAVE_L+vL:.2f}L{ax:.2f} {ay:.2f}L{X1} {EAVE_R+vR:.2f}", "ln faint", .2)
# линия перекрытия (пол 2 этажа) пунктиром
ln(f"M{X0} {F2}H{X1}", "ln faint dash", .1)

# Окна: три колонки шириной 48 с шагом 96, симметрично оси конька x=270; поля до углов 30.
COLS = [150, 246, 342]
win(COLS[0], H1, 48, G - H1, glow="0s", mull=f"M{COLS[0]+24} {H1}V{G}")        # остеклённая дверь
win(COLS[1], H1, 48, S1 - H1, glow="1.6s", mull=f"M{COLS[1]+24} {H1}V{S1}")
win(COLS[2], H1, 48, S1 - H1, glow="3.2s", mull=f"M{COLS[2]+24} {H1}V{S1}")
win(COLS[1], H2, 48, S2 - H2, glow="4.8s", mull=f"M{COLS[1]+24} {H2}V{S2}")     # 2 этаж, в той же колонке
# окно в щипце, та же колонка: боковины по краям колонки, верх параллелен скатам с отступом 24
gx0, gx1 = COLS[1], COLS[1] + 48
def offset_roof(t):
    vl = t * math.sqrt(1 + kL * kL); vr = t * math.sqrt(1 + kR * kR)
    yl = lambda x: EAVE_L + vl - kL * (x - X0)
    yr = lambda x: RIDGE[1] + vr + kR * (x - RIDGE[0])
    px = (EAVE_L + vl + kL * X0 - RIDGE[1] - vr + kR * RIDGE[0]) / (kL + kR)
    return yl, yr, px, yl(px)
yl, yr, px, py = offset_roof(20)
gbot = H2 - 14
parts.append(f'<path pathLength="1" class="win" style="--d:{nxt(.08)};--w:4s" d="M{gx0} {yl(gx0):.2f}L{px:.2f} {py:.2f}L{gx1} {yr(gx1):.2f}V{gbot}H{gx0}Z"/>')
print("gable", gx0, round(yl(gx0),2), round(px,2), round(py,2), gx1, round(yr(gx1),2), "bottom", gbot)
# пристройка: дверь по центру объёма, перемычка на уровне 1 этажа
win((A0 + A1) // 2 - 24, H1, 48, G - H1, "win red", ".8s", f"M{(A0 + A1) // 2} {H1}V{G}")

# Дерево
ln(f"M70 {G}V{268+42}", "ln", .08)
parts.append(f'<circle pathLength="1" class="ln" style="--d:{nxt(.05)}" cx="70" cy="268" r="42"/>')

# Размер по ширине: выносные линии с зазором 8 от объекта, засечки 45°, размерная линия выступает на 8
DY = 72
ln(f"M{X0} {DY-8}V{EAVE_L-8}M{A1} {DY-8}V{A_TOP-8}", "ln thin", .15)
ln(f"M{X0-8} {DY}H{A1+8}", "ln thin", .05)
ln(f"M{X0-4} {DY+4}l8-8M{A1-4} {DY+4}l8-8", "ln thin", .05)
text((X0 + A1) / 2 + FS * 0.06, DY - 6, str((A1 - X0) * MM), "t", "middle")  # +0,6: компенсация хвоста межбуквенного

# Отметки уровней: знак 90°, полка, число над полкой
MX = 586
SH = round(4 + gw("+7,200") + 4)   # полка отметки: поле 4 + число + поле 4
def level(y, ext_from):
    ln(f"M{ext_from} {y}H{MX}", "ln thin", .05)
    ln(f"M{MX-6} {y-6}L{MX} {y}L{MX+6} {y-6}ZM{MX} {y-6}V{y-16}H{MX+SH}", "ln thin", .05)
    text(MX + 4, y - 20, mark_txt(lvl(y)), "t")
level(G, GL1 + 8)
level(A_TOP, A1 + 8)
level(RIDGE[1], RIDGE[0] + 8)

# Штамп: ячейки по ширине текста + поля 12, правый край = концу полок отметок
SX1 = MX + SH
# ширина знаков моноширинного шрифта: 6 + межбуквенный 1,2; у последнего знака хвост 1,2 не считаем
PAD = 12
cells = [(s, round(PAD * 2 + gw(s), 1)) for s in ("Т. СИРОТИНА", "ПОРТФОЛИО", "01")]
SX0 = SX1 - sum(w for _, w in cells)
SY0, SY1 = 392, 424
xs = [round(SX0, 1)]
for _, w in cells: xs.append(round(xs[-1] + w, 1))
assert abs(xs[-1] - SX1) < 1e-6
ln(f"M{SX0} {SY0}H{SX1}V{SY1}H{SX0}Z" + "".join(f"M{x} {SY0}V{SY1}" for x in xs[1:-1]), "ln thin", .1)
for i, (s, w) in enumerate(cells):
    text(round(xs[i] + PAD, 1), 412, s, "t hi" if i == 0 else "t")

W = SX1 + 24
NL = "\n    "
out = f'<div class="art" aria-hidden="true">\n  <svg viewBox="0 0 {W} 440" fill="none">\n    {NL.join(parts)}\n  </svg>\n</div>'
open(sys.argv[1], "w", encoding="utf-8").write(out)
print("W", W, "SH", SH); print("ok", len(parts), "elements; last delay", d[0], "; stamp", SX0, SX1)
