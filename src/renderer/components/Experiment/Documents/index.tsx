import { Sheet } from '@mui/joy';
import Documents from '../../Shared/Documents';

export default function BigDocumentsPage({ experimentInfo }) {
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
      <Documents experimentInfo={experimentInfo} fullPage additionalMessage />
    </Sheet>
  );
}
