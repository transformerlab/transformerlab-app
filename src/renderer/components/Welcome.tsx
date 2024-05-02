/* eslint-disable jsx-a11y/anchor-is-valid */

import { Sheet, Stack, Typography } from '@mui/joy';

import labImage from '../img/lab.jpg';
import flaskLogo from '../img/flask.png';

function LogoComponent() {
  return (
    <img
      src={flaskLogo}
      width="38"
      style={{
        verticalAlign: 'middle',
        marginBottom: '10px',
        display: 'inline-block',
      }}
    />
  );
}

export default function Welcome() {
  return (
    <Sheet
      sx={{
        overflow: 'hidden',
        height: 'calc(100% - 1em)',
        backgroundImage: `url("${labImage}")`,
        backgroundRepeat: 'no-repeat',
        backgroundSize: 'cover',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
      }}
    >
      <div
        style={{ backgroundColor: 'rgba(255,255,255,0.8)', padding: '2rem' }}
      >
        <Typography level="h1" color="neutral">
          <LogoComponent />
          Transformer Lab
        </Typography>
        <Typography level="h1" sx={{ fontSize: '64px' }}>
          Let's start your next Experiment!
        </Typography>
        <div>
          <Typography level="body-lg" mt={4} sx={{ fontSize: '26px' }}>
            Watch our{' '}
            <a href="https://transformerlab.ai/docs/intro" target="_blank">
              Getting Started Video
            </a>
            , or access our{' '}
            <a href="https://transformerlab.ai/docs/intro" target="_blank">
              full documentation
            </a>
          </Typography>
          <br />
          <Stack
            direction="column"
            justifyContent="flex-start"
            alignItems="flex-start"
            spacing={2}
          >
            {/* <Button endDecorator={<ArrowRightCircleIcon />} size="lg">
              Interact 💬 with a model from the gallery
            </Button>
            <Button endDecorator={<ArrowRightCircleIcon />} size="lg">
              Start 🔬 with a pre-built recipe
            </Button>
            <Button endDecorator={<ArrowRightCircleIcon />} size="lg">
              Train 🧑🏽‍🎓 a new model from scratch
            </Button>
            <Button endDecorator={<ArrowRightCircleIcon />} size="lg">
              Fine tune 🎵 an existing model
            </Button> */}
          </Stack>
        </div>
      </div>
    </Sheet>
  );
}
