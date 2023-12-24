/* eslint-disable jsx-a11y/anchor-is-valid */
import * as React from 'react';

import { Button, CircularProgress } from '@mui/joy';

export default function SelectButton({ setFoundation, model, setAdaptor }) {
  const [selected, setSelected] = React.useState(false);

  const name = model.id;

  return selected ? (
    <Button
      size="sm"
      variant="soft"
      onClick={() => {
        setSelected(false);
      }}
      startDecorator={<CircularProgress thickness={2} />}
    >
      Loading Model
    </Button>
  ) : (
    <Button
      size="sm"
      variant="soft"
      color="success"
      onClick={() => {
        setSelected(true);
        setFoundation(model);
        setAdaptor('');
      }}
    >
      Select
    </Button>
  );
}
