import os
import re
from typing import Tuple

import pdfplumber
from PyPDF2 import PdfReader

import config


def allowed_file(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in config.ALLOWED_EXTENSIONS


def clean_text(text: str) -> str:
    text = text.replace("\x00", " ")
    text = re.sub(r"\s+", " ", text)
    text = re.sub(r"[^\w\s.,;:!?()\-'\"/%]", " ", text)
    return text.strip()


def extract_from_pdf(filepath: str) -> Tuple[str, int]:
    text_parts = []
    page_count = 0

    try:
        with pdfplumber.open(filepath) as pdf:
            page_count = len(pdf.pages)
            for page in pdf.pages:
                page_text = page.extract_text() or ""
                if page_text.strip():
                    text_parts.append(page_text)
    except Exception:
        reader = PdfReader(filepath)
        page_count = len(reader.pages)
        for page in reader.pages:
            page_text = page.extract_text() or ""
            if page_text.strip():
                text_parts.append(page_text)

    combined = clean_text("\n\n".join(text_parts))
    return combined, page_count


def extract_from_text(filepath: str) -> Tuple[str, int]:
    with open(filepath, "r", encoding="utf-8", errors="ignore") as handle:
        content = handle.read()
    return clean_text(content), 1


def extract_text(filepath: str) -> Tuple[str, int]:
    ext = filepath.rsplit(".", 1)[1].lower()
    if ext == "pdf":
        return extract_from_pdf(filepath)
    return extract_from_text(filepath)


def save_upload(file_storage, filename: str) -> str:
    os.makedirs(config.UPLOAD_FOLDER, exist_ok=True)
    filepath = os.path.join(config.UPLOAD_FOLDER, filename)
    file_storage.save(filepath)
    return filepath
