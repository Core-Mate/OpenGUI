import { ViewerServer } from '../src/viewer.ts'
import { Workbench } from '../src/workbench.ts'
/** Control-unit fixture. Real display authorization is exercised in viewer.spec.ts. */
export class ReadyViewer extends ViewerServer {
  private readonly workbench = new Workbench()
  override board(): Workbench { return this.workbench }
  constructor() { super({ async prepare() {}, async subscribe() { return () => {} }, async dispose() {} }) }
  override find(): string { return 'unit-viewer' }
  override assertReady(): void {}
  override url(): string { return 'http://127.0.0.1:1/unit-viewer/' }
  override endTask(): void {}
  override progress(): undefined { return undefined }
  override syncNode(): void {}
  override finishNodes(): void {}
  override pauseNodes(): void {}
  override awaitUser(): void {}
  override settleNode(): void {}
  override taskSteps(): [] { return [] }
  override async archiveReports(): Promise<void> {}
  override reportFiles(): undefined { return undefined }
}
