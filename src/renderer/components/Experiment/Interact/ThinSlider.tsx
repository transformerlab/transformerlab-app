import { Slider } from '@mui/joy';

export default function ThinSlider(props) {
  return (
    <>
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
    </>
  );
}
