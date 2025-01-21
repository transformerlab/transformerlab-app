import { extendTheme } from '@mui/joy/styles';

export default extendTheme({
  fontFamily: {
    display: '-apple-system, "system-ui", var(--joy-fontFamily-fallback)',
    body: '-apple-system, "system-ui", var(--joy-fontFamily-fallback)',
  },
  colorSchemes: {
    light: {
      palette: {
        primary: {
          '50': '#ede7f6',
          '100': '#d1c4e9',
          '200': '#b39ddb',
          '300': '#9575cd',
          '400': '#7e57c2',
          '500': '#673ab7',
          '600': '#5e35b1',
          '700': '#512da8',
          '800': '#4527a0',
          '900': '#311b92',
        },
        neutral: {
          '50': '#EEFAFA', //#e0f2f1',
          '100': '#b2dfdb',
          '200': '#80cbc4',
          '300': '#4db6ac',
          '400': '#26a69a',
          '500': '#009688',
          '600': '#00897b',
          '700': '#00796b',
          '800': '#00695c',
          '900': '#004d40',
        },
        danger: {
          '50': '#fff7ed',
          '100': '#ffedd5',
          '200': '#fed7aa',
          '300': '#fdba74',
          '400': '#fb923c',
          '500': '#f97316',
          '600': '#ea580c',
          '700': '#c2410c',
          '800': '#9a3412',
          '900': '#7c2d12',
        },
        background: {
          body: '#0f172a22',
        },
        text: {
          primary: 'rgb(60, 60, 67)',
        },
      },
    },
    dark: {
      palette: {
        primary: {
          '50': '#f8fafc',
          '100': '#f1f5f9',
          '200': '#e2e8f0',
          '300': '#cbd5e1',
          '400': '#94a3b8',
          '500': '#64748b',
          '600': '#475569',
          '700': '#334155',
          '800': '#1e293b',
          '900': '#0f172a',
        },
      },
    },
    dark: {
      palette: {
        primary: {
          '50': '#f8fafc',
          '100': '#f1f5f9',
          '200': '#e2e8f0',
          '300': '#cbd5e1',
          '400': '#94a3b8',
          '500': '#64748b',
          '600': '#475569',
          '700': '#334155',
          '800': '#1e293b',
          '900': '#0f172a',
        },
      },
    },
  },
});
