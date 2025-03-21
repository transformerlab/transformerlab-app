import { useColorScheme } from '@mui/joy/styles';
import IconButton from '@mui/joy/IconButton';
import { MoonIcon, SunIcon } from 'lucide-react';
import { windowsStore } from 'process';
import { useState } from 'react';

export default function ColorSchemeToggle({ themeSetter }) {
  const { mode, setMode } = useColorScheme();
  const [count, setCount] = useState(0);

  return (
    <IconButton
      variant="plain"
      onClick={async () => {
        setMode(mode == 'light' ? 'dark' : 'light');
        setCount(count + 1);
        if (count > 10 && count % 2 == 0) {
          themeSetter('purple');
        }
      }}
    >
      {mode === 'light' ? <SunIcon /> : <MoonIcon />}
    </IconButton>
  );
}
