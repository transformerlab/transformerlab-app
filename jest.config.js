/** @type {import('jest').Config} */
const config = {
  moduleDirectories: ['node_modules', 'src'],
  moduleFileExtensions: ['js', 'jsx', 'ts', 'tsx', 'json'],
  moduleNameMapper: {
    '\\.(jpg|jpeg|png|gif|eot|otf|webp|svg|ttf|woff|woff2|mp4|webm|wav|mp3|m4a|aac|oga)$':
      '<rootDir>/.erb/mocks/fileMock.js',
    '\\.(css|less|sass|scss)$': 'identity-obj-proxy',
    '^react-markdown$': '<rootDir>/.erb/mocks/reactMarkdownMock.js',
    '^remark-gfm$': '<rootDir>/.erb/mocks/remarkGfmMock.js',
    '^rehype-raw$': '<rootDir>/.erb/mocks/rehypeRawMock.js',
    '^react-syntax-highlighter$': '<rootDir>/.erb/mocks/reactSyntaxHighlighterMock.js',
    '^react-syntax-highlighter/dist/esm/styles/prism$': '<rootDir>/.erb/mocks/prismStylesMock.js',
    '^three/examples/jsm/controls/OrbitControls$': '<rootDir>/.erb/mocks/threeMock.js',
    '^@nivo/bar$': '<rootDir>/.erb/mocks/nivoMock.js',
    '^@nivo/line$': '<rootDir>/.erb/mocks/nivoMock.js',
    '^@nivo/radar$': '<rootDir>/.erb/mocks/nivoMock.js',
    '^@nivo/core$': '<rootDir>/.erb/mocks/nivoMock.js',
    '^@xterm/xterm$': '<rootDir>/.erb/mocks/xtermMock.js',
    '^@xterm/addon-fit$': '<rootDir>/.erb/mocks/xtermFitMock.js',
  },
  testEnvironment: 'jsdom',
  testEnvironmentOptions: {
    url: 'http://localhost/',
  },
  setupFilesAfterEnv: ['<rootDir>/.erb/mocks/setupTests.js'],
  testPathIgnorePatterns: ['api/', 'node_modules/'],
  transform: {
    '\\.(ts|tsx|js|jsx)$': 'ts-jest',
  },
  transformIgnorePatterns: [
    '/node_modules/(?!(@segment|@sentry|lucide-react)/)',
  ],
};

export default config;
