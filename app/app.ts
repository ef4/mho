import { capitalize } from 'lodash-es';
import message from './message';

export default class App {
  boot(): void {
    let h1 = document.createElement('h1');
    h1.textContent = capitalize(message());
    document.body.appendChild(h1);
  }
}
