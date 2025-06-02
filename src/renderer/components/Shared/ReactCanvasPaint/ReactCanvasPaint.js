// This is from https://raw.githubusercontent.com/piotrrussw/react-canvas-paint/refs/heads/master/src/index.js
// We made some fixes so copied it here
import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Box, Button, ButtonGroup, IconButton } from '@mui/joy';
import { EraserIcon, PencilIcon } from 'lucide-react';

import PropTypes from 'prop-types';
import classNames from 'classnames';
import styles from './styles.module.css';

function ReactCanvasPaint(props) {
  const canvas = useRef(null);
  const [drawing, setDrawing] = useState(false);
  const [position, setPosition] = useState(null);
  const [activeColor, setActiveColor] = useState(props.colors[0]);

  const onDown = useCallback((event) => {
    const coordinates = getCoordinates(event);
    if (coordinates) {
      setPosition(coordinates);
      setDrawing(true);
    }
  }, []);

  const onUp = useCallback(() => {
    setDrawing(false);
    setPosition(null);
  }, []);

  const getCoordinates = (event) => {
    if (!canvas.current) {
      return null;
    }

    const rect = canvas.current.getBoundingClientRect();
    let clientX, clientY;

    if (event.touches && event.touches.length > 0) {
      clientX = event.touches[0].clientX;
      clientY = event.touches[0].clientY;
    } else {
      clientX = event.clientX;
      clientY = event.clientY;
    }

    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  };

  const onMove = useCallback(
    (event) => {
      if (drawing) {
        const newPosition = getCoordinates(event);
        if (position && newPosition) {
          drawLine(position, newPosition);
          setPosition(newPosition);
        }
      }
    },
    [drawing, position],
  );

  const drawLine = (originalPosition, newPosition) => {
    if (!canvas.current) {
      return null;
    }

    const context = canvas.current.getContext('2d');

    if (context) {
      // Use drawMode prop to determine eraser or pencil
      if (props.drawMode === 'eraser') {
        context.globalCompositeOperation = 'destination-out';
        context.strokeStyle = 'rgba(0,0,0,1)';
      } else {
        context.globalCompositeOperation = 'source-over';
        context.strokeStyle = activeColor;
      }
      context.lineJoin = 'round';
      context.lineWidth = props.strokeWidth;

      context.beginPath();
      context.moveTo(originalPosition.x, originalPosition.y);
      context.lineTo(newPosition.x, newPosition.y);
      context.closePath();

      context.stroke();
      handleDraw(context.getImageData(0, 0, props.width, props.height));
    }
  };

  const handleDraw = (data) => {
    if (typeof props.onDraw === 'function') {
      props.onDraw(data);
    }
  };

  useEffect(() => {
    if (typeof props.data === 'object' && canvas.current) {
      const context = canvas.current.getContext('2d');
      // Clear the canvas first
      context.clearRect(0, 0, props.width, props.height);

      if (!props.data || !props.data.width || !props.data.height) {
        console.warn('Invalid image data provided to ReactCanvasPaint');
        return;
      }

      // If the data size matches the canvas, draw directly
      if (
        props.data.width === props.width &&
        props.data.height === props.height
      ) {
        context.putImageData(props.data, 0, 0);
      } else {
        // Scale the image data to fit the canvas
        // Draw the image data to an offscreen canvas first
        const offscreen = document.createElement('canvas');
        offscreen.width = props.data.width;
        offscreen.height = props.data.height;
        const offCtx = offscreen.getContext('2d');
        offCtx.putImageData(props.data, 0, 0);
        // Draw the offscreen canvas scaled to the main canvas
        context.drawImage(
          offscreen,
          0,
          0,
          props.data.width,
          props.data.height,
          0,
          0,
          props.width,
          props.height,
        );
      }
      // Set the color to the first color in the palette
      setActiveColor(props.colors[0]);
    }
  }, [props.data, props.width, props.height, props.colors]);

  function clearCanvas() {
    if (canvas.current) {
      const context = canvas.current.getContext('2d');
      context.clearRect(0, 0, props.width, props.height);
      handleDraw(context.getImageData(0, 0, props.width, props.height));
    }
  }

  function DrawingToolBox({ colors, active, onChange }) {
    return (
      <ButtonGroup>
        <Button
          onClick={() => {
            clearCanvas();
          }}
        >
          Clear
        </Button>
        <IconButton
          onClick={() => {
            props.drawMode = 'eraser';
          }}
        >
          <EraserIcon />
        </IconButton>
        <IconButton
          onClick={() => {
            props.drawMode = 'pencil';
          }}
        >
          <PencilIcon />
        </IconButton>
        {[5, 10, 15, 20, 50, 90].map((size) => (
          <Button
            variant={props.strokeWidth === size ? 'solid' : 'outlined'}
            key={size}
            onClick={() => {
              props;
            }}
          >
            <Box
              sx={{
                width: Math.sqrt(size) * 4,
                height: Math.sqrt(size) * 4,
                borderRadius: '50%',
                backgroundColor: 'black',
              }}
            />
          </Button>
        ))}
      </ButtonGroup>
    );
  }

  return (
    <div className={styles.container}>
      <canvas
        ref={canvas}
        onMouseDown={props.viewOnly ? undefined : onDown}
        onTouchStart={props.viewOnly ? undefined : onDown}
        onMouseUp={props.viewOnly ? undefined : onUp}
        onTouchEnd={props.viewOnly ? undefined : onUp}
        onMouseLeave={props.viewOnly ? undefined : onUp}
        onMouseMove={props.viewOnly ? undefined : onMove}
        onTouchMove={props.viewOnly ? undefined : onMove}
        width={props.width}
        height={props.height}
      />
      {!props.viewOnly && props.showPalette && (
        <DrawingToolBox
          colors={props.colors}
          active={activeColor}
          onChange={setActiveColor}
        />
      )}
    </div>
  );
}

ReactCanvasPaint.propTypes = {
  width: PropTypes.number,
  height: PropTypes.number,
  viewOnly: PropTypes.bool,
  data: PropTypes.object,
  onDraw: PropTypes.func,
  colors: PropTypes.arrayOf(PropTypes.string),
  strokeWidth: PropTypes.number,
  showPalette: PropTypes.bool,
  drawMode: PropTypes.oneOf(['pencil', 'eraser']),
};

ReactCanvasPaint.defaultProps = {
  width: 400,
  height: 400,
  viewOnly: false,
  data: undefined,
  onDraw: undefined,
  colors: ['#7030A2', '#000000', '#0170C1', '#FE0002', '#FFFF01', '#00AF52'],
  strokeWidth: 5,
  showPalette: true,
  drawMode: 'pencil',
};

export default ReactCanvasPaint;
