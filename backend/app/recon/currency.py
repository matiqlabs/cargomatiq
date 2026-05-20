"""Currency helpers shared by extraction, reconciliation, and reports."""

CURRENCY_BY_COUNTRY = {
    "united states": "USD",
    "usa": "USD",
    "us": "USD",
    "india": "INR",
    "united arab emirates": "AED",
    "uae": "AED",
    "singapore": "SGD",
    "united kingdom": "GBP",
    "uk": "GBP",
    "great britain": "GBP",
    "euro area": "EUR",
    "germany": "EUR",
    "france": "EUR",
    "netherlands": "EUR",
    "spain": "EUR",
    "italy": "EUR",
}


def currency_from_country(country: str | None) -> str:
    if not country:
        return "USD"
    return CURRENCY_BY_COUNTRY.get(country.strip().lower(), "USD")


def infer_currency_from_value(value) -> str | None:
    if value is None:
        return None
    text = str(value).upper()
    if "USD" in text or "$" in text:
        return "USD"
    if "INR" in text or "₹" in text or "RS." in text or "RS " in text:
        return "INR"
    if "AED" in text or "د.إ" in text:
        return "AED"
    if "SGD" in text:
        return "SGD"
    if "GBP" in text or "£" in text:
        return "GBP"
    if "EUR" in text or "€" in text:
        return "EUR"
    return None

