"""Azure compute provider implementation."""

from __future__ import annotations

import asyncio
import copy
import io
import logging
import time
import uuid
from typing import Any, Dict, List, Optional, Union

from .base import ComputeProvider, format_status_snapshot
from .models import ClusterConfig, ClusterState, ClusterStatus, JobConfig, JobInfo, ResourceInfo
from transformerlab.shared.ssh_policy import get_add_if_verified_policy

logger = logging.getLogger(__name__)

_GPU_VM_SIZE_MAP: Dict[tuple, str] = {
    ("T4", 1): "Standard_NC4as_T4_v3",
    ("T4", 4): "Standard_NC16as_T4_v3",
    ("T4", 16): "Standard_NC64as_T4_v3",
    ("A100", 1): "Standard_NC24ads_A100_v4",
    ("A100", 2): "Standard_NC48ads_A100_v4",
    ("A100", 4): "Standard_NC96ads_A100_v4",
    ("A100", 8): "Standard_ND96asr_v4",
    ("H100", 1): "Standard_NC40ads_H100_v5",
    ("H100", 2): "Standard_NC80adis_H100_v5",
    ("H100", 8): "Standard_ND96isr_H100_v5",
    # Azure's only Blackwell SKU is the GB200 NVL72 (4 GPUs/VM). Keyed as "B200"
    # for naming consistency with the other providers' Blackwell offerings.
    ("B200", 4): "Standard_ND128isr_NDR_GB200_v6",
    ("A10", 1): "Standard_NV36ads_A10_v5",
    ("A10", 2): "Standard_NV72ads_A10_v5",
    ("V100", 1): "Standard_NC6s_v3",
    ("V100", 2): "Standard_NC12s_v3",
    ("V100", 4): "Standard_NC24s_v3",
}

_CPU_VM_SIZE_OPTIONS: List[tuple] = sorted(
    [
        (2, 4, "Standard_F2s_v2"),
        (2, 8, "Standard_D2s_v3"),
        (2, 16, "Standard_E2s_v3"),
        (4, 8, "Standard_F4s_v2"),
        (4, 16, "Standard_D4s_v3"),
        (4, 32, "Standard_E4s_v3"),
        (8, 16, "Standard_F8s_v2"),
        (8, 32, "Standard_D8s_v3"),
        (8, 64, "Standard_E8s_v3"),
        (16, 32, "Standard_F16s_v2"),
        (16, 64, "Standard_D16s_v3"),
        (16, 128, "Standard_E16s_v3"),
        (32, 64, "Standard_F32s_v2"),
        (32, 128, "Standard_D32s_v3"),
        (32, 256, "Standard_E32s_v3"),
        (64, 128, "Standard_F64s_v2"),
        (64, 256, "Standard_D64s_v3"),
        (64, 512, "Standard_E64s_v3"),
        (96, 192, "Standard_F96s_v2"),
        (96, 384, "Standard_D96s_v3"),
        (96, 672, "Standard_E96s_v3"),
    ],
    key=lambda x: (x[0], x[1]),
)

_AZURE_POWER_STATE_MAP: Dict[str, ClusterState] = {
    "powerstate/starting": ClusterState.INIT,
    "powerstate/running": ClusterState.UP,
    "powerstate/stopping": ClusterState.STOPPED,
    "powerstate/stopped": ClusterState.STOPPED,
    "powerstate/deallocating": ClusterState.DOWN,
    "powerstate/deallocated": ClusterState.DOWN,
}

_AZURE_PROV_STATE_MAP: Dict[str, ClusterState] = {
    "creating": ClusterState.INIT,
    "updating": ClusterState.INIT,
    "deleting": ClusterState.DOWN,
    "failed": ClusterState.FAILED,
    "succeeded": ClusterState.UP,
}

_VM_CONTRIBUTOR_ROLE_DEFINITION_ID = "9980e02c-c2be-4d73-94e8-173b1dc7cf3c"


def _resolve_gpu_vm_size(accelerators: str) -> str:
    """Map an accelerator spec (e.g. 'A100:8') to an Azure VM size.

    Raises ValueError for unrecognized types or unsupported counts.
    """
    parts = accelerators.strip().split(":")
    accel_type = parts[0].strip()
    count = int(parts[1].strip()) if len(parts) > 1 else 1
    key = (accel_type, count)
    if key not in _GPU_VM_SIZE_MAP:
        valid = sorted(f"{t}:{c}" for t, c in _GPU_VM_SIZE_MAP)
        raise ValueError(f"Unsupported accelerator spec '{accelerators}'. Valid options: {', '.join(valid)}")
    return _GPU_VM_SIZE_MAP[key]


