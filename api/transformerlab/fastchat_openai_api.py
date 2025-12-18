# This file is a modified version of open-ai compatible server from
# FastChat.
# https://github.com/lm-sys/FastChat/blob/main/fastchat/serve/openai_api_server.py

import asyncio
import json
import logging
import os
import time
import uuid

from typing import Any, AsyncGenerator, Dict, Generator, List, Optional, Union

import httpx
import shortuuid
import tiktoken

# Using torch to test for CUDA and MPS support.
from fastapi import APIRouter, Depends, HTTPException, Request, File, UploadFile
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.security.http import HTTPAuthorizationCredentials, HTTPBearer
from fastchat.constants import WORKER_API_EMBEDDING_BATCH_SIZE, ErrorCode
from fastchat.conversation import Conversation, SeparatorStyle
from fastchat.protocol.api_protocol import (
    APITokenCheckRequest,
    APITokenCheckResponse,
    APITokenCheckResponseItem,
    BaseModel,
)
from fastchat.protocol.openai_api_protocol import (
    ChatCompletionResponse,
    ChatCompletionResponseChoice,
    ChatCompletionResponseStreamChoice,
    ChatCompletionStreamResponse,
    ChatMessage,
    CompletionRequest,
    CompletionResponse,
    DeltaMessage,
    EmbeddingsRequest,
    EmbeddingsResponse,
    ErrorResponse,
    ModelCard,
    ModelList,
    ModelPermission,
    UsageInfo,
)
from pydantic import BaseModel as PydanticBaseModel
from lab import Experiment, storage

WORKER_API_TIMEOUT = 3600


# TODO: Move all base model to fastchat.protocol.openai_api_protocol
class APIChatCompletionRequest(BaseModel):
    model: str
    adaptor: Optional[str] = ""
    messages: Union[str, List[Dict[str, str]], List[List[Dict[str, str]]]]
    temperature: Optional[float] = 0.7
    top_p: Optional[float] = 1.0
    top_k: Optional[int] = -1
    min_p: Optional[float] = 0.0
    n: Optional[int] = 1
    max_tokens: Optional[int] = None
    stop: Optional[Union[str, List[str]]] = None
    stream: Optional[bool] = False
    user: Optional[str] = None
    repetition_penalty: Optional[float] = 1.0
    frequency_penalty: Optional[float] = 0.0
    presence_penalty: Optional[float] = 0.0
    logprobs: Optional[bool] = False


class ChatCompletionRequest(BaseModel):
    model: str
    adaptor: Optional[str] = ""
    messages: Union[
        str,
        List[Dict[str, str]],
        List[Dict[str, Union[str, List[Dict[str, Union[str, Dict[str, str]]]]]]],
    ]
    temperature: Optional[float] = 0.7
    top_p: Optional[float] = 1.0
    top_k: Optional[int] = -1
    min_p: Optional[float] = 0.0
    n: Optional[int] = 1
    max_tokens: Optional[int] = None
    stop: Optional[Union[str, List[str]]] = None
    stream: Optional[bool] = False
    presence_penalty: Optional[float] = 0.0
    frequency_penalty: Optional[float] = 0.0
    user: Optional[str] = None
    logprobs: Optional[bool] = False
    tools: Optional[List[Dict[str, Any]]] = None


class AudioGenerationRequest(BaseModel):
    experiment_id: str
    model: str
    adaptor: Optional[str] = ""
    text: str
    file_prefix: str
    sample_rate: int
    temperature: float
    speed: float
    top_p: Optional[float] = 1.0
    voice: Optional[str] = None
    audio_path: Optional[str] = None


class AudioTranscriptionsRequest(BaseModel):
    experiment_id: str
    model: str
    adaptor: Optional[str] = ""
    audio_path: str
    # format: str
    # output_path: str note: probably we set this by ourself


class VisualizationRequest(PydanticBaseModel):
    model: str
    adaptor: Optional[str] = ""
    prompt: str
    max_tokens: Optional[int] = 100
    temperature: Optional[float] = 0.7
    top_p: Optional[float] = 1.0
    min_p: Optional[float] = 0.0
    stream: Optional[bool] = True


class TextDiffusionRequest(PydanticBaseModel):
    model: str
    adaptor: Optional[str] = ""
    prompt: str
    max_tokens: Optional[int] = 128
    temperature: Optional[float] = 0.0
    top_p: Optional[float] = 1.0
    min_p: Optional[float] = 0.0
    stop: Optional[Union[str, List[str]]] = None


class ModelArchitectureRequest(PydanticBaseModel):
    model: str
    adaptor: Optional[str] = ""


class ModifiedCompletionRequest(CompletionRequest):
    adaptor: Optional[str] = ""
    min_p: Optional[float] = 0.0


try:
    from pydantic.v1 import BaseSettings
except ImportError:
    from pydantic import BaseSettings


logger = logging.getLogger(__name__)
logger.setLevel(level=logging.ERROR)
headers = {"User-Agent": "FastChat API Server"}


router = APIRouter()

get_bearer_token = HTTPBearer(auto_error=False)

conv_template_map = {}


class AppSettings(BaseSettings):
    # The address of the model controller.
    controller_address: str = "http://localhost:21001"

    # Used to overwrite the random seed in huggingface transformers
    seed: Optional[int] = None

    api_keys: Optional[List[str]] = None


app_settings = AppSettings()


async def check_api_key(
    auth: Optional[HTTPAuthorizationCredentials] = Depends(get_bearer_token),
) -> str:
    if app_settings.api_keys:
        if auth is None or (token := auth.credentials) not in app_settings.api_keys:
            raise HTTPException(
                status_code=401,
                detail={
                    "error": {
                        "message": "",
                        "type": "invalid_request_error",
                        "param": None,
                        "code": "invalid_api_key",
                    }
                },
            )
        return token
    else:
        # api_keys not set; allow all
        return None


def create_error_response(code: int, message: str) -> JSONResponse:
    return JSONResponse(ErrorResponse(message=message, code=code).model_dump(), status_code=400)


async def check_model(request, bypass_adaptor=False) -> Optional[JSONResponse]:
    controller_address = app_settings.controller_address
    ret = None
    async with httpx.AsyncClient() as client:
        try:
            # First, if there is a slash in the name of the model, just use the second part:
            model_name = request.model.split("/")[-1]
            _worker_addr = await get_worker_address(model_name, client)
        except ValueError:
            models_ret = await client.post(controller_address + "/list_models")
            models = models_ret.json()["models"]
            if request.adaptor is not None and request.adaptor != "" and request.adaptor in models:
                try:
                    model_name = request.adaptor.split("/")[-1]
                    _worker_addr = await get_worker_address(model_name, client)
                    ret = {"model_name": model_name}
                except ValueError:
                    ret = create_error_response(
                        ErrorCode.INVALID_MODEL,
                        f"Model {request.model} or Adaptor {request.adaptor} not found. Available models: {'&&'.join(models)}",
                    )

            else:
                if bypass_adaptor:
                    # Bypassing adaptor names when we do not have direct access
                    ret = {"model_name": models_ret.json()["models"][0]}
                else:
                    ret = create_error_response(
                        ErrorCode.INVALID_MODEL,
                        f"Expected model: {'&&'.join(models)}. Your model: {request.model}",
                    )
    return ret


