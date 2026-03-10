"""Gradio chat interface backed by a local Ollama server."""

import os

import gradio as gr
from openai import OpenAI

OLLAMA_BASE_URL = os.environ.get("OLLAMA_BASE_URL", "http://127.0.0.1:11434")
MODEL_NAME = os.environ.get("MODEL_NAME", "llama2")

client = OpenAI(base_url=f"{OLLAMA_BASE_URL}/v1", api_key="ollama")


def chat(message: str, history: list[dict]) -> str:
    messages = history + [{"role": "user", "content": message}]
    response = client.chat.completions.create(model=MODEL_NAME, messages=messages)
    return response.choices[0].message.content


demo = gr.ChatInterface(
    fn=chat,
    title="Ollama Chat",
    description=f"Chatting with **{MODEL_NAME}** via Ollama",
)

if __name__ == "__main__":
    demo.launch(server_name="0.0.0.0", server_port=7860)
