import React from 'react';
import ReactDOM from 'react-dom';
import { App } from './app';

const appRoot = document.createElement("div");
document.body.append(appRoot);

ReactDOM.render(
  React.createElement(App),
  appRoot,
);
