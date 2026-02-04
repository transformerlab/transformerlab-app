"""
A model worker using Apple MLX Audio
"""

import os
import sys
import argparse
import asyncio
import uuid
from contextlib import asynccontextmanager
from typing import List
import json
from datetime import datetime
import uvicorn
import torch
import soundfile as sf
import librosa
from audio import CsmAudioModel, OrpheusAudioModel


from fastapi import BackgroundTasks, FastAPI, Request
from fastapi.responses import JSONResponse

from fastchat.serve.model_worker import logger
from lab.dirs import get_workspace_dir
from lab import storage


worker_id = str(uuid.uuid4())[:8]


from fastchat.serve.base_model_worker import BaseModelWorker  # noqa


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    # This function is called when the app shuts down
    cleanup_at_exit()


app = FastAPI(lifespan=lifespan)


class UnslothTextToSpeechWorker(BaseModelWorker):
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
        adaptor_path: str,
    ):
        super().__init__(
            controller_addr,
            worker_addr,
            worker_id,
            model_path,
            model_names,
            limit_worker_concurrency,
        )

        logger.info(f"Loading the model {self.model_names} on worker {worker_id}")

        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.adaptor_path = adaptor_path

        if adaptor_path != "":
            self.model_name = adaptor_path
            logger.info(f"Using adaptor path: {adaptor_path}")
        else:
            self.model_name = model_path
        self.model_architecture = model_architecture
        # Use the model name and architecture to determine which custom audio model class to instantiate
        if self.model_architecture == "CsmForConditionalGeneration":
            self.audio_model = CsmAudioModel(
                model_name=self.model_name,
                device=self.device,
                processor_name=model_path,
            )
            logger.info(
                "⚠️  RECOMMENDATION: For best results with CsmForConditionalGeneration models, set temperature=0!"
            )

        elif "orpheus" in self.model_name:
            self.audio_model = OrpheusAudioModel(
                model_name=self.model_name,
                device=self.device,
            )
            logger.info("Initialized Orpheus Audio Model")

        else:
            logger.info(f"Model architecture {self.model_architecture} is not supported for audio generation.")

        if not no_register:
            self.init_heart_beat()

    async def generate(self, params):
        self.call_ct += 1

        text = params.get("text", "")
        model = params.get("model", None)
        speed = params.get("speed", 1.0)
        audio_format = params.get("audio_format", "wav")
        sample_rate = params.get("sample_rate", 24000)
        temperature = params.get("temperature", 0.0)
        top_p = params.get("top_p", 1.0)
        audio_dir = params.get("audio_dir")
        voice = params.get("voice", None)
        uploaded_audio_path = params.get("audio_path", None)
        if uploaded_audio_path:
            logger.info("Received reference audio for cloning")
        else:
            logger.info("No reference audio provided, performing standard TTS")

        workspace_dir = await get_workspace_dir()
        # Make sure the path is still inside the workspace directory
        # For both local and fsspec paths, check if audio_dir starts with workspace_dir
        is_safe = audio_dir.startswith(workspace_dir)
        if not is_safe:
            # Fallback to os.path.realpath for local path validation (handles symlinks, etc.)
            try:
                real_path = os.path.realpath(audio_dir)
                real_workspace = os.path.realpath(workspace_dir)
                is_safe = real_path.startswith(real_workspace + os.sep)
            except (OSError, ValueError):
                # If realpath fails (e.g., for remote fsspec paths), path is unsafe
                is_safe = False

        if not is_safe:
            return {
                "status": "error",
                "message": f"Unsafe audio directory path: {audio_dir}.",
            }

        # Generate a UUID for this file name:
        file_prefix = str(uuid.uuid4())
        generate_kwargs = {}
        if temperature == 0:
            generate_kwargs["do_sample"] = False
        else:
            generate_kwargs["do_sample"] = True
            generate_kwargs["temperature"] = temperature
            if top_p < 1.0:
                generate_kwargs["top_p"] = top_p
        try:
            inputs = self.audio_model.tokenize(
                text=text, audio_path=uploaded_audio_path, sample_rate=sample_rate, voice=voice
            )
            audio_values = self.audio_model.generate(inputs, **generate_kwargs)
            audio = self.audio_model.decode(audio_values)
            if speed != 1.0:
                audio = librosa.effects.time_stretch(audio, rate=speed)
            output_path = storage.join(audio_dir, f"{file_prefix}.{audio_format}")
            storage.makedirs(audio_dir, exist_ok=True)  # Ensure directory exists
            sf.write(output_path, audio, sample_rate)

            metadata = {
                "type": "audio",
                "text": text,
                "filename": f"{file_prefix}.{audio_format}",
                "model": model,
                "adaptor": self.adaptor_path.split("/")[-1] if self.adaptor_path else "",
                "speed": speed,
                "audio_format": audio_format,
                "sample_rate": sample_rate,
                "temperature": temperature,
                "top_p": top_p,
                "date": datetime.now().isoformat(),
            }
            metadata_file = storage.join(audio_dir, f"{file_prefix}.json")
            with storage.open(metadata_file, "w") as f:
                json.dump(metadata, f)

            logger.info(f"Audio successfully generated: {output_path}")

            # Clean up the specific reference audio file after successful generation
            # This ensures reference files don't accumulate after use
            if uploaded_audio_path:
                try:
                    # Check if path is within workspace
                    if uploaded_audio_path.startswith(workspace_dir):
                        if storage.exists(uploaded_audio_path):
                            storage.rm(uploaded_audio_path)
                            logger.info("Cleaned up reference audio file.")
                    else:
                        # Fallback to os.path.realpath for local path validation
                        try:
                            real_uploaded_path = os.path.realpath(uploaded_audio_path)
                            real_workspace = os.path.realpath(workspace_dir)
                            if real_uploaded_path.startswith(real_workspace + os.sep):
                                if os.path.exists(real_uploaded_path):
                                    os.remove(real_uploaded_path)
                                    logger.info("Cleaned up reference audio file.")
                        except (OSError, ValueError):
                            logger.warning("Failed to cleanup reference audio file")
                except Exception as e:
                    logger.warning(f"Failed to cleanup reference audio file: {e}")

            return {
                "status": "success",
                "message": output_path,
            }
        except Exception:
            logger.exception("Error during generation")  # Logs full stack trace
            return {"status": "error", "message": "An internal error occurred during generation."}


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
    params = await request.json()
    await acquire_worker_semaphore()
    request_id = uuid.uuid4()
    params["request_id"] = str(request_id)
    output = await worker.generate(params)
    release_worker_semaphore()
    # await engine.abort(request_id)
    # logger.debug("Trying to abort but not implemented")
    return JSONResponse(output)


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
    parser.add_argument(
        "--model-names",
        type=lambda s: s.split(","),
        help="Optional display comma separated names",
    )
    parser.add_argument("--model-architecture", type=str, default="MLX")
    parser.add_argument("--parameters", type=str, default="{}")
    parser.add_argument("--adaptor-path", type=str, default="")

    args, unknown = parser.parse_known_args()

    if args.model_path:
        args.model = args.model_path

    worker = UnslothTextToSpeechWorker(
        args.controller_address,
        args.worker_address,
        worker_id,
        args.model_path,
        args.model_names,
        args.model_architecture,
        1024,
        False,
        args.adaptor_path,
    )

    # Restore original stdout/stderr to prevent logging recursion
    sys.stdout = sys.__stdout__
    sys.stderr = sys.__stderr__
    uvicorn.run(app, host=args.host, port=args.port, log_level="info", access_log=False)


if __name__ == "__main__":
    main()
