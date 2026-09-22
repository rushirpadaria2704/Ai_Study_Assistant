import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import Footer from './components/Footer';

import HomePage from './pages/HomePage';
import UploadPage from './pages/UploadPage';
import DashboardPage from './pages/DashboardPage';
import DocumentDetailPage from './pages/DocumentDetailPage';
import ChatPage from './pages/ChatPage';
import SummaryPage from './pages/SummaryPage';
import QuizPage from './pages/QuizPage';
import InterviewPage from './pages/InterviewPage';
import ExamPage from './pages/ExamPage';
import TeachPage from './pages/TeachPage';
import VivaListPage from './pages/VivaListPage';
import VivaSessionPage from './pages/VivaSessionPage';
import VivaReviewPage from './pages/VivaReviewPage';
import OnlineTestListPage from './pages/OnlineTestListPage';
import OnlineTestSetupPage from './pages/OnlineTestSetupPage';
import OnlineTestExamPage from './pages/OnlineTestExamPage';
import OnlineTestResultPage from './pages/OnlineTestResultPage';
import SettingsPage from './pages/SettingsPage';

function App() {
  return (
    <Router>
      <div className="d-flex flex-column min-vh-100 bg-body text-body font-sans">
        <Navbar />
        <main className="flex-grow-1 py-4">
          <div className="container-fluid px-3 px-md-4 max-mw-7xl mx-auto">
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/upload" element={<UploadPage />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/document/:id" element={<DocumentDetailPage />} />
              <Route path="/chat/:id" element={<ChatPage />} />
              <Route path="/summary/:id" element={<SummaryPage />} />
              <Route path="/quiz/:id" element={<QuizPage />} />
              <Route path="/interview/:id" element={<InterviewPage />} />
              <Route path="/exam/:id" element={<ExamPage />} />
              <Route path="/teach/:id" element={<TeachPage />} />
              <Route path="/viva" element={<VivaListPage />} />
              <Route path="/viva/start/:docId" element={<VivaSessionPage />} />
              <Route path="/viva/session/:sessionId" element={<VivaSessionPage />} />
              <Route path="/viva/review/:sessionId" element={<VivaReviewPage />} />
              <Route path="/online-test" element={<OnlineTestListPage />} />
              <Route path="/online-test/setup/:docId" element={<OnlineTestSetupPage />} />
              <Route path="/online-test/setup/test/:testId" element={<OnlineTestSetupPage />} />
              <Route path="/online-test/runner/:attemptId" element={<OnlineTestExamPage />} />
              <Route path="/online-test/result/:attemptId" element={<OnlineTestResultPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Routes>
          </div>
        </main>
        <Footer />
      </div>
    </Router>
  );
}

export default App;
