import uuid
from typing import Optional
import asyncio
import json
import logging

from fastapi import APIRouter, Body, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy import text


router = APIRouter(prefix="/chat", tags=["chat"])


class LoadModelRequest(BaseModel):
    model: str


class ChatCompletionsRequest(BaseModel):
    model: str
    messages: list
    max_tokens: Optional[int] = 1024
    temperature: Optional[float] = 0.7


_loaded_model: Optional[str] = None
_loaded_job_id: Optional[str] = None
_inference_server_url: Optional[str] = "http://localhost:21002"
_model_loading = False


async def _start_inference_server(model_name: str):
    """Start the FastChat inference server in the background."""
    global _loaded_model, _loaded_job_id, _model_loading, _inference_server_url

    job_id = f"chat_{uuid.uuid4().hex[:8]}"

    try:
        from transformerlab.services.task_service import task_service
        from transformerlab.services.local_provider_queue import enqueue_local_launch
        from transformerlab.db.session import async_session
        from transformerlab.services.provider_service import get_provider_by_id, get_provider_instance
        from lab.dirs import get_local_provider_job_dir
        from transformerlab.compute_providers.models import ClusterConfig

        async with async_session() as session:
            task_data = {
                "name": f"Chat - {model_name}",
                "plugin": "fastchat_server",
                "type": "INFERENCE",
                "config": {
                    "model_name": model_name,
                    "inference_server_url": _inference_server_url,
                },
                "env_parameters": [],
            }

            task_id = await task_service.add_task(task_data)

            from transformerlab.services import job_service

            job_id = await job_service.job_create(
                type="INFERENCE",
                status="CREATED",
                job_data={"task_id": task_id, "model_name": model_name, "plugin": "fastchat_server"},
                experiment_id="chat",
            )

            providers_result = await session.execute(
                text("SELECT id FROM compute_providers WHERE type = 'local' LIMIT 1")
            )
            provider_row = providers_result.fetchone()

            if not provider_row:
                raise Exception("No local provider found")

            provider_id = provider_row[0]
            provider = await get_provider_by_id(session, provider_id)

            if not provider:
                raise Exception("Local provider not found")

            provider_instance = await get_provider_instance(provider)

            job_dir = get_local_provider_job_dir(job_id, org_id="default")

            cluster_config = ClusterConfig(
                job_id=job_id,
                experiment_id="chat",
                experiment_name="chat",
                plugin_id="fastchat_server",
                plugin_params={"model": model_name},
                provider_config={"workspace_dir": job_dir},
                local_model_path=None,
                dataset_id=None,
                dataset_path=None,
                file_mounts={},
            )

            await enqueue_local_launch(
                job_id=job_id,
                experiment_id="chat",
                provider_id=str(provider_id),
                team_id="default",
                cluster_name=f"chat_{model_name.replace('/', '_')}",
                cluster_config=cluster_config,
                quota_hold_id=None,
                initial_status="LAUNCHING",
            )

            _loaded_model = model_name
            _loaded_job_id = job_id
            _model_loading = False

    except Exception as e:
        print(f"Error in _start_inference_server: {e}")
        _model_loading = False
        raise


@router.post("/load_model", summary="Load a model for chat inference")
async def load_model(request: LoadModelRequest):
    """
    Load a model for inference using the FastChat server plugin.
    This will create a task and launch it on the local provider in the background.
    """
    global _loaded_model, _model_loading, _inference_server_url

    model_name = request.model

    if _loaded_model == model_name:
        return {
            "status": "success",
            "message": f"Model {model_name} is already loaded.",
            "model": model_name,
            "inference_server_url": _inference_server_url,
        }

    if _model_loading:
        return {
            "status": "loading",
            "message": "A model is currently being loaded. Please wait.",
            "model": _loaded_model,
        }

    _model_loading = True

    try:
        asyncio.create_task(_start_inference_server(model_name))

        return {
            "status": "loading",
            "message": f"Model {model_name} is being loaded. This may take a few minutes. Use the status endpoint to check progress.",
            "model": model_name,
            "inference_server_url": _inference_server_url,
        }
    except Exception as e:
        _model_loading = False
        raise HTTPException(
            status_code=500,
            detail=f"Failed to start model loading: {str(e)}",
        )


