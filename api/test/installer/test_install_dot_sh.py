import subprocess
import os


def test_install_sh_shellcheck():
    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
    install_sh = os.path.join(repo_root, "api", "install.sh")
    assert os.path.exists(install_sh), "install.sh not found at api/install.sh"

    result = subprocess.run(
        ["shellcheck", "--severity=error", install_sh],
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, f"shellcheck found errors:\n{result.stdout}\n{result.stderr}"
