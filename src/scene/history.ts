import type { Project } from "../lib/schema";

export type ProjectOperation = (project: Project) => Project;

export type HistoryEntry = {
  label: string;
  before: Project;
  after: Project;
};

type Transaction = {
  label: string;
  before: Project;
};

export class ProjectHistory {
  readonly maxEntries: number;
  private currentProject: Project;
  private pastEntries: HistoryEntry[] = [];
  private futureEntries: HistoryEntry[] = [];
  private transaction: Transaction | null = null;

  constructor(project: Project, maxEntries = 100) {
    this.currentProject = project;
    this.maxEntries = Math.max(1, Math.min(100, Math.round(maxEntries)));
  }

  get project(): Project {
    return this.currentProject;
  }

  get canUndo(): boolean {
    return this.pastEntries.length > 0;
  }

  get canRedo(): boolean {
    return this.futureEntries.length > 0;
  }

  get past(): readonly HistoryEntry[] {
    return this.pastEntries;
  }

  get future(): readonly HistoryEntry[] {
    return this.futureEntries;
  }

  apply(label: string, operation: ProjectOperation): Project {
    const before = this.currentProject;
    const after = operation(before);
    if (after === before) return before;
    this.currentProject = after;
    if (this.transaction) return after;
    this.push({ label, before, after });
    return after;
  }

  beginTransaction(label: string): void {
    if (this.transaction) return;
    this.transaction = { label, before: this.currentProject };
  }

  commitTransaction(): Project {
    const transaction = this.transaction;
    this.transaction = null;
    if (!transaction || transaction.before === this.currentProject) return this.currentProject;
    this.push({ label: transaction.label, before: transaction.before, after: this.currentProject });
    return this.currentProject;
  }

  cancelTransaction(): Project {
    if (!this.transaction) return this.currentProject;
    this.currentProject = this.transaction.before;
    this.transaction = null;
    return this.currentProject;
  }

  undo(): Project {
    if (this.transaction) this.commitTransaction();
    const entry = this.pastEntries.pop();
    if (!entry) return this.currentProject;
    this.currentProject = entry.before;
    this.futureEntries.push(entry);
    return this.currentProject;
  }

  redo(): Project {
    if (this.transaction) this.commitTransaction();
    const entry = this.futureEntries.pop();
    if (!entry) return this.currentProject;
    this.currentProject = entry.after;
    this.pastEntries.push(entry);
    return this.currentProject;
  }

  replaceProject(project: Project): void {
    this.currentProject = project;
    this.transaction = null;
  }

  resetProject(project: Project): void {
    this.currentProject = project;
    this.clear();
  }

  clear(): void {
    this.pastEntries = [];
    this.futureEntries = [];
    this.transaction = null;
  }

  private push(entry: HistoryEntry): void {
    this.pastEntries.push(entry);
    if (this.pastEntries.length > this.maxEntries) this.pastEntries.shift();
    this.futureEntries = [];
  }
}

export const HistoryManager = ProjectHistory;
