FROM python:3.12-slim

WORKDIR /app

# System deps: PDF processing + C++ compiler for insightface Cython extensions
RUN apt-get update && apt-get install -y --no-install-recommends \
    libmupdf-dev \
    poppler-utils \
    tesseract-ocr \
    tesseract-ocr-hin \
    tesseract-ocr-tam \
    tesseract-ocr-tel \
    tesseract-ocr-kan \
    tesseract-ocr-mal \
    tesseract-ocr-ben \
    tesseract-ocr-guj \
    tesseract-ocr-pan \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download InsightFace buffalo_l model so first request is instant
RUN python -c "\
from insightface.app import FaceAnalysis; \
fa = FaceAnalysis(name='buffalo_l', providers=['CPUExecutionProvider']); \
fa.prepare(ctx_id=-1, det_size=(640,640)); \
print('InsightFace model pre-loaded OK')"

COPY . .

EXPOSE 8001
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001", "--workers", "2"]
