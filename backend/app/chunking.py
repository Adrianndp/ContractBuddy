import string
import unicodedata

from app.dtos import TextChunk

CHUNK_SIZE = 500  # characters
CHUNK_OVERLAP = 50  # characters shared between neighbouring chunks


# Broken ligatures from some Word-exported PDFs: the glyph maps to the ASCII code shifted into the
# high byte, e.g. U+6600 "昀" = f, U+6900 "椀" = i, U+6C00 "氀" = l ("verp昀氀ichtet" = "verpflichtet").
# Maps every U+XX00 with XX an ASCII letter back to that letter. Side effect: the real CJK characters
# at those code points (e.g. U+4E00 "一") are replaced too; fine for German/English contracts.
SHIFTED_ASCII_LETTERS = {ord(c) << 8: c for c in string.ascii_letters}


def clean_text(text: str) -> str:
    """Normalize extracted PDF text.

    - Broken ligature characters (ASCII letter in the high byte, see SHIFTED_ASCII_LETTERS) become
      that letter again. Done before NFKC, which doesn't know about them.
    - NFKC turns typographic ligatures back into letters ("ﬁle" -> "file"), so they match what users type.
    - All whitespace (PDF line breaks, tabs, double spaces) collapses into single spaces.
    - NUL characters are dropped: pypdf sometimes emits them and Postgres rejects them in text columns.
    """
    text = text.translate(SHIFTED_ASCII_LETTERS)
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
