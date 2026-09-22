import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from 'axios';

export default function QuizPage() {
  const { id } = useParams();
  const [doc, setDoc] = useState(null);
  const [quizzes, setQuizzes] = useState([]);
  const [currentQuiz, setCurrentQuiz] = useState(null);
  const [userAnswers, setUserAnswers] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    fetchQuizData();
  }, [id]);

  const fetchQuizData = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`/api/quiz/${id}`);
      if (res.data.ok) {
        setDoc(res.data.document);
        setQuizzes(res.data.quizzes || []);
        if (res.data.quizzes && res.data.quizzes.length > 0) {
          setCurrentQuiz(res.data.quizzes[0].quiz_data);
        }
      }
    } catch (err) {
      console.error('Quiz fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateQuiz = async () => {
    setGenerating(true);
    try {
      const res = await axios.post(`/api/quiz/${id}`);
      if (res.data.ok) {
        setCurrentQuiz(res.data.quiz_data);
        setUserAnswers({});
        setSubmitted(false);
        await fetchQuizData();
      } else {
        alert('Could not generate quiz: ' + (res.data.error || 'Unknown error'));
      }
    } catch (err) {
      alert('Error generating quiz: ' + err.message);
    } finally {
      setGenerating(false);
    }
  };

  const handleOptionSelect = (qIdx, option) => {
    if (submitted) return;
    setUserAnswers((prev) => ({ ...prev, [qIdx]: option }));
  };

  if (loading) {
    return (
      <div className="container-fluid px-0 text-center py-5">
        <div className="spinner-border text-primary" role="status"></div>
        <div className="mt-2 text-muted font-monospace extra-small">Loading Quiz Generator...</div>
      </div>
    );
  }

  const questions = currentQuiz?.questions || [];

  return (
    <div className="container-fluid px-0">
      <nav aria-label="breadcrumb" className="mb-3">
        <ol className="breadcrumb mb-0 font-monospace extra-small">
          <li className="breadcrumb-item"><Link to="/" className="text-decoration-none text-secondary">Home</Link></li>
          <li className="breadcrumb-item"><Link to="/dashboard" className="text-decoration-none text-secondary">Dashboard</Link></li>
          <li className="breadcrumb-item active text-body fw-semibold" aria-current="page">AI Quiz</li>
        </ol>
      </nav>

      <div className="card workbench-card rounded-4 border-0 shadow-sm p-4 mb-4">
        <div className="d-flex align-items-center justify-content-between flex-wrap gap-3">
          <div>
            <span className="badge bg-warning bg-opacity-10 text-warning font-monospace extra-small mb-1">
              <i className="bi bi-question-circle-fill me-1"></i> AI KNOWLEDGE EVALUATION
            </span>
            <h1 className="h5 fw-bold text-body font-monospace mb-0">{doc?.original_name}</h1>
          </div>
          <button
            type="button"
            disabled={generating}
            className="btn gradient-btn-emerald font-monospace extra-small px-4 py-2 rounded-3 fw-bold shadow-sm d-inline-flex align-items-center gap-2"
            onClick={handleGenerateQuiz}
          >
            {generating ? <span className="spinner-border spinner-border-sm"></span> : <i className="bi bi-magic fs-5"></i>}
            <span>GENERATE_NEW_QUIZ</span>
          </button>
        </div>
      </div>

      {questions.length > 0 ? (
        <div className="d-flex flex-column gap-4 mb-5">
          {questions.map((q, qIdx) => {
            const selected = userAnswers[qIdx];
            return (
              <div key={qIdx} className="card workbench-card rounded-4 border-0 shadow-sm p-4">
                <div className="fw-bold font-monospace extra-small text-primary mb-2">Question {qIdx + 1} of {questions.length}</div>
                <h2 className="h6 fw-bold text-body mb-3 font-sans lh-base">{q.question}</h2>

                <div className="d-flex flex-column gap-2 mb-3">
                  {q.options?.map((opt, optIdx) => {
                    const isSelected = selected === opt;
                    const isCorrect = q.correct_answer === opt;

                    let btnCls = 'btn btn-outline-secondary text-start font-monospace extra-small p-3 rounded-3 d-flex align-items-center justify-content-between ';
                    if (submitted) {
                      if (isCorrect) btnCls = 'btn btn-success text-start font-monospace extra-small p-3 rounded-3 d-flex align-items-center justify-content-between text-white fw-bold ';
                      else if (isSelected && !isCorrect) btnCls = 'btn btn-danger text-start font-monospace extra-small p-3 rounded-3 d-flex align-items-center justify-content-between text-white ';
                    } else if (isSelected) {
                      btnCls = 'btn btn-primary text-start font-monospace extra-small p-3 rounded-3 d-flex align-items-center justify-content-between text-white fw-bold ';
                    }

                    return (
                      <button key={optIdx} type="button" className={btnCls} onClick={() => handleOptionSelect(qIdx, opt)}>
                        <span>{opt}</span>
                        {submitted && isCorrect && <i className="bi bi-check-circle-fill"></i>}
                        {submitted && isSelected && !isCorrect && <i className="bi bi-x-circle-fill"></i>}
                      </button>
                    );
                  })}
                </div>

                {submitted && (
                  <div className="p-3 rounded bg-body border border-secondary border-opacity-15 extra-small text-secondary font-monospace">
                    <strong>Explanation: </strong> {q.explanation}
                  </div>
                )}
              </div>
            );
          })}

          {!submitted && (
            <button type="button" className="btn btn-success w-100 py-3 rounded-3 font-monospace extra-small fw-bold shadow-sm" onClick={() => setSubmitted(true)}>
              SUBMIT_QUIZ_ANSWERS
            </button>
          )}
        </div>
      ) : (
        <div className="card workbench-card rounded-4 border-0 shadow-sm p-5 text-center text-muted font-monospace extra-small">
          <i className="bi bi-question-square fs-1 d-block mb-3 text-warning"></i>
          No active quiz. Click <strong>GENERATE_NEW_QUIZ</strong> to test your knowledge.
        </div>
      )}
    </div>
  );
}
