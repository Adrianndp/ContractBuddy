"""Internal data passed between functions (plain dataclasses).

Not exposed via the API (that's app/schemas.py) and not stored as tables (that's app/models.py).
"""

from dataclasses import dataclass


@dataclass
class TextChunk:
    page_number: int  # 1-based
    chunk_index: int  # position within the whole document
    text: str
