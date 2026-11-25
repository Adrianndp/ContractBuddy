from ollama import AsyncClient

from app.config import settings


async def chat(prompt: str) -> str:
    response = await AsyncClient(host=settings.ollama_base_url).chat(
        model=settings.chat_model, messages=[{"role": "user", "content": prompt}]
    )
    return response.message.content
