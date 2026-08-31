import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './auth';
import { ToasterProvider, ToasterBridge } from './components/Toaster';
import { ConfirmProvider } from './components/ConfirmDialog';
import { I18nProvider } from './i18n';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ToasterProvider>
        <ToasterBridge />
        <ConfirmProvider>
          <AuthProvider>
            <I18nProvider>
              <App />
            </I18nProvider>
          </AuthProvider>
        </ConfirmProvider>
      </ToasterProvider>
    </BrowserRouter>
  </StrictMode>,
);
