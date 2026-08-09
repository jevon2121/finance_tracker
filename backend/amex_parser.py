"""Amex-style credit card statement PDF parser.

Tuned against a real Amex "Statement of Account" export. Each transaction is
printed as one line:

    Jun19 Jun19 PAYMENT RECEIVED - THANK YOU 250.00

optionally followed by a continuation line with extra merchant detail and/or
a "CR" marker meaning the amount is a credit (money in) rather than a debit
(money out, the default for card statements).
"""

import re
from datetime import date

import pdfplumber

from categorize import categorize

TRANSACTION_LINE_RE = re.compile(
    r"^[A-Z][a-z]{2}\d{1,2}\s+[A-Z][a-z]{2}\d{1,2}\s+(?P<desc>.+?)\s+(?P<amount>[\d,]+\.\d{2})$"
)
TRANSACTION_DATE_RE = re.compile(r"^([A-Z][a-z]{2})(\d{1,2})\s+")
STATEMENT_PERIOD_RE = re.compile(
    r"Statement Period From\s*\d{1,2}([A-Za-z]+)\s*to\s*\d{1,2}([A-Za-z]+)(\d{4})"
)

MONTHS = {
    "Jan": 1, "Feb": 2, "Mar": 3, "Apr": 4, "May": 5, "Jun": 6,
    "Jul": 7, "Aug": 8, "Sep": 9, "Oct": 10, "Nov": 11, "Dec": 12,
}

NON_CONTINUATION_PREFIXES = (
    "Total ", "How you can pay", "OTHER ACCOUNT TRANSACTIONS",
    "Direct Debit", "Debit Card", "Internet Banking", "CHAPS payment",
    "International payment", "Please Note",
)


def _statement_end_year_month(full_text: str) -> tuple[int, int]:
    match = STATEMENT_PERIOD_RE.search(full_text)
    if match:
        end_month_name, end_year = match.group(2), int(match.group(3))
        return end_year, MONTHS.get(end_month_name, 12)
    return date.today().year, date.today().month


def _resolve_date(mon_abbr: str, day: str, end_year: int, end_month: int) -> date | None:
    month = MONTHS.get(mon_abbr)
    if not month:
        return None
    year = end_year - 1 if month > end_month else end_year
    try:
        return date(year, month, int(day))
    except ValueError:
        return None


def parse(file_path: str) -> list[dict]:
    with pdfplumber.open(file_path) as pdf:
        page_texts = [page.extract_text() or "" for page in pdf.pages]

    full_text = "\n".join(page_texts)
    end_year, end_month = _statement_end_year_month(full_text)

    transactions = []
    for page_text in page_texts:
        lines = page_text.splitlines()
        i = 0
        while i < len(lines):
            line = lines[i]
            match = TRANSACTION_LINE_RE.match(line)
            if not match:
                i += 1
                continue

            date_match = TRANSACTION_DATE_RE.match(line)
            txn_date = _resolve_date(date_match.group(1), date_match.group(2), end_year, end_month)
            if not txn_date:
                i += 1
                continue

            name = match.group("desc").strip()
            amount = float(match.group("amount").replace(",", ""))
            direction = "out"

            next_line = lines[i + 1].strip() if i + 1 < len(lines) else ""
            consumed_next = False
            is_stop_line = next_line.startswith(NON_CONTINUATION_PREFIXES)
            if next_line and not is_stop_line and not TRANSACTION_LINE_RE.match(next_line):
                if next_line == "CR":
                    direction = "in"
                    consumed_next = True
                elif next_line.endswith(" CR") or next_line.endswith("\tCR"):
                    name = f"{name} - {next_line[:-2].strip()}"
                    direction = "in"
                    consumed_next = True
                elif next_line not in ("GOODS",) and not next_line.isupper():
                    name = f"{name} - {next_line}"
                    consumed_next = True
                elif next_line == "GOODS":
                    consumed_next = True

            transactions.append({
                "date": txn_date,
                "name": name,
                "category": categorize(name),
                "direction": direction,
                "amount": amount,
            })

            i += 2 if consumed_next else 1

    return transactions
