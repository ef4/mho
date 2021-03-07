import { capitalize } from 'lodash-es';
import message from './message';
import pdfMake from 'pdfmake/build/pdfmake';

export default class App {
  boot(): void {
    let h1 = document.createElement('h1');
    h1.textContent = capitalize(message());
    document.body.appendChild(h1);
  }
}
