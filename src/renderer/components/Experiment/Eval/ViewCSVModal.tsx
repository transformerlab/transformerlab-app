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
function formatEvalData(data, compareEvals = false) {
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

  const seen = new Set();

  if (compareEvals) {
    // Ensure the header has at least the expected columns:
    // test_case_id, metric_name, job_id, evaluator_name, metric_name, score, ...
    if (header.length < 6) {
      return data;
    }
    // Remove columns: drop the first metric_name (index 1), job_id (index 2), evaluator_name (index 3)
    // and the metric_name/score pair (indices 4 and 5) will be combined
    // New header: test_case_id, combined_scores, then any extra columns (starting from index 6)
    header = [header[0], 'score', ...header.slice(6)];

    body.forEach((row) => {
      // Sanity check row length
      if (row.length < 6) return;
      const testCaseId = row[0];
      const jobId = row[2];
      const evaluatorName = row[3];
      const metricName = row[4];
      const scoreVal = row[5];
      const combinedScore = {
        [`${evaluatorName}-${jobId}-${metricName}`]: scoreVal,
      };

      // Append additional columns after the 6th column, if any
      const extraColumns = row.slice(6);

      if (!seen.has(testCaseId)) {
        seen.add(testCaseId);
        // newRow: [test_case_id, combinedScore, extra columns...]
        formattedData.push([testCaseId, combinedScore, ...extraColumns]);
      } else {
        const index = formattedData.findIndex((r) => r[0] === testCaseId);
        let newScore = [];
        if (Array.isArray(formattedData[index][1])) {
          newScore = formattedData[index][1];
        } else {
          newScore.push(formattedData[index][1]);
        }

        newScore.push(combinedScore);
        formattedData[index][1] = newScore;
      }
    });
  } else {
    // original processing: remove "metric_name" if it is header[1]
    if (header[1] === 'metric_name') {
      header = header.slice(1);
    }
    body.forEach((row) => {
      if (!seen.has(row[0])) {
        seen.add(row[0]);
        const newRow = [row[0]];
        newRow.push({ [row[1]]: row[2] });
        for (let i = 3; i < row.length; i++) {
          newRow.push(row[i]);
        }
        formattedData.push(newRow);
      } else {
        const index = formattedData.findIndex((r) => r[0] === row[0]);
        let newScore = [];
        if (Array.isArray(formattedData[index][1])) {
          newScore = formattedData[index][1];
        } else {
          newScore.push(formattedData[index][1]);
        }
        newScore.push({ [row[1]]: row[2] });
        formattedData[index][1] = newScore;
      }
    });
  }
  return { header: header, body: formattedData };
}

function sameTask(metric1, metric2) {
  const metric1Split = metric1.split('-');
  const metric2Split = metric2.split('-');
  return (
    metric1Split[0] === metric2Split[0] && metric1Split[1] === metric2Split[1]
  );
}

function formatArrayOfScores(scores) {
  const scoresArray = Array.isArray(scores) ? scores : [scores];
  const formattedScores = [];
  let lastMetricName = '';
  for (let i = 0; i < scoresArray.length; i++) {
    const score = scoresArray[i];
    const metricName = Object.keys(score)[0];
    const value = Object.values(score)[0];
    if (lastMetricName !== '' && !sameTask(lastMetricName, metricName)) {
      formattedScores.push(
        <div style={{ flexBasis: '100%', height: '4px' }} key={i + 0.5} />,
      );
    }
    formattedScores.push(
      <Box
        sx={{
          backgroundColor: heatedColor(parseFloat(value)),
          padding: '0 5px',
          fontWeight: 'normal',
          flex: '1',
          overflow: 'hidden',
        }}
        key={i}
      >
        {metricName}:<br />
        {parseFloat(value).toFixed(5)}
      </Box>,
    );

    lastMetricName = metricName;
  }
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
            flexWrap: 'wrap',
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

const convertReportToCSV = (report: { header: any[]; body: any[] }) => {
  if (!report?.header || !report?.body) return '';
  const csvRows = [];
  csvRows.push(report.header.join(','));
  report.body.forEach((row) => {
    const csvRow = row
      .map((cell) => {
        let cellText = '';
        if (typeof cell === 'object') {
          // Convert objects to a JSON string and escape inner quotes
          cellText = JSON.stringify(cell).replace(/"/g, '""');
        } else {
          cellText = cell;
        }
        return `"${cellText}"`;
      })
      .join(',');
    csvRows.push(csvRow);
  });
  return csvRows.join('\n');
};

const ViewCSVModal = ({
  open,
  onClose,
  jobId,
  fetchCSV,
  compareData = null,
}) => {
  const [report, setReport] = useState({});

  useEffect(() => {
    if (!compareData) {
      if (open && jobId) {
        fetchCSV(jobId).then((data) => {
          try {
            setReport(formatEvalData(JSON.parse(data)));
          } catch (e) {
            setReport({ header: ['Error'], body: [[data]] });
          }
        });
      }
    } else {
      try {
        setReport(formatEvalData(compareData, true));
      } catch (e) {
        setReport({ header: ['Error'], body: [[compareData]] });
      }
    }
  }, [open, jobId, fetchCSV]);

  const handleDownload = async () => {
    if (!compareData) {
      const response = await fetch(
        chatAPI.Endpoints.Experiment.GetAdditionalDetails(jobId, 'download'),
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
    } else {
      const csvContent = convertReportToCSV(report);
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `detailed_report.csv`; // Adjust extension if necessary
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
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
            {compareData
              ? 'Detailed Comparison Report'
              : `Additional Output from Job: ${jobId}`}
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
