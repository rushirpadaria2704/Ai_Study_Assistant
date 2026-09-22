import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';

export default function VivaSessionPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();

  const [session, setSession] = useState(null);
  const [answerText, setAnswerText] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [recording, setRecording] = useState(false);

  useEffect(() => {
    fetchSession();
  }, [sessionId]);

  const fetchSession = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`/api/viva/session/${sessionId}`);
      if (res.data.ok) {
        setSession(res.data.session);
        if (res.data.session?.status === 'completed') {
          navigate(`/viva/review/${sessionId}`);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleNextAnswer = async (e) => {
    e.preventDefault();
    if (!answerText.trim() || submitting) return;

    const answer = answerText.trim();
    setAnswerText('');
    setSubmitting(true);

    try {
      const res = await axios.post(`/api/viva/session/${sessionId}`, { answer });
      if (res.data.ok) {
        setSession(res.data.session);
        if (res.data.session?.status === 'completed') {
          navigate(`/viva/review/${sessionId}`);
        }
      } else {
        alert('Error: ' + (res.data.error || 'Failed to submit answer'));
      }
    } catch (err) {
      alert('Error submitting answer: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const toggleSpeechRecognition = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Speech Recognition is not supported in this browser. Please type your answer.');
      return;
    }

    if (recording) {
      setRecording(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;

    recognition.onstart = () => setRecording(true);
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setAnswerText((prev) => (prev ? prev + ' ' + transcript : transcript));
    };
    recognition.onerror = () => setRecording(false);
    recognition.onend = () => setRecording(false);

    recognition.start();
  };

  if (loading) {
    return (
      <div className="container-fluid px-0 text-center py-5">
        <div className="spinner-border text-primary" role="status"></div>
        <div className="mt-2 text-muted font-monospace extra-small">Loading Viva Voce Session...</div>
      </div>
    );
  }

  const currentQIndex = session?.current_question_index ?? 0;
  const questions = session?.questions || [];
  const currentQuestion = questions[currentQIndex];

  return (
    <div className="container-fluid px-0">
      <div className="card workbench-card rounded-4 border-0 shadow-sm p-4 mb-4">
        <div className="d-flex align-items-center justify-content-between">
          <div>
            <span className="badge bg-warning bg-opacity-10 text-warning font-monospace extra-small mb-1">
              <i className="bi bi-mic-fill me-1"></i> LIVE VIVA EXAMINATION SESSION
            </span>
            <h1 className="h5 fw-bold text-body font-monospace mb-0">
              Question {currentQIndex + 1} of {questions.length}
            </h1>
          </div>
        </div>
      </div>

      {currentQuestion && (
        <div className="card workbench-card rounded-4 border-0 shadow-sm p-4 mb-4">
          <h2 className="h5 fw-bold text-body font-sans lh-base mb-4">
            {currentQuestion}
          </h2>

          <form onSubmit={handleNextAnswer}>
            <div className="mb-3 position-relative">
              <textarea
                rows="4"
                className="form-control font-sans extra-small rounded-3 p-3 shadow-sm"
                placeholder="Speak or type your oral examination response here..."
                value={answerText}
                onChange={(e) => setAnswerText(e.target.value)}
                disabled={submitting}
              />
              <button
                type="button"
                className={`btn btn-sm ${recording ? 'btn-danger animate-pulse' : 'btn-outline-secondary'} font-monospace extra-small position-absolute bottom-0 end-0 m-3 rounded-pill d-inline-flex align-items-center gap-1`}
                onClick={toggleSpeechRecognition}
              >
                <i className="bi bi-mic-fill"></i> {recording ? 'Listening...' : 'Voice Input'}
              </button>
            </div>

            <div className="d-flex justify-content-end">
              <button type="submit" disabled={submitting || !answerText.trim()} className="btn gradient-btn-emerald font-monospace extra-small px-4 py-2.5 rounded-3 fw-bold shadow-sm d-inline-flex align-items-center gap-2">
                {submitting ? <span className="spinner-border spinner-border-sm"></span> : <i className="bi bi-arrow-right-circle-fill fs-5"></i>}
                <span>SUBMIT_VIVA_ANSWER</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
