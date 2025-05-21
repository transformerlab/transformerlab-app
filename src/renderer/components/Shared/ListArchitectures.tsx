import { Box, Chip } from '@mui/joy';
import TinyMLXLogo from './TinyMLXLogo';
import TinyNVIDIALogo from './TinyNVIDIALogo';

function mapArchitectureToIcon(arch) {
  switch (arch) {
    case 'cuda':
      return <TinyNVIDIALogo />;
    case 'mlx':
      return <TinyMLXLogo />;
    default:
      return (
        <Chip key={arch} color="primary">
          {arch}
        </Chip>
      );
  }
}

export default function ShowArchitectures({ architectures }) {
  if (!architectures) return null;
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      {architectures.map((arch) => (
        <div key={arch}>{mapArchitectureToIcon(arch)}</div>
      ))}
    </Box>
  );
}
