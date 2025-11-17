FROM rocm/dev-ubuntu-22.04:6.4.1

SHELL ["/bin/bash", "--login", "-c"]

# Set noninteractive mode
ENV DEBIAN_FRONTEND=noninteractive

# Install minimal dependencies required for the install script
RUN apt-get update && apt-get install -y \
    curl \
    git \
    python3.11 \
    python3-pip \
    python-is-python3 \
    g++ \
    ninja-build


# Set ROCm environment variables
ENV ROCM_PATH=/opt/rocm
ENV PATH=${ROCM_PATH}/bin:${PATH}
ENV LD_LIBRARY_PATH=${ROCM_PATH}/lib

# Download and run the install.sh script from GitHub.
RUN curl -fsSL https://raw.githubusercontent.com/transformerlab/transformerlab-api/refs/heads/main/install.sh | bash -s download_transformer_lab install_conda create_conda_environment

EXPOSE 8338

VOLUME ["/root/.transformerlab/"]

WORKDIR /root/.transformerlab/src/

RUN chmod +x ./run.sh
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]

# # The entrypoint is set to run the Transformer Lab launcher script.
# ENTRYPOINT ["/bin/bash", "-c", "/root/.transformerlab/src/install.sh install_dependencies && exec /root/.transformerlab/src/run.sh"]