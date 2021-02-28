import { capitalize } from 'lodash';

export default class App {
  boot(): void {
    let h1 = document.createElement('h1');
    h1.textContent = capitalize('hello world');
    document.body.appendChild(h1);
  }
}
