import React, { useEffect, useState } from 'react';
import {
  Modal,
  Box,
  Typography,
  IconButton,
  ModalClose,
  ModalDialog,
  Table,
  Button,
} from '@mui/joy';

import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';

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


  const handleDownload = async () => {
    const response = await fetch(
      chatAPI.Endpoints.Experiment.GetAdditionalDetails(jobId, 'download')
    );
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `report_${jobId}.csv`; // Adjust extension if necessary
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog sx={{ width: '90vw', height: '90vh' , pt: 5}}>
        <ModalClose />
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography level="h4" mb={2}>
          Additional Output from Job: {jobId}
        </Typography>
        <Button onClick={handleDownload} variant="outlined">
            Download Report
          </Button>
          </Box>
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
