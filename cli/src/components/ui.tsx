import { Box, Text } from 'ink';
import Gradient from 'ink-gradient';
import Spinner from 'ink-spinner';

const CUSTOM_ASCII = `
 _____                    __
|_   _|                  / _|
  | |_ __ __ _ _ __  ___| |_ ___  _ __ _ __ ___   ___ _ __
  | | '__/ _\` | '_ \\/ __|  _/ _ \\| '__| '_ \` _ \\ / _ \\ '__|
  | | | | (_| | | | \\__ \\ || (_) | |  | | | | | |  __/ |
  \\_/_|  \\__,_|_| |_|___/_| \\___/|_|  |_| |_| |_|\\___|_|
    _           _
   | |         | |
   | |     __ _| |__
   | |    / _\` | '_ \\
   | |___| (_| | |_) |
   \\_____/\\__,_|_.__/
`;

export const NotImplemented = ({ feature }: { feature: string }) => (
  <Box
    flexDirection="column"
    borderStyle="round"
    borderColor="gray"
    paddingX={1}
    marginBottom={1}
  >
    <Text bold color="yellow">
      🚧 Feature Not Implemented: {feature}
    </Text>
    <Box marginTop={1}>
      <Text>This feature is planned but not yet available in the CLI.</Text>
    </Box>
    <Box marginTop={1}>
      <Text dimColor>Want this feature prioritized? </Text>
      <Text dimColor>Open an issue at: </Text>
      <Text underline color="cyan">
        https://github.com/transformerlab/lab-cli/issues
      </Text>
    </Box>
  </Box>
);

export const Logo = () => (
  <Box flexDirection="column" paddingBottom={1}>
    <Text>🔬 Transformer Lab</Text>
  </Box>
);

export const Loading = ({ text }: { text: string }) => (
  <Box>
    <Text color="cyan">
      <Spinner type="dots" />{' '}
    </Text>
    <Text dimColor> {text}</Text>
  </Box>
);

export const ErrorMsg = ({
  text,
  detail,
}: {
  text: string;
  detail?: string;
}) => (
  <Box
    flexDirection="column"
    borderStyle="round"
    borderColor="red"
    paddingX={1}
    marginBottom={1}
    alignSelf="flex-start"
  >
    <Text bold color="red">
      ERROR: {text}
    </Text>
    {detail && <Text color="yellow">{detail}</Text>}
  </Box>
);

export const SuccessMsg = ({ text }: { text: string }) => (
  <Box paddingY={0} marginBottom={1}>
    <Text color="green">✔ {text}</Text>
  </Box>
);

export const Panel = ({ title, children, color = 'white' }: any) => (
  <Box
    flexDirection="column"
    borderStyle="round"
    borderColor={color}
    paddingX={1}
    marginBottom={1}
    alignSelf="flex-start"
  >
    {title && (
      <Box marginTop={-1} paddingX={1}>
        <Text bold color={color}>
          {' '}
          {title}{' '}
        </Text>
      </Box>
    )}
    {children}
  </Box>
);
