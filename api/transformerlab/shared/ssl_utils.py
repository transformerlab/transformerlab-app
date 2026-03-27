from __future__ import annotations

import asyncio
import datetime as _dt
import ipaddress as _ip
import os
from typing import Tuple

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID

from lab.dirs import get_workspace_dir
from lab import storage

__all__ = [
    "ensure_persistent_self_signed_cert",
]

# In-process lock: prevents concurrent async tasks from racing to generate
# the cert simultaneously. FileLock is not suitable here because the storage
# awaits inside the critical section now genuinely yield to the event loop.
_cert_lock = asyncio.Lock()


async def ensure_persistent_self_signed_cert() -> Tuple[str, str]:
    # Compute paths lazily to avoid asyncio.run() at module level
    workspace_dir = await get_workspace_dir()
    cert_dir = os.path.join(workspace_dir, "certs")
    cert_path = os.path.join(cert_dir, "server-cert.pem")
    key_path = os.path.join(cert_dir, "server-key.pem")

    async with _cert_lock:
        if await storage.exists(cert_path) and await storage.exists(key_path):
            return cert_path, key_path
        await storage.makedirs(cert_dir, exist_ok=True)
        key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        subject = issuer = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "TransformerLab-Selfhost")])
        cert_builder = (
            x509.CertificateBuilder()
            .subject_name(subject)
            .issuer_name(issuer)
            .public_key(key.public_key())
            .serial_number(x509.random_serial_number())
            .not_valid_before(_dt.datetime.utcnow() - _dt.timedelta(days=1))
            .not_valid_after(_dt.datetime.utcnow() + _dt.timedelta(days=3650))
            .add_extension(
                x509.SubjectAlternativeName(
                    [
                        x509.DNSName("localhost"),
                        x509.IPAddress(_ip.IPv4Address("127.0.0.1")),
                        x509.IPAddress(_ip.IPv6Address("::1")),
                    ]
                ),
                critical=False,
            )
        )
        cert = cert_builder.sign(key, hashes.SHA256())
        # Write via fsspec storage
        await storage.makedirs(cert_dir, exist_ok=True)
        async with await storage.open(cert_path, "wb") as f:
            await f.write(cert.public_bytes(serialization.Encoding.PEM))
        async with await storage.open(key_path, "wb") as f:
            await f.write(
                key.private_bytes(
                    serialization.Encoding.PEM,
                    serialization.PrivateFormat.TraditionalOpenSSL,
                    serialization.NoEncryption(),
                )
            )
        return cert_path, key_path
