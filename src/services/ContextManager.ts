export class ContextManager {
  private static activeProjectId: string | null = null;
  private static activeFilePath: string | null = null;

  public static setActiveProject(projectId: string | null) {
    this.activeProjectId = projectId;
  }

  public static setActiveFile(filePath: string | null) {
    this.activeFilePath = filePath;
  }

  public static getActiveProject() {
    return this.activeProjectId;
  }

  public static getActiveFile() {
    return this.activeFilePath;
  }

  public static async buildContextString(): Promise<string> {
    let contextStr = ``;
    if (this.activeProjectId) {
      contextStr += `Project ID: ${this.activeProjectId}\n`;
    }
    if (this.activeFilePath) {
      contextStr += `Active File: ${this.activeFilePath}\n`;
    }
    return contextStr;
  }
}
