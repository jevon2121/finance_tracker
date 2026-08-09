"""Best-effort category guesser based on merchant name keywords.

Not exhaustive — just enough so a freshly imported statement isn't 100%
"Uncategorized". Categories can be edited later via the API/UI.
"""

CATEGORY_KEYWORDS: dict[str, list[str]] = {
    "Groceries": ["TESCO", "SAINSBURY", "M&S", "WAITROSE", "ALDI", "LIDL", "OSEYO", "OYESO"],
    "Dining": ["DELIVEROO", "ITSU", "SHAKE SHACK", "GAIL", "UBER EATS", "JUST EAT", "RESTAURANT",
               "BAKERY", "CAFE", "COFFEE"],
    "Shopping": ["AMAZON", "AMZN", "GYMSHARK", "ASOS", "EBAY"],
    "Transport": ["TFL", "LUL", "UBER", "TRAINLINE", "TRIP.COM"],
    "Subscriptions": ["PRIME", "NETFLIX", "SPOTIFY", "GIFFGAFF", "PAYPAL"],
    "Fitness": ["GYM", "PURE GYM", "FITNESS"],
    "Savings": ["TRADING 212", "TRADING212", "VANGUARD", "HARGREAVES", "SAVER"],
    "Credit Card Payment": ["AMERICAN EXP", "AMEX"],
    "Currency Exchange": ["EXCHANGED TO"],
    "Rent": ["RENT"],
    "Salary": ["PAYSLIP", "SALARY"],
    "Transfers": ["TO ", "TRANSFER FROM", "PAYMENT FROM", "SENT FROM REVOLUT", "RECEIVED FROM"],
    "Payment": ["PAYMENT RECEIVED"],
}

# Order matters: more specific categories are listed above and matched first.



def categorize(name: str) -> str:
    upper = name.upper()
    for category, keywords in CATEGORY_KEYWORDS.items():
        if any(keyword in upper for keyword in keywords):
            return category
    return "Uncategorized"
