"""Everything the chat model sees for /ask. Rules mirror "Answer rules" in backend/CLAUDE.md: change both together."""

import re

from app.schemas import SourceRead

SYSTEM_PROMPT = """\
You answer questions about the user's own contracts. You only get numbered sources (excerpts from the contracts) \
and a question.

Rules:
1. Answer in the language of the question: German question → German answer, English question → English answer.
2. Use only the sources. Never use general knowledge, never guess.
3. Quote the relevant clause word for word in quotation marks, with its § or section number if present, \
and cite it as [n], where n is the number of the source.
4. If the sources don't contain the answer, say only that: in German „Dazu steht in den Dokumenten nichts.“, \
in English "The documents don't say anything about this."
5. If the sources come from different contracts, name the contract (file name) each fact comes from.
6. Don't give legal advice: explain what the contract says, don't judge whether a clause is valid and don't \
recommend what to do. If the question goes beyond what the text says, suggest asking a lawyer or a consumer \
advice centre (Verbraucherzentrale).

Keep the answer short."""


def build_user_message(sources: list[SourceRead], question: str) -> str:
    """Sources numbered [1], [2], … in the order they are returned to the frontend, then the question."""
    blocks = [
        f"[{n}] {s.filename}, page {s.page_number}\n{s.text_snippet}" for n, s in enumerate(sources, 1)
    ]
    return "Sources:\n\n" + "\n\n".join(blocks) + f"\n\nQuestion: {question}"


# Fixed answer when retrieval finds nothing (the LLM isn't called then).
# The language is guessed from common words; German wins ties, since most questions are German.
NO_SOURCES_ANSWER = {
    "de": "Keine passenden Dokumente gefunden. Lade zuerst einen Vertrag hoch oder ändere die Auswahl.",
    "en": "No matching documents found. Upload a contract first or change the selection.",
}
_GERMAN = set("der das den dem des ist sind wie wer wann wo welche welcher wird werden kann muss darf "
              "gibt steht ich mein meine und oder nicht ein eine im zum zur bei mit für von auf".split())
_ENGLISH = set("the is are what how when who where which will can must may does do there my and or not "
               "of to for with on at".split())


def no_sources_answer(question: str) -> str:
    words = re.findall(r"\w+", question.lower())
    german = sum(w in _GERMAN for w in words) + (2 if re.search(r"[äöüß]", question.lower()) else 0)
    english = sum(w in _ENGLISH for w in words)
    return NO_SOURCES_ANSWER["en" if english > german else "de"]
