from ollama import AsyncClient

from app.config import settings


async def chat(prompt: str) -> str:
    response = await AsyncClient(host=settings.ollama_base_url).chat(
        model=settings.chat_model, messages=[{"role": "user", "content": prompt}]
    )
    return response.message.content


async def embed(texts: list[str]) -> list[list[float]]:
    response = await AsyncClient(host=settings.ollama_base_url).embed(
        model=settings.embedding_model, input=texts
    )
    return response.embeddings
