// Cesium's widget stylesheet — without it the viewer collapses to the
// canvas' intrinsic 300x150 size instead of filling the viewport.
import 'cesium/Build/Cesium/Widgets/widgets.css';
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
