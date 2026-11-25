from collections.abc import Iterator
from contextlib import contextmanager

import httpx
from ollama import AsyncClient, ResponseError

from app.config import settings

# One client (one HTTP connection pool) for the whole app: chat, embed and the health check.
client = AsyncClient(host=settings.ollama_base_url)


class OllamaError(Exception):
    """Ollama unreachable or model missing. main.py turns it into a 503 with the message as detail."""


@contextmanager
def ollama_errors(model: str) -> Iterator[None]:
    try:
        yield
    except ResponseError as e:
        if e.status_code == 404:
            raise OllamaError(f"Model '{model}' not found in Ollama. Run: ollama pull {model}") from e
        raise OllamaError(f"Ollama error: {e.error}") from e
    except (ConnectionError, httpx.TransportError) as e:
        raise OllamaError(f"Ollama is not reachable at {settings.ollama_base_url}.") from e


async def chat(system: str, user: str) -> str:
    with ollama_errors(settings.chat_model):
        response = await client.chat(
            model=settings.chat_model,
            messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
            options={"temperature": 0.1},  # low: factual answers, little creativity
        )
    return response.message.content


async def embed(texts: list[str]) -> list[list[float]]:
    with ollama_errors(settings.embedding_model):
        response = await client.embed(model=settings.embedding_model, input=texts)
    return response.embeddings
