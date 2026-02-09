import asyncio
import importlib.util
import json
import os
import shutil
import sys
import time
from typing import Any, Optional

import transformerlab.db.db as db
from transformerlab.schemas.vram import VramEstimateData, VramEstimateResponse

_ALLOWED_DTYPES = {"float16", "int8", "int4", "fp32"}
_DEFAULT_TIMEOUT_SECONDS = 120
_CACHE_TTL_SECONDS = 600
_CACHE: dict[tuple[str, str, int, int, bool], tuple[float, VramEstimateData]] = {}


def _normalize_dtype(dtype: str) -> str:
    cleaned = dtype.strip().lower()
    if cleaned in {"fp16", "float16"}:
        return "float16"
    if cleaned in {"fp32", "float32"}:
        return "fp32"
    return cleaned


def _cache_get(key: tuple[str, str, int, int, bool]) -> Optional[VramEstimateData]:
    cached = _CACHE.get(key)
    if not cached:
        return None
    timestamp, data = cached
    if (time.time() - timestamp) > _CACHE_TTL_SECONDS:
        _CACHE.pop(key, None)
        return None
    return data


def _cache_set(key: tuple[str, str, int, int, bool], data: VramEstimateData) -> None:
    _CACHE[key] = (time.time(), data)


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

    cache_key = (model_id, normalized_dtype, batch, seq_len, no_kv)
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

    return VramEstimateResponse(status="error", message=last_error or "Failed to estimate VRAM")
