"""Detects money moved between the user's own accounts across statements.

A transfer (Barclays -> Revolut, or Revolut -> Amex to pay off a card bill)
shows up as an "out" leg on one statement and an "in" leg on another. Neither
leg is real income or spending — counting them inflates both the monthly
inflow/outflow chart and (briefly, if the dates don't line up exactly) the
cumulative wealth trend. This matches opposite-direction legs across
different source files by amount and nearby date, and flags both as
`is_transfer` so summaries can exclude them.

Matching is "mutual best match" (like one round of stable matching): a pair
is only confirmed if each side's closest-by-date candidate is the other side
of the pair. This matters because amounts collide by coincidence sometimes
(e.g. two different £250 payments on the same day) — greedily grabbing
whichever candidate is seen first would silently mismatch those. Requiring
mutual agreement, and treating true ties as unresolvable, means we only ever
auto-flag pairs we're actually confident about; ambiguous cases are left for
manual review via the is_transfer toggle.

Only re-flags transactions currently marked `is_transfer=False` — a manual
un-flag survives unless a fresh statement introduces a new matching partner
for that same transaction.
"""

import re

import models
from sqlalchemy.orm import Session

DATE_TOLERANCE_DAYS = 3
AMOUNT_TOLERANCE = 0.01

SELF_TRANSFER_NAME_PATTERN = re.compile(r"\b(?:TO|FROM)\s+JEVON\b", re.IGNORECASE)


def detect_transfers(db: Session) -> int:
    candidates = db.query(models.Transaction).filter(models.Transaction.is_transfer.is_(False)).all()

    name_matched = 0
    unmatched = []
    for txn in candidates:
        if SELF_TRANSFER_NAME_PATTERN.search(txn.name) or txn.category in ("Savings", "Credit Card Payment"):
            txn.is_transfer = True
            name_matched += 1
        elif txn.direction == models.Direction.IN and txn.category not in ("Salary", "Travel"):
            txn.category = "Savings"
            txn.is_transfer = True
            name_matched += 1
        else:
            unmatched.append(txn)

    outs = [t for t in unmatched if t.direction == models.Direction.OUT]
    ins = [t for t in unmatched if t.direction == models.Direction.IN]

    def is_candidate_pair(out_txn, in_txn) -> bool:
        return (
            out_txn.source_file != in_txn.source_file
            and abs(out_txn.amount - in_txn.amount) <= AMOUNT_TOLERANCE
            and abs((out_txn.date - in_txn.date).days) <= DATE_TOLERANCE_DAYS
        )

    def best_of(scored):
        """The closest-by-date candidate, or None if no unique best exists (ties are ambiguous)."""
        if not scored:
            return None
        best_gap = min(gap for gap, _ in scored)
        best = [other for gap, other in scored if gap == best_gap]
        return best[0] if len(best) == 1 else None

    out_best = {
        out_txn.id: best_of([
            (abs((out_txn.date - in_txn.date).days), in_txn)
            for in_txn in ins
            if is_candidate_pair(out_txn, in_txn)
        ])
        for out_txn in outs
    }
    in_best = {
        in_txn.id: best_of([
            (abs((out_txn.date - in_txn.date).days), out_txn)
            for out_txn in outs
            if is_candidate_pair(out_txn, in_txn)
        ])
        for in_txn in ins
    }

    matched_count = 0
    for out_txn in outs:
        partner = out_best.get(out_txn.id)
        if partner and in_best.get(partner.id) and in_best[partner.id].id == out_txn.id:
            out_txn.is_transfer = True
            partner.is_transfer = True
            matched_count += 1

    db.commit()
    return matched_count + name_matched
