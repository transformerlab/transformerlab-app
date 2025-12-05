import React, { useEffect, useRef } from 'react';
import { Box } from '@mui/joy';
import { useColorScheme } from '@mui/joy/styles';
import HexLogo from '../Shared/HexLogo';

interface SpinningLogoProps {
  size?: number;
}

export default function SpinningLogo({ size = 80 }: SpinningLogoProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef<number>();
  const rotationRef = useRef(0);

  const { mode } = useColorScheme();

  const isDark = mode === 'dark';
  const logoStroke = isDark ? '#fff' : '#000';
  const logoFill = isDark ? 'transparent' : '#fff';

  const SLOW_SPEED = 0.4;
  const FAST_SPEED = 2.0;
  const ACCELERATION = 0.5;

  const targetSpeedRef = useRef(SLOW_SPEED);
  const currentSpeedRef = useRef(SLOW_SPEED);

  const animate = () => {
    if (currentSpeedRef.current < targetSpeedRef.current) {
      currentSpeedRef.current = Math.min(
        currentSpeedRef.current + ACCELERATION,
        targetSpeedRef.current
      );
    } else if (currentSpeedRef.current > targetSpeedRef.current) {
      currentSpeedRef.current = Math.max(
        currentSpeedRef.current - ACCELERATION,
        targetSpeedRef.current
      );
    }

    rotationRef.current = (rotationRef.current + currentSpeedRef.current) % 360;

    if (containerRef.current) {
      containerRef.current.style.transform = `rotate(${rotationRef.current}deg)`;
    }

    requestRef.current = requestAnimationFrame(animate);
  };

  useEffect(() => {
    requestRef.current = requestAnimationFrame(animate);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, []);

  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
      <div
        ref={containerRef}
        style={{
          width: `${size}px`,
          height: `${size}px`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          transformOrigin: 'center center',
        }}
        onMouseEnter={() => {
          targetSpeedRef.current = FAST_SPEED;
        }}
        onMouseLeave={() => {
          targetSpeedRef.current = SLOW_SPEED;
        }}
      >
        <HexLogo
          width={size}
          height={size}
          stroke={logoStroke}
          fill={logoFill}
        />
      </div>
    </Box>
  );
}
