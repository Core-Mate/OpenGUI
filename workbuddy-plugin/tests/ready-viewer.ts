import { ViewerServer } from '../src/viewer.ts'
/** Control-unit fixture. Real display authorization is exercised in viewer.spec.ts. */
export class ReadyViewer extends ViewerServer {
  constructor() { super({ async prepare() {}, async subscribe() { return () => {} }, async dispose() {} }) }
  override find(): string { return 'unit-viewer' }
  override assertReady(): void {}
  override url(): string { return 'http://127.0.0.1:1/unit-viewer/' }
  override endTask(): void {}
}
