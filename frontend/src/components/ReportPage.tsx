import React, {useEffect, useState} from 'react';

const AUTH_URL = process.env.REACT_APP_AUTH_URL || 'http://localhost:3001';
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

const ReportPage: React.FC = () => {
    const [loading, setLoading] = useState(false);
    const [checking, setChecking] = useState(true);
    const [isAuthed, setIsAuthed] = useState(false);

    const [error, setError] = useState<string | null>(null);
    const [text, setText] = useState<string>('');

    const checkSession = async () => {
        try {
            setChecking(true);
            setError(null);

            const resp = await fetch(`${AUTH_URL}/sessions/validate`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                credentials: 'include',
                body: JSON.stringify({}),
            });

            if (!resp.ok) {
                setIsAuthed(false);
                return;
            }

            const data = await resp.json();
            setIsAuthed(Boolean(data?.valid));
        } catch {
            setIsAuthed(false);
        } finally {
            setChecking(false);
        }
    };

    useEffect(() => {
        checkSession();
    }, []);

    const login = () => {
        window.location.href = `${AUTH_URL}/login`;
    };

    const downloadReport = async () => {
        try {
            setLoading(true);
            setError(null);
            setText('');

            const response = await fetch(`${API_URL}/reports`, {
                method: 'GET',
                credentials: 'include',
                headers: {'Accept': 'application/json'},
            });

            if (response.status === 401) {
                setIsAuthed(false);
                setError('Not authenticated');
                return;
            }

            if (!response.ok) {
                const errText = await response.text().catch(() => '');
                setError(`API error ${response.status}: ${errText || response.statusText}`);
                return;
            }

            const data = await response.json();
            setText(JSON.stringify(data, null, 2));
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An error occurred');
        } finally {
            setLoading(false);
        }
    };

    const showLogin = !checking && !isAuthed;

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
            <div className="p-8 bg-white rounded-lg shadow-md">
                <h1 className="text-2xl font-bold mb-6">Usage Reports</h1>

                <div className="flex gap-3">
                    {checking ? (
                        <button
                            disabled
                            className="px-4 py-2 bg-gray-300 text-white rounded cursor-not-allowed"
                        >
                            Checking session...
                        </button>
                    ) : showLogin ? (
                        <button
                            onClick={login}
                            className="px-4 py-2 bg-gray-800 text-white rounded hover:bg-gray-900"
                        >
                            Login
                        </button>
                    ) : (
                        <>
                            <button
                                onClick={downloadReport}
                                disabled={loading}
                                className={`px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 ${
                                    loading ? 'opacity-50 cursor-not-allowed' : ''
                                }`}
                            >
                                {loading ? 'Loading...' : 'Download Report'}
                            </button>
                        </>
                    )}
                </div>

                {error && (
                    <div className="mt-4 p-4 bg-red-100 text-red-700 rounded">{error}</div>
                )}

                {text && (
                    <pre className="mt-4 p-4 bg-gray-50 rounded w-[600px] overflow-auto">
{text}
          </pre>
                )}
            </div>
        </div>
    );
};

export default ReportPage;
