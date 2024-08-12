import {
  Box,
  ButtonGroup,
  FormLabel,
  IconButton,
  Input,
  Slider,
} from '@mui/joy';
import { CheckIcon, XIcon } from 'lucide-react';
import { useState } from 'react';
import './thinslider.css';

export default function ThinSlider(props) {
  const [editValueDirectlyMode, setEditValueDirectlyMode] = useState(false);

  function ManualInput() {
    return (
      <Input
        sx={{ mb: 2 }}
        size="sm"
        defaultValue={props.value}
        endDecorator={
          <ButtonGroup>
            <IconButton variant="plain" color="danger">
              <XIcon
                onClick={() => {
                  setEditValueDirectlyMode(false);
                }}
              />
            </IconButton>
            <IconButton
              variant="plain"
              color="primary"
              onClick={(e) => {
                //The following shows how to traverse the DOM to get to the
                //input field value
                let v = e.target
                  .closest('.MuiInput-root')
                  .querySelector('input').value;

                props.onChange(null, parseFloat(v));
                setEditValueDirectlyMode(false);
              }}
            >
              <CheckIcon />
            </IconButton>
          </ButtonGroup>
        }
      />
    );
  }

  return (
    <div className="thinslider-container">
      <FormLabel>
        {props?.title} &nbsp;
        {!editValueDirectlyMode && (
          <Box
            sx={{
              color: '#aaa',
            }}
          >
            {props.value}&nbsp;{' '}
            <span
              className="hoverable"
              style={{ visibility: 'hidden' }}
              onClick={() => {
                setEditValueDirectlyMode(true);
              }}
            >
              edit
            </span>
          </Box>
        )}
      </FormLabel>
      {editValueDirectlyMode ? (
        <ManualInput />
      ) : (
        <Slider
          sx={{
            margin: 'auto',
            width: '90%',
            '--Slider-trackSize': '3px',
            '--Slider-thumbSize': '8px',
            '--Slider-thumbWidth': '18px',
            paddingTop: 1,
            marginBottom: 2,
          }}
          {...props}
        />
      )}
    </div>
  );
}