def _parse_memory_gb(memory: Union[int, float, str, None]) -> float:
    """Parse memory field (int GB, float GB, '16GB' string, or None) to float GB."""
    if memory is None:
        return 0.0
    if isinstance(memory, (int, float)):
        return float(memory)
    stripped = str(memory).strip().upper()
    for suffix in ("GB", "G", "MB", "M"):
        if stripped.endswith(suffix):
            stripped = stripped[: -len(suffix)].strip()
            break
    try:
        return float(stripped)
    except ValueError:
        return 0.0


def _resolve_cpu_vm_size(
    cpus: Union[int, str, None],
    memory: Union[int, float, str, None],
) -> str:
    """Select smallest Azure CPU VM satisfying both vCPU and memory constraints.

    Raises ValueError if the combination exceeds available options.
    """
    requested_cpus = int(cpus) if cpus else 0
    requested_memory = _parse_memory_gb(memory)
    for vcpus, mem_gb, vm_size in _CPU_VM_SIZE_OPTIONS:
        if vcpus >= requested_cpus and mem_gb >= requested_memory:
            return vm_size
    raise ValueError(
        f"No Azure CPU VM found for cpus={requested_cpus}, memory={requested_memory}GB. "
        f"Maximum available: 96 vCPUs, 672 GB memory."
    )


def _ssh_read_file(host: str, key_bytes: bytes, remote_path: str, tail_lines: int = 500) -> str:
    """SSH to host and read a file. Returns string content or error message."""
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
        ssh.connect(hostname=host, port=22, username="azureuser", pkey=pkey, timeout=15, banner_timeout=15)
        cmd = f"tail -n {tail_lines} {remote_path} 2>/dev/null || echo 'No log file yet.'"
        _, stdout, _ = ssh.exec_command(cmd, timeout=10)
        return stdout.read().decode("utf-8", errors="replace").strip() or "No output yet."
    except Exception as e:
        return f"SSH failed: {e}"
    finally:
        ssh.close()


