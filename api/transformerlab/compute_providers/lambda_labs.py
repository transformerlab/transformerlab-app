"""Lambda Cloud provider implementation.

Lambda Cloud exposes a REST API at https://cloud.lambdalabs.com/api/v1/ that lets
us launch, list, and terminate on-demand GPU instances. Authentication uses an
API key sent via HTTP Basic Auth (api_key as username, blank password). There is
no native job-queue concept, so cluster operations correspond to instances, and
the job-level methods (submit/list/cancel) are not implemented (mirrors RunPod).
"""

from __future__ import annotations

import asyncio
import io
import logging
import shlex
from typing import Any, Dict, List, Optional, Union

import requests

from transformerlab.shared.ssh_policy import get_add_if_verified_policy

from .base import ComputeProvider
from .models import (
    ClusterConfig,
    ClusterState,
    ClusterStatus,
    JobConfig,
    JobInfo,
    ResourceInfo,
)


logger = logging.getLogger(__name__)


# Path on the instance where the user_data script tees combined setup/run output.
LAMBDA_RUN_LOG_PATH = "/var/log/transformerlab-run.log"

# Lambda's default Ubuntu image logs in as this user.
LAMBDA_SSH_USER = "ubuntu"

# Seconds to keep a *failed* instance alive before self-terminating, so the run
# can be inspected over SSH / the log poller can read it. Overridable per-launch
# via the TFL_LAMBDA_FAILURE_GRACE_SECONDS env var. Successful runs terminate
# immediately. Default 10 minutes.
LAMBDA_FAILURE_GRACE_SECONDS = 600

# Python uploader embedded in user_data. On a failed run it copies the full
# captured output (setup + run) to provider_logs.txt in the job's shared-storage
# directory, so setup-phase crashes are visible even after the box is gone.
# Uses the same SDK storage abstraction / env vars as tfl-remote-trap. Kept brace
# free so it can be embedded in an f-string heredoc without escaping. {log_path}
# is filled in by str.format.
_PUSH_LOGS_PY = """import os, asyncio
from lab import storage
from lab.dirs import get_job_dir


async def _main():
    jid = os.environ.get("_TFL_JOB_ID")
    eid = os.environ.get("_TFL_EXPERIMENT_ID") or os.environ.get("TFL_EXPERIMENT_ID")
    if not jid or not eid:
        return
    job_dir = await get_job_dir(jid, eid)
    dst = storage.join(job_dir, "provider_logs.txt")
    try:
        with open("{log_path}", "r", errors="replace") as fh:
            data = fh.read()
    except Exception:
        data = ""
    async with await storage.open(dst, "w", encoding="utf-8") as out:
        await out.write(data)


asyncio.run(_main())
"""


def _ssh_read_file(host: str, key_bytes: bytes, remote_path: str, tail_lines: int = 500) -> str:
    """SSH to host and tail a file. Returns string content or an error message.

    Mirrors aws._ssh_read_file: tries Ed25519 then RSA so it works with whatever
    key format the org keypair uses.
    """
    import paramiko

    pkey = None
    key_file = io.StringIO(key_bytes.decode("utf-8"))
    for key_class in (paramiko.Ed25519Key, paramiko.RSAKey):
        try:
            pkey = key_class.from_private_key(key_file)
            break
        except Exception:
            key_file.seek(0)

    if pkey is None:
        return "Failed to load SSH key."

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(get_add_if_verified_policy())
    try:
        ssh.connect(hostname=host, port=22, username=LAMBDA_SSH_USER, pkey=pkey, timeout=15, banner_timeout=15)
        cmd = f"tail -n {tail_lines} {remote_path} 2>/dev/null || echo 'No log file yet.'"
        _, stdout, _ = ssh.exec_command(cmd, timeout=10)
        return stdout.read().decode("utf-8", errors="replace").strip() or "No output yet."
    except Exception as e:
        return f"SSH failed: {e}"
    finally:
        ssh.close()