def log_prompt(prompt):
    """Log the prompt to the global prompt.log file"""
    MAX_LOG_SIZE_BEFORE_ROTATE = 1000000  # 1MB in bytes
    from lab.dirs import get_logs_dir

    # Run async operations synchronously in this sync function
    async def _log():
        logs_dir = await get_logs_dir()
        prompt_log_path = storage.join(logs_dir, "prompt.log")
        if await storage.exists(prompt_log_path):
            # Get file size - for remote storage, we may need to read the file to check size
            try:
                async with await storage.open(prompt_log_path, "r") as f:
                    lines = (await f.read()).splitlines(keepends=True)
                file_size = sum(len(line.encode("utf-8")) for line in lines)
                if file_size > MAX_LOG_SIZE_BEFORE_ROTATE:
                    async with await storage.open(prompt_log_path, "w") as f:
                        await f.write("".join(lines[-1000:]))
                    async with await storage.open(storage.join(logs_dir, f"prompt_{time.strftime('%Y%m%d%H%M%S')}.log"), "w") as f:
                        await f.write("".join(lines[:-1000]))
            except Exception:
                # If we can't read the file, just continue with appending
                pass

        async with await storage.open(prompt_log_path, "a") as f:
            log_entry = {}
            log_entry["date"] = time.strftime("%Y-%m-%d %H:%M:%S")
            log_entry["log"] = prompt
            log_entry = json.dumps(log_entry)
            await f.write(f"{log_entry}\n")
    
    asyncio.run(_log())


@router.get("/prompt_log", tags=["chat"])
async def get_prompt_log():
    from lab.dirs import get_logs_dir

    prompt_log_path = storage.join(await get_logs_dir(), "prompt.log")
    # FileResponse needs a local file path, so use the path string directly
    # For remote storage, this would need special handling
    return FileResponse(prompt_log_path)


async def check_length(request, prompt, max_tokens):
    async with httpx.AsyncClient() as client:
        worker_addr = await get_worker_address(request.model, client)

        response = await client.post(
            worker_addr + "/model_details",
            headers=headers,
            json={"model": request.model},
            timeout=WORKER_API_TIMEOUT,
        )
        context_len = response.json()["context_length"]

        response = await client.post(
            worker_addr + "/count_token",
            headers=headers,
            json={"model": request.model, "prompt": prompt},
            timeout=WORKER_API_TIMEOUT,
        )
        token_num = response.json()["count"]

    if token_num + max_tokens > context_len:
        return create_error_response(
            ErrorCode.CONTEXT_OVERFLOW,
            f"This model's maximum context length is {context_len} tokens. "
            f"However, you requested {max_tokens + token_num} tokens "
            f"({token_num} in the messages, "
            f"{max_tokens} in the completion). "
            f"Please reduce the length of the messages or completion.",
        )
    else:
        return None


def check_requests(request) -> Optional[JSONResponse]:
    # Check all params
    if request.max_tokens is not None and request.max_tokens <= 0:
        return create_error_response(
            ErrorCode.PARAM_OUT_OF_RANGE,
            f"{request.max_tokens} is less than the minimum of 1 - 'max_tokens'",
        )
    # Only check 'n' if the request has that attribute
    if hasattr(request, "n") and request.n is not None and request.n <= 0:
        return create_error_response(
            ErrorCode.PARAM_OUT_OF_RANGE,
            f"{request.n} is less than the minimum of 1 - 'n'",
        )
    if request.temperature is not None and request.temperature < 0:
        return create_error_response(
            ErrorCode.PARAM_OUT_OF_RANGE,
            f"{request.temperature} is less than the minimum of 0 - 'temperature'",
        )
    if request.temperature is not None and request.temperature > 2:
        return create_error_response(
            ErrorCode.PARAM_OUT_OF_RANGE,
            f"{request.temperature} is greater than the maximum of 2 - 'temperature'",
        )
    if request.top_p is not None and request.top_p < 0:
        return create_error_response(
            ErrorCode.PARAM_OUT_OF_RANGE,
            f"{request.top_p} is less than the minimum of 0 - 'top_p'",
        )
    if request.top_p is not None and request.top_p > 1:
        return create_error_response(
            ErrorCode.PARAM_OUT_OF_RANGE,
            f"{request.top_p} is greater than the maximum of 1 - 'top_p'",
        )
    if request.min_p is not None and request.min_p < 0:
        return create_error_response(
            ErrorCode.PARAM_OUT_OF_RANGE,
            f"{request.min_p} is less than the minimum of 0 - 'min_p'",
        )
    if request.stop is not None and (not isinstance(request.stop, str) and not isinstance(request.stop, list)):
        return create_error_response(
            ErrorCode.PARAM_OUT_OF_RANGE,
            f"{request.stop} is not valid under any of the given schemas - 'stop'",
        )

    return None


def process_input(model_name, inp):
    if isinstance(inp, str):
        inp = [inp]
    elif isinstance(inp, list):
        if isinstance(inp[0], int):
            decoding = tiktoken.model.encoding_for_model(model_name)
            inp = [decoding.decode(inp)]
        elif isinstance(inp[0], list):
            decoding = tiktoken.model.encoding_for_model(model_name)
            inp = [decoding.decode(text) for text in inp]

    return inp


