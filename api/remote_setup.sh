#!/bin/sh
# Remote Setup Script for Compute Provider Machines
# This script installs essential tools and sets up the Python environment
# for Transformer Lab on remote compute provider instances.

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

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

# Main execution
main() {
    echo ""
    echo "=========================================="
    echo "  Transformer Lab Remote Setup Script"
    echo "=========================================="
    echo ""

    detect_os
    install_essential_tools
    install_build_tools
    install_python
    install_uv
    setup_uv_venv
    install_transformerlab

    echo ""
    echo "=========================================="
    success "Transformer Lab setup completed successfully!"
    echo "=========================================="
    echo ""
    echo "  Activate the virtual environment:"
    echo "     source ~/.venv/bin/activate"
    echo ""
}

# Run main function
main
