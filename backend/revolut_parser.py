"""Revolut GBP account statement PDF parser.

Each transaction is printed as one line:

    1 Jun 2026 Pure Gym Ltd £48.99 £80.12

The statement has separate "Money out" / "Money in" columns, but flowed text
extraction collapses them into a single trailing amount before the running
balance. Rather than guess direction from wording, we track the running
balance: if it dropped by the transaction amount it was money out, if it
rose it was money in. This is robust to wording (transfers, exchanges,
card payments all look different but the balance never lies).

Continuation lines (Reference:, To:, From:, Card:, or a bare foreign-currency
amount for "Exchanged to X" rows) are detail lines and are skipped.
"""

import re
from datetime import date

import pdfplumber

from categorize import categorize

MONTHS = {
    "Jan": 1, "Feb": 2, "Mar": 3, "Apr": 4, "May": 5, "Jun": 6,
    "Jul": 7, "Aug": 8, "Sep": 9, "Oct": 10, "Nov": 11, "Dec": 12,
}

TRANSACTION_LINE_RE = re.compile(
    r"^(?P<day>\d{1,2})\s+(?P<mon>[A-Za-z]{3})\s+(?P<year>\d{4})\s+"
    r"(?P<desc>.+?)\s+£(?P<amount>[\d,]+\.\d{2})\s+£(?P<balance>[\d,]+\.\d{2})$"
)
OPENING_BALANCE_RE = re.compile(r"^Total\s+£([\d,]+\.\d{2})\s+£[\d,]+\.\d{2}\s+£[\d,]+\.\d{2}\s+£[\d,]+\.\d{2}$")


def _parse_date(day: str, mon: str, year: str) -> date | None:
    month = MONTHS.get(mon)
    if not month:
        return None
    try:
        return date(int(year), month, int(day))
    except ValueError:
        return None


def parse(file_path: str) -> list[dict]:
    with pdfplumber.open(file_path) as pdf:
        page_texts = [page.extract_text() or "" for page in pdf.pages]

    full_text = "\n".join(page_texts)
    balance = None
    for line in full_text.splitlines():
        match = OPENING_BALANCE_RE.match(line.strip())
        if match:
            balance = float(match.group(1).replace(",", ""))
            break

    transactions = []
    for page_text in page_texts:
        for line in page_text.splitlines():
            match = TRANSACTION_LINE_RE.match(line.strip())
            if not match:
                continue

            txn_date = _parse_date(match.group("day"), match.group("mon"), match.group("year"))
            if not txn_date:
                continue

            name = match.group("desc").strip()
            amount = float(match.group("amount").replace(",", ""))
            new_balance = float(match.group("balance").replace(",", ""))

            if balance is None:
                direction = "out" if name.lower().startswith("to ") else "in"
            elif abs((balance - amount) - new_balance) < 0.01:
                direction = "out"
            elif abs((balance + amount) - new_balance) < 0.01:
                direction = "in"
            else:
                direction = "out" if name.lower().startswith("to ") else "in"

            balance = new_balance

            transactions.append({
                "date": txn_date,
                "name": name,
                "category": categorize(name),
                "direction": direction,
                "amount": amount,
            })

    return transactions
