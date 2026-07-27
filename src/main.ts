import { mountApp } from './app';
import './styles/main.css';

const root = document.getElementById('root');
if (!root) {
  throw new Error(
    'History Atlas: #root element missing in index.html. ' +
      'This is an authoring error, not a runtime failure.',
  );
}

mountApp(root);
