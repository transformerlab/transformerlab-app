import asyncio
import importlib.util
import json
import os
import shutil
import struct
import sys
import time
from typing import Any, Optional

import transformerlab.db.db as db
from transformerlab.schemas.vram import VramEstimateData, VramEstimateResponse
from huggingface_hub import HfFileSystem, list_repo_files, list_repo_tree
from huggingface_hub.utils import GatedRepoError, RepositoryNotFoundError, HfHubHTTPError

_ALLOWED_DTYPES = {"float16", "int8", "int4", "fp32"}
_DEFAULT_TIMEOUT_SECONDS = 120
_CACHE_TTL_SECONDS = 600
_CACHE: dict[tuple[str, str, int, int, bool, Optional[str]], tuple[float, VramEstimateData]] = {}

_GGUF_MAGIC = b"GGUF"
_GGUF_MAX_KV_BYTES = 16 * 1024 * 1024
_GGUF_MAX_STRING_BYTES = 2 * 1024 * 1024

_GGUF_VALUE_TYPE_UINT8 = 0
_GGUF_VALUE_TYPE_INT8 = 1
_GGUF_VALUE_TYPE_UINT16 = 2
_GGUF_VALUE_TYPE_INT16 = 3
_GGUF_VALUE_TYPE_UINT32 = 4
_GGUF_VALUE_TYPE_INT32 = 5
_GGUF_VALUE_TYPE_FLOAT32 = 6
_GGUF_VALUE_TYPE_BOOL = 7
_GGUF_VALUE_TYPE_STRING = 8
_GGUF_VALUE_TYPE_ARRAY = 9
_GGUF_VALUE_TYPE_UINT64 = 10
_GGUF_VALUE_TYPE_INT64 = 11
_GGUF_VALUE_TYPE_FLOAT64 = 12

_GGUF_FIXED_SIZES = {
    _GGUF_VALUE_TYPE_UINT8: 1,
    _GGUF_VALUE_TYPE_INT8: 1,
    _GGUF_VALUE_TYPE_UINT16: 2,
    _GGUF_VALUE_TYPE_INT16: 2,
    _GGUF_VALUE_TYPE_UINT32: 4,
    _GGUF_VALUE_TYPE_INT32: 4,
    _GGUF_VALUE_TYPE_FLOAT32: 4,
    _GGUF_VALUE_TYPE_BOOL: 1,
    _GGUF_VALUE_TYPE_UINT64: 8,
    _GGUF_VALUE_TYPE_INT64: 8,
    _GGUF_VALUE_TYPE_FLOAT64: 8,
}


def _normalize_dtype(dtype: str) -> str:
    cleaned = dtype.strip().lower()
    if cleaned in {"fp16", "float16"}:
        return "float16"
    if cleaned in {"fp32", "float32"}:
        return "fp32"
    return cleaned


def _cache_get(key: tuple[str, str, int, int, bool, Optional[str]]) -> Optional[VramEstimateData]:
    cached = _CACHE.get(key)
    if not cached:
        return None
    timestamp, data = cached
    if (time.time() - timestamp) > _CACHE_TTL_SECONDS:
        _CACHE.pop(key, None)
        return None
    return data


def _cache_set(key: tuple[str, str, int, int, bool, Optional[str]], data: VramEstimateData) -> None:
    _CACHE[key] = (time.time(), data)


def _dtype_bytes(dtype: str) -> float:
    if dtype == "float16":
        return 2.0
    if dtype == "fp32":
        return 4.0
    if dtype == "int8":
        return 1.0
    if dtype == "int4":
        return 0.5
    return 2.0


