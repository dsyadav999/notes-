import React from "react";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : "An unexpected error occurred.",
    };
  }

  componentDidCatch(error, info) {
    console.error("Application error boundary caught:", error, info);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="auth-shell">
          <div className="auth-center">
            <header className="auth-header">
              <div className="wordmark">Note World</div>
            </header>
            <main className="auth-card">
              <h2>Something went wrong</h2>
              <p className="sub">
                We encountered an unexpected issue while communicating with your workspace.
              </p>
              <button type="button" className="btn" onClick={this.handleReload}>
                Reload workspace
              </button>
            </main>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
