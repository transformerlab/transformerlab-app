from __future__ import annotations

import asyncio
import os
import shutil
import subprocess
import sys
import tempfile
from typing import List, Optional

from lab import Job
from lab import storage


def _detect_gpu_vendor() -> Optional[str]:
    """
    Detect GPU vendor (NVIDIA or AMD).
    
    Returns:
        "nvidia", "amd", or None if no GPU detected
    """
    # Check for NVIDIA GPU
    if shutil.which("nvidia-smi"):
        try:
            result = subprocess.run(
                ["nvidia-smi", "--query-gpu=name", "--format=csv,noheader"],
                capture_output=True,
                text=True,
                timeout=5,
            )
            if result.returncode == 0 and result.stdout.strip():
                return "nvidia"
        except (subprocess.TimeoutExpired, FileNotFoundError, Exception):
            pass
    
    # Check for AMD GPU (ROCm)
    if shutil.which("rocminfo"):
        try:
            result = subprocess.run(
                ["rocminfo"],
                capture_output=True,
                text=True,
                timeout=5,
            )
            if result.returncode == 0 and result.stdout.strip():
                return "amd"
        except (subprocess.TimeoutExpired, FileNotFoundError, Exception):
            pass
    
    return None


async def _update_job_profile_metadata(
    job_id: str, profile_file: str, vendor: str, file_format: str
) -> None:
    """Update job_data with profiling metadata."""
    try:
        job = await Job.get(job_id)
        if job is None:
            return
        
        await job.update_job_data_field("gpu_profile_file", profile_file)
        await job.update_job_data_field("gpu_profile_vendor", vendor)
        await job.update_job_data_field("gpu_profile_format", file_format)
    except Exception:
        # Best-effort update; don't fail if this doesn't work
        pass


def _run_nvidia_profiling(command_str: str, output_path: str) -> int:
    """
    Run command with NVIDIA nsys profiling.
    
    Returns:
        Exit code of the command
    """
    if not shutil.which("nsys"):
        print("Warning: nsys not found, running command without profiling", file=sys.stderr)
        return subprocess.run(command_str, shell=True).returncode
    
    try:
        # Start nsys profiling session
        # Use --trace=cuda,nvtx,osrt to capture CUDA, NVTX, and OS runtime traces
        start_cmd = [
            "nsys",
            "start",
            "--output", output_path,
            "--trace=cuda,nvtx,osrt",
        ]
        start_result = subprocess.run(start_cmd, capture_output=True, text=True, timeout=30)
        
        if start_result.returncode != 0:
            print(f"Warning: Failed to start nsys profiling: {start_result.stderr}", file=sys.stderr)
            print("Running command without profiling", file=sys.stderr)
            return subprocess.run(command_str, shell=True).returncode
        
        # Run the user command
        cmd_exit_code = subprocess.run(command_str, shell=True).returncode
        
        # Stop profiling and finalize report
        stop_cmd = ["nsys", "stop", "--output", output_path]
        stop_result = subprocess.run(stop_cmd, capture_output=True, text=True, timeout=60)
        
        if stop_result.returncode != 0:
            print(f"Warning: Failed to stop nsys profiling: {stop_result.stderr}", file=sys.stderr)
        
        return cmd_exit_code
        
    except subprocess.TimeoutExpired:
        print("Warning: nsys profiling timed out, running command without profiling", file=sys.stderr)
        return subprocess.run(command_str, shell=True).returncode
    except Exception as e:
        print(f"Warning: Error during nsys profiling: {e}", file=sys.stderr)
        print("Running command without profiling", file=sys.stderr)
        return subprocess.run(command_str, shell=True).returncode