# Lambda Cloud instance state -> ClusterState
_LAMBDA_STATE_TO_CLUSTER_STATE = {
    "active": ClusterState.UP,
    "booting": ClusterState.INIT,
    "unhealthy": ClusterState.FAILED,
    "terminating": ClusterState.STOPPED,
    "terminated": ClusterState.DOWN,
}


# (GPU_TYPE, COUNT) -> Lambda instance_type_name. Mirrors aws._GPU_INSTANCE_MAP.
# Keep keys upper-cased so callers can pass e.g. "A100:8" or "H100:8".
_GPU_INSTANCE_TYPE_MAP: Dict[tuple, str] = {
    ("A10", 1): "gpu_1x_a10",
    ("A100", 1): "gpu_1x_a100",
    ("A100", 8): "gpu_8x_a100",
    ("A100-SXM4", 1): "gpu_1x_a100_sxm4",
    ("A100-80GB", 8): "gpu_8x_a100_80gb_sxm4",
    ("A6000", 1): "gpu_1x_a6000",
    ("A6000", 2): "gpu_2x_a6000",
    ("A6000", 4): "gpu_4x_a6000",
    ("H100", 1): "gpu_1x_h100_pcie",
    ("H100-SXM5", 1): "gpu_1x_h100_sxm5",
    ("H100", 8): "gpu_8x_h100_sxm5",
    ("H100-SXM5", 8): "gpu_8x_h100_sxm5",
    ("H200", 8): "gpu_8x_h200",
    ("B200", 8): "gpu_8x_b200",
    ("V100", 8): "gpu_8x_v100",
    ("RTX6000", 1): "gpu_1x_rtx6000",
    ("GH200", 1): "gpu_1x_gh200",
}


