"""
AMS — PDF Processing + Face Recognition Microservice
FastAPI service for:
  - Aadhaar PDF extraction
  - Face encoding via InsightFace ArcFace (512-D embeddings)
"""

import io
import logging
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from aadhaar_parser import AadhaarParser
import face_encoder

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("pdf-service")

app = FastAPI(
    title="AMS Service",
    description="Aadhaar PDF extraction + Face recognition service",
    version="2.0.0",
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
    return {"status": "ok", "service": "ams-service"}


# ── Face Recognition ──────────────────────────────────────────────────────────

@app.post("/face/encode")
async def encode_face(image: UploadFile = File(...)):
    """
    Detect a face in the uploaded image and return its 512-D ArcFace embedding.
    Returns 422 if no face is detected.
    """
    image_bytes = await image.read()
    if len(image_bytes) > 8 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Image must be under 8 MB.")

    try:
        descriptor = face_encoder.encode_face(image_bytes)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    if descriptor is None:
        raise HTTPException(
            status_code=422,
            detail="No face detected in the image. Ensure the face is clearly visible and well-lit.",
        )

    return {"descriptor": descriptor, "dimensions": len(descriptor)}


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
