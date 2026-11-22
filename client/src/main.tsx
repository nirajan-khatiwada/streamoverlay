import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/tokens.css';
import { OverlayApp } from './overlay/OverlayApp';
import { StudioApp } from './studio/StudioApp';

const pathname = window.location.pathname.replace(/\/+$/, '') || '/';
const isOverlayRoute = pathname === '/overlay';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>{isOverlayRoute ? <OverlayApp /> : <StudioApp />}</React.StrictMode>
);
