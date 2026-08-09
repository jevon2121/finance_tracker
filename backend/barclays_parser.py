"""Barclays current/savings account statement PDF parser.

Each transaction is one line:

    01 Jul Bill Payment to American Exp 3773 520.43
    Ref: PB355977447482540

The date is only printed once per day — later transactions on the same day
omit it and start straight with the description. Only one amount column is
usually present (no separate money-in/money-out columns in the flowed text,
and the running balance is only shown intermittently, not on every line), so
direction is inferred from Barclays' own wording ("Bill Payment *to* X" vs
"Received *From* X") rather than from a balance delta.
"""

import re
from datetime import date

import pdfplumber

from categorize import categorize

MONTHS = {
    "Jan": 1, "Feb": 2, "Mar": 3, "Apr": 4, "May": 5, "Jun": 6,
    "Jul": 7, "Aug": 8, "Sep": 9, "Oct": 10, "Nov": 11, "Dec": 12,
}

STATEMENT_DATE_RE = re.compile(r"Statement date\s+\d{1,2}\s+([A-Za-z]{3})[a-z]*\s+(\d{4})")

TRANSACTION_LINE_RE = re.compile(
    r"^(?:(?P<day>\d{1,2})\s+(?P<mon>[A-Za-z]{3})\s+)?"
    r"(?P<desc>.+?)\s+(?P<amounts>[\d,]+\.\d{2}(?:\s+[\d,]+\.\d{2})?)$"
)

SKIP_DESCRIPTIONS = {"start balance", "end balance"}

OUT_HINTS = ("payment to", "transfer to", "direct debit", "standing order", "cash withdrawal", " to ")
IN_HINTS = ("received", " from ", "direct credit", "interest")


def _infer_direction(desc: str) -> str:
    lower = desc.lower()
    if any(hint in lower for hint in IN_HINTS):
        return "in"
    if any(hint in lower for hint in OUT_HINTS):
        return "out"
    return "out"


def _statement_year(full_text: str) -> tuple[int, int]:
    match = STATEMENT_DATE_RE.search(full_text)
    if match:
        return int(match.group(2)), MONTHS.get(match.group(1), 12)
    return date.today().year, date.today().month


def _resolve_date(mon_abbr: str, day: str, stmt_year: int, stmt_month: int) -> date | None:
    month = MONTHS.get(mon_abbr)
    if not month:
        return None
    year = stmt_year - 1 if month > stmt_month else stmt_year
    try:
        return date(year, month, int(day))
    except ValueError:
        return None


def parse(file_path: str) -> list[dict]:
    with pdfplumber.open(file_path) as pdf:
        page_texts = [page.extract_text() or "" for page in pdf.pages]

    full_text = "\n".join(page_texts)
    stmt_year, stmt_month = _statement_year(full_text)

    transactions = []
    current_date = None

    for page_text in page_texts:
        lines = page_text.splitlines()
        i = 0
        while i < len(lines):
            line = lines[i].strip()
            match = TRANSACTION_LINE_RE.match(line)

            if not match:
                i += 1
                continue

            if match.group("day"):
                current_date = _resolve_date(match.group("mon"), match.group("day"), stmt_year, stmt_month)

            desc = match.group("desc").strip()
            if desc.lower() in SKIP_DESCRIPTIONS or current_date is None:
                i += 1
                continue

            amounts = match.group("amounts").split()
            amount = float(amounts[0].replace(",", ""))

            name = desc
            lines_consumed = 1
            for lookahead in range(1, 3):
                if i + lookahead >= len(lines):
                    break
                candidate = lines[i + lookahead].strip()
                if candidate.startswith("Ref:"):
                    name = f"{desc} - {candidate[4:].strip()}"
                    lines_consumed = lookahead + 1
                    break
                if TRANSACTION_LINE_RE.match(candidate) or not candidate:
                    break
                # else: a short noise/artifact line (e.g. a wrapped glyph) — keep looking

            transactions.append({
                "date": current_date,
                "name": name,
                "category": categorize(name),
                "direction": _infer_direction(name),
                "amount": amount,
            })

            i += lines_consumed

    return transactions
