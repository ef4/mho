import { timeout } from './util';

export class LivenessWatcher {
  private isAlive = true;

  constructor(
    private worker: ServiceWorkerGlobalScope,
    private onShutdown: () => Promise<void>
  ) {
    this.watch();
  }

  get alive() {
    return this.isAlive;
  }

  private async backendIsOurs(): Promise<boolean> {
    let response = await fetch(`${this.worker.origin}/mho-client.js`, {
      method: 'HEAD',
    });
    switch (response.status) {
      case 404:
        return false;
      case 200:
        return /^mho/.test(response.headers.get('server') || '');
      default:
        throw new Error(`${response.status} from backend`);
    }
  }

  private async watch() {
    while (this.isAlive) {
      try {
        this.isAlive = await this.backendIsOurs();
      } catch (err) {
        console.log(
          `Encountered error performing aliveness check (server is probably not running):`,
          err
        );
        this.isAlive = false;
      }
      if (this.isAlive) {
        await timeout(10 * 1000);
      } else {
        console.error('shutting down service worker.');
        await Promise.all([
          this.worker.registration.unregister(),
          this.onShutdown(),
        ]);
      }
    }
  }
}
