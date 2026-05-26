"""Tests for Nebius automatic subnet resolution."""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from transformerlab.compute_providers.models import ClusterConfig
from transformerlab.compute_providers.nebius import NEBIUS_AUTO_SUBNET_NAME, NebiusProvider


def test_resolve_subnet_uses_configured_id() -> None:
    p = NebiusProvider(team_id="t1", parent_id="proj", subnet_id="subnet-fixed")
    assert p._resolve_subnet_id_for_launch() == "subnet-fixed"


def test_resolve_subnet_reuses_existing_list() -> None:
    p = NebiusProvider(team_id="t1", parent_id="proj-a", subnet_id=None)
    p._run_nebius = MagicMock(return_value={"subnets": [{"metadata": {"id": "sn-1", "name": "s1"}}]})
    assert p._resolve_subnet_id_for_launch() == "sn-1"
    p._run_nebius.assert_called_once()
    assert p._resolved_subnet_id == "sn-1"


def test_resolve_subnet_creates_network_then_subnet() -> None:
    p = NebiusProvider(team_id="t1", parent_id="proj-b", subnet_id=None)
    subnet_list_returns: list = [[], []]

    def fake_run(args: list, stdin_json=None, timeout=120):
        joined = " ".join(args)
        if "subnet list" in joined:
            return {"subnets": subnet_list_returns.pop(0)}
        if "network list" in joined:
            return {"networks": []}
        if "create-default" in joined:
            return {"metadata": {"id": "net-new"}}
        if "subnet create" in joined:
            return {"metadata": {"id": "sn-created"}}
        raise AssertionError(f"unexpected nebius call: {joined}")

    p._run_nebius = MagicMock(side_effect=fake_run)
    assert p._resolve_subnet_id_for_launch() == "sn-created"
    create_calls = [c for c in p._run_nebius.call_args_list if "subnet create" in " ".join(c[0][0])]
    assert len(create_calls) == 1
    create_args = create_calls[0][0][0]
    assert NEBIUS_AUTO_SUBNET_NAME in create_args


def test_resolve_subnet_requires_parent_when_no_subnet() -> None:
    p = NebiusProvider(team_id="t1", parent_id=None, subnet_id=None)
    with pytest.raises(ValueError, match="parent_id"):
        p._resolve_subnet_id_for_launch()


def test_cloud_init_includes_self_termination_trap() -> None:
    p = NebiusProvider(team_id="t1")
    user_data = p._build_cloud_init("cluster-a", ClusterConfig(run="echo hello"), public_key="ssh-ed25519 AAAATEST")
    assert "_tfl_self_terminate" in user_data
    assert "trap _tfl_self_terminate EXIT" in user_data


def test_cloud_init_self_termination_fallbacks() -> None:
    p = NebiusProvider(team_id="t1")
    user_data = p._build_cloud_init("cluster-a", ClusterConfig(run="echo hello"), public_key="ssh-ed25519 AAAATEST")
    assert "_tfl_self_delete_instance" in user_data
    assert "_tfl_ensure_nebius_cli" in user_data
    assert "https://storage.eu-north1.nebius.cloud/cli/install.sh | bash" in user_data
    assert 'export PATH="$HOME/.nebius/bin:$PATH"' in user_data
    assert 'nebius compute instance delete --id "$_iid" --async' in user_data
    assert "shutdown -h now || poweroff || true" in user_data
