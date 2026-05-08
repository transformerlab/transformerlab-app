import React, { useEffect, useMemo, useState } from 'react';
import { Chip, Input, Sheet, Stack, Typography } from '@mui/joy';

type JobsPanelProps = {
  title: string;
  jobs: any[];
  loading: boolean;
  searchPlaceholder?: string;
  searchWidth?: number;
  maxHeight?: string | number;
  headerActions?: React.ReactNode;
  getSearchableFields?: (job: any) => Array<unknown>;
  resetSearchKey?: string | number;
  renderList: (jobs: any[], loading: boolean) => React.ReactNode;
};

const defaultSearchableFields = (job: any): Array<unknown> => {
  const rawJobData = job?.job_data ?? {};
  const jobData =
    typeof rawJobData === 'string'
      ? (() => {
          try {
            return JSON.parse(rawJobData);
          } catch {
            return {};
          }
        })()
      : rawJobData;

  return [
    job?.id,
    job?.short_id,
    job?.status,
    jobData?.template_name,
    jobData?.cluster_name,
    jobData?.provider_name,
    jobData?.user_info?.name,
    jobData?.user_info?.email,
    jobData?.interactive_type,
    job?.interactive_type,
    jobData?.template_config?.interactive_type,
    jobData?.error_msg,
  ];
};

export default function JobsPanel({
  title,
  jobs,
  loading,
  searchPlaceholder = 'Search jobs…',
  searchWidth = 240,
  maxHeight,
  headerActions,
  getSearchableFields = defaultSearchableFields,
  resetSearchKey,
  renderList,
}: JobsPanelProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const searchableFieldsGetter = getSearchableFields || defaultSearchableFields;

  useEffect(() => {
    setSearchQuery('');
  }, [resetSearchKey]);

  const filteredJobs = useMemo(() => {
    if (!searchQuery.trim()) return jobs;
    const query = searchQuery.trim().toLowerCase();
    return jobs.filter((job) =>
      searchableFieldsGetter(job).some((value) =>
        String(value ?? '')
          .toLowerCase()
          .includes(query),
      ),
    );
  }, [jobs, searchQuery, searchableFieldsGetter]);

  return (
    <>
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        gap={2}
        sx={{ mt: 1 }}
      >
        <Stack direction="row" alignItems="center" gap={2}>
          <Typography level="title-md">{title}</Typography>
          <Input
            size="sm"
            placeholder={searchPlaceholder}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            sx={{ width: searchWidth }}
          />
          <Chip size="sm" variant="soft" color="neutral">
            {filteredJobs.length}
          </Chip>
        </Stack>
        {headerActions}
      </Stack>
      <Sheet
        sx={{
          px: 1,
          mt: 1,
          mb: 1,
          flex: 2,
          overflow: 'auto',
          ...(maxHeight ? { maxHeight } : {}),
        }}
      >
        {renderList(filteredJobs, loading)}
      </Sheet>
    </>
  );
}
