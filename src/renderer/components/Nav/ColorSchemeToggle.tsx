import { useColorScheme } from '@mui/joy/styles';
import IconButton from '@mui/joy/IconButton';
import { MoonIcon, SunIcon } from 'lucide-react';
import { windowsStore } from 'process';

export default function ColorSchemeToggle() {
  const { mode, setMode } = useColorScheme();

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
      }}
    >
      {mode === 'light' ? <SunIcon /> : <MoonIcon />}
    </IconButton>
  );
}