@router.post("/v1/chat/completions", summary="Chat completions")
async def chat_completions(request: ChatCompletionsRequest):
    """
    OpenAI-compatible chat completions endpoint.
    Requires a model to be loaded first via /chat/load_model.
    """
    global _loaded_model, _inference_server_url

    print(f"[chat] chat_completions called with model: {request.model}")
    print(f"[chat] _loaded_model: {_loaded_model}")

    if not _loaded_model:
        raise HTTPException(
            status_code=400,
            detail="No model is loaded. Please load a model first using /chat/load_model",
        )

    try:
        import requests

        response = requests.post(
            f"{_inference_server_url}/v1/chat/completions",
            headers={
                "Content-Type": "application/json",
            },
            json={
                "model": request.model,
                "messages": request.messages,
                "max_tokens": request.max_tokens,
                "temperature": request.temperature,
            },
            timeout=60,
        )

        if response.status_code != 200:
            raise HTTPException(
                status_code=response.status_code,
                detail=f"Inference server error: {response.text}",
            )

        return response.json()

    except requests.exceptions.ConnectionError:
        raise HTTPException(
            status_code=503,
            detail="Inference server is not running. Please wait for the model to finish loading.",
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error during inference: {str(e)}",
        )


@router.get("/status", summary="Get current chat model status")
async def get_status():
    """Get the current status of the loaded model."""
    return {
        "loaded_model": _loaded_model,
        "job_id": _loaded_job_id,
        "inference_server_url": _inference_server_url,
        "loading": _model_loading,
        "status": "ready" if _loaded_model else "idle",
    }


@router.post("/unload_model", summary="Unload the current model")
async def unload_model():
    """Unload the current model and stop the inference server."""
    global _loaded_model, _loaded_job_id

    if not _loaded_model:
        return {"status": "success", "message": "No model is currently loaded"}

    model_name = _loaded_model
    job_id = _loaded_job_id

    _loaded_model = None
    _loaded_job_id = None

    return {
        "status": "success",
        "message": f"Model {model_name} has been unloaded (job {job_id} still running in background)",
    }


@router.api_route("/v1/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"])
async def catch_all_v1(path: str, request: Request):
    """Catch-all route to handle /v1/* requests and guide them to correct endpoint."""
    print(f"[chat] catch-all called for /v1/{path}")
    print(f"[chat] method: {request.method}")
    print(f"[chat] _loaded_model: {_loaded_model}")
    print(f"[chat] full path: {path}")

    if request.method == "OPTIONS":
        return JSONResponse(content={"status": "ok"})

    body = await request.body()
    print(f"[chat] body length: {len(body)}")

    # Instead of returning 405, let's try to forward the request to the actual handler
    # This is a workaround - the frontend is calling /v1/chat/completions but we need /chat/v1/chat/completions
    if path == "chat/completions" and request.method == "POST":
        print(f"[chat] Forwarding /v1/chat/completions to internal handler")
        # Parse the body and call our handler directly
        try:
            body_json = json.loads(body.decode("utf-8")) if body else {}
            # Create a mock request for our handler
            chat_req = ChatCompletionsRequest(
                model=body_json.get("model", ""),
                messages=body_json.get("messages", []),
                max_tokens=body_json.get("max_tokens", 1024),
                temperature=body_json.get("temperature", 0.7),
            )
            return await chat_completions(chat_req)
        except Exception as e:
            logging.exception("[chat] Error forwarding request")
            return JSONResponse(status_code=500, content={"detail": "Error processing request"})

    return JSONResponse(
        status_code=405,
        content={
            "detail": f"Method {request.method} not allowed on /v1/{path}",
            "hint": "Use /chat/v1/chat/completions instead",
            "current_path": f"/v1/{path}",
        },
    )
