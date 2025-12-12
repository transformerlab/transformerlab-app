"""
A model worker using Apple MLX Audio
"""

import sys
import argparse
import asyncio
import uuid
from contextlib import asynccontextmanager
from typing import List
import json

import uvicorn
from fastapi import BackgroundTasks, FastAPI, Request
from fastapi.responses import JSONResponse

from fastchat.serve.model_worker import logger
from lab import storage

from mlx_audio.tts.generate import generate_audio
from mlx_audio.stt.generate import generate
from datetime import datetime

worker_id = str(uuid.uuid4())[:8]

from fastchat.serve.base_model_worker import BaseModelWorker  # noqa


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    # This function is called when the app shuts down
    cleanup_at_exit()


app = FastAPI(lifespan=lifespan)


class MLXAudioWorker(BaseModelWorker):
    def __init__(
        self,
        controller_addr: str,
        worker_addr: str,
        worker_id: str,
        model_path: str,
        model_names: List[str],
        model_architecture: str,
        limit_worker_concurrency: int,
        no_register: bool,
    ):
        super().__init__(
            controller_addr,
            worker_addr,
            worker_id,
            model_path,
            model_names,
            limit_worker_concurrency,
        )

        logger.info(
            f"Loading the model {self.model_names} on worker" + f"{worker_id}, worker type: MLX Audio worker..."
        )
        logger.info(f"Model architecture: {model_architecture}")

        self.model_name = model_path

        if not no_register:
            self.init_heart_beat()

    async def generate(self, params):
        self.call_ct += 1

        task = params.get("task")
        if task == "tts":
            text = params.get("text", "")
            model = params.get("model", None)
            speed = params.get("speed", 1.0)
            file_prefix = params.get("file_prefix", "audio")
            audio_format = params.get("audio_format", "wav")
            sample_rate = params.get("sample_rate", 24000)
            temperature = params.get("temperature", 0.0)
            top_p = params.get("top_p", 1.0)
            stream = params.get("stream", False)
            voice = params.get("voice", None)
            lang_code = params.get("lang_code", None)
            stream = params.get("stream", False)

            audio_dir = params.get("audio_dir")

            try:
                storage.makedirs(path=audio_dir, exist_ok=True)
                kwargs = {
                    "text": text,
                    "model_path": model,
                    "speed": speed,
                    "file_prefix": storage.join(audio_dir, file_prefix),
                    "sample_rate": sample_rate,
                    "join_audio": True,
                    "verbose": True,
                    "temperature": temperature,
                    "top_p": top_p,
                    "stream": stream,
                    "voice": voice,
                }
                if lang_code:
                    kwargs["lang_code"] = lang_code

                generate_audio(**kwargs)

                # Also save the parameters and metadata used to generate the audio
                metadata = {
                    "type": "audio",
                    "text": text,
                    "voice": voice,
                    "filename": f"{file_prefix}.{audio_format}",
                    "model": model,
                    "speed": speed,
                    "audio_format": audio_format,
                    "sample_rate": sample_rate,
                    "temperature": temperature,
                    "top_p": top_p,
                    "date": datetime.now().isoformat(),  # Store the real date and time
                }

                metadata_file = storage.join(audio_dir, f"{file_prefix}.json")
                with storage.open(metadata_file, "w") as f:
                    json.dump(metadata, f)

                logger.info(f"Audio successfully generated: {audio_dir}/{file_prefix}.{audio_format}")

                return {
                    "status": "success",
                    "message": f"{audio_dir}/{file_prefix}.{audio_format}",
                }
            except Exception:
                logger.error("Error generating audio")
                return {
                    "status": "error",
                    "message": "Error generating audio",
                }

        elif task == "stt":
            audio_path = params.get("audio_path", "")
            model = params.get("model", None)
            format = params.get("format", "txt")
            transcriptions_dir = params.get("output_path")

            # Generate a UUID for this file name:
            file_prefix = str(uuid.uuid4())

            try:
                storage.makedirs(path=transcriptions_dir, exist_ok=True)
                generate(
                    audio_path=audio_path,
                    model_path=model,
                    format=format,
                    output_path=storage.join(transcriptions_dir, file_prefix),
                    verbose=True,  # Set to False to disable print messages
                )

                # Also save the parameters and metadata used to generate the audio
                metadata = {
                    "type": "text",
                    "audio_folder": "uploaded_audio",
                    "audio_path": audio_path.split("/").pop(),
                    "filename": f"{file_prefix}.{format}",
                    "model": model,
                    "text_format": format,
                    "date": datetime.now().isoformat(),  # Store the real date and time
                }
                metadata_file = storage.join(transcriptions_dir, f"{file_prefix}.json")
                with open(metadata_file, "w") as f:
                    json.dump(metadata, f)

                logger.info(f"Transcription successfully generated: {transcriptions_dir}/{file_prefix}.{format}")

                return {
                    "status": "success",
                    "message": f"{transcriptions_dir}/{file_prefix}.{format}",
                }
            except Exception:
                logger.error("Error generating transcription")
                return {
                    "status": "error",
                    "message": "Error generating transcription",
                }

        else:
            logger.error(f"Unknown task type: {task}")
            return {
                "status": "error",
                "message": f"Unknown task type: {task}",
            }


