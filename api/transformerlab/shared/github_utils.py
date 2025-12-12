"""GitHub utility functions for reading PAT and working with GitHub repositories."""

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

