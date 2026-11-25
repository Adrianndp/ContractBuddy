import pytest

from app.chunking import clean_text


@pytest.mark.parametrize(
    ("broken", "fixed"),
    [
        ("verp昀氀ichtet", "verpflichtet"),  # U+6600 = f, U+6C00 = l
        ("tari昀氀ichen", "tariflichen"),
        ("椀", "i"),  # U+6900 = i
    ],
)
def test_clean_text_fixes_shifted_ascii_ligatures(broken: str, fixed: str) -> None:
    assert clean_text(broken) == fixed


def test_clean_text_keeps_normal_german_text() -> None:
    text = "Die Kündigungsfrist beträgt drei Monate (§ 5 Abs. 1), Straße, Größe."
    assert clean_text(text) == text


def test_clean_text_still_applies_nfkc_whitespace_and_nul() -> None:
    # "ﬁ" (real ligature U+FB01) is fixed by NFKC, the broken one by the shifted-ASCII mapping.
    assert clean_text("Die ﬁrma  ist\n\tverp昀氀ichtet\x00") == "Die firma ist verpflichtet"
