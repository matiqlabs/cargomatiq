"""Raw-MIME parsing shared by IMAP and replay ingestion."""
from __future__ import annotations

import re
from dataclasses import dataclass
from email import policy
from email.parser import BytesParser
from email.utils import getaddresses, parsedate_to_datetime


@dataclass
class ParsedAttachment:
    filename: str | None
    mime_type: str
    content: bytes


def _addresses(message, name: str) -> list[str]:
    return [address for _display, address in getaddresses([str(v) for v in message.get_all(name, [])]) if address]


def _text_content(part) -> str:
    try:
        value = part.get_content()
        return value.decode(part.get_content_charset() or "utf-8", errors="replace") if isinstance(value, bytes) else str(value)
    except (LookupError, UnicodeError):
        return (part.get_payload(decode=True) or b"").decode("utf-8", errors="replace")


def clean_body_text(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[\u200b-\u200f\u202a-\u202e\u2060\u2066-\u2069\ufeff]", "", text)
    return re.sub(r"\n{3,}", "\n\n", "\n".join(line.strip() for line in text.split("\n"))).strip()


def parse_email(raw_email: bytes) -> tuple[dict, str, str, list[ParsedAttachment]]:
    message = BytesParser(policy=policy.default).parsebytes(raw_email)
    try:
        received_at = parsedate_to_datetime(str(message.get("Date"))).replace(tzinfo=None) if message.get("Date") else None
    except (ValueError, TypeError, IndexError):
        received_at = None
    fields = {
        "sender": next(iter(_addresses(message, "From")), None),
        "recipients": _addresses(message, "To") + _addresses(message, "Cc"),
        "subject": str(message.get("Subject")) if message.get("Subject") else None,
        "rfc_message_id": str(message.get("Message-ID")) if message.get("Message-ID") else None,
        "received_at": received_at,
    }
    plain, html, attachments = [], [], []
    for part in message.walk():
        if part.is_multipart():
            continue
        filename = part.get_filename()
        if part.get_content_disposition() == "attachment" or filename:
            attachments.append(ParsedAttachment(filename, part.get_content_type(), part.get_payload(decode=True) or b""))
        elif part.get_content_type() == "text/plain":
            plain.append(_text_content(part))
        elif part.get_content_type() == "text/html":
            html.append(_text_content(part))
    return fields, "\n".join(plain), "\n".join(html), attachments
