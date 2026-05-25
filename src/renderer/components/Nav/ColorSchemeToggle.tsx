import { useColorScheme } from '@mui/joy/styles';
import IconButton from '@mui/joy/IconButton';
import { MoonIcon, SunIcon } from 'lucide-react';
import { useRef } from 'react';

export default function ColorSchemeToggle({ themeSetter }) {
  const { mode, setMode } = useColorScheme();
  // Only ever read inside the click handler — a ref avoids needless re-renders.
  const countRef = useRef(0);

  return (
    <IconButton
      variant="plain"
      onClick={async () => {
        setMode(mode == 'light' ? 'dark' : 'light');
        countRef.current += 1;
        if (countRef.current > 10 && countRef.current % 2 == 0) {
          themeSetter('purple');
        }
      }}
    >
      {mode === 'light' ? <SunIcon /> : <MoonIcon />}
    </IconButton>
  );
}
