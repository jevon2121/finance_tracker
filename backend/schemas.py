from datetime import date as date_type

from pydantic import BaseModel, ConfigDict

from models import Direction, NetWorthCategory


class TransactionBase(BaseModel):
    date: date_type
    name: str
    category: str = "Uncategorized"
    direction: Direction
    amount: float


class TransactionCreate(TransactionBase):
    pass


class TransactionUpdate(BaseModel):
    date: date_type | None = None
    name: str | None = None
    category: str | None = None
    direction: Direction | None = None
    amount: float | None = None
    is_transfer: bool | None = None


class TransactionOut(TransactionBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    source_file: str | None = None
    is_transfer: bool = False


class MonthlySummary(BaseModel):
    month: str
    total_in: float
    total_out: float
    net: float


class WealthPoint(BaseModel):
    month: str
    cumulative_net: float


class UploadResult(BaseModel):
    inserted: int
    transactions: list[TransactionOut]
    transfers_detected: int = 0


class NetWorthCategoryIn(BaseModel):
    amount: float
    as_of_date: date_type | None = None


class NetWorthCategoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    category: NetWorthCategory
    amount: float
    as_of_date: date_type


class NetWorthBreakdown(BaseModel):
    cash_savings: float
    cash_savings_as_of: date_type | None
    stocks: float
    stocks_as_of: date_type | None
    real_estate: float
    real_estate_as_of: date_type | None
    other: float
    other_as_of: date_type | None
    total: float


class NetWorthMonthPoint(BaseModel):
    month: str
    cash_savings: float
    stocks: float
    real_estate: float
    other: float
    total: float


class CategoryAmount(BaseModel):
    category: str
    total: float


class SavingsMonthContribution(BaseModel):
    month: str
    contribution: float


class SavingsCohortSummary(BaseModel):
    starting_balance: float
    starting_balance_as_of: date_type | None
    months: list[SavingsMonthContribution]
