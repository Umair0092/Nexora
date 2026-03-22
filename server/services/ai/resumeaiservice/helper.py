from langchain_community.document_loaders import PyPDFLoader
from langchain_openai import ChatOpenAI
import os
from dotenv import load_dotenv
from pydantic import BaseModel, Field
from typing import Optional, List
import tempfile

load_dotenv()



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



def pdf_to_structure(file):

    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp_file:
        tmp_file.write(file.read())
        temp_pdf_path = tmp_file.name

    loader = PyPDFLoader(temp_pdf_path)
    extracted_file = loader.load()

    resume_text = "\n\n".join(doc.page_content for doc in extracted_file)

    try:
        llm = ChatOpenAI(
            model=os.getenv("GEMINI_MODEL", "google/gemini-2.0-flash-001"),
            temperature=0.1,
            api_key=os.getenv("OPENROUTER_API_KEY"),
            base_url=os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1"),
        )
    except Exception as e:
        raise ValueError(f"Failed to initialize AI model: {str(e)}")

    try:
        structured_llm = llm.with_structured_output(Candidate)
        final_structured_data = structured_llm.invoke(f"Extract structured information from this resume:\n\n{resume_text}")
    except Exception as e:
        raise ValueError(f"Failed to parse resume content: {str(e)}")
    

    os.remove(temp_pdf_path)


    return final_structured_data

if __name__ == "__main__":
    print("muneeb")
    uploaded_file_path = r"D:\semester8project\fyp project\resumeparser\muneeb_resume.pdf"
    print("muneeb")
    with open(uploaded_file_path, 'rb') as uploaded_file:
        structured_data = pdf_to_structure(uploaded_file)
    print(structured_data)