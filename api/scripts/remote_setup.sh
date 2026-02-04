#!/bin/sh
# Remote Setup Script for Compute Provider Machines
# This script installs essential tools and sets up the Python environment
# for Transformer Lab on remote compute provider instances.
#
# Usage:
#   curl -sSL https://lab.cloud/remote_setup.sh | sh
#   curl -sSL https://lab.cloud/remote_setup.sh | sh -s -- [OPTIONS]
#
# Core steps (run every time): OS detection, essential tools, Python 3.11+, pip,
# uv, venv at ~/.venv, and transformerlab package. This matches what launch-time
# setup expects (e.g. copy_file_mounts runs "pip install -q transformerlab && ...").
#
# Optional steps (run only when flags are passed):
#   --aws                  Set up ~/.aws and write credentials. Credentials from
#                          env (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY) or
#                          --aws-access-key-id=, --aws-secret-access-key= (env preferred).
#                          Optional --aws-profile=NAME (default transformerlab-s3).
#   --github-url=URL       Clone a repo into current dir. Optional:
#                          --github-dir=DIR (sparse checkout),
#                          --github-branch=BRANCH,
#                          --github-pat=TOKEN (or set GITHUB_PAT in env; env is preferred for security).
#   --copy-file-mounts     Run lab.copy_file_mounts() (copies task dir to ~/src). Requires _TFL_JOB_ID in env (e.g. when run at launch).
#   --ssh-authorized-key=KEY   Append KEY to ~/.ssh/authorized_keys (one line).
#   --help                 Show this usage and exit.

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Optional steps (set by args)
DO_AWS=false
AWS_ACCESS_KEY_ID_ARG=""
AWS_SECRET_ACCESS_KEY_ARG=""
AWS_PROFILE_ARG=""   # default transformerlab-s3 (or AWS_PROFILE env)
GITHUB_URL=""
GITHUB_DIR=""
GITHUB_BRANCH=""
GITHUB_PAT_ARG=""   # PAT from --github-pat= (env GITHUB_PAT takes precedence when set)
DO_COPY_FILE_MOUNTS=false
SSH_AUTHORIZED_KEY=""

# Helper functions
info() {
    printf "${BLUE}[INFO]${NC} %s\n" "$1"
}

success() {
    printf "${GREEN}[SUCCESS]${NC} %s\n" "$1"
}

warn() {
    printf "${YELLOW}[WARN]${NC} %s\n" "$1"
}

error() {
    printf "${RED}[ERROR]${NC} %s\n" "$1" >&2
}

# Detect OS and package manager
detect_os() {
    OS="$(uname -s)"
    ARCH="$(uname -m)"

    if [ "${OS}" = "Linux" ]; then
        # Detect Linux distribution
        if command -v apt-get >/dev/null 2>&1; then
            PKG_MANAGER="apt"
            INSTALL_CMD="sudo apt-get install -y"
            UPDATE_CMD="sudo apt-get update"
        elif command -v yum >/dev/null 2>&1; then
            PKG_MANAGER="yum"
            INSTALL_CMD="sudo yum install -y"
            UPDATE_CMD="sudo yum check-update || true"
        elif command -v dnf >/dev/null 2>&1; then
            PKG_MANAGER="dnf"
            INSTALL_CMD="sudo dnf install -y"
            UPDATE_CMD="sudo dnf check-update || true"
        else
            error "Unsupported Linux distribution. Please install dependencies manually."
            exit 1
        fi
        info "Detected Linux with ${PKG_MANAGER}"
    elif [ "${OS}" = "Darwin" ]; then
        PKG_MANAGER="brew"
        if ! command -v brew >/dev/null 2>&1; then
            error "Homebrew is not installed. Please install Homebrew first:"
            echo "  /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
            exit 1
        fi
        INSTALL_CMD="brew install"
        UPDATE_CMD="brew update"
        info "Detected macOS with Homebrew"
    else
        error "Unsupported operating system: ${OS}"
        exit 1
    fi
}

