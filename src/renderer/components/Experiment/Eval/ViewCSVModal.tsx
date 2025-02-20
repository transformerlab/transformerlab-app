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

// This function formats the eval data to combine rows that have the same name
// based on the first column
function formatEvalData(data) {
  let header = data?.header;
  let body = data?.body;
  const formattedData: any[] = [];

  if (!data) {
    return formattedData;
  }

  // if the following is not titled this way, then we know
  // it's not a grouped report from the backend
  if (header[0] !== 'test_case_id') {
    return data;
  }

  // remove the header named "metric_name"
  if (header[1] === 'metric_name') {
    header = header.slice(1);
  }

  const seen = new Set();
  body.forEach((row) => {
    if (!seen.has(row[0])) {
      seen.add(row[0]);
      const newRow = [row[0]];
      newRow.push({ [row[1]]: row[2] });
      // now push the rest of the columns:
      for (let i = 3; i < row.length; i++) {
        newRow.push(row[i]);
      }
      formattedData.push(newRow);
    } else {
      const index = formattedData.findIndex((r) => r[0] === row[0]);
      let newScore = [];
      // if formattedData[index][1] is an array, then we need to push to it
      if (Array.isArray(formattedData[index][1])) {
        newScore = formattedData[index][1];
      } else {
        newScore.push(formattedData[index][1]);
      }
      newScore.push({ [row[1]]: row[2] });
      formattedData[index][1] = newScore;
    }
  });

  return { header: header, body: formattedData };
}

function formatArrayOfScores(scores) {
  const formattedScores = scores.map((score) => {
    const metricName = Object.keys(score)[0];
    const value = Object.values(score)[0];

    return (
      <Box
        sx={{
          backgroundColor: heatedColor(parseFloat(value)),
          padding: '0 5px',
          fontWeight: 'normal',
          flex: '1 0 0',
          overflow: 'hidden',
        }}
      >
        {metricName}:<br />
        {parseFloat(value).toFixed(5)}
      </Box>
    );
  });
  return formattedScores;
}

function formatScore(score) {
  // if score is a number, return it as is
  if (!isNaN(score)) {
    return score;
  } else {
    // if score is a string, try to parse it as a float
    const parsedScore = parseFloat(score);
    // if parsedScore is not a number, return the original score
    if (isNaN(parsedScore)) {
      return (
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'row',
            height: '100%',
            overflow: 'hidden',
          }}
        >
          {formatArrayOfScores(score)}
        </Box>
      );
    } else {
      return parsedScore;
    }
  }
}

const ViewCSVModal = ({ open, onClose, jobId, fetchCSV }) => {
  const [report, setReport] = useState({});

  useEffect(() => {
    if (open && jobId) {
      fetchCSV(jobId).then((data) => {
        try {
          setReport(formatEvalData(JSON.parse(data)));
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
      <ModalDialog sx={{ width: '90vw', height: '90vh', pt: 5 }}>
        <ModalClose />
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            mb: 2,
          }}
        >
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
              {report?.body?.map((row, i) => (
                <tr key={i}>
                  {row.map((col, j) => (
                    <td key={j}>
                      {report?.header[j] === 'score' ? (
                        <div
                          style={{
                            backgroundColor: heatedColor(parseFloat(col)),
                            height: '100%',
                            width: '100%',
                            overflow: 'hidden',
                            padding: '0',
                            fontWeight: 'bold',
                          }}
                        >
                          {formatScore(col)}
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