class _GgufReader:
    def __init__(self, file_obj, max_bytes: int = _GGUF_MAX_KV_BYTES) -> None:
        self._file = file_obj
        self._bytes_read = 0
        self._max_bytes = max_bytes

    def _read_exact(self, size: int) -> bytes:
        if size < 0:
            raise ValueError("Invalid read size")
        if self._bytes_read + size > self._max_bytes:
            raise ValueError("GGUF metadata exceeds maximum size")
        data = self._file.read(size)
        if len(data) != size:
            raise ValueError("Unexpected end of GGUF header")
        self._bytes_read += size
        return data

    def read_u8(self) -> int:
        return struct.unpack("<B", self._read_exact(1))[0]

    def read_i8(self) -> int:
        return struct.unpack("<b", self._read_exact(1))[0]

    def read_u16(self) -> int:
        return struct.unpack("<H", self._read_exact(2))[0]

    def read_i16(self) -> int:
        return struct.unpack("<h", self._read_exact(2))[0]

    def read_u32(self) -> int:
        return struct.unpack("<I", self._read_exact(4))[0]

    def read_i32(self) -> int:
        return struct.unpack("<i", self._read_exact(4))[0]

    def read_u64(self) -> int:
        return struct.unpack("<Q", self._read_exact(8))[0]

    def read_i64(self) -> int:
        return struct.unpack("<q", self._read_exact(8))[0]

    def read_f32(self) -> float:
        return struct.unpack("<f", self._read_exact(4))[0]

    def read_f64(self) -> float:
        return struct.unpack("<d", self._read_exact(8))[0]

    def read_string(self) -> str:
        length = self.read_u64()
        if length > _GGUF_MAX_STRING_BYTES:
            raise ValueError("GGUF string value is too large")
        raw = self._read_exact(length)
        return raw.decode("utf-8", errors="replace")


def _read_gguf_value(reader: _GgufReader, value_type: int) -> Any:
    if value_type == _GGUF_VALUE_TYPE_UINT8:
        return reader.read_u8()
    if value_type == _GGUF_VALUE_TYPE_INT8:
        return reader.read_i8()
    if value_type == _GGUF_VALUE_TYPE_UINT16:
        return reader.read_u16()
    if value_type == _GGUF_VALUE_TYPE_INT16:
        return reader.read_i16()
    if value_type == _GGUF_VALUE_TYPE_UINT32:
        return reader.read_u32()
    if value_type == _GGUF_VALUE_TYPE_INT32:
        return reader.read_i32()
    if value_type == _GGUF_VALUE_TYPE_UINT64:
        return reader.read_u64()
    if value_type == _GGUF_VALUE_TYPE_INT64:
        return reader.read_i64()
    if value_type == _GGUF_VALUE_TYPE_FLOAT32:
        return reader.read_f32()
    if value_type == _GGUF_VALUE_TYPE_FLOAT64:
        return reader.read_f64()
    if value_type == _GGUF_VALUE_TYPE_BOOL:
        return bool(reader.read_u8())
    if value_type == _GGUF_VALUE_TYPE_STRING:
        return reader.read_string()
    if value_type == _GGUF_VALUE_TYPE_ARRAY:
        element_type = reader.read_u32()
        length = reader.read_u64()
        values = []
        for _ in range(length):
            values.append(_read_gguf_value(reader, element_type))
        return values
    raise ValueError(f"Unsupported GGUF value type: {value_type}")


def _skip_gguf_value(reader: _GgufReader, value_type: int) -> None:
    if value_type in _GGUF_FIXED_SIZES:
        reader._read_exact(_GGUF_FIXED_SIZES[value_type])
        return
    if value_type == _GGUF_VALUE_TYPE_STRING:
        length = reader.read_u64()
        if length > _GGUF_MAX_STRING_BYTES:
            raise ValueError("GGUF string value is too large")
        reader._read_exact(length)
        return
    if value_type == _GGUF_VALUE_TYPE_ARRAY:
        element_type = reader.read_u32()
        length = reader.read_u64()
        for _ in range(length):
            _skip_gguf_value(reader, element_type)
        return
    raise ValueError(f"Unsupported GGUF value type: {value_type}")


