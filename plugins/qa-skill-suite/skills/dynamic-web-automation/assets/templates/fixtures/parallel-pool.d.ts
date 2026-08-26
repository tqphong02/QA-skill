export type PoolKind = 'ACCOUNTS' | 'DATASETS';
export type PoolSlot = Record<string, unknown>;
export type PoolEnvironment = Readonly<{ name: string; raw: string }>;

export function envSegment(value: string): string;
export function packageProjectKey(
  projectRoot: string,
  environment?: NodeJS.ProcessEnv,
): string;
export function configuredPool(
  kind: PoolKind,
  projectKey: string,
  environment?: NodeJS.ProcessEnv,
): PoolEnvironment | null;
export function selectPoolSlots(
  raw: string,
  envName: string,
  role: string,
  required?: boolean,
): PoolSlot[];
export function allPoolSlots(raw: string, envName: string): PoolSlot[];
export function poolCapacity(
  raw: string | undefined,
  kind: PoolKind,
  projectRoot?: string,
): number;
export function slotIdentity(
  slot: PoolSlot,
  kind: PoolKind,
  projectRoot?: string,
): string;
export function assertPoolCapacity(
  slots: PoolSlot[],
  workers: number,
  envName: string,
  kind: PoolKind,
  projectRoot?: string,
): void;
export function assertParallelPool(
  raw: string,
  workers: number,
  envName: string,
  kind: PoolKind,
  projectRoot?: string,
): void;
