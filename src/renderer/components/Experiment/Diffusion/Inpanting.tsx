import { Box, Button, ButtonGroup, IconButton, Typography } from '@mui/joy';
import React from 'react';

import ReactCanvasPaint from '../../Shared/ReactCanvasPaint/ReactCanvasPaint';
import 'react-canvas-paint/dist/index.css';
import { EraserIcon, Icon, Pen, PencilIcon } from 'lucide-react';

export default function Inpainting() {
  const [strokeSize, setStrokeSize] = React.useState(5);
  const [drawMode, setDrawMode] = React.useState<'pencil' | 'eraser'>('pencil');
  const [maskData, setMaskData] = React.useState(null);
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        p: 3,
        m: 0,
      }}
    >
      <Typography level="h3">This is fake for now</Typography>
      <Box
        sx={{
          position: 'relative',
          width: 800,
          height: 600,
          overflow: 'hidden',
        }}
      >
        <Box
          component="img"
          src="https://images.unsplash.com/photo-1449034446853-66c86144b0ad?w=620&auto=format&fit=crop&q=60&ixlib=rb-4.1.0"
          alt="Background"
          sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: 800,
            height: 600,
            zIndex: 0,
          }}
        />
        <Box
          sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            zIndex: 1,
            opacity: 0.7,
          }}
        >
          <ReactCanvasPaint
            width={800}
            height={600}
            colors={['#FF0000']}
            showPalette={false}
            strokeWidth={strokeSize}
            drawMode={drawMode}
            onDraw={(e) => {
              setMaskData(e);
            }}
          />
        </Box>
      </Box>

      <Box>
        <Typography level="h4">Stroke Size</Typography>
        <ButtonGroup>
          <IconButton
            onClick={() => {
              setDrawMode('eraser');
            }}
            disabled={drawMode === 'eraser'}
          >
            <EraserIcon />
          </IconButton>
          <IconButton
            onClick={() => {
              setDrawMode('pencil');
            }}
            disabled={drawMode === 'pencil'}
          >
            <PencilIcon />
          </IconButton>
          {[5, 10, 15, 20, 50, 100].map((size) => (
            <Button
              variant={strokeSize === size ? 'solid' : 'outlined'}
              key={size}
              onClick={() => {
                setStrokeSize(size);
              }}
            >
              <Box
                sx={{
                  width: size,
                  height: size,
                  borderRadius: '50%',
                  backgroundColor: '#000',
                }}
              />
            </Button>
          ))}
        </ButtonGroup>
      </Box>
    </Box>
  );
}
