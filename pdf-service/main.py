"""
AMS — Aadhaar PDF Processing Microservice
FastAPI service that accepts Aadhaar PDFs, extracts text + photo,
and returns structured data for labor registration.
"""

import io
import logging
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from aadhaar_parser import AadhaarParser

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("pdf-service")

app = FastAPI(
    title="AMS PDF Service",
    description="Aadhaar PDF extraction service",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Restricted via nginx in production
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)

parser = AadhaarParser()


@app.get("/health")
def health():
    return {"status": "ok", "service": "pdf-service"}


@app.post("/extract")
async def extract_aadhaar(
    pdf: UploadFile = File(..., description="Aadhaar PDF file"),
    password: str = Form(default="", description="PDF password if protected"),
):
    """
    Extract Aadhaar data from uploaded PDF.

    Returns:
    - name, dob, gender, address, city, state, pin
    - aadhaar_number (last 4 only — full number is NOT returned)
    - photo_base64 (PNG encoded as base64)
    """
    if not pdf.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted.")

    content = await pdf.read()
    if len(content) > 10 * 1024 * 1024:  # 10 MB
        raise HTTPException(status_code=413, detail="PDF size must not exceed 10 MB.")

    logger.info(f"Processing Aadhaar PDF: {pdf.filename}, size={len(content)}")

    result = parser.extract(pdf_bytes=content, password=password or None)

    if not result["success"]:
        raise HTTPException(
            status_code=422,
            detail={
                "message": result["message"],
                "code": result.get("code", "PARSE_ERROR"),
            },
        )

    return JSONResponse(content=result["data"])
