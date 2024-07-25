import { Button, Typography } from '@mui/joy';
import React, { ReactNode, MouseEventHandler } from 'react';

export default function TinyButton({
  onClick = () => {},
  color = 'primary',
  variant = 'solid',
  startDecorator = null,
  children,
}) {
  return (
    <Button
      color={color}
      variant={variant}
      sx={{
        height: '20px',
        padding: '4px',
        minHeight: '20px',
        borderRadius: '20%',
        fontSize: '12px',
      }}
      onClick={onClick}
      startDecorator={startDecorator}
    >
      {children}
    </Button>
  );
}
