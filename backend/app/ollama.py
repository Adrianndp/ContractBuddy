from ollama import AsyncClient

from app.config import settings

# One client (one HTTP connection pool) for the whole app: chat, embed and the health check.
client = AsyncClient(host=settings.ollama_base_url)


async def chat(prompt: str) -> str:
    response = await client.chat(
        model=settings.chat_model, messages=[{"role": "user", "content": prompt}]
    )
    return response.message.content


async def embed(texts: list[str]) -> list[list[float]]:
    response = await client.embed(model=settings.embedding_model, input=texts)
    return response.embeddings
