import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  Connection,
  DoneEvent,
  Environment,
  Listing,
  LogEvent,
  ProgressEvent,
  StartedJob,
  TransferOptions,
} from "./types";

export const environment = () => invoke<Environment>("environment");

export const testConnection = (connection: Connection) =>
  invoke<string>("test_connection", { connection });

export const listDir = (connection: Connection, path: string) =>
  invoke<Listing>("list_dir", { connection, path });

export const startTransfer = (
  connection: Connection,
  sources: string[],
  destination: string,
  options: TransferOptions,
) =>
  invoke<StartedJob>("start_transfer", {
    request: { connection, sources, destination, ...options },
  });

export const cancelTransfer = (jobId: string) =>
  invoke<void>("cancel_transfer", { jobId });

export const onProgress = (cb: (e: ProgressEvent) => void): Promise<UnlistenFn> =>
  listen<ProgressEvent>("transfer://progress", (e) => cb(e.payload));

export const onLog = (cb: (e: LogEvent) => void): Promise<UnlistenFn> =>
  listen<LogEvent>("transfer://log", (e) => cb(e.payload));

export const onDone = (cb: (e: DoneEvent) => void): Promise<UnlistenFn> =>
  listen<DoneEvent>("transfer://done", (e) => cb(e.payload));
