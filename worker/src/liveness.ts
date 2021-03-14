import { timeout } from './util';

export class LivenessWatcher {
  private isAlive = true;

  constructor(private worker: ServiceWorkerGlobalScope) {
    this.watch();
  }

  get alive() {
    return this.isAlive;
  }

  private async backendIsOurs(): Promise<boolean> {
    let response = await fetch(`${this.worker.origin}/mho-worker.js`, {
      method: 'HEAD',
    });
    switch (response.status) {
      case 404:
        return false;
      case 200:
        return /use-the-platform/.test(response.headers.get('server') || '');
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
      }
      if (this.isAlive) {
        await timeout(10 * 1000);
      } else {
        console.error(
          'some other server is running instead of ours, un-registering this service worker.'
        );
        await this.worker.registration.unregister();
      }
    }
  }
}
