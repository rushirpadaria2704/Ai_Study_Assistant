import sqlite3
from datetime import datetime

import config


def get_connection():
    conn = sqlite3.connect(config.DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_connection()
    study = conn.cursor()

    study.executescript(
        """
        CREATE TABLE IF NOT EXISTS documents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            filename TEXT NOT NULL,
            original_name TEXT NOT NULL,
            file_type TEXT NOT NULL,
            file_size INTEGER,
            page_count INTEGER DEFAULT 0,
            word_count INTEGER DEFAULT 0,
            uploaded_at TEXT NOT NULL,
            status TEXT DEFAULT 'processed'
        );

        CREATE TABLE IF NOT EXISTS summaries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            document_id INTEGER NOT NULL,
            title TEXT,
            content TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (document_id) REFERENCES documents (id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS quizzes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            document_id INTEGER NOT NULL,
            title TEXT,
            quiz_data TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (document_id) REFERENCES documents (id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS chat_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            document_id INTEGER,
            question TEXT NOT NULL,
            answer TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (document_id) REFERENCES documents (id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS interview_sets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            document_id INTEGER NOT NULL,
            title TEXT,
            interview_data TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (document_id) REFERENCES documents (id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS teaching_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            document_id INTEGER NOT NULL,
            title TEXT,
            topic_context TEXT NOT NULL,
            messages TEXT NOT NULL DEFAULT '[]',
            status TEXT DEFAULT 'active',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (document_id) REFERENCES documents (id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS exam_papers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            document_id INTEGER NOT NULL,
            title TEXT,
            exam_data TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (document_id) REFERENCES documents (id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS viva_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            document_id INTEGER NOT NULL,
            student_name TEXT,
            questions TEXT NOT NULL,
            current_question_index INTEGER DEFAULT -1,
            replies TEXT NOT NULL DEFAULT '[]',
            status TEXT DEFAULT 'active',
            created_at TEXT NOT NULL,
            FOREIGN KEY (document_id) REFERENCES documents (id) ON DELETE CASCADE
        );


        CREATE TABLE IF NOT EXISTS app_settings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            setting_key TEXT UNIQUE NOT NULL,
            setting_value TEXT,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS api_configs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            provider_name TEXT NOT NULL,
            provider_type TEXT NOT NULL,
            api_key_encrypted TEXT NOT NULL,
            base_url TEXT,
            model_name TEXT,
            is_active INTEGER DEFAULT 0,
            priority INTEGER DEFAULT 0,
            extra_config TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS tests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            document_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            topic TEXT NOT NULL,
            total_questions INTEGER DEFAULT 15,
            time_per_question INTEGER DEFAULT 30,
            total_time INTEGER DEFAULT 450,
            difficulty TEXT DEFAULT 'mixed',
            created_at TEXT NOT NULL,
            FOREIGN KEY (document_id) REFERENCES documents (id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS test_questions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            test_id INTEGER NOT NULL,
            question_number INTEGER NOT NULL,
            question_text TEXT NOT NULL,
            option_a TEXT NOT NULL,
            option_b TEXT NOT NULL,
            option_c TEXT NOT NULL,
            option_d TEXT NOT NULL,
            correct_option TEXT NOT NULL,
            explanation TEXT,
            difficulty TEXT DEFAULT 'medium',
            source_chunk_id TEXT,
            FOREIGN KEY (test_id) REFERENCES tests (id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS test_attempts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            test_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            topic TEXT NOT NULL,
            score INTEGER DEFAULT 0,
            total_questions INTEGER DEFAULT 15,
            correct_answers INTEGER DEFAULT 0,
            wrong_answers INTEGER DEFAULT 0,
            unanswered INTEGER DEFAULT 0,
            percentage REAL DEFAULT 0.0,
            time_taken INTEGER DEFAULT 0,
            time_per_question INTEGER DEFAULT 30,
            total_time INTEGER DEFAULT 450,
            started_at TEXT NOT NULL,
            submitted_at TEXT,
            status TEXT DEFAULT 'in_progress',
            question_order TEXT NOT NULL DEFAULT '[]',
            option_orders TEXT NOT NULL DEFAULT '{}',
            ai_analysis TEXT,
            FOREIGN KEY (test_id) REFERENCES tests (id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS test_answers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            attempt_id INTEGER NOT NULL,
            question_id INTEGER NOT NULL,
            question_index INTEGER NOT NULL,
            selected_option TEXT,
            correct_option TEXT NOT NULL,
            is_correct INTEGER DEFAULT 0,
            time_taken INTEGER DEFAULT 0,
            is_marked_for_review INTEGER DEFAULT 0,
            FOREIGN KEY (attempt_id) REFERENCES test_attempts (id) ON DELETE CASCADE,
            FOREIGN KEY (question_id) REFERENCES test_questions (id) ON DELETE CASCADE
        );
        """
    )

    conn.commit()
    conn.close()


def now_iso():
    return datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