def release_worker_semaphore():
    worker.semaphore.release()


def acquire_worker_semaphore():
    if worker.semaphore is None:
        worker.semaphore = asyncio.Semaphore(worker.limit_worker_concurrency)
    return worker.semaphore.acquire()


def create_background_tasks(request_id):
    async def abort_request() -> None:
        print("trying to abort but not implemented")

    background_tasks = BackgroundTasks()
    background_tasks.add_task(release_worker_semaphore)
    background_tasks.add_task(abort_request)
    return background_tasks


@app.post("/worker_generate")
async def api_generate(request: Request):
    try:
        params = await request.json()
        logger.info(f"Worker received request: task={params.get('task')}, model={params.get('model')}")
        await acquire_worker_semaphore()
        request_id = uuid.uuid4()
        params["request_id"] = str(request_id)
        output = await worker.generate(params)
        release_worker_semaphore()
        # await engine.abort(request_id)
        # logger.debug("Trying to abort but not implemented")
        return JSONResponse(output)
    except Exception as e:
        return JSONResponse({"status": "error", "message": "An error occurred during generation."})


@app.post("/worker_get_status")
async def api_get_status(request: Request):
    return worker.get_status()


def cleanup_at_exit():
    global worker
    print("Cleaning up...")
    del worker


def main():
    global app, worker

    parser = argparse.ArgumentParser()
    parser.add_argument("--host", type=str, default="localhost")
    parser.add_argument("--port", type=int, default=21002)
    parser.add_argument("--worker-address", type=str, default="http://localhost:21002")
    parser.add_argument("--controller-address", type=str, default="http://localhost:21001")
    parser.add_argument("--model-path", type=str, default="microsoft/phi-2")
    parser.add_argument("--model-architecture", type=str, default="MLX")
    parser.add_argument(
        "--model-names",
        type=lambda s: s.split(","),
        help="Optional display comma separated names",
    )
    parser.add_argument(
        "--trust_remote_code",
        action="store_false",
        default=True,
        help="Trust remote code (e.g., from HuggingFace) whendownloading the model and tokenizer.",
    )
    parser.add_argument("--parameters", type=str, default="{}")
    parser.add_argument("--plugin_dir", type=str)

    args, unknown = parser.parse_known_args()

    if args.model_path:
        args.model = args.model_path

    worker = MLXAudioWorker(
        args.controller_address,
        args.worker_address,
        worker_id,
        args.model_path,
        args.model_names,
        args.model_architecture,
        1024,
        False,
    )

    # Restore original stdout/stderr to prevent logging recursion
    sys.stdout = sys.__stdout__
    sys.stderr = sys.__stderr__
    uvicorn.run(app, host=args.host, port=args.port, log_level="info", access_log=False)


if __name__ == "__main__":
    main()
