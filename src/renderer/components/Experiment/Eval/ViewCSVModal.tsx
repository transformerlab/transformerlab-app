import React, { useEffect, useState } from 'react';
import {
  Modal,
  Box,
  Typography,
  IconButton,
  ModalClose,
  ModalDialog,
  Table,
} from '@mui/joy';

function formatColumnNames(name) {
  return name
    .replace(/([A-Z])/g, ' $1') // Convert Camel Case to spaced
    .replace(/^./, (str) => str.toUpperCase()) // Capitalize first letter
    .replace(/_/g, ' '); // Replace underscores with spaces
}

function heatedColor(value) {
  const h = value * 240;
  return `hsla(${h}, 100%, 50%, 0.3)`;
}

const ViewCSVModal = ({ open, onClose, jobId, fetchCSV }) => {
  const [report, setReport] = useState({});

  useEffect(() => {
    if (open && jobId) {
      fetchCSV(jobId).then((data) => {
        try {
          setReport(JSON.parse(data));
        } catch (e) {
          setReport({ header: ['Error'], body: [[data]] });
        }
      });
    }
  }, [open, jobId, fetchCSV]);

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog sx={{ width: '90vw', height: '90vh' }}>
        <ModalClose />
        <Typography level="h4" mb={2}>
          Additional Output from Job: {jobId}
        </Typography>
        {/* {JSON.stringify(report)} */}
        <Box sx={{ overflow: 'auto' }}>
          <Table stickyHeader>
            <thead>
              <tr>
                {report?.header &&
                  report?.header.map((col) => (
                    <th key={col}>{formatColumnNames(col)}</th>
                  ))}
              </tr>
            </thead>
            <tbody>
              {report?.body &&
                report?.body.map((row, i) => (
                  <tr key={i}>
                    {row.map((col, j) => (
                      <td key={j}>
                        {report?.header[j] === 'score' ? (
                          <div
                            style={{
                              backgroundColor: heatedColor(col),
                              height: '100%',
                              padding: '0 5px',
                              fontWeight: 'bold',
                            }}
                          >
                            {parseFloat(col).toFixed(6)}
                          </div>
                        ) : (
                          <div
                            style={{
                              height: '100%',
                              padding: '0 5px',
                              maxHeight: '100px',
                            }}
                          >
                            {col}
                          </div>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
            </tbody>
          </Table>
        </Box>
      </ModalDialog>
    </Modal>
  );
};

export default ViewCSVModal;
