import { Component } from 'react';
import { tr } from '../lib/i18n.jsx';
import BrandLogo from './BrandLogo.jsx';

/**
 * Catches a render crash in one tree so a bad widget cannot blank the whole app.
 */
export default class ErrorBoundary extends Component {
  state = { crashed: false };

  static getDerivedStateFromError() {
    return { crashed: true };
  }

  componentDidCatch(error) {
    console.error(error);
  }

  render() {
    if (!this.state.crashed) return this.props.children;

    return (
      <div className="grid min-h-screen place-items-center p-6 text-center">
        <div className="max-w-sm">
          <BrandLogo className="mx-auto mb-4 size-12 rounded-2xl shadow-lg" />
          <p className="text-foreground text-lg font-semibold">{tr('error.crash.title')}</p>
          <p className="text-muted mt-2 text-sm leading-relaxed">{tr('error.crash.body')}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="border-border bg-surface text-foreground hover:bg-surface-hover mt-5 inline-flex items-center rounded-lg border px-4 py-2 text-sm font-medium transition"
          >
            {tr('retry')}
          </button>
        </div>
      </div>
    );
  }
}
