import subprocess
from pathlib import Path


def test_install_sh_shellcheck():
    install_sh = Path(__file__).parent.parent.parent / "install.sh"
    assert install_sh.exists(), "install.sh not found in repository root"

    result = subprocess.run(
        ["shellcheck", "--severity=error", str(install_sh)],
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, f"shellcheck found errors:\n{result.stdout}\n{result.stderr}"