def _read_gguf_metadata(file_obj) -> dict[str, Any]:
    reader = _GgufReader(file_obj)
    magic = reader._read_exact(4)
    if magic != _GGUF_MAGIC:
        raise ValueError("Invalid GGUF magic header")
    _ = reader.read_u32()  # version
    _ = reader.read_u64()  # tensor_count
    kv_count = reader.read_u64()

    key_map = {
        "llama.block_count": "n_layer",
        "llama.context_length": "n_ctx",
        "llama.embedding_length": "n_embd",
        "llama.attention.head_count": "n_head",
        "llama.attention.head_count_kv": "n_head_kv",
        "n_layer": "n_layer",
        "n_ctx": "n_ctx",
        "n_embd": "n_embd",
        "n_head": "n_head",
        "n_head_kv": "n_head_kv",
    }

    metadata: dict[str, Any] = {}
    for idx in range(kv_count):
        key = reader.read_string()
        value_type = reader.read_u32()
        mapped_key = key_map.get(key)
        if mapped_key:
            try:
                value = _read_gguf_value(reader, value_type)
            except Exception:
                _skip_gguf_value(reader, value_type)
                continue
            if isinstance(value, (int, float)):
                metadata[mapped_key] = int(value)
            else:
                metadata[mapped_key] = value
        else:
            _skip_gguf_value(reader, value_type)

        if all(k in metadata for k in ("n_layer", "n_embd", "n_head")) and ("n_head_kv" in metadata or idx >= 64):
            break

    return metadata


def _resolve_gguf_repo_and_file(model_id: str, filename: Optional[str]) -> tuple[str, Optional[str]]:
    if filename:
        return model_id, filename
    if model_id.lower().endswith(".gguf") and model_id.count("/") >= 2:
        parts = model_id.split("/")
        repo_id = "/".join(parts[:2])
        file_path = "/".join(parts[2:])
        return repo_id, file_path
    return model_id, None


def _select_gguf_filename(
    repo_id: str, filename: Optional[str], token: Optional[str]
) -> tuple[Optional[str], Optional[str]]:
    if filename:
        return filename, None
    try:
        repo_files = list_repo_files(repo_id, token=token)
    except Exception as e:
        return None, str(e)
    gguf_files = [f for f in repo_files if f.lower().endswith(".gguf")]
    if len(gguf_files) == 1:
        return gguf_files[0], None
    if len(gguf_files) == 0:
        return None, "No GGUF files found in this repository."
    return None, "Multiple GGUF files found. Please specify which file to use."


def _get_gguf_file_size(repo_id: str, filename: str, token: Optional[str]) -> Optional[int]:
    try:
        fs = HfFileSystem(token=token)
        info = fs.info(f"{repo_id}/{filename}")
        size = info.get("size")
        if isinstance(size, int):
            return size
    except Exception:
        pass

    try:
        for entry in list_repo_tree(repo_id, recursive=True, token=token):
            if getattr(entry, "path", None) == filename:
                return getattr(entry, "size", None)
    except Exception:
        pass
    return None


