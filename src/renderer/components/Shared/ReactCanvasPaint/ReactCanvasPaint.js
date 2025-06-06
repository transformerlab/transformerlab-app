// This is from https://raw.githubusercontent.com/piotrrussw/react-canvas-paint/refs/heads/master/src/index.js
// We made some fixes so copied it here
import React, { useRef, useState, useCallback, useEffect } from 'react';
import PropTypes from 'prop-types';
import classNames from 'classnames';
import styles from './styles.module.css';

function DrawingToolBox({ colors, active, onChange }) {
  return (
    <div className={styles.toolBoxContainer}>
      <div className={styles.colors}>
        {colors.map((color, key) => (
          <button
            key={key}
            onClick={() => onChange(color)}
            className={classNames(styles.color, {
              [styles.active]: active === color,
            })}
            style={{ backgroundColor: color }}
          />
        ))}
      </div>
    </div>
  );
}

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
      // TODO: scale imageData
      context.putImageData(props.data, 0, 0);
      // Set the color to the first color in the palette
      setActiveColor(props.colors[0]);
    }
  }, [props.data]);

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
