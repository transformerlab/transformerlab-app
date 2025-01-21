import { useColorScheme } from '@mui/joy/styles';
import IconButton from '@mui/joy/IconButton';
import { MoonIcon, SunIcon } from 'lucide-react';
import { windowsStore } from 'process';
import { useState } from 'react';

export default function ColorSchemeToggle({ themeSetter }) {
  const { mode, setMode } = useColorScheme();
  const [count, setCount] = useState(0);

  window.darkMode.onUpdate((isDarkMode) => {
    console.log('Dark mode is now', isDarkMode ? 'on' : 'off');
    // setMode(isDarkMode ? 'dark' : 'light');
  });

  return (
    <IconButton
      variant="plain"
      onClick={async () => {
        // const isDarkMode = await window.darkMode.toggle();
        // console.log('Dark mode is now', isDarkMode ? 'on' : 'off');
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
