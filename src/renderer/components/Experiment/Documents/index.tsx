import { Sheet } from '@mui/joy';
import Documents from '../../Shared/Documents';

export default function BigDocumentsPage({}) {
  return (
    <Sheet
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
        pb: 2,
      }}
    >
      <Documents fullPage additionalMessage />
    </Sheet>
  );
}
