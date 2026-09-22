import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';

export default function OnlineTestExamPage() {
  const { attemptId } = useParams();
  const navigate = useNavigate();

  const [attempt, setAttempt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState({});
  const [markedForReview, setMarkedForReview] = useState({});
  const [perQuestionTimer, setPerQuestionTimer] = useState(30);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const timerRef = useRef(null);

  useEffect(() => {
    fetchAttempt();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [attemptId]);

  const fetchAttempt = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get(`/api/online-test/runner/${attemptId}`);
      if (res.data.ok) {
        const payload = res.data.attempt;
        setAttempt(payload);

        const initialAnswers = {};
        const initialMarks = {};
        payload.questions.forEach((q, i) => {
          if (q.selected_option) initialAnswers[i] = q.selected_option;
          if (q.is_marked_for_review) initialMarks[i] = true;
        });
        setUserAnswers(initialAnswers);
        setMarkedForReview(initialMarks);
        setPerQuestionTimer(payload.time_per_question || 30);
      } else {
        setError(res.data.error || 'Failed to load exam attempt.');
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!attempt) return;

    if (timerRef.current) clearInterval(timerRef.current);
    setPerQuestionTimer(attempt.time_per_question || 30);

    timerRef.current = setInterval(() => {
      setPerQuestionTimer((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          if (currentIndex < attempt.total_questions - 1) {
            setCurrentIndex((idx) => idx + 1);
          } else {
            handleFinalSubmit();
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [currentIndex, attempt]);

  const syncAnswerToBackend = async (index, selectedOpt, isMarked) => {
    if (!attempt) return;
    const q = attempt.questions[index];
    if (!q) return;

    const timePerQ = attempt.time_per_question || 30;
    try {
      await axios.post(`/api/online-test/attempt/${attemptId}/answer`, {
        question_id: q.id,
        selected_option: selectedOpt || null,
        is_marked_for_review: !!isMarked,
        time_taken: timePerQ - perQuestionTimer
      });
    } catch (err) {
      console.error('Answer sync error:', err);
    }
  };

  const selectAnswer = (optText) => {
    const updated = { ...userAnswers, [currentIndex]: optText };
    setUserAnswers(updated);
    syncAnswerToBackend(currentIndex, optText, markedForReview[currentIndex]);
  };

  const toggleMarkForReview = () => {
    const newMark = !markedForReview[currentIndex];
    const updatedMarks = { ...markedForReview, [currentIndex]: newMark };
    setMarkedForReview(updatedMarks);
    syncAnswerToBackend(currentIndex, userAnswers[currentIndex], newMark);
  };

  const handleFinalSubmit = async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setSubmitting(true);
    try {
      const res = await axios.post(`/api/online-test/attempt/${attemptId}/submit`);
      if (res.data.ok) {
        navigate(`/online-test/result/${attemptId}`);
      } else {
        alert('Error submitting exam: ' + (res.data.error || 'Unknown error'));
        setSubmitting(false);
      }
    } catch (err) {
      alert('Network error submitting exam: ' + err.message);
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="container-fluid px-0 text-center py-5">
        <div className="spinner-border text-primary" role="status"></div>
        <div className="mt-2 text-muted font-monospace extra-small">Loading Examination Workspace...</div>
      </div>
    );
  }

  if (error || !attempt) {
    return (
      <div className="container-fluid px-0 py-4 font-monospace extra-small">
        <div className="alert alert-danger rounded-3"><i className="bi bi-exclamation-triangle-fill me-2"></i>{error || 'Attempt payload unavailable.'}</div>
      </div>
    );
  }

  const currentQ = attempt.questions[currentIndex];
  const letters = ['A', 'B', 'C', 'D'];
  const answeredCount = Object.keys(userAnswers).filter((k) => userAnswers[k]).length;
  const unansweredCount = attempt.total_questions - answeredCount;

  const mins = Math.floor(perQuestionTimer / 60);
  const secs = perQuestionTimer % 60;
  const formattedTime = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

  return (
    <div className="container-fluid px-0">
      <style>{`
        .nav-grid-btn {
          width: 42px;
          height: 42px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          font-family: monospace;
          border-radius: 10px;
          transition: all 0.2s ease;
          border: 1px solid rgba(0,0,0,0.1);
        }
        .nav-grid-btn.current { box-shadow: 0 0 0 3px rgba(13, 110, 253, 0.4); }
        .option-card { border: 1.5px solid rgba(0,0,0,0.1); cursor: pointer; transition: all 0.2s ease; }
        .option-card.selected { border-color: #0d6efd !important; background: rgba(13, 110, 253, 0.08) !important; }
      `}</style>

      {/* Header */}
      <div className="card workbench-card rounded-4 border-0 shadow-sm mb-4">
        <div className="card-body p-3 px-4 d-flex align-items-center justify-content-between flex-wrap gap-3">
          <div>
            <span className="badge bg-primary bg-opacity-10 text-primary font-monospace extra-small mb-1">
              <i className="bi bi-cpu-fill me-1"></i> ONLINE MCQ TEST
            </span>
            <h1 className="h5 fw-bold text-body font-monospace mb-0">Topic: {attempt.topic}</h1>
          </div>

          <div className="d-flex align-items-center gap-4">
            <div className="text-center font-monospace extra-small">
              <div className="text-muted">PROGRESS</div>
              <div className="fw-bold text-body">Question {currentIndex + 1} of {attempt.total_questions}</div>
            </div>

            <div className="p-2 px-3 rounded-3 bg-body border d-flex align-items-center gap-2 shadow-sm font-monospace">
              <i className="bi bi-stopwatch-fill fs-4 text-primary"></i>
              <div>
                <div className="extra-small text-muted">TIME REMAINING</div>
                <div className={`fw-bold fs-5 ${perQuestionTimer <= 5 ? 'text-danger animate-pulse' : 'text-primary'}`}>{formattedTime}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="row g-4">
        <div className="col-lg-8">
          <div className="card workbench-card rounded-4 border-0 shadow-sm p-4 mb-3">
            <div className="d-flex align-items-center justify-content-between mb-3">
              <span className="badge bg-secondary bg-opacity-10 text-secondary font-monospace extra-small">
                DIFFICULTY: {(currentQ?.difficulty || 'medium').toUpperCase()}
              </span>
              <button
                type="button"
                className={`btn btn-sm ${markedForReview[currentIndex] ? 'btn-warning text-dark' : 'btn-outline-warning'} font-monospace extra-small px-3 rounded-pill`}
                onClick={toggleMarkForReview}
              >
                <i className="bi bi-bookmark-star"></i> {markedForReview[currentIndex] ? 'Marked for Review' : 'Mark for Review'}
              </button>
            </div>

            <h2 className="h5 fw-bold text-body mb-4 lh-base font-sans">{currentQ?.question_text}</h2>

            <div className="d-flex flex-column gap-3 mb-4">
              {currentQ?.options?.map((optText, optIdx) => {
                const optionLetter = letters[optIdx] || String.fromCharCode(65 + optIdx);
                const isSelected = userAnswers[currentIndex] === optText;

                return (
                  <div
                    key={optIdx}
                    className={`p-3 rounded-3 option-card d-flex align-items-center gap-3 ${isSelected ? 'selected' : 'bg-body'}`}
                    onClick={() => selectAnswer(optText)}
                  >
                    <input type="radio" name={`exam_opt_${currentIndex}`} className="form-check-input" checked={isSelected} onChange={() => {}} />
                    <span className={`badge ${isSelected ? 'bg-primary' : 'bg-secondary bg-opacity-25 text-body'} font-monospace px-2.5 py-1.5`}>{optionLetter}</span>
                    <span className="text-body font-sans extra-small fw-medium">{optText}</span>
                  </div>
                );
              })}
            </div>

            <div className="d-flex align-items-center justify-content-between border-top pt-3 font-monospace extra-small">
              <button type="button" disabled={currentIndex === 0} className="btn btn-outline-secondary px-4 rounded-3 fw-semibold" onClick={() => setCurrentIndex((prev) => prev - 1)}>
                &larr; Previous
              </button>
              {currentIndex === attempt.total_questions - 1 ? (
                <button type="button" className="btn btn-primary px-4 rounded-3 fw-semibold" onClick={() => setShowSubmitModal(true)}>
                  Review &amp; Submit
                </button>
              ) : (
                <button type="button" className="btn btn-primary px-4 rounded-3 fw-semibold" onClick={() => setCurrentIndex((prev) => prev + 1)}>
                  Next &rarr;
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Navigation Grid */}
        <div className="col-lg-4">
          <div className="card workbench-card rounded-4 border-0 shadow-sm p-4 mb-4">
            <h3 className="h6 fw-bold text-body font-monospace mb-3 pb-2 border-bottom">Question Navigation</h3>
            <div className="d-flex flex-wrap gap-2 mb-4">
              {Array.from({ length: attempt.total_questions }).map((_, i) => {
                let cls = 'nav-grid-btn ';
                if (i === currentIndex) cls += 'current ';
                if (markedForReview[i]) cls += 'bg-warning text-dark';
                else if (userAnswers[i]) cls += 'bg-success text-white';
                else if (i === currentIndex) cls += 'bg-primary text-white';
                else cls += 'bg-secondary bg-opacity-25 text-body';

                return (
                  <button key={i} type="button" className={cls} onClick={() => setCurrentIndex(i)}>
                    {i + 1}
                  </button>
                );
              })}
            </div>

            <button type="button" className="btn btn-success w-100 py-2.5 font-monospace extra-small fw-bold rounded-3 shadow-sm" onClick={() => setShowSubmitModal(true)}>
              SUBMIT_TEST_NOW
            </button>
          </div>
        </div>
      </div>

      {showSubmitModal && (
        <div className="modal fade show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} tabIndex="-1">
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0 shadow-lg rounded-4 overflow-hidden">
              <div className="modal-header bg-warning bg-opacity-10 py-3 px-4 border-bottom">
                <h5 className="modal-title fw-bold text-body font-monospace">Confirm Exam Submission</h5>
                <button type="button" className="btn-close" onClick={() => setShowSubmitModal(false)}></button>
              </div>
              <div className="modal-body p-4 text-center font-monospace extra-small">
                <h6 className="fw-bold mb-3">Are you sure you want to submit?</h6>
                <div className="p-3 rounded-3 bg-body-tertiary border mb-3">
                  Answered: <strong>{answeredCount}</strong> / Unanswered: <strong>{unansweredCount}</strong>
                </div>
              </div>
              <div className="modal-footer bg-transparent py-3 px-4 border-top d-flex justify-content-between font-monospace extra-small">
                <button type="button" className="btn btn-outline-secondary rounded-3" onClick={() => setShowSubmitModal(false)}>Cancel</button>
                <button type="button" disabled={submitting} className="btn btn-success rounded-3 fw-bold" onClick={handleFinalSubmit}>
                  {submitting ? <span className="spinner-border spinner-border-sm"></span> : 'Submit Test'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
