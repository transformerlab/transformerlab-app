"""GitHub utility functions for reading PAT and working with GitHub repositories."""

import uuid
from typing import Optional
from lab import storage


def read_github_pat_from_workspace(workspace_dir: str) -> Optional[str]:
    """Read GitHub PAT from workspace/github_pat.txt file.
    
    Args:
        workspace_dir: Path to the workspace directory
        
    Returns:
        GitHub PAT string if found, None otherwise
    """
    try:
        pat_path = storage.join(workspace_dir, "github_pat.txt")
        if storage.exists(pat_path):
            with storage.open(pat_path, "r") as f:
                pat = f.read().strip()
                if pat:
                    return pat
    except Exception as e:
        print(f"Error reading GitHub PAT from workspace: {e}")
    return None


def generate_github_clone_setup(
    repo_url: str,
    directory: Optional[str] = None,
    github_pat: Optional[str] = None,
) -> str:
    """
    Generate bash script to clone a GitHub repository.
    Supports both public and private repos (with PAT).
    Supports cloning entire repo or specific directory (sparse checkout).
    
    Args:
        repo_url: GitHub repository URL (e.g., https://github.com/owner/repo.git)
        directory: Optional subdirectory within the repo to clone
        github_pat: Optional GitHub Personal Access Token for private repos
        
    Returns:
        Bash script string that can be executed to clone the repository
    """
    clone_dir = f"~/tmp/git-clone-{uuid.uuid4().hex[:8]}"

    if github_pat:
        if repo_url.startswith("https://github.com/"):
            repo_url_with_auth = repo_url.replace(
                "https://github.com/", f"https://{github_pat}@github.com/"
            )
        elif repo_url.startswith("https://"):
            repo_url_with_auth = repo_url.replace("https://", f"https://{github_pat}@")
        else:
            repo_url_with_auth = repo_url
    else:
        repo_url_with_auth = repo_url

    def escape_bash(s: str) -> str:
        return s.replace("'", "'\"'\"'").replace("\\", "\\\\").replace("$", "\\$")

    escaped_directory = escape_bash(directory) if directory else None

    if directory:
        setup_script = (
            f"TEMP_CLONE_DIR={clone_dir}; "
            f"CURRENT_DIR=$HOME; "
            f"mkdir -p $TEMP_CLONE_DIR; "
            f"cd $TEMP_CLONE_DIR; "
            f"git init; "
            f"git remote add origin {repo_url_with_auth}; "
            f"git config core.sparseCheckout true; "
            f"echo '{escaped_directory}/' > .git/info/sparse-checkout; "
            f"git pull origin main || git pull origin master || git pull origin HEAD; "
            f"if [ -d '{escaped_directory}' ]; then cp -r {escaped_directory} $CURRENT_DIR/; cd $CURRENT_DIR; rm -rf $TEMP_CLONE_DIR; else echo 'Warning: Directory {escaped_directory} not found in repository'; cd $CURRENT_DIR; rm -rf $TEMP_CLONE_DIR; fi"
        )
    else:
        setup_script = (
            f"git clone {repo_url_with_auth} {clone_dir}; "
            f"cp -r {clone_dir}/* .; "
            f"rm -rf {clone_dir}"
        )

    return setup_script
