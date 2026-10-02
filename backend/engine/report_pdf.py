"""Polished financial-plan PDF (ReportLab). Pure server-side composition."""
from io import BytesIO
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle)

NAVY = colors.HexColor("#0B1437")
BLUE = colors.HexColor("#0052FF")
MUTED = colors.HexColor("#60708f")
BG = colors.HexColor("#f6f8fc")
BORDER = colors.HexColor("#e2e8f0")
GREEN = colors.HexColor("#00A36C")
RED = colors.HexColor("#EE5D50")


def _money(v):
    try:
        return f"${float(v):,.0f}"
    except (TypeError, ValueError):
        return "$0"


def build_plan_pdf(data: dict) -> bytes:
    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=letter, topMargin=0.7 * inch, bottomMargin=0.7 * inch,
                            leftMargin=0.8 * inch, rightMargin=0.8 * inch,
                            title=f"{data.get('household_name', 'Household')} — Financial Plan")
    ss = getSampleStyleSheet()
    h1 = ParagraphStyle("h1", parent=ss["Title"], textColor=NAVY, fontSize=22, spaceAfter=2)
    sub = ParagraphStyle("sub", parent=ss["Normal"], textColor=MUTED, fontSize=10, spaceAfter=14)
    h2 = ParagraphStyle("h2", parent=ss["Heading2"], textColor=NAVY, fontSize=13, spaceBefore=16, spaceAfter=6)
    body = ParagraphStyle("body", parent=ss["Normal"], textColor=NAVY, fontSize=10, leading=15)
    small = ParagraphStyle("small", parent=ss["Normal"], textColor=MUTED, fontSize=8, leading=11)
    el = []

    firm = data.get("firm_name") or "Compass Planning"
    el.append(Paragraph(firm, ParagraphStyle("firm", parent=ss["Normal"], textColor=BLUE, fontSize=11, spaceAfter=2)))
    el.append(Paragraph(data.get("household_name", "Household"), h1))
    el.append(Paragraph("Canadian financial plan summary — illustrative, not financial, tax or legal advice.", sub))

    # KPI row
    rs = f"{int(data['retirement_success'])}%" if data.get("retirement_success") is not None else "—"
    ps = f"{int(data['protection_score'])}/100" if data.get("protection_score") is not None else "—"
    kpi = Table([[
        _kpi_cell("Net Worth", _money(data.get("net_worth"))),
        _kpi_cell("Protection", ps),
        _kpi_cell("Retirement success", rs),
    ]], colWidths=[2.2 * inch] * 3, hAlign="LEFT")
    kpi.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                             ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 8)]))
    el.append(kpi)

    # Net worth
    el.append(Paragraph("Net worth", h2))
    el.append(_kv_table([("Total assets", _money(data.get("total_assets"))),
                         ("Total liabilities", _money(data.get("total_liabilities"))),
                         ("Net worth", _money(data.get("net_worth")))]))

    # Retirement
    if data.get("retirement"):
        r = data["retirement"]
        el.append(Paragraph("Retirement", h2))
        el.append(_kv_table([("Scenario", str(r.get("name", "Latest"))),
                             ("Projected portfolio at retirement", _money(r.get("nest_egg"))),
                             ("Target monthly income", _money(r.get("monthly_income_goal")) + "/mo" if r.get("monthly_income_goal") else "—")]))

    # Protection
    if data.get("protection"):
        el.append(Paragraph("Protection gaps", h2))
        rows = []
        for p in data["protection"]:
            k = p.get("kind")
            if k == "life":
                rows.append(("Life insurance gap", _money(p.get("life_gap"))))
            elif k == "di":
                rows.append(("Disability monthly gap", _money(p.get("di_monthly_gap")) + "/mo"))
            elif k == "ltc":
                rows.append(("Long-term care gap", _money(p.get("ltc_gap")) + "/day"))
        el.append(_kv_table(rows or [("No protection analyses saved", "—")]))

    # Estate
    if data.get("estate"):
        e = data["estate"]
        el.append(Paragraph("Estate settlement", h2))
        el.append(_kv_table([("Gross estate", _money(e.get("grossEstateValue"))),
                             ("Probate fees", _money(e.get("probate", {}).get("probateFee"))),
                             ("Terminal (deemed-disposition) tax", _money(e.get("terminalTax", {}).get("estimatedTax"))),
                             ("Net to heirs", _money(e.get("netToHeirs")))]))
        wf = _estate_waterfall(e)
        if wf:
            el.append(Spacer(1, 6))
            el.append(wf)

    # Goals
    el.append(Paragraph("Goals", h2))
    gdata = [["Goal", "Progress", "Status"]]
    for g in (data.get("goals") or [])[:8]:
        try:
            pct = round(float(g.get("current_amount", 0)) / float(g.get("target_amount", 1)) * 100)
        except (TypeError, ValueError, ZeroDivisionError):
            pct = 0
        gdata.append([str(g.get("title", "Goal")), f"{pct}%", str(g.get("status", "")).replace("_", " ").title()])
    if len(gdata) == 1:
        gdata.append(["No goals on file", "—", "—"])
    gt = Table(gdata, colWidths=[3.4 * inch, 1.3 * inch, 1.8 * inch], hAlign="LEFT")
    gt.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), BG), ("TEXTCOLOR", (0, 0), (-1, 0), MUTED),
        ("FONTSIZE", (0, 0), (-1, -1), 9), ("TEXTCOLOR", (0, 1), (-1, -1), NAVY),
        ("LINEBELOW", (0, 0), (-1, -1), 0.5, BORDER), ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6), ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
    ]))
    el.append(gt)

    el.append(Spacer(1, 18))
    el.append(Paragraph(f"Prepared with {firm}. Illustrative summary only. We never ask for your password or card details.", small))
    doc.build(el)
    return buf.getvalue()