def _estimate_gguf_vram_sync(
    model_id: str,
    filename: Optional[str],
    dtype: str,
    batch: int,
    seq_len: int,
    no_kv: bool,
    hf_token: Optional[str],
) -> tuple[Optional[VramEstimateData], Optional[str], Optional[str]]:
    repo_id, inferred_filename = _resolve_gguf_repo_and_file(model_id, filename)
    selected_filename, error = _select_gguf_filename(repo_id, inferred_filename, hf_token)
    if error:
        status = "unauthorized" if _looks_like_auth_error(error) else "unsupported"
        return None, error, status
    if not selected_filename:
        return None, "Unable to resolve GGUF filename.", "unsupported"

    try:
        fs = HfFileSystem(token=hf_token)
        with fs.open(f"{repo_id}/{selected_filename}", "rb") as handle:
            metadata = _read_gguf_metadata(handle)
    except (GatedRepoError, RepositoryNotFoundError) as e:
        return None, str(e), "unauthorized"
    except HfHubHTTPError as e:
        status = "unauthorized" if _looks_like_auth_error(str(e)) else "error"
        return None, str(e), status
    except Exception as e:
        return None, f"Failed to read GGUF metadata: {e}", "error"

    n_layer = metadata.get("n_layer")
    n_embd = metadata.get("n_embd")
    n_head = metadata.get("n_head")
    n_head_kv = metadata.get("n_head_kv") or n_head

    if not all(isinstance(v, int) and v > 0 for v in (n_layer, n_embd, n_head, n_head_kv)):
        return None, "GGUF metadata missing required fields for VRAM estimation.", "unsupported"

    if n_head <= 0:
        return None, "Invalid GGUF metadata for attention head count.", "unsupported"

    head_dim = n_embd / n_head
    bytes_per_element = _dtype_bytes(dtype)
    kv_cache_bytes = 0.0
    if not no_kv:
        kv_cache_bytes = (
            2.0
            * float(n_layer)
            * float(n_head_kv)
            * float(head_dim)
            * float(seq_len)
            * float(batch)
            * bytes_per_element
        )

    file_size_bytes = _get_gguf_file_size(repo_id, selected_filename, hf_token)
    if file_size_bytes is None:
        return None, "Unable to determine GGUF file size for VRAM estimation.", "error"

    weights_gb = file_size_bytes / (1024**3)
    kv_cache_gb = kv_cache_bytes / (1024**3)
    total_gb = weights_gb + kv_cache_gb

    data = VramEstimateData(
        model_id=model_id,
        dtype=dtype,
        batch=batch,
        seq_len=seq_len,
        no_kv=no_kv,
        total_gb=total_gb,
        weights_gb=weights_gb,
        kv_cache_gb=kv_cache_gb if not no_kv else 0.0,
        activations_gb=None,
        raw={
            "source": "gguf_header",
            "gguf_filename": selected_filename,
            "gguf_repo": repo_id,
            "gguf_metadata": metadata,
            "gguf_file_bytes": file_size_bytes,
        },
    )

    return data, None, None


def _build_command(
    base_command: list[str],
    model_id: str,
    dtype: str,
    batch: int,
    seq_len: int,
    no_kv: bool,
) -> list[str]:
    cmd = [
        *base_command,
        model_id,
        "--json",
        "--dtype",
        dtype,
        "--batch",
        str(batch),
        "--seq-len",
        str(seq_len),
    ]
    if no_kv:
        cmd.append("--no-kv")
    return cmd


async def _run_command(command: list[str], env: dict[str, str]) -> tuple[int, str, str]:
    process = await asyncio.create_subprocess_exec(
        *command,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        env=env,
    )
    try:
        stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=_DEFAULT_TIMEOUT_SECONDS)
    except asyncio.TimeoutError:
        process.kill()
        await process.wait()
        return 124, "", "Timed out while estimating VRAM."

    return process.returncode, stdout.decode(errors="replace"), stderr.decode(errors="replace")


def _parse_json_output(output: str) -> Any:
    text = output.strip()
    if not text:
        raise ValueError("Empty output")
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start = min(
            (i for i in [text.find("{"), text.find("[")] if i != -1),
            default=-1,
        )
        end = max(text.rfind("}"), text.rfind("]"))
        if start == -1 or end == -1 or end <= start:
            raise
        return json.loads(text[start : end + 1])


def _as_float(value: Any) -> Optional[float]:
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        cleaned = value.replace("GB", "").replace("GiB", "").strip()
        try:
            return float(cleaned)
        except ValueError:
            return None
    if isinstance(value, dict):
        for key in ("gb", "gib", "vram_gb", "total_gb", "total", "value"):
            if key in value:
                return _as_float(value[key])
    return None


