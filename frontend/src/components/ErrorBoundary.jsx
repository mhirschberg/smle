import React from 'react';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true };
    }

    componentDidCatch(error, errorInfo) {
        console.error('ErrorBoundary caught an error:', error, errorInfo);
        this.setState({
            error: error,
            errorInfo: errorInfo
        });
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="bg-red-50 border border-red-200 rounded-lg p-6 m-4">
                    <h2 className="text-xl font-bold text-red-800 mb-2">Something went wrong</h2>
                    <details className="text-sm text-red-700">
                        <summary className="cursor-pointer font-semibold mb-2">Error details</summary>
                        <pre className="bg-white p-4 rounded border border-red-300 overflow-auto">
                            {this.state.error && this.state.error.toString()}
                            {'\n\n'}
                            {this.state.errorInfo && this.state.errorInfo.componentStack}
                        </pre>
                    </details>
                    <button
                        onClick={() => this.setState({ hasError: false, error: null, errorInfo: null })}
                        className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                    >
                        Try Again
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