# Check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Install a package if it doesn't exist
install_if_missing() {
    cmd=$1
    if [ $# -ge 2 ]; then
        pkg_name=$2
    else
        pkg_name=$1
    fi

    if command_exists "$cmd"; then
        success "$cmd is already installed"
    else
        info "Installing $pkg_name..."
        if [ "$PKG_MANAGER" = "apt" ]; then
            $INSTALL_CMD "$pkg_name" || {
                error "Failed to install $pkg_name"
                exit 1
            }
        elif [ "$PKG_MANAGER" = "yum" ] || [ "$PKG_MANAGER" = "dnf" ]; then
            $INSTALL_CMD "$pkg_name" || {
                error "Failed to install $pkg_name"
                exit 1
            }
        elif [ "$PKG_MANAGER" = "brew" ]; then
            $INSTALL_CMD "$pkg_name" || {
                error "Failed to install $pkg_name"
                exit 1
            }
        fi
        success "$pkg_name installed successfully"
    fi
}

# Install essential tools
install_essential_tools() {
    info "Installing essential tools..."

    if [ "$PKG_MANAGER" = "apt" ]; then
        $UPDATE_CMD
        install_if_missing curl curl
        install_if_missing wget wget
        install_if_missing git git
    elif [ "$PKG_MANAGER" = "yum" ] || [ "$PKG_MANAGER" = "dnf" ]; then
        $UPDATE_CMD
        install_if_missing curl curl
        install_if_missing wget wget
        install_if_missing git git
    elif [ "$PKG_MANAGER" = "brew" ]; then
        install_if_missing curl curl
        install_if_missing wget wget
        install_if_missing git git
    fi
}

# Install Python and pip
install_python() {
    info "Checking Python installation..."

    # Check for Python 3.11 or higher
    if command_exists python3; then
        PYTHON_VERSION=$(python3 --version 2>&1 | awk '{print $2}')
        PYTHON_MAJOR=$(echo "$PYTHON_VERSION" | cut -d. -f1)
        PYTHON_MINOR=$(echo "$PYTHON_VERSION" | cut -d. -f2)

        if [ "$PYTHON_MAJOR" -ge 3 ] && [ "$PYTHON_MINOR" -ge 11 ]; then
            success "Python $PYTHON_VERSION is installed (meets requirement >=3.11)"
        else
            warn "Python $PYTHON_VERSION is installed but version 3.11+ is required"
            info "Attempting to install Python 3.11+..."
            install_python_package
        fi
    else
        info "Python 3 is not installed. Installing..."
        install_python_package
    fi

    # Ensure pip is available
    if ! command_exists pip3 && ! python3 -m pip --version >/dev/null 2>&1; then
        info "pip is not available. Installing pip..."
        if [ "$PKG_MANAGER" = "apt" ]; then
            $INSTALL_CMD python3-pip || {
                error "Failed to install python3-pip"
                exit 1
            }
        elif [ "$PKG_MANAGER" = "yum" ] || [ "$PKG_MANAGER" = "dnf" ]; then
            $INSTALL_CMD python3-pip || {
                error "Failed to install python3-pip"
                exit 1
            }
        elif [ "$PKG_MANAGER" = "brew" ]; then
            # pip usually comes with Python on macOS via Homebrew
            python3 -m ensurepip --upgrade || {
                error "Failed to install pip"
                exit 1
            }
        fi
        success "pip installed successfully"
    else
        success "pip is available"
    fi

    # Create python symlink if it doesn't exist (for convenience)
    if ! command_exists python && command_exists python3; then
        info "Creating python symlink to python3..."
        PYTHON3_PATH=$(command -v python3)

        # Try to create symlink in /usr/local/bin first (system-wide)
        if [ -w /usr/local/bin ]; then
            ln -sf "$PYTHON3_PATH" /usr/local/bin/python 2>/dev/null && {
                success "Created python symlink in /usr/local/bin"
            } || {
                warn "Failed to create symlink in /usr/local/bin, trying ~/.local/bin"
                mkdir -p "$HOME/.local/bin"
                ln -sf "$PYTHON3_PATH" "$HOME/.local/bin/python" 2>/dev/null && {
                    success "Created python symlink in ~/.local/bin"
                    export PATH="$HOME/.local/bin:$PATH"
                    # Add to shell profile for future sessions
                    if [ -f "$HOME/.bashrc" ] && ! grep -q '\.local/bin' "$HOME/.bashrc"; then
                        echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$HOME/.bashrc"
                    fi
                    if [ -f "$HOME/.zshrc" ] && ! grep -q '\.local/bin' "$HOME/.zshrc"; then
                        echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$HOME/.zshrc"
                    fi
                } || {
                    warn "Could not create python symlink. You may need to use 'python3' instead of 'python'"
                }
            }
        else
            # Try ~/.local/bin if /usr/local/bin is not writable
            mkdir -p "$HOME/.local/bin"
            ln -sf "$PYTHON3_PATH" "$HOME/.local/bin/python" 2>/dev/null && {
                success "Created python symlink in ~/.local/bin"
                export PATH="$HOME/.local/bin:$PATH"
                # Add to shell profile for future sessions
                if [ -f "$HOME/.bashrc" ] && ! grep -q '\.local/bin' "$HOME/.bashrc"; then
                    echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$HOME/.bashrc"
                fi
                if [ -f "$HOME/.zshrc" ] && ! grep -q '\.local/bin' "$HOME/.zshrc"; then
                    echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$HOME/.zshrc"
                fi
            } || {
                warn "Could not create python symlink. You may need to use 'python3' instead of 'python'"
            }
        fi
    elif command_exists python; then
        success "python command is already available"
    fi
}

# Install Python package based on OS
install_python_package() {
    if [ "$PKG_MANAGER" = "apt" ]; then
        # Try to install python3.11 or python3.12
        if $INSTALL_CMD python3.11 python3-pip >/dev/null 2>&1; then
            success "Python 3.11 installed"
        elif $INSTALL_CMD python3.12 python3-pip >/dev/null 2>&1; then
            success "Python 3.12 installed"
        else
            # Fallback to default python3
            $INSTALL_CMD python3 python3-pip || {
                error "Failed to install Python 3"
                exit 1
            }
            warn "Installed default Python 3. Please verify version >= 3.11"
        fi
    elif [ "$PKG_MANAGER" = "yum" ] || [ "$PKG_MANAGER" = "dnf" ]; then
        # For RHEL/CentOS, try to install python3.11 from EPEL or use default
        $INSTALL_CMD python3 python3-pip || {
            error "Failed to install Python 3"
            exit 1
        }
        warn "Installed default Python 3. Please verify version >= 3.11"
    elif [ "$PKG_MANAGER" = "brew" ]; then
        $INSTALL_CMD python@3.11 >/dev/null 2>&1 || $INSTALL_CMD python@3.12 >/dev/null 2>&1 || {
            error "Failed to install Python 3.11+"
            exit 1
        }
        success "Python 3.11+ installed via Homebrew"
    fi
}

# Install build tools (needed for compiling Python packages)
install_build_tools() {
    info "Checking build tools..."

    if [ "$PKG_MANAGER" = "apt" ]; then
        if ! command_exists gcc || ! command_exists g++; then
            info "Installing build-essential..."
            $INSTALL_CMD build-essential || {
                warn "Failed to install build-essential. Some Python packages may fail to compile."
            }
        else
            success "Build tools are available"
        fi
    elif [ "$PKG_MANAGER" = "yum" ] || [ "$PKG_MANAGER" = "dnf" ]; then
        if ! command_exists gcc || ! command_exists g++; then
            info "Installing development tools..."
            $INSTALL_CMD gcc gcc-c++ make || {
                warn "Failed to install build tools. Some Python packages may fail to compile."
            }
        else
            success "Build tools are available"
        fi
    elif [ "$PKG_MANAGER" = "brew" ]; then
        # macOS usually has Xcode command line tools
        if ! command_exists gcc; then
            warn "Xcode command line tools may not be installed."
            info "Run: xcode-select --install"
        else
            success "Build tools are available"
        fi
    fi
}

# Install uv
install_uv() {
    info "Installing uv..."

    if command_exists uv; then
        UV_VERSION=$(uv --version 2>&1 || echo "unknown")
        success "uv is already installed: $UV_VERSION"
    else
        # Install uv using the official installer
        info "Downloading and installing uv..."
        curl -LsSf https://astral.sh/uv/install.sh | sh

        # Add uv to PATH for current session
        export PATH="$HOME/.cargo/bin:$PATH"

        # Also add to shell profile for future sessions
        if [ -f "$HOME/.bashrc" ] && ! grep -q '\.cargo/bin' "$HOME/.bashrc"; then
            echo 'export PATH="$HOME/.cargo/bin:$PATH"' >> "$HOME/.bashrc"
        fi
        if [ -f "$HOME/.zshrc" ] && ! grep -q '\.cargo/bin' "$HOME/.zshrc"; then
            echo 'export PATH="$HOME/.cargo/bin:$PATH"' >> "$HOME/.zshrc"
        fi

        # Verify installation
        if command_exists uv || "$HOME/.cargo/bin/uv" --version >/dev/null 2>&1; then
            success "uv installed successfully"
        else
            error "Failed to install uv"
            exit 1
        fi
    fi
}

# Setup uv virtual environment
setup_uv_venv() {
    info "Setting up uv virtual environment at ~/.venv..."

    # Ensure uv is in PATH
    export PATH="$HOME/.cargo/bin:$PATH"

    # Use uv directly if in PATH, otherwise use full path
    UV_CMD="uv"
    if ! command_exists uv; then
        UV_CMD="$HOME/.cargo/bin/uv"
    fi

    # Check if venv already exists
    if [ -d "$HOME/.venv" ]; then
        warn "Virtual environment already exists at ~/.venv"
        info "Skipping venv creation. To recreate, delete ~/.venv first."
    else
        info "Creating virtual environment..."
        # Get Python path
        PYTHON_CMD="python3"
        if command_exists python && python --version >/dev/null 2>&1; then
            PYTHON_CMD="python"
        fi

        $UV_CMD venv "$HOME/.venv" --python "$PYTHON_CMD" || {
            error "Failed to create virtual environment"
            exit 1
        }
        success "Virtual environment created at ~/.venv"
    fi

    # Display activation instructions
    info "To activate the virtual environment, run:"
    echo "  source ~/.venv/bin/activate"
    echo ""
    echo "Or use uv directly:"
    echo "  uv run <command>"
}

# Install transformerlab package
install_transformerlab() {
    info "Installing transformerlab package..."

    # Ensure uv is in PATH
    export PATH="$HOME/.cargo/bin:$PATH"

    # Use uv directly if in PATH, otherwise use full path
    UV_CMD="uv"
    if ! command_exists uv; then
        UV_CMD="$HOME/.cargo/bin/uv"
    fi

    # Install transformerlab using uv pip with the venv's python
    if [ -d "$HOME/.venv" ]; then
        $UV_CMD pip install --python "$HOME/.venv/bin/python" transformerlab || {
            error "Failed to install transformerlab"
            exit 1
        }
        success "transformerlab installed successfully"
    else
        error "Virtual environment not found at ~/.venv"
        exit 1
    fi
}

# ----- Optional steps (match launch-time setup) -----

# Set up AWS credentials (matches _generate_aws_credentials_setup in compute_provider.py).
# Credentials from env AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY or from --aws-access-key-id= / --aws-secret-access-key= (env preferred).
setup_aws() {
    info "Setting up AWS configuration..."
    PROFILE="${AWS_PROFILE_ARG:-${AWS_PROFILE:-transformerlab-s3}}"
    # Prefer env so credentials are not in process list / shell history
    AK="${AWS_ACCESS_KEY_ID:-$AWS_ACCESS_KEY_ID_ARG}"
    SK="${AWS_SECRET_ACCESS_KEY:-$AWS_SECRET_ACCESS_KEY_ARG}"
    if [ -z "$AK" ] || [ -z "$SK" ]; then
        warn "AWS credentials not set. Use env (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY) or --aws-access-key-id=, --aws-secret-access-key= with --aws"
        mkdir -p "$HOME/.aws"
        chmod 700 "$HOME/.aws"
        return 0
    fi
    # Strip newlines/carriage returns (safe for credentials file)
    AK=$(echo "$AK" | tr -d '\n\r')
    SK=$(echo "$SK" | tr -d '\n\r')
    mkdir -p "$HOME/.aws"
    chmod 700 "$HOME/.aws"
    if [ -f "$HOME/.aws/credentials" ]; then
        # Remove existing profile section (same logic as _generate_aws_credentials_setup)
        awk -v p="$PROFILE" 'BEGIN{in_profile=0} $0=="["p"]"{in_profile=1;next} /^\[/{in_profile=0} !in_profile{print}' \
            "$HOME/.aws/credentials" > "$HOME/.aws/credentials.new" 2>/dev/null && \
            mv "$HOME/.aws/credentials.new" "$HOME/.aws/credentials" || true
    fi
    echo "[${PROFILE}]" >> "$HOME/.aws/credentials"
    echo "aws_access_key_id=${AK}" >> "$HOME/.aws/credentials"
    echo "aws_secret_access_key=${SK}" >> "$HOME/.aws/credentials"
    chmod 600 "$HOME/.aws/credentials"
    success "AWS profile '${PROFILE}' configured successfully"
}

# Run lab.copy_file_mounts() (same as launch-time COPY_FILE_MOUNTS_SETUP). Requires _TFL_JOB_ID in env.
setup_copy_file_mounts() {
    info "Running copy_file_mounts (task dir -> ~/src)..."
    if [ -z "${_TFL_JOB_ID}" ]; then
        warn "_TFL_JOB_ID is not set; copy_file_mounts may fail or no-op. Set it when running at launch."
    fi
    export PATH="$HOME/.cargo/bin:$PATH"
    if [ -x "$HOME/.venv/bin/python" ]; then
        "$HOME/.venv/bin/python" -c "from lab import lab; lab.copy_file_mounts()" || {
            error "copy_file_mounts failed"
            exit 1
        }
    else
        pip install -q transformerlab && python -c "from lab import lab; lab.copy_file_mounts()" || {
            error "copy_file_mounts failed"
            exit 1
        }
    fi
    success "copy_file_mounts completed"
}

# Clone GitHub repo (optional dir/branch; PAT from env GITHUB_PAT or --github-pat=)
setup_github_clone() {
    if [ -z "$GITHUB_URL" ]; then
        return 0
    fi
    # Prefer env GITHUB_PAT so PAT is not in process list / shell history
    GIT_PAT="${GITHUB_PAT:-$GITHUB_PAT_ARG}"
    info "Cloning GitHub repository: $GITHUB_URL"
    CLONE_DIR="/tmp/git-clone-$$"
    CURRENT_DIR="$PWD"
    if [ -n "$GIT_PAT" ]; then
        if echo "$GITHUB_URL" | grep -q '^https://github.com/'; then
            AUTH_URL="https://${GIT_PAT}@github.com/${GITHUB_URL#https://github.com/}"
        else
            AUTH_URL="https://${GIT_PAT}@${GITHUB_URL#https://}"
        fi
    else
        AUTH_URL="$GITHUB_URL"
    fi
    mkdir -p "$CLONE_DIR"
    cd "$CLONE_DIR"
    if [ -n "$GITHUB_DIR" ]; then
        git init
        git remote add origin "$AUTH_URL"
        git config core.sparseCheckout true
        echo "${GITHUB_DIR}/" > .git/info/sparse-checkout
        if [ -n "$GITHUB_BRANCH" ]; then
            git pull origin "$GITHUB_BRANCH" || git pull origin main || git pull origin master || git pull origin HEAD
        else
            git pull origin main || git pull origin master || git pull origin HEAD
        fi
        if [ -d "$GITHUB_DIR" ]; then
            cp -r "$GITHUB_DIR" "$CURRENT_DIR/"
            success "Cloned directory ${GITHUB_DIR} into ${CURRENT_DIR}"
        else
            warn "Directory ${GITHUB_DIR} not found in repository"
        fi
    else
        if [ -n "$GITHUB_BRANCH" ]; then
            git clone -b "$GITHUB_BRANCH" "$AUTH_URL" repo_tmp
        else
            git clone "$AUTH_URL" repo_tmp
        fi
        cp -r repo_tmp/. "$CURRENT_DIR/"
        success "Cloned repository into ${CURRENT_DIR}"
    fi
    cd "$CURRENT_DIR"
    rm -rf "$CLONE_DIR"
}

# Append SSH public key to authorized_keys
setup_ssh_authorized_key() {
    if [ -z "$SSH_AUTHORIZED_KEY" ]; then
        return 0
    fi
    info "Adding SSH authorized key..."
    mkdir -p "$HOME/.ssh"
    chmod 700 "$HOME/.ssh"
    if [ ! -f "$HOME/.ssh/authorized_keys" ]; then
        touch "$HOME/.ssh/authorized_keys"
        chmod 600 "$HOME/.ssh/authorized_keys"
    fi
    KEY_LINE=$(echo "$SSH_AUTHORIZED_KEY" | tr -d '\n\r')
    if grep -qF "$KEY_LINE" "$HOME/.ssh/authorized_keys" 2>/dev/null; then
        success "SSH key already present in authorized_keys"
    else
        echo "$KEY_LINE" >> "$HOME/.ssh/authorized_keys"
        success "SSH key added to authorized_keys"
    fi
}

show_usage() {
    echo "Usage: curl -sSL https://lab.cloud/remote_setup.sh | sh -s -- [OPTIONS]"
    echo ""
    echo "Core (always run): essential tools, Python 3.11+, uv, ~/.venv, transformerlab."
    echo ""
    echo "Optional (run only when specified):"
    echo "  --aws                      Set up ~/.aws and write credentials (env or args below)"
    echo "  --aws-access-key-id=KEY    AWS access key (prefer env AWS_ACCESS_KEY_ID)"
    echo "  --aws-secret-access-key=SECRET  AWS secret key (prefer env AWS_SECRET_ACCESS_KEY)"
    echo "  --aws-profile=NAME         Profile name (default: transformerlab-s3)"
    echo "  --github-url=URL           Clone repo into current dir"
    echo "  --github-dir=DIR           Sparse-checkout only DIR (use with --github-url)"
    echo "  --github-branch=BRANCH     Branch/tag to checkout (use with --github-url)"
    echo "  --github-pat=TOKEN         GitHub PAT for private repos (prefer env GITHUB_PAT to avoid token in process list)"
    echo "  --copy-file-mounts         Run lab.copy_file_mounts() (requires _TFL_JOB_ID in env, e.g. at launch)"
    echo "  --ssh-authorized-key=KEY   Append KEY to ~/.ssh/authorized_keys"
    echo "  --help                     Show this message and exit"
    echo ""
    echo "Examples:"
    echo "  curl -sSL https://lab.cloud/remote_setup.sh | sh"
    echo "  curl -sSL https://lab.cloud/remote_setup.sh | sh -s -- --aws"
    echo "  curl -sSL https://lab.cloud/remote_setup.sh | sh -s -- --aws --aws-access-key-id=AKIA... --aws-secret-access-key=..."
    echo "  curl -sSL https://lab.cloud/remote_setup.sh | sh -s -- --github-url=https://github.com/org/repo --github-branch=main"
    echo "  GITHUB_PAT=xxx curl -sSL ... | sh -s -- --github-url=https://github.com/org/private-repo   # private repo (PAT from env)"
    echo "  curl -sSL https://lab.cloud/remote_setup.sh | sh -s -- --ssh-authorized-key=\"\$(cat mykey.pub)\""
}

# Parse arguments (POSIX-friendly)
parse_args() {
    while [ $# -gt 0 ]; do
        case "$1" in
            --aws)
                DO_AWS=true
                shift
                ;;
            --aws-access-key-id=*)
                AWS_ACCESS_KEY_ID_ARG="${1#--aws-access-key-id=}"
                shift
                ;;
            --aws-secret-access-key=*)
                AWS_SECRET_ACCESS_KEY_ARG="${1#--aws-secret-access-key=}"
                shift
                ;;
            --aws-profile=*)
                AWS_PROFILE_ARG="${1#--aws-profile=}"
                shift
                ;;
            --github-url=*)
                GITHUB_URL="${1#--github-url=}"
                shift
                ;;
            --github-dir=*)
                GITHUB_DIR="${1#--github-dir=}"
                shift
                ;;
            --github-branch=*)
                GITHUB_BRANCH="${1#--github-branch=}"
                shift
                ;;
            --github-pat=*)
                GITHUB_PAT_ARG="${1#--github-pat=}"
                shift
                ;;
            --copy-file-mounts)
                DO_COPY_FILE_MOUNTS=true
                shift
                ;;
            --ssh-authorized-key=*)
                SSH_AUTHORIZED_KEY="${1#--ssh-authorized-key=}"
                shift
                ;;
            --help|-h)
                show_usage
                exit 0
                ;;
            *)
                warn "Unknown option: $1"
                shift
                ;;
        esac
    done
}

# Main execution
main() {
    echo ""
    echo "=========================================="
    echo "  Transformer Lab Remote Setup Script"
    echo "=========================================="
    echo ""

    parse_args "$@"

    # Core steps (run every time)
    detect_os
    install_essential_tools
    install_build_tools
    install_python
    install_uv
    setup_uv_venv
    install_transformerlab

    # Optional steps (only when flags were passed)
    if [ "$DO_AWS" = true ]; then
        setup_aws
    fi
    if [ -n "$GITHUB_URL" ]; then
        setup_github_clone
    fi
    if [ "$DO_COPY_FILE_MOUNTS" = true ]; then
        setup_copy_file_mounts
    fi
    if [ -n "$SSH_AUTHORIZED_KEY" ]; then
        setup_ssh_authorized_key
    fi

    echo ""
    echo "=========================================="
    success "Transformer Lab setup completed successfully!"
    echo "=========================================="
    echo ""
    echo "  Activate the virtual environment:"
    echo "     source ~/.venv/bin/activate"
    echo ""
}

# Run main function with all script arguments
main "$@"
