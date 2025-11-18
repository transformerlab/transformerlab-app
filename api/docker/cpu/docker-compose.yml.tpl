services:
  transformerlab-api:
    image: transformerlab/api:${VERSION}
    container_name: transformerlab-api
    ports:
      - "8338:8338"
    volumes:
      - transformerlab_data_cpu:/root/.transformerlab/
      - ${HOME}/.cache:/root/.cache
      - ${HOME}/.transformerlab/workspace:/root/.transformerlab/workspace
    restart: unless-stopped
    tty: true
    stdin_open: true

volumes:
  transformerlab_data_cpu: