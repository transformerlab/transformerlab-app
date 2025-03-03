module.exports = {
  transformerLab: {
    input: './tmp/openapi.json',
    output: {
      client: 'swr',
      target: './out/',
      httpClient: 'fetch',
      baseUrl: false,
      mode: 'tags-split',
      docs: {
        out: './docs',
        disableSources: true,
      },
    },
    hooks: {
      afterAllFilesWrite: 'prettier --write',
    },
  },
};
