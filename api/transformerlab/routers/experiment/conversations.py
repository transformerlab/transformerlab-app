import json
from typing import Annotated

from fastapi import APIRouter, Body


from lab import Experiment, storage

from werkzeug.utils import secure_filename
from fastapi.responses import FileResponse


router = APIRouter(prefix="/conversations", tags=["conversations"])

audio_router = APIRouter(prefix="/conversations", tags=["conversations"])


@router.get(path="/list")
async def get_conversations(experimentId: str):
    exp_obj = Experiment.get(experimentId)
    experiment_dir = exp_obj.get_dir()

    conversation_dir = storage.join(experiment_dir, "conversations")

    # make directory if it does not exist:
    if not storage.exists(conversation_dir):
        storage.makedirs(conversation_dir, exist_ok=True)

    # now get a list of all the files in the conversations directory
    conversations_files = []
    try:
        for entry in storage.ls(conversation_dir, detail=False):
            filename = entry.rstrip("/").split("/")[-1]
            if filename.endswith(".json"):
                conversations_files.append(filename)
    except Exception:
        conversations_files = []

    conversations_contents = []

    # now read each conversation and create a list of all conversations
    # and their contents
    for i in range(len(conversations_files)):
        with storage.open(storage.join(conversation_dir, conversations_files[i]), "r") as f:
            new_conversation = {}
            new_conversation["id"] = conversations_files[i]
            # remove .json from end of id
            new_conversation["id"] = new_conversation["id"][:-5]
            new_conversation["contents"] = json.load(f)
            # use file timestamp to get a date
            try:
                # fsspec detail listing could be used; fallback to 0
                new_conversation["date"] = 0
            except Exception:
                new_conversation["date"] = 0
            conversations_contents.append(new_conversation)

    # sort the conversations by date
    conversations_contents.sort(key=lambda x: x["date"], reverse=True)

    return conversations_contents


@router.post(path="/save")
async def save_conversation(
    experimentId: str, conversation_id: Annotated[str, Body()], conversation: Annotated[str, Body()]
):
    conversation_id = secure_filename(conversation_id)
    exp_obj = Experiment.get(experimentId)
    experiment_dir = exp_obj.get_dir()

    conversation_dir = storage.join(experiment_dir, "conversations")
    final_path = storage.join(conversation_dir, conversation_id + ".json")

    # now save the conversation
    with storage.open(final_path, "w") as f:
        f.write(conversation)

    return {"message": f"Conversation {conversation_id} saved"}


@router.delete(path="/delete")
async def delete_conversation(experimentId: str, conversation_id: str):
    exp_obj = Experiment.get(experimentId)
    experiment_dir = exp_obj.get_dir()

    conversation_id = secure_filename(conversation_id)
    conversation_dir = storage.join(experiment_dir, "conversations")
    final_path = storage.join(conversation_dir, conversation_id + ".json")

    # now delete the conversation
    if storage.exists(final_path):
        storage.rm(final_path)

    return {"message": f"Conversation {conversation_id} deleted"}


@audio_router.get(path="/list_audio")
async def list_audio(experimentId: str):
    exp_obj = Experiment.get(experimentId)
    experiment_dir = exp_obj.get_dir()
    audio_dir = storage.join(experiment_dir, "audio")
    storage.makedirs(audio_dir, exist_ok=True)

    # now get a list of all the json files in the audio directory
    audio_files_metadata = []
    try:
        entries = storage.ls(audio_dir, detail=False)
        for entry in entries:
            filename = entry.rstrip("/").split("/")[-1]
            if filename.endswith(".json"):
                file_path = storage.join(audio_dir, filename)
                with storage.open(file_path, "r") as f:
                    try:
                        data = json.load(f)
                        # Add the file modification time for sorting
                        data["id"] = filename[:-5]  # Remove .json from the filename
                        # fsspec doesn't always provide mtime, use 0 as fallback
                        data["file_date"] = 0
                        audio_files_metadata.append(data)
                    except Exception:
                        continue
    except Exception:
        pass

    # Sort by file modification time (newest first)
    audio_files_metadata.sort(key=lambda x: x["file_date"], reverse=True)

    return audio_files_metadata


@audio_router.get(path="/download_audio")
async def download_audio(experimentId: str, filename: str, audioFolder: str = "audio"):
    exp_obj = Experiment.get(experimentId)
    experiment_dir = exp_obj.get_dir()

    # Use the provided audioFolder parameter, defaulting to "audio"
    audioFolder = secure_filename(audioFolder)
    audio_dir = storage.join(experiment_dir, audioFolder)

    # now download the audio file
    filename = secure_filename(filename)
    file_path = storage.join(audio_dir, filename)

    if not storage.exists(file_path):
        return {"message": f"Audio file {filename} does not exist in experiment {experimentId}"}

    # FileResponse needs a local file path, so use the path string directly
    # For remote storage, this would need special handling
    return FileResponse(path=file_path, filename=filename, media_type="audio/mpeg")


