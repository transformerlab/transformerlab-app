/**
 * Parser for orchestrator streaming logs to extract progress information
 */

export interface LogEntry {
  log_line?: string;
  status?: string;
}

export interface ProgressState {
  machineFound: boolean;
  ipAllocated: boolean;
  provisioningComplete: boolean;
  environmentSetup: boolean;
  jobDeployed: boolean;
  diskMounted: boolean;
  sdkInitialized: boolean;
  isCompleted: boolean;
}

export class OrchestratorLogParser {
  private progressState: ProgressState = {
    machineFound: false,
    ipAllocated: false,
    provisioningComplete: false,
    environmentSetup: false,
    jobDeployed: false,
    diskMounted: false,
    sdkInitialized: false,
    isCompleted: false,
  };

  private logLines: string[] = [];

  /**
   * Parse streaming log data and update progress state
   */
  parseLogData(logData: string): ProgressState {
    // Split by data: lines and process each entry
    const lines = logData.split('\n');

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const jsonData = line.substring(6); // Remove 'data: ' prefix
          const entry: LogEntry = JSON.parse(jsonData);

          if (entry.log_line) {
            this.logLines.push(entry.log_line);
            this.updateProgressFromLogLine(entry.log_line);
          }

          if (entry.status === 'completed') {
            this.progressState.isCompleted = true;
          }
        } catch (e) {
          // Skip malformed JSON entries
          console.warn('Failed to parse log entry:', line);
        }
      }
    }

    return { ...this.progressState };
  }

  /**
   * Strip ANSI escape codes from log line
   */
  private stripAnsiCodes(text: string): string {
    return text.replace(/\u001b\[[0-9;]*m/g, '');
  }

  /**
   * Update progress state based on log line content
   */
  private updateProgressFromLogLine(logLine: string): void {
    // Strip ANSI escape codes first
    const cleanLine = this.stripAnsiCodes(logLine);
    const line = cleanLine.toLowerCase();

    // Check for machine provisioning steps based on actual orchestrator logs
    if (
      line.includes('instance is up') ||
      line.includes('✓') ||
      line.includes('chosen')
    ) {
      this.progressState.machineFound = true;
    }

    if (line.includes('cluster launched') && line.includes(':')) {
      this.progressState.ipAllocated = true;
    }

    if (line.includes('cluster launched') && line.includes(':')) {
      this.progressState.provisioningComplete = true;
    }

    if (line.includes('synced file_mounts') || line.includes('syncing files')) {
      this.progressState.environmentSetup = true;
    }

    if (line.includes('job submitted') || line.includes('job deployed')) {
      this.progressState.jobDeployed = true;
    }

    if (line.includes('storage mounted') || line.includes('mounting')) {
      this.progressState.diskMounted = true;
    }

    if (line.includes('sdk initialized') || line.includes('lab sdk')) {
      this.progressState.sdkInitialized = true;
    }
  }

  /**
   * Get current progress state
   */
  getProgressState(): ProgressState {
    return { ...this.progressState };
  }

  /**
   * Get all log lines
   */
  getLogLines(): string[] {
    return [...this.logLines];
  }

  /**
   * Reset parser state
   */
  reset(): void {
    this.progressState = {
      machineFound: false,
      ipAllocated: false,
      provisioningComplete: false,
      environmentSetup: false,
      jobDeployed: false,
      diskMounted: false,
      sdkInitialized: false,
      isCompleted: false,
    };
    this.logLines = [];
  }
}
