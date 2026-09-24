import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import 'bootstrap/dist/css/bootstrap-grid.min.css';
import 'bootstrap/dist/css/bootstrap-utilities.min.css';
import './styles/campuscoin.css';

import { AuthProvider } from './auth.jsx';
import { LocaleProvider } from './locale.jsx';
import App from './App.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        {/* LocaleProvider reads user preferences via useAuth, so it sits
            inside AuthProvider; it owns language + display currency. */}
        <LocaleProvider>
          <App />
        </LocaleProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