# NOTE: For this endpoint, you must pass the metadata id (the .json file name), not the specific audio file name.
@audio_router.delete(path="/delete_audio")
async def delete_audio(experimentId: str, id: str):
    """
    Delete an audio file associated with a specific experiment.

    This endpoint deletes an audio file from the experiment's audio directory.
    You must pass the metadata ID of the audio file (not the actual filename) as the `filename` parameter.

    Args:
        experimentId (int): The ID of the experiment.
        filename (str): The metadata ID of the audio file (e.g. 2c164641-c4ce-4fb8-bc7f-0d32cab81249) to delete (not the full wav filename).

    Returns:
        dict: A message indicating the result of the deletion operation.

    Responses:
        200:
            description: Audio file deleted successfully.
            content:
                application/json:
                    example:
                        {"message": "Audio file <filename> deleted from experiment <experimentId>"}
        404:
            description: Experiment or audio file does not exist.
            content:
                application/json:
                    example:
                        {"message": "Experiment <experimentId> does not exist"}
                        {"message": "Audio file <filename> does not exist in experiment <experimentId>"}
    """
    exp_obj = Experiment.get(experimentId)
    experiment_dir = exp_obj.get_dir()
    audio_dir = storage.join(experiment_dir, "audio")

    # Delete the metadata file (.json)
    id = secure_filename(id)
    metadata_path = storage.join(audio_dir, id + ".json")
    if not storage.exists(metadata_path):
        return {"message": f"Audio file {id} does not exist in experiment {experimentId}"}
    storage.rm(metadata_path)

    # Delete the audio file (.wav)
    audio_path = storage.join(audio_dir, id + ".wav")
    if storage.exists(audio_path):
        storage.rm(audio_path)

    return {"message": f"Audio file {id} deleted from experiment {experimentId}"}


@audio_router.get("/list_transcription")
async def list_transcription(experimentId: str):
    # Get experiment object and directory
    exp_obj = Experiment.get(experimentId)
    experiment_dir = exp_obj.get_dir()
    transcription_dir = storage.join(experiment_dir, "transcriptions")
    storage.makedirs(transcription_dir, exist_ok=True)

    # List all .json files in the transcription directory
    transcription_files_metadata = []
    try:
        entries = storage.ls(transcription_dir, detail=True)
        for entry in entries:
            # Handle both dict (detail=True) and string (detail=False) formats
            if isinstance(entry, dict):
                file_path = entry.get("name") or entry.get("path") or ""
                filename = file_path.rstrip("/").split("/")[-1] if "/" in file_path else file_path
                file_type = entry.get("type", "file")
                if file_type == "file" and filename.endswith(".json"):
                    # Use the full path from entry if available, otherwise construct it
                    if not file_path or file_path == filename:
                        file_path = storage.join(transcription_dir, filename)
                    with storage.open(file_path, "r") as f:
                        try:
                            data = json.load(f)
                            # Add the file modification time for sorting
                            data["id"] = filename[:-5]  # Remove .json from the filename
                            # Extract mtime from file metadata, fallback to 0 if not available
                            mtime = entry.get("mtime")
                            data["file_date"] = mtime if mtime is not None else 0
                            transcription_files_metadata.append(data)
                        except Exception:
                            continue
            else:
                # Fallback for string format
                filename = entry.rstrip("/").split("/")[-1] if "/" in entry else entry
                if filename.endswith(".json"):
                    file_path = storage.join(transcription_dir, filename)
                    with storage.open(file_path, "r") as f:
                        try:
                            data = json.load(f)
                            data["id"] = filename[:-5]  # Remove .json from the filename
                            # fsspec doesn't always provide mtime, use 0 as fallback
                            data["file_date"] = 0
                            transcription_files_metadata.append(data)
                        except Exception:
                            continue
    except Exception:
        pass
    transcription_files_metadata.sort(key=lambda x: x["file_date"], reverse=True)
    return transcription_files_metadata


@audio_router.get("/download_transcription")
async def download_transcription(experimentId: str, filename: str):
    exp_obj = Experiment.get(experimentId)
    experiment_dir = exp_obj.get_dir()
    text_dir = storage.join(experiment_dir, "transcriptions")
    filename = secure_filename(filename)
    file_path = storage.join(text_dir, filename)
    if not storage.exists(file_path):
        return {"message": f"Text file {filename} does not exist in experiment {experimentId}"}
    return FileResponse(path=file_path, filename=filename, media_type="text/plain")


@audio_router.delete("/delete_transcription")
async def delete_transcription(experimentId: str, id: str):
    exp_obj = Experiment.get(experimentId)
    experiment_dir = exp_obj.get_dir()
    text_dir = storage.join(experiment_dir, "transcriptions")
    id = secure_filename(id)
    text_path = storage.join(text_dir, id + ".json")
    if not storage.exists(text_path):
        return {"message": f"Text file {id} does not exist in experiment {experimentId}"}
    storage.rm(text_path)
    return {"message": f"Text file {id} deleted from experiment {experimentId}"}
