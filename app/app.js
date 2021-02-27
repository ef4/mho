import { capitalize } from 'https://cdn.skypack.dev/lodash';

export default class App {
  boot() {
    let h1 = document.createElement('h1');
    h1.textContent = capitalize("hello world");
    document.body.appendChild(h1);
  }
}