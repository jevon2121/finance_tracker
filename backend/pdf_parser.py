"""Bank-statement PDF parser dispatcher.

Sniffs the first page of text for a bank-identifying marker and routes to
the matching parser module. Add a new bank by writing a `parse(file_path)`
module and registering a marker below.

Markers must be specific enough to only appear in that bank's own statement
chrome (its letterhead/footer) — NOT a bare bank name. One account's
transaction can legitimately mention another bank by name (e.g. a Barclays
payment reference reading "to Revolut -PF6R-"), which would misidentify the
whole statement if the marker were just "revolut".
"""

import pdfplumber

import amex_parser
import barclays_parser
import revolut_parser

BANK_MARKERS = (
    ("americanexpress.co.uk", amex_parser),
    ("american express services", amex_parser),
    ("revolut ltd", revolut_parser),
    ("barclays bank uk plc", barclays_parser),
)


class UnknownStatementFormat(Exception):
    pass


def detect_bank(file_path: str):
    with pdfplumber.open(file_path) as pdf:
        sample_text = "\n".join((page.extract_text() or "") for page in pdf.pages[:2]).lower()

    for marker, module in BANK_MARKERS:
        if marker in sample_text:
            return module

    raise UnknownStatementFormat(
        "Could not identify the bank/card issuer for this PDF. "
        "Supported formats: American Express, Revolut, Barclays."
    )


def parse_pdf(file_path: str) -> list[dict]:
    module = detect_bank(file_path)
    return module.parse(file_path)
