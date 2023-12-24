import { Sheet } from '@mui/joy';
import { useEffect } from 'react';

export default function OutputTerminal({}) {
  useEffect(() => {
    var source = new EventSource('http://pop-os:8000/stream-logs');
    source.onmessage = function (event) {
      var logs = document.getElementById('logs');
      logs.innerHTML += event.data + '<br>';
      // Scroll to bottom
      logs.scrollTop = document.getElementById('logs').scrollHeight;
    };

    return () => {
      source.close();
    };
  });

  return (
    <Sheet
      sx={{
        gridArea: 'footer',
        display: 'flex',
        overflow: 'auto',
        flexDirection: 'column',
        border: '10px solid red',
      }}
    >
      <div
        id="logs"
        style={{
          backgroundColor: 'black',
          color: 'white',
          overflowX: 'hidden',
          overflowY: 'auto',
        }}
      ></div>
    </Sheet>
  );
}
