import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{
          background: "#0D1F33", color: "#fff", minHeight: "100vh",
          display: "flex", alignItems: "center", justifyContent: "center",
          flexDirection: "column", padding: "40px", fontFamily: "monospace"
        }}>
          <h1 style={{ color: "#C9A84C", fontSize: 28, marginBottom: 16 }}>INGRION — Startup Error</h1>
          <pre style={{
            background: "#1a2b42", padding: 24, borderRadius: 8,
            color: "#ff6b6b", maxWidth: 800, overflowX: "auto", whiteSpace: "pre-wrap"
          }}>
            {this.state.error.message}
            {"\n\n"}
            {this.state.error.stack}
          </pre>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: 24, background: "#C9A84C", color: "#0D1F33",
              border: "none", padding: "10px 24px", borderRadius: 6,
              cursor: "pointer", fontWeight: "bold", fontSize: 14
            }}
          >
            Reload App
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