def _extract_section_value(data: dict[str, Any], key: str) -> Optional[float]:
    if key not in data:
        return None
    section = data[key]
    value = _as_float(section)
    if value is not None:
        return value
    if isinstance(section, dict):
        for section_value in section.values():
            value = _as_float(section_value)
            if value is not None:
                return value
    return None


def _extract_summary(raw: Any) -> dict[str, Optional[float]]:
    if not isinstance(raw, dict):
        return {
            "total_gb": None,
            "weights_gb": None,
            "kv_cache_gb": None,
            "activations_gb": None,
        }

    weights_gb = _extract_section_value(raw, "weights")
    kv_cache_gb = _extract_section_value(raw, "kv_cache")
    activations_gb = _extract_section_value(raw, "activations")

    memory_breakdown = raw.get("memory_breakdown_gb")
    if isinstance(memory_breakdown, dict):
        if weights_gb is None:
            weights_gb = _as_float(memory_breakdown.get("weights"))
        if kv_cache_gb is None:
            kv_cache_gb = _as_float(memory_breakdown.get("kv_cache"))
        if activations_gb is None:
            activations_gb = _as_float(memory_breakdown.get("activations"))

    if weights_gb is None and "weights_gb" in raw:
        weights_gb = _as_float(raw.get("weights_gb"))
    if kv_cache_gb is None and "kv_cache_gb" in raw:
        kv_cache_gb = _as_float(raw.get("kv_cache_gb"))
    if activations_gb is None and "activations_gb" in raw:
        activations_gb = _as_float(raw.get("activations_gb"))

    total_gb = None
    for key in (
        "total_vram_gb",
        "total_gb",
        "total",
        "vram_gb",
        "total_vram",
        "total_gib",
    ):
        if key in raw:
            total_gb = _as_float(raw[key])
            if total_gb is not None:
                break

    if total_gb is None and isinstance(memory_breakdown, dict):
        total_gb = _as_float(memory_breakdown.get("total"))

    if total_gb is None and any(value is not None for value in (weights_gb, kv_cache_gb, activations_gb)):
        total_gb = sum(value or 0 for value in (weights_gb, kv_cache_gb, activations_gb))

    return {
        "total_gb": total_gb,
        "weights_gb": weights_gb,
        "kv_cache_gb": kv_cache_gb,
        "activations_gb": activations_gb,
    }


def _looks_like_auth_error(message: Optional[str]) -> bool:
    if not message:
        return False
    lowered = message.lower()
    return any(
        token in lowered
        for token in (
            "unauthorized",
            "forbidden",
            "401",
            "gated",
            "access token",
            "hf_token",
            "huggingface token",
        )
    )


def _looks_like_missing_config_error(message: Optional[str]) -> bool:
    if not message:
        return False
    lowered = message.lower()
    if "error fetching config" in lowered:
        return True
    if "entrynotfounderror" in lowered:
        return True
    if "config.json" in lowered or "model_index.json" in lowered:
        return any(token in lowered for token in ("not found", "404", "missing"))
    return False


async def _resolve_hf_token(user_id: Optional[str], team_id: Optional[str]) -> Optional[str]:
    try:
        return await db.config_get("HuggingfaceUserAccessToken", user_id=user_id, team_id=team_id)
    except Exception:
        return None


