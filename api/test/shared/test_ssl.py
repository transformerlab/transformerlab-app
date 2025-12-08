from __future__ import annotations

import importlib
from pathlib import Path

import pytest


@pytest.fixture()
def ssl_utils(monkeypatch, tmp_path):
    import transformerlab.shared.ssl_utils as _ssl_utils

    monkeypatch.setattr(_ssl_utils, "CERT_DIR", tmp_path / "certs", raising=False)
    monkeypatch.setattr(
        _ssl_utils,
        "CERT_PATH",
        tmp_path / "certs" / "server-cert.pem",
        raising=False,
    )
    monkeypatch.setattr(
        _ssl_utils,
        "KEY_PATH",
        tmp_path / "certs" / "server-key.pem",
        raising=False,
    )
    importlib.reload(_ssl_utils)
    return _ssl_utils


def test_cert_files_are_created_and_reused(ssl_utils):
    cert_path, key_path = ssl_utils.ensure_persistent_self_signed_cert()
    assert Path(cert_path).exists()
    assert Path(key_path).exists()
    first_mtime = Path(cert_path).stat().st_mtime
    cert_path2, key_path2 = ssl_utils.ensure_persistent_self_signed_cert()
    assert cert_path2 == cert_path
    assert key_path2 == key_path
    assert Path(cert_path).stat().st_mtime == first_mtime


def test_certificate_subject_cn_is_expected(ssl_utils):
    from cryptography import x509
    from cryptography.x509.oid import NameOID

    cert_path, _ = ssl_utils.ensure_persistent_self_signed_cert()
    cert = x509.load_pem_x509_certificate(Path(cert_path).read_bytes())
    cn = cert.subject.get_attributes_for_oid(NameOID.COMMON_NAME)[0].value
    assert cn == "TransformerLab-Selfhost"


def test_private_key_matches_cert(ssl_utils):
    from cryptography import x509
    from cryptography.hazmat.primitives import serialization

    cert_path, key_path = ssl_utils.ensure_persistent_self_signed_cert()
    cert = x509.load_pem_x509_certificate(Path(cert_path).read_bytes())
    key = serialization.load_pem_private_key(Path(key_path).read_bytes(), password=None)
    assert key.key_size == 2048
    assert cert.public_key().public_numbers() == key.public_key().public_numbers()


def test_certificate_sans(ssl_utils):
    from cryptography import x509

    cert_path, _ = ssl_utils.ensure_persistent_self_signed_cert()
    cert = x509.load_pem_x509_certificate(Path(cert_path).read_bytes())
    sans = cert.extensions.get_extension_for_class(x509.SubjectAlternativeName).value
    dns_names = set(sans.get_values_for_type(x509.DNSName))
    ip_addrs = {str(ip) for ip in sans.get_values_for_type(x509.IPAddress)}
    assert dns_names == {"localhost"}
    assert ip_addrs == {"127.0.0.1", "::1"}


def test_lock_guards_concurrent_writes(ssl_utils, tmp_path):
    from queue import Queue
    from threading import Thread

    results = []
    q = Queue()

    def worker():
        result = ssl_utils.ensure_persistent_self_signed_cert()
        q.put(result)

    threads = [Thread(target=worker) for _ in range(4)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    # Collect results
    while not q.empty():
        results.append(q.get())

    assert len(results) == 4
    assert len({r[0] for r in results}) == 1
    assert len({r[1] for r in results}) == 1
