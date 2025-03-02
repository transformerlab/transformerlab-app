module.exports = {
  transformerLab: {
    input: './tmp/openapi.json',
    output: {
      client: 'swr',
      target: './out/',
      httpClient: 'fetch',
      baseUrl: false,
    },
    hooks: {
      afterAllFilesWrite: 'prettier --write',
    },
  },
};
