services:
  transformerlab-api:
    image: transformerlab/api:${VERSION}-cuda
    container_name: transformerlab-api
    ports:
      - "8338:8338"
    ipc: host
    volumes:
      - transformerlab_data:/root/.transformerlab/
      - ${HOME}/.cache:/root/.cache
      - ${HOME}/.transformerlab/workspace:/root/.transformerlab/workspace
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: "all"
              capabilities: [gpu]
    restart: unless-stopped
    tty: true
    stdin_open: true

volumes:
  transformerlab_data: