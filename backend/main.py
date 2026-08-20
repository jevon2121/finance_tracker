import tempfile
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, text
from sqlalchemy.orm import Session

import models
import schemas
from database import Base, SessionLocal, engine, get_db
from pdf_parser import UnknownStatementFormat, parse_pdf
from transfers import detect_transfers

with engine.begin() as conn:
    inspector = inspect(conn)

    # SQLite's create_all only creates missing tables, not missing columns on
    # existing ones — add is_transfer by hand if this is an older database.
    if "transactions" in inspector.get_table_names():
        existing_columns = {col["name"] for col in inspector.get_columns("transactions")}
        if "is_transfer" not in existing_columns:
            conn.execute(text("ALTER TABLE transactions ADD COLUMN is_transfer BOOLEAN NOT NULL DEFAULT 0"))

    # net_worth_entries used to be a singleton-per-category table (category
    # as primary key, one row max per category). It's now a history table
    # (auto id, many rows per category over time) so a real month-by-month
    # net worth trend is possible. Migrate any old-style rows forward.
    if "net_worth_entries" in inspector.get_table_names():
        old_columns = {col["name"] for col in inspector.get_columns("net_worth_entries")}
        if "id" not in old_columns:
            old_rows = conn.execute(text("SELECT category, amount, as_of_date FROM net_worth_entries")).fetchall()
            conn.execute(text("DROP TABLE net_worth_entries"))
            models.NetWorthEntry.__table__.create(bind=conn)
            for category, amount, as_of_date in old_rows:
                conn.execute(
                    text(
                        "INSERT INTO net_worth_entries (category, amount, as_of_date) "
                        "VALUES (:category, :amount, :as_of_date)"
                    ),
                    {"category": category, "amount": amount, "as_of_date": as_of_date},
                )

Base.metadata.create_all(bind=engine)

with engine.begin() as conn:
    # "Investments" was renamed to "Savings" to cover both Trading212 and a
    # bank Saver pot; re-tag existing rows so the new category filter (used
    # by the savings cohort tracker) picks them all up.
    conn.execute(text("UPDATE transactions SET category = 'Savings' WHERE category = 'Investments'"))
    conn.execute(
        text("UPDATE transactions SET category = 'Savings' WHERE category != 'Savings' AND UPPER(name) LIKE '%SAVER%'")
    )
    conn.execute(text("UPDATE transactions SET category = 'Travel' WHERE category = 'Currency Exchange'"))

TRANSACTIONS_START_DATE = date(2026, 8, 1)

ROLLING_YEAR_ANCHOR_MONTH = 8
ROLLING_YEAR_ANCHOR_DAY = 1


def _rolling_year_start(as_of: date) -> date:
    year = as_of.year if (as_of.month, as_of.day) >= (ROLLING_YEAR_ANCHOR_MONTH, ROLLING_YEAR_ANCHOR_DAY) else as_of.year - 1
    start = date(year, ROLLING_YEAR_ANCHOR_MONTH, ROLLING_YEAR_ANCHOR_DAY)
    return max(start, TRANSACTIONS_START_DATE)

app = FastAPI(title="Budget Tracker API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/transactions", response_model=schemas.TransactionOut)
def create_transaction(txn_in: schemas.TransactionCreate, db: Session = Depends(get_db)):
    """For cash spending or anything else that never shows up on an imported statement."""
    txn = models.Transaction(**txn_in.model_dump(), source_file="Manual entry")
    db.add(txn)
    db.commit()
    db.refresh(txn)
    detect_transfers(db)
    db.refresh(txn)
    return txn


@app.post("/transactions/upload", response_model=schemas.UploadResult)
async def upload_statement(file: UploadFile, db: Session = Depends(get_db)):
    if file.content_type != "application/pdf" and not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")

    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name

    try:
        parsed = parse_pdf(tmp_path)
    except UnknownStatementFormat as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    finally:
        Path(tmp_path).unlink(missing_ok=True)

    inserted = []
    for row in parsed:
        exists = (
            db.query(models.Transaction)
            .filter(
                models.Transaction.date == row["date"],
                models.Transaction.name == row["name"],
                models.Transaction.amount == row["amount"],
                models.Transaction.direction == row["direction"],
            )
            .first()
        )
        if exists:
            continue
        txn = models.Transaction(**row, source_file=file.filename)
        db.add(txn)
        inserted.append(txn)

    db.commit()
    for txn in inserted:
        db.refresh(txn)

    transfers_detected = detect_transfers(db)
    for txn in inserted:
        db.refresh(txn)

    return schemas.UploadResult(inserted=len(inserted), transactions=inserted, transfers_detected=transfers_detected)


@app.post("/transactions/detect-transfers")
def run_transfer_detection(db: Session = Depends(get_db)):
    return {"transfers_detected": detect_transfers(db)}


