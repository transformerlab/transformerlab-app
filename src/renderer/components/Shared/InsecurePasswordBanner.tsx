import { Box, Typography } from '@mui/joy';
import { AlertTriangle } from 'lucide-react';
import { useAuth } from '../../lib/authContext';

export default function InsecurePasswordBanner() {
  const { isDefaultPassword } = useAuth();

  if (!isDefaultPassword) {
    return null;
  }

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 1,
        px: 2,
        py: 1,
        backgroundColor: 'var(--joy-palette-danger-500, #c41c1c)',
        color: '#fff',
        width: '100%',
        zIndex: 9999,
      }}
    >
      <AlertTriangle size={16} />
      <Typography level="body-sm" sx={{ color: 'inherit', fontWeight: 600 }}>
        You are using a default insecure password. Please change it in User
        Settings.
      </Typography>
    </Box>
  );
}