async def estimate_vram(
    model_id: str,
    dtype: str,
    batch: int,
    seq_len: int,
    no_kv: bool,
    filename: Optional[str],
    user_id: Optional[str],
    team_id: Optional[str],
) -> VramEstimateResponse:
    if not model_id:
        return VramEstimateResponse(status="error", message="model_id is required")

    normalized_dtype = _normalize_dtype(dtype)
    if normalized_dtype not in _ALLOWED_DTYPES:
        return VramEstimateResponse(
            status="error",
            message=f"dtype must be one of {', '.join(sorted(_ALLOWED_DTYPES))}",
        )
    if batch <= 0:
        return VramEstimateResponse(status="error", message="batch must be >= 1")
    if seq_len <= 0:
        return VramEstimateResponse(status="error", message="seq_len must be >= 1")

    cache_key = (model_id, normalized_dtype, batch, seq_len, no_kv, filename)
    cached = _cache_get(cache_key)
    if cached:
        return VramEstimateResponse(status="success", data=cached)

    module_spec = importlib.util.find_spec("do_i_have_the_vram")
    base_commands: list[list[str]] = []
    if module_spec is not None:
        base_commands.append([sys.executable, "-m", "do_i_have_the_vram"])
    cli_path = shutil.which("do-i-have-the-vram")
    if cli_path:
        base_commands.append([cli_path])

    if not base_commands:
        return VramEstimateResponse(
            status="error",
            message=("do-i-have-the-vram is not installed. Install it with pip before using this endpoint."),
        )

    hf_token = await _resolve_hf_token(user_id=user_id, team_id=team_id)
    env = os.environ.copy()
    if hf_token:
        env["HF_TOKEN"] = hf_token
        env["HUGGINGFACE_HUB_TOKEN"] = hf_token

    last_error: Optional[str] = None

    if filename or (model_id.lower().endswith(".gguf") and model_id.count("/") >= 2):
        data, error_msg, error_status = await asyncio.to_thread(
            _estimate_gguf_vram_sync,
            model_id,
            filename,
            normalized_dtype,
            batch,
            seq_len,
            no_kv,
            hf_token,
        )
        if data:
            _cache_set(cache_key, data)
            return VramEstimateResponse(status="success", data=data)
        if error_status == "unauthorized":
            return VramEstimateResponse(status="unauthorized", message=error_msg)
        if error_status == "unsupported":
            return VramEstimateResponse(status="unsupported", message=error_msg)
        last_error = error_msg
    for base_command in base_commands:
        command = _build_command(base_command, model_id, normalized_dtype, batch, seq_len, no_kv)
        returncode, stdout, stderr = await _run_command(command, env)
        if returncode == 0:
            try:
                raw = _parse_json_output(stdout)
            except Exception as e:
                if stderr.strip():
                    try:
                        raw = _parse_json_output(stderr)
                    except Exception:
                        last_error = f"Failed to parse output: {e}"
                        continue
                else:
                    last_error = f"Failed to parse output: {e}"
                    continue
            summary = _extract_summary(raw)
            data = VramEstimateData(
                model_id=model_id,
                dtype=normalized_dtype,
                batch=batch,
                seq_len=seq_len,
                no_kv=no_kv,
                total_gb=summary["total_gb"],
                weights_gb=summary["weights_gb"],
                kv_cache_gb=summary["kv_cache_gb"],
                activations_gb=summary["activations_gb"],
                raw=raw,
            )
            _cache_set(cache_key, data)
            return VramEstimateResponse(status="success", data=data)

        last_error = stderr.strip() or stdout.strip() or f"Command failed with exit code {returncode}"

    if _looks_like_auth_error(last_error):
        return VramEstimateResponse(status="unauthorized", message=last_error)

    if _looks_like_missing_config_error(last_error):
        data, error_msg, error_status = await asyncio.to_thread(
            _estimate_gguf_vram_sync,
            model_id,
            filename,
            normalized_dtype,
            batch,
            seq_len,
            no_kv,
            hf_token,
        )
        if data:
            _cache_set(cache_key, data)
            return VramEstimateResponse(status="success", data=data)
        if error_status == "unauthorized":
            return VramEstimateResponse(status="unauthorized", message=error_msg)
        if error_status == "unsupported":
            return VramEstimateResponse(status="unsupported", message=error_msg)
        last_error = error_msg or last_error

    return VramEstimateResponse(status="error", message=last_error or "Failed to estimate VRAM")