def _run_amd_profiling(command_str: str, output_path: str) -> int:
    """
    Run command with AMD rocprof profiling.
    
    Returns:
        Exit code of the command
    """
    # Try rocprof first (simpler, wraps command)
    if shutil.which("rocprof"):
        try:
            # Use rocprof with stats and timestamp for CSV output
            # Output format: CSV with hardware counters
            rocprof_cmd = [
                "rocprof",
                "--stats",
                "--timestamp", "on",
                "--output", output_path,
                "sh", "-c", command_str
            ]
            result = subprocess.run(rocprof_cmd, timeout=None)
            return result.returncode
        except Exception as e:
            print(f"Warning: rocprof failed: {e}, trying rocsys", file=sys.stderr)
    
    # Fallback to rocsys for background daemon mode
    if shutil.which("rocsys"):
        try:
            session_name = f"tfl_profile_{os.getpid()}"
            
            # Launch session (creates session and halts until started)
            launch_cmd = ["rocsys", "--session", session_name, "launch"]
            launch_result = subprocess.run(launch_cmd, capture_output=True, text=True, timeout=30)
            
            if launch_result.returncode != 0:
                print(f"Warning: Failed to launch rocsys session: {launch_result.stderr}", file=sys.stderr)
                print("Running command without profiling", file=sys.stderr)
                return subprocess.run(command_str, shell=True).returncode
            
            # Start profiling
            start_cmd = ["rocsys", "--session", session_name, "start", "--output", output_path]
            start_result = subprocess.run(start_cmd, capture_output=True, text=True, timeout=30)
            
            if start_result.returncode != 0:
                print(f"Warning: Failed to start rocsys profiling: {start_result.stderr}", file=sys.stderr)
                # Try to exit session
                subprocess.run(["rocsys", "--session", session_name, "exit"], timeout=10)
                return subprocess.run(command_str, shell=True).returncode
            
            # Run user command
            cmd_exit_code = subprocess.run(command_str, shell=True).returncode
            
            # Stop profiling
            stop_cmd = ["rocsys", "--session", session_name, "stop"]
            subprocess.run(stop_cmd, timeout=30)
            
            # Exit session and finalize
            exit_cmd = ["rocsys", "--session", session_name, "exit"]
            subprocess.run(exit_cmd, timeout=30)
            
            return cmd_exit_code
            
        except Exception as e:
            print(f"Warning: Error during rocsys profiling: {e}", file=sys.stderr)
            print("Running command without profiling", file=sys.stderr)
            return subprocess.run(command_str, shell=True).returncode
    
    # No AMD profiler available
    print("Warning: No AMD profiling tools (rocprof/rocsys) found, running command without profiling", file=sys.stderr)
    return subprocess.run(command_str, shell=True).returncode


def main(argv: List[str] | None = None) -> int:
    """
    GPU profiling wrapper entrypoint.
    
    Usage:
        python -m lab.gpu_profiler -- <command...>
    
    This will:
      - Detect GPU vendor (NVIDIA or AMD)
      - Start appropriate profiling tool
      - Run the user command
      - Stop profiling and save report to job directory
      - Update job_data with profiling metadata
    """
    args = list(sys.argv[1:] if argv is None else argv)
    
    # Support "python -m lab.gpu_profiler -- <cmd ...>" style invocation
    if "--" in args:
        sep_index = args.index("--")
        cmd_parts = args[sep_index + 1 :]
    else:
        cmd_parts = args
    
    if not cmd_parts:
        print("Usage: python -m lab.gpu_profiler -- <command...>", file=sys.stderr)
        return 1
    
    command_str = " ".join(cmd_parts)
    
    # Get job ID from environment
    job_id = os.environ.get("_TFL_JOB_ID")
    if not job_id:
        print("Warning: _TFL_JOB_ID not set, running command without profiling", file=sys.stderr)
        return subprocess.run(command_str, shell=True).returncode
    
    # Detect GPU vendor
    vendor = _detect_gpu_vendor()
    if not vendor:
        print("Warning: No GPU detected, running command without profiling", file=sys.stderr)
        return subprocess.run(command_str, shell=True).returncode
    
    # Get job directory for storing profiling output
    try:
        job = Job(job_id)
        job_dir = asyncio.run(job.get_dir())
    except Exception as e:
        print(f"Warning: Failed to get job directory: {e}, running command without profiling", file=sys.stderr)
        return subprocess.run(command_str, shell=True).returncode
    
    # Determine output file path and format based on vendor
    if vendor == "nvidia":
        output_filename = "gpu_profile.nsys-rep"
        file_format = ".nsys-rep"
    else:  # AMD
        # Try CSV format first (rocprof), fallback to rocpd if using rocsys
        output_filename = "gpu_profile.csv"
        file_format = ".csv"
        if not shutil.which("rocprof") and shutil.which("rocsys"):
            output_filename = "gpu_profile.rocpd"
            file_format = ".rocpd"
    
    output_path = storage.join(job_dir, output_filename)
    
    # Ensure job directory exists
    try:
        asyncio.run(storage.makedirs(job_dir, exist_ok=True))
    except Exception as e:
        print(f"Warning: Failed to create job directory: {e}", file=sys.stderr)
        # Continue anyway - storage might handle this
    
    # Run profiling based on vendor
    try:
        if vendor == "nvidia":
            exit_code = _run_nvidia_profiling(command_str, output_path)
        else:  # AMD
            exit_code = _run_amd_profiling(command_str, output_path)
        
        # Update job_data with profiling metadata if profiling succeeded
        # Check if output file was created
        try:
            if asyncio.run(storage.exists(output_path)):
                asyncio.run(_update_job_profile_metadata(job_id, output_path, vendor, file_format))
        except Exception:
            # Best-effort metadata update
            pass
        
        return exit_code
        
    except Exception as e:
        print(f"Warning: Error during profiling: {e}, running command without profiling", file=sys.stderr)
        return subprocess.run(command_str, shell=True).returncode


if __name__ == "__main__":
    raise SystemExit(main())
