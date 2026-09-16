export type Connection = {
  host: string;
  user?: string | null;
  port?: number | null;
  identityFile?: string | null;
};

export type Entry = {
  name: string;
  path: string;
  kind: "dir" | "file";
  isLink: boolean;
  size: number;
  mtime: number;
};

export type Listing = { path: string; entries: Entry[] };

export type Environment = {
  hosts: string[];
  identities: string[];
  defaultDestination: string;
  rsync: string | null;
  ssh: string | null;
};

export type TransferOptions = {
  compress: boolean;
  dryRun: boolean;
  checksum: boolean;
  skipNewer: boolean;
  wholeFile: boolean;
  bwlimit: string;
  excludes: string[];
};

export type StartedJob = {
  jobId: string;
  root: string;
  files: string[];
  command: string;
};

export type ProgressEvent = {
  jobId: string;
  percent: number;
  bytes: number;
  rate: string;
  eta: string;
  filesDone: number | null;
  filesTotal: number | null;
};

export type LogEvent = { jobId: string; level: "info" | "error"; line: string };
export type DoneEvent = {
  jobId: string;
  code: number | null;
  cancelled: boolean;
  message: string;
};