@app.get("/transactions", response_model=list[schemas.TransactionOut])
def list_transactions(
    category: str | None = None,
    direction: models.Direction | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
    is_transfer: bool | None = None,
    db: Session = Depends(get_db),
):
    query = db.query(models.Transaction).filter(models.Transaction.date >= TRANSACTIONS_START_DATE)
    if category:
        query = query.filter(models.Transaction.category == category)
    if direction:
        query = query.filter(models.Transaction.direction == direction)
    if start_date:
        query = query.filter(models.Transaction.date >= start_date)
    if end_date:
        query = query.filter(models.Transaction.date <= end_date)
    if is_transfer is not None:
        query = query.filter(models.Transaction.is_transfer == is_transfer)
    return query.order_by(models.Transaction.date.desc()).all()


@app.patch("/transactions/{transaction_id}", response_model=schemas.TransactionOut)
def update_transaction(transaction_id: int, update: schemas.TransactionUpdate, db: Session = Depends(get_db)):
    txn = db.get(models.Transaction, transaction_id)
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")
    for field, value in update.model_dump(exclude_unset=True).items():
        setattr(txn, field, value)
    db.commit()
    db.refresh(txn)
    return txn


@app.delete("/transactions/{transaction_id}", status_code=204)
def delete_transaction(transaction_id: int, db: Session = Depends(get_db)):
    txn = db.get(models.Transaction, transaction_id)
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")
    db.delete(txn)
    db.commit()


@app.get("/summary/monthly", response_model=list[schemas.MonthlySummary])
def monthly_summary(db: Session = Depends(get_db)):
    rows = (
        db.query(models.Transaction)
        .filter(models.Transaction.is_transfer.is_(False), models.Transaction.date >= TRANSACTIONS_START_DATE)
        .all()
    )
    buckets: dict[str, dict[str, float]] = defaultdict(lambda: {"in": 0.0, "out": 0.0})
    for row in rows:
        key = row.date.strftime("%Y-%m")
        buckets[key][row.direction.value] += row.amount

    result = []
    for month in sorted(buckets):
        total_in = buckets[month]["in"]
        total_out = buckets[month]["out"]
        result.append(schemas.MonthlySummary(
            month=month, total_in=total_in, total_out=total_out, net=total_in - total_out,
        ))
    return result


def _net_up_to(db: Session, as_of_date: date) -> float:
    rows = (
        db.query(models.Transaction)
        .filter(
            models.Transaction.date >= TRANSACTIONS_START_DATE,
            models.Transaction.date <= as_of_date,
            models.Transaction.is_transfer.is_(False),
        )
        .all()
    )
    return sum(r.amount if r.direction == models.Direction.IN else -r.amount for r in rows)


def _latest_entry(db: Session, category: models.NetWorthCategory, as_of: date | None = None):
    query = db.query(models.NetWorthEntry).filter(models.NetWorthEntry.category == category)
    if as_of is not None:
        query = query.filter(models.NetWorthEntry.as_of_date <= as_of)
    return query.order_by(models.NetWorthEntry.as_of_date.desc()).first()


def _cash_savings_offset(db: Session) -> float:
    snapshot = _latest_entry(db, models.NetWorthCategory.CASH_SAVINGS)
    if not snapshot:
        return 0.0
    return snapshot.amount - _net_up_to(db, snapshot.as_of_date)


def _savings_up_to(db: Session, as_of_date: date) -> float:
    """Net contributed to Savings-category transactions (Trading212, a bank
    Saver pot, ...) up to a date. Money leaving cash *into* savings is a
    contribution (+); money coming back *out* of savings is a withdrawal (-)
    — the opposite sign convention from a normal spend/income view, because
    here we're valuing the savings pot itself, not the cash account.
    Deliberately ignores is_transfer: a Saver top-up can be excluded from the
    spending chart (it's not a purchase) while still counting as a
    contribution here — the two are independent questions."""
    rows = (
        db.query(models.Transaction)
        .filter(
            models.Transaction.category == "Savings",
            models.Transaction.date >= TRANSACTIONS_START_DATE,
            models.Transaction.date <= as_of_date,
        )
        .all()
    )
    return sum(r.amount if r.direction == models.Direction.OUT else -r.amount for r in rows)


def _savings_offset(db: Session) -> float:
    anchor = _latest_entry(db, models.NetWorthCategory.STOCKS)
    if not anchor:
        return 0.0
    return anchor.amount - _savings_up_to(db, anchor.as_of_date)


@app.get("/summary/wealth", response_model=list[schemas.WealthPoint])
def wealth_over_time(db: Session = Depends(get_db)):
    monthly = monthly_summary(db)
    offset = _cash_savings_offset(db)

    result = []
    cumulative = 0.0
    for point in monthly:
        cumulative += point.net
        result.append(schemas.WealthPoint(month=point.month, cumulative_net=cumulative + offset))
    return result


