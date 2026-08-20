import enum

from sqlalchemy import Boolean, Column, Date, Enum, Float, Integer, String, UniqueConstraint

from database import Base


class Direction(str, enum.Enum):
    IN = "in"
    OUT = "out"


class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, index=True)
    date = Column(Date, nullable=False, index=True)
    name = Column(String, nullable=False)
    category = Column(String, nullable=False, default="Uncategorized", index=True)
    direction = Column(Enum(Direction), nullable=False)
    amount = Column(Float, nullable=False)
    source_file = Column(String, nullable=True)
    is_transfer = Column(Boolean, nullable=False, default=False)


class CategoryBudget(Base):
    """A user-set yearly spending limit for a category (e.g. Travel, Shopping),
    compared against actual spend in the current rolling year (Aug 1 - Jul 31)."""

    __tablename__ = "category_budgets"

    category = Column(String, primary_key=True)
    amount = Column(Float, nullable=False)


class NetWorthCategory(str, enum.Enum):
    CASH_SAVINGS = "cash_savings"
    STOCKS = "stocks"
    REAL_ESTATE = "real_estate"
    OTHER = "other"


class NetWorthEntry(Base):
    """A user-reported balance for one net worth category, as of a date.

    A history, not a singleton: every save adds/updates a dated data point
    (one row per category+date — saving again on the same day corrects that
    day's entry rather than piling up duplicates). "Current" value for a
    category is its most recent entry. For cash_savings, the entry also
    anchors the transaction-derived cumulative in/out trend to a real known
    balance as of that date. For stocks / real estate / other — which have
    no transaction feed — this history is the only record of how the value
    changed over time, and is what makes a real net-worth-over-months trend
    possible instead of just a current snapshot.
    """

    __tablename__ = "net_worth_entries"
    __table_args__ = (UniqueConstraint("category", "as_of_date", name="uq_net_worth_category_date"),)

    id = Column(Integer, primary_key=True)
    category = Column(Enum(NetWorthCategory), nullable=False, index=True)
    amount = Column(Float, nullable=False)
    as_of_date = Column(Date, nullable=False)