class AzureProvider(ComputeProvider):
    """Compute provider that launches ephemeral Azure VMs per job."""

    def __init__(
        self,
        subscription_id: str,
        tenant_id: str,
        client_id: str,
        client_secret: str,
        location: str,
        resource_group: str,
        team_id: str,
        extra_config: Optional[Dict[str, Any]] = None,
    ) -> None:
        self.subscription_id = subscription_id
        self.tenant_id = tenant_id
        self.client_id = client_id
        self.client_secret = client_secret
        self.location = location
        self.resource_group = resource_group
        self.team_id = team_id
        self.extra_config = extra_config or {}

    def _get_credential(self) -> Any:
        from azure.identity import ClientSecretCredential

        return ClientSecretCredential(self.tenant_id, self.client_id, self.client_secret)

    def _get_compute_client(self) -> Any:
        from azure.mgmt.compute import ComputeManagementClient

        return ComputeManagementClient(self._get_credential(), self.subscription_id)

    def _get_network_client(self) -> Any:
        from azure.mgmt.network import NetworkManagementClient

        return NetworkManagementClient(self._get_credential(), self.subscription_id)

    def _get_resource_client(self) -> Any:
        from azure.mgmt.resource import ResourceManagementClient

        return ResourceManagementClient(self._get_credential(), self.subscription_id)

    def _get_authorization_client(self) -> Any:
        from azure.mgmt.authorization import AuthorizationManagementClient

        return AuthorizationManagementClient(self._get_credential(), self.subscription_id)

    def _delete_cluster_nic_and_public_ip(self, network_client: Any, cluster_name: str) -> None:
        """Delete per-cluster NIC and public IP (NIC first; tolerates missing resources)."""
        nic_name = f"transformerlab-nic-{cluster_name}"
        pip_name = f"transformerlab-pip-{cluster_name}"
        try:
            network_client.network_interfaces.begin_delete(self.resource_group, nic_name).result()
        except Exception as e:
            logger.warning("Failed to delete NIC %s: %s", nic_name, e)
        try:
            network_client.public_ip_addresses.begin_delete(self.resource_group, pip_name).result()
        except Exception as e:
            logger.warning("Failed to delete Public IP %s: %s", pip_name, e)

    def _ensure_vm_self_delete_role(self, vm: Any) -> None:
        """Best-effort: grant VM identity rights to delete itself."""
        principal_id = getattr(getattr(vm, "identity", None), "principal_id", None)
        if not principal_id:
            logger.warning("Azure VM identity principal_id missing; skipping self-delete role assignment")
            return

        scope = f"/subscriptions/{self.subscription_id}/resourceGroups/{self.resource_group}"
        role_definition_id = (
            f"/subscriptions/{self.subscription_id}/providers/Microsoft.Authorization/roleDefinitions/"
            f"{_VM_CONTRIBUTOR_ROLE_DEFINITION_ID}"
        )
        auth_client = self._get_authorization_client()

        for attempt in range(1, 4):
            try:
                auth_client.role_assignments.create(
                    scope=scope,
                    role_assignment_name=str(uuid.uuid4()),
                    parameters={
                        "properties": {
                            "roleDefinitionId": role_definition_id,
                            "principalId": principal_id,
                            "principalType": "ServicePrincipal",
                        }
                    },
                )
                logger.info("Assigned Virtual Machine Contributor role to VM identity for self-terminate.")
                return
            except Exception as e:
                # Role assignment can race with identity propagation.
                if "RoleAssignmentExists" in str(e):
                    logger.info("VM self-delete role assignment already exists.")
                    return
                if attempt < 3:
                    time.sleep(2)
                    continue
                logger.warning("Failed to assign VM self-delete role: %s", e)

    def check(self) -> tuple[bool, str | None]:
        try:
            from azure.mgmt.resource import SubscriptionClient

            subscription_client = SubscriptionClient(self._get_credential())
            subscription_client.subscriptions.get(self.subscription_id)
            return True, None
        except Exception as e:
            reason = f"Azure provider check failed: {e}"
            logger.warning(reason)
            return False, reason

    def _ensure_networking(self, network_client, resource_client) -> tuple[str, str]:
        """Ensure resource group, NSG, VNet, and subnet exist. Returns (subnet_id, nsg_id)."""
        rg_name = self.resource_group
        vnet_name = f"transformerlab-vnet-{self.team_id}"
        subnet_name = f"transformerlab-subnet-{self.team_id}"
        nsg_name = f"transformerlab-nsg-{self.team_id}"

        resource_client.resource_groups.create_or_update(rg_name, {"location": self.location})

        try:
            nsg = network_client.network_security_groups.get(rg_name, nsg_name)
        except Exception:
            nsg_poller = network_client.network_security_groups.begin_create_or_update(
                rg_name,
                nsg_name,
                {
                    "location": self.location,
                    "security_rules": [
                        {
                            "name": "allow-ssh",
                            "protocol": "Tcp",
                            "source_port_range": "*",
                            "destination_port_range": "22",
                            "source_address_prefix": "*",
                            "destination_address_prefix": "*",
                            "access": "Allow",
                            "priority": 1000,
                            "direction": "Inbound",
                        }
                    ],
                },
            )
            nsg = nsg_poller.result()

        try:
            subnet = network_client.subnets.get(rg_name, vnet_name, subnet_name)
        except Exception:
            network_client.virtual_networks.begin_create_or_update(
                rg_name,
                vnet_name,
                {
                    "location": self.location,
                    "address_space": {"address_prefixes": ["10.0.0.0/16"]},
                    "subnets": [{"name": subnet_name, "address_prefix": "10.0.0.0/24"}],
                },
            ).result()
            subnet = network_client.subnets.get(rg_name, vnet_name, subnet_name)

        return subnet.id, nsg.id

    def _resolve_vm_size(self, config: ClusterConfig) -> str:
        if config.accelerators:
            return _resolve_gpu_vm_size(config.accelerators)
        return _resolve_cpu_vm_size(config.cpus, config.memory)

    def _get_image_references(self, config: ClusterConfig) -> List[Dict[str, str]]:
        if config.accelerators:
            # Prefer newer Ubuntu for GPU VMs, but keep DSVM 20.04 as fallback
            # because image availability varies across regions/SKUs.
            return [
                {
                    "publisher": "Canonical",
                    "offer": "0001-com-ubuntu-server-jammy",
                    "sku": "22_04-lts-gen2",
                    "version": "latest",
                },
                {
                    "publisher": "microsoft-dsvm",
                    "offer": "ubuntu-2004",
                    "sku": "2004",
                    "version": "latest",
                },
            ]
        return [
            {
                "publisher": "Canonical",
                "offer": "0001-com-ubuntu-server-jammy",
                "sku": "22_04-lts",
                "version": "latest",
            }
        ]

    @staticmethod
    def _build_user_data(config: ClusterConfig) -> str:
        env_exports = "\n".join(f'export {k}="{v}"' for k, v in config.env_vars.items())
        setup_block = config.setup or ""
        run_cmd = config.run or "true"
        return f"""#!/bin/bash
set -eo pipefail
mkdir -p /workspace

# Self-terminate on EXIT (success or crash) using Azure IMDS + ARM.
_tfl_self_terminate() {{
  local _token_json _token _sub _rg _name _http _resp _delete_url
  echo "[tfl] self-terminate: requesting managed identity token" >> /workspace/run_logs.txt 2>&1 || true
  _token_json=$(curl -s -H "Metadata: true" \
    "http://169.254.169.254/metadata/identity/oauth2/token?api-version=2018-02-01&resource=https%3A%2F%2Fmanagement.azure.com%2F" \
    2>/dev/null) || true
  _token=$(printf "%s" "$_token_json" | python3.11 -c 'import json,sys; print(json.load(sys.stdin).get("access_token",""))' 2>/dev/null) || true
  _sub=$(curl -s -H "Metadata: true" \
    "http://169.254.169.254/metadata/instance/compute/subscriptionId?api-version=2021-02-01&format=text" \
    2>/dev/null) || true
  _rg=$(curl -s -H "Metadata: true" \
    "http://169.254.169.254/metadata/instance/compute/resourceGroupName?api-version=2021-02-01&format=text" \
    2>/dev/null) || true
  _name=$(curl -s -H "Metadata: true" \
    "http://169.254.169.254/metadata/instance/compute/name?api-version=2021-02-01&format=text" \
    2>/dev/null) || true
  if [ -n "$_token" ] && [ -n "$_sub" ] && [ -n "$_rg" ] && [ -n "$_name" ]; then
    _delete_url="https://management.azure.com/subscriptions/$_sub/resourceGroups/$_rg/providers/Microsoft.Compute/virtualMachines/$_name?api-version=2022-11-01"
    _http=$(curl -s -o /tmp/tfl_self_terminate_resp.txt -w "%{{http_code}}" -X DELETE \
      -H "Authorization: Bearer $_token" \
      "$_delete_url") || true
    _resp=$(tr '\n' ' ' < /tmp/tfl_self_terminate_resp.txt | cut -c1-600) || true
    echo "[tfl] self-terminate: vm delete requested (http=$_http) body=$_resp" >> /workspace/run_logs.txt 2>&1 || true
  else
    echo "[tfl] self-terminate: missing token/metadata; skipping delete" >> /workspace/run_logs.txt 2>&1 || true
  fi
  return 0
}}
trap _tfl_self_terminate EXIT

# Ensure Python tooling is available and use an isolated runtime for setup/run.
apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq software-properties-common >/dev/null 2>&1
if ! command -v python3.11 >/dev/null 2>&1; then
  add-apt-repository -y ppa:deadsnakes/ppa >/dev/null 2>&1 || true
  apt-get update -qq
fi
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq python3.11 python3.11-venv python3.11-distutils curl >/dev/null 2>&1
curl -sS https://bootstrap.pypa.io/get-pip.py -o /tmp/get-pip.py
python3.11 /tmp/get-pip.py >/dev/null 2>&1
python3.11 -m venv /opt/transformerlab-venv
export PATH="/opt/transformerlab-venv/bin:$PATH"

# Install uv for setup scripts that use `uv pip ...`.
curl -LsSf https://astral.sh/uv/install.sh | sh
export PATH="$HOME/.local/bin:/root/.local/bin:/home/azureuser/.local/bin:$PATH"

# Make uv available even when later commands run as a different user.
if [ -x /root/.local/bin/uv ]; then cp /root/.local/bin/uv /usr/local/bin/uv && chmod +x /usr/local/bin/uv; fi
if [ -x /root/.local/bin/uvx ]; then cp /root/.local/bin/uvx /usr/local/bin/uvx && chmod +x /usr/local/bin/uvx; fi

{env_exports}
{setup_block}
({run_cmd}) 2>&1 | tee /workspace/run_logs.txt
"""

    def _get_vm_power_state(self, vm: Any) -> str:
        if vm.instance_view and vm.instance_view.statuses:
            for status in vm.instance_view.statuses:
                if status.code and status.code.lower().startswith("powerstate/"):
                    return status.code
        return vm.provisioning_state or "unknown"

    def _map_vm_to_cluster_state(self, vm: Any) -> ClusterState:
        power_state = self._get_vm_power_state(vm).lower()
        if power_state in _AZURE_POWER_STATE_MAP:
            return _AZURE_POWER_STATE_MAP[power_state]
        prov_state = (vm.provisioning_state or "").lower()
        return _AZURE_PROV_STATE_MAP.get(prov_state, ClusterState.UNKNOWN)

    def launch_cluster(self, cluster_name: str, config: ClusterConfig) -> Dict[str, Any]:
        import base64

        from transformerlab.services.ssh_key_service import (
            get_or_create_org_ssh_key_pair,
            get_org_ssh_public_key,
        )

        async def _ensure_and_get_public_key() -> str:
            await get_or_create_org_ssh_key_pair(self.team_id)
            return await get_org_ssh_public_key(self.team_id)

        compute_client = self._get_compute_client()
        network_client = self._get_network_client()
        resource_client = self._get_resource_client()

        vm_size = self._resolve_vm_size(config)
        subnet_id, nsg_id = self._ensure_networking(network_client, resource_client)
        public_key_str = asyncio.run(_ensure_and_get_public_key())

        pip_name = f"transformerlab-pip-{cluster_name}"
        nic_name = f"transformerlab-nic-{cluster_name}"
        launch_succeeded = False
        try:
            pip = network_client.public_ip_addresses.begin_create_or_update(
                self.resource_group,
                pip_name,
                {"location": self.location, "sku": {"name": "Standard"}, "public_ip_allocation_method": "Static"},
            ).result()

            nic = network_client.network_interfaces.begin_create_or_update(
                self.resource_group,
                nic_name,
                {
                    "location": self.location,
                    "ip_configurations": [
                        {"name": "ipconfig1", "subnet": {"id": subnet_id}, "public_ip_address": {"id": pip.id}}
                    ],
                    "network_security_group": {"id": nsg_id},
                },
            ).result()

            user_data = self._build_user_data(config)
            user_data_b64 = base64.b64encode(user_data.encode()).decode()

            os_disk: Dict[str, Any] = {"create_option": "FromImage"}
            if config.disk_size:
                os_disk["disk_size_gb"] = config.disk_size

            vm_params: Dict[str, Any] = {
                "location": self.location,
                "identity": {"type": "SystemAssigned"},
                "tags": {
                    "transformerlab-team-id": self.team_id,
                    "transformerlab-cluster-name": cluster_name,
                },
                "hardware_profile": {"vm_size": vm_size},
                "storage_profile": {
                    "image_reference": None,
                    "os_disk": os_disk,
                },
                "os_profile": {
                    "computer_name": cluster_name[:64],
                    "admin_username": "azureuser",
                    "linux_configuration": {
                        "disable_password_authentication": True,
                        "ssh": {
                            "public_keys": [
                                {
                                    "path": "/home/azureuser/.ssh/authorized_keys",
                                    "key_data": public_key_str,
                                }
                            ]
                        },
                    },
                },
                "network_profile": {"network_interfaces": [{"id": nic.id, "primary": True, "delete_option": "Delete"}]},
                "user_data": user_data_b64,
            }
            vm_params["storage_profile"]["os_disk"]["delete_option"] = "Delete"

            # Azure Spot VM: priority "Spot". eviction_policy "Delete" matches TFL's
            # ephemeral/self-deleting VM model (disk/NIC already use delete_option=Delete).
            # max_price -1 => never evicted for price (only for capacity).
            if config.use_spot:
                vm_params["priority"] = "Spot"
                vm_params["eviction_policy"] = "Delete"
                vm_params["billing_profile"] = {"max_price": -1.0}

            image_refs = self._get_image_references(config)
            last_error: Optional[Exception] = None
            for image_ref in image_refs:
                params_for_attempt = copy.deepcopy(vm_params)
                params_for_attempt["storage_profile"]["image_reference"] = image_ref
                try:
                    vm = compute_client.virtual_machines.begin_create_or_update(
                        self.resource_group, cluster_name, params_for_attempt
                    ).result()
                    try:
                        self._ensure_vm_self_delete_role(vm)
                    except Exception as e:
                        logger.warning("Failed configuring VM self-delete RBAC: %s", e)
                    launch_succeeded = True
                    return {"vm_id": vm.id, "request_id": cluster_name}
                except Exception as e:
                    last_error = e
                    logger.warning("Azure VM launch failed with image %s: %s", image_ref, e)
                    # If image/offer/sku is unavailable, continue to fallback image.
                    error_text = str(e).lower()
                    if any(token in error_text for token in ("platformimage", "image", "offer", "sku", "not found")):
                        continue
                    raise RuntimeError(f"Failed to launch Azure VM: {e}") from e

            raise RuntimeError(f"Failed to launch Azure VM: {last_error}") from last_error
        finally:
            if not launch_succeeded:
                self._delete_cluster_nic_and_public_ip(network_client, cluster_name)

    def stop_cluster(self, cluster_name: str) -> Dict[str, Any]:
        compute_client = self._get_compute_client()
        network_client = self._get_network_client()

        try:
            compute_client.virtual_machines.begin_delete(self.resource_group, cluster_name).result()
        except Exception as e:
            return {"status": "error", "message": str(e), "cluster_name": cluster_name}

        self._delete_cluster_nic_and_public_ip(network_client, cluster_name)

        return {"status": "success", "message": f"VM '{cluster_name}' deleted", "cluster_name": cluster_name}

    def get_cluster_status(self, cluster_name: str) -> ClusterStatus:
        compute_client = self._get_compute_client()
        try:
            vm = compute_client.virtual_machines.get(self.resource_group, cluster_name, expand="instanceView")
        except Exception as e:
            msg = str(e).lower()
            # ResourceNotFound can be transient while a VM is still coming up.
            # Keep this UNKNOWN and let the status worker decide terminal transitions
            # based on job state (e.g. STOPPING).
            if "resourcenotfound" in msg or "not found" in msg:
                return ClusterStatus(
                    cluster_name=cluster_name, state=ClusterState.UNKNOWN, status_message="ResourceNotFound"
                )
            return ClusterStatus(cluster_name=cluster_name, state=ClusterState.UNKNOWN)

        state = self._map_vm_to_cluster_state(vm)
        power_state = self._get_vm_power_state(vm)
        vm_size = vm.hardware_profile.vm_size if vm.hardware_profile else None
        return ClusterStatus(
            cluster_name=cluster_name,
            state=state,
            status_message=power_state,
            provider_data={"vm_id": vm.id, "vm_size": vm_size},
        )

    def get_request_logs(self, request_id: str, tail_lines: Optional[int] = None) -> str:
        """Return an orchestration snapshot for an Azure VM (instanceView statuses)."""
        try:
            compute_client = self._get_compute_client()
            vm = compute_client.virtual_machines.get(self.resource_group, request_id, expand="instanceView")
        except Exception as e:  # noqa: BLE001
            return f"Failed to fetch Azure VM '{request_id}': {e}"

        fields = {
            "VM name": vm.name,
            "VM ID": vm.id,
            "Provisioning state": vm.provisioning_state,
            "Power state": self._get_vm_power_state(vm),
            "Location": vm.location,
            "VM size": vm.hardware_profile.vm_size if vm.hardware_profile else None,
        }

        status_lines = []
        instance_view = getattr(vm, "instance_view", None)
        if instance_view and instance_view.statuses:
            for s in instance_view.statuses:
                parts = [s.code or ""]
                if getattr(s, "display_status", None):
                    parts.append(s.display_status)
                if getattr(s, "time", None):
                    parts.append(str(s.time))
                if getattr(s, "message", None):
                    parts.append(s.message)
                status_lines.append(" | ".join(p for p in parts if p))
        if status_lines and tail_lines:
            status_lines = status_lines[-tail_lines:]
        footer = ("--- Instance view statuses ---\n" + "\n".join(status_lines)) if status_lines else None

        return format_status_snapshot(f"Azure VM {request_id}", fields, footer=footer)

    def list_clusters(self) -> List[ClusterStatus]:
        compute_client = self._get_compute_client()
        statuses = []
        try:
            for vm in compute_client.virtual_machines.list(self.resource_group):
                tags = vm.tags or {}
                if tags.get("transformerlab-team-id") != self.team_id:
                    continue
                cluster_name = tags.get("transformerlab-cluster-name", vm.name)
                try:
                    vm_detail = compute_client.virtual_machines.get(self.resource_group, vm.name, expand="instanceView")
                    state = self._map_vm_to_cluster_state(vm_detail)
                    power_state = self._get_vm_power_state(vm_detail)
                except Exception:
                    state = ClusterState.UNKNOWN
                    power_state = "unknown"
                statuses.append(
                    ClusterStatus(
                        cluster_name=cluster_name,
                        state=state,
                        status_message=power_state,
                        provider_data={"vm_id": vm.id, "vm_name": vm.name},
                    )
                )
        except Exception as e:
            logger.warning("Error listing Azure VMs: %s", e)
        return statuses

    def get_cluster_resources(self, cluster_name: str) -> ResourceInfo:
        compute_client = self._get_compute_client()
        try:
            vm = compute_client.virtual_machines.get(self.resource_group, cluster_name)
            vm_size = vm.hardware_profile.vm_size if vm.hardware_profile else None
        except Exception:
            return ResourceInfo(cluster_name=cluster_name, gpus=[], num_nodes=1)
        return ResourceInfo(
            cluster_name=cluster_name,
            gpus=[],
            num_nodes=1,
            provider_data={"vm_size": vm_size},
        )

    def get_clusters_detailed(self) -> List[Dict[str, Any]]:
        clusters = self.list_clusters()
        detailed = []
        for status in clusters:
            state_str = status.state.name if hasattr(status.state, "name") else str(status.state)
            is_up = state_str.upper() in ("UP", "INIT")
            detailed.append(
                {
                    "cluster_id": status.cluster_name,
                    "cluster_name": status.cluster_name,
                    "backend_type": "Azure VM",
                    "elastic_enabled": True,
                    "max_nodes": 1,
                    "head_node_ip": None,
                    "nodes": [
                        {
                            "node_name": status.cluster_name,
                            "is_fixed": False,
                            "is_active": is_up,
                            "state": state_str.upper(),
                            "reason": status.status_message or state_str,
                            "resources": {
                                "cpus_total": 0,
                                "cpus_allocated": 0,
                                "gpus": {},
                                "gpus_free": {},
                                "memory_gb_total": 0,
                                "memory_gb_allocated": 0,
                            },
                        }
                    ],
                }
            )
        return detailed

    def get_job_logs(
        self,
        cluster_name: str,
        job_id: Union[str, int],
        tail_lines: Optional[int] = 500,
        follow: bool = False,
    ) -> str:
        from transformerlab.services.ssh_key_service import get_org_ssh_private_key

        network_client = self._get_network_client()
        pip_name = f"transformerlab-pip-{cluster_name}"
        try:
            pip = network_client.public_ip_addresses.get(self.resource_group, pip_name)
            public_ip = pip.ip_address
        except Exception:
            return f"Public IP address resource not found for instance '{cluster_name}'."

        if not public_ip:
            return "Instance has no public IP yet (still starting)."

        key_bytes = asyncio.run(get_org_ssh_private_key(self.team_id))
        return _ssh_read_file(public_ip, key_bytes, "/workspace/run_logs.txt", tail_lines or 500)

    def submit_job(self, cluster_name: str, job_config: JobConfig) -> Dict[str, Any]:
        raise NotImplementedError("submit_job not yet implemented for AzureProvider")

    def cancel_job(self, cluster_name: str, job_id: Union[str, int]) -> Dict[str, Any]:
        raise NotImplementedError("cancel_job not yet implemented for AzureProvider")

    def list_jobs(self, cluster_name: str) -> List[JobInfo]:
        raise NotImplementedError("list_jobs not yet implemented for AzureProvider")
