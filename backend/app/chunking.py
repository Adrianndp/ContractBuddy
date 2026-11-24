import unicodedata
from dataclasses import dataclass

CHUNK_SIZE = 500  # characters
CHUNK_OVERLAP = 50  # characters shared between neighbouring chunks


@dataclass
class TextChunk:
    page_number: int  # 1-based
    chunk_index: int  # position within the whole document
    text: str


def clean_text(text: str) -> str:
    """Normalize extracted PDF text.

    - NFKC turns typographic ligatures back into letters ("ﬁle" -> "file"), so they match what users type.
    - All whitespace (PDF line breaks, tabs, double spaces) collapses into single spaces.
    - NUL characters are dropped: pypdf sometimes emits them and Postgres rejects them in text columns.
    """
    text = unicodedata.normalize("NFKC", text).replace("\x00", "")
    return " ".join(text.split())


def chunk_text(text: str, size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> list[str]:
    """Split one page's text into ~`size`-character chunks that overlap by ~`overlap` characters.

    Cuts happen at spaces where possible so words stay intact. The overlap means a sentence
    cut at a chunk boundary still appears whole in at least one of the two chunks.
    """
    text = clean_text(text)
    chunks: list[str] = []
    start = 0
    while start < len(text):
        end = min(start + size, len(text))
        if end < len(text):
            # Move the cut back to the last space, but not further than half a chunk.
            space = text.rfind(" ", start + size // 2, end)
            if space != -1:
                end = space
        chunks.append(text[start:end].strip())
        if end >= len(text):
            break
        # Next chunk starts `overlap` chars before the cut, moved forward to the next word start.
        next_start = end - overlap
        space = text.find(" ", next_start, end)
        start = space + 1 if space != -1 else next_start
    return [c for c in chunks if c]


def chunk_pages(pages: list[str]) -> list[TextChunk]:
    """Chunk each page separately, so a chunk never spans two pages and has exactly one page number."""
    result: list[TextChunk] = []
    for page_number, page_text in enumerate(pages, start=1):
        for text in chunk_text(page_text):
            result.append(TextChunk(page_number=page_number, chunk_index=len(result), text=text))
    return result
