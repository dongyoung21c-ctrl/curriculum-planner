import { render } from 'preact';
import { StoreProvider } from './state/store';
import { browserStore } from './storage/storage';
import { App } from './ui/App';
import { ConfirmProvider, ToastProvider } from './ui/common';
import './styles/app.css';

const root = document.getElementById('app');
if (root) {
  render(
    <ToastProvider>
      <ConfirmProvider>
        <StoreProvider store={browserStore()}>
          <App />
        </StoreProvider>
      </ConfirmProvider>
    </ToastProvider>,
    root,
  );
}
