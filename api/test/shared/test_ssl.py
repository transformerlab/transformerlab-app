from __future__ import annotations

import importlib
import os
import pytest
import asyncio


@pytest.fixture()
def ssl_utils(monkeypatch, tmp_path):
    import transformerlab.shared.ssl_utils as _ssl_utils

    # ssl_utils now computes cert locations relative to get_workspace_dir(),
    # so patch that function instead of internal constants.
    async def _fake_get_workspace_dir():
        return str(tmp_path)

    monkeypatch.setattr(_ssl_utils, "get_workspace_dir", _fake_get_workspace_dir)
    importlib.reload(_ssl_utils)
    return _ssl_utils


@pytest.mark.asyncio
async def test_cert_files_are_created_and_reused(ssl_utils):
    cert_path, key_path = await ssl_utils.ensure_persistent_self_signed_cert()
    assert os.path.exists(cert_path)
    assert os.path.exists(key_path)
    first_mtime = os.path.getmtime(cert_path)
    cert_path2, key_path2 = await ssl_utils.ensure_persistent_self_signed_cert()
    assert cert_path2 == cert_path
    assert key_path2 == key_path
    assert os.path.getmtime(cert_path) == first_mtime


@pytest.mark.asyncio
async def test_certificate_subject_cn_is_expected(ssl_utils):
    from cryptography import x509
    from cryptography.x509.oid import NameOID

    cert_path, _ = await ssl_utils.ensure_persistent_self_signed_cert()
    with open(cert_path, "rb") as f:
        cert_bytes = f.read()
    cert = x509.load_pem_x509_certificate(cert_bytes)
    cn = cert.subject.get_attributes_for_oid(NameOID.COMMON_NAME)[0].value
    assert cn == "TransformerLab-Selfhost"


@pytest.mark.asyncio
async def test_private_key_matches_cert(ssl_utils):
    from cryptography.hazmat.primitives import serialization
    from cryptography import x509

    cert_path, key_path = await ssl_utils.ensure_persistent_self_signed_cert()
    with open(cert_path, "rb") as f:
        cert_bytes = f.read()
    with open(key_path, "rb") as f:
        key_bytes = f.read()
    cert = x509.load_pem_x509_certificate(cert_bytes)
    key = serialization.load_pem_private_key(key_bytes, password=None)
    assert key.key_size == 2048
    assert cert.public_key().public_numbers() == key.public_key().public_numbers()


@pytest.mark.asyncio
async def test_certificate_sans(ssl_utils):
    from cryptography import x509

    cert_path, _ = await ssl_utils.ensure_persistent_self_signed_cert()
    with open(cert_path, "rb") as f:
        cert_bytes = f.read()
    cert = x509.load_pem_x509_certificate(cert_bytes)
    sans = cert.extensions.get_extension_for_class(x509.SubjectAlternativeName).value
    dns_names = set(sans.get_values_for_type(x509.DNSName))
    ip_addrs = {str(ip) for ip in sans.get_values_for_type(x509.IPAddress)}
    assert dns_names == {"localhost"}
    assert ip_addrs == {"127.0.0.1", "::1"}


@pytest.mark.asyncio
async def test_lock_guards_concurrent_writes(ssl_utils, tmp_path):
    from asyncio import Queue

    results = []
    q = Queue()

    async def worker():
        result = await ssl_utils.ensure_persistent_self_signed_cert()
        await q.put(result)

    tasks = [asyncio.create_task(worker()) for _ in range(4)]
    await asyncio.gather(*tasks)

    # Collect results
    while not q.empty():
        results.append(await q.get())

    assert len(results) == 4
    assert len({r[0] for r in results}) == 1
    assert len({r[1] for r in results}) == 1