async def get_gen_params(
    model_name: str,
    messages: Union[
        str,
        List[Dict[str, str]],
        # necessary for image support
        List[Dict[str, Union[str, List[Dict[str, Union[str, Dict[str, str]]]]]]],
    ],
    *,
    temperature: float,
    top_p: float,
    min_p: float,
    max_tokens: Optional[int],
    echo: Optional[bool],
    stream: Optional[bool],
    stop: Optional[Union[str, List[str]]],
    logprobs: Optional[bool] = False,
    tools: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    conv = await get_conv(model_name)
    conv = Conversation(
        name=conv["name"],
        system_template=conv["system_template"],
        system_message=conv["system_message"],
        roles=conv["roles"],
        # LLMLab: 👇 We manually remove these fake messages that
        # FastChat would prepend convos with
        messages=list([]),
        offset=conv["offset"],
        sep_style=SeparatorStyle(conv["sep_style"]),
        sep=conv["sep"],
        sep2=conv["sep2"],
        stop_str=conv["stop_str"],
        stop_token_ids=conv["stop_token_ids"],
    )
    image_list = []
    images = None

    if isinstance(messages, str):
        prompt = messages
    else:
        for message in messages:
            msg_role = message["role"]
            if msg_role == "system":
                conv.set_system_message(message["content"])
            elif msg_role == "user":
                if isinstance(message["content"], list):
                    text_list = []

                    for item in message["content"]:
                        if item["type"] == "text":
                            text_list.append(item["text"])
                        elif item["type"] == "image_url":
                            raw_url = item["image_url"]
                            if not isinstance(raw_url, str) and raw_url.startswith("data:image"):
                                raise ValueError("Only base64-encoded images are supported")
                            image_list.append(raw_url)
                    text = "\n".join(text_list).strip()
                    conv.append_message(conv.roles[0], (text, image_list))
                else:
                    conv.append_message(conv.roles[0], message["content"])
            elif msg_role == "assistant":
                conv.append_message(conv.roles[1], message["content"])
            else:
                raise ValueError(f"Unknown role: {msg_role}")

        # Add a blank message for the assistant.
        conv.append_message(conv.roles[1], None)
        prompt = conv.get_prompt()
        images = image_list
    if max_tokens is None:
        max_tokens = 512
    gen_params = {
        "model": model_name,
        "prompt": prompt,
        "temperature": temperature,
        "top_p": top_p,
        "min_p": min_p,
        "max_new_tokens": max_tokens,
        "echo": echo,
        "stream": stream,
        "logprobs": logprobs,
        "messages": messages,
    }
    if images is not None and len(images) > 0:
        gen_params["images"] = images
    if tools is not None and len(tools) > 0:
        gen_params["tools"] = tools
    if not stop:
        gen_params.update({"stop": conv.stop_str, "stop_token_ids": conv.stop_token_ids})
    else:
        gen_params.update({"stop": stop})
    return gen_params


async def get_worker_address(model_name: str, client: httpx.AsyncClient) -> str:
    """
    Get worker address based on the requested model

    :param model_name: The worker's model name
    :param client: The httpx client to use
    :return: Worker address from the controller
    :raises: :class:`ValueError`: No available worker for requested model
    """
    controller_address = app_settings.controller_address

    model_name = model_name.split("/")[-1]

    ret = await client.post(controller_address + "/get_worker_address", json={"model": model_name})
    worker_addr = ret.json()["address"]
    # No available worker
    if worker_addr == "":
        raise ValueError(f"No available worker for {model_name}")

    logger.debug(f"model_name: {model_name}, worker_addr: {worker_addr}")
    return worker_addr


async def get_conv(model_name: str):
    async with httpx.AsyncClient() as client:
        worker_addr = await get_worker_address(model_name, client)
        conv_template = conv_template_map.get((worker_addr, model_name))
        if conv_template is None:
            response = await client.post(
                worker_addr + "/worker_get_conv_template",
                headers=headers,
                json={"model": model_name},
                timeout=WORKER_API_TIMEOUT,
            )
            conv_template = response.json()["conv"]
            conv_template_map[(worker_addr, model_name)] = conv_template
        return conv_template


@router.get("/v1/models", dependencies=[Depends(check_api_key)], tags=["chat"])
async def show_available_models():
    controller_address = app_settings.controller_address
    models = []  # Initialize models to avoid NameError if the async with block fails
    async with httpx.AsyncClient() as client:
        # First, try to get models without refresh
        ret = await client.post(controller_address + "/list_models")
        models = ret.json().get("models", [])
        if models:
            models.sort()
            # TODO: return real model permission details
            model_cards = []
            for m in models:
                model_cards.append(ModelCard(id=m, root=m, permission=[ModelPermission()]))
            return ModelList(data=model_cards)

        # If no models, refresh and try again
        await client.post(controller_address + "/refresh_all_workers")
        ret = await client.post(controller_address + "/list_models")
        models = ret.json().get("models", [])

    models.sort()
    # TODO: return real model permission details
    model_cards = []
    for m in models:
        model_cards.append(ModelCard(id=m, root=m, permission=[ModelPermission()]))
    return ModelList(data=model_cards)


@router.post("/v1/audio/speech", tags=["audio"])
async def create_audio_tts(request: AudioGenerationRequest):
    error_check_ret = await check_model(request)
    if error_check_ret is not None:
        if isinstance(error_check_ret, JSONResponse):
            return error_check_ret
        elif isinstance(error_check_ret, dict) and "model_name" in error_check_ret.keys():
            request.model = error_check_ret["model_name"]

    # TODO: Change this
    exp_obj = await Experiment.get(request.experiment_id)
    experiment_dir = await exp_obj.get_dir()

    audio_dir = storage.join(experiment_dir, "audio")
    await storage.makedirs(audio_dir, exist_ok=True)

    gen_params = {
        "audio_dir": audio_dir,
        "model": request.model,
        "text": request.text,
        "file_prefix": request.file_prefix,
        "sample_rate": request.sample_rate,
        "temperature": request.temperature,
        "speed": request.speed,
        "top_p": request.top_p,
        "audio_path": request.audio_path,
    }
    gen_params["task"] = "tts"

    # Add voice parameter if provided
    if request.voice:
        gen_params["voice"] = request.voice
        gen_params["lang_code"] = request.voice[0]

    # TODO: Define a base model class to structure the return value
    try:
        content = await generate_completion(gen_params)
        return content
    except Exception as e:
        return create_error_response(ErrorCode.INTERNAL_ERROR, str(e))


@router.post("/v1/audio/upload_reference", tags=["audio"])
async def upload_audio_reference(experimentId: str, audio: UploadFile = File(...)):
    exp_obj = await Experiment.create_or_get(experimentId)
    experiment_dir = await exp_obj.get_dir()
    uploaded_audio_dir = storage.join(experiment_dir, "uploaded_audio")
    await storage.makedirs(uploaded_audio_dir, exist_ok=True)

    file_prefix = str(uuid.uuid4())
    _, ext = os.path.splitext(audio.filename)
    file_path = storage.join(uploaded_audio_dir, file_prefix + ext)

    # Save the uploaded file
    content = await audio.read()
    async with await storage.open(file_path, "wb") as f:
        await f.write(content)

    return JSONResponse({"audioPath": file_path})


@router.post("/v1/audio/transcriptions", tags=["audio"])
async def create_text_stt(request: AudioTranscriptionsRequest):
    error_check_ret = await check_model(request)
    if error_check_ret is not None:
        if isinstance(error_check_ret, JSONResponse):
            return error_check_ret
        elif isinstance(error_check_ret, dict) and "model_name" in error_check_ret.keys():
            request.model = error_check_ret["model_name"]

    exp_obj = await Experiment.get(request.experiment_id)
    experiment_dir = await exp_obj.get_dir()
    transcription_dir = storage.join(experiment_dir, "transcriptions")
    await storage.makedirs(transcription_dir, exist_ok=True)

    gen_params = {
        "model": request.model,
        "audio_path": request.audio_path,
        "output_path": transcription_dir,
        # "format": request.format,
    }
    gen_params["task"] = "stt"
    try:
        content = await generate_completion(gen_params)
        return content
    except Exception as e:
        return create_error_response(ErrorCode.INTERNAL_ERROR, str(e))


@router.post("/v1/chat/completions", dependencies=[Depends(check_api_key)], tags=["chat"])
async def create_openapi_chat_completion(request: ChatCompletionRequest):
    """Creates a completion for the chat message"""
    error_check_ret = await check_model(request)
    if error_check_ret is not None:
        if isinstance(error_check_ret, JSONResponse):
            return error_check_ret
        elif isinstance(error_check_ret, dict) and "model_name" in error_check_ret.keys():
            request.model = error_check_ret["model_name"]

    error_check_ret = check_requests(request)
    if error_check_ret is not None:
        return error_check_ret

    # Pass through tools from frontend - no auto-loading
    tools = request.tools

    gen_params = await get_gen_params(
        request.model,
        request.messages,
        temperature=request.temperature,
        top_p=request.top_p,
        min_p=request.min_p,
        max_tokens=request.max_tokens,
        echo=False,
        stream=request.stream,
        stop=request.stop,
        logprobs=request.logprobs,
        tools=tools,
    )

    error_check_ret = await check_length(request, gen_params["prompt"], gen_params["max_new_tokens"])
    if error_check_ret is not None:
        return error_check_ret
    log_prompt(gen_params)
    if request.stream:
        generator = chat_completion_stream_generator(request.model, gen_params, request.n)
        return StreamingResponse(generator, media_type="text/event-stream")
    choices = []
    chat_completions = []
    for i in range(request.n):
        content = asyncio.create_task(generate_completion(gen_params))
        chat_completions.append(content)
    try:
        all_tasks = await asyncio.gather(*chat_completions)
    except Exception as e:
        return create_error_response(ErrorCode.INTERNAL_ERROR, str(e))
    usage = UsageInfo()
    for i, content in enumerate(all_tasks):
        if content["error_code"] != 0:
            return create_error_response(content["error_code"], content["text"])
        choices.append(
            ChatCompletionResponseChoice(
                index=i,
                message=ChatMessage(role="assistant", content=content["text"]),
                finish_reason=content.get("finish_reason", "stop"),
            )
        )
        if "usage" in content:
            task_usage = UsageInfo.model_validate(content["usage"])
            for usage_key, usage_value in task_usage.model_dump().items():
                setattr(usage, usage_key, getattr(usage, usage_key) + usage_value)

    return ChatCompletionResponse(model=request.model, choices=choices, usage=usage)


async def chat_completion_stream_generator(
    model_name: str, gen_params: Dict[str, Any], n: int
) -> Generator[str, Any, None]:
    """
    Event stream format:
    https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events#event_stream_format
    """
    id = f"chatcmpl-{shortuuid.random()}"
    gen_params["type"] = "chat_completion"
    finish_stream_events = []
    for i in range(n):
        # First chunk with role
        choice_data = ChatCompletionResponseStreamChoice(
            index=i,
            delta=DeltaMessage(role="assistant"),
            finish_reason=None,
        )
        chunk = ChatCompletionStreamResponse(id=id, choices=[choice_data], model=model_name)
        # Convert the chunk to a dictionary
        if not isinstance(chunk, dict):
            chunk_dict = chunk.model_dump()
        else:
            chunk_dict = chunk

        # Convert the dictionary to a JSON string
        sorted_json = json.dumps(chunk_dict, sort_keys=True, ensure_ascii=False)

        # Use the JSON string in your response
        yield f"data: {sorted_json}\n\n"

        previous_text = ""
        async for content in generate_completion_stream(gen_params):
            if content["error_code"] != 0:
                # Convert the content to a dictionary
                print("Error occurred in generation", content)
                if not isinstance(content, dict):
                    content_dict = content.model_dump()
                else:
                    content_dict = content

                # Convert the dictionary to a JSON string
                sorted_json = json.dumps(content_dict, sort_keys=True, ensure_ascii=False)

                yield f"data: {sorted_json}\n\n"
                yield "data: [DONE]\n\n"
                return
            decoded_unicode = content["text"].replace("\ufffd", "")
            delta_text = decoded_unicode[len(previous_text) :]
            previous_text = decoded_unicode

            if len(delta_text) == 0:
                delta_text = None
            choice_data = ChatCompletionResponseStreamChoice(
                index=i,
                delta=DeltaMessage(content=delta_text),
                finish_reason=content.get("finish_reason", None),
            )
            chunk = ChatCompletionStreamResponse(id=id, choices=[choice_data], model=model_name)
            if delta_text is None:
                if content.get("finish_reason", None) is not None:
                    finish_stream_events.append(chunk)
                continue
            # Convert the chunk to a dictionary
            chunk_dict = chunk.model_dump(exclude_unset=True)

            # Convert the dictionary to a JSON string
            sorted_json = json.dumps(chunk_dict, ensure_ascii=False)

            # Use the JSON string in your response
            yield f"data: {sorted_json}\n\n"
    # There is not "content" field in the last delta message, so exclude_none to exclude field "content".
    for finish_chunk in finish_stream_events:
        # Convert the finish_chunk to a dictionary
        finish_chunk_dict = finish_chunk.model_dump(exclude_none=True)

        # Convert the dictionary to a JSON string
        sorted_json = json.dumps(finish_chunk_dict, ensure_ascii=False)

        # Use the JSON string in your response
        yield f"data: {sorted_json}\n\n"
    yield "data: [DONE]\n\n"


@router.post("/v1/completions", dependencies=[Depends(check_api_key)], tags=["chat"])
async def create_completion(request: ModifiedCompletionRequest):
    error_check_ret = await check_model(request)
    if error_check_ret is not None:
        if isinstance(error_check_ret, JSONResponse):
            return error_check_ret
        elif isinstance(error_check_ret, dict) and "model_name" in error_check_ret.keys():
            request.model = error_check_ret["model_name"]

    error_check_ret = check_requests(request)
    if error_check_ret is not None:
        return error_check_ret

    request.prompt = process_input(request.model, request.prompt)

    for text in request.prompt:
        error_check_ret = await check_length(request, text, request.max_tokens)
        if error_check_ret is not None:
            return error_check_ret

    if request.stream:
        generator = generate_completion_stream_generator(request, request.n)
        return StreamingResponse(generator, media_type="text/event-stream")
    else:
        text_completions = []
        for text in request.prompt:
            gen_params = await get_gen_params(
                request.model,
                text,
                temperature=request.temperature,
                top_p=request.top_p,
                min_p=request.min_p,
                max_tokens=request.max_tokens,
                echo=request.echo,
                stream=request.stream,
                stop=request.stop,
                logprobs=request.logprobs,
            )

            log_prompt(gen_params)

            for i in range(request.n):
                content = asyncio.create_task(generate_completion(gen_params))
                text_completions.append(content)

        try:
            all_tasks = await asyncio.gather(*text_completions)
        except Exception as e:
            return create_error_response(ErrorCode.INTERNAL_ERROR, str(e))

        # In "content" there is an array of logprobs, we need to collapse that so that
        # logprobs = [{token: 'xx', ... }, {token: 'yy', ... }, ...]
        # becomes:
        # logprobs = { "tokens": ['xx', 'yy', ...], "top_logprobs": [{ 'xx': 0.1, 'yy': 0.2, ... }, ...] }

        choices = []
        usage = UsageInfo()
        for i, content in enumerate(all_tasks):
            if content["error_code"] != 0:
                return create_error_response(content["error_code"], content["text"])

            logprobs = content.get("logprobs", None)
            logprob_formatted = None
            if logprobs is not None:
                logprob_formatted = convert_group_of_logprobs_to_openai_format(logprobs)

            choices.append(
                {
                    "index": i,
                    "text": content["text"],
                    "logprobs": logprob_formatted,
                    "finish_reason": content.get("finish_reason", "stop"),
                }
            )

            task_usage = UsageInfo.model_validate(content["usage"])
            for usage_key, usage_value in task_usage.model_dump().items():
                setattr(usage, usage_key, getattr(usage, usage_key) + usage_value)

        return CompletionResponse(model=request.model, choices=choices, usage=UsageInfo.model_validate(usage))


def convert_to_openai_format(token_data):
    """
    Convert custom logprobs format to OpenAI API format.

    Input format:
    {
        'token': str,
        'logprob': float,
        'bytes': List[int],
        'top_logprobs': List[Dict]
    }
    In some cases the token_data is returned correctly as a dictionary, in other cases it is returned as a list of dictionaries.
    {
        'token_logprobs': List[float],
        'test_offset': List[int],
        'tokens': List[str],
        'top_logprobs': List[Dict]
    }

    Output format:
    {
        'text_offset': List[int],
        'token_logprobs': List[float],
        'tokens': List[str],
        'top_logprobs': List[Dict[str, float]]
    }
    """
    if type(token_data) is not dict:
        print("Token Data is not a dictionary, returning None")
        return None

    if "token_logprobs" in token_data:
        token_logprobs = token_data["token_logprobs"]
    else:
        token_logprobs = [token_data["logprob"]]

    if "tokens" in token_data:
        tokens = token_data["tokens"]
    else:
        tokens = [token_data["token"]]

    # Initialize OpenAI format
    openai_format = {
        "text_offset": [0],  # Assuming this is the first token
        "token_logprobs": token_logprobs,
        "tokens": tokens,
        "top_logprobs": [],
    }

    if "top_logprobs" not in token_data:
        # Convert top_logprobs array to OpenAI's dictionary format
        top_logprobs_dict = {}
        for item in token_data["top_logprobs"]:
            top_logprobs_dict[item["token"]] = item["logprob"]

        openai_format["top_logprobs"].append(top_logprobs_dict)
    else:
        openai_format["top_logprobs"] = token_data["top_logprobs"]

    return openai_format


def convert_group_of_logprobs_to_openai_format(logprobs: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Convert custom logprobs format to OpenAI API format.

    Input format:
    [
        {
            'token': str,
            'logprob': float,
            'bytes': List[int],
            'top_logprobs': List[Dict]
        },
        ...
    ]

    Output format:
    {
        'text_offset': List[int],
        'token_logprobs': List[float],
        'tokens': List[str],
        'top_logprobs': List[Dict[str, float]]
    }
    """
    # Initialize OpenAI format
    openai_format = {"text_offset": [], "token_logprobs": [], "tokens": [], "top_logprobs": []}

    offset_counter = 0

    for token_data in logprobs:
        # Append token logprobs
        openai_format["token_logprobs"].append(token_data["logprob"])

        # Append token
        openai_format["tokens"].append(token_data["token"])

        # Convert top_logprobs array to OpenAI's dictionary format
        top_logprobs_dict = {}
        for item in token_data["top_logprobs"]:
            top_logprobs_dict[item["token"]] = item["logprob"]

        openai_format["top_logprobs"].append(top_logprobs_dict)

        openai_format["text_offset"].append(offset_counter)
        offset_counter += len(token_data["token"])

    return openai_format


async def generate_completion_stream_generator(request: ModifiedCompletionRequest, n: int):
    model_name = request.model
    id = f"cmpl-{shortuuid.random()}"
    finish_stream_events = []
    for text in request.prompt:
        for i in range(n):
            previous_text = ""
            gen_params = await get_gen_params(
                request.model,
                text,
                temperature=request.temperature,
                top_p=request.top_p,
                min_p=request.min_p,
                max_tokens=request.max_tokens,
                echo=request.echo,
                stream=request.stream,
                stop=request.stop,
                logprobs=request.logprobs,
            )
            gen_params["type"] = "completion"
            log_prompt(gen_params)

            async for content in generate_completion_stream(gen_params):
                if content["error_code"] != 0:
                    # Convert the content to a dictionary
                    content_dict = content.model_dump()

                    # Convert the dictionary to a JSON string
                    sorted_json = json.dumps(content_dict, sort_keys=True, ensure_ascii=False)

                    # Use the JSON string in your response
                    yield f"data: {sorted_json}\n\n"
                    yield "data: [DONE]\n\n"
                    return
                decoded_unicode = content["text"].replace("\ufffd", "")
                delta_text = decoded_unicode[len(previous_text) :]
                previous_text = decoded_unicode

                logprob_formatted = {
                    "text_offset": [],
                    "token_logprobs": [],
                    "tokens": [],
                    "top_logprobs": [],
                }

                logprobs = content.get("logprobs", None)
                if logprobs is not None and isinstance(logprobs, dict):
                    logprob_formatted = convert_to_openai_format(logprobs)
                    if logprob_formatted is not None:
                        logprob_formatted["text_offset"] = [i]
                else:
                    print("Skipping conversion of logprobs as it is not a dictionary")

                # print(logprob_formatted)

                # todo: index is not apparent
                choice_data = {
                    "index": i,
                    "text": delta_text,
                    "logprobs": logprob_formatted,
                    "finish_reason": content.get("finish_reason", None),
                }
                chunk = {
                    "id": id,
                    "object": "text_completion",
                    "choices": [choice_data],
                    "model": model_name,
                }
                if len(delta_text) == 0:
                    # print("delta_text", delta_text)
                    if content.get("finish_reason", None) is not None:
                        finish_stream_events.append(chunk)
                    continue
                # Convert the chunk to a dictionary
                chunk_dict = chunk

                # Convert the dictionary to a JSON string
                sorted_json = json.dumps(chunk_dict, sort_keys=True, ensure_ascii=False)

                # Use the JSON string in your response
                yield f"data: {sorted_json}\n\n"
    # There is not "content" field in the last delta message, so exclude_none to exclude field "content".
    for finish_chunk in finish_stream_events:
        # Convert the finish_chunk to a dictionary
        finish_chunk_dict = finish_chunk

        # print("finish_chunk_dict", finish_chunk_dict)

        # Convert the dictionary to a JSON string
        sorted_json = json.dumps(finish_chunk_dict, ensure_ascii=False)

        # Use the JSON string in your response
        yield f"data: {sorted_json}\n\n"
    yield "data: [DONE]\n\n"


async def generate_completion_stream(payload: Dict[str, Any]):
    async with httpx.AsyncClient() as client:
        worker_addr = await get_worker_address(payload["model"], client)
        delimiter = b"\0"
        async with client.stream(
            "POST",
            worker_addr + "/worker_generate_stream",
            headers=headers,
            json=payload,
            timeout=WORKER_API_TIMEOUT,
        ) as response:
            # content = await response.aread()
            async for raw_chunk in response.aiter_raw():
                for chunk in raw_chunk.split(delimiter):
                    if not chunk:
                        continue
                    # print(chunk.decode())
                    data = None
                    try:
                        data = json.loads(chunk.decode())
                    except Exception as e:
                        # Catching this exception is a hack -- we do it because with log probs turned on,
                        # the response gets really long, more than 63892 bytes, and the stream gets cut off.
                        # This is a workaround to prevent the stream from breaking. But we should fix
                        # the underlying issue in the worker.
                        print("Caught Exception in OpenAI API: ", e)
                        continue
                    yield data


async def generate_completion(payload: Dict[str, Any]):
    async with httpx.AsyncClient() as client:
        worker_addr = await get_worker_address(payload["model"], client)

        response = await client.post(
            worker_addr + "/worker_generate",
            headers=headers,
            json=payload,
            timeout=WORKER_API_TIMEOUT,
        )
        completion = response.json()
        return completion


@router.post("/v1/embeddings", dependencies=[Depends(check_api_key)], tags=["chat"])
@router.post(
    "/v1/engines/{model_name}/embeddings",
    dependencies=[Depends(check_api_key)],
    tags=["chat"],
)
async def create_embeddings(request: EmbeddingsRequest, model_name: str = None):
    """Creates embeddings for the text"""
    if request.model is None:
        request.model = model_name
    error_check_ret = await check_model(request)
    if error_check_ret is not None:
        if isinstance(error_check_ret, JSONResponse):
            return error_check_ret
        elif isinstance(error_check_ret, dict) and "model_name" in error_check_ret.keys():
            request.model = error_check_ret["model_name"]

    request.input = process_input(request.model, request.input)

    data = []
    token_num = 0
    batch_size = WORKER_API_EMBEDDING_BATCH_SIZE
    batches = [
        request.input[i : min(i + batch_size, len(request.input))] for i in range(0, len(request.input), batch_size)
    ]
    for num_batch, batch in enumerate(batches):
        payload = {
            "model": request.model,
            "input": batch,
        }
        embedding = await get_embedding(payload)
        if "error_code" in embedding and embedding["error_code"] != 0:
            return create_error_response(embedding["error_code"], embedding["text"])
        data += [
            {
                "object": "embedding",
                "embedding": emb,
                "index": num_batch * batch_size + i,
            }
            for i, emb in enumerate(embedding["embedding"])
        ]
        token_num += embedding["token_num"]
    return EmbeddingsResponse(
        data=data,
        model=request.model,
        usage=UsageInfo(
            prompt_tokens=token_num,
            total_tokens=token_num,
            completion_tokens=None,
        ),
    ).model_dump(exclude_none=True)


async def get_embedding(payload: Dict[str, Any]):
    model_name = payload["model"]
    async with httpx.AsyncClient() as client:
        worker_addr = await get_worker_address(model_name, client)

        response = await client.post(
            worker_addr + "/worker_get_embeddings",
            headers=headers,
            json=payload,
            timeout=WORKER_API_TIMEOUT,
        )
        embedding = response.json()
        return embedding


### GENERAL API - NOT OPENAI COMPATIBLE ###


@router.post("/api/v1/token_check", tags=["chat"], include_in_schema=False)
async def count_tokens(request: APITokenCheckRequest):
    """
    Checks the token count for each message in your list
    This is not part of the OpenAI API spec.
    """
    checkedList = []
    async with httpx.AsyncClient() as client:
        for item in request.prompts:
            worker_addr = await get_worker_address(item.model, client)

            response = await client.post(
                worker_addr + "/model_details",
                headers=headers,
                json={"model": item.model},
                timeout=WORKER_API_TIMEOUT,
            )
            context_len = response.json()["context_length"]

            response = await client.post(
                worker_addr + "/count_token",
                headers=headers,
                json={"prompt": item.prompt, "model": item.model},
                timeout=WORKER_API_TIMEOUT,
            )
            token_num = response.json()["count"]

            can_fit = True
            if token_num + item.max_tokens > context_len:
                can_fit = False

            checkedList.append(APITokenCheckResponseItem(fits=can_fit, contextLength=context_len, tokenCount=token_num))

    return APITokenCheckResponse(prompts=checkedList)


# TODO: this more or less duplicates create_openapi_chat_completion and we
#       should merge them together. The two request types are similar, the
#       response is the same.
@router.post("/api/v1/chat/completions", tags=["chat"], include_in_schema=False)
async def create_chat_completion(request: APIChatCompletionRequest):
    """Creates a completion for the chat message"""
    error_check_ret = await check_model(request)
    if error_check_ret is not None:
        if isinstance(error_check_ret, JSONResponse):
            return error_check_ret
        elif isinstance(error_check_ret, dict) and "model_name" in error_check_ret.keys():
            request.model = error_check_ret["model_name"]
    error_check_ret = check_requests(request)
    if error_check_ret is not None:
        return error_check_ret

    # Pass through tools from frontend - no auto-loading
    tools = request.tools if hasattr(request, "tools") else None

    gen_params = await get_gen_params(
        request.model,
        request.messages,
        temperature=request.temperature,
        top_p=request.top_p,
        min_p=request.min_p,
        max_tokens=request.max_tokens,
        echo=False,
        stream=request.stream,
        stop=request.stop,
        logprobs=request.logprobs,
        tools=tools,
    )

    if request.repetition_penalty is not None:
        gen_params["repetition_penalty"] = request.repetition_penalty

    error_check_ret = await check_length(request, gen_params["prompt"], gen_params["max_new_tokens"])
    if error_check_ret is not None:
        return error_check_ret

    if request.stream:
        generator = chat_completion_stream_generator(request.model, gen_params, request.n)
        return StreamingResponse(generator, media_type="text/event-stream")

    choices = []
    chat_completions = []
    for i in range(request.n):
        content = asyncio.create_task(generate_completion(gen_params))
        chat_completions.append(content)
    try:
        all_tasks = await asyncio.gather(*chat_completions)
    except Exception as e:
        return create_error_response(ErrorCode.INTERNAL_ERROR, str(e))
    usage = UsageInfo()
    for i, content in enumerate(all_tasks):
        if content["error_code"] != 0:
            return create_error_response(content["error_code"], content["text"])
        choices.append(
            ChatCompletionResponseChoice(
                index=i,
                message=ChatMessage(role="assistant", content=content["text"]),
                finish_reason=content.get("finish_reason", "stop"),
            )
        )
        task_usage = UsageInfo.model_validate(content["usage"])
        for usage_key, usage_value in task_usage.model_dump().items():
            setattr(usage, usage_key, getattr(usage, usage_key) + usage_value)

    return ChatCompletionResponse(model=request.model, choices=choices, usage=usage)


@router.post("/v1/chat/count_tokens", dependencies=[Depends(check_api_key)], tags=["chat"])
async def count_chat_tokens(request: ChatCompletionRequest):
    error_check_ret = await check_model(request)
    if error_check_ret is not None:
        if isinstance(error_check_ret, JSONResponse):
            return error_check_ret
        elif isinstance(error_check_ret, dict) and "model_name" in error_check_ret.keys():
            request.model = error_check_ret["model_name"]
    error_check_ret = check_requests(request)
    if error_check_ret is not None:
        return error_check_ret

    gen_params = await get_gen_params(
        request.model,
        request.messages,
        temperature=request.temperature,
        top_p=request.top_p,
        min_p=request.min_p,
        max_tokens=request.max_tokens,
        echo=False,
        stream=request.stream,
        stop=request.stop,
    )

    prompt = gen_params["prompt"]
    max_tokens = gen_params["max_new_tokens"]

    async with httpx.AsyncClient() as client:
        worker_addr = await get_worker_address(request.model, client)

        response = await client.post(
            worker_addr + "/model_details",
            headers=headers,
            json={"model": request.model},
            timeout=WORKER_API_TIMEOUT,
        )
        context_len = response.json()["context_length"]

        response = await client.post(
            worker_addr + "/count_token",
            headers=headers,
            json={"model": request.model, "prompt": prompt},
            timeout=WORKER_API_TIMEOUT,
        )
        token_num = response.json()["count"]

    return {
        "tokenCount": token_num,
        "contextLength": context_len,
        "tokensInHistory": token_num,
        "tokensInCompletion": max_tokens,
    }


@router.post("/tokenize", tags=["chat"])
async def tokenize(request: Request):
    """Tokenize a string and return the tokenized output as a set of input_ids and strings -- this only works
    if the worker implements the tokenize endpoint."""
    data = await request.json()
    model = data["model"]
    text = data["text"]
    async with httpx.AsyncClient() as client:
        worker_addr = await get_worker_address(model, client)
        response = await client.post(
            worker_addr + "/tokenize",
            headers=headers,
            json={"model": model, "text": text},
            timeout=WORKER_API_TIMEOUT,
        )
        return response.json()


@router.post("/v1/visualize_generation", dependencies=[Depends(check_api_key)], tags=["visualization"])
async def visualize_model_generation(request: VisualizationRequest):
    """Stream model activations and attention data during text generation"""
    error_check_ret = await check_model(request)
    if error_check_ret is not None:
        if isinstance(error_check_ret, JSONResponse):
            return error_check_ret
        elif isinstance(error_check_ret, dict) and "model_name" in error_check_ret.keys():
            request.model = error_check_ret["model_name"]

    if request.stream:
        generator = visualization_stream_generator(
            request.model,
            request.prompt,
            max_tokens=request.max_tokens,
            temperature=request.temperature,
            top_p=request.top_p,
            min_p=request.min_p,
        )
        return StreamingResponse(generator, media_type="text/event-stream")
    else:
        # For non-streaming mode, return complete visualization after generation
        visualization_data = await generate_complete_visualization(
            request.model,
            request.prompt,
            max_tokens=request.max_tokens,
            temperature=request.temperature,
            top_p=request.top_p,
            min_p=request.min_p,
        )
        return visualization_data


async def visualization_stream_generator(
    model_name: str,
    prompt: str,
    max_tokens: int = 100,
    temperature: float = 0.7,
    top_p: float = 1.0,
    min_p: float = 0.0,
) -> AsyncGenerator[str, None]:
    """Stream model activation and attention entropy data during generation"""
    async with httpx.AsyncClient() as client:
        worker_addr = await get_worker_address(model_name, client)

        # First, check if the worker supports visualization
        try:
            visualization_check = await client.get(
                worker_addr + "/supports_activation_visualization", timeout=WORKER_API_TIMEOUT
            )
            if not visualization_check.json().get("available", False):
                error_msg = json.dumps(
                    {
                        "error": "Visualization not supported by this model worker",
                        "error_code": ErrorCode.INTERNAL_ERROR,
                    }
                )
                yield f"data: {error_msg}\n\n"
                return
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 404:
                error_msg = json.dumps(
                    {
                        "error": "Visualization not supported by this model worker",
                        "error_code": ErrorCode.INTERNAL_ERROR,
                    }
                )
                yield f"data: {error_msg}\n\n"
                return
            raise

        # Set up visualization parameters
        payload = {
            "prompt": prompt,
            "temperature": temperature,
            "top_p": top_p,
            "min_p": min_p,
            "max_tokens": max_tokens,
            "stream": True,
        }

        # Stream generation with visualization data
        try:
            async with client.stream(
                "POST",
                worker_addr + "/worker_generate_activation_visualization",
                json=payload,
                timeout=WORKER_API_TIMEOUT,
            ) as response:
                delimiter = b"\0"
                async for raw_chunk in response.aiter_raw():
                    for chunk in raw_chunk.split(delimiter):
                        if not chunk:
                            continue
                        try:
                            data = json.loads(chunk.decode())
                            yield f"data: {json.dumps(data)}\n\n"
                        except Exception as e:
                            print("Caught Exception in visualization stream: ", e)
                            error_msg = json.dumps(
                                {
                                    "error": "Error processing visualization data",
                                    "error_code": ErrorCode.INTERNAL_ERROR,
                                }
                            )
                            yield f"data: {error_msg}\n\n"

                yield "data: [DONE]\n\n"
        except Exception as e:
            print("Error connecting to model worker ", e)
            error_msg = json.dumps(
                {"error": "Error connecting to model worker", "error_code": ErrorCode.INTERNAL_ERROR}
            )
            yield f"data: {error_msg}\n\n"
            yield "data: [DONE]\n\n"


async def generate_complete_visualization(
    model_name: str,
    prompt: str,
    max_tokens: int = 100,
    temperature: float = 0.7,
    top_p: float = 1.0,
    min_p: float = 0.0,
):
    """Generate complete visualization data for the entire generation process"""
    async with httpx.AsyncClient() as client:
        worker_addr = await get_worker_address(model_name, client)

        # First check if visualization is supported
        try:
            visualization_check = await client.get(
                worker_addr + "/supports_activation_visualization", timeout=WORKER_API_TIMEOUT
            )
            if not visualization_check.json().get("available", False):
                return {
                    "error": "Visualization not supported by this model worker",
                    "error_code": ErrorCode.INTERNAL_ERROR,
                }
        except httpx.HTTPStatusError:
            return {"error": "Visualization not supported by this model worker", "error_code": ErrorCode.INTERNAL_ERROR}

        # Set up parameters
        payload = {
            "prompt": prompt,
            "temperature": temperature,
            "top_p": top_p,
            "min_p": min_p,
            "max_tokens": max_tokens,
            "stream": False,
        }

        # Get complete generation with visualization data
        response = await client.post(
            worker_addr + "/worker_generate_activation_visualization",
            json=payload,
            timeout=WORKER_API_TIMEOUT + max_tokens,  # Extra time for token generation
        )
        return response.json()


@router.post("/v1/model_architecture", dependencies=[Depends(check_api_key)], tags=["visualization"])
async def get_model_architecture(request: ModelArchitectureRequest):
    """Retrieve model architecture data for visualization"""
    error_check_ret = await check_model(request, bypass_adaptor=True)
    if error_check_ret is not None:
        if isinstance(error_check_ret, JSONResponse):
            return error_check_ret
        elif isinstance(error_check_ret, dict) and "model_name" in error_check_ret.keys():
            request.model = error_check_ret["model_name"]

    # Get the model architecture data from the worker
    architecture_data = await generate_model_architecture(request.model)
    return architecture_data


async def generate_model_architecture(model_name: str):
    """Generate model architecture data for visualization"""
    async with httpx.AsyncClient() as client:
        worker_addr = await get_worker_address(model_name, client)

        # First check if architecture visualization is supported
        try:
            architecture_check = await client.get(
                worker_addr + "/supports_architecture_visualization", timeout=WORKER_API_TIMEOUT
            )
            if not architecture_check.json().get("available", False):
                return {
                    "error": "Architecture visualization not supported by this model worker",
                    "error_code": ErrorCode.INTERNAL_ERROR,
                }
        except httpx.HTTPStatusError:
            return {
                "error": "Architecture visualization not supported by this model worker",
                "error_code": ErrorCode.INTERNAL_ERROR,
            }

        # Get model architecture data
        response = await client.post(
            worker_addr + "/worker_generate_layers_visualization",
            headers=headers,
            json={"model": model_name},
            timeout=WORKER_API_TIMEOUT,
        )
        return response.json()


@router.post("/v1/text_diffusion", dependencies=[Depends(check_api_key)], tags=["visualization"])
async def text_diffusion_visualization(request: TextDiffusionRequest):
    """Stream text diffusion visualization showing each step of the generation process"""
    error_check_ret = await check_model(request)
    if error_check_ret is not None:
        if isinstance(error_check_ret, JSONResponse):
            return error_check_ret
        elif isinstance(error_check_ret, dict) and "model_name" in error_check_ret.keys():
            request.model = error_check_ret["model_name"]

    error_check_ret = check_requests(request)
    if error_check_ret is not None:
        return error_check_ret

    gen_params = await get_gen_params(
        request.model,
        request.prompt,
        temperature=request.temperature,
        top_p=request.top_p,
        min_p=request.min_p,
        max_tokens=request.max_tokens,
        echo=False,
        stream=True,
        stop=request.stop,
        logprobs=False,
    )

    error_check_ret = await check_length(request, gen_params["prompt"], gen_params["max_new_tokens"])
    if error_check_ret is not None:
        return error_check_ret

    generator = text_diffusion_stream_generator(request.model, gen_params)
    return StreamingResponse(generator, media_type="text/event-stream")


async def text_diffusion_stream_generator(model_name: str, gen_params: Dict[str, Any]) -> AsyncGenerator[str, Any]:
    """Generator for text diffusion visualization stream"""
    id = f"diff-{shortuuid.random()}"

    try:
        async for content in generate_completion_stream(gen_params):
            if content.get("error_code", 0) != 0:
                error_dict = content if isinstance(content, dict) else content.model_dump()
                error_json = json.dumps(error_dict, ensure_ascii=False)
                yield f"data: {error_json}\n\n"
                yield "data: [DONE]\n\n"
                return

            # Extract diffusion-specific metadata
            diffusion_step = content.get("diffusion_step")
            total_steps = content.get("total_steps")
            masks_remaining = content.get("masks_remaining")
            text = content.get("text", "")
            finish_reason = content.get("finish_reason")

            # Format response with diffusion metadata
            # Always include text (even if empty) and step info for each diffusion step
            response_data = {
                "id": id,
                "object": "text_diffusion",
                "model": model_name,
                "text": text if text is not None else "",
            }

            # Add diffusion step metadata if available
            if diffusion_step is not None:
                response_data["diffusion_step"] = diffusion_step
            if total_steps is not None:
                response_data["total_steps"] = total_steps
            if masks_remaining is not None:
                response_data["masks_remaining"] = masks_remaining
            if finish_reason is not None:
                response_data["finish_reason"] = finish_reason

            response_json = json.dumps(response_data, ensure_ascii=False)
            yield f"data: {response_json}\n\n"

            if finish_reason:
                yield "data: [DONE]\n\n"
                return

    except Exception as e:
        logger.error(f"Error in text diffusion stream: {e}")
        error_msg = json.dumps(
            {
                "error": "Error in text diffusion stream",
                "error_code": ErrorCode.INTERNAL_ERROR,
            }
        )
        yield f"data: {error_msg}\n\n"
        yield "data: [DONE]\n\n"


@router.post("/v1/layer_details", dependencies=[Depends(check_api_key)], tags=["visualization"])
async def get_layer_details(request: Request):
    """Get details about a specific layer in the model architecture"""
    data = await request.json()
    model_name = data.get("model_name")
    layer_name = data.get("layer_name")

    if not model_name or not layer_name:
        return create_error_response(
            ErrorCode.PARAM_OUT_OF_RANGE,
            "Both 'model_name' and 'layer_name' must be provided.",
        )

    async with httpx.AsyncClient() as client:
        worker_addr = await get_worker_address(model_name, client)

        # Get layer details
        response = await client.post(
            worker_addr + "/worker_get_layer_details",
            headers=headers,
            json={"model": model_name, "layer_name": layer_name},
            timeout=WORKER_API_TIMEOUT,
        )
        return response.json()
