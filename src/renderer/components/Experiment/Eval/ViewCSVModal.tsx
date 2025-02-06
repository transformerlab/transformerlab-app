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
        <Box sx={{ overflow: 'auto', height: 'calc(100% - 48px)' }}>
          <Table stickyHeader>
            <thead>
              <tr>
                {report?.header &&
                  report?.header.map((col) => <th key={col}>{col}</th>)}
              </tr>
            </thead>
            <tbody>
              {report?.body &&
                report?.body.map((row, i) => (
                  <tr key={i}>
                    {row.map((col, j) => (
                      <td key={j}>{col}</td>
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
