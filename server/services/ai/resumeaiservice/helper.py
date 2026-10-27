from langchain_community.document_loaders import PyPDFLoader
from llm import new_llm
import os
from dotenv import load_dotenv
from pathlib import Path
from pydantic import BaseModel, Field
from typing import Optional, List
import tempfile

load_dotenv(Path(__file__).resolve().parent.parent / ".env")



class WorkExperience(BaseModel):
    company: str = Field(description="Company name")
    role: str = Field(description="Job title or role")
    duration: Optional[str] = Field(default=None,description="Duration of employment")
    description: Optional[str] = Field(default=None,description="Work description or responsibilities")


class Education(BaseModel):
    institution: str = Field(description="Name of the college or school")
    course: str = Field(description="Course or degree completed or pursuing")
    duration: Optional[str] = Field(default=None,description="Duration of education")
    score: Optional[str] = Field(default=None,description="CGPA / percentage if mentioned")    


class Candidate(BaseModel):
    name: str = Field(description="Name of the candidate")
    degree: str = Field(description="Degree done by the candidate or currently doing")
    summary: Optional[str] = Field(default=None,description="Summary given by the candidate")
    work_experience: Optional[List[WorkExperience]] = Field(default=None,description="Work experience of the candidate")
    projects_done: Optional[list[str]] = Field(default=None,description="Projects done by the candidate")
    education: Optional[List[Education]] = Field(default=None,description="Educational background of the candidate")
    skills: list[str] = Field(description="Skills of the candidate")
    achievements: Optional[list[str]] = Field(default=None,description="List of all the achievements of the candidate")



NO_TEXT_ERROR = "No readable text found in this PDF"


class AIServiceError(RuntimeError):
    """The PDF was fine but the AI provider failed (bad model, no credit, outage)."""


def pdf_to_structure(file) -> Candidate:
    """
    Extract structured candidate data from a PDF file-like object.

    Raises ValueError when the PDF can't be read or has no extractable text
    (e.g. a scanned image), and AIServiceError when the AI model call fails. The temporary copy of
    the PDF is always removed, even on failure.

    Example:
        with open("resume.pdf", "rb") as f:
            candidate = pdf_to_structure(f)
        candidate.name  # -> "Ali Hassan"
    """
    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp_file:
        tmp_file.write(file.read())
        temp_pdf_path = tmp_file.name

    try:
        try:
            extracted_file = PyPDFLoader(temp_pdf_path).load()
        except Exception as e:
            raise ValueError(f"Could not read PDF: {e}")

        resume_text = "\n\n".join(doc.page_content for doc in extracted_file).strip()
        if not resume_text:
            raise ValueError(NO_TEXT_ERROR)

        try:
            llm = new_llm(max_tokens=4000, temperature=0.1)
        except Exception as e:
            raise AIServiceError(f"Failed to initialize AI model: {str(e)}")

        try:
            structured_llm = llm.with_structured_output(Candidate)
            return structured_llm.invoke(f"Extract structured information from this resume:\n\n{resume_text}")
        except Exception as e:
            raise AIServiceError(f"Failed to parse resume content: {str(e)}")
    finally:
        if os.path.exists(temp_pdf_path):
            os.remove(temp_pdf_path)