def _kpi_cell(label, value):
    t = Table([[Paragraph(f'<font size=8 color="#60708f">{label.upper()}</font>', getSampleStyleSheet()["Normal"])],
               [Paragraph(f'<font size=16 color="#0B1437"><b>{value}</b></font>', getSampleStyleSheet()["Normal"])]],
              colWidths=[2.1 * inch])
    t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), BG), ("BOX", (0, 0), (-1, -1), 0.5, BORDER),
                           ("TOPPADDING", (0, 0), (-1, -1), 8), ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
                           ("LEFTPADDING", (0, 0), (-1, -1), 10)]))
    return t


def _kv_table(rows):
    data = [[Paragraph(f'<font size=10 color="#60708f">{k}</font>', getSampleStyleSheet()["Normal"]),
             Paragraph(f'<font size=10 color="#0B1437"><b>{v}</b></font>', getSampleStyleSheet()["Normal"])] for k, v in rows]
    t = Table(data, colWidths=[3.8 * inch, 2.7 * inch], hAlign="LEFT")
    t.setStyle(TableStyle([("LINEBELOW", (0, 0), (-1, -1), 0.5, BORDER), ("TOPPADDING", (0, 0), (-1, -1), 5),
                           ("BOTTOMPADDING", (0, 0), (-1, -1), 5), ("ALIGN", (1, 0), (1, -1), "RIGHT")]))
    return t


def _estate_waterfall(e):
    net = max(0, e.get("netToHeirs", 0))
    pr = max(0, e.get("probate", {}).get("probateFee", 0))
    tt = max(0, e.get("terminalTax", {}).get("estimatedTax", 0))
    total = net + pr + tt
    if total <= 0:
        return None
    segs = [(lbl, v, c) for lbl, v, c in
            [("Net to heirs", net, GREEN), ("Probate", pr, colors.HexColor("#FFB800")), ("Terminal tax", tt, RED)] if v > 0]
    raw = [max(0.7 * inch, (v / total) * 6.0 * inch) for _, v, _ in segs]
    scale = (6.0 * inch) / sum(raw) if sum(raw) > 6.0 * inch else 1.0
    widths = [w * scale for w in raw]
    row = [Paragraph(f'<font color="white" size=7><b>{lbl}<br/>{_money(v)}</b></font>', getSampleStyleSheet()["Normal"]) for lbl, v, _ in segs]
    t = Table([row], colWidths=widths, hAlign="LEFT")
    style = [("ALIGN", (0, 0), (-1, -1), "CENTER"), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
             ("LEFTPADDING", (0, 0), (-1, -1), 2), ("RIGHTPADDING", (0, 0), (-1, -1), 2),
             ("TOPPADDING", (0, 0), (-1, -1), 9), ("BOTTOMPADDING", (0, 0), (-1, -1), 9)]
    for i, (_, _, c) in enumerate(segs):
        style.append(("BACKGROUND", (i, 0), (i, 0), c))
    t.setStyle(TableStyle(style))
    return t