@app.get("/net-worth", response_model=schemas.NetWorthBreakdown)
def get_net_worth(db: Session = Depends(get_db)):
    cash_entry = _latest_entry(db, models.NetWorthCategory.CASH_SAVINGS)
    cash_savings = _net_up_to(db, date.today()) + _cash_savings_offset(db)
    cash_as_of = cash_entry.as_of_date if cash_entry else None

    stocks_entry = _latest_entry(db, models.NetWorthCategory.STOCKS)
    stocks = _savings_up_to(db, date.today()) + _savings_offset(db)
    stocks_as_of = stocks_entry.as_of_date if stocks_entry else None

    def amount_and_as_of(cat: models.NetWorthCategory) -> tuple[float, date | None]:
        entry = _latest_entry(db, cat)
        return (entry.amount, entry.as_of_date) if entry else (0.0, None)

    real_estate, real_estate_as_of = amount_and_as_of(models.NetWorthCategory.REAL_ESTATE)
    other, other_as_of = amount_and_as_of(models.NetWorthCategory.OTHER)

    return schemas.NetWorthBreakdown(
        cash_savings=cash_savings,
        cash_savings_as_of=cash_as_of,
        stocks=stocks,
        stocks_as_of=stocks_as_of,
        real_estate=real_estate,
        real_estate_as_of=real_estate_as_of,
        other=other,
        other_as_of=other_as_of,
        total=cash_savings + stocks + real_estate + other,
    )


@app.get("/summary/networth", response_model=list[schemas.NetWorthMonthPoint])
def net_worth_over_time(db: Session = Depends(get_db)):
    cash_trend = {point.month: point.cumulative_net for point in wealth_over_time(db)}

    entry_months = {
        e.as_of_date.strftime("%Y-%m")
        for e in db.query(models.NetWorthEntry).all()
    }
    months = sorted(set(cash_trend) | entry_months)

    result = []
    for month in months:
        year, mon = int(month[:4]), int(month[5:7])
        next_month = date(year + (mon == 12), mon % 12 + 1, 1)
        month_end = next_month - timedelta(days=1)

        def value_as_of(cat: models.NetWorthCategory) -> float:
            entry = _latest_entry(db, cat, as_of=month_end)
            return entry.amount if entry else 0.0

        cash = cash_trend.get(month)
        if cash is None:
            cash = _net_up_to(db, month_end) + _cash_savings_offset(db)

        stocks = _savings_up_to(db, month_end) + _savings_offset(db)
        real_estate = value_as_of(models.NetWorthCategory.REAL_ESTATE)
        other = value_as_of(models.NetWorthCategory.OTHER)

        result.append(schemas.NetWorthMonthPoint(
            month=month, cash_savings=cash, stocks=stocks, real_estate=real_estate, other=other,
            total=cash + stocks + real_estate + other,
        ))
    return result


@app.get("/summary/category-breakdown", response_model=list[schemas.CategoryAmount])
def category_breakdown(month: str, direction: models.Direction = models.Direction.OUT, db: Session = Depends(get_db)):
    rows = (
        db.query(models.Transaction)
        .filter(
            models.Transaction.is_transfer.is_(False),
            models.Transaction.direction == direction,
            models.Transaction.date >= TRANSACTIONS_START_DATE,
        )
        .all()
    )
    totals: dict[str, float] = defaultdict(float)
    for row in rows:
        if row.date.strftime("%Y-%m") == month:
            totals[row.category] += row.amount

    return sorted(
        (schemas.CategoryAmount(category=cat, total=total) for cat, total in totals.items()),
        key=lambda c: -c.total,
    )


@app.get("/summary/savings-cohort", response_model=schemas.SavingsCohortSummary)
def savings_cohort(db: Session = Depends(get_db)):
    anchor = _latest_entry(db, models.NetWorthCategory.STOCKS)

    rows = (
        db.query(models.Transaction)
        .filter(models.Transaction.category == "Savings", models.Transaction.date >= TRANSACTIONS_START_DATE)
        .all()
    )
    buckets: dict[str, float] = defaultdict(float)
    for row in rows:
        key = row.date.strftime("%Y-%m")
        buckets[key] += row.amount if row.direction == models.Direction.OUT else -row.amount

    months = [
        schemas.SavingsMonthContribution(month=m, contribution=buckets[m])
        for m in sorted(buckets)
    ]
    return schemas.SavingsCohortSummary(
        starting_balance=_savings_offset(db),
        starting_balance_as_of=anchor.as_of_date if anchor else None,
        months=months,
    )


@app.put("/net-worth/{category}", response_model=schemas.NetWorthCategoryOut)
def set_net_worth_category(category: models.NetWorthCategory, entry_in: schemas.NetWorthCategoryIn, db: Session = Depends(get_db)):
    as_of_date = entry_in.as_of_date or date.today()
    entry = (
        db.query(models.NetWorthEntry)
        .filter(models.NetWorthEntry.category == category, models.NetWorthEntry.as_of_date == as_of_date)
        .first()
    )
    if entry:
        entry.amount = entry_in.amount
    else:
        entry = models.NetWorthEntry(category=category, amount=entry_in.amount, as_of_date=as_of_date)
        db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


@app.delete("/net-worth/{category}", status_code=204)
def clear_net_worth_category(category: models.NetWorthCategory, db: Session = Depends(get_db)):
    db.query(models.NetWorthEntry).filter(models.NetWorthEntry.category == category).delete()
    db.commit()


@app.get("/categories", response_model=list[str])
def list_categories(db: Session = Depends(get_db)):
    rows = db.query(models.Transaction.category).distinct().all()
    return sorted({row[0] for row in rows})