class LambdaProvider(ComputeProvider):
    """Provider implementation for Lambda Cloud Cloud."""

    def __init__(
        self,
        api_key: str,
        api_base_url: Optional[str] = None,
        default_region: Optional[str] = None,
        default_instance_type: Optional[str] = None,
        default_file_system_names: Optional[List[str]] = None,
        team_id: Optional[str] = None,
        extra_config: Optional[Dict[str, Any]] = None,
    ):
        """
        Args:
            api_key: Lambda Cloud API key (required).
            api_base_url: Override the API base URL (defaults to
                https://cloud.lambdalabs.com/api/v1).
            default_region: Default region (e.g. "us-east-1") used when a launch
                request doesn't specify one.
            default_instance_type: Default Lambda instance type name
                (e.g. "gpu_1x_a10"), used when a launch doesn't pass accelerators.
            default_file_system_names: Persistent storage filesystem names to
                attach by default.
            team_id: Team whose org SSH key is registered with Lambda and used
                to read run logs. Required for log retrieval.
            extra_config: Free-form passthrough.
        """
        if not api_key:
            raise ValueError("Lambda Cloud provider requires an api_key")

        self.api_key = api_key
        self.api_base_url = (api_base_url or "https://cloud.lambda.ai/api/v1").rstrip("/")
        self.default_region = default_region
        self.default_instance_type = default_instance_type
        self.default_file_system_names = list(default_file_system_names or [])
        self.team_id = team_id
        self.extra_config = extra_config or {}

        # Cache cluster_name -> instance_id so we can avoid scanning every call.
        self._cluster_name_to_instance_id: Dict[str, str] = {}

    # ---------------------------------------------------------------- helpers

    def _make_request(
        self,
        method: str,
        endpoint: str,
        json_data: Optional[Dict[str, Any]] = None,
        timeout: int = 30,
    ) -> requests.Response:
        """Make an authenticated request against the Lambda Cloud API."""
        url = f"{self.api_base_url}{endpoint}"
        response = requests.request(
            method=method,
            url=url,
            json=json_data,
            auth=(self.api_key, ""),  # Lambda uses HTTP Basic with API key as user
            headers={"Content-Type": "application/json"},
            timeout=timeout,
        )
        response.raise_for_status()
        return response

    @staticmethod
    def _unwrap(payload: Any) -> Any:
        """Lambda API wraps successful responses in a `data` key; unwrap it."""
        if isinstance(payload, dict) and "data" in payload:
            return payload["data"]
        return payload

    def _find_instance_by_name(self, cluster_name: str) -> Optional[Dict[str, Any]]:
        """Locate a Lambda instance by its `name` field."""
        cached_id = self._cluster_name_to_instance_id.get(cluster_name)
        if cached_id:
            try:
                response = self._make_request("GET", f"/instances/{cached_id}")
                return self._unwrap(response.json())
            except requests.exceptions.HTTPError:
                self._cluster_name_to_instance_id.pop(cluster_name, None)

        try:
            response = self._make_request("GET", "/instances")
            instances = self._unwrap(response.json()) or []
            if isinstance(instances, list):
                for inst in instances:
                    if inst.get("name") == cluster_name:
                        inst_id = inst.get("id")
                        if inst_id:
                            self._cluster_name_to_instance_id[cluster_name] = inst_id
                        return inst
        except Exception as exc:  # pragma: no cover - network failures
            logger.warning("Failed to list Lambda instances: %s", exc)
        return None

    @staticmethod
    def _map_state(lambda_status: str) -> ClusterState:
        return _LAMBDA_STATE_TO_CLUSTER_STATE.get((lambda_status or "").lower(), ClusterState.UNKNOWN)

    def _resolve_instance_type(self, accelerators: Optional[str]) -> str:
        """Translate an accelerator spec like 'A100:8' into a Lambda instance type.

        Raises ValueError for unrecognized GPU types or counts.
        """
        if not accelerators:
            if not self.default_instance_type:
                raise ValueError(
                    "Lambda provider requires an instance type. Specify accelerators "
                    "(e.g. 'A100:1') or configure default_instance_type."
                )
            # The default comes from the generic `default_gpu_type` provider config
            # field, which holds a GPU type like "A100" rather than a Lambda
            # instance type. Accept a native instance type ("gpu_1x_a10") as-is
            # and resolve anything else through the accelerator map below.
            if self.default_instance_type.lower().startswith("gpu_"):
                return self.default_instance_type
            accelerators = self.default_instance_type

        parts = accelerators.strip().split(":")
        accel_type = parts[0].strip().upper()
        try:
            count = int(parts[1].strip()) if len(parts) > 1 else 1
        except (TypeError, ValueError) as exc:
            raise ValueError(f"Invalid accelerator count in '{accelerators}'") from exc

        key = (accel_type, count)
        if key not in _GPU_INSTANCE_TYPE_MAP:
            valid = sorted(f"{t}:{c}" for t, c in _GPU_INSTANCE_TYPE_MAP)
            raise ValueError(f"Unsupported accelerator spec '{accelerators}'. Valid options: {', '.join(valid)}")
        return _GPU_INSTANCE_TYPE_MAP[key]

    def _build_user_data(self, cluster_name: str, config: ClusterConfig) -> str:
        """Build a cloud-init bash script that runs setup/run and self-terminates on EXIT.

        Lambda has no per-instance metadata service, so the EXIT trap uses the
        account API key to resolve its own instance id by name and POST to
        /instance-operations/terminate. The key is embedded in user_data; treat
        this the same way Nebius treats its provisioned service-account creds.
        """
        if not (config.setup or config.run):
            return ""

        setup_block = config.setup or ""
        run_cmd = config.run or "true"
        api_base = shlex.quote(self.api_base_url)
        api_key_q = shlex.quote(self.api_key)
        name_q = shlex.quote(cluster_name)
        env_exports = ""
        if config.env_vars:
            lines = []
            for key, value in config.env_vars.items():
                if not key.replace("_", "").isalnum() or key[:1].isdigit():
                    raise ValueError(f"Invalid environment variable name: {key!r}")
                lines.append(f"export {key}={shlex.quote(str(value))}")
            env_exports = "\n".join(lines)

        push_logs_py = _PUSH_LOGS_PY.format(log_path=LAMBDA_RUN_LOG_PATH)
        grace = LAMBDA_FAILURE_GRACE_SECONDS

        return f"""#!/bin/bash
set -o pipefail

# Capture EVERYTHING (bootstrap + setup + run) to a local log from the very
# start, so setup-phase crashes are recorded even though tfl-remote-trap (which
# writes the durable provider_logs.txt) only runs in the run phase.
exec > >(tee {LAMBDA_RUN_LOG_PATH}) 2>&1

# Credentials are embedded so the EXIT trap can self-terminate via Lambda's API.
# Do not echo them (we never enable `set -x`).
set +x
_TFL_LAMBDA_API_BASE={api_base}
_TFL_LAMBDA_API_KEY={api_key_q}
_TFL_LAMBDA_NAME={name_q}
_TFL_FAILURE_GRACE_SECONDS="${{TFL_LAMBDA_FAILURE_GRACE_SECONDS:-{grace}}}"
export _TFL_LAMBDA_NAME

# Export job/storage/user env early so the EXIT trap's log uploader can resolve
# the job directory and storage credentials even if user setup fails.
{env_exports}

# Uploader: on failure, push the full captured log to shared storage.
cat > /tmp/_tfl_push_logs.py <<'PYEOF'
{push_logs_py}
PYEOF

_tfl_terminate() {{
  # Resolve our own instance id by name, then terminate. Best-effort.
  local _iid
  _iid=$(curl -sf -u "$_TFL_LAMBDA_API_KEY:" "$_TFL_LAMBDA_API_BASE/instances" 2>/dev/null \
    | python3 -c 'import json,sys,os
try:
  d=json.load(sys.stdin).get("data",[])
  n=os.environ.get("_TFL_LAMBDA_NAME","")
  print(next((i["id"] for i in d if i.get("name")==n), ""))
except Exception:
  pass' 2>/dev/null || true)
  if [ -n "$_iid" ]; then
    curl -sf -u "$_TFL_LAMBDA_API_KEY:" -X POST \
      -H "Content-Type: application/json" \
      -d "{{\\"instance_ids\\":[\\"$_iid\\"]}}" \
      "$_TFL_LAMBDA_API_BASE/instance-operations/terminate" >/dev/null 2>&1 || true
  fi
  sync || true
  shutdown -h now || poweroff || true
}}

_tfl_on_exit() {{
  _ec=$?
  if [ "$_ec" -ne 0 ]; then
    # Persist the full log so the failure is visible after the box is gone,
    # then keep the instance alive briefly for live inspection over SSH.
    python3 /tmp/_tfl_push_logs.py || true
    echo "[transformerlab] Run failed (exit $_ec). Keeping instance up for $_TFL_FAILURE_GRACE_SECONDS s for inspection."
    sleep "$_TFL_FAILURE_GRACE_SECONDS" || true
  fi
  _tfl_terminate
  return 0
}}
trap _tfl_on_exit EXIT

# --- Runtime bootstrap (mirrors the AWS provider) -----------------------------
# A bare Lambda box may not have pip/uv wired up the way task setups expect, so
# provision an isolated Python + uv before running user setup. Without this the
# first setup command (e.g. `pip install transformerlab` or `uv pip ...`) fails
# instantly and the instance self-terminates with no logs.
set -e
apt-get update -qq || true
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq python3 python3-venv python3-pip >/dev/null 2>&1 || true
python3 -m venv /opt/transformerlab-venv || true
export PATH="/opt/transformerlab-venv/bin:$PATH"
curl -LsSf https://astral.sh/uv/install.sh | sh || true
export PATH="$HOME/.local/bin:/root/.local/bin:/home/ubuntu/.local/bin:$PATH"
if [ -x /root/.local/bin/uv ]; then cp /root/.local/bin/uv /usr/local/bin/uv && chmod +x /usr/local/bin/uv; fi
if [ -x /root/.local/bin/uvx ]; then cp /root/.local/bin/uvx /usr/local/bin/uvx && chmod +x /usr/local/bin/uvx; fi
# Install the SDK up front so the log uploader works even if *user* setup fails.
pip install -q transformerlab || true

# --- User setup + run ---------------------------------------------------------
{setup_block}
{run_cmd}
exit $?
"""

    # ------------------------------------------------------- ComputeProvider

    def _org_key_name(self) -> str:
        """Deterministic name for this team's org key as registered with Lambda."""
        return f"transformerlab-{self.team_id}"

    def _ensure_org_ssh_key(self) -> str:
        """Ensure the team's org public key is registered with Lambda, creating it if missing.

        Returns the Lambda SSH key name to inject at launch. The matching private
        key (held by the API server) is later used to read run logs over SSH.
        Mirrors aws._ensure_key_pair, but against Lambda's /ssh-keys endpoint.
        """
        from transformerlab.services.ssh_key_service import (
            get_or_create_org_ssh_key_pair,
            get_org_ssh_public_key,
        )

        async def _ensure_and_get_public_key() -> str:
            await get_or_create_org_ssh_key_pair(self.team_id)
            return await get_org_ssh_public_key(self.team_id)

        public_key = asyncio.run(_ensure_and_get_public_key()).strip()
        key_name = self._org_key_name()

        # If a key with this name already exists, reuse it. Lambda rejects
        # duplicate names, so we never re-create.
        existing = self._unwrap(self._make_request("GET", "/ssh-keys").json()) or []
        if any(k.get("name") == key_name for k in existing):
            return key_name

        self._make_request(
            "POST",
            "/ssh-keys",
            json_data={"name": key_name, "public_key": public_key},
        )
        return key_name

    def _regions_with_capacity(self, instance_type: str) -> Optional[List[str]]:
        """Return region names that currently have capacity for an instance type.

        Lambda's /instance-types response is keyed by instance type name and
        carries a `regions_with_capacity_available` list per type. Returns None
        when capacity can't be determined (the call failed or the type is
        unknown), and [] when the API affirmatively reports no capacity in any
        region — callers treat those differently.
        """
        try:
            types = self._unwrap(self._make_request("GET", "/instance-types").json()) or {}
        except Exception as exc:  # pragma: no cover - network failures
            logger.warning("Failed to query Lambda instance-types for capacity: %s", exc)
            return None
        entry = types.get(instance_type) if isinstance(types, dict) else None
        if not entry:
            return None
        regions = entry.get("regions_with_capacity_available") or []
        return [r.get("name") for r in regions if r.get("name")]

    def _file_system_region(self, file_system_names: List[str]) -> Optional[str]:
        """Return the region the named Lambda file systems live in, if known.

        Lambda file systems are bound to a single region and an instance can
        only attach file systems from its own region. Raises ValueError if the
        named file systems span multiple regions (no single region can satisfy
        the launch). Returns None when the region can't be determined (call
        failed or names not found) so the caller can fall back and let the
        launch surface any error.
        """
        try:
            fs_list = self._unwrap(self._make_request("GET", "/file-systems").json()) or []
        except Exception as exc:  # pragma: no cover - network failures
            logger.warning("Failed to query Lambda file systems: %s", exc)
            return None
        by_name = {fs.get("name"): (fs.get("region") or {}).get("name") for fs in fs_list if isinstance(fs, dict)}
        regions = {by_name[name] for name in file_system_names if by_name.get(name)}
        if len(regions) > 1:
            raise ValueError(
                f"Lambda file systems {file_system_names} live in different regions ({sorted(regions)}); "
                "an instance can only attach file systems from a single region."
            )
        return next(iter(regions), None)

    def launch_cluster(self, cluster_name: str, config: ClusterConfig) -> Dict[str, Any]:
        instance_type = config.provider_config.get("instance_type_name") or self._resolve_instance_type(
            config.accelerators
        )

        # Capacity on Lambda is per-region: an instance type can have capacity in
        # one region and none in another. Pick a region that actually has capacity
        # rather than blindly using the configured default (which yields a 400
        # "insufficient-capacity" even when the type is available elsewhere).
        requested_region = config.region or self.default_region
        available_regions = self._regions_with_capacity(instance_type)

        # File systems are region-bound on Lambda: if any are attached, the
        # instance must launch in the region they live in, so the capacity
        # fallback above must not move the launch away from it.
        file_system_names = config.provider_config.get("file_system_names") or self.default_file_system_names
        fs_region = self._file_system_region(file_system_names) if file_system_names else None

        if fs_region:
            if available_regions is not None and fs_region not in available_regions:
                raise ValueError(
                    f"Lambda instance type '{instance_type}' has no capacity in region '{fs_region}', "
                    f"where the configured file system(s) {file_system_names} live. "
                    "Try again later or launch without the file system(s)."
                )
            if requested_region and requested_region != fs_region:
                logger.info(
                    "Lambda file system(s) %s pin the launch region to %s (requested %s).",
                    file_system_names,
                    fs_region,
                    requested_region,
                )
            region = fs_region
        elif available_regions is None:
            # Couldn't determine capacity (e.g. instance-types call failed); fall
            # back to the requested region and let the launch surface any error.
            if not requested_region:
                raise ValueError(
                    f"Could not determine capacity for Lambda instance type '{instance_type}' and no "
                    "region was specified. Specify a region or configure default_region."
                )
            region = requested_region
        elif not available_regions:
            raise ValueError(
                f"Lambda has no available capacity for instance type '{instance_type}' in any region. "
                "Try a different accelerator/instance type or try again later."
            )
        elif requested_region in available_regions:
            region = requested_region
        else:
            region = available_regions[0]
            if requested_region:
                logger.info(
                    "Lambda instance type %s has no capacity in %s; using %s instead.",
                    instance_type,
                    requested_region,
                    region,
                )

        # Start from any per-launch keys (for the user's own access), then always
        # add the org key so the API server can read run logs over SSH.
        ssh_key_names = list(config.provider_config.get("ssh_key_names") or [])
        if self.team_id:
            org_key_name = self._ensure_org_ssh_key()
            if org_key_name not in ssh_key_names:
                ssh_key_names.append(org_key_name)
        if not ssh_key_names:
            raise ValueError(
                "Lambda Cloud requires at least one ssh_key_name. Provide team_id so the "
                "org key can be used, or configure default_ssh_key_names."
            )

        payload: Dict[str, Any] = {
            "region_name": region,
            "instance_type_name": instance_type,
            "ssh_key_names": ssh_key_names,
            "name": cluster_name,
        }
        if file_system_names:
            payload["file_system_names"] = file_system_names

        # Lambda supports a `user_data` cloud-init script — pass setup+run through
        # it so the instance executes our entrypoint on boot, then self-terminate
        # via the Lambda API on EXIT (success or crash). Lambda has no per-instance
        # metadata service or scoped credential, so the trap uses the account API
        # key to look up its own id by name and call /instance-operations/terminate.
        # Same tradeoff Nebius makes (embeds creds in user_data to self-delete).
        user_data = self._build_user_data(cluster_name, config)
        if user_data:
            payload["user_data"] = user_data

        try:
            response = self._make_request("POST", "/instance-operations/launch", json_data=payload)
            result = self._unwrap(response.json())
            instance_ids = (result or {}).get("instance_ids") or []
            instance_id = instance_ids[0] if instance_ids else None
            if instance_id:
                self._cluster_name_to_instance_id[cluster_name] = instance_id
            return {"instance_id": instance_id, "request_id": instance_id}
        except requests.exceptions.HTTPError as exc:
            detail = ""
            if exc.response is not None:
                try:
                    detail = exc.response.text
                except Exception:  # pragma: no cover - defensive
                    detail = ""
            raise RuntimeError(f"Failed to launch Lambda instance: {exc} - {detail}") from exc

    def stop_cluster(self, cluster_name: str) -> Dict[str, Any]:
        instance = self._find_instance_by_name(cluster_name)
        if not instance:
            return {
                "status": "error",
                "message": f"Lambda instance '{cluster_name}' not found",
                "cluster_name": cluster_name,
            }
        instance_id = instance.get("id")
        try:
            self._make_request(
                "POST",
                "/instance-operations/terminate",
                json_data={"instance_ids": [instance_id]},
            )
            self._cluster_name_to_instance_id.pop(cluster_name, None)
            return {
                "status": "success",
                "message": f"Lambda instance '{cluster_name}' terminated",
                "cluster_name": cluster_name,
                "instance_id": instance_id,
            }
        except requests.exceptions.HTTPError as exc:
            detail = exc.response.text if exc.response is not None else ""
            return {
                "status": "error",
                "message": f"Failed to terminate Lambda instance: {exc} - {detail}",
                "cluster_name": cluster_name,
                "instance_id": instance_id,
            }

    def get_cluster_status(self, cluster_name: str) -> ClusterStatus:
        instance = self._find_instance_by_name(cluster_name)
        if not instance:
            return ClusterStatus(
                cluster_name=cluster_name,
                state=ClusterState.UNKNOWN,
                status_message="Instance not found",
            )
        state = self._map_state(instance.get("status", ""))
        instance_type = (instance.get("instance_type") or {}).get("name") or ""
        return ClusterStatus(
            cluster_name=cluster_name,
            state=state,
            status_message=instance.get("status"),
            launched_at=instance.get("created_at") and str(instance["created_at"]),
            num_nodes=1,
            resources_str=instance_type,
            provider_data=instance,
        )

    def list_clusters(self) -> List[ClusterStatus]:
        try:
            response = self._make_request("GET", "/instances")
            instances = self._unwrap(response.json()) or []
        except Exception as exc:
            logger.warning("Lambda list_clusters failed: %s", exc)
            return []

        result: List[ClusterStatus] = []
        for inst in instances:
            name = inst.get("name") or f"lambda-{inst.get('id', 'unknown')}"
            inst_id = inst.get("id")
            if inst_id:
                self._cluster_name_to_instance_id[name] = inst_id
            instance_type = (inst.get("instance_type") or {}).get("name") or ""
            result.append(
                ClusterStatus(
                    cluster_name=name,
                    state=self._map_state(inst.get("status", "")),
                    status_message=inst.get("status"),
                    launched_at=inst.get("created_at") and str(inst["created_at"]),
                    num_nodes=1,
                    resources_str=instance_type,
                    provider_data=inst,
                )
            )
        return result

    def get_cluster_resources(self, cluster_name: str) -> ResourceInfo:
        instance = self._find_instance_by_name(cluster_name)
        return self._resources_from_instance(cluster_name, instance)

    def _resources_from_instance(self, cluster_name: str, instance: Optional[Dict[str, Any]]) -> ResourceInfo:
        """Build ResourceInfo from an instance dict (as returned by both the list and get endpoints)."""
        if not instance:
            return ResourceInfo(
                cluster_name=cluster_name,
                gpus=[],
                cpus=None,
                memory_gb=None,
                disk_gb=None,
                num_nodes=1,
            )

        instance_type = instance.get("instance_type") or {}
        specs = instance_type.get("specs") or {}
        gpus: List[Dict[str, Any]] = []
        gpu_desc = instance_type.get("gpu_description") or instance_type.get("description")
        gpu_count = specs.get("gpus") or 1
        if gpu_desc:
            gpus.append({"gpu": gpu_desc, "count": gpu_count})

        memory_gib = specs.get("memory_gib")
        return ResourceInfo(
            cluster_name=cluster_name,
            gpus=gpus,
            cpus=specs.get("vcpus"),
            memory_gb=memory_gib,
            disk_gb=specs.get("storage_gib"),
            num_nodes=1,
            provider_data=instance,
        )

    def get_clusters_detailed(self) -> List[Dict[str, Any]]:
        detailed: List[Dict[str, Any]] = []
        for cluster_status in self.list_clusters():
            cluster_name = cluster_status.cluster_name
            # The list endpoint returns the same full Instance payload as the per-instance
            # endpoint, so reuse provider_data instead of re-fetching each instance.
            resources = self._resources_from_instance(cluster_name, cluster_status.provider_data)

            gpus_dict: Dict[str, int] = {}
            for gpu in resources.gpus or []:
                if isinstance(gpu, dict) and gpu.get("gpu"):
                    gpus_dict[gpu["gpu"]] = gpu.get("count", 0)

            state_str = (
                cluster_status.state.name if hasattr(cluster_status.state, "name") else str(cluster_status.state)
            )
            is_up = state_str.upper() in ("UP", "INIT")

            node = {
                "node_name": cluster_name,
                "is_fixed": False,
                "is_active": is_up,
                "state": state_str.upper(),
                "reason": cluster_status.status_message or state_str,
                "resources": {
                    "cpus_total": resources.cpus or 0,
                    "cpus_allocated": (resources.cpus or 0) if is_up else 0,
                    "gpus": gpus_dict,
                    "gpus_free": {} if is_up else gpus_dict,
                    "memory_gb_total": resources.memory_gb or 0,
                    "memory_gb_allocated": (resources.memory_gb or 0) if is_up else 0,
                },
            }
            detailed.append(
                {
                    "cluster_id": cluster_name,
                    "cluster_name": cluster_name,
                    "backend_type": "Lambda",
                    "elastic_enabled": True,
                    "max_nodes": 1,
                    "head_node_ip": (cluster_status.provider_data or {}).get("ip"),
                    "nodes": [node],
                }
            )
        return detailed

    # Lambda Cloud has no queue / native job API — mirror RunPod's behavior.
    def submit_job(self, cluster_name: str, job_config: JobConfig) -> Dict[str, Any]:
        raise NotImplementedError("Lambda Cloud has no job submission API")

    def list_jobs(self, cluster_name: str) -> List[JobInfo]:
        raise NotImplementedError("Lambda Cloud has no job queue")

    def get_job_logs(
        self,
        cluster_name: str,
        job_id: Union[str, int],
        tail_lines: Optional[int] = None,
        follow: bool = False,
    ) -> Union[str, Any]:
        # Lambda has no log API, so we SSH in (org key) and tail the run log,
        # the same approach AWS/Nebius use. Logs are only available while the
        # instance is alive — it self-terminates when the job exits.
        if not self.team_id:
            return "Logs not available: provider has no team_id for SSH access."

        instance = self._find_instance_by_name(cluster_name)
        if not instance:
            return f"Instance '{cluster_name}' not found or not running."

        public_ip = instance.get("ip")
        if not public_ip:
            return "Instance has no IP yet (still starting)."

        from transformerlab.services.ssh_key_service import get_org_ssh_private_key

        key_bytes = asyncio.run(get_org_ssh_private_key(self.team_id))
        return _ssh_read_file(public_ip, key_bytes, LAMBDA_RUN_LOG_PATH, tail_lines or 500)

    def cancel_job(self, cluster_name: str, job_id: Union[str, int]) -> Dict[str, Any]:
        raise NotImplementedError("Lambda Cloud has no job cancellation API")

    def check(self) -> tuple[bool, str | None]:
        try:
            # /instance-types is a lightweight authenticated endpoint.
            self._make_request("GET", "/instance-types", timeout=10)
            return True, None
        except Exception as exc:
            reason = f"Lambda Cloud provider check failed: {exc}"
            logger.warning(reason)
            return False, reason
