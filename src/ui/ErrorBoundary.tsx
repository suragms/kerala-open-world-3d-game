import { Component, type ReactNode } from "react";

/** Keep a rendering failure recoverable without writing over the last saved checkpoint. */
export class ErrorBoundary extends Component<{children: ReactNode}, {failed: boolean}> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <main role="alert" style={{padding:"3rem"}}>
      <h1>The game could not display this scene.</h1>
      <p>Reload to return to the home screen and continue from your last saved checkpoint.</p>
      <button onClick={()=>window.location.reload()}>Reload game</button>
    </main>;
    return this.props.children;
  }
}
